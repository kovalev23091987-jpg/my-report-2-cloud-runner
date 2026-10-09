import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {auditProductionArtifact} from '../../tools/production-artifact-outcome.mjs';
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
