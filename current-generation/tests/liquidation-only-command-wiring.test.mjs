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
  assert.match(runner.slice(branch,full),/displayLegacyLiquidations\(liquidationMap\)/);
  assert.match(runner.slice(branch,full),/liquidation_map:liquidationMap/);
  assert.match(runner.slice(branch,full),/Фактическая ограниченная выборка площадок/);
  assert.match(runner.slice(branch,full),/cross_exchange_risk:crossExchangeRisk/);
  assert.match(runner.slice(branch,full),/liquidation_candidate_queue:liquidationQueueSummary/);
  assert.match(runner.slice(branch,full),/outcome_calibration:/);
  assert.match(runner.slice(branch,full),/total:8/);
  assert.match(runner,/createLiquidationSourceWeightStore/);
  assert.match(runner.slice(branch,full),/return;/);
});

test('GitHub manual input passes the natural-language command into runtime',()=>{
  const workflow=fs.readFileSync(new URL('../../.github/workflows/report2.yml',import.meta.url),'utf8');
  assert.match(workflow,/\n\s+command:\n/);
  assert.match(workflow,/REPORT2_MANUAL_COMMAND: \$\{\{ inputs\.command \|\| '' \}\}/);
  assert.match(workflow,/COINALYZE_API_KEY: \$\{\{ secrets\.COINALYZE_API_KEY \}\}/);
});
