import test from "node:test";
import assert from "node:assert/strict";
import {
  DATA_STATUS,
  DEFAULT_OPPORTUNITY_CONFIG,
  OUTCOME_HORIZONS,
  TIMEFRAME_MS,
  aggregateCandles,
  buildOpportunityShadowAnalysis,
  candleFeatures,
  classifyCompetingHypotheses,
  classifyPriceOiMatrix,
  computePostEventOutcome,
  computeSpotPerpBasis,
  crossExchangeVerification,
  detectAnomalousEvents,
  deduplicateMarketMoveEvents,
  detectLiquiditySweep,
  detectOiFlushRebuild,
  detectStopPools,
  normalizeCandleSeries,
  safetyEnvelope,
  selectBoundedFairEvents,
  selectIndependentControl,
} from "../src/opportunity-intelligence-engine.mjs";

const HOUR = TIMEFRAME_MS["1h"];
const MINUTE = TIMEFRAME_MS["1m"];
const START = 1_800_000_000_000 - (1_800_000_000_000 % HOUR);

function candle(ts, {
  duration = MINUTE,
  open = 100,
  high = 100.4,
  low = 99.6,
  close = 100.1,
  volume = 1,
  trade_count = 1,
} = {}) {
  return { ts, end_ts: ts + duration, duration_ms: duration, open, high, low, close, volume, trade_count, closed: true };
}

function minuteHistory(hours = 14, anomalyHour = hours - 2) {
  const rows = [];
  for (let i = 0; i < hours * 60; i += 1) {
    const hour = Math.floor(i / 60);
    const inAnomaly = hour === anomalyHour;
    rows.push(candle(START + i * MINUTE, {
      open: inAnomaly ? 100 : 99.9 + hour * 0.01,
      high: inAnomaly ? 102 : 100.5 + hour * 0.01,
      low: inAnomaly ? 98 : 99.5 + hour * 0.01,
      close: inAnomaly ? 100.2 : 100 + hour * 0.01,
      volume: inAnomaly ? 10 : 1,
    }));
  }
  return rows;
}

function hourlyVenue(hours = 14, anomalyHour = hours - 2, multiplier = 6) {
  return Array.from({ length: hours }, (_, i) => candle(START + i * HOUR, {
    duration: HOUR,
    open: 100,
    high: i === anomalyHour ? 102 : 100.5,
    low: i === anomalyHour ? 98 : 99.5,
    close: i === anomalyHour ? 100.1 : 100,
    volume: i === anomalyHour ? multiplier : 1,
  }));
}

test("normalization rejects future candles and conflicting duplicate timestamps", () => {
  const now = START + 4 * MINUTE;
  const rows = [
    candle(START),
    candle(START),
    candle(START + MINUTE),
    candle(START + MINUTE, { close: 100.2 }),
    candle(START + 4 * MINUTE),
  ];
  const result = normalizeCandleSeries(rows, { duration_ms: MINUTE, now });
  assert.equal(result.status, DATA_STATUS.CONFLICTING);
  assert.equal(result.duplicate_suppressed, 1);
  assert.equal(result.conflict_count, 1);
  assert.equal(result.unclosed_rejected, 1);
  assert.deepEqual(result.candles.map((row) => row.ts), [START]);
});

test("duplicate OHLCV with conflicting factual trade_count is not silently deduplicated", () => {
  const result = normalizeCandleSeries([
    candle(START, { trade_count: 10 }),
    candle(START, { trade_count: 11 }),
  ], { duration_ms: MINUTE, now: START + 2 * MINUTE });
  assert.equal(result.status, DATA_STATUS.CONFLICTING);
  assert.equal(result.conflict_count, 1);
  assert.equal(result.candles.length, 0);
});

test("normalization rejects duration-misaligned timestamps", () => {
  const result = normalizeCandleSeries([
    candle(START + 30_000),
    candle(START + MINUTE),
  ], { duration_ms: MINUTE, now: START + 3 * MINUTE });
  assert.equal(result.timestamp_misaligned_rejected, 1);
  assert.deepEqual(result.candles.map((row) => row.ts), [START + MINUTE]);
});

test("normalization accepts an explicit source daily-session offset only", () => {
  const day = TIMEFRAME_MS["1d"];
  const offset = 16 * 60 * 60 * 1000;
  const utcDayStart = START - (START % day);
  const rows = [
    candle(utcDayStart + offset, { volume: 1 }),
    candle(utcDayStart + offset + day, { volume: 2 }),
  ];
  const defaultGrid = normalizeCandleSeries(rows, {
    duration_ms: day,
    now: utcDayStart + offset + 3 * day,
  });
  const htxGrid = normalizeCandleSeries(rows, {
    duration_ms: day,
    alignment_offset_ms: offset,
    now: utcDayStart + offset + 3 * day,
  });
  assert.equal(defaultGrid.candles.length, 0);
  assert.equal(htxGrid.candles.length, 2);
  assert.equal(htxGrid.alignment_offset_ms, offset);
});

test("normalization fails closed for an invalid alignment offset", () => {
  const result = normalizeCandleSeries([candle(START)], {
    duration_ms: MINUTE,
    alignment_offset_ms: MINUTE,
    now: START + 2 * MINUTE,
  });
  assert.equal(result.status, DATA_STATUS.MISSING);
  assert.equal(result.error, "INVALID_ALIGNMENT_OFFSET");
  assert.deepEqual(result.candles, []);
});

test("aggregation admits only exact contiguous closed buckets", () => {
  const rows = Array.from({ length: 10 }, (_, i) => candle(START + i * MINUTE));
  rows.splice(7, 1);
  const result = aggregateCandles(rows, TIMEFRAME_MS["5m"], MINUTE);
  assert.equal(result.candles.length, 1);
  assert.equal(result.incomplete_buckets, 1);
  assert.equal(result.candles[0].component_bars, 5);
});

test("aggregation can align external hourly candles to the HTX daily session", () => {
  const day = TIMEFRAME_MS["1d"];
  const offset = 16 * HOUR;
  const utcDayStart = START - (START % day);
  const rows = Array.from({ length: 24 }, (_, index) => candle(
    utcDayStart + offset + index * HOUR,
    { duration: HOUR, volume: 1 },
  ));
  const result = aggregateCandles(rows, day, HOUR, offset);
  assert.equal(result.candles.length, 1);
  assert.equal(result.candles[0].ts, utcDayStart + offset);
  assert.equal(result.alignment_offset_ms, offset);
});

test("effort-vs-result detector uses rolling history and deterministic event id", () => {
  const hourly = hourlyVenue();
  const first = detectAnomalousEvents({ contract: "LSK-USDT", timeframe: "1h", candles: hourly });
  const second = detectAnomalousEvents({ contract: "LSK-USDT", timeframe: "1h", candles: hourly });
  assert.equal(first.length, 1);
  assert.equal(first[0].event_id, second[0].event_id);
  assert.ok(first[0].volume_ratio_median >= 3);
  assert.ok(first[0].body_range_ratio <= 0.35);
  assert.equal(first[0].safety.live_signal, false);
});

test("bounded event selection prevents timeframe starvation", () => {
  const hourly = Array.from({ length: 12 }, (_, index) => ({
    event_id: `hour-${index}`,
    timeframe: "1h",
    timestamp: START + index * HOUR,
    volume_ratio_median: 10,
  }));
  const higherTimeframes = [
    { event_id: "four-hour", timeframe: "4h", timestamp: START - HOUR, volume_ratio_median: 4 },
    { event_id: "daily", timeframe: "1d", timestamp: START - 2 * HOUR, volume_ratio_median: 4 },
    { event_id: "fifteen-minute", timeframe: "15m", timestamp: START - 3 * HOUR, volume_ratio_median: 4 },
  ];
  const first = selectBoundedFairEvents([...hourly, ...higherTimeframes], 8);
  const second = selectBoundedFairEvents([...hourly, ...higherTimeframes], 8);
  assert.equal(first.length, 8);
  assert.deepEqual(new Set(first.map((row) => row.timeframe)), new Set(["15m", "1h", "4h", "1d"]));
  assert.deepEqual(first.map((row) => row.event_id), second.map((row) => row.event_id));
});

test("related multi-timeframe signals collapse to one independent market episode", () => {
  const events = [
    { event_id: "lsk-15m", contract: "LSK-USDT", exchange: "HTX", timeframe: "15m", timestamp: START, event_close_ts: START + 15 * MINUTE, volume_ratio_median: 4 },
    { event_id: "steem-1h", contract: "STEEM-USDT", exchange: "HTX", timeframe: "1h", timestamp: START, event_close_ts: START + HOUR, volume_ratio_median: 5 },
    { event_id: "lsk-1h", contract: "LSK-USDT", exchange: "HTX", timeframe: "1h", timestamp: START, event_close_ts: START + HOUR, volume_ratio_median: 6 },
    { event_id: "lsk-bybit-1h", contract: "LSK-USDT", exchange: "BYBIT", timeframe: "1h", timestamp: START + 5 * MINUTE, event_close_ts: START + HOUR, volume_ratio_median: 5 },
    { event_id: "steem-15m", contract: "STEEM-USDT", exchange: "HTX", timeframe: "15m", timestamp: START, event_close_ts: START + 15 * MINUTE, volume_ratio_median: 4 },
  ];
  const episodes = deduplicateMarketMoveEvents(events);
  assert.equal(episodes.length, 2);
  for (const episode of episodes) {
    assert.equal(episode.independent_sample, true);
    assert.equal(episode.related_signal_count, episode.contract === "LSK-USDT" ? 3 : 2);
    assert.deepEqual(episode.related_timeframes, ["15m", "1h"]);
    assert.ok(episode.independence_start_ts < episode.episode_start_ts);
    assert.ok(episode.independence_end_ts > episode.episode_end_ts);
  }
  const lsk = episodes.find((episode) => episode.contract === "LSK-USDT");
  assert.deepEqual(lsk.related_exchanges, ["BYBIT", "HTX"]);
  assert.ok(lsk.event_id.includes(":MARKET:EPISODE:"));
});

test("extreme volume is retained for review even when geometry narrowly misses", () => {
  const rows = hourlyVenue().map((row) => ({ ...row }));
  const target = rows.at(-2);
  target.open = 99;
  target.close = 101;
  target.high = 101.6;
  target.low = 98.4;
  target.volume = 8;
  const events = detectAnomalousEvents({ contract: "STEEM-USDT", timeframe: "1h", candles: rows });
  assert.equal(events.length, 1);
  assert.equal(events[0].threshold_path, "EXTREME_OUTLIER_REVIEW");
});

test("cross-exchange confirmation compares each venue with its own history", () => {
  const event = detectAnomalousEvents({ contract: "LSK-USDT", timeframe: "1h", candles: hourlyVenue() })[0];
  const result = crossExchangeVerification(event, {
    BYBIT_PERP: hourlyVenue(),
    OKX_PERP: hourlyVenue(14, 12, 1.2),
  });
  assert.equal(result.cross_exchange_confirmed, true);
  assert.deepEqual(result.independent_confirming_venues, ["BYBIT_PERP"]);
  assert.equal(result.single_exchange_anomaly, false);
});

test("missing external candles are unknown, not a fabricated single-exchange anomaly", () => {
  const event = detectAnomalousEvents({
    contract: "LSK-USDT",
    timeframe: "1h",
    candles: hourlyVenue(),
  })[0];
  const result = crossExchangeVerification(event, {});
  assert.equal(result.cross_exchange_confirmed, false);
  assert.equal(result.single_exchange_anomaly, false);
  assert.equal(result.confirmation_unknown_missing_external_data, true);
  assert.equal(result.status, DATA_STATUS.MISSING);
});

test("unclosed or conflicting external candles cannot cross-confirm", () => {
  const event = detectAnomalousEvents({ contract: "LSK-USDT", timeframe: "1h", candles: hourlyVenue() })[0];
  const unclosed = hourlyVenue().map((row) => ({ ...row }));
  unclosed[12].closed = false;
  const conflicting = hourlyVenue().map((row) => ({ ...row }));
  conflicting.push({ ...conflicting[12], close: conflicting[12].close + 1 });
  const result = crossExchangeVerification(event, {
    UNCLOSED_PERP: unclosed,
    CONFLICTING_PERP: conflicting,
  });
  assert.equal(result.cross_exchange_confirmed, false);
  assert.equal(result.single_exchange_anomaly, false);
  assert.equal(result.status, DATA_STATUS.CONFLICTING);
});

test("anomaly detector rejects a rolling history with a timestamp gap", () => {
  const rows = hourlyVenue().filter((_, index) => index !== 11);
  const events = detectAnomalousEvents({
    contract: "LSK-USDT",
    timeframe: "1h",
    candles: rows,
  });
  assert.equal(events.length, 0);
});

test("Price x OI keeps unavailable 5m/15m OI missing", () => {
  const matrix = classifyPriceOiMatrix({
    "5m": { price: { usable: true, change_pct: -1 }, open_interest: { usable: false } },
    "15m": { price: { usable: true, change_pct: -2 }, open_interest: { usable: false } },
    "1h": { price: { usable: true, change_pct: -3 }, open_interest: { usable: true, contracts: { change_pct: -7 } } },
  });
  assert.equal(matrix["5m"].status, DATA_STATUS.MISSING);
  assert.equal(matrix["5m"].oi_change_pct, null);
  assert.equal(matrix["15m"].classification, null);
  assert.equal(matrix["1h"].classification, "PRICE_DOWN_OI_DOWN_LONG_FLUSH_OR_DELEVERAGING");
});

test("OI flush-rebuild setup is structural and funding sign stays context only", () => {
  const oi = [100, 98, 90, 91, 96].map((volume, i) => ({ ts: START + i * HOUR, volume }));
  const prices = [100, 97, 95, 98, 103].map((close, i) => ({ ts: START + i * HOUR, close }));
  for (const funding of [
    { current: { funding_rate: -0.001 } },
    { current: { funding_rate: 0.001 } },
    { current: { funding_rate: 0 } },
    null,
  ]) {
    const result = detectOiFlushRebuild({ oi_series: oi, price_hourly: prices, funding });
    assert.equal(result.detected, true);
    assert.equal(result.setup_shadow, true);
    assert.equal(result.setup_label, "POST_FLUSH_REBUILD_RECLAIM_SETUP_SHADOW");
    assert.equal(result.funding_directional_vote, false);
    assert.equal(result.live_signal, false);
    assert.equal(result.missing_fields.includes("funding"), false);
  }
});

test("stop pools and a breach/reclaim sequence stay factual and non-directional", () => {
  const rows = [
    candle(START, { duration: 5 * MINUTE, low: 99, high: 101, close: 100 }),
    candle(START + 5 * MINUTE, { duration: 5 * MINUTE, low: 98, high: 100, close: 99 }),
    candle(START + 10 * MINUTE, { duration: 5 * MINUTE, low: 99, high: 101, close: 100 }),
    candle(START + 15 * MINUTE, { duration: 5 * MINUTE, low: 98, high: 100, close: 99 }),
    candle(START + 20 * MINUTE, { duration: 5 * MINUTE, low: 99, high: 101, close: 100 }),
    candle(START + 25 * MINUTE, { duration: 5 * MINUTE, low: 97, high: 99, close: 98.5 }),
    candle(START + 30 * MINUTE, { duration: 5 * MINUTE, low: 97.5, high: 101, close: 100.5 }),
  ];
  const pools = detectStopPools({ candles: rows });
  const forcedPool = [{ side: "LOW", level: 98, type: "EQUAL_LOWS", touches: 2 }];
  const sweep = detectLiquiditySweep({ candles: rows, pools: forcedPool });
  assert.ok(pools.levels.every((row) => row.score_is_probability === false));
  assert.equal(sweep.sweep_detected, true);
  assert.equal(sweep.reclaim_detected, true);
  assert.equal(sweep.reversal_proven, false);
});

test("unverified provider clusters are visible but cannot prove a historical sweep", () => {
  const rows = [
    candle(START, { duration: 5 * MINUTE, low: 99, high: 101, close: 100 }),
    candle(START + 5 * MINUTE, { duration: 5 * MINUTE, low: 97, high: 100, close: 98 }),
    candle(START + 10 * MINUTE, { duration: 5 * MINUTE, low: 98, high: 101, close: 100 }),
    candle(START + 15 * MINUTE, { duration: 5 * MINUTE, low: 99, high: 101, close: 100 }),
    candle(START + 20 * MINUTE, { duration: 5 * MINUTE, low: 99, high: 101, close: 100 }),
  ];
  const pools = detectStopPools({
    candles: rows,
    liquidation_clusters: [{
      level_price: 98,
      side: "LONG_LIQUIDATION_BELOW",
      last_seen_ts: START,
      provider_evidence_eligible: false,
    }],
  });
  const provider = pools.levels.find((row) => row.type === "PROVIDER_REPORTED_LIQUIDATION_CLUSTER");
  assert.equal(provider.evidence_eligible, false);
  assert.equal(provider.sweep_eligible, false);
  const result = detectLiquiditySweep({ candles: rows, pools: [provider] });
  assert.equal(result.sweep_detected, false);
});

test("a stop pool cannot be swept before the level existed", () => {
  const rows = [
    candle(START, { duration: 5 * MINUTE, low: 99, high: 101, close: 100 }),
    candle(START + 5 * MINUTE, { duration: 5 * MINUTE, low: 97, high: 100, close: 98 }),
    candle(START + 10 * MINUTE, { duration: 5 * MINUTE, low: 98, high: 101, close: 100 }),
    candle(START + 15 * MINUTE, { duration: 5 * MINUTE, low: 99, high: 101, close: 100 }),
    candle(START + 20 * MINUTE, { duration: 5 * MINUTE, low: 99, high: 101, close: 100 }),
  ];
  const result = detectLiquiditySweep({
    candles: rows,
    pools: [{
      side: "LOW",
      level: 98,
      type: "SWING_LOW",
      last_ts: START + 15 * MINUTE,
    }],
  });
  assert.equal(result.sweep_detected, false);
});

test("competing hypotheses never convert evidence score into probability", () => {
  const hypotheses = classifyCompetingHypotheses({
    event: { body_range_ratio: 0.1, close_location: 0.2, open_close_pct: -0.2, upper_wick_ratio: 0.2, lower_wick_ratio: 0.7 },
    flow: { delta: 1_000 },
    cross_exchange: { cross_exchange_confirmed: false },
    price_oi: { "1h": { classification: "PRICE_DOWN_OI_UP_POSSIBLE_NEW_SHORTS" } },
    oi_flush_rebuild: { detected: false },
    sweep: { sweep_detected: false, reclaim_detected: false },
    basis: { htx_basis_pct: -1 },
  });
  for (const key of ["ABSORPTION_ACCUMULATION", "DISTRIBUTION", "TWO_WAY_TRANSFER", "DERIVATIVE_LIQUIDATION_NOISE"]) {
    assert.equal(hypotheses[key].confidence, null);
    assert.equal(hypotheses[key].confidence_status, "UNCALIBRATED_SHADOW_EVIDENCE_NOT_PROBABILITY");
  }
  assert.ok(hypotheses.DISTRIBUTION.evidence_score > hypotheses.ABSORPTION_ACCUMULATION.evidence_score);
});

test("post-event outcome uses exact timestamp window, not the current price", () => {
  const eventClose = START + HOUR;
  const event = {
    event_close_ts: eventClose,
    open_close_pct: -0.2,
    candle: { open: 100, high: 102, low: 98, close: 100, volume: 1_000 },
  };
  const rows = Array.from({ length: 120 }, (_, i) => candle(eventClose + i * MINUTE, {
    open: 100 + i * 0.01,
    high: 100.2 + i * 0.01,
    low: 99.8 + i * 0.01,
    close: 100 + (i + 1) * 0.01,
    volume: 1,
  }));
  const outcome = computePostEventOutcome({
    event,
    horizon: "1h",
    series_by_timeframe: { "1m": rows, "4h": [], "1d": [] },
    as_of_ts: eventClose + HOUR,
  });
  assert.equal(outcome.status, DATA_STATUS.OK);
  assert.equal(outcome.price, rows[59].close);
  assert.notEqual(outcome.price, rows.at(-1).close);
  assert.equal(outcome.target_ts, eventClose + OUTCOME_HORIZONS["1h"]);
  assert.equal(
    outcome.anomaly_ease_of_movement,
    0,
    "tampered derived open_close_pct must not override the factual candle",
  );
});

test("directionless anomaly cannot retrospectively select the winning side", () => {
  const eventClose = START + HOUR;
  const rows = Array.from({ length: 60 }, (_, i) => candle(eventClose + i * MINUTE, {
    open: 100 + i * 0.02,
    high: 100.3 + i * 0.02,
    low: 99.8 + i * 0.02,
    close: 100 + (i + 1) * 0.02,
    volume: 1,
  }));
  const outcome = computePostEventOutcome({
    event: {
      timestamp: START,
      event_close_ts: eventClose,
      open_close_pct: -2,
      candle: { open: 102, high: 103, low: 98, close: 100, volume: 1_000 },
    },
    horizon: "1h",
    series_by_timeframe: { "1m": rows },
    funnel_stage: "ANOMALOUS_EVENT",
    as_of_ts: eventClose + HOUR,
    config: { missed_opportunity_mfe_pct: 1 },
  });
  assert.equal(outcome.outcome_class, "DIRECTIONLESS_MOVE_UP_NO_SIDE_SELECTED");
  assert.equal(outcome.direction_at_event, "NONE");
  assert.equal(outcome.mfe_pct, null);
  assert.equal(outcome.mae_pct, null);
  assert.equal(outcome.missed_opportunity_detected, null);
  assert.equal(outcome.false_rejection_candidate, null);
  assert.equal(outcome.late_entry_candidate, null);
  assert.ok(outcome.max_up_excursion_pct > 0);
});

test("MFE and Missed Opportunity use only a timely precommitted direction", () => {
  const eventClose = START + HOUR;
  const rows = Array.from({ length: 60 }, (_, index) => candle(eventClose + index * MINUTE, {
    high: 100.2 + index * 0.03,
    low: 99.8,
    close: 100 + (index + 1) * 0.02,
  }));
  const outcome = computePostEventOutcome({
    event: {
      timestamp: START,
      event_close_ts: eventClose,
      open_close_pct: 0,
      direction_at_event: "LONG",
      direction_locked_ts: eventClose,
      directional_evaluation_eligible: true,
      candle: { open: 100, high: 101, low: 99, close: 100, volume: 1_000 },
    },
    horizon: "1h",
    series_by_timeframe: { "1m": rows },
    funnel_stage: "ANOMALOUS_EVENT",
    as_of_ts: eventClose + HOUR,
    config: { missed_opportunity_mfe_pct: 1 },
  });
  assert.equal(outcome.direction_at_event, "LONG");
  assert.equal(outcome.directional_evaluation_eligible, true);
  assert.ok(outcome.mfe_pct > 1);
  assert.equal(outcome.missed_opportunity_detected, true);
  assert.equal(outcome.false_rejection_candidate, true);
});

test("all six horizons require and accept an exact complete native 15m trajectory", () => {
  const eventClose = START + 15 * MINUTE;
  const rows = Array.from({ length: 7 * 24 * 4 }, (_, index) => candle(
    eventClose + index * 15 * MINUTE,
    { duration: 15 * MINUTE, high: 102, low: 99, close: 100 + index * 0.001, volume: 2 },
  ));
  const event = {
    timestamp: START,
    event_close_ts: eventClose,
    direction_at_event: "NONE",
    directional_evaluation_eligible: false,
    candle: { open: 100, high: 101, low: 99, close: 100, volume: 100 },
  };
  for (const [horizon, duration] of Object.entries(OUTCOME_HORIZONS)) {
    const outcome = computePostEventOutcome({
      event,
      horizon,
      series_by_timeframe: { "15m": rows },
      as_of_ts: eventClose + duration,
    });
    assert.equal(outcome.status, DATA_STATUS.OK, horizon);
    assert.equal(outcome.trajectory_complete, true, horizon);
    assert.equal(outcome.source_timeframe, "15m", horizon);
    assert.equal(outcome.expected_bars, duration / (15 * MINUTE), horizon);
    assert.equal(outcome.observed_bars, outcome.expected_bars, horizon);
    assert.equal(outcome.trajectory_coverage_pct, 100, horizon);
  }
});

test("future, gapped and duplicate trajectories fail closed instead of becoming outcomes", () => {
  const eventClose = START + HOUR;
  const complete = Array.from({ length: 60 }, (_, index) => candle(eventClose + index * MINUTE));
  const event = { event_close_ts: eventClose, candle: { close: 100 } };
  const future = computePostEventOutcome({
    event, horizon: "1h", series_by_timeframe: { "1m": complete }, as_of_ts: eventClose + 59 * MINUTE,
  });
  assert.equal(future.status, DATA_STATUS.MISSING);
  assert.equal(future.trajectory_complete, false);
  assert.ok(future.missing_fields.includes("future_horizon_not_yet_closed"));

  for (const rows of [
    complete.filter((_, index) => index !== 30),
    [...complete, { ...complete[30] }],
  ]) {
    const result = computePostEventOutcome({
      event, horizon: "1h", series_by_timeframe: { "1m": rows }, as_of_ts: eventClose + HOUR,
    });
    assert.equal(result.status, DATA_STATUS.MISSING);
    assert.equal(result.trajectory_complete, false);
    assert.equal(result.retryable, true);
  }
});

test("outcome keeps timestamped funding before, during and after separate", () => {
  const eventClose = START + HOUR;
  const target = eventClose + HOUR;
  const rows = Array.from({ length: 60 }, (_, i) => candle(eventClose + i * MINUTE));
  const outcome = computePostEventOutcome({
    event: {
      timestamp: START,
      event_close_ts: eventClose,
      open_close_pct: -1,
      candle: { open: 101, high: 102, low: 99, close: 100, volume: 100 },
      funding_at_event: { funding_rate: -0.003, funding_time_ts: eventClose - HOUR },
    },
    horizon: "1h",
    series_by_timeframe: { "1m": rows },
    funding: {
      derived_settlement_interval_hours: 1,
      recent_history: [
        { funding_time_ts: eventClose + 30 * MINUTE, funding_rate: -0.004 },
        { funding_time_ts: target, funding_rate: -0.002 },
      ],
    },
    as_of_ts: target,
  });
  assert.equal(outcome.funding_before_during_after.status, DATA_STATUS.OK);
  assert.equal(outcome.funding_before_during_after.before.rate, -0.003);
  assert.equal(outcome.funding_before_during_after.during.count, 2);
  assert.equal(outcome.funding_before_during_after.after.rate, -0.002);
});

test("spot-perp basis requires synchronized snapshot timestamps", () => {
  const result = computeSpotPerpBasis({
    futures_snapshot: { timestamp: START, bbo: { best_bid: 99, best_ask: 101 } },
    spot_snapshot: { timestamp: START + 5 * MINUTE, ticker_24h: { last_price: 100 } },
  });
  assert.equal(result.htx_basis_pct, null);
  assert.equal(result.venues[0].status, DATA_STATUS.MISSING);
});

test("missing exact post-event candles remain retryable until source retention expires", () => {
  const result = computePostEventOutcome({
    event: { event_close_ts: START, candle: { close: 100 } },
    horizon: "1h",
    series_by_timeframe: { "1m": [], "4h": [], "1d": [] },
    as_of_ts: START + HOUR,
  });
  assert.equal(result.status, DATA_STATUS.MISSING);
  assert.equal(result.no_confirmed_historical_data, false);
  assert.equal(result.retryable, true);
  assert.equal(result.trajectory_complete, false);
});

test("7d outcome uses exact native hourly history when boundaries match", () => {
  const eventClose = START + HOUR;
  const event = {
    event_close_ts: eventClose,
    open_close_pct: -0.2,
    candle: { open: 100, high: 102, low: 98, close: 100, volume: 1_000 },
  };
  const rows = Array.from({ length: 7 * 24 }, (_, index) =>
    candle(eventClose + index * HOUR, {
      duration: HOUR,
      open: 100 + index * 0.01,
      high: 100.3 + index * 0.01,
      low: 99.7 + index * 0.01,
      close: 100 + (index + 1) * 0.01,
      volume: 10,
    })
  );
  const outcome = computePostEventOutcome({
    event,
    horizon: "7d",
    series_by_timeframe: { "1m": [], "1h": rows, "4h": [], "1d": [] },
    as_of_ts: eventClose + OUTCOME_HORIZONS["7d"],
  });
  assert.equal(outcome.status, DATA_STATUS.OK);
  assert.equal(outcome.source_timeframe, "1h");
  assert.equal(outcome.price, rows.at(-1).close);
  assert.equal(outcome.target_ts, eventClose + OUTCOME_HORIZONS["7d"]);
});

test("integrated analysis detects HTX anomaly, preserves safety, and hides raw arrays from JSON", () => {
  const oneMinute = minuteHistory();
  const now = oneMinute.at(-1).ts + MINUTE;
  const hourly = aggregateCandles(oneMinute, HOUR, MINUTE).candles;
  const oi = hourly.map((row, i) => ({ ts: row.ts, volume: i < 10 ? 100 : i === 10 ? 90 : 96 }));
  const analysis = buildOpportunityShadowAnalysis({
    contract: "LSK-USDT",
    now,
    primary: {
      one_minute: oneMinute,
      four_hour: [],
      one_day: [],
      oi_contracts_hourly: oi,
      windows: {
        "1h": { synchronized_window_end_ts: hourly.at(-2).end_ts, price: { usable: true, change_pct: -0.2 }, open_interest: { usable: true, contracts: { change_pct: -5 } }, order_flow: { usable: true, taker_buy_usdt: 60, taker_sell_usdt: 40, delta_usdt: 20, sample_cvd_usdt: 20, sample_trades: 10 } },
      },
    },
    futures_snapshot: { bbo: { best_bid: 99, best_ask: 99.2 } },
    spot_snapshot: { ticker_24h: { last_price: 100 }, order_flow: { windows: {} } },
    funding: { current: { funding_rate: -0.001 } },
    external_hourly: { BYBIT_PERP: hourlyVenue(), OKX_SPOT: hourlyVenue(), BTC_SPOT: hourlyVenue(14, 12, 1), ETH_SPOT: hourlyVenue(14, 12, 1) },
  });
  assert.ok(analysis.events.some((row) => row.related_timeframes.includes("1h")));
  assert.equal(analysis.safety.live_probability, null);
  assert.equal(analysis.safety.telegram_started, false);
  assert.ok(analysis._series_by_timeframe["1m"].length > 0);
  assert.equal(JSON.stringify(analysis).includes("_series_by_timeframe"), false);
});

test("historical event cannot consume current flow, basis, Price x OI or funding", () => {
  const oneMinute = minuteHistory();
  const now = oneMinute.at(-1).ts + MINUTE;
  const analysis = buildOpportunityShadowAnalysis({
    contract: "LSK-USDT",
    now,
    primary: {
      one_minute: oneMinute,
      one_hour: aggregateCandles(oneMinute, HOUR, MINUTE).candles,
      one_day: [],
      oi_contracts_hourly: [],
      windows: {
        "1h": {
          synchronized_window_end_ts: now,
          price: { usable: true, change_pct: 1 },
          open_interest: { usable: true, contracts: { change_pct: 2 } },
          order_flow: { usable: true, taker_buy_usdt: 70, taker_sell_usdt: 30, delta_usdt: 40 },
        },
      },
    },
    futures_snapshot: { timestamp: now, bbo: { best_bid: 99, best_ask: 99.2 } },
    spot_snapshot: { timestamp: now, ticker_24h: { last_price: 100 }, order_flow: { windows: {} } },
    funding: { current: { funding_rate: -0.01 } },
  });
  const event = analysis.events.find((row) => row.related_timeframes.includes("1h"));
  assert.ok(event);
  assert.equal(event.market_flow.status, DATA_STATUS.MISSING);
  assert.equal(event.spot_perp_basis.status, DATA_STATUS.MISSING);
  assert.equal(event.price_oi_matrix["1h"].status, DATA_STATUS.MISSING);
  assert.equal(event.funding_at_event.status, DATA_STATUS.MISSING);
  assert.notEqual(event.funnel.stage, "ENTRY_TRIGGER_SHADOW");
});

test("post-event gap blocks confirmation and adversarial config remains bounded", () => {
  const oneMinute = minuteHistory().filter((_, index) => index !== 13 * 60);
  const now = START + 14 * HOUR;
  const analysis = buildOpportunityShadowAnalysis({
    contract: "LSK-USDT",
    now,
    primary: { one_minute: oneMinute, one_hour: [], one_day: [], windows: {} },
  }, { max_events_per_analysis: 999, max_stop_pools: 999, rolling_lookback: 999999 });
  const event = analysis.events.find((row) => row.related_timeframes.includes("1h"));
  assert.ok(event);
  assert.equal(event.post_event_current.status, DATA_STATUS.PARTIAL);
  assert.equal(event.funnel.entry_trigger_is_shadow_only, false);
  assert.ok(analysis.events.length <= 8);
  assert.equal(analysis.capacity.computed_events_cap, 8);
  assert.ok(event.stop_pools.levels.length <= 12);
});

test("control sample is explicitly limited to Deep-Check population", () => {
  const hourly = hourlyVenue(10 * 24, -1, 1);
  const analysis = buildOpportunityShadowAnalysis({
    contract: "CONTROL-USDT",
    now: hourly.at(-1).end_ts,
    primary: { one_minute: [], one_hour: hourly, four_hour: [], one_day: [], windows: {} },
  }, { control_sample_modulus: 1 });
  assert.equal(analysis.events.length, 0);
  assert.equal(analysis.control_sample.control_group, true);
  assert.equal(analysis.control_sample.control_population, "DEEP_CHECK_ELIGIBLE_MATURE_ISOLATED_ONLY");
  assert.equal(analysis.control_sample.control_eligible, true);
  assert.ok(analysis.control_sample.event_close_ts + OUTCOME_HORIZONS["7d"] <= hourly.at(-1).end_ts);
});

test("control selection rejects truncated scans and stays outside related signal windows", () => {
  const hourly = hourlyVenue(12 * 24, -1, 1);
  const now = hourly.at(-1).end_ts;
  const rejected = selectIndependentControl({
    contract: "LSK-USDT", hourly, scan_truncated: true, now, config: { control_sample_modulus: 1 },
  });
  assert.equal(rejected.event, null);
  assert.equal(rejected.status, "CONTROL_REJECTED_SIGNAL_SCAN_TRUNCATED");

  const signal = {
    contract: "LSK-USDT",
    exchange: "HTX",
    timestamp: START + 4 * 24 * HOUR,
    event_close_ts: START + 4 * 24 * HOUR + HOUR,
  };
  const selected = selectIndependentControl({
    contract: "LSK-USDT",
    hourly,
    signal_episodes: [signal],
    now,
    config: { control_sample_modulus: 1, control_exclusion_ms: 24 * HOUR },
  });
  assert.ok(selected.event);
  assert.notEqual(selected.event.timestamp, signal.timestamp);
  assert.ok(
    selected.event.event_close_ts <= signal.timestamp - 24 * HOUR ||
    selected.event.timestamp >= signal.event_close_ts + 24 * HOUR,
  );
  assert.equal(selected.event.control_non_anomalous_verified, true);
});

test("incomplete CVD cannot enter hypotheses or promote the Opportunity Funnel", () => {
  const hourly = hourlyVenue(14, 13, 6);
  const now = hourly.at(-1).end_ts;
  const analysis = buildOpportunityShadowAnalysis({
    contract: "LSK-USDT",
    now,
    primary: {
      one_minute: [],
      one_hour: hourly,
      four_hour: [],
      one_day: [],
      windows: {
        "1h": {
          synchronized_window_end_ts: now,
          price: { usable: true, change_pct: 0.1 },
          open_interest: { usable: true, contracts: { change_pct: 1 } },
          order_flow: {
            usable: true,
            taker_buy_usdt: 900,
            taker_sell_usdt: 100,
            delta_usdt: 800,
            sample_cvd_usdt: 800,
            sample_trades: 9,
            cvd_delta_quality: {
              status: "INCOMPLETE_OR_UNVERIFIED",
              reliable: false,
              trade_count_exact_match: false,
              factual_1m_trade_count: 10,
              completeness_ratio: 0.9,
            },
          },
        },
      },
    },
  });
  const event = analysis.events.find((row) => row.related_timeframes.includes("1h"));
  assert.ok(event);
  assert.equal(event.market_flow.status, DATA_STATUS.PARTIAL);
  assert.equal(event.market_flow.cvd_delta_reliable, false);
  assert.equal(event.market_flow.delta, null);
  assert.equal(event.hypotheses.ABSORPTION_ACCUMULATION.missing_evidence.includes("timestamp_aligned_taker_flow"), true);
  assert.notEqual(event.funnel.stage, "ENTRY_TRIGGER_SHADOW");
});

test("a directionless anomaly cannot inherit a winning side from observation context", () => {
  const currentHourly = hourlyVenue(14, 13, 6);
  const currentNow = currentHourly.at(-1).end_ts;
  const timely = buildOpportunityShadowAnalysis({
    contract: "LSK-USDT",
    now: currentNow,
    direction_context: {
      direction_hint: "LONG",
      observed_ts: currentNow,
      eligible: true,
      data_quality: "OK",
      source: "TEST_PRECOMMITMENT",
    },
    primary: { one_minute: [], one_hour: currentHourly, four_hour: [], one_day: [], windows: {} },
  });
  assert.equal(timely.events[0].direction_at_event, "NONE");
  assert.equal(timely.events[0].directional_evaluation_eligible, false);
  assert.equal(
    timely.events[0].direction_lock_status,
    "DIRECTIONLESS_SOURCE_CANNOT_BE_RETROFITTED_FROM_OBSERVATION_CONTEXT",
  );
  assert.equal(timely.events[0].rejected_observation_direction_hint, "LONG");

  const oldHourly = hourlyVenue(14, 12, 6);
  const lateNow = oldHourly.at(-1).end_ts;
  const historical = buildOpportunityShadowAnalysis({
    contract: "LSK-USDT",
    now: lateNow,
    direction_context: {
      direction_hint: "SHORT",
      observed_ts: lateNow,
      eligible: true,
      data_quality: "OK",
    },
    primary: { one_minute: [], one_hour: oldHourly, four_hour: [], one_day: [], windows: {} },
  });
  const oldEvent = historical.events[0];
  assert.equal(oldEvent.direction_at_event, "NONE");
  assert.equal(oldEvent.directional_evaluation_eligible, false);
  assert.equal(oldEvent.funnel.stage, "ANOMALOUS_EVENT");
  assert.equal(oldEvent.observation_timing.retrospective_promotion_forbidden, true);
  assert.ok(oldEvent.funnel.drop_reasons.includes("HISTORICAL_BACKFILL_HAS_NO_PRECOMMITTED_FUNNEL_STATE"));
});

test("immutable safety envelope disables every live action", () => {
  const safety = safetyEnvelope();
  assert.deepEqual({
    probability: safety.live_probability,
    signal: safety.live_signal,
    validation: safety.validated_signal,
    telegram: safety.telegram_started,
    execution: safety.trading_execution,
    tuning: safety.automatic_weight_tuning,
  }, { probability: null, signal: false, validation: false, telegram: false, execution: false, tuning: false });
});
