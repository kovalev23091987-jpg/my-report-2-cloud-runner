import {fingerprint,timestamp} from './core.mjs';
const safeInt=v=>Number.isSafeInteger(v)&&v>=0;
const exactText=v=>typeof v==='string'&&v.trim()===v&&v.length>0;
// CAS updates plus inserts are submitted in one D1 batch transaction.
// No UPDATE after an ambiguous HTTP result is interpreted as free retry credit.
export function createD1SourceAdmission({db,scope_bindings,within_run_budget,clock=Date.now}={}){
 return async function admit(request){
  const deny=reason=>({allowed:false,new_reservation:false,reason});
  if(!db?.prepare||!db?.batch||!scope_bindings||typeof within_run_budget!=='function')return deny('DURABLE_QUOTA_NOT_CONFIGURED');
  if(!request||timestamp(request.deadline_ts)===null||!['reservation_id','contract','run_id'].every(k=>exactText(request[k]))||!request.requests||Array.isArray(request.requests))return deny('REQUEST_IDENTITY_OR_DEADLINE_INVALID');
  const counts=Object.values(request.requests);if(!counts.length||counts.some(v=>!safeInt(v)||v<1)||!safeInt(request.max_requests)||request.max_requests<1||request.max_requests>24||counts.reduce((a,b)=>a+b,0)!==request.max_requests)return deny('REQUEST_COST_NOT_EXACT');
  const host=within_run_budget({extraRowsRead:64,extraRowsWritten:16});
  if(host?.allowed!==true)return deny('EXISTING_D1_RESERVATION_HAS_NO_EXTENSION_HEADROOM');
  const now=clock();if(timestamp(now)===null||request.deadline_ts<=now||!request.run_id||!request.contract||!request.reservation_id)return deny('REQUEST_IDENTITY_OR_DEADLINE_INVALID');
  const specs=[];
  for(const [provider,count] of Object.entries(request.requests??{})){
   const binding=scope_bindings[provider];
   if(!binding?.scope_id||!binding?.config_fingerprint||!safeInt(count)||count===0)return deny('EXACT_PROVIDER_SCOPE_REQUIRED');
   specs.push({provider,units:count,scope_id:binding.scope_id,config_fingerprint:binding.config_fingerprint});
  }
  if(!specs.length||specs.length>4)return deny('BOUNDED_PROVIDER_SET_REQUIRED');
  try{
   const rows=await db.batch(specs.map(s=>db.prepare('SELECT * FROM report2_liq_source_allowance_shadow WHERE scope_id=?1').bind(s.scope_id)));
   if(!Array.isArray(rows)||rows.length!==specs.length||rows.some(r=>r?.success!==true||!Array.isArray(r.results)||r.results.length!==1))return deny('ALLOWANCE_READBACK_SHAPE_INVALID');
   const statements=[],prepared=[];
   for(let i=0;i<specs.length;i++){
    const s=specs[i],cfg=rows[i]?.results?.[0];
    if(!cfg||cfg.active!==1||cfg.schema_version!==1||cfg.shared_quota_reviewed!==1||cfg.provider!==s.provider||cfg.unit!=='REQUEST'||cfg.config_fingerprint!==s.config_fingerprint||!(cfg.window_start_ts<=now&&now<cfg.window_end_ts)||![cfg.used_units,cfg.allowance_units,cfg.version].every(safeInt))return deny('PROVIDER_ALLOWANCE_NOT_CLOSED');
    if(cfg.used_units+s.units>cfg.allowance_units)return deny('FREE_QUOTA_EXHAUSTED');
    const id=request.reservation_id+':'+s.provider;
    const rf=fingerprint({id,scope_id:s.scope_id,units:s.units,provider:s.provider,contract:request.contract,run_id:request.run_id});
    statements.push(db.prepare(`UPDATE report2_liq_source_allowance_shadow
      SET used_units=used_units+?1,version=version+1,last_reservation_id=?2
      WHERE scope_id=?3 AND provider=?4 AND unit='REQUEST' AND active=1
        AND config_fingerprint=?5 AND version=?6 AND used_units+?1<=allowance_units
        AND window_start_ts<=?7 AND window_end_ts>?7
        AND NOT EXISTS(SELECT 1 FROM report2_liq_source_reservation_shadow WHERE reservation_id=?2)`)
      .bind(s.units,id,s.scope_id,s.provider,s.config_fingerprint,cfg.version,now));
    statements.push(db.prepare(`INSERT INTO report2_liq_source_reservation_shadow
       (reservation_id,scope_id,provider,contract_code,run_id,reserved_units,expected_version,committed_version,created_ts,reservation_fingerprint)
       SELECT ?1,scope_id,provider,?2,?3,?4,?5,version,?6,?7 FROM report2_liq_source_allowance_shadow
       WHERE scope_id=?8 AND last_reservation_id=?1 AND version=?5+1
       ON CONFLICT(reservation_id) DO NOTHING`).bind(id,request.contract,request.run_id,s.units,cfg.version,now,rf,s.scope_id));
    prepared.push({id,scope_id:s.scope_id,provider:s.provider,units:s.units,rf,expected_version:cfg.version});
   }
   const result=await db.batch(statements);
   if(!Array.isArray(result)||result.length!==statements.length||result.some(x=>x.success!==true))return deny('ATOMIC_RESERVATION_BATCH_NOT_CLOSED');
   // Exactly one new counter update AND one new immutable reservation per scope.
   const newWrites=result.every(x=>Number(x?.meta?.changes??x?.changes)===1);
   if(!newWrites)return deny('QUOTA_CAS_RACE_DUPLICATE_OR_EXHAUSTED');
   const back=await db.batch(prepared.map(s=>db.prepare('SELECT reservation_id,scope_id,provider,reserved_units,expected_version,committed_version,reservation_fingerprint FROM report2_liq_source_reservation_shadow WHERE reservation_id=?1').bind(s.id)));
   if(!Array.isArray(back)||back.length!==prepared.length||back.some(r=>r?.success!==true||!Array.isArray(r.results)||r.results.length!==1))return deny('RESERVATION_READBACK_MISMATCH');
   if(!back.every((r,i)=>{const a=r?.results?.[0],s=prepared[i];return a?.reservation_id===s.id&&a.scope_id===s.scope_id&&a.provider===s.provider&&a.reserved_units===s.units&&a.expected_version===s.expected_version&&a.committed_version===s.expected_version+1&&a.reservation_fingerprint===s.rf;}))return deny('RESERVATION_READBACK_MISMATCH');
   return {allowed:true,new_reservation:true,reservation_id:request.reservation_id,reserved:prepared.map(x=>({scope_id:x.scope_id,provider:x.provider,units:x.units})),atomic_batch_ack:true,exact_readback:true,automatic_topup:false};
  }catch{return deny('D1_SCHEMA_OR_RESERVATION_ERROR_FAIL_CLOSED');}
 };
}
