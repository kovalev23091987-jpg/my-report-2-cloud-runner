import fs from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=new URL('../../',import.meta.url),load=p=>fs.readFileSync(new URL(p,root),'utf8');
const manifest=JSON.parse(fs.readFileSync(new URL('./inputs.json',import.meta.url),'utf8'));
let checks=0;
for(const r of manifest.inputs){assert.equal(createHash('sha256').update(load(r.path)).digest('hex'),r.sha256,r.path);checks++;}
const engine=load('current-generation/files/src/opportunity-intelligence-engine.mjs');
const claims=[
 ['past-only baseline',engine,'xs.slice(Math.max(0, index - lookback), index)'],
 ['symmetric unknown direction',engine,'direction_at_event: "NONE"'],
 ['closed adjacency',engine,'candle.ts - history.at(-1).ts === duration'],
 ['no retrospective promotion',engine,'HISTORICAL_BACKFILL_HAS_NO_PRECOMMITTED_FUNNEL_STATE'],
 ['deep persistence bound',engine,'persisted_events_cap_per_deep_check: 1'],
 ['deep outcome bound',engine,'outcome_updates_cap_per_deep_check: 4'],
 ['missing path is retryable',engine,'exact_timestamped_post_event_candles'],
 ['prospective max lag',load('current-generation/files/src/prospective-opportunity-view.mjs'),'MAX_LAG=10*MINUTE'],
 ['descriptive archive',load('cloudflare/free-history/relative-pattern.mjs'),'report_ready:false'],
 ['bounded history read',load('cloudflare/free-history/history-read.mjs'),'to_hour-from_hour>7*24*HOUR'],
 ['precommitted weights',load('current-generation/files/src/block-weight-calibration.mjs'),'present.length>=200&&days>=30&&assets>=20&&long>=50&&short>=50'],
 ['predictive source inactive',load('current-generation/files/src/liquidation-source-weighting.mjs'),"'LEGACY_DISABLED' AS eligibility_protocol"],
 ['sampled extrema scope',load('runner/r8-20-prospective-validation-sidecar.mjs'),"extrema_scope:'OBSERVED_SNAPSHOTS_ONLY'"],
];
for(const [name,s,needle] of claims){assert.ok(s.includes(needle),name);checks++;}
const prior=JSON.parse(load('checkpoints/source-worker-anomaly-source-feasibility-20261018/scope.json'));
assert.equal(prior.findings.actual_CT_BR_normalized_futures_1m_rows,30);checks++;
assert.equal(prior.findings.complete_retained_same_event_futures_spot_pairs,0);checks++;
assert.equal(prior.findings.four_asset_predictive_accuracy,null);checks++;
console.log(JSON.stringify({schema:'ANOMALY_STATIC_AUDIT_VERIFICATION_V1',checks,status:'PASS',runtime_tests_repeated:0,accepted_CT_BR_replay_repeated:false,network:0,production_imports:0}));
