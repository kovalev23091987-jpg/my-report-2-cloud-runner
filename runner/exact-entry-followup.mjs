import {createHash} from 'node:crypto';
import {recheckTaskId} from '../current-generation/files/src/recheck-scheduler.mjs';
import {canonicalFingerprint} from '../current-generation/files/src/canonical-publication.mjs';
import {loadDailyUsageAggregate,evaluateDailyReservationBudget,evaluateWithinRunReservation,reserveRunBudget,finalizeRunUsage} from './d1-preaction-budget-guard.mjs';

export const ENTRY_FOLLOWUP=Object.freeze({reservation:{rows_read:4000,rows_written:40},next_full:{rows_read:59000,rows_written:920},max_requests:20,max_business_rows:12,max_body_bytes:2097152});
const TABLES=['v3_recheck_task_shadow','v3_telegram_dispatch_shadow','v3_dispatch_publication_binding_shadow','v3_user_lifecycle_shadow','report2_trigger_kick_slot','report2_triggered_recheck_admission','canonical_publication_shadow'];
const sha=b=>createHash('sha256').update(b).digest('hex');
const text=v=>typeof v==='string'&&v.length>0;
const parse=v=>{try{return JSON.parse(v);}catch{return null;}};

// The only native target is the exact already acknowledged observation.
// Neither a caller-supplied ticker nor a current market observation chooses it.
export function exactEntryFollowupCase(proof){
 const c=proof?.same_run_delivery;
 if(proof?.schema!=='ACTUAL_NATURAL_FULL_AND_EXACT_NIL_SENT214_V1'||proof.cloud_run!==39128011580||proof.head!=='39e465fce18410e69b15218ea133a7baa3adf3de'||proof.run_id!=='1792327033256-1792327043738'||c?.telegram_message_id!=='214'||c.exact_SENT!==true||c.same_run_binding_verified!==true||c.actual_ENTRY!==false||c.contract!=='NIL-USDT'||c.direction!=='SHORT'||c.lifecycle_event!=='OBSERVE'||c.publication_id!=='PUB:e2a78540f572adf160cc0dbeb79417b7cbb2fdab'||c.run_id!==proof.run_id||c.snapshot_id!=='S392:NIL-USDT:1792327113389'||c.wave_id!=='EDW:NIL-USDT:1792327043942:G11'||c.observed_ts!==1792327113389||c.analytical_fingerprint!=='fc25b1c8390cc43b694598516f28082bf466838c873af4c8cc230b5306a1c0e6'||c.presentation_hash!=='c4883e13b4cc9448441a5fdcab563ad5f8bc70095aa8f1d54746d2fcf1cd15d2'||c.dispatch_finalized!==true||c.task_at_delivery?.state!=='PENDING'||c.task_at_delivery.run_id!==c.run_id||c.task_at_delivery.snapshot_id!==c.snapshot_id||c.task_at_delivery.due_ts!==1792327413389||c.task_at_delivery.expires_ts!==1792328913389)throw Error('EXACT_SAVED_SENT214_REQUIRED');
 const due=c.task_at_delivery.due_ts;
 return{...c,contract_code:c.contract,due_ts:due,expires_ts:c.task_at_delivery.expires_ts,task_id:recheckTaskId({publication_id:c.publication_id,contract:c.contract,direction:c.direction,wave_id:c.wave_id,due_ts:due}),idempotency_key:`${c.contract}|${c.direction}|${c.wave_id}|OBSERVE|v3-telegram-shadow-r6`,rules_version:'v3-telegram-shadow-r6'};
}

export function describeEntryFollowup(observations,target){
 const row=observations.task?.[0];
 if(!row)return{status:'EXACT_TASK_NOT_FOUND',actual_ENTRY:false,root_cause_proven:false};
 const exact=row.task_id===target.task_id&&row.publication_id===target.publication_id&&row.contract_code===target.contract&&row.direction===target.direction&&row.wave_id===target.wave_id&&row.run_id===target.run_id&&row.snapshot_id===target.snapshot_id&&row.due_ts===target.due_ts&&row.expires_ts===target.expires_ts;
 if(!exact)throw Error('ORIGINAL_TASK_BINDING_MISMATCH');
 const dispatch=observations.original_dispatch?.[0],binding=observations.original_binding?.[0];
 if(!dispatch||dispatch.state!=='SENT'||String(dispatch.telegram_message_id)!==target.telegram_message_id||dispatch.idempotency_key!==target.idempotency_key||dispatch.contract!==target.contract||dispatch.direction!==target.direction||dispatch.wave_id!==target.wave_id||!binding||binding.publication_id!==target.publication_id||binding.run_id!==target.run_id||binding.snapshot_id!==target.snapshot_id||binding.analytical_fingerprint!==target.analytical_fingerprint||binding.presentation_hash!==target.presentation_hash||binding.lifecycle_event!=='OBSERVE')throw Error('NATIVE_ORIGINAL_SENT_BINDING_MISMATCH');
 const result=parse(row.last_result),checks=[...(Array.isArray(result?.prior_checks)?result.prior_checks:[]),result?.first_trigger_receipt,result?.original_light_price_receipt,result].filter(x=>x?.schema==='LIGHT_PRICE_RECHECK_V1');
 return{status:'EXACT_POST_SENT_TASK_OBSERVED',task_state:row.state,attempt_count:row.attempt_count,updated_ts:row.updated_ts,last_result_schema:result?.schema??null,last_result_status:result?.status??null,last_result_reason:result?.reason??null,retained_price_checks:checks.length,retained_reached_price_checks:checks.filter(x=>x.status==='TRIGGER_PRICE_REACHED_FULL_ANALYSIS_REQUIRED').length,own_kick:observations.kick_day?.filter(x=>x.task_id===target.task_id)||[],own_admission:observations.admission_day?.filter(x=>x.task_id===target.task_id)||[],observed_day_kicks:observations.kick_day?.length??null,observed_day_admissions:observations.admission_day?.length??null,current_user_lifecycle:observations.user_lifecycle||[],actual_ENTRY:false,root_cause_proven:false,price_touch_does_not_prove_closed_settlement:true,post_delivery_known:true};
}

export async function runExactEntryFollowup({db,guard,proof,source_run_id,clock=Date.now,reconciliation=null}={}){
 const out={schema:'EXACT_ORIGINAL_ENTRY_FOLLOWUP_NATIVE_V1',status:'NOT_CLOSED',observations:{},sourceHTTP:0,MAIN:0,Telegram:0,business_writes:0,schema_writes:0,reservations_refunded:false,entry_authorized:false,actual_ENTRY:false};
 let reserved=false,id;const started=clock();
 const room=()=>{const u=db.usageSnapshot();if(u.requests>=ENTRY_FOLLOWUP.max_requests||!evaluateWithinRunReservation({reservation:ENTRY_FOLLOWUP.reservation,currentUsage:u,extraRowsRead:200,extraRowsWritten:4}).allowed)throw Error('ENTRY_READ_NATIVE_USAGE_OR_HEADROOM_NOT_CLOSED');};
 const read=async(name,table,sql,args,limit)=>{
  room();if(!out.available_tables.includes(table)){out.observations[name]=null;return;}
  const before=db.usageSnapshot();const result=await db.prepare(sql).bind(...args).all();room();
  if(!Array.isArray(result?.results)||result.success===false||result.results.length>limit||db.usageSnapshot().rows_written!==before.rows_written)throw Error('BOUNDED_READ_RESULT_NOT_CLOSED');
  if(Buffer.byteLength(JSON.stringify(result.results))>ENTRY_FOLLOWUP.max_body_bytes)throw Error('ENTRY_READ_BODY_BOUND');
  out.observations[name]=result.results;
  if(Object.values(out.observations).reduce((n,r)=>n+(Array.isArray(r)?r.length:0),0)>ENTRY_FOLLOWUP.max_business_rows)throw Error('TOTAL_BUSINESS_ROW_BOUND');
 };
 try{
  out.target=exactEntryFollowupCase(proof);if(!text(source_run_id)||!/^\d+$/.test(source_run_id))throw Error('EXACT_CLOUD_RUN_REQUIRED');
  await guard('before_admission');
  const daily=await loadDailyUsageAggregate(db,started,{reconciliation});
  out.admission=evaluateDailyReservationBudget({daily,nextReservation:{rows_read:ENTRY_FOLLOWUP.reservation.rows_read+ENTRY_FOLLOWUP.next_full.rows_read,rows_written:ENTRY_FOLLOWUP.reservation.rows_written+ENTRY_FOLLOWUP.next_full.rows_written},maxDailyReads:3500000,maxDailyWrites:70000});
  if(!out.admission.allowed||db.usageSnapshot().unknown_ops)throw Error('ENTRY_READ_ACTUAL_DAY_ADMISSION_DENIED');
  await guard('before_reservation');id=`ENTRY_FOLLOWUP:214:${source_run_id}`;
  out.reservation=await reserveRunBudget(db,{reservationId:id,now:started,reservation:ENTRY_FOLLOWUP.reservation});reserved=true;room();
  await guard('before_business_reads');
  const schema=await db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name IN ('v3_recheck_task_shadow','v3_telegram_dispatch_shadow','v3_dispatch_publication_binding_shadow','v3_user_lifecycle_shadow','report2_trigger_kick_slot','report2_triggered_recheck_admission','canonical_publication_shadow') LIMIT 7").all();room();
  if(!Array.isArray(schema?.results)||schema.results.length>7)throw Error('NATIVE_SCHEMA_READ_NOT_CLOSED');
  out.available_tables=schema.results.map(x=>x.name);if(out.available_tables.some(n=>!TABLES.includes(n))||new Set(out.available_tables).size!==out.available_tables.length)throw Error('NATIVE_TABLE_IDENTITY_MISMATCH');out.observed_schema=schema.results;
  const t=out.target,day=new Date(t.due_ts).toISOString().slice(0,10);
  out.original_trigger_day_UTC=day;
  await read('task','v3_recheck_task_shadow','SELECT * FROM v3_recheck_task_shadow WHERE task_id=?1 LIMIT 1',[t.task_id],1);
  await read('original_dispatch','v3_telegram_dispatch_shadow','SELECT * FROM v3_telegram_dispatch_shadow WHERE idempotency_key=?1 LIMIT 1',[t.idempotency_key],1);
  await read('original_binding','v3_dispatch_publication_binding_shadow','SELECT * FROM v3_dispatch_publication_binding_shadow WHERE idempotency_key=?1 LIMIT 1',[t.idempotency_key],1);
  await read('user_lifecycle','v3_user_lifecycle_shadow','SELECT * FROM v3_user_lifecycle_shadow WHERE contract=?1 AND direction=?2 AND wave_id=?3 AND rules_version=?4 LIMIT 1',[t.contract,t.direction,t.wave_id,t.rules_version],1);
  await read('kick_day','report2_trigger_kick_slot','SELECT * FROM report2_trigger_kick_slot WHERE day_key=?1 ORDER BY slot LIMIT 3',[day],3);
  await read('admission_day','report2_triggered_recheck_admission','SELECT * FROM report2_triggered_recheck_admission WHERE day_key=?1 ORDER BY slot LIMIT 3',[day],3);
  const completion=parse(out.observations.task?.[0]?.last_result),publication=completion?.publication_id;
  if(typeof publication==='string'&&/^PUB:[a-f0-9]{40}$/.test(publication)&&publication!==t.publication_id){
   await read('fresh_canonical','canonical_publication_shadow','SELECT publication_id,contract_code,direction,run_id,snapshot_id,observed_ts,analytical_fingerprint,canonical_json FROM canonical_publication_shadow WHERE publication_id=?1 LIMIT 1',[publication],1);
   const row=out.observations.fresh_canonical?.[0],c=parse(row?.canonical_json),origin=c?.metadata?.original_idea_recheck;
   if(row&&(!c||row.contract_code!==t.contract||c.metadata?.contract!==t.contract||c.direction!==row.direction||c.run_id!==row.run_id||c.run_id===t.run_id||c.snapshot_id!==row.snapshot_id||c.observed_ts!==row.observed_ts||c.analytical_fingerprint!==row.analytical_fingerprint||canonicalFingerprint(c)!==row.analytical_fingerprint||origin?.task_id!==t.task_id||origin.publication_id!==t.publication_id||origin.original_run_id!==t.run_id||origin.original_snapshot_id!==t.snapshot_id||origin.wave_id!==t.wave_id||origin.direction!==t.direction))throw Error('FRESH_CANONICAL_BINDING_NOT_CLOSED');
  }
  out.description=describeEntryFollowup(out.observations,t);await guard('after_observation');out.status='EXACT_ENTRY_FOLLOWUP_READ_CLOSED';
 }catch(error){out.reason=String(error?.message||error).slice(0,240);}
 finally{
  out.usage_before_finalization=db.usageSnapshot();
  // Ledger-only monotonic finalization preserves known costs and unknowns.
  // No further business query or source action follows an unclosed cost.
  if(reserved){try{out.finalization=await finalizeRunUsage(db,{reservationId:id,sourceRunId:source_run_id,usage:out.usage_before_finalization,now:clock()});}catch(error){out.status='FINALIZATION_NOT_CLOSED';out.finalization_error=String(error?.message||error).slice(0,240);}}
  out.D1=db.usageSnapshot();out.completed_ts=clock();out.whole_day_closed=false;out.data_sha256=sha(JSON.stringify(out.observations));
 }
 return out;
}
