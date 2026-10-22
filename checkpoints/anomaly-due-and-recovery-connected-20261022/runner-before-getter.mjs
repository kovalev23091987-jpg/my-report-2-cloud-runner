import {readAnomalyOrigin,commitAnomalyBundle,readDueAnomalyBundles,ORIGIN_SQL,COMMIT_SQL,READBACK_SQL,DUE_SQL} from './src/anomaly-native-domain.mjs';
import {approvedHtxLimitedReportAdmitted,approvedHtxLimitedCronAdmitted} from './src/approved-htx-analysis-scope.mjs';
import {createFailedD1RunAccounting} from './src/failed-d1-run-accounting.mjs';
import {buildSameRunDeliveryProof} from './src/same-run-delivery-proof.mjs';
import {buildMaintenanceCadenceReceipt} from './src/maintenance-cadence-receipt.mjs';
import {buildRunBudgetContext,createProviderBudgetReceiptCapture} from './src/run-budget-context.mjs';
import {admitTriggeredRecheck,TRIGGERED_RECHECK_D1_RESERVATION,proveTriggeredRecheckD1Budget} from './src/triggered-entry-recheck.mjs';
import {enforcePeriodicOwnership,enforceDailyAnalysisAdmission,markPostAnalysisControlFailure} from './src/pre-analysis-failure-receipt.mjs';
import {buildLiquidationSourceAcquisitionAudit,bindLiquidationAcquisitionDiagnostics} from './src/liquidation-source-acquisition-audit.mjs';
import {saveGTradePositionRouting} from './src/liquidation-extension/gtrade-position-routing.mjs';
import {auditObservationSourceRoles,captureGateBindingDiagnostic,projectGateSourceDiagnostic} from './src/observation-source-role-audit.mjs';
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
import {collectCoinBossLiquidationLevels} from './src/coinboss-liquidation-levels.mjs';
import {collectSwolechartsLiquidationLevels} from './src/swolecharts-liquidation-levels.mjs';
import {collectOrderlyPublicPositions} from './src/orderly-public-liquidation-positions.mjs';
import {LIQ_NATIVE_HTTP_ALLOCATION,nativeLiquidationHeadroom,liquidationSourceOrder,liquidationSupplementAllowance} from './src/liquidation-source-http-plan.mjs';
import {createLiquidationForecastMemory} from './src/liquidation-forecast-memory.mjs';
import {collectCrossVenueVolumeProfiles,selectComparableVolumeProfiles} from './src/cross-venue-volume-profile.mjs';
import {collectReadyHtxVolumeProfile} from './src/htx-volume-profile-collector.mjs';
import {applyVolumeProfileToLiquidationPanel,volumeProfileFacts} from './src/htx-volume-profile.mjs';
import {createCombinedLiquidationService} from './src/liquidation-extension/combined-runner-service.mjs';
import {collectSelectedNativeBatch} from './src/liquidation-extension/selected-native-batch.mjs';
import {createD1SourceAdmission} from './src/liquidation-extension/d1-source-admission.mjs';
import fs from "node:fs/promises";
import {auditRenderedBlockResults} from './src/block-result-context.mjs';
import {auditCanonicalBlockDecisionUse} from './src/block-decision-use-audit.mjs';
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { RemoteD1Database } from "./report2-d1-adapter.mjs";
import {createPrivateArchivePool} from './private-archive-pool.mjs';
import { buildBudgetBlockedTelegramOutput, runTelegramOutputLayer } from "./telegram-output.mjs";
import { INFO_D1_BUDGET } from "./telegram-info-runtime.mjs";
import { deriveRunReservation, loadDailyUsageAggregate, reserveRunBudget, evaluateDailyReservationBudget, evaluateWithinRunReservation, finalizeRunUsage } from "./d1-preaction-budget-guard.mjs";
import {loadVerifiedNativeDayReconciliation} from './verified-native-day-reconciliation.mjs';
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
import {sourceCollectionPriorityProof,collectCandidateEvidenceV2,finalizeCandidateBlockCoverage} from './src/candidate-evidence-v2-runtime.mjs';
import {createUnifiedHttpBudget,HTTP_LIMITS} from './src/unified-budget.mjs';
import {TWO_CANDIDATE_PLAN,TWO_NODE_HTTP_LIMITS,proveTwoCandidateBudget,deepRuntimeOptions} from './src/two-candidate-policy.mjs';
import {bindGateOfficialAssetIdentity} from './src/gate-official-asset-binding.mjs';
import {collectHtxBoundSupplementalContext} from './src/htx-asset-identity.mjs';
import {compileOfficialSourceRegistry,mergeOfficialAndConfiguredRegistries} from './src/official-source-registry.mjs';
import {installProviderMinuteLedger} from './src/provider-minute-ledger.mjs';
import {runtimeLiquidationCollectionAdmission,addGTradePinnedCollectionPermission,loadFuturesCoverageDatabase,futuresLiquidationAdmission,summarizeFuturesCoverage,alignFuturesCoverageToApprovedScope} from './src/liquidation-futures-coverage.mjs';
import {APPROVED_HTX_SCOPE,APPROVED_HTX_ANALYSIS_CONTRACTS} from './src/approved-htx-analysis-scope.mjs';
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
function assertClosedCron(cron, scan, approvedScope=null) {
  if(scan&&approvedHtxLimitedCronAdmitted(cron,approvedScope,scan))return;
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

async function loadCanonicalRunOutput(db,{runId,source,generation,head,cron,candidateContracts=[],gate_diagnostic_for=null,include_primary_selection_diagnostic=false}={}){
  // Optional technical copy only: no score/direction assessment or extra read.
  // Kept inside this loader so extraction callers have no new global dependency.
  const projectPrimarySelectionDiagnostic=(row,canonical)=>{
    let binding=null;
    const schema='EXISTING_PRIMARY_SELECTION_DIAGNOSTIC_V1';
    const omitted=reason=>({schema,status:'OMITTED',reason,binding,diagnostic_only:true,decision_or_score_recomputed:false});
    try{
      const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
      const has=(o,k)=>object(o)&&Object.prototype.hasOwnProperty.call(o,k);
      const metadata=canonical?.metadata;
      if(!has(metadata,'direction_resolution')&&!has(metadata,'score_basis'))return null;
      const text=(v,n)=>typeof v==='string'&&v.length>0&&Buffer.byteLength(v,'utf8')<=n;
      if(!text(row.contract_code,80)||!text(row.run_id,160)||!text(row.snapshot_id,240)||row.run_id!==String(runId||'')||metadata.contract!==row.contract_code||canonical.run_id!==row.run_id||canonical.snapshot_id!==row.snapshot_id||!Number.isSafeInteger(canonical.observed_ts)||canonical.observed_ts<=0||canonical.observed_ts!==Number(row.observed_ts)||!text(canonical.analytical_fingerprint,64)||!/^[a-f0-9]{64}$/.test(canonical.analytical_fingerprint))return omitted('SOURCE_IDENTITY_NOT_BOUND');
      binding={contract:row.contract_code,run_id:row.run_id,snapshot_id:row.snapshot_id,observed_ts:canonical.observed_ts,analytical_fingerprint:canonical.analytical_fingerprint};
      const pick=(source,keys)=>{
        if(!object(source))throw Error('UNSUPPORTED');
        const value={};for(const key of keys)if(has(source,key)){
          const v=source[key];if(!(v===null||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v)||typeof v==='string'&&Buffer.byteLength(v,'utf8')<=160))throw Error('UNSUPPORTED');
          value[key]=v;
        }return value;
      };
      const list=(value,max,project)=>{if(value===null)return null;if(!Array.isArray(value)||value.length>max)throw Error('UNSUPPORTED');return value.map(project);};
      const result={schema,status:'COPIED_EXISTING_FIELDS',binding,diagnostic_only:true,decision_or_score_recomputed:false,source:'ALREADY_PARSED_CANONICAL_METADATA'};
      if(has(metadata,'direction_resolution')){
        const d=metadata.direction_resolution;
        if(d===null)result.direction_resolution=null;
        else{
          const resolution=pick(d,['status','direction','candidate_direction']);
          if(has(d,'facts'))resolution.facts=list(d.facts,16,f=>pick(f,['direction','evidence_id','origin']));
          if(has(d,'early_receipt')){
            const e=d.early_receipt;
            if(e===null)resolution.early_receipt=null;
            else{
              const early=pick(e,['closed','direction','source_ts','available_at','same_contract','same_wave','fresh','directed','direction_state_closed','reason']);
              if(has(e,'predicate_receipt')){
                const p=e.predicate_receipt;
                if(p===null)early.predicate_receipt=null;
                else{
                  const predicates=pick(p,['schema','decision_ts']);
                  if(has(p,'checks'))predicates.checks=list(p.checks,32,check=>{const r=pick(check,['predicate','passed']);if(has(r,'passed')&&r.passed!==null&&typeof r.passed!=='boolean')throw Error('UNSUPPORTED');return r;});
                  if(has(p,'failed_predicates'))predicates.failed_predicates=list(p.failed_predicates,32,v=>{if(!text(v,160))throw Error('UNSUPPORTED');return v;});
                  early.predicate_receipt=predicates;
                }
              }
              resolution.early_receipt=early;
            }
          }
          result.direction_resolution=resolution;
        }
      }
      if(has(metadata,'score_basis'))result.score_basis=metadata.score_basis===null?null:pick(metadata.score_basis,['selected','qualified_early_detection_0_100','deep_canonical_interest_0_100','routed_overall_0_100']);
      return Buffer.byteLength(JSON.stringify(result),'utf8')<=4096?result:omitted('DIAGNOSTIC_BYTE_LIMIT_EXCEEDED');
    }catch{return omitted('SOURCE_FIELDS_UNSUPPORTED');}
  };

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
        const primarySelectionDiagnostic=include_primary_selection_diagnostic===true?projectPrimarySelectionDiagnostic(row,canonical):null;
        const blockCoverage=canonical?.metadata?.internal_market_context?.evidence_v2?.block_coverage||null;
        return {
          publication_id:row.publication_id,contract:row.contract_code,direction:row.direction,run_id:row.run_id,snapshot_id:row.snapshot_id,wave_id:row.wave_id,
          observed_ts:Number(row.observed_ts)||null,valid_until_ts:Number(row.valid_until_ts)||null,lifecycle_event:row.lifecycle_event,canonical_state:row.canonical_state,
          actionability_status:row.actionability_status,actionability_reason:row.actionability_reason,manual_text:row.manual_text||presentationInputs?.manual_text||null,
          block_coverage:blockCoverage,
          source_collection_priority:sourceCollectionPriorityProof(canonical||{}),
          source_role_publication_audit:auditObservationSourceRoles(canonical),
          gate_source_diagnostic:projectGateSourceDiagnostic(canonical,{binding_receipt:gate_diagnostic_for}),
          block_decision_use:auditCanonicalBlockDecisionUse(canonical||{},{manual:{ok:Boolean(row.manual_text||presentationInputs?.manual_text),text:row.manual_text||presentationInputs?.manual_text||null}}),
          block_rendered_results:auditRenderedBlockResults({canonical,manual:{ok:Boolean(row.manual_text||presentationInputs?.manual_text),text:row.manual_text||presentationInputs?.manual_text||null},telegram:{ok:Boolean(row.telegram_text),text:row.telegram_text||null,analytical_fingerprint:canonical?.analytical_fingerprint}}),
          ...(primarySelectionDiagnostic?{primary_selection_diagnostic:primarySelectionDiagnostic}:{}),
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
let canonicalOutputForFailure=null;
let failedD1RunAccounting=null;
// Narrow one-run diagnostic. The operator selector is never a D1 grant.
function liquidationAccessPathBinding({source,trigger_only,started_ts}){
  let c;try{const raw=process.env.REPORT2_LIQ_ACCESS_PATH_ONCE;if(!raw||Buffer.byteLength(raw)>1536)return null;c=JSON.parse(raw);}catch{return null;}
  const now=Date.now(),canonicalNumber=v=>typeof v==='string'&&/^[1-9][0-9]{0,14}$/.test(v);
  if(c?.schema!=='REPORT2_LIQ_ACCESS_PATH_ONCE_V1'||source!=='schedule'||trigger_only||process.env.REPORT2_LIQ_ACCESS_PATH_NATURAL!=='1'||!['schedule','workflow_dispatch'].includes(process.env.GITHUB_EVENT_NAME)||process.env.GITHUB_REF!=='refs/heads/main'||process.env.REPORT2_TRIGGER_ONLY_RUN==='1'||process.env.REPORT2_TRIGGER_KICK_TASK_ID||process.env.REPORT2_TRIGGERED_RECHECK_TASK_ID||process.env.REPORT2_MANUAL_COMMAND||process.env.REPORT2_MANUAL_COIN_CONTRACT||process.env.REPORT2_COMMAND_ID||c.run_attempt!=='1'||process.env.GITHUB_RUN_ATTEMPT!=='1'||!canonicalNumber(process.env.GITHUB_RUN_ID)||!canonicalNumber(c.run_number)||c.run_number!==process.env.GITHUB_RUN_NUMBER||c.workflow_ref!=='kovalev23091987-jpg/my-report-2-cloud-runner/.github/workflows/report2.yml@refs/heads/main'||c.workflow_ref!==process.env.GITHUB_WORKFLOW_REF||c.head!==process.env.GITHUB_SHA||!/^[0-9a-f]{40}$/.test(c.head||'')||!Number.isSafeInteger(c.not_before_ts)||!Number.isSafeInteger(c.expires_ts)||c.not_before_ts<1||c.expires_ts>8640000000000000||c.expires_ts<=c.not_before_ts||new Date(c.not_before_ts).toISOString().slice(0,10)!==new Date(c.expires_ts-1).toISOString().slice(0,10)||c.expires_ts-c.not_before_ts>5400000||!Number.isSafeInteger(now)||now<c.not_before_ts||now>=c.expires_ts||!Number.isSafeInteger(started_ts)||started_ts<c.not_before_ts||started_ts>=c.expires_ts)return null;
  const allowed=['schema','head','workflow_ref','run_number','run_attempt','not_before_ts','expires_ts'];
  if(Object.keys(c).some(k=>!allowed.includes(k)))return null;
  return{...c,cloud_run_id:process.env.GITHUB_RUN_ID,actual_head:process.env.GITHUB_SHA,diagnostic_attempted:false};
}
function captureRealizedAccessPath(db,binding,started_ts){
  if(!binding)return{restore:()=>{},read:()=>null};
  const own=Object.getOwnPropertyDescriptor(db,'batch'),original=db.batch;let captured=null,matches=0;
  const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
  db.batch=function(statements){
    let matchedThisCall=false;
    if(Array.isArray(statements)&&statements.length===2){
      const q=statements[0],params=q?.params;
      if(q?.db===db&&typeof q.sql==='string'&&hash(q.sql)==='0c731b2a82cda816638a689cb13fc0587839156eeae544b520b852e722b121ba'&&Array.isArray(params)&&params.length===2&&params.every(Number.isSafeInteger)&&params[0]===started_ts-7200000&&params[1]===started_ts+1000){matches++;matchedThisCall=true;captured={SQL:q.sql,params:Object.freeze([...params]),SQL_sha256:hash(q.sql)};}
    }
    const pending=Reflect.apply(original,this,[statements]);
    if(!matchedThisCall)return pending;
    return Promise.resolve(pending).then(result=>{
      try{
        const rows=result?.[0]?.results,columns=['source','event_id','contract_code','ts','side','price','volume_contracts','amount_base','notional_usdt'];
        const info={hash_scope:'CANONICAL_EXISTING_PUBLIC_EVENT_COLUMNS_JSON_NOT_WIRE_BODY',new_SQL:0,returned_rows:Array.isArray(rows)?rows.length:null,complete_columns_exported:false};
        if(!Array.isArray(rows)||rows.length>240){info.status='ORIGINAL_RESULT_SHAPE_NOT_CLOSED';captured.input_result=info;return result;}
        info.limit_may_truncate=rows.length===240;info.boundary_ts=rows.length?rows.at(-1)?.ts??null:null;
        if(rows.length)info.boundary_ties_within_returned=rows.filter(row=>Object.is(row?.ts,info.boundary_ts)).length;
        const bounded=[];let bytes=2;
        for(const row of rows){
          if(!row||typeof row!=='object'||columns.some(k=>!Object.hasOwn(row,k))){info.status='ORIGINAL_COLUMNS_NOT_CLOSED';captured.input_result=info;return result;}
          const copy={};
          for(const key of columns){const value=row[key];if(!(value===null||(typeof value==='number'&&Number.isFinite(value))||(typeof value==='string'&&Buffer.byteLength(value)<=512))){info.status='ORIGINAL_VALUE_NOT_BOUNDED_SCALAR';captured.input_result=info;return result;}copy[key]=value;}
          const rowJSON=JSON.stringify(copy);bytes+=Buffer.byteLength(rowJSON)+(bounded.length?1:0);
          if(bytes>16384){info.status='ORIGINAL_INPUT_OVER16384B_OMITTED_WHOLE';captured.input_result=info;return result;}bounded.push(copy);
        }
        const exact=JSON.stringify(bounded);info.status='EXISTING_INPUT_COLUMNS_CAPTURED_NO_REREAD';info.rows=bounded;info.bytes=Buffer.byteLength(exact);info.sha256=hash(exact);info.complete_columns_exported=true;captured.input_result=info;
      }catch{if(captured)captured.input_result={status:'ORIGINAL_INPUT_CAPTURE_NOT_CLOSED',new_SQL:0,complete_columns_exported:false};}
      return result;
    });
  };
  return{restore:()=>{if(own)Object.defineProperty(db,'batch',own);else delete db.batch;},read:()=>matches===1?captured:null};
}
async function recordLiquidationAccessPath({db,binding,captured,reservation,parent_receipt,day_admission,downstream,http_admit,original_result}){
  if(!binding||!captured||binding.diagnostic_attempted||!original_result||typeof original_result!=='object')return;
  binding.diagnostic_attempted=true;
  const output='report2-liquidation-access-path.json',hash=x=>crypto.createHash('sha256').update(x).digest('hex');
  const validUsage=u=>u&&['rows_read','rows_written','requests','unknown_ops'].every(k=>Number.isSafeInteger(u[k])&&u[k]>=0);
  const originalJSON=JSON.stringify(original_result),originalBytes=Buffer.byteLength(originalJSON);
  const compact=u=>u?{rows_read:u.rows_read,rows_written:u.rows_written,requests:u.requests,unknown_ops:u.unknown_ops}:null;
  const receipt={schema:'ONE_NATIVE_REALIZED_ACCESS_PATH_V1',binding:{...binding},actual_event_SQL_sha256:captured.SQL_sha256,actual_event_SQL_params:[...captured.params],existing_input_result:captured.input_result??{status:'ORIGINAL_INPUT_NOT_EXPORTED',complete_columns_exported:false},original_realized_result:originalBytes<=8192?JSON.parse(originalJSON):null,original_result_bytes:originalBytes,original_result_sha256:hash(originalJSON),original_result_omitted:originalBytes>8192,status:'ORIGINAL_RESULT_PRESERVED_BEFORE_DIAGNOSTIC',native_queries:[],proposed_query_reads:[2000,2000],projections_are_not_native_cost_upper_bounds:true,native_response_body_limit_bytes:524288,artifact_reply_limit_bytes:24576,source_HTTP:0,additional_MAIN:0,additional_Telegram:0,schema_or_index_mutation:false,reservations_refunded:false,old_components_replayed:0};
  const save=async()=>{
    let raw=JSON.stringify(receipt,null,2)+'\n';
    for(const item of [...receipt.native_queries].reverse()){
      if(Buffer.byteLength(raw)<=65536)break;
      if(Object.hasOwn(item,'reply')){delete item.reply;item.reply_omitted_reason='WHOLE65536B_RECEIPT_BUDGET_NO_PARTIAL_REPLY';raw=JSON.stringify(receipt,null,2)+'\n';}
    }
    const complete=!receipt.original_result_omitted&&receipt.native_queries.every(item=>!item.reply_omitted_reason);
    receipt.artifact_complete=complete;raw=JSON.stringify(receipt,null,2)+'\n';
    if(Buffer.byteLength(raw)>65536){raw=JSON.stringify({schema:receipt.schema,status:receipt.status,artifact_status:'INCOMPLETE_WHOLE_BOUND_FALLBACK',original_result_sha256:receipt.original_result_sha256,original_result_bytes:originalBytes,native_queries:receipt.native_queries.map(item=>({kind:item.kind,SQL_sha256:item.SQL_sha256,reply_sha256:item.reply_sha256,reply_bytes:item.reply_bytes,usage_before:item.usage_before,usage_after:item.usage_after,error:item.error??null,reply_omitted_reason:'WHOLE_RECEIPT_BOUND'}))},null,2)+'\n';await fs.writeFile(output,raw);return false;}
    await fs.writeFile(output,raw);return complete;
  };
  if(!await save())return;
  if(parent_receipt?.status!=='RESERVED'||typeof parent_receipt.reservation_id!=='string'||!parent_receipt.reservation_id.startsWith('R2RUN:')||parent_receipt.rows_read!==reservation?.rows_read||parent_receipt.rows_written!==reservation?.rows_written||parent_receipt.day_utc!==new Date(captured.params[1]-1000).toISOString().slice(0,10)||day_admission?.allowed!==true){receipt.status='LIVE_EXISTING_PARENT_RECEIPT_NOT_CLOSED';await save();return;}
  let before;try{before=db.usageSnapshot();}catch{before=null;}
  if(!validUsage(before)||before.unknown_ops>0){db.beforeRequest=()=>({allowed:false});receipt.status='CURRENT_NATIVE_USAGE_NOT_CLOSED_BEFORE_DIAGNOSTIC';await save();throw Error('LIQ_ACCESS_PATH_UNKNOWN_STOP_ALL_NATIVE_SQL');}
  receipt.usage_before=compact(before);
  const queries=[{kind:'CURRENT_TABLE_AND_INDEX_DEFINITIONS',sql:"SELECT type,name,tbl_name,sql FROM sqlite_master WHERE tbl_name=?1 AND type IN ('table','index') ORDER BY type,name LIMIT 64",params:['liquidation_events']},{kind:'EXPLAIN_SAME_EXISTING_INPUT_SELECT_NOT_EVENT_REEXECUTION',sql:'EXPLAIN QUERY PLAN '+captured.SQL,params:[...captured.params]}];
  for(let i=0;i<queries.length;i++){
    const q=queries[i];let current;try{current=db.usageSnapshot();}catch{current=null;}
    if(!validUsage(current)||current.unknown_ops>0){db.beforeRequest=()=>({allowed:false});receipt.status='CURRENT_NATIVE_USAGE_NOT_CLOSED';await save();throw Error('LIQ_ACCESS_PATH_UNKNOWN_STOP_ALL_NATIVE_SQL');}
    const spent=current.rows_read-before.rows_read;
    const gate=evaluateWithinRunReservation({reservation,currentUsage:current,extraRowsRead:downstream.rows_read+(i===0?4000:2000),extraRowsWritten:downstream.rows_written});
    if(Date.now()<binding.not_before_ts||Date.now()>=binding.expires_ts||new Date().toISOString().slice(0,10)!==parent_receipt.day_utc||!gate.allowed||spent===null||spent<0||spent>(i===0?0:2000)||current.rows_written!==before.rows_written){receipt.status='DIAGNOSTIC_NOT_ADMITTED_OR_WINDOW_CLOSED';receipt.last_admission=gate;await save();return;}
    const http=http_admit?.({logical_request_id:'LIQ_ACCESS_PATH:'+binding.cloud_run_id+':'+i,lane:'statistics',attempts:1});
    if(http?.allowed!==true||http.duplicate){receipt.status='DIAGNOSTIC_HTTP_NOT_ADMITTED';receipt.HTTP_admission=http??null;await save();return;}
    const entry={kind:q.kind,SQL_sha256:hash(q.sql),params:q.params,started_ts:Date.now(),usage_before:compact(current),admission:gate,HTTP_admission:{allowed:true,status:http.status??null,duplicate:false}};receipt.native_queries.push(entry);
    let reply,callError=null,snapshotError=null;
    const originalFetch=db.fetchImpl;
    db.fetchImpl=async (...args)=>{
      const response=await Reflect.apply(originalFetch,db,args),reader=response.body?.getReader();let total=0;const chunks=[];
      if(!reader)throw Error('LIQ_ACCESS_PATH_NATIVE_BODY_REQUIRED');
      try{while(true){const part=await reader.read();if(part.done)break;total+=part.value.byteLength;if(total>524288){await reader.cancel();throw Error('LIQ_ACCESS_PATH_NATIVE_RESPONSE_OVER524288B');}chunks.push(Buffer.from(part.value));}}
      finally{reader.releaseLock();}
      return new Response(Buffer.concat(chunks),{status:response.status,statusText:response.statusText,headers:response.headers});
    };
    try{reply=await db.prepare(q.sql).bind(...q.params).all();entry.reply_received=true;}
    catch(error){callError=error;entry.reply_received=false;}
    finally{db.fetchImpl=originalFetch;}
    try{entry.usage_after=db.usageSnapshot();}catch(error){snapshotError=error;entry.usage_after=null;}
    const after=entry.usage_after,unsafe=!validUsage(after)||after.unknown_ops>0;
    // Fence before serialization, hashing, artifact writes or error formatting.
    if(unsafe)db.beforeRequest=()=>({allowed:false});
    entry.completed_ts=Date.now();entry.usage_after=validUsage(after)?compact(after):null;
    if(snapshotError)entry.usage_snapshot_error='CURRENT_NATIVE_USAGE_SNAPSHOT_FAILED';
    if(callError){try{entry.error=String(callError?.message||callError).slice(0,240);}catch{entry.error='NATIVE_QUERY_ERROR_MESSAGE_UNAVAILABLE';}}
    if(entry.reply_received){
      try{const rawReply=JSON.stringify(reply);if(typeof rawReply!=='string')throw Error('NATIVE_REPLY_NOT_SERIALIZABLE');const replyBytes=Buffer.byteLength(rawReply);entry.reply_bytes=replyBytes;entry.reply_sha256=hash(rawReply);if(replyBytes<=24576)entry.reply=reply;else entry.reply_omitted_reason='REPLY_OVER24576B_NO_PARTIAL_RECONSTRUCTION';}
      catch(error){entry.reply_serialization_failed=true;}
    }
    if(unsafe){receipt.status='NATIVE_USAGE_NOT_CLOSED';await save();throw Error('LIQ_ACCESS_PATH_UNKNOWN_STOP_ALL_NATIVE_SQL');}
    if(callError||entry.reply_serialization_failed){receipt.status='NATIVE_QUERY_OR_REPLY_NOT_CLOSED';await save();return;}
    if(after.rows_written!==before.rows_written){receipt.status='CURRENT_USAGE_WRITES_CHANGED_NO_NEXT_DIAGNOSTIC';await save();return;}
    const replyBytes=entry.reply_bytes;
    const rows=reply?.results,complete=replyBytes<=24576&&reply?.success!==false&&Array.isArray(rows)&&rows.length>0&&rows.length<64&&(i===0?rows.some(r=>r.type==='table'&&r.name==='liquidation_events'&&typeof r.sql==='string'):rows.every(r=>typeof r.detail==='string'));
    if(!complete){receipt.status='NATIVE_RESULT_INCOMPLETE_NO_NEXT_DIAGNOSTIC';await save();return;}
    receipt.status='PARTIAL_NATIVE_ACCESS_PATH_RECORDED';if(!await save())return;
    if(after.rows_read-current.rows_read>2000||after.rows_read<current.rows_read){receipt.status='DIAGNOSTIC_PROJECTION_EXCEEDED_NO_NEXT_DIAGNOSTIC';await save();return;}
  }
  receipt.status='CURRENT_NATIVE_INDEX_AND_SAME_INPUT_PLAN_RECORDED';receipt.usage_after=receipt.native_queries.at(-1)?.usage_after??null;receipt.native_current_cost_or_index_saving_proven=false;await save();
}

async function persistRunnerAnomalyReceipts(snapshot) {
  if (snapshot?.schema !== 'ANOMALY_PARENT_BOUNDED_RECEIPTS_V1') throw Error('ANOMALY_RECEIPT_SCHEMA_REQUIRED');
  const body = JSON.stringify(snapshot);
  if (Buffer.byteLength(body,'utf8') > 16384) throw Error('ANOMALY_RECEIPT_METADATA_BOUND');
  const envelope = {schema:'RUNNER_ANOMALY_RECEIPT_ARTIFACT_V1',head:process.env.GITHUB_SHA||null,cloud_run_id:process.env.GITHUB_RUN_ID||null,recorded_ts:Date.now(),scope:'BOUND_OPERATION_METADATA_NOT_NATIVE_EVENT_FIRST_KNOWLEDGE_OR_DELIVERY',receipts:snapshot,additional_SQL:0,provider_HTTP:0,native_qualification_claimed:false,filesystem_durability_qualified:false};
  const text = JSON.stringify(envelope);
  if (Buffer.byteLength(text,'utf8') > 20480) throw Error('ANOMALY_RECEIPT_ARTIFACT_BOUND');
  const file = 'report2-anomaly-domain-receipts.json';
  await fs.writeFile(file+'.tmp',text);
  await fs.rename(file+'.tmp',file);
  return {bytes:Buffer.byteLength(text,'utf8'),sha256:crypto.createHash('sha256').update(text).digest('hex'),native_qualification_claimed:false};
}

// Optional capability; no numeric native policy is inferred from old fixtures.
function installRunnerAnomalyParentCapability({env,db,reservation,reservation_id,receipt,day_admission,http_budget,post_v7,cost_bounds,on_receipt}) {
  const keys=['requests','rows_read','rows_written','unknown_ops'];
  const integer=n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0;
  const plain=x=>x&&typeof x==='object'&&!Array.isArray(x)&&[Object.prototype,null].includes(Object.getPrototypeOf(x));
  const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
  const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
  const refusal=status=>({status,native_admission_qualified:false,event_first_knowledge_qualified:false,native_epoch_qualified:false,SENT_claimed:false});
  const absent=()=>({installed:false,status:'ANOMALY_PARENT_POLICY_NOT_CLOSED',close:async()=>{}});
  let policy,due_policy=null;
  try {
    if(typeof cost_bounds==='string') {
      if(Buffer.byteLength(cost_bounds,'utf8')>2048)return absent();
      policy=JSON.parse(cost_bounds);
    } else policy=cost_bounds;
    if(!plain(policy)||!['origin','write','read'].every(p=>plain(policy[p])&&integer(policy[p].rows_read)&&policy[p].rows_read>0&&integer(policy[p].rows_written)&&policy[p].rows_written>=(p==='write'?2:0)))return absent();
    if(plain(policy.due)&&integer(policy.due.rows_read)&&policy.due.rows_read>0&&integer(policy.due.rows_written))due_policy=Object.freeze({rows_read:policy.due.rows_read,rows_written:policy.due.rows_written});
    policy=Object.freeze({...Object.fromEntries(['origin','write','read'].map(p=>[p,Object.freeze({rows_read:policy[p].rows_read,rows_written:policy[p].rows_written})])),...(due_policy?{due:due_policy}:{})});
  } catch { return absent(); }
  if(!env||env.DATA_DB!==db||typeof db?._request!=='function'||typeof db?.usageSnapshot!=='function'||typeof http_budget?.reserve!=='function'||typeof post_v7!=='boolean'||(Object.hasOwn(env,'REPORT2_ANOMALY_DOMAIN_COMMIT')||due_policy&&Object.hasOwn(env,'REPORT2_ANOMALY_DOMAIN_DUE')))return absent();
  if(!plain(reservation)||!integer(reservation.rows_read)||!reservation.rows_read||!integer(reservation.rows_written)||!reservation.rows_written||typeof reservation_id!=='string'||!/^R2RUN:\d+:[a-f0-9]{16}$/.test(reservation_id))return absent();
  // No overlap proof exists: retain the SUM of the two declared future envelopes.
  const protected_budget=Object.freeze({
    rows_read:4500+4500+(post_v7?V3_TELEGRAM_LIFECYCLE_SIDECAR_BUDGET.rows_read+BOUND_TELEGRAM_DELIVERY_BUDGET.rows_read:0),
    rows_written:150+50+(post_v7?V3_TELEGRAM_LIFECYCLE_SIDECAR_BUDGET.rows_written+BOUND_TELEGRAM_DELIVERY_BUDGET.rows_written:0),
  });
  const caps=Object.freeze({rows_read:reservation.rows_read,rows_written:reservation.rows_written});
  const request_descriptor=Object.getOwnPropertyDescriptor(db,'_request');
  const original_request=db._request;
  let active=true,unsafe=false,stopped=false,in_prepare=false,reentrant=false,sequence=0,ticket=null,last_usage=null,last_reported_usage=null;
  let tail=Promise.resolve();
  const reconciliation=new Map();
  const due_requests=new Map();
  const completed=[],logical_ids=new Set();
  let overflow=null,observer_failed=false;
  const fence=()=>{unsafe=true;stopped=true;db.beforeRequest=()=>({allowed:false,status:'ANOMALY_NATIVE_USAGE_NOT_CLOSED'});};
  const usage=()=>{
    let u;
    try {u=db.usageSnapshot();} catch {fence();return null;}
    if(u&&keys.every(k=>integer(u[k]))&&(!last_usage||keys.every(k=>u[k]>=last_usage[k])))last_reported_usage=Object.fromEntries(keys.map(k=>[k,u[k]]));
    if(!u||!keys.every(k=>integer(u[k]))||u.unknown_ops!==0||last_usage&&keys.some(k=>u[k]<last_usage[k])){fence();return null;}
    last_usage=Object.fromEntries(keys.map(k=>[k,u[k]]));return u;
  };
  const same_usage=(a,b)=>a&&b&&keys.every(k=>a[k]===b[k]);
  const parent_closed=()=>{
    const now=Date.now();
    return active&&!unsafe&&!stopped&&env.DATA_DB===db&&integer(now)&&now>0&&receipt?.status==='RESERVED'&&receipt.reservation_id===reservation_id&&receipt.day_utc===new Date(now).toISOString().slice(0,10)&&receipt.rows_read===caps.rows_read&&receipt.rows_written===caps.rows_written&&reservation.rows_read===caps.rows_read&&reservation.rows_written===caps.rows_written&&day_admission?.allowed===true;
  };
  const remaining=phase=>phase==='ORIGIN'?['origin','write','read']:phase==='WRITE'?['write','read']:phase==='READBACK'?['read']:phase==='DUE'&&due_policy?['due']:null;
  const project=(phase,u)=>{
    const phases=remaining(phase);if(!phases||!parent_closed()||!u)return null;
    const extraRowsRead=protected_budget.rows_read+phases.reduce((s,p)=>s+policy[p].rows_read,0);
    const extraRowsWritten=protected_budget.rows_written+phases.reduce((s,p)=>s+policy[p].rows_written,0);
    if(!integer(extraRowsRead)||!integer(extraRowsWritten))return null;
    return evaluateWithinRunReservation({reservation,currentUsage:u,extraRowsRead,extraRowsWritten});
  };
  // SAME SDK and counters. Check immediately after settle, before kernel error
  // rendering/JSON and before any runner cleanup/finalizer may issue SQL.
  const wrapped_request=async function(payload){
    if(in_prepare){reentrant=true;usage();throw Error('ANOMALY_PREPARE_SQL_REFUSED');}
    const before=usage();if(!before)throw Error('ANOMALY_NATIVE_USAGE_NOT_CLOSED');
    const domain=payload?.sql===ORIGIN_SQL||payload?.sql===COMMIT_SQL||payload?.sql===READBACK_SQL||payload?.sql===DUE_SQL;
    if(domain){
      const t=ticket;ticket=null;
      if(!t||!parent_closed()||!same_usage(before,t.usage)||JSON.stringify(payload)!==t.wire||project(t.phase,before)?.allowed!==true)throw Error('ANOMALY_PARENT_WIRE_NOT_ADMITTED');
    }
    try {return await original_request.call(this,payload);}
    finally {usage();}
  };
  try {Object.defineProperty(db,'_request',{value:wrapped_request,writable:true,configurable:true,enumerable:request_descriptor?.enumerable??false});}
  catch {return absent();}
  const freeze=x=>{if(x&&typeof x==='object'){for(const v of Object.values(x))freeze(v);Object.freeze(x);}return x;};
  const origin_for_callback=(origin,id)=>{
    if(origin===null)return null;
    if(origin?.schema!=='VERIFIED_RETAINED_ANOMALY_ORIGIN_V1'||origin.logical_event_id!==id||!Number.isSafeInteger(origin.revision)||origin.revision<1||!integer(origin.first_known_ts)||!origin.first_known_ts||typeof origin.operation_id!=='string'||!hex(origin.request_sha256)||origin.receipt?.status!=='COMMITTED_RECEIPT_READBACK')throw Error('ANOMALY_RETAINED_ORIGIN_NOT_CLOSED');
    const parts={};
    for(const [name,max] of [['card',32768],['descriptor',2048],['plan',8192],['state',65536]]){
      const text=origin[name+'_json'];if(typeof text!=='string'||Buffer.byteLength(text,'utf8')>max||!hex(origin[name+'_sha256'])||hash(text)!==origin[name+'_sha256'])throw Error('ANOMALY_RETAINED_ORIGIN_DIGEST');
      parts[name]=JSON.parse(text);
    }
    if(parts.card.first_known_ts!==origin.first_known_ts||origin.receipt.first_known_ts!==origin.first_known_ts||origin.receipt.current_revision!==origin.revision||['card','plan','state'].some(n=>origin.receipt[n+'_sha256']!==origin[n+'_sha256']))throw Error('ANOMALY_RETAINED_ORIGIN_SCALAR');
    return freeze({...origin,...parts,receipt:{...origin.receipt}});
  };
  const validate_prepared=(prepared,id,origin)=>{
    const r=prepared?.request;
    if(!plain(r)||r.logical_event_id!==id||r.expected_revision!==(origin?.revision??0)||typeof prepared.text!=='string'||Buffer.byteLength(prepared.text,'utf8')>131072)throw Error('ANOMALY_EFFECTIVE_PREPARED_NOT_BOUND');
    if(origin&&(['card','descriptor','plan'].some(n=>r[n+'_json']!==origin[n+'_json']||r[n+'_sha256']!==origin[n+'_sha256'])||r.first_known_ts!==origin.first_known_ts))throw Error('ANOMALY_RETAINED_IMMUTABLE_CONFLICT');
    return prepared;
  };
  const run=async input=>{
    const id=input?.logical_event_id,prepare=input?.prepare_from_origin;
    if(typeof id!=='string'||!/^OPAQUE_ANOM:[a-f0-9]{64}$/.test(id)||typeof prepare!=='function'||prepare.constructor?.name==='AsyncFunction')return refusal('ANOMALY_TYPED_INPUT_REQUIRED');
    if(reconciliation.has(id))return reconciliation.get(id);
    if(!parent_closed())return refusal('ANOMALY_PARENT_NOT_ADMITTED');
    if(!usage())return refusal('ANOMALY_NATIVE_USAGE_NOT_CLOSED');
    const invocation=++sequence;
    let effective=null,expected_phase='ORIGIN',origin=null;
    const admit=async e=>{
      const phase=e?.phase,p=phase==='ORIGIN'?'origin':phase==='WRITE'?'write':phase==='READBACK'?'read':null;
      const u=usage();if(!p||phase!==expected_phase||!u||!same_usage(u,e.current_usage)||e.requires_parent_downstream_reserve!==true||e.rows_read!==policy[p].rows_read||e.rows_written!==policy[p].rows_written||project(phase,u)?.allowed!==true)return{allowed:false};
      const wire=phase==='ORIGIN'?JSON.stringify({op:'first',sql:ORIGIN_SQL,params:[id],column:null}):phase==='WRITE'?JSON.stringify({op:'run',sql:COMMIT_SQL,params:[effective.text]}):JSON.stringify({op:'first',sql:READBACK_SQL,params:[effective.request.operation_id],column:null});
      if(e.D1_bridge_wire_bytes!==Buffer.byteLength(wire,'utf8'))return{allowed:false};
      const http=http_budget.reserve({logical_request_id:`ANOMALY_DOMAIN:${reservation_id}:${invocation}:${phase}`,lane:'statistics',attempts:1});
      if(http?.allowed!==true||http.duplicate===true||!same_usage(usage(),u)||!parent_closed())return{allowed:false};
      ticket={phase,usage:Object.fromEntries(keys.map(k=>[k,u[k]])),wire};
      expected_phase=phase==='ORIGIN'?'PREPARE':phase==='WRITE'?'READBACK':'DONE';
      return{allowed:true,status:'LIVE_PARENT_AND_HTTP_PROJECTED',protected_budget};
    };
    try {
      const read=await readAnomalyOrigin({db,logical_event_id:id,admit,cost_bounds:policy});
      ticket=null;
      if(!['ORIGIN_ABSENT','VERIFIED_RETAINED_ORIGIN'].includes(read.status)){stopped=true;return{...refusal(read.status),origin_receipt:read};}
      if(!parent_closed()||!usage())return refusal('ANOMALY_PARENT_NOT_ADMITTED_AFTER_ORIGIN');
      origin=origin_for_callback(read.origin,id);
      let prepared;
      const preparation_usage=usage();
      reentrant=false;in_prepare=true;try{prepared=prepare(origin);}finally{in_prepare=false;}
      if(reentrant)throw Error('ANOMALY_REENTRANT_CALLBACK_REFUSED');
      if(!same_usage(usage(),preparation_usage)||!parent_closed())throw Error('ANOMALY_PREPARE_CHANGED_PARENT_OR_USAGE');
      if(prepared&&typeof prepared.then==='function')throw Error('ANOMALY_PREPARE_MUST_BE_SYNCHRONOUS');
      if(prepared?.status==='STORED_DUPLICATE'){
        const fp=prepared.observation_fingerprint;
        if(!origin||prepared.logical_event_id!==id||!hex(fp)||!origin.state.revisions.some(r=>r.observation_kind==='CAPTURED_CLOSED_WINDOW_FACTS_V1'&&r.observation_fingerprint===fp)||prepared.expected_revision!==origin.revision||prepared.first_known_ts!==origin.first_known_ts||['card','descriptor','plan'].some(n=>prepared[n+'_sha256']!==origin[n+'_sha256'])||prepared.write_required!==false||prepared.durable_new_observation!==false)throw Error('ANOMALY_STORED_DUPLICATE_NOT_BOUND');
        return{...refusal('STORED_DUPLICATE'),logical_event_id:id,operation_id:origin.operation_id,observation_fingerprint:fp,first_known_ts:origin.first_known_ts,revision:origin.revision,write_required:false,durable_new_observation:false,origin_receipt:read};
      }
      if(prepared?.status==='DEFERRED_CAPACITY'){
        if(!origin||prepared.logical_event_id!==id||!hex(prepared.observation_fingerprint)||prepared.expected_revision!==origin.revision||prepared.first_known_ts!==origin.first_known_ts||['card','descriptor','plan'].some(n=>prepared[n+'_sha256']!==origin[n+'_sha256'])||prepared.write_required!==false||prepared.durable_new_observation!==false||!['REVISIONS_OR_OUTBOX_CAPACITY_NO_DROP','STATE_BYTES_CAPACITY_NO_DROP'].includes(prepared.reason))throw Error('ANOMALY_CAPACITY_DEFER_NOT_BOUND');
        return{...refusal('DEFERRED_CAPACITY'),reason:prepared.reason,write_required:false,durable_new_observation:false};
      }
      if(prepared?.status==='DUE_DEFERRED'){
        if(!origin||prepared.logical_event_id!==id||prepared.expected_revision!==origin.revision||prepared.first_known_ts!==origin.first_known_ts||['card','descriptor','plan'].some(n=>prepared[n+'_sha256']!==origin[n+'_sha256'])||prepared.write_required!==false||prepared.durable_new_observation!==false||!['DUE_REVISION_CHANGED','NO_SAME_COMPLETED_CAPTURE','CLOSED_WINDOW_UNAVAILABLE','CAPTURE_RECORD_MISMATCH','CLOSED_WINDOW_ALREADY_OBSERVED','WATCH_INACTIVE_PENDING_OUTCOMES'].includes(prepared.reason))throw Error('ANOMALY_DUE_DEFER_NOT_BOUND');
        return{...refusal('DUE_DEFERRED'),reason:prepared.reason,logical_event_id:id,revision:origin.revision,first_known_ts:origin.first_known_ts,write_required:false,durable_new_observation:false,origin_receipt:read};
      }
      effective=validate_prepared(prepared,id,origin);expected_phase='WRITE';
      const result=await commitAnomalyBundle({db,prepared:effective,admit,cost_bounds:policy});
      const u=usage();
      const uncertain=!u||result.cost_status==='PROJECTION_EXCEEDED_OR_UNKNOWN'||result.new_operation_id_allowed===false||['UNKNOWN_COMMIT_ACK','COMMIT_REPLY_RETAINED_RECONCILIATION_REQUIRED','READBACK_CONFLICT_OR_UNKNOWN_USAGE'].includes(result.status);
      if(uncertain)stopped=true;
      const returned={...result,effective_prepared:effective,original_origin_revision:origin?.revision??null,native_admission_qualified:false,event_first_knowledge_qualified:false,native_epoch_qualified:false,SENT_claimed:false};
      if(uncertain||result.status!=='COMMITTED_RECEIPT_READBACK'&&result.status!=='COMMIT_NOT_ADMITTED'){
        stopped=true;returned.new_operation_id_allowed=false;reconciliation.set(id,returned);
      }
      return returned;
    } catch {
      stopped=true;const returned={...refusal('ANOMALY_PARENT_OR_CALLBACK_NOT_CLOSED'),effective_prepared:effective,new_operation_id_allowed:false};
      if(effective)reconciliation.set(id,returned);return returned;
    } finally {ticket=null;}
  };
  // One bounded due-read per capability; no new SQL or cursor implementation.
  const run_due=async input=>{
    const now_ts=input?.now_ts,limit=input?.limit,id=input?.logical_request_id,live=Date.now();
    if(!due_policy||!integer(now_ts)||!now_ts||!integer(live)||now_ts>live||new Date(now_ts).toISOString().slice(0,10)!==new Date(live).toISOString().slice(0,10)||!integer(limit)||limit<1||limit>2||typeof id!=='string'||!/^[A-Za-z0-9:._-]{1,160}$/.test(id))return refusal('ANOMALY_BOUNDED_DUE_INPUT_REQUIRED');
    const signature=JSON.stringify([now_ts,limit]);
    if(due_requests.has(id)){const prior=due_requests.get(id);return prior.signature===signature?prior.result:refusal('ANOMALY_DUE_REQUEST_CONFLICT');}
    if(due_requests.size)return refusal('ANOMALY_DUE_ALREADY_READ_NO_REFRESH');
    if(!parent_closed())return refusal('ANOMALY_PARENT_NOT_ADMITTED');
    const initial=usage();if(!initial)return refusal('ANOMALY_NATIVE_USAGE_NOT_CLOSED');
    const invocation=++sequence,wire=JSON.stringify({op:'all',sql:DUE_SQL,params:[now_ts,limit]});
    const admit=async e=>{
      const u=usage();
      if(e?.phase!=='DUE'||e.operation_id!==id||!u||!same_usage(u,e.current_usage)||e.requires_parent_downstream_reserve!==true||e.rows_read!==due_policy.rows_read||e.rows_written!==due_policy.rows_written||e.request_bytes!==0||e.D1_bridge_wire_bytes!==Buffer.byteLength(wire,'utf8')||project('DUE',u)?.allowed!==true)return{allowed:false};
      const h=http_budget.reserve({logical_request_id:`ANOMALY_DOMAIN:${reservation_id}:${invocation}:DUE`,lane:'statistics',attempts:1});
      if(h?.allowed!==true||h.duplicate===true||!same_usage(usage(),u)||!parent_closed())return{allowed:false};
      ticket={phase:'DUE',usage:Object.fromEntries(keys.map(k=>[k,u[k]])),wire};
      return{allowed:true,status:'LIVE_PARENT_AND_HTTP_PROJECTED',protected_budget};
    };
    let result;
    try{
      result=await readDueAnomalyBundles({db,now_ts,limit,logical_request_id:id,admit,cost_bounds:policy});
      const after=usage(),closed=!!after&&parent_closed()&&result.status==='DUE_BUNDLES_READ'&&result.cost_status==='WITHIN_CALLER_PROJECTION';
      if(!closed)stopped=true;
      result={...result,current_parent_admitted:closed,native_admission_qualified:false,event_first_knowledge_qualified:false,native_epoch_qualified:false,SENT_claimed:false};
    }catch{stopped=true;result=refusal('ANOMALY_DUE_READ_NOT_CLOSED');}
    finally{ticket=null;}
    due_requests.set(id,{signature,result});return result;
  };
  const cost_cut=u=>u?Object.fromEntries(keys.map(k=>[k,u[k]])):null;
  const receipts=()=>{
    usage(); // Even failure-fallback serialization occurs after the SAMEdb fence.
    return freeze({schema:'ANOMALY_PARENT_BOUNDED_RECEIPTS_V1',records:completed.map(r=>({...r,usage_before:r.usage_before?{...r.usage_before}:null,usage_after:r.usage_after?{...r.usage_after}:null,last_verified_usage:r.last_verified_usage?{...r.last_verified_usage}:null,last_reported_usage:r.last_reported_usage?{...r.last_reported_usage}:null})),overflow:overflow?{...overflow}:null,observer_failed,native_admission_qualified:false,event_first_knowledge_qualified:false,native_epoch_qualified:false,SENT_claimed:false});
  };
  const retain_receipt=(input,result,before,after)=>{
    const p=result?.effective_prepared?.request,o=result?.origin_receipt?.origin;
    const text=x=>typeof x==='string'&&/^[A-Za-z0-9:._-]{1,160}$/.test(x)?x:null;
    let fp=result?.observation_fingerprint??null;
    try{if(!hex(fp)&&typeof p?.state_json==='string'&&Buffer.byteLength(p.state_json,'utf8')<=65536)fp=JSON.parse(p.state_json).revisions?.at(-1)?.observation_fingerprint;}catch{}
    const r={sequence:completed.length+1,logical_event_id:text(input?.logical_event_id),status:typeof result?.status==='string'?result.status.slice(0,96):'OUTCOME_NOT_CLOSED',operation_id:text(result?.operation_id??p?.operation_id??o?.operation_id),request_sha256:hex(result?.request_sha256??p?.request_sha256??o?.request_sha256)?(result?.request_sha256??p?.request_sha256??o?.request_sha256):null,first_known_ts:integer(result?.first_known_ts??p?.first_known_ts??o?.first_known_ts)?(result?.first_known_ts??p?.first_known_ts??o?.first_known_ts):null,server_recorded_ts_floor_ms:integer(result?.server_recorded_ts_floor_ms??o?.receipt?.server_recorded_ts_floor_ms)?(result?.server_recorded_ts_floor_ms??o?.receipt?.server_recorded_ts_floor_ms):null,observation_fingerprint:hex(fp)?fp:null,usage_before:cost_cut(before),usage_after:cost_cut(after),last_verified_usage:cost_cut(last_usage),native_admission_qualified:false,event_first_knowledge_qualified:false,native_epoch_qualified:false,SENT_claimed:false};
    r.last_reported_usage=cost_cut(last_reported_usage);
    if(typeof input?.logical_request_id==='string'){r.logical_request_id=text(input.logical_request_id);r.due_cutoff_ts=integer(input.now_ts)?input.now_ts:null;r.due_limit=integer(input.limit)?input.limit:null;r.due_rows_returned=Array.isArray(result?.rows)&&result.rows.length<=2?result.rows.length:null;r.current_parent_admitted=result?.current_parent_admitted===true;}
    for(const name of ['card','descriptor','plan','state']){const h=p?.[name+'_sha256']??o?.[name+'_sha256'];r[name+'_sha256']=hex(h)?h:null;}
    if(Buffer.byteLength(JSON.stringify(r),'utf8')>2048){overflow={status:'COMPLETED_RECEIPT_METADATA_BOUND_EXCEEDED',completed_sequence:r.sequence};stopped=true;completed.push(freeze({...r,usage_before:null,usage_after:null,last_verified_usage:null,last_reported_usage:null,cost_cuts_omitted:true}));return;}
    completed.push(freeze(r));
  };
  const hook=input=>{
    if(in_prepare){reentrant=true;return Promise.resolve(refusal('ANOMALY_REENTRANT_CALLBACK_REFUSED'));}
    const next=tail.then(async()=>{
      const id=input?.logical_event_id;
      if(reconciliation.has(id))return reconciliation.get(id);
      const valid_id=typeof id==='string'&&id.length>0&&id.length<=160;
      const per_id=completed.filter(r=>r.logical_event_id===id).length;
      if(completed.length>=16||per_id>=8||valid_id&&!logical_ids.has(id)&&logical_ids.size>=2||Buffer.byteLength(JSON.stringify(completed),'utf8')+3072>16384){
        stopped=true;overflow={status:'RECEIPT_CAPACITY_DEFERRED_BEFORE_SQL',retained_records:completed.length};return refusal('RECEIPT_CAPACITY_DEFERRED_BEFORE_SQL');
      }
      if(valid_id)logical_ids.add(id);
      const before=usage();let result;
      try{result=await run(input);}catch{stopped=true;result=refusal('ANOMALY_HOOK_NOT_CLOSED');}
      const after=usage();retain_receipt(input,result,before,after);
      if(typeof on_receipt==='function')try{await on_receipt(receipts());}catch{observer_failed=true;stopped=true;}
      return result;
    });tail=next.catch(()=>{});return next;
  };
  const due_hook=input=>{
    if(in_prepare){reentrant=true;return Promise.resolve(refusal('ANOMALY_REENTRANT_CALLBACK_REFUSED'));}
    const next=tail.then(async()=>{
      const id=input?.logical_request_id,prior=typeof id==='string'?due_requests.get(id):null;
      // Exact replay returns the SAME object even after unknown/close, never a retry.
      if(prior){usage();if(!integer(input?.now_ts)||!integer(input?.limit))return refusal('ANOMALY_DUE_REQUEST_CONFLICT');return prior.signature===JSON.stringify([input.now_ts,input.limit])?prior.result:refusal('ANOMALY_DUE_REQUEST_CONFLICT');}
      if(completed.length>=16||Buffer.byteLength(JSON.stringify(completed),'utf8')+3072>16384){stopped=true;overflow={status:'RECEIPT_CAPACITY_DEFERRED_BEFORE_SQL',retained_records:completed.length};return refusal('RECEIPT_CAPACITY_DEFERRED_BEFORE_SQL');}
      const before=usage();let result;
      try{result=await run_due(input);}catch{stopped=true;result=refusal('ANOMALY_DUE_READ_NOT_CLOSED');}
      const after=usage();retain_receipt(input,result,before,after);
      if(typeof on_receipt==='function')try{await on_receipt(receipts());}catch{observer_failed=true;stopped=true;}
      return result;
    });tail=next.catch(()=>{});return next;
  };
  try{
    Object.defineProperty(env,'REPORT2_ANOMALY_DOMAIN_COMMIT',{value:hook,writable:false,configurable:true,enumerable:false});
    if(due_policy)Object.defineProperty(env,'REPORT2_ANOMALY_DOMAIN_DUE',{value:due_hook,writable:false,configurable:true,enumerable:false});
  }
  catch{if(env.REPORT2_ANOMALY_DOMAIN_COMMIT===hook)delete env.REPORT2_ANOMALY_DOMAIN_COMMIT;if(env.REPORT2_ANOMALY_DOMAIN_DUE===due_hook)delete env.REPORT2_ANOMALY_DOMAIN_DUE;if(request_descriptor)Object.defineProperty(db,'_request',request_descriptor);else delete db._request;return absent();}
  return {installed:true,due_installed:!!due_policy,status:'ANOMALY_PARENT_OPTIONAL_CAPABILITY',protected_budget,receipts,retained_reconciliation:()=>[...reconciliation.values()],close:async()=>{
    active=false;await tail;
    if(env.REPORT2_ANOMALY_DOMAIN_COMMIT===hook)delete env.REPORT2_ANOMALY_DOMAIN_COMMIT;
    if(env.REPORT2_ANOMALY_DOMAIN_DUE===due_hook)delete env.REPORT2_ANOMALY_DOMAIN_DUE;
    if(db._request===wrapped_request){if(request_descriptor)Object.defineProperty(db,'_request',request_descriptor);else delete db._request;}
  }};
}

async function main() {
  const preflight=evaluatePreflight(process.env);
  console.log('REPORT2_RUNTIME_PREFLIGHT',JSON.stringify(preflight));
  if(!preflight.allowed)throw new Error(`REPORT2_RUNTIME_PREFLIGHT_BLOCKED:${preflight.status}`);
  process.env.REPORT2_TELEGRAM_OUTPUT_ENABLED=preflight.switches.delivery?'1':'0';
  let source = envText("REPORT2_RUN_SOURCE", { required: false }) || "manual";
  const generation=envText("REPORT2_CURRENT_GENERATION");
  if(generation!=="MY_REPORT_2_CURRENT_20260929_CURRENT_CYCLE_V13_20M")throw new Error(`STALE_OR_UNKNOWN_GENERATION:${generation}`);
  const started = Date.now();
  const nativeDayReconciliation=loadVerifiedNativeDayReconciliation({root:resolve('..'),now_ts:started,generation});
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
  const triggerOnly=envText('REPORT2_TRIGGER_ONLY_RUN',{required:false})==='1';
  const triggerKickTaskId=envText('REPORT2_TRIGGER_KICK_TASK_ID',{required:false});
  if(triggerOnly&&(requestedSource!=='schedule'||!triggerKickTaskId))throw new Error('EXACT_TRIGGER_KICK_TASK_REQUIRED');
  let manualCommandId=envText('REPORT2_COMMAND_ID',{required:false});
  let manualCommandClaim=triggerOnly?{claimed:false,status:'TRIGGER_KICK_DOES_NOT_RECOVER_MANUAL_COMMAND'}:requestedSource==='schedule'
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
    await enforcePeriodicOwnership({ownership,context:{generation,head:process.env.GITHUB_SHA,source_run_id:process.env.GITHUB_RUN_ID,task_id:triggerKickTaskId,trigger_only:triggerOnly,started_ts:started,failed_ts:Date.now(),d1_usage:env.DATA_DB.usageSnapshot?.()},write_result:output=>fs.writeFile('report2-run-result.json',JSON.stringify(output,null,2))});
    const cadence=triggerOnly?{claimed:false,status:'NOT_DUE',scope:'TRIGGER_ONLY_PRESERVES_REGULAR_CADENCE'}:await claimMaintenanceCadence(env.DATA_DB,{job_key:'TWO_CANDIDATE_ANALYTICS_40M',actor:manualCommandActor,now_ts:started,interval_ms:TWO_CANDIDATE_PLAN.scheduled_interval_minutes*60_000});
    console.log('SCHEDULED_TWO_CANDIDATE_ADMISSION',JSON.stringify(cadence));
    if(!cadence.claimed){
      if(!['NOT_DUE','LEASE_ACTIVE'].includes(cadence.status))throw new Error(`SCHEDULED_CADENCE_NOT_CLOSED:${cadence.status}`);
      let triggered={claimed:false,status:'REGULAR_CADENCE_LEASE_ACTIVE'};
      if(cadence.status==='NOT_DUE'){
        if(!proveTriggeredRecheckD1Budget().safe)throw new Error('TRIGGERED_RECHECK_D1_PLAN_UNSAFE');
        const admissionBudget=evaluateDailyReservationBudget({daily:await loadDailyUsageAggregate(env.DATA_DB,started,{reconciliation:nativeDayReconciliation}),
          nextReservation:{rows_read:TWO_CANDIDATE_PLAN.d1_run_cap.rows_read+TRIGGERED_RECHECK_D1_RESERVATION.rows_read,
            rows_written:TWO_CANDIDATE_PLAN.d1_run_cap.rows_written+TRIGGERED_RECHECK_D1_RESERVATION.rows_written},
          maxDailyReads:envNumber('REPORT2_D1_MAX_DAILY_READS',3500000),maxDailyWrites:envNumber('REPORT2_D1_MAX_DAILY_WRITES',70000)});
        if(admissionBudget.allowed){
          const triggerReservationId=`R2TRIGGER:${started}:${sha.slice(0,16)}`;
          await reserveRunBudget(env.DATA_DB,{reservationId:triggerReservationId,now:started,reservation:TRIGGERED_RECHECK_D1_RESERVATION});
          try{
            triggered=await admitTriggeredRecheck(env.DATA_DB,{actor:preflight.actor,now_ts:started,task_id:triggerOnly?triggerKickTaskId:null,admit:()=>({allowed:true})});
            const usage=env.DATA_DB.usageSnapshot();
            if(usage.unknown_ops||usage.rows_read>1300||usage.rows_written>14)throw new Error('TRIGGERED_ADMISSION_D1_ENVELOPE_EXCEEDED');
          }finally{
            await finalizeRunUsage(env.DATA_DB,{reservationId:triggerReservationId,sourceRunId:process.env.GITHUB_RUN_ID||'TRIGGERED_ADMISSION',usage:env.DATA_DB.usageSnapshot()});
          }
        }else{triggered={claimed:false,status:'D1_BUDGET_BLOCKED',budget:admissionBudget};await enforceDailyAnalysisAdmission({admission:admissionBudget,context:{daily_usage_scope:'NATIVE_DAILY_AGGREGATE',native_d1_daily:admissionBudget.daily,generation,head:process.env.GITHUB_SHA,source_run_id:process.env.GITHUB_RUN_ID,source,task_id:triggerOnly?triggerKickTaskId:null,trigger_only:triggerOnly,trigger_admission:true,started_ts:started,failed_ts:Date.now(),d1_usage:env.DATA_DB.usageSnapshot?.()},write_result:output=>fs.writeFile('report2-run-result.json',JSON.stringify(output,null,2))});}
      }
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
    const savedOutput=await loadCanonicalRunOutput(env.DATA_DB,{runId:savedRunId,source:'manual',generation,head:process.env.GITHUB_SHA||null,cron:null,candidateContracts:savedContracts,include_primary_selection_diagnostic:true});
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
  // Invocation-local, six entries at most (the existing output SELECT limit).
  // A duplicate attempt/tuple is ambiguous; never substitute the latest result.
  const gateBindingDiagnostics=new Map();let gateDiagnosticOverflow=false;
  const gateDiagnosticKey=v=>{
    if(typeof v?.contract!=='string'||typeof v?.run_id!=='string'||!v.run_id||new TextEncoder().encode(v.contract).length>128||new TextEncoder().encode(v.run_id).length>128)return null;
    const key=JSON.stringify([v.contract,v.run_id]);return new TextEncoder().encode(key).length<=256?key:null;
  };
  const gateDiagnosticTuple=v=>{
    if(typeof v?.contract!=='string'||typeof v?.run_id!=='string'||!v.run_id||v.run_id.length>128||typeof v?.snapshot_id!=='string'||v.snapshot_id.length>128||!Number.isSafeInteger(v?.observed_ts)||v.observed_ts<1e12||v.snapshot_id!==`S392:${v.contract}:${v.observed_ts}`||!/^[a-f0-9]{64}$/.test(v?.analytical_fingerprint||''))return null;
    const tuple={contract:v.contract,run_id:v.run_id,snapshot_id:v.snapshot_id,observed_ts:v.observed_ts,analytical_fingerprint:v.analytical_fingerprint};
    return new TextEncoder().encode(JSON.stringify(tuple)).length<=512?tuple:null;
  };
  env.REPORT2_PUBLIC_ASSET_BINDING=async params=>{
    const key=gateDiagnosticKey(params);let entry=key===null?null:gateBindingDiagnostics.get(key);
    if(entry)entry.ambiguous=true;
    else if(key!==null&&gateBindingDiagnostics.size<6){entry={binding:captureGateBindingDiagnostic(null,{contract:params.contract}),tuple:null,ambiguous:false};gateBindingDiagnostics.set(key,entry);}
    else if(key!==null)gateDiagnosticOverflow=true;
    const result=await bindGateOfficialAssetIdentity({db:env.DATA_DB,fetch_impl:globalThis.fetch,request_admit:unifiedHttpBudget.reserve,db_admit:e=>evaluateWithinRunReservation({reservation:d1RunReservation,currentUsage:env.DATA_DB.usageSnapshot(),extraRowsRead:4500+e.rows_read,extraRowsWritten:150+e.rows_written}),...params});
    if(entry&&!entry.ambiguous)entry.binding=captureGateBindingDiagnostic(result,{contract:params.contract});
    return result;
  };
  env.REPORT2_GATE_BINDING_DIAGNOSTIC_BIND=value=>{
    const tuple=gateDiagnosticTuple(value),entry=gateBindingDiagnostics.get(gateDiagnosticKey(value));
    if(!entry)return;
    if(!tuple||entry.tuple){entry.ambiguous=true;return;}
    entry.tuple=tuple;
  };
  const gateDiagnosticFor=canonical=>{
    const value={contract:canonical?.metadata?.contract,run_id:canonical?.run_id,snapshot_id:canonical?.snapshot_id,observed_ts:canonical?.observed_ts,analytical_fingerprint:canonical?.analytical_fingerprint};
    const tuple=gateDiagnosticTuple(value),entry=gateBindingDiagnostics.get(gateDiagnosticKey(value));
    if(!entry)return gateDiagnosticOverflow?{...captureGateBindingDiagnostic(null,{contract:value.contract}),carrier_status:'OVERFLOW'}:null;
    if(!tuple||!entry.tuple||entry.ambiguous||Object.keys(tuple).some(k=>tuple[k]!==entry.tuple[k]))return null;
    return entry.binding;
  };
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
  const providerBudgetReceipts=createProviderBudgetReceiptCapture();
  let currentBlockWeightPolicy=null,blockPolicyLoaded=false;
  env.REPORT2_EVIDENCE_V2_COLLECT=async params=>{const result=await collectCandidateEvidenceV2({db:env.DATA_DB,fetch_impl:globalThis.fetch,request_admit:unifiedHttpBudget.reserve,source_health_admit:e=>evaluateWithinRunReservation({reservation:d1RunReservation,currentUsage:env.DATA_DB.usageSnapshot(),extraRowsRead:4500+e.rows_read,extraRowsWritten:150+e.rows_written}),blockscout_api_key:envText('BLOCKSCOUT_PRO_API_KEY',{required:false}),coingecko_demo_api_key:envText('REPORT2_COINGECKO_DEMO_API_KEY',{required:false}),...params,provider_budget_observe:providerBudgetReceipts.observe,main_index_failure_backoff:expectedManualMode!=='LIQUIDATION_ONLY'});if(!blockPolicyLoaded){currentBlockWeightPolicy=await loadBlockWeightPolicy(env.DATA_DB,{now:Date.now(),admit:e=>evaluateWithinRunReservation({reservation:d1RunReservation,currentUsage:env.DATA_DB.usageSnapshot(),extraRowsRead:4500+e.rows_read,extraRowsWritten:150})});blockPolicyLoaded=true;}console.log('EVIDENCE_SOURCE_HEALTH_RECEIPT',JSON.stringify({contract:params.contract,run_id:params.run_id,source_health:result.source_health,shared_http_envelope:result.shared_http_envelope}));return {...result,block_weight_policy:currentBlockWeightPolicy};};
  env.REPORT2_EVIDENCE_V2_FINALIZE=params=>finalizeCandidateBlockCoverage(params);
  await installBykQuotaLedger(env.DATA_DB);
  env.REPORT2_BYKARANTELI_RESERVE=makeBykReserve(env.DATA_DB,{source});
  env.REPORT2_TRACKED_HL_FUTURE_COLLECT=params=>{if(['BTC-USDT','ETH-USDT'].includes(params.contract))return Promise.resolve({status:'EXCLUDED_BY_USER_POLICY',maps:[],network_calls:0});const admission=env.REPORT2_LIQUIDATION_COVERAGE_FOR?.(params.contract);return admission?.eligible&&admission.source_ids.includes('BYK_TRACKED_HL_BANDS')?collectTrackedBands({fetch_impl:globalThis.fetch,request_admit:unifiedHttpBudget.reserve,...params}):Promise.resolve({status:'COVERAGE_GATE_NOT_ADMITTED',maps:[],network_calls:0,coverage_admission:admission??null});};
  const liquidationQueue=createCandidateTaskQueue({db:env.DATA_DB});
  const liquidationCalibration=createLiquidationOutcomeCalibration({db:env.DATA_DB,fetch_impl:globalThis.fetch});
  const liquidationForecastMemory=createLiquidationForecastMemory({db:env.DATA_DB,admit:extra=>evaluateWithinRunReservation({reservation:d1RunReservation,currentUsage:env.DATA_DB.usageSnapshot(),extraRowsRead:5000+extra.rows_read,extraRowsWritten:100+extra.rows_written})});
  await Promise.all([liquidationQueue.install(),liquidationCalibration.install()]);
  env.REPORT2_LIQUIDATION_SIGNAL_RECORD=params=>liquidationCalibration.record(params);
  env.REPORT2_LIQUIDATION_FORECAST_RECORD=params=>liquidationForecastMemory.record(params);
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
const d1DailyBeforeReservationRaw = await loadDailyUsageAggregate(env.DATA_DB, started,{reconciliation:nativeDayReconciliation});
const d1DailyBeforeReservation = buildR88DailyAdmissionView(d1DailyBeforeReservationRaw,d1RunReservation);
const d1DayAdmission = evaluateDailyReservationBudget({
  daily:d1DailyBeforeReservation,
  nextReservation:d1RunReservation,
  maxDailyReads:envNumber("REPORT2_D1_MAX_DAILY_READS", 3_500_000),
  maxDailyWrites:envNumber("REPORT2_D1_MAX_DAILY_WRITES", 70_000),
});
await enforceDailyAnalysisAdmission({admission:d1DayAdmission,context:{daily_usage_scope:'ADAPTIVE_ADMISSION_POLICY_INPUTS',native_d1_daily:d1DailyBeforeReservationRaw,generation,head:process.env.GITHUB_SHA,source_run_id:process.env.GITHUB_RUN_ID,source,task_id:triggerKickTaskId,trigger_only:triggerOnly,started_ts:started,failed_ts:Date.now(),d1_usage:env.DATA_DB.usageSnapshot?.()},write_result:output=>fs.writeFile('report2-run-result.json',JSON.stringify(output,null,2))});
console.log("R8_8_ADAPTIVE_DAILY_ADMISSION", JSON.stringify({nominal:d1NominalReservation,burst:d1RunReservation,raw_daily:d1DailyBeforeReservationRaw,adaptive_daily:d1DailyBeforeReservation,admission:d1DayAdmission}));
  const d1ReservationId = `R2RUN:${started}:${sha.slice(0,16)}`;
  const d1ReservationReceipt = await reserveRunBudget(env.DATA_DB,{reservationId:d1ReservationId,now:started,reservation:d1RunReservation});
  failedD1RunAccounting=createFailedD1RunAccounting({db:env.DATA_DB,reservation_id:d1ReservationId,source_run_id:process.env.GITHUB_RUN_ID||String(started),finalize_usage:finalizeRunUsage});
  const privateHistoryToken=envText('REPORT2_CANONICAL_ARCHIVE_D1_API_TOKEN',{required:false});
  if(privateHistoryToken&&envText('REPORT2_CANONICAL_PRIVATE_READER_ENABLED',{required:false})==='1'){
    // Reading an already stored exact locator remains possible when pool
    // writing is paused. Constructing these bindings performs no requests.
    const archivePool=createPrivateArchivePool({enabled:true,token:privateHistoryToken,fetch_impl:nativeFetch});
    env.DATA_DB.enablePrivateCanonicalHistory({...archivePool.readerOptions(),max_rows:4,db_admit:e=>evaluateWithinRunReservation({reservation:d1RunReservation,currentUsage:env.DATA_DB.usageSnapshot(),extraRowsRead:4500+e.rows_read,extraRowsWritten:150+e.rows_written})});
  }
  if(source==='schedule'){
    const cacheMaintenance=await maintainExpiredProviderCache({db:env.DATA_DB,now:started,admit:budget=>evaluateWithinRunReservation({reservation:d1RunReservation,currentUsage:env.DATA_DB.usageSnapshot(),extraRowsRead:budget.rows_read,extraRowsWritten:budget.rows_written})});
    console.log('BOUNDED_EXPIRED_PROVIDER_CACHE_MAINTENANCE',JSON.stringify(cacheMaintenance));
  }
  const storedLiquidationCoverageDatabase=await loadFuturesCoverageDatabase({db:env.DATA_DB,now:started});
  const liquidationCoverageDatabase=alignFuturesCoverageToApprovedScope(storedLiquidationCoverageDatabase,{approved_analysis_contracts:APPROVED_HTX_ANALYSIS_CONTRACTS,universe_sha256:APPROVED_HTX_SCOPE.manifest_sha256,universe_observed_ts:APPROVED_HTX_SCOPE.catalog_observed_ts,now:started});
  const liquidationCoverageSummary=summarizeFuturesCoverage(liquidationCoverageDatabase,{now:started});
  const dydxCryptoAssets=new Set(APPROVED_HTX_ANALYSIS_CONTRACTS.map(a=>a.asset_symbol));
  const liquidationCoverageFor=contract=>{const exact=String(contract||'').trim().toUpperCase(),now=Date.now(),base=runtimeLiquidationCollectionAdmission(liquidationCoverageDatabase,{contract:exact,now}),gtrade=addGTradePinnedCollectionPermission(base,{database:liquidationCoverageDatabase,contract:exact,routing:env.REPORT2_LIQUIDATION_VENUE_REGISTRY?.gtrade_position_routing,now});return addDydxCollectionPermission(gtrade,{contract:exact,crypto_assets:dydxCryptoAssets,routing:env.REPORT2_LIQUIDATION_VENUE_REGISTRY?.dydx_routing,now,automatic_discovery_enabled:true});};
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
      await finalizeRunUsage(env.DATA_DB,{reservationId:d1ReservationId,sourceRunId,now:Date.now(),usage:env.DATA_DB.usageSnapshot()});failedD1RunAccounting.markFinalized();
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
    await enforcePeriodicOwnership({ownership,context:{generation,head:process.env.GITHUB_SHA,source_run_id:process.env.GITHUB_RUN_ID,task_id:triggerKickTaskId,trigger_only:triggerOnly,started_ts:started,failed_ts:Date.now(),d1_usage:env.DATA_DB.usageSnapshot?.()},write_result:output=>fs.writeFile('report2-run-result.json',JSON.stringify(output,null,2))});
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
    liquidationSources=createCombinedLiquidationService({mode:'SHADOW_ONLY',gtrade_position_routing:gtradePositionRouting,gtrade_crypto_assets:dydxCryptoAssets,on_gtrade_position_routing:onGtradePositionRouting,dydx_enabled:Boolean(scopes.DYDX_RPC),dydx_automatic_discovery_enabled:true,dydx_crypto_assets:dydxCryptoAssets,dydx_routing:dydxRouting,on_dydx_snapshot:onDydxSnapshot,official_trades_discovery_enabled:true,gtrade_reserve_rpc_enabled:true,native_wallet_routing:nativeWalletRouting,on_native_accounts:onNativeAccounts,candidate_slots:env.REPORT2_DEEP_RUNTIME_OPTIONS?.max_per_run||1,gtrade_routing_catalog:env.REPORT2_LIQUIDATION_VENUE_REGISTRY?.gtrade_routing_catalog,on_gtrade_catalog:onGtradeCatalog,provider_admit:providerAdmit,fetch_impl:globalThis.fetch,swole_discovery_enabled:Boolean(scopes.SWOLE_DISCOVERY),accounts_per_deep:3,max_http_per_run:LIQ_NATIVE_HTTP_ALLOCATION,max_total_ms:45000,liqflow_key:envText('LIQFLOW_API_KEY',{required:false}),oxarchive_config:oxarchiveConfig,source_weight_store:sourceWeightStore});
    manualLiquidationSources=createCombinedLiquidationService({mode:'SHADOW_ONLY',gtrade_position_routing:gtradePositionRouting,gtrade_crypto_assets:dydxCryptoAssets,on_gtrade_position_routing:onGtradePositionRouting,dydx_enabled:Boolean(scopes.DYDX_RPC),dydx_automatic_discovery_enabled:true,dydx_crypto_assets:dydxCryptoAssets,dydx_routing:dydxRouting,on_dydx_snapshot:onDydxSnapshot,official_trades_discovery_enabled:true,gtrade_reserve_rpc_enabled:true,native_wallet_routing:nativeWalletRouting,on_native_accounts:onNativeAccounts,provider_admit:providerAdmit,fetch_impl:globalThis.fetch,swole_discovery_enabled:Boolean(scopes.SWOLE_DISCOVERY),accounts_per_deep:3,max_http_per_run:6,max_total_ms:45000,liqflow_key:envText('LIQFLOW_API_KEY',{required:false}),oxarchive_config:oxarchiveConfig,source_weight_store:sourceWeightStore});
    env.REPORT2_LIQUIDATION_SOURCE_AUDIT=({contract,run_id,evaluated_ts})=>buildLiquidationSourceAcquisitionAudit({summary:liquidationSources.summary(),run_id,candidates:[contract],evaluated_ts});
    let orderlyHttpUsed=0,coinbossHttpUsed=0,swoleHttpUsed=0;const supplementHttpByContract=new Map();
    env.REPORT2_LIQUIDATION_NATIVE_COLLECT=async params=>{if(['BTC-USDT','ETH-USDT'].includes(params.contract))return null;const coverageAdmission=liquidationCoverageFor(params.contract);if(!coverageAdmission.eligible){console.log('MAIN_LIQUIDATION_COVERAGE_SKIPPED',JSON.stringify({contract:params.contract,status:coverageAdmission.status,network_calls:0}));return null;}const externalHttpAlreadyUsed=orderlyHttpUsed+coinbossHttpUsed+swoleHttpUsed,nativeUsed=liquidationSources.summary().shared_budget.reserved_http;const tracked=[...futureHttpByContract.values()];const totalFuture=tracked.every(n=>Number.isSafeInteger(n)&&n>=0)?Math.max(nativeUsed+externalHttpAlreadyUsed,tracked.reduce((a,b)=>a+b,0)):null;const nativeRoom=nativeLiquidationHeadroom({native_http:nativeUsed,total_future_http:totalFuture});const guardedParams=params.cache_only===true||nativeRoom===0?{...params,cache_only:true,max_http_for_candidate:0}:{...params,max_http_for_candidate:Math.min(nativeRoom,Number.isSafeInteger(params.max_http_for_candidate)?Math.max(0,params.max_http_for_candidate):nativeRoom)};const acquisition=await collectSelectedNativeBatch({service:liquidationSources,params:guardedParams,selection:env.REPORT2_LIQUIDATION_SELECTED_CONTRACTS,coverage_for:liquidationCoverageFor,http_by_contract:futureHttpByContract});const risk=liquidationRiskByContract.get(params.contract);if(risk){risk.source_chain=buildLiquidationSourceChain({contract:params.contract,risk,native:liquidationSources.summary(),coverage:risk.liquidation_venue_coverage,coinlobster:contextForContract(env.REPORT2_GLOBAL_MARKET_CONTEXT,params.contract)?.coinlobster,venue_registry:env.REPORT2_LIQUIDATION_VENUE_REGISTRY});console.log('MAIN_LIQUIDATION_SOURCE_CHAIN',JSON.stringify(risk.source_chain));}return acquisition;};
    env.REPORT2_LIQUIDATION_SOURCE_ORDER=liquidationSourceOrder;
    env.REPORT2_COINBOSS_LIQUIDATION_COLLECT=async params=>{const nativeUsed=liquidationSources.summary().shared_budget.reserved_http,perCandidate=futureHttpByContract.get(params.contract)??0,max_http=liquidationSupplementAllowance({source:'COINBOSS',native_http:nativeUsed,orderly_http:orderlyHttpUsed,coinboss_http:coinbossHttpUsed,swole_http:swoleHttpUsed,candidate_http:perCandidate,supplement_http_for_candidate:supplementHttpByContract.get(params.contract)??0});const result=await collectCoinBossLiquidationLevels({...params,fetch_impl:globalThis.fetch,request_admit:unifiedHttpBudget.reserve,max_http});coinbossHttpUsed+=result.network_calls;supplementHttpByContract.set(params.contract,(supplementHttpByContract.get(params.contract)??0)+result.network_calls);futureHttpByContract.set(params.contract,perCandidate+result.network_calls);console.log('COINBOSS_LIQUIDATION_SOURCE',JSON.stringify({contract:params.contract,status:result.status,source_ts:result.source_ts??null,scenario_count:result.scenarios.length,network_calls:result.network_calls,shared_future_http_used:nativeUsed+orderlyHttpUsed+coinbossHttpUsed+swoleHttpUsed,combined_candidate_http_used:perCandidate+result.network_calls}));return result;};
    env.REPORT2_SWOLE_LIQUIDATION_COLLECT=async params=>{const nativeUsed=liquidationSources.summary().shared_budget.reserved_http,perCandidate=futureHttpByContract.get(params.contract)??0,max_http=liquidationSupplementAllowance({source:'SWOLE',native_http:nativeUsed,orderly_http:orderlyHttpUsed,coinboss_http:coinbossHttpUsed,swole_http:swoleHttpUsed,candidate_http:perCandidate,supplement_http_for_candidate:supplementHttpByContract.get(params.contract)??0});const result=await collectSwolechartsLiquidationLevels({...params,fetch_impl:globalThis.fetch,request_admit:unifiedHttpBudget.reserve,max_http});swoleHttpUsed+=result.network_calls;supplementHttpByContract.set(params.contract,(supplementHttpByContract.get(params.contract)??0)+result.network_calls);futureHttpByContract.set(params.contract,perCandidate+result.network_calls);console.log('SWOLE_LIQUIDATION_SOURCE',JSON.stringify({contract:params.contract,status:result.status,source_ts:result.source_ts??null,scenario_count:result.scenarios.length,network_calls:result.network_calls,shared_future_http_used:nativeUsed+orderlyHttpUsed+coinbossHttpUsed+swoleHttpUsed,combined_candidate_http_used:perCandidate+result.network_calls}));return result;};
    env.REPORT2_ORDERLY_PUBLIC_POSITIONS_COLLECT=async params=>{const perCandidate=futureHttpByContract.get(params.contract)??0,nativeUsed=liquidationSources.summary().shared_budget.reserved_http,max_http=liquidationSupplementAllowance({source:'ORDERLY',native_http:nativeUsed,orderly_http:orderlyHttpUsed,coinboss_http:coinbossHttpUsed,swole_http:swoleHttpUsed,candidate_http:perCandidate,supplement_http_for_candidate:supplementHttpByContract.get(params.contract)??0});const result=await collectOrderlyPublicPositions({...params,fetch_impl:globalThis.fetch,request_admit:unifiedHttpBudget.reserve,max_http});orderlyHttpUsed+=result.network_calls;supplementHttpByContract.set(params.contract,(supplementHttpByContract.get(params.contract)??0)+result.network_calls);futureHttpByContract.set(params.contract,perCandidate+result.network_calls);console.log('ORDERLY_PUBLIC_POSITION_LEVELS',JSON.stringify({contract:params.contract,status:result.status,source_ts:result.source_ts??null,reported_positions:result.reported_positions??null,numeric_positions:result.numeric_positions??0,nearby_levels:result.levels.length,network_calls:result.network_calls,shared_future_http_used:nativeUsed+orderlyHttpUsed+coinbossHttpUsed+swoleHttpUsed,combined_candidate_http_used:perCandidate+result.network_calls}));return result;};
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
    if(candidate&&candidateCoverage.eligible&&!['BTC-USDT','ETH-USDT'].includes(candidate.contract)&&candidateCoverage.source_ids.includes('BYK_TRACKED_HL_BANDS')){
      const grant=await env.REPORT2_BYKARANTELI_RESERVE({contract:candidate.contract,run_id:sourceRunId,units:1,now:Date.now()});
      if(grant.allowed){
        trackedHlFuture=await env.REPORT2_TRACKED_HL_FUTURE_COLLECT({contract:candidate.contract,run_id:sourceRunId,byk_admission:grant,now:Date.now()});
        bykFutureCalls=trackedHlFuture?.network_calls??0;
      }
    }
    if(candidate&&candidateCoverage.eligible&&!['BTC-USDT','ETH-USDT'].includes(candidate.contract)&&manualLiquidationSources){
      const collectFor=async row=>{
        const contract=String(row.contract||'').trim().toUpperCase(),nativeSymbol=contract.replace(/-USDT$/,'');
        const sourceIdentity=env.REPORT2_LIQUIDATION_VENUE_REGISTRY?.entries?.[nativeSymbol]||null;
        try{return await manualLiquidationSources.collect({contract,native_symbol:nativeSymbol,run_id:sourceRunId,deep_started_ts:Date.now(),max_deep_ms:45000,max_http_for_candidate:Math.max(0,8-bykFutureCalls),early_candidate_bridge:row.qualified_growth_candidate===true,early_candidate_quality_0_100:row.qualified_growth_candidate===true?Math.min(100,60+Number(row.anomaly_flags_count||0)*5):null,manual_liquidation_request:true,source_identity:sourceIdentity,allowed_source_ids:candidateCoverage.source_ids,proven_level_source_ids:candidateCoverage.proven_level_source_ids||[],structural_market_source_ids:candidateCoverage.structural_market_source_ids||[]});}
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
    let coinBossManual=null,swoleManual=null,manualOrderly=null,manualSupplementHttp=0;
    if(candidate){for(const source of liquidationSourceOrder(candidate.contract)){
      const available=Math.max(0,Math.min(1,8-bykFutureCalls-(coinFuture?.network_calls??0)-(manualLiquidationSources?.summary().shared_budget.reserved_http??0)-manualSupplementHttp));
      const collect=source==='ORDERLY'?collectOrderlyPublicPositions:source==='SWOLE'?collectSwolechartsLiquidationLevels:collectCoinBossLiquidationLevels;
      const result=await collect({contract:candidate.contract,reference_price:candidate.current_price,run_id:sourceRunId,fetch_impl:globalThis.fetch,request_admit:unifiedHttpBudget.reserve,max_http:available});
      manualSupplementHttp+=result.network_calls??0;
      if(source==='ORDERLY')manualOrderly=result;else if(source==='SWOLE')swoleManual=result;else coinBossManual=result;
      if(source!=='ORDERLY'&&result.status==='CLOSED'&&result.scenarios?.length)break;
    }}
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
    const liquidationMap=candidate&&(candidateCoverage.eligible||coinBossManual?.status==='CLOSED'||swoleManual?.status==='CLOSED'||manualOrderly?.status==='CLOSED')?buildPumpLiquidationZones({
      provider_maps:[...(trackedHlView.maps||[]),...capturedNativeFutureMaps({contract:candidate.contract,run_id:sourceRunId})],native_contexts:contexts,observed_ts:Date.now(),
      external_calculated_scenarios:[...(coinBossManual?.status==='CLOSED'?coinBossManual.scenarios:[]),...(swoleManual?.status==='CLOSED'?swoleManual.scenarios:[])],
      contract:candidate.contract,
      rolling_24h_change_pct:null,
      current_price:candidate.current_price,
      early_anomaly:candidate.qualified_growth_candidate===true,
      priority_reason:candidate.qualified_growth_candidate===true?'EARLY_TECHNICAL_ANOMALY':'MANUAL_LIQUIDATION_REQUEST',
      projected:manualOrderly?.status==='CLOSED'?manualOrderly.levels:[],
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
    const manualLiquidationObservedTs=Date.now();
    const manualLiquidationAudit=candidate?buildLiquidationSourceAcquisitionAudit({summary:manualLiquidationSources?.summary(),run_id:sourceRunId,candidates:[candidate.contract],evaluated_ts:manualLiquidationObservedTs}):null;
    const manualLiquidationDiagnostics=candidate?bindLiquidationAcquisitionDiagnostics({audit:manualLiquidationAudit,contract:candidate.contract,run_id:sourceRunId,snapshot_id:sourceRunId+':'+candidate.contract,observed_ts:manualLiquidationObservedTs}):null;
    if(manualLiquidationDiagnostics)liquidationMap.acquisition_diagnostics=manualLiquidationDiagnostics;
    let manualForecastReceipt={status:'NOT_RECORDED'};if(candidate)try{manualForecastReceipt=await liquidationForecastMemory.record({contract:candidate.contract,run_id:sourceRunId,liquidations:liquidationMap,observed_ts:manualLiquidationObservedTs,reference_price:candidate.current_price});}catch(error){manualForecastReceipt={status:'SOURCE_ERROR',reason:String(error?.message||error).slice(0,120)};}
    const scopedCoinLobster=candidate?contextForContract(env.REPORT2_GLOBAL_MARKET_CONTEXT,candidate.contract)?.coinlobster:null;
    const sourceChain=buildLiquidationSourceChain({contract:candidate?.contract,risk:crossExchangeRisk,native:manualLiquidationSources?.summary()??{},coverage:liquidationVenueCoverage,coinlobster:scopedCoinLobster,future_models:coinFuture,byk_future:bykFuture,tracked_hl:trackedHlView,htx_model:liquidationMap.htx_source_backed_model,venue_registry:env.REPORT2_LIQUIDATION_VENUE_REGISTRY});
    const freshnessAudit=buildLiquidationFreshnessAudit(sourceChain);
    const liquidationPolicy=liquidationPresentationPolicy(started);
    const nativeLines=candidate?formatStandaloneLiquidationSourceLines(liquidationContext,{policy:liquidationPolicy}):[];
    const lines=candidate&&!candidateCoverage.eligible&&coinBossManual?.status!=='CLOSED'&&swoleManual?.status!=='CLOSED'?[`${candidate.contract}: проверенных источников с будущими уровнями сейчас нет. Ликвидационный анализ для этой монеты не запускается.`]:candidate?[
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
    const d1FinalizedUsage=await finalizeRunUsage(env.DATA_DB,{reservationId:d1ReservationId,sourceRunId,now:Date.now(),usage:env.DATA_DB.usageSnapshot()});failedD1RunAccounting.markFinalized();
    const result={ok:true,version:RUNNER_VERSION,mode:commandIntent.mode,command:commandIntent.normalized,exact_contract:commandIntent.contract||null,status:candidate&&!candidateCoverage.eligible&&coinBossManual?.status!=='CLOSED'&&swoleManual?.status!=='CLOSED'?'NO_VERIFIED_FUTURE_LEVEL_SOURCE':freshnessAudit.complete?scanResult.status:'PARTIAL_SOURCE_COVERAGE',scan:scanResult.scan,preliminary_candidates:scanResult.candidates,verified_candidate:candidate?.contract||null,coverage_admission:candidateCoverage,coverage_summary:liquidationCoverageSummary,liquidation_lines:lines,liquidation_map:liquidationMap,coinboss_liquidation:{source:coinBossManual?.source??'COINBOSS_CEX_MODEL',status:coinBossManual?.status??'NOT_COLLECTED',reason:coinBossManual?.reason??null,capability_receipt:coinBossManual?.capability_receipt??null,source_ts:coinBossManual?.source_ts??null,scenario_count:coinBossManual?.scenarios?.length??0,network_calls:coinBossManual?.network_calls??0},swole_liquidation:{source:swoleManual?.source??'SWOLECHARTS_CEX_MODEL',status:swoleManual?.status??'NOT_COLLECTED',source_ts:swoleManual?.source_ts??null,scenario_count:swoleManual?.scenarios?.length??0,network_calls:swoleManual?.network_calls??0},forecast_memory:manualForecastReceipt,future_map_source:futureMapSource,future_provider_models:coinFuture,byk_future:bykFuture,tracked_hl_future:trackedHlView,future_levels_status:liquidationMap.future_levels_status,dynamic_liquidation_panel:liquidationPanel,volume_profile:effectiveVolumeProfile,volume_profile_consensus:volumeConsensus,cross_exchange_risk:crossExchangeRisk,source_chain:sourceChain,freshness_audit:freshnessAudit,liquidation_venue_coverage:liquidationVenueCoverage,liquidation_sources:manualLiquidationSources?manualLiquidationSources.summary():{status:'NOT_CONFIGURED_FAIL_CLOSED'},liquidation_candidate_queue:liquidationQueueSummary,outcome_calibration:{settlement:liquidationCalibrationSettlement,record:calibrationRecord,predictive_source_weights:predictiveSourceWeights},global_market_context:{status:env.REPORT2_GLOBAL_MARKET_CONTEXT?.status||'NOT_CLOSED',coinlobster_liquidation_status:scopedCoinLobster?.status||'NOT_CLOSED',coinlobster_cache_status:scopedCoinLobster?.cache_status||null,coinlobster_network_calls:scopedCoinLobster?.network_calls??0,coinlobster_matching_liquidation_rows:scopedCoinLobster?.realized_liquidations?.length||0,coinlobster_matching_named_events:scopedCoinLobster?.named_liquidations?.length||0,deribit:'NOT_APPLICABLE_LIQUIDATION_ONLY',internal_only:true},full_report_started:false,decision_generated:false,probability:null,validated_signal:false,telegram_started:false,execution:false,request_caps:{projected_liquidation:0,cross_exchange_risk:candidateCoverage.eligible?3:0,volume_profile:candidateCoverage.eligible?3:0,volume_profile_peers:candidateCoverage.eligible?4:0,total:candidateCoverage.eligible?15:0},d1_post_cycle_budget:d1PostCycleBudget,d1_finalized_usage:d1FinalizedUsage,d1_usage:d1Usage};
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
      liquidation_lines:lines,liquidation_map:liquidationMap,liquidation_source_acquisition_audit:manualLiquidationAudit,future_map_source:futureMapSource,future_provider_models:coinFuture,byk_future:bykFuture,tracked_hl_future:trackedHlView,future_levels_status:liquidationMap.future_levels_status,future_level_count:liquidationMap.provider_zone_count,source_chain:sourceChain,freshness_audit:freshnessAudit,factual_history:crossExchangeRisk.sources,report_text:reportText,generated_at:new Date().toISOString(),secrets_included:false,alternative_manual_recalculation:false,telegram_started:false};
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
  const anomalyParentCapability=installRunnerAnomalyParentCapability({
    env,db:env.DATA_DB,reservation:d1RunReservation,reservation_id:d1ReservationId,
    receipt:d1ReservationReceipt,day_admission:d1DayAdmission,http_budget:unifiedHttpBudget,
    post_v7:postV7UnifiedEnabled,cost_bounds:process.env.REPORT2_ANOMALY_DOMAIN_COST_BOUNDS,on_receipt:persistRunnerAnomalyReceipts,
  });
  try {
    await worker.scheduled({ scheduledTime: started, cron: source === "schedule" ? "ROTATING_EXACT_20_MINUTES" : "manual" }, env, ctx);
  } finally {
    try { await anomalyParentCapability.close(); }
    finally { if(anomalyParentCapability.installed)try{await persistRunnerAnomalyReceipts(anomalyParentCapability.receipts());}catch{console.error("ANOMALY_RECEIPT_ARTIFACT_NOT_SAVED");} }
  }
  const leaseAfterWorker=await assertAnalyticsFence(env.DATA_DB,analyticsLease,{now:Date.now()});
  if(!leaseAfterWorker.allowed)throw new Error(`ANALYTICS_FENCE_LOST_AFTER_WORKER:${leaseAfterWorker.status}`);
  if(liquidationSources)console.log('LIQUIDATION_SOURCES_CANONICAL_RECEIPT',JSON.stringify(liquidationSources.summary()));
  console.log('LIQUIDATION_PREDICTIVE_SOURCE_WEIGHTS_FINAL',JSON.stringify(await liquidationCalibration.summary()));
  if (pending.length) await Promise.all(pending);
  const cron = await env.DATA_DB.prepare("SELECT run_id,scheduled_time,started_ts,completed_ts,status,universe_total,scanned,persistence_status,error_text,v3_discovery_shortlist_count,v3_live_shortlist_count,v3_live_deep_check_count,v3_live_zero_reason,v3_pipeline_health_status,v3_pipeline_health_reason,v3_live_lane,v3_maintenance_deferred FROM cron_runs WHERE scheduled_time = ?1 ORDER BY started_ts DESC LIMIT 1").bind(started).first();
  if (!cron) throw new Error(`CRON_IDENTITY_NOT_FOUND:${started}`);
  if (Number(cron.scheduled_time) !== Number(started)) throw new Error(`CRON_IDENTITY_MISMATCH:${cron.scheduled_time}!=${started}`);
  if ((cron.status !== "SUCCESS"&&!approvedHtxLimitedCronAdmitted(cron,env.REPORT2_CURRENT_CYCLE_UNIVERSE_AUDIT)) || cron.completed_ts == null) {
    const failure=new Error(`CRON_IDENTITY_NOT_SUCCESS:${JSON.stringify(cron)}`);
    failure.partial_cron_failure={schema:'PARTIAL_CRON_IN_MEMORY_DIAGNOSTIC_V1',generation,head:process.env.GITHUB_SHA||null,source_run_id:process.env.GITHUB_RUN_ID||null,cron,approved_universe_audit:env.REPORT2_CURRENT_CYCLE_UNIVERSE_AUDIT||null,candidate_selection_audit:env.REPORT2_CURRENT_CYCLE_SELECTION_AUDIT||null,d1_day_admission:d1DayAdmission,additional_SQL:0,additional_source_HTTP:0,full_report_completed:false,entry_authorized:false,Telegram_SENT_claimed:false};
    throw failure;
  }
  console.log("CRON_IDENTITY_BINDING", JSON.stringify({ expected_scheduled_time:started, selected_scheduled_time:Number(cron.scheduled_time), run_id:String(cron.run_id || "") }));
  const scan = await env.DATA_DB.prepare("SELECT ts,universe_total,scanned,errors,stale,stage0_coverage_pct FROM scan_runs WHERE ts BETWEEN ?1 AND ?2 ORDER BY ABS(ts - ?3) ASC LIMIT 1").bind(Number(cron.started_ts), Number(cron.completed_ts), Number(cron.started_ts)).first();
  console.log("SCAN_IDENTITY_BINDING", JSON.stringify({ cron_started_ts:Number(cron.started_ts), cron_completed_ts:Number(cron.completed_ts), selected_scan_ts:Number(scan?.ts || 0) || null }));
  assertClosedCron(cron, scan, env.REPORT2_CURRENT_CYCLE_UNIVERSE_AUDIT);
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
  const liqAccessBinding=liquidationAccessPathBinding({source,trigger_only:triggerOnly,started_ts:started});
  let liqAccessCapture=null;
  const r88RealizedGate = v3SidecarsPreactionBudget.allowed ? r88Gate(V3_REALIZED_LIQUIDATION_SIDECAR_BUDGET) : v3SidecarsPreactionBudget;
  if (r88RealizedGate.allowed) {
    liqAccessCapture=liqAccessBinding?captureRealizedAccessPath(env.DATA_DB,liqAccessBinding,started):null;
    try {
    v3RealizedLiquidationSidecar = await runV3RealizedLiquidationSidecar(env.DATA_DB, {
      current_scan_ts:Number(scan.ts), source_run_id:String(cron.run_id || ""), now_ts:started,
    });
    } finally {liqAccessCapture?.restore();}
  } else v3RealizedLiquidationSidecar = v3Blocked("v3-realized-liquidation-sidecar-shadow-v1",r88RealizedGate,"REALIZED_LIQUIDATION_AGGREGATION");
  const r88ProjectedGate = v3SidecarsPreactionBudget.allowed ? r88Gate(V3_LIQUIDATION_SIDECAR_BUDGET) : v3SidecarsPreactionBudget;
  if (r88ProjectedGate.allowed) {
    v3LiquidationSidecar = await runV3LiquidationIntelligenceSidecar(env.DATA_DB, {
      current_scan_ts:Number(scan.ts), source_run_id:String(cron.run_id || ""), now_ts:started,
    });
  } else v3LiquidationSidecar = v3Blocked("v3-liquidation-intelligence-sidecar-shadow-v1",r88ProjectedGate,"PROJECTED_LIQUIDATION");
  if(liqAccessBinding&&liqAccessCapture)await recordLiquidationAccessPath({db:env.DATA_DB,binding:liqAccessBinding,captured:liqAccessCapture?.read(),reservation:d1RunReservation,parent_receipt:d1ReservationReceipt,day_admission:d1DayAdmission,downstream:postV7CriticalLaneReserve,http_admit:unifiedHttpBudget.reserve,original_result:v3RealizedLiquidationSidecar});
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
    v3PipelineHealthSidecar = await runV3PipelineHealthSidecar(env.DATA_DB, {cron,scan,telegram_zero_reason:telegramZeroReason,critical_feed_state:v3CriticalFeedState,approved_scope:env.REPORT2_CURRENT_CYCLE_UNIVERSE_AUDIT,now_ts:Date.now()});
  }
  console.log("V3_PIPELINE_HEALTH_SIDECAR", JSON.stringify(v3PipelineHealthSidecar));
  if(approvedHtxLimitedReportAdmitted(env.REPORT2_CURRENT_CYCLE_UNIVERSE_AUDIT)&&(v3PipelineHealthSidecar.status!=='CLOSED'||v3PipelineHealthSidecar.health?.global_report_admission!=='ADMITTED'))throw new Error('LIMITED_REPORT_PIPELINE_HEALTH_NOT_ADMITTED');
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
  const canonicalRunOutputBase=await loadCanonicalRunOutput(env.DATA_DB,{runId:cron.run_id,source,generation,head:process.env.GITHUB_SHA||null,cron,candidateContracts:env.REPORT2_CURRENT_CYCLE_SELECTION_AUDIT?.deep_check_selected||[],gate_diagnostic_for:gateDiagnosticFor,include_primary_selection_diagnostic:true});
  const canonicalRunOutput={...canonicalRunOutputBase,...(approvedHtxLimitedReportAdmitted(env.REPORT2_CURRENT_CYCLE_UNIVERSE_AUDIT)?{limited_report_scope:env.REPORT2_CURRENT_CYCLE_UNIVERSE_AUDIT.limited_report,full_report_completed:false,limited_report_completed:['CLOSED','CLOSED_NO_CANONICAL_CANDIDATE'].includes(canonicalRunOutputBase.status)&&canonicalRunOutputBase.reason===null}:{}),liquidation_source_acquisition_audit:buildLiquidationSourceAcquisitionAudit({summary:liquidationSources?.summary(),run_id:String(cron.run_id||''),candidates:canonicalRunOutputBase.candidates.map(r=>r.contract),evaluated_ts:Date.now()}),market_scan_audit:{
    universe_total:Number(cron.universe_total),scanned:Number(cron.scanned),errors:Number(scan.errors||0),stale:Number(scan.stale||0),
    approved_scope:env.REPORT2_CURRENT_CYCLE_UNIVERSE_AUDIT||null,
    scanned_market_data:env.REPORT2_CURRENT_CYCLE_UNIVERSE_AUDIT?.market_data_analysis_contracts??Number(cron.scanned),
    officially_unavailable:env.REPORT2_CURRENT_CYCLE_UNIVERSE_AUDIT?.officially_unavailable_analysis_contracts||[],
    scan_count_basis:env.REPORT2_CURRENT_CYCLE_UNIVERSE_AUDIT?.scan_count_basis||'LEGACY_MARKET_DATA_ONLY',
    stage0_coverage_pct:Number(scan.stage0_coverage_pct),complete:env.REPORT2_CURRENT_CYCLE_UNIVERSE_AUDIT?.status==='CLOSED'&&Number(cron.scanned)===Number(cron.universe_total)&&Number(scan.errors||0)===0&&Number(scan.stale||0)===0&&Number(scan.stage0_coverage_pct)>=99.9,
  },candidate_selection_audit:env.REPORT2_CURRENT_CYCLE_SELECTION_AUDIT||null};
  if(canonicalRunOutput.limited_report_scope)canonicalRunOutput.report_text=formatManualRunSummary(canonicalRunOutput);
  if(env.REPORT2_TRIGGERED_RECHECK_TASK_ID)canonicalRunOutput.triggered_recheck={task_id:env.REPORT2_TRIGGERED_RECHECK_TASK_ID,scope:'FRESH_FULL_ANALYSIS_FROM_EXACT_SENT_PRICE_TRIGGER',entry_authorized_by_price:false,max_per_run:1,original_ttl_unchanged:true};
  canonicalOutputForFailure=canonicalRunOutput;
  await fs.writeFile('report2-run-result.json',JSON.stringify(canonicalRunOutput,null,2));
  await fs.writeFile('same-run-delivery-proof.json',JSON.stringify(buildSameRunDeliveryProof({output:canonicalRunOutput,delivery:v3TelegramDeliverySidecar,recorded_at:Date.now()}),null,2));
  console.log('CANONICAL_RUN_OUTPUT',JSON.stringify({status:canonicalRunOutput.status,run_id:canonicalRunOutput.run_id,candidates:canonicalRunOutput.candidates.map(row=>({contract:row.contract,direction:row.direction,state:row.canonical_state,actionability_status:row.actionability_status,wave_id_present:Boolean(row.wave_id)}))}));

  // Statistical/diagnostic observers are hourly and only after every user-critical
  // lane. This preserves the 7–14 day evidence programme without starving live work.
  const scheduledMinuteUtc = new Date(started).getUTCMinutes();
  let postV7MaintenanceClaim=null;
  let postV7MaintenanceCompletion=null;
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
    postV7MaintenanceCompletion=await completeMaintenanceCadence(env.DATA_DB,{job_key:"HOURLY_LOW_PRIORITY_STATS",actor:"GITHUB_ACTIONS",lease_started_ts:postV7MaintenanceClaim.lease_started_ts,success:cadenceOk,now_ts:Date.now(),result:cadenceOk?"CLOSED":"NOT_CLOSED"});
  }
  const lowPriorityMaintenanceReceipt=buildMaintenanceCadenceReceipt({source,unified_enabled:postV7UnifiedEnabled,scheduled_minute_utc:scheduledMinuteUtc,low_priority_cadence_due:lowPriorityCadenceDue,claim:postV7MaintenanceClaim,completion:postV7MaintenanceCompletion});
  const r820ManualNonFatalStatuses=new Set(["CLOSED","CAPACITY_DEFERRED_FAIL_CLOSED","BUDGET_ENVELOPE_EXCEEDED_FAIL_CLOSED","DEFERRED_LOW_PRIORITY_CADENCE","DEFERRED_BUDGET_ADMISSION"]);
  if (source !== "schedule" && r820ProspectiveValidationEnabled && !r820ManualNonFatalStatuses.has(r820ProspectiveValidationSidecar?.status)) {
    throw new Error(`R8_20_PROSPECTIVE_VALIDATION_SMOKE_FAIL_CLOSED:${r820ProspectiveValidationSidecar?.status || "UNKNOWN"}`);
  }
  if (source !== "schedule" && telegramReportTestRequested && telegramOutput?.morning?.sent !== true && telegramOutput?.morning?.delivery_confirmed !== true) {
    throw new Error(`TELEGRAM_REPORT_TEST_FAIL_CLOSED:${telegramOutput?.morning?.status || "UNKNOWN"}`);
  }
  console.log("R8_8_D1_PRE_POST_USAGE", JSON.stringify({reservation:d1RunReservation,usage:env.DATA_DB.usageSnapshot()}));
  const d1PostCycleBudget = evaluateWithinRunReservation({reservation:d1RunReservation,currentUsage:env.DATA_DB.usageSnapshot(),extraRowsWritten:1});
  if (!d1PostCycleBudget.allowed){const error=new Error(`D1_POST_CYCLE_RESERVATION_EXCEEDED:${d1PostCycleBudget.status}:${(d1PostCycleBudget.reasons||[]).join(",")}`);error.d1_usage=env.DATA_DB.usageSnapshot();throw error;}
  const d1Usage = enforceR88RunBudget(env.DATA_DB,{reservation:d1RunReservation,dayAdmission:d1DayAdmission,runsPerDay:envNumber("REPORT2_D1_RUNS_PER_DAY",288),maxDailyReads:envNumber("REPORT2_D1_MAX_DAILY_READS",3500000),maxDailyWrites:envNumber("REPORT2_D1_MAX_DAILY_WRITES",70000)});
  const d1FinalizedUsage = await finalizeRunUsage(env.DATA_DB,{reservationId:d1ReservationId,sourceRunId:cron.run_id,now:Date.now(),usage:env.DATA_DB.usageSnapshot()});failedD1RunAccounting.markFinalized();
  const analyticsLeaseFinish=await releaseAnalyticsLease();
  if(!analyticsLeaseFinish.finished)throw new Error(`ANALYTICS_LEASE_FINISH_FAILED:${analyticsLeaseFinish.status}`);
  const completed = Date.now();
  const d1AfterAnalyticsLeaseRelease=env.DATA_DB.usageSnapshot();
  const existingRunBudgetContext=buildRunBudgetContext({run_id:String(cron.run_id||''),recorded_ts:completed,http:unifiedHttpBudget.summary(),reservation:d1RunReservation,usage:d1AfterAnalyticsLeaseRelease,day_admission:d1DayAdmission,native_liquidation:canonicalRunOutput.liquidation_source_acquisition_audit?.shared_budget,provider_receipts:providerBudgetReceipts.summary(String(cron.run_id||''))});
  const finalRunResult={ ok:true, version:RUNNER_VERSION, source, started_ts:started, completed_ts:completed, duration_ms:completed-started, worker_sha256:sha, post_v7_unified_enabled:postV7UnifiedEnabled, analytics_lease:analyticsLeaseFinish, cron_run_id:cron.run_id, universe_total:Number(cron.universe_total), scanned:Number(cron.scanned), stage0_coverage_pct:Number(scan.stage0_coverage_pct), canonical_run_output:{status:canonicalRunOutput.status,candidate_count:canonicalRunOutput.candidates.length,artifact:'report2-run-result.json'}, telegram_observer:telegramObserver, v3_sidecars_preaction_budget:v3SidecarsPreactionBudget, v3_early_sidecar:v3EarlySidecar, v3_realized_liquidation_sidecar:v3RealizedLiquidationSidecar, v3_liquidation_sidecar:v3LiquidationSidecar, v3_critical_feed_state:v3CriticalFeedState, v3_pipeline_health_sidecar:v3PipelineHealthSidecar, v3_telegram_lifecycle_sidecar:v3TelegramLifecycleSidecar, v3_telegram_delivery_sidecar:v3TelegramDeliverySidecar, v3_telegram_journal_enabled:v3TelegramJournalEnabled, v3_telegram_network_enabled:v3TelegramNetworkEnabled, r8_20_prospective_validation_gate:r820ProspectiveValidationGate, r8_20_prospective_validation_sidecar:r820ProspectiveValidationSidecar, existing_run_budget_context:existingRunBudgetContext, maintenance_cadence:lowPriorityMaintenanceReceipt, block_weight_statistics:blockWeightStatistics, discovery_recall_kpi:discoveryRecallKpi, telegram_output:telegramOutput, telegram_zero_reason:telegramZeroReason, d1_run_reservation:d1RunReservation, d1_day_admission:d1DayAdmission, d1_reservation_receipt:d1ReservationReceipt, d1_pretelegram_budget:d1PreTelegramBudget, d1_post_cycle_budget:d1PostCycleBudget, d1_finalized_usage:d1FinalizedUsage, d1_usage:d1Usage, bykaranteli_secret_exported:false };
  if(envText('REPORT2_MEASUREMENT_ARTIFACT_ENABLED',{required:false})==='1')await fs.writeFile('report2-measurement.json',JSON.stringify({schema:'report2-measured-run-v1',generation,worker_sha256:sha,source,started_ts:started,completed_ts:completed,duration_ms:completed-started,cron_run_id:cron.run_id,universe_total:Number(cron.universe_total),scanned:Number(cron.scanned),stage0_coverage_pct:Number(scan.stage0_coverage_pct),live_shortlist_count:Number(cron.live_shortlist_count||0),live_deep_check_count:Number(cron.v3_live_deep_check_count||0),pipeline_health_status:cron.v3_pipeline_health_status||null,telegram_network_enabled:v3TelegramNetworkEnabled,telegram_output_enabled:telegramOutput?.enabled===true,d1_finalized_usage:d1FinalizedUsage,d1_usage:d1Usage,unknown_ops:Number(d1Usage?.unknown_ops||0),secret_values_stored:false},null,2));
  // Preserve exact existing completion counters/statistical status outside
  // digit-redacted GitHub console logs. Metadata only; no SQL/HTTP or new claim.
  try{await fs.writeFile('report2-completion-accounting.json',JSON.stringify({schema:'REPORT2_FULL_COMPLETION_ACCOUNTING_V1',head:process.env.GITHUB_SHA||null,cloud_run:process.env.GITHUB_RUN_ID||null,generation,run_id:String(cron.run_id||''),source,started_ts:started,recorded_ts:Date.now(),canonical_status:canonicalRunOutput.status,candidate_count:canonicalRunOutput.candidates.length,reservation_id:d1ReservationId,reservation:d1RunReservation,day_admission:d1DayAdmission,ledger_finalization:d1FinalizedUsage,usage_before_finalization:d1Usage,usage_after_analytics_lease_release:d1AfterAnalyticsLeaseRelease,existing_run_budget_context:existingRunBudgetContext,analytics_lease:analyticsLeaseFinish,statistics:{maintenance:lowPriorityMaintenanceReceipt,block_weights:blockWeightStatistics,discovery_recall:discoveryRecallKpi,prospective_gate:r820ProspectiveValidationGate,prospective:r820ProspectiveValidationSidecar},delivery:v3TelegramDeliverySidecar,telegram_network_enabled:v3TelegramNetworkEnabled,scope:'FULL_ANALYTICS_AFTER_LEDGER_FINALIZATION_AND_LEASE_RELEASE_BEFORE_OPTIONAL_MANUAL_COMMAND_COMPLETION_AND_EXTERNAL_ARCHIVE_COPY',statement_journals_recorded:false,whole_day_closed:false,reservations_refunded:false,additional_SQL:0,additional_source_HTTP:0,contains_SQL_params_or_results:false,secret_values_stored:false},null,2));}catch{console.error('REPORT2_COMPLETION_ACCOUNTING_ARTIFACT_NOT_SAVED');}
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
  if(canonicalOutputForFailure){
    try{const output=markPostAnalysisControlFailure(canonicalOutputForFailure,{head:process.env.GITHUB_SHA,error,usage:error?.d1_usage});await fs.writeFile('report2-run-result.json',JSON.stringify(output,null,2));console.error('REPORT2_POST_ANALYSIS_CONTROL_FAILURE',JSON.stringify(output.post_analysis_control_failure));}catch{console.error('REPORT2_CONTROL_FAILURE_ARTIFACT_NOT_CLOSED');}
  }
  if(error?.pre_analysis_failure)console.error('REPORT2_PRE_ANALYSIS_FAILURE',JSON.stringify(error.pre_analysis_failure));
  if(cleanupClaimedAnalyticsLease){
    try{
      const cleanup=await cleanupClaimedAnalyticsLease();
      console.error('REPORT2_FATAL_ANALYTICS_LEASE_CLEANUP',JSON.stringify(cleanup));
    }catch(cleanupError){
      console.error('REPORT2_FATAL_ANALYTICS_LEASE_CLEANUP_FAILED',String(cleanupError?.stack||cleanupError));
    }
  }
  if(failedD1RunAccounting){
    const accounting=await failedD1RunAccounting.finalizeFailure();
    if(error?.partial_cron_failure)accounting.partial_cron_failure=error.partial_cron_failure;
    console.error('REPORT2_FAILED_D1_RUN_ACCOUNTING',JSON.stringify(accounting));
    try{
      await fs.writeFile('report2-failure-accounting.json',JSON.stringify(accounting,null,2));
      if(canonicalOutputForFailure){const output=markPostAnalysisControlFailure(canonicalOutputForFailure,{head:process.env.GITHUB_SHA,error,usage:failedD1RunAccounting.usage()});output.post_analysis_control_failure.d1_failure_accounting=accounting;await fs.writeFile('report2-run-result.json',JSON.stringify(output,null,2));}
    }catch{console.error('REPORT2_FAILURE_ACCOUNTING_ARTIFACT_NOT_CLOSED');}
  }
  console.error("REPORT2_RUNNER_FATAL", String(error?.stack || error));
  process.exitCode=1;
});

