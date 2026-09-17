import { decisionEvidenceRegistryContentDigest } from "../src/final-decision-integration-engine.mjs";

export const NOW = Date.UTC(2026, 8, 13, 20, 0, 0);
export const CONTRACT = "TEST-USDT";
export const SNAPSHOT = "RUN-TEST-1";

function fnv1a64(value) {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(String(value))) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

function stableProjection(value) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(stableProjection);
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableProjection(value[key])]));
}

export function stableJson(value) {
  return JSON.stringify(stableProjection(value));
}

export function digest(value) {
  return fnv1a64(stableJson(value));
}

export function withImmutableReceipt(value, receiptId, committedTs = NOW - 100) {
  const material = { ...value };
  delete material.persistence;
  const contentDigest = digest(material);
  return {
    ...material,
    persistence: {
      status: "CLOSED",
      receipt_id: receiptId,
      content_digest: contentDigest,
      committed_ts: committedTs,
      immutable: true,
      verification_method: "D1_IMMUTABLE_RECEIPT",
    },
  };
}

export const EVIDENCE_REGISTRY_RECEIPT = "ER:TEST-USDT:RUN-TEST-1";
export const FULL_REGISTRY_RECEIPT = "FER:TEST-USDT:RUN-TEST-1";
export const SAFETY_GATE_RECEIPT = "SGR:TEST-USDT:RUN-TEST-1";

export function entryActionId(campaignId, waveId, entryTs, contract = CONTRACT) {
  return `FDE:${fnv1a64(stableJson([contract, campaignId, waveId, entryTs]))}`;
}

export function decisionRawDigest(row) {
  return digest([
    row.contract_code, row.snapshot_id, row.source, row.venue, row.metric,
    row.source_ts, row.available_ts, row.valid_until_ts, row.max_age_ms,
    row.value, row.unit, row.episode_id, row.episode_revision,
  ]);
}

export function evidenceRow(overrides = {}) {
  const row = {
    evidence_id: "PRICE-1",
    snapshot_id: SNAPSHOT,
    contract_code: CONTRACT,
    causal_family: "PRICE_RESPONSE",
    metric_semantics: "DIRECTIONAL_PRICE_RESPONSE",
    correlation_group: "PRICE_ACTION_EPISODE",
    episode_id: "EP:TEST:1",
    episode_revision: 1,
    source: "HTX_OFFICIAL",
    venue: "HTX",
    metric: "price_response_after_event",
    source_observation_id: "RAW:PRICE-1",
    source_payload_digest: null,
    registry_receipt_id: EVIDENCE_REGISTRY_RECEIPT,
    value: 1,
    unit: "direction_state",
    status: "CLOSED",
    stance: "LONG",
    effect: "SUPPORT",
    source_ts: NOW - 2_000,
    available_ts: NOW - 1_000,
    max_age_ms: 60_000,
    valid_until_ts: NOW + 58_000,
    eligible_for_decision: true,
    symbol_verified: true,
    source_compatible: true,
    fact_complete: true,
    independence_basis: "STRUCTURAL_RULE_V1",
    producer_rules_version: "decision-evidence-producer-v1",
    derivation_rules_version: "decision-evidence-derivation-v1",
    fact_ids: ["FACT-PRICE-1"],
    ...overrides,
  };
  if (!Object.prototype.hasOwnProperty.call(overrides, "source_observation_id")) row.source_observation_id = `RAW:${row.evidence_id}`;
  if (!Object.prototype.hasOwnProperty.call(overrides, "source_payload_digest")) row.source_payload_digest = decisionRawDigest(row);
  return row;
}

const FULL_SEMANTICS = {
  CROSS_EXCHANGE_DERIVATIVES: "DERIVATIVES_STRUCTURE",
  MARKET_STRENGTH_SPOT: "SPOT_MARKET_STRENGTH",
  SMART_MONEY_ONCHAIN: "ONCHAIN_FLOW_CONTEXT",
  SUPPORTING_RISK: "RISK_CONTEXT",
  HTX_EXECUTION: "HTX_EXECUTION_GATE",
};
const FULL_SOURCE_KIND = {
  CROSS_EXCHANGE_DERIVATIVES: "DERIVATIVES_VENUE_API",
  MARKET_STRENGTH_SPOT: "SPOT_VENUE_API",
  SMART_MONEY_ONCHAIN: "ONCHAIN_ANALYTICS",
  SUPPORTING_RISK: "RISK_MODEL",
  HTX_EXECUTION: "HTX_EXECUTION_GATE",
};

export function fullRawDigest(row) {
  return digest([
    row.contract_code, row.snapshot_id, row.source, row.venue, row.metric,
    row.source_ts, row.available_ts, row.valid_until_ts, row.max_age_sec,
    row.value, row.coverage_pct,
  ]);
}

function fullRegistryProjection(row) {
  return {
    chain: String(row.chain).toUpperCase(),
    source_observation_id: row.source_observation_id,
    source_payload_digest: row.source_payload_digest,
    source: row.source,
    venue: row.venue,
    metric: row.metric,
    source_ts: row.source_ts,
    available_ts: row.available_ts,
    valid_until_ts: row.valid_until_ts,
    max_age_sec: row.max_age_sec,
    producer_rules_version: row.producer_rules_version,
    safety_gate_receipt_id: row.safety_gate_receipt_id || null,
  };
}

function fullEvidenceRow(chain, index) {
  const row = {
    snapshot_id: SNAPSHOT,
    contract_code: CONTRACT,
    chain,
    metric: `required_metric_${index}`,
    metric_semantics: FULL_SEMANTICS[chain],
    source_kind: FULL_SOURCE_KIND[chain],
    producer_rules_version: "full-evidence-source-producer-v1",
    source_observation_id: `FULL-RAW-${index}`,
    source_payload_digest: null,
    source_receipt_id: FULL_REGISTRY_RECEIPT,
    safety_gate_receipt_id: chain === "HTX_EXECUTION" ? SAFETY_GATE_RECEIPT : null,
    source: `SOURCE_${index}`,
    venue: index === 0 ? "HTX" : `VENUE_${index}`,
    value: 1,
    status: "CLOSED",
    eligible_for_chain_closure: true,
    source_ts: NOW - 1_000,
    available_ts: NOW - 500,
    valid_until_ts: NOW - 1_000 + 300_000,
    max_age_sec: 300,
    coverage_pct: 100,
    symbol_verified: true,
    source_compatible: true,
    alias_required: false,
    alias_verified: true,
    asset_identity_verified: true,
    primary_market_id: `${CONTRACT}:${chain}:${index}`,
    independence_group: `CHAIN-GROUP-${index}`,
    source_fact_ids: [`FULL-FACT-${index}`],
    error: null,
  };
  row.source_payload_digest = fullRawDigest(row);
  return row;
}

export function fullEvidence(overrides = {}) {
  const chains = [
    "CROSS_EXCHANGE_DERIVATIVES",
    "MARKET_STRENGTH_SPOT",
    "SMART_MONEY_ONCHAIN",
    "SUPPORTING_RISK",
  ];
  const rows = [
    ...chains.map(fullEvidenceRow),
    {
      ...fullEvidenceRow("HTX_EXECUTION", 99),
      metric: "execution_gate_status",
      source: "HTX_EXECUTION_GATE",
      venue: "HTX",
      value: 1,
      primary_market_id: `${CONTRACT}:HTX:USDT_PERP`,
      independence_group: "HTX_EXECUTION",
      max_age_sec: 60,
      valid_until_ts: NOW + 59_000,
    },
  ];
  rows[rows.length - 1].source_payload_digest = fullRawDigest(rows[rows.length - 1]);
  const registryEntries = rows.map(fullRegistryProjection).sort((a, b) => a.source_observation_id.localeCompare(b.source_observation_id));
  const registryDigest = digest(registryEntries);
  const result = {
    contract: CONTRACT,
    snapshot_id: SNAPSHOT,
    schema_version: "full-evidence-shadow-v1",
    observed_ts: NOW,
    htx_execution_gate_closed: true,
    data_quality: { status: "CLOSED" },
    conflicts: [],
    missing_weighted_chains: [],
    chain_status: Object.fromEntries(chains.map((chain) => [chain, { chain_closed: true }])),
    source_registry: {
      schema_version: "full-evidence-source-registry-v1",
      status: "CLOSED",
      authoritative: true,
      receipt_id: FULL_REGISTRY_RECEIPT,
      content_digest: registryDigest,
      entries: registryEntries,
      persistence: {
        status: "CLOSED", receipt_id: FULL_REGISTRY_RECEIPT, content_digest: registryDigest,
        committed_ts: NOW - 250, immutable: true, verification_method: "D1_IMMUTABLE_RECEIPT",
      },
    },
    evidence_compact: rows,
    ...overrides,
  };
  return withImmutableReceipt(result, `FEROW:${CONTRACT}:${SNAPSHOT}`, NOW - 100);
}

export function opportunity(direction = "LONG", overrides = {}) {
  const event = {
    event_id: "EVENT-1",
    episode_id: "EP:TEST:1",
    episode_revision: 1,
    contract: CONTRACT,
    timestamp: NOW - 60 * 60_000,
    event_close_ts: NOW - 59 * 60_000,
    data_quality: "OK",
    control_group: false,
    control_group_membership_verified: true,
    control_group_assignment_id: "CG-ASSIGN-1",
    admission_eligible: true,
    direction_at_event: direction,
    direction_locked_ts: NOW - 59 * 60_000,
    direction_available_ts: NOW - 59 * 60_000,
    directional_evaluation_eligible: true,
    direction_source: "OPPORTUNITY_PRECOMMITTED_DIRECTION_V1",
    direction_rules_version: "opportunity-direction-lock-v1",
    observation_timing: { timely_for_precommitted_funnel: true, retrospective_promotion_forbidden: false },
  };
  event.raw_event_digest = digest([
    event.event_id, event.episode_id, event.episode_revision, event.contract,
    event.timestamp, event.event_close_ts,
  ]);
  const base = {
    contract: CONTRACT,
    snapshot_id: SNAPSHOT,
    schema_version: "opportunity-integrity-shadow-v1",
    observed_ts: NOW,
    status: "OK",
    admitted_event_id: "EVENT-1",
    newest_event: event,
    control_group_receipt: {
      schema_version: "control-group-assignment-receipt-v1", status: "CLOSED", authoritative: true,
      assignment_id: event.control_group_assignment_id, event_id: event.event_id,
      episode_id: event.episode_id, episode_revision: event.episode_revision,
      control_group: false, rules_version: "opportunity-control-group-v1",
      raw_event_digest: event.raw_event_digest, assigned_ts: event.event_close_ts,
      receipt_id: "CGR:EVENT-1",
      persistence: { status: "CLOSED", receipt_id: "CGR:EVENT-1", committed_ts: event.event_close_ts + 500, immutable: true, verification_method: "D1_IMMUTABLE_RECEIPT" },
    },
    direction_receipt: {
      schema_version: "opportunity-direction-receipt-v1", status: "CLOSED", authoritative: true,
      event_id: event.event_id, episode_id: event.episode_id, episode_revision: event.episode_revision,
      direction, direction_locked_ts: event.direction_locked_ts, direction_available_ts: event.direction_available_ts,
      raw_event_digest: event.raw_event_digest, rules_version: "opportunity-direction-lock-v1", receipt_id: "ODR:EVENT-1",
      persistence: { status: "CLOSED", receipt_id: "ODR:EVENT-1", committed_ts: event.event_close_ts + 500, immutable: true, verification_method: "D1_IMMUTABLE_RECEIPT" },
    },
    ...overrides,
  };
  return withImmutableReceipt(base, "OPR:EVENT-1", NOW - 200);
}

const HISTORY = [
  ["DISCOVERY", "PRE_IMPULSE_WATCH", NOW - 28 * 60_000],
  ["PRE_IMPULSE_WATCH", "ENTRY_CANDIDATE", NOW - 20 * 60_000],
  ["ENTRY_CANDIDATE", "ENTRY_TRIGGER", NOW - 10 * 60_000],
].map(([from, to, observed_ts], index) => ({
  from,
  to,
  observed_ts,
  transition_id: `TRANSITION-${index + 1}`,
  observation_id: `OBS-T${index + 1}`,
  from_state_revision: index + 1,
  to_state_revision: index + 2,
}));

export function campaign(direction = "LONG", overrides = {}) {
  const state = {
    campaign_id: "MW:TEST-USDT:1",
    schema_version: "multi-wave-decision-state-v1",
    rules_version: "multi-wave-decision-state-rules-v1",
    contract_code: CONTRACT,
    campaign_start: NOW - 30 * 60_000,
    first_detected_time: NOW - 30 * 60_000,
    last_observed_ts: NOW - 500,
    campaign_end: null,
    current_phase: "ENTRY_TRIGGER",
    direction,
    direction_at_detection: direction,
    direction_locked_ts: NOW - 59 * 60_000,
    direction_lock_observation_id: "EVENT-1",
    wave_index: 1,
    completed_wave_count: 0,
    current_wave_id: "MW:TEST-USDT:1:W1",
    entry_trigger_time: NOW - 10 * 60_000,
    entry_trigger_price: 100,
    impulse_start: null,
    impulse_start_price: null,
    last_event_id: "EVENT-1",
    last_event_ts: NOW - 59 * 60_000,
    origin_episode_id: "EP:TEST:1",
    episode_revision: 1,
    state_revision: 4,
    observation_id: "OBS-4",
    wave_facts_immutable: true,
    cas_persisted: true,
    wave_ledger_offset: 0,
    wave_ledger_anchor: null,
    transition_history: HISTORY,
    history_truncated: false,
    ...overrides,
  };
  if (!Object.prototype.hasOwnProperty.call(overrides, "wave_ledger")) {
    state.wave_ledger = [{
      wave_id: state.current_wave_id,
      wave_index: state.wave_index,
      status: state.current_phase === "IMPULSE" ? "IMPULSE_ACTIVE" : "ENTRY_ACTIVE",
      immutable: true,
      entry_observation_id: "OBS-T3",
      entry_trigger_time: state.entry_trigger_time,
      entry_trigger_price: state.entry_trigger_price,
      impulse_start: state.impulse_start,
      impulse_start_price: state.impulse_start_price,
      completed_ts: null,
    }];
  }
  const actionId = entryActionId(state.campaign_id, state.current_wave_id, state.entry_trigger_time);
  const result = {
    schema_version: "multi-wave-decision-bridge-v1",
    status: "SHADOW_CAMPAIGN_EVALUATED",
    snapshot_id: SNAPSHOT,
    admitted_event_id: "EVENT-1",
    observation_id: state.observation_id,
    campaign: state,
    chase_risk: {
      status: "CLOSED",
      active: false,
      contract_code: CONTRACT,
      snapshot_id: SNAPSHOT,
      source_ts: NOW - 1_000,
      available_ts: NOW - 500,
      max_age_ms: 60_000,
      valid_until_ts: NOW + 59_000,
      rules_version: "chase-risk-state-v1",
    },
    entry_window: ["ENTRY_TRIGGER", "NEXT_IMPULSE_ENTRY"].includes(state.current_phase) ? {
      status: "CLOSED",
      contract_code: CONTRACT,
      snapshot_id: SNAPSHOT,
      campaign_id: state.campaign_id,
      wave_id: state.current_wave_id,
      campaign_state_revision: state.state_revision,
      observation_id: state.observation_id,
      action_id: actionId,
      single_use: true,
      consumed: false,
      source_ts: state.entry_trigger_time,
      valid_until_ts: state.entry_trigger_time + 30 * 60_000,
      max_age_ms: 30 * 60_000,
      persistence: { status: "CLOSED" },
    } : null,
  };
  return withImmutableReceipt(result, `CMR:${state.campaign_id}:${state.state_revision}`, NOW - 150);
}

export function evidenceRegistry(rows) {
  const entries = rows.map((row, index) => ({
    evidence_id: row.evidence_id,
    status: "CLOSED",
    immutable: true,
    causal_family: row.causal_family,
    metric_semantics: row.metric_semantics,
    correlation_group: row.correlation_group,
    source: row.source,
    venue: row.venue,
    metric: row.metric,
    source_observation_id: row.source_observation_id,
    source_payload_digest: row.source_payload_digest,
    registry_receipt_id: EVIDENCE_REGISTRY_RECEIPT,
    episode_id: row.episode_id,
    episode_revision: row.episode_revision,
    source_fact_ids: row.fact_ids,
    lineage_derivation_id: `DERIVATION-${index + 1}`,
    producer_rules_version: row.producer_rules_version,
    derivation_rules_version: row.derivation_rules_version,
    stance: row.stance,
    effect: row.effect,
    value: row.value,
    unit: row.unit,
    evidence_status: row.status,
    source_ts: row.source_ts,
    available_ts: row.available_ts,
    valid_until_ts: row.valid_until_ts,
    max_age_ms: row.max_age_ms,
    eligible_for_decision: row.eligible_for_decision,
    symbol_verified: row.symbol_verified,
    source_compatible: row.source_compatible,
    fact_complete: row.fact_complete,
    independence_basis: row.independence_basis,
  })).sort((a, b) => a.evidence_id.localeCompare(b.evidence_id));
  const registry = {
    status: "CLOSED",
    authoritative: true,
    contract_code: CONTRACT,
    snapshot_id: SNAPSHOT,
    observed_ts: NOW,
    episode_id: "EP:TEST:1",
    episode_revision: 1,
    rules_version: "causal-lineage-registry-v3-full-envelope",
    receipt_id: EVIDENCE_REGISTRY_RECEIPT,
    content_digest: null,
    persistence: {
      status: "CLOSED", receipt_id: EVIDENCE_REGISTRY_RECEIPT, content_digest: null,
      committed_ts: NOW - 300, immutable: true, verification_method: "D1_IMMUTABLE_RECEIPT",
    },
    entries,
  };
  const contentDigest = decisionEvidenceRegistryContentDigest(registry);
  registry.content_digest = contentDigest;
  registry.persistence.content_digest = contentDigest;
  return registry;
}

export function resealEvidenceRegistry(registry) {
  const clone = structuredClone(registry);
  clone.content_digest = null;
  if (clone.persistence && typeof clone.persistence === "object") clone.persistence.content_digest = null;
  const contentDigest = decisionEvidenceRegistryContentDigest(clone);
  clone.content_digest = contentDigest;
  if (clone.persistence && typeof clone.persistence === "object") clone.persistence.content_digest = contentDigest;
  return clone;
}

export function hardVeto(overrides = {}) {
  return {
    status: "CLEAR",
    snapshot_id: SNAPSHOT,
    authoritative: true,
    contract_code: CONTRACT,
    source_ts: NOW - 1_000,
    available_ts: NOW - 500,
    max_age_ms: 60_000,
    valid_until_ts: NOW + 59_000,
    safety_gate_receipt_id: SAFETY_GATE_RECEIPT,
    producer_rules_version: "safety-gate-snapshot-v1",
    reasons: [],
    ...overrides,
  };
}

export function executionGate(overrides = {}) {
  return {
    status: "CLOSED",
    snapshot_id: SNAPSHOT,
    authoritative: true,
    htx_execution_gate_closed: true,
    contract_code: CONTRACT,
    snapshot_id: SNAPSHOT,
    source_ts: NOW - 1_000,
    available_ts: NOW - 500,
    max_age_ms: 30_000,
    valid_until_ts: NOW + 29_000,
    safety_gate_receipt_id: SAFETY_GATE_RECEIPT,
    producer_rules_version: "safety-gate-snapshot-v1",
    entry_sides: {
      LONG: { status: "CLOSED", intent: "OPEN_LONG_BUY", measurable: true, source_ts: NOW - 1_000, available_ts: NOW - 500, max_age_ms: 15_000, valid_until_ts: NOW + 14_000 },
      SHORT: { status: "CLOSED", intent: "OPEN_SHORT_SELL", measurable: true, source_ts: NOW - 1_000, available_ts: NOW - 500, max_age_ms: 15_000, valid_until_ts: NOW + 14_000 },
    },
    close_sides: {
      LONG: { status: "CLOSED", intent: "CLOSE_LONG_SELL", measurable: true, source_ts: NOW - 1_000, available_ts: NOW - 500, max_age_ms: 15_000, valid_until_ts: NOW + 14_000 },
      SHORT: { status: "CLOSED", intent: "CLOSE_SHORT_BUY", measurable: true, source_ts: NOW - 1_000, available_ts: NOW - 500, max_age_ms: 15_000, valid_until_ts: NOW + 14_000 },
    },
    ...overrides,
  };
}

export function safetyGateReceipt(hardVetoState, gate) {
  const material = {
    hard_veto: hardVetoState,
    execution_gate: gate,
  };
  const contentDigest = digest(material);
  return {
    schema_version: "safety-gate-receipt-v1", status: "CLOSED", authoritative: true,
    contract_code: CONTRACT, snapshot_id: SNAPSHOT, observed_ts: NOW,
    receipt_id: SAFETY_GATE_RECEIPT, content_digest: contentDigest,
    rules_version: "safety-gate-snapshot-v1",
    persistence: {
      status: "CLOSED", receipt_id: SAFETY_GATE_RECEIPT, content_digest: contentDigest,
      committed_ts: NOW - 400, immutable: true, verification_method: "D1_IMMUTABLE_RECEIPT",
    },
  };
}

export function positionState(overrides = {}) {
  return withImmutableReceipt({
    schema_version: "shadow-position-ledger-v1",
    producer_rules_version: "shadow-position-ledger-v1",
    state: "FLAT", authoritative: true, contract_code: CONTRACT,
    snapshot_id: SNAPSHOT,
    source_ts: NOW - 1_000, valid_until_ts: NOW + 59_000, state_revision: 1,
    available_ts: NOW - 500, max_age_ms: 60_000,
    ...overrides,
  }, `PSR:${CONTRACT}:${overrides.state_revision ?? 1}`, NOW - 100);
}

export function openPosition(direction = "LONG", campaignResult = impulseCampaign(direction), overrides = {}) {
  const wave = campaignResult.campaign.wave_ledger[0];
  const decisionTs = wave.entry_trigger_time + 1_000;
  const decisionDigest = "0123456789abcdef";
  return positionState({
    state: direction === "SHORT" ? "OPEN_SHORT" : "OPEN_LONG",
    mode: "SHADOW_VIRTUAL",
    position_id: `VP:${CONTRACT}:1`,
    entry_ts: wave.entry_trigger_time,
    direction,
    campaign_id: campaignResult.campaign.campaign_id,
    entry_wave_id: wave.wave_id,
    entry_decision_observation_ts: decisionTs,
    entry_decision_material_digest: decisionDigest,
    entry_decision_id: `FDI:${CONTRACT}:${decisionTs}:${decisionDigest}`,
    entry_action_id: entryActionId(campaignResult.campaign.campaign_id, wave.wave_id, wave.entry_trigger_time),
    state_revision: 1,
    ...overrides,
  });
}

export function positionOriginCampaign(campaignResult, position, overrides = {}) {
  const state = campaignResult?.campaign || {};
  const wave = Array.isArray(state?.wave_ledger)
    ? state.wave_ledger.find((candidate) => candidate?.wave_id === position?.entry_wave_id)
    : null;
  const entryTransition = Array.isArray(state?.transition_history)
    ? state.transition_history.find((transition) => transition?.observation_id === wave?.entry_observation_id)
    : null;
  const entryRevision = entryTransition?.to_state_revision ?? state?.state_revision;
  const entryDecisionTs = position?.entry_decision_observation_ts;
  const sourceCampaignCommittedTs = Number.isSafeInteger(position?.entry_ts) && Number.isSafeInteger(entryDecisionTs)
    ? Math.min(entryDecisionTs, position.entry_ts + 500)
    : null;
  const sourceCampaignReceiptId = `CMR:${state?.campaign_id}:${entryRevision}:ENTRY`;
  const sourceCampaignContentDigest = digest([
    state?.campaign_id,
    state?.direction,
    wave?.wave_id,
    wave?.entry_trigger_time,
    wave?.entry_trigger_price,
    wave?.entry_observation_id,
    entryRevision,
  ]);
  const material = {
    schema_version: "shadow-position-origin-campaign-v2",
    producer_rules_version: "shadow-position-origin-campaign-v2",
    status: "CLOSED",
    authoritative: true,
    contract_code: position?.contract_code,
    campaign_id: position?.campaign_id,
    direction: position?.direction,
    entry_wave_id: position?.entry_wave_id,
    entry_trigger_ts: position?.entry_ts,
    entry_trigger_price: wave?.entry_trigger_price,
    entry_observation_id: wave?.entry_observation_id,
    entry_action_id: position?.entry_action_id,
    campaign_state_revision_at_entry: entryRevision,
    source_campaign_receipt_id: sourceCampaignReceiptId,
    source_campaign_content_digest: sourceCampaignContentDigest,
    source_campaign_committed_ts: sourceCampaignCommittedTs,
    ...overrides,
  };
  return withImmutableReceipt(material, `POC:${digest([
    material.contract_code,
    material.campaign_id,
    material.entry_wave_id,
    material.entry_trigger_ts,
  ])}`, NOW - 80);
}

export function positionManagementContext(position, originCampaign, riskState = "CLEAR", overrides = {}) {
  const sourceTs = NOW - 1_000;
  const evidenceReceiptIds = [FULL_REGISTRY_RECEIPT];
  const riskReasonCodes = riskState === "INVALIDATED" ? ["THESIS_INVALIDATED"] : riskState === "CAUTION" ? ["POSITION_RISK_CAUTION"] : [];
  const material = {
    schema_version: "shadow-position-management-context-v1",
    producer_rules_version: "shadow-position-management-context-v1",
    status: "CLOSED",
    authoritative: true,
    contract_code: position?.contract_code,
    snapshot_id: position?.snapshot_id,
    position_id: position?.position_id,
    position_state_revision: position?.state_revision,
    position_direction: position?.direction,
    position_receipt_id: position?.persistence?.receipt_id,
    origin_campaign_id: originCampaign?.campaign_id,
    origin_wave_id: originCampaign?.entry_wave_id,
    origin_campaign_receipt_id: originCampaign?.persistence?.receipt_id,
    invalidation_evaluated: true,
    risk_state: riskState,
    risk_reason_codes: riskReasonCodes,
    evidence_receipt_ids: evidenceReceiptIds,
    source_ts: sourceTs,
    // The assessment is available only after the immutable position, origin
    // campaign, and cited risk receipts were committed. This keeps the fixture
    // causally usable instead of merely present at the final observation.
    available_ts: NOW - 60,
    max_age_ms: 60_000,
    valid_until_ts: sourceTs + 60_000,
    ...overrides,
  };
  material.assessment_id = overrides.assessment_id ?? `PMA:${digest([
    material.contract_code,
    material.position_id,
    material.position_state_revision,
    material.source_ts,
    material.origin_campaign_receipt_id,
    [...material.evidence_receipt_ids].sort(),
    material.risk_state,
  ])}`;
  return withImmutableReceipt(material, `PMR:${material.assessment_id}`, NOW - 40);
}

export function completeInput(direction = "LONG", overrides = {}) {
  const sign = direction === "SHORT" ? -1 : 1;
  const decisionEvidence = [
    evidenceRow({ stance: direction, value: sign }),
    evidenceRow({
      evidence_id: "POSITIONING-1",
      causal_family: "FUNDING",
      metric_semantics: "CROWDING_TRAJECTORY",
      correlation_group: "POSITIONING_EPISODE",
      source: "CROSS_VENUE_VERIFIED",
      venue: "MULTI_VENUE",
      metric: "crowding_response",
      stance: direction,
      value: sign,
      fact_ids: ["FACT-POSITIONING-1"],
    }),
  ];
  const base = {
    contract_code: CONTRACT,
    snapshot_id: SNAPSHOT,
    observed_ts: NOW,
    full_evidence: fullEvidence(),
    opportunity: opportunity(direction),
    campaign: campaign(direction),
    decision_evidence: decisionEvidence,
    evidence_registry: evidenceRegistry(decisionEvidence),
    hard_veto: hardVeto(),
    execution_gate: executionGate(),
    position: positionState(),
    ...overrides,
  };
  if (!Object.prototype.hasOwnProperty.call(overrides, "safety_gate_receipt")) {
    base.safety_gate_receipt = safetyGateReceipt(base.hard_veto, base.execution_gate);
  }
  const open = ["OPEN_LONG", "OPEN_SHORT"].includes(base?.position?.state);
  if (open && !Object.prototype.hasOwnProperty.call(overrides, "position_origin_campaign")) {
    base.position_origin_campaign = positionOriginCampaign(base.campaign, base.position);
  }
  if (open && !Object.prototype.hasOwnProperty.call(overrides, "position_management_context")) {
    base.position_management_context = positionManagementContext(base.position, base.position_origin_campaign);
  }
  return base;
}

export function impulseCampaign(direction = "LONG", overrides = {}) {
  const base = campaign(direction).campaign;
  const impulseTs = NOW - 5 * 60_000;
  return campaign(direction, {
    ...base,
    current_phase: "IMPULSE",
    impulse_start: impulseTs,
    impulse_start_price: direction === "LONG" ? 103 : 97,
    transition_history: [
      ...HISTORY,
      {
        from: "ENTRY_TRIGGER", to: "IMPULSE", observed_ts: NOW - 5 * 60_000,
        transition_id: "TRANSITION-4", from_state_revision: 4, to_state_revision: 5,
        observation_id: "OBS-T4",
      },
    ],
    wave_ledger: [{
      ...base.wave_ledger[0],
      status: "IMPULSE_ACTIVE",
      impulse_start: impulseTs,
      impulse_start_price: direction === "LONG" ? 103 : 97,
      impulse_observation_id: "OBS-T4",
      completed_ts: null,
    }],
    state_revision: 5,
    observation_id: "OBS-5",
    ...overrides,
  });
}

export function secondWaveCampaign(direction = "LONG", overrides = {}) {
  const campaignId = "MW:TEST-USDT:1";
  const points = [28, 22, 16, 12, 8, 6, 3].map((minutes) => NOW - minutes * 60_000);
  const transitions = [
    ["DISCOVERY", "PRE_IMPULSE_WATCH"],
    ["PRE_IMPULSE_WATCH", "ENTRY_CANDIDATE"],
    ["ENTRY_CANDIDATE", "ENTRY_TRIGGER"],
    ["ENTRY_TRIGGER", "IMPULSE"],
    ["IMPULSE", "RELOAD_BASE"],
    ["RELOAD_BASE", "NEXT_IMPULSE_WATCH"],
    ["NEXT_IMPULSE_WATCH", "NEXT_IMPULSE_ENTRY"],
  ].map(([from, to], index) => ({
    from, to, observed_ts: points[index], transition_id: `W2-TRANSITION-${index + 1}`,
    observation_id: `W2-OBS-T${index + 1}`, from_state_revision: index + 1, to_state_revision: index + 2,
  }));
  return campaign(direction, {
    current_phase: "NEXT_IMPULSE_ENTRY",
    wave_index: 2,
    completed_wave_count: 1,
    current_wave_id: `${campaignId}:W2`,
    entry_trigger_time: points[6],
    entry_trigger_price: direction === "LONG" ? 105 : 95,
    impulse_start: null,
    impulse_start_price: null,
    base_start: points[4],
    state_revision: 8,
    observation_id: "W2-OBS-8",
    transition_history: transitions,
    wave_ledger: [
      {
        wave_id: `${campaignId}:W1`, wave_index: 1, status: "COMPLETED", immutable: true,
        entry_observation_id: "W2-OBS-T3", entry_trigger_time: points[2], entry_trigger_price: 100,
        impulse_observation_id: "W2-OBS-T4", impulse_start: points[3], impulse_start_price: direction === "LONG" ? 103 : 97,
        completion_observation_id: "W2-OBS-T5", completed_ts: points[4],
      },
      {
        wave_id: `${campaignId}:W2`, wave_index: 2, status: "ENTRY_ACTIVE", immutable: true,
        entry_observation_id: "W2-OBS-T7", entry_trigger_time: points[6], entry_trigger_price: direction === "LONG" ? 105 : 95,
        impulse_start: null, impulse_start_price: null, completed_ts: null,
      },
    ],
    ...overrides,
  });
}

export function discoveryCampaign(direction = "LONG", overrides = {}) {
  return campaign(direction, {
    current_phase: "DISCOVERY", wave_index: 0, completed_wave_count: 0,
    current_wave_id: null, entry_trigger_time: null, entry_trigger_price: null,
    impulse_start: null, impulse_start_price: null, transition_history: [],
    state_revision: 1, observation_id: "DISCOVERY-OBS-1", wave_ledger: [],
    ...overrides,
  });
}
