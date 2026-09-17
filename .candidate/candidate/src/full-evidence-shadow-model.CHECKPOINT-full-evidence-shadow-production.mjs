const FULL_EVIDENCE_RULES_VERSION = "full-evidence-shadow-v1";

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
    conflict_status: row?.status === "CONFLICT" ? "CONFLICT" : null,
    source_incompatible: row?.status === "SOURCE_INCOMPATIBLE" || row?.source_compatible === false,
    not_closed: row?.status !== "CLOSED",
    error: row?.error ? String(row.error).slice(0, 180) : null,
    note: row?.note ? String(row.note).slice(0, 240) : null,
  };
}

function htxEvidenceFromShadow(shadowDecision, nowTs) {
  const contract = textOrNull(shadowDecision?.contract) || "UNKNOWN";
  const flags = shadowDecision?.evidence_flags || {};
  const htxCoverage = finiteOrNull(shadowDecision?.dq?.htx_coverage_pct ?? flags?.htx_coverage_pct);
  const eqStatus = String(shadowDecision?.eq?.status || "").toUpperCase();
  const dqStatus = String(shadowDecision?.dq?.status || "").toUpperCase();
  const explicitExecutionGate = shadowDecision?.htx_execution_gate_closed === true;
  const htxDqClosed = dqStatus === "CLOSED" || dqStatus.startsWith("HTX_CLOSED");
  const executionClosed = explicitExecutionGate && eqStatus === "SHADOW_MEASURABLE" && htxDqClosed && htxCoverage !== null && htxCoverage > 0;
  const base = {
    contract_code: contract,
    chain: "HTX_EXECUTION",
    source: "HTX_OFFICIAL_VIA_REPORT2_HUB",
    venue: "HTX",
    market_type: "USDT_PERP",
    observed_ts: nowTs,
    source_ts: nowTs,
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
      note: `explicit_htx_execution_gate=${explicitExecutionGate}; eq_status=${eqStatus || "UNKNOWN"}; dq_status=${dqStatus || "UNKNOWN"}; htx_coverage_pct=${htxCoverage ?? "UNKNOWN"}`,
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
    rows.push({
      ...base,
      metric,
      value,
      unit,
      status: value === null ? "NOT_CLOSED" : "CLOSED",
      note: value === null ? "Metric absent in factual HTX shadow telemetry; not coerced to zero." : null,
    });
  }

  const spotFlow = finiteOrNull(flags?.spot_flow_delta_pct);
  rows.push({
    ...base,
    chain: "MARKET_STRENGTH_SPOT",
    metric: "htx_spot_flow_delta_pct",
    market_type: "SPOT",
    value: spotFlow,
    unit: "pct_of_turnover",
    status: spotFlow === null ? "NOT_CLOSED" : "CLOSED",
    independence_group: "HTX_OFFICIAL_SPOT",
    primary_market_id: `${contract}:HTX:SPOT`,
    note: spotFlow === null
      ? "HTX Spot factual flow is unavailable for this observation; Chain 3 cannot be fully closed from RS alone."
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
      closure_status: chainClosed ? "CLOSED" : (usable.length ? "PARTIAL" : "NOT_CLOSED"),
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
    binance_futures: take(v?.binance_futures),
  };
}

export function buildFullEvidenceShadowRecord({ shadow_decision, public_evidence, now = Date.now() } = {}) {
  const shadow = shadow_decision || {};
  const publicEvidence = public_evidence || {};
  const observedTs = finiteOrNull(shadow?.observed_ts) ?? finiteOrNull(publicEvidence?.observed_ts) ?? finiteOrNull(now) ?? Date.now();
  const contract = textOrNull(shadow?.contract) || textOrNull(publicEvidence?.contract_code) || "UNKNOWN";
  const htxEvidence = htxEvidenceFromShadow({ ...shadow, contract }, observedTs);
  const external = Array.isArray(publicEvidence?.evidence) ? publicEvidence.evidence : [];
  const envelope = buildFullEvidenceEnvelope({
    contract_code: contract,
    observed_ts: observedTs,
    evidence: [...htxEvidence, ...external],
  });
  const status = chainStatus(envelope);
  const weightedChains = Object.keys(envelope?.fixed_decision_weights || {});
  const missingWeightedChains = weightedChains.filter(chain => status?.[chain]?.chain_closed !== true);
  const compactEvidence = (envelope?.evidence || []).map(compactEvidenceRow);
  const fullId = `${observedTs}:${contract}:full-evidence-v1`;

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
