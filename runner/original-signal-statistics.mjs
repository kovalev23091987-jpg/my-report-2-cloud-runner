import {canonicalHash} from '../tools/original-trigger-cohort-audit.mjs';
const positiveId=x=>/^[1-9][0-9]*$/.test(String(x)),fail=reason=>({status:'NOT_CLOSED',reason,project_complete:false});
// Frozen source-window census. Mutable task state is a fact at read_ts only;
// a task's DONE flag and sampled price crossing cannot establish an ENTRY.
export function auditOriginalSignalStatistics({cohort,canonicalRows}={}){
 if(cohort?.status!=='BOUNDED_ALL_APPROVED_ORIGINAL24H_DECISION_TRIGGER_AUDIT_CLOSED'||cohort.exact_dispatch_range_closed!==true||!Number.isSafeInteger(cohort.read_ts)||!Array.isArray(canonicalRows)||canonicalRows.length!==cohort.complete_range_count?.rows||!Array.isArray(cohort.cases)||canonicalRows.length>200)return fail('CLOSED_BOUNDED_ORIGINAL_COHORT_REQUIRED');
 const byId=new Map(),states={};
 for(const row of canonicalRows){
  let c;try{c=JSON.parse(row.canonical_json);}catch{return fail('CANONICAL_JSON_REQUIRED');}
  if(byId.has(row.publication_id)||canonicalHash(c)!==row.analytical_fingerprint||c.analytical_fingerprint!==row.analytical_fingerprint||c.run_id!==row.run_id||c.snapshot_id!==row.snapshot_id||c.metadata?.contract!==row.contract_code||c.observed_ts!==row.observed_ts||c.state!==row.canonical_state||c.observed_ts<cohort.start_ts||c.observed_ts>cohort.end_ts)return fail('IMMUTABLE_CANONICAL_IDENTITY_REQUIRED');
  byId.set(row.publication_id,{row,c});states[c.state]=(states[c.state]||0)+1;
 }
 const seen=new Set(),cases=[];
 for(const x of cohort.cases){
  const original=byId.get(x.publication_id),r=original?.row,c=original?.c;
  if(!original||seen.has(x.publication_id)||!['OBSERVE','WAIT_FOR_TRIGGER'].includes(c.state)||x.contract!==r.contract_code||x.direction!==c.direction||x.run_id!==c.run_id||x.snapshot_id!==c.snapshot_id||x.analytical_fingerprint!==c.analytical_fingerprint||x.original_observed_ts!==c.observed_ts||JSON.stringify(x.original_trigger)!==JSON.stringify(c.trigger))return fail('UNIQUE_ORIGINAL_IDEA_REQUIRED');
  seen.add(x.publication_id);const b=x.binding,t=x.task;
  if(b&&(b.publication_id!==r.publication_id||b.contract_code!==r.contract_code||b.direction!==c.direction||b.wave_id!==r.wave_id||b.run_id!==r.run_id||b.snapshot_id!==r.snapshot_id||b.observed_ts!==c.observed_ts||b.analytical_fingerprint!==c.analytical_fingerprint))return fail('EXACT_DISPATCH_IDENTITY_REQUIRED');
  const sent=b?.state==='SENT'&&positiveId(b.telegram_message_id)&&Number.isSafeInteger(b.sent_ts)&&b.sent_ts>=c.observed_ts&&b.sent_ts<=cohort.read_ts;
  if(sent!==x.exact_SENT)return fail('ACTUAL_POSITIVE_SENT_RECEIPT_REQUIRED');
  if(t&&(t.publication_id!==r.publication_id||t.contract_code!==r.contract_code||t.direction!==c.direction||t.wave_id!==r.wave_id||t.run_id!==r.run_id||t.snapshot_id!==r.snapshot_id||t.due_ts!==c.trigger.next_recheck_ts||t.expires_ts!==c.trigger.expires_ts||!Number.isSafeInteger(t.updated_ts)||t.updated_ts>cohort.read_ts))return fail('EXACT_ORIGINAL_TASK_CLOCK_REQUIRED');
  let receipt;try{receipt=JSON.parse(t?.last_result);}catch{}
  const receiptBound=receipt?.schema==='LIGHT_PRICE_RECHECK_V1'&&receipt.publication_id===r.publication_id&&receipt.run_id===r.run_id&&receipt.snapshot_id===r.snapshot_id&&receipt.analytical_fingerprint===r.analytical_fingerprint&&String(receipt.telegram_message_id)===String(b?.telegram_message_id)&&Number.isSafeInteger(receipt.checked_ts)&&receipt.checked_ts<=cohort.read_ts;
  const expiry=sent&&t?.state==='EXPIRED'&&receiptBound&&receipt.status==='EXPIRED'&&receipt.reason==='ORIGINAL_TTL_EXPIRED'&&receipt.checked_ts>=c.trigger.expires_ts;
  const cancellation=sent&&t?.state==='CANCELLED'&&receiptBound&&receipt.status==='CANCELLED';
  cases.push({publication_id:r.publication_id,contract:r.contract_code,run_id:r.run_id,snapshot_id:r.snapshot_id,fingerprint:r.analytical_fingerprint,original_observed_ts:c.observed_ts,original_message_id:sent?String(b.telegram_message_id):null,exact_SENT:sent,current_task_state_at_read:t?.state??'NOT_FOUND',original_TTL_expiry_verified:expiry,collector_cancellation_receipt_verified:cancellation,sampled_trigger_crossing:x.price_diagnosis?.status==='SAMPLED_UNCANCELLED_ORIGINAL_TRIGGER_CROSSING',sampled_cancellation:x.price_diagnosis?.status==='SAMPLED_ORIGINAL_CANCELLATION',original_price_window_complete:x.price_diagnosis?.coverage_complete===true&&x.price_diagnosis?.original_window_complete===true,confirmed_ENTRY:false,terminal_Telegram_delivery_proven:false});
 }
 const count=predicate=>cases.filter(predicate).length;
 return {schema:'ORIGINAL_SIGNAL_ENTRY_CANCEL_MISSED_FACTUAL_CENSUS_V1_20261010',status:'SCOPED_ORIGINAL_COHORT_STATISTICS_CLOSED',source_window:{start_ts:cohort.start_ts,end_ts:cohort.end_ts,mutable_state_read_ts:cohort.read_ts,source_cloud_run:cohort.cloud_run,source_head:cohort.head},canonical_rows:canonicalRows.length,canonical_states:states,initial_ideas:cases.length,actual_initial_SENT:count(x=>x.exact_SENT),initial_ideas_without_exact_SENT:count(x=>!x.exact_SENT),original_TTL_expiries_verified:count(x=>x.original_TTL_expiry_verified),collector_cancellation_receipts_verified:count(x=>x.collector_cancellation_receipt_verified),tasks_DONE_not_proof_of_ENTRY:count(x=>x.current_task_state_at_read==='DONE'),sampled_trigger_crossings:count(x=>x.sampled_trigger_crossing),sampled_crossings_with_SENT:count(x=>x.sampled_trigger_crossing&&x.exact_SENT),sampled_crossings_without_SENT:count(x=>x.sampled_trigger_crossing&&!x.exact_SENT),canonical_ENTRY_states_in_source_window:states.ENTRY_NOW_ANALYTICAL||0,confirmed_same_idea_ENTRY_with_settlement_and_SENT:null,confirmed_terminal_Telegram_deliveries:null,proven_missed_ENTRY_denominator:null,missed_ENTRY_rate_pct:null,profitability_rate_pct:null,cases,scope_complete:true,full_signal_population_complete:false,sampled_crossing_is_not_confirmed_ENTRY:true,no_current_state_backdated:true,sourceHTTP:0,D1:0,Telegram:0,project_complete:false};
}
