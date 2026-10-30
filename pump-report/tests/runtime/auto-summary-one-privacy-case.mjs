import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {autoRunSummary} from '../../runtime/automatic-summary.mjs';

// One connected operational projection case. No runner, engine, store or broker.
const saved=JSON.parse(readFileSync(new URL('../../handoffs/analytics/package-bh/ACTUAL_STAGE_EVIDENCE.json',import.meta.url)));
const example=JSON.parse(readFileSync(new URL('../../handoffs/analytics/package-bi/EXAMPLE_FROM_SAVED_RUN.json',import.meta.url)));
const old=saved.actual_run;
const input={run_id:old.run_id,status:old.status,checked:[],manual:[],delivery:old.delivery,
  deferred:old.deferred,errors:old.errors,discovery_result:old.discovery_result,
  source_evidence_coverage:{temporarily_deferred:9}};
assert.deepEqual(autoRunSummary(input,saved.original.implementation),example.proposed_event);

const secret='PRIVATE_RECIPIENT_TOKEN_RAW_TEXT_DO_NOT_LOG';
const card='PUMP:'+'a'.repeat(64),pin='b'.repeat(64);
const duplicate={state:'SENT',card_id:card,message_id:'241',receipt_readback:true,
  text:secret,recipient:secret,receipt:{recipient:secret},raw:secret};
const rich={run_id:old.run_id,status:'COMPLETE',checked:[
  {analysis:{ready:true,automatic_eligible:true,reasons:['PLAN_POTENTIAL_BELOW_OWNER_MINIMUM',secret],card_text:secret,plan:{secret}},delivery:duplicate},
  {status:'DEFERRED_SOURCE_EVIDENCE',source_coverage:{reason:'NATIVE_CORE_UNIT_EVIDENCE_REQUIRED',raw:secret}}
],manual:[{request_id:secret,result:{delivery:{state:secret,card_id:secret,message_id:secret,reason:secret}}}],
delivery:[duplicate,...Array.from({length:9},()=>({state:'READY',card_id:secret,message_id:secret,recipient:secret}))],errors:[],
resources:{mode:'STATISTICS',secret},token:secret};
const before=JSON.stringify(rich),summary=autoRunSummary(rich,pin),encoded=JSON.stringify(summary);
assert.equal(JSON.stringify(rich),before,'summary must not mutate original result or receipts');
assert.equal(encoded.includes(secret),false,'raw reasons, invalid IDs, plans and recipient/token must not leak');
assert.deepEqual(summary.counts,{checked_entries:2,analysis_results:1,ready_results:1,ready_auto_eligible_results:1,
  manual_results:1,budget_deferred_entries:0,source_pending:null,catalog_unresolved:null});
assert.equal(summary.mode,'AUTO','resource mode STATISTICS is not the invocation mode');
assert.equal(summary.delivery.reported_occurrences,12,'inline and drain duplicate remains an occurrence, not a new send');
assert.equal(summary.delivery.occurrences_by_state.SENT,2);
assert.equal(summary.delivery.refs.length,8);
assert.equal(summary.delivery.refs_truncated,true);
assert.deepEqual(summary.delivery.refs.slice(0,3).map(x=>x.origin),['CHECKED_INLINE','MANUAL_INLINE','QUEUE_DRAIN']);
assert.equal(summary.delivery.refs[1].card_id,null);
assert.equal(summary.delivery.refs[1].message_id,null);
assert.equal('new_AUTO_SENT' in summary,false);
assert.equal('sent_proved' in summary,false);
assert(encoded.length<5000,'one record remains bounded without raw objects');
const busy=autoRunSummary({run_id:old.run_id,status:'EXECUTOR_BUSY'},pin);
assert.equal(busy.counts.checked_entries,null);
assert.equal(busy.counts.budget_deferred_entries,null);
assert.equal(busy.delivery.reported_occurrences,null);
assert.equal(busy.phase_flags.analysis_result_seen,null);
const empty=autoRunSummary({run_id:old.run_id,status:'COMPLETE',checked:[],manual:[],delivery:[],errors:[]},pin);
assert.deepEqual(empty.reason_codes,[],'missing selection reason must not become invented no-growth claim');
assert.equal(empty.counts.checked_entries,0);
assert.equal(autoRunSummary({run_id:secret,status:secret},secret).implementation_pin,null);
console.log(JSON.stringify({case:'AUTO_SUMMARY_ONE_CONNECTED_PRIVACY_AND_SEMANTICS',status:'PASS',
  cases:1,saved_projection_matched:true,private_data_omitted:true,duplicate_not_new_send:true,
  missing_arrays_unknown:true,no_selection_reason_fabrication:true,Node_invocations:1,
  runner_engine_store_broker_invocations:0,native_SQL:0,provider_HTTP:0,Telegram:0,deploy:0}));
