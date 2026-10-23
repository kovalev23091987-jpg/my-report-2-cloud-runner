import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const root=process.env.REPORT2_TEST_RUNTIME?pathToFileURL(process.env.REPORT2_TEST_RUNTIME+'/'):new URL('../files/',import.meta.url);
const {buildRunBudgetContext:build}=await import(new URL('src/run-budget-context.mjs',root));
const {createUnifiedHttpBudget,HTTP_LIMITS}=await import(new URL('src/unified-budget.mjs',root));
const {TWO_NODE_HTTP_LIMITS}=await import(new URL('src/two-candidate-policy.mjs',root));
const {buildLiquidationSourceAcquisitionAudit}=await import(new URL('src/liquidation-source-acquisition-audit.mjs',root));
const reservation={rows_read:54000,rows_written:840},usage={requests:687,rows_read:49233,rows_written:685,unknown_ops:0};
function budget(){return createUnifiedHttpBudget({...HTTP_LIMITS,...TWO_NODE_HTTP_LIMITS});}
const frozen=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(frozen);Object.freeze(x);}return x;};
test('real run budget summary preserves effective merged caps and duplicate reservations without claiming actual HTTP',()=>{
 const b=budget();b.reserve({logical_request_id:'one',lane:'hot',attempts:2});b.reserve({logical_request_id:'one',lane:'hot',attempts:2});b.reserve({logical_request_id:'two',lane:'background',attempts:3,unknown:true});
 const snapshot=frozen(b.summary()),before=JSON.stringify(snapshot),out=build({http:snapshot,reservation,usage});assert.deepEqual(out.HTTP.limits,Object.fromEntries(['whole_job','hot','background','statistics'].map(k=>[k,snapshot.limits[k]])));assert.equal(out.HTTP.total_reserved,5);assert.equal(out.HTTP.reported_remaining_slots,snapshot.limits.whole_job-5);assert.equal(out.HTTP.consistent,true);assert.equal(out.HTTP.actual_HTTP,null);assert.equal(out.HTTP.admissible_extra_HTTP,null);assert.equal(out.admission_authorized,false);assert.equal(JSON.stringify(snapshot),before);assert.equal(b.summary().total,5);
});
test('inconsistent or nonnumeric summaries never produce an extra-work admission',()=>{
 const good=budget().summary();for(const row of [{...good,total:1},{...good,remaining:'164'},{...good,used:{...good.used,hot:null}},{...good,limits:{...good.limits,whole_job:NaN}}]){
  const out=build({http:row});assert.equal(out.HTTP.consistent,false);assert.equal(out.HTTP.status,'SUMMARY_NOT_CLOSED');assert.equal(out.HTTP.admissible_extra_HTTP,null);assert.equal(out.admission_authorized,false);
 }
 assert.equal(build().HTTP,null);
});
test('native point arithmetic keeps its exact existing cut and does not subtract another full from a run allowance',()=>{
 const out=build({run_id:'CONTROLLED:one',recorded_ts:1792353846750,reservation,usage});assert.deepEqual(out.native_run.remaining_at_this_cut,{rows_read:4767,rows_written:155});assert.equal(out.native_run.reservation_exceeded,false);assert.deepEqual(out.required_next_full_reservation_by_policy,{rows_read:59000,rows_written:920});assert.equal(out.observed_next_full_reservation,null);assert.equal(out.native_run.future_work_admitted,false);assert.ok(out.cut.includes('BEFORE_OPTIONAL_MANUAL_COMMAND_COMPLETION'));assert.equal(out.independent_global_native_capacity,null);assert.equal(out.whole_day_closed,false);
});
test('unclosed invocation or missing counters leave native headroom unknown; an overrun is visible',()=>{
 for(const u of [{...usage,unknown_ops:1},{...usage,rows_read:null},{...usage,rows_written:'685'},null]){
  const out=build({reservation,usage:u});assert.equal(out.native_run.remaining_at_this_cut,null);assert.equal(out.native_run.status,'NATIVE_USAGE_OR_RESERVATION_UNCLOSED');assert.equal(out.admission_authorized,false);
 }
 const out=build({reservation,usage:{...usage,rows_read:54001}});assert.equal(out.native_run.reservation_exceeded,true);assert.equal(out.native_run.remaining_at_this_cut.rows_read,0);assert.equal(out.native_run.future_work_admitted,false);
});
test('earlier day unknown15 stays distinct from this invocation zero and a serialized witness stays nongrant',()=>{
 const day=frozen({allowed:true,status:'CLOSED',daily:{day_utc:'2026-10-18',unknown_ops:15,reserved_rows_read:814100,reserved_rows_written:13832,native_cost_reconciliation:{status:'AGGREGATE_BILLABLE_COST_CLOSED',manifest_sha256:'a'.repeat(64),historical_unknown_operations_preserved:15,new_or_unmatched_unknown_authorized:false,secret:'DO_NOT_COPY'}}});
 const out=build({usage,reservation,day_admission:day});assert.equal(out.native_run.usage.unknown_ops,0);assert.equal(out.earlier_day_admission.reported_unknown_ops,15);assert.equal(out.earlier_day_admission.reconciliation.historical_unknown_operations_preserved,15);assert.equal(out.earlier_day_admission.reconciliation.new_or_unmatched_unknown_authorized,false);assert.equal(out.earlier_day_admission.reconciliation.serialized_copy_is_not_a_proof_token,true);assert.equal(out.earlier_day_admission.allowed_at_original_cut,true);assert.equal(out.admission_authorized,false);assert.ok(!JSON.stringify(out).includes('DO_NOT_COPY'));
});
test('configuration caps and local slots cannot create provider daily monthly rolling or manual balances',()=>{
 const out=build({http:budget().summary(),reservation,usage,provider:{allowance:10000,used:0},usage_targets:{secret:'DO_NOT_COPY'}});assert.equal(out.provider_day_month_rolling60s_headroom,null);assert.equal(out.manual_provider_reserve_headroom,null);assert.equal(out.HTTP.actual_HTTP,null);assert.ok(!JSON.stringify(out).includes('DO_NOT_COPY'));assert.equal(out.additional_SQL,0);assert.equal(out.additional_source_HTTP,0);
});
test('native liquidation service zero is retained with narrow scope and absent cost stays null',()=>{
 const audit=buildLiquidationSourceAcquisitionAudit({summary:{shared_budget:{reserved_http:0,actual_http:0},total_http_cap:4},run_id:'CONTROLLED',evaluated_ts:1792353846750,candidates:[]});assert.equal(audit.shared_budget.max_http_per_run,4);
 const out=build({native_liquidation:{...audit.shared_budget,raw_provider_body:'DO_NOT_COPY'}});assert.equal(out.native_liquidation_service.reserved_http,0);assert.equal(out.native_liquidation_service.actual_http,0);assert.equal(out.native_liquidation_service.max_http_per_run,4);assert.equal(out.native_liquidation_service.claimed_http,null);assert.equal(out.native_liquidation_service.gross_reserved_http,null);assert.equal(out.native_liquidation_service.scope,'EXISTING_NATIVE_LIQ_SERVICE_NOT_ALL_LIQ_PROVIDERS_OR_JOB');assert.ok(!JSON.stringify(out).includes('DO_NOT_COPY'));assert.equal(build().native_liquidation_service,null);
});
test('effective runner reads each pure snapshot once and reuses the same native point in the existing artifact',()=>{
 const runner=readFileSync(new URL('runner-main.mjs',root),'utf8'),start=runner.indexOf('  const d1AfterAnalyticsLeaseRelease='),end=runner.indexOf('  const finalRunResult=',start);assert.ok(start>0&&end>start);
 const calls=[],point=frozen({...usage}),env={DATA_DB:{usageSnapshot(){calls.push('usageSnapshot');return point;},prepare(){throw Error('NO_SQL_ALLOWED');}}},http=budget().summary();
 const fn=new Function('env','unifiedHttpBudget','buildRunBudgetContext','cron','completed','d1RunReservation','d1DayAdmission','canonicalRunOutput','providerBudgetReceipts',runner.slice(start,end)+'return {point:d1AfterAnalyticsLeaseRelease,context:existingRunBudgetContext};');
 const out=fn(env,{summary(){calls.push('summary');return http;}},build,{run_id:'CONTROLLED'},1792353846750,reservation,{allowed:true,status:'CLOSED',daily:{unknown_ops:15}},{},{summary(run){assert.equal(run,'CONTROLLED');calls.push('providerReceiptSummary');return null;}});assert.deepEqual(calls,['usageSnapshot','summary','providerReceiptSummary']);assert.equal(out.point,point);assert.deepEqual(out.context.native_run.usage,usage);assert.equal(out.context.recorded_ts,1792353846750);assert.equal(out.context.admission_authorized,false);assert.ok(runner.includes('usage_after_analytics_lease_release:d1AfterAnalyticsLeaseRelease,existing_run_budget_context:existingRunBudgetContext'));assert.ok(runner.includes('existing_run_budget_context:existingRunBudgetContext, maintenance_cadence:'));
});
