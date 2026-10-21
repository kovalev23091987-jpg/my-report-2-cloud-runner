import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {approvedHtxLimitedCronAdmitted} from '../files/src/approved-htx-analysis-scope.mjs';

const source=fs.readFileSync(process.env.REPORT2_TEST_RUNTIME?path.join(process.env.REPORT2_TEST_RUNTIME,'runner-main.mjs'):new URL('../files/runner-main.mjs',import.meta.url),'utf8');
const begin=source.indexOf('  if ((cron.status !== "SUCCESS"&&!approvedHtxLimitedCronAdmitted('),end=source.indexOf('  console.log("CRON_IDENTITY_BINDING"',begin);
assert.ok(begin>0&&end>begin);
const verify=new Function('approvedHtxLimitedCronAdmitted','cron','generation','process','env','d1DayAdmission',source.slice(begin,end)).bind(null,approvedHtxLimitedCronAdmitted);
const audit={schema:'APPROVED_HTX_ANALYSIS_SCOPE_V1',status:'NOT_CLOSED',expected_analysis_contracts:105,accepted_analysis_contracts:99,missing_approved_analysis_contracts:['CONTROLLED_A-USDT','CONTROLLED_B-USDT','CONTROLLED_C-USDT','CONTROLLED_D-USDT','CONTROLLED_E-USDT','CONTROLLED_F-USDT'],observed_ts:1792319554644,identity_rejected:[],duplicate_rejected:[]};
const selection={run_id:'CONTROLLED_RUN',top_two_contracts:['QNT-USDT','BTW-USDT'],registry_did_not_change_rank:true};
const cron={run_id:'CONTROLLED_RUN',status:'PARTIAL',completed_ts:1792319668771,universe_total:105,scanned:99,persistence_status:'NOT_CLOSED'};
const day={allowed:true,daily:{unknown_ops:15,reserved_rows_read:54000,reserved_rows_written:840}};
const env={REPORT2_CURRENT_CYCLE_UNIVERSE_AUDIT:audit,REPORT2_CURRENT_CYCLE_SELECTION_AUDIT:selection};
const processStub={env:{GITHUB_SHA:'a'.repeat(40),GITHUB_RUN_ID:'CONTROLLED_GITHUB_RUN'}};
function partial(){try{verify(cron,'CONTROLLED_CURRENT_GENERATION',processStub,env,day);}catch(error){return error;}throw Error('PARTIAL_RUN_MUST_THROW');}

test('actual runner retains its already obtained exact missing-set audit and original clocks while rejecting partial cron',()=>{
 const snapshot=JSON.stringify({cron,audit,selection,day}),error=partial(),context=error.partial_cron_failure;
 assert.match(error.message,/^CRON_IDENTITY_NOT_SUCCESS:/);assert.deepEqual(context.approved_universe_audit,audit);assert.deepEqual(context.candidate_selection_audit,selection);assert.deepEqual(context.cron,cron);assert.equal(context.head,'a'.repeat(40));assert.equal(context.source_run_id,'CONTROLLED_GITHUB_RUN');assert.equal(context.additional_SQL+context.additional_source_HTTP,0);assert.equal(context.full_report_completed||context.entry_authorized||context.Telegram_SENT_claimed,false);assert.equal(JSON.stringify({cron,audit,selection,day}),snapshot);
});
test('successful cron retains the existing path without producing a diagnostic or weakening the completion check',()=>{
 assert.equal(verify({...cron,status:'SUCCESS'},'CONTROLLED',processStub,env,day),undefined);
 assert.throws(()=>verify({...cron,status:'SUCCESS',completed_ts:null},'CONTROLLED',processStub,env,day),/CRON_IDENTITY_NOT_SUCCESS/);
});
test('actual fatal handler writes the in-memory context into the existing accounting artifact and keeps exact costs and refusal',async()=>{
 const start=source.indexOf('main().catch(async(error) => {'),stop=source.lastIndexOf('\n});');assert.ok(start>0&&stop>start);
 const body=source.slice(start+'main().catch(async(error) => {'.length,stop),AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 const invoke=new AsyncFunction('error','canonicalOutputForFailure','fs','markPostAnalysisControlFailure','process','console','cleanupClaimedAnalyticsLease','failedD1RunAccounting',body);
 const original=JSON.parse(fs.readFileSync('checkpoints/current-day-refusal-20261018/first-UTC18-39081512792-failure-accounting.json')),before=JSON.stringify(original),writes=[];let finalized=0,cleanups=0;const process={exitCode:0};
 await invoke(partial(),null,{writeFile:async(name,bytes)=>writes.push({name,value:JSON.parse(bytes)})},()=>{throw Error('NO_CANONICAL_PROMOTION');},process,{error(){}},async()=>{cleanups++;return{finished:true};},{finalizeFailure:async()=>{finalized++;return structuredClone(original);}});
 assert.equal(cleanups,1);assert.equal(finalized,1);assert.equal(process.exitCode,1);assert.deepEqual(writes.map(x=>x.name),['report2-failure-accounting.json']);assert.deepEqual(writes[0].value.partial_cron_failure.approved_universe_audit,audit);const retained={...writes[0].value};delete retained.partial_cron_failure;assert.deepEqual(retained,original);assert.equal(JSON.stringify(original),before);assert.equal(retained.unknown_ops_preserved,15);assert.equal(retained.reservation_never_reduced,true);
});
