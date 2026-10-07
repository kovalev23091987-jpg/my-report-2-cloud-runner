import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {proveTwoCandidateBudget} from './files/src/two-candidate-policy.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(here,'..');
const expectedWorker='1a3bdbcb04b77ab07beb6611145a4feffac18e39041f975fa49aeece0ed0fc73';
const run=(args,{cwd=repo}={})=>{
 const result=spawnSync(process.execPath,args,{cwd,encoding:'utf8',stdio:'pipe'});
 if(result.status!==0)throw new Error(`FAILED node ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
 return result.stdout.trim();
};
const checks=[
 '../runner/current-runtime-binding.mjs',
 'runtime-policy-patches.mjs','files/src/telegram-delivery-receipt.mjs',
 '../runner/r8-20-prospective-validation-sidecar.mjs',
 '../audit-fixes/t16/run-metadata-sources-smoke.mjs',
 '../audit-fixes/t16/run-official-feed-smoke.mjs',
 '../audit-fixes/t16/run-lido-snapshot-smoke.mjs',
 '../audit-fixes/t16/run-lighter-native-smoke.mjs',
 '../audit-fixes/t16/run-gmx-native-smoke.mjs',
 '../audit-fixes/t16/run-gtrade-native-smoke.mjs',
 '../audit-fixes/t16/run-blockscout-index-smoke.mjs',
 'files/src/two-candidate-policy.mjs','files/src/bounded-hot-maintenance.mjs','files/src/htx-asset-identity.mjs','files/src/coinpaprika-htx-identity.mjs','files/byk-quota-budget.mjs','files/runner-main.mjs','files/src/worker.js','files/src/htx-signed-tape.mjs','files/src/htx-trade-json.mjs','files/src/verified-futures-flow-binding.mjs','files/src/htx-volume-profile.mjs','files/src/cross-venue-volume-profile.mjs','files/src/htx-volume-profile-collector.mjs',
 'files/src/official-source-registry.mjs','files/src/htx-contract-key.mjs','files/src/htx-crypto-universe.mjs','files/src/provider-reference-cache.mjs','files/src/observation-prepublication-recovery.mjs','files/src/v3-telegram-runtime.mjs','files/src/gate-official-asset-binding.mjs','files/src/inherited-fact-contract.mjs',
 'files/src/user-approved-publication-policy.mjs','files/src/entry-area-rule-v2.mjs','files/src/tz101-scenario-plan.mjs','files/src/tz101-cost-assessment.mjs','files/src/technical-move-potential.mjs',
 'files/src/execution-report-context.mjs','files/src/upstream-proof-utils.mjs','files/src/full-evidence-contract.mjs','files/src/block-decision-use-audit.mjs','files/src/block-score-policy.mjs','files/src/block-weight-calibration.mjs','files/src/manual-run-summary.mjs','files/src/future-liquidation-map-source.mjs',
 'files/src/source-role-registry.mjs','files/src/source-role-consumer.mjs',
 'files/src/opportunity-intelligence-engine.mjs','files/src/prospective-opportunity-view.mjs','files/src/canonical-runtime-adapter.mjs','files/src/observation-technical-range.mjs','files/src/canonical-publication.mjs','files/src/idea-basis-facts.mjs','files/src/telegram-plain-facts.mjs','files/src/byk-tracked-future-map.mjs','files/src/pump-liquidation-zones.mjs','files/src/htx-source-backed-liquidation-model.mjs','files/src/liquidation-source-weighting.mjs','files/src/cross-exchange-risk-context.mjs','files/src/gate-liquidation-history.mjs','files/src/htx-realized-liquidations.mjs','files/src/liquidation-source-chain.mjs','files/src/coinlobster-future-model.mjs','files/src/liquidation-candidate-queue.mjs','files/src/liquidation-outcome-calibration.mjs','files/src/market-contracts.mjs','files/src/candidate-task-queue.mjs','files/src/durable-command-queue.mjs','files/src/evidence-v2.mjs','files/src/evidence-source-adapters.mjs','files/src/evidence-source-store.mjs','files/src/htx-public-risk-evidence.mjs','files/src/macro-calendar-evidence.mjs','files/src/wikimedia-attention-context.mjs','files/src/coinmetrics-supply-context.mjs','files/src/delta-options-evidence.mjs','files/src/deribit-option-risk-context.mjs','files/src/deribit-alt-options-evidence.mjs','files/src/chain-supply-evidence.mjs','files/src/htx-large-trades-evidence.mjs','files/src/coinpaprika-sector-evidence.mjs','files/src/coingecko-sector-evidence.mjs','files/src/sector-context.mjs','files/src/block-result-context.mjs','files/src/finalized-chain-events.mjs','files/src/native-evm-finalized-context.mjs','files/src/sourcify-abi-evidence.mjs','files/src/bluesky-attention-evidence.mjs','files/src/snapshot-governance-evidence.mjs','files/src/official-events-evidence.mjs','files/src/htx-official-announcements-evidence.mjs','files/src/official-token-schedule.mjs','files/src/technical-plan-context.mjs','files/src/solana-native-supply.mjs','files/src/native-ledger-supply.mjs','files/src/xrpl-native-payments.mjs','files/src/stellar-primary-supply.mjs','files/src/github-official-releases.mjs','files/src/htx-technical-structure.mjs','files/src/gdelt-official-discovery.mjs','files/src/blockscout-index-evidence.mjs','files/src/candidate-evidence-v2-runtime.mjs','files/src/unified-budget.mjs',
 'files/src/early-wave-continuity.mjs',
 'files/src/canonical-display.mjs','files/src/native-liquidation-guard.mjs','files/src/reason-registry.mjs',
 'files/src/manual-report-formatter.mjs','files/src/telegram-compact-formatter.mjs',
 'files/src/global-market-context.mjs','files/src/supplemental-source-policy.mjs',
 'files/src/supplemental-score-evidence.mjs','files/src/schedule-quota-calculator.mjs',
 'files/src/v3-adaptive-budget.mjs',
 'files/src/v3-pipeline-health-sidecar.mjs',
 'files/src/specialist-candidate-context.mjs','files/src/supplemental-candidate-context.mjs','files/src/candidate-source-routing.mjs','files/src/oxarchive-cost-probe.mjs',
 'files/src/dynamic-liquidation-panel.mjs',
 'files/src/market-history-reader.mjs','files/src/deep-candidate-order.mjs','files/src/discovery-candidate-score.mjs','files/src/provider-minute-ledger.mjs','files/src/prospective-delivery-cohort.mjs',
 'files/src/stage392-proof-runtime.mjs','files/src/tz101-execution-facts.mjs','files/src/full-evidence-shadow-model.mjs',
 'files/src/liquidation-command-router.mjs',
 'files/src/publication-reconciler.mjs','files/src/bound-telegram-delivery-sidecar.mjs','files/src/exact-saved-run-telegram.mjs',
 'files/src/liquidation-extension/runner-extension.mjs','files/src/liquidation-extension/htx-liquidation-route.mjs',
 'files/src/liquidation-extension/gtrade-position-routing.mjs','files/src/liquidation-extension/combined-runner-service.mjs','files/src/liquidation-extension/native-verification.mjs',
 'files/src/liquidation-extension/native-liquidation-guard.mjs',
 'files/src/liquidation-extension/lighter-runtime-collector.mjs','files/src/liquidation-extension/gmx-runtime-collector.mjs','files/src/liquidation-extension/scoped-provider-runtime-bridge.mjs',
 'files/src/liquidation-extension/install-source-allowances.mjs',
 'files/src/liquidation-extension/dydx-runtime-collector.mjs','files/src/liquidation-extension/dydx-block-account-discovery.mjs','files/src/liquidation-extension/dydx-pinned-conditional-levels.mjs','files/src/liquidation-extension/venue-catalog-cache.mjs','files/src/liquidation-extension/native-wallet-routing.mjs','files/src/liquidation-extension/official-trade-account-discovery.mjs','files/src/observation-source-role-audit.mjs',
];
for(const rel of checks)run(['--check',path.join(here,rel)]);
const tests=fs.readdirSync(path.join(here,'tests')).filter(x=>x.endsWith('.test.mjs')).sort().map(x=>path.join(here,'tests',x));
run(['--test',...tests]);
const generation=JSON.parse(fs.readFileSync(path.join(here,'GENERATION.json'),'utf8'));
if(generation.schedule_minutes!==20||generation.scheduled_runs_per_day!==72||generation.manual_runs_reserved_per_day!==8||generation.burst_deep_checks_reserved_per_day!==3||generation.worst_case_31_day_requests_with_eight_manual_runs_daily!==13330||generation.scheduled_plus_burst_31_day_requests!==11625)throw Error('GENERATION_QUOTA_MATH_MISMATCH');
const sourceRuntime=process.argv[2]?path.resolve(process.argv[2]):null;
let overlay=null;
if(sourceRuntime){
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'report2-current-generation-'));
 const runtime=path.join(temp,'runtime');
 fs.cpSync(sourceRuntime,runtime,{recursive:true});
 overlay=JSON.parse(run([path.join(here,'apply-runtime-overlay.mjs'),runtime]));
 const worker=fs.readFileSync(path.join(runtime,'src/worker.js'));
 const actual=createHash('sha256').update(worker).digest('hex');
 if(actual!==expectedWorker||overlay.worker_sha256!==expectedWorker)throw Error(`OVERLAY_WORKER_HASH_MISMATCH:${actual}`);
 if(!fs.existsSync(path.join(runtime,'byk-quota-budget.mjs')))throw Error('OVERLAY_QUOTA_MODULE_MISSING');
 run(['--check',path.join(runtime,'src/deep-candidate-order.mjs')]);
 run(['--check',path.join(runtime,'src/discovery-candidate-score.mjs')]);
 for(const rel of ['runner-main.mjs','byk-quota-budget.mjs','src/worker.js','src/user-approved-publication-policy.mjs','src/entry-area-rule-v2.mjs','src/tz101-scenario-plan.mjs','src/tz101-cost-assessment.mjs','src/technical-move-potential.mjs','src/canonical-display.mjs','src/native-liquidation-guard.mjs','src/reason-registry.mjs','src/manual-report-formatter.mjs','src/telegram-compact-formatter.mjs','src/observation-prepublication-recovery.mjs','src/v3-telegram-runtime.mjs','src/gate-official-asset-binding.mjs','src/inherited-fact-contract.mjs','src/global-market-context.mjs','src/supplemental-source-policy.mjs','src/supplemental-score-evidence.mjs','src/schedule-quota-calculator.mjs','src/v3-adaptive-budget.mjs','src/v3-pipeline-health-sidecar.mjs','src/supplemental-candidate-context.mjs','src/candidate-source-routing.mjs','src/official-source-registry.mjs','src/dynamic-liquidation-panel.mjs','src/liquidation-source-weighting.mjs','src/cross-exchange-risk-context.mjs','src/gate-liquidation-history.mjs','src/htx-realized-liquidations.mjs','src/liquidation-source-chain.mjs','src/liquidation-futures-coverage.mjs','src/coinlobster-future-model.mjs','src/htx-source-backed-liquidation-model.mjs','src/liquidation-candidate-queue.mjs','src/liquidation-outcome-calibration.mjs','src/evidence-v2.mjs','src/evidence-source-adapters.mjs','src/evidence-source-store.mjs','src/market-history-reader.mjs','src/discovery-candidate-score.mjs','src/provider-minute-ledger.mjs','src/prospective-delivery-cohort.mjs','src/stage392-proof-runtime.mjs','src/tz101-execution-facts.mjs','src/full-evidence-shadow-model.mjs','src/htx-public-risk-evidence.mjs','src/macro-calendar-evidence.mjs','src/wikimedia-attention-context.mjs','src/coinmetrics-supply-context.mjs','src/delta-options-evidence.mjs','src/deribit-option-risk-context.mjs','src/deribit-alt-options-evidence.mjs','src/chain-supply-evidence.mjs','src/htx-signed-tape.mjs','src/htx-large-trades-evidence.mjs','src/coinpaprika-sector-evidence.mjs','src/coinpaprika-htx-identity.mjs','src/coingecko-sector-evidence.mjs','src/sector-context.mjs','src/finalized-chain-events.mjs','src/native-evm-finalized-context.mjs','src/sourcify-abi-evidence.mjs','src/bluesky-attention-evidence.mjs','src/snapshot-governance-evidence.mjs','src/official-events-evidence.mjs','src/htx-official-announcements-evidence.mjs','src/gdelt-official-discovery.mjs','src/blockscout-index-evidence.mjs','src/candidate-evidence-v2-runtime.mjs','src/early-wave-continuity.mjs','src/publication-reconciler.mjs','src/bound-telegram-delivery-sidecar.mjs','src/oxarchive-cost-probe.mjs','src/liquidation-extension/combined-runner-service.mjs','src/liquidation-extension/runner-extension.mjs','src/liquidation-extension/native-liquidation-guard.mjs','src/liquidation-extension/lighter-runtime-collector.mjs','src/liquidation-extension/gmx-runtime-collector.mjs','src/liquidation-extension/scoped-provider-runtime-bridge.mjs'])run(['--check',path.join(runtime,rel)]);
 if(!fs.existsSync(path.join(runtime,'official-event-sources.json')))throw Error('OFFICIAL_SOURCE_REGISTRY_MISSING');
 const campaignEngine=fs.readFileSync(path.join(runtime,'src/multi-wave-campaign-engine.mjs'),'utf8');
 if(!campaignEngine.includes('const thresholdPct = measuredBaseMovePct;')||!campaignEngine.includes('if (thresholdPct <= 0) return null;')||!campaignEngine.includes("target_basis: 'PRECOMMITTED_BASE_MEASURED_FAVORABLE_MOVE'"))throw Error('MEASURED_FAVORABLE_MOVE_RUNTIME_POLICY_MISSING');
 run(['--input-type=module','--eval',"await import('./src/manual-report-formatter.mjs'); await import('./src/telegram-compact-formatter.mjs');"],{cwd:runtime});
 run([path.join(here,'tests/approved-entry-path.runtime.mjs'),runtime]);
 run([path.join(here,'tests/approved-entry-performance.runtime.mjs'),runtime]);
 run([path.join(here,'tests/early-observation-state.runtime.mjs'),runtime]);
 run([path.join(here,'tests/public-collector-history-consumer.runtime.mjs'),runtime]);
 run([path.join(here,'tests/prospective-public-history.runtime.mjs'),runtime]);
 run([path.join(here,'tests/decision-timeline.runtime.mjs'),runtime]);
 run([path.join(here,'tests/stage392-persistence-contract.runtime.mjs'),runtime]);
 fs.rmSync(temp,{recursive:true,force:true});
}
if(!proveTwoCandidateBudget().safe)throw Error('TWO_CANDIDATE_QUOTA_UNSAFE');
console.log(JSON.stringify({status:'CURRENT_GENERATION_VALIDATED',generation:generation.generation,tests:'PASS',syntax:'PASS',schedule_minutes:20,scheduled_runs_per_day:72,manual_runs_per_day:8,burst_deep_checks_per_day:3,scheduled_analytics_interval_minutes:40,scheduled_analytics_cycles_per_day:36,full_cycle_candidate_limit:2,worst_case_31_day_requests:13330,overlay:overlay?'PASS':'NOT_REQUESTED'}));

