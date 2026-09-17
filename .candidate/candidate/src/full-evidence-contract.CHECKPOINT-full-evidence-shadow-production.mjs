export const EVIDENCE_CONTRACT_VERSION = "full-evidence-v1";

export const FIXED_DECISION_WEIGHTS = Object.freeze({
  CROSS_EXCHANGE_DERIVATIVES: 35,
  MARKET_STRENGTH_SPOT: 30,
  SMART_MONEY_ONCHAIN: 20,
  SUPPORTING_RISK: 15,
});

const VALID_STATUS = new Set([
  "CLOSED",
  "PARTIAL",
  "NOT_CLOSED",
  "STALE",
  "FUTURE",
  "CONFLICT",
  "SOURCE_INCOMPATIBLE",
  "UNSUPPORTED",
]);

const VALID_CHAINS = new Set([
  "HTX_EXECUTION",
  "CROSS_EXCHANGE_DERIVATIVES",
  "MARKET_STRENGTH_SPOT",
  "SMART_MONEY_ONCHAIN",
  "SUPPORTING_RISK",
  "MARKET_REGIME_TIMING",
  "PORTFOLIO_RISK",
]);

function finiteOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function textOrNull(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s || null;
}

function asBool(v) {
  return v === true;
}

function normalizeStatus(v) {
  const s = String(v || "NOT_CLOSED").toUpperCase();
  return VALID_STATUS.has(s) ? s : "NOT_CLOSED";
}

export function normalizeEvidenceItem(raw = {}) {
  const chain = String(raw.chain || "").toUpperCase();
  const observedTs = finiteOrNull(raw.observed_ts);
  const sourceTs = finiteOrNull(raw.source_ts);
  const maxAgeSec = finiteOrNull(raw.max_age_sec);
  const maxFutureSec = finiteOrNull(raw.max_future_sec) ?? 60;
  const nowTs = finiteOrNull(raw.now_ts) ?? Date.now();
  const effectiveTs = sourceTs;
  const ageSec = effectiveTs === null ? null : (nowTs - effectiveTs) / 1000;
  const staleByAge = maxAgeSec !== null && ageSec !== null && ageSec > maxAgeSec;
  const futureByAge = ageSec !== null && ageSec < -maxFutureSec;
  const symbolVerified = asBool(raw.symbol_verified);
  const aliasRequired = asBool(raw.alias_required);
  const aliasVerified = !aliasRequired || asBool(raw.alias_verified);
  const sourceCompatible = raw.source_compatible !== false;

  let status = normalizeStatus(raw.status);
  if (!sourceCompatible || !aliasVerified) status = "SOURCE_INCOMPATIBLE";
  else if (status === "CLOSED" && sourceTs === null) status = "NOT_CLOSED";
  else if (futureByAge && status === "CLOSED") status = "FUTURE";
  else if (staleByAge && status === "CLOSED") status = "STALE";

  const coveragePct = finiteOrNull(raw.coverage_pct);
  if (status === "CLOSED" && (coveragePct === null || coveragePct <= 0 || coveragePct > 100)) {
    status = "NOT_CLOSED";
  }
  if (status === "CLOSED" && (raw.value === null || raw.value === undefined)) status = "NOT_CLOSED";
  if (status === "CLOSED" && aliasRequired && !asBool(raw.asset_identity_verified)) {
    status = "SOURCE_INCOMPATIBLE";
  }

  return {
    contract_code: textOrNull(raw.contract_code),
    chain: VALID_CHAINS.has(chain) ? chain : null,
    metric: textOrNull(raw.metric),
    source: textOrNull(raw.source),
    venue: textOrNull(raw.venue),
    market_type: textOrNull(raw.market_type),
    value: raw.value ?? null,
    unit: textOrNull(raw.unit),
    observed_ts: observedTs,
    source_ts: sourceTs,
    now_ts: nowTs,
    age_sec: ageSec,
    max_age_sec: maxAgeSec,
    max_future_sec: maxFutureSec,
    status,
    venue_observation_status: textOrNull(raw.venue_observation_status),
    eligible_for_chain_closure: asBool(raw.eligible_for_chain_closure),
    coverage_pct: coveragePct,
    history_coverage_pct: finiteOrNull(raw.history_coverage_pct),
    window: textOrNull(raw.window),
    source_health: textOrNull(raw.source_health),
    symbol_verified: symbolVerified,
    alias_required: aliasRequired,
    alias_verified: aliasVerified,
    alias_verification_scope: textOrNull(raw.alias_verification_scope),
    asset_identity_verified: asBool(raw.asset_identity_verified),
    source_compatible: sourceCompatible,
    independence_group: textOrNull(raw.independence_group),
    primary_market_id: textOrNull(raw.primary_market_id),
    settlement_period: textOrNull(raw.settlement_period),
    note: textOrNull(raw.note),
    error: textOrNull(raw.error),
  };
}

export function evidenceUsable(item) {
  const e = normalizeEvidenceItem(item);
  return Boolean(
    e.chain &&
    e.metric &&
    e.source &&
    e.contract_code &&
    e.symbol_verified &&
    e.source_compatible &&
    e.alias_verified &&
    (!e.alias_required || e.asset_identity_verified) &&
    e.primary_market_id &&
    e.source_ts !== null &&
    e.max_age_sec !== null && e.max_age_sec > 0 &&
    e.coverage_pct !== null && e.coverage_pct > 0 && e.coverage_pct <= 100 &&
    e.value !== null &&
    e.status === "CLOSED" &&
    e.error === null
  );
}

// Deliberately compare only evidence claiming to describe the SAME primary market.
// Cross-venue differences (e.g. HTX vs Bybit funding) are market dispersion, not a
// data-source conflict. Same-venue independent sources can conflict and must not
// be silently averaged.
function comparisonKey(e) {
  return [e.metric, e.venue || "", e.market_type || "", e.unit || "", e.settlement_period || ""].join("|");
}

export function detectEvidenceConflicts(items = [], options = {}) {
  const normalized = items.map(normalizeEvidenceItem);
  const timestampToleranceMs = finiteOrNull(options.timestamp_tolerance_ms) ?? 5 * 60 * 1000;
  const relativeTolerance = finiteOrNull(options.relative_tolerance) ?? 0.01;
  const absoluteTolerance = finiteOrNull(options.absolute_tolerance) ?? null;
  const groups = new Map();

  for (const e of normalized) {
    if (!e.metric || !e.contract_code) continue;
    const key = `${e.contract_code}|${comparisonKey(e)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }

  const conflicts = [];
  for (const [key, rows] of groups) {
    const usable = rows.filter(evidenceUsable);
    for (let i = 0; i < usable.length; i++) {
      for (let j = i + 1; j < usable.length; j++) {
        const a = usable[i], b = usable[j];
        if (a.independence_group && b.independence_group && a.independence_group === b.independence_group) continue;
        if (a.primary_market_id && b.primary_market_id && a.primary_market_id !== b.primary_market_id) continue;
        const ta = a.source_ts ?? a.observed_ts;
        const tb = b.source_ts ?? b.observed_ts;
        if (ta !== null && tb !== null && Math.abs(ta - tb) > timestampToleranceMs) continue;
        const av = finiteOrNull(a.value), bv = finiteOrNull(b.value);
        if (av === null || bv === null) continue;
        const absDiff = Math.abs(av - bv);
        const denom = Math.max(Math.abs(av), Math.abs(bv), 1e-12);
        const relDiff = absDiff / denom;
        const material =
          (absoluteTolerance !== null && absDiff > absoluteTolerance) ||
          (relativeTolerance !== null && relDiff > relativeTolerance);
        if (material) {
          conflicts.push({
            key,
            metric: a.metric,
            venue: a.venue,
            source_a: a.source,
            source_b: b.source,
            value_a: av,
            value_b: bv,
            abs_diff: absDiff,
            rel_diff: relDiff,
            timestamp_delta_ms: ta !== null && tb !== null ? Math.abs(ta - tb) : null,
            unresolved: true,
          });
        }
      }
    }
  }
  return conflicts;
}

export function summarizeDataQuality(items = [], conflicts = []) {
  const normalized = items.map(normalizeEvidenceItem);
  const critical = normalized.filter(e => e.chain && e.chain !== "PORTFOLIO_RISK");
  const usable = critical.filter(evidenceUsable);
  const independent = new Set(usable.map(e => e.independence_group || e.source).filter(Boolean));
  const chainsObserved = new Set(critical.map(e => e.chain));
  const chainsWithUsableEvidence = new Set(usable.map(e => e.chain));
  const stale = critical.filter(e => e.status === "STALE").length;
  const incompatible = critical.filter(e => e.status === "SOURCE_INCOMPATIBLE").length;
  const future = critical.filter(e => e.status === "FUTURE").length;
  const notClosed = critical.filter(e => ["NOT_CLOSED","UNSUPPORTED","PARTIAL","FUTURE"].includes(e.status)).length;
  const unresolvedConflicts = conflicts.filter(c => c.unresolved).length;
  const coverageValues = usable.map(e => e.coverage_pct).filter(v => v !== null);
  const coveragePct = coverageValues.length ? coverageValues.reduce((a,b)=>a+b,0)/coverageValues.length : null;

  let status = "NOT_CLOSED";
  const weightedChainsComplete = Object.keys(FIXED_DECISION_WEIGHTS).every(chain => chainsWithUsableEvidence.has(chain));
  if (usable.length && weightedChainsComplete && independent.size >= 2 && unresolvedConflicts === 0 && stale === 0 && incompatible === 0 && notClosed === 0) status = "CLOSED";
  else if (usable.length) status = "PARTIAL";

  const weightedEvidenceAvailability = {};
  let observedWeightPct = 0;
  for (const [chain, weight] of Object.entries(FIXED_DECISION_WEIGHTS)) {
    const available = chainsWithUsableEvidence.has(chain);
    weightedEvidenceAvailability[chain] = { weight_pct: weight, has_usable_evidence: available };
    if (available) observedWeightPct += weight;
  }

  return {
    status,
    items_total: critical.length,
    usable_items: usable.length,
    independent_evidence_groups: independent.size,
    chains_observed: [...chainsObserved].sort(),
    chains_with_usable_evidence: [...chainsWithUsableEvidence].sort(),
    weighted_evidence_availability: weightedEvidenceAvailability,
    observed_weight_pct: observedWeightPct,
    average_coverage_pct: coveragePct,
    stale_items: stale,
    future_items: future,
    incompatible_items: incompatible,
    not_closed_items: notClosed,
    unresolved_conflicts: unresolvedConflicts,
    uncertainty_flags: [
      ...(stale ? ["STALE_EVIDENCE"] : []),
      ...(future ? ["FUTURE_EVIDENCE"] : []),
      ...(incompatible ? ["SOURCE_OR_SYMBOL_INCOMPATIBLE"] : []),
      ...(notClosed ? ["NOT_CLOSED_EVIDENCE"] : []),
      ...(unresolvedConflicts ? ["UNRESOLVED_CONFLICT"] : []),
      ...(independent.size < 2 ? ["LOW_EVIDENCE_INDEPENDENCE"] : []),
    ],
  };
}

export function buildFullEvidenceEnvelope({ contract_code, observed_ts, evidence = [], conflict_options = {} } = {}) {
  const rows = evidence.map(row => normalizeEvidenceItem({ ...row, contract_code: row.contract_code ?? contract_code, observed_ts: row.observed_ts ?? observed_ts, now_ts: row.now_ts ?? observed_ts }));
  const conflicts = detectEvidenceConflicts(rows, conflict_options);
  const dq = summarizeDataQuality(rows, conflicts);
  const htxGateRows = rows.filter(e => e.chain === "HTX_EXECUTION" && e.metric === "execution_gate_status");
  const htxExecutionClosed = htxGateRows.length === 1 && htxGateRows.some(e => evidenceUsable(e) && Number(e.value) === 1);

  return {
    contract_version: EVIDENCE_CONTRACT_VERSION,
    contract_code: textOrNull(contract_code),
    observed_ts: finiteOrNull(observed_ts),
    mode: "FULL_EVIDENCE_SHADOW_NO_EXECUTION",
    fixed_decision_weights: { ...FIXED_DECISION_WEIGHTS },
    htx_execution_gate_closed: htxExecutionClosed,
    evidence: rows,
    conflicts,
    data_quality: dq,
    decision: {
      dc_long: null,
      dc_short: null,
      eq: null,
      dq_status: dq.status,
      full_decision_eligible: false,
      live_probability: null,
      validated: false,
      telegram_started: false,
      trading_execution: false,
      weights_changed: false,
      note: "Evidence fusion only. Fixed 35/30/20/15 weights are metadata, not applied to synthetic or missing chain scores. Directional promotion remains disabled until evidence/scoring calibration gates are proven.",
    },
  };
}
