import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {loadKnownD1DayGuard,buildKnownDayRefusalOutput} from '../../tools/known-d1-day-guard.mjs';
import {auditProductionArtifact} from '../../tools/production-artifact-outcome.mjs';
const pointer='checkpoints/LATEST_VERIFIED_UNKNOWN_D1_DAY_REFUSAL.json',proof=JSON.parse(fs.readFileSync(pointer));
const now=Date.parse('2026-10-18T12:00:00Z'),generation='MY_REPORT_2_CURRENT_20260929_CURRENT_CYCLE_V13_20M';
function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'report2-current-refusal-'));fs.mkdirSync(path.join(root,'checkpoints'));fs.copyFileSync(pointer,path.join(root,pointer));fs.copyFileSync(proof.retained,path.join(root,proof.retained));return root;}
const load=(root,patch={})=>loadKnownD1DayGuard({root,now_ts:now,generation,...patch});
test('actual independently audited UTC18 refusal is reused with15unknown and zero native reprobes',()=>{
 const root=fixture();try{const a=load(root);assert.equal(a.blocked,true);assert.equal(a.original_refusal.run_id,'39101817020');assert.equal(a.native_daily_aggregate.unknown_operations,15);assert.equal(a.proof_pointer,pointer);assert.equal(a.sourceHTTP+a.D1+a.Telegram,0);assert.equal(a.source_clock_refreshed,false);}finally{fs.rmSync(root,{recursive:true,force:true});}
});
for(const [name,mutate] of Object.entries({
 'ZIP digest mismatch':p=>p.audit_artifact_digest='sha256:'+'0'.repeat(64),
 'foreign original head':p=>p.source.source_head='a'.repeat(40),
 'foreign run':p=>p.actual_audit.run_id='1234',
 'invented zero unknown':p=>p.actual_audit.native_daily_aggregate.unknown_operations=0,
 'unbound native cost':p=>p.actual_audit.native_daily_aggregate.measured_rows_read=1,
 'future original receipt':p=>p.actual_audit.failed_ts=now+1,
 'outside checkpoint archive':p=>p.retained='../outside.zip',
}))test(`${name} cannot suppress fresh native admission`,()=>{
 const root=fixture();try{const p=structuredClone(proof);mutate(p);fs.writeFileSync(path.join(root,pointer),JSON.stringify(p));assert.equal(load(root).blocked,false);}finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('UTC rollover never inherits18Oct refusal or grants admission from local midnight',()=>{
 const root=fixture();try{assert.equal(load(root,{now_ts:Date.parse('2026-10-19T00:00:00Z')}).blocked,false);assert.equal(load(root,{now_ts:Date.parse('2026-10-19T00:30:00+03:00')}).blocked,true);assert.equal(load(root,{generation:'OLD'}).blocked,false);}finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('truncated archive fails closed to native admission without SQL or delivery',()=>{
 const root=fixture();try{fs.writeFileSync(path.join(root,proof.retained),'TRUNCATED');assert.equal(load(root).blocked,false);}finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('reused refusal preserves original known costs and unknown without creating a full report or SENT',()=>{
 const root=fixture();try{const guard=load(root),head='a'.repeat(40),o=buildKnownDayRefusalOutput({guard,head,run_id:'12345',generation,now_ts:now}),audit=auditProductionArtifact({output:o,expected_head:head});assert.equal(o.pre_analysis_failure.native_daily_aggregate.measured_rows_read,30745);assert.equal(o.pre_analysis_failure.native_daily_aggregate.unknown_operations,15);assert.equal(audit.attempt_usage.total_rows_read,0);assert.equal(audit.exact_SENT+audit.actual_ENTRY,0);assert.equal(o.pre_analysis_failure.native_admission_rechecked,false);}finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('actual current CLI uses retained audit with network disabled and an exact current-run receipt',()=>{
 const root=fixture();try{const text=execFileSync(process.execPath,['--import','./current-generation/tests/early-evidence-repair/no-network.mjs','tools/known-d1-day-guard.mjs',root],{env:{...process.env,GITHUB_SHA:'a'.repeat(40),GITHUB_RUN_ID:'12345',REPORT2_CURRENT_GENERATION:generation}}).toString(),a=JSON.parse(text);assert.equal(a.blocked,new Date().toISOString().slice(0,10)==='2026-10-18');if(a.blocked){const o=JSON.parse(fs.readFileSync(path.join(root,'runtime/report2-run-result.json')));assert.equal(o.pre_analysis_failure.d1_attempt_usage.attempted_statements,0);assert.equal(o.run_id,'12345');assert.equal(o.pre_analysis_failure.retained_refusal_source.artifact_digest,proof.source.source_artifact_digest);}}finally{fs.rmSync(root,{recursive:true,force:true});}
});
