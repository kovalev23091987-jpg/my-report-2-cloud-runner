import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../src/opportunity-intelligence-engine.mjs',import.meta.url),'utf8');
test('Opportunity Intelligence consumes exact closed-minute decomposition',()=>{
  assert.match(source,/buildClosedMinuteDecomposition/);
  assert.match(source,/minute_decomposition:\s*minuteDecomposition/);
  assert.match(source,/early_anomaly_classification:/);
  assert.match(source,/three_minute_bars:/);
  assert.match(source,/classification_allowed === true/);
});
