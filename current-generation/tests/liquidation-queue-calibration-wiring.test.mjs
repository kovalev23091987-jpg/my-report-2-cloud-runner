import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('runner installs the wave-scoped queue and keeps the one-hour outcome loop in shadow',()=>{
 const runner=fs.readFileSync(new URL('../files/runner-main.mjs',import.meta.url),'utf8');
 for(const pattern of [/createCandidateTaskQueue/,/createLiquidationOutcomeCalibration/,/liquidationQueue\.install\(\)/,/liquidationCalibration\.install\(\)/,/liquidationCalibration\.settle/,/liquidationCalibration\.record/,/liquidationQueue\.enqueue/,/liquidationQueue\.claim/,/liquidationQueue\.complete/])assert.match(runner,pattern);
 assert.doesNotMatch(runner,/createLiquidationCandidateQueue/);
});

test('scheduled queue joins common selection, cannot override recheck/manual, and has bounded starvation protection',()=>{
 const worker=fs.readFileSync(new URL('../files/src/worker.js',import.meta.url),'utf8');
 assert.match(worker,/if\(queuedLiquidationContract&&!dueRecheckContract&&!manualRequestedContract\)/);
 assert.doesNotMatch(worker,/lane:'LIQUIDATION_QUEUE',require_exact_contract:true/);
 assert.match(worker,/starved=attempts>=3/);
 assert.match(worker,/selection_status:'NOT_SELECTED_CAPACITY'/);
 assert.match(worker,/crossExchangeFamilyTurn/);
 assert.match(worker,/!crossExchangeFamilyTurn&&\(manualCoin\|\|queuedCoin/);
 assert.match(worker,/DEFERRED_SHARED_REQUEST_ENVELOPE/);
 assert.match(worker,/predictive_source_health:env\?\.REPORT2_LIQUIDATION_PREDICTIVE_HEALTH/);
 assert.match(worker,/cross_exchange_risk:crossExchangeRiskContext/);
 assert.match(worker,/REPORT2_LIQUIDATION_SIGNAL_RECORD/);
});

test('queue preserves explicit expiration and capacity audit outcomes',()=>{
 const queue=fs.readFileSync(new URL('../files/src/liquidation-candidate-queue.mjs',import.meta.url),'utf8');
 assert.match(queue,/EXPIRED_UNCHECKED/);
 assert.match(queue,/last_result_json/);
});

test('the same canonical full-report path feeds supplemental liquidation evidence to report and Telegram publication',()=>{
 const worker=fs.readFileSync(new URL('../files/src/worker.js',import.meta.url),'utf8');
 const adapter=fs.readFileSync(new URL('../files/src/canonical-runtime-adapter.mjs',import.meta.url),'utf8');
 assert.match(worker,/internal_market_context:internalMarketContext/);
 assert.match(worker,/SUPPLEMENTAL_SCORE_RECEIPT/);
 assert.match(adapter,/buildSupplementalScoreEvidence\(\{direction,internal_market_context,liquidation_panel:liquidationPanel\}\)/);
 assert.match(adapter,/const telegram=formatTelegramCompact\(canonical/);
 assert.match(adapter,/const manual=formatManualReport\(canonical\)/);
});

test('legacy prospective calibration exposes factual readiness without self-promotion',()=>{
 const sidecar=fs.readFileSync(new URL('../../runner/r8-20-prospective-validation-sidecar.mjs',import.meta.url),'utf8');
 assert.match(sidecar,/READINESS_MIN_TRAIN = 80/);
 assert.match(sidecar,/READINESS_MIN_HOLDOUT = 40/);
 assert.match(sidecar,/loadProspectiveReadinessSnapshot/);
 assert.match(sidecar,/data_ready_for_separate_oos_validation/);
 assert.match(sidecar,/validated_out_of_sample: false/);
 assert.match(sidecar,/automatic_weight_tuning: false/);
});
