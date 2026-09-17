export { prepareTz101DecisionEvidence } from "./tz101-decision-evidence-producer.mjs";
export { prepareHtxExecutionFacts, checkExecutionHandoff } from "./tz101-execution-facts.mjs";
import { verifyExecutionFacts } from "./tz101-execution-facts.mjs";
import { produceTz101HardVeto } from "./tz101-hard-veto-producer.mjs";
import {
  decisionEvidenceRegistryContentDigest,
} from "./final-decision-integration-engine.mjs";
import {
  digest,
  immutableReceipt,
  safeFinite,
  safeInt,
  safeText,
  stableJson,
} from "./upstream-proof-utils.mjs";

export const STAGE392_PROOF_VERSION = "stage-3.9.2-shadow-receipts-v1";
export const STAGE392_PROOF_MODE = "SHADOW_ONLY_NO_EXECUTION";
export const DECISION_EVIDENCE_REGISTRY_RULES_VERSION = "causal-lineage-registry-v3-full-envelope";

const SUPPORTED_FULL_CHAINS = new Set([
  "CROSS_EXCHANGE_DERIVATIVES",
  "MARKET_STRENGTH_SPOT",
  "SMART_MONEY_ONCHAIN",
  "SUPPORTING_RISK",
  "HTX_EXECUTION",
]);
const FULL_SEMANTICS = Object.freeze({
  CROSS_EXCHANGE_DERIVATIVES: "DERIVATIVES_STRUCTURE",
  MARKET_STRENGTH_SPOT: "SPOT_MARKET_STRENGTH",
  SMART_MONEY_ONCHAIN: "ONCHAIN_FLOW_CONTEXT",
  SUPPORTING_RISK: "RISK_CONTEXT",
  HTX_EXECUTION: "HTX_EXECUTION_GATE",
});
const FULL_SOURCE_KIND = Object.freeze({
  CROSS_EXCHANGE_DERIVATIVES: "DERIVATIVES_VENUE_API",
  MARKET_STRENGTH_SPOT: "SPOT_VENUE_API",
  SMART_MONEY_ONCHAIN: "ONCHAIN_ANALYTICS",
  SUPPORTING_RISK: "RISK_MODEL",
  HTX_EXECUTION: "HTX_EXECUTION_GATE",
});

function upper(value) { return safeText(value).toUpperCase(); }
function clone(value) { return value == null ? value : structuredClone(value); }
function timestamp(value) {
  const n = safeFinite(value);
  if (n === null || n <= 0) return null;
  const ms = n < 10_000_000_000 ? n * 1000 : n;
  return Number.isSafeInteger(ms) ? ms : null;
}
function normalizeContract(value) { return safeText(value).normalize("NFC"); }
function boundedId(prefix, material) { return `${prefix}:${digest(material)}`; }
function nullableText(value) { const out = safeText(value); return out || null; }
function validWitness(witness) {
  return Boolean(
    witness && typeof witness === "object" &&
    witness.immutable_row === true &&
    witness.d1_acknowledged === true &&
    witness.event && typeof witness.event === "object" &&
    safeInt(witness.persisted_ts) !== null
  );
}

function rawOpportunityDigest(event, episodeRevision) {
  // Digest the complete immutable event envelope, not only its identity scalars.
  // D1 integrity triggers already freeze event_json; this digest makes that exact
  // factual payload part of the downstream causal-lineage receipt.
  return digest({ episode_revision: episodeRevision, event });
}

/**
 * Build a Final-Decision-compatible opportunity envelope only from a D1-backed,
 * immutable opportunity admission witness.  This is a producer boundary, not
 * an adapter fallback: absent/legacy/unacknowledged rows remain unproven.
 */
export function buildOpportunityProofFromAdmissionWitness({
  analysis,
  witness,
  snapshot_id,
  observed_ts,
  receipt_committed_ts,
} = {}) {
  if (!validWitness(witness)) {
    return { status: "UNPROVEN", reason: "D1_ADMISSION_WITNESS_MISSING", proof: null };
  }
  const event = clone(witness.event);
  const eventId = safeText(event?.event_id);
  const episodeId = safeText(event?.episode_id || eventId);
  const contract = normalizeContract(event?.contract || analysis?.contract);
  const snapshot = safeText(snapshot_id);
  const eventTs = timestamp(event?.timestamp);
  const closeTs = timestamp(event?.event_close_ts);
  const observed = timestamp(observed_ts);
  const committed = timestamp(receipt_committed_ts ?? observed);
  const rowPersisted = timestamp(witness.persisted_ts);
  if (!eventId || !episodeId || !contract || !snapshot || eventTs === null || closeTs === null || observed === null || committed === null || rowPersisted === null) {
    return { status: "FAIL_CLOSED", reason: "OPPORTUNITY_IDENTITY_OR_TIME_INVALID", proof: null };
  }
  if (closeTs <= eventTs || closeTs > observed || rowPersisted > observed || committed > observed) {
    return { status: "FAIL_CLOSED", reason: "OPPORTUNITY_TIMELINE_INVALID", proof: null };
  }
  const episodeRevision = safeInt(witness?.episode_revision);
  if (episodeRevision !== 1 || !safeText(witness?.raw_event_digest)) {
    return { status: "UNPROVEN", reason: "STAGE392_OPPORTUNITY_PROOF_IDENTITY_MISSING", proof: null };
  }
  const analysisEvent = analysis?.newest_event;
  if (!analysisEvent || safeText(analysisEvent?.event_id) !== eventId || normalizeContract(analysisEvent?.contract || analysis?.contract) !== contract) {
    return { status: "FAIL_CLOSED", reason: "OPPORTUNITY_WITNESS_NOT_CURRENT_ANALYSIS_EVENT", proof: null };
  }
  if (timestamp(analysisEvent?.timestamp) !== eventTs || timestamp(analysisEvent?.event_close_ts) !== closeTs) {
    return { status: "FAIL_CLOSED", reason: "OPPORTUNITY_WITNESS_ANALYSIS_TIMELINE_MISMATCH", proof: null };
  }
  const expectedRawDigest = rawOpportunityDigest(event, episodeRevision);
  if (safeText(witness.raw_event_digest) !== expectedRawDigest) {
    return { status: "FAIL_CLOSED", reason: "OPPORTUNITY_RAW_EVENT_DIGEST_MISMATCH", proof: null };
  }
  if ((event?.control_group === true) !== (witness?.control_group === true)) {
    return { status: "FAIL_CLOSED", reason: "OPPORTUNITY_CONTROL_MEMBERSHIP_MISMATCH", proof: null };
  }
  if ((event?.directional_evaluation_eligible === true) !== (witness?.directional_evaluation_eligible === true)) {
    return { status: "FAIL_CLOSED", reason: "OPPORTUNITY_DIRECTION_ELIGIBILITY_MISMATCH", proof: null };
  }
  // A control observation is never an admission proof for Final Decision.
  // Likewise, a row that failed the factual independence admission cannot be
  // promoted merely because it has an immutable D1 identity. This explicitly
  // prevents signal/control dual use and closes the contamination bypass.
  if (witness.control_group === true || event?.control_group === true) {
    return { status: "FAIL_CLOSED", reason: "CONTROL_GROUP_CANNOT_BECOME_ADMISSION_PROOF", proof: null };
  }
  if (witness.independent_sample !== true || event?.independent_sample !== true) {
    return { status: "FAIL_CLOSED", reason: "NON_INDEPENDENT_SAMPLE_CANNOT_BECOME_ADMISSION_PROOF", proof: null };
  }
  const directional = witness.directional_evaluation_eligible === true && ["LONG", "SHORT"].includes(upper(event?.direction_at_event));
  const direction = directional ? upper(event.direction_at_event) : "DIRECTIONLESS_EVENT";
  const directionLockedTs = directional ? timestamp(event?.direction_locked_ts) : null;
  if (directional && directionLockedTs !== closeTs) {
    return { status: "FAIL_CLOSED", reason: "DIRECTION_NOT_PRECOMMITTED_AT_CLOSE", proof: null };
  }
  const rawDigest = expectedRawDigest;
  const assignmentId = boundedId("CGA", [eventId, episodeId, episodeRevision, false]);
  const controlReceiptId = boundedId("CGR", [eventId, episodeId, episodeRevision, assignmentId]);
  const directionReceiptId = boundedId("ODR", [eventId, episodeId, episodeRevision, direction]);
  const receiptCommit = Math.max(closeTs, rowPersisted);

  const provenEvent = {
    ...event,
    event_id: eventId,
    episode_id: episodeId,
    episode_revision: episodeRevision,
    contract,
    timestamp: eventTs,
    event_close_ts: closeTs,
    data_quality: upper(event?.data_quality) || "PARTIAL",
    control_group: false,
    control_group_membership_verified: true,
    control_group_assignment_id: assignmentId,
    admission_eligible: witness.independent_sample === true && witness.control_group === false,
    raw_event_digest: rawDigest,
    direction_at_event: direction,
    direction_locked_ts: directional ? closeTs : null,
    direction_available_ts: directional ? closeTs : null,
    directional_evaluation_eligible: directional,
    direction_source: directional ? "OPPORTUNITY_PRECOMMITTED_DIRECTION_V1" : "OPPORTUNITY_DIRECTIONLESS_V1",
    direction_rules_version: "opportunity-direction-lock-v1",
    observation_timing: directional
      ? { timely_for_precommitted_funnel: true, retrospective_promotion_forbidden: false }
      : { timely_for_precommitted_funnel: false, retrospective_promotion_forbidden: true },
  };

  const controlGroupReceipt = {
    schema_version: "control-group-assignment-receipt-v1",
    status: "CLOSED",
    authoritative: true,
    assignment_id: assignmentId,
    event_id: eventId,
    episode_id: episodeId,
    episode_revision: episodeRevision,
    control_group: false,
    rules_version: "opportunity-control-group-v1",
    raw_event_digest: rawDigest,
    assigned_ts: closeTs,
    receipt_id: controlReceiptId,
    persistence: {
      status: "CLOSED",
      receipt_id: controlReceiptId,
      committed_ts: receiptCommit,
      immutable: true,
      verification_method: "D1_IMMUTABLE_RECEIPT",
    },
  };
  const directionReceipt = {
    schema_version: "opportunity-direction-receipt-v1",
    status: "CLOSED",
    authoritative: true,
    event_id: eventId,
    episode_id: episodeId,
    episode_revision: episodeRevision,
    direction,
    direction_locked_ts: directional ? closeTs : null,
    direction_available_ts: directional ? closeTs : null,
    raw_event_digest: rawDigest,
    rules_version: "opportunity-direction-lock-v1",
    receipt_id: directionReceiptId,
    persistence: {
      status: "CLOSED",
      receipt_id: directionReceiptId,
      committed_ts: receiptCommit,
      immutable: true,
      verification_method: "D1_IMMUTABLE_RECEIPT",
    },
  };
  const material = {
    contract,
    snapshot_id: snapshot,
    schema_version: "opportunity-integrity-shadow-v2-full-event",
    // Preserve the EXACT immutable D1 event, including non-identity values.
    // The v1 engine identity-only digest cannot validate this stronger format.
    source_event_payload: clone(witness.event),
    source_event_episode_revision: episodeRevision,
    observed_ts: observed,
    status: upper(analysis?.status) === "OK" ? "OK" : (upper(analysis?.status) || "PARTIAL"),
    admitted_event_id: eventId,
    newest_event: provenEvent,
    control_group_receipt: controlGroupReceipt,
    direction_receipt: directionReceipt,
  };
  const proof = immutableReceipt(material, boundedId("OPR", [contract, snapshot, eventId, observed]), committed);
  return { status: "CLOSED", reason: null, proof };
}

export function buildSafetyGateSnapshot({
  contract_code,
  snapshot_id,
  observed_ts,
  full_evidence_record,
  shadow_decision,
  execution_snapshot = null,
  committed_ts,
} = {}) {
  const contract = normalizeContract(contract_code);
  const observed = timestamp(observed_ts);
  const committed = timestamp(committed_ts ?? observed);
  if (!contract || !safeText(snapshot_id) || observed === null || committed === null) {
    return { hard_veto: null, execution_gate: null, receipt: null };
  }
  const receiptId = boundedId("SGR", [contract, snapshot_id, observed]);
  // A summary CLOSED flag cannot manufacture a fresh book, order quantity or
  // a measurable close. Recompute bounded factual quotes, preserving source time.
  const factual = verifyExecutionFacts(execution_snapshot, { contract_code: contract, observed_ts: observed });
  const verified = factual.plans !== null && factual.facts !== null;
  const sourceTs = verified ? factual.facts.book_source_ts : null;
  const availableTs = verified ? factual.facts.received_ts : null;
  const expiry = verified ? factual.facts.valid_until_ts : null;
  const executionClosed = verified && ["LONG", "SHORT"].some(d => factual.plans[d]?.status === "CLOSED");
  const side = (direction) => {
    const plan = verified ? factual.plans[direction] : null;
    const closed = plan?.status === "CLOSED";
    return {
      status: closed ? "CLOSED" : "NOT_CLOSED",
      intent: direction === "LONG" ? "OPEN_LONG_BUY" : "OPEN_SHORT_SELL",
      measurable: closed, source_ts: sourceTs, available_ts: availableTs,
      max_age_ms: 15_000, valid_until_ts: expiry,
      requested_reference_notional_usdt: verified ? factual.facts.requested_reference_notional_usdt : null,
      measured_contracts: plan?.measured_contracts ?? null,
      measured_base_quantity: plan?.measured_base_quantity ?? null,
      entry_quote: plan?.entry ?? null,
      same_quantity_exit_quote: plan?.exit ?? null,
      reasons: plan?.reasons ?? factual.reasons,
    };
  };
  // A quoted analytical opportunity is not an actual position. No personal or
  // virtual position quantity is present in this producer; do not pretend that
  // its reference size proves a close for an already open position.
  const unprovenClose = (intent) => ({status:"NOT_CLOSED", intent, measurable:false,
    source_ts:null, available_ts:null, max_age_ms:15_000, valid_until_ts:null,
    reasons:["OPEN_POSITION_QUANTITY_NOT_VERIFIED_BY_EXECUTION_PRODUCER"]});
  const executionGate = {
    status: executionClosed ? "CLOSED" : "NOT_CLOSED",
    snapshot_id: safeText(snapshot_id), authoritative: verified,
    htx_execution_gate_closed: executionClosed, execution_blocked: false,
    contract_code: contract, source_ts: sourceTs, available_ts: availableTs,
    max_age_ms: 30_000, valid_until_ts: expiry,
    safety_gate_receipt_id: receiptId, producer_rules_version: "safety-gate-snapshot-v1",
    entry_sides: { LONG:side("LONG"), SHORT:side("SHORT") },
    close_sides: { LONG:unprovenClose("CLOSE_LONG_SELL"), SHORT:unprovenClose("CLOSE_SHORT_BUY") },
    source_eq_status: upper(shadow_decision?.eq?.status) || null,
    legacy_summary_claim: full_evidence_record?.htx_execution_gate_closed ?? null,
    factual_basis: factual,
    measurement_semantics: "RETURNED_HTX_BOOK_REFERENCE_SIZE_ONLY_NOT_PERSONAL_SIZE_OR_ORDER_AUTHORIZATION",
    costs_checked: false, // Fees/funding and scenario risk must be checked elsewhere.
  };
  // Authoritative only for the explicitly owned safety blockers. Other entry
  // requirements stay in their independent Final Decision gates; they are not
  // silently called CLEAR here.
  const hardVeto = produceTz101HardVeto({
    contract_code: contract,
    snapshot_id: safeText(snapshot_id),
    observed_ts: observed,
    safety_gate_receipt_id: receiptId,
    full_evidence_record,
    execution_snapshot,
  }) || {
    status: "UNKNOWN", authoritative: false, contract_code: contract, snapshot_id: safeText(snapshot_id),
    source_ts: observed, available_ts: observed, max_age_ms: 60_000, valid_until_ts: observed + 60_000,
    safety_gate_receipt_id: receiptId, producer_rules_version: "safety-gate-snapshot-v1",
    scope: "SAFETY_LEVEL_BLOCKERS_ONLY_OTHER_ENTRY_GATES_REMAIN_SEPARATE",
    checks: [], reasons: [], unknown_reasons: ["AUTHORITATIVE_HARD_VETO_PRODUCER_INPUT_INVALID"],
    producer_owned_assessment_complete: false,
  };
  hardVeto.partial_execution_assessment = {
    status: factual.check,
    reasons: factual.reasons,
    // Compatibility field keeps its original whole-decision meaning: this
    // producer never claims that scenario/timing/cost/personal-risk gates are done.
    full_hard_veto_assessment_complete: false,
    producer_owned_hard_veto_assessment_complete: hardVeto.producer_owned_assessment_complete === true,
    other_entry_gates_remain_separate: Array.isArray(hardVeto.non_owned_entry_gates) ? hardVeto.non_owned_entry_gates : [],
  };
  const material = { hard_veto: hardVeto, execution_gate: executionGate };
  const contentDigest = digest(material);
  const receipt = {
    schema_version: "safety-gate-receipt-v1",
    status: "CLOSED",
    authoritative: true,
    contract_code: contract,
    snapshot_id: safeText(snapshot_id),
    observed_ts: observed,
    receipt_id: receiptId,
    content_digest: contentDigest,
    rules_version: "safety-gate-snapshot-v1",
    persistence: {
      status: "CLOSED",
      receipt_id: receiptId,
      content_digest: contentDigest,
      committed_ts: committed,
      immutable: true,
      verification_method: "D1_IMMUTABLE_RECEIPT",
    },
  };
  return { hard_veto: hardVeto, execution_gate: executionGate, receipt };
}

function fullEvidenceRawObservationDigest(row, contract, snapshotId) {
  return digest([
    contract,
    snapshotId,
    safeText(row?.source),
    safeText(row?.venue),
    safeText(row?.metric),
    timestamp(row?.source_ts),
    timestamp(row?.available_ts),
    timestamp(row?.valid_until_ts),
    safeInt(row?.max_age_sec),
    row?.value ?? null,
    safeFinite(row?.coverage_pct),
  ]);
}

function fullRegistryProjection(row) {
  return {
    chain: upper(row?.chain),
    source_observation_id: safeText(row?.source_observation_id),
    source_payload_digest: safeText(row?.source_payload_digest),
    source: safeText(row?.source),
    venue: safeText(row?.venue),
    metric: safeText(row?.metric),
    source_ts: timestamp(row?.source_ts),
    available_ts: timestamp(row?.available_ts),
    valid_until_ts: timestamp(row?.valid_until_ts),
    max_age_sec: safeInt(row?.max_age_sec),
    producer_rules_version: safeText(row?.producer_rules_version),
    safety_gate_receipt_id: nullableText(row?.safety_gate_receipt_id),
  };
}

function boundedFullEvidenceRows(record, { contract, snapshotId, observed, registryReceiptId, safetyReceiptId } = {}) {
  const sourceRows = Array.isArray(record?.evidence_compact) ? record.evidence_compact : [];
  const supported = sourceRows.filter((row) => SUPPORTED_FULL_CHAINS.has(upper(row?.chain))).slice(0, 32);
  return supported.map((raw, index) => {
    const chain = upper(raw?.chain);
    const sourceTs = timestamp(raw?.source_ts);
    const availableTs = timestamp(raw?.available_ts);
    const maxAgeSec = safeInt(raw?.max_age_sec);
    const validUntilTs = sourceTs !== null && maxAgeSec !== null && maxAgeSec > 0 && Number.isSafeInteger(sourceTs + maxAgeSec * 1000)
      ? sourceTs + maxAgeSec * 1000
      : null;
    // Raw lineage identity MUST NOT contain the destination chain or row index.
    // Otherwise the same factual source observation could be relabelled into two
    // chains and evade cross-chain/double-counting detection.
    const factMaterial = [
      contract, snapshotId, safeText(raw?.source), safeText(raw?.venue), safeText(raw?.metric),
      sourceTs, availableTs, validUntilTs, maxAgeSec, raw?.value ?? null, safeFinite(raw?.coverage_pct),
    ];
    const row = {
      ...clone(raw),
      snapshot_id: snapshotId,
      contract_code: contract,
      chain,
      metric_semantics: FULL_SEMANTICS[chain],
      source_kind: FULL_SOURCE_KIND[chain],
      producer_rules_version: "full-evidence-source-producer-v1",
      source_observation_id: boundedId("FSO", factMaterial),
      source_payload_digest: null,
      source_receipt_id: registryReceiptId,
      safety_gate_receipt_id: chain === "HTX_EXECUTION" ? safetyReceiptId : null,
      source_ts: sourceTs,
      available_ts: availableTs,
      valid_until_ts: validUntilTs,
      max_age_sec: maxAgeSec,
      source_fact_ids: [boundedId("FF", factMaterial)],
      symbol_verified: raw?.symbol_verified === true,
      source_compatible: raw?.source_compatible === true,
      alias_required: raw?.alias_required === true,
      alias_verified: raw?.alias_required === true ? raw?.alias_verified === true : true,
      asset_identity_verified: raw?.alias_required === true ? raw?.asset_identity_verified === true : true,
      // Stage 3.9.2 may seal producer identity, but MUST NOT manufacture it.
      // Missing upstream market/group identity remains null and therefore fails
      // strict Final Decision usability instead of becoming synthetic proof.
      primary_market_id: nullableText(raw?.primary_market_id),
      independence_group: nullableText(raw?.independence_group),
      error: raw?.error ? String(raw.error).slice(0, 180) : null,
    };
    row.source_payload_digest = fullEvidenceRawObservationDigest(row, contract, snapshotId);
    return row;
  });
}

export function buildDecisionEvidenceRegistry({
  decision_evidence = [],
  contract_code,
  snapshot_id,
  observed_ts,
  episode_id,
  episode_revision,
  committed_ts,
} = {}) {
  const contract = normalizeContract(contract_code);
  const observed = timestamp(observed_ts);
  const committed = timestamp(committed_ts ?? observed);
  const rows = Array.isArray(decision_evidence) ? clone(decision_evidence).slice(0, 24) : [];
  const receiptId = boundedId("ER", [contract, snapshot_id, episode_id, episode_revision, observed]);
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
    registry_receipt_id: receiptId,
    episode_id: row.episode_id,
    episode_revision: row.episode_revision,
    source_fact_ids: Array.isArray(row.fact_ids) ? [...row.fact_ids] : [],
    lineage_derivation_id: row.lineage_derivation_id || boundedId("DER", [receiptId, row.evidence_id, index]),
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
  })).sort((a, b) => safeText(a?.evidence_id).localeCompare(safeText(b?.evidence_id)));
  const registry = {
    status: "CLOSED",
    authoritative: true,
    contract_code: contract,
    snapshot_id: safeText(snapshot_id),
    observed_ts: observed,
    episode_id: safeText(episode_id),
    episode_revision: safeInt(episode_revision),
    rules_version: DECISION_EVIDENCE_REGISTRY_RULES_VERSION,
    receipt_id: receiptId,
    content_digest: null,
    persistence: {
      status: "CLOSED",
      receipt_id: receiptId,
      content_digest: null,
      committed_ts: committed,
      immutable: true,
      verification_method: "D1_IMMUTABLE_RECEIPT",
    },
    entries,
  };
  const contentDigest = decisionEvidenceRegistryContentDigest(registry);
  registry.content_digest = contentDigest;
  registry.persistence.content_digest = contentDigest;
  for (const row of rows) row.registry_receipt_id = receiptId;
  return { rows, registry };
}

/**
 * Prepare all proof objects that are persisted atomically inside the existing
 * full-evidence INSERT. The caller MUST NOT expose these as proven until that
 * INSERT receives a factual D1 ACK.
 */

export function buildPositionManagementContextFromFullEvidence({
  record,
  full_evidence_proof,
  position_proof,
  position_origin_campaign,
  contract_code,
  snapshot_id,
  observed_ts,
  committed_ts,
} = {}) {
  // Stage 3.9.2 intentionally does NOT synthesize a CLEAR/CAUTION/INVALIDATED
  // position assessment from mere SUPPORTING_RISK chain closure. A closed lane
  // proves evidence availability, not the semantic result of an invalidation
  // assessment. Until a factual, immutable risk/invalidation producer emits an
  // explicit position-management assessment, Final Decision must receive no
  // management context and therefore remain WAIT/FAIL_CLOSED for HOLD/EXIT
  // promotion. This is a deliberate fail-closed boundary, not missing wiring.
  void record;
  void full_evidence_proof;
  void position_proof;
  void position_origin_campaign;
  void contract_code;
  void snapshot_id;
  void observed_ts;
  void committed_ts;
  return null;
}

export function prepareFullEvidenceProofBundle({
  record,
  contract_code,
  snapshot_id,
  observed_ts,
  shadow_decision,
  opportunity_proof,
  campaign_proof,
  position_proof,
  position_origin_campaign = null,
  decision_evidence = [],
  decision_evidence_audit = null,
  execution_snapshot = null,
  committed_ts,
} = {}) {
  const contract = normalizeContract(contract_code || record?.contract);
  const observed = timestamp(observed_ts ?? record?.observed_ts);
  const committed = timestamp(committed_ts ?? observed);
  if (!record || !contract || !safeText(snapshot_id) || observed === null || committed === null) {
    return { status: "FAIL_CLOSED", reason: "FULL_EVIDENCE_PROOF_IDENTITY_INVALID", bundle: null };
  }
  const safety = buildSafetyGateSnapshot({
    contract_code: contract,
    snapshot_id,
    observed_ts: observed,
    full_evidence_record: record,
    shadow_decision,
    execution_snapshot,
    committed_ts: committed,
  });
  if (!safety.receipt) return { status: "FAIL_CLOSED", reason: "SAFETY_RECEIPT_PREP_FAILED", bundle: null };
  const fullRegistryReceiptId = boundedId("FER", [contract, snapshot_id, observed]);
  const rows = boundedFullEvidenceRows(record, {
    contract,
    snapshotId: safeText(snapshot_id),
    observed,
    registryReceiptId: fullRegistryReceiptId,
    safetyReceiptId: safety.receipt.receipt_id,
  });
  const registryEntries = rows.map(fullRegistryProjection)
    .sort((a, b) => safeText(a.source_observation_id).localeCompare(safeText(b.source_observation_id)));
  const registryContentDigest = digest(registryEntries);
  const sourceRegistry = {
    schema_version: "full-evidence-source-registry-v1",
    status: "CLOSED",
    authoritative: true,
    receipt_id: fullRegistryReceiptId,
    content_digest: registryContentDigest,
    entries: registryEntries,
    persistence: {
      status: "CLOSED",
      receipt_id: fullRegistryReceiptId,
      content_digest: registryContentDigest,
      committed_ts: committed,
      immutable: true,
      verification_method: "D1_IMMUTABLE_RECEIPT",
    },
  };
  const episodeId = safeText(opportunity_proof?.newest_event?.episode_id);
  const episodeRevision = safeInt(opportunity_proof?.newest_event?.episode_revision);
  const evidence = buildDecisionEvidenceRegistry({
    decision_evidence,
    contract_code: contract,
    snapshot_id,
    observed_ts: observed,
    episode_id: episodeId,
    episode_revision: episodeRevision,
    committed_ts: committed,
  });
  const material = {
    ...clone(record),
    contract,
    contract_code: contract,
    snapshot_id: safeText(snapshot_id),
    schema_version: "full-evidence-shadow-v1",
    observed_ts: observed,
    source_registry: sourceRegistry,
    evidence_compact: rows,
  };
  const fullProof = immutableReceipt(material, boundedId("FEROW", [contract, snapshot_id, observed]), committed);
  const positionManagementContext = buildPositionManagementContextFromFullEvidence({
    record,
    full_evidence_proof: fullProof,
    position_proof,
    position_origin_campaign,
    contract_code: contract,
    snapshot_id: safeText(snapshot_id),
    observed_ts: observed,
    committed_ts: committed,
  });
  const bundle = {
    version: STAGE392_PROOF_VERSION,
    mode: STAGE392_PROOF_MODE,
    contract_code: contract,
    snapshot_id: safeText(snapshot_id),
    observed_ts: observed,
    full_evidence: fullProof,
    hard_veto: safety.hard_veto,
    execution_gate: safety.execution_gate,
    safety_gate_receipt: safety.receipt,
    decision_evidence: evidence.rows,
    decision_evidence_audit: decision_evidence_audit === null ? null : clone(decision_evidence_audit),
    evidence_registry: evidence.registry,
    opportunity: opportunity_proof || null,
    campaign: campaign_proof || null,
    position: position_proof || { state: "UNKNOWN" },
    position_origin_campaign: position_origin_campaign || null,
    position_management_context: positionManagementContext,
  };
  return { status: "PREPARED_UNACKNOWLEDGED", reason: null, bundle };
}

export function sealFullEvidenceProofBundleAfterAck(prepared, ack = {}) {
  if (!prepared?.bundle || prepared.status !== "PREPARED_UNACKNOWLEDGED") {
    return { status: "FAIL_CLOSED", reason: "PROOF_BUNDLE_NOT_PREPARED", bundle: null };
  }
  if (ack === null || typeof ack !== "object" || Array.isArray(ack)) {
    return { status: "FAIL_CLOSED", reason: "FULL_EVIDENCE_EXACT_D1_INSERT_ACK_REQUIRED", bundle: null };
  }
  const hasChanges = Object.hasOwn(ack, "changes");
  const changes = hasChanges ? ack.changes : ack?.insert_changes;
  const conflictingCounts = hasChanges && Object.hasOwn(ack, "insert_changes") && ack.insert_changes !== changes;
  // INSERT OR IGNORE with changes=0 is not enough to prove that the exact
  // prepared proof bundle is the row already stored in D1. Proving a dedup
  // would require another read, which is forbidden on the peak path. Therefore
  // only a factual single-row insert ACK may close this receipt.
  const acknowledged = ack?.status === "CLOSED" && ack?.persisted === true &&
    typeof changes === "number" && Number.isSafeInteger(changes) && changes === 1 && !conflictingCounts;
  if (!acknowledged) return { status: "FAIL_CLOSED", reason: "FULL_EVIDENCE_EXACT_D1_INSERT_ACK_REQUIRED", bundle: null };
  return { status: "CLOSED", reason: null, bundle: prepared.bundle };
}

export function positionFromLedgerRow(row, { contract_code, snapshot_id, observed_ts, committed_ts, post_refresh_revision = null } = {}) {
  const contract = normalizeContract(contract_code);
  const observed = timestamp(observed_ts);
  const committed = timestamp(committed_ts ?? observed);
  if (!contract || !safeText(snapshot_id) || observed === null || committed === null) return null;
  const state = upper(row?.state || "FLAT");
  const revision = safeInt(post_refresh_revision ?? row?.state_revision ?? 1);
  const base = {
    schema_version: "shadow-position-ledger-v1",
    producer_rules_version: "shadow-position-ledger-v1",
    state: ["OPEN_LONG", "OPEN_SHORT", "FLAT"].includes(state) ? state : "UNKNOWN",
    authoritative: true,
    contract_code: contract,
    snapshot_id: safeText(snapshot_id),
    source_ts: observed,
    available_ts: observed,
    max_age_ms: 60_000,
    valid_until_ts: observed + 60_000,
    state_revision: revision ?? 1,
    // This ledger tracks the analytical/shadow episode only. It is not a
    // statement about the user's real portfolio and must never be presented as one.
    position_scope: "INTERNAL_SHADOW_ANALYTICAL_EPISODE",
    user_portfolio_state: "UNKNOWN",
    user_position_confirmed: false,
    user_position_quantity_contracts: null,
    user_management_authorized: false,
  };
  if (["OPEN_LONG", "OPEN_SHORT"].includes(base.state)) {
    Object.assign(base, {
      mode: "SHADOW_VIRTUAL",
      position_id: nullableText(row?.position_id),
      entry_ts: timestamp(row?.entry_ts),
      direction: upper(row?.direction),
      campaign_id: nullableText(row?.campaign_id),
      entry_wave_id: nullableText(row?.entry_wave_id),
      entry_decision_observation_ts: timestamp(row?.entry_decision_observation_ts),
      entry_decision_material_digest: nullableText(row?.entry_decision_material_digest),
      entry_decision_id: nullableText(row?.entry_decision_id),
      entry_action_id: nullableText(row?.entry_action_id),
    });
  }
  return immutableReceipt(base, boundedId("PSR", [contract, revision, observed, base.state]), committed);
}

export function positionOriginFromLedgerRow(row, position, { observed_ts, committed_ts } = {}) {
  if (!position || !["OPEN_LONG", "OPEN_SHORT"].includes(upper(position?.state))) return null;
  const observed = timestamp(observed_ts);
  const committed = timestamp(committed_ts ?? observed);
  const sourceCommitted = timestamp(row?.origin_source_campaign_committed_ts);
  if (observed === null || committed === null || sourceCommitted === null) return null;
  const material = {
    schema_version: "shadow-position-origin-campaign-v2",
    producer_rules_version: "shadow-position-origin-campaign-v2",
    status: "CLOSED",
    authoritative: true,
    contract_code: position.contract_code,
    campaign_id: position.campaign_id,
    direction: position.direction,
    entry_wave_id: position.entry_wave_id,
    entry_trigger_ts: position.entry_ts,
    entry_trigger_price: safeFinite(row?.origin_entry_trigger_price),
    entry_observation_id: nullableText(row?.origin_entry_observation_id),
    entry_action_id: position.entry_action_id,
    campaign_state_revision_at_entry: safeInt(row?.origin_campaign_state_revision),
    source_campaign_receipt_id: nullableText(row?.origin_source_campaign_receipt_id),
    source_campaign_content_digest: nullableText(row?.origin_source_campaign_content_digest),
    source_campaign_committed_ts: sourceCommitted,
  };
  return immutableReceipt(material, boundedId("POC", [material.contract_code, material.campaign_id, material.entry_wave_id, material.entry_trigger_ts]), committed);
}

export function buildPositionOriginSeed(campaignProof) {
  const state = campaignProof?.campaign;
  if (!state || !["ENTRY_TRIGGER", "NEXT_IMPULSE_ENTRY"].includes(upper(state?.current_phase))) return null;
  const wave = Array.isArray(state?.wave_ledger)
    ? state.wave_ledger.find((candidate) => candidate?.wave_id === state?.current_wave_id)
    : null;
  if (!wave) return null;
  const entryRevision = safeInt(state?.state_revision);
  const contentDigest = digest([
    state.campaign_id,
    state.direction,
    wave.wave_id,
    timestamp(wave.entry_trigger_time),
    safeFinite(wave.entry_trigger_price),
    wave.entry_observation_id,
    entryRevision,
  ]);
  return {
    campaign_id: state.campaign_id,
    direction: state.direction,
    entry_wave_id: wave.wave_id,
    entry_action_id: nullableText(campaignProof?.entry_window?.action_id),
    entry_trigger_ts: timestamp(wave.entry_trigger_time),
    entry_trigger_price: safeFinite(wave.entry_trigger_price),
    entry_observation_id: wave.entry_observation_id,
    campaign_state_revision_at_entry: entryRevision,
    source_campaign_receipt_id: campaignProof?.persistence?.receipt_id || null,
    source_campaign_content_digest: contentDigest,
    source_campaign_committed_ts: timestamp(campaignProof?.persistence?.committed_ts),
  };
}

export function stage392ProofSafetyEnvelope() {
  return Object.freeze({
    shadow_only: true,
    live_probability: null,
    live_signal: false,
    validated_signal: false,
    telegram_started: false,
    trading_execution: false,
    automatic_weight_tuning: false,
    strategy_weights_changed: false,
  });
}

export function proofBundleDigest(bundle) { return digest(stableJson(bundle)); }
