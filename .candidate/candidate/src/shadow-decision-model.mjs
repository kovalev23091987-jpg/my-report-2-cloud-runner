const RULES_VERSION = "shadow-dc-eq-dq-v1.3-funding-context-only";

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round2(value) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

function unwrap(result) {
  if (!result || typeof result !== "object") return {};
  if (result.status === "fulfilled" && result.data && typeof result.data === "object") {
    return result.data;
  }
  if (result.data && typeof result.data === "object" && result.status !== "rejected") {
    return result.data;
  }
  return result;
}

function upper(value) {
  return String(value ?? "").trim().toUpperCase();
}

function closed(value) {
  return String(value ?? "").trim().toLowerCase() === "closed";
}

function verifiedCvdQuality(flow) {
  const quality = flow?.cvd_delta_quality;
  return Boolean(
    flow?.cvd_delta_reliable === true &&
    quality?.status === "COMPLETE" &&
    quality?.reliable === true &&
    quality?.trade_count_exact_match === true &&
    quality?.raw_record_integrity_complete === true &&
    quality?.record_integrity?.complete === true
  );
}

function extractSpotDelta(spotData) {
  const candidates = [
    spotData?.order_flow?.windows?.["1h"],
    spotData?.windows?.["1h"]?.order_flow,
    spotData?.flow_windows?.["1h"],
  ];
  for (const flow of candidates) {
    if (!verifiedCvdQuality(flow)) continue;
    const n = finite(
      flow?.factual_cvd?.delta_pct_of_turnover ??
      flow?.delta_pct_of_turnover
    );
    if (n !== null) return n;
  }
  return null;
}

function extractReliableFuturesDelta(window) {
  const flow = window?.order_flow;
  return verifiedCvdQuality(flow) ? finite(flow?.delta_pct_of_turnover) : null;
}

function extractFundingPct(futuresData) {
  const direct = finite(futuresData?.funding?.funding_rate_pct ?? futuresData?.htx_funding?.funding_rate_pct);
  if (direct !== null) return direct;
  const rate = finite(futuresData?.funding?.funding_rate ?? futuresData?.htx_funding?.funding_rate);
  return rate === null ? null : rate * 100;
}

function extractOiChange(window) {
  return finite(
    window?.open_interest?.contracts?.change_pct ??
      window?.open_interest?.value_usdt?.change_pct ??
      window?.open_interest?.change_pct
  );
}

function addSignedFeature(state, label, rawValue, normalizer, weight, invert = false) {
  const value = finite(rawValue);
  if (value === null) {
    state.features[label] = { available: false, value: null, weight };
    return;
  }
  const signed = invert ? -value : value;
  const intensity = clamp(Math.abs(signed) / normalizer, 0, 1);
  const contribution = weight * intensity;
  state.availableWeight += weight;
  if (signed > 0) state.longSupport += contribution;
  if (signed < 0) state.shortSupport += contribution;
  state.features[label] = {
    available: true,
    value: round2(value),
    normalizer,
    weight,
    intensity: round2(intensity),
    contribution_long: signed > 0 ? round2(contribution) : 0,
    contribution_short: signed < 0 ? round2(contribution) : 0,
    interpretation: invert ? "contrarian_sign_only" : "directional_sign_only",
  };
}

export function buildShadowDecisionTelemetry({
  contract,
  now = Date.now(),
  futures,
  spot,
  trajectory,
  history,
  dataSufficiency,
} = {}) {
  const futuresData = unwrap(futures);
  const spotData = unwrap(spot);
  const trajectoryData = unwrap(trajectory);
  const historyData = unwrap(history);
  const windows = trajectoryData?.windows || {};
  const futureCoverage = futuresData?.coverage || {};
  const trajectoryCoverage = trajectoryData?.coverage || {};
  const spotQuality = upper(spotData?.quality_status || "UNKNOWN");

  const state = {
    longSupport: 0,
    shortSupport: 0,
    availableWeight: 0,
    features: {},
  };

  addSignedFeature(state, "price_1h_pct", windows?.["1h"]?.price?.change_pct, 2, 16);
  addSignedFeature(state, "price_4h_pct", windows?.["4h"]?.price?.change_pct, 5, 12);
  addSignedFeature(state, "price_24h_pct", windows?.["24h"]?.price?.change_pct, 12, 6);
  addSignedFeature(state, "futures_flow_1h_delta_pct", extractReliableFuturesDelta(windows?.["1h"]), 20, 14);
  addSignedFeature(state, "futures_flow_4h_delta_pct", extractReliableFuturesDelta(windows?.["4h"]), 20, 10);
  addSignedFeature(state, "spot_flow_delta_pct", extractSpotDelta(spotData), 20, 10);
  const fundingContext = extractFundingPct(futuresData);
  state.features.funding_pct_contrarian = fundingContext === null
    ? { available: false, value: null, weight: 0, interpretation: "context_only_not_directional" }
    : {
        available: true,
        value: round2(fundingContext),
        normalizer: null,
        weight: 0,
        intensity: null,
        contribution_long: 0,
        contribution_short: 0,
        interpretation: "context_only_not_directional",
      };

  const dcLong = state.availableWeight > 0
    ? (state.longSupport / state.availableWeight) * 100
    : null;
  const dcShort = state.availableWeight > 0
    ? (state.shortSupport / state.availableWeight) * 100
    : null;

  const sampleCoverageValue =
    futureCoverage?.htx_futures_order_flow_sample;
  const sampleCoverageForExecution =
    sampleCoverageValue === null || sampleCoverageValue === undefined
      ? futureCoverage?.htx_futures_order_flow
      : sampleCoverageValue;
  const executionFutureChecks = [
    ["htx_futures_liquidity", closed(futureCoverage?.htx_futures_liquidity)],
    ["htx_futures_order_flow_sample", closed(sampleCoverageForExecution)],
    ["htx_open_interest", closed(futureCoverage?.htx_open_interest)],
    ["htx_funding", closed(futureCoverage?.htx_funding)],
  ];
  const directionalFutureKeys = [
    "htx_futures_order_flow",
  ];
  const coreTrajectoryKeys = [
    "price_1h",
    "price_4h",
    "oi_1h",
    "oi_4h",
    "funding_current",
    "funding_history",
  ];
  const extendedTrajectoryKeys = ["flow_1h", "flow_4h", "flow_24h", "price_24h", "oi_24h"];
  const coverageChecks = [
    ...executionFutureChecks.map(([key, ok]) => ["futures." + key, ok]),
    ...directionalFutureKeys.map((key) => ["futures." + key, closed(futureCoverage?.[key])]),
    ...coreTrajectoryKeys.map((key) => ["trajectory." + key, closed(trajectoryCoverage?.[key])]),
    ...extendedTrajectoryKeys.map((key) => ["trajectory." + key, closed(trajectoryCoverage?.[key])]),
    ["spot.quality_GREEN", spotQuality === "GREEN"],
  ];
  const closedCount = coverageChecks.filter(([, ok]) => ok).length;
  const htxCoveragePct = coverageChecks.length ? (closedCount / coverageChecks.length) * 100 : 0;

  const sufficiency = upper(
    dataSufficiency?.classification ??
      dataSufficiency?.core_classification ??
      dataSufficiency?.overall ??
      dataSufficiency?.status ??
      dataSufficiency?.data_sufficiency ??
      "UNKNOWN"
  );
  const coreFuturesClosed = executionFutureChecks.every(([, ok]) => ok);
  const coreTrajectoryClosed = coreTrajectoryKeys.every((key) => closed(trajectoryCoverage?.[key]));
  const coreFlowClosed = closed(trajectoryCoverage?.flow_1h) && closed(trajectoryCoverage?.flow_4h);

  let dqStatus = "PARTIAL";
  if (sufficiency === "INSUFFICIENT" || !coreFuturesClosed || !coreTrajectoryClosed) {
    dqStatus = "INSUFFICIENT";
  } else if (spotQuality === "GREEN" && coreFlowClosed) {
    dqStatus = "HTX_CLOSED_EXTERNAL_CHAINS_MISSING";
  }

  const liquidityClosed = closed(futureCoverage?.htx_futures_liquidity);
  const tradesSampleClosed = closed(sampleCoverageForExecution);
  const timingMeasurable = closed(trajectoryCoverage?.price_5m) && closed(trajectoryCoverage?.price_15m);

  const spreadBps = finite(futuresData?.liquidity?.spread_bps ?? futuresData?.bbo?.spread_bps);
  const buyImpactBps = finite(futuresData?.liquidity?.buy_market_impact?.impact_bps);
  const sellImpactBps = finite(futuresData?.liquidity?.sell_market_impact?.impact_bps);
  const buyFillPct = finite(futuresData?.liquidity?.buy_market_impact?.fill_ratio_pct);
  const sellFillPct = finite(futuresData?.liquidity?.sell_market_impact?.fill_ratio_pct);
  const htxExecutionGateClosed = Boolean(
    coreFuturesClosed &&
    liquidityClosed &&
    tradesSampleClosed &&
    spreadBps !== null &&
    buyImpactBps !== null &&
    sellImpactBps !== null &&
    buyFillPct !== null && buyFillPct >= 99.9 &&
    sellFillPct !== null && sellFillPct >= 99.9
  );
  const eqStatus = htxExecutionGateClosed && timingMeasurable ? "SHADOW_MEASURABLE" : "NOT_CLOSED";

  let directionHint = "NEUTRAL";
  if (dcLong !== null && dcShort !== null) {
    if (dcLong - dcShort >= 10) directionHint = "LONG";
    if (dcShort - dcLong >= 10) directionHint = "SHORT";
  }

  const stage = dqStatus === "INSUFFICIENT"
    ? "OBSERVE_DATA_INSUFFICIENT"
    : directionHint === "LONG"
      ? "SHADOW_OBSERVE_LONG_BIAS"
      : directionHint === "SHORT"
        ? "SHADOW_OBSERVE_SHORT_BIAS"
        : "SHADOW_OBSERVE_NEUTRAL";

  const requiredMissingChains = [
    "cross_exchange_derivatives",
    "btc_eth_and_sector_relative_strength",
    "smart_money_onchain",
    "supporting_risk_supply_social_fundamentals",
    "external_market_regime_timing",
    "portfolio_risk_if_positions_known",
  ];

  const observedTs = finite(now) ?? Date.now();
  const contractCode = String(contract || futuresData?.contract || trajectoryData?.contract || "").trim();
  const evidenceFlags = {
    funding_pct: round2(extractFundingPct(futuresData)),
    funding_interval_hours: round2(trajectoryData?.funding?.derived_settlement_interval_hours),
    price_1h_pct: round2(windows?.["1h"]?.price?.change_pct),
    price_4h_pct: round2(windows?.["4h"]?.price?.change_pct),
    price_24h_pct: round2(windows?.["24h"]?.price?.change_pct),
    futures_flow_1h_delta_pct: round2(extractReliableFuturesDelta(windows?.["1h"])),
    futures_flow_4h_delta_pct: round2(extractReliableFuturesDelta(windows?.["4h"])),
    spot_flow_delta_pct: round2(extractSpotDelta(spotData)),
    oi_1h_change_pct: round2(extractOiChange(windows?.["1h"])),
    oi_4h_change_pct: round2(extractOiChange(windows?.["4h"])),
    absorption_1h: windows?.["1h"]?.derived?.absorption_candidate?.value ?? null,
    absorption_4h: windows?.["4h"]?.derived?.absorption_candidate?.value ?? null,
    spot_quality: spotQuality,
    stage0_history_available: Boolean(historyData && Object.keys(historyData).length),
    htx_coverage_pct: round2(htxCoveragePct),
  };

  return {
    shadow_id: `${observedTs}:${contractCode || "UNKNOWN"}`,
    contract: contractCode,
    observed_ts: observedTs,
    observed_time_utc: new Date(observedTs).toISOString(),
    source: "DEEP_CHECK_INPUT",
    mode: "SHADOW_ONLY_NO_EXECUTION",
    rules_version: RULES_VERSION,
    calibrated: false,
    probability: null,
    score_semantics:
      "dc_shadow_* are uncalibrated HTX-only directional evidence-support proxies, NOT proven win probabilities and NOT live trading scores.",
    dc_shadow_long: round2(dcLong),
    dc_shadow_short: round2(dcShort),
    direction_hint: directionHint,
    direction_hint_semantics: "Calibration-only heuristic; never authorizes an entry or alert.",
    htx_execution_gate_closed: htxExecutionGateClosed,
    htx_execution_gate_semantics:
      "Factual HTX execution-data closure only: contract/liquidity/recent-trade sample/OI/funding plus full requested-notional fill are measurable. Exact-window CVD remains a separate directional-data-quality lane and is never synthesized. This flag alone never authorizes a trade.",
    eq: {
      status: eqStatus,
      score: null,
      calibrated: false,
      spread_bps: round2(spreadBps),
      buy_impact_bps: round2(buyImpactBps),
      sell_impact_bps: round2(sellImpactBps),
      buy_fill_ratio_pct: round2(buyFillPct),
      sell_fill_ratio_pct: round2(sellFillPct),
      recent_trades_sample_closed: tradesSampleClosed,
      exact_window_cvd_closed: closed(futureCoverage?.htx_futures_order_flow),
      price_5m_closed: closed(trajectoryCoverage?.price_5m),
      price_15m_closed: closed(trajectoryCoverage?.price_15m),
      note: "No good/bad execution threshold is promoted before calibration; raw execution telemetry is retained.",
    },
    dq: {
      status: dqStatus,
      full_score: null,
      htx_coverage_pct: round2(htxCoveragePct),
      htx_checks_closed: closedCount,
      htx_checks_total: coverageChecks.length,
      spot_quality: spotQuality,
      full_decision_sufficient: false,
      note: "HTX data quality can be measured, but full Decision Layer DQ cannot close while required external chains are absent from this Worker.",
    },
    stage,
    data_sufficiency: sufficiency || "UNKNOWN",
    required_missing_chains: requiredMissingChains,
    full_decision_eligible: false,
    actual_decision_generated: false,
    validated: false,
    telegram_started: false,
    live_execution_allowed: false,
    evidence_flags: evidenceFlags,
    feature_contributions: state.features,
    safety: {
      strategy_weights_changed: false,
      hard_veto_promoted: false,
      missing_data_coerced_to_zero: false,
      live_probability_generated: false,
      live_signal_generated: false,
      telegram_dispatch_allowed: false,
    },
    notes: [
      "Long and Short are evaluated separately as shadow telemetry.",
      "No 35/30/20/15 full Decision Layer score is claimed because Chain 2/4/5 and broader relative-strength/regime context are not all present in this Worker.",
      "The 10-point direction-hint margin and feature normalizers are calibration-only heuristics, not promoted trading thresholds.",
      "This record exists to accumulate counterfactual evidence before any live decision or Telegram wiring is permitted.",
    ],
  };
}

export const SHADOW_DECISION_RULES_VERSION = RULES_VERSION;
