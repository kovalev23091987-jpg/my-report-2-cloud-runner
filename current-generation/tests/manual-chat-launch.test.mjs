import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow=fs.readFileSync(new URL('../../.github/workflows/report2.yml',import.meta.url),'utf8');
const enqueue=fs.readFileSync(new URL('../../runner/enqueue-manual-command.mjs',import.meta.url),'utf8');
const runner=fs.readFileSync(new URL('../files/runner-main.mjs',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../files/src/worker.js',import.meta.url),'utf8');

test('ordinary chat has one file-scoped launch path bound to main',()=>{
 assert.match(workflow,/push:\s*\n\s*branches:\s*\n\s*- main\s*\n\s*paths:\s*\n\s*- "manual-requests\/run\.json"/u);
 assert.match(workflow,/github\.event_name == 'push' \|\| \(github\.event_name == 'workflow_dispatch'/u);
 assert.match(workflow,/REPORT2_RUN_SOURCE: \$\{\{ github\.event_name == 'schedule' && 'schedule' \|\| 'manual'/u);
 assert.match(workflow,/needs\.enqueue-manual-command\.outputs\.command/u);
 assert.match(workflow,/startsWith\(github\.event\.head_commit\.message, '\[manual-request\]'\)/u);
 assert.match(workflow,/!contains\(github\.event\.head_commit\.message, '\[public-collector-release\]'\)/u);
});

test('file launch is fail-closed on authorization and exact generation',()=>{
 assert.match(enqueue,/request\?\.authorized!==true/u);
 assert.match(enqueue,/REPORT2_CURRENT_GENERATION\.json/u);
 assert.match(enqueue,/pointer\?\.latest_only!==true/u);
 assert.match(enqueue,/requestedGeneration!=='CURRENT'/u);
 assert.match(enqueue,/MANUAL_REQUEST_GENERATION_MISMATCH/u);
 assert.match(enqueue,/MANUAL_REQUEST_EMPTY/u);
 assert.match(enqueue,/GITHUB_CONTENTS_TRIGGER/u);
});

test('every successful run emits a canonical artifact instead of a chat reconstruction',()=>{
 assert.match(runner,/my-report-2-canonical-run-output-v1/u);
 assert.match(runner,/report2-run-result\.json/u);
 assert.match(workflow,/name: report2-run-result/u);
 assert.match(runner,/alternative_manual_recalculation:false/u);
 assert.match(runner,/const checkedOutput=enforceManualBlockCoverage\(output\)/u);
 assert.match(runner,/checkedOutput\.report_text=formatManualRunSummary\(checkedOutput\)/u);
 assert.match(runner,/row\.manual_text\|\|presentationInputs\?\.manual_text\|\|null/u);
 assert.match(runner,/saved_canonical_retrieval=true/u);
 assert.match(runner,/RUN_ID=/u);
});

test('low-priority prospective statistics cannot cancel an otherwise complete manual report when capacity is reserved elsewhere',()=>{
 assert.match(runner,/r820ManualNonFatalStatuses=new Set\(\["CLOSED","CAPACITY_DEFERRED_FAIL_CLOSED","BUDGET_ENVELOPE_EXCEEDED_FAIL_CLOSED","DEFERRED_LOW_PRIORITY_CADENCE","DEFERRED_BUDGET_ADMISSION"\]\)/u);
 assert.match(runner,/!r820ManualNonFatalStatuses\.has\(r820ProspectiveValidationSidecar\?\.status\)/u);
});

test('full manual report reserves its deep check for a strict-17 registry asset',()=>{
 assert.match(runner,/REPORT2_MANUAL_MODE=expectedManualMode/u);
 assert.match(runner,/REPORT2_STRICT17_ELIGIBLE_CONTRACTS/u);
 assert.match(runner,/coinpaprika_id&&row\?\.sector_tag\)\|\|\(row\?\.coingecko_id&&row\?\.coingecko_category_id/u);
 assert.match(worker,/MANUAL_STRICT17_AUDIT/u);
 assert.match(worker,/strict17_manual_audit:true/u);
 assert.match(worker,/NEUTRAL_MANUAL_AUDIT/u);
 assert.match(worker,/rawAuditCandidate/u);
 assert.match(worker,/require_exact_contract:true,required_contract:contract/u);
 assert.match(worker,/REPORT2_MANUAL_MODE\|\|''\)\.toUpperCase\(\)==='FULL_MANUAL'\s*\n\s*\? 0/u);
});

test('N10 closes from completed technical inputs without requiring an entry signal',()=>{
 assert.match(worker,/technicalPipelineStates=\[futures\?\.execution_status,trajectory\?\.execution_status\]/u);
 assert.match(worker,/technicalPipelineStates\.every\(value=>value==='FULFILLED'\).*htxObservationReferencePrice\?\.status==='CLOSED'/u);
});
