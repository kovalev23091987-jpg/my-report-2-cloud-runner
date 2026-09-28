import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow=fs.readFileSync(new URL('../../.github/workflows/report2.yml',import.meta.url),'utf8');
const runner=fs.readFileSync(new URL('../files/runner-main.mjs',import.meta.url),'utf8');

test('K02: disabled execution gates the whole working job before checkout/decrypt',()=>{
  assert.match(workflow,/execution-gate:[\s\S]*outputs:[\s\S]*admitted:/);
  assert.match(workflow,/run-report2:[\s\S]*needs: \[execution-gate, enqueue-manual-command\][\s\S]*if:.*admitted == 'true'/);
  assert.doesNotMatch(workflow,/name: Disabled schedule gate/);
  const runJob=workflow.slice(workflow.indexOf('  run-report2:'));
  const jobGate=runJob.indexOf("needs.execution-gate.outputs.admitted == 'true'");
  assert.ok(jobGate>=0&&jobGate<runJob.indexOf('uses: actions/checkout@v4'));
});

test('K02: runtime preflight precedes decrypt and runner preflight precedes worker/network setup',()=>{
  assert.ok(workflow.indexOf('node runner/preflight-role-gate.mjs')<workflow.indexOf('Decrypt authoritative runtime'));
  assert.ok(runner.indexOf('evaluatePreflight(process.env)')<runner.indexOf('await loadWorker()'));
  assert.ok(runner.indexOf('claimAnalyticsLease(env.DATA_DB')<runner.indexOf('await loadGlobalMarketContext'));
});
