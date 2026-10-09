import fs from 'node:fs';
import assert from 'node:assert/strict';
const input=JSON.parse(fs.readFileSync(process.argv[2]));
function verify(c){
 assert.equal(c.head,'d692a79dfcecc9e359c7e3387799d6bf2eed595b');assert.equal(c.run_id,'37954328290');assert.equal(c.source,'schedule');assert.equal(c.status,'NOT_CLOSED');assert.equal(c.reason,'D1_TRIGGER_BUDGET_NOT_CLOSED');assert.deepEqual(c.candidates,[]);
 const r=c.pre_analysis_failure,n=r.native_daily_aggregate,u=r.d1_attempt_usage;
 assert.equal(r.head,c.head);assert.equal(r.source_run_id,c.run_id);assert.equal(r.stage,'D1_TRIGGER_RECHECK_ADMISSION');assert.equal(r.daily_usage_scope,'NATIVE_DAILY_AGGREGATE');assert.equal(r.status,'UNMEASURED_FINALIZED_USAGE');assert.equal(n.day_utc,'2026-10-09');assert.equal(n.unknown_operations,1);assert.equal(n.reserved_rows_read,993000);assert.equal(n.reserved_rows_written,17664);assert.equal(n.measured_rows_read,595632);assert.equal(n.measured_rows_written,8023);assert.equal(n.unfinished_reservations,0);assert.equal(r.daily.reserved_rows_read,n.reserved_rows_read);assert.equal(r.daily.unknown_operations,n.unknown_operations);
 assert.equal(u.unknown_operations,0);assert.equal(u.attempted_statements,14);assert.equal(u.total_rows_read,564);assert.equal(u.total_rows_written,1);assert.equal(u.row_totals_closed,true);
 for(const k of ['market_conditions_evaluated','full_analysis_completed','entry_authorized','source_clock_refreshed'])assert.equal(r[k],false);assert.equal(r.task_writes,0);return true;
}
verify(input);
for(const mutate of [c=>c.head='a'.repeat(40),c=>c.pre_analysis_failure.native_daily_aggregate.unknown_operations=0,c=>c.pre_analysis_failure.daily_usage_scope='ADAPTIVE_ADMISSION_POLICY_INPUTS',c=>c.pre_analysis_failure.entry_authorized=true]){const c=structuredClone(input);mutate(c);assert.throws(()=>verify(c));}
const proof={schema:'POST266_ORIGINAL_NATIVE_TRIGGER_REFUSAL_VERIFICATION_V1',head:process.env.GITHUB_SHA??null,cloud_run:Number(process.env.GITHUB_RUN_ID)||null,original_run:37954328290,original_head:input.head,native_trigger_receipt_fields_verified:true,native_full_cycle_adaptive_receipt_fields_verified:false,original_receipt:input,controls_rejected:4,sourceHTTP:0,D1:0,MAIN:0,Telegram:0,source_clocks_refreshed:false,new_native_admission:false,actual_ENTRY:false,full_TZ_complete:false};
fs.mkdirSync('audit-output',{recursive:true});fs.writeFileSync('audit-output/post266-native-refusal-verification.json',JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({status:'EXACT_ORIGINAL_NATIVE_TRIGGER_REFUSAL_AND_COUNTER_SCOPES_VERIFIED',original_run:37954328290,controls_rejected:4,sourceHTTP:0,D1:0,actual_ENTRY:false}));
