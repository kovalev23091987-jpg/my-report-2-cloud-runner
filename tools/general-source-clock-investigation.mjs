import fs from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import {loadDailyUsageAggregate,evaluateDailyReservationBudget,reserveRunBudget,finalizeRunUsage} from '../runner/d1-preaction-budget-guard.mjs';
import {createD1SourceAdmission} from '../runtime/src/liquidation-extension/d1-source-admission.mjs';
import {createSharedSourceBudget} from '../runtime/src/liquidation-extension/run-source-budget.mjs';
import {readJson} from '../runtime/src/liquidation-extension/io.mjs';
import {validateSignedMinute,signedTapeFourHourFlow} from '../runtime/src/htx-signed-tape.mjs';
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN);
const now=Date.now(),id='GENERAL_SOURCE_CLOCK:'+process.env.GITHUB_RUN_ID+':'+process.env.GITHUB_RUN_ATTEMPT;
const out={schema:'report2-general-source-clock-evaluation-v1',head:process.env.GITHUB_SHA,observed_ts:now,sourceHTTP:0,maximum_sourceHTTP:2,MAIN:0,Telegram:0,Nansen:0,production_changes:0,positions:[],raw_flow:[],not_fresh_joint_acceptance:true};
const hash=b=>createHash('sha256').update(b).digest('hex');
await fs.mkdir('audit-output',{recursive:true});
const check=()=>{const u=db.usageSnapshot();if(u.unknown_ops!==0||u.rows_read>2300||u.rows_written>60||u.requests>24)throw Error('BOUNDED_D1_USAGE_EXCEEDED');};
out.admission=evaluateDailyReservationBudget({daily:await loadDailyUsageAggregate(db,now),nextReservation:{rows_read:2500,rows_written:64},maxDailyReads:3500000,maxDailyWrites:70000});
if(out.admission.allowed){
 await reserveRunBudget(db,{reservationId:id,now,reservation:{rows_read:2500,rows_written:64}});
 try{
  for(const [contract,original] of [['ZEC-USDT',1791268240254],['牛来-USDT',1791268276885]]){
   check();const row=await db.prepare('SELECT observed_ts,expires_ts,payload_json FROM report2_evidence_source_cache WHERE source=?1 AND asset_key=?2 LIMIT 1').bind('HTX_SIGNED_RAW_TAPE',contract).first();check();
   if(!row){out.raw_flow.push({contract,status:'NO_CURRENT_SAVED_RING',is_original_run_proof:false});continue;}
   const ring=JSON.parse(row.payload_json),bytes=Buffer.from(row.payload_json),name='signed-ring-'+out.raw_flow.length+'.json.gz';await fs.writeFile('audit-output/'+name,gzipSync(bytes,{mtime:0}));
   const valid=(ring.minutes||[]).filter(m=>validateSignedMinute(m,{contract,contract_size:ring.contract_size}));
   const originalRows=valid.filter(m=>m.observed_ts<=original&&m.source_ts<=original);
   const latest=originalRows.length?Math.max(...originalRows.map(m=>m.start_ts))+60000:null;
   const current=signedTapeFourHourFlow({ring,contract,now});
   out.raw_flow.push({contract,cache_observed_ts:row.observed_ts,cache_expires_ts:row.expires_ts,saved_file:name,payload_sha256:hash(bytes),total_minutes:ring.minutes?.length,valid_minutes:valid.length,current_status:current.status,current_blockers:current.blocking_checks,current_receipts:current.receipts,original_cutoff:original,minutes_with_original_clocks_before_cutoff:originalRows.length,latest_original_minute_end:latest,original_end_age_ms:latest===null?null:original-latest,is_original_run_proof:false,scope:'CURRENT_MUTABLE_CACHE_WITH_IMMUTABLE_MINUTE_CLOCKS; NOT_ORIGINAL_CANONICAL_INPUT'});
  }
  const cfg=await db.prepare("SELECT scope_id,provider,config_fingerprint,window_start_ts,window_end_ts,allowance_units,used_units,active FROM report2_liq_source_allowance_shadow WHERE provider='GMX' AND active=1 AND window_start_ts<=?1 AND window_end_ts>?1 ORDER BY window_start_ts DESC LIMIT 2").bind(now).all();check();
  const rows=cfg.results||[];out.allowance_candidates=rows.map(r=>({...r,config_fingerprint:r.config_fingerprint}));
  if(rows.length!==1){out.positions_status='UNIQUE_EXISTING_GMX_ALLOWANCE_REQUIRED';}
  else{
   const c=rows[0],admit=createD1SourceAdmission({db,scope_bindings:{GMX:{scope_id:c.scope_id,config_fingerprint:c.config_fingerprint}},within_run_budget:()=>{check();return{allowed:true};}});
   const budget=createSharedSourceBudget({provider_admit:admit,max_requests:2,max_parallel:1,max_total_ms:45000,fetch_impl:async(url,init)=>{check();if(out.sourceHTTP>=2)throw Error('BOUNDED_SOURCE_HTTP_EXCEEDED');out.sourceHTTP++;return fetch(url,init);}});
   out.source_admission=await budget.admit({reservation_id:id+':GMX',contract:'BTC-USDT',run_id:id,requests:{GMX:2},max_requests:2,deadline_ts:Date.now()+45000});
   if(out.source_admission.allowed){
    const accounts=['0x000000E374a7Eb3A42E6B335C9D0a45F2f6256EB','0x002Ac37e66FC02e65885a664CE888EE34D23884C'];
    for(let i=0;i<accounts.length;i++){
     const r=await readJson('https://arbitrum.gmxapi.io/v1/positions?address='+accounts[i],{fetch_impl:budget.fetch,timeout_ms:10000,max_bytes:2000000});check();
     const bytes=Buffer.from(JSON.stringify(r.payload)),name='gmx-positions-'+i+'.json';await fs.writeFile('audit-output/'+name,bytes);
     const positions=Array.isArray(r.payload)?r.payload:[];
     out.positions.push({account:accounts[i],http_ok:r.ok,reason:r.reason,receipt:r.receipt,file:name,json_sha256:hash(bytes),json_type:Array.isArray(r.payload)?'array':typeof r.payload,count:positions.length,rows:positions.map(p=>({keys:Object.keys(p),indexName:p.indexName,marketAddress:p.marketAddress,position_key:p.contractKey,liquidationPrice:p.liquidationPrice,sizeInUsd:p.sizeInUsd,markPrice:p.markPrice,clock_fields:Object.fromEntries(Object.entries(p).filter(([k])=>/time|stamp|block|updated|refresh|snapshot/i.test(k)))}))});
    }
    out.positions_status='ACTUAL_EXISTING_ENDPOINT_CLOCK_FIELDS_READ';
   }else out.positions_status='EXISTING_PROVIDER_ADMISSION_BLOCKED';
   out.source_budget=budget.summary();
  }
  out.status='BOUNDED_GENERAL_SOURCE_INVESTIGATION_COMPLETED';check();
 }catch(error){out.status='BOUNDED_INVESTIGATION_FAILED';out.error=String(error.message).slice(0,180);}
 finally{out.finalized_usage=await finalizeRunUsage(db,{reservationId:id,sourceRunId:process.env.GITHUB_RUN_ID,usage:db.usageSnapshot()});}
}else out.status='D1_ADMISSION_BLOCKED';
out.d1_usage=db.usageSnapshot();
await fs.writeFile('audit-output/general-source-clock-proof.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({status:out.status,positions_status:out.positions_status,sourceHTTP:out.sourceHTTP,MAIN:0,Telegram:0,raw_flow:out.raw_flow.map(r=>({contract:r.contract,status:r.current_status||r.status})),d1_usage:out.d1_usage,error:out.error}));
if(out.status==='BOUNDED_INVESTIGATION_FAILED')process.exitCode=1;
