import fs from "node:fs/promises";
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
import { runR820ProspectiveValidationSidecar, R820_PROSPECTIVE_VALIDATION_BUDGET } from "./r8-20-prospective-validation-sidecar.mjs";

const RUNNER_VERSION = "my-report-2-github-cloud-runner-v4.14.2-telegram-validation-isolated";
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
      return nativeFetch(envText("REPORT2_SOURCE_PROXY_URL"), {
        method: "POST",
        headers: {
          "content-type": "application/json", accept: "application/json",
          authorization: `Bearer ${envText("REPORT2_SOURCE_PROXY_TOKEN")}`,
          "user-agent": "My-Report-2-GitHub-Source-Proxy/4.3",
        },
        body: JSON.stringify({ url: target.toString() }),
        signal: init?.signal ?? (input instanceof Request ? input.signal : undefined),
      });
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
  return { worker: mod.default, sha: actual };
}
function buildEnv() {
  return {
    DATA_DB: new RemoteD1Database(envText("REPORT2_D1_BRIDGE_URL"), envText("REPORT2_D1_BRIDGE_TOKEN"), { fetchImpl: nativeFetch, timeoutMs: 45_000 }),
    BYKARANTELI_API_KEY: envText("BYKARANTELI_API_KEY"),
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
      SELECT mode,status,closed_horizons,strategy_changed,decision_weights_changed,
             live_probability,validated_signal,automatic_telegram,trading_execution
      FROM discovery_recall_kpi_shadow
      WHERE audit_ts_bucket = ?1
      LIMIT 1
    `).bind(bucket).first();
    const readbackOk = Boolean(
      persistedRow &&
      persistedRow.mode === "DISCOVERY_RECALL_KPI_SHADOW_V1" &&
      ["CLOSED","PARTIAL"].includes(String(persistedRow.status || "")) &&
      Number(persistedRow.closed_horizons || 0) >= 1 &&
      Number(persistedRow.strategy_changed || 0) === 0 &&
      Number(persistedRow.decision_weights_changed || 0) === 0 &&
      Number(persistedRow.live_probability || 0) === 0 &&
      Number(persistedRow.validated_signal || 0) === 0 &&
      Number(persistedRow.automatic_telegram || 0) === 0 &&
      Number(persistedRow.trading_execution || 0) === 0
    );
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
async function main() {
  const source = envText("REPORT2_RUN_SOURCE", { required: false }) || "manual";
  const { worker, sha } = await loadWorker();
  const env = buildEnv();
  const pending = [];
  const ctx = { waitUntil(promise) { pending.push(Promise.resolve(promise)); }, passThroughOnException() {} };
  const started = Date.now();
  const d1NominalReservation = deriveRunReservation({
  runsPerDay:envNumber("REPORT2_D1_RUNS_PER_DAY", 288),
  maxDailyReads:envNumber("REPORT2_D1_MAX_DAILY_READS", 3_500_000),
  maxDailyWrites:envNumber("REPORT2_D1_MAX_DAILY_WRITES", 70_000),
});
if (!d1NominalReservation.ok) throw new Error(`D1_RUN_RESERVATION_NOT_CLOSED:${d1NominalReservation.status}`);
const d1RunReservation = buildR88BurstReservation(d1NominalReservation);
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
  await worker.scheduled({ scheduledTime: started, cron: source === "schedule" ? "*/5 * * * *" : "manual" }, env, ctx);
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
      // V3 network delivery supersedes legacy final-chain output to prevent duplicate ENTRY.
      // R8 ships with V3 network OFF, so legacy production behavior is unchanged initially.
      enabled: v3TelegramNetworkEnabled ? "0" : envText("REPORT2_TELEGRAM_OUTPUT_ENABLED", { required: false }),
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
  const r88Gate = (envelope) => evaluateWithinRunReservation({
    reservation:d1RunReservation,
    currentUsage:env.DATA_DB.usageSnapshot(),
    extraRowsRead:R88_DOWNSTREAM_RESERVE.rows_read + envelope.rows_read,
    extraRowsWritten:R88_DOWNSTREAM_RESERVE.rows_written + envelope.rows_written,
  });
  const v3SidecarsPreactionBudget = evaluateWithinRunReservation({
    reservation:d1RunReservation,
    currentUsage:env.DATA_DB.usageSnapshot(),
    extraRowsRead:R88_DOWNSTREAM_RESERVE.rows_read,
    extraRowsWritten:R88_DOWNSTREAM_RESERVE.rows_written,
  });
  const v3Blocked = (version, gate, lane) => ({version,mode:"SHADOW_ONLY",status:"CAPACITY_DEFERRED_FAIL_CLOSED",persisted:0,reasons:gate?.reasons||[],capacity_lane:lane,capacity_gate:gate,probability:null,validated_signal:false,trading_execution:false});
  const completedLifecycleHandoffs = v3SidecarsPreactionBudget.allowed
    ? await loadCompletedLifecycleHandoffs(env.DATA_DB,{source_run_id:String(cron.run_id||""),now_ts:Date.now()})
    : {status:"BUDGET_BLOCKED_FAIL_CLOSED",handoffs:[]};
  console.log("TELEGRAM_COMPLETED_HANDOFFS",JSON.stringify({status:completedLifecycleHandoffs.status,contracts:completedLifecycleHandoffs.handoffs.map(h=>h.contract_code)}));
  let v3EarlySidecar;
  let v3RealizedLiquidationSidecar;
  let v3LiquidationSidecar;
  const r88EarlyGate = v3SidecarsPreactionBudget.allowed ? r88Gate(V3_EARLY_SIDECAR_BUDGET) : v3SidecarsPreactionBudget;
  if (r88EarlyGate.allowed) {
    v3EarlySidecar = await runV3EarlyPersistenceSidecar(env.DATA_DB, {
      current_scan_ts:Number(scan.ts), source_run_id:String(cron.run_id || ""), now_ts:started,
      preferred_contracts:completedLifecycleHandoffs.status==="CLOSED"?completedLifecycleHandoffs.handoffs.map(h=>h.contract_code):[],
    });
  } else v3EarlySidecar = v3Blocked("v3-early-sidecar-shadow-v1",r88EarlyGate,"EARLY_PERSISTENCE");
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
  const discoveryRecallKpi = telegramInstallValidation
    ? {status:"SKIPPED_OWNER_TELEGRAM_VALIDATION",shadow_only:true,auto_send:false}
    : await observeDiscoveryRecallKpi(env.DATA_DB, { startedTs:started, source, runId:cron.run_id });
  if (source !== "schedule" && !telegramInstallValidation && discoveryRecallKpi?.status === "OBSERVER_ERROR_FAIL_CLOSED") {
    throw new Error(`DISCOVERY_RECALL_KPI_VALIDATION_FAIL_CLOSED:${discoveryRecallKpi.error || "UNKNOWN"}`);
  }
  const lifecyclePreactionBudget=evaluateWithinRunReservation({reservation:d1RunReservation,currentUsage:env.DATA_DB.usageSnapshot(),
    extraRowsRead:V3_TELEGRAM_LIFECYCLE_SIDECAR_BUDGET.rows_read+INFO_D1_BUDGET.rowsRead,
    extraRowsWritten:V3_TELEGRAM_LIFECYCLE_SIDECAR_BUDGET.rows_written+INFO_D1_BUDGET.rowsWritten+1});
  if (!v3SidecarsPreactionBudget.allowed || !lifecyclePreactionBudget.allowed) {
    v3TelegramLifecycleSidecar = {version:"v3-telegram-lifecycle-sidecar-shadow-v1",mode:"SHADOW_ONLY",status:"BUDGET_BLOCKED_FAIL_CLOSED",network_send:false,dispatch_enabled:v3TelegramJournalEnabled,reasons:[...(v3SidecarsPreactionBudget.reasons||[]),...(lifecyclePreactionBudget.reasons||[])]};
  } else {
    v3TelegramLifecycleSidecar = await runV3TelegramLifecycleSidecar(env.DATA_DB, {
      source_run_id:String(cron.run_id || ""), now_ts:Date.now(),
      d1_pretelegram_budget_closed:lifecyclePreactionBudget.allowed, dispatch_enabled:v3TelegramJournalEnabled,
      completed_handoffs:completedLifecycleHandoffs,
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
  if (!v3SidecarsPreactionBudget.allowed) {
    v3PipelineHealthSidecar = {version:"v3-pipeline-health-sidecar-shadow-v1",mode:"SHADOW_ONLY",status:"BUDGET_BLOCKED_FAIL_CLOSED",market_signal:false,reasons:v3SidecarsPreactionBudget.reasons||[]};
  } else {
    v3PipelineHealthSidecar = await runV3PipelineHealthSidecar(env.DATA_DB, {cron,scan,telegram_zero_reason:telegramZeroReason,critical_feed_state:v3CriticalFeedState,now_ts:Date.now()});
  }
  console.log("V3_PIPELINE_HEALTH_SIDECAR", JSON.stringify(v3PipelineHealthSidecar));
  let v3TelegramDeliverySidecar;
  if (!v3SidecarsPreactionBudget.allowed || !d1PreTelegramBudget.allowed) {
    v3TelegramDeliverySidecar = {version:"v3-telegram-delivery-sidecar-shadow-v1",mode:"SHADOW_GATED_DELIVERY",status:"BUDGET_BLOCKED_FAIL_CLOSED",network_send:false,sent:0,reasons:[...(v3SidecarsPreactionBudget.reasons||[]),...(d1PreTelegramBudget.reasons||[])]};
  } else {
    v3TelegramDeliverySidecar = await runV3TelegramDeliverySidecar(env.DATA_DB, {
      enabled:v3TelegramNetworkEnabled,
      relay_url:envText("REPORT2_TELEGRAM_RELAY_URL", { required: false }),
      relay_key:envText("REPORT2_TELEGRAM_RELAY_KEY", { required: false }),
      now_ts:Date.now(), fetch_impl:nativeFetch,
    });
  }
  console.log("V3_TELEGRAM_DELIVERY_SIDECAR", JSON.stringify(v3TelegramDeliverySidecar));
  // R8.20 is intentionally last / low priority. It cannot consume capacity before
  // Early, liquidation, pipeline-health or Telegram lanes. The +1 write preserves
  // the existing final run-usage persistence slot.
  const r820ProspectiveValidationEnabled = ["1","true","yes","on"].includes(String(process.env.REPORT2_R8_20_PROSPECTIVE_VALIDATION_ENABLED || "0").trim().toLowerCase());
  const r820ProspectiveValidationGate = evaluateWithinRunReservation({
    reservation:d1RunReservation,
    currentUsage:env.DATA_DB.usageSnapshot(),
    extraRowsRead:R820_PROSPECTIVE_VALIDATION_BUDGET.rows_read,
    extraRowsWritten:R820_PROSPECTIVE_VALIDATION_BUDGET.rows_written + 1,
  });
  let r820ProspectiveValidationSidecar;
  if (!r820ProspectiveValidationEnabled) {
    r820ProspectiveValidationSidecar = {version:"r8-20-prospective-validation-sidecar-v1",mode:"SHADOW_PROSPECTIVE_VALIDATION_DATA_ONLY",status:"DISABLED",calibration_only:true,live_probability:null,validated_signal:false,trading_execution:false};
  } else if (!r820ProspectiveValidationGate.allowed) {
    r820ProspectiveValidationSidecar = {version:"r8-20-prospective-validation-sidecar-v1",mode:"SHADOW_PROSPECTIVE_VALIDATION_DATA_ONLY",status:"CAPACITY_DEFERRED_FAIL_CLOSED",reasons:r820ProspectiveValidationGate.reasons||[],capacity_gate:r820ProspectiveValidationGate,calibration_only:true,live_probability:null,validated_signal:false,trading_execution:false};
  } else {
    r820ProspectiveValidationSidecar = await runR820ProspectiveValidationSidecar(env.DATA_DB, {
      current_scan_ts:Number(scan.ts), source_run_id:String(cron.run_id || ""), now_ts:Date.now(),
    });
  }
  console.log("R8_20_PROSPECTIVE_VALIDATION_GATE", JSON.stringify(r820ProspectiveValidationGate));
  console.log("R8_20_PROSPECTIVE_VALIDATION_SIDECAR", JSON.stringify(r820ProspectiveValidationSidecar));
  if (source !== "schedule" && r820ProspectiveValidationEnabled && r820ProspectiveValidationSidecar?.status !== "CLOSED") {
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
  const completed = Date.now();
  console.log(JSON.stringify({ ok:true, version:RUNNER_VERSION, source, started_ts:started, completed_ts:completed, duration_ms:completed-started, worker_sha256:sha, cron_run_id:cron.run_id, universe_total:Number(cron.universe_total), scanned:Number(cron.scanned), stage0_coverage_pct:Number(scan.stage0_coverage_pct), telegram_observer:telegramObserver, v3_sidecars_preaction_budget:v3SidecarsPreactionBudget, v3_early_sidecar:v3EarlySidecar, v3_realized_liquidation_sidecar:v3RealizedLiquidationSidecar, v3_liquidation_sidecar:v3LiquidationSidecar, v3_critical_feed_state:v3CriticalFeedState, v3_pipeline_health_sidecar:v3PipelineHealthSidecar, v3_telegram_lifecycle_sidecar:v3TelegramLifecycleSidecar, v3_telegram_delivery_sidecar:v3TelegramDeliverySidecar, v3_telegram_journal_enabled:v3TelegramJournalEnabled, v3_telegram_network_enabled:v3TelegramNetworkEnabled, r8_20_prospective_validation_gate:r820ProspectiveValidationGate, r8_20_prospective_validation_sidecar:r820ProspectiveValidationSidecar, discovery_recall_kpi:discoveryRecallKpi, telegram_output:telegramOutput, telegram_zero_reason:telegramZeroReason, d1_run_reservation:d1RunReservation, d1_day_admission:d1DayAdmission, d1_reservation_receipt:d1ReservationReceipt, d1_pretelegram_budget:d1PreTelegramBudget, d1_post_cycle_budget:d1PostCycleBudget, d1_finalized_usage:d1FinalizedUsage, d1_usage:d1Usage, bykaranteli_secret_exported:false }));
}
main().catch((error) => { console.error("REPORT2_RUNNER_FATAL", String(error?.stack || error)); process.exit(1); });
