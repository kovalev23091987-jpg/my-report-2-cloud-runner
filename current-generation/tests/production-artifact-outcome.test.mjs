import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {auditProductionArtifact,auditValidationOnlyArtifact} from '../../tools/production-artifact-outcome.mjs';
import fs from 'node:fs';
const original=JSON.parse(execFileSync('unzip',['-p','checkpoints/natural-refusal-37968252442.zip','report2-run-result.json']));
const run=o=>auditProductionArtifact({output:o,expected_head:original.head});
test('actual original failed production run is admitted as refusal only, with original costs',()=>{
 const a=run(original);assert.equal(a.status,'EXACT_PRE_ANALYSIS_REFUSAL_ARTIFACT_VERIFIED');assert.equal(a.run_id,'37968252442');assert.equal(a.attempt_usage.measured_rows_read_subtotal,564);assert.equal(a.attempt_usage.measured_rows_written_subtotal,1);assert.equal(a.native_daily_aggregate.unknown_operations,1);assert.equal(a.actual_ENTRY,0);assert.equal(a.exact_SENT,0);assert.equal(a.sourceHTTP+a.D1+a.Telegram,0);assert.equal(a.project_complete,false);
});
test('foreign source head or receipt run cannot be joined to refusal',()=>{
 for(const key of ['head','source_run_id']){const o=structuredClone(original);o.pre_analysis_failure[key]='foreign';assert.throws(()=>run(o),/BINDING_REQUIRED/);}
 assert.throws(()=>auditProductionArtifact({output:original,expected_head:'a'.repeat(40)}),/BINDING_REQUIRED/);
});
test('contradictory analysis, candidate, task-write or positive delivery claims refuse',()=>{
 for(const key of ['market_conditions_evaluated','full_analysis_completed','entry_authorized','source_clock_refreshed','task_writes']){const o=structuredClone(original);o.pre_analysis_failure[key]=1;assert.throws(()=>run(o),/BINDING_REQUIRED/);}
 const o=structuredClone(original);o.candidates=[{state:'ENTRY'}];assert.throws(()=>run(o),/BINDING_REQUIRED/);
 assert.throws(()=>auditProductionArtifact({output:original,expected_head:original.head,proof:{cases:[{exact_SENT:true}]}}),/BINDING_REQUIRED/);
});
test('missing or unclosed usage stays unknown and is not converted to zero or refunded',()=>{
 const o=structuredClone(original);o.pre_analysis_failure.d1_attempt_usage.row_totals_closed=false;o.pre_analysis_failure.d1_attempt_usage.measured_rows_read_subtotal='564';delete o.pre_analysis_failure.native_daily_aggregate;
 const a=run(o);assert.equal(a.attempt_usage.total_rows_read,null);assert.equal(a.attempt_usage.measured_rows_read_subtotal,null);assert.equal(a.native_daily_aggregate,null);assert.equal(original.pre_analysis_failure.native_daily_aggregate.unknown_operations,1);
});
test('old artifact without exact delivery or refusal receipt remains unproven',()=>{
 const o=structuredClone(original);delete o.pre_analysis_failure;o.status='CLOSED';assert.equal(run(o).status,'EXACT_DELIVERY_RECEIPT_NOT_AVAILABLE');assert.equal(run(o).exact_SENT,0);
 const p={schema:'SAME_RUN_DELIVERY_PROOF_V1',head:o.head,generation:o.generation,run_id:o.run_id,cases:[]};assert.equal(auditProductionArtifact({output:o,proof:p,expected_head:o.head}).status,'NO_EXACT_SAME_RUN_SENT');
});
const validationReport=JSON.parse(fs.readFileSync('checkpoints/public-source-budget-cloud-38420614605/report2-v13-final-37.json'));
const validationBinding={run:{id:38420614605,event:'workflow_dispatch',conclusion:'success',head_sha:'82fd1ac39e9986b7ae89fb0bd84c38a3d4c79895'},artifact:{id:11826422605,name:'report2-v13-final-37-38420614605',expired:false,digest:'sha256:5c1eb82a0c8631ebb79b878625094f48dd2aa156a78730bf9491946ff1fe4830',workflow_run:{id:38420614605,head_sha:'82fd1ac39e9986b7ae89fb0bd84c38a3d4c79895'}},report:validationReport,digest:'sha256:5c1eb82a0c8631ebb79b878625094f48dd2aa156a78730bf9491946ff1fe4830'};
test('original 37-scenario dry run is classified as validation only with no production or delivery claim',()=>{
 const a=auditValidationOnlyArtifact(validationBinding);assert.equal(a.status,'EXACT_VALIDATION_ONLY_NO_PRODUCTION_REPORT');assert.equal(a.production_report,false);assert.equal(a.exact_SENT+a.actual_ENTRY+a.sourceHTTP+a.D1+a.Telegram,0);
});
test('failed, scheduled, foreign-head, wrong-run or digest-mismatched artifacts cannot bypass production audit',()=>{
 for(const patch of [{run:{...validationBinding.run,event:'schedule'}},{run:{...validationBinding.run,conclusion:'failure'}},{artifact:{...validationBinding.artifact,expired:true}},{artifact:{...validationBinding.artifact,workflow_run:{...validationBinding.artifact.workflow_run,id:1}}},{artifact:{...validationBinding.artifact,workflow_run:{...validationBinding.artifact.workflow_run,head_sha:'a'.repeat(40)}}},{digest:'sha256:'+'a'.repeat(64)}])assert.throws(()=>auditValidationOnlyArtifact({...validationBinding,...patch}),/BINDING_REQUIRED/);
 for(const patch of [{failed:1},{passed:36},{scenarios:validationReport.scenarios.slice(1)},{scenarios:validationReport.scenarios.map((s,i)=>i===0?{...s,status:'FAIL'}:s)}])assert.throws(()=>auditValidationOnlyArtifact({...validationBinding,report:{...validationReport,...patch}}),/PASS_REQUIRED/);
});
