import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  REPORT2_RUNTIME_SOURCE_ALLOWLIST,
  REPORT2_DENYLIST,
  isReport2RuntimeSourceAllowed,
  sourcePolicyDecision,
} from '../src/report2-source-policy.mjs';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const runtimeFiles = [
  'src/public-evidence-adapters.mjs',
  'src/full-evidence-shadow-model.mjs',
  'src/worker.js',
];

// Current autonomous source literals must remain in the project runtime allowlist.
const expectedRuntimeSources = [
  'HTX_OFFICIAL_VIA_REPORT2_HUB',
  'Bybit Public V5',
  'OKX Public V5',
  'Binance USD-M Public',
  'OKX Spot Public V5',
  'EXTERNAL_EVIDENCE_REQUIRED',
  'HTX_TIMING_EXISTING_ONLY',
  'ByKaranteli Smart Money Public API',
];
for (const source of expectedRuntimeSources) {
  assert.equal(isReport2RuntimeSourceAllowed(source), true, `runtime source must be allowlisted: ${source}`);
}
assert.deepEqual([...REPORT2_RUNTIME_SOURCE_ALLOWLIST].sort(), expectedRuntimeSources.sort());

// Unknown/new plugins are denied by default.
assert.deepEqual(sourcePolicyDecision('Some New Plugin'), {
  allowed: false,
  reason: 'SOURCE_NOT_ALLOWLISTED',
  project_scope: 'MY_REPORT_2',
});

// Cross-project tools are explicitly denied.
for (const denied of REPORT2_DENYLIST) {
  const d = sourcePolicyDecision(denied);
  assert.equal(d.allowed, false, `${denied} must not be available to Report 2`);
  assert.equal(d.reason, 'CROSS_PROJECT_SOURCE_DENIED');
}
assert.equal(sourcePolicyDecision('TinyFish').allowed, false);

// Runtime source code must not reference denied cross-project tools.
for (const rel of runtimeFiles) {
  const text = fs.readFileSync(path.join(root, rel), 'utf8');
  for (const denied of REPORT2_DENYLIST) {
    const escaped = denied.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const exactToken = new RegExp(`(^|[^A-Za-z0-9_.-])${escaped}([^A-Za-z0-9_.-]|$)`, 'u');
    assert.equal(exactToken.test(text), false, `${rel} must not reference denied cross-project source ${denied}`);
  }
}

console.log(JSON.stringify({
  ok: true,
  suite: 'report2-source-isolation',
  policy: 'DENY_BY_DEFAULT',
  runtime_sources: [...REPORT2_RUNTIME_SOURCE_ALLOWLIST],
  denied_cross_project_sources: [...REPORT2_DENYLIST],
  tinyfish_allowed: false,
}, null, 2));
