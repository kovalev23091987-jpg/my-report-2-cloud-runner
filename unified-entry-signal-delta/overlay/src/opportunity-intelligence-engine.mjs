import { buildClosedMinuteDecomposition } from "./closed-minute-decomposition.mjs";

export const OPPORTUNITY_VERSION = "3.9.1-opportunity-integrity-hardening-shadow";
export const OPPORTUNITY_SCHEMA_VERSION = "3.9-opportunity-intelligence-shadow";
export const OPPORTUNITY_RULES_VERSION = "opportunity-effort-result-v1";
export const OPPORTUNITY_INTEGRITY_RULES_VERSION = "opportunity-integrity-v2";
export const OPPORTUNITY_MODE = "OPPORTUNITY_INTELLIGENCE_SHADOW_NO_EXECUTION";

export const DATA_STATUS = Object.freeze({
  OK: "OK",
  PARTIAL: "PARTIAL",
  STALE: "STALE",
  MISSING: "MISSING",
  CONFLICTING: "CONFLICTING",
});

export const TIMEFRAME_MS = Object.freeze({
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "1d": 24 * 60 * 60_000,
});

export const OUTCOME_HORIZONS = Object.freeze({
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "12h": 12 * 60 * 60_000,
  "24h": 24 * 60 * 60_000,
  "3d": 3 * 24 * 60 * 60_000,
  "7d": 7 * 24 * 60 * 60_000,
});

export const DEFAULT_OPPORTUNITY_CONFIG = Object.freeze({
  rolling_lookback: 20,
  minimum_history: 8,
  volume_ratio_median_watch: 3,
  extreme_volume_ratio_review: 5,
  body_range_max: 0.35,
  wick_range_min: 0.5,
  cross_exchange_ratio_min: 2.5,
  max_events_per_analysis: 8,
  max_stop_pools: 12,
  equal_level_tolerance_pct: 0.15,
  sweep_reclaim_max_bars: 12,
  oi_flush_min_pct: 5,
  oi_rebuild_min_pct: 3,
  chase_risk_pct: 8,
  missed_opportunity_mfe_pct: 5,
  neutral_return_band_pct: 1,
  control_sample_modulus: 5,
  max_scanned_signals_per_timeframe: 512,
  episode_link_gap_ms: 60 * 60_000,
  max_episode_span_ms: 24 * 60 * 60_000,
  control_maturity_ms: 7 * 24 * 60 * 60_000,
  control_exclusion_ms: 24 * 60 * 60_000,
  direction_lock_max_lag_ms: 10 * 60_000,
});

const EVENT_CONTEXT_ALIGNMENT_TOLERANCE_MS = 60_000;
// HTX linear-swap daily candles roll at 00:00 Asia/Shanghai (16:00 UTC).
// Keep this source-specific offset explicit: generic callers still default to
// the Unix/UTC grid and cannot make arbitrary misaligned candles admissible.
const HTX_DAILY_ALIGNMENT_OFFSET_MS = 16 * 60 * 60 * 1000;

function boundedNumber(value, fallback, low, high, { integer = false } = {}) {
  const parsed = finite(value);
  const selected = parsed === null ? fallback : parsed;
  const bounded = clamp(selected, low, high);
  return integer ? Math.round(bounded) : bounded;
}

function normalizedConfig(overrides = {}) {
  const rolling = boundedNumber(overrides?.rolling_lookback, DEFAULT_OPPORTUNITY_CONFIG.rolling_lookback, 8, 200, { integer: true });
  return Object.freeze({
    rolling_lookback: rolling,
    minimum_history: boundedNumber(overrides?.minimum_history, DEFAULT_OPPORTUNITY_CONFIG.minimum_history, 5, rolling, { integer: true }),
    volume_ratio_median_watch: boundedNumber(overrides?.volume_ratio_median_watch, DEFAULT_OPPORTUNITY_CONFIG.volume_ratio_median_watch, 1, 100),
    extreme_volume_ratio_review: boundedNumber(overrides?.extreme_volume_ratio_review, DEFAULT_OPPORTUNITY_CONFIG.extreme_volume_ratio_review, 1, 200),
    body_range_max: boundedNumber(overrides?.body_range_max, DEFAULT_OPPORTUNITY_CONFIG.body_range_max, 0, 1),
    wick_range_min: boundedNumber(overrides?.wick_range_min, DEFAULT_OPPORTUNITY_CONFIG.wick_range_min, 0, 1),
    cross_exchange_ratio_min: boundedNumber(overrides?.cross_exchange_ratio_min, DEFAULT_OPPORTUNITY_CONFIG.cross_exchange_ratio_min, 1, 100),
    max_events_per_analysis: boundedNumber(overrides?.max_events_per_analysis, DEFAULT_OPPORTUNITY_CONFIG.max_events_per_analysis, 1, 8, { integer: true }),
    max_stop_pools: boundedNumber(overrides?.max_stop_pools, DEFAULT_OPPORTUNITY_CONFIG.max_stop_pools, 1, 12, { integer: true }),
    equal_level_tolerance_pct: boundedNumber(overrides?.equal_level_tolerance_pct, DEFAULT_OPPORTUNITY_CONFIG.equal_level_tolerance_pct, 0.01, 5),
    sweep_reclaim_max_bars: boundedNumber(overrides?.sweep_reclaim_max_bars, DEFAULT_OPPORTUNITY_CONFIG.sweep_reclaim_max_bars, 1, 24, { integer: true }),
    oi_flush_min_pct: boundedNumber(overrides?.oi_flush_min_pct, DEFAULT_OPPORTUNITY_CONFIG.oi_flush_min_pct, 0.1, 100),
    oi_rebuild_min_pct: boundedNumber(overrides?.oi_rebuild_min_pct, DEFAULT_OPPORTUNITY_CONFIG.oi_rebuild_min_pct, 0.1, 100),
    chase_risk_pct: boundedNumber(overrides?.chase_risk_pct, DEFAULT_OPPORTUNITY_CONFIG.chase_risk_pct, 0.1, 100),
    missed_opportunity_mfe_pct: boundedNumber(overrides?.missed_opportunity_mfe_pct, DEFAULT_OPPORTUNITY_CONFIG.missed_opportunity_mfe_pct, 0.1, 100),
    neutral_return_band_pct: boundedNumber(overrides?.neutral_return_band_pct, DEFAULT_OPPORTUNITY_CONFIG.neutral_return_band_pct, 0, 20),
    control_sample_modulus: boundedNumber(overrides?.control_sample_modulus, DEFAULT_OPPORTUNITY_CONFIG.control_sample_modulus, 1, 100, { integer: true }),
    max_scanned_signals_per_timeframe: boundedNumber(overrides?.max_scanned_signals_per_timeframe, DEFAULT_OPPORTUNITY_CONFIG.max_scanned_signals_per_timeframe, 32, 512, { integer: true }),
    episode_link_gap_ms: boundedNumber(overrides?.episode_link_gap_ms, DEFAULT_OPPORTUNITY_CONFIG.episode_link_gap_ms, TIMEFRAME_MS["15m"], TIMEFRAME_MS["4h"], { integer: true }),
    max_episode_span_ms: boundedNumber(overrides?.max_episode_span_ms, DEFAULT_OPPORTUNITY_CONFIG.max_episode_span_ms, TIMEFRAME_MS["1h"], TIMEFRAME_MS["1d"], { integer: true }),
    control_maturity_ms: boundedNumber(overrides?.control_maturity_ms, DEFAULT_OPPORTUNITY_CONFIG.control_maturity_ms, OUTCOME_HORIZONS["7d"], 30 * TIMEFRAME_MS["1d"], { integer: true }),
    control_exclusion_ms: boundedNumber(overrides?.control_exclusion_ms, DEFAULT_OPPORTUNITY_CONFIG.control_exclusion_ms, TIMEFRAME_MS["1h"], OUTCOME_HORIZONS["7d"], { integer: true }),
    direction_lock_max_lag_ms: boundedNumber(overrides?.direction_lock_max_lag_ms, DEFAULT_OPPORTUNITY_CONFIG.direction_lock_max_lag_ms, TIMEFRAME_MS["1m"], TIMEFRAME_MS["1h"], { integer: true }),
  });
}

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function text(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function mean(values) {
  const xs = values.filter(Number.isFinite);
  return xs.length ? xs.reduce((sum, value) => sum + value, 0) / xs.length : null;
}

function median(values) {
  const xs = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!xs.length) return null;
  const middle = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[middle] : (xs[middle - 1] + xs[middle]) / 2;
}

function pctChange(from, to) {
  const a = finite(from);
  const b = finite(to);
  return a !== null && b !== null && a !== 0 ? ((b / a) - 1) * 100 : null;
}

function ratio(numerator, denominator) {
  const a = finite(numerator);
  const b = finite(denominator);
  return a !== null && b !== null && b > 0 ? a / b : null;
}

function timestamp(value) {
  const n = finite(value);
  if (n === null || n <= 0) return null;
  return n < 10_000_000_000 ? Math.round(n * 1000) : Math.round(n);
}

function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

function compactUnique(values) {
  return [...new Set(values.filter(Boolean))];
}

function volumeOf(row) {
  for (const candidate of [
    row?.turnover_usdt,
    row?.volume_quote,
    row?.quote_volume,
    row?.volume,
    row?.volume_base,
    row?.volume_contracts,
  ]) {
    const n = finite(candidate);
    if (n !== null && n >= 0) return n;
  }
  return null;
}

function sameCandle(a, b) {
  return [
    "open", "high", "low", "close", "volume", "trade_count",
    "volume_contracts", "volume_base", "turnover_usdt",
  ].every((key) => {
    const x = finite(a?.[key]);
    const y = finite(b?.[key]);
    return x === y;
  });
}

export function safetyEnvelope() {
  return {
    shadow_only: true,
    data_collection_only: true,
    classification_is_probability: false,
    live_probability: null,
    live_signal: false,
    validated_signal: false,
    decision_layer_changed: false,
    strategy_weights_changed: false,
    fixed_weights_35_30_20_15_unchanged: true,
    telegram_started: false,
    trading_execution: false,
    automatic_weight_tuning: false,
    guaranteed_levels_generated: false,
  };
}

export function normalizeCandleSeries(
  rows,
  {
    duration_ms,
    now = Date.now(),
    stale_after_ms = null,
    source = null,
    alignment_offset_ms = 0,
  } = {},
) {
  const suppliedRows = Array.isArray(rows) ? rows : [];
  const boundedRows = suppliedRows.slice(-5000);
  const duration = finite(duration_ms);
  if (duration === null || duration <= 0) {
    return {
      status: DATA_STATUS.MISSING,
      candles: [],
      error: "INVALID_CANDLE_DURATION",
      missing_fields: ["duration_ms"],
      conflict_count: 0,
      rejected_count: 0,
      gap_count: 0,
    };
  }
  const suppliedOffset = finite(alignment_offset_ms);
  if (suppliedOffset === null || suppliedOffset < 0 || suppliedOffset >= duration) {
    return {
      status: DATA_STATUS.MISSING,
      candles: [],
      error: "INVALID_ALIGNMENT_OFFSET",
      missing_fields: ["alignment_offset_ms"],
      conflict_count: 0,
      rejected_count: 0,
      gap_count: 0,
    };
  }
  const alignmentOffset = Math.round(suppliedOffset);

  const grouped = new Map();
  let rejected = 0;
  let unclosed = 0;
  let misaligned = 0;
  const missing = new Set();
  for (const raw of boundedRows) {
    const ts = timestamp(raw?.ts ?? raw?.timestamp ?? raw?.id);
    const open = finite(raw?.open);
    const high = finite(raw?.high);
    const low = finite(raw?.low);
    const close = finite(raw?.close);
    const volume = volumeOf(raw);
    if (ts === null) missing.add("timestamp");
    if (open === null) missing.add("open");
    if (high === null) missing.add("high");
    if (low === null) missing.add("low");
    if (close === null) missing.add("close");
    if (volume === null) missing.add("volume");
    const geometryValid =
      open !== null && high !== null && low !== null && close !== null &&
      high >= Math.max(open, close, low) && low <= Math.min(open, close, high);
    const factuallyClosed = raw?.closed !== false && ts !== null && ts + duration <= now;
    const timestampAligned =
      ts !== null && ((ts - alignmentOffset) % duration + duration) % duration === 0;
    if (ts !== null && !timestampAligned) misaligned += 1;
    if (ts === null || !timestampAligned || !geometryValid || volume === null || volume < 0) {
      rejected += 1;
      continue;
    }
    if (!factuallyClosed) {
      unclosed += 1;
      continue;
    }
    const candle = {
      ts,
      end_ts: ts + duration,
      duration_ms: duration,
      open,
      high,
      low,
      close,
      volume,
      volume_contracts: finite(raw?.volume_contracts),
      volume_base: finite(raw?.volume_base),
      turnover_usdt: finite(raw?.turnover_usdt),
      trade_count: finite(raw?.trade_count),
      source: text(raw?.source) || source,
      closed: true,
    };
    if (!grouped.has(ts)) grouped.set(ts, []);
    grouped.get(ts).push(candle);
  }

  const candles = [];
  let conflicts = 0;
  let duplicatesSuppressed = 0;
  for (const [, group] of grouped) {
    if (group.some((row) => !sameCandle(row, group[0]))) {
      conflicts += 1;
      continue;
    }
    candles.push(group[0]);
    duplicatesSuppressed += Math.max(0, group.length - 1);
  }
  candles.sort((a, b) => a.ts - b.ts);

  let gaps = 0;
  for (let i = 1; i < candles.length; i += 1) {
    if (candles[i].ts - candles[i - 1].ts !== duration) gaps += 1;
  }
  const latestEnd = candles.at(-1)?.end_ts ?? null;
  const staleAfter = finite(stale_after_ms) ?? duration * 2.5;
  const stale = latestEnd !== null && now - latestEnd > staleAfter;
  let status = DATA_STATUS.OK;
  if (!candles.length) status = conflicts ? DATA_STATUS.CONFLICTING : DATA_STATUS.MISSING;
  else if (conflicts) status = DATA_STATUS.CONFLICTING;
  else if (stale) status = DATA_STATUS.STALE;
  else if (rejected || gaps || unclosed) status = DATA_STATUS.PARTIAL;

  return {
    status,
    candles,
    input_count: suppliedRows.length,
    input_truncated: Math.max(0, suppliedRows.length - boundedRows.length),
    source,
    duration_ms: duration,
    alignment_offset_ms: alignmentOffset,
    first_ts: candles[0]?.ts ?? null,
    latest_ts: candles.at(-1)?.ts ?? null,
    latest_end_ts: latestEnd,
    freshness_age_ms: latestEnd === null ? null : Math.max(0, now - latestEnd),
    missing_fields: [...missing],
    conflict_count: conflicts,
    duplicate_suppressed: duplicatesSuppressed,
    rejected_count: rejected,
    unclosed_rejected: unclosed,
    timestamp_misaligned_rejected: misaligned,
    gap_count: gaps,
  };
}

export function aggregateCandles(
  rows,
  targetDurationMs,
  sourceDurationMs = 60_000,
  alignmentOffsetMs = 0,
) {
  const target = finite(targetDurationMs);
  const source = finite(sourceDurationMs);
  const suppliedOffset = finite(alignmentOffsetMs);
  if (
    target === null || source === null || target < source || target % source !== 0 ||
    suppliedOffset === null || suppliedOffset < 0 || suppliedOffset >= target ||
    suppliedOffset % source !== 0
  ) {
    return { candles: [], incomplete_buckets: 0, error: "INVALID_AGGREGATION_DURATION" };
  }
  const alignmentOffset = Math.round(suppliedOffset);
  const expected = target / source;
  const buckets = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const ts = timestamp(row?.ts);
    if (ts === null) continue;
    const bucket = Math.floor((ts - alignmentOffset) / target) * target + alignmentOffset;
    if (!buckets.has(bucket)) buckets.set(bucket, []);
    buckets.get(bucket).push(row);
  }
  const candles = [];
  let incomplete = 0;
  for (const [bucket, values] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
    const xs = values.slice().sort((a, b) => a.ts - b.ts);
    const unique = new Set(xs.map((row) => row.ts));
    const contiguous = xs.every((row, index) => index === 0 || row.ts - xs[index - 1].ts === source);
    if (
      xs.length !== expected || unique.size !== expected || !contiguous ||
      xs[0]?.ts !== bucket || xs.at(-1)?.ts + source !== bucket + target
    ) {
      incomplete += 1;
      continue;
    }
    const volumes = xs.map((row) => finite(row?.volume));
    if (volumes.some((value) => value === null)) {
      incomplete += 1;
      continue;
    }
    candles.push({
      ts: bucket,
      end_ts: bucket + target,
      duration_ms: target,
      open: xs[0].open,
      high: Math.max(...xs.map((row) => row.high)),
      low: Math.min(...xs.map((row) => row.low)),
      close: xs.at(-1).close,
      volume: volumes.reduce((sum, value) => sum + value, 0),
      trade_count: xs.every((row) => finite(row?.trade_count) !== null)
        ? xs.reduce((sum, row) => sum + finite(row.trade_count), 0)
        : null,
      trade_count_complete: xs.every((row) => finite(row?.trade_count) !== null),
      source: xs[0]?.source ?? null,
      closed: true,
      component_bars: xs.length,
    });
  }
  return {
    candles,
    incomplete_buckets: incomplete,
    expected_source_bars: expected,
    alignment_offset_ms: alignmentOffset,
  };
}

export function candleFeatures(candle, history) {
  const open = finite(candle?.open);
  const high = finite(candle?.high);
  const low = finite(candle?.low);
  const close = finite(candle?.close);
  const validGeometry = [open, high, low, close].every((value) => value !== null);
  const range = validGeometry ? high - low : null;
  const body = validGeometry ? Math.abs(close - open) : null;
  const upperWick = validGeometry ? high - Math.max(open, close) : null;
  const lowerWick = validGeometry ? Math.min(open, close) - low : null;
  const historyVolumes = (Array.isArray(history) ? history : [])
    .map((row) => finite(row?.volume))
    .filter((value) => value !== null && value >= 0);
  const med = median(historyVolumes);
  const avg = mean(historyVolumes);
  const deviations = med === null ? [] : historyVolumes.map((value) => Math.abs(value - med));
  const mad = median(deviations);
  const volume = finite(candle?.volume);
  return {
    volume_ratio_median: ratio(volume, med),
    volume_ratio_mean: ratio(volume, avg),
    volume_robust_zscore:
      volume !== null && med !== null && mad !== null && mad > 0
        ? 0.6745 * (volume - med) / mad
        : null,
    rolling_median_volume: med,
    rolling_mean_volume: avg,
    rolling_history_points: historyVolumes.length,
    high_low_range: Number.isFinite(range) ? range : null,
    body_size: Number.isFinite(body) ? body : null,
    body_range_ratio: range !== null && range > 0 ? body / range : null,
    upper_wick: Number.isFinite(upperWick) ? upperWick : null,
    lower_wick: Number.isFinite(lowerWick) ? lowerWick : null,
    upper_wick_ratio: range !== null && range > 0 ? upperWick / range : null,
    lower_wick_ratio: range !== null && range > 0 ? lowerWick / range : null,
    close_location: range !== null && range > 0 ? (close - low) / range : null,
    open_close_pct: pctChange(candle?.open, candle?.close),
    high_low_pct:
      finite(candle?.low) !== null && finite(candle?.low) > 0
        ? (range / finite(candle.low)) * 100
        : null,
  };
}

function scanAnomalousEvents({
  contract,
  exchange = "HTX",
  timeframe,
  candles,
  config = DEFAULT_OPPORTUNITY_CONFIG,
} = {}, resultCap = DEFAULT_OPPORTUNITY_CONFIG.max_scanned_signals_per_timeframe) {
  config = normalizedConfig(config);
  resultCap = boundedNumber(
    resultCap,
    config.max_scanned_signals_per_timeframe,
    1,
    config.max_scanned_signals_per_timeframe,
    { integer: true },
  );
  const lookback = Math.min(
    200,
    Math.max(8, Math.round(finite(config?.rolling_lookback) ?? 20)),
  );
  const minimum = Math.max(5, Math.round(finite(config?.minimum_history) ?? 8));
  const duration = TIMEFRAME_MS[timeframe] ?? null;
  const events = [];
  let totalDetected = 0;
  const xs = Array.isArray(candles) ? candles : [];
  for (let index = minimum; index < xs.length; index += 1) {
    const candle = xs[index];
    const history = xs.slice(Math.max(0, index - lookback), index);
    const contiguous =
      duration !== null &&
      history.length >= minimum &&
      history.every(
        (row, position) =>
          position === 0 ||
          row.ts - history[position - 1].ts === duration,
      ) &&
      candle.ts - history.at(-1).ts === duration;
    if (!contiguous) continue;
    const features = candleFeatures(candle, history);
    if (features.rolling_history_points < minimum) continue;
    const ratioMedian = finite(features.volume_ratio_median);
    const geometry =
      finite(features.body_range_ratio) !== null &&
      (
        features.body_range_ratio <= config.body_range_max ||
        features.upper_wick_ratio >= config.wick_range_min ||
        features.lower_wick_ratio >= config.wick_range_min
      );
    const normalPath = ratioMedian !== null && ratioMedian >= config.volume_ratio_median_watch && geometry;
    const extremeReview = ratioMedian !== null && ratioMedian >= config.extreme_volume_ratio_review;
    if (!normalPath && !extremeReview) continue;
    totalDetected += 1;
    const eventId = [
      "OPP", OPPORTUNITY_RULES_VERSION, text(contract).normalize("NFC"), exchange,
      timeframe, candle.ts, "EFFORT_VS_RESULT",
    ].join(":");
    events.push({
      event_id: eventId,
      symbol: text(contract).normalize("NFC"),
      contract: text(contract).normalize("NFC"),
      exchange,
      timeframe,
      timestamp: candle.ts,
      event_close_ts: candle.end_ts,
      event_type: "ANOMALOUS_EFFORT_VS_RESULT",
      integrity_version: OPPORTUNITY_VERSION,
      integrity_rules_version: OPPORTUNITY_INTEGRITY_RULES_VERSION,
      threshold_path: normalPath ? "WATCH_THRESHOLD" : "EXTREME_OUTLIER_REVIEW",
      ...features,
      candle: {
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
        trade_count: candle.trade_count ?? null,
      },
      data_quality: DATA_STATUS.OK,
      price_result_direction:
        Math.abs(features.open_close_pct ?? 0) <= config.neutral_return_band_pct
          ? "NEUTRAL"
          : features.open_close_pct > 0
            ? "UP"
            : "DOWN",
      direction_at_event: "NONE",
      direction_source: "NO_PRECOMMITTED_DIRECTION",
      direction_locked_ts: null,
      directional_evaluation_eligible: false,
      coverage: "CLOSED_CANDLE_WITH_ROLLING_HISTORY",
      freshness: "HISTORICAL_FACT_AT_TIMESTAMP",
      missing_fields: features.volume_robust_zscore === null ? ["volume_robust_zscore"] : [],
      safety: safetyEnvelope(),
    });
    // The source is scanned oldest-to-newest. Keep the newest bounded set;
    // otherwise a long anomalous history could silently discard the current
    // episode while retaining only stale signals.
    if (events.length > resultCap) events.shift();
  }
  return {
    events: events.sort((a, b) => b.timestamp - a.timestamp || (b.volume_ratio_median ?? 0) - (a.volume_ratio_median ?? 0)),
    total_detected: totalDetected,
    scan_truncated: totalDetected > resultCap,
    result_cap: resultCap,
  };
}

export function detectAnomalousEvents(args = {}) {
  const config = normalizedConfig(args?.config);
  return scanAnomalousEvents(
    { ...args, config },
    config.max_events_per_analysis,
  ).events;
}

function factualExternalHourly(rows) {
  const supplied = Array.isArray(rows) ? rows : [];
  const bounded = supplied.slice(-2000);
  const grouped = new Map();
  let rejected = 0;
  let conflicts = 0;
  for (const raw of bounded) {
    const ts = timestamp(raw?.ts);
    const open = finite(raw?.open);
    const high = finite(raw?.high);
    const low = finite(raw?.low);
    const close = finite(raw?.close);
    const volume = volumeOf(raw);
    const aligned = ts !== null && ts % TIMEFRAME_MS["1h"] === 0;
    const geometry =
      open !== null && high !== null && low !== null && close !== null &&
      high >= Math.max(open, close, low) && low <= Math.min(open, close, high);
    if (!aligned || !geometry || volume === null || volume < 0 || raw?.closed === false) {
      rejected += 1;
      continue;
    }
    const candle = {
      ts,
      end_ts: ts + TIMEFRAME_MS["1h"],
      duration_ms: TIMEFRAME_MS["1h"],
      open,
      high,
      low,
      close,
      volume,
      closed: true,
    };
    if (!grouped.has(ts)) grouped.set(ts, []);
    grouped.get(ts).push(candle);
  }
  const candles = [];
  for (const group of grouped.values()) {
    if (group.some((row) => !sameCandle(row, group[0]))) {
      conflicts += 1;
      continue;
    }
    candles.push(group[0]);
  }
  candles.sort((a, b) => a.ts - b.ts);
  return {
    candles,
    rejected,
    conflicts,
    input_count: supplied.length,
    input_truncated: Math.max(0, supplied.length - bounded.length),
  };
}

function externalSeriesForTimeframe(rows, timeframe) {
  const factual = factualExternalHourly(rows);
  if (factual.conflicts) return { ...factual, candles: [] };
  if (timeframe === "1h") return factual;
  if (timeframe === "4h") return {
    ...factual,
    ...aggregateCandles(factual.candles, TIMEFRAME_MS["4h"], TIMEFRAME_MS["1h"]),
  };
  if (timeframe === "1d") return {
    ...factual,
    ...aggregateCandles(
      factual.candles,
      TIMEFRAME_MS["1d"],
      TIMEFRAME_MS["1h"],
      HTX_DAILY_ALIGNMENT_OFFSET_MS,
    ),
  };
  return { candles: [], rejected: factual.rejected, conflicts: factual.conflicts };
}

export function crossExchangeVerification(event, venueSeries = {}, config = DEFAULT_OPPORTUNITY_CONFIG) {
  config = normalizedConfig(config);
  const rows = [];
  for (const [venue, raw] of Object.entries(venueSeries || {})) {
    if (["BTC_SPOT", "ETH_SPOT"].includes(venue)) continue;
    const validated = externalSeriesForTimeframe(raw, event?.timeframe);
    const series = validated.candles;
    if (validated.conflicts) {
      rows.push({
        venue,
        status: DATA_STATUS.CONFLICTING,
        matched_timestamp: false,
        rejected_rows: validated.rejected,
        conflict_count: validated.conflicts,
      });
      continue;
    }
    const index = series.findIndex((row) => row.ts === event?.timestamp);
    if (index < 0) {
      rows.push({
        venue,
        status: DATA_STATUS.MISSING,
        matched_timestamp: false,
        rejected_rows: validated.rejected,
        conflict_count: validated.conflicts,
      });
      continue;
    }
    const history = series.slice(Math.max(0, index - config.rolling_lookback), index);
    const features = candleFeatures(series[index], history);
    const enough = features.rolling_history_points >= Math.min(config.minimum_history, 8);
    const confirmed = enough && finite(features.volume_ratio_median) !== null &&
      features.volume_ratio_median >= config.cross_exchange_ratio_min;
    rows.push({
      venue,
      status: enough ? DATA_STATUS.OK : DATA_STATUS.PARTIAL,
      matched_timestamp: true,
      volume_ratio_median: features.volume_ratio_median,
      volume_ratio_mean: features.volume_ratio_mean,
      confirmed,
      rejected_rows: validated.rejected,
      conflict_count: validated.conflicts,
      note: "Compared with this venue's own rolling history; absolute venue volumes are not compared.",
    });
  }
  const confirmedVenues = rows.filter((row) => row.confirmed).map((row) => row.venue);
  const comparable = rows.filter((row) => row.matched_timestamp && row.status !== DATA_STATUS.MISSING);
  return {
    primary_exchange: event?.exchange ?? "HTX",
    cross_exchange_confirmed: confirmedVenues.length >= 1,
    single_exchange_anomaly: comparable.length >= 1 && confirmedVenues.length === 0,
    confirmation_unknown_missing_external_data: comparable.length === 0,
    independent_confirming_venues: confirmedVenues,
    comparable_venues: comparable.length,
    status: rows.some((row) => row.status === DATA_STATUS.CONFLICTING)
      ? DATA_STATUS.CONFLICTING
      : comparable.length
        ? DATA_STATUS.OK
        : DATA_STATUS.MISSING,
    venues: rows,
  };
}

function flowWindowForEvent(event, windows, spotSnapshot) {
  const label = event?.timeframe === "1d" ? "24h" : event?.timeframe;
  const window = windows?.[label] || null;
  const flowCandidate = window?.order_flow || null;
  const eventClose = timestamp(event?.event_close_ts);
  const windowEnd = timestamp(window?.synchronized_window_end_ts);
  const transportEligible = Boolean(
    flowCandidate?.transport_window_usable === true ||
    flowCandidate?.legacy_transport_window_usable === true ||
    flowCandidate?.usable === true
  );
  const synchronized = Boolean(
    flowCandidate && transportEligible && eventClose !== null && windowEnd !== null &&
    Math.abs(windowEnd - eventClose) <= EVENT_CONTEXT_ALIGNMENT_TOLERANCE_MS
  );
  const spotWindow = spotSnapshot?.order_flow?.windows?.[label] || null;
  const spotStrict = spotWindow?.factual_cvd || null;
  const spotObservedTs = timestamp(spotSnapshot?.timestamp);
  const spotSynchronized = Boolean(
    spotStrict?.usable === true && eventClose !== null && spotObservedTs !== null &&
    Math.abs((timestamp(spotStrict?.window_end_ts) ?? spotObservedTs) - eventClose) <= EVENT_CONTEXT_ALIGNMENT_TOLERANCE_MS
  );
  const quality = flowCandidate?.cvd_delta_quality || null;
  const flowReliable = Boolean(
    synchronized &&
    quality?.status === "COMPLETE" &&
    quality?.trade_count_exact_match === true &&
    quality?.reliable === true
  );
  const buy = finite(flowCandidate?.taker_buy_usdt);
  const sell = finite(flowCandidate?.taker_sell_usdt);
  const total = buy !== null && sell !== null ? buy + sell : null;
  const spotBuy = finite(spotStrict?.taker_buy_usdt);
  const spotSell = finite(spotStrict?.taker_sell_usdt);
  const spotTotal = spotBuy !== null && spotSell !== null ? spotBuy + spotSell : null;
  return {
    status: flowReliable && total !== null
      ? DATA_STATUS.OK
      : synchronized
        ? DATA_STATUS.PARTIAL
        : DATA_STATUS.MISSING,
    cvd_delta_reliable: flowReliable,
    cvd_delta_quality: flowReliable ? "COMPLETE" : (quality?.status || "UNVERIFIED"),
    raw_trade_count: synchronized ? finite(flowCandidate?.sample_trades) : null,
    factual_1m_trade_count: synchronized ? finite(quality?.factual_1m_trade_count) : null,
    trade_count_completeness_ratio: synchronized ? finite(quality?.completeness_ratio) : null,
    trade_count_exact_match: synchronized ? quality?.trade_count_exact_match === true : false,
    taker_buy_share: flowReliable && total !== null && total > 0 ? buy / total : null,
    taker_sell_share: flowReliable && total !== null && total > 0 ? sell / total : null,
    buy_sell_ratio: flowReliable ? ratio(flowCandidate.taker_buy_usdt, flowCandidate.taker_sell_usdt) : null,
    delta: flowReliable ? finite(flowCandidate.delta_usdt) : null,
    cvd: flowReliable ? finite(flowCandidate.sample_cvd_usdt) : null,
    trade_count: flowReliable ? finite(flowCandidate.sample_trades) : null,
    average_trade_size: flowReliable && total !== null && finite(flowCandidate.sample_trades) > 0 ? total / finite(flowCandidate.sample_trades) : null,
    large_trades: null,
    perp_flow: flowReliable ? flowCandidate : null,
    perp_flow_raw_sample: synchronized ? {
      taker_buy_usdt: buy,
      taker_sell_usdt: sell,
      delta_usdt: finite(flowCandidate?.raw_sample_diagnostic?.delta_usdt ?? flowCandidate?.delta_usdt),
      sample_cvd_usdt: finite(flowCandidate?.raw_sample_diagnostic?.sample_cvd_usdt ?? flowCandidate?.sample_cvd_usdt),
      sample_trades: finite(flowCandidate?.raw_sample_diagnostic?.sample_trades ?? flowCandidate?.sample_trades),
      quality,
    } : null,
    spot_flow: spotSynchronized && spotTotal !== null ? {
      taker_buy_share: spotTotal > 0 ? spotBuy / spotTotal : null,
      taker_sell_share: spotTotal > 0 ? spotSell / spotTotal : null,
      delta: finite(spotStrict.delta_usdt),
      cvd: finite(spotStrict.sample_cvd_usdt),
      trade_count: finite(spotStrict.raw_trade_count ?? spotStrict.trades),
      factual_1m_trade_count: finite(spotStrict.factual_1m_trade_count),
      trade_count_completeness_ratio: finite(spotStrict?.cvd_delta_quality?.completeness_ratio),
      cvd_delta_reliable: true,
    } : null,
    missing_fields: compactUnique([
      synchronized ? null : "timestamp_aligned_perp_flow",
      flowReliable ? null : "complete_perp_raw_trades_vs_factual_1m_trade_count",
      spotSynchronized ? null : "timestamp_aligned_spot_flow",
      spotSynchronized ? null : "complete_spot_raw_trades_vs_factual_1m_trade_count",
      "large_trades",
    ]),
  };
}

function latestAlignedPair(leftRows, rightRows) {
  const left = new Map(
    factualExternalHourly(leftRows).candles.map((row) => [row.ts, row]),
  );
  const right = new Map(
    factualExternalHourly(rightRows).candles.map((row) => [row.ts, row]),
  );
  const common = [...left.keys()].filter((ts) => right.has(ts)).sort((a, b) => a - b);
  const ts = common.at(-1) ?? null;
  return ts === null
    ? null
    : {
        ts,
        end_ts: ts + TIMEFRAME_MS["1h"],
        left: finite(left.get(ts)?.close),
        right: finite(right.get(ts)?.close),
      };
}

export function computeSpotPerpBasis({ futures_snapshot, spot_snapshot, external_hourly = {} } = {}) {
  const htxPerp =
    finite(futures_snapshot?.bbo?.best_bid) !== null && finite(futures_snapshot?.bbo?.best_ask) !== null
      ? (finite(futures_snapshot.bbo.best_bid) + finite(futures_snapshot.bbo.best_ask)) / 2
      : finite(futures_snapshot?.market?.last_price ?? futures_snapshot?.last_price);
  const htxSpot = finite(spot_snapshot?.ticker_24h?.last_price);
  const htxFuturesTs = timestamp(futures_snapshot?.timestamp);
  const htxSpotTs = timestamp(spot_snapshot?.timestamp);
  const htxAligned =
    htxFuturesTs !== null && htxSpotTs !== null &&
    Math.abs(htxFuturesTs - htxSpotTs) <= EVENT_CONTEXT_ALIGNMENT_TOLERANCE_MS;
  const rows = [];
  if (htxPerp !== null && htxSpot !== null && htxSpot > 0 && htxAligned) {
    rows.push({ exchange: "HTX", observed_ts: Math.max(htxFuturesTs, htxSpotTs), perp_price: htxPerp, spot_price: htxSpot, basis_pct: pctChange(htxSpot, htxPerp), status: DATA_STATUS.OK });
  } else {
    rows.push({ exchange: "HTX", observed_ts: null, perp_price: htxPerp, spot_price: htxSpot, basis_pct: null, status: DATA_STATUS.MISSING, timestamp_aligned: htxAligned });
  }
  const okx = latestAlignedPair(external_hourly?.OKX_PERP, external_hourly?.OKX_SPOT);
  if (okx?.left !== null && okx?.right !== null && okx?.right > 0) {
    rows.push({ exchange: "OKX", observed_ts: okx.end_ts, perp_price: okx.left, spot_price: okx.right, basis_pct: pctChange(okx.right, okx.left), status: DATA_STATUS.OK });
  } else {
    rows.push({ exchange: "OKX", observed_ts: null, perp_price: okx?.left ?? null, spot_price: okx?.right ?? null, basis_pct: null, status: DATA_STATUS.MISSING });
  }
  const comparable = rows.map((row) => row.basis_pct).filter(Number.isFinite);
  return {
    status: comparable.length ? DATA_STATUS.OK : DATA_STATUS.MISSING,
    htx_basis_pct: rows.find((row) => row.exchange === "HTX")?.basis_pct ?? null,
    cross_exchange_median_basis_pct: median(comparable),
    venues: rows,
    interpretation: "Negative basis is short-side stress context only; it is not proof of new shorts.",
  };
}

function basisAtEvent(basis, eventCloseTs) {
  const eventClose = timestamp(eventCloseTs);
  const venues = (Array.isArray(basis?.venues) ? basis.venues : []).map((row) => {
    const observed = timestamp(row?.observed_ts);
    const aligned =
      eventClose !== null && observed !== null &&
      Math.abs(observed - eventClose) <= EVENT_CONTEXT_ALIGNMENT_TOLERANCE_MS;
    return aligned
      ? { ...row, timestamp_aligned_to_event: true }
      : { ...row, basis_pct: null, status: DATA_STATUS.MISSING, timestamp_aligned_to_event: false };
  });
  const comparable = venues.map((row) => finite(row?.basis_pct)).filter(Number.isFinite);
  return {
    status: comparable.length ? DATA_STATUS.OK : DATA_STATUS.MISSING,
    event_close_ts: eventClose,
    htx_basis_pct: finite(venues.find((row) => row.exchange === "HTX")?.basis_pct),
    cross_exchange_median_basis_pct: median(comparable),
    venues,
    interpretation: basis?.interpretation || "Basis is timestamped context only.",
  };
}

function priceOiLabel(pricePct, oiPct) {
  const p = finite(pricePct);
  const o = finite(oiPct);
  if (p === null || o === null) return null;
  if (p < 0 && o < 0) return "PRICE_DOWN_OI_DOWN_LONG_FLUSH_OR_DELEVERAGING";
  if (p < 0 && o > 0) return "PRICE_DOWN_OI_UP_POSSIBLE_NEW_SHORTS";
  if (p > 0 && o < 0) return "PRICE_UP_OI_DOWN_SHORT_COVERING";
  if (p > 0 && o > 0) return "PRICE_UP_OI_UP_NEW_LEVERAGE";
  return "FLAT_OR_MIXED";
}

export function classifyPriceOiMatrix(windows = {}) {
  const out = {};
  for (const timeframe of ["5m", "15m", "1h"]) {
    const row = windows?.[timeframe] || null;
    const price = finite(row?.price?.change_pct);
    const oi = finite(row?.open_interest?.contracts?.change_pct ?? row?.open_interest?.value_usdt?.change_pct);
    out[timeframe] = {
      status: row?.price?.usable && row?.open_interest?.usable && price !== null && oi !== null
        ? DATA_STATUS.OK
        : DATA_STATUS.MISSING,
      price_change_pct: price,
      oi_change_pct: oi,
      classification: priceOiLabel(price, oi),
      synchronized_window_start_ts: timestamp(row?.synchronized_window_start_ts),
      synchronized_window_end_ts: timestamp(row?.synchronized_window_end_ts),
      absolute_truth: false,
      missing_fields: compactUnique([price === null ? "price_change_pct" : null, oi === null ? "oi_change_pct" : null]),
    };
  }
  return out;
}

function priceOiAtEvent(matrix, eventCloseTs) {
  const eventClose = timestamp(eventCloseTs);
  return Object.fromEntries(
    Object.entries(matrix || {}).map(([timeframe, row]) => {
      const windowEnd = timestamp(row?.synchronized_window_end_ts);
      const aligned =
        eventClose !== null && windowEnd !== null &&
        Math.abs(windowEnd - eventClose) <= EVENT_CONTEXT_ALIGNMENT_TOLERANCE_MS;
      return [
        timeframe,
        aligned
          ? { ...row, timestamp_aligned_to_event: true }
          : {
              ...row,
              status: DATA_STATUS.MISSING,
              price_change_pct: null,
              oi_change_pct: null,
              classification: null,
              timestamp_aligned_to_event: false,
              missing_fields: compactUnique([...(row?.missing_fields || []), "timestamp_aligned_price_oi"]),
            },
      ];
    }),
  );
}

function fundingAtEvent(funding, eventCloseTs) {
  const eventClose = timestamp(eventCloseTs);
  const history = Array.isArray(funding?.recent_history) ? funding.recent_history : [];
  const factual = history
    .map((row) => ({
      ...row,
      funding_time_ts: timestamp(row?.funding_time_ts ?? row?.funding_time),
      funding_rate: finite(row?.funding_rate),
    }))
    .filter((row) => row.funding_time_ts !== null && row.funding_time_ts <= eventClose && row.funding_rate !== null)
    .sort((a, b) => a.funding_time_ts - b.funding_time_ts)
    .at(-1);
  const maximumAgeMs = Math.max(
    12 * TIMEFRAME_MS["1h"],
    (finite(funding?.derived_settlement_interval_hours) ?? 0) * 2 * TIMEFRAME_MS["1h"],
  );
  if (!factual || eventClose - factual.funding_time_ts > maximumAgeMs) {
    return {
      status: DATA_STATUS.MISSING,
      funding_rate: null,
      funding_time_ts: null,
      event_close_ts: eventClose,
      missing_fields: ["historical_funding_at_or_before_event"],
    };
  }
  return {
    status: DATA_STATUS.OK,
    funding_rate: factual.funding_rate,
    funding_time_ts: factual.funding_time_ts,
    event_close_ts: eventClose,
    source: "HTX_REALIZED_FUNDING_HISTORY",
    missing_fields: [],
  };
}

function fundingOutcomeContext(event, funding, targetTs) {
  const eventClose = timestamp(event?.event_close_ts);
  const target = timestamp(targetTs);
  const history = Array.isArray(funding?.recent_history) ? funding.recent_history : [];
  const points = history
    .map((row) => ({
      ts: timestamp(row?.funding_time_ts ?? row?.funding_time),
      rate: finite(row?.funding_rate),
    }))
    .filter((row) => row.ts !== null && row.rate !== null)
    .sort((a, b) => a.ts - b.ts);
  const maximumAgeMs = Math.max(
    12 * TIMEFRAME_MS["1h"],
    (finite(funding?.derived_settlement_interval_hours) ?? 0) * 2 * TIMEFRAME_MS["1h"],
  );
  const after = points.filter((row) => target !== null && row.ts <= target).at(-1) || null;
  const afterUsable = after && target - after.ts <= maximumAgeMs;
  const during = points.filter((row) => eventClose !== null && target !== null && row.ts > eventClose && row.ts <= target);
  const beforeRate = finite(event?.funding_at_event?.funding_rate);
  return {
    status: beforeRate !== null && afterUsable ? DATA_STATUS.OK : DATA_STATUS.PARTIAL,
    before: beforeRate === null ? null : {
      rate: beforeRate,
      ts: timestamp(event?.funding_at_event?.funding_time_ts),
    },
    during: during.length ? {
      count: during.length,
      first_rate: during[0].rate,
      last_rate: during.at(-1).rate,
      minimum_rate: Math.min(...during.map((row) => row.rate)),
      maximum_rate: Math.max(...during.map((row) => row.rate)),
    } : null,
    after: afterUsable ? { rate: after.rate, ts: after.ts } : null,
    missing_fields: compactUnique([
      beforeRate === null ? "funding_before" : null,
      during.length ? null : "funding_during",
      afterUsable ? null : "funding_after",
    ]),
  };
}

function oiHistoryAtEvent(rows, eventCloseTs) {
  const eventClose = timestamp(eventCloseTs);
  if (eventClose === null) return [];
  const start = eventClose - 24 * TIMEFRAME_MS["1h"];
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({ ...row, ts: timestamp(row?.ts), volume: finite(row?.volume) }))
    .filter((row) => row.ts !== null && row.volume !== null && row.ts >= start && row.ts <= eventClose)
    .sort((a, b) => a.ts - b.ts)
    .slice(-30);
}

function nearestOiAtOrBefore(series, target) {
  let selected = null;
  for (const row of Array.isArray(series) ? series : []) {
    if (finite(row?.ts) !== null && row.ts <= target && finite(row?.volume) !== null) selected = row;
    else if (row?.ts > target) break;
  }
  return selected;
}

export function detectOiFlushRebuild({ oi_series = [], price_hourly = [], funding = null, config = DEFAULT_OPPORTUNITY_CONFIG } = {}) {
  config = normalizedConfig(config);
  const oi = (Array.isArray(oi_series) ? oi_series : [])
    .filter((row) => finite(row?.ts) !== null && finite(row?.volume) !== null)
    .sort((a, b) => a.ts - b.ts)
    .slice(-30);
  if (oi.length < 4) {
    return { status: DATA_STATUS.MISSING, setup_shadow: false, missing_fields: ["oi_hourly_history"] };
  }
  let peakIndex = 0;
  let best = null;
  for (let i = 1; i < oi.length; i += 1) {
    if (oi[i - 1].volume > oi[peakIndex].volume) peakIndex = i - 1;
    const flush = pctChange(oi[peakIndex].volume, oi[i].volume);
    if (flush !== null && flush <= -Math.abs(config.oi_flush_min_pct)) {
      if (!best || flush < best.flush_pct) best = { peakIndex, minIndex: i, flush_pct: flush };
    }
  }
  if (!best) {
    return { status: DATA_STATUS.OK, detected: false, setup_shadow: false, missing_fields: [] };
  }
  const after = oi.slice(best.minIndex + 1);
  const rebuilt = after.reduce((chosen, row) => !chosen || row.volume > chosen.volume ? row : chosen, null);
  const before = oi[best.peakIndex];
  const minimum = oi[best.minIndex];
  const rebuildPct = rebuilt ? pctChange(minimum.volume, rebuilt.volume) : null;
  const priceByTs = new Map((Array.isArray(price_hourly) ? price_hourly : []).map((row) => [row.ts, row]));
  const minPrice = priceByTs.get(minimum.ts)?.close ?? null;
  const rebuildPrice = rebuilt ? priceByTs.get(rebuilt.ts)?.close ?? null : null;
  const priceDuringRebuild = pctChange(minPrice, rebuildPrice);
  const reclaim = priceDuringRebuild !== null && priceDuringRebuild > 0;
  const fundingRate = finite(funding?.current?.funding_rate ?? funding?.funding_rate ?? funding?.rate);
  const negativeFunding = fundingRate !== null && fundingRate < 0;
  const rebuildDetected = rebuildPct !== null && rebuildPct >= config.oi_rebuild_min_pct;
  const structuralSetup = Boolean(rebuildDetected && reclaim);
  return {
    status: DATA_STATUS.OK,
    detected: true,
    oi_before: before.volume,
    oi_min: minimum.volume,
    oi_after: rebuilt?.volume ?? null,
    oi_flush_pct: best.flush_pct,
    time_to_oi_min_ms: minimum.ts - before.ts,
    oi_rebuild_pct: rebuildPct,
    price_change_during_rebuild_pct: priceDuringRebuild,
    reclaim_detected: reclaim,
    funding_context_status: fundingRate === null ? "UNKNOWN" : "OBSERVED",
    negative_funding_context: negativeFunding,
    funding_rate: fundingRate,
    funding_directional_vote: false,
    setup_shadow: structuralSetup,
    setup_label: structuralSetup ? "POST_FLUSH_REBUILD_RECLAIM_SETUP_SHADOW" : null,
    live_signal: false,
    missing_fields: compactUnique([
      rebuilt ? null : "oi_after",
      minPrice === null || rebuildPrice === null ? "timestamp_aligned_price" : null,
    ]),
  };
}

function averageTrueRange(candles, count = 20) {
  const xs = (Array.isArray(candles) ? candles : []).slice(-count);
  return mean(xs.map((row) => {
    const high = finite(row?.high);
    const low = finite(row?.low);
    return high !== null && low !== null ? high - low : null;
  }));
}

function roundStep(price) {
  if (!Number.isFinite(price) || price <= 0) return null;
  return 10 ** Math.floor(Math.log10(price)) / 10;
}

export function detectStopPools({ candles = [], event = null, liquidation_clusters = [], config = DEFAULT_OPPORTUNITY_CONFIG } = {}) {
  config = normalizedConfig(config);
  const xs = (Array.isArray(candles) ? candles : []).slice(-320);
  if (xs.length < 5) return { status: DATA_STATUS.MISSING, levels: [], nearest: null };
  const current = finite(xs.at(-1)?.close);
  const atr = averageTrueRange(xs, 20);
  const tolerance = Math.max(
    current ? current * (config.equal_level_tolerance_pct / 100) : 0,
    atr ? atr * 0.15 : 0,
  );
  const raw = [];
  for (let i = 2; i < xs.length - 2; i += 1) {
    const row = xs[i];
    if (row.low <= xs[i - 1].low && row.low <= xs[i - 2].low && row.low <= xs[i + 1].low && row.low <= xs[i + 2].low) {
      raw.push({ side: "LOW", level: row.low, type: "SWING_LOW", ts: row.ts, touches: 1, sweep_eligible: true });
    }
    if (row.high >= xs[i - 1].high && row.high >= xs[i - 2].high && row.high >= xs[i + 1].high && row.high >= xs[i + 2].high) {
      raw.push({ side: "HIGH", level: row.high, type: "SWING_HIGH", ts: row.ts, touches: 1, sweep_eligible: true });
    }
  }
  const clusters = [];
  for (const candidate of raw) {
    const existing = clusters.find((row) => row.side === candidate.side && Math.abs(row.level - candidate.level) <= tolerance);
    if (existing) {
      existing.level = (existing.level * existing.touches + candidate.level) / (existing.touches + 1);
      existing.touches += 1;
      existing.type = existing.side === "LOW" ? "EQUAL_LOWS" : "EQUAL_HIGHS";
      existing.last_ts = candidate.ts;
    } else {
      clusters.push({ ...candidate, last_ts: candidate.ts });
    }
  }
  if (event?.candle) {
    clusters.push({ side: "LOW", level: event.candle.low, type: "ANOMALY_LOW", ts: event.timestamp, last_ts: event.timestamp, touches: 1, sweep_eligible: true });
    clusters.push({ side: "HIGH", level: event.candle.high, type: "ANOMALY_HIGH", ts: event.timestamp, last_ts: event.timestamp, touches: 1, sweep_eligible: true });
  }
  const step = roundStep(current);
  if (step) {
    const center = Math.round(current / step) * step;
    for (let offset = -2; offset <= 2; offset += 1) {
      clusters.push({ side: center + offset * step <= current ? "LOW" : "HIGH", level: center + offset * step, type: "ROUND_LEVEL", ts: null, last_ts: null, touches: 0, sweep_eligible: false, exclusion_reason: "CURRENT_PRICE_DERIVED_LEVEL_CANNOT_PROVE_A_HISTORICAL_SWEEP" });
    }
  }
  for (const cluster of Array.isArray(liquidation_clusters) ? liquidation_clusters : []) {
    const level = finite(cluster?.level_price ?? cluster?.price ?? cluster?.level);
    if (level === null) continue;
    clusters.push({
      side: /short/i.test(text(cluster?.side ?? cluster?.direction)) ? "HIGH" : "LOW",
      level,
      type: "PROVIDER_REPORTED_LIQUIDATION_CLUSTER",
      ts: timestamp(cluster?.timestamp ?? cluster?.last_seen_ts),
      last_ts: timestamp(cluster?.timestamp ?? cluster?.last_seen_ts),
      touches: finite(cluster?.persistence_observations) ?? 1,
      provider: text(cluster?.provider) || null,
      source_status: text(cluster?.status ?? cluster?.projected_map_status) || null,
      synthetic: cluster?.synthetic === false ? false : null,
      evidence_eligible: cluster?.provider_evidence_eligible === true,
      sweep_eligible:
        cluster?.provider_evidence_eligible === true &&
        timestamp(cluster?.timestamp ?? cluster?.last_seen_ts) !== null,
    });
  }
  const levels = clusters
    .filter((row) => finite(row.level) !== null && row.level > 0)
    .map((row) => {
      const distance = current && current > 0 ? Math.abs(row.level / current - 1) * 100 : null;
      const score = clamp(
        (row.type.startsWith("EQUAL") ? 35 : 15) +
        Math.min(30, (row.touches || 0) * 10) +
        (row.type === "PROVIDER_REPORTED_LIQUIDATION_CLUSTER" && row.evidence_eligible === true ? 25 : 0) +
        (distance !== null && distance <= 1 ? 20 : distance !== null && distance <= 3 ? 10 : 0),
        0,
        100,
      );
      return {
        ...row,
        distance_from_current_price_pct: distance,
        possible_stop_pool: true,
        crowded_stop_risk_score: score,
        score_is_probability: false,
      };
    })
    .sort((a, b) => b.crowded_stop_risk_score - a.crowded_stop_risk_score || (a.distance_from_current_price_pct ?? Infinity) - (b.distance_from_current_price_pct ?? Infinity))
    .slice(0, config.max_stop_pools);
  return {
    status: levels.length ? DATA_STATUS.OK : DATA_STATUS.MISSING,
    atr,
    tolerance,
    levels,
    nearest: levels.slice().sort((a, b) => (a.distance_from_current_price_pct ?? Infinity) - (b.distance_from_current_price_pct ?? Infinity))[0] || null,
    stop_guidance: {
      mechanical_stop_below_previous_low_allowed: false,
      structural_invalidation_required: true,
      volatility_liquidity_buffer_required: true,
      suggested_position_size: null,
      formula_only: "allowed_risk_usdt / stop_distance_pct",
    },
  };
}

export function detectLiquiditySweep({ candles = [], pools = [], oi_series = [], funding = null, basis = null, config = DEFAULT_OPPORTUNITY_CONFIG } = {}) {
  config = normalizedConfig(config);
  const xs = (Array.isArray(candles) ? candles : []).slice(-320);
  let best = null;
  for (const pool of Array.isArray(pools) ? pools : []) {
    if (pool?.sweep_eligible === false) continue;
    const level = finite(pool?.level);
    if (level === null || !["LOW", "HIGH"].includes(pool?.side)) continue;
    const poolFormedTs = timestamp(pool?.last_ts ?? pool?.ts);
    for (let i = 0; i < xs.length; i += 1) {
      if (poolFormedTs !== null && xs[i].ts <= poolFormedTs) continue;
      const breach = pool.side === "LOW" ? xs[i].low < level : xs[i].high > level;
      if (!breach) continue;
      const end = Math.min(xs.length, i + 1 + config.sweep_reclaim_max_bars);
      let reclaimIndex = -1;
      for (let j = i; j < end; j += 1) {
        const reclaimed = pool.side === "LOW" ? xs[j].close > level : xs[j].close < level;
        if (reclaimed) { reclaimIndex = j; break; }
      }
      const extremeEnd = reclaimIndex >= 0 ? reclaimIndex + 1 : end;
      const extreme = pool.side === "LOW"
        ? Math.min(...xs.slice(i, extremeEnd).map((row) => row.low))
        : Math.max(...xs.slice(i, extremeEnd).map((row) => row.high));
      const depth = pool.side === "LOW" ? ((level - extreme) / level) * 100 : ((extreme - level) / level) * 100;
      const candidate = {
        pool,
        side: pool.side,
        breach_index: i,
        reclaim_index: reclaimIndex,
        sweep_detected: true,
        sweep_ts: xs[i].ts,
        sweep_depth_pct: depth,
        sweep_duration_ms: (Math.max(i, reclaimIndex >= 0 ? reclaimIndex : i) - i + 1) * (xs[i].duration_ms || 0),
        reclaim_detected: reclaimIndex >= 0,
        reclaim_time_ms: reclaimIndex >= 0 ? xs[reclaimIndex].end_ts - xs[i].ts : null,
        reclaim_strength_pct: reclaimIndex >= 0 ? pctChange(level, xs[reclaimIndex].close) : null,
        subsequent_return_pct: reclaimIndex >= 0 ? pctChange(xs[reclaimIndex].close, xs.at(-1).close) : null,
      };
      if (!best || Number(candidate.reclaim_detected) > Number(best.reclaim_detected) || candidate.sweep_ts > best.sweep_ts) best = candidate;
    }
  }
  if (!best) return { status: DATA_STATUS.OK, sweep_detected: false, reclaim_detected: false, missing_fields: [] };
  const before = nearestOiAtOrBefore(oi_series, best.sweep_ts - 1);
  const during = nearestOiAtOrBefore(oi_series, best.reclaim_index >= 0 ? xs[best.reclaim_index].end_ts : best.sweep_ts);
  const after = nearestOiAtOrBefore(oi_series, xs.at(-1)?.end_ts ?? best.sweep_ts);
  return {
    status: DATA_STATUS.OK,
    ...best,
    oi_before: finite(before?.volume),
    oi_min: finite(during?.volume),
    oi_after: finite(after?.volume),
    oi_flush_pct: pctChange(before?.volume, during?.volume),
    oi_rebuild_pct: pctChange(during?.volume, after?.volume),
    funding: finite(funding?.current?.funding_rate ?? funding?.funding_rate ?? funding?.rate),
    basis_pct: finite(basis?.htx_basis_pct),
    aggressive_flow: null,
    flow_after_reclaim: null,
    missing_fields: compactUnique([
      before && during && after ? null : "timestamp_aligned_oi",
      "timestamp_aligned_aggressive_flow",
      "flow_after_reclaim",
    ]),
    reversal_proven: false,
  };
}

function hypothesis(score = 0, forEvidence = [], against = [], missing = []) {
  return {
    evidence_score: clamp(score, 0, 100),
    confidence: null,
    confidence_status: "UNCALIBRATED_SHADOW_EVIDENCE_NOT_PROBABILITY",
    for: compactUnique(forEvidence),
    against: compactUnique(against),
    missing_evidence: compactUnique(missing),
  };
}

export function classifyCompetingHypotheses({ event, flow, cross_exchange, price_oi, oi_flush_rebuild, sweep, basis } = {}) {
  const weakResult = finite(event?.body_range_ratio) !== null && event.body_range_ratio <= 0.35;
  const lowerClose = finite(event?.close_location) !== null && event.close_location < 0.4;
  const upperClose = finite(event?.close_location) !== null && event.close_location > 0.6;
  const delta = finite(flow?.delta);
  const oi1h = price_oi?.["1h"]?.classification || null;
  const cross = cross_exchange?.cross_exchange_confirmed === true;
  const negativeBasis = finite(basis?.htx_basis_pct) !== null && basis.htx_basis_pct < 0;
  const commonMissing = compactUnique([
    delta === null ? "timestamp_aligned_taker_flow" : null,
    oi1h ? null : "price_oi_1h",
    finite(basis?.htx_basis_pct) === null ? "spot_perp_basis" : null,
  ]);
  return {
    ABSORPTION_ACCUMULATION: hypothesis(
      15 + (weakResult ? 20 : 0) + (upperClose ? 15 : 0) + (delta !== null && delta < 0 ? 20 : 0) + (sweep?.reclaim_detected ? 20 : 0),
      [weakResult ? "HIGH_EFFORT_WEAK_BODY" : null, upperClose ? "CLOSE_RESILIENT_IN_RANGE" : null, delta !== null && delta < 0 ? "SELL_FLOW_PRICE_RESILIENCE_CANDIDATE" : null, sweep?.reclaim_detected ? "LIQUIDITY_RECLAIM" : null],
      [lowerClose ? "CLOSE_NEAR_LOW" : null, oi1h?.includes("PRICE_DOWN_OI_UP") ? "NEW_SHORTS_OR_DISTRIBUTION_CONTEXT" : null],
      commonMissing,
    ),
    DISTRIBUTION: hypothesis(
      15 + (weakResult ? 15 : 0) + (lowerClose ? 20 : 0) + (delta !== null && delta > 0 ? 25 : 0) + (oi1h?.includes("PRICE_DOWN_OI_UP") ? 15 : 0),
      [weakResult ? "HIGH_EFFORT_WEAK_RESULT" : null, lowerClose ? "CLOSE_NEAR_LOW" : null, delta !== null && delta > 0 ? "BUYERS_ABSORBED_WHILE_PRICE_WEAK" : null],
      [upperClose ? "CLOSE_RESILIENT" : null, sweep?.reclaim_detected ? "RECLAIM_PRESENT" : null],
      commonMissing,
    ),
    TWO_WAY_TRANSFER: hypothesis(
      20 + (weakResult ? 20 : 0) + (cross ? 15 : 0) + (event?.upper_wick_ratio >= 0.3 && event?.lower_wick_ratio >= 0.3 ? 25 : 0),
      [weakResult ? "HIGH_TURNOVER_LOW_NET_PROGRESS" : null, cross ? "MULTI_VENUE_ACTIVITY" : null, event?.upper_wick_ratio >= 0.3 && event?.lower_wick_ratio >= 0.3 ? "TWO_SIDED_WICKS" : null],
      [Math.abs(event?.open_close_pct ?? 0) > 8 ? "STRONG_ONE_WAY_RESULT" : null],
      commonMissing,
    ),
    DERIVATIVE_LIQUIDATION_NOISE: hypothesis(
      10 + (oi1h?.includes("OI_DOWN") ? 25 : 0) + (oi_flush_rebuild?.detected ? 20 : 0) + (sweep?.sweep_detected ? 15 : 0) + (negativeBasis ? 10 : 0) + (!cross ? 15 : 0),
      [oi1h?.includes("OI_DOWN") ? "OI_CONTRACTION" : null, oi_flush_rebuild?.detected ? "OI_FLUSH" : null, sweep?.sweep_detected ? "LIQUIDITY_SWEEP" : null, negativeBasis ? "NEGATIVE_BASIS_STRESS" : null, !cross ? "NOT_CROSS_EXCHANGE_CONFIRMED" : null],
      [cross ? "MULTI_VENUE_VOLUME_CONFIRMATION" : null, oi1h?.includes("OI_UP") ? "OI_EXPANSION" : null],
      commonMissing,
    ),
    rule: "All scores are uncalibrated evidence summaries. None is a probability or trading direction.",
  };
}

function relativeStrengthAtWindow(candidate, benchmark, startTs, endTs) {
  const c = new Map((candidate || []).map((row) => [row.ts, row]));
  const b = new Map((benchmark || []).map((row) => [row.ts, row]));
  const startC = c.get(startTs);
  const endC = c.get(endTs);
  const startB = b.get(startTs);
  const endB = b.get(endTs);
  const candidatePct = pctChange(startC?.close, endC?.close);
  const benchmarkPct = pctChange(startB?.close, endB?.close);
  return candidatePct !== null && benchmarkPct !== null ? candidatePct - benchmarkPct : null;
}

function relativeStrengthSinceEvent(event, externalHourly = {}) {
  const eventClose = timestamp(event?.event_close_ts);
  if (eventClose === null || eventClose % TIMEFRAME_MS["1h"] !== 0) {
    return { status: DATA_STATUS.MISSING, vs_btc_pp: null, vs_eth_pp: null, improving: null, missing_fields: ["hour_aligned_event_close"] };
  }
  const candidate = factualExternalHourly(externalHourly?.OKX_SPOT).candles;
  const btc = factualExternalHourly(externalHourly?.BTC_SPOT).candles;
  const eth = factualExternalHourly(externalHourly?.ETH_SPOT).candles;
  const maps = [candidate, btc, eth].map((rows) => new Map(rows.map((row) => [row.ts, row])));
  const startTs = eventClose - TIMEFRAME_MS["1h"];
  const common = [...maps[0].keys()]
    .filter((ts) => ts >= startTs && maps[1].has(ts) && maps[2].has(ts))
    .sort((a, b) => a - b);
  const endTs = common.at(-1) ?? null;
  const complete =
    endTs !== null && maps.every((map) => {
      for (let ts = startTs; ts <= endTs; ts += TIMEFRAME_MS["1h"]) {
        if (!map.has(ts)) return false;
      }
      return true;
    });
  if (!complete || endTs === startTs) {
    return { status: DATA_STATUS.MISSING, vs_btc_pp: null, vs_eth_pp: null, improving: null, missing_fields: ["contiguous_synchronized_candidate_btc_eth_hourly_history"] };
  }
  const vsBtc = relativeStrengthAtWindow(candidate, btc, startTs, endTs);
  const vsEth = relativeStrengthAtWindow(candidate, eth, startTs, endTs);
  return {
    status: vsBtc !== null && vsEth !== null ? DATA_STATUS.OK : DATA_STATUS.MISSING,
    start_ts: startTs,
    end_ts: endTs,
    vs_btc_pp: vsBtc,
    vs_eth_pp: vsEth,
    improving: vsBtc !== null && vsEth !== null ? vsBtc > 0 && vsEth > 0 : null,
    missing_fields: compactUnique([vsBtc === null ? "btc_relative_strength" : null, vsEth === null ? "eth_relative_strength" : null]),
  };
}

function selectOutcomeSeries(seriesByTimeframe, eventCloseTs, targetTs, horizonMs) {
  const diagnostics = [];
  const choices = [
    ["1m", TIMEFRAME_MS["1m"]],
    ["15m", TIMEFRAME_MS["15m"]],
    ["1h", TIMEFRAME_MS["1h"]],
    ["4h", TIMEFRAME_MS["4h"]],
    ["1d", TIMEFRAME_MS["1d"]],
  ];
  for (const [name, duration] of choices) {
    const sourceRows = Array.isArray(seriesByTimeframe?.[name]) ? seriesByTimeframe[name] : [];
    const expectedBars = horizonMs % duration === 0 ? horizonMs / duration : null;
    if (!sourceRows.length || expectedBars === null || expectedBars < 1) {
      diagnostics.push({ timeframe: name, expected_bars: expectedBars, observed_bars: 0, complete: false, reason: "SOURCE_EMPTY_OR_INCOMPATIBLE_DURATION" });
      continue;
    }
    const rows = sourceRows
      .map((row) => ({ ...row, ts: timestamp(row?.ts), end_ts: timestamp(row?.end_ts) }))
      .filter((row) => row.ts !== null && row.end_ts !== null)
      .sort((a, b) => a.ts - b.ts || a.end_ts - b.end_ts);
    const relevant = rows.filter((row) => row.ts >= eventCloseTs && row.end_ts <= targetTs);
    const exactStart = relevant[0]?.ts === eventCloseTs;
    const exactEnd = relevant.at(-1)?.end_ts === targetTs;
    const exactDurations = relevant.every((row) => row.end_ts - row.ts === duration && row.duration_ms === duration);
    const contiguous = relevant.every((row, index) => index === 0 || row.ts === relevant[index - 1].end_ts);
    const unique = new Set(relevant.map((row) => row.ts)).size === relevant.length;
    const factualGeometry = relevant.every((row) => {
      const open = finite(row?.open);
      const high = finite(row?.high);
      const low = finite(row?.low);
      const close = finite(row?.close);
      const volume = finite(row?.volume);
      return row?.closed !== false && open !== null && high !== null && low !== null && close !== null &&
        volume !== null && volume >= 0 && high >= Math.max(open, close, low) && low <= Math.min(open, close, high);
    });
    const complete =
      relevant.length === expectedBars && exactStart && exactEnd &&
      exactDurations && contiguous && unique && factualGeometry;
    const diagnostic = {
      timeframe: name,
      expected_bars: expectedBars,
      observed_bars: relevant.length,
      coverage_pct: expectedBars > 0 ? Math.min(100, (relevant.length / expectedBars) * 100) : 0,
      exact_start: exactStart,
      exact_end: exactEnd,
      exact_durations: exactDurations,
      contiguous,
      unique_timestamps: unique,
      factual_geometry: factualGeometry,
      available_from_ts: rows[0]?.ts ?? null,
      available_through_ts: rows.at(-1)?.end_ts ?? null,
      complete,
      reason: complete ? null : "INCOMPLETE_EXACT_FUTURE_TRAJECTORY",
    };
    diagnostics.push(diagnostic);
    if (complete) return { timeframe: name, duration_ms: duration, rows: relevant, diagnostic, diagnostics };
  }
  return { timeframe: null, duration_ms: null, rows: [], diagnostic: null, diagnostics };
}

export function computePostEventOutcome({
  event,
  horizon,
  series_by_timeframe,
  external_hourly = {},
  funding = null,
  funnel_stage = null,
  as_of_ts = Date.now(),
  config = DEFAULT_OPPORTUNITY_CONFIG,
} = {}) {
  config = normalizedConfig(config);
  const horizonMs = OUTCOME_HORIZONS[horizon];
  const eventClose = timestamp(event?.event_close_ts);
  const reference = finite(event?.candle?.close);
  if (!horizonMs || eventClose === null || reference === null) {
    return { status: DATA_STATUS.MISSING, horizon, missing_fields: ["event_reference"] };
  }
  const targetTs = eventClose + horizonMs;
  const observedTs = timestamp(as_of_ts);
  if (observedTs === null || observedTs < targetTs) {
    return {
      status: DATA_STATUS.MISSING,
      horizon,
      target_ts: targetTs,
      as_of_ts: observedTs,
      trajectory_complete: false,
      retryable: true,
      no_confirmed_historical_data: false,
      missing_fields: ["future_horizon_not_yet_closed"],
    };
  }
  const selected = selectOutcomeSeries(series_by_timeframe, eventClose, targetTs, horizonMs);
  if (!selected.timeframe) {
    return {
      status: DATA_STATUS.MISSING,
      horizon,
      target_ts: targetTs,
      as_of_ts: observedTs,
      trajectory_complete: false,
      trajectory_diagnostics: selected.diagnostics,
      retryable: true,
      missing_fields: ["exact_timestamped_post_event_candles"],
      no_confirmed_historical_data: false,
    };
  }
  const rows = selected.rows;
  const close = rows.at(-1).close;
  const high = Math.max(...rows.map((row) => row.high));
  const low = Math.min(...rows.map((row) => row.low));
  const returnPct = pctChange(reference, close);
  const maxUpExcursion = pctChange(reference, high);
  const maxDownExcursion = pctChange(reference, low);
  const totalVolume = rows.every((row) => finite(row.volume) !== null)
    ? rows.reduce((sum, row) => sum + row.volume, 0)
    : null;
  // Recompute from the immutable factual candle. A derived value inside
  // event_json must never be able to rewrite the post-event baseline.
  const eventMoveRaw = pctChange(event?.candle?.open, event?.candle?.close);
  const eventMove = eventMoveRaw === null ? null : Math.abs(eventMoveRaw);
  const afterMove = Math.abs(returnPct ?? 0);
  const eventEase = ratio(eventMove, event?.candle?.volume);
  const afterEase = ratio(afterMove, totalVolume);
  const eventDurationHours =
    finite(event?.event_close_ts) !== null &&
    finite(event?.timestamp) !== null
      ? (event.event_close_ts - event.timestamp) / TIMEFRAME_MS["1h"]
      : null;
  const horizonHours = horizonMs / TIMEFRAME_MS["1h"];
  const eventVolumePerHour = ratio(event?.candle?.volume, eventDurationHours);
  const afterVolumePerHour = ratio(totalVolume, horizonHours);
  const supplyExhaustion =
    afterVolumePerHour !== null && eventVolumePerHour !== null &&
    afterVolumePerHour < eventVolumePerHour &&
    eventMove !== null && afterMove > eventMove * 1.5 &&
    afterEase !== null && eventEase !== null && afterEase > eventEase;
  const hourlyCandidate = external_hourly?.OKX_SPOT || [];
  const hourlyAligned =
    eventClose % TIMEFRAME_MS["1h"] === 0 &&
    targetTs % TIMEFRAME_MS["1h"] === 0;
  const hourlyStart = hourlyAligned ? eventClose - TIMEFRAME_MS["1h"] : null;
  const hourlyEnd = hourlyAligned ? targetTs - TIMEFRAME_MS["1h"] : null;
  const rsBtc = hourlyAligned
    ? relativeStrengthAtWindow(hourlyCandidate, external_hourly?.BTC_SPOT || [], hourlyStart, hourlyEnd)
    : null;
  const rsEth = hourlyAligned
    ? relativeStrengthAtWindow(hourlyCandidate, external_hourly?.ETH_SPOT || [], hourlyStart, hourlyEnd)
    : null;
  const neutralBand = config.neutral_return_band_pct;
  const direction = ["LONG", "SHORT"].includes(text(event?.direction_at_event).toUpperCase())
    ? text(event.direction_at_event).toUpperCase()
    : "NONE";
  const directionEligible = event?.directional_evaluation_eligible === true && direction !== "NONE";
  const outcomeDirection = returnPct === null || Math.abs(returnPct) <= neutralBand
    ? 0
    : Math.sign(returnPct);
  const outcomeClass = returnPct === null
    ? null
    : outcomeDirection === 0
      ? (directionEligible ? "DIRECTIONAL_NEUTRAL" : "DIRECTIONLESS_NEUTRAL")
      : !directionEligible
        ? (outcomeDirection > 0 ? "DIRECTIONLESS_MOVE_UP_NO_SIDE_SELECTED" : "DIRECTIONLESS_MOVE_DOWN_NO_SIDE_SELECTED")
        : (direction === "LONG") === (outcomeDirection > 0)
          ? "FAVORABLE_MOVE_FOR_PRECOMMITTED_DIRECTION"
          : "ADVERSE_MOVE_FOR_PRECOMMITTED_DIRECTION";
  const directionalReturn = !directionEligible || returnPct === null
    ? null
    : direction === "LONG"
      ? returnPct
      : -returnPct;
  const directionalMfe = !directionEligible
    ? null
    : direction === "LONG"
      ? maxUpExcursion
      : maxDownExcursion === null
        ? null
        : -maxDownExcursion;
  const directionalMae = !directionEligible
    ? null
    : direction === "LONG"
      ? maxDownExcursion
      : maxUpExcursion === null
        ? null
        : -maxUpExcursion;
  const triggered = ["ENTRY_TRIGGER_SHADOW", "CHASE_RISK"].includes(funnel_stage);
  const missed = directionEligible
    ? (directionalMfe ?? -Infinity) >= config.missed_opportunity_mfe_pct && !triggered
    : null;
  const falseRejection = directionEligible
    ? missed === true && ["ANOMALOUS_EVENT", "CONFIRMATION_PENDING"].includes(funnel_stage)
    : null;
  const lateEntry = directionEligible
    ? funnel_stage === "CHASE_RISK" && (directionalMfe ?? -Infinity) >= config.missed_opportunity_mfe_pct
    : null;
  const fundingContext = fundingOutcomeContext(event, funding, targetTs);
  const contextComplete = rsBtc !== null && rsEth !== null && fundingContext.status === DATA_STATUS.OK;
  const response = {
    status: DATA_STATUS.OK,
    horizon,
    target_ts: targetTs,
    source_timeframe: selected.timeframe,
    as_of_ts: observedTs,
    trajectory_complete: true,
    expected_bars: selected.diagnostic.expected_bars,
    observed_bars: selected.diagnostic.observed_bars,
    trajectory_coverage_pct: selected.diagnostic.coverage_pct,
    source_start_ts: rows[0].ts,
    source_end_ts: rows.at(-1).end_ts,
    source_bar_duration_ms: selected.duration_ms,
    trajectory_diagnostics: selected.diagnostics,
    closure_quality: contextComplete ? "COMPLETE" : "PRICE_TRAJECTORY_COMPLETE_CONTEXT_PARTIAL",
    price: close,
    return_from_anomaly_close_pct: returnPct,
    direction_at_event: direction,
    direction_locked_ts: timestamp(event?.direction_locked_ts),
    directional_evaluation_eligible: directionEligible,
    directional_return_pct: directionalReturn,
    mfe_pct: directionalMfe,
    mae_pct: directionalMae,
    max_up_excursion_pct: maxUpExcursion,
    max_down_excursion_pct: maxDownExcursion,
    event_high_broken: high > event.candle.high,
    event_low_broken: low < event.candle.low,
    reclaim_detected:
      (low < event.candle.low && close > event.candle.low) ||
      (high > event.candle.high && close < event.candle.high),
    outcome_class: outcomeClass,
    btc_relative_strength_pp: rsBtc,
    eth_relative_strength_pp: rsEth,
    traded_volume: totalVolume,
    event_volume_per_hour: eventVolumePerHour,
    post_event_volume_per_hour: afterVolumePerHour,
    ease_of_movement_after: afterEase,
    anomaly_ease_of_movement: eventEase,
    post_event_supply_exhaustion_candidate: supplyExhaustion,
    missed_opportunity_detected: missed,
    false_rejection_candidate: falseRejection,
    late_entry_candidate: lateEntry,
    funding_before_during_after: fundingContext,
    missing_fields: compactUnique([
      rsBtc === null ? "btc_relative_strength" : null,
      rsEth === null ? "eth_relative_strength" : null,
      ...fundingContext.missing_fields,
    ]),
    safety: safetyEnvelope(),
  };
  return response;
}

function currentPostEventContext(event, minuteCandles) {
  const rows = (Array.isArray(minuteCandles) ? minuteCandles : []).filter((row) => row.ts >= event.event_close_ts);
  if (!rows.length) return { status: DATA_STATUS.MISSING, current_return_pct: null, low_held: null, reclaim_detected: null, ease_supply_exhaustion: null };
  const contiguous =
    rows[0].ts === event.event_close_ts &&
    rows.every((row, index) => index === 0 || row.ts === rows[index - 1].end_ts);
  if (!contiguous) {
    return {
      status: DATA_STATUS.PARTIAL,
      current_return_pct: null,
      low_held: null,
      reclaim_detected: null,
      ease_supply_exhaustion: null,
      missing_fields: ["contiguous_post_event_1m_history"],
    };
  }
  const currentReturn = pctChange(event.candle.close, rows.at(-1).close);
  const low = Math.min(...rows.map((row) => row.low));
  const reclaim = low < event.candle.low && rows.at(-1).close > event.candle.low;
  const volume = rows.reduce((sum, row) => sum + row.volume, 0);
  const afterEase = ratio(Math.abs(currentReturn ?? 0), volume);
  const eventEase = ratio(Math.abs(event.open_close_pct ?? 0), event.candle.volume);
  const postHours = (rows.at(-1).end_ts - event.event_close_ts) / TIMEFRAME_MS["1h"];
  const eventHours = (event.event_close_ts - event.timestamp) / TIMEFRAME_MS["1h"];
  const postVolumePerHour = ratio(volume, postHours);
  const eventVolumePerHour = ratio(event.candle.volume, eventHours);
  return {
    status: DATA_STATUS.OK,
    current_return_pct: currentReturn,
    low_held: low >= event.candle.low,
    reclaim_detected: reclaim,
    ease_of_movement_after: afterEase,
    event_volume_per_hour: eventVolumePerHour,
    post_event_volume_per_hour: postVolumePerHour,
    ease_supply_exhaustion:
      afterEase !== null && eventEase !== null && afterEase > eventEase &&
      postVolumePerHour !== null && eventVolumePerHour !== null &&
      postVolumePerHour < eventVolumePerHour,
  };
}

function funnelStage({ event, cross, post, priceOi, oiFlush, basis, flow, relativeStrength, config }) {
  const reasons = [];
  let stage = "ANOMALOUS_EVENT";
  const early = cross.cross_exchange_confirmed || event.volume_ratio_median >= config.extreme_volume_ratio_review;
  if (early) stage = "EARLY_WATCH";
  else reasons.push("NO_CROSS_EXCHANGE_CONFIRMATION_OR_EXTREME_VOLUME");
  const reclaimOrHold = post.low_held === true || post.reclaim_detected === true;
  const basisSupport =
    (finite(basis?.htx_basis_pct) !== null && basis.htx_basis_pct < 0) ||
    (finite(basis?.cross_exchange_median_basis_pct) !== null && basis.cross_exchange_median_basis_pct < 0);
  const contextCount = [
    reclaimOrHold,
    post.ease_supply_exhaustion === true,
    oiFlush?.setup_shadow === true,
    basisSupport,
    priceOi?.["1h"]?.status === DATA_STATUS.OK,
    flow?.status === DATA_STATUS.OK,
    relativeStrength?.improving === true,
  ].filter(Boolean).length;
  if (early && reclaimOrHold && contextCount >= 2) stage = "CONFIRMATION_PENDING";
  if (early && reclaimOrHold && relativeStrength?.improving === true && contextCount >= 4) stage = "ENTRY_TRIGGER_SHADOW";
  if (stage === "ENTRY_TRIGGER_SHADOW" && post.current_return_pct >= config.chase_risk_pct) stage = "CHASE_RISK";
  if (!reclaimOrHold) reasons.push("EVENT_LOW_NOT_HELD_OR_RECLAIM_NOT_CONFIRMED");
  if (post.ease_supply_exhaustion !== true) reasons.push("EASE_OF_MOVEMENT_NOT_CONFIRMED");
  if (priceOi?.["1h"]?.status !== DATA_STATUS.OK) reasons.push("PRICE_OI_1H_MISSING");
  if (flow?.status !== DATA_STATUS.OK) reasons.push("TIMESTAMP_ALIGNED_FLOW_MISSING");
  if (relativeStrength?.improving !== true) reasons.push("RELATIVE_STRENGTH_NOT_CONFIRMED");
  if (!basisSupport) reasons.push("SPOT_PERP_STRESS_NOT_SUPPORTIVE_OR_MISSING");
  return {
    stage,
    entry_trigger_is_shadow_only: stage === "ENTRY_TRIGGER_SHADOW" || stage === "CHASE_RISK",
    live_entry_trigger: false,
    confirmation_count: contextCount,
    drop_reasons: compactUnique(reasons),
  };
}

function eventInterval(event) {
  const start = timestamp(event?.timestamp ?? event?.episode_start_ts);
  const end = timestamp(event?.event_close_ts ?? event?.episode_end_ts);
  return start !== null && end !== null && end > start ? { start, end } : null;
}

function intervalsOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

export function deduplicateMarketMoveEvents(events, configOverrides = {}) {
  const config = normalizedConfig(configOverrides);
  const ordered = (Array.isArray(events) ? events : [])
    .filter((event) => eventInterval(event) && text(event?.event_id))
    .slice(0, 4 * config.max_scanned_signals_per_timeframe)
    .sort((a, b) =>
      eventInterval(a).start - eventInterval(b).start ||
      eventInterval(a).end - eventInterval(b).end ||
      text(a.event_id).localeCompare(text(b.event_id))
    );
  const groups = new Map();
  for (const event of ordered) {
    const key = text(event?.contract).normalize("NFC");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }
  const clusters = [];
  for (const groupEvents of groups.values()) {
    for (const event of groupEvents) {
      const interval = eventInterval(event);
      const current = clusters.at(-1);
      const sameGroup = current &&
        text(current.members[0]?.contract) === text(event?.contract);
      const linkable = sameGroup &&
        interval.start <= current.end + config.episode_link_gap_ms &&
        Math.max(current.end, interval.end) - current.start <= config.max_episode_span_ms;
      if (linkable) {
        current.end = Math.max(current.end, interval.end);
        current.members.push(event);
      } else {
        clusters.push({ start: interval.start, end: interval.end, members: [event] });
      }
    }
  }
  return clusters.map((cluster) => {
    const members = cluster.members.slice().sort((a, b) =>
      eventInterval(a).end - eventInterval(b).end ||
      eventInterval(a).start - eventInterval(b).start ||
      (finite(b?.volume_ratio_median) ?? 0) - (finite(a?.volume_ratio_median) ?? 0) ||
      text(a?.event_id).localeCompare(text(b?.event_id))
    );
    const representative = members[0];
    const contract = text(representative?.contract).normalize("NFC");
    const episodeId = [
      "OPP", OPPORTUNITY_INTEGRITY_RULES_VERSION, contract, "MARKET",
      "EPISODE", cluster.start, cluster.end,
    ].join(":");
    return {
      ...representative,
      event_id: episodeId,
      episode_id: episodeId,
      original_signal_event_id: representative.event_id,
      episode_start_ts: cluster.start,
      episode_end_ts: cluster.end,
      independence_start_ts: Math.max(1, cluster.start - config.episode_link_gap_ms),
      independence_end_ts: cluster.end + config.episode_link_gap_ms,
      independent_sample: true,
      related_signal_count: members.length,
      related_timeframes: compactUnique(members.map((event) => event?.timeframe)).sort(),
      related_exchanges: compactUnique(members.map((event) => event?.exchange || "HTX")).sort(),
      control_group: false,
      control_eligible: false,
      control_maturity_ts: null,
      contamination_status: "SIGNAL_EPISODE_NOT_CONTROL",
      related_signals: members.slice(0, 32).map((event) => ({
        signal_event_id: event.event_id,
        timeframe: event.timeframe,
        timestamp: event.timestamp,
        event_close_ts: event.event_close_ts,
        volume_ratio_median: finite(event.volume_ratio_median),
        threshold_path: event.threshold_path,
      })),
      dedup_status: members.length > 1 ? "RELATED_SIGNALS_COLLAPSED_TO_ONE_EPISODE" : "INDEPENDENT_SINGLE_SIGNAL_EPISODE",
      integrity_version: OPPORTUNITY_VERSION,
      integrity_rules_version: OPPORTUNITY_INTEGRITY_RULES_VERSION,
    };
  }).sort((a, b) => b.timestamp - a.timestamp || text(a.event_id).localeCompare(text(b.event_id)));
}

function lockDirectionAtObservation(event, directionContext, observedTs, config) {
  const hint = text(directionContext?.direction_hint).toUpperCase();
  const originalDirection = text(event?.direction_at_event).toUpperCase();
  const originalLockedTs = timestamp(event?.direction_locked_ts);
  const eventClose = timestamp(event?.event_close_ts);
  const originallyPrecommitted =
    event?.directional_evaluation_eligible === true &&
    (originalDirection === "LONG" || originalDirection === "SHORT") &&
    originalLockedTs !== null && eventClose !== null &&
    originalLockedTs === eventClose &&
    text(event?.direction_source) !== "" &&
    text(event?.direction_rules_version) !== "";
  if (originallyPrecommitted) {
    return {
      direction_at_event: originalDirection,
      direction_source: text(event.direction_source),
      direction_rules_version: text(event.direction_rules_version),
      direction_locked_ts: originalLockedTs,
      directional_evaluation_eligible: true,
      direction_lock_status: "ORIGINALLY_PRECOMMITTED_AT_EVENT_CLOSE",
    };
  }
  return {
    direction_at_event: "NONE",
    direction_source: "NO_TIMELY_PRECOMMITTED_DIRECTION",
    direction_rules_version: null,
    direction_locked_ts: null,
    directional_evaluation_eligible: false,
    direction_lock_status:
      hint === "LONG" || hint === "SHORT"
        ? "DIRECTIONLESS_SOURCE_CANNOT_BE_RETROFITTED_FROM_OBSERVATION_CONTEXT"
        : "DIRECTIONLESS_AT_EVENT",
    rejected_observation_direction_hint:
      hint === "LONG" || hint === "SHORT" ? hint : null,
  };
}

function controlOverlapsSignal(start, end, signalEpisodes, exclusionMs) {
  return (Array.isArray(signalEpisodes) ? signalEpisodes : []).some((event) => {
    const interval = eventInterval(event);
    return interval && intervalsOverlap(
      start - exclusionMs,
      end + exclusionMs,
      interval.start,
      interval.end,
    );
  });
}

export function selectIndependentControl({
  contract,
  hourly,
  signal_episodes = [],
  scan_truncated = false,
  now = Date.now(),
  config: configOverrides = {},
} = {}) {
  const config = normalizedConfig(configOverrides);
  if (scan_truncated) {
    return { status: "CONTROL_REJECTED_SIGNAL_SCAN_TRUNCATED", event: null };
  }
  const xs = Array.isArray(hourly) ? hourly : [];
  const latestEnd = timestamp(xs.at(-1)?.end_ts);
  if (latestEnd === null) return { status: "CONTROL_REJECTED_NO_HOURLY_HISTORY", event: null };
  const maturityCutoff = now - config.control_maturity_ms;
  const candidates = xs
    .map((candle, index) => ({ candle, index }))
    .filter(({ candle, index }) =>
      index >= config.rolling_lookback &&
      timestamp(candle?.end_ts) !== null &&
      candle.end_ts <= maturityCutoff &&
      candle.end_ts + OUTCOME_HORIZONS["7d"] <= latestEnd
    )
    .slice(-512)
    .reverse();
  for (const { candle, index } of candidates) {
    const history = xs.slice(index - config.rolling_lookback, index);
    const historyContiguous =
      history.length === config.rolling_lookback &&
      history.every((row, position) =>
        position === 0 || row.ts - history[position - 1].ts === TIMEFRAME_MS["1h"]
      ) &&
      candle.ts - history.at(-1).ts === TIMEFRAME_MS["1h"];
    if (!historyContiguous) continue;
    const features = candleFeatures(candle, history);
    const ratioMedian = finite(features.volume_ratio_median);
    const anomalousGeometry =
      finite(features.body_range_ratio) !== null &&
      (
        features.body_range_ratio <= config.body_range_max ||
        features.upper_wick_ratio >= config.wick_range_min ||
        features.lower_wick_ratio >= config.wick_range_min
      );
    const isSignal =
      (ratioMedian !== null && ratioMedian >= config.volume_ratio_median_watch && anomalousGeometry) ||
      (ratioMedian !== null && ratioMedian >= config.extreme_volume_ratio_review);
    if (isSignal) continue;
    if (controlOverlapsSignal(candle.ts, candle.end_ts, signal_episodes, config.control_exclusion_ms)) continue;
    if (stableHash(`${contract}:${candle.ts}:CONTROL:${OPPORTUNITY_INTEGRITY_RULES_VERSION}`) % config.control_sample_modulus !== 0) continue;
    const eventId = [
      "OPP", OPPORTUNITY_INTEGRITY_RULES_VERSION, text(contract).normalize("NFC"),
      "HTX", "CONTROL_EPISODE", candle.ts,
    ].join(":");
    return {
      status: "CONTROL_SELECTED_MATURE_ISOLATED",
      event: {
        event_id: eventId,
        episode_id: eventId,
        symbol: text(contract).normalize("NFC"),
        contract: text(contract).normalize("NFC"),
        exchange: "HTX",
        timeframe: "1h",
        timestamp: candle.ts,
        event_close_ts: candle.end_ts,
        event_type: "CONTROL_NON_ANOMALOUS",
        integrity_version: OPPORTUNITY_VERSION,
        integrity_rules_version: OPPORTUNITY_INTEGRITY_RULES_VERSION,
        control_group: true,
        control_eligible: true,
        control_population: "DEEP_CHECK_ELIGIBLE_MATURE_ISOLATED_ONLY",
        control_maturity_ts: candle.end_ts + config.control_maturity_ms,
        contamination_status: "ISOLATED_FROM_KNOWN_SIGNAL_EPISODES",
        independent_sample: true,
        episode_start_ts: candle.ts,
        episode_end_ts: candle.end_ts,
        independence_start_ts: Math.max(1, candle.ts - config.control_exclusion_ms),
        independence_end_ts: candle.end_ts + config.control_exclusion_ms,
        related_signal_count: 0,
        related_timeframes: [],
        ...features,
        direction_at_event: "NONE",
        direction_source: "CONTROL_IS_DIRECTIONLESS",
        direction_locked_ts: null,
        directional_evaluation_eligible: false,
        candle: { open: candle.open, high: candle.high, low: candle.low, close: candle.close, volume: candle.volume, trade_count: candle.trade_count ?? null },
        data_quality: DATA_STATUS.OK,
        coverage: "CLOSED_MATURE_ISOLATED_CONTROL_CANDLE",
        control_non_anomalous_verified: true,
        control_rolling_history_points: history.length,
        control_rolling_history_contiguous: true,
        freshness: "HISTORICAL_FACT_AT_TIMESTAMP",
        missing_fields: [],
        safety: safetyEnvelope(),
      },
    };
  }
  return { status: "CONTROL_REJECTED_NO_MATURE_ISOLATED_CANDIDATE", event: null };
}

export function selectBoundedFairEvents(events, cap = DEFAULT_OPPORTUNITY_CONFIG.max_events_per_analysis) {
  const boundedCap = boundedNumber(
    cap,
    DEFAULT_OPPORTUNITY_CONFIG.max_events_per_analysis,
    1,
    DEFAULT_OPPORTUNITY_CONFIG.max_events_per_analysis,
    { integer: true },
  );
  const ordered = (Array.isArray(events) ? events : [])
    .filter((event) => text(event?.event_id))
    .slice(0, 4 * DEFAULT_OPPORTUNITY_CONFIG.max_events_per_analysis)
    .sort(
      (a, b) =>
        (finite(b?.timestamp) ?? 0) - (finite(a?.timestamp) ?? 0) ||
        (finite(b?.volume_ratio_median) ?? 0) - (finite(a?.volume_ratio_median) ?? 0) ||
        text(a?.event_id).localeCompare(text(b?.event_id)),
    );
  const selected = [];
  const selectedIds = new Set();
  // Reserve at most one position for every requested timeframe before
  // filling the remaining capacity by recency. This prevents a burst of
  // hourly events from silently starving 4h/1d evidence while preserving a
  // hard, deterministic total cap.
  for (const timeframe of ["1d", "4h", "1h", "15m"]) {
    if (selected.length >= boundedCap) break;
    const candidate = ordered.find((event) =>
      event?.timeframe === timeframe ||
      (Array.isArray(event?.related_timeframes) && event.related_timeframes.includes(timeframe))
    );
    if (!candidate || selectedIds.has(candidate.event_id)) continue;
    selected.push(candidate);
    selectedIds.add(candidate.event_id);
  }
  for (const candidate of ordered) {
    if (selected.length >= boundedCap) break;
    if (selectedIds.has(candidate.event_id)) continue;
    selected.push(candidate);
    selectedIds.add(candidate.event_id);
  }
  return selected.sort(
    (a, b) =>
      (finite(b?.timestamp) ?? 0) - (finite(a?.timestamp) ?? 0) ||
      text(a?.event_id).localeCompare(text(b?.event_id)),
  );
}

export function buildOpportunityShadowAnalysis(input = {}, configOverrides = {}) {
  const config = normalizedConfig(configOverrides);
  const now = timestamp(input?.now) ?? Date.now();
  const contract = text(input?.contract).normalize("NFC");
  const primary = input?.primary || {};
  const oneMinute = normalizeCandleSeries(primary?.one_minute, {
    duration_ms: TIMEFRAME_MS["1m"], now, stale_after_ms: 10 * TIMEFRAME_MS["1m"], source: "HTX_FUTURES_1M",
  });
  const suppliedFifteenMinute = normalizeCandleSeries(primary?.fifteen_minute, {
    duration_ms: TIMEFRAME_MS["15m"], now, stale_after_ms: 4 * TIMEFRAME_MS["15m"], source: "HTX_FUTURES_15M",
  });
  const oneHour = normalizeCandleSeries(primary?.one_hour, {
    duration_ms: TIMEFRAME_MS["1h"], now, stale_after_ms: 3 * TIMEFRAME_MS["1h"], source: "HTX_FUTURES_1H",
  });
  const suppliedFourHour = normalizeCandleSeries(primary?.four_hour, {
    duration_ms: TIMEFRAME_MS["4h"], now, stale_after_ms: 3 * TIMEFRAME_MS["4h"], source: "HTX_FUTURES_4H",
  });
  const oneDay = normalizeCandleSeries(primary?.one_day, {
    duration_ms: TIMEFRAME_MS["1d"],
    now,
    stale_after_ms: 3 * TIMEFRAME_MS["1d"],
    source: "HTX_FUTURES_1D",
    alignment_offset_ms: HTX_DAILY_ALIGNMENT_OFFSET_MS,
  });
  const aggregate = {};
  for (const timeframe of ["5m", "15m", "1h"]) {
    aggregate[timeframe] = aggregateCandles(oneMinute.candles, TIMEFRAME_MS[timeframe], TIMEFRAME_MS["1m"]);
  }
  const fifteenMinuteCandles = suppliedFifteenMinute.candles.length
    ? suppliedFifteenMinute.candles
    : aggregate["15m"].candles;
  const oneHourCandles =
    oneHour.candles.length
      ? oneHour.candles
      : aggregate["1h"].candles;
  const derivedFourHour =
    aggregateCandles(
      oneHourCandles,
      TIMEFRAME_MS["4h"],
      TIMEFRAME_MS["1h"],
    );
  const fourHourCandles =
    suppliedFourHour.candles.length
      ? suppliedFourHour.candles
      : derivedFourHour.candles;
  const series = {
    "1m": oneMinute.candles,
    "5m": aggregate["5m"].candles,
    "15m": fifteenMinuteCandles,
    "1h": oneHourCandles,
    "4h": fourHourCandles,
    "1d": oneDay.candles,
  };
  const venueSeries = input?.external_hourly || {};
  const basis = computeSpotPerpBasis({
    futures_snapshot: input?.futures_snapshot,
    spot_snapshot: input?.spot_snapshot,
    external_hourly: venueSeries,
  });
  const priceOi = classifyPriceOiMatrix(primary?.windows || {});
  const oiFlush = detectOiFlushRebuild({
    oi_series: primary?.oi_contracts_hourly,
    price_hourly: series["1h"],
    funding: input?.funding,
    config,
  });
  const detected = [];
  const signalScans = {};
  for (const timeframe of ["15m", "1h", "4h", "1d"]) {
    const scan = scanAnomalousEvents(
      { contract, exchange: "HTX", timeframe, candles: series[timeframe], config },
      config.max_scanned_signals_per_timeframe,
    );
    signalScans[timeframe] = scan;
    detected.push(...scan.events);
  }
  const independentEpisodes = deduplicateMarketMoveEvents(detected, config);
  const events = selectBoundedFairEvents(independentEpisodes, config.max_events_per_analysis)
    .map((event) => {
      const directionLock = lockDirectionAtObservation(event, input?.direction_context, now, config);
      const cross = crossExchangeVerification(event, venueSeries, config);
      const flow = flowWindowForEvent(event, primary?.windows || {}, input?.spot_snapshot);
      const eventBasis = basisAtEvent(basis, event.event_close_ts);
      const eventPriceOi = priceOiAtEvent(priceOi, event.event_close_ts);
      const eventFunding = fundingAtEvent(input?.funding, event.event_close_ts);
      const eventOi = oiHistoryAtEvent(primary?.oi_contracts_hourly, event.event_close_ts);
      const eventWindowStart = event.timestamp - 24 * TIMEFRAME_MS["1h"];
      // Event classification is reconstructed only from facts available by
      // the event close. Future candles remain in the separate outcome and
      // post-event journal and cannot promote a historical funnel stage.
      const eventWindowEnd = event.event_close_ts;
      const eventHourly = series["1h"].filter((row) => row.ts >= eventWindowStart && row.end_ts <= eventWindowEnd);
      const eventOiFlush = detectOiFlushRebuild({
        oi_series: eventOi,
        price_hourly: eventHourly,
        funding: eventFunding,
        config,
      });
      const detailCandles = series["5m"]
        .filter((row) => row.ts >= eventWindowStart && row.end_ts <= eventWindowEnd)
        .slice(-320);
      const stopPools = detectStopPools({
        candles: detailCandles,
        event,
        liquidation_clusters: input?.liquidation_clusters || [],
        config,
      });
      const sweep = detectLiquiditySweep({
        candles: detailCandles,
        pools: stopPools.levels,
        oi_series: eventOi,
        funding: eventFunding,
        basis: eventBasis,
        config,
      });
      const post = currentPostEventContext(event, oneMinute.candles);
      const relativeStrength = relativeStrengthSinceEvent(event, venueSeries);
      const reconstructedFunnel = funnelStage({
        event,
        cross,
        post,
        priceOi: eventPriceOi,
        oiFlush: eventOiFlush,
        basis: eventBasis,
        flow,
        relativeStrength,
        config,
      });
      const timelyObservation = now >= event.event_close_ts &&
        now <= event.event_close_ts + config.direction_lock_max_lag_ms;
      const funnel = timelyObservation
        ? reconstructedFunnel
        : {
            stage: "ANOMALOUS_EVENT",
            entry_trigger_is_shadow_only: false,
            live_entry_trigger: false,
            confirmation_count: 0,
            drop_reasons: ["HISTORICAL_BACKFILL_HAS_NO_PRECOMMITTED_FUNNEL_STATE"],
            reconstructed_post_event_stage: reconstructedFunnel.stage,
            reconstructed_stage_eligible_for_outcome_scoring: false,
          };
      const hypotheses = classifyCompetingHypotheses({ event, flow, cross_exchange: cross, price_oi: eventPriceOi, oi_flush_rebuild: eventOiFlush, sweep, basis: eventBasis });
      const minuteDecomposition = buildClosedMinuteDecomposition({
        event,
        one_minute: oneMinute.candles,
        now,
        hypotheses,
      });
      return {
        ...event,
        ...directionLock,
        cross_exchange: cross,
        market_flow: flow,
        hypotheses,
        minute_decomposition: minuteDecomposition,
        early_anomaly_classification: minuteDecomposition.classification_allowed === true
          ? minuteDecomposition.classification
          : null,
        stop_pools: stopPools,
        liquidity_sweep: sweep,
        price_oi_matrix: eventPriceOi,
        oi_flush_rebuild: eventOiFlush,
        spot_perp_basis: eventBasis,
        funding_at_event: eventFunding,
        relative_strength: relativeStrength,
        post_event_current: post,
        observation_timing: {
          first_seen_ts: now,
          lag_from_event_close_ms: Math.max(0, now - event.event_close_ts),
          timely_for_precommitted_funnel: timelyObservation,
          retrospective_promotion_forbidden: !timelyObservation,
        },
        funnel,
        liquidations: input?.liquidation_summary ?? null,
        number_of_accounts_bias: null,
        notional_market_bias: null,
        funding_interpretation: "Funding is context only and is not proof of new shorts.",
        drilldown: {
          one_minute_bars: minuteDecomposition.classification_allowed === true
            ? minuteDecomposition.one_minute_bars
            : oneMinute.candles.filter((row) => row.ts >= event.timestamp && row.ts < event.event_close_ts).length,
          three_minute_bars: minuteDecomposition.classification_allowed === true
            ? minuteDecomposition.three_minute_bars
            : 0,
          five_minute_bars: minuteDecomposition.classification_allowed === true
            ? minuteDecomposition.five_minute_bars
            : series["5m"].filter((row) => row.ts >= event.timestamp && row.ts < event.event_close_ts).length,
          exact_closed_minute_classification: minuteDecomposition.classification_allowed === true,
        },
      };
    });
  const controlSelection = selectIndependentControl({
    contract,
    hourly: series["1h"],
    signal_episodes: independentEpisodes,
    scan_truncated: Object.values(signalScans).some((scan) => scan.scan_truncated),
    now,
    config,
  });
  const control = controlSelection.event;
  const missingFields = compactUnique([
    oneMinute.candles.length ? null : "htx_1m_candles",
    oneHourCandles.length ? null : "htx_1h_candles",
    fourHourCandles.length ? null : "htx_4h_candles",
    oneDay.candles.length ? null : "htx_1d_candles",
    Object.keys(venueSeries).length ? null : "cross_exchange_hourly_candles",
    priceOi["1h"].status === DATA_STATUS.OK ? null : "price_oi_1h",
  ]);
  const derivedStatus = (rows, incomplete) =>
    !rows.length
      ? DATA_STATUS.MISSING
      : incomplete
        ? DATA_STATUS.PARTIAL
        : DATA_STATUS.OK;
  const oneHourStatus =
    oneHour.candles.length
      ? oneHour.status
      : derivedStatus(
          aggregate["1h"].candles,
          aggregate["1h"].incomplete_buckets,
        );
  const fourHourStatus =
    suppliedFourHour.candles.length
      ? suppliedFourHour.status
      : derivedStatus(
          derivedFourHour.candles,
          derivedFourHour.incomplete_buckets,
        );
  const statuses = [oneMinute.status, oneHourStatus, fourHourStatus, oneDay.status];
  const overallStatus = statuses.includes(DATA_STATUS.CONFLICTING)
    ? DATA_STATUS.CONFLICTING
    : statuses.every((status) => status === DATA_STATUS.MISSING)
      ? DATA_STATUS.MISSING
      : statuses.some((status) => status !== DATA_STATUS.OK)
        ? DATA_STATUS.PARTIAL
        : DATA_STATUS.OK;
  const qualitySummary = (result) => ({
    status: result.status,
    source: result.source ?? null,
    duration_ms: result.duration_ms ?? null,
    count: Array.isArray(result.candles) ? result.candles.length : 0,
    first_ts: result.first_ts ?? null,
    latest_ts: result.latest_ts ?? null,
    latest_end_ts: result.latest_end_ts ?? null,
    freshness_age_ms: result.freshness_age_ms ?? null,
    missing_fields: result.missing_fields ?? [],
    conflict_count: result.conflict_count ?? 0,
    duplicate_suppressed: result.duplicate_suppressed ?? 0,
    rejected_count: result.rejected_count ?? 0,
    unclosed_rejected: result.unclosed_rejected ?? 0,
    timestamp_misaligned_rejected: result.timestamp_misaligned_rejected ?? 0,
    input_count: result.input_count ?? 0,
    input_truncated: result.input_truncated ?? 0,
    gap_count: result.gap_count ?? 0,
  });
  const response = {
    version: OPPORTUNITY_VERSION,
    rules_version: OPPORTUNITY_RULES_VERSION,
    integrity_rules_version: OPPORTUNITY_INTEGRITY_RULES_VERSION,
    mode: OPPORTUNITY_MODE,
    contract,
    observed_ts: now,
    status: overallStatus,
    events,
    newest_event: events[0] || control,
    control_sample: control,
    counts: {
      raw_anomaly_signals: detected.length,
      total_raw_anomaly_signals: Object.values(signalScans).reduce((sum, scan) => sum + scan.total_detected, 0),
      independent_anomaly_episodes: events.length,
      total_independent_anomaly_episodes: independentEpisodes.length,
      related_signals_collapsed: Math.max(0, detected.length - independentEpisodes.length),
      anomalies: events.length,
      cross_exchange_confirmed: events.filter((row) => row.cross_exchange.cross_exchange_confirmed).length,
      single_exchange: events.filter((row) => row.cross_exchange.single_exchange_anomaly).length,
      entry_trigger_shadow: events.filter((row) => row.funnel.stage === "ENTRY_TRIGGER_SHADOW").length,
      chase_risk: events.filter((row) => row.funnel.stage === "CHASE_RISK").length,
      control_samples: control ? 1 : 0,
    },
    timeframe_quality: {
      "1m": qualitySummary(oneMinute),
      "5m": { status: !series["5m"].length ? DATA_STATUS.MISSING : aggregate["5m"].incomplete_buckets ? DATA_STATUS.PARTIAL : DATA_STATUS.OK, count: series["5m"].length, incomplete_buckets: aggregate["5m"].incomplete_buckets },
      "15m": {
        status: suppliedFifteenMinute.candles.length
          ? suppliedFifteenMinute.status
          : !series["15m"].length
            ? DATA_STATUS.MISSING
            : aggregate["15m"].incomplete_buckets
              ? DATA_STATUS.PARTIAL
              : DATA_STATUS.OK,
        count: series["15m"].length,
        source: suppliedFifteenMinute.candles.length ? "HTX_FUTURES_15M" : "DERIVED_EXACT_FROM_HTX_1M",
        incomplete_buckets: suppliedFifteenMinute.candles.length ? 0 : aggregate["15m"].incomplete_buckets,
      },
      "1h": {
        status: oneHourStatus,
        count: series["1h"].length,
        source: oneHour.candles.length ? "HTX_FUTURES_1H" : "DERIVED_EXACT_FROM_HTX_1M",
        incomplete_buckets: oneHour.candles.length ? 0 : aggregate["1h"].incomplete_buckets,
      },
      "4h": {
        status: fourHourStatus,
        count: series["4h"].length,
        source: suppliedFourHour.candles.length ? "HTX_FUTURES_4H" : "DERIVED_EXACT_FROM_HTX_1H",
        incomplete_buckets: suppliedFourHour.candles.length ? 0 : derivedFourHour.incomplete_buckets,
      },
      "1d": qualitySummary(oneDay),
    },
    price_oi_matrix: priceOi,
    oi_flush_rebuild: oiFlush,
    spot_perp_basis: basis,
    missing_fields: missingFields,
    capacity: {
      input_1m_bars: oneMinute.candles.length,
      input_1h_bars: oneHour.candles.length,
      input_4h_bars: fourHourCandles.length,
      input_1d_bars: oneDay.candles.length,
      computed_events_cap: config.max_events_per_analysis,
      scanned_signals_per_timeframe_cap: config.max_scanned_signals_per_timeframe,
      raw_signal_scan_truncated: Object.values(signalScans).some((scan) => scan.scan_truncated),
      persisted_events_cap_per_deep_check: 1,
      outcome_updates_cap_per_deep_check: 4,
    },
    control_group_limit: "Deep-Check-eligible population only; not a whole-market control group.",
    control_selection: {
      status: controlSelection.status,
      maturity_ms: config.control_maturity_ms,
      signal_exclusion_ms: config.control_exclusion_ms,
      same_event_as_signal_allowed: false,
      related_event_reuse_allowed: false,
    },
    independence: {
      raw_signal_scan_truncated: Object.values(signalScans).some((scan) => scan.scan_truncated),
      episode_link_gap_ms: config.episode_link_gap_ms,
      max_episode_span_ms: config.max_episode_span_ms,
      independent_episode_count_before_output_cap: independentEpisodes.length,
    },
    safety: safetyEnvelope(),
  };

  Object.defineProperty(response, "_series_by_timeframe", {
    enumerable: false,
    value: series,
  });
  Object.defineProperty(response, "_external_hourly", {
    enumerable: false,
    value: venueSeries,
  });
  Object.defineProperty(response, "_config", {
    enumerable: false,
    value: config,
  });
  Object.defineProperty(response, "_funding", {
    enumerable: false,
    value: input?.funding || null,
  });
  return response;
}
