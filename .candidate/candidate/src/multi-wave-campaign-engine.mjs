export const MULTI_WAVE_VERSION = "3.9.1-multi-wave-campaign-shadow";
export const MULTI_WAVE_RULES_VERSION = "multi-wave-campaign-v1";
export const MULTI_WAVE_MODE = "MULTI_WAVE_CAMPAIGN_SHADOW_NO_EXECUTION";

export const CAMPAIGN_PHASE = Object.freeze({
  DISCOVERY: "DISCOVERY",
  PRE_IMPULSE_WATCH: "PRE_IMPULSE_WATCH",
  ENTRY_CANDIDATE: "ENTRY_CANDIDATE",
  ENTRY_TRIGGER: "ENTRY_TRIGGER",
  IMPULSE: "IMPULSE",
  RELOAD_BASE: "RELOAD_BASE",
  NEXT_IMPULSE_WATCH: "NEXT_IMPULSE_WATCH",
  NEXT_IMPULSE_ENTRY: "NEXT_IMPULSE_ENTRY",
  EXHAUSTION_WARNING: "EXHAUSTION_WARNING",
  EDGE_SPENT: "EDGE_SPENT",
  CLOSED: "CLOSED",
});

export const DEFAULT_MULTI_WAVE_CONFIG = Object.freeze({
  minimum_independent_early_detectors: 2,
  entry_candidate_evidence_min: 4,
  next_impulse_watch_evidence_min: 3,
  next_impulse_entry_evidence_min: 4,
  exhaustion_evidence_min: 3,
  first_impulse_move_pct: 3,
  next_impulse_move_pct: 2,
  reload_min_pullback_pct: 1,
  reload_max_retracement_fraction: 0.65,
  chase_distance_from_base_pct: 8,
  low_correlation_abs_max: 0.45,
  residual_watch_pct: 2,
  funding_neutral_abs: 0.00005,
  funding_max_age_hours: 12,
  funding_max_gap_hours: 12,
  market_max_age_hours: 2,
});

const CAMPAIGN_PHASE_SET = new Set(Object.values(CAMPAIGN_PHASE));
const CAMPAIGN_DIRECTION_SET = new Set(["LONG", "SHORT", "DIRECTIONLESS_EVENT"]);

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function ts(value) {
  const n = finite(value);
  if (n === null || n <= 0) return null;
  return n < 10_000_000_000 ? Math.round(n * 1000) : Math.round(n);
}

function text(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function normalizeDataQuality(value) {
  const q = text(value).toUpperCase();
  return ["OK", "PARTIAL", "STALE", "MISSING", "CONFLICTING"].includes(q) ? q : "PARTIAL";
}

function candleGeometryValid(candle) {
  const open = finite(candle?.open);
  const high = finite(candle?.high);
  const low = finite(candle?.low);
  const close = finite(candle?.close);
  return (
    open !== null && high !== null && low !== null && close !== null &&
    open > 0 && high > 0 && low > 0 && close > 0 &&
    high >= low && high >= open && high >= close && low <= open && low <= close
  );
}

function priorCampaignError(prior, contract, at) {
  if (!prior || prior.current_phase === CAMPAIGN_PHASE.CLOSED) return null;
  const start = ts(prior?.campaign_start);
  const first = ts(prior?.first_detected_time);
  const last = ts(prior?.last_observed_ts);
  const wave = finite(prior?.wave_index);
  const completed = finite(prior?.completed_wave_count);
  if (!text(prior?.campaign_id)) return "MISSING_CAMPAIGN_ID";
  if (text(prior?.contract_code).normalize("NFC") !== contract) return "CONTRACT_MISMATCH";
  if (!CAMPAIGN_PHASE_SET.has(prior?.current_phase)) return "INVALID_PHASE";
  if (!CAMPAIGN_DIRECTION_SET.has(prior?.direction)) return "INVALID_DIRECTION";
  if (!CAMPAIGN_DIRECTION_SET.has(prior?.direction_at_detection)) return "INVALID_DETECTION_DIRECTION";
  if (prior?.direction_at_detection !== "DIRECTIONLESS_EVENT" && prior?.direction !== prior?.direction_at_detection) return "DETECTION_DIRECTION_REWRITE";
  if (start === null || first === null || last === null || start !== first) return "INVALID_DETECTION_TIMELINE";
  if (start > at || last < start || last > at) return "INVALID_OBSERVATION_TIMELINE";
  if (ts(prior?.last_event_ts) !== null && (ts(prior.last_event_ts) > last || ts(prior.last_event_ts) > at)) return "INVALID_EVENT_TIMELINE";
  if (!Number.isSafeInteger(wave) || wave < 0 || !Number.isSafeInteger(completed) || completed < 0 || completed > wave) return "INVALID_WAVE_COUNTERS";
  return null;
}

function favorableMovePct(direction, rawReturnPct) {
  const r = finite(rawReturnPct);
  if (r === null) return null;
  if (direction === "LONG") return r;
  if (direction === "SHORT") return -r;
  return null;
}

function favorablePriceMovePct(direction, from, to) {
  return favorableMovePct(direction, pct(from, to));
}

function futureFeatureTimestamp(event, at) {
  const candidates = [
    event?.funding_at_event?.funding_time_ts,
    event?.funding_at_event?.event_close_ts,
    event?.oi_flush_rebuild?.source_start_ts,
    event?.oi_flush_rebuild?.source_end_ts,
    event?.oi_flush_rebuild?.observed_ts,
    event?.market_flow?.source_start_ts,
    event?.market_flow?.source_end_ts,
    event?.market_flow?.observed_ts,
    event?.relative_strength?.source_start_ts,
    event?.relative_strength?.source_end_ts,
    event?.relative_strength?.observed_ts,
    event?.post_event_current?.source_start_ts,
    event?.post_event_current?.source_end_ts,
    event?.post_event_current?.observed_ts,
    event?.observation_timing?.first_seen_ts,
    event?.liquidity_sweep?.sweep_ts,
    event?.liquidity_sweep?.reclaim_ts,
    event?.liquidity_sweep?.pool?.ts,
    event?.liquidity_sweep?.pool?.last_ts,
    ...Object.values(event?.price_oi_matrix || {}).flatMap((row) => [
      row?.synchronized_window_start_ts,
      row?.synchronized_window_end_ts,
    ]),
  ];
  return candidates.map(ts).find((value) => value !== null && value > at) ?? null;
}

function eventContextLookAheadTimestamp(event, eventClose) {
  const candidates = [
    event?.funding_at_event?.funding_time_ts,
    event?.oi_flush_rebuild?.source_end_ts,
    event?.market_flow?.source_end_ts,
    ...Object.values(event?.price_oi_matrix || {}).map((row) => row?.synchronized_window_end_ts),
  ];
  return candidates.map(ts).find((value) => value !== null && value > eventClose) ?? null;
}

function pct(from, to) {
  const a = finite(from);
  const b = finite(to);
  return a !== null && b !== null && a !== 0 ? ((b / a) - 1) * 100 : null;
}

function mean(values) {
  const xs = values.filter(Number.isFinite);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

function variance(values) {
  const m = mean(values);
  if (m === null || values.length < 2) return null;
  return values.reduce((s, x) => s + (x - m) ** 2, 0) / values.length;
}

function covariance(a, b) {
  if (a.length !== b.length || a.length < 2) return null;
  const ma = mean(a);
  const mb = mean(b);
  if (ma === null || mb === null) return null;
  return a.reduce((s, x, i) => s + (x - ma) * (b[i] - mb), 0) / a.length;
}

function correlation(a, b) {
  const cov = covariance(a, b);
  const va = variance(a);
  const vb = variance(b);
  if (cov === null || va === null || vb === null || va <= 0 || vb <= 0) return null;
  return cov / Math.sqrt(va * vb);
}

function sortedUnique(rows, timeKeys = ["ts", "timestamp", "funding_time_ts", "funding_time"]) {
  const out = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const timestamp = timeKeys.map((key) => ts(row?.[key])).find((x) => x !== null) ?? null;
    if (timestamp === null) continue;
    out.set(timestamp, { ...row, ts: timestamp });
  }
  return [...out.values()].sort((a, b) => a.ts - b.ts);
}

export function campaignSafetyEnvelope() {
  return {
    shadow_only: true,
    data_collection_only: true,
    classification_is_probability: false,
    live_probability: null,
    live_signal: false,
    validated_signal: false,
    decision_layer_changed: false,
    strategy_weights_changed: false,
    telegram_started: false,
    trading_execution: false,
    automatic_weight_tuning: false,
    campaign_phase_is_not_trade_instruction: true,
  };
}

export function computeFundingTrajectory(funding, asOf = Date.now(), config = DEFAULT_MULTI_WAVE_CONFIG) {
  const at = ts(asOf) ?? Date.now();
  const byTimestamp = new Map();
  let conflictingDuplicates = 0;
  for (const row of Array.isArray(funding?.recent_history) ? funding.recent_history : []) {
    const timestamp = ["funding_time_ts", "funding_time", "ts", "timestamp"]
      .map((key) => ts(row?.[key]))
      .find((value) => value !== null) ?? null;
    const rate = finite(row?.funding_rate ?? row?.rate);
    if (timestamp === null || rate === null || timestamp > at) continue;
    if (byTimestamp.has(timestamp) && byTimestamp.get(timestamp).rate !== rate) conflictingDuplicates += 1;
    byTimestamp.set(timestamp, { ts: timestamp, rate });
  }
  const rows = [...byTimestamp.values()].sort((a, b) => a.ts - b.ts);
  if (conflictingDuplicates > 0) {
    return {
      status: "CONFLICTING",
      current_rate: null,
      funding_velocity_per_hour: null,
      funding_acceleration_per_hour2: null,
      funding_regime_change: null,
      windows: {},
      conflicting_duplicates: conflictingDuplicates,
      missing_fields: ["conflicting_funding_rows"],
      safety: campaignSafetyEnvelope(),
    };
  }
  if (rows.length < 2) {
    return {
      status: "MISSING",
      current_rate: rows.at(-1)?.rate ?? null,
      funding_velocity_per_hour: null,
      funding_acceleration_per_hour2: null,
      funding_regime_change: null,
      windows: {},
      missing_fields: ["funding_history_trajectory"],
      safety: campaignSafetyEnvelope(),
    };
  }
  const last = rows.at(-1);
  const prev = rows.at(-2);
  const currentAgeHours = Math.max(0, (at - last.ts) / 3_600_000);
  const fundingFresh = currentAgeHours <= Number(config.funding_max_age_hours || 12);
  const dtHours = (last.ts - prev.ts) / 3_600_000;
  const maxGapHours = Number(config.funding_max_gap_hours || 12);
  const currentGapClosed = dtHours > 0 && dtHours <= maxGapHours;
  const velocity = currentGapClosed ? (last.rate - prev.rate) / dtHours : null;
  let acceleration = null;
  if (rows.length >= 3) {
    const p2 = rows.at(-3);
    const prevDt = (prev.ts - p2.ts) / 3_600_000;
    const prevVel = prevDt > 0 && prevDt <= maxGapHours ? (prev.rate - p2.rate) / prevDt : null;
    const accDt = (last.ts - p2.ts) / 3_600_000;
    if (prevVel !== null && velocity !== null && accDt > 0) acceleration = (velocity - prevVel) / (accDt / 2);
  }
  const windows = {};
  for (const hours of [1, 4, 12, 24]) {
    const start = at - hours * 3_600_000;
    const points = rows.filter((row) => row.ts >= start && row.ts <= at);
    const anchor = [...rows].reverse().find((row) => row.ts <= start) || null;
    const first = anchor || points[0] || null;
    const final = points.at(-1) || last;
    const actualSpanHours = first && final ? Math.max(0, (final.ts - first.ts) / 3_600_000) : null;
    const exactEnough = Boolean(
      anchor &&
      actualSpanHours !== null &&
      actualSpanHours >= hours * 0.75 &&
      actualSpanHours <= hours * 1.5 &&
      final?.ts === last.ts &&
      fundingFresh,
    );
    windows[`${hours}h`] = {
      requested_hours: hours,
      start_ts: first?.ts ?? null,
      end_ts: final?.ts ?? null,
      actual_span_hours: actualSpanHours,
      coverage_status: exactEnough ? "OK" : "PARTIAL",
      first_rate: first?.rate ?? null,
      last_rate: final?.rate ?? null,
      change: first && final ? final.rate - first.rate : null,
      minimum_rate: points.length ? Math.min(...points.map((row) => row.rate)) : null,
      maximum_rate: points.length ? Math.max(...points.map((row) => row.rate)) : null,
      point_count: points.length,
    };
  }
  const neutral = config.funding_neutral_abs;
  let regime = "NEUTRAL_OR_STABLE";
  if (last.rate < -neutral && (velocity ?? 0) < 0) regime = "NEGATIVE_DEEPENING";
  else if (last.rate < -neutral && (velocity ?? 0) > 0) regime = "NEGATIVE_EASING";
  else if (last.rate > neutral && (velocity ?? 0) > 0) regime = "POSITIVE_DEEPENING";
  else if (last.rate > neutral && (velocity ?? 0) < 0) regime = "POSITIVE_EASING";
  return {
    status: !fundingFresh ? "STALE" : currentGapClosed ? "OK" : "PARTIAL",
    current_rate: last.rate,
    current_ts: last.ts,
    current_age_hours: currentAgeHours,
    funding_velocity_per_hour: velocity,
    funding_acceleration_per_hour2: acceleration,
    funding_regime_change: regime,
    current_gap_hours: dtHours,
    current_gap_closed: currentGapClosed,
    windows,
    interpretation: "Context only. Negative funding is not proof of new short build.",
    missing_fields: currentGapClosed ? [] : ["recent_funding_interval_gap"],
    safety: campaignSafetyEnvelope(),
  };
}

function closedHourlyPoints(rows, asOf) {
  const at = ts(asOf) ?? Date.now();
  return sortedUnique(rows)
    .map((row) => ({
      ts: row.ts,
      end_ts: ts(row?.end_ts) ?? (row?.closed === true ? row.ts + 3_600_000 : null),
      close: finite(row?.close),
    }))
    .filter((row) => (
      row.close !== null && row.close > 0 &&
      row.ts % 3_600_000 === 0 && row.ts <= at &&
      (row.end_ts === null || (row.end_ts === row.ts + 3_600_000 && row.end_ts <= at))
    ));
}

function conflictingHourlyDuplicates(rows, asOf) {
  const at = ts(asOf) ?? Date.now();
  const seen = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const timestamp = ts(row?.ts ?? row?.timestamp);
    const close = finite(row?.close);
    const end = ts(row?.end_ts) ?? (row?.closed === true && timestamp !== null ? timestamp + 3_600_000 : null);
    if (timestamp === null || close === null || timestamp > at || (end !== null && end > at)) continue;
    const signature = `${close}:${end ?? "NO_END"}`;
    if (seen.has(timestamp) && seen.get(timestamp) !== signature) return true;
    seen.set(timestamp, signature);
  }
  return false;
}

function hourlyReturns(rows, startTs, endTs) {
  const xs = rows
    .filter((row) => row.ts >= startTs - 3_600_000 && row.ts <= endTs);
  const map = new Map(xs.map((row) => [row.ts, row.close]));
  const out = [];
  for (let t = startTs; t <= endTs; t += 3_600_000) {
    const a = map.get(t - 3_600_000);
    const b = map.get(t);
    if (a === undefined || b === undefined || a <= 0) return null;
    out.push({ ts: t, ret: ((b / a) - 1) * 100 });
  }
  return out;
}

export function computeMarketIndependence(externalHourly = {}, asOf = Date.now(), windowHours = 24, config = DEFAULT_MULTI_WAVE_CONFIG) {
  const at = ts(asOf) ?? Date.now();
  const candidateRows = Array.isArray(externalHourly?.CANDIDATE_SPOT) ? externalHourly.CANDIDATE_SPOT : [];
  const okxRows = Array.isArray(externalHourly?.OKX_SPOT) ? externalHourly.OKX_SPOT : [];
  const fallbackRows = Array.isArray(externalHourly?.ASSET_SPOT) ? externalHourly.ASSET_SPOT : [];
  const rawAssetRows = candidateRows.length ? candidateRows : okxRows.length ? okxRows : fallbackRows;
  const rawBtcRows = externalHourly?.BTC_SPOT || [];
  const rawEthRows = externalHourly?.ETH_SPOT || [];
  if ([rawAssetRows, rawBtcRows, rawEthRows].some((rows) => conflictingHourlyDuplicates(rows, at))) {
    return {
      status: "CONFLICTING",
      correlation_btc: null,
      correlation_eth: null,
      beta_btc: null,
      beta_eth: null,
      r2_btc: null,
      r2_eth: null,
      residual_return_btc_pct: null,
      residual_return_eth_pct: null,
      regime: "UNKNOWN",
      missing_fields: ["conflicting_duplicate_hourly_candles"],
      safety: campaignSafetyEnvelope(),
    };
  }
  const assetRows = closedHourlyPoints(rawAssetRows, at);
  const btcRows = closedHourlyPoints(rawBtcRows, at);
  const ethRows = closedHourlyPoints(rawEthRows, at);
  const btcTs = new Set(btcRows.map((row) => row.ts));
  const ethTs = new Set(ethRows.map((row) => row.ts));
  const common = assetRows.map((row) => row.ts).filter((timestamp) => btcTs.has(timestamp) && ethTs.has(timestamp));
  const end = common.length ? Math.max(...common) : null;
  const requested = Math.max(4, Math.min(48, Number(windowHours) || 24));
  const start = end === null ? null : end - requested * 3_600_000 + 3_600_000;
  const endRow = end === null ? null : assetRows.find((row) => row.ts === end);
  const factualCloseTs = endRow?.end_ts ?? end;
  const ageHours = factualCloseTs === null ? null : Math.max(0, (at - factualCloseTs) / 3_600_000);
  const fresh = ageHours !== null && ageHours <= Number(config.market_max_age_hours || 2);
  const asset = start === null ? null : hourlyReturns(assetRows, start, end);
  const btc = start === null ? null : hourlyReturns(btcRows, start, end);
  const eth = start === null ? null : hourlyReturns(ethRows, start, end);
  if (!fresh || !asset || !btc || !eth || asset.length !== btc.length || asset.length !== eth.length || asset.length < 4) {
    return {
      status: fresh ? "MISSING" : end === null ? "MISSING" : "STALE",
      correlation_btc: null,
      correlation_eth: null,
      beta_btc: null,
      beta_eth: null,
      r2_btc: null,
      r2_eth: null,
      residual_return_btc_pct: null,
      residual_return_eth_pct: null,
      regime: "UNKNOWN",
      latest_common_ts: end,
      latest_common_close_ts: factualCloseTs,
      latest_common_age_hours: ageHours,
      missing_fields: [fresh ? "synchronized_candidate_btc_eth_hourly_returns" : "fresh_synchronized_candidate_btc_eth_hourly_returns"],
      safety: campaignSafetyEnvelope(),
    };
  }
  const a = asset.map((x) => x.ret);
  const b = btc.map((x) => x.ret);
  const e = eth.map((x) => x.ret);
  const corrB = correlation(a, b);
  const corrE = correlation(a, e);
  const vb = variance(b);
  const ve = variance(e);
  const betaB = vb && vb > 0 ? covariance(a, b) / vb : null;
  const betaE = ve && ve > 0 ? covariance(a, e) / ve : null;
  const assetTotal = a.reduce((s, x) => s + x, 0);
  const btcTotal = b.reduce((s, x) => s + x, 0);
  const ethTotal = e.reduce((s, x) => s + x, 0);
  const residualB = betaB === null ? null : assetTotal - betaB * btcTotal;
  const residualE = betaE === null ? null : assetTotal - betaE * ethTotal;
  const lowCorr = corrB !== null && corrE !== null && Math.abs(corrB) <= config.low_correlation_abs_max && Math.abs(corrE) <= config.low_correlation_abs_max;
  const residualLarge = Math.max(Math.abs(residualB ?? 0), Math.abs(residualE ?? 0)) >= config.residual_watch_pct;
  return {
    status: "OK",
    window_hours: asset.length,
    start_ts: start,
    end_ts: end,
    end_close_ts: factualCloseTs,
    age_hours: ageHours,
    correlation_btc: corrB,
    correlation_eth: corrE,
    beta_btc: betaB,
    beta_eth: betaE,
    r2_btc: corrB === null ? null : corrB ** 2,
    r2_eth: corrE === null ? null : corrE ** 2,
    asset_return_sum_pct: assetTotal,
    residual_return_btc_pct: residualB,
    residual_return_eth_pct: residualE,
    regime: lowCorr && residualLarge ? "IDIOSYNCRATIC_REGIME_WATCH" : lowCorr ? "LOW_CORRELATION" : "MARKET_COUPLED_OR_MIXED",
    requested_windows: {
      "15m": { status: "MISSING", reason: "NO_SYNCHRONIZED_15M_BTC_ETH_INPUT" },
      "1h": { status: "MISSING", reason: "HOURLY_RETURNS_REQUIRE_AT_LEAST_TWO_CLOSED_HOURS" },
      "4h": { status: asset.length >= 4 ? "AVAILABLE_FROM_HOURLY" : "MISSING" },
      "24h": { status: asset.length >= 24 ? "AVAILABLE_FROM_HOURLY" : "PARTIAL" },
    },
    decision_signal: false,
    safety: campaignSafetyEnvelope(),
  };
}

export function detectPostSweepRetest({ candles = [], sweep = null, asOf = Date.now() } = {}) {
  if (!sweep?.sweep_detected || !sweep?.reclaim_detected || !sweep?.pool || !["LOW", "HIGH"].includes(sweep?.side)) {
    return { status: "MISSING", retest_detected: false, second_reclaim: false, missing_fields: ["confirmed_sweep_and_first_reclaim"] };
  }
  const at = ts(asOf) ?? Date.now();
  const rows = sortedUnique(candles).map((row) => ({ ...row, high: finite(row?.high), low: finite(row?.low), close: finite(row?.close), end_ts: ts(row?.end_ts) }))
    .filter((row) => candleGeometryValid(row) && row.end_ts !== null && row.end_ts > row.ts && row.end_ts <= at);
  const level = finite(sweep?.pool?.level);
  const reclaimTs =
    ts(sweep?.reclaim_ts) ??
    (ts(sweep?.sweep_ts) !== null && finite(sweep?.reclaim_time_ms) !== null
      ? ts(sweep.sweep_ts) + Number(sweep.reclaim_time_ms)
      : null);
  const sweepTs = ts(sweep?.sweep_ts);
  if (level === null || reclaimTs === null || reclaimTs > at || (sweepTs !== null && reclaimTs < sweepTs)) {
    return { status: "MISSING", retest_detected: false, second_reclaim: false, missing_fields: ["valid_sweep_level_and_reclaim_time"] };
  }
  const after = rows.filter((row) => row.ts >= reclaimTs);
  let retest = null;
  let second = null;
  for (const row of after) {
    const touches = sweep.side === "LOW" ? row.low <= level * 1.0025 : row.high >= level * 0.9975;
    if (!retest && touches) {
      retest = row;
      continue;
    }
    if (retest) {
      const reclaimed = sweep.side === "LOW" ? row.close > level : row.close < level;
      if (reclaimed) { second = row; break; }
    }
  }
  return {
    status: "OK",
    sweep_level: level,
    side: sweep.side,
    retest_detected: Boolean(retest),
    retest_time: retest?.ts ?? null,
    retest_low: retest?.low ?? null,
    retest_high: retest?.high ?? null,
    second_reclaim: Boolean(second),
    second_reclaim_time: second?.end_ts ?? null,
    seller_efficiency_before: finite(sweep?.seller_efficiency_before),
    seller_efficiency_after: finite(sweep?.seller_efficiency_after),
    entry_quality_may_improve: Boolean(second),
    live_entry_trigger: false,
    safety: campaignSafetyEnvelope(),
  };
}

function prospectiveDirection(event, retest, opportunity) {
  // Only the timestamped event may carry an explicit detection-time side.
  // A later aggregate/top-level field is never allowed to backfill direction.
  const explicit = text(event?.direction_at_detection).toUpperCase();
  if (["LONG", "SHORT"].includes(explicit) && event?.observation_timing?.retrospective_promotion_forbidden !== true) {
    return { direction: explicit, confidence: finite(event?.direction_confidence_at_detection) ?? null, source: "EXPLICIT_AT_DETECTION" };
  }
  const sweepSide = event?.liquidity_sweep?.side;
  if (retest?.second_reclaim === true && sweepSide === "LOW" && event?.relative_strength?.improving === true) {
    return { direction: "LONG", confidence: null, source: "PROSPECTIVE_LOW_SWEEP_RETEST_AND_RS" };
  }
  if (retest?.second_reclaim === true && sweepSide === "HIGH" && event?.relative_strength?.improving === false && event?.relative_strength?.status === "OK") {
    return { direction: "SHORT", confidence: null, source: "PROSPECTIVE_HIGH_SWEEP_RETEST_AND_RS" };
  }
  return { direction: "DIRECTIONLESS_EVENT", confidence: null, source: "NO_DIRECTION_AT_DETECTION" };
}

function countEvidence(obj) {
  return Object.entries(obj).filter(([, value]) => value === true).map(([key]) => key);
}

export function deriveCampaignEvidence({ opportunity, funding_metrics, independence, retest, direction = "DIRECTIONLESS_EVENT" } = {}) {
  const event = opportunity?.newest_event || null;
  if (!event || event?.control_group === true) {
    return { status: "MISSING", early: {}, early_count: 0, next_impulse: {}, next_impulse_count: 0, exhaustion: {}, exhaustion_count: 0 };
  }
  // Campaign evidence is anchored to the timestamped event.  The aggregate
  // opportunity fields describe the latest report-wide view and can be newer
  // than the event; using them as an event fallback would permit later OI or
  // basis observations to be relabelled as detection-time evidence.
  const basis = finite(event?.spot_perp_basis?.htx_basis_pct);
  const basisStatus = normalizeDataQuality(event?.spot_perp_basis?.status);
  const oi = event?.oi_flush_rebuild || {};
  const post = event?.post_event_current || {};
  const postUsable = normalizeDataQuality(post?.status) === "OK";
  const oiUsable = normalizeDataQuality(oi?.status) === "OK";
  const flowDelta = normalizeDataQuality(event?.market_flow?.status) === "OK" ? finite(event?.market_flow?.delta) : null;
  const rs = event?.relative_strength || {};
  const fundingRate = finite(funding_metrics?.current_rate);
  const fundingUsable = funding_metrics?.status === "OK";
  const longContext = direction === "LONG";
  const shortContext = direction === "SHORT";
  const directional = longContext || shortContext;
  const sweepSide = event?.liquidity_sweep?.side;
  const matchingSweep = (longContext && sweepSide === "LOW") || (shortContext && sweepSide === "HIGH");
  const pressureIneffective = (
    longContext && postUsable && flowDelta !== null && flowDelta < 0 && (post?.low_held === true || post?.reclaim_detected === true)
  ) || (
    shortContext && flowDelta !== null && flowDelta > 0 && retest?.second_reclaim === true && sweepSide === "HIGH"
  );
  const levelHeld = longContext
    ? (postUsable && (post?.low_held === true || post?.reclaim_detected === true))
    : shortContext
      ? (retest?.second_reclaim === true && sweepSide === "HIGH")
      : false;
  const early = {
    // Funding remains observable campaign context, but its sign/regime is
    // never an independent directional evidence vote under TZ 10.1.
    funding_crowding_or_deepening: false,
    oi_rebuild_or_growth: oiUsable && (oi?.setup_shadow === true || finite(oi?.oi_rebuild_pct) > 0),
    basis_dislocation_supportive: directional && basisStatus === "OK" && basis !== null && (shortContext ? basis > 0 : basis < 0),
    opposing_pressure_ineffective: pressureIneffective,
    anomalous_effort_weak_result: finite(event?.volume_ratio_median) >= 3 && finite(event?.body_range_ratio) !== null && event.body_range_ratio <= 0.35,
    level_held_or_reclaimed: levelHeld,
    relative_strength_directional: directional && rs?.status === "OK" && (shortContext ? rs?.improving === false : rs?.improving === true),
    idiosyncratic_regime: independence?.regime === "IDIOSYNCRATIC_REGIME_WATCH",
    ease_of_movement_after_event: longContext
      ? postUsable && post?.ease_supply_exhaustion === true
      : shortContext
        ? postUsable && post?.ease_demand_exhaustion === true
        : false,
    sweep_and_reclaim: directional && matchingSweep && event?.liquidity_sweep?.reclaim_detected === true,
    successful_retest_second_reclaim: directional && matchingSweep && retest?.second_reclaim === true,
    cross_exchange_anomaly: event?.cross_exchange?.cross_exchange_confirmed === true,
  };
  const next = {
    structure_not_broken: shortContext
      ? (retest?.second_reclaim === true && event?.liquidity_sweep?.side === "HIGH")
      : (post?.low_held === true || post?.reclaim_detected === true),
    pullback_volume_contracting: postUsable && finite(post?.post_event_volume_per_hour) !== null && finite(post?.event_volume_per_hour) !== null && post.post_event_volume_per_hour < post.event_volume_per_hour,
    oi_stabilized_or_rebuilding: oiUsable && (oi?.setup_shadow === true || finite(oi?.oi_rebuild_pct) > 0),
    // A funding reload may affect holding-cost/crowding context, but cannot
    // independently promote a next impulse in either direction.
    funding_reloads_crowding: false,
    relative_strength_preserved: rs?.status === "OK" && (shortContext ? rs?.improving === false : rs?.improving === true),
    spot_perp_stress_supportive: directional && basisStatus === "OK" && basis !== null && (shortContext ? basis > 0 : basis < 0),
    aggressor_efficiency_supportive: shortContext
      ? (flowDelta !== null && flowDelta > 0 && retest?.second_reclaim === true)
      : postUsable && post?.ease_supply_exhaustion === true,
    successful_retest_second_reclaim: directional && matchingSweep && retest?.second_reclaim === true,
  };
  const opposingEaseExhausted = longContext
    ? postUsable && post?.ease_supply_exhaustion === true
    : shortContext
      ? postUsable && post?.ease_demand_exhaustion === true
      : false;
  const exhaustion = {
    increasingly_high_effort_low_result: directional && finite(event?.volume_ratio_median) >= 5 && finite(event?.body_range_ratio) !== null && event.body_range_ratio <= 0.2 && !opposingEaseExhausted,
    opposing_pressure_gains_efficiency: longContext
      ? postUsable && flowDelta !== null && flowDelta < 0 && post?.low_held === false
      : shortContext
        ? postUsable && flowDelta !== null && flowDelta > 0 && post?.high_held === false
        : false,
    relative_strength_deteriorates: directional && rs?.status === "OK" && (shortContext ? rs?.improving === true : rs?.improving === false),
    oi_rebuild_absent: oiUsable && oi?.detected === false,
    repeated_reclaim_failure: false,
  };
  return {
    status: "OK",
    early,
    early_keys: countEvidence(early),
    early_count: countEvidence(early).length,
    next_impulse: next,
    next_impulse_keys: countEvidence(next),
    next_impulse_count: countEvidence(next).length,
    exhaustion,
    exhaustion_keys: countEvidence(exhaustion),
    exhaustion_count: countEvidence(exhaustion).length,
    reclaim_failure_observed: directional && matchingSweep && event?.liquidity_sweep?.sweep_detected === true && event?.liquidity_sweep?.reclaim_detected !== true,
    interpretation: "Evidence counts are uncalibrated shadow context, not probabilities.",
  };
}

function refreshEvidenceCounts(evidence) {
  evidence.early_keys = countEvidence(evidence.early || {});
  evidence.early_count = evidence.early_keys.length;
  evidence.next_impulse_keys = countEvidence(evidence.next_impulse || {});
  evidence.next_impulse_count = evidence.next_impulse_keys.length;
  evidence.exhaustion_keys = countEvidence(evidence.exhaustion || {});
  evidence.exhaustion_count = evidence.exhaustion_keys.length;
  return evidence;
}

function priceContext(opportunity) {
  const event = opportunity?.newest_event || null;
  const postUsable = normalizeDataQuality(event?.post_event_current?.status) === "OK";
  const close = postUsable && finite(event?.post_event_current?.current_return_pct) !== null && finite(event?.candle?.close) !== null
    ? event.candle.close * (1 + event.post_event_current.current_return_pct / 100)
    : finite(event?.candle?.close);
  return {
    current_price: close,
    event_close: finite(event?.candle?.close),
    event_high: finite(event?.candle?.high),
    event_low: finite(event?.candle?.low),
    current_return_from_event_pct: finite(event?.post_event_current?.current_return_pct),
  };
}

function computeChaseRisk({ prior, opportunity, phase, config }) {
  const p = priceContext(opportunity);
  const baseLow = finite(prior?.base_low ?? p.event_low);
  const baseHigh = finite(prior?.base_high ?? p.event_high);
  const baseMid = baseLow !== null && baseHigh !== null ? (baseLow + baseHigh) / 2 : null;
  const distance = baseMid !== null && p.current_price !== null ? Math.abs(p.current_price / baseMid - 1) * 100 : null;
  const conditions = {
    far_from_last_base: distance !== null && distance >= config.chase_distance_from_base_pct,
    no_clear_invalidation: baseLow === null || baseHigh === null,
    structure_broken: phase === CAMPAIGN_PHASE.EDGE_SPENT || phase === CAMPAIGN_PHASE.CLOSED,
    edge_spent: phase === CAMPAIGN_PHASE.EDGE_SPENT,
  };
  const hits = countEvidence(conditions);
  return {
    active: hits.length >= 2,
    conditions,
    reasons: hits,
    distance_from_last_base_pct: distance,
    rule: "Price distance alone cannot create CHASE_RISK.",
  };
}

function buildEntryScenarioAnchor(campaign, config) {
  const phase = campaign?.current_phase;
  if (![CAMPAIGN_PHASE.ENTRY_TRIGGER, CAMPAIGN_PHASE.NEXT_IMPULSE_ENTRY].includes(phase)) return null;
  const direction = campaign?.direction;
  if (!['LONG', 'SHORT'].includes(direction)) return null;
  const entryTs = ts(campaign?.entry_trigger_time);
  const entryPrice = finite(campaign?.entry_trigger_price);
  const baseStart = ts(campaign?.base_start);
  const baseLow = finite(campaign?.base_low);
  const baseHigh = finite(campaign?.base_high);
  const waveIndex = finite(campaign?.wave_index);
  const observedTs = ts(campaign?.last_observed_ts);
  if (entryTs === null || observedTs === null || entryTs > observedTs || entryPrice === null || entryPrice <= 0 ||
      baseStart === null || baseStart > entryTs || baseLow === null || baseHigh === null || baseLow <= 0 || baseHigh <= 0 || baseLow > baseHigh ||
      !Number.isSafeInteger(waveIndex) || waveIndex < 1) return null;
  const invalidationPrice = direction === 'LONG' ? baseLow : baseHigh;
  if ((direction === 'LONG' && invalidationPrice >= entryPrice) || (direction === 'SHORT' && invalidationPrice <= entryPrice)) return null;
  const thresholdPct = phase === CAMPAIGN_PHASE.ENTRY_TRIGGER
    ? finite(config?.first_impulse_move_pct)
    : finite(config?.next_impulse_move_pct);
  if (thresholdPct === null || thresholdPct <= 0) return null;
  const targetPrice = direction === 'LONG'
    ? entryPrice * (1 + thresholdPct / 100)
    : entryPrice * (1 - thresholdPct / 100);
  if (!Number.isFinite(targetPrice) || targetPrice <= 0) return null;
  return {
    schema_version: 'multi-wave-entry-scenario-anchor-v1',
    rules_version: MULTI_WAVE_RULES_VERSION,
    scenario_type: phase === CAMPAIGN_PHASE.ENTRY_TRIGGER ? 'FIRST_IMPULSE_THRESHOLD' : 'NEXT_IMPULSE_THRESHOLD',
    campaign_id: campaign.campaign_id,
    contract_code: campaign.contract_code,
    wave_index: waveIndex,
    direction,
    source_phase: phase,
    source_observation_ts: observedTs,
    base_start: baseStart,
    base_low: baseLow,
    base_high: baseHigh,
    entry_trigger_time: entryTs,
    entry_trigger_price: entryPrice,
    invalidation_price: invalidationPrice,
    invalidation_basis: 'PRECOMMITTED_CAMPAIGN_BASE_BREAK',
    target_move_pct: thresholdPct,
    target_price: targetPrice,
    target_basis: 'PRECOMMITTED_MULTI_WAVE_IMPULSE_THRESHOLD',
    prospective_only: true,
  };
}

function defaultCampaign(contract, now, event, currentPrice = null, detectedDirection = "DIRECTIONLESS_EVENT", detectedConfidence = null) {
  // campaign_start/first_detected_time are the factual observation time when
  // our system first recognized the campaign, not the historical candle time.
  const start = ts(now) ?? Date.now();
  return {
    campaign_id: `MW:${text(contract).normalize("NFC")}:${start}`,
    contract_code: text(contract).normalize("NFC"),
    campaign_start: start,
    campaign_end: null,
    first_detected_time: start,
    first_detected_price: finite(currentPrice ?? event?.candle?.close),
    current_phase: CAMPAIGN_PHASE.DISCOVERY,
    direction: detectedDirection || "DIRECTIONLESS_EVENT",
    direction_at_detection: detectedDirection || "DIRECTIONLESS_EVENT",
    direction_confidence_at_detection: finite(detectedConfidence),
    wave_index: 0,
    completed_wave_count: 0,
    base_start: ts(event?.timestamp),
    base_low: finite(event?.candle?.low),
    base_high: finite(event?.candle?.high),
    entry_trigger_time: null,
    entry_trigger_price: null,
    impulse_start: null,
    impulse_start_price: null,
    impulse_peak_price: null,
    impulse_peak_ts: null,
    material_observation_signature: null,
    last_event_core_signature: null,
    reclaim_failure_event_ids: [],
    prior_phase: null,
  };
}

function eventCoreSignature(event) {
  return JSON.stringify([
    text(event?.event_id), ts(event?.timestamp), ts(event?.event_close_ts),
    finite(event?.candle?.open), finite(event?.candle?.high), finite(event?.candle?.low),
    finite(event?.candle?.close), finite(event?.candle?.volume), finite(event?.candle?.trade_count),
    finite(event?.volume_ratio_median), finite(event?.body_range_ratio),
    text(event?.direction_at_detection).toUpperCase() || "DIRECTIONLESS_EVENT",
    finite(event?.direction_confidence_at_detection),
  ]);
}

function materialObservationSignature({ event, price, funding, independence, retest, direction, evidence }) {
  return JSON.stringify([
    text(event?.event_id), ts(event?.timestamp), ts(event?.event_close_ts),
    finite(price?.current_price), text(event?.funnel?.stage), direction,
    normalizeDataQuality(event?.post_event_current?.status),
    event?.post_event_current?.low_held ?? null,
    event?.post_event_current?.high_held ?? null,
    event?.post_event_current?.reclaim_detected ?? null,
    event?.post_event_current?.ease_supply_exhaustion ?? null,
    event?.post_event_current?.ease_demand_exhaustion ?? null,
    finite(event?.post_event_current?.event_volume_per_hour),
    finite(event?.post_event_current?.post_event_volume_per_hour),
    normalizeDataQuality(event?.market_flow?.status), finite(event?.market_flow?.delta),
    normalizeDataQuality(event?.relative_strength?.status), event?.relative_strength?.improving ?? null,
    normalizeDataQuality(event?.spot_perp_basis?.status ?? event?.status),
    finite(event?.spot_perp_basis?.htx_basis_pct),
    normalizeDataQuality(event?.oi_flush_rebuild?.status),
    event?.oi_flush_rebuild?.detected === true,
    event?.oi_flush_rebuild?.setup_shadow === true,
    finite(event?.oi_flush_rebuild?.oi_rebuild_pct),
    funding?.status, ts(funding?.current_ts), finite(funding?.current_rate),
    finite(funding?.funding_velocity_per_hour), finite(funding?.funding_acceleration_per_hour2),
    independence?.status, ts(independence?.end_ts), independence?.regime,
    event?.liquidity_sweep?.sweep_detected ?? null,
    event?.liquidity_sweep?.reclaim_detected ?? null,
    event?.liquidity_sweep?.side ?? null,
    retest?.status, retest?.second_reclaim === true, ts(retest?.second_reclaim_time),
    evidence?.reclaim_failure_observed === true,
  ]);
}

export function computeLeadTimeMetrics({ prior, opportunity, current } = {}) {
  const event = opportunity?.newest_event || null;
  const firstTs = ts(prior?.first_detected_time ?? current?.campaign_start);
  const firstPrice = finite(prior?.first_detected_price ?? current?.first_detected_price ?? event?.candle?.close);
  const triggerTs = ts(current?.entry_trigger_time);
  const triggerPrice = finite(current?.entry_trigger_price);
  const impulseTs = ts(current?.impulse_start);
  const impulsePrice = finite(current?.impulse_start_price);
  const currentPrice = priceContext(opportunity).current_price;
  const waveIndex = Number(current?.wave_index ?? prior?.wave_index ?? 0);
  const waveBaseTs = ts(current?.base_start ?? prior?.base_start);
  const waveDetectionTs = waveIndex > 1 && waveBaseTs !== null ? waveBaseTs : firstTs;
  return {
    first_detected_time: firstTs,
    first_detected_price: firstPrice,
    entry_trigger_time: triggerTs,
    entry_trigger_price: triggerPrice,
    impulse_start_time: impulseTs,
    impulse_start_price: impulsePrice,
    lead_time_minutes: firstTs !== null && impulseTs !== null ? (impulseTs - firstTs) / 60_000 : null,
    wave_detection_time: waveDetectionTs,
    wave_lead_time_minutes: waveDetectionTs !== null && impulseTs !== null ? (impulseTs - waveDetectionTs) / 60_000 : null,
    move_before_detection_pct: null,
    move_after_detection_pct: firstPrice !== null && currentPrice !== null ? pct(firstPrice, currentPrice) : null,
    move_before_entry_pct: firstPrice !== null && triggerPrice !== null ? pct(firstPrice, triggerPrice) : null,
    move_after_entry_pct: triggerPrice !== null && currentPrice !== null ? pct(triggerPrice, currentPrice) : null,
    early_detection_success: impulseTs !== null && firstTs !== null ? firstTs < impulseTs : null,
  };
}

export function buildMultiWaveCampaignShadow({ opportunity, input = {}, prior_campaign = null, now = Date.now(), config = DEFAULT_MULTI_WAVE_CONFIG } = {}) {
  const event = opportunity?.newest_event || null;
  const contract = text(opportunity?.contract || input?.contract || prior_campaign?.contract_code).normalize("NFC");
  const safety = campaignSafetyEnvelope();
  const at = ts(now) ?? Date.now();
  if (!contract || contract.length > 100 || !event || event?.control_group === true) {
    return {
      version: MULTI_WAVE_VERSION,
      rules_version: MULTI_WAVE_RULES_VERSION,
      mode: MULTI_WAVE_MODE,
      status: "NO_CAMPAIGN_EVENT",
      contract_code: contract || null,
      campaign: prior_campaign || null,
      safety,
    };
  }
  const eventTs = ts(event?.timestamp);
  const eventCloseTs = ts(event?.event_close_ts);
  const eventId = text(event?.event_id);
  if (
    !eventId || eventId.length > 512 || eventTs === null || eventCloseTs === null || eventCloseTs <= eventTs ||
    !candleGeometryValid(event?.candle) || finite(event?.candle?.volume) === null || finite(event?.candle?.volume) < 0
  ) {
    return {
      version: MULTI_WAVE_VERSION, rules_version: MULTI_WAVE_RULES_VERSION, mode: MULTI_WAVE_MODE,
      status: "INVALID_EVENT_FAIL_CLOSED", contract_code: contract, campaign: prior_campaign || null,
      error: "event identity, closed timeline, or factual OHLCV geometry is invalid", safety,
    };
  }
  if (eventTs > at || eventCloseTs > at) {
    return {
      version: MULTI_WAVE_VERSION, rules_version: MULTI_WAVE_RULES_VERSION, mode: MULTI_WAVE_MODE,
      status: "FUTURE_EVENT_REJECTED", contract_code: contract, campaign: prior_campaign || null,
      error: "event timestamp is after as-of time", safety,
    };
  }
  const futureFeatureTs = futureFeatureTimestamp(event, at);
  if (futureFeatureTs !== null) {
    return {
      version: MULTI_WAVE_VERSION, rules_version: MULTI_WAVE_RULES_VERSION, mode: MULTI_WAVE_MODE,
      status: "FUTURE_FEATURE_REJECTED", contract_code: contract, campaign: prior_campaign || null,
      error: `nested feature timestamp ${futureFeatureTs} is after as-of time`, safety,
    };
  }
  if (event?.liquidity_sweep?.reclaim_detected === true) {
    const sweepTs = ts(event.liquidity_sweep?.sweep_ts);
    const reclaimTs = ts(event.liquidity_sweep?.reclaim_ts) ?? (
      sweepTs !== null && finite(event.liquidity_sweep?.reclaim_time_ms) !== null
        ? sweepTs + Number(event.liquidity_sweep.reclaim_time_ms)
        : null
    );
    if (sweepTs === null || reclaimTs === null || reclaimTs < sweepTs || reclaimTs > at) {
      return {
        version: MULTI_WAVE_VERSION, rules_version: MULTI_WAVE_RULES_VERSION, mode: MULTI_WAVE_MODE,
        status: "INVALID_SWEEP_TIMELINE_REJECTED", contract_code: contract, campaign: prior_campaign || null,
        safety,
      };
    }
  }
  const eventLookAheadTs = eventContextLookAheadTimestamp(event, eventCloseTs);
  if (eventLookAheadTs !== null) {
    return {
      version: MULTI_WAVE_VERSION, rules_version: MULTI_WAVE_RULES_VERSION, mode: MULTI_WAVE_MODE,
      status: "EVENT_CONTEXT_LOOKAHEAD_REJECTED", contract_code: contract, campaign: prior_campaign || null,
      error: `event-scoped feature timestamp ${eventLookAheadTs} is after event close`, safety,
    };
  }
  const eventQuality = normalizeDataQuality(event?.data_quality || opportunity?.status);
  if (["STALE", "MISSING", "CONFLICTING"].includes(eventQuality)) {
    return {
      version: MULTI_WAVE_VERSION, rules_version: MULTI_WAVE_RULES_VERSION, mode: MULTI_WAVE_MODE,
      status: "DATA_QUALITY_FAIL_CLOSED", contract_code: contract, campaign: prior_campaign || null,
      data_quality: eventQuality, safety,
    };
  }
  const activePrior = prior_campaign && prior_campaign.current_phase !== CAMPAIGN_PHASE.CLOSED
    ? { ...prior_campaign }
    : null;
  const priorError = priorCampaignError(activePrior, contract, at);
  if (priorError) {
    return {
      version: MULTI_WAVE_VERSION, rules_version: MULTI_WAVE_RULES_VERSION, mode: MULTI_WAVE_MODE,
      status: "PRIOR_CAMPAIGN_FAIL_CLOSED", contract_code: contract, campaign: activePrior,
      error: priorError, safety,
    };
  }
  if (activePrior && at < ts(activePrior.last_observed_ts)) {
    return {
      version: MULTI_WAVE_VERSION, rules_version: MULTI_WAVE_RULES_VERSION, mode: MULTI_WAVE_MODE,
      status: "NON_MONOTONIC_OBSERVATION_REJECTED", contract_code: contract, campaign: activePrior, safety,
    };
  }
  const priorEventTs = ts(activePrior?.last_event_ts);
  if (priorEventTs !== null && eventTs < priorEventTs) {
    return {
      version: MULTI_WAVE_VERSION, rules_version: MULTI_WAVE_RULES_VERSION, mode: MULTI_WAVE_MODE,
      status: "STALE_EVENT_REJECTED", contract_code: contract, campaign: activePrior, safety,
    };
  }
  if (activePrior?.last_event_id === eventId && priorEventTs !== null && priorEventTs !== eventTs) {
    return {
      version: MULTI_WAVE_VERSION, rules_version: MULTI_WAVE_RULES_VERSION, mode: MULTI_WAVE_MODE,
      status: "EVENT_ID_CONFLICT_REJECTED", contract_code: contract, campaign: activePrior, safety,
    };
  }
  const coreSignature = eventCoreSignature(event);
  if (
    activePrior?.last_event_id === eventId && activePrior?.last_event_core_signature &&
    activePrior.last_event_core_signature !== coreSignature
  ) {
    return {
      version: MULTI_WAVE_VERSION, rules_version: MULTI_WAVE_RULES_VERSION, mode: MULTI_WAVE_MODE,
      status: "EVENT_FACT_REWRITE_REJECTED", contract_code: contract, campaign: activePrior, safety,
    };
  }
  const funding = computeFundingTrajectory(input?.funding, at, config);
  const independence = computeMarketIndependence(input?.external_hourly || {}, at, 24, config);
  const detailCandles = Array.isArray(input?.primary?.one_minute) ? input.primary.one_minute : [];
  const retest = detectPostSweepRetest({ candles: detailCandles, sweep: event?.liquidity_sweep, asOf: at });
  const prospective = prospectiveDirection(event, retest, opportunity);
  const lockedDirection = ["LONG", "SHORT"].includes(activePrior?.direction) ? activePrior.direction : null;
  if (lockedDirection && ["LONG", "SHORT"].includes(prospective.direction) && prospective.direction !== lockedDirection) {
    return {
      version: MULTI_WAVE_VERSION, rules_version: MULTI_WAVE_RULES_VERSION, mode: MULTI_WAVE_MODE,
      status: "DIRECTION_CONFLICT_FAIL_CLOSED", contract_code: contract, campaign: activePrior,
      incoming_direction: prospective.direction, locked_direction: lockedDirection, safety,
    };
  }
  const effectiveDirection = lockedDirection || prospective.direction;
  const evidence = deriveCampaignEvidence({ opportunity, funding_metrics: funding, independence, retest, direction: effectiveDirection });
  const p = priceContext(opportunity);
  const prior = activePrior || defaultCampaign(contract, now, event, p.current_price, prospective.direction, prospective.confidence);
  const priorFailureIds = Array.isArray(prior?.reclaim_failure_event_ids)
    ? prior.reclaim_failure_event_ids.filter((value) => text(value)).slice(-16)
    : [];
  const failureIds = evidence.reclaim_failure_observed === true && !priorFailureIds.includes(eventId)
    ? [...priorFailureIds, eventId].slice(-16)
    : priorFailureIds;
  evidence.exhaustion.repeated_reclaim_failure = failureIds.length >= 2;
  refreshEvidenceCounts(evidence);
  const observationSignature = materialObservationSignature({
    event, price: p, funding, independence, retest, direction: effectiveDirection, evidence,
  });
  if (activePrior?.material_observation_signature === observationSignature) {
    return {
      version: MULTI_WAVE_VERSION,
      rules_version: MULTI_WAVE_RULES_VERSION,
      mode: MULTI_WAVE_MODE,
      status: "DUPLICATE_OBSERVATION_SKIPPED",
      contract_code: contract,
      campaign: activePrior,
      transition: null,
      direction_at_detection: activePrior.direction_at_detection,
      direction_source: "UNCHANGED_MATERIAL_OBSERVATION",
      evidence,
      funding_trajectory: funding,
      market_independence: independence,
      post_sweep_retest: retest,
      safety,
    };
  }
  const next = { ...prior };
  next.prior_phase = prior.current_phase;
  next.direction = effectiveDirection;
  next.direction_at_detection = prior.direction_at_detection ?? prior.direction ?? "DIRECTIONLESS_EVENT";
  next.direction_confidence_at_detection = prior.direction_confidence_at_detection ?? null;
  next.last_observed_ts = at;
  next.last_event_id = eventId;
  next.last_event_ts = eventTs;
  next.last_event_core_signature = coreSignature;
  next.last_data_quality = eventQuality;
  next.material_observation_signature = observationSignature;
  next.reclaim_failure_event_ids = failureIds;
  const phase = prior.current_phase || CAMPAIGN_PHASE.DISCOVERY;
  const directional = next.direction !== "DIRECTIONLESS_EVENT";
  const priorBaseLow = finite(prior?.base_low);
  const priorBaseHigh = finite(prior?.base_high);
  const campaignBaseHeld = next.direction === "LONG"
    ? (priorBaseLow === null || (p.current_price !== null && p.current_price >= priorBaseLow))
    : next.direction === "SHORT"
      ? (priorBaseHigh === null || (p.current_price !== null && p.current_price <= priorBaseHigh))
      : false;
  const structureHeld = evidence?.next_impulse?.structure_not_broken === true && campaignBaseHeld;
  evidence.structure_gate = {
    campaign_base_held: campaignBaseHeld,
    base_low: priorBaseLow,
    base_high: priorBaseHigh,
    current_price: p.current_price,
  };
  const earlyEnough = evidence.early_count >= config.minimum_independent_early_detectors;
  const entryEnough = evidence.early_count >= config.entry_candidate_evidence_min;
  const entryQualityClosed = eventQuality === "OK" && normalizeDataQuality(event?.post_event_current?.status) === "OK";
  const nextWatchEnough = evidence.next_impulse_count >= config.next_impulse_watch_evidence_min;
  const nextEntryEnough = evidence.next_impulse_count >= config.next_impulse_entry_evidence_min && retest?.second_reclaim === true;
  const exhausted = evidence.exhaustion_count >= config.exhaustion_evidence_min;

  if (exhausted && [CAMPAIGN_PHASE.IMPULSE, CAMPAIGN_PHASE.RELOAD_BASE, CAMPAIGN_PHASE.NEXT_IMPULSE_WATCH, CAMPAIGN_PHASE.NEXT_IMPULSE_ENTRY].includes(phase)) {
    next.current_phase = CAMPAIGN_PHASE.EXHAUSTION_WARNING;
  } else if (phase === CAMPAIGN_PHASE.DISCOVERY && earlyEnough) {
    next.current_phase = CAMPAIGN_PHASE.PRE_IMPULSE_WATCH;
  } else if (phase === CAMPAIGN_PHASE.PRE_IMPULSE_WATCH && entryEnough) {
    next.current_phase = CAMPAIGN_PHASE.ENTRY_CANDIDATE;
  } else if (phase === CAMPAIGN_PHASE.ENTRY_CANDIDATE && entryQualityClosed && directional && (
    retest?.second_reclaim === true ||
    (next.direction === "LONG" && event?.funnel?.stage === "ENTRY_TRIGGER_SHADOW")
  )) {
    next.current_phase = CAMPAIGN_PHASE.ENTRY_TRIGGER;
    next.entry_trigger_time = next.last_observed_ts;
    next.entry_trigger_price = p.current_price ?? p.event_close;
    next.wave_index = Math.max(1, Number(prior.wave_index || 0));
  } else if (phase === CAMPAIGN_PHASE.ENTRY_TRIGGER && entryQualityClosed && directional && (favorablePriceMovePct(next.direction, prior.entry_trigger_price, p.current_price) ?? -Infinity) >= config.first_impulse_move_pct) {
    next.current_phase = CAMPAIGN_PHASE.IMPULSE;
    next.impulse_start = next.last_observed_ts;
    next.impulse_start_price = p.current_price;
    next.impulse_peak_price = p.current_price;
    next.impulse_peak_ts = next.last_observed_ts;
  } else if (phase === CAMPAIGN_PHASE.IMPULSE) {
    const peak = finite(prior.impulse_peak_price ?? p.current_price);
    const directionSign = next.direction === "SHORT" ? -1 : 1;
    const improvesPeak = peak !== null && p.current_price !== null && directionSign * (p.current_price - peak) > 0;
    if (improvesPeak) {
      next.impulse_peak_price = p.current_price;
      next.impulse_peak_ts = next.last_observed_ts;
    }
    const peakPrice = finite(next.impulse_peak_price ?? peak);
    const pullback = peakPrice !== null && p.current_price !== null ? Math.abs(pct(peakPrice, p.current_price) ?? 0) : 0;
    const impulseMove = finite(next.impulse_start_price) !== null && peakPrice !== null ? Math.abs(pct(next.impulse_start_price, peakPrice) ?? 0) : 0;
    const retraceFraction = impulseMove > 0 ? pullback / impulseMove : 0;
    if (structureHeld && pullback >= config.reload_min_pullback_pct && retraceFraction <= config.reload_max_retracement_fraction) {
      next.current_phase = CAMPAIGN_PHASE.RELOAD_BASE;
      next.base_start = next.last_observed_ts;
      next.base_low = p.event_low ?? next.base_low;
      next.base_high = p.event_high ?? next.base_high;
      next.completed_wave_count = Math.max(Number(prior.completed_wave_count || 0), Number(prior.wave_index || 1));
    }
  } else if (phase === CAMPAIGN_PHASE.RELOAD_BASE && structureHeld && nextWatchEnough) {
    next.current_phase = CAMPAIGN_PHASE.NEXT_IMPULSE_WATCH;
  } else if (phase === CAMPAIGN_PHASE.NEXT_IMPULSE_WATCH && entryQualityClosed && directional && nextEntryEnough) {
    next.current_phase = CAMPAIGN_PHASE.NEXT_IMPULSE_ENTRY;
    next.entry_trigger_time = next.last_observed_ts;
    next.entry_trigger_price = p.current_price;
    next.wave_index = Math.max(1, Number(prior.wave_index || 1)) + 1;
    // A new wave must not inherit impulse timestamps/prices from the prior wave.
    next.impulse_start = null;
    next.impulse_start_price = null;
    next.impulse_peak_price = null;
    next.impulse_peak_ts = null;
  } else if (phase === CAMPAIGN_PHASE.NEXT_IMPULSE_ENTRY && entryQualityClosed && directional && (favorablePriceMovePct(next.direction, prior.entry_trigger_price, p.current_price) ?? -Infinity) >= config.next_impulse_move_pct) {
    next.current_phase = CAMPAIGN_PHASE.IMPULSE;
    next.impulse_start = next.last_observed_ts;
    next.impulse_start_price = p.current_price;
    next.impulse_peak_price = p.current_price;
    next.impulse_peak_ts = next.last_observed_ts;
  } else if (phase === CAMPAIGN_PHASE.EXHAUSTION_WARNING && evidence.exhaustion_count >= config.exhaustion_evidence_min + 1) {
    next.current_phase = CAMPAIGN_PHASE.EDGE_SPENT;
  } else if (phase === CAMPAIGN_PHASE.EDGE_SPENT && evidence.exhaustion_count >= config.exhaustion_evidence_min) {
    next.current_phase = CAMPAIGN_PHASE.CLOSED;
    next.campaign_end = next.last_observed_ts;
  }

  // Never invent a direction after the fact. A directionless event can only
  // become directional when a later *prospective* observation contains an
  // explicit direction or a completed sweep-retest sequence.
  if (!directional && [CAMPAIGN_PHASE.ENTRY_TRIGGER, CAMPAIGN_PHASE.IMPULSE, CAMPAIGN_PHASE.NEXT_IMPULSE_ENTRY].includes(next.current_phase)) {
    next.current_phase = phase;
  }

  const entryScenarioAnchor = buildEntryScenarioAnchor(next, config);
  const chase = computeChaseRisk({ prior: next, opportunity, phase: next.current_phase, config });
  const lead = computeLeadTimeMetrics({ prior, opportunity, current: next });
  const transition = next.current_phase !== phase;
  const priorHistory = Array.isArray(prior?.transition_history) ? prior.transition_history.slice(-64) : [];
  if (transition) {
    next.transition_history = [
      ...priorHistory.slice(-63),
      {
        from: phase,
        to: next.current_phase,
        observed_ts: next.last_observed_ts,
        event_id: next.last_event_id,
        wave_index: Number(next.wave_index || 0),
        evidence_keys: [
          ...(Array.isArray(evidence?.early_keys) ? evidence.early_keys : []),
          ...(Array.isArray(evidence?.next_impulse_keys) ? evidence.next_impulse_keys : []),
          ...(Array.isArray(evidence?.exhaustion_keys) ? evidence.exhaustion_keys : []),
        ].slice(0, 16),
        lead_time_minutes: lead?.lead_time_minutes ?? null,
        chase_risk_active: chase?.active === true,
      },
    ].slice(-64);
  } else {
    next.transition_history = priorHistory;
  }
  return {
    version: MULTI_WAVE_VERSION,
    rules_version: MULTI_WAVE_RULES_VERSION,
    mode: MULTI_WAVE_MODE,
    status: "SHADOW_CAMPAIGN_EVALUATED",
    contract_code: contract,
    campaign: next,
    transition: transition ? { from: phase, to: next.current_phase, observed_ts: next.last_observed_ts } : null,
    direction_at_detection: next.direction_at_detection,
    current_direction: next.direction,
    direction_source: lockedDirection ? "IMMUTABLE_CAMPAIGN_DIRECTION" : prospective.source,
    evidence,
    entry_scenario_anchor: entryScenarioAnchor,
    funding_trajectory: funding,
    market_independence: independence,
    post_sweep_retest: retest,
    chase_risk: chase,
    lead_time: lead,
    campaign_context: {
      basis_before: finite(event?.spot_perp_basis?.htx_basis_pct),
      flow_before: finite(event?.market_flow?.delta),
      oi_before: finite(event?.oi_flush_rebuild?.peak_oi ?? event?.oi_flush_rebuild?.oi_peak),
    },
    next_impulse_detector: {
      status: evidence.status,
      continuation_evidence: evidence.next_impulse_keys,
      continuation_count: evidence.next_impulse_count,
      exhaustion_evidence: evidence.exhaustion_keys,
      exhaustion_count: evidence.exhaustion_count,
      decision_signal: false,
    },
    safety,
  };
}
