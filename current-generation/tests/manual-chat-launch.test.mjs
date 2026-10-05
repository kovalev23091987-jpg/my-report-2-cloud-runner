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

test('exact saved-run Telegram is a narrow explicit push marker, not a general manual network gate',()=>{
 assert.match(workflow,/REPORT2_EXACT_SAVED_RUN_TELEGRAM:.*\[telegram-canonical-delivery\]/u);
 assert.match(workflow,/REPORT2_EXACT_SAVED_RUN_ACCEPTANCE_FILE:.*joint-report-functional-acceptance-20261005\.json/u);
 assert.match(workflow,/REPORT2_V3_TELEGRAM_NETWORK_ENABLED:.*\[telegram-canonical-delivery\]/u);
 assert.match(runner,/deliverExactSavedRunTelegram/u);
 assert.match(runner,/EXACT_SAVED_RUN_TELEGRAM_NOT_SENT/u);
 assert.match(runner,/EXACT_SAVED_RUN_ACCEPTANCE_NOT_CLOSED/u);
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

test('full manual report preserves market rank and records the top two',()=>{
 assert.match(runner,/REPORT2_MANUAL_MODE=expectedManualMode/u);
 assert.match(runner,/REPORT2_STRICT17_ELIGIBLE_CONTRACTS/u);
 assert.match(runner,/coinpaprika_id&&row\?\.sector_tag\)\|\|\(row\?\.coingecko_id&&row\?\.coingecko_category_id/u);
 assert.match(worker,/MANUAL_MARKET_RANKED_TOP2/u);
 assert.match(worker,/const ranked=\(discoveryPrefilter\?\.shortlist\|\|\[\]\)/u);
 assert.doesNotMatch(worker,/const ranked=\(postV7DeepPrefilter\?\.shortlist\|\|\[\]\)/u);
 assert.match(worker,/top_two_contracts:ranked\.slice\(0,2\)/u);
 assert.match(worker,/registry_did_not_change_rank:true/u);
 assert.doesNotMatch(worker,/MANUAL_STRICT17_AUDIT/u);
 assert.doesNotMatch(worker,/NEUTRAL_MANUAL_AUDIT/u);
 assert.doesNotMatch(worker,/rawAuditCandidate/u);
 assert.match(worker,/isFreshManualMainAnalysis\(env\?\.REPORT2_MANUAL_MODE\)\s*\n\s*\? 0/u);
});

test('canonical run artifact exposes candidate rank and selected contracts',()=>{
 assert.match(runner,/candidate_selection_audit:env\.REPORT2_CURRENT_CYCLE_SELECTION_AUDIT\|\|null/u);
 assert.match(worker,/qualified_candidates/u);
 assert.match(worker,/deep_check_selected/u);
});

test('manual N10 routes the real snapshot and trajectory through the quality guard without requiring an entry signal',()=>{
 assert.match(worker,/buildHtxPrimaryTechnicalReceipt\(\{contract,futures,trajectory,reference_price:htxObservationReferencePrice,now,route_state:technicalState\}\)/u);
 assert.match(worker,/PRIMARY_TECHNICAL_CONTEXT:primaryTechnicalReceipt/u);
});
