import test from 'node:test';
import assert from 'node:assert/strict';
import {originalTaskFollowupAudit as audit} from '../files/src/original-task-followup-audit.mjs';
import {ownerSilentExpiryDispatch} from '../files/src/owner-telegram-expiry-policy.mjs';

// CONTROLLED existing-row replies; no claim that these are historical NIL checks.
const now=1792400000000,observed=now-1800000;
const canonical={metadata:{contract:'NIL-USDT'},direction:'LONG',run_id:'CONTROLLED:ORIGINAL',
 snapshot_id:'CONTROLLED:SNAPSHOT',observed_ts:observed,analytical_fingerprint:'CONTROLLED:FP',
 trigger:{next_recheck_ts:observed+300000,expires_ts:now-1000}};
const task={task_id:'RCHK:CONTROLLED:AUDIT',publication_id:'PUB:CONTROLLED',contract_code:'NIL-USDT',
 direction:'LONG',wave_id:'CONTROLLED:WAVE',run_id:canonical.run_id,snapshot_id:canonical.snapshot_id,
 due_ts:canonical.trigger.next_recheck_ts,expires_ts:canonical.trigger.expires_ts,state:'EXPIRED',
 updated_ts:now-1000,attempt_count:2,telegram_message_id:'229'};
const light=(extra={})=>({schema:'LIGHT_PRICE_RECHECK_V1',scope:'PRICE_AND_CANCELLATION_ONLY',
 task_id:task.task_id,publication_id:task.publication_id,run_id:task.run_id,snapshot_id:task.snapshot_id,
 analytical_fingerprint:canonical.analytical_fingerprint,telegram_message_id:'229',
 checked_ts:now-120000,source_ts:now-122000,observed_ts:now-121000,price:.078,
 source:'HTX_OFFICIAL_COLLECTOR',status:'WAITING_FOR_PRICE',settlement_confirmed:false,
 entry_authorized:false,full_analysis_completed:false,...extra});
const run=r=>audit({task:{...task,last_result:typeof r==='string'?r:r===undefined?null:JSON.stringify(r)},canonical,now_ts:now});
test('new projection preserves an existing bound light check without authorizing entry or refreshing clocks',()=>{
 const r=run(light());assert.equal(r.status,'PRODUCER_BOUND_EXISTING_TASK_INPUT');
 assert.equal(r.task.state,'EXPIRED');assert.equal(r.task.attempt_count,2);
 assert.equal(r.retained_light_checks[0].price,.078);assert.equal(r.retained_light_checks[0].source_ts,now-122000);
 assert.equal(r.actual_ENTRY,null);assert.equal(r.entry_authorized,false);assert.equal(r.SQL_added,0);
 assert.equal(r.retained_light_history_complete,false);
});
test('expiry completion projects the retained light wrapper and full completion reason separately',()=>{
 const r=run({schema:'RECHECK_COMPLETION_V1',status:'EXPIRED',reason:'TTL_EXPIRED_BEFORE_RECHECK',
  completed_ts:now-1000,original_light_price_receipt:light()});
 assert.equal(r.last_result.status,'EXPIRED');assert.equal(r.last_result.completed_ts,now-1000);
 assert.equal(r.retained_light_checks[0].status,'WAITING_FOR_PRICE');
});
test('bounded history keeps a first trigger, deduplicates it and never calls retained history complete',()=>{
 const parent=light(),prior=Array.from({length:9},(_,i)=>light({checked_ts:now-700000+i*60000,
  source_ts:now-702000+i*60000,observed_ts:now-701000+i*60000}));
 const first={...prior[8],status:'TRIGGER_PRICE_REACHED_FULL_ANALYSIS_REQUIRED'};
 parent.prior_checks=[...prior.slice(0,8),first];parent.first_trigger_receipt=first;
 const r=run(parent);assert.ok(r.retained_light_checks.length<=8);
 assert.equal(r.retained_light_checks.filter(c=>c.status==='TRIGGER_PRICE_REACHED_FULL_ANALYSIS_REQUIRED').length,1);
 assert.equal(r.discarded_light_checks,3);assert.equal(r.retained_light_history_complete,false);
});
test('a foreign retained parent cannot create exact task or price evidence',()=>{
 for(const key of ['task_id','publication_id','run_id','snapshot_id','analytical_fingerprint','telegram_message_id']){
  const r=run(light({[key]:'FOREIGN'}));assert.equal(r.retained_light_checks.length,0);
  assert.equal(r.light_binding_status,'RETAINED_PARENT_IDENTITY_NOT_CONFIRMED');
 }
});
test('foreign nested identity, authorized entry and invalid prices are discarded rather than normalized into reached signals',()=>{
 for(const change of [{task_id:'FOREIGN'},{entry_authorized:true},{full_analysis_completed:true},
  {price:0},{price:'0.078'},{settlement_confirmed:true}]){
  const r=run(light({prior_checks:[light({...change,checked_ts:now-130000})]}));
  assert.equal(r.retained_light_checks.length,1);assert.equal(r.discarded_light_checks,1);
 }
});
test('future, stale or out-of-order source clocks cannot appear as verified retained prices',()=>{
 for(const change of [{checked_ts:now+1},{source_ts:now-300001},{observed_ts:now-119999},
  {source_ts:observed-1},{source_ts:String(now-122000)}]){
  assert.equal(run(light(change)).retained_light_checks.length,0);
 }
});
test('missing, malformed, primitive and oversized retained input remain explicit unknown boundaries',()=>{
 for(const [input,state] of [[undefined,'MISSING_RETAINED_RESULT'],['{bad','INVALID_RETAINED_JSON'],
  ['null','INVALID_RETAINED_OBJECT'],['[]','INVALID_RETAINED_OBJECT'],['x'.repeat(16385),'RESULT_NOT_PROJECTED_TYPE_OR_16384_CODE_UNIT_BOUND']]){
  const r=run(input);assert.equal(r.last_result_state,state);assert.equal(r.retained_light_checks.length,0);
  assert.equal(r.actual_ENTRY,null);
 }
});
test('invalid or missing native counters and timestamps are null rather than zero',()=>{
 const r=audit({task:{...task,attempt_count:'2',updated_ts:null,last_result:null},canonical,now_ts:now});
 assert.equal(r.task.attempt_count,null);assert.equal(r.task.updated_ts,null);
});
test('retained full-analysis summary requires exact original identity and preserves its own clock',()=>{
 const full={schema:'ORIGINAL_IDEA_RECHECK_V1',task_id:task.task_id,publication_id:task.publication_id,
  original_run_id:task.run_id,original_snapshot_id:task.snapshot_id,original_fingerprint:canonical.analytical_fingerprint,
  direction:task.direction,original_expires_ts:task.expires_ts,checked_ts:now-10000,status:'WAITING',settlement_confirmed:false};
 assert.equal(run({full_analysis_receipt:full}).full_analysis.checked_ts,now-10000);
 for(const change of [{original_run_id:'FOREIGN'},{direction:'SHORT'},{checked_ts:now+1}]){
  assert.equal(run({full_analysis_receipt:{...full,...change}}).full_analysis,null);
 }
});
test('invalid top-level binding or original Telegram acknowledgement cannot gain producer-bound status',()=>{
 for(const change of [{snapshot_id:'FOREIGN'},{telegram_message_id:'0'},{telegram_message_id:'229x'}]){
  assert.equal(audit({task:{...task,...change},canonical,now_ts:now}).status,'UNKNOWN');
 }
});
test('projection leaves source inputs byte-exact and bounds its normal output',()=>{
 const t={...task,last_result:JSON.stringify(light())},c=structuredClone(canonical),before=JSON.stringify([t,c]);
 const r=audit({task:t,canonical:c,now_ts:now});assert.equal(JSON.stringify([t,c]),before);
 assert.ok(Buffer.byteLength(JSON.stringify(r))<4096);assert.equal(r.source_HTTP_added,0);
 assert.equal(r.light_history_scope,'RETAINED_INPUT_ONLY_NOT_ALL_EXECUTED_CHECKS');
});
test('owner expiry suppression requires an exact unsent TTL-only row and never suppresses OBSERVE, ENTRY, price cancellation or SENT',()=>{
 const r={schema:'LIFECYCLE_REMOVAL_RECEIPT_V1',market_snapshot:false,reason:'ORIGINAL_TTL_EXPIRED',contract:'NIL-USDT',direction:'LONG',wave_id:'W'};
 const row={state:'PENDING',lifecycle_event:'IDEA_REMOVED',contract:r.contract,direction:r.direction,wave_id:r.wave_id,message_hash:JSON.stringify(r)};
 assert.equal(ownerSilentExpiryDispatch(row),true);assert.equal(ownerSilentExpiryDispatch({...row,state:'FAILED_RETRYABLE'}),true);
 for(const change of [{state:'SENT'},{state:'SENDING'},{lifecycle_event:'OBSERVE'},{lifecycle_event:'ENTRY'},
  {contract:'CT-USDT'},{direction:'SHORT'},{wave_id:'FOREIGN'},{message_hash:'bad'},
  {message_hash:JSON.stringify({...r,reason:'ORIGINAL_PRICE_CANCELLED'})},
  {message_hash:JSON.stringify({...r,schema:'OTHER'})},{message_hash:'x'.repeat(16385)}]){
  assert.equal(ownerSilentExpiryDispatch({...row,...change}),false);
 }
});
