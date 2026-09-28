import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {applyRuntimePolicyPatches} from './runtime-policy-patches.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const runtime=path.resolve(process.argv[2]||'runtime');
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const expectedInputs=new Set([
 '940bb12428f320bf248fadd2acd45399af705e144440750973551e5a935f7cc2',
 'c25939859bbe3f02a7f3479d1f0f656b4877c06dd72f18e372e4927289ba5a97'
]);
const input=path.join(runtime,'src/worker.js');
if(!fs.existsSync(input)||!expectedInputs.has(sha(input)))throw Error('CURRENT_GENERATION_INPUT_RUNTIME_MISMATCH');
const files=[
 'runner-main.mjs',
 'byk-quota-budget.mjs',
 'src/worker.js',
 'src/user-approved-publication-policy.mjs',
 'src/entry-area-rule-v2.mjs',
 'src/tz101-scenario-plan.mjs',
 'src/tz101-cost-assessment.mjs',
 'src/technical-move-potential.mjs',
 'src/canonical-display.mjs',
 'src/native-liquidation-guard.mjs',
 'src/reason-registry.mjs',
 'src/pump-liquidation-zones.mjs',
 'src/canonical-runtime-adapter.mjs',
 'src/telegram-compact-formatter.mjs',
 'src/manual-report-formatter.mjs',
 'src/global-market-context.mjs',
 'src/supplemental-source-policy.mjs',
 'src/supplemental-score-evidence.mjs',
 'src/schedule-quota-calculator.mjs',
 'src/v3-adaptive-budget.mjs',
 'src/supplemental-candidate-context.mjs',
 'src/dynamic-liquidation-panel.mjs',
 'src/liquidation-source-weighting.mjs',
 'src/cross-exchange-risk-context.mjs',
 'src/liquidation-candidate-queue.mjs',
 'src/liquidation-outcome-calibration.mjs',
 'src/liquidation-command-router.mjs',
 'src/publication-reconciler.mjs',
 'src/bound-telegram-delivery-sidecar.mjs',
 'src/oxarchive-cost-probe.mjs',
 'src/runtime-control.mjs',
 'src/analytics-lease.mjs',
 'src/unified-budget.mjs',
 'src/run-health.mjs',
 'src/market-snapshot-batch.mjs',
 'src/market-contracts.mjs',
 'src/candidate-task-queue.mjs',
 'src/asset-identity-cache.mjs',
 'src/liquidation-source-plan.mjs',
 'src/analytical-integrity.mjs',
 'src/evidence-v2.mjs',
 'src/evidence-source-adapters.mjs',
 'src/evidence-source-store.mjs',
 'src/htx-public-risk-evidence.mjs',
 'src/macro-calendar-evidence.mjs',
 'src/deribit-alt-options-evidence.mjs',
 'src/chain-supply-evidence.mjs',
 'src/sourcify-abi-evidence.mjs',
 'src/bluesky-attention-evidence.mjs',
 'src/snapshot-governance-evidence.mjs',
 'src/official-events-evidence.mjs',
 'src/gdelt-official-discovery.mjs',
 'src/blockscout-index-evidence.mjs',
 'src/candidate-evidence-v2-runtime.mjs',
 'src/durable-command-queue.mjs',
 'src/strict-delivery-binding.mjs',
 'src/outcome-v2.mjs',
 'src/calibration-v2.mjs',
 'src/liquidation-extension/runner-extension.mjs',
 'src/liquidation-extension/htx-liquidation-route.mjs',
 'src/liquidation-extension/native-verification.mjs',
 'src/liquidation-extension/select-native-account-sample.mjs',
 'src/liquidation-extension/run-source-budget.mjs',
 'src/liquidation-extension/combined-runner-service.mjs',
 'src/liquidation-extension/multi-runner-extension.mjs',
 'src/liquidation-extension/gtrade-runtime-collector.mjs',
 'src/liquidation-extension/gtrade-runtime-bridge.mjs',
 'src/liquidation-extension/gtrade.mjs',
 'src/liquidation-extension/lighter-runtime-collector.mjs',
 'src/liquidation-extension/gmx-runtime-collector.mjs',
 'src/liquidation-extension/scoped-provider-runtime-bridge.mjs',
 'src/liquidation-extension/round2-providers.mjs',
 'src/liquidation-extension/io.mjs',
 'src/liquidation-extension/core.mjs',
 'src/liquidation-extension/providers.mjs',
 'src/liquidation-extension/runtime-bridge.mjs',
 'src/liquidation-extension/native-liquidation-guard.mjs',
 'src/liquidation-extension/d1-source-admission.mjs'
 ,'src/liquidation-extension/install-source-allowances.mjs'
 ,'src/liquidation-extension/venue-catalog-cache.mjs'
];
for(const rel of files){const from=path.join(here,'files',rel),to=path.join(runtime,rel);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to);}
fs.copyFileSync(path.join(here,'../runner/r8-20-prospective-validation-sidecar.mjs'),path.join(runtime,'r8-20-prospective-validation-sidecar.mjs'));
const policyPatches=applyRuntimePolicyPatches(runtime);
console.log(JSON.stringify({status:'CURRENT_GENERATION_APPLIED',generation:'MY_REPORT_2_CURRENT_20260928_INTERNAL_AUDIT_FIXES_V5_20M',worker_sha256:sha(input),schedule_minutes:20,native_liquidation_extension:'SHADOW_ONLY_DECISION_INPUT',policy_patches:policyPatches}));
