import { evaluateHtxFuturesTurnoverGate } from './htx-turnover-gate.mjs';

export const EARLY_CANDIDATE_BRIDGE_VERSION = 'early-candidate-bridge-v1-20260924';
export const EARLY_BRIDGE_FRESH_MS = 15 * 60_000;
export const EARLY_BRIDGE_MAX_ACTIVE = 12;
export const EARLY_BRIDGE_MAX_FULL_EVIDENCE = 48;

const TERMINAL = new Set(['EXIT','EDGE_SPENT','EXCLUDE']);
const MICRO_DOMAINS = new Set([
  'VOLUME_ACCELERATION',
  'ORDERFLOW_ABSORPTION',
  'ORDERFLOW_EXHAUSTION',
  'EXECUTION_BOOK_SUPPORT',
  'POSITIONING_TRAJECTORY',
  'REALIZED_LIQUIDATION_PRESSURE',
  'BASIS_CONTEXT',
]);

const text = (v) => v === null || v === undefined ? '' : String(v).trim();
const finite = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const safeJson = (v, fallback) => {
  try { return typeof v === 'string' ? JSON.parse(v) : (v ?? fallback); } catch { return fallback; }
};
const uniq = (xs) => [...new Set((Array.isArray(xs) ? xs : []).map(text).filter(Boolean))];

function factualEvidence(row, now) {
  const evidence = safeJson(row?.evidence_json, []);
  if (!Array.isArray(evidence) || evidence.length > 64) return [];
  return evidence.filter((e) => e && e.status === 'CLOSED' && text(e.domain));
}

function microstructureEvidence(row) {
  const evidence = factualEvidence(row);
  const domains = uniq(evidence.filter((e) => MICRO_DOMAINS.has(text(e.domain))).map((e) => e.domain));
  const feature = safeJson(row?.feature_json, {});
  const fusion = feature?.feature_fusion || null;
  const fusionClosed = fusion?.status === 'CLOSED';
  return {
    status: fusionClosed && domains.length ? 'CLOSED' : 'NOT_CLOSED',
    domains,
    feature_fusion_status: fusion?.status || null,
    reason: fusionClosed && domains.length ? 'FRESH_MICROSTRUCTURE_FEATURE_CONSUMED' : 'NO_CLOSED_MICROSTRUCTURE_FEATURE',
  };
}

export function normalizeEarlyBridgeReceipt(row, { now = Date.now(), fresh_ms = EARLY_BRIDGE_FRESH_MS } = {}) {
  const contract = text(row?.contract_code);
  const waveId = text(row?.wave_id);
  const lastSeen = finite(row?.last_seen_ts);
  const featureObserved = finite(row?.feature_observed_ts ?? row?.observed_ts);
  const stage = text(row?.lifecycle_stage).toUpperCase();
  const quality = finite(row?.early_detection_quality_0_100);
  const longDomains = finite(row?.long_evidence_domain_count) ?? 0;
  const shortDomains = finite(row?.short_evidence_domain_count) ?? 0;
  const evidence = factualEvidence(row, now);
  const evidenceRefs = safeJson(row?.evidence_refs_json ?? row?.evidence_refs, []);
  const domains = uniq([
    ...evidence.map((e) => e.domain),
    ...(Array.isArray(evidenceRefs) ? evidenceRefs.map((e) => e?.domain) : []),
  ]);
  const evidenceIds = uniq(Array.isArray(evidenceRefs) ? evidenceRefs.map((e) =>
    e?.evidence_id ?? e?.receipt_id ?? e?.id ?? (e?.domain ? `${waveId}:${text(e.domain)}:${text(e.side)||'BOTH'}` : null)
  ) : []);
  const direction = ['LONG','SHORT'].includes(text(row?.direction_hint).toUpperCase()) ? text(row.direction_hint).toUpperCase() : null;
  const freshnessAnchor = Math.max(lastSeen ?? 0, featureObserved ?? 0) || null;
  const ageMs = freshnessAnchor === null ? null : now - freshnessAnchor;
  const fresh = ageMs !== null && ageMs >= -60_000 && ageMs <= fresh_ms;
  const microstructure = microstructureEvidence(row);
  const active = Boolean(contract && waveId && !TERMINAL.has(stage) && fresh && row?.shadow_only !== 0);
  const domainCount = Math.max(longDomains, shortDomains, domains.length);
  const priorityEligible = active && quality !== null && quality >= 0 && quality <= 100 && domainCount >= 2;
  return {
    version: EARLY_CANDIDATE_BRIDGE_VERSION,
    status: priorityEligible ? 'CLOSED' : active ? 'NOT_ENOUGH_EVIDENCE' : 'NOT_CLOSED',
    priority_eligible: priorityEligible,
    contract: contract || null,
    wave_id: waveId || null,
    lifecycle_stage: stage || null,
    direction_hint: direction,
    direction_state: text(row?.direction_state) || null,
    early_detection_quality_0_100: quality,
    evidence_domains: domains,
    evidence_domain_count: domainCount,
    evidence,
    evidence_refs: Array.isArray(evidenceRefs) ? evidenceRefs : [],
    evidence_ids: evidenceIds,
    microstructure,
    last_seen_ts: lastSeen,
    feature_observed_ts: featureObserved,
    freshness_age_ms: ageMs,
    shadow_only: true,
    can_bypass_hard_gates: false,
    changes_strategy_weights: false,
    automatic_entry: false,
  };
}

function normalizeExternalEvidenceRow(row, now) {
  const observed = finite(row?.observed_ts);
  const ageMs = observed === null ? null : now - observed;
  if (ageMs === null || ageMs < -60_000 || ageMs > 30 * 60_000) return null;
  const conflicts = safeJson(row?.conflicts_json, []);
  const evidence = safeJson(row?.evidence_compact_json, []);
  if (!Array.isArray(evidence)) return null;
  const usable = evidence.filter((e) => {
    const sourceTs = finite(e?.source_ts);
    const maxAgeSec = finite(e?.max_age_sec);
    const current = sourceTs !== null && sourceTs <= now + 60_000 &&
      (maxAgeSec === null || now - sourceTs <= maxAgeSec * 1000);
    return e?.status === 'CLOSED' && e?.venue !== 'HTX' && e?.source_compatible !== false && current;
  });
  return {
    contract: text(row?.contract_code),
    observed_ts: observed,
    dq_status: text(row?.dq_status) || null,
    conflicts: Array.isArray(conflicts) ? conflicts : [],
    evidence: usable,
  };
}

function pickPreselectionContext(contract, fullEvidenceRows, earlyDirection, now) {
  const candidates = (Array.isArray(fullEvidenceRows) ? fullEvidenceRows : [])
    .map((row) => normalizeExternalEvidenceRow(row, now))
    .filter((row) => row && row.contract === contract)
    .sort((a,b) => b.observed_ts - a.observed_ts);
  const latest = candidates[0] || null;
  if (!latest) return { status: 'NO_RECENT_CROSS_VENUE_RECEIPT', confirmed: false, conflict: false, evidence: [] };
  if (latest.conflicts.length) return { status: 'CROSS_VENUE_DIVERGENCE', confirmed: false, conflict: true, evidence: latest.evidence, observed_ts: latest.observed_ts };
  const rs = latest.evidence.filter((e) => /^rs_vs_(?:btc|eth)_(?:1h|4h|24h)$/i.test(text(e?.metric)) && finite(e?.value) !== null);
  let confirmed = false;
  if (earlyDirection === 'LONG') confirmed = rs.length >= 2 && rs.every((e) => finite(e.value) > 0);
  else if (earlyDirection === 'SHORT') confirmed = rs.length >= 2 && rs.every((e) => finite(e.value) < 0);
  else confirmed = latest.evidence.length > 0;
  return {
    status: latest.evidence.length ? 'CLOSED' : 'NO_USABLE_CROSS_VENUE_FACT',
    confirmed,
    conflict: false,
    observed_ts: latest.observed_ts,
    evidence: latest.evidence.slice(0, 16),
  };
}

export function applyEarlyCandidateBridge({
  discovery_prefilter,
  scan,
  deep_check_queue,
  early_rows = [],
  full_evidence_rows = [],
  early_input_status = 'CLOSED',
  now = Date.now(),
} = {}) {
  const base = discovery_prefilter && typeof discovery_prefilter === 'object' ? discovery_prefilter : { shortlist: [], counts: {} };
  const technical = new Set((Array.isArray(deep_check_queue?.queue) ? deep_check_queue.queue : []).map((x) => text(x?.contract)).filter(Boolean));
  const scanRows = new Map((Array.isArray(scan?.contracts) ? scan.contracts : []).map((x) => [text(x?.contract_code), x]));
  const existing = new Map((Array.isArray(base?.shortlist) ? base.shortlist : []).map((x) => [text(x?.contract), { ...x }]));
  const telemetry = new Map((Array.isArray(base?.contract_telemetry) ? base.contract_telemetry : []).map((x) => [text(x?.contract), x]));
  const accepted = [];
  const rejected = [];

  for (const raw of Array.isArray(early_rows) ? early_rows : []) {
    const receipt = normalizeEarlyBridgeReceipt(raw, { now });
    if (!receipt.priority_eligible) { rejected.push({ contract: receipt.contract, reason: receipt.status }); continue; }
    const contract = receipt.contract;
    const stage0 = scanRows.get(contract) || null;
    if (!technical.has(contract) || !stage0) { rejected.push({ contract, reason: 'CURRENT_TECHNICAL_DEEP_CHECK_ELIGIBILITY_NOT_CLOSED' }); continue; }
    const turnover = evaluateHtxFuturesTurnoverGate(stage0);
    if (!turnover.allowed) { rejected.push({ contract, reason: turnover.reason }); continue; }
    const move24 = finite(stage0?.transitions?.['24h']?.price_change_pct);
    if (move24 !== null && move24 >= 20) { rejected.push({ contract, reason: 'PUMP_ROUTE_GTE_20PCT_NOT_EARLY', rolling_24h_change_pct: move24 }); continue; }

    const external = pickPreselectionContext(contract, full_evidence_rows, receipt.direction_hint, now);
    const prior = existing.get(contract) || telemetry.get(contract) || {};
    const flags = uniq([...(Array.isArray(prior?.anomaly_flags) ? prior.anomaly_flags : []), ...receipt.evidence_domains.map((d) => `early:${d}`)]);
    const microBoost = receipt.microstructure.status === 'CLOSED' ? 1 : 0;
    const crossBoost = external.confirmed ? 1 : 0;
    const operationalScore = Math.max(0, Math.min(100, Math.round(
      (receipt.early_detection_quality_0_100 ?? 0) * 0.85 + microBoost * 8 + crossBoost * 7
    )));
    const bridged = {
      ...prior,
      contract,
      anomaly_flags: flags,
      anomaly_flags_count: flags.length,
      early_anomaly_flags_count: Math.max(Number(prior?.early_anomaly_flags_count || 0), receipt.evidence_domain_count),
      early_candidate_bridge: true,
      early_candidate_wave_id: receipt.wave_id,
      // Preserve the existing V3 live-handoff identity so the same persisted
      // early wave reaches the existing bounded Deep Check scheduler.
      wave_id: receipt.wave_id,
      current_state: receipt.lifecycle_stage,
      evidence_ids: receipt.evidence_ids,
      dedup_reentry_key: `${contract}|${receipt.wave_id}|EARLY_BRIDGE`,
      early_candidate_quality_0_100: receipt.early_detection_quality_0_100,
      early_candidate_operational_priority_0_100: operationalScore,
      early_candidate_direction_hint: receipt.direction_hint,
      early_candidate_evidence_domains: receipt.evidence_domains,
      early_candidate_receipt: receipt,
      htx_futures_turnover_gate: turnover,
      turnover_24h_usdt: turnover.turnover_usd_equivalent,
      rolling_24h_change_pct: move24,
      microstructure_priority_confirmed: receipt.microstructure.status === 'CLOSED',
      microstructure_priority_domains: receipt.microstructure.domains,
      preselection_cross_venue_status: external.status,
      preselection_cross_venue_confirmed: external.confirmed,
      preselection_cross_venue_conflict: external.conflict,
      preselection_cross_venue_observed_ts: external.observed_ts ?? null,
      preselection_cross_venue_receipts: external.evidence,
      scheduler_priority_is_probability: false,
      discovery_semantics: 'DISCOVERY_ONLY_NOT_PROBABILITY_NOT_TRADE_SIGNAL',
      bridge_reason: [
        `early quality ${receipt.early_detection_quality_0_100}/100`,
        receipt.microstructure.status === 'CLOSED' ? `microstructure ${receipt.microstructure.domains.join(',')}` : null,
        external.confirmed ? 'fresh cross-venue receipt confirms context' : external.conflict ? 'cross-venue divergence retained' : null,
      ].filter(Boolean).join('; '),
    };
    existing.set(contract, bridged);
    accepted.push({ contract, receipt, external, operational_priority_0_100: operationalScore });
  }

  const merged = [...existing.values()];
  merged.sort((a,b) => {
    const aEarly = a?.early_candidate_bridge === true ? 1 : 0;
    const bEarly = b?.early_candidate_bridge === true ? 1 : 0;
    if (aEarly !== bEarly) return bEarly - aEarly;
    const aScore = finite(a?.early_candidate_operational_priority_0_100) ?? -1;
    const bScore = finite(b?.early_candidate_operational_priority_0_100) ?? -1;
    if (aScore !== bScore) return bScore - aScore;
    const aRank = finite(a?.priority_rank) ?? Infinity;
    const bRank = finite(b?.priority_rank) ?? Infinity;
    if (aRank !== bRank) return aRank - bRank;
    return text(a?.contract).localeCompare(text(b?.contract));
  });
  const cap = Number.isFinite(Number(base?.parameters?.max_shortlist)) ? Math.max(1, Number(base.parameters.max_shortlist)) : 24;
  const shortlist = merged.slice(0, cap).map((row, i) => ({ ...row, priority_rank: i + 1 }));
  return {
    ...base,
    mode: `${text(base?.mode) || 'DISCOVERY_PREFILTER'}+EARLY_BRIDGE_V1`,
    shortlist,
    counts: {
      ...(base?.counts || {}),
      shortlist: shortlist.length,
      early_bridge_loaded: Array.isArray(early_rows) ? early_rows.length : 0,
      early_bridge_accepted: accepted.length,
      early_bridge_rejected: rejected.length,
      early_bridge_microstructure_confirmed: accepted.filter((x) => x.receipt.microstructure.status === 'CLOSED').length,
      early_bridge_cross_venue_confirmed: accepted.filter((x) => x.external.confirmed).length,
    },
    early_bridge: {
      version: EARLY_CANDIDATE_BRIDGE_VERSION,
      status: early_input_status === 'CLOSED' ? 'CLOSED' : 'INPUTS_NOT_CLOSED',
      input_status: early_input_status,
      accepted,
      rejected,
      hard_gates_bypassed: false,
      strategy_weights_changed: false,
      automatic_entry: false,
    },
    decision: { generated: false, direction: null, probability: null, validated: false },
  };
}

export async function loadEarlyBridgeInputs(env, { now = Date.now() } = {}) {
  const db = env?.DATA_DB;
  const safe = { version: EARLY_CANDIDATE_BRIDGE_VERSION, status: 'SOURCE_UNSUPPORTED', early_rows: [], full_evidence_rows: [], rows_read_upper_bound: 0 };
  if (!db?.prepare || !db?.batch) return safe;
  try {
    const result = await db.batch([
      db.prepare(`SELECT e.*,f.observed_ts AS feature_observed_ts,f.long_evidence_domain_count,f.short_evidence_domain_count,f.feature_json,f.evidence_json
        FROM v3_early_candidate_wave e
        LEFT JOIN v3_early_feature_snapshot f
          ON f.contract_code=e.contract_code AND f.ts_bucket=CAST(e.last_seen_ts/300000 AS INTEGER)*300000
        WHERE e.shadow_only=1 AND e.lifecycle_stage NOT IN ('EXIT','EDGE_SPENT','EXCLUDE')
          AND e.last_seen_ts BETWEEN ?1 AND ?2
        ORDER BY e.last_seen_ts DESC LIMIT ${EARLY_BRIDGE_MAX_ACTIVE}`).bind(now - EARLY_BRIDGE_FRESH_MS, now + 60_000),
      db.prepare(`SELECT contract_code,observed_ts,dq_status,conflicts_json,evidence_compact_json
        FROM full_evidence_shadow_log
        WHERE shadow_only=1 AND observed_ts BETWEEN ?1 AND ?2
        ORDER BY observed_ts DESC LIMIT ${EARLY_BRIDGE_MAX_FULL_EVIDENCE}`).bind(now - 30 * 60_000, now + 60_000),
    ]);
    const early = Array.isArray(result?.[0]?.results) ? result[0].results : [];
    const full = Array.isArray(result?.[1]?.results) ? result[1].results : [];
    return {
      version: EARLY_CANDIDATE_BRIDGE_VERSION,
      status: 'CLOSED',
      early_rows: early,
      full_evidence_rows: full,
      rows_read_upper_bound: early.length + full.length,
      d1_queries: 2,
      network_calls: 0,
      writes: 0,
    };
  } catch (error) {
    return {
      ...safe,
      status: 'INPUT_LOAD_FAIL_CLOSED',
      error: text(error?.message || error).slice(0, 300),
      d1_queries: 2,
      network_calls: 0,
      writes: 0,
    };
  }
}

export default {
  EARLY_CANDIDATE_BRIDGE_VERSION,
  EARLY_BRIDGE_FRESH_MS,
  normalizeEarlyBridgeReceipt,
  applyEarlyCandidateBridge,
  loadEarlyBridgeInputs,
};
