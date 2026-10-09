import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {evaluateKnownD1DayGuard,buildKnownDayRefusalOutput} from '../../tools/known-d1-day-guard.mjs';
import {auditProductionArtifact} from '../../tools/production-artifact-outcome.mjs';
const proof=JSON.parse(fs.readFileSync('checkpoints/ACTUAL_AUTOMATIC_PRODUCTION_ARTIFACT_AUDIT_20261009.json'));
const read=n=>JSON.parse(execFileSync('unzip',['-p',proof.retained,n]));
const args={proof,retainedAudit:read('automatic-delivery-audit.json'),retainedSource:read('source-artifact.json'),archive_digest:'sha256:'+createHash('sha256').update(fs.readFileSync(proof.retained)).digest('hex'),now_ts:Date.parse('2026-10-09T23:59:59Z'),generation:'MY_REPORT_2_CURRENT_20260929_CURRENT_CYCLE_V13_20M'};
test('actual retained original unknown cost blocks same UTC day without new calls',()=>{const a=evaluateKnownD1DayGuard(args);assert.equal(a.blocked,true);assert.equal(a.original_refusal.run_id,'37976223431');assert.equal(a.native_daily_aggregate.unknown_operations,1);assert.equal(a.sourceHTTP+a.D1+a.Telegram,0);assert.equal(a.source_clock_refreshed,false);});
test('UTC rollover requires native admission; local midnight does not unblock UTC day',()=>{assert.equal(evaluateKnownD1DayGuard({...args,now_ts:Date.parse('2026-10-10T00:00:00Z')}).blocked,false);assert.equal(evaluateKnownD1DayGuard({...args,now_ts:Date.parse('2026-10-10T00:30:00+03:00')}).blocked,true);});
test('bad archive, mismatched audit, head/run or generation cannot suppress native admission',()=>{
 for(const patch of [{archive_digest:'sha256:'+'0'.repeat(64)},{retainedAudit:{...args.retainedAudit,run_id:'foreign'}},{retainedSource:{...args.retainedSource,source_head:'a'.repeat(40)}},{generation:'old'}])assert.equal(evaluateKnownD1DayGuard({...args,...patch}).blocked,false);
});
test('future or missing original clocks and absent unknown cost cannot create a block',()=>{
 for(const patch of [{failed_ts:args.now_ts+1},{failed_ts:null},{native_daily_aggregate:{...args.retainedAudit.native_daily_aggregate,unknown_operations:0}},{native_daily_aggregate:{...args.retainedAudit.native_daily_aggregate,day_utc:'2026-10-08'}}]){const a={...args.retainedAudit,...patch};assert.equal(evaluateKnownD1DayGuard({...args,proof:{...proof,actual_audit:a},retainedAudit:a}).blocked,false);}
});
test('retained refusal never qualifies as market evaluation, delivery or ENTRY',()=>{
 const a=evaluateKnownD1DayGuard(args),head='a'.repeat(40),o=buildKnownDayRefusalOutput({guard:a,head,run_id:'12345',generation:args.generation,now_ts:args.now_ts});
 assert.equal(o.pre_analysis_failure.native_admission_rechecked,false);assert.equal(o.pre_analysis_failure.retained_refusal_source.failed_ts,args.retainedAudit.failed_ts);assert.equal(o.pre_analysis_failure.native_daily_aggregate.unknown_operations,1);assert.equal(o.pre_analysis_failure.d1_attempt_usage.attempted_statements,0);
 const b=auditProductionArtifact({output:o,expected_head:head});assert.equal(b.exact_SENT+b.actual_ENTRY,0);assert.equal(b.market_conditions_evaluated,false);assert.equal(b.attempt_usage.total_rows_read,0);
});
test('actual CLI binds current artifact and proves zero native reprobes with network disabled',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'report2-day-guard-'));
 try{
  fs.mkdirSync(path.join(root,'checkpoints'));fs.copyFileSync('checkpoints/ACTUAL_AUTOMATIC_PRODUCTION_ARTIFACT_AUDIT_20261009.json',path.join(root,'checkpoints/ACTUAL_AUTOMATIC_PRODUCTION_ARTIFACT_AUDIT_20261009.json'));fs.copyFileSync(proof.retained,path.join(root,proof.retained));
  const head='a'.repeat(40),out=path.join(root,'github-output'),text=execFileSync(process.execPath,['--import','./current-generation/tests/early-evidence-repair/no-network.mjs','tools/known-d1-day-guard.mjs',root],{env:{...process.env,GITHUB_SHA:head,GITHUB_RUN_ID:'12345',REPORT2_CURRENT_GENERATION:args.generation,GITHUB_OUTPUT:out}}).toString(),g=JSON.parse(text);
  assert.equal(g.blocked,new Date().toISOString().slice(0,10)==='2026-10-09');assert.match(fs.readFileSync(out,'utf8'),new RegExp('blocked='+g.blocked));
  if(g.blocked){const o=JSON.parse(fs.readFileSync(path.join(root,'runtime/report2-run-result.json')));assert.equal(o.head,head);assert.equal(o.run_id,'12345');assert.equal(o.pre_analysis_failure.d1_attempt_usage.attempted_statements,0);assert.equal(auditProductionArtifact({output:o,expected_head:head}).exact_SENT,0);}
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
