import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createPublicationRecoveryOrdinarySqlPolicy,PUBLICATION_RECOVERY_ORDINARY_RUN_ID} from './publication-recovery-ordinary-sql-policy.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),a=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
assert.equal(a.status,'ADMITTED_ONE_ORDINARY_ADAPTER_OFFLINE_CASE');assert(Date.now()<a.expires_ts&&a.expires_ts<=a.own_lease.expires_ts);assert.equal(sha(fs.readFileSync(process.argv[1])),a.script_sha256);
const phase=JSON.parse(fs.readFileSync('checkpoints/CLOUD_PHASE_STATE_20261004.json','utf8'));assert.equal(phase.lease.owner,a.own_lease.owner);assert.notEqual(phase.lease.released,true);
for(const[p,h]of Object.entries(a.frozen_files))assert.equal(sha(fs.readFileSync(p)),h,p);
const fd=fs.openSync(a.attempt_file,'wx',0o600),r={schema:'ROOT_PUBLICATION_RECOVERY_ORDINARY_ADAPTER_CASE_V1',state:'ATTEMPTED',evidence_class:'ARTIFICIAL_OFFLINE_ACCEPTANCE_TEST',Node:1,build:0,engine:0,syntax_checks:0,constructors:0,sql_policy_calls:0,market_HTTP:0,native_SQL:0,Cloudflare:0,Telegram:0,old_runtime_controller_cases_replayed:false};
const save=()=>{fs.ftruncateSync(fd,0);fs.writeSync(fd,JSON.stringify(r,null,2)+'\n',0,'utf8');fs.fsyncSync(fd);};save();const realFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error('REAL_HTTP_FORBIDDEN');};
try{
 for(const p of Object.keys(a.frozen_files)){new vm.SourceTextModule(fs.readFileSync(p,'utf8'));r.syntax_checks++;}
 const now=Date.now(),ad={ordinary_lookup_day_utc:'2026-10-30',installation_readiness_ref:'checkpoints/pump-report-20261025/ROOT_PUBLICATION_RECOVERY_INSTALL_READINESS_V1.json',mode:'LOOKUP',run_id:PUBLICATION_RECOVERY_ORDINARY_RUN_ID,native_query_cap:16,implementation_sha256:'dfd7b37b9ce06ba3ce6b7a06ae0f7e17e2fafffc198aaa292185c97d18450452',target_artifact_sha256:'2a1154eeccaa453d96c7b1a471722f8767ae2f71704fb820ccdbc79ceaefcca4'};
 const construct=x=>{r.constructors++;return createPublicationRecoveryOrdinarySqlPolicy(x,now);},sql='INSERT OR IGNORE INTO report2_runner_budget_ledger_shadow(...) AND (?16=0 OR lookup_count<?17)',params=Array(17).fill(0);Object.assign(params,{0:'PUMP:LOOKUP:'+ad.run_id,1:'2026-10-30',2:500,3:30,15:1,16:10});
 const p=construct(ad);r.sql_policy_calls++;const out=p(sql,params);assert.equal(out.sql,sql);assert.deepEqual(out.params,params);assert.equal(out.params[16],10);r.sql_policy_calls++;assert.throws(()=>p(sql,params));
 const cap=construct(ad);r.sql_policy_calls++;const larger=[...params];larger[16]=17;assert.throws(()=>cap(sql,larger));
 for(const fn of [x=>{x.lookup_single_exception={extra_number:17,status:'APPROVED_BY_DIRECT_OWNER'};},x=>{x.ordinary_lookup_day_utc='2026-10-29';},x=>{x.mode='AUTO';},x=>{x.run_id='OTHER';},x=>{x.implementation_sha256='b'.repeat(64);},x=>{x.target_artifact_sha256='c'.repeat(64);},x=>{x.installation_readiness_ref='OLD';}]){const bad=structuredClone(ad);fn(bad);assert.throws(()=>construct(bad));}
 const source=fs.readFileSync('pump-report/operator/publication-recovery-install-quiescence-once.mjs','utf8');assert(source.includes('LOOKUP_ENVELOPE.max_runs_day!==10'));assert(source.includes('maximum_executor_reads!==6'));assert(source.includes('executor_wait_ms!==20000'));assert(source.includes('calls>=16'));assert(source.includes('readPausedExecutorBounded'));
 assert.equal(r.syntax_checks,2);assert.equal(r.constructors,9);assert.equal(r.sql_policy_calls,3);r.state='PASS';r.ordinary_ten_cap_and_original_SQL_unchanged=true;r.dated17_rejected=true;r.artifact_unchanged=true;
}catch(e){r.state='FAILED_NO_AUTO_RETRY';r.error=String(e.stack??e).slice(0,2400);process.exitCode=1;}finally{r.finished_ts=Date.now();save();fs.writeFileSync(a.output,JSON.stringify(r,null,2)+'\n',{flag:'wx',mode:0o600});fs.closeSync(fd);globalThis.fetch=realFetch;}console.log(JSON.stringify(r));
