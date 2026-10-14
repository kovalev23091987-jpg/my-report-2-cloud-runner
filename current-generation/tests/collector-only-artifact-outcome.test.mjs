import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {auditCollectorOnlyWorkflow} from '../../tools/production-artifact-outcome.mjs';
const dir='checkpoints/collector-v10-release-38531281231/';
const read=name=>JSON.parse(fs.readFileSync(dir+name,'utf8'));
const original=read('exact-original-job-outcome.json'),release={prepare:read('prepare-proof.json'),deployment:read('deployment-proof.json'),sample:read('first-live-sample-proof.json')};
const binding={...original,release,artifact:{name:'report2-public-collector-release-38531281231',id:11877837697,expired:false,workflow_run:{id:38531281231,head_sha:original.run.head_sha},digest:'sha256:41a2e6482b13e1d5e5f693576211371e3af3c0bd3b3401ca0807eafbee779eba'},digest:'sha256:41a2e6482b13e1d5e5f693576211371e3af3c0bd3b3401ca0807eafbee779eba'};
test('actual collector release with skipped analytics is accepted without an invented report or delivery',()=>{
 const a=auditCollectorOnlyWorkflow(binding);assert.equal(a.status,'EXACT_COLLECTOR_RELEASE_NO_ANALYTICAL_REPORT');assert.equal(a.first_sample_contracts,386);assert.equal(a.collector_deployment_accepted,true);assert.equal(a.production_report,false);assert.equal(a.exact_SENT+a.actual_ENTRY,0);assert.equal(a.original_collector_costs_not_inferred,true);
});
test('collector failure remains a deployment failure and cannot become a successful report',()=>{
 const b=structuredClone(binding);b.run.conclusion='failure';b.jobs.find(x=>x.name==='deploy-public-collector').conclusion='failure';const a=auditCollectorOnlyWorkflow({...b,artifact:null,release:null,digest:null});assert.equal(a.status,'EXACT_COLLECTOR_RELEASE_FAILED_WITHOUT_ANALYTICAL_REPORT');assert.equal(a.collector_deployment_accepted,false);assert.equal(a.exact_SENT+a.actual_ENTRY,0);
});
test('missing, repeated, foreign or running jobs and actual analytics cannot bypass report audit',()=>{
 for(const modify of [b=>b.jobs.pop(),b=>b.jobs[0].run_id++,b=>b.jobs[0].status='in_progress',b=>b.jobs[1].name=b.jobs[0].name,b=>b.jobs.find(x=>x.name==='run-report2').conclusion='success',b=>b.run.event='schedule',b=>b.run.head_branch='foreign']){const b=structuredClone(binding);modify(b);assert.throws(()=>auditCollectorOnlyWorkflow(b));}
});
test('foreign digest, stale sample, lost binding, code mismatch and claimed analytics reject',()=>{
 for(const modify of [b=>b.digest='sha256:'+'a'.repeat(64),b=>b.artifact.workflow_run.head_sha='a'.repeat(40),b=>b.release.sample.bucket-=3600000,b=>b.release.deployment.exact_module_matches=false,b=>b.release.prepare.output_sha256='a'.repeat(64),b=>b.release.sample.analytical_decision=true,b=>b.release.sample.telegram=true,b=>b.release.sample.batch_contracts--]){const b=structuredClone(binding);modify(b);assert.throws(()=>auditCollectorOnlyWorkflow(b));}
});
