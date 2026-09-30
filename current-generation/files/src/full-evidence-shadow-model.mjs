import { buildFullEvidenceEnvelope } from "./full-evidence-contract.mjs";

const FULL_EVIDENCE_RULES_VERSION = "full-evidence-shadow-v2-cross-venue-verification";

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function textOrNull(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s || null;
}

function compactEvidenceRow(row) {
  return {
    contract_code: row?.contract_code || null,
    chain: row?.chain || null,
    metric: row?.metric || null,
    source: row?.source || null,
    venue: row?.venue || null,
    market_type: row?.market_type || null,
    value: row?.value ?? null,
    unit: row?.unit || null,
    observed_ts: row?.observed_ts ?? null,
    // available_ts is the producer's factual observation/availability clock.
    // Preserve it explicitly so downstream receipt builders never infer one.
    available_ts: row?.available_ts ?? null,
    source_ts: row?.source_ts ?? null,
    age_sec: row?.age_sec ?? null,
    max_age_sec: row?.max_age_sec ?? null,
    max_future_sec: row?.max_future_sec ?? null,
    status: row?.status || null,
    venue_observation_status: row?.venue_observation_status || null,
    eligible_for_chain_closure: row?.eligible_for_chain_closure === true,
    freshness_status: row?.status === "STALE" ? "STALE" : (row?.status === "FUTURE" ? "FUTURE" : (row?.source_ts == null ? "MISSING_SOURCE_TIMESTAMP" : "CURRENT")),
    coverage_pct: row?.coverage_pct ?? null,
    history_coverage_pct: row?.history_coverage_pct ?? null,
    window: row?.window || null,
    symbol_verified: row?.symbol_verified === true,
    alias_required: row?.alias_required === true,
    alias_verified: row?.alias_verified === true,
    alias_verification_scope: row?.alias_verification_scope || null,
    asset_identity_verified: row?.asset_identity_verified === true,
    source_compatible: row?.source_compatible !== false,
    independence_group: row?.independence_group || null,
    primary_market_id: row?.primary_market_id || null,
    settlement_period: row?.settlement_period || null,
    contract_multiplier: row?.contract_multiplier ?? null,
    reason_code: row?.reason_code || null,
    fallback_closed: row?.fallback_closed === true,
    source_health: row?.source_health || null,
    conflict_status: row?.status === "CONFLICT" ? "CONFLICT" : null,
    source_incompatible: row?.status === "SOURCE_INCOMPATIBLE" || row?.source_compatible === false,
    not_closed: row?.status !== "CLOSED",
    error: row?.error ? String(row.error).slice(0, 180) : null,
    note: row?.note ? String(row.note).slice(0, 240) : null,
  };
}

function htxEvidenceFromShadow(shadowDecision, nowTs, { externalSpotFallback = false, externalSpotVenues = [] } = {}) {
  const contract = textOrNull(shadowDecision?.contract) || "UNKNOWN";
  const flags = shadowDecision?.evidence_flags || {};
  const htxCoverage = finiteOrNull(shadowDecision?.dq?.htx_coverage_pct ?? flags?.htx_coverage_pct);
  const eqStatus = String(shadowDecision?.eq?.status || "").toUpperCase();
  const dqStatus = String(shadowDecision?.dq?.status || "").toUpperCase();
  const explicitExecutionGate = shadowDecision?.htx_execution_gate_closed === true;
  const htxDqClosed = dqStatus === "CLOSED" || dqStatus.startsWith("HTX_CLOSED");
  // Execution closure and directional-data closure are deliberately separate.
  // Exact-window CVD / spot / trajectory gaps stay visible in DQ but must not
  // turn a factually measurable HTX execution lane into a synthetic failure.
  const executionClosed = explicitExecutionGate && eqStatus === "SHADOW_MEASURABLE" && htxCoverage !== null && htxCoverage > 0;
  const clocks = shadowDecision?.source_clocks || {};
  const executionSourceTs = finiteOrNull(clocks?.execution?.source_ts);
  const executionAvailableTs = finiteOrNull(clocks?.execution?.available_ts);
  const base = {
    contract_code: contract,
    chain: "HTX_EXECUTION",
    source: "HTX_OFFICIAL_VIA_REPORT2_HUB",
    venue: "HTX",
    market_type: "USDT_PERP",
    observed_ts: nowTs,
    available_ts: executionAvailableTs,
    source_ts: executionSourceTs,
    max_age_sec: 15 * 60,
    now_ts: nowTs,
    coverage_pct: htxCoverage,
    symbol_verified: true,
    alias_required: false,
    alias_verified: true,
    source_compatible: true,
    independence_group: "HTX_OFFICIAL",
    primary_market_id: `${contract}:HTX:USDT_PERP`,
    settlement_period: null,
    error: null,
  };
  const rows = [
    {
      ...base,
      metric: "execution_gate_status",
      value: executionClosed ? 1 : null,
      unit: "boolean",
      status: executionClosed ? "CLOSED" : "NOT_CLOSED",
      note: `explicit_htx_execution_gate=${explicitExecutionGate}; eq_status=${eqStatus || "UNKNOWN"}; dq_status=${dqStatus || "UNKNOWN"}; htx_dq_closed=${htxDqClosed}; htx_coverage_pct=${htxCoverage ?? "UNKNOWN"}; execution closure does not synthesize missing CVD`,
    },
  ];
  const metrics = [
    ["htx_funding_pct", flags?.funding_pct, "pct"],
    ["htx_price_1h_pct", flags?.price_1h_pct, "pct"],
    ["htx_price_4h_pct", flags?.price_4h_pct, "pct"],
    ["htx_price_24h_pct", flags?.price_24h_pct, "pct"],
    ["htx_oi_1h_change_pct", flags?.oi_1h_change_pct, "pct"],
    ["htx_oi_4h_change_pct", flags?.oi_4h_change_pct, "pct"],
    ["htx_futures_flow_1h_delta_pct", flags?.futures_flow_1h_delta_pct, "pct_of_turnover"],
    ["htx_futures_flow_4h_delta_pct", flags?.futures_flow_4h_delta_pct, "pct_of_turnover"],
    ["htx_spot_flow_delta_pct", flags?.spot_flow_delta_pct, "pct_of_turnover"],
    ["htx_spread_bps", shadowDecision?.eq?.spread_bps, "bps"],
    ["htx_buy_impact_bps", shadowDecision?.eq?.buy_impact_bps, "bps"],
    ["htx_sell_impact_bps", shadowDecision?.eq?.sell_impact_bps, "bps"],
  ];
  for (const [metric, rawValue, unit] of metrics) {
    const value = finiteOrNull(rawValue);
    const externalSpotClosesMetric = metric === "htx_spot_flow_delta_pct" && value === null && externalSpotFallback;
    rows.push({
      ...base,
      source_ts: finiteOrNull((metric.startsWith('htx_spot_') ? clocks?.spot : metric.startsWith('htx_price_') || metric.startsWith('htx_oi_') || metric.startsWith('htx_futures_flow_') ? clocks?.trajectory : clocks?.execution)?.source_ts),
      available_ts: finiteOrNull((metric.startsWith('htx_spot_') ? clocks?.spot : metric.startsWith('htx_price_') || metric.startsWith('htx_oi_') || metric.startsWith('htx_futures_flow_') ? clocks?.trajectory : clocks?.execution)?.available_ts),
      metric,
      value,
      unit,
      status: value === null ? "NOT_CLOSED" : "CLOSED",
      fallback_closed: externalSpotClosesMetric,
      reason_code: externalSpotClosesMetric ? "EXTERNAL_SPOT_FALLBACK_USED" : null,
      note: value === null
        ? (externalSpotClosesMetric
          ? `HTX Spot отсутствует; внешний Spot подтверждён: ${externalSpotVenues.join(", ") || "EXTERNAL"}.`
          : "Metric absent in factual HTX shadow telemetry; not coerced to zero.")
        : null,
    });
  }

  const fundingPct = finiteOrNull(flags?.funding_pct);
  const fundingIntervalHours = finiteOrNull(flags?.funding_interval_hours);
  const fundingRate = fundingPct === null ? null : fundingPct / 100;
  const oi1hChange = finiteOrNull(flags?.oi_1h_change_pct);
  const price4hChange = finiteOrNull(flags?.price_4h_pct);
  const chain2Base = {
    ...base,
    chain: "CROSS_EXCHANGE_DERIVATIVES",
    source_ts: finiteOrNull(clocks?.trajectory?.source_ts),
    available_ts: finiteOrNull(clocks?.trajectory?.available_ts),
    note: null,
  };
  rows.push({
    ...chain2Base,
    metric: "funding_rate",
    value: fundingRate,
    unit: "rate_per_settlement",
    status: fundingRate !== null && fundingIntervalHours !== null && fundingIntervalHours > 0 ? "CLOSED" : "NOT_CLOSED",
    settlement_period: fundingIntervalHours !== null && fundingIntervalHours > 0 ? `${fundingIntervalHours}h` : null,
    note: fundingRate === null || fundingIntervalHours === null || fundingIntervalHours <= 0
      ? "HTX funding or factual settlement interval is missing; not eligible for cross-venue funding closure."
      : "HTX is the primary execution venue and counts as one factual venue in cross-exchange funding verification.",
  });
  rows.push({
    ...chain2Base,
    metric: "oi_change_1h",
    value: oi1hChange,
    unit: "pct",
    status: oi1hChange === null ? "NOT_CLOSED" : "CLOSED",
    window: "1h",
    note: oi1hChange === null ? "HTX 1h OI trajectory unavailable." : "Factual synchronized HTX 1h OI trajectory reused; no extra fetch.",
  });
  rows.push({
    ...chain2Base,
    metric: "price_change_4h",
    value: price4hChange,
    unit: "pct",
    status: price4hChange === null ? "NOT_CLOSED" : "CLOSED",
    window: "4h",
    note: price4hChange === null ? "HTX 4h price trajectory unavailable." : "Factual synchronized HTX 4h price trajectory reused; no extra fetch.",
  });

  // Native two-sided depth is factual spot-market confirmation, not signed
  // flow or a second directional vote. Require the exact producer receipt.
  const spotMarket = flags?.spot_market_confirmation;
  if (spotMarket?.status === "CLOSED" && spotMarket?.version === "htx-native-spot-depth-confirmation-v1" &&
      spotMarket.contract_code === contract && spotMarket.identity_scope === "EXACT_NATIVE_HTX_REQUEST_AND_RESPONSE_CHANNEL" &&
      spotMarket.metric === "spot_depth_two_sided_usdt" && spotMarket.max_age_sec === 300 &&
      finiteOrNull(spotMarket.value) > 0 && spotMarket.directional_votes === 0 && spotMarket.flow_window_closed === false &&
      Number.isSafeInteger(spotMarket.source_ts) && Number.isSafeInteger(spotMarket.available_ts) &&
      spotMarket.source_ts <= spotMarket.available_ts && spotMarket.available_ts <= nowTs &&
      spotMarket.valid_until_ts === spotMarket.source_ts + 300000 && nowTs <= spotMarket.valid_until_ts) {
    rows.push({...base,chain:"MARKET_STRENGTH_SPOT",metric:spotMarket.metric,market_type:"SPOT",
      value:spotMarket.value,unit:"USDT",source_ts:spotMarket.source_ts,available_ts:spotMarket.available_ts,
      max_age_sec:300,coverage_pct:100,status:"CLOSED",eligible_for_chain_closure:true,
      independence_group:"HTX_OFFICIAL_SPOT",primary_market_id:`${contract}:HTX:SPOT`,
      note:"Exact fresh native HTX two-sided spot depth; no buy/sell flow, directional vote or 24h completeness is inferred."});
  }

  const spotFlow = finiteOrNull(flags?.spot_flow_delta_pct);
  rows.push({
    ...base,
    chain: "MARKET_STRENGTH_SPOT",
    source_ts: finiteOrNull(clocks?.spot?.source_ts),
    available_ts: finiteOrNull(clocks?.spot?.available_ts),
    metric: "htx_spot_flow_delta_pct",
    market_type: "SPOT",
    value: spotFlow,
    unit: "pct_of_turnover",
    status: spotFlow === null ? "NOT_CLOSED" : "CLOSED",
    fallback_closed: spotFlow === null && externalSpotFallback,
    reason_code: spotFlow === null && externalSpotFallback ? "EXTERNAL_SPOT_FALLBACK_USED" : null,
    independence_group: "HTX_OFFICIAL_SPOT",
    primary_market_id: `${contract}:HTX:SPOT`,
    note: spotFlow === null
      ? (externalSpotFallback
        ? `HTX Spot отсутствует; внешний Spot подтверждён: ${externalSpotVenues.join(", ") || "EXTERNAL"}.`
        : "HTX Spot factual flow is unavailable for this observation; Chain 3 cannot be fully closed from RS alone.")
      : "Factual HTX Spot flow carried from shadow telemetry; no directional interpretation is applied here.",
  });

  return rows;
}

function chainStatus(envelope) {
  const result = {};
  const chains = [
    "HTX_EXECUTION",
    "CROSS_EXCHANGE_DERIVATIVES",
    "MARKET_STRENGTH_SPOT",
    "SMART_MONEY_ONCHAIN",
    "SUPPORTING_RISK",
    "MARKET_REGIME_TIMING",
    "PORTFOLIO_RISK",
  ];

  const usableRow = (row) =>
    row?.status === "CLOSED" &&
    row?.error === null &&
    row?.symbol_verified === true &&
    row?.source_compatible !== false &&
    row?.alias_verified !== false &&
    (row?.alias_required !== true || row?.asset_identity_verified === true) &&
    row?.primary_market_id &&
    row?.source_ts != null &&
    Number(row?.max_age_sec) > 0 &&
    Number(row?.coverage_pct) > 0 &&
    Number(row?.coverage_pct) <= 100 &&
    row?.value != null;

  for (const chain of chains) {
    const rows = (envelope?.evidence || []).filter(row => row?.chain === chain);
    const usable = rows.filter(usableRow);
    const groups = new Set(usable.map(row => row?.independence_group || row?.source).filter(Boolean));
    const metrics = new Set(usable.map(row => row?.metric).filter(Boolean));
    const venues = new Set(usable.map(row => row?.venue).filter(Boolean));
    const reasons = [];
    const unresolvedChainConflict = (envelope?.conflicts || []).some(conflict => {
      if (conflict?.unresolved !== true) return false;
      if (Array.isArray(conflict?.chains) && conflict.chains.includes(chain)) return true;
      const sourceMetrics = Array.isArray(conflict?.source_metrics) ? conflict.source_metrics : [conflict?.metric];
      return rows.some(row => sourceMetrics.includes(row?.metric));
    });
    let chainClosed = false;

    if (chain === "HTX_EXECUTION") {
      const gate = usable.find(row => row?.metric === "execution_gate_status" && Number(row?.value) === 1);
      chainClosed = Boolean(gate);
      if (!chainClosed) reasons.push("HTX_EXECUTION_GATE_NOT_CLOSED");
    } else if (chain === "CROSS_EXCHANGE_DERIVATIVES") {
      const fundingVenues = new Set(usable.filter(row => row?.metric === "funding_rate").map(row => row?.venue).filter(Boolean));
      const fundingWithoutPeriod = usable.filter(row => row?.metric === "funding_rate" && !row?.settlement_period);
      const oiTrajectory = usable.some(row => /^oi_change_/i.test(String(row?.metric || "")));
      const priceTrajectory = usable.some(row => /^price_change_/i.test(String(row?.metric || "")));
      if (fundingVenues.size < 2) reasons.push("NEED_FUNDING_FROM_2_INDEPENDENT_VENUES");
      if (fundingWithoutPeriod.length) reasons.push("FUNDING_PERIOD_NOT_VERIFIED");
      if (!oiTrajectory) reasons.push("OI_TRAJECTORY_NOT_CLOSED");
      if (!priceTrajectory) reasons.push("PRICE_TRAJECTORY_NOT_CLOSED");
      if (groups.size < 2) reasons.push("LOW_DERIVATIVES_SOURCE_INDEPENDENCE");
      if (unresolvedChainConflict) reasons.push("UNRESOLVED_CROSS_VENUE_CONFLICT");
      chainClosed = reasons.length === 0;
    } else if (chain === "MARKET_STRENGTH_SPOT") {
      const requiredRs = [
        "rs_vs_btc_1h", "rs_vs_eth_1h",
        "rs_vs_btc_4h", "rs_vs_eth_4h",
        "rs_vs_btc_24h", "rs_vs_eth_24h",
      ];
      const missingRs = requiredRs.filter(metric => !metrics.has(metric));
      const spotConfirmation = usable.some(row =>
        /^htx_spot_/i.test(String(row?.metric || "")) ||
        /^spot_(?:turnover|spread|depth|flow|delta|confirmation)/i.test(String(row?.metric || ""))
      );
      if (missingRs.length) reasons.push(`RS_WINDOWS_MISSING:${missingRs.join(",")}`);
      if (!spotConfirmation) reasons.push("SPOT_CONFIRMATION_NOT_CLOSED");
      if (unresolvedChainConflict) reasons.push("UNRESOLVED_CROSS_VENUE_CONFLICT");
      chainClosed = reasons.length === 0;
    } else {
      // Chain 4/5 and gate/layer chains remain explicitly not closed unless a
      // later calibrated implementation defines their own minimum closure set.
      chainClosed = false;
      if (usable.length === 0) reasons.push("NO_USABLE_EVIDENCE");
      else reasons.push("NO_PROMOTED_CHAIN_CLOSURE_RULE_IN_3_7");
    }

    result[chain] = {
      items: rows.length,
      usable_items: usable.length,
      independent_groups: groups.size,
      venues: [...venues].sort(),
      usable_metrics: [...metrics].sort(),
      statuses: [...new Set(rows.map(row => row?.status).filter(Boolean))].sort(),
      has_usable_evidence: usable.length > 0,
      // A CLOSED producer row that misses a newer strict eligibility field is
      // still partial diagnostics, never proof of chain closure. This retains
      // legacy observability without allowing it into the decision gate.
      closure_status: chainClosed ? "CLOSED" : (usable.length || rows.some(row => row?.status === "CLOSED") ? "PARTIAL" : "NOT_CLOSED"),
      chain_closed: chainClosed,
      closure_reasons: reasons,
    };
  }
  return result;
}

function compactAliasVerification(publicEvidence) {
  const v = publicEvidence?.alias_verification || {};
  const take = (x) => x ? {
    verified: x?.verified === true,
    status: x?.status || null,
    exact_symbol: x?.exact_symbol || null,
    contract_type: x?.contract_type || x?.instrument_type || null,
    settle_coin: x?.settle_coin || null,
    funding_interval_minutes: finiteOrNull(x?.funding_interval_minutes),
    http_status: finiteOrNull(x?.http_status),
    fetch_error: x?.fetch_error || null,
  } : null;
  return {
    alias_candidate_safe: v?.aliases?.alias_candidate_safe === true,
    reason: v?.aliases?.reason || null,
    bybit: take(v?.bybit),
    okx_swap: take(v?.okx_swap),
    okx_spot: take(v?.okx_spot),
    gate_futures: take(v?.gate_futures),
    binance_futures: take(v?.binance_futures),
    binance_spot: take(v?.binance_spot),
  };
}

export function buildFullEvidenceShadowRecord({ shadow_decision, public_evidence, now = Date.now(), decision_ts = now } = {}) {
  const shadow = shadow_decision || {};
  const publicEvidence = public_evidence || {};
  const observedTs = finiteOrNull(decision_ts) ?? finiteOrNull(shadow?.observed_ts) ?? finiteOrNull(publicEvidence?.observed_ts) ?? finiteOrNull(now) ?? Date.now();
  const contract = textOrNull(shadow?.contract) || textOrNull(publicEvidence?.contract_code) || "UNKNOWN";
  const external = (Array.isArray(publicEvidence?.evidence) ? publicEvidence.evidence : []).map(raw=>{
    const sourceTs=finiteOrNull(raw?.source_ts),availableTs=finiteOrNull(raw?.available_ts)??finiteOrNull(publicEvidence?.available_ts);
    const invalidAvailability=availableTs===null||availableTs>observedTs;
    const invalidSource=sourceTs===null;
    return raw?.status==='CLOSED'&&(invalidAvailability||invalidSource)
      ? {...raw,available_ts:availableTs,status:'NOT_CLOSED',reason_code:invalidAvailability?'EVIDENCE_AVAILABLE_AFTER_DECISION_OR_MISSING':'SOURCE_TIMESTAMP_MISSING',error:invalidAvailability?'EVIDENCE_AVAILABLE_AFTER_DECISION_OR_MISSING':'SOURCE_TIMESTAMP_MISSING'}
      : {...raw,available_ts:availableTs};
  });
  const usableExternalSpot = external.filter(row =>
    row?.chain === "MARKET_STRENGTH_SPOT" &&
    row?.market_type === "SPOT" &&
    row?.status === "CLOSED" &&
    row?.error == null &&
    row?.value != null &&
    row?.asset_identity_verified === true
  );
  const externalSpotVenues = [...new Set(usableExternalSpot.map(row => row?.venue).filter(Boolean))].sort();
  const externalSpotFallback = usableExternalSpot.length > 0 && finiteOrNull(shadow?.evidence_flags?.spot_flow_delta_pct) === null;
  const htxEvidence = htxEvidenceFromShadow(
    { ...shadow, contract },
    observedTs,
    { externalSpotFallback, externalSpotVenues },
  );
  const envelope = buildFullEvidenceEnvelope({
    contract_code: contract,
    observed_ts: observedTs,
    evidence: [...htxEvidence, ...external],
  });
  const status = chainStatus(envelope);
  const weightedChains = Object.keys(envelope?.fixed_decision_weights || {});
  const missingWeightedChains = weightedChains.filter(chain => status?.[chain]?.chain_closed !== true);
  const compactEvidence = (envelope?.evidence || []).map(compactEvidenceRow);
  const fullId = `${observedTs}:${contract}:full-evidence-v2`;

  return {
    full_evidence_id: fullId,
    shadow_id: shadow?.shadow_id || `${observedTs}:${contract}`,
    contract,
    observed_ts: observedTs,
    observed_time_utc: new Date(observedTs).toISOString(),
    mode: "FULL_EVIDENCE_SHADOW_NO_EXECUTION",
    rules_version: FULL_EVIDENCE_RULES_VERSION,
    contract_version: envelope?.contract_version || null,
    adapters_version: publicEvidence?.version || null,
    fixed_decision_weights: envelope?.fixed_decision_weights || null,
    strategy_weights_changed: false,
    htx_execution_gate_closed: envelope?.htx_execution_gate_closed === true,
    chain_status: status,
    missing_weighted_chains: missingWeightedChains,
    data_quality: envelope?.data_quality || null,
    conflicts: envelope?.conflicts || [],
    cross_venue_verification: {
      htx_spot_status: finiteOrNull(shadow?.evidence_flags?.spot_flow_delta_pct) === null ? "ABSENT_OR_UNAVAILABLE" : "CONFIRMED",
      external_spot_status: usableExternalSpot.length ? "CONFIRMED" : "NOT_CLOSED",
      external_spot_venues: externalSpotVenues,
      fallback_used: externalSpotFallback,
      reasons: externalSpotFallback ? ["EXTERNAL_SPOT_FALLBACK_USED"] : [],
      unresolved_critical_conflict: (envelope?.conflicts || []).some(conflict => conflict?.unresolved === true),
    },
    alias_verification: compactAliasVerification(publicEvidence),
    evidence_compact: compactEvidence,
    cross_venue_derivatives_detail: publicEvidence?.cross_venue_derivatives_detail || null,
    relative_strength_detail: publicEvidence?.relative_strength_detail || null,
    prior_htx_shadow: {
      dc_shadow_long: finiteOrNull(shadow?.dc_shadow_long),
      dc_shadow_short: finiteOrNull(shadow?.dc_shadow_short),
      direction_hint: shadow?.direction_hint || null,
      eq_status: shadow?.eq?.status || null,
      dq_status: shadow?.dq?.status || null,
      stage: shadow?.stage || null,
      spread_bps: finiteOrNull(shadow?.eq?.spread_bps),
      buy_impact_bps: finiteOrNull(shadow?.eq?.buy_impact_bps),
      sell_impact_bps: finiteOrNull(shadow?.eq?.sell_impact_bps),
    },
    decision: {
      dc_long: null,
      dc_short: null,
      directional_confidence_semantics: "NOT_PROMOTED_IN_3_7",
      eq: null,
      dq_status: envelope?.data_quality?.status || "NOT_CLOSED",
      full_decision_eligible: false,
      live_probability: null,
      live_signal: false,
      validated: false,
      telegram_started: false,
      trading_execution: false,
      note: "3.7 collects/fuses factual evidence and DQ. It does not invent chain scores for missing/unconfigured sources and does not promote a live decision.",
    },
    calibration_link: {
      shadow_outcome_rules_version: "shadow-outcome-v1",
      outcome_horizons_hours: [1,4,12,24],
      automatic_weight_tuning_enabled: false,
    },
    safety: {
      missing_data_coerced_to_zero: false,
      cross_venue_dispersion_called_conflict: false,
      cross_venue_divergence_preserved: true,
      cross_venue_values_averaged: false,
      strategy_weights_changed: false,
      full_decision_eligible: false,
      live_probability_generated: false,
      live_signal_generated: false,
      validated: false,
      telegram_dispatch_allowed: false,
      trading_execution_allowed: false,
    },
  };
}

export const FULL_EVIDENCE_SHADOW_RULES_VERSION = FULL_EVIDENCE_RULES_VERSION;
