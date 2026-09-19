import { parseStage0CompactPayload } from './src/v3-early-discovery.mjs';
import { resolveEarlyOutcome } from './src/v3-early-persistence-runtime.mjs';
import {
  buildProspectiveEntryAreaSample,
  attachFactualEntryAreaOutcome,
} from './src/tz101-entry-area-calibration.mjs';

export const R820_PROSPECTIVE_VALIDATION_VERSION = 'r8-20-prospective-validation-sidecar-v1';
export const R820_ENTRY_ACTIVATION_KEY = 'R8_20_PROSPECTIVE_ACTIVATION_V1';
export const R820_PROSPECTIVE_VALIDATION_BUDGET = Object.freeze({
  rows_read: 1200,
  rows_written: 8,
  requests_soft_cap: 14,
  max_scan_rows_per_path: 320,
  max_capture_candidates: 12,
  max_early_outcomes_per_cycle: 1,
  max_entry_samples_per_cycle: 1,
  max_entry_outcomes_per_cycle: 1,
});

const HORIZONS = Object.freeze([1, 4, 12, 24]);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function finite(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function int(v) {
  const n = Number(v);
  return Number.isSafeInteger(n) ? n : null;
}
function text(v) { return v == null ? '' : String(v).trim(); }
function parseJson(v, fallback = null) {
  if (v && typeof v === 'object') return v;
  try { return JSON.parse(String(v ?? '')); } catch { return fallback; }
}
function rowsOf(r) { return Array.isArray(r?.results) ? r.results : []; }
function usageDelta(before, after) {
  if (!before || !after) return null;
  return {
    rows_read: Math.max(0, Number(after.rows_read || 0) - Number(before.rows_read || 0)),
    rows_written: Math.max(0, Number(after.rows_written || 0) - Number(before.rows_written || 0)),
    requests: Math.max(0, Number(after.requests || 0) - Number(before.requests || 0)),
    unknown_ops: Math.max(0, Number(after.unknown_ops || 0) - Number(before.unknown_ops || 0)),
  };
}
function base(status, extra = {}) {
  return {
    version: R820_PROSPECTIVE_VALIDATION_VERSION,
    mode: 'SHADOW_PROSPECTIVE_VALIDATION_DATA_ONLY',
    status,
    calibration_only: true,
    live_probability: null,
    validated_signal: false,
    trading_execution: false,
    automatic_weight_tuning: false,
    strategy_weights_changed: false,
    telegram_network_send: false,
    ...extra,
  };
}
function closedStage0Point(row, contract) {
  const parsed = parseStage0CompactPayload(row?.payload_json ?? null, row?.ts ?? null);
  if (parsed.status !== 'CLOSED') return null;
  const point = parsed.rows.get(contract);
  if (!point || point.data_status !== 'CLOSED') return null;
  if (finite(point.market_age_sec) === null || Number(point.market_age_sec) > 300) return null;
  if (finite(point.price) === null || Number(point.price) <= 0) return null;
  return { ts: Number(point.ts), price: Number(point.price) };
}

async function ensureActivation(db, nowTs) {
  const existing = await db.prepare(`SELECT state_key,status,updated_ts FROM tz101_entry_area_calibration_state WHERE state_key=?1 LIMIT 1`)
    .bind(R820_ENTRY_ACTIVATION_KEY).first();
  if (existing) {
    const activationTs = int(existing.updated_ts);
    if (activationTs === null) return { status: 'FAIL_CLOSED', reason: 'ACTIVATION_TS_INVALID' };
    return { status: 'CLOSED', activation_ts: activationTs, created: false };
  }
  const now = int(nowTs);
  if (now === null) return { status: 'FAIL_CLOSED', reason: 'NOW_TS_INVALID' };
  await db.prepare(`INSERT OR IGNORE INTO tz101_entry_area_calibration_state(
    state_key,status,closed_samples,train_samples,holdout_samples,validated_out_of_sample,
    live_promotion_allowed,automatic_rule_promotion,updated_ts
  ) VALUES(?1,'PROSPECTIVE_COLLECTION_ACTIVE_NOT_VALIDATED',0,0,0,0,0,0,?2)`).bind(R820_ENTRY_ACTIVATION_KEY, now).run();
  const readback = await db.prepare(`SELECT state_key,status,updated_ts FROM tz101_entry_area_calibration_state WHERE state_key=?1 LIMIT 1`)
    .bind(R820_ENTRY_ACTIVATION_KEY).first();
  const activationTs = int(readback?.updated_ts);
  if (!readback || activationTs === null || activationTs < now) return { status: 'FAIL_CLOSED', reason: 'ACTIVATION_READBACK_FAILED' };
  return { status: 'CLOSED', activation_ts: activationTs, created: true };
}

async function loadFactualPath(db, { contract, startTs, endTs, allowAfterTarget = false } = {}) {
  const start = int(startTs), end = int(endTs);
  if (!text(contract) || start === null || end === null || end < start) return { status: 'INVALID_INPUT', points: [] };
  const upper = allowAfterTarget ? end + 15 * MINUTE : end;
  const result = await db.prepare(`SELECT ts,payload_json FROM scan_runs
    WHERE ts BETWEEN ?1 AND ?2 AND stage0_coverage_pct>=99.9 AND errors=0 AND stale=0
    ORDER BY ts ASC LIMIT ${R820_PROSPECTIVE_VALIDATION_BUDGET.max_scan_rows_per_path}`)
    .bind(start, upper).all();
  const rows = rowsOf(result);
  const points = [];
  for (const row of rows) {
    const p = closedStage0Point(row, contract);
    if (p) points.push(p);
  }
  return { status: points.length ? 'CLOSED' : 'NO_FACTUAL_PATH', points, rows_loaded: rows.length };
}

export async function closeOneEarlyDiscoveryOutcome(db, { current_scan_ts, now_ts = Date.now() } = {}) {
  const currentTs = int(current_scan_ts);
  if (currentTs === null) return { status: 'NOT_CLOSED', reason: 'CURRENT_SCAN_TS_INVALID' };
  const task = await db.prepare(`SELECT outcome_id,wave_id,contract_code,direction_hint,first_seen_ts,horizon_hours,target_ts,
      outcome_status,first_seen_context_json,computed_ts,shadow_only
    FROM v3_early_outcome_journal
    WHERE shadow_only=1 AND computed_ts IS NULL AND outcome_status='PENDING' AND target_ts<=?1
    ORDER BY target_ts ASC,outcome_id ASC LIMIT 1`).bind(currentTs).first();
  if (!task) return { status: 'CLOSED_NO_DUE_EARLY_OUTCOME', closed: 0 };
  const context = parseJson(task.first_seen_context_json, {});
  const firstPrice = finite(context?.first_seen_price);
  if (firstPrice === null || firstPrice <= 0) return { status: 'NOT_CLOSED', reason: 'FIRST_SEEN_PRICE_MISSING', outcome_id: task.outcome_id };
  const path = await loadFactualPath(db, { contract: text(task.contract_code), startTs: Number(task.first_seen_ts), endTs: Number(task.target_ts), allowAfterTarget: false });
  if (path.status !== 'CLOSED') return { status: 'NOT_CLOSED', reason: path.status, outcome_id: task.outcome_id, rows_loaded: path.rows_loaded || 0 };
  const resolved = resolveEarlyOutcome({ task, first_seen_price: firstPrice, price_path: path.points, computed_ts: now_ts });
  if (resolved.status !== 'CLOSED') return { status: 'NOT_CLOSED', reason: resolved.reason || resolved.status, outcome_id: task.outcome_id, rows_loaded: path.rows_loaded || 0 };
  const o = resolved.outcome;
  const ack = await db.prepare(`UPDATE v3_early_outcome_journal SET
      outcome_status='CLOSED_FACTUAL',raw_return_pct=?1,directional_return_pct=?2,mfe_pct=?3,mae_pct=?4,computed_ts=?5
    WHERE outcome_id=?6 AND shadow_only=1 AND computed_ts IS NULL AND outcome_status='PENDING'`)
    .bind(o.raw_return_pct, o.directional_return_pct, o.mfe_pct, o.mae_pct, Number(o.computed_ts), text(task.outcome_id)).run();
  const changes = Number(ack?.meta?.changes ?? ack?.changes ?? 0);
  return {
    status: changes === 1 ? 'CLOSED_FACTUAL' : changes === 0 ? 'DEDUPLICATED' : 'FAIL_CLOSED',
    closed: changes === 1 ? 1 : 0,
    outcome_id: text(task.outcome_id),
    contract_code: text(task.contract_code),
    direction_hint: text(task.direction_hint) || null,
    horizon_hours: Number(task.horizon_hours),
    rows_loaded: path.rows_loaded || 0,
  };
}

function decisionSummaryFromRow(row) {
  return {
    decision_id: text(row?.decision_id),
    snapshot_id: text(row?.snapshot_id),
    contract_code: text(row?.contract_code),
    direction: text(row?.direction),
    campaign_receipt_id: text(row?.campaign_receipt_id),
    observation_ts: int(row?.observation_ts),
  };
}

export async function captureOneEntryAreaSample(db, { activation_ts, now_ts = Date.now() } = {}) {
  const activationTs = int(activation_ts);
  if (activationTs === null) return { status: 'NOT_CAPTURED', reason: 'ACTIVATION_TS_INVALID' };
  const result = await db.prepare(`SELECT
      f.decision_id,f.snapshot_id,f.contract_code,f.direction,f.campaign_receipt_id,f.observation_ts,f.persisted_ts,
      f.decision_status,f.shadow_only,f.live_probability,f.validated_signal,f.execution_authorized,f.telegram_eligible,
      j.receipt_json
    FROM final_decision_integration_shadow f
    JOIN stage392_multi_wave_receipt_journal j ON j.receipt_id=f.campaign_receipt_id
    WHERE f.persisted_ts>=?1
      AND f.decision_status='SHADOW_EVALUATED'
      AND f.direction IN ('LONG','SHORT')
      AND f.shadow_only=1 AND f.live_probability IS NULL AND f.validated_signal=0 AND f.execution_authorized=0 AND f.telegram_eligible=0
      AND json_type(j.receipt_json,'$.entry_scenario_anchor')='object'
      AND json_extract(j.receipt_json,'$.entry_scenario_anchor.prospective_only')=1
      AND NOT EXISTS (SELECT 1 FROM tz101_entry_area_calibration_signal s WHERE s.decision_id=f.decision_id)
    ORDER BY f.persisted_ts ASC,f.decision_id ASC
    LIMIT ${R820_PROSPECTIVE_VALIDATION_BUDGET.max_capture_candidates}`).bind(activationTs).all();
  const candidates = rowsOf(result);
  if (!candidates.length) return { status: 'CLOSED_NO_CAPTURABLE_DECISION', captured: 0 };
  for (const row of candidates) {
    const decision = decisionSummaryFromRow(row);
    const proof = parseJson(row.receipt_json, null);
    const sampleRecord = buildProspectiveEntryAreaSample({ decision_summary: decision, campaign_proof: proof, observed_ts: now_ts });
    if (sampleRecord.status !== 'CAPTURED_PROSPECTIVE') continue;
    const s = sampleRecord.sample;
    const ack = await db.prepare(`INSERT OR IGNORE INTO tz101_entry_area_calibration_signal(
      sample_id,decision_id,snapshot_id,contract_code,direction,campaign_receipt_id,campaign_id,observed_ts,
      anchor_committed_ts,entry_trigger_time,entry_trigger_price,base_low,base_high,invalidation_price,target_price,
      scenario_type,sample_json,material_digest,calibration_only,live_promotion_allowed,automatic_rule_promotion,created_ts
    ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,1,0,0,?19)`)
      .bind(sampleRecord.sample_id,s.decision_id,s.snapshot_id,s.contract_code,s.direction,s.campaign_receipt_id,s.campaign_id,s.observed_ts,
        s.anchor_committed_ts,s.entry_trigger_time,s.entry_trigger_price,s.base_low,s.base_high,s.invalidation_price,s.target_price,
        s.scenario_type,JSON.stringify(s),sampleRecord.material_digest,Number(now_ts)).run();
    const changes = Number(ack?.meta?.changes ?? ack?.changes ?? 0);
    return {
      status: changes === 1 ? 'CAPTURED_PROSPECTIVE' : changes === 0 ? 'DEDUPLICATED' : 'FAIL_CLOSED',
      captured: changes === 1 ? 1 : 0,
      sample_id: sampleRecord.sample_id,
      decision_id: s.decision_id,
      contract_code: s.contract_code,
      direction: s.direction,
      observed_ts: s.observed_ts,
    };
  }
  return { status: 'CLOSED_NO_VALID_PROSPECTIVE_ANCHOR', captured: 0, candidates_examined: candidates.length };
}

function pathCoveragePct(points, startTs, endTs) {
  const span = Math.max(0, Number(endTs) - Number(startTs));
  const expected = Math.max(1, Math.floor(span / (5 * MINUTE)) + 1);
  return Math.min(100, (100 * points.length) / expected);
}

function buildEntryAreaFactualOutcome({ sample, horizonHours, points, targetTs } = {}) {
  const entry = finite(sample?.entry_trigger_price);
  if (entry === null || entry <= 0 || !HORIZONS.includes(Number(horizonHours))) return { status: 'NOT_CLOSED', reason: 'SAMPLE_OR_HORIZON_INVALID' };
  const ordered = (Array.isArray(points) ? points : []).filter(p => int(p?.ts) !== null && finite(p?.price) !== null && Number(p.price) > 0).sort((a,b)=>a.ts-b.ts);
  const outcomePoint = ordered.find(p => Number(p.ts) >= Number(targetTs));
  if (!outcomePoint || Number(outcomePoint.ts) > Number(targetTs) + 15 * MINUTE) return { status: 'NOT_CLOSED', reason: 'FACTUAL_TARGET_SCAN_NOT_COVERED' };
  const path = ordered.filter(p => Number(p.ts) <= Number(outcomePoint.ts));
  if (!path.length) return { status: 'NOT_CLOSED', reason: 'FACTUAL_PATH_EMPTY' };
  const rawSeries = path.map(p => ((Number(p.price) / entry) - 1) * 100);
  const sign = sample.direction === 'SHORT' ? -1 : sample.direction === 'LONG' ? 1 : 0;
  if (!sign) return { status: 'NOT_CLOSED', reason: 'DIRECTION_INVALID' };
  const dirSeries = rawSeries.map(x => sign * x);
  return {
    status: 'CLOSED_FACTUAL',
    record: {
      status: 'CLOSED_FACTUAL',
      contract_code: sample.contract_code,
      direction_hint: sample.direction,
      observed_ts: sample.observed_ts,
      horizon_hours: Number(horizonHours),
      target_ts: Number(targetTs),
      outcome_scan_ts: Number(outcomePoint.ts),
      directional_return_pct: dirSeries.at(-1),
      mfe_directional_pct_snapshot: Math.max(...dirSeries),
      mae_directional_pct_snapshot: Math.min(...dirSeries),
      path_coverage_pct: pathCoveragePct(path, sample.observed_ts, outcomePoint.ts),
      source: 'HTX_STAGE0_SCAN_RUNS_FACTUAL_NO_INTERPOLATION',
      interpolation_used: false,
      calibration_only: true,
      live_promotion_allowed: false,
    },
  };
}

export async function closeOneEntryAreaOutcome(db, { current_scan_ts, activation_ts, now_ts = Date.now() } = {}) {
  const currentTs = int(current_scan_ts), activationTs = int(activation_ts);
  if (currentTs === null || activationTs === null) return { status: 'NOT_CLOSED', reason: 'TIMESTAMP_INVALID' };
  const result = await db.prepare(`WITH horizons(horizon_hours) AS (VALUES(1),(4),(12),(24))
    SELECT s.sample_id,s.decision_id,s.contract_code,s.direction,s.observed_ts,s.sample_json,s.material_digest,
           h.horizon_hours,(s.observed_ts + h.horizon_hours*3600000) AS target_ts
    FROM tz101_entry_area_calibration_signal s
    CROSS JOIN horizons h
    LEFT JOIN tz101_entry_area_calibration_outcome o ON o.sample_id=s.sample_id AND o.horizon_hours=h.horizon_hours
    WHERE s.created_ts>=?1 AND o.sample_id IS NULL AND (s.observed_ts + h.horizon_hours*3600000)<=?2
    ORDER BY target_ts ASC,s.sample_id ASC LIMIT 1`).bind(activationTs, currentTs).all();
  const row = rowsOf(result)[0] || null;
  if (!row) return { status: 'CLOSED_NO_DUE_ENTRY_OUTCOME', closed: 0 };
  const sample = parseJson(row.sample_json, null);
  const sampleRecord = {
    status: 'CAPTURED_PROSPECTIVE',
    sample_id: text(row.sample_id),
    material_digest: text(row.material_digest),
    sample,
  };
  const path = await loadFactualPath(db, { contract: text(row.contract_code), startTs: Number(row.observed_ts), endTs: Number(row.target_ts), allowAfterTarget: true });
  if (path.status !== 'CLOSED') return { status: 'NOT_CLOSED', reason: path.status, sample_id: row.sample_id, horizon_hours: Number(row.horizon_hours), rows_loaded: path.rows_loaded || 0 };
  const factual = buildEntryAreaFactualOutcome({ sample, horizonHours: Number(row.horizon_hours), points: path.points, targetTs: Number(row.target_ts) });
  if (factual.status !== 'CLOSED_FACTUAL') return { status: 'NOT_CLOSED', reason: factual.reason, sample_id: row.sample_id, horizon_hours: Number(row.horizon_hours), rows_loaded: path.rows_loaded || 0 };
  const attached = attachFactualEntryAreaOutcome({ sample_record: sampleRecord, outcome_record: factual.record, computed_ts: now_ts });
  if (attached.status !== 'CLOSED_FACTUAL') return { status: 'NOT_CLOSED', reason: attached.reason || attached.status, sample_id: row.sample_id, horizon_hours: Number(row.horizon_hours) };
  const o = attached.outcome;
  const ack = await db.prepare(`INSERT OR IGNORE INTO tz101_entry_area_calibration_outcome(
      sample_id,horizon_hours,contract_code,direction,observed_ts,target_ts,outcome_scan_ts,outcome_json,material_digest,
      path_order_status,calibration_only,live_promotion_allowed,computed_ts
    ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,1,0,?11)`)
    .bind(attached.sample_id,o.horizon_hours,o.contract_code,o.direction,o.observed_ts,o.target_ts,o.outcome_scan_ts,
      JSON.stringify(o),attached.material_digest,o.path_order_status,o.computed_ts).run();
  const changes = Number(ack?.meta?.changes ?? ack?.changes ?? 0);
  return {
    status: changes === 1 ? 'CLOSED_FACTUAL' : changes === 0 ? 'DEDUPLICATED' : 'FAIL_CLOSED',
    closed: changes === 1 ? 1 : 0,
    sample_id: attached.sample_id,
    contract_code: o.contract_code,
    direction: o.direction,
    horizon_hours: o.horizon_hours,
    path_order_status: o.path_order_status,
    rows_loaded: path.rows_loaded || 0,
  };
}

export async function runR820ProspectiveValidationSidecar(db, { current_scan_ts, source_run_id = null, now_ts = Date.now() } = {}) {
  const common = base('STARTED', { source_run_id: text(source_run_id) || null });
  if (!db?.prepare) return base('SOURCE_UNSUPPORTED', { source_run_id: common.source_run_id });
  const before = typeof db.usageSnapshot === 'function' ? db.usageSnapshot() : null;
  try {
    const activation = await ensureActivation(db, now_ts);
    if (activation.status !== 'CLOSED') return base('MIGRATION_REQUIRED_OR_ACTIVATION_FAILED', { source_run_id: common.source_run_id, activation });

    const early = await closeOneEarlyDiscoveryOutcome(db, { current_scan_ts, now_ts });
    let capture = { status: activation.created ? 'ACTIVATED_NO_RETROSPECTIVE_BACKFILL' : 'NOT_RUN', captured: 0 };
    let entryOutcome = { status: activation.created ? 'ACTIVATED_NO_RETROSPECTIVE_BACKFILL' : 'NOT_RUN', closed: 0 };
    if (!activation.created) {
      capture = await captureOneEntryAreaSample(db, { activation_ts: activation.activation_ts, now_ts });
      entryOutcome = await closeOneEntryAreaOutcome(db, { current_scan_ts, activation_ts: activation.activation_ts, now_ts });
    }
    const after = typeof db.usageSnapshot === 'function' ? db.usageSnapshot() : null;
    const delta = usageDelta(before, after);
    if (delta && (delta.rows_read > R820_PROSPECTIVE_VALIDATION_BUDGET.rows_read || delta.rows_written > R820_PROSPECTIVE_VALIDATION_BUDGET.rows_written || delta.requests > R820_PROSPECTIVE_VALIDATION_BUDGET.requests_soft_cap || delta.unknown_ops > 0)) {
      return base('BUDGET_ENVELOPE_EXCEEDED_FAIL_CLOSED', { source_run_id: common.source_run_id, activation, early, entry_sample: capture, entry_outcome: entryOutcome, usage_delta: delta });
    }
    return base('CLOSED', {
      source_run_id: common.source_run_id,
      activation,
      early_outcome: early,
      entry_sample: capture,
      entry_outcome: entryOutcome,
      usage_delta: delta,
      prospective_only: true,
      retrospective_backfill: false,
    });
  } catch (error) {
    const msg = String(error?.message || error);
    const migration = /no such table|no such column/i.test(msg);
    const after = typeof db.usageSnapshot === 'function' ? db.usageSnapshot() : null;
    return base(migration ? 'MIGRATION_REQUIRED' : 'ERROR_FAIL_CLOSED', { source_run_id: common.source_run_id, error: msg, usage_delta: usageDelta(before, after) });
  }
}

export default {
  R820_PROSPECTIVE_VALIDATION_VERSION,
  R820_PROSPECTIVE_VALIDATION_BUDGET,
  runR820ProspectiveValidationSidecar,
  closeOneEarlyDiscoveryOutcome,
  captureOneEntryAreaSample,
  closeOneEntryAreaOutcome,
};
