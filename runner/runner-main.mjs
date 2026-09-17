import fs from "node:fs/promises";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { RemoteD1Database } from "./report2-d1-adapter.mjs";
import { runTelegramOutputLayer } from "./telegram-output.mjs";

const RUNNER_VERSION = "my-report-2-github-cloud-runner-v4.7.3-telegram-watch70-tree-guard";
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
    if (source === "schedule" && minute !== 2) {
      const report = { mode:"DISCOVERY_RECALL_KPI_SHADOW_V1", status:"DEFERRED_HOURLY_SLOT", scheduled_minute_utc:minute, persisted:false };
      console.log("DISCOVERY_RECALL_KPI_SHADOW", JSON.stringify(report));
      return report;
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
    const bucket = Math.floor(ts / 3_600_000) * 3_600_000;
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
  await worker.scheduled({ scheduledTime: started, cron: source === "schedule" ? "*/5 * * * *" : "manual" }, env, ctx);
  if (pending.length) await Promise.all(pending);
  const cron = await env.DATA_DB.prepare("SELECT run_id,scheduled_time,started_ts,completed_ts,status,universe_total,scanned,persistence_status,error_text FROM cron_runs WHERE scheduled_time = ?1 ORDER BY started_ts DESC LIMIT 1").bind(started).first();
  if (!cron) throw new Error(`CRON_IDENTITY_NOT_FOUND:${started}`);
  if (Number(cron.scheduled_time) !== Number(started)) throw new Error(`CRON_IDENTITY_MISMATCH:${cron.scheduled_time}!=${started}`);
  if (cron.status !== "SUCCESS" || cron.completed_ts == null) throw new Error(`CRON_IDENTITY_NOT_SUCCESS:${JSON.stringify(cron)}`);
  console.log("CRON_IDENTITY_BINDING", JSON.stringify({ expected_scheduled_time:started, selected_scheduled_time:Number(cron.scheduled_time), run_id:String(cron.run_id || "") }));
  const scan = await env.DATA_DB.prepare("SELECT ts,universe_total,scanned,errors,stale,stage0_coverage_pct FROM scan_runs WHERE ts BETWEEN ?1 AND ?2 ORDER BY ABS(ts - ?3) ASC LIMIT 1").bind(Number(cron.started_ts), Number(cron.completed_ts), Number(cron.started_ts)).first();
  console.log("SCAN_IDENTITY_BINDING", JSON.stringify({ cron_started_ts:Number(cron.started_ts), cron_completed_ts:Number(cron.completed_ts), selected_scan_ts:Number(scan?.ts || 0) || null }));
  assertClosedCron(cron, scan);
  const telegramObserver = await observeNaturalTelegramDecision(env.DATA_DB);
  const discoveryRecallKpi = await observeDiscoveryRecallKpi(env.DATA_DB, { startedTs:started, source, runId:cron.run_id });
  if (source !== "schedule" && discoveryRecallKpi?.status === "OBSERVER_ERROR_FAIL_CLOSED") {
    throw new Error(`DISCOVERY_RECALL_KPI_VALIDATION_FAIL_CLOSED:${discoveryRecallKpi.error || "UNKNOWN"}`);
  }
  const telegramOutput = await runTelegramOutputLayer({
    db: env.DATA_DB,
    scan,
    telegramObserver,
    startedTs: started,
    source,
    relayUrl: envText("REPORT2_TELEGRAM_RELAY_URL", { required: false }),
    relayKey: envText("REPORT2_TELEGRAM_RELAY_KEY", { required: false }),
    reportTest: envText("REPORT2_TELEGRAM_REPORT_TEST", { required: false }),
    shadowDecisionAuto: envText("REPORT2_TELEGRAM_SHADOW_DECISION_AUTO", { required: false }),
    watch70Enabled: envText("REPORT2_TELEGRAM_WATCH70_ENABLED", { required: false }),
    watch70Threshold: envText("REPORT2_TELEGRAM_WATCH70_THRESHOLD", { required: false }),
    enabled: envText("REPORT2_TELEGRAM_OUTPUT_ENABLED", { required: false }),
    fetchImpl: nativeFetch,
  });
  if (source !== "schedule" && ["1","true","yes","on"].includes(String(process.env.REPORT2_TELEGRAM_REPORT_TEST || "").trim().toLowerCase()) && telegramOutput?.morning?.sent !== true) {
    throw new Error(`TELEGRAM_REPORT_TEST_FAIL_CLOSED:${telegramOutput?.morning?.status || "UNKNOWN"}`);
  }
  const d1Usage = enforceD1Budget(env.DATA_DB);
  const completed = Date.now();
  console.log(JSON.stringify({ ok:true, version:RUNNER_VERSION, source, started_ts:started, completed_ts:completed, duration_ms:completed-started, worker_sha256:sha, cron_run_id:cron.run_id, universe_total:Number(cron.universe_total), scanned:Number(cron.scanned), stage0_coverage_pct:Number(scan.stage0_coverage_pct), telegram_observer:telegramObserver, discovery_recall_kpi:discoveryRecallKpi, telegram_output:telegramOutput, d1_usage:d1Usage, bykaranteli_secret_exported:false }));
}
main().catch((error) => { console.error("REPORT2_RUNNER_FATAL", String(error?.stack || error)); process.exit(1); });
