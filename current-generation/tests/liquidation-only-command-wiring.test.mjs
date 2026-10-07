import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('manual Russian command is wired to a bounded liquidation-only runner path',()=>{
  const runner=fs.readFileSync(new URL('../files/runner-main.mjs',import.meta.url),'utf8');
  assert.match(runner,/parseLiquidationCommand\(env\.REPORT2_MANUAL_COMMAND\)/);
  assert.match(runner,/scanLiquidationCandidates\(\{env,max_candidates:5/);
  assert.match(runner,/max_http_per_run:5/);
  assert.match(runner,/full_report_started:false/);
  assert.match(runner,/telegram_started:false/);
  const branch=runner.indexOf('if(commandIntent.matched){');
  const full=runner.indexOf('await worker.scheduled(');
  assert.ok(branch>=0&&full>branch);
  assert.match(runner.slice(branch,full),/LIQUIDATION_ONLY_RESULT/);
  assert.match(runner.slice(branch,full),/dynamic_liquidation_panel:liquidationPanel/);
  assert.match(runner.slice(branch,full),/buildPumpLiquidationZones/);
  assert.match(runner.slice(branch,full),/source_ts:candidate\.source_ts/);
  assert.match(runner.slice(branch,full),/open_interest_value_usdt:candidate\.open_interest_value_usdt/);
  assert.match(runner.slice(branch,full),/turnover_24h_usdt:candidate\.turnover_24h_usdt/);
  assert.match(runner.slice(branch,full),/price_change_pct:candidate\.price_change_pct\?\?\{\}/);
  assert.match(runner.slice(branch,full),/oi_change_pct:candidate\.oi_change_pct\?\?\{\}/);
  assert.match(runner.slice(branch,full),/market_24h:candidate\.market_24h\?\?null/);
  assert.match(runner.slice(branch,full),/price_tick:candidate\.price_tick/);
  assert.match(runner.slice(branch,full),/volume_profile:effectiveVolumeProfile/);
  assert.match(runner.slice(branch,full),/htx_model:liquidationMap\.htx_source_backed_model/);
  assert.match(runner.slice(branch,full),/displayLegacyLiquidations\(liquidationMap,\{policy:liquidationPolicy\}\)/);
  assert.match(runner.slice(branch,full),/liquidation_map:liquidationMap/);
  assert.match(runner.slice(branch,full),/Ограниченная выборка площадок и оценочные зоны источников/);
  assert.match(runner.slice(branch,full),/cross_exchange_risk:crossExchangeRisk/);
  assert.match(runner.slice(branch,full),/liquidation_candidate_queue:liquidationQueueSummary/);
  assert.match(runner.slice(branch,full),/outcome_calibration:/);
  assert.match(runner,/loadFuturesCoverageDatabase/);
  assert.match(runner.slice(branch,full),/candidateCoverage\.eligible/);
  assert.match(runner.slice(branch,full),/allowed_source_ids:candidateCoverage\.source_ids/);
  assert.match(runner.slice(branch,full),/projected_liquidation:0/);
  assert.match(runner.slice(branch,full),/volume_profile:candidateCoverage\.eligible\?3:0,volume_profile_peers:candidateCoverage\.eligible\?4:0,total:candidateCoverage\.eligible\?15:0/);
  assert.match(runner,/LIQUIDATION_ONLY_COVERAGE_UNAVAILABLE/);
  assert.match(runner,/createLiquidationSourceWeightStore/);
  assert.match(runner.slice(branch,full),/return;/);
});

test('GitHub manual input passes the natural-language command into runtime',()=>{
  const workflow=fs.readFileSync(new URL('../../.github/workflows/report2.yml',import.meta.url),'utf8');
  assert.match(workflow,/\n\s+command:\n/);
  assert.match(workflow,/REPORT2_MANUAL_COMMAND: \$\{\{ inputs\.command \|\| '' \}\}/);
  assert.match(workflow,/COINALYZE_API_KEY: \$\{\{ secrets\.COINALYZE_API_KEY \}\}/);
});

test('exact Unicode HTX contract reaches the market scan instead of failing validation',()=>{
  const worker=fs.readFileSync(new URL('../files/src/worker.js',import.meta.url),'utf8');
  assert.match(worker,/\^\[\\p\{L\}\\p\{N\}\]\{1,15\}-USDT\$\/u/);
  assert.doesNotMatch(worker,/\^\[A-Z0-9\]\{2,15\}-USDT\$/);
});

test('explicit Unicode coin field closes liquidation command identity when free text cannot extract it',()=>{
  const runner=fs.readFileSync(new URL('../files/runner-main.mjs',import.meta.url),'utf8');
  assert.match(runner,/parsedCommandIntent\.matched&&!parsedCommandIntent\.contract&&explicitManualContract/);
  assert.match(runner,/mode:'EXACT_COIN_LIQUIDATIONS',contract:explicitManualContract,contract_source:'EXPLICIT_MANUAL_FIELD'/);
});
