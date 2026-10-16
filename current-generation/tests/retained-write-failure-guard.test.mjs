import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {evaluateRetainedWriteFailureGuard,loadRetainedWriteFailureGuard,buildRetainedWriteFailureOutput} from '../../tools/retained-write-failure-guard.mjs';
import {auditProductionArtifact} from '../../tools/production-artifact-outcome.mjs';
const manifest=JSON.parse(fs.readFileSync('checkpoints/CURRENT_RETAINED_NATIVE_WRITE_FAILURE_GUARD_20261016.json'));
const read=d=>JSON.parse(gunzipSync(fs.readFileSync(d.path)));
const args={manifest,report:read(manifest.source.report),delivery:read(manifest.source.delivery),relocation:JSON.parse(fs.readFileSync(manifest.last_verified_relocation.proof)),now_ts:Date.parse('2026-10-16T03:00:00Z'),generation:manifest.generation};
const hash=b=>createHash('sha256').update(b).digest('hex');
const clone=v=>structuredClone(v);
test('exact post-relocation failure reuses its native unknown writes without new scans, SQL or sends',()=>{
 const g=evaluateRetainedWriteFailureGuard(args);assert.equal(g.blocked,true);assert.equal(g.original_refusal.cloud_run,38840064503);assert.equal(g.original_refusal.unknown_operations,3);assert.equal(g.original_refusal.total_rows_read,null);assert.equal(g.native_daily_aggregate,null);assert.equal(g.exchange_limit_exhaustion_claimed,false);assert.equal(g.current_capacity_inferred,false);assert.equal(g.sourceHTTP+g.D1+g.Telegram,0);
});
test('UTC rollover or later exact measured relocation restores original native admission, never resets usage',()=>{
 assert.equal(evaluateRetainedWriteFailureGuard({...args,now_ts:Date.parse('2026-10-17T00:00:00Z')}).blocked,false);
 const relocated=clone(args.relocation);relocated.completed_ts=args.report.post_analysis_control_failure.failed_ts+1;
 const result=evaluateRetainedWriteFailureGuard({...args,relocation:relocated});assert.equal(result.blocked,false);assert.equal(result.reason,'LATER_EXACT_RELOCATION_REQUIRES_NATIVE_ADMISSION');assert.equal(result.D1,0);
 for(const change of [{physical_bytes_reclaimed:0},{canonical_rows_modified:0},{native_readbacks:[]},{D1:{unknown_ops:1}},{completed_ts:args.now_ts+1},{native_preflight:[]}])assert.equal(evaluateRetainedWriteFailureGuard({...args,relocation:{...relocated,...change}}).blocked,true);
});
test('partial successes, current SENT, mismatched identity, future clocks or other failures cannot suppress a report',()=>{
 for(const mutate of [a=>a.report.candidates.push({contract:'FIL-USDT'}),a=>a.report.canonical_persistence_audit.present_candidate_count=1,a=>a.report.head='a'.repeat(40),a=>a.report.post_analysis_control_failure.failed_ts=a.now_ts+1,a=>a.report.post_analysis_control_failure.d1_attempt_usage.unknown_operations=0,a=>a.report.post_analysis_control_failure.unmeasured_operation_receipts[0].http_status=429,a=>a.delivery.cases.push({exact_SENT:true}),a=>a.delivery.run_id='foreign',a=>a.generation='old']){
  const a=clone(args);mutate(a);assert.equal(evaluateRetainedWriteFailureGuard(a).blocked,false);
 }
});
test('current refusal preserves original unknown cost separately from zero current activity and never claims a daily aggregate',()=>{
 const g=evaluateRetainedWriteFailureGuard(args),head='a'.repeat(40),o=buildRetainedWriteFailureOutput({guard:g,head,run_id:'1001',generation:args.generation,now_ts:args.now_ts});
 assert.equal(o.status,'NOT_CLOSED');assert.deepEqual(o.candidates,[]);assert.equal(o.pre_analysis_failure.d1_attempt_usage.attempted_statements,0);assert.equal(o.pre_analysis_failure.retained_refusal_source.unknown_operations,3);assert.equal(o.pre_analysis_failure.retained_refusal_source.total_rows_read,null);assert.equal(o.pre_analysis_failure.native_daily_aggregate,null);assert.equal(o.pre_analysis_failure.entry_authorized,false);
 const audited=auditProductionArtifact({output:o,expected_head:head});assert.equal(audited.actual_ENTRY+audited.exact_SENT,0);assert.equal(audited.market_conditions_evaluated,false);assert.equal(audited.native_daily_aggregate,null);
 assert.throws(()=>buildRetainedWriteFailureOutput({guard:g,head,run_id:'1001',generation:args.generation,now_ts:Date.parse('2026-10-17T00:00:00Z')}),/EXACT_CURRENT_WRITE_REFUSAL_RUN_REQUIRED/);
});
function temporaryRoot(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'report2-retained-write-'));
 for(const p of ['checkpoints/CURRENT_RETAINED_NATIVE_WRITE_FAILURE_GUARD_20261016.json',manifest.source.report.path,manifest.source.delivery.path,manifest.last_verified_relocation.proof,'checkpoints/CURRENT_PROJECT_STATUS.json']){fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.copyFileSync(p,path.join(root,p));}
 return root;
}
test('actual retained files require both compressed and original hashes before suppressing native work',()=>{
 const root=temporaryRoot();try{
  assert.equal(loadRetainedWriteFailureGuard({root,now_ts:args.now_ts,generation:args.generation}).blocked,true);
  const file=path.join(root,manifest.source.report.path),saved=fs.readFileSync(file);fs.writeFileSync(file,Buffer.concat([saved,Buffer.from('changed')]));assert.equal(loadRetainedWriteFailureGuard({root,now_ts:args.now_ts,generation:args.generation}).blocked,false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('a later remediation pointer must match the exact native proof bytes and own run',()=>{
 const root=temporaryRoot();try{
  const native=clone(args.relocation);native.completed_ts=args.report.post_analysis_control_failure.failed_ts+1;
  const p='checkpoints/after-failure-native.json',raw=Buffer.from(JSON.stringify(native));fs.writeFileSync(path.join(root,p),raw);
  const statusFile=path.join(root,'checkpoints/CURRENT_PROJECT_STATUS.json'),s=JSON.parse(fs.readFileSync(statusFile));s.active_working_state.latest_native_relocation={run:native.run,proof:p,proof_raw_sha256:hash(raw)};fs.writeFileSync(statusFile,JSON.stringify(s));
  assert.equal(loadRetainedWriteFailureGuard({root,now_ts:args.now_ts,generation:args.generation}).blocked,false);
  fs.appendFileSync(path.join(root,p),'\n');assert.equal(loadRetainedWriteFailureGuard({root,now_ts:args.now_ts,generation:args.generation}).blocked,true);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('actual existing CLI consumes current retained evidence without network and keeps scheduled scope',()=>{
 const root=temporaryRoot();try{
  const out=path.join(root,'output'),text=execFileSync(process.execPath,['--import','./current-generation/tests/early-evidence-repair/no-network.mjs','tools/known-d1-day-guard.mjs',root],{env:{...process.env,REPORT2_CURRENT_GENERATION:args.generation,GITHUB_SHA:'a'.repeat(40),GITHUB_RUN_ID:'1002',GITHUB_OUTPUT:out}}).toString(),g=JSON.parse(text);
  const expected=new Date().toISOString().slice(0,10)==='2026-10-16';assert.equal(g.blocked,expected);assert.match(fs.readFileSync(out,'utf8'),new RegExp('blocked='+expected));if(expected){const report=JSON.parse(fs.readFileSync(path.join(root,'runtime/report2-run-result.json')));assert.equal(report.run_id,'1002');assert.equal(report.pre_analysis_failure.d1_attempt_usage.attempted_statements,0);assert.equal(report.pre_analysis_failure.retained_refusal_source.cloud_run,38840064503);}
  const workflow=fs.readFileSync('.github/workflows/report2.yml','utf8');assert.match(workflow,/name: Reuse verified same-day unknown D1 cost refusal without native reprobe\n\s+if: \$\{\{ github.event_name == 'schedule' \|\| inputs.scheduled_recovery_run == true \}\}/);assert.match(workflow,/steps.known_day_guard.outputs.blocked != 'true'/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
