import {admitTriggeredRecheck} from './src/triggered-entry-recheck.mjs';
import {buildLiquidationSourceAcquisitionAudit} from './src/liquidation-source-acquisition-audit.mjs';
import {saveGTradePositionRouting} from './src/liquidation-extension/gtrade-position-routing.mjs';
import {auditObservationSourceRoles} from './src/observation-source-role-audit.mjs';
import {saveNativeWalletRouting} from './src/liquidation-extension/native-wallet-routing.mjs';
import {saveGTradeRoutingCatalog} from './src/liquidation-extension/native-routing-catalog.mjs';
import {loadBlockWeightPolicy,refreshWeeklyBlockWeightPolicy} from './src/block-weight-calibration.mjs';
import {maintainExpiredProviderCache} from './src/expired-provider-cache-maintenance.mjs';
import {persistCapturedHtxSignedTape,readSavedHtxSignedTape} from './src/htx-signed-tape.mjs';
import {loadExecutionReportSource,auditExecutionReportRendering} from './src/execution-report-context.mjs';
import {recallKpiReadbackMatches} from './src/recall-kpi-readback.mjs';
import {collectTrackedBands,capturedTrackedBands} from './src/byk-tracked-future-map.mjs';
import {captureBykFutureMap,capturedFutureMap,capturedNativeFutureMaps} from './src/future-liquidation-map-source.mjs';
import {collectCoinLobsterFutureModel,formatCoinLobsterFutureLines} from './src/coinlobster-future-model.mjs';
import {collectCrossVenueVolumeProfiles,selectComparableVolumeProfiles} from './src/cross-venue-volume-profile.mjs';
import {collectReadyHtxVolumeProfile} from './src/htx-volume-profile-collector.mjs';
import {applyVolumeProfileToLiquidationPanel,volumeProfileFacts} from './src/htx-volume-profile.mjs';
import {createCombinedLiquidationService} from './src/liquidation-extension/combined-runner-service.mjs';
import {createD1SourceAdmission} from './src/liquidation-extension/d1-source-admission.mjs';
import fs from "node:fs/promises";
import {auditRenderedBlockResults} from './src/block-result-context.mjs';
import {auditCanonicalBlockDecisionUse} from './src/block-decision-use-audit.mjs';
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { RemoteD1Database } from "./report2-d1-adapter.mjs";
import { buildBudgetBlockedTelegramOutput, runTelegramOutputLayer } from "./telegram-output.mjs";
import { INFO_D1_BUDGET } from "./telegram-info-runtime.mjs";
import { deriveRunReservation, loadDailyUsageAggregate, reserveRunBudget, evaluateDailyReservationBudget, evaluateWithinRunReservation, finalizeRunUsage } from "./d1-preaction-budget-guard.mjs";
import { buildR88BurstReservation, buildR88DailyAdmissionView, enforceR88RunBudget } from "./src/v3-adaptive-budget.mjs";
import { classifyZeroTelegram } from "./telegram-zero-reason.mjs";
import { runV3EarlyPersistenceSidecar, V3_EARLY_SIDECAR_BUDGET } from "./src/v3-early-sidecar.mjs";
import { runV3RealizedLiquidationSidecar, V3_REALIZED_LIQUIDATION_SIDECAR_BUDGET } from "./src/v3-realized-liquidation-sidecar.mjs";
import { runV3LiquidationIntelligenceSidecar, V3_LIQUIDATION_SIDECAR_BUDGET } from "./src/v3-liquidation-sidecar.mjs";
import { runV3PipelineHealthSidecar, V3_PIPELINE_HEALTH_SIDECAR_BUDGET } from "./src/v3-pipeline-health-sidecar.mjs";
import { loadCompletedLifecycleHandoffs, runV3TelegramLifecycleSidecar, V3_TELEGRAM_LIFECYCLE_SIDECAR_BUDGET } from "./src/v3-telegram-lifecycle-sidecar.mjs";
import { runV3TelegramDeliverySidecar, V3_TELEGRAM_DELIVERY_SIDECAR_BUDGET } from "./src/v3-telegram-delivery-sidecar.mjs";
import { runBoundTelegramDeliverySidecar, BOUND_TELEGRAM_DELIVERY_BUDGET } from "./src/bound-telegram-delivery-sidecar.mjs";
import { actorOwnsPeriodicAnalytics, claimMaintenanceCadence, completeMaintenanceCadence, maintenanceSucceeded } from "./src/scheduler-control.mjs";
import { runR820ProspectiveValidationSidecar, R820_PROSPECTIVE_VALIDATION_BUDGET, R820_PROSPECTIVE_VALIDATION_VERSION } from "./r8-20-prospective-validation-sidecar.mjs";
import { auditCanonicalCandidateSet, classifyCanonicalRunCompletion, enforceManualBlockCoverage, formatManualRunSummary, formatLiquidationRunSummary, formatStandaloneLiquidationSourceLines } from "./src/manual-run-summary.mjs";
import { installBykQuotaLedger, makeBykReserve } from "./byk-quota-budget.mjs";
import {loadGlobalMarketContext,contextForContract} from './src/global-market-context.mjs';
import {parseSupplementalIdentityRegistry} from './src/supplemental-candidate-context.mjs';
import {runOxArchiveCostProbe,loadOxArchiveReadiness,createOxArchiveCollector} from './src/oxarchive-cost-probe.mjs';
import {installSourceAllowances} from './src/liquidation-extension/install-source-allowances.mjs';
import {addDydxCollectionPermission,saveDydxRouting,loadDydxRouting} from './src/liquidation-extension/dydx-runtime-collector.mjs';
import {loadLiquidationVenueCatalog} from './src/liquidation-extension/venue-catalog-cache.mjs';
import {parseLiquidationCommand} from './src/liquidation-command-router.mjs';
import {attachNativeContext} from './src/liquidation-extension/runtime-bridge.mjs';
import {nativeLiquidationSources} from './src/native-liquidation-guard.mjs';
import {buildDynamicLiquidationPanel} from './src/dynamic-liquidation-panel.mjs';
import {buildPumpLiquidationZones,coinLobsterFutureRows} from './src/pump-liquidation-zones.mjs';
import {displayLegacyLiquidations,liquidationPresentationPolicy} from './src/canonical-display.mjs';
import {createLiquidationSourceWeightStore} from './src/liquidation-source-weighting.mjs';
import {chooseMappedLiquidationFallback} from './src/liquidation-source-plan.mjs';
import {buildLiquidationSourceChain,buildLiquidationFreshnessAudit,formatLiquidationChainSummary} from './src/liquidation-source-chain.mjs';
import {formatLiquidationHistoryFacts} from './src/gate-liquidation-history.mjs';
import {collectCrossExchangeRiskContext,probeLiquidationVenueCoverage} from './src/cross-exchange-risk-context.mjs';
import {createCandidateTaskQueue} from './src/candidate-task-queue.mjs';
import {createLiquidationOutcomeCalibration} from './src/liquidation-outcome-calibration.mjs';
import {evaluatePreflight} from './src/runtime-control.mjs';
import {installRuntimeControl,claimAnalyticsLease,assertAnalyticsFence,renewAnalyticsLease,finishAnalyticsLease} from './src/analytics-lease.mjs';
import {claimCommand,claimNextCommand,completeCommand,deferCommand} from './src/durable-command-queue.mjs';
import {collectCandidateEvidenceV2,finalizeCandidateBlockCoverage} from './src/candidate-evidence-v2-runtime.mjs';
import {createUnifiedHttpBudget,HTTP_LIMITS} from './src/unified-budget.mjs';
import {TWO_CANDIDATE_PLAN,TWO_NODE_HTTP_LIMITS,proveTwoCandidateBudget,deepRuntimeOptions} from './src/two-candidate-policy.mjs';
import {bindGateOfficialAssetIdentity} from './src/gate-official-asset-binding.mjs';
import {collectHtxBoundSupplementalContext} from './src/htx-asset-identity.mjs';
import {compileOfficialSourceRegistry,mergeOfficialAndConfiguredRegistries} from './src/official-source-registry.mjs';
import {installProviderMinuteLedger} from './src/provider-minute-ledger.mjs';
import {runtimeLiquidationCollectionAdmission,loadFuturesCoverageDatabase,futuresLiquidationAdmission,summarizeFuturesCoverage} from './src/liquidation-futures-coverage.mjs';
import {deliverExactSavedRunTelegram,acceptedJointForTelegramRetrieval} from './src/exact-saved-run-telegram.mjs';

const RUNNER_VERSION = "my-report-2-current-generation-v13-current-cycle-20260929";
const nativeFetch = globalThis.fetch.bind(globalThis);
let wrappedFetchInstalled = false;

function envText(name, { required = true } = {}) {
  const value = String(process.env[name] || "").trim();
  if (required && !value) throw new Error(`${name}_REQUIRED`);
  return value;
}
function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
async function sha256File(path) {
  const data = await fs.readFile(path);
  return crypto.createHash("sha256").update(data).digest("hex");
}
function installSourceProxyFetch() {
  if (wrappedFetchInstalled) return;
  globalThis.fetch = async (input, init = {}) => {
    let target;
    try { target = input instanceof Request ? new URL(input.url) : new URL(String(input)); }
    catch { return nativeFetch(input, init); }
    if (target.protocol === "https:" && target.hostname === "bykaranteli.com") {
      const response=await nativeFetch(envText("REPORT2_SOURCE_PROXY_URL"), {
        method: "POST",
        headers: {
          "content-type": "application/json", accept: "application/json",
          authorization: `Bearer ${envText("REPORT2_SOURCE_PROXY_TOKEN")}`,
          "user-agent": "My-Report-2-GitHub-Source-Proxy/4.3",
        },
        body: JSON.stringify({ url: target.toString() }),
        signal: init?.signal ?? (input instanceof Request ? input.signal : undefined),
      });
      if(target.pathname==="/api/liqmap/public"){try{const raw=await response.clone().text();if(Buffer.byteLength(raw)<=8000000)captureBykFutureMap({url:target.toString(),payload:JSON.parse(raw),received_ts:Date.now(),http_status:response.status});}catch{}}
      return response;
    }
    return nativeFetch(input, init);
  };
  wrappedFetchInstalled = true;
}
async function loadWorker() {
  const workerPath = resolve("./src/worker.js");
  const expected = envText("REPORT2_EXPECTED_WORKER_SHA").toLowerCase();
  const actual = await sha256File(workerPath);
  if (actual !== expected) throw new Error(`WORKER_SHA_MISMATCH expected=${expected} actual=${actual}`);
  installSourceProxyFetch();
  const mod = await import(pathToFileURL(workerPath).href + `?run=${Date.now()}`);
  if (!mod?.default || typeof mod.default.scheduled !== "function") throw new Error("AUTHORITATIVE_WORKER_SCHEDULED_HANDLER_MISSING");
  if (typeof mod.scanLiquidationCandidates !== "function") throw new Error("AUTHORITATIVE_WORKER_LIQUIDATION_SCAN_MISSING");
  return { worker: mod.default, scanLiquidationCandidates:mod.scanLiquidationCandidates, liquidationIntelligenceApi:mod.LIQUIDATION_INTELLIGENCE_API, sha: actual };
}
function buildEnv() {
  return {
    DATA_DB: new RemoteD1Database(envText("REPORT2_D1_BRIDGE_URL"), envText("REPORT2_D1_BRIDGE_TOKEN"), { fetchImpl: nativeFetch, timeoutMs: 45_000 }),
    BYKARANTELI_API_KEY: envText("BYKARANTELI_API_KEY"),
    REPORT2_POST_V7_UNIFIED_ENABLED: envText("REPORT2_POST_V7_UNIFIED_ENABLED", { required:false }),
    REPORT2_ANALYTICS_ACTOR: envText("REPORT2_ANALYTICS_ACTOR", { required:false }) || "GITHUB_ACTIONS",
    REPORT2_RUN_SOURCE: envText("REPORT2_RUN_SOURCE", { required:false }),
    REPORT2_CURRENT_GENERATION: envText("REPORT2_CURRENT_GENERATION", { required:false }),
    REPORT2_MANUAL_COIN_CONTRACT: envText("REPORT2_MANUAL_COIN_CONTRACT", { required:false }),
    REPORT2_MANUAL_COMMAND: envText("REPORT2_MANUAL_COMMAND", { required:false }),
  };
}
function assertClosedCron(cron, scan) {
  if (!cron || cron.status !== "SUCCESS") throw new Error(`CRON_NOT_SUCCESS:${JSON.stringify(cron || {})}`);
  if (cron.completed_ts == null) throw new Error("CRON_NOT_COMPLETED");
  if (!(Number(cron.universe_total) > 0)) throw new Error("CRON_UNIVERSE_EMPTY");
  if (Number(cron.scanned) !== Number(cron.universe_total)) throw new Error("CRON_SCAN_INCOMPLETE");
  if (cron.persistence_status !== "CLOSED") throw new Error(`CRON_PERSISTENCE_${cron.persistence_status}`);
  if (!scan || !(Number(scan.universe_total) > 0)) throw new Error("SCAN_UNIVERSE_EMPTY");
  if (Number(scan.scanned) !== Number(scan.universe_total)) throw new Error("SCAN_INCOMPLETE");
  if (Number(scan.errors || 0) !== 0) throw new Error(`SCAN_ERRORS_${scan.errors}`);
  if (Number(scan.stale || 0) !== 0) throw new Error(`SCAN_STALE_${scan.stale}`);
  if (Number(scan.stage0_coverage_pct || 0) < 99.9) throw new Error(`SCAN_COVERAGE_${scan.stage0_coverage_pct}`);
}

async function observeNaturalTelegramDecision(db) {
  try {
    const row = await db.prepare(`SELECT decision_id, mode, decision_status, contract_code, observation_ts, direction,
      entry_action, management_action, data_quality, hard_veto, shadow_only, live_probability,
      validated_signal, execution_authorized, telegram_eligible, persisted_ts
      FROM final_decision_integration_shadow
      ORDER BY persisted_ts DESC LIMIT 1`).first();

    if (!row) {
      const report = {
        status: "NO_FINAL_DECISION_ROW",
        row_present: false,
        auto_send: false,
      };
      console.log("TELEGRAM_NATURAL_DECISION_OBSERVER", JSON.stringify(report));
      return report;
    }

    const failClosedReasons = [];
    if (row.mode !== "SHADOW_ONLY_NO_EXECUTION") failClosedReasons.push("NOT_SHADOW_ONLY");
    if (Number(row.shadow_only) !== 1) failClosedReasons.push("SHADOW_FLAG_NOT_ONE");
    if (row.live_probability !== null && row.live_probability !== undefined) failClosedReasons.push("LIVE_PROBABILITY_PRESENT");
    if (Number(row.validated_signal || 0) !== 0) failClosedReasons.push("VALIDATED_SIGNAL_PRESENT");
    if (Number(row.execution_authorized || 0) !== 0) failClosedReasons.push("EXECUTION_AUTHORIZED");
    if (Number(row.telegram_eligible || 0) !== 0) failClosedReasons.push("TELEGRAM_ELIGIBLE_UNEXPECTED");

    const report = {
      status: failClosedReasons.length ? "FOUND_REJECTED_FAIL_CLOSED" : "FOUND_SAFE_SHADOW_ROW",
      row_present: true,
      decision_id: String(row.decision_id || ""),
      contract_code: String(row.contract_code || "UNKNOWN"),
      direction: String(row.direction || "UNKNOWN"),
      decision_status: String(row.decision_status || "UNKNOWN"),
      entry_action: String(row.entry_action || "NOT_EVALUATED"),
      management_action: String(row.management_action || "NOT_EVALUATED"),
      data_quality: String(row.data_quality || "NOT_EVALUATED"),
      hard_veto: Number(row.hard_veto || 0) === 1,
      persisted_ts: Number(row.persisted_ts || 0) || null,
      fail_closed_reasons: failClosedReasons,
      auto_send: false,
    };
    console.log("TELEGRAM_NATURAL_DECISION_OBSERVER", JSON.stringify(report));
    return report;
  } catch (error) {
    const report = {
      status: "OBSERVER_ERROR_FAIL_CLOSED",
      row_present: false,
      error: String(error?.message || error),
      auto_send: false,
    };
    console.log("TELEGRAM_NATURAL_DECISION_OBSERVER", JSON.stringify(report));
    return report;
  }
}

async function loadCanonicalRunOutput(db,{runId,source,generation,head,cron,candidateContracts=[]}={}){
  try{
    const contracts=[...new Set(candidateContracts)].filter(value=>typeof value==='string'&&/^[^\s]{1,40}-USDT$/u.test(value)).slice(0,6);
    if(!contracts.length&&Number(cron?.v3_live_deep_check_count)>0)throw new Error('CANONICAL_OUTPUT_CANDIDATE_IDENTITY_REQUIRED');
    const response=contracts.length?await db.prepare(`SELECT publication_id,contract_code,direction,run_id,snapshot_id,wave_id,observed_ts,valid_until_ts,lifecycle_event,canonical_state,canonical_json,presentation_inputs_json,manual_text,telegram_text,actionability_status,actionability_reason,created_ts,bound_ts
      FROM canonical_publication_shadow WHERE run_id=?1 AND contract_code IN (${contracts.map((_,i)=>`?${i+2}`).join(',')}) ORDER BY created_ts DESC,publication_id ASC LIMIT 6`).bind(String(runId||''),...contracts).all():{results:[]};
    const rows=Array.isArray(response?.results)?response.results:[];
    const persistenceAudit=auditCanonicalCandidateSet({expected_contracts:contracts,rows,run_id:String(runId||'')});
    const completion=classifyCanonicalRunCompletion({candidate_count:persistenceAudit.present_candidate_count,expected_candidate_count:persistenceAudit.expected_candidate_count,cron});
    const canonicalMissing=['CANONICAL_CANDIDATE_NOT_PERSISTED','CANONICAL_CANDIDATE_SET_INCOMPLETE'].includes(completion.reason);
    const output={
      schema:'my-report-2-canonical-run-output-v1',generation,head:head||null,source,run_id:String(runId||''),...completion,canonical_persistence_audit:persistenceAudit,
      pipeline_health:canonicalMissing?{status:'DEGRADED_PIPELINE',reason:completion.reason,original_status:cron?.v3_pipeline_health_status??null,original_reason:cron?.v3_pipeline_health_reason??null}:{status:cron?.v3_pipeline_health_status??null,reason:cron?.v3_pipeline_health_reason??null},
      candidates:rows.map(row=>{
        let canonical=null;try{canonical=JSON.parse(row.canonical_json);}catch{}
        let presentationInputs=null;try{presentationInputs=JSON.parse(row.presentation_inputs_json);}catch{}
        const blockCoverage=canonical?.metadata?.internal_market_context?.evidence_v2?.block_coverage||null;
        return {
          publication_id:row.publication_id,contract:row.contract_code,direction:row.direction,run_id:row.run_id,snapshot_id:row.snapshot_id,wave_id:row.wave_id,
          observed_ts:Number(row.observed_ts)||null,valid_until_ts:Number(row.valid_until_ts)||null,lifecycle_event:row.lifecycle_event,canonical_state:row.canonical_state,
          actionability_status:row.actionability_status,actionability_reason:row.actionability_reason,manual_text:row.manual_text||presentationInputs?.manual_text||null,
          block_coverage:blockCoverage,
          source_role_publication_audit:auditObservationSourceRoles(canonical),
          block_decision_use:auditCanonicalBlockDecisionUse(canonical||{},{manual:{ok:Boolean(row.manual_text||presentationInputs?.manual_text),text:row.manual_text||presentationInputs?.manual_text||null}}),
          block_rendered_results:auditRenderedBlockResults({canonical,manual:{ok:Boolean(row.manual_text||presentationInputs?.manual_text),text:row.manual_text||presentationInputs?.manual_text||null},telegram:{ok:Boolean(row.telegram_text),text:row.telegram_text||null,analytical_fingerprint:canonical?.analytical_fingerprint}}),
          canonical:canonical?{contract:canonical.metadata?.contract,status:canonical.status,state:canonical.state,direction:canonical.direction,scores:canonical.scores,reasons:canonical.reasons,entry:canonical.entry,trigger:canonical.trigger,invalidation:canonical.invalidation,targets:canonical.targets,liquidations:canonical.liquidations,data_quality:canonical.data_quality,changes_from_previous:canonical.changes_from_previous,observed_ts:canonical.observed_ts,snapshot_id:canonical.snapshot_id,run_id:canonical.run_id,analytical_fingerprint:canonical.analytical_fingerprint}:null,
        };
      }),
      generated_at:new Date().toISOString(),secrets_included:false,alternative_manual_recalculation:false,
    };
    for(const candidate of output.candidates){
      try{candidate.execution_context_source=await loadExecutionReportSource(db,candidate,output.run_id);}
      catch(error){candidate.execution_context_source=null;candidate.execution_context_diagnostic=String(error?.message||error).slice(0,160);}
    }
    const checkedOutput=enforceManualBlockCoverage(output);
    checkedOutput.report_text=formatManualRunSummary(checkedOutput);
    checkedOutput.execution_report_rendering=auditExecutionReportRendering(checkedOutput);
    return checkedOutput;
  }catch(error){
    return {schema:'my-report-2-canonical-run-output-v1',generation,head:head||null,source,run_id:String(runId||''),status:'NOT_CLOSED',reason:'CANONICAL_RUN_OUTPUT_READ_FAILED',error:String(error?.message||error).slice(0,240),candidates:[],generated_at:new Date().toISOString(),secrets_included:false,alternative_manual_recalculation:false};
  }
}

function finite(v) {
  if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pct(a, b) {
  const x = finite(a), y = finite(b);
  return x !== null && y !== null && x > 0 ? ((y / x) - 1) * 100 : null;
}

function quantile(values, q) {
  const a = values.filter(Number.isFinite).slice().sort((x, y) => x - y);
  if (!a.length) return null;
  const qq = Math.min(1, Math.max(0, Number(q)));
  const pos = (a.length - 1) * qq;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  if (lo === hi) return a[lo];
  const w = pos - lo;
  return a[lo] * (1 - w) + a[hi] * w;
}

function parseCompactStage0Payload(payloadText) {
  let payload;
  try { payload = typeof payloadText === 'string' ? JSON.parse(payloadText) : payloadText; }
  catch { return { status:'PAYLOAD_INVALID', schema:null, timestamp:null, rows:new Map() }; }
  if (!payload || payload.schema !== 'stage0-compact-v2' || !Array.isArray(payload.contracts)) {
    return { status:'PAYLOAD_UNSUPPORTED', schema:payload?.schema ?? null, timestamp:finite(payload?.timestamp), rows:new Map() };
  }
  const rows = new Map();
  for (const row of payload.contracts) {
    if (!Array.isArray(row) || !row.length) continue;
    const [contract, price, turnover, oiContracts, oiValue, fundingRate, fundingIntervalHours, marketAgeSec, dataStatus,
      longWatch=null, shortWatch=null, longTriggerCount=0, shortTriggerCount=0] = row;
    const key = String(contract ?? '').trim();
    if (!key) continue;
    rows.set(key, {
      contract:key,
      price:finite(price), turnover_24h_usdt:finite(turnover), oi_contracts:finite(oiContracts), oi_value_usdt:finite(oiValue),
      funding_rate:finite(fundingRate), funding_interval_hours:finite(fundingIntervalHours), market_age_sec:finite(marketAgeSec),
      data_status:String(dataStatus ?? ''), long_watch:longWatch === true, short_watch:shortWatch === true,
      long_trigger_count:Number.isFinite(Number(longTriggerCount)) ? Number(longTriggerCount) : 0,
      short_trigger_count:Number.isFinite(Number(shortTriggerCount)) ? Number(shortTriggerCount) : 0,
    });
  }
  return { status:'CLOSED', schema:payload.schema, timestamp:finite(payload.timestamp), rows };
}

function snapshotGate(snapshot) {
  if (!snapshot) return { ok:false, reason:'SNAPSHOT_MISSING' };
  const coverage = finite(snapshot.stage0_coverage_pct);
  const errors = finite(snapshot.errors);
  const stale = finite(snapshot.stale);
  if (coverage === null || coverage < 99.9) return { ok:false, reason:'COVERAGE_NOT_CLOSED' };
  if (errors === null || errors !== 0) return { ok:false, reason:'ERRORS_PRESENT_OR_UNKNOWN' };
  if (stale === null || stale !== 0) return { ok:false, reason:'STALE_PRESENT_OR_UNKNOWN' };
  const parsed = parseCompactStage0Payload(snapshot.payload_json);
  if (parsed.status !== 'CLOSED') return { ok:false, reason:parsed.status };
  return { ok:true, parsed };
}

function compactMiss(row) {
  return {
    contract:row.contract,
    move_pct:Number(row.move_pct.toFixed(6)),
    baseline_long_watch:row.baseline_long_watch,
    baseline_short_watch:row.baseline_short_watch,
    baseline_long_trigger_count:row.baseline_long_trigger_count,
    baseline_short_trigger_count:row.baseline_short_trigger_count,
  };
}

function evaluateRecallPair({baseline, current, horizon}) {
  const bg = snapshotGate(baseline), cg = snapshotGate(current);
  if (!bg.ok || !cg.ok) {
    return { horizon, status:'NOT_CLOSED', reason:!bg.ok ? `BASELINE_${bg.reason}` : `CURRENT_${cg.reason}` };
  }
  const moves = [];
  for (const [contract, b] of bg.parsed.rows.entries()) {
    const c = cg.parsed.rows.get(contract);
    if (!c) continue;
    const move = pct(b.price, c.price);
    if (move === null) continue;
    moves.push({
      contract, move_pct:move,
      baseline_long_watch:b.long_watch, baseline_short_watch:b.short_watch,
      baseline_long_trigger_count:b.long_trigger_count, baseline_short_trigger_count:b.short_trigger_count,
    });
  }
  if (moves.length < 20) return { horizon, status:'DATA_INSUFFICIENT', matched_contracts:moves.length };
  const pos = moves.filter(x => x.move_pct > 0).map(x => x.move_pct);
  const neg = moves.filter(x => x.move_pct < 0).map(x => x.move_pct);
  if (pos.length < 5 || neg.length < 5) {
    return { horizon, status:'DATA_INSUFFICIENT_DIRECTIONAL_BREADTH', matched_contracts:moves.length, positive_contracts:pos.length, negative_contracts:neg.length };
  }
  const longThreshold = quantile(pos, 0.95);
  const shortThreshold = quantile(neg, 0.05);
  const longs = moves.filter(x => x.move_pct >= longThreshold);
  const shorts = moves.filter(x => x.move_pct <= shortThreshold);
  const longDetected = longs.filter(x => x.baseline_long_watch).length;
  const shortDetected = shorts.filter(x => x.baseline_short_watch).length;
  const longWrong = longs.filter(x => x.baseline_short_watch && !x.baseline_long_watch).length;
  const shortWrong = shorts.filter(x => x.baseline_long_watch && !x.baseline_short_watch).length;
  const longMissed = longs.filter(x => !x.baseline_long_watch).sort((a,b)=>b.move_pct-a.move_pct).slice(0,10).map(compactMiss);
  const shortMissed = shorts.filter(x => !x.baseline_short_watch).sort((a,b)=>a.move_pct-b.move_pct).slice(0,10).map(compactMiss);
  const totalTail = longs.length + shorts.length;
  const totalDetected = longDetected + shortDetected;
  return {
    horizon,
    status:'CLOSED',
    semantics:'RELATIVE_DIRECTIONAL_TAIL_P95_SHADOW_KPI_NOT_TRADE_SIGNAL',
    matched_contracts:moves.length,
    positive_contracts:pos.length,
    negative_contracts:neg.length,
    thresholds:{ long_positive_tail_p95_pct:Number(longThreshold.toFixed(6)), short_negative_tail_p05_pct:Number(shortThreshold.toFixed(6)) },
    long_tail:{ total:longs.length, baseline_directional_watch:longDetected, directional_recall_pct:longs.length ? Number((100*longDetected/longs.length).toFixed(3)) : null, wrong_direction_only:longWrong, missed:longMissed },
    short_tail:{ total:shorts.length, baseline_directional_watch:shortDetected, directional_recall_pct:shorts.length ? Number((100*shortDetected/shorts.length).toFixed(3)) : null, wrong_direction_only:shortWrong, missed:shortMissed },
    combined:{ total:totalTail, baseline_directional_watch:totalDetected, directional_recall_pct:totalTail ? Number((100*totalDetected/totalTail).toFixed(3)) : null },
    caveat:'Relative-tail descriptive KPI only. It does not define a trading threshold, probability, validation, or causal false-negative classification.',
  };
}

function evaluateRecallKpi({current, baselines}) {
  const horizons = ['1h','4h','24h'];
  const out = {};
  for (const h of horizons) out[h] = evaluateRecallPair({baseline:baselines?.[h] ?? null, current, horizon:h});
  const closed = horizons.filter(h => out[h].status === 'CLOSED');
  return {
    mode:'DISCOVERY_RECALL_KPI_SHADOW_V1',
    status:closed.length ? (closed.length === horizons.length ? 'CLOSED' : 'PARTIAL') : 'NOT_CLOSED',
    closed_horizons:closed,
    horizons:out,
    safety:{strategy_changed:false,decision_weights_changed:false,live_probability:false,validated_signal:false,automatic_telegram:false,trading_execution:false},
  };
}


async function observeDiscoveryRecallKpi(db, { startedTs, source, runId } = {}) {
  try {
    const ts = Number(startedTs || Date.now());
    const minute = new Date(ts).getUTCMinutes();
    const hourlyBucket = Math.floor(ts / 3_600_000) * 3_600_000;
    if (source === "schedule") {
      const already = await db.prepare(`SELECT audit_ts_bucket FROM discovery_recall_kpi_shadow WHERE audit_ts_bucket=?1 LIMIT 1`).bind(hourlyBucket).first();
      if (already) {
        const report = { mode:"DISCOVERY_RECALL_KPI_SHADOW_V1", status:"ALREADY_FILLED_THIS_HOUR", scheduled_minute_utc:minute, persisted:true };
        console.log("DISCOVERY_RECALL_KPI_SHADOW", JSON.stringify(report));
        return report;
      }
    }
    const targets = [
      ["current", ts, 15*60_000],
      ["1h", ts-60*60_000, 15*60_000],
      ["4h", ts-4*60*60_000, 15*60_000],
      ["24h", ts-24*60*60_000, 25*60_000],
    ];
    const statements = targets.map(([,target,tol]) => db.prepare(`
      SELECT ts, stage0_coverage_pct, errors, stale, payload_json
      FROM scan_runs
      WHERE ts BETWEEN ?1 AND ?2
      ORDER BY ABS(ts - ?3) ASC
      LIMIT 1
    `).bind(target-tol,target+tol,target));
    const results = await db.batch(statements);
    const pick = (i) => Array.isArray(results?.[i]?.results) ? (results[i].results[0] || null) : null;
    const current = pick(0);
    const baselines = { "1h":pick(1), "4h":pick(2), "24h":pick(3) };
    const kpi = evaluateRecallKpi({ current, baselines });
    const bucket = hourlyBucket;
    const record = {
      ...kpi,
      audit_ts:ts,
      source_run_id:String(runId || ""),
      current_scan_ts:Number(current?.ts || 0) || null,
      persistence_semantics:"HOURLY_SHADOW_KPI_ONLY",
    };
    const text = JSON.stringify(record);
    await db.prepare(`
      INSERT INTO discovery_recall_kpi_shadow
      (audit_ts_bucket,audit_ts,source_run_id,mode,status,current_scan_ts,closed_horizons,kpi_json,
       strategy_changed,decision_weights_changed,live_probability,validated_signal,automatic_telegram,trading_execution,created_ts)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,0,0,0,0,0,0,?9)
      ON CONFLICT(audit_ts_bucket) DO UPDATE SET
        audit_ts=excluded.audit_ts,
        source_run_id=excluded.source_run_id,
        mode=excluded.mode,
        status=excluded.status,
        current_scan_ts=excluded.current_scan_ts,
        closed_horizons=excluded.closed_horizons,
        kpi_json=excluded.kpi_json,
        created_ts=excluded.created_ts
    `).bind(bucket,ts,String(runId||""),record.mode,record.status,record.current_scan_ts,record.closed_horizons.length,text,Date.now()).run();
    const persistedRow = await db.prepare(`
      SELECT mode,status,closed_horizons,audit_ts,source_run_id,kpi_json,strategy_changed,decision_weights_changed,
             live_probability,validated_signal,automatic_telegram,trading_execution
      FROM discovery_recall_kpi_shadow
      WHERE audit_ts_bucket = ?1
      LIMIT 1
    `).bind(bucket).first();
    const readbackOk = recallKpiReadbackMatches(persistedRow,record);
    if (!readbackOk) throw new Error("DISCOVERY_RECALL_KPI_D1_READBACK_FAIL_CLOSED");
    console.log("DISCOVERY_RECALL_KPI_PERSISTENCE_PROOF", "STATUS_PASS MODE_SHADOW SAFETY_PASS ROW_FOUND");
    const report = { ...record, persisted:true, persistence_readback:"PASS", auto_send:false };
    console.log("DISCOVERY_RECALL_KPI_SHADOW", JSON.stringify(report));
    return report;
  } catch (error) {
    const report = { mode:"DISCOVERY_RECALL_KPI_SHADOW_V1", status:"OBSERVER_ERROR_FAIL_CLOSED", error:String(error?.message || error), persisted:false, auto_send:false };
    console.log("DISCOVERY_RECALL_KPI_SHADOW", JSON.stringify(report));
    return report;
  }
}

function enforceD1Budget(db) {
  const usage = db.usageSnapshot();
  const runsPerDay = envNumber("REPORT2_D1_RUNS_PER_DAY", 288);
  const maxDailyReads = envNumber("REPORT2_D1_MAX_DAILY_READS", 3_500_000);
  const maxDailyWrites = envNumber("REPORT2_D1_MAX_DAILY_WRITES", 70_000);
  const projectedReads = usage.rows_read * runsPerDay;
  const projectedWrites = usage.rows_written * runsPerDay;
  const targets = Object.entries(usage.targets || {})
    .map(([target, v]) => ({ target, ...v }))
    .sort((a, b) => (b.rows_read - a.rows_read) || (b.rows_written - a.rows_written))
    .slice(0, 12);
  const report = {
    measured_rows_read: usage.rows_read,
    measured_rows_written: usage.rows_written,
    measured_requests: usage.requests,
    unknown_ops: usage.unknown_ops,
    runs_per_day: runsPerDay,
    projected_daily_rows_read: projectedReads,
    projected_daily_rows_written: projectedWrites,
    safety_budget_daily_rows_read: maxDailyReads,
    safety_budget_daily_rows_written: maxDailyWrites,
    top_targets: targets,
  };
  console.log("D1_USAGE_TELEMETRY", JSON.stringify(report));
  if (usage.unknown_ops > 0) throw new Error(`D1_USAGE_UNMEASURED_OPS_${usage.unknown_ops}`);
  if (projectedReads > maxDailyReads) throw new Error(`D1_FREE_TIER_READ_BUDGET_UNSAFE:${projectedReads}>${maxDailyReads}`);
  if (projectedWrites > maxDailyWrites) throw new Error(`D1_FREE_TIER_WRITE_BUDGET_UNSAFE:${projectedWrites}>${maxDailyWrites}`);
  return report;
}
let cleanupClaimedAnalyticsLease=null;
async function main() {
  const preflight=evaluatePreflight(process.env);
  console.log('REPORT2_RUNTIME_PREFLIGHT',JSON.stringify(preflight));
  if(!preflight.allowed)throw new Error(`REPORT2_RUNTIME_PREFLIGHT_BLOCKED:${preflight.status}`);
  process.env.REPORT2_TELEGRAM_OUTPUT_ENABLED=preflight.switches.delivery?'1':'0';
  let source = envText("REPORT2_RUN_SOURCE", { required: false }) || "manual";
  const generation=envText("REPORT2_CURRENT_GENERATION");
  if(generation!=="MY_REPORT_2_CURRENT_20260929_CURRENT_CYCLE_V13_20M")throw new Error(`STALE_OR_UNKNOWN_GENERATION:${generation}`);
  const started = Date.now();
  const postV7UnifiedEnabled = ["1","true","yes","on"].includes(String(process.env.REPORT2_POST_V7_UNIFIED_ENABLED || "0").trim().toLowerCase());
  const { worker, scanLiquidationCandidates, liquidationIntelligenceApi, sha } = await loadWorker();
  const env = buildEnv();
  const officialSourceRegistry=compileOfficialSourceRegistry(JSON.parse(await fs.readFile(resolve('./official-event-sources.json'),'utf8')));
  const supplementalIdentityRegistry=mergeOfficialAndConfiguredRegistries({official:officialSourceRegistry,configured:envText('REPORT2_SUPPLEMENTAL_IDENTITY_REGISTRY_JSON',{required:false})||{}});
  env.REPORT2_STRICT17_ELIGIBLE_CONTRACTS=Object.entries(supplementalIdentityRegistry.registry||{})
    .filter(([,row])=>Boolean(row?.chain&&row?.contract_or_mint&&row?.official_feeds?.length&&row?.official_domains?.length&&((row?.coinpaprika_id&&row?.sector_tag)||(row?.coingecko_id&&row?.coingecko_category_id))))
    .map(([base])=>`${String(base).toUpperCase()}-USDT`);
  console.log('OFFICIAL_SOURCE_REGISTRY',JSON.stringify({status:supplementalIdentityRegistry.status,version:officialSourceRegistry.version,versioned_records:supplementalIdentityRegistry.versioned_records,configured_status:supplementalIdentityRegistry.configured_status}));
  const unifiedHttpBudget=createUnifiedHttpBudget({...HTTP_LIMITS,...TWO_NODE_HTTP_LIMITS});
  if(envText('REPORT2_RETAINED_HISTORY_ENABLED',{required:false})==='1')env.DATA_DB.enableRetainedHistory({fetch_impl:(...args)=>globalThis.fetch(...args),request_admit:unifiedHttpBudget.reserve,max_fetches:4});
  await installRuntimeControl(env.DATA_DB);
  await installProviderMinuteLedger(env.DATA_DB);
  const analyticsLease=await claimAnalyticsLease(env.DATA_DB,{actor:preflight.actor,generation,run_id:`ANALYTICS:${started}:${sha.slice(0,12)}`,now:started});
  if(!analyticsLease.claimed)throw new Error(`ANALYTICS_LEASE_NOT_CLAIMED:${analyticsLease.status}`);
  let analyticsLeaseReleased=false;
  const releaseAnalyticsLease=async()=>{
    if(analyticsLeaseReleased)return {finished:true,status:'ALREADY_RELEASED'};
    const result=await finishAnalyticsLease(env.DATA_DB,analyticsLease,{now:Date.now()});
    if(result.finished)analyticsLeaseReleased=true;
    return result;
  };
  cleanupClaimedAnalyticsLease=releaseAnalyticsLease;
  console.log('ANALYTICS_FENCING_LEASE',JSON.stringify(analyticsLease));
  const requestedSource=source,manualCommandActor=`${preflight.actor}:${started}:${sha.slice(0,12)}`;
  let manualCommandId=envText('REPORT2_COMMAND_ID',{required:false});
  let manualCommandClaim=requestedSource==='schedule'
    ?await claimNextCommand(env.DATA_DB,{actor:manualCommandActor,generation,now:started})
    :manualCommandId?await claimCommand(env.DATA_DB,{command_id:manualCommandId,actor:manualCommandActor,now:started}):{claimed:false,status:'MANUAL_COMMAND_ID_REQUIRED'};
  if(requestedSource!=='schedule'&&!manualCommandClaim.claimed&&manualCommandClaim.row?.state==='COMPLETED'){
    const leaseFinish=await releaseAnalyticsLease();
    if(!leaseFinish.finished)throw new Error(`ANALYTICS_LEASE_FINISH_FAILED:${leaseFinish.status}`);
    console.log('DURABLE_MANUAL_COMMAND_ALREADY_COMPLETED',JSON.stringify({command_id:manualCommandId,result_snapshot_id:manualCommandClaim.row.result_snapshot_id,rendered_text_hash:manualCommandClaim.row.rendered_text_hash}));
    return;
  }
  if(requestedSource!=='schedule'&&!manualCommandClaim.claimed)throw new Error(`DURABLE_MANUAL_COMMAND_NOT_CLAIMED:${manualCommandClaim.status||manualCommandClaim.row?.state||'UNKNOWN'}`);
  if(requestedSource==='schedule'&&manualCommandClaim.claimed){source='manual_recovery';env.REPORT2_RUN_SOURCE=source;manualCommandId=manualCommandClaim.row.command_id;env.REPORT2_MANUAL_COIN_CONTRACT=manualCommandClaim.row.contract||'';}
  const recoveredMode=source==='manual_recovery'?manualCommandClaim.row.mode:null;
  const parsedCommandIntent=recoveredMode==='LIQUIDATION_ONLY'
    ?{version:'durable-command-recovery-v1',matched:true,mode:manualCommandClaim.row.contract?'EXACT_COIN_LIQUIDATIONS':'LIQUIDATION_CANDIDATES',contract:manualCommandClaim.row.contract||null,normalized:'durable queued liquidation command'}
    :source==='schedule'?{matched:false,mode:null,contract:null,reason:'SCHEDULE_HAS_NO_RECOVERABLE_MANUAL_COMMAND'}:parseLiquidationCommand(env.REPORT2_MANUAL_COMMAND);
  const explicitManualContract=envText('REPORT2_MANUAL_COIN_CONTRACT',{required:false}).toUpperCase()||null;
  const commandIntent=parsedCommandIntent.matched&&!parsedCommandIntent.contract&&explicitManualContract
    ?{...parsedCommandIntent,mode:'EXACT_COIN_LIQUIDATIONS',contract:explicitManualContract,contract_source:'EXPLICIT_MANUAL_FIELD'}
    :parsedCommandIntent;
  const expectedManualContract=source==='manual_recovery'?(manualCommandClaim.row.contract||null):commandIntent.matched?(commandIntent.contract||null):explicitManualContract;
  const expectedManualMode=source==='schedule'?'SCHEDULE':source==='manual_recovery'?manualCommandClaim.row.mode:commandIntent.matched?'LIQUIDATION_ONLY':expectedManualContract?'MANUAL_COIN':'FULL_MANUAL';
  env.REPORT2_MANUAL_MODE=expectedManualMode;
  const mainSourceRegistry=expectedManualMode==='LIQUIDATION_ONLY'?supplementalIdentityRegistry:
    mergeOfficialAndConfiguredRegistries({official:compileOfficialSourceRegistry(JSON.parse(await fs.readFile(resolve('./main-official-event-sources.json'),'utf8'))),configured:supplementalIdentityRegistry.registry});
  const executionBudget=proveTwoCandidateBudget();
  if(!executionBudget.safe)throw new Error('TWO_CANDIDATE_BUDGET_UNSAFE');
  env.REPORT2_DEEP_RUNTIME_OPTIONS=deepRuntimeOptions({actor:preflight.actor,mode:expectedManualMode});
  env.REPORT2_DEEP_HTTP_ADMIT=unifiedHttpBudget.reserve;
  console.log('TWO_CANDIDATE_EXECUTION_BUDGET',JSON.stringify(executionBudget));
  if(source==='schedule'){
    const ownership=await actorOwnsPeriodicAnalytics(env.DATA_DB,{actor:preflight.actor});
    if(!ownership.allowed)throw new Error(`PERIODIC_ANALYTICS_OWNER_NOT_GITHUB:${ownership.status}`);
    const cadence=await claimMaintenanceCadence(env.DATA_DB,{job_key:'TWO_CANDIDATE_ANALYTICS_40M',actor:manualCommandActor,now_ts:started,interval_ms:TWO_CANDIDATE_PLAN.scheduled_interval_minutes*60_000});
    console.log('SCHEDULED_TWO_CANDIDATE_ADMISSION',JSON.stringify(cadence));
    if(!cadence.claimed){
      if(!['NOT_DUE','LEASE_ACTIVE'].includes(cadence.status))throw new Error(`SCHEDULED_CADENCE_NOT_CLOSED:${cadence.status}`);
      const triggered=cadence.status==='NOT_DUE'
        ?await admitTriggeredRecheck(env.DATA_DB,{actor:preflight.actor,now_ts:started,admit:async()=>evaluateDailyReservationBudget({
          daily:await loadDailyUsageAggregate(env.DATA_DB,started),nextReservation:TWO_CANDIDATE_PLAN.d1_run_cap,
          maxDailyReads:envNumber('REPORT2_D1_MAX_DAILY_READS',3500000),maxDailyWrites:envNumber('REPORT2_D1_MAX_DAILY_WRITES',70000),
        })})
        :{claimed:false,status:'REGULAR_CADENCE_LEASE_ACTIVE'};
      console.log('TRIGGERED_ENTRY_RECHECK_ADMISSION',JSON.stringify(triggered));
      if(!triggered.claimed){
        const finish=await releaseAnalyticsLease();if(!finish.finished)throw new Error(`ANALYTICS_LEASE_FINISH_FAILED:${finish.status}`);
        return;
      }
      env.REPORT2_TRIGGERED_RECHECK_TASK_ID=triggered.task.task_id;
      env.REPORT2_DEEP_RUNTIME_OPTIONS={...env.REPORT2_DEEP_RUNTIME_OPTIONS,max_per_run:1};
    }else{
    // Failed attempts also consume a cycle, preserving the provider reserve.
    const charged=await completeMaintenanceCadence(env.DATA_DB,{job_key:cadence.job_key,actor:manualCommandActor,lease_started_ts:cadence.lease_started_ts,success:true,now_ts:started,result:'ATTEMPT_ADMITTED'});
    if(charged.completed!==true)throw new Error(`SCHEDULED_CADENCE_CHARGE_FAILED:${charged.status}`);
    }
  }
  if(manualCommandClaim.claimed&&manualCommandClaim.row?.generation!==generation)throw new Error('DURABLE_MANUAL_COMMAND_GENERATION_MISMATCH');
  if(manualCommandClaim.claimed&&(manualCommandClaim.row?.mode!==expectedManualMode||(manualCommandClaim.row?.contract??null)!==expectedManualContract))throw new Error('DURABLE_MANUAL_COMMAND_INPUT_MISMATCH');
  console.log('DURABLE_MANUAL_COMMAND_CLAIM',JSON.stringify({command_id:manualCommandId||null,claimed:manualCommandClaim.claimed,state:manualCommandClaim.row?.state||manualCommandClaim.status||null,mode:manualCommandClaim.row?.mode||null,contract:manualCommandClaim.row?.contract||null,recovered_by_scheduled_executor:source==='manual_recovery'}));
  if(commandIntent.matched&&commandIntent.mode==='EXACT_COIN_LIQUIDATIONS')env.REPORT2_MANUAL_COIN_CONTRACT=commandIntent.contract;
  console.log('LIQUIDATION_COMMAND_INTENT',JSON.stringify(commandIntent));
  const savedRunRequest=source!=='schedule'?String(env.REPORT2_MANUAL_COMMAND||'').match(/\bRUN_ID=(\d{10,}-\d{10,})\b/iu):null;
  if(savedRunRequest){
    const savedRunId=savedRunRequest[1];
    const exactTelegramRequested=['1','true','yes','on'].includes(String(process.env.REPORT2_EXACT_SAVED_RUN_TELEGRAM||'0').trim().toLowerCase());
    let exactAcceptance=null;
    if(exactTelegramRequested){
      const acceptancePath=envText('REPORT2_EXACT_SAVED_RUN_ACCEPTANCE_FILE',{required:false});
      if(!acceptancePath)throw new Error('EXACT_SAVED_RUN_ACCEPTANCE_FILE_REQUIRED');
      exactAcceptance=JSON.parse(await fs.readFile(acceptancePath,'utf8'));
      if(!acceptedJointForTelegramRetrieval(exactAcceptance,savedRunId))throw new Error('EXACT_SAVED_RUN_ACCEPTANCE_NOT_CLOSED');
    }
    const savedContracts=exactAcceptance?.candidate_selection?.top_two_contracts||[];
    const savedOutput=await loadCanonicalRunOutput(env.DATA_DB,{runId:savedRunId,source:'manual',generation,head:process.env.GITHUB_SHA||null,cron:null,candidateContracts:savedContracts});
    if(exactAcceptance){
      savedOutput.market_scan_audit={...exactAcceptance.market_scan,stage0_coverage_pct:exactAcceptance.market_scan?.complete===true?100:null};
      savedOutput.candidate_selection_audit={top_two_contracts:savedContracts,deep_check_selected:exactAcceptance.candidate_selection?.deep_check_selected||[],registry_did_not_change_rank:exactAcceptance.candidate_selection?.exact_order_match===true&&exactAcceptance.candidate_selection?.leaders_replaced_for_coverage===false};
      savedOutput.acceptance_binding={schema:exactAcceptance.schema,artifact_id:exactAcceptance.artifact_id,artifact_sha256:exactAcceptance.artifact_sha256,main_head:exactAcceptance.main_head,raw_24h_explicitly_excluded:exactAcceptance.raw_24h_explicitly_excluded===true};
    }
    savedOutput.requested_saved_run_id=savedRunId;
    savedOutput.saved_canonical_retrieval=true;
    let exactTelegram=null;
    if(exactTelegramRequested){
      exactTelegram=await deliverExactSavedRunTelegram({db:env.DATA_DB,saved_output:savedOutput,requested_run_id:savedRunId,enabled:true,relay_url:envText('REPORT2_TELEGRAM_RELAY_URL',{required:false}),relay_key:envText('REPORT2_TELEGRAM_RELAY_KEY',{required:false}),now_ts:Date.now(),fetch_impl:nativeFetch});
      await fs.writeFile('telegram-info-proof.json',JSON.stringify(exactTelegram,null,2));
      if(exactTelegram.sent!==true||!exactTelegram.message_id)throw new Error(`EXACT_SAVED_RUN_TELEGRAM_NOT_SENT:${exactTelegram.status}:${exactTelegram.error||exactTelegram.reason||'UNKNOWN'}`);
    }
    savedOutput.exact_saved_run_telegram=exactTelegram;
    await fs.writeFile('report2-run-result.json',JSON.stringify(savedOutput,null,2));
    const completion=await completeCommand(env.DATA_DB,{command_id:manualCommandId,actor:manualCommandActor,snapshot_id:savedRunId,rendered_text:JSON.stringify(savedOutput),delivered_to_existing_channel:true,now:Date.now()});
    if(!completion.completed)throw new Error(`DURABLE_SAVED_RUN_COMPLETION_FAILED:${completion.status}`);
    const leaseFinish=await releaseAnalyticsLease();
    if(!leaseFinish.finished)throw new Error(`ANALYTICS_LEASE_FINISH_FAILED:${leaseFinish.status}`);
    console.log('SAVED_CANONICAL_RUN_OUTPUT',JSON.stringify({status:savedOutput.status,run_id:savedRunId,candidates:savedOutput.candidates.length,block_audit:savedOutput.block_audit||null,report_text_present:Boolean(savedOutput.report_text),telegram_status:exactTelegram?.status||null,telegram_message_id:exactTelegram?.message_id||null}));
    return;
  }
  env.REPORT2_SUPPLEMENTAL_CANDIDATE_COLLECT=async params=>{const result=await collectHtxBoundSupplementalContext({
    db:env.DATA_DB,
    fetch_impl:globalThis.fetch,
    registry:mainSourceRegistry.registry,
    request_admit:unifiedHttpBudget.reserve,
    reference_enabled:expectedManualMode!=='LIQUIDATION_ONLY',
    vyx_api_key:envText('VYX_API_KEY',{required:false}),
    nansen_api_key:envText('NANSEN_API_KEY',{required:false}),
    venue_registry:env.REPORT2_LIQUIDATION_VENUE_REGISTRY,
    ...params,
  });if(result.asset_reference)console.log('HTX_ASSET_REFERENCE_RECEIPT',JSON.stringify({contract:params.contract,status:result.asset_reference.status,identity:result.asset_reference.identity,identity_method:result.identity_method,cache_status:result.asset_reference.cache_status,network_calls:result.asset_reference.network_calls,reference_observed_ts:result.asset_reference.reference_observed_ts,receipt:result.asset_reference.receipt||null}));return result;};
  env.REPORT2_PUBLIC_ASSET_BINDING=params=>bindGateOfficialAssetIdentity({db:env.DATA_DB,fetch_impl:globalThis.fetch,request_admit:unifiedHttpBudget.reserve,db_admit:e=>evaluateWithinRunReservation({reservation:d1RunReservation,currentUsage:env.DATA_DB.usageSnapshot(),extraRowsRead:4500+e.rows_read,extraRowsWritten:150+e.rows_written}),...params});
  const liquidationRiskByContract=new Map(),futureHttpByContract=new Map();
  env.REPORT2_FUTURE_PROVIDER_MODEL_COLLECT=async params=>{const admission=env.REPORT2_LIQUIDATION_COVERAGE_FOR?.(params.contract);if(!admission?.eligible||!admission.source_ids.includes('COINLOBSTER_FUTURE_MODEL'))return{status:'COVERAGE_GATE_NOT_ADMITTED',reason:admission?.status||'COVERAGE_DATABASE_NOT_AVAILABLE',levels:[],network_calls:0,internal_only:true};const result=await collectCoinLobsterFutureModel({db:env.DATA_DB,fetch_impl:globalThis.fetch,request_admit:unifiedHttpBudget.reserve,max_http:Math.max(0,5-(futureHttpByContract.get(params.contract)??0)),strict_fresh_manual:source!=='schedule'&&commandIntent.matched,...params});futureHttpByContract.set(params.contract,(futureHttpByContract.get(params.contract)??0)+result.network_calls);return result;};
  env.REPORT2_CROSS_EXCHANGE_RISK_COLLECT=async params=>{const risk=await collectCrossExchangeRiskContext({
    db:env.DATA_DB,fetch_impl:globalThis.fetch,include_htx_realized:true,max_http:Array.isArray(params.allowed_lanes)?3:Math.max(0,Math.min(3,5-(futureHttpByContract.get(params.contract)??5))),coinalyze_api_key:envText('COINALYZE_API_KEY',{required:false}),...params,
    lane_override:envText('REPORT2_CROSS_EXCHANGE_VALIDATION_LANE',{required:false})||params.lane_override||'HISTORY',
  });
    if(!Array.isArray(params.allowed_lanes)){const slots=Math.min(3,Math.max(0,5-(futureHttpByContract.get(params.contract)??5)-risk.network_calls)),grant=slots?unifiedHttpBudget.reserve({logical_request_id:`MAIN_LIQUIDATION_VENUES:${params.run_id}:${params.contract}`,lane:'background',attempts:slots}):null;risk.liquidation_venue_coverage=await probeLiquidationVenueCoverage({db:env.DATA_DB,fetch_impl:globalThis.fetch,contract:params.contract,now:Date.now(),max_http:grant?.allowed&&!grant.duplicate?slots:0});risk.network_calls+=risk.liquidation_venue_coverage.network_calls;}
    risk.future_provider_models=params.future_provider_models??null;risk.liquidation_history_facts=formatLiquidationHistoryFacts(risk);risk.source_chain=buildLiquidationSourceChain({contract:params.contract,risk,future_models:params.future_provider_models,byk_future:params.byk_future,tracked_hl:capturedTrackedBands({contract:params.contract,run_id:params.run_id,observed_ts:Date.now()}),native:liquidationSources?.summary()??{},coverage:risk.liquidation_venue_coverage,coinlobster:contextForContract(env.REPORT2_GLOBAL_MARKET_CONTEXT,params.contract)?.coinlobster,venue_registry:env.REPORT2_LIQUIDATION_VENUE_REGISTRY});
    let volume;try{volume=await collectCrossVenueVolumeProfiles({db:env.DATA_DB,fetch_impl:globalThis.fetch,request_admit:unifiedHttpBudget.reserve,contract:params.contract,run_id:params.run_id});}catch{volume={status:'NOT_CLOSED',reason:'PROFILE_COLLECTOR_UNAVAILABLE',sources:{},network_calls:null};}const result={...risk,volume_profiles:volume,volume_profile_network_calls:volume.network_calls};liquidationRiskByContract.set(params.contract,result);return result;};
  env.REPORT2_SIGNED_TAPE_READ=params=>readSavedHtxSignedTape({db:env.DATA_DB,...params,db_admit:e=>evaluateWithinRunReservation({reservation:d1RunReservation,currentUsage:env.DATA_DB.usageSnapshot(),extraRowsRead:4500+e.rows_read,extraRowsWritten:150})});
  env.REPORT2_SIGNED_TAPE_PERSIST=params=>persistCapturedHtxSignedTape({db:env.DATA_DB,...params,publish_verified_24h:false,db_admit:e=>evaluateWithinRunReservation({reservation:d1RunReservation,currentUsage:env.DATA_DB.usageSnapshot(),extraRowsRead:4500+e.rows_read,extraRowsWritten:150+e.rows_written})});
  let currentBlockWeightPolicy=null,blockPolicyLoaded=false;
  env.REPORT2_EVIDENCE_V2_COLLECT=async params=>{const result=await collectCandidateEvidenceV2({db:env.DATA_DB,fetch_impl:globalThis.fetch,request_admit:unifiedHttpBudget.reserve,source_health_admit:e=>evaluateWithinRunReservation({reservation:d1RunReservation,currentUsage:env.DATA_DB.usageSnapshot(),extraRowsRead:4500+e.rows_read,extraRowsWritten:150+e.rows_written}),blockscout_api_key:envText('BLOCKSCOUT_PRO_API_KEY',{required:false}),...params,main_index_failure_backoff:expectedManualMode!=='LIQUIDATION_ONLY'});if(!blockPolicyLoaded){currentBlockWeightPolicy=await loadBlockWeightPolicy(env.DATA_DB,{now:Date.now(),admit:e=>evaluateWithinRunReservation({reservation:d1RunReservation,currentUsage:env.DATA_DB.usageSnapshot(),extraRowsRead:4500+e.rows_read,extraRowsWritten:150})});blockPolicyLoaded=true;}console.log('EVIDENCE_SOURCE_HEALTH_RECEIPT',JSON.stringify({contract:params.contract,run_id:params.run_id,source_health:result.source_health,shared_http_envelope:result.shared_http_envelope}));return {...result,block_weight_policy:currentBlockWeightPolicy};};
  env.REPORT2_EVIDENCE_V2_FINALIZE=params=>finalizeCandidateBlockCoverage(params);
  await installBykQuotaLedger(env.DATA_DB);
  env.REPORT2_BYKARANTELI_RESERVE=makeBykReserve(env.DATA_DB,{source});
  env.REPORT2_TRACKED_HL_FUTURE_COLLECT=params=>{const admission=env.REPORT2_LIQUIDATION_COVERAGE_FOR?.(params.contract);return admission?.eligible&&admission.source_ids.includes('BYK_TRACKED_HL_BANDS')?collectTrackedBands({fetch_impl:globalThis.fetch,request_admit:unifiedHttpBudget.reserve,...params}):Promise.resolve({status:'COVERAGE_GATE_NOT_ADMITTED',maps:[],network_calls:0,coverage_admission:admission??null});};
  const liquidationQueue=createCandidateTaskQueue({db:env.DATA_DB});
  const liquidationCalibration=createLiquidationOutcomeCalibration({db:env.DATA_DB,fetch_impl:globalThis.fetch});
  await Promise.all([liquidationQueue.install(),liquidationCalibration.install()]);
  env.REPORT2_LIQUIDATION_SIGNAL_RECORD=params=>liquidationCalibration.record(params);
  const pending = [];
  const ctx = { waitUntil(promise) { pending.push(Promise.resolve(promise)); }, passThroughOnException() {} };
  const d1NominalReservation = deriveRunReservation({
  runsPerDay:envNumber("REPORT2_D1_RUNS_PER_DAY", 288),
  maxDailyReads:envNumber("REPORT2_D1_MAX_DAILY_READS", 3_500_000),
  maxDailyWrites:envNumber("REPORT2_D1_MAX_DAILY_WRITES", 70_000),
});
if (!d1NominalReservation.ok) throw new Error(`D1_RUN_RESERVATION_NOT_CLOSED:${d1NominalReservation.status}`);
const d1RunReservation = buildR88BurstReservation(d1NominalReservation,TWO_CANDIDATE_PLAN.d1_run_cap);
if (!d1RunReservation.ok) throw new Error(`R8_8_BURST_RESERVATION_NOT_CLOSED:${d1RunReservation.status}`);
const d1DailyBeforeReservationRaw = await loadDailyUsageAggregate(env.DATA_DB, started);
const d1DailyBeforeReservation = buildR88DailyAdmissionView(d1DailyBeforeReservationRaw,d1RunReservation);
const d1DayAdmission = evaluateDailyReservationBudget({
  daily:d1DailyBeforeReservation,
  nextReservation:d1RunReservation,
  maxDailyReads:envNumber("REPORT2_D1_MAX_DAILY_READS", 3_500_000),
  maxDailyWrites:envNumber("REPORT2_D1_MAX_DAILY_WRITES", 70_000),
});
if (!d1DayAdmission.allowed) throw new Error(`D1_DAY_PREACTION_BUDGET_BLOCKED:${d1DayAdmission.status}:${(d1DayAdmission.reasons||[]).join(",")}`);
console.log("R8_8_ADAPTIVE_DAILY_ADMISSION", JSON.stringify({nominal:d1NominalReservation,burst:d1RunReservation,raw_daily:d1DailyBeforeReservationRaw,adaptive_daily:d1DailyBeforeReservation,admission:d1DayAdmission}));
  const d1ReservationId = `R2RUN:${started}:${sha.slice(0,16)}`;
  const d1ReservationReceipt = await reserveRunBudget(env.DATA_DB,{reservationId:d1ReservationId,now:started,reservation:d1RunReservation});
  if(source==='schedule'){
    const cacheMaintenance=await maintainExpiredProviderCache({db:env.DATA_DB,now:started,admit:budget=>evaluateWithinRunReservation({reservation:d1RunReservation,currentUsage:env.DATA_DB.usageSnapshot(),extraRowsRead:budget.rows_read,extraRowsWritten:budget.rows_written})});
    console.log('BOUNDED_EXPIRED_PROVIDER_CACHE_MAINTENANCE',JSON.stringify(cacheMaintenance));
  }
  const liquidationCoverageDatabase=await loadFuturesCoverageDatabase({db:env.DATA_DB,now:started});
  const liquidationCoverageSummary=summarizeFuturesCoverage(liquidationCoverageDatabase,{now:started});
  const dydxCryptoAssets=new Set(liquidationCoverageSummary.assets===102?(liquidationCoverageDatabase?.assets||[]).map(a=>a.symbol):[]);
  const liquidationCoverageFor=contract=>{const exact=String(contract||'').trim().toUpperCase(),now=Date.now(),base=runtimeLiquidationCollectionAdmission(liquidationCoverageDatabase,{contract:exact,now});return addDydxCollectionPermission(base,{contract:exact,crypto_assets:dydxCryptoAssets,routing:env.REPORT2_LIQUIDATION_VENUE_REGISTRY?.dydx_routing,now,automatic_discovery_enabled:true});};
  env.REPORT2_LIQUIDATION_COVERAGE_FOR=liquidationCoverageFor;
  console.log('LIQUIDATION_FUTURES_COVERAGE_DATABASE',JSON.stringify(liquidationCoverageSummary));
  if(commandIntent.matched&&commandIntent.contract){
    try{const routing=await loadDydxRouting({db:env.DATA_DB,now:started,db_admit:extra=>evaluateWithinRunReservation({reservation:d1RunReservation,currentUsage:env.DATA_DB.usageSnapshot(),extraRowsRead:extra.rows_read,extraRowsWritten:extra.rows_written})});env.REPORT2_LIQUIDATION_VENUE_REGISTRY={...(env.REPORT2_LIQUIDATION_VENUE_REGISTRY||{}),dydx_routing:routing};}catch{}
    const coverageAdmission=liquidationCoverageFor(commandIntent.contract);
    console.log('LIQUIDATION_FUTURES_COVERAGE_ADMISSION',JSON.stringify(coverageAdmission));
    if(!coverageAdmission.eligible){
      const sourceRunId=`LIQ_ONLY:${started}`,reportText=`ЛИКВИДАЦИОННЫЙ БЛОК\n\n${commandIntent.contract}: проверенных источников с реальными будущими уровнями сейчас нет. Ликвидационный анализ для этой монеты не запускается.`;
      const output={schema:'my-report-2-liquidation-run-output-v1',generation,head:sha,source,run_id:sourceRunId,mode:'LIQUIDATION_ONLY',status:'NO_VERIFIED_REAL_LEVEL_SOURCE',verified_candidate:commandIntent.contract,coverage_admission:coverageAdmission,coverage_summary:liquidationCoverageSummary,report_text:reportText,generated_at:new Date().toISOString(),full_report_started:false,decision_generated:false,validated_signal:false,telegram_started:false,source_http:0,calculated_htx_fallback:false,synthetic_maps_admitted:false,secrets_included:false};
      await fs.writeFile('report2-run-result.json',JSON.stringify(output,null,2));
      const completion=await completeCommand(env.DATA_DB,{command_id:manualCommandId,actor:manualCommandActor,snapshot_id:`LIQ_ONLY_COVERAGE:${started}`,rendered_text:reportText,delivered_to_existing_channel:true,now:Date.now()});
      if(!completion.completed)throw new Error(`DURABLE_MANUAL_COMMAND_COMPLETION_FAILED:${completion.status}`);
      await finalizeRunUsage(env.DATA_DB,{reservationId:d1ReservationId,sourceRunId,now:Date.now(),usage:env.DATA_DB.usageSnapshot()});
      const leaseFinish=await releaseAnalyticsLease();if(!leaseFinish.finished)throw new Error(`ANALYTICS_LEASE_FINISH_FAILED:${leaseFinish.status}`);
      console.log('LIQUIDATION_ONLY_COVERAGE_UNAVAILABLE',JSON.stringify({contract:commandIntent.contract,coverage:coverageAdmission.status,source_http:0,completion:completion.status}));
      return;
    }
  }
  const liquidationCalibrationSettlement=await liquidationCalibration.settle({now:started});
  console.log('LIQUIDATION_OUTCOME_CALIBRATION',JSON.stringify(liquidationCalibrationSettlement));
  env.REPORT2_LIQUIDATION_PREDICTIVE_HEALTH=await liquidationCalibration.summary();
  console.log('LIQUIDATION_PREDICTIVE_SOURCE_WEIGHTS',JSON.stringify(env.REPORT2_LIQUIDATION_PREDICTIVE_HEALTH));
  try{
    env.REPORT2_GLOBAL_MARKET_CONTEXT=await loadGlobalMarketContext({db:env.DATA_DB,fetch_impl:globalThis.fetch,now:started,liquidation_only:commandIntent.matched,strict_fresh_manual:source!=='schedule'&&commandIntent.matched});
  }catch(error){
    env.REPORT2_GLOBAL_MARKET_CONTEXT={status:'SOURCE_ERROR',observed_ts:started,internal_only:true,error:String(error?.message||error)};
  }
  console.log('GLOBAL_MARKET_CONTEXT_RECEIPT',JSON.stringify({status:env.REPORT2_GLOBAL_MARKET_CONTEXT?.status,deribit:env.REPORT2_GLOBAL_MARKET_CONTEXT?.deribit?.status,deribit_cache:env.REPORT2_GLOBAL_MARKET_CONTEXT?.deribit?.cache_status,coinlobster:env.REPORT2_GLOBAL_MARKET_CONTEXT?.coinlobster?.status,coinlobster_cache:env.REPORT2_GLOBAL_MARKET_CONTEXT?.coinlobster?.cache_status,coinlobster_whale_rows:env.REPORT2_GLOBAL_MARKET_CONTEXT?.coinlobster?.whale_radar?.length??0,coinlobster_liquidation_rows:env.REPORT2_GLOBAL_MARKET_CONTEXT?.coinlobster?.realized_liquidations?.length??0,coinlobster_paths:{radar:env.REPORT2_GLOBAL_MARKET_CONTEXT?.coinlobster?.radar_array_path??null,liquidations:env.REPORT2_GLOBAL_MARKET_CONTEXT?.coinlobster?.liquidations_array_path??null},coinlobster_response_shapes:env.REPORT2_GLOBAL_MARKET_CONTEXT?.coinlobster?.status==='NOT_CLOSED'?env.REPORT2_GLOBAL_MARKET_CONTEXT?.coinlobster?.response_shapes:null,internal_only:true}));
  try{env.REPORT2_LIQUIDATION_VENUE_REGISTRY=await loadLiquidationVenueCatalog({db:env.DATA_DB,fetch_impl:globalThis.fetch,now:started,force_refresh:source!=='schedule'&&commandIntent.matched});}
  catch(error){env.REPORT2_LIQUIDATION_VENUE_REGISTRY={status:'SOURCE_ERROR',entries:{},internal_only:true,error:String(error?.message||error)};}
  console.log('LIQUIDATION_VENUE_CATALOG',JSON.stringify({status:env.REPORT2_LIQUIDATION_VENUE_REGISTRY.status,network_calls:env.REPORT2_LIQUIDATION_VENUE_REGISTRY.network_calls,entries:Object.keys(env.REPORT2_LIQUIDATION_VENUE_REGISTRY.entries||{}).length,receipts:env.REPORT2_LIQUIDATION_VENUE_REGISTRY.receipts||[]}));
  const oxarchiveApiKey=envText('OXARCHIVE_API_KEY',{required:false});
  if(source!=='schedule'&&['1','true','yes','on'].includes(envText('REPORT2_OXARCHIVE_COST_PROBE',{required:false}).toLowerCase())){
    const probe=await runOxArchiveCostProbe({db:env.DATA_DB,fetch_impl:globalThis.fetch,api_key:oxarchiveApiKey,symbol:envText('REPORT2_OXARCHIVE_PROBE_SYMBOL',{required:false})||'SOL',now:started});
    console.log('OXARCHIVE_COST_PROBE_RECEIPT',JSON.stringify(probe));
  }
  const oxarchiveReadiness=await loadOxArchiveReadiness({db:env.DATA_DB,api_key:oxarchiveApiKey});
  const oxarchiveConfig={db:env.DATA_DB,api_key:oxarchiveApiKey,readiness:oxarchiveReadiness};
  console.log('OXARCHIVE_RUNTIME_READINESS',JSON.stringify({status:oxarchiveReadiness.status,reason:oxarchiveReadiness.reason||null,enabled:oxarchiveReadiness.enabled===true,credit_cost:oxarchiveReadiness.credit_cost??null,monthly_credit_cap:oxarchiveReadiness.monthly_credit_cap,max_monthly_calls:oxarchiveReadiness.max_monthly_calls??0,automatic_topup:false}));
  if (postV7UnifiedEnabled && source === "schedule") {
    const ownership=await actorOwnsPeriodicAnalytics(env.DATA_DB,{actor:"GITHUB_ACTIONS"});
    if (!ownership.allowed) throw new Error(`PERIODIC_ANALYTICS_OWNER_NOT_GITHUB:${ownership.status}`);
  }
  let liquidationSources=null,manualLiquidationSources=null;
  if(postV7UnifiedEnabled && envText("REPORT2_LIQUIDATION_EXTENSION_MODE",{required:false})==='SHADOW_ONLY'){
    const allowanceSetup=await installSourceAllowances({db:env.DATA_DB,enable_dydx_native:true,enable_swole_discovery:true,now:started,liqflow_key:envText('LIQFLOW_API_KEY',{required:false}),oxarchive_key:oxarchiveApiKey});
    const scopes=allowanceSetup.bindings;
    console.log('LIQUIDATION_SOURCE_ALLOWANCES',JSON.stringify(allowanceSetup));
    // Source admission needs only its own bounded D1 reservation while the
    // mandatory report completion and Telegram lanes retain protected room.
    // Optional analytical sidecars are independently admitted later and must
    // fail closed instead of pre-consuming the source lane's entire headroom.
    const requiredDownstream={
      rows_read:4500+V3_TELEGRAM_LIFECYCLE_SIDECAR_BUDGET.rows_read+BOUND_TELEGRAM_DELIVERY_BUDGET.rows_read,
      rows_written:50+V3_TELEGRAM_LIFECYCLE_SIDECAR_BUDGET.rows_written+BOUND_TELEGRAM_DELIVERY_BUDGET.rows_written,
    };
    const providerAdmit=createD1SourceAdmission({db:env.DATA_DB,scope_bindings:scopes,within_run_budget:e=>evaluateWithinRunReservation({reservation:d1RunReservation,currentUsage:env.DATA_DB.usageSnapshot(),extraRowsRead:requiredDownstream.rows_read+e.extraRowsRead,extraRowsWritten:requiredDownstream.rows_written+e.extraRowsWritten})});
    const sourceWeightStore=createLiquidationSourceWeightStore({db:env.DATA_DB});
    const onGtradeCatalog=raw=>saveGTradeRoutingCatalog({db:env.DATA_DB,raw,db_admit:extra=>evaluateWithinRunReservation({reservation:d1RunReservation,currentUsage:env.DATA_DB.usageSnapshot(),extraRowsRead:requiredDownstream.rows_read+extra.rows_read,extraRowsWritten:requiredDownstream.rows_written+extra.rows_written})});
    let nativeWalletRouting=env.REPORT2_LIQUIDATION_VENUE_REGISTRY?.native_wallet_routing??null;
    let walletSaveQueue=Promise.resolve();
    const onNativeAccounts=payload=>{walletSaveQueue=walletSaveQueue.catch(()=>{}).then(async()=>{const saved=await saveNativeWalletRouting({db:env.DATA_DB,previous:nativeWalletRouting,...payload,db_admit:extra=>evaluateWithinRunReservation({reservation:d1RunReservation,currentUsage:env.DATA_DB.usageSnapshot(),extraRowsRead:requiredDownstream.rows_read+extra.rows_read,extraRowsWritten:requiredDownstream.rows_written+extra.rows_written})});nativeWalletRouting=saved.routing??nativeWalletRouting;return saved;});return walletSaveQueue;};
    let gtradePositionRouting=env.REPORT2_LIQUIDATION_VENUE_REGISTRY?.gtrade_position_routing??null;
    const onGtradePositionRouting=payload=>{walletSaveQueue=walletSaveQueue.catch(()=>{}).then(async()=>{const saved=await saveGTradePositionRouting({db:env.DATA_DB,previous:gtradePositionRouting,...payload,db_admit:extra=>evaluateWithinRunReservation({reservation:d1RunReservation,currentUsage:env.DATA_DB.usageSnapshot(),extraRowsRead:requiredDownstream.rows_read+extra.rows_read,extraRowsWritten:requiredDownstream.rows_written+extra.rows_written})});gtradePositionRouting=saved.routing??gtradePositionRouting;env.REPORT2_LIQUIDATION_VENUE_REGISTRY.gtrade_position_routing=gtradePositionRouting;return saved;});return walletSaveQueue;};
    let dydxRouting=env.REPORT2_LIQUIDATION_VENUE_REGISTRY?.dydx_routing??null;
    const onDydxSnapshot=payload=>{walletSaveQueue=walletSaveQueue.catch(()=>{}).then(async()=>{const saved=await saveDydxRouting({db:env.DATA_DB,previous:dydxRouting,...payload,db_admit:extra=>evaluateWithinRunReservation({reservation:d1RunReservation,currentUsage:env.DATA_DB.usageSnapshot(),extraRowsRead:requiredDownstream.rows_read+extra.rows_read,extraRowsWritten:requiredDownstream.rows_written+extra.rows_written})});dydxRouting=saved.routing??dydxRouting;env.REPORT2_LIQUIDATION_VENUE_REGISTRY.dydx_routing=dydxRouting;return saved;});return walletSaveQueue;};
    liquidationSources=createCombinedLiquidationService({mode:'SHADOW_ONLY',gtrade_position_routing:gtradePositionRouting,gtrade_crypto_assets:dydxCryptoAssets,on_gtrade_position_routing:onGtradePositionRouting,dydx_enabled:Boolean(scopes.DYDX_RPC),dydx_automatic_discovery_enabled:true,dydx_crypto_assets:dydxCryptoAssets,dydx_routing:dydxRouting,on_dydx_snapshot:onDydxSnapshot,official_trades_discovery_enabled:true,gtrade_reserve_rpc_enabled:true,native_wallet_routing:nativeWalletRouting,on_native_accounts:onNativeAccounts,candidate_slots:env.REPORT2_DEEP_RUNTIME_OPTIONS?.max_per_run||1,gtrade_routing_catalog:env.REPORT2_LIQUIDATION_VENUE_REGISTRY?.gtrade_routing_catalog,on_gtrade_catalog:onGtradeCatalog,provider_admit:providerAdmit,fetch_impl:globalThis.fetch,swole_discovery_enabled:Boolean(scopes.SWOLE_DISCOVERY),accounts_per_deep:3,max_http_per_run:5,max_total_ms:45000,liqflow_key:envText('LIQFLOW_API_KEY',{required:false}),oxarchive_config:oxarchiveConfig,source_weight_store:sourceWeightStore});
    manualLiquidationSources=createCombinedLiquidationService({mode:'SHADOW_ONLY',gtrade_position_routing:gtradePositionRouting,gtrade_crypto_assets:dydxCryptoAssets,on_gtrade_position_routing:onGtradePositionRouting,dydx_enabled:Boolean(scopes.DYDX_RPC),dydx_automatic_discovery_enabled:true,dydx_crypto_assets:dydxCryptoAssets,dydx_routing:dydxRouting,on_dydx_snapshot:onDydxSnapshot,official_trades_discovery_enabled:true,gtrade_reserve_rpc_enabled:true,native_wallet_routing:nativeWalletRouting,on_native_accounts:onNativeAccounts,provider_admit:providerAdmit,fetch_impl:globalThis.fetch,swole_discovery_enabled:Boolean(scopes.SWOLE_DISCOVERY),accounts_per_deep:3,max_http_per_run:8,max_total_ms:45000,liqflow_key:envText('LIQFLOW_API_KEY',{required:false}),oxarchive_config:oxarchiveConfig,source_weight_store:sourceWeightStore});
    env.REPORT2_LIQUIDATION_NATIVE_COLLECT=async params=>{const coverageAdmission=liquidationCoverageFor(params.contract);if(!coverageAdmission.eligible){console.log('MAIN_LIQUIDATION_COVERAGE_SKIPPED',JSON.stringify({contract:params.contract,status:coverageAdmission.status,network_calls:0}));return null;}const before=liquidationSources.summary().shared_budget.reserved_http;let acquisition;try{acquisition=await liquidationSources.collect({...params,cache_only:params.cache_only===true||Number(params.max_http_for_candidate)===0,allowed_source_ids:coverageAdmission.source_ids,proven_level_source_ids:coverageAdmission.proven_level_source_ids||[],dydx_position_batch_contracts:env.REPORT2_LIQUIDATION_SELECTED_CONTRACTS?.run_id===params.run_id?(env.REPORT2_LIQUIDATION_SELECTED_CONTRACTS.contracts||[]).filter(code=>liquidationCoverageFor(code).source_ids.includes('DYDX_PINNED_NATIVE')):[],position_batch_contracts:env.REPORT2_LIQUIDATION_SELECTED_CONTRACTS?.run_id===params.run_id?(env.REPORT2_LIQUIDATION_SELECTED_CONTRACTS.contracts||[]).filter(code=>liquidationCoverageFor(code).eligible&&liquidationCoverageFor(code).source_ids.includes('GTRADE_NATIVE')):[]});}finally{futureHttpByContract.set(params.contract,(futureHttpByContract.get(params.contract)??0)+Math.max(0,liquidationSources.summary().shared_budget.reserved_http-before));}const risk=liquidationRiskByContract.get(params.contract);if(risk){risk.source_chain=buildLiquidationSourceChain({contract:params.contract,risk,native:liquidationSources.summary(),coverage:risk.liquidation_venue_coverage,coinlobster:contextForContract(env.REPORT2_GLOBAL_MARKET_CONTEXT,params.contract)?.coinlobster,venue_registry:env.REPORT2_LIQUIDATION_VENUE_REGISTRY});console.log('MAIN_LIQUIDATION_SOURCE_CHAIN',JSON.stringify(risk.source_chain));}return acquisition;};
  }
  if(commandIntent.matched){
    const sourceRunId=`LIQ_ONLY:${started}`;
    const scanResult=await scanLiquidationCandidates({env,max_candidates:5,exact_contract:commandIntent.contract||null,freshness_sec:300});
    await liquidationQueue.enqueue(scanResult?.candidates||[],{wave_id:sourceRunId,now:started});
    let queueClaim=await liquidationQueue.claim({run_id:sourceRunId,preferred_contract:scanResult?.candidates?.[0]?.contract||null,now:started});
    let candidate=queueClaim.claimed&&Array.isArray(scanResult?.candidates)?scanResult.candidates.find(row=>row.contract===queueClaim.contract)||null:null;
    const candidateCoverage=candidate?liquidationCoverageFor(candidate.contract):{status:'NO_SELECTED_CANDIDATE',eligible:false,source_ids:[],network_calls:0};
    console.log('LIQUIDATION_ONLY_COVERAGE_ADMISSION',JSON.stringify({contract:candidate?.contract||null,...candidateCoverage}));
    let acquisition=null,bykFuture=null,bykFutureCalls=0,coinFuture=null,trackedHlFuture=null;
    let liquidationContext={};
    let crossExchangeRisk={status:'NOT_RUN',sources:{},internal_only:true};
    let liquidationVenueCoverage={status:'NOT_RUN',network_calls:0,receipts:[]};
    if(candidate&&candidateCoverage.eligible&&candidateCoverage.source_ids.includes('BYK_TRACKED_HL_BANDS')){
      const grant=await env.REPORT2_BYKARANTELI_RESERVE({contract:candidate.contract,run_id:sourceRunId,units:1,now:Date.now()});
      if(grant.allowed){
        trackedHlFuture=await env.REPORT2_TRACKED_HL_FUTURE_COLLECT({contract:candidate.contract,run_id:sourceRunId,byk_admission:grant,now:Date.now()});
        bykFutureCalls=trackedHlFuture?.network_calls??0;
      }
    }
    if(candidate&&candidateCoverage.eligible&&manualLiquidationSources){
      const collectFor=async row=>{
        const contract=String(row.contract||'').trim().toUpperCase(),nativeSymbol=contract.replace(/-USDT$/,'');
        const sourceIdentity=env.REPORT2_LIQUIDATION_VENUE_REGISTRY?.entries?.[nativeSymbol]||null;
        try{return await manualLiquidationSources.collect({contract,native_symbol:nativeSymbol,run_id:sourceRunId,deep_started_ts:Date.now(),max_deep_ms:45000,max_http_for_candidate:Math.max(0,8-bykFutureCalls),early_candidate_bridge:row.qualified_growth_candidate===true,early_candidate_quality_0_100:row.qualified_growth_candidate===true?Math.min(100,60+Number(row.anomaly_flags_count||0)*5):null,manual_liquidation_request:true,source_identity:sourceIdentity,allowed_source_ids:candidateCoverage.source_ids});}
        catch(error){console.log('LIQUIDATION_ONLY_SOURCE_ERROR',JSON.stringify({contract,error:String(error?.message||error)}));return null;}
      };
      acquisition=await collectFor(candidate);
      // Continue through sources for this exact candidate; another coin's
      // coverage must not replace missing observations for the selected coin.
      const contract=String(candidate.contract||'').trim().toUpperCase();
      if(acquisition){
        const observedTs=Date.now();
        liquidationContext=attachNativeContext({},acquisition,{contract,run_id:sourceRunId,snapshot_id:`LIQ_ONLY_SNAPSHOT:${started}`,observed_ts:observedTs,direction:null});
      }

    }
    if(candidate&&candidateCoverage.eligible){try{crossExchangeRisk=await env.REPORT2_CROSS_EXCHANGE_RISK_COLLECT({contract:candidate.contract,run_id:sourceRunId,reference_price:candidate.current_price,now:Date.now(),allowed_lanes:['REALIZED','HISTORY'],lane_override:'HISTORY'});}catch{crossExchangeRisk={status:'SOURCE_ERROR',sources:{},network_calls:3,internal_only:true};}
      const grant=unifiedHttpBudget.reserve({logical_request_id:`LIQUIDATION_VENUE_COVERAGE:${sourceRunId}`,lane:'background',attempts:Math.max(1,Math.min(3,8-bykFutureCalls-(coinFuture?.network_calls??0)-(manualLiquidationSources?.summary().shared_budget.reserved_http??0)))});
      liquidationVenueCoverage=await probeLiquidationVenueCoverage({db:env.DATA_DB,fetch_impl:globalThis.fetch,contract:candidate.contract,now:Date.now(),max_http:grant.allowed&&!grant.duplicate?Math.min(3,Math.max(0,8-bykFutureCalls-(coinFuture?.network_calls??0)-(manualLiquidationSources?.summary().shared_budget.reserved_http??0))):0});
    }
    const contexts=nativeLiquidationSources(liquidationContext).contexts;
    const volumeProfile=candidate&&candidateCoverage.eligible?await collectReadyHtxVolumeProfile({contract:candidate.contract,run_id:sourceRunId,request_admit:unifiedHttpBudget.reserve,fetch_impl:globalThis.fetch}):null;
    const volumeConsensus=selectComparableVolumeProfiles({contract:candidate?.contract,now:Date.now(),reference_price:candidate?.current_price,peer_sources:crossExchangeRisk.volume_profiles?.sources||{}});
    const effectiveVolumeProfile=volumeConsensus.primary?.status==='CLOSED'?volumeConsensus.primary:volumeProfile;
    const rawLiquidationPanel=candidate?.current_price?buildDynamicLiquidationPanel({contexts,reference_price:candidate.current_price,observed_ts:Date.now()}):{status:'NOT_CLOSED',reason:'REFERENCE_PRICE_REQUIRED',clusters:[],score_evidence:null};
    const liquidationPanel=applyVolumeProfileToLiquidationPanel(rawLiquidationPanel,effectiveVolumeProfile,{contract:candidate?.contract,now:Date.now(),reference_price:candidate?.current_price,consensus_factor:volumeConsensus.factor});
    const futureMapSource=null;
    const trackedHlView=candidate&&candidateCoverage.source_ids.includes('BYK_TRACKED_HL_BANDS')?capturedTrackedBands({contract:candidate.contract,run_id:sourceRunId,observed_ts:Date.now()}):{status:'NOT_REQUESTED_BY_COVERAGE_GATE',maps:[]};
    const liquidationMap=candidate&&candidateCoverage.eligible?buildPumpLiquidationZones({
      provider_maps:[...(trackedHlView.maps||[]),...capturedNativeFutureMaps({contract:candidate.contract,run_id:sourceRunId})],native_contexts:contexts,observed_ts:Date.now(),
      contract:candidate.contract,
      rolling_24h_change_pct:null,
      current_price:candidate.current_price,
      early_anomaly:candidate.qualified_growth_candidate===true,
      priority_reason:candidate.qualified_growth_candidate===true?'EARLY_TECHNICAL_ANOMALY':'MANUAL_LIQUIDATION_REQUEST',
      projected:[],
      calculation_context:{
        source_ts:candidate.source_ts,
        market_source_ts:candidate.source_ts,
        open_interest_value_usdt:candidate.open_interest_value_usdt,
        turnover_24h_usdt:candidate.turnover_24h_usdt,
        oi_change_pct:candidate.oi_change_pct??{},
        price_change_pct:candidate.price_change_pct??{},
        funding_rate_pct:candidate.funding_rate_pct,
        market_24h:candidate.market_24h??null,
        price_tick:candidate.price_tick,
        volume_ratio:null,
      },
      volume_profile:effectiveVolumeProfile,
    }):{status:'NOT_CLOSED',reason:candidate?candidateCoverage.status:'NO_SELECTED_CANDIDATE',future_levels_status:'NOT_AVAILABLE',provider_zone_count:0,calculated_zone_count:0,above:[],below:[],calculated_fallback_enabled:false};
    const scopedCoinLobster=candidate?contextForContract(env.REPORT2_GLOBAL_MARKET_CONTEXT,candidate.contract)?.coinlobster:null;
    const sourceChain=buildLiquidationSourceChain({contract:candidate?.contract,risk:crossExchangeRisk,native:manualLiquidationSources?.summary()??{},coverage:liquidationVenueCoverage,coinlobster:scopedCoinLobster,future_models:coinFuture,byk_future:bykFuture,tracked_hl:trackedHlView,htx_model:liquidationMap.htx_source_backed_model,venue_registry:env.REPORT2_LIQUIDATION_VENUE_REGISTRY});
    const freshnessAudit=buildLiquidationFreshnessAudit(sourceChain);
    const liquidationPolicy=liquidationPresentationPolicy(started);
    const nativeLines=candidate?formatStandaloneLiquidationSourceLines(liquidationContext,{policy:liquidationPolicy}):[];
    const lines=candidate&&!candidateCoverage.eligible?[`${candidate.contract}: проверенных источников с реальными будущими уровнями сейчас нет. Ликвидационный анализ для этой монеты не запускается.`]:candidate?[
      ...displayLegacyLiquidations(liquidationMap,{policy:liquidationPolicy}),
      ...formatCoinLobsterFutureLines(coinFuture,{policy:liquidationPolicy}),
      ...formatLiquidationChainSummary(sourceChain),
      ...formatLiquidationHistoryFacts(crossExchangeRisk,{user_ru:true}),
      ...volumeProfileFacts(effectiveVolumeProfile,{contract:candidate.contract,now:Date.now(),reference_price:candidate.current_price}).slice(0,1).map(f=>`${f.label}: ${f.value} ${f.unit}.`),
      ...(volumeConsensus.status==='MULTI_VENUE_CONFIRMED'?[`Профиль объёма: совпадение HTX + ${volumeConsensus.confirmations.map(p=>p.source).join(' + ')}.`]:volumeConsensus.status==='CONFLICT'?['Профили площадок расходятся: вклад объёма в итоговый балл нейтрализован.']:[]),
      ...(liquidationPanel.clusters||[]).filter(c=>c.volume_profile_confluence?.length).map(c=>`Зона ${c.center_price} USDT совпадает с ${c.volume_profile_confluence.map(x=>x.name).join(' / ')} профиля HTX; дополнительный приоритет проверки.`),
      ...(nativeLines.length&&contexts.some(ctx=>ctx.status==='USABLE_RECEIPT_ONLY_CONTEXT')?['Ограниченная выборка площадок и оценочные зоны источников; время обновления позиций неизвестно:',...nativeLines]:[]),
    ]:[];
    const calibrationRecord=candidate?await liquidationCalibration.record({contract:candidate.contract,panel:liquidationPanel,cross_exchange_risk:crossExchangeRisk,reference_price:candidate.current_price,observed_ts:Date.now()}):{status:'NOT_RECORDED',rows:0};
    const predictiveSourceWeights=await liquidationCalibration.summary();
    if(queueClaim.claimed&&candidate)await liquidationQueue.complete({contract:candidate.contract,wave_id:queueClaim.wave_id,task_kind:queueClaim.task_kind,run_id:sourceRunId,usable:Boolean(acquisition)||crossExchangeRisk.status==='CLOSED',now:Date.now()});
    const liquidationQueueSummary=await liquidationQueue.summary({now:Date.now()});
    if(pending.length)await Promise.all(pending);
    const d1PostCycleBudget=evaluateWithinRunReservation({reservation:d1RunReservation,currentUsage:env.DATA_DB.usageSnapshot(),extraRowsWritten:1});
    if(!d1PostCycleBudget.allowed)throw new Error(`D1_LIQUIDATION_ONLY_RESERVATION_EXCEEDED:${(d1PostCycleBudget.reasons||[]).join(',')}`);
    const d1Usage=enforceR88RunBudget(env.DATA_DB,{reservation:d1RunReservation,dayAdmission:d1DayAdmission,runsPerDay:envNumber("REPORT2_D1_RUNS_PER_DAY",288),maxDailyReads:envNumber("REPORT2_D1_MAX_DAILY_READS",3500000),maxDailyWrites:envNumber("REPORT2_D1_MAX_DAILY_WRITES",70000)});
    const d1FinalizedUsage=await finalizeRunUsage(env.DATA_DB,{reservationId:d1ReservationId,sourceRunId,now:Date.now(),usage:env.DATA_DB.usageSnapshot()});
    const result={ok:true,version:RUNNER_VERSION,mode:commandIntent.mode,command:commandIntent.normalized,exact_contract:commandIntent.contract||null,status:candidate&&!candidateCoverage.eligible?'NO_VERIFIED_REAL_LEVEL_SOURCE':freshnessAudit.complete?scanResult.status:'PARTIAL_SOURCE_COVERAGE',scan:scanResult.scan,preliminary_candidates:scanResult.candidates,verified_candidate:candidate?.contract||null,coverage_admission:candidateCoverage,coverage_summary:liquidationCoverageSummary,liquidation_lines:lines,liquidation_map:liquidationMap,future_map_source:futureMapSource,future_provider_models:coinFuture,byk_future:bykFuture,tracked_hl_future:trackedHlView,future_levels_status:liquidationMap.future_levels_status,dynamic_liquidation_panel:liquidationPanel,volume_profile:effectiveVolumeProfile,volume_profile_consensus:volumeConsensus,cross_exchange_risk:crossExchangeRisk,source_chain:sourceChain,freshness_audit:freshnessAudit,liquidation_venue_coverage:liquidationVenueCoverage,liquidation_sources:manualLiquidationSources?manualLiquidationSources.summary():{status:'NOT_CONFIGURED_FAIL_CLOSED'},liquidation_candidate_queue:liquidationQueueSummary,outcome_calibration:{settlement:liquidationCalibrationSettlement,record:calibrationRecord,predictive_source_weights:predictiveSourceWeights},global_market_context:{status:env.REPORT2_GLOBAL_MARKET_CONTEXT?.status||'NOT_CLOSED',coinlobster_liquidation_status:scopedCoinLobster?.status||'NOT_CLOSED',coinlobster_cache_status:scopedCoinLobster?.cache_status||null,coinlobster_network_calls:scopedCoinLobster?.network_calls??0,coinlobster_matching_liquidation_rows:scopedCoinLobster?.realized_liquidations?.length||0,coinlobster_matching_named_events:scopedCoinLobster?.named_liquidations?.length||0,deribit:'NOT_APPLICABLE_LIQUIDATION_ONLY',internal_only:true},full_report_started:false,decision_generated:false,probability:null,validated_signal:false,telegram_started:false,execution:false,request_caps:{projected_liquidation:0,cross_exchange_risk:candidateCoverage.eligible?3:0,volume_profile:candidateCoverage.eligible?3:0,volume_profile_peers:candidateCoverage.eligible?4:0,total:candidateCoverage.eligible?15:0},d1_post_cycle_budget:d1PostCycleBudget,d1_finalized_usage:d1FinalizedUsage,d1_usage:d1Usage};
    const leaseFinish=await releaseAnalyticsLease();
    if(!leaseFinish.finished)throw new Error(`ANALYTICS_LEASE_FINISH_FAILED:${leaseFinish.status}`);
    const renderedResult=JSON.stringify({...result,analytics_lease:leaseFinish});
    console.log('LIQUIDATION_ONLY_RESULT',renderedResult);
    const commandCompletion=await completeCommand(env.DATA_DB,{command_id:manualCommandId,actor:manualCommandActor,snapshot_id:`LIQ_ONLY_SNAPSHOT:${started}`,rendered_text:renderedResult,delivered_to_existing_channel:true,now:Date.now()});
    if(!commandCompletion.completed)throw new Error(`DURABLE_MANUAL_COMMAND_COMPLETION_FAILED:${commandCompletion.status}`);
    console.log('DURABLE_MANUAL_COMMAND_COMPLETION',JSON.stringify(commandCompletion));
    const reportText=formatLiquidationRunSummary({status:scanResult.status,scan:scanResult.scan,preliminary_candidates:scanResult.candidates,verified_candidate:candidate?.contract||null,liquidation_lines:[`Проверки покрытия: ${freshnessAudit.fresh_coverage_check_count} из ${freshnessAudit.required_source_count}; прямые свежие обращения: ${freshnessAudit.direct_network_check_count} из ${freshnessAudit.required_source_count}; пригодные будущие данные: ${freshnessAudit.fresh_data_used_count} из ${freshnessAudit.required_source_count}.`,...lines]});
    const liquidationRunOutput={schema:'my-report-2-liquidation-run-output-v1',generation,head:sha,source,run_id:sourceRunId,mode:'LIQUIDATION_ONLY',status:candidate&&!candidateCoverage.eligible?'NO_VERIFIED_REAL_LEVEL_SOURCE':reportText?(freshnessAudit.complete?'CLOSED':'PARTIAL_SOURCE_COVERAGE'):'NOT_CLOSED',coverage_admission:candidateCoverage,coverage_summary:liquidationCoverageSummary,
      verified_candidate:candidate?.contract||null,preliminary_candidates:(scanResult.candidates||[]).map(row=>row.contract).slice(0,5),
      liquidation_lines:lines,liquidation_map:liquidationMap,future_map_source:futureMapSource,future_provider_models:coinFuture,byk_future:bykFuture,tracked_hl_future:trackedHlView,future_levels_status:liquidationMap.future_levels_status,future_level_count:liquidationMap.provider_zone_count,source_chain:sourceChain,freshness_audit:freshnessAudit,factual_history:crossExchangeRisk.sources,report_text:reportText,generated_at:new Date().toISOString(),secrets_included:false,alternative_manual_recalculation:false,telegram_started:false};
    await fs.writeFile('report2-run-result.json',JSON.stringify(liquidationRunOutput,null,2));
    return;
  }
  const queueClaimRunId=`QUEUE:${started}`;
  const scheduledQueueClaim=source==='schedule'&&!env.REPORT2_TRIGGERED_RECHECK_TASK_ID?await liquidationQueue.claim({run_id:queueClaimRunId,now:started}):{claimed:false,status:'MANUAL_FULL_REPORT_DOES_NOT_CLAIM_QUEUE'};
  if(scheduledQueueClaim.claimed){env.REPORT2_LIQUIDATION_QUEUE_CONTRACT=scheduledQueueClaim.contract;env.REPORT2_LIQUIDATION_QUEUE_ATTEMPTS=String(scheduledQueueClaim.attempts||0);env.REPORT2_LIQUIDATION_QUEUE_COMPLETE=params=>liquidationQueue.complete({contract:scheduledQueueClaim.contract,wave_id:scheduledQueueClaim.wave_id,task_kind:scheduledQueueClaim.task_kind,run_id:queueClaimRunId,usable:params?.usable===true,result:params?.result??null,now:Date.now()});}
  console.log('LIQUIDATION_CANDIDATE_QUEUE_CLAIM',JSON.stringify(scheduledQueueClaim));
  const leaseRenewal=await renewAnalyticsLease(env.DATA_DB,analyticsLease,{now:Date.now()});
  if(!leaseRenewal.allowed)throw new Error(`ANALYTICS_FENCE_LOST_BEFORE_WORKER:${leaseRenewal.status}`);
  const CURRENT_CYCLE_DOWNSTREAM_RESERVE=Object.freeze({rows_read:4500,rows_written:50});
  const earlyCycleContext={};
  env.REPORT2_CURRENT_CYCLE_EARLY_PERSIST=async({current_scan_ts,source_run_id,now_ts,preferred_contracts=[],selected_only=false}={})=>{
    const gate=evaluateWithinRunReservation({
      reservation:d1RunReservation,
      currentUsage:env.DATA_DB.usageSnapshot(),
      extraRowsRead:CURRENT_CYCLE_DOWNSTREAM_RESERVE.rows_read+(selected_only&&earlyCycleContext.loaded?64:V3_EARLY_SIDECAR_BUDGET.rows_read),
      extraRowsWritten:CURRENT_CYCLE_DOWNSTREAM_RESERVE.rows_written+V3_EARLY_SIDECAR_BUDGET.rows_written,
    });
    if(!gate.allowed){
      const blocked={version:"v3-early-sidecar-shadow-v1",mode:"SHADOW_ONLY",status:"CAPACITY_DEFERRED_FAIL_CLOSED",persisted:0,reasons:gate.reasons||[],capacity_lane:"CURRENT_CYCLE_EARLY_PERSISTENCE",capacity_gate:gate,probability:null,validated_signal:false,trading_execution:false};
      env.REPORT2_CURRENT_CYCLE_EARLY_RESULT=blocked;
      return blocked;
    }
    const result=await runV3EarlyPersistenceSidecar(env.DATA_DB,{
      current_scan_ts:Number(current_scan_ts),
      source_run_id:String(source_run_id||""),
      now_ts:Number(now_ts)||Date.now(),
      preferred_contracts,selected_only,cycle_context:earlyCycleContext,
    });
    env.REPORT2_CURRENT_CYCLE_EARLY_RESULT=result;
    return result;
  };
  const stage0HttpGrant=unifiedHttpBudget.reserve({logical_request_id:`STAGE0:${started}`,lane:'hot',attempts:4});
  if(!stage0HttpGrant.allowed)throw new Error('STAGE0_HTTP_NOT_ADMITTED');
  await worker.scheduled({ scheduledTime: started, cron: source === "schedule" ? "ROTATING_EXACT_20_MINUTES" : "manual" }, env, ctx);
  const leaseAfterWorker=await assertAnalyticsFence(env.DATA_DB,analyticsLease,{now:Date.now()});
  if(!leaseAfterWorker.allowed)throw new Error(`ANALYTICS_FENCE_LOST_AFTER_WORKER:${leaseAfterWorker.status}`);
  if(liquidationSources)console.log('LIQUIDATION_SOURCES_CANONICAL_RECEIPT',JSON.stringify(liquidationSources.summary()));
  console.log('LIQUIDATION_PREDICTIVE_SOURCE_WEIGHTS_FINAL',JSON.stringify(await liquidationCalibration.summary()));
  if (pending.length) await Promise.all(pending);
  const cron = await env.DATA_DB.prepare("SELECT run_id,scheduled_time,started_ts,completed_ts,status,universe_total,scanned,persistence_status,error_text,v3_discovery_shortlist_count,v3_live_shortlist_count,v3_live_deep_check_count,v3_live_zero_reason,v3_pipeline_health_status,v3_pipeline_health_reason,v3_live_lane,v3_maintenance_deferred FROM cron_runs WHERE scheduled_time = ?1 ORDER BY started_ts DESC LIMIT 1").bind(started).first();
  if (!cron) throw new Error(`CRON_IDENTITY_NOT_FOUND:${started}`);
  if (Number(cron.scheduled_time) !== Number(started)) throw new Error(`CRON_IDENTITY_MISMATCH:${cron.scheduled_time}!=${started}`);
  if (cron.status !== "SUCCESS" || cron.completed_ts == null) throw new Error(`CRON_IDENTITY_NOT_SUCCESS:${JSON.stringify(cron)}`);
  console.log("CRON_IDENTITY_BINDING", JSON.stringify({ expected_scheduled_time:started, selected_scheduled_time:Number(cron.scheduled_time), run_id:String(cron.run_id || "") }));
  const scan = await env.DATA_DB.prepare("SELECT ts,universe_total,scanned,errors,stale,stage0_coverage_pct FROM scan_runs WHERE ts BETWEEN ?1 AND ?2 ORDER BY ABS(ts - ?3) ASC LIMIT 1").bind(Number(cron.started_ts), Number(cron.completed_ts), Number(cron.started_ts)).first();
  console.log("SCAN_IDENTITY_BINDING", JSON.stringify({ cron_started_ts:Number(cron.started_ts), cron_completed_ts:Number(cron.completed_ts), selected_scan_ts:Number(scan?.ts || 0) || null }));
  assertClosedCron(cron, scan);
  console.log("R8_8_D1_PRE_SIDECARS_USAGE", JSON.stringify({reservation:d1RunReservation,usage:env.DATA_DB.usageSnapshot()}));
  // V3 Telegram journal may persist state before network delivery is enabled.
  // Network delivery itself remains fail-closed until the dedicated env gate is on.
  const v3TelegramJournalEnabled = ["1","true","yes","on"].includes(String(process.env.REPORT2_V3_TELEGRAM_JOURNAL_ENABLED || "0").trim().toLowerCase());
  const v3TelegramNetworkRequested = ["1","true","yes","on"].includes(String(process.env.REPORT2_V3_TELEGRAM_NETWORK_ENABLED || "0").trim().toLowerCase());
  const v3LegacyTelegramOutputEnabled = ["1","true","yes","on"].includes(String(process.env.REPORT2_TELEGRAM_OUTPUT_ENABLED || "0").trim().toLowerCase());
  const v3TelegramNetworkEnabled = v3TelegramNetworkRequested && v3LegacyTelegramOutputEnabled;
  const telegramInstallValidation = ["1","true","yes","on"].includes(String(process.env.REPORT2_TELEGRAM_INSTALL_VALIDATION || "0").trim().toLowerCase());
  const telegramReportTestRequested = ["1","true","yes","on"].includes(String(process.env.REPORT2_TELEGRAM_REPORT_TEST || "0").trim().toLowerCase());
  const postV7OwnerTelegramTestEnabled = postV7UnifiedEnabled && telegramInstallValidation && telegramReportTestRequested && v3TelegramNetworkEnabled;
  let v3TelegramLifecycleSidecar=null;
  const runTelegramLayer = async () => {
    const budget = evaluateWithinRunReservation({
      reservation:d1RunReservation,
      currentUsage:env.DATA_DB.usageSnapshot(),
      extraRowsRead:INFO_D1_BUDGET.rowsRead,
      extraRowsWritten:INFO_D1_BUDGET.rowsWritten,
    });
    let output;
    if (!budget.allowed) {
      output = buildBudgetBlockedTelegramOutput({
        enabled:envText("REPORT2_TELEGRAM_OUTPUT_ENABLED", { required: false }),
        infoEnabled:envText("REPORT2_TELEGRAM_INFO_ENABLED", { required: false }),
        shadowDecisionAuto:envText("REPORT2_TELEGRAM_SHADOW_DECISION_AUTO", { required: false }),
      });
      output.shadow_decision.skipped[0].reason=budget.status;
    } else output = await runTelegramOutputLayer({
      db: env.DATA_DB,
      scan,
      startedTs: started,
      source,
      relayUrl: envText("REPORT2_TELEGRAM_RELAY_URL", { required: false }),
      relayKey: envText("REPORT2_TELEGRAM_RELAY_KEY", { required: false }),
      reportTest: envText("REPORT2_TELEGRAM_REPORT_TEST", { required: false }),
      shadowDecisionAuto: envText("REPORT2_TELEGRAM_SHADOW_DECISION_AUTO", { required: false }),
      watch70Enabled: envText("REPORT2_TELEGRAM_WATCH70_ENABLED", { required: false }),
      watch70Threshold: envText("REPORT2_TELEGRAM_WATCH70_THRESHOLD", { required: false }),
      infoEnabled: envText("REPORT2_TELEGRAM_INFO_ENABLED", { required: false }),
      infoTestId: envText("REPORT2_TELEGRAM_INFO_TEST_ID", { required: false }),
      infoObserveEnabled: envText("REPORT2_TELEGRAM_INFO_OBSERVE_ENABLED", { required: false }),
      currentLifecycle: telegramInstallValidation && telegramReportTestRequested ? null : (v3TelegramLifecycleSidecar || {status:"LIFECYCLE_NOT_RUN"}),
      // The bound canonical publisher owns OBSERVE, WAIT and ENTRY in post-v7.
      // Keeping the legacy sender disabled prevents duplicate or differently
      // qualified messages from bypassing the canonical technical-move filter.
      enabled: postV7UnifiedEnabled ? (postV7OwnerTelegramTestEnabled ? "1" : "0") : (v3TelegramNetworkEnabled ? "0" : envText("REPORT2_TELEGRAM_OUTPUT_ENABLED", { required: false })),
      fetchImpl: nativeFetch,
    });
    return {budget,output};
  };
  let d1PreTelegramBudget=null;
  let telegramOutput=null;
  // The single owner-authorized delivery test runs before optional sidecars so
  // its bounded D1 envelope cannot be consumed by unrelated shadow observers.
  // Scheduled production and ordinary manual runs retain their original order.
  if (telegramInstallValidation && telegramReportTestRequested) {
    ({budget:d1PreTelegramBudget,output:telegramOutput}=await runTelegramLayer());
  }
  // R8.8 adaptive burst budget: preserve downstream reserve while guaranteeing one bounded early-persistence slot under the R8.8 observed high-write state.
  // Raw factual liquidations are already upstream-persisted; compact aggregation may defer fail-closed without source loss.
  const R88_DOWNSTREAM_RESERVE = Object.freeze({rows_read:4500,rows_written:50});
  const postV7CriticalLaneReserve = postV7UnifiedEnabled ? Object.freeze({
    rows_read:R88_DOWNSTREAM_RESERVE.rows_read + V3_TELEGRAM_LIFECYCLE_SIDECAR_BUDGET.rows_read + BOUND_TELEGRAM_DELIVERY_BUDGET.rows_read,
    rows_written:R88_DOWNSTREAM_RESERVE.rows_written + V3_TELEGRAM_LIFECYCLE_SIDECAR_BUDGET.rows_written + BOUND_TELEGRAM_DELIVERY_BUDGET.rows_written,
  }) : R88_DOWNSTREAM_RESERVE;
  const r88Gate = (envelope) => evaluateWithinRunReservation({
    reservation:d1RunReservation,
    currentUsage:env.DATA_DB.usageSnapshot(),
    extraRowsRead:postV7CriticalLaneReserve.rows_read + envelope.rows_read,
    extraRowsWritten:postV7CriticalLaneReserve.rows_written + envelope.rows_written,
  });
  const v3SidecarsPreactionBudget = evaluateWithinRunReservation({
    reservation:d1RunReservation,
    currentUsage:env.DATA_DB.usageSnapshot(),
    extraRowsRead:postV7CriticalLaneReserve.rows_read,
    extraRowsWritten:postV7CriticalLaneReserve.rows_written,
  });
  const v3Blocked = (version, gate, lane) => ({version,mode:"SHADOW_ONLY",status:"CAPACITY_DEFERRED_FAIL_CLOSED",persisted:0,reasons:gate?.reasons||[],capacity_lane:lane,capacity_gate:gate,probability:null,validated_signal:false,trading_execution:false});
  const completedHandoffBudget=evaluateWithinRunReservation({reservation:d1RunReservation,currentUsage:env.DATA_DB.usageSnapshot(),extraRowsRead:V3_TELEGRAM_LIFECYCLE_SIDECAR_BUDGET.rows_read,extraRowsWritten:0});
  const completedLifecycleHandoffs = completedHandoffBudget.allowed
    ? await loadCompletedLifecycleHandoffs(env.DATA_DB,{source_run_id:String(cron.run_id||""),now_ts:Date.now()})
    : {status:"BUDGET_BLOCKED_FAIL_CLOSED",handoffs:[]};
  console.log("TELEGRAM_COMPLETED_HANDOFFS",JSON.stringify({status:completedLifecycleHandoffs.status,contracts:completedLifecycleHandoffs.handoffs.map(h=>h.contract_code)}));
  let v3EarlySidecar;
  let v3RealizedLiquidationSidecar;
  let v3LiquidationSidecar;
  const r88EarlyGate = env.REPORT2_CURRENT_CYCLE_EARLY_RESULT?.capacity_gate || {allowed:["CLOSED","PARTIAL"].includes(String(env.REPORT2_CURRENT_CYCLE_EARLY_RESULT?.status||"").toUpperCase()),status:"CURRENT_CYCLE_RESULT"};
  v3EarlySidecar = env.REPORT2_CURRENT_CYCLE_EARLY_RESULT || v3Blocked("v3-early-sidecar-shadow-v1",r88EarlyGate,"CURRENT_CYCLE_EARLY_PERSISTENCE");
  const r88RealizedGate = v3SidecarsPreactionBudget.allowed ? r88Gate(V3_REALIZED_LIQUIDATION_SIDECAR_BUDGET) : v3SidecarsPreactionBudget;
  if (r88RealizedGate.allowed) {
    v3RealizedLiquidationSidecar = await runV3RealizedLiquidationSidecar(env.DATA_DB, {
      current_scan_ts:Number(scan.ts), source_run_id:String(cron.run_id || ""), now_ts:started,
    });
  } else v3RealizedLiquidationSidecar = v3Blocked("v3-realized-liquidation-sidecar-shadow-v1",r88RealizedGate,"REALIZED_LIQUIDATION_AGGREGATION");
  const r88ProjectedGate = v3SidecarsPreactionBudget.allowed ? r88Gate(V3_LIQUIDATION_SIDECAR_BUDGET) : v3SidecarsPreactionBudget;
  if (r88ProjectedGate.allowed) {
    v3LiquidationSidecar = await runV3LiquidationIntelligenceSidecar(env.DATA_DB, {
      current_scan_ts:Number(scan.ts), source_run_id:String(cron.run_id || ""), now_ts:started,
    });
  } else v3LiquidationSidecar = v3Blocked("v3-liquidation-intelligence-sidecar-shadow-v1",r88ProjectedGate,"PROJECTED_LIQUIDATION");
  console.log("R8_8_BUDGET_GATES", JSON.stringify({downstream_reserve:R88_DOWNSTREAM_RESERVE,early:r88EarlyGate,realized:r88RealizedGate,projected:r88ProjectedGate,usage:env.DATA_DB.usageSnapshot()}));
  console.log("V3_EARLY_PERSISTENCE_SIDECAR", JSON.stringify(v3EarlySidecar));
  console.log("V3_REALIZED_LIQUIDATION_SIDECAR", JSON.stringify(v3RealizedLiquidationSidecar));
  console.log("V3_LIQUIDATION_INTELLIGENCE_SIDECAR", JSON.stringify(v3LiquidationSidecar));
  const telegramObserver = await observeNaturalTelegramDecision(env.DATA_DB);
  // Low-priority statistical replay must never consume capacity before Early,
  // liquidations, Telegram lifecycle or Telegram delivery. It is evaluated later.
  let discoveryRecallKpi = telegramInstallValidation
    ? {status:"SKIPPED_OWNER_TELEGRAM_VALIDATION",shadow_only:true,auto_send:false}
    : {status:"DEFERRED_LOW_PRIORITY_UNTIL_AFTER_CRITICAL_LANES",shadow_only:true,auto_send:false};
  const lifecyclePreactionBudget=evaluateWithinRunReservation({reservation:d1RunReservation,currentUsage:env.DATA_DB.usageSnapshot(),
    extraRowsRead:V3_TELEGRAM_LIFECYCLE_SIDECAR_BUDGET.rows_read+INFO_D1_BUDGET.rowsRead+(postV7UnifiedEnabled?BOUND_TELEGRAM_DELIVERY_BUDGET.rows_read:0),
    extraRowsWritten:V3_TELEGRAM_LIFECYCLE_SIDECAR_BUDGET.rows_written+INFO_D1_BUDGET.rowsWritten+1+(postV7UnifiedEnabled?BOUND_TELEGRAM_DELIVERY_BUDGET.rows_written:0)});
  if (!lifecyclePreactionBudget.allowed) {
    v3TelegramLifecycleSidecar = {version:"v3-telegram-lifecycle-sidecar-shadow-v1",mode:"SHADOW_ONLY",status:"BUDGET_BLOCKED_FAIL_CLOSED",network_send:false,dispatch_enabled:v3TelegramJournalEnabled,reasons:lifecyclePreactionBudget.reasons||[]};
  } else {
    v3TelegramLifecycleSidecar = await runV3TelegramLifecycleSidecar(env.DATA_DB, {
      source_run_id:String(cron.run_id || ""), now_ts:Date.now(),
      d1_pretelegram_budget_closed:lifecyclePreactionBudget.allowed, dispatch_enabled:v3TelegramJournalEnabled,
      completed_handoffs:completedLifecycleHandoffs, canonical_required:postV7UnifiedEnabled,
    });
  }
  console.log("V3_TELEGRAM_LIFECYCLE_SIDECAR", JSON.stringify(v3TelegramLifecycleSidecar));
  if (telegramOutput === null) {
    ({budget:d1PreTelegramBudget,output:telegramOutput}=await runTelegramLayer());
  }
  await fs.writeFile("telegram-info-proof.json",JSON.stringify({schema:"telegram-info-proof-v1",head:process.env.GITHUB_SHA||null,source,source_run_id:String(cron.run_id||""),lifecycle:v3TelegramLifecycleSidecar,candidate_sha:process.env.REPORT2_TELEGRAM_INFO_TEST_ID||null,v3_telegram_network_enabled:v3TelegramNetworkEnabled,output:telegramOutput,live_probability:null,validated_signal:false,execution:false,automatic_weight_tuning:false},null,2));
  const telegramZeroReason = classifyZeroTelegram({ preBudget:d1PreTelegramBudget, telegramObserver, telegramOutput });
  const v3RealizedFeedStatus = String(v3RealizedLiquidationSidecar?.status || "UNKNOWN").toUpperCase();
  const v3ProjectedFeedStatus = String(v3LiquidationSidecar?.status || "UNKNOWN").toUpperCase();
  const v3CriticalFeedState = (v3RealizedFeedStatus.startsWith("CLOSED") && v3ProjectedFeedStatus.startsWith("CLOSED")) ? "OK" : "UNAVAILABLE";
  let v3PipelineHealthSidecar;
  const healthBudget=postV7UnifiedEnabled?evaluateWithinRunReservation({reservation:d1RunReservation,currentUsage:env.DATA_DB.usageSnapshot(),extraRowsRead:8+BOUND_TELEGRAM_DELIVERY_BUDGET.rows_read,extraRowsWritten:5+BOUND_TELEGRAM_DELIVERY_BUDGET.rows_written}):v3SidecarsPreactionBudget;
  if (!healthBudget.allowed) {
    v3PipelineHealthSidecar = {version:"v3-pipeline-health-sidecar-shadow-v1",mode:"SHADOW_ONLY",status:"BUDGET_BLOCKED_FAIL_CLOSED",market_signal:false,reasons:v3SidecarsPreactionBudget.reasons||[]};
  } else {
    v3PipelineHealthSidecar = await runV3PipelineHealthSidecar(env.DATA_DB, {cron,scan,telegram_zero_reason:telegramZeroReason,critical_feed_state:v3CriticalFeedState,now_ts:Date.now()});
  }
  console.log("V3_PIPELINE_HEALTH_SIDECAR", JSON.stringify(v3PipelineHealthSidecar));
  let v3TelegramDeliverySidecar;
  const postV7DeliveryBudget = postV7UnifiedEnabled ? evaluateWithinRunReservation({reservation:d1RunReservation,currentUsage:env.DATA_DB.usageSnapshot(),extraRowsRead:BOUND_TELEGRAM_DELIVERY_BUDGET.rows_read,extraRowsWritten:BOUND_TELEGRAM_DELIVERY_BUDGET.rows_written+1}) : d1PreTelegramBudget;
  if (!postV7DeliveryBudget.allowed) {
    v3TelegramDeliverySidecar = {version:postV7UnifiedEnabled?"post-v7-bound-telegram-delivery-v1-20260926":"v3-telegram-delivery-sidecar-shadow-v1",mode:postV7UnifiedEnabled?"CANONICAL_BOUND_DELIVERY":"SHADOW_GATED_DELIVERY",status:"BUDGET_BLOCKED_FAIL_CLOSED",network_send:false,sent:0,reasons:postV7DeliveryBudget.reasons||[]};
  } else {
    const deliveryArgs={enabled:v3TelegramNetworkEnabled,relay_url:envText("REPORT2_TELEGRAM_RELAY_URL", { required:false }),relay_key:envText("REPORT2_TELEGRAM_RELAY_KEY", { required:false }),source_run_id:String(cron.run_id||""),now_ts:Date.now(),fetch_impl:nativeFetch};
    v3TelegramDeliverySidecar = postV7UnifiedEnabled
      ? await runBoundTelegramDeliverySidecar(env.DATA_DB,deliveryArgs)
      : await runV3TelegramDeliverySidecar(env.DATA_DB,deliveryArgs);
  }
  console.log("V3_TELEGRAM_DELIVERY_SIDECAR", JSON.stringify(v3TelegramDeliverySidecar));

  // Preserve the already collected canonical result even if a later observer fails.
  const canonicalRunOutputBase=await loadCanonicalRunOutput(env.DATA_DB,{runId:cron.run_id,source,generation,head:process.env.GITHUB_SHA||null,cron,candidateContracts:env.REPORT2_CURRENT_CYCLE_SELECTION_AUDIT?.deep_check_selected||[]});
  const canonicalRunOutput={...canonicalRunOutputBase,liquidation_source_acquisition_audit:buildLiquidationSourceAcquisitionAudit({summary:liquidationSources?.summary(),run_id:String(cron.run_id||''),candidates:canonicalRunOutputBase.candidates.map(r=>r.contract),evaluated_ts:Date.now()}),market_scan_audit:{
    universe_total:Number(cron.universe_total),scanned:Number(cron.scanned),errors:Number(scan.errors||0),stale:Number(scan.stale||0),
    stage0_coverage_pct:Number(scan.stage0_coverage_pct),complete:Number(cron.scanned)===Number(cron.universe_total)&&Number(scan.errors||0)===0&&Number(scan.stale||0)===0&&Number(scan.stage0_coverage_pct)>=99.9,
  },candidate_selection_audit:env.REPORT2_CURRENT_CYCLE_SELECTION_AUDIT||null};
  if(env.REPORT2_TRIGGERED_RECHECK_TASK_ID)canonicalRunOutput.triggered_recheck={task_id:env.REPORT2_TRIGGERED_RECHECK_TASK_ID,scope:'FRESH_FULL_ANALYSIS_FROM_EXACT_SENT_PRICE_TRIGGER',entry_authorized_by_price:false,max_per_run:1,original_ttl_unchanged:true};
  await fs.writeFile('report2-run-result.json',JSON.stringify(canonicalRunOutput,null,2));
  console.log('CANONICAL_RUN_OUTPUT',JSON.stringify({status:canonicalRunOutput.status,run_id:canonicalRunOutput.run_id,candidates:canonicalRunOutput.candidates.map(row=>({contract:row.contract,direction:row.direction,state:row.canonical_state,actionability_status:row.actionability_status,wave_id_present:Boolean(row.wave_id)}))}));

  // Statistical/diagnostic observers are hourly and only after every user-critical
  // lane. This preserves the 7–14 day evidence programme without starving live work.
  const scheduledMinuteUtc = new Date(started).getUTCMinutes();
  let postV7MaintenanceClaim=null;
  if (postV7UnifiedEnabled && source === "schedule") postV7MaintenanceClaim=await claimMaintenanceCadence(env.DATA_DB,{job_key:"HOURLY_LOW_PRIORITY_STATS",actor:"GITHUB_ACTIONS",now_ts:Date.now(),interval_ms:60*60_000});
  const lowPriorityCadenceDue = source !== "schedule" || (postV7UnifiedEnabled ? postV7MaintenanceClaim?.claimed===true : scheduledMinuteUtc === 2);
  if (!telegramInstallValidation && lowPriorityCadenceDue) {
    const recallGate = evaluateWithinRunReservation({
      reservation:d1RunReservation,currentUsage:env.DATA_DB.usageSnapshot(),extraRowsRead:6000,extraRowsWritten:4,
    });
    discoveryRecallKpi = recallGate.allowed
      ? await observeDiscoveryRecallKpi(env.DATA_DB, { startedTs:started, source, runId:cron.run_id })
      : {status:"CAPACITY_DEFERRED_LOW_PRIORITY",reasons:recallGate.reasons||[],capacity_gate:recallGate,shadow_only:true,auto_send:false};
  } else if (!telegramInstallValidation) {
    discoveryRecallKpi = {status:"DEFERRED_LOW_PRIORITY_CADENCE",scheduled_minute_utc:scheduledMinuteUtc,shadow_only:true,auto_send:false};
  }
  if (source !== "schedule" && !telegramInstallValidation && discoveryRecallKpi?.status === "OBSERVER_ERROR_FAIL_CLOSED") {
    throw new Error(`DISCOVERY_RECALL_KPI_VALIDATION_FAIL_CLOSED:${discoveryRecallKpi.error || "UNKNOWN"}`);
  }
  console.log("DISCOVERY_RECALL_KPI_SHADOW", JSON.stringify(discoveryRecallKpi));

  // R8.20 is intentionally last / low priority. It cannot consume capacity before
  // Early, liquidation, pipeline-health or Telegram lanes. The +1 write preserves
  // the existing final run-usage persistence slot.
  const r820ProspectiveValidationConfigured = ["1","true","yes","on"].includes(String(process.env.REPORT2_R8_20_PROSPECTIVE_VALIDATION_ENABLED || "0").trim().toLowerCase());
  const r820ProspectiveValidationEnabled = r820ProspectiveValidationConfigured && lowPriorityCadenceDue;
  const r820ProspectiveValidationGate = evaluateWithinRunReservation({
    reservation:d1RunReservation,
    currentUsage:env.DATA_DB.usageSnapshot(),
    extraRowsRead:R820_PROSPECTIVE_VALIDATION_BUDGET.rows_read,
    extraRowsWritten:R820_PROSPECTIVE_VALIDATION_BUDGET.rows_written + 1,
  });
  let r820ProspectiveValidationSidecar;
  if (!r820ProspectiveValidationConfigured) {
    r820ProspectiveValidationSidecar = {version:R820_PROSPECTIVE_VALIDATION_VERSION,mode:"SHADOW_PROSPECTIVE_VALIDATION_DATA_ONLY",status:"DISABLED",calibration_only:true,live_probability:null,validated_signal:false,trading_execution:false};
  } else if (!lowPriorityCadenceDue) {
    r820ProspectiveValidationSidecar = {version:R820_PROSPECTIVE_VALIDATION_VERSION,mode:"SHADOW_PROSPECTIVE_VALIDATION_DATA_ONLY",status:"DEFERRED_LOW_PRIORITY_CADENCE",scheduled_minute_utc:scheduledMinuteUtc,calibration_only:true,live_probability:null,validated_signal:false,trading_execution:false};
  } else if (!r820ProspectiveValidationGate.allowed) {
    r820ProspectiveValidationSidecar = {version:R820_PROSPECTIVE_VALIDATION_VERSION,mode:"SHADOW_PROSPECTIVE_VALIDATION_DATA_ONLY",status:"CAPACITY_DEFERRED_FAIL_CLOSED",reasons:r820ProspectiveValidationGate.reasons||[],capacity_gate:r820ProspectiveValidationGate,calibration_only:true,live_probability:null,validated_signal:false,trading_execution:false};
  } else {
    r820ProspectiveValidationSidecar = await runR820ProspectiveValidationSidecar(env.DATA_DB, {
      current_scan_ts:Number(scan.ts), source_run_id:String(cron.run_id || ""), now_ts:Date.now(),
    });
  }
  console.log("R8_20_PROSPECTIVE_VALIDATION_GATE", JSON.stringify(r820ProspectiveValidationGate));
  console.log("R8_20_PROSPECTIVE_VALIDATION_SIDECAR", JSON.stringify(r820ProspectiveValidationSidecar));
  const blockWeightStatistics=lowPriorityCadenceDue?await refreshWeeklyBlockWeightPolicy(env.DATA_DB,{now:Date.now(),admit:e=>evaluateWithinRunReservation({reservation:d1RunReservation,currentUsage:env.DATA_DB.usageSnapshot(),extraRowsRead:e.rows_read,extraRowsWritten:e.rows_written+1})}):{status:'DEFERRED_LOW_PRIORITY_CADENCE',sourceHTTP:0};
  console.log('BLOCK_WEIGHT_STATISTICS',JSON.stringify(blockWeightStatistics));
  if (postV7UnifiedEnabled && postV7MaintenanceClaim?.claimed===true) {
    const cadenceOk=maintenanceSucceeded({recall:discoveryRecallKpi,prospective:r820ProspectiveValidationSidecar,prospective_enabled:r820ProspectiveValidationConfigured});
    await completeMaintenanceCadence(env.DATA_DB,{job_key:"HOURLY_LOW_PRIORITY_STATS",actor:"GITHUB_ACTIONS",lease_started_ts:postV7MaintenanceClaim.lease_started_ts,success:cadenceOk,now_ts:Date.now(),result:cadenceOk?"CLOSED":"NOT_CLOSED"});
  }
  const r820ManualNonFatalStatuses=new Set(["CLOSED","CAPACITY_DEFERRED_FAIL_CLOSED","BUDGET_ENVELOPE_EXCEEDED_FAIL_CLOSED","DEFERRED_LOW_PRIORITY_CADENCE","DEFERRED_BUDGET_ADMISSION"]);
  if (source !== "schedule" && r820ProspectiveValidationEnabled && !r820ManualNonFatalStatuses.has(r820ProspectiveValidationSidecar?.status)) {
    throw new Error(`R8_20_PROSPECTIVE_VALIDATION_SMOKE_FAIL_CLOSED:${r820ProspectiveValidationSidecar?.status || "UNKNOWN"}`);
  }
  if (source !== "schedule" && telegramReportTestRequested && telegramOutput?.morning?.sent !== true && telegramOutput?.morning?.delivery_confirmed !== true) {
    throw new Error(`TELEGRAM_REPORT_TEST_FAIL_CLOSED:${telegramOutput?.morning?.status || "UNKNOWN"}`);
  }
  console.log("R8_8_D1_PRE_POST_USAGE", JSON.stringify({reservation:d1RunReservation,usage:env.DATA_DB.usageSnapshot()}));
  const d1PostCycleBudget = evaluateWithinRunReservation({reservation:d1RunReservation,currentUsage:env.DATA_DB.usageSnapshot(),extraRowsWritten:1});
  if (!d1PostCycleBudget.allowed) throw new Error(`D1_POST_CYCLE_RESERVATION_EXCEEDED:${(d1PostCycleBudget.reasons||[]).join(",")}`);
  const d1Usage = enforceR88RunBudget(env.DATA_DB,{reservation:d1RunReservation,dayAdmission:d1DayAdmission,runsPerDay:envNumber("REPORT2_D1_RUNS_PER_DAY",288),maxDailyReads:envNumber("REPORT2_D1_MAX_DAILY_READS",3500000),maxDailyWrites:envNumber("REPORT2_D1_MAX_DAILY_WRITES",70000)});
  const d1FinalizedUsage = await finalizeRunUsage(env.DATA_DB,{reservationId:d1ReservationId,sourceRunId:cron.run_id,now:Date.now(),usage:env.DATA_DB.usageSnapshot()});
  const analyticsLeaseFinish=await releaseAnalyticsLease();
  if(!analyticsLeaseFinish.finished)throw new Error(`ANALYTICS_LEASE_FINISH_FAILED:${analyticsLeaseFinish.status}`);
  const completed = Date.now();
  const finalRunResult={ ok:true, version:RUNNER_VERSION, source, started_ts:started, completed_ts:completed, duration_ms:completed-started, worker_sha256:sha, post_v7_unified_enabled:postV7UnifiedEnabled, analytics_lease:analyticsLeaseFinish, cron_run_id:cron.run_id, universe_total:Number(cron.universe_total), scanned:Number(cron.scanned), stage0_coverage_pct:Number(scan.stage0_coverage_pct), canonical_run_output:{status:canonicalRunOutput.status,candidate_count:canonicalRunOutput.candidates.length,artifact:'report2-run-result.json'}, telegram_observer:telegramObserver, v3_sidecars_preaction_budget:v3SidecarsPreactionBudget, v3_early_sidecar:v3EarlySidecar, v3_realized_liquidation_sidecar:v3RealizedLiquidationSidecar, v3_liquidation_sidecar:v3LiquidationSidecar, v3_critical_feed_state:v3CriticalFeedState, v3_pipeline_health_sidecar:v3PipelineHealthSidecar, v3_telegram_lifecycle_sidecar:v3TelegramLifecycleSidecar, v3_telegram_delivery_sidecar:v3TelegramDeliverySidecar, v3_telegram_journal_enabled:v3TelegramJournalEnabled, v3_telegram_network_enabled:v3TelegramNetworkEnabled, r8_20_prospective_validation_gate:r820ProspectiveValidationGate, r8_20_prospective_validation_sidecar:r820ProspectiveValidationSidecar, block_weight_statistics:blockWeightStatistics, discovery_recall_kpi:discoveryRecallKpi, telegram_output:telegramOutput, telegram_zero_reason:telegramZeroReason, d1_run_reservation:d1RunReservation, d1_day_admission:d1DayAdmission, d1_reservation_receipt:d1ReservationReceipt, d1_pretelegram_budget:d1PreTelegramBudget, d1_post_cycle_budget:d1PostCycleBudget, d1_finalized_usage:d1FinalizedUsage, d1_usage:d1Usage, bykaranteli_secret_exported:false };
  if(envText('REPORT2_MEASUREMENT_ARTIFACT_ENABLED',{required:false})==='1')await fs.writeFile('report2-measurement.json',JSON.stringify({schema:'report2-measured-run-v1',generation,worker_sha256:sha,source,started_ts:started,completed_ts:completed,duration_ms:completed-started,cron_run_id:cron.run_id,universe_total:Number(cron.universe_total),scanned:Number(cron.scanned),stage0_coverage_pct:Number(scan.stage0_coverage_pct),live_shortlist_count:Number(cron.live_shortlist_count||0),live_deep_check_count:Number(cron.v3_live_deep_check_count||0),pipeline_health_status:cron.v3_pipeline_health_status||null,telegram_network_enabled:v3TelegramNetworkEnabled,telegram_output_enabled:telegramOutput?.enabled===true,d1_finalized_usage:d1FinalizedUsage,d1_usage:d1Usage,unknown_ops:Number(d1Usage?.unknown_ops||0),secret_values_stored:false},null,2));
  const finalRenderedResult=JSON.stringify(finalRunResult);
  console.log(finalRenderedResult);
  if(source!=='schedule'){
    if(expectedManualMode==='MANUAL_COIN'&&Number(cron.v3_live_deep_check_count||0)===0){
      const commandDeferral=await deferCommand(env.DATA_DB,{command_id:manualCommandId,actor:manualCommandActor,retry_at:Date.now()+2*60_000,reason:`MANUAL_COIN_DEEP_NOT_READY:${cron.v3_live_zero_reason||cron.v3_pipeline_health_reason||'UNKNOWN'}`,now:Date.now()});
      if(!commandDeferral.deferred)throw new Error(`DURABLE_MANUAL_COMMAND_DEFERRAL_FAILED:${commandDeferral.status}`);
      console.log('DURABLE_MANUAL_COMMAND_DEFERRED',JSON.stringify(commandDeferral));
      return;
    }
    const commandCompletion=await completeCommand(env.DATA_DB,{command_id:manualCommandId,actor:manualCommandActor,snapshot_id:String(cron.run_id||`MANUAL:${started}`),rendered_text:finalRenderedResult,delivered_to_existing_channel:true,now:Date.now()});
    if(!commandCompletion.completed)throw new Error(`DURABLE_MANUAL_COMMAND_COMPLETION_FAILED:${commandCompletion.status}`);
    console.log('DURABLE_MANUAL_COMMAND_COMPLETION',JSON.stringify(commandCompletion));
  }
}
main().catch(async(error) => {
  if(cleanupClaimedAnalyticsLease){
    try{
      const cleanup=await cleanupClaimedAnalyticsLease();
      console.error('REPORT2_FATAL_ANALYTICS_LEASE_CLEANUP',JSON.stringify(cleanup));
    }catch(cleanupError){
      console.error('REPORT2_FATAL_ANALYTICS_LEASE_CLEANUP_FAILED',String(cleanupError?.stack||cleanupError));
    }
  }
  console.error("REPORT2_RUNNER_FATAL", String(error?.stack || error));
  process.exitCode=1;
});
