import {
  DATA_STATUS,
  OPPORTUNITY_INTEGRITY_RULES_VERSION,
  OPPORTUNITY_MODE,
  OPPORTUNITY_RULES_VERSION,
  OPPORTUNITY_SCHEMA_VERSION,
  OPPORTUNITY_VERSION,
  OUTCOME_HORIZONS,
  buildOpportunityShadowAnalysis,
  computePostEventOutcome,
  safetyEnvelope,
} from "./opportunity-intelligence-engine.mjs";

import { digest } from "./upstream-proof-utils.mjs";

export { OPPORTUNITY_VERSION };

export const OPPORTUNITY_RUNTIME_VERSION = "opportunity-runtime-v2-integrity";
export const MAX_OUTCOME_UPDATES_PER_DEEP_CHECK = 4;
export const MAX_OPPORTUNITY_D1_STATEMENTS_PER_DEEP_CHECK = 4;
export const MAX_ADMISSION_STATE_ROWS = 512;
export const OPPORTUNITY_JOURNAL_SLOT_MS = 5 * 60 * 1000;
export const OPPORTUNITY_JOURNAL_SLOT_MODULUS = 4;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const SIGNAL_INDEPENDENCE_FALLBACK_MS = HOUR_MS;
const CONTROL_INDEPENDENCE_FALLBACK_MS = DAY_MS;
const RETRY_BASE_MS = 5 * MINUTE_MS;
const RETRY_MAX_MS = 6 * HOUR_MS;
const SOURCE_RETENTION_15M_MS = 20 * DAY_MS;
const SOURCE_RETENTION_HOURLY_MS = 80 * DAY_MS;
const RETENTION_MS = 365 * 24 * 60 * 60 * 1000;
const CLEANUP_BATCH = 100;

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function text(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function stage392OpportunityIdentity(event) {
  const episodeRevision = 1;
  const episodeId = text(event?.episode_id) || text(event?.event_id);
  return {
    episode_revision: episodeRevision,
    raw_event_digest: digest({ episode_revision: episodeRevision, event }),
  };
}

function json(value, fallback = null) {
  try {
    return JSON.stringify(value ?? fallback);
  } catch {
    return JSON.stringify(fallback);
  }
}

function parseJson(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function booleanInt(value) {
  return value === true ? 1 : value === false ? 0 : null;
}

function migrationRequiredError(message) {
  return /no such table|no such column|has no column named/i.test(text(message));
}

function sourceRetentionDeadline(event) {
  const close = finite(event?.event_close_ts);
  if (close === null) return null;
  return close + (
    text(event?.timeframe) === "15m"
      ? SOURCE_RETENTION_15M_MS
      : SOURCE_RETENTION_HOURLY_MS
  );
}

function eventIndependenceInterval(event) {
  const explicitStart = finite(event?.independence_start_ts);
  const explicitEnd = finite(event?.independence_end_ts);
  if (explicitStart !== null && explicitEnd !== null && explicitEnd > explicitStart) {
    return { start: explicitStart, end: explicitEnd };
  }
  const start = finite(event?.event_ts ?? event?.timestamp);
  const end = finite(event?.event_close_ts);
  if (start === null || end === null || end <= start) return null;
  const padding = event?.control_group === true || Number(event?.control_group) === 1
    ? CONTROL_INDEPENDENCE_FALLBACK_MS
    : SIGNAL_INDEPENDENCE_FALLBACK_MS;
  return { start: Math.max(1, start - padding), end: end + padding };
}

function intervalsOverlap(left, right) {
  return Boolean(left && right && left.start < right.end && left.end > right.start);
}

export function buildOpportunityJournalPrefilter(discoveryPrefilter, candidate) {
  const contract = text(candidate?.contract);
  if (!contract) return discoveryPrefilter;
  const original = Array.isArray(discoveryPrefilter?.shortlist)
    ? discoveryPrefilter.shortlist
    : [];
  const maintenance = {
    contract,
    priority_rank: 1,
    anomaly_flags_count: 0,
    anomaly_flags: [],
    opportunity_journal_maintenance: true,
    opportunity_due_outcomes: Math.max(0, Number(candidate?.due_outcome_count ?? 0)),
    opportunity_oldest_target_ts: finite(candidate?.oldest_target_ts),
    scheduler_priority_is_probability: false,
  };
  const rest = original
    .filter((row) => text(row?.contract) !== contract)
    .slice(0, 49)
    .map((row, index) => ({ ...row, priority_rank: index + 2 }));
  return {
    ...discoveryPrefilter,
    shortlist: [maintenance, ...rest],
    counts: {
      ...(discoveryPrefilter?.counts || {}),
      shortlist: 1 + rest.length,
      opportunity_journal_maintenance: 1,
    },
    opportunity_journal_maintenance: {
      selected: true,
      contract,
      oldest_target_ts: maintenance.opportunity_oldest_target_ts,
      due_outcome_count: maintenance.opportunity_due_outcomes,
      live_priority: false,
      probability: null,
    },
  };
}

export async function selectOpportunityJournalCandidate({
  env,
  confirmed_contracts,
  now = Date.now(),
} = {}) {
  const observedTs = finite(now);
  const slotNumber = observedTs === null
    ? null
    : Math.floor(observedTs / OPPORTUNITY_JOURNAL_SLOT_MS);
  const scheduledSlot = slotNumber !== null && slotNumber % OPPORTUNITY_JOURNAL_SLOT_MODULUS === 0;
  const safe = {
    version: OPPORTUNITY_VERSION,
    runtime_version: OPPORTUNITY_RUNTIME_VERSION,
    mode: OPPORTUNITY_MODE,
    status: scheduledSlot ? "NO_DUE_OUTCOMES" : "NOT_JOURNAL_QUOTA_SLOT",
    scheduled_slot: scheduledSlot,
    quota: {
      base_slot_ms: OPPORTUNITY_JOURNAL_SLOT_MS,
      modulus: OPPORTUNITY_JOURNAL_SLOT_MODULUS,
      maximum_share_of_regular_cron_slots: 1 / OPPORTUNITY_JOURNAL_SLOT_MODULUS,
    },
    selected_contract: null,
    candidate: null,
    safety: safetyEnvelope(),
  };
  if (!scheduledSlot) return safe;
  if (!env?.DATA_DB) return { ...safe, status: "SOURCE_UNSUPPORTED_NO_IMPACT" };
  const contracts = [...new Set(
    (Array.isArray(confirmed_contracts) ? confirmed_contracts : [])
      .map(text)
      .filter(Boolean),
  )].slice(0, 1000);
  if (!contracts.length) return { ...safe, status: "NO_CONFIRMED_SCOPE_NO_IMPACT" };
  const confirmed = new Set(contracts);
  try {
    const result = await env.DATA_DB.prepare(`
      SELECT o.contract_code,
        MIN(COALESCE(o.next_attempt_ts,o.target_ts)) AS oldest_target_ts,
        COUNT(*) AS due_outcome_count,
        MAX(o.attempt_count) AS max_attempt_count
      FROM opportunity_shadow_outcome o
      JOIN opportunity_shadow_event e ON e.event_id=o.event_id
      WHERE o.status='PENDING'
        AND e.independent_sample=1
        AND o.target_ts<=?1
        AND COALESCE(o.next_attempt_ts,o.target_ts)<=?1
      GROUP BY o.contract_code
      ORDER BY oldest_target_ts ASC,o.contract_code ASC
      LIMIT 50
    `).bind(observedTs).all();
    const row = (Array.isArray(result?.results) ? result.results : [])
      .find((candidate) => confirmed.has(text(candidate?.contract_code))) || null;
    const contract = text(row?.contract_code);
    if (!contract) return safe;
    const candidate = {
      contract,
      oldest_target_ts: finite(row?.oldest_target_ts),
      due_outcome_count: Math.max(0, Number(row?.due_outcome_count ?? 0)),
      max_attempt_count: Math.max(0, Number(row?.max_attempt_count ?? 0)),
      overdue_ms:
        finite(row?.oldest_target_ts) === null
          ? null
          : Math.max(0, observedTs - Number(row.oldest_target_ts)),
    };
    return {
      ...safe,
      status: "SELECTED_BOUNDED_JOURNAL_MAINTENANCE",
      selected_contract: contract,
      candidate,
    };
  } catch (error) {
    const message = text(error?.message || error).slice(0, 600);
    return {
      ...safe,
      status: migrationRequiredError(message)
        ? "MIGRATION_REQUIRED_NO_IMPACT"
        : "PARTIAL_FAIL_CLOSED_NO_IMPACT",
      error: message,
    };
  }
}

function eventFunnelStage(event) {
  return event?.control_group === true ? "CONTROL" : text(event?.funnel?.stage) || "ANOMALOUS_EVENT";
}

function eventStatement(env, event, observedTs) {
  const candle = event?.candle || {};
  const cross = event?.cross_exchange || {};
  const direction = ["LONG", "SHORT"].includes(text(event?.direction_at_event).toUpperCase())
    ? text(event.direction_at_event).toUpperCase()
    : "NONE";
  const directionalEligible = event?.directional_evaluation_eligible === true && direction !== "NONE";
  const control = event?.control_group === true;
  const interval = eventIndependenceInterval(event);
  const columns = [
    "event_id", "version", "rules_version", "mode", "contract_code", "exchange", "timeframe",
    "event_ts", "event_close_ts", "event_type", "open_price", "high_price", "low_price",
    "close_price", "event_volume", "volume_ratio_median", "volume_ratio_mean",
    "volume_robust_zscore", "body_range_ratio", "upper_wick_ratio", "lower_wick_ratio",
    "close_location", "cross_exchange_confirmed", "single_exchange_anomaly",
    "control_group", "control_population", "funnel_stage", "data_quality",
    "missing_fields_json", "event_json", "observed_ts", "persisted_ts",
    "integrity_version", "integrity_rules_version", "episode_id", "episode_start_ts",
    "episode_end_ts", "independence_start_ts", "independence_end_ts", "independent_sample",
    "related_signal_count", "related_timeframes_json", "direction_at_event", "direction_source",
    "direction_rules_version", "direction_locked_ts", "directional_evaluation_eligible",
    "control_eligible", "control_maturity_ts", "contamination_status", "cvd_delta_quality",
    "stage392_episode_revision", "stage392_raw_event_digest",
  ];
  const values = [
    event.event_id,
    OPPORTUNITY_SCHEMA_VERSION,
    OPPORTUNITY_RULES_VERSION,
    OPPORTUNITY_MODE,
    event.contract,
    event.exchange,
    event.timeframe,
    event.timestamp,
    event.event_close_ts,
    event.event_type,
    candle.open,
    candle.high,
    candle.low,
    candle.close,
    candle.volume,
    finite(event.volume_ratio_median),
    finite(event.volume_ratio_mean),
    finite(event.volume_robust_zscore),
    finite(event.body_range_ratio),
    finite(event.upper_wick_ratio),
    finite(event.lower_wick_ratio),
    finite(event.close_location),
    cross.cross_exchange_confirmed === true ? 1 : 0,
    cross.single_exchange_anomaly === true ? 1 : 0,
    control ? 1 : 0,
    text(event.control_population) || null,
    eventFunnelStage(event),
    text(event.data_quality) || DATA_STATUS.PARTIAL,
    json(event.missing_fields, []),
    json(event, {}),
    observedTs,
    observedTs,
    OPPORTUNITY_VERSION,
    OPPORTUNITY_INTEGRITY_RULES_VERSION,
    text(event?.episode_id) || text(event?.event_id) || null,
    finite(event?.episode_start_ts ?? event?.timestamp),
    finite(event?.episode_end_ts ?? event?.event_close_ts),
    interval?.start ?? null,
    interval?.end ?? null,
    event?.independent_sample === true ? 1 : 0,
    Math.max(0, Number(event?.related_signal_count ?? 0)),
    json(event?.related_timeframes, []),
    direction,
    text(event?.direction_source) || null,
    text(event?.direction_rules_version) || null,
    directionalEligible ? finite(event?.direction_locked_ts) : null,
    directionalEligible ? 1 : 0,
    control && event?.control_eligible === true ? 1 : 0,
    control ? finite(event?.control_maturity_ts) : null,
    control
      ? text(event?.contamination_status) || "CONTROL_INTEGRITY_UNASSESSED"
      : "SIGNAL_EPISODE_NOT_CONTROL",
    text(event?.market_flow?.cvd_delta_quality) || "UNVERIFIED",
    stage392OpportunityIdentity(event).episode_revision,
    stage392OpportunityIdentity(event).raw_event_digest,
  ];
  const placeholders = values.map((_, index) => `?${index + 1}`).join(",");
  return env.DATA_DB.prepare(`
    INSERT INTO opportunity_shadow_event (${columns.join(",")})
    VALUES (${placeholders})
    ON CONFLICT(event_id) DO NOTHING
  `).bind(...values);
}

function outcomeScheduleStatement(env, event) {
  const values = [];
  const args = [];
  let parameter = 1;
  const retentionDeadline = sourceRetentionDeadline(event);
  const direction = ["LONG", "SHORT"].includes(text(event?.direction_at_event).toUpperCase())
    ? text(event.direction_at_event).toUpperCase()
    : "NONE";
  const directionalEligible = event?.directional_evaluation_eligible === true && direction !== "NONE";
  for (const [horizon, duration] of Object.entries(OUTCOME_HORIZONS)) {
    const target = event.event_close_ts + duration;
    values.push(`(?${parameter},?${parameter + 1},?${parameter + 2},?${parameter + 3},'PENDING',?${parameter + 4},?${parameter + 5},?${parameter + 6},?${parameter + 7})`);
    args.push(
      event.event_id,
      event.contract,
      horizon,
      target,
      target,
      retentionDeadline,
      direction,
      directionalEligible ? 1 : 0,
    );
    parameter += 8;
  }
  return env.DATA_DB.prepare(`
    INSERT INTO opportunity_shadow_outcome (
      event_id,contract_code,horizon,target_ts,status,next_attempt_ts,
      source_retention_deadline_ts,direction_at_event,directional_evaluation_eligible
    ) VALUES ${values.join(",")}
    ON CONFLICT(event_id,horizon) DO NOTHING
  `).bind(...args);
}

async function loadDueOutcomes(env, contract, now) {
  const result = await env.DATA_DB.prepare(`
    SELECT o.event_id,o.contract_code,o.horizon,o.target_ts,o.attempt_count,
      o.next_attempt_ts,o.source_retention_deadline_ts,
      e.event_json,e.funnel_stage,e.timeframe,e.event_close_ts
    FROM opportunity_shadow_outcome o
    JOIN opportunity_shadow_event e ON e.event_id=o.event_id
    WHERE o.contract_code=?1 AND o.status='PENDING' AND e.independent_sample=1
      AND o.target_ts<=?2
      AND COALESCE(o.next_attempt_ts,o.target_ts)<=?2
    ORDER BY COALESCE(o.next_attempt_ts,o.target_ts) ASC,
      o.target_ts ASC,o.attempt_count ASC,o.event_id ASC,o.horizon ASC
    LIMIT ?3
  `).bind(contract, now, MAX_OUTCOME_UPDATES_PER_DEEP_CHECK).all();
  return Array.isArray(result?.results) ? result.results : [];
}

async function loadAdmissionState(env, contract, events) {
  const candidates = (Array.isArray(events) ? events : []).slice(0, 9);
  const ids = new Set(candidates.map((event) => text(event?.event_id)).filter(Boolean));
  const candidateIntervals = candidates.map(eventIndependenceInterval).filter(Boolean);
  if (!candidateIntervals.length) return { known_ids: new Set(), stored_rows: [], intervals: [] };
  const minimumStart = Math.min(...candidateIntervals.map((interval) => interval.start));
  const maximumEnd = Math.max(...candidateIntervals.map((interval) => interval.end));
  const result = await env.DATA_DB.prepare(`
    SELECT event_id,episode_id,exchange,event_ts,event_close_ts,event_type,
      control_group,control_eligible,independence_start_ts,independence_end_ts,
      independent_sample,directional_evaluation_eligible,direction_at_event,
      direction_locked_ts,event_json,persisted_ts,stage392_episode_revision,stage392_raw_event_digest
    FROM opportunity_shadow_event
    WHERE contract_code=?1 AND (
      (
        independent_sample=1 AND
        independence_start_ts<?3 AND independence_end_ts>?2
      ) OR (
        independent_sample=0 AND
        event_ts<?3+?4 AND event_close_ts>?2-?4
      )
    )
    ORDER BY event_ts DESC,event_id ASC
    LIMIT ?5
  `).bind(
    contract,
    minimumStart,
    maximumEnd,
    CONTROL_INDEPENDENCE_FALLBACK_MS,
    MAX_ADMISSION_STATE_ROWS + 1,
  ).all();
  const allRows = Array.isArray(result?.results) ? result.results : [];
  const scanTruncated = allRows.length > MAX_ADMISSION_STATE_ROWS;
  const rows = allRows.slice(0, MAX_ADMISSION_STATE_ROWS);
  return {
    scan_truncated: scanTruncated,
    rows_scanned: rows.length,
    row_cap: MAX_ADMISSION_STATE_ROWS,
    known_ids: new Set(rows.map((row) => text(row?.event_id)).filter((id) => ids.has(id))),
    stored_rows: rows.map((row) => ({
      ...row,
      event: row?.event_json ? parseJson(row.event_json, null) : null,
    })),
    intervals: rows.map((row) => ({
      event_id: text(row?.event_id),
      episode_id: text(row?.episode_id) || null,
      exchange: text(row?.exchange),
      control_group: Number(row?.control_group) === 1,
      control_eligible: Number(row?.control_eligible) === 1,
      independent_sample: Number(row?.independent_sample) === 1,
      interval: eventIndependenceInterval({
        event_ts: row?.event_ts,
        event_close_ts: row?.event_close_ts,
        independence_start_ts: row?.independence_start_ts,
        independence_end_ts: row?.independence_end_ts,
        control_group: Number(row?.control_group) === 1,
      }),
    })).filter((row) => row.interval),
  };
}

function admissionDecision(event, admissionState) {
  const id = text(event?.event_id);
  if (!id) return { admitted: false, reason: "INVALID_EVENT_ID", invalidate_control_ids: [] };
  if (admissionState?.known_ids?.has(id)) {
    return { admitted: false, reason: "EVENT_ALREADY_PERSISTED", invalidate_control_ids: [] };
  }
  if (admissionState?.scan_truncated === true) {
    return {
      admitted: false,
      reason: "ADMISSION_STATE_SCAN_TRUNCATED_FAIL_CLOSED",
      invalidate_control_ids: [],
    };
  }
  const interval = eventIndependenceInterval(event);
  if (!interval) return { admitted: false, reason: "INVALID_INDEPENDENCE_INTERVAL", invalidate_control_ids: [] };
  const overlaps = (admissionState?.intervals || []).filter((stored) =>
    text(stored?.event_id) !== id &&
    intervalsOverlap(interval, stored?.interval)
  );
  if (!overlaps.length) return { admitted: true, reason: "INDEPENDENT", invalidate_control_ids: [] };
  if (event?.control_group === true) {
    return { admitted: false, reason: "CONTROL_OVERLAPS_PRIOR_EVENT", invalidate_control_ids: [] };
  }
  const blockingSignals = overlaps.filter((stored) =>
    stored?.control_group !== true && stored?.independent_sample === true
  );
  if (blockingSignals.length) {
    return { admitted: false, reason: "RELATED_SIGNAL_EPISODE_ALREADY_STORED", invalidate_control_ids: [] };
  }
  const invalidatableControls = overlaps.filter((stored) =>
    stored?.control_group === true &&
    stored?.control_eligible === true &&
    stored?.independent_sample === true
  );
  return {
    admitted: true,
    reason: invalidatableControls.length
      ? "SIGNAL_ADMITTED_AFTER_ATOMIC_CONTROL_INVALIDATION"
      : "SIGNAL_ADMITTED_OVER_LEGACY_UNASSESSED_ROWS",
    invalidate_control_ids: invalidatableControls.map((row) => row.event_id).slice(0, 32),
  };
}

function invalidateControlsStatement(env, eventIds) {
  const ids = (Array.isArray(eventIds) ? eventIds : []).map(text).filter(Boolean).slice(0, 32);
  if (!ids.length) return null;
  const placeholders = ids.map((_, index) => `?${index + 1}`).join(",");
  return env.DATA_DB.prepare(`
    UPDATE opportunity_shadow_event
    SET independent_sample=0,
      control_eligible=0,
      contamination_status='CONTAMINATED_BY_LATER_DISCOVERED_SIGNAL'
    WHERE event_id IN (${placeholders})
      AND control_group=1 AND control_eligible=1
  `).bind(...ids);
}

function retentionDeadlineForRow(row) {
  const explicit = finite(row?.source_retention_deadline_ts);
  if (explicit !== null) return explicit;
  return sourceRetentionDeadline({
    event_close_ts: row?.event_close_ts,
    timeframe: row?.timeframe,
  });
}

function terminalMissing(row, now) {
  const deadline = retentionDeadlineForRow(row);
  return deadline !== null && now >= deadline;
}

function nextAttemptTs(row, now) {
  const completedAttempts = Math.max(1, Number(row?.attempt_count || 0) + 1);
  const exponent = Math.min(10, completedAttempts - 1);
  const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * (2 ** exponent));
  const deadline = retentionDeadlineForRow(row);
  const next = now + delay;
  return deadline === null ? next : Math.min(next, deadline);
}

function buildOutcomeRows(due, analysis, now) {
  const rows = [];
  for (const row of due.slice(0, MAX_OUTCOME_UPDATES_PER_DEEP_CHECK)) {
    const event = parseJson(row.event_json, null);
    let outcome = computePostEventOutcome({
      event,
      horizon: row.horizon,
      series_by_timeframe: analysis._series_by_timeframe,
      external_hourly: analysis._external_hourly,
      funding: analysis._funding,
      funnel_stage: row.funnel_stage,
      as_of_ts: now,
      config: analysis._config,
    });
    const factual =
      outcome?.status === DATA_STATUS.OK &&
      outcome?.trajectory_complete === true &&
      text(outcome?.source_timeframe) !== "" &&
      finite(outcome?.expected_bars) !== null &&
      finite(outcome?.expected_bars) === finite(outcome?.observed_bars) &&
      finite(outcome?.trajectory_coverage_pct) === 100 &&
      finite(outcome?.target_ts) === finite(row?.target_ts);
    const terminalNoData = !factual && terminalMissing(row, now);
    const status = factual
      ? "CLOSED_FACTUAL"
      : terminalNoData
        ? "NO_CONFIRMED_HISTORICAL_DATA"
        : "PENDING";
    if (terminalNoData) {
      outcome = {
        ...outcome,
        status: DATA_STATUS.MISSING,
        no_confirmed_historical_data: true,
        report_phrase_ru: "нет подтверждённых исторических данных",
        source_retention_deadline_ts: retentionDeadlineForRow(row),
        retryable: false,
      };
    }
    const attempts = Number(row.attempt_count || 0) + 1;
    rows.push({
      event_id: row.event_id,
      contract_code: row.contract_code,
      horizon: row.horizon,
      target_ts: row.target_ts,
      status,
      attempt_count: attempts,
      last_attempt_ts: now,
      closed_ts: factual || terminalNoData ? now : null,
      next_attempt_ts: factual || terminalNoData ? null : nextAttemptTs(row, now),
      source_retention_deadline_ts: retentionDeadlineForRow(row),
      outcome,
    });
  }
  return rows;
}

function outcomeUpsertStatement(env, rows) {
  if (!rows.length) return null;
  const columns = [
    "event_id", "contract_code", "horizon", "target_ts", "status", "attempt_count",
    "last_attempt_ts", "closed_ts", "next_attempt_ts", "source_retention_deadline_ts",
    "price", "return_pct", "mfe_pct", "mae_pct", "event_high_broken",
    "event_low_broken", "reclaim_detected", "btc_relative_strength_pp",
    "eth_relative_strength_pp", "ease_of_movement_after", "supply_exhaustion_candidate",
    "missed_opportunity_detected", "false_rejection_candidate", "late_entry_candidate",
    "direction_at_event", "directional_evaluation_eligible", "trajectory_complete",
    "source_timeframe", "expected_bars", "observed_bars", "trajectory_coverage_pct",
    "source_start_ts", "source_end_ts", "source_bar_duration_ms",
    "max_up_excursion_pct", "max_down_excursion_pct", "directional_return_pct",
    "closure_quality", "outcome_json",
  ];
  const payload = [];
  for (const row of rows) {
    const outcome = row.outcome || {};
    const direction = ["LONG", "SHORT"].includes(text(outcome?.direction_at_event).toUpperCase())
      ? text(outcome.direction_at_event).toUpperCase()
      : "NONE";
    const directionalEligible = outcome?.directional_evaluation_eligible === true && direction !== "NONE";
    const rowValues = [
      row.event_id,
      row.contract_code,
      row.horizon,
      row.target_ts,
      row.status,
      row.attempt_count,
      row.last_attempt_ts,
      row.closed_ts,
      row.next_attempt_ts,
      row.source_retention_deadline_ts,
      finite(outcome.price),
      finite(outcome.return_from_anomaly_close_pct),
      directionalEligible ? finite(outcome.mfe_pct) : null,
      directionalEligible ? finite(outcome.mae_pct) : null,
      booleanInt(outcome.event_high_broken),
      booleanInt(outcome.event_low_broken),
      booleanInt(outcome.reclaim_detected),
      finite(outcome.btc_relative_strength_pp),
      finite(outcome.eth_relative_strength_pp),
      finite(outcome.ease_of_movement_after),
      booleanInt(outcome.post_event_supply_exhaustion_candidate),
      booleanInt(outcome.missed_opportunity_detected),
      booleanInt(outcome.false_rejection_candidate),
      booleanInt(outcome.late_entry_candidate),
      direction,
      directionalEligible ? 1 : 0,
      outcome?.trajectory_complete === true ? 1 : 0,
      text(outcome?.source_timeframe) || null,
      finite(outcome?.expected_bars),
      finite(outcome?.observed_bars),
      finite(outcome?.trajectory_coverage_pct),
      finite(outcome?.source_start_ts),
      finite(outcome?.source_end_ts),
      finite(outcome?.source_bar_duration_ms),
      finite(outcome?.max_up_excursion_pct),
      finite(outcome?.max_down_excursion_pct),
      directionalEligible ? finite(outcome?.directional_return_pct) : null,
      text(outcome?.closure_quality) || null,
      json(outcome, {}),
    ];
    payload.push(Object.fromEntries(columns.map((column, index) => [column, rowValues[index]])));
  }
  const mutableColumns = columns.slice(4);
  return env.DATA_DB.prepare(`
    INSERT INTO opportunity_shadow_outcome (${columns.join(",")})
    SELECT
      ${columns.map((column) => `json_extract(value,'$.${column}')`).join(",\n      ")}
    FROM json_each(?1)
    WHERE 1
    ON CONFLICT(event_id,horizon) DO UPDATE SET
      ${mutableColumns.map((column) => `${column}=excluded.${column}`).join(",\n      ")}
    WHERE opportunity_shadow_outcome.status='PENDING'
  `).bind(json(payload, []));
}

function funnelStatement(env, analysis, outcomeRows, runId, now, operational = {}) {
  const newest = analysis.newest_event;
  const dropReasons = newest?.funnel?.drop_reasons || [];
  const funnel = {
    discovery_source: "EXISTING_BOUNDED_DEEP_CHECK",
    anomaly_count: analysis.counts.anomalies,
    control_count: analysis.counts.control_samples,
    newest_stage: newest ? eventFunnelStage(newest) : null,
    drop_reasons: dropReasons,
    outcomes_processed: outcomeRows.length,
    outcomes_closed_factual: outcomeRows.filter((row) => row.status === "CLOSED_FACTUAL").length,
    outcomes_missing_final: outcomeRows.filter((row) => row.status === "NO_CONFIRMED_HISTORICAL_DATA").length,
    capacity_drop_reasons: operational?.capacity_drop_reasons || [],
    queue_starvation: operational?.queue_starvation === true,
  };
  return env.DATA_DB.prepare(`
    INSERT INTO opportunity_shadow_funnel (
      funnel_id,run_id,contract_code,observed_ts,anomaly_count,control_count,
      newest_stage,cross_exchange_confirmed_count,single_exchange_count,
      missed_opportunity_count,false_rejection_count,late_entry_count,
      capacity_drop_count,queue_starvation,drop_reasons_json,funnel_json
    ) VALUES (
      ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16
    )
    ON CONFLICT(funnel_id) DO NOTHING
  `).bind(
    `${text(runId) || `stage39-${now}`}:${analysis.contract}:${now}`,
    text(runId) || `stage39-${now}`,
    analysis.contract,
    now,
    analysis.counts.anomalies,
    analysis.counts.control_samples,
    newest ? eventFunnelStage(newest) : null,
    analysis.counts.cross_exchange_confirmed,
    analysis.counts.single_exchange,
    outcomeRows.filter((row) => row.outcome?.missed_opportunity_detected === true).length,
    outcomeRows.filter((row) => row.outcome?.false_rejection_candidate === true).length,
    outcomeRows.filter((row) => row.outcome?.late_entry_candidate === true).length,
    Array.isArray(operational?.capacity_drop_reasons) ? operational.capacity_drop_reasons.length : 0,
    operational?.queue_starvation === true ? 1 : 0,
    json(dropReasons, []),
    json(funnel, {}),
  );
}

function cleanupFunnelStatement(env, now) {
  return env.DATA_DB.prepare(`
    DELETE FROM opportunity_shadow_funnel
    WHERE funnel_id IN (
      SELECT funnel_id FROM opportunity_shadow_funnel
      WHERE observed_ts<?1 ORDER BY observed_ts ASC LIMIT ?2
    )
  `).bind(now - RETENTION_MS, CLEANUP_BATCH);
}

function cleanupEventStatement(env, now) {
  return env.DATA_DB.prepare(`
    DELETE FROM opportunity_shadow_event
    WHERE event_id IN (
      SELECT event_id FROM opportunity_shadow_event
      WHERE event_close_ts<?1 ORDER BY event_close_ts ASC LIMIT ?2
    )
  `).bind(now - RETENTION_MS, CLEANUP_BATCH);
}

export async function runOpportunityShadowCycle({
  env,
  input,
  config,
  run_id,
  now = Date.now(),
  operational = {},
} = {}) {
  let analysis;
  try {
    analysis = buildOpportunityShadowAnalysis({ ...(input || {}), now }, config);
  } catch (error) {
    return {
      version: OPPORTUNITY_VERSION,
      runtime_version: OPPORTUNITY_RUNTIME_VERSION,
      mode: OPPORTUNITY_MODE,
      status: "ANALYSIS_FAIL_CLOSED",
      error: text(error?.message || error).slice(0, 600),
      safety: safetyEnvelope(),
    };
  }

  if (!env?.DATA_DB) {
    return {
      ...analysis,
      runtime_version: OPPORTUNITY_RUNTIME_VERSION,
      persistence: { status: "SOURCE_UNSUPPORTED", statements: 0, writes: 0 },
    };
  }

  try {
    const due = await loadDueOutcomes(env, analysis.contract, now);
    const outcomeRows = buildOutcomeRows(due, analysis, now);
    const eventCandidates = [
      ...(Array.isArray(analysis?.events) ? analysis.events : []),
      ...(analysis?.control_sample ? [analysis.control_sample] : []),
    ].slice(0, 9);
    const admissionState = await loadAdmissionState(env, analysis.contract, eventCandidates);
    const candidateDecisions = eventCandidates.map((event) => ({
      event,
      decision: admissionDecision(event, admissionState),
    }));
    /*
     * Persist one previously unseen event per bounded Deep Check. This
     * keeps the four-statement write cap while allowing older anomalies
     * to backfill over subsequent runs instead of being starved forever
     * by the same newest deterministic event.
     */
    const selectedCandidate = candidateDecisions.find((row) => row.decision.admitted) || null;
    const selectedEvent = selectedCandidate?.event || null;
    const controlsToInvalidate = selectedCandidate?.decision?.invalidate_control_ids || [];
    const statements = [];
    const labels = [];
    const invalidationStatement = invalidateControlsStatement(env, controlsToInvalidate);
    if (invalidationStatement) {
      statements.push(invalidationStatement);
      labels.push("invalidate_contaminated_controls");
    }
    if (selectedEvent) {
      statements.push(eventStatement(env, selectedEvent, now));
      labels.push("event");
      statements.push(outcomeScheduleStatement(env, selectedEvent));
      labels.push("outcome_schedule");
    }
    // Atomic repair of a newly contaminated control has priority over due
    // outcome writes. The due rows remain scheduled and are retried later;
    // the hard four-statement D1 cap is never exceeded.
    const persistedOutcomeRows = invalidationStatement ? [] : outcomeRows;
    const outcomeStatement = outcomeUpsertStatement(env, persistedOutcomeRows);
    if (outcomeStatement) {
      statements.push(outcomeStatement);
      labels.push("outcomes");
    }
    statements.push(funnelStatement(env, analysis, persistedOutcomeRows, run_id, now, {
      ...operational,
      capacity_drop_reasons: [
        ...(Array.isArray(operational?.capacity_drop_reasons) ? operational.capacity_drop_reasons : []),
        ...(invalidationStatement && outcomeRows.length ? ["OUTCOMES_DEFERRED_FOR_ATOMIC_CONTROL_INVALIDATION"] : []),
      ],
    }));
    labels.push("funnel");
    if (!selectedEvent) {
      if (statements.length < MAX_OPPORTUNITY_D1_STATEMENTS_PER_DEEP_CHECK) {
        statements.push(cleanupEventStatement(env, now));
        labels.push("bounded_event_cleanup");
      }
      if (statements.length < MAX_OPPORTUNITY_D1_STATEMENTS_PER_DEEP_CHECK) {
        statements.push(cleanupFunnelStatement(env, now));
        labels.push("bounded_funnel_cleanup");
      }
    }
    if (statements.length > MAX_OPPORTUNITY_D1_STATEMENTS_PER_DEEP_CHECK) {
      throw new Error(`OPPORTUNITY_D1_STATEMENT_CAP_EXCEEDED:${statements.length}`);
    }
    const results = await env.DATA_DB.batch(statements);
    const writes = results.map((row, index) => ({
      label: labels[index],
      changes: Number(row?.meta?.changes ?? 0),
    }));
    const newestEventId = text(analysis?.newest_event?.event_id);
    const storedNewest = (admissionState?.stored_rows || []).find((row) =>
      text(row?.event_id) === newestEventId && row?.event && Number(row?.independent_sample) === 1
    ) || null;
    const eventWriteIndex = labels.indexOf("event");
    const newEventAck = eventWriteIndex >= 0 && Number(results?.[eventWriteIndex]?.meta?.changes ?? 0) === 1;
    const newlyPersistedNewest = Boolean(
      newEventAck && selectedEvent && text(selectedEvent?.event_id) === newestEventId &&
      selectedEvent?.independent_sample === true
    );
    const admissionWitness = storedNewest ? {
      event: storedNewest.event,
      event_id: text(storedNewest.event_id),
      persisted_ts: finite(storedNewest.persisted_ts),
      control_group: Number(storedNewest.control_group) === 1,
      independent_sample: Number(storedNewest.independent_sample) === 1,
      directional_evaluation_eligible: Number(storedNewest.directional_evaluation_eligible) === 1,
      d1_acknowledged: true,
      immutable_row: true,
      episode_revision: Number(storedNewest.stage392_episode_revision),
      raw_event_digest: text(storedNewest.stage392_raw_event_digest) || null,
      source: "ADMISSION_READ_EXISTING_IMMUTABLE_ROW",
    } : newlyPersistedNewest ? {
      event: selectedEvent,
      event_id: text(selectedEvent.event_id),
      persisted_ts: now,
      control_group: selectedEvent?.control_group === true,
      independent_sample: selectedEvent?.independent_sample === true,
      directional_evaluation_eligible: selectedEvent?.directional_evaluation_eligible === true,
      d1_acknowledged: true,
      immutable_row: true,
      episode_revision: stage392OpportunityIdentity(selectedEvent).episode_revision,
      raw_event_digest: stage392OpportunityIdentity(selectedEvent).raw_event_digest,
      source: "CURRENT_BATCH_EVENT_INSERT_ACK",
    } : null;
    return {
      ...analysis,
      runtime_version: OPPORTUNITY_RUNTIME_VERSION,
      admission_witness: admissionWitness,
      outcomes_processed: persistedOutcomeRows.map((row) => ({
        event_id: row.event_id,
        horizon: row.horizon,
        status: row.status,
        outcome: row.outcome,
      })),
      persistence: {
        status: "CLOSED",
        statements: statements.length,
        statement_cap: MAX_OPPORTUNITY_D1_STATEMENTS_PER_DEEP_CHECK,
        outcome_update_cap: MAX_OUTCOME_UPDATES_PER_DEEP_CHECK,
        selected_event_id:
          selectedEvent
            ?.event_id ||
          null,
        selected_event_admission_reason:
          selectedCandidate?.decision?.reason || null,
        invalidated_control_ids: controlsToInvalidate,
        outcomes_deferred_for_integrity: outcomeRows.length - persistedOutcomeRows.length,
        detected_event_candidates:
          eventCandidates.length,
        previously_persisted_candidates:
          admissionState.known_ids.size,
        admission_state_rows_scanned: admissionState.rows_scanned,
        admission_state_row_cap: admissionState.row_cap,
        admission_state_scan_truncated: admissionState.scan_truncated === true,
        candidate_rejection_reasons: [...new Set(
          candidateDecisions
            .filter((row) => !row.decision.admitted)
            .map((row) => row.decision.reason)
            .filter(Boolean),
        )],
        rejected_related_or_contaminated_candidates:
          Math.max(
            0,
            candidateDecisions.filter((row) => !row.decision.admitted).length -
              admissionState.known_ids.size,
          ),
        writes,
      },
    };
  } catch (error) {
    const message = text(error?.message || error).slice(0, 600);
    return {
      ...analysis,
      runtime_version: OPPORTUNITY_RUNTIME_VERSION,
      persistence: {
        status: migrationRequiredError(message) ? "MIGRATION_REQUIRED" : "PARTIAL_FAIL_CLOSED",
        statements: 0,
        writes: 0,
        error: message,
      },
    };
  }
}

export async function opportunityDataPlaneSummary(env, now = Date.now()) {
  const safe = {
    version: OPPORTUNITY_VERSION,
    runtime_version: OPPORTUNITY_RUNTIME_VERSION,
    mode: OPPORTUNITY_MODE,
    table_available: false,
    event_count: 0,
    anomaly_count: 0,
    control_count: 0,
    legacy_unassessed_count: 0,
    pending_outcomes: 0,
    due_outcomes: 0,
    closed_factual_outcomes: 0,
    no_confirmed_history_outcomes: 0,
    missed_opportunity_count: 0,
    false_rejection_count: 0,
    late_entry_count: 0,
    safety: safetyEnvelope(),
  };
  if (!env?.DATA_DB) return { ...safe, status: "SOURCE_UNSUPPORTED" };
  try {
    const [events, outcomes, due, stages, recent] = await Promise.all([
      env.DATA_DB.prepare(`
        SELECT COUNT(*) event_count,
          SUM(CASE WHEN event_type='ANOMALOUS_EFFORT_VS_RESULT' AND independent_sample=1 THEN 1 ELSE 0 END) anomaly_count,
          SUM(CASE WHEN control_group=1 AND control_eligible=1 AND independent_sample=1 THEN 1 ELSE 0 END) control_count,
          SUM(CASE WHEN independent_sample=0 THEN 1 ELSE 0 END) legacy_unassessed_count,
          SUM(CASE WHEN cross_exchange_confirmed=1 THEN 1 ELSE 0 END) cross_exchange_confirmed_count,
          SUM(CASE WHEN single_exchange_anomaly=1 THEN 1 ELSE 0 END) single_exchange_count
        FROM opportunity_shadow_event
      `).first(),
      env.DATA_DB.prepare(`
        SELECT
          SUM(CASE WHEN o.status='PENDING' AND e.independent_sample=1 THEN 1 ELSE 0 END) pending_outcomes,
          SUM(CASE WHEN o.status='CLOSED_FACTUAL' AND o.trajectory_complete=1 AND e.independent_sample=1 THEN 1 ELSE 0 END) closed_factual_outcomes,
          SUM(CASE WHEN o.status='NO_CONFIRMED_HISTORICAL_DATA' AND e.independent_sample=1 THEN 1 ELSE 0 END) no_confirmed_history_outcomes,
          SUM(CASE WHEN o.missed_opportunity_detected=1 AND o.directional_evaluation_eligible=1 AND e.independent_sample=1 THEN 1 ELSE 0 END) missed_opportunity_count,
          SUM(CASE WHEN o.false_rejection_candidate=1 AND o.directional_evaluation_eligible=1 AND e.independent_sample=1 THEN 1 ELSE 0 END) false_rejection_count,
          SUM(CASE WHEN o.late_entry_candidate=1 AND o.directional_evaluation_eligible=1 AND e.independent_sample=1 THEN 1 ELSE 0 END) late_entry_count
        FROM opportunity_shadow_outcome o
        JOIN opportunity_shadow_event e ON e.event_id=o.event_id
      `).first(),
      env.DATA_DB.prepare(`
        SELECT COUNT(*) due_outcomes FROM opportunity_shadow_outcome
        JOIN opportunity_shadow_event e ON e.event_id=opportunity_shadow_outcome.event_id
        WHERE status='PENDING' AND e.independent_sample=1 AND target_ts<=?1
          AND COALESCE(next_attempt_ts,target_ts)<=?1
      `).bind(now).first(),
      env.DATA_DB.prepare(`
        SELECT funnel_stage,COUNT(*) count FROM opportunity_shadow_event
        GROUP BY funnel_stage ORDER BY funnel_stage
      `).all(),
      env.DATA_DB.prepare(`
        SELECT event_id,contract_code,exchange,timeframe,event_ts,event_type,
          funnel_stage,data_quality,cross_exchange_confirmed,single_exchange_anomaly,
          episode_id,independent_sample,control_eligible,contamination_status,
          direction_at_event,directional_evaluation_eligible,cvd_delta_quality
        FROM opportunity_shadow_event ORDER BY event_ts DESC LIMIT 8
      `).all(),
    ]);
    return {
      ...safe,
      status: "CLOSED",
      table_available: true,
      event_count: Number(events?.event_count ?? 0),
      anomaly_count: Number(events?.anomaly_count ?? 0),
      control_count: Number(events?.control_count ?? 0),
      legacy_unassessed_count: Number(events?.legacy_unassessed_count ?? 0),
      cross_exchange_confirmed_count: Number(events?.cross_exchange_confirmed_count ?? 0),
      single_exchange_count: Number(events?.single_exchange_count ?? 0),
      pending_outcomes: Number(outcomes?.pending_outcomes ?? 0),
      due_outcomes: Number(due?.due_outcomes ?? 0),
      closed_factual_outcomes: Number(outcomes?.closed_factual_outcomes ?? 0),
      no_confirmed_history_outcomes: Number(outcomes?.no_confirmed_history_outcomes ?? 0),
      missed_opportunity_count: Number(outcomes?.missed_opportunity_count ?? 0),
      false_rejection_count: Number(outcomes?.false_rejection_count ?? 0),
      late_entry_count: Number(outcomes?.late_entry_count ?? 0),
      stage_counts: Object.fromEntries((stages?.results || []).map((row) => [row.funnel_stage, Number(row.count || 0)])),
      recent: recent?.results || [],
    };
  } catch (error) {
    const message = text(error?.message || error).slice(0, 600);
    return {
      ...safe,
      status: migrationRequiredError(message) ? "MIGRATION_REQUIRED" : "PARTIAL_FAIL_CLOSED",
      error: message,
    };
  }
}
