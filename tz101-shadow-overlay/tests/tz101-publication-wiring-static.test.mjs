import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker=fs.readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const runtime=fs.readFileSync(new URL('../src/tz101-publication-runtime.mjs',import.meta.url),'utf8');

test('worker maps optional liquidation context without replacing protected gates',()=>{
  assert.match(worker,/buildTz101LiquidationContext/);
  assert.match(worker,/liquidation_context:\s*publicationLiquidationContext/);
  assert.match(worker,/projected_record:\s*liquidationIntelligence/);
  assert.doesNotMatch(worker,/liquidation_context:\s*null/);
  for(const gate of ['entry_area_rule: null','fee_schedule: null','holding_plan: null'])assert.match(worker,new RegExp(gate.replace(' ','\\s*')));
});

test('publication resolves only one immutable D1 bundle after score eligibility',()=>{
  assert.match(runtime,/score\.score_lower_bound>=70/);
  assert.match(runtime,/loadTz101PublicationInputs/);
  assert.match(runtime,/scoreCanReachPublication&&needsStoredInputs/);
  assert.match(runtime,/resolvedEntryAreaRule/);
  assert.match(runtime,/resolvedFeeSchedule/);
  assert.match(runtime,/resolvedHoldingPlan/);
});
