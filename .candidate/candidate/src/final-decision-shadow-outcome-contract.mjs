/*
 * Research-only prospective outcome design for Final Decision Integration.
 *
 * This module performs no I/O and cannot reserve, enroll, activate, measure,
 * calibrate, promote, notify, or execute anything. It emits sealed proposals
 * that remain unusable until a future persistence design can atomically commit
 * the parent decision and cohort reservation while proving that the HTX anchor
 * receipt already existed. No backfill is permitted.
 */

import { validateFinalDecisionOutput } from "./final-decision-integration-engine.mjs";

export const FINAL_DECISION_OUTCOME_CONTRACT_VERSION = "final-decision-outcome-contract-v2-research-only";
export const FINAL_DECISION_OUTCOME_RULES_VERSION = "final-decision-outcome-prospective-rules-v2";
export const FINAL_DECISION_OUTCOME_MODE = "SHADOW_DESIGN_ONLY_NO_PERSISTENCE";

export const FINAL_DECISION_OUTCOME_LIMITS = Object.freeze({
  max_cohorts_per_decision: 3,
  max_horizons_per_cohort: 4,
  max_designed_targets_per_decision: 12,
  max_anchor_age_ms: 60_000,
  retention_ms: 180 * 24 * 60 * 60 * 1000,
  d1_statements_added_by_builder: 0,
  network_calls_added_by_builder: 0,
});

const COHORTS = Object.freeze(["DIRECTIONAL", "ENTRY", "MANAGEMENT"]);
const LINEAGE_RECEIPT_KEYS = Object.freeze([
  "campaign", "decision_evidence", "full_evidence", "full_evidence_source", "opportunity",
  "position", "position_management", "position_origin_campaign", "safety_gate",
]);
const HORIZON_RULES = Object.freeze([
  Object.freeze({ horizon: "1H", offset_ms: 60 * 60 * 1000 }),
  Object.freeze({ horizon: "4H", offset_ms: 4 * 60 * 60 * 1000 }),
  Object.freeze({ horizon: "12H", offset_ms: 12 * 60 * 60 * 1000 }),
  Object.freeze({ horizon: "24H", offset_ms: 24 * 60 * 60 * 1000 }),
]);

const ACTIVATION_GATE = "BLOCKED_UNTIL_ATOMIC_PARENT_COHORT_RESERVATION_WITH_PREEXISTING_ANCHOR_RECEIPT";
const PROPOSED_REASON = "DESIGN_PROPOSAL_NOT_RESERVED_OR_ACTIVATABLE";

const ANCHOR_MATERIAL_KEYS = Object.freeze([
  "schema_version", "status", "contract_code", "snapshot_id", "decision_observation_ts",
  "reference_price", "reference_ts", "available_ts", "max_age_ms", "valid_until_ts",
  "source", "venue", "price_kind", "source_observation_id", "source_payload_digest",
  "source_receipt_id", "source_receipt_content_digest", "symbol_verified",
  "source_compatible", "closed_bar", "interpolation_used", "future_data_used",
  "source_receipt_preexistence_verified", "lineage_verification_status",
]);

const CONTRACT_KEYS = Object.freeze([
  "version", "rules_version", "mode", "status", "sampling_contract_id", "material_digest",
  "parent_decision_id", "parent_decision_material_digest", "parent_decision_status",
  "parent_input_lineage_digest", "parent_rules_version", "decision_anchor_id", "contract_code",
  "snapshot_id", "decision_observation_ts", "frozen_decision_state", "prospective_anchor",
  "horizons", "cohorts", "proposal_count", "reservation_count", "enrollment_count",
  "designed_target_count", "scheduled_target_count", "activation_gate", "activation_deadline_ts",
  "calibration_eligible", "calibration_status", "shadow_only", "live_probability",
  "validated_signal", "execution_authorized", "telegram_eligible", "anti_look_ahead",
  "dependence_policy", "bounds", "reason_codes",
]);

const COHORT_KEYS = Object.freeze([
  "cohort", "sampling_state", "hypothesis_id", "statistical_unit_id",
  "dependence_cluster_id", "dependence_cluster_basis_digest", "cohort_dedup_key",
  "decision_state_revision", "decision_state_key", "measurement_set", "required_receipt_keys",
  "management_transition_id", "management_transition_source", "management_trigger_basis",
  "reason_codes",
]);

const FROZEN_HYPOTHESIS_KEYS = Object.freeze([
  "decision_anchor_id", "decision_observation_ts", "admitted_event_id", "direction", "direction_provenance",
  "directional_quality", "entry_action", "entry_action_id", "entry_quality", "campaign_phase",
  "timing_state", "risk_state", "hard_veto_state", "entry_execution_quality", "position_state",
  "management_action", "management_action_id", "management_intent", "management_quality",
  "management_execution_quality", "causal_effect_claimed", "classification_is_probability",
]);

const ANTI_LOOK_AHEAD = Object.freeze({
  prospective_only: true,
  builder_can_activate: false,
  builder_can_persist: false,
  atomic_parent_and_cohort_reservation_required: true,
  anchor_receipt_must_preexist_atomic_reservation: true,
  source_receipt_join_required_before_reservation: true,
  activation_deadline_clock: "FIRST_POST_DECISION_CLOSED_HTX_1M_BAR_CLOSE",
  activation_deadline_exclusive: true,
  late_activation_result: "CENSORED_NO_BACKFILL",
  target_clock_origin: "DECISION_OBSERVATION_TS",
  outcome_bar_policy: "FIRST_COMPLETE_HTX_1M_BAR_WITH_CLOSE_TS_GTE_TARGET",
  outcome_bar_max_delay_ms: 60_000,
  outcome_bar_must_be_available_before_read: true,
  path_window_start: "DECISION_OBSERVATION_TS_EXCLUSIVE",
  path_window_end: "SELECTED_OUTCOME_BAR_CLOSE_TS_INCLUSIVE",
  missing_or_partial_result: "NULL_AND_INSUFFICIENT",
  interpolation_allowed: false,
  direction_rewrite_allowed: false,
  backfill_can_change_hypothesis: false,
  future_data_read_by_builder: false,
  outcome_values_present_in_contract: false,
});

const DEPENDENCE_POLICY = Object.freeze({
  statistical_independence_claimed: false,
  repeated_decisions_independent: false,
  cohorts_in_same_cluster_independent: false,
  different_clusters_statistically_independent: false,
  analysis_cluster_key: "dependence_cluster_id",
  statistical_unit_key: "statistical_unit_id",
  directional_unit_basis: "CONTRACT_PLUS_ORIGIN_EPISODE_ID_WITHOUT_EPISODE_REVISION",
  entry_unit_basis: "CONTRACT_PLUS_CAMPAIGN_PLUS_WAVE_WITHOUT_CAMPAIGN_STATE_REVISION",
  management_unit_basis: "CONTRACT_PLUS_POSITION_ID_REPEATED_MEASURES_BY_IMMUTABLE_TRANSITION",
  dedup_semantics: "ATOMIC_UNIQUE_COHORT_DEDUP_KEY_FIRST_RESERVATION_WINS_NO_BACKFILL",
});

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, expected) {
  return isPlainObject(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function stableJson(value) {
  const ancestors = new Set();
  let nodes = 0;
  function encode(node, depth) {
    nodes += 1;
    if (nodes > 4096 || depth > 24) throw new Error("OUTCOME_CONTRACT_STRUCTURE_LIMIT_EXCEEDED");
    if (node === null) return "null";
    if (["boolean", "string"].includes(typeof node)) return JSON.stringify(node);
    if (typeof node === "number") {
      if (!Number.isFinite(node)) throw new Error("OUTCOME_CONTRACT_NON_FINITE_NUMBER");
      return JSON.stringify(node);
    }
    if (typeof node !== "object" || ancestors.has(node)) throw new Error("OUTCOME_CONTRACT_UNSAFE_VALUE");
    ancestors.add(node);
    let encoded;
    if (Array.isArray(node)) {
      if (Object.getPrototypeOf(node) !== Array.prototype || node.length > 256) throw new Error("OUTCOME_CONTRACT_ARRAY_INVALID");
      const descriptors = Object.getOwnPropertyDescriptors(node);
      encoded = `[${node.map((_, index) => {
        const descriptor = descriptors[String(index)];
        if (!descriptor || descriptor.get || descriptor.set) throw new Error("OUTCOME_CONTRACT_ACCESSOR_FORBIDDEN");
        return encode(descriptor.value, depth + 1);
      }).join(",")}]`;
    } else {
      if (!isPlainObject(node)) throw new Error("OUTCOME_CONTRACT_OBJECT_INVALID");
      const keys = Object.keys(node).sort();
      if (keys.length > 128 || keys.some((key) => key.length > 256)) throw new Error("OUTCOME_CONTRACT_OBJECT_LIMIT_EXCEEDED");
      const descriptors = Object.getOwnPropertyDescriptors(node);
      encoded = `{${keys.map((key) => {
        const descriptor = descriptors[key];
        if (!descriptor || descriptor.get || descriptor.set) throw new Error("OUTCOME_CONTRACT_ACCESSOR_FORBIDDEN");
        return `${JSON.stringify(key)}:${encode(descriptor.value, depth + 1)}`;
      }).join(",")}}`;
    }
    ancestors.delete(node);
    return encoded;
  }
  return encode(value, 0);
}

function fnv1a64(value) {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(String(value))) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

function digest(value) {
  return fnv1a64(stableJson(value));
}

function safeId(value, max = 320) {
  return typeof value === "string" && value.length > 0 && value.length <= max && /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/.test(value);
}

function safeDigest(value) {
  return typeof value === "string" && /^[0-9a-f]{16}$/.test(value);
}

function upper(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function timestamp(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value >= 1 ? value : null;
}

function nonnegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function normalizedContract(value) {
  if (typeof value !== "string" || value !== value.normalize("NFC") || !/^[A-Z0-9][A-Z0-9._:-]{0,79}$/.test(value)) return null;
  return value;
}

function reasonCode(value) {
  const normalized = String(value || "UNKNOWN").normalize("NFKC").toUpperCase().replace(/[^A-Z0-9_.:-]+/g, "_");
  return (/^[A-Z]/.test(normalized) ? normalized : `R_${normalized}`).slice(0, 96);
}

function uniqReasons(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined).map(reasonCode))].sort().slice(0, 32);
}

function verifyParentDecision(decision) {
  try {
    const validation = validateFinalDecisionOutput(decision);
    if (!validation?.valid) return { valid: false, errors: uniqReasons(validation?.errors || ["PARENT_DECISION_INVALID"]) };
    return { valid: true, errors: [], contract: normalizedContract(decision.contract_code), observed_ts: timestamp(decision.observation_ts) };
  } catch {
    return { valid: false, errors: ["PARENT_DECISION_UNREADABLE"] };
  }
}

function receiptAbsent(receipt) {
  return isPlainObject(receipt) && receipt.receipt_id === null && receipt.content_digest === null && receipt.committed_ts === null;
}

function linkedReceipt(envelope, expectedReceipt, observedTs, label, { materialSealed = false } = {}) {
  const errors = [];
  if (receiptAbsent(expectedReceipt)) {
    if (envelope !== null && envelope !== undefined) errors.push(`${label}_UNBOUND_SOURCE_PRESENT`);
    return { present: false, errors: uniqReasons(errors) };
  }
  if (!isPlainObject(expectedReceipt) || !isPlainObject(envelope) || !isPlainObject(envelope.persistence)) {
    return { present: false, errors: [`${label}_RECEIPT_MISSING`] };
  }
  const persistence = envelope.persistence;
  if (upper(persistence.status) !== "CLOSED" || persistence.immutable !== true || persistence.verification_method !== "D1_IMMUTABLE_RECEIPT") errors.push(`${label}_RECEIPT_NOT_IMMUTABLE`);
  if (persistence.receipt_id !== expectedReceipt.receipt_id || persistence.content_digest !== expectedReceipt.content_digest || persistence.committed_ts !== expectedReceipt.committed_ts) errors.push(`${label}_RECEIPT_LINK_MISMATCH`);
  if (!safeId(persistence.receipt_id, 256) || !safeDigest(persistence.content_digest) || timestamp(persistence.committed_ts) === null || persistence.committed_ts > observedTs) errors.push(`${label}_RECEIPT_INVALID`);
  if (Object.prototype.hasOwnProperty.call(envelope, "receipt_id") && envelope.receipt_id !== expectedReceipt.receipt_id) errors.push(`${label}_OUTER_RECEIPT_ID_MISMATCH`);
  if (Object.prototype.hasOwnProperty.call(envelope, "content_digest") && envelope.content_digest !== expectedReceipt.content_digest) errors.push(`${label}_OUTER_RECEIPT_DIGEST_MISMATCH`);
  if (materialSealed) {
    try {
      const material = { ...envelope };
      delete material.persistence;
      if (digest(material) !== expectedReceipt.content_digest) errors.push(`${label}_MATERIAL_DIGEST_MISMATCH`);
    } catch {
      errors.push(`${label}_MATERIAL_UNREADABLE`);
    }
  }
  return { present: true, errors: uniqReasons(errors) };
}

function requiredProofErrors(source, keys) {
  return uniqReasons(keys.flatMap((key) => {
    const proof = source.proofs[key];
    if (!proof?.present) return [`${key.toUpperCase()}_RECEIPT_REQUIRED`, ...(proof?.errors || [])];
    return proof.errors;
  }));
}

function extractSourceContext(sourceInput, decision) {
  const result = {
    proofs: {}, opportunity: null, campaign: null, position: null, origin: null, management: null,
    identity_errors: { opportunity: [], campaign: [], position: [], origin: [], management: [] },
  };
  const input = isPlainObject(sourceInput) ? sourceInput : {};
  const receipts = decision.lineage_receipts;
  const sources = {
    decision_evidence: [input.evidence_registry, false],
    full_evidence_source: [input?.full_evidence?.source_registry, false],
    full_evidence: [input.full_evidence, true],
    opportunity: [input.opportunity, true],
    campaign: [input.campaign, true],
    safety_gate: [input.safety_gate_receipt, false],
    position: [input.position, true],
    position_origin_campaign: [input.position_origin_campaign, true],
    position_management: [input.position_management_context, true],
  };
  for (const key of LINEAGE_RECEIPT_KEYS) {
    const [envelope, materialSealed] = sources[key];
    result.proofs[key] = linkedReceipt(envelope, receipts[key], decision.observation_ts, key.toUpperCase(), { materialSealed });
  }

  const event = input?.opportunity?.newest_event;
  if (!isPlainObject(event) || !safeId(event.event_id, 512) || input?.opportunity?.admitted_event_id !== event?.event_id ||
      !safeId(event.episode_id, 256) || nonnegativeInteger(event.episode_revision) === null ||
      normalizedContract(event.contract) !== decision.contract_code || timestamp(event.event_close_ts) === null ||
      event.event_close_ts > decision.observation_ts || !["LONG", "SHORT", "DIRECTIONLESS_EVENT"].includes(upper(event.direction_at_event))) {
    result.identity_errors.opportunity.push("OPPORTUNITY_ADMITTED_EVENT_IDENTITY_INVALID");
  } else {
    result.opportunity = {
      event_id: event.event_id, episode_id: event.episode_id, episode_revision: event.episode_revision,
      event_close_ts: event.event_close_ts, direction_at_event: upper(event.direction_at_event),
    };
  }

  const campaign = input?.campaign?.campaign;
  if (!isPlainObject(campaign) || !safeId(campaign.campaign_id, 256) || positiveInteger(campaign.state_revision) === null ||
      normalizedContract(campaign.contract_code) !== decision.contract_code || !safeId(campaign.origin_episode_id, 256) ||
      nonnegativeInteger(campaign.episode_revision) === null || timestamp(campaign.last_observed_ts) === null ||
      campaign.last_observed_ts > decision.observation_ts || !["LONG", "SHORT", "DIRECTIONLESS_EVENT"].includes(upper(campaign.direction)) ||
      !["LONG", "SHORT", "DIRECTIONLESS_EVENT"].includes(upper(campaign.direction_at_detection)) ||
      (campaign.current_wave_id !== null && !safeId(campaign.current_wave_id, 320))) {
    result.identity_errors.campaign.push("CAMPAIGN_COHORT_IDENTITY_INVALID");
  } else {
    result.campaign = {
      campaign_id: campaign.campaign_id, wave_id: campaign.current_wave_id, state_revision: campaign.state_revision,
      direction: upper(campaign.direction), direction_at_detection: upper(campaign.direction_at_detection),
      direction_locked_ts: timestamp(campaign.direction_locked_ts), origin_episode_id: campaign.origin_episode_id,
      episode_revision: campaign.episode_revision, phase: upper(campaign.current_phase),
    };
  }

  const position = input.position;
  const positionState = upper(position?.state);
  const open = ["OPEN_LONG", "OPEN_SHORT"].includes(positionState);
  if (!isPlainObject(position) || positionState !== decision.position_state || positiveInteger(position.state_revision) === null ||
      (open && (!safeId(position.position_id, 256) || !safeId(position.campaign_id, 256) || timestamp(position.entry_ts) === null || position.entry_ts > decision.observation_ts))) {
    result.identity_errors.position.push("POSITION_COHORT_IDENTITY_INVALID");
  } else {
    result.position = {
      state: positionState, position_id: open ? position.position_id : null, campaign_id: open ? position.campaign_id : null,
      state_revision: position.state_revision, entry_ts: open ? position.entry_ts : null,
    };
  }

  const origin = input.position_origin_campaign;
  if (!receiptAbsent(receipts.position_origin_campaign)) {
    if (!isPlainObject(origin) || !safeId(origin.campaign_id, 256) || !safeId(origin.entry_wave_id, 320) ||
        normalizedContract(origin.contract_code) !== decision.contract_code || !["LONG", "SHORT"].includes(upper(origin.direction)) ||
        timestamp(origin.entry_trigger_ts) === null || origin.entry_trigger_ts > decision.observation_ts || positiveInteger(origin.campaign_state_revision_at_entry) === null ||
        (result.position && (origin.campaign_id !== result.position.campaign_id || origin.entry_trigger_ts !== result.position.entry_ts))) {
      result.identity_errors.origin.push("POSITION_ORIGIN_COHORT_IDENTITY_INVALID");
    } else {
      result.origin = { campaign_id: origin.campaign_id, entry_wave_id: origin.entry_wave_id, entry_trigger_ts: origin.entry_trigger_ts };
    }
  }

  const management = input.position_management_context;
  if (!receiptAbsent(receipts.position_management)) {
    if (!isPlainObject(management) || !safeId(management.assessment_id, 256) || !safeId(management.position_id, 256) ||
        !safeId(management.origin_campaign_id, 256) || !safeId(management.origin_wave_id, 320) || management.invalidation_evaluated !== true ||
        !["CLEAR", "CAUTION", "INVALIDATED"].includes(upper(management.risk_state)) ||
        (result.position && management.position_id !== result.position.position_id) ||
        (result.origin && (management.origin_campaign_id !== result.origin.campaign_id || management.origin_wave_id !== result.origin.entry_wave_id))) {
      result.identity_errors.management.push("POSITION_MANAGEMENT_COHORT_IDENTITY_INVALID");
    } else {
      const transitionValid = safeId(management.management_transition_id, 320) && management.management_transition_immutable === true &&
        timestamp(management.management_transition_observed_ts) !== null && management.management_transition_observed_ts <= decision.observation_ts &&
        upper(management.management_transition_intent) === decision.management_intent && upper(management.management_transition_action) === decision.management_action;
      result.management = { risk_state: upper(management.risk_state), transition_id: transitionValid ? management.management_transition_id : null, transition_valid: transitionValid };
    }
  }
  for (const key of Object.keys(result.identity_errors)) result.identity_errors[key] = uniqReasons(result.identity_errors[key]);
  return result;
}

function anchorMaterial(options = {}) {
  return {
    schema_version: "final-decision-research-price-anchor-v2",
    status: "CLOSED_SOURCE_CLAIM_UNVERIFIED",
    contract_code: options.contract_code,
    snapshot_id: options.snapshot_id,
    decision_observation_ts: options.decision_observation_ts,
    reference_price: options.reference_price,
    reference_ts: options.reference_ts,
    available_ts: options.available_ts,
    max_age_ms: options.max_age_ms,
    valid_until_ts: options.valid_until_ts,
    source: "HTX_OFFICIAL",
    venue: "HTX",
    price_kind: "HTX_CLOSED_1M_CANDLE_CLOSE",
    source_observation_id: options.source_observation_id,
    source_payload_digest: options.source_payload_digest,
    source_receipt_id: options.source_receipt_id,
    source_receipt_content_digest: options.source_receipt_content_digest,
    symbol_verified: options.symbol_verified,
    source_compatible: options.source_compatible,
    closed_bar: options.closed_bar,
    interpolation_used: options.interpolation_used,
    future_data_used: options.future_data_used,
    source_receipt_preexistence_verified: false,
    lineage_verification_status: "UNVERIFIED_PREEXISTING_RECEIPT_JOIN_REQUIRED",
  };
}

function validateAnchorMaterial(material) {
  const errors = [];
  if (!exactKeys(material, ANCHOR_MATERIAL_KEYS)) return ["ANCHOR_SCHEMA_INVALID"];
  if (material.schema_version !== "final-decision-research-price-anchor-v2" || material.status !== "CLOSED_SOURCE_CLAIM_UNVERIFIED") errors.push("ANCHOR_STATUS_INVALID");
  if (!normalizedContract(material.contract_code) || !safeId(material.snapshot_id, 256)) errors.push("ANCHOR_IDENTITY_INVALID");
  const observationTs = timestamp(material.decision_observation_ts);
  const referenceTs = timestamp(material.reference_ts);
  const availableTs = timestamp(material.available_ts);
  const validUntilTs = timestamp(material.valid_until_ts);
  if (observationTs === null || referenceTs === null || availableTs === null || validUntilTs === null || referenceTs > availableTs || availableTs > observationTs || validUntilTs < observationTs) errors.push("ANCHOR_TEMPORAL_ORDER_INVALID");
  if (!Number.isSafeInteger(material.max_age_ms) || material.max_age_ms < 1 || material.max_age_ms > FINAL_DECISION_OUTCOME_LIMITS.max_anchor_age_ms ||
      (referenceTs !== null && validUntilTs !== referenceTs + material.max_age_ms) || (referenceTs !== null && observationTs !== null && observationTs - referenceTs > material.max_age_ms)) errors.push("ANCHOR_FRESHNESS_INVALID");
  if (typeof material.reference_price !== "number" || !Number.isFinite(material.reference_price) || material.reference_price <= 0) errors.push("ANCHOR_PRICE_INVALID");
  if (material.source !== "HTX_OFFICIAL" || material.venue !== "HTX" || material.price_kind !== "HTX_CLOSED_1M_CANDLE_CLOSE") errors.push("ANCHOR_SOURCE_INVALID");
  if (!safeId(material.source_observation_id, 256) || !safeDigest(material.source_payload_digest) || !safeId(material.source_receipt_id, 256) || !safeDigest(material.source_receipt_content_digest)) errors.push("ANCHOR_LINEAGE_INVALID");
  if (material.symbol_verified !== true || material.source_compatible !== true || material.closed_bar !== true || material.interpolation_used !== false || material.future_data_used !== false ||
      material.source_receipt_preexistence_verified !== false || material.lineage_verification_status !== "UNVERIFIED_PREEXISTING_RECEIPT_JOIN_REQUIRED") errors.push("ANCHOR_SAFETY_INVALID");
  return uniqReasons(errors);
}

export function buildProspectiveOutcomeAnchor(options = {}) {
  const material = anchorMaterial(options);
  const errors = validateAnchorMaterial(material);
  if (errors.length) throw new Error(errors.join(","));
  const contentDigest = digest(material);
  return {
    ...material,
    anchor_id: `FDOA:${digest([material.contract_code, material.snapshot_id, material.decision_observation_ts, contentDigest])}`,
    content_digest: contentDigest,
  };
}

function validateAnchor(anchor, decision) {
  const errors = [];
  if (!isPlainObject(anchor)) return { valid: false, errors: ["PROSPECTIVE_ANCHOR_MISSING"], value: null };
  const material = Object.fromEntries(ANCHOR_MATERIAL_KEYS.map((key) => [key, anchor[key]]));
  if (!exactKeys(anchor, [...ANCHOR_MATERIAL_KEYS, "anchor_id", "content_digest"])) errors.push("ANCHOR_SCHEMA_INVALID");
  errors.push(...validateAnchorMaterial(material));
  const contentDigest = digest(material);
  const expectedId = `FDOA:${digest([material.contract_code, material.snapshot_id, material.decision_observation_ts, contentDigest])}`;
  if (anchor.content_digest !== contentDigest || anchor.anchor_id !== expectedId) errors.push("ANCHOR_SEAL_INVALID");
  if (material.contract_code !== decision.contract_code || material.snapshot_id !== decision.snapshot_id || material.decision_observation_ts !== decision.observation_ts) errors.push("ANCHOR_PARENT_DECISION_MISMATCH");
  return { valid: errors.length === 0, errors: uniqReasons(errors), value: errors.length ? null : anchor };
}

function directionProvenance(decision, source) {
  const event = source.opportunity;
  if (event && event.direction_at_event === decision.direction) return "PRECOMMITTED_OPPORTUNITY_EVENT";
  const campaign = source.campaign;
  if (event?.direction_at_event === "DIRECTIONLESS_EVENT" && campaign?.direction_at_detection === "DIRECTIONLESS_EVENT" && campaign?.direction === decision.direction && ["LONG", "SHORT"].includes(decision.direction)) return "PROSPECTIVE_CAMPAIGN_LOCK_AFTER_DIRECTIONLESS";
  return "UNRESOLVED";
}

function frozenHypothesis(decision, decisionAnchorId, provenance, admittedEventId) {
  return {
    decision_anchor_id: decisionAnchorId,
    decision_observation_ts: decision.observation_ts,
    admitted_event_id: admittedEventId,
    direction: decision.direction,
    direction_provenance: provenance,
    directional_quality: decision.directional_quality,
    entry_action: decision.entry_action,
    entry_action_id: decision.entry_action_id,
    entry_quality: decision.entry_quality,
    campaign_phase: decision.campaign_phase,
    timing_state: decision.timing_state,
    risk_state: decision.risk_state,
    hard_veto_state: decision.hard_veto_state,
    entry_execution_quality: decision.entry_execution_quality,
    position_state: decision.position_state,
    management_action: decision.management_action,
    management_action_id: decision.management_action_id,
    management_intent: decision.management_intent,
    management_quality: decision.management_quality,
    management_execution_quality: decision.management_execution_quality,
    causal_effect_claimed: false,
    classification_is_probability: false,
  };
}

function laneHypothesis(cohort, frozen, transitionId = null) {
  if (cohort === "DIRECTIONAL") return { direction: frozen.direction, direction_provenance: frozen.direction_provenance, directional_quality: frozen.directional_quality };
  if (cohort === "ENTRY") return {
    direction: frozen.direction, entry_action: frozen.entry_action, entry_action_id: frozen.entry_action_id,
    entry_quality: frozen.entry_quality, campaign_phase: frozen.campaign_phase, timing_state: frozen.timing_state,
    risk_state: frozen.risk_state, hard_veto_state: frozen.hard_veto_state, entry_execution_quality: frozen.entry_execution_quality,
  };
  return {
    position_state: frozen.position_state, management_action: frozen.management_action, management_action_id: frozen.management_action_id,
    management_intent: frozen.management_intent, management_quality: frozen.management_quality,
    management_execution_quality: frozen.management_execution_quality, risk_state: frozen.risk_state,
    hard_veto_state: frozen.hard_veto_state, management_transition_id: transitionId,
  };
}

function cohortIdentity({ cohort, unitBasis, clusterBasis, dedupBasis, stateKey, frozen, transitionId = null }) {
  const statisticalUnitId = `FDSU:${cohort[0]}:${digest(unitBasis)}`;
  const clusterBasisDigest = digest(clusterBasis);
  return {
    statisticalUnitId,
    clusterBasisDigest,
    dependenceClusterId: `FDDC:${clusterBasisDigest}`,
    cohortDedupKey: `FDCD:${digest([FINAL_DECISION_OUTCOME_RULES_VERSION, cohort, dedupBasis])}`,
    hypothesisId: `FDH:${cohort[0]}:${digest([FINAL_DECISION_OUTCOME_RULES_VERSION, cohort, statisticalUnitId, stateKey, laneHypothesis(cohort, frozen, transitionId)])}`,
  };
}

function cohortRecord({ cohort, applicable, blocked, reasons, requiredReceiptKeys = [], identity = null,
  stateRevision = null, stateKey = null, measurementSet = null, transitionId = null, transitionSource = null, triggerBasis = null }) {
  const samplingState = applicable && !blocked ? "PROPOSED_NOT_RESERVED" : applicable ? "DESIGN_ONLY_BLOCKED" : "NOT_ELIGIBLE";
  const proposed = samplingState === "PROPOSED_NOT_RESERVED";
  return {
    cohort,
    sampling_state: samplingState,
    hypothesis_id: proposed ? identity.hypothesisId : null,
    statistical_unit_id: proposed ? identity.statisticalUnitId : null,
    dependence_cluster_id: proposed ? identity.dependenceClusterId : null,
    dependence_cluster_basis_digest: proposed ? identity.clusterBasisDigest : null,
    cohort_dedup_key: proposed ? identity.cohortDedupKey : null,
    decision_state_revision: proposed ? stateRevision : null,
    decision_state_key: proposed ? stateKey : null,
    measurement_set: proposed ? measurementSet : null,
    required_receipt_keys: applicable ? [...requiredReceiptKeys].sort() : [],
    management_transition_id: proposed && cohort === "MANAGEMENT" ? transitionId : null,
    management_transition_source: proposed && cohort === "MANAGEMENT" ? transitionSource : null,
    management_trigger_basis: proposed && cohort === "MANAGEMENT" ? triggerBasis : null,
    reason_codes: proposed ? [PROPOSED_REASON] : uniqReasons(reasons.length ? reasons : ["COHORT_NOT_APPLICABLE"]),
  };
}

function buildCohorts(decision, source, anchorResult, frozen) {
  const directionalBase = decision.directional_quality === "CLOSED" && ["LONG", "SHORT"].includes(decision.direction) && decision.independence_state === "CLOSED";
  const prospectiveLock = frozen.direction_provenance === "PROSPECTIVE_CAMPAIGN_LOCK_AFTER_DIRECTIONLESS";
  const directionReceipts = prospectiveLock ? ["campaign", "decision_evidence", "opportunity"] : ["decision_evidence", "opportunity"];
  const directionErrors = [
    ...requiredProofErrors(source, directionReceipts),
    ...source.identity_errors.opportunity,
    ...(prospectiveLock ? source.identity_errors.campaign : []),
  ];
  if (!anchorResult.valid) directionErrors.push(...anchorResult.errors);
  if (frozen.direction_provenance === "UNRESOLVED") directionErrors.push("DIRECTION_PROVENANCE_UNRESOLVED");
  const episodeId = source.opportunity?.episode_id || source.campaign?.origin_episode_id;
  const directionalIdentity = episodeId ? cohortIdentity({
    cohort: "DIRECTIONAL", unitBasis: [decision.contract_code, "ORIGIN_EPISODE", episodeId],
    clusterBasis: [decision.contract_code, "ORIGIN_EPISODE", episodeId], dedupBasis: [decision.contract_code, "ORIGIN_EPISODE", episodeId],
    stateKey: decision.direction, frozen,
  }) : null;
  if (directionalBase && !directionalIdentity) directionErrors.push("DIRECTIONAL_STABLE_UNIT_MISSING");

  const flat = ["FLAT", "NONE"].includes(decision.position_state);
  const entryActionEvaluated = ["SHADOW_ENTRY_ELIGIBLE", "WAIT", "REJECT"].includes(decision.entry_action);
  const entryQualityCoherent = (decision.entry_action === "SHADOW_ENTRY_ELIGIBLE" && decision.entry_quality === "CLOSED") ||
    (decision.entry_action === "WAIT" && decision.entry_quality === "INSUFFICIENT") ||
    (decision.entry_action === "REJECT" && decision.entry_quality === "BLOCKED");
  const entryBase = directionalBase && flat && entryActionEvaluated && entryQualityCoherent && decision.data_quality === "CLOSED" &&
    decision.campaign_quality === "CLOSED" && ["CLOSED", "BLOCKED"].includes(decision.entry_execution_quality) &&
    ["ACTIVE", "CLEAR"].includes(decision.hard_veto_state) && !["BLOCKED", "INSUFFICIENT"].includes(decision.risk_state);
  const entryReceipts = ["campaign", "decision_evidence", "full_evidence", "full_evidence_source", "opportunity", "position", "safety_gate"];
  const entryErrors = [
    ...requiredProofErrors(source, entryReceipts), ...source.identity_errors.opportunity,
    ...source.identity_errors.campaign, ...source.identity_errors.position,
  ];
  if (!anchorResult.valid) entryErrors.push(...anchorResult.errors);
  if (source.campaign?.direction !== decision.direction) entryErrors.push("ENTRY_CAMPAIGN_DIRECTION_MISMATCH");
  if (frozen.direction_provenance === "UNRESOLVED") entryErrors.push("ENTRY_DIRECTION_PROVENANCE_UNRESOLVED");
  const entryUnit = source.campaign ? [decision.contract_code, source.campaign.campaign_id, source.campaign.wave_id || "PRE_WAVE"] : null;
  const entryEpisode = source.campaign?.origin_episode_id || episodeId;
  const entryIdentity = entryUnit && entryEpisode ? cohortIdentity({
    cohort: "ENTRY", unitBasis: entryUnit, clusterBasis: [decision.contract_code, "ORIGIN_EPISODE", entryEpisode],
    dedupBasis: entryUnit, stateKey: `${decision.entry_action}:${decision.campaign_phase}`, frozen,
  }) : null;
  if (entryBase && !entryIdentity) entryErrors.push("ENTRY_STABLE_UNIT_MISSING");

  const open = ["OPEN_LONG", "OPEN_SHORT"].includes(decision.position_state);
  const managementStateApplicable = (decision.management_intent === "HOLD_ALLOWED" && decision.management_action === "HOLD") ||
    (decision.management_intent === "EXIT_REQUIRED" && ["EXIT", "NOT_EVALUATED"].includes(decision.management_action));
  const managementBase = open && managementStateApplicable && decision?.source_quality?.position === "CLOSED" && decision?.source_quality?.position_origin_campaign === "CLOSED";
  const exitHardVeto = decision.management_intent === "EXIT_REQUIRED" && decision.hard_veto_state === "ACTIVE";
  const exitOriginTerminal = decision.management_intent === "EXIT_REQUIRED" && source.campaign && source.origin &&
    source.campaign.campaign_id === source.origin.campaign_id && ["EDGE_SPENT", "CLOSED"].includes(source.campaign.phase);
  const exitContext = decision.management_intent === "EXIT_REQUIRED" && source.management?.risk_state === "INVALIDATED";
  const hold = decision.management_intent === "HOLD_ALLOWED";
  const managementReceipts = ["position", "position_origin_campaign", "safety_gate"];
  // A stronger independently closed exit trigger owns the lane.  An unrelated
  // or simultaneously present position-context assessment must not become a
  // hidden dependency of a hard-veto or terminal-campaign exit.
  const contextOwnsExit = !exitHardVeto && !exitOriginTerminal && exitContext;
  if (hold || contextOwnsExit) managementReceipts.push("position_management");
  if (!exitHardVeto && exitOriginTerminal) managementReceipts.push("campaign");
  const managementErrors = [
    ...requiredProofErrors(source, managementReceipts), ...source.identity_errors.position, ...source.identity_errors.origin,
    ...(hold || contextOwnsExit ? source.identity_errors.management : []), ...(!exitHardVeto && exitOriginTerminal ? source.identity_errors.campaign : []),
  ];
  if (!anchorResult.valid) managementErrors.push(...anchorResult.errors);
  if (decision.management_intent === "EXIT_REQUIRED" && !exitHardVeto && !exitOriginTerminal && !exitContext) managementErrors.push("MANAGEMENT_EXIT_TRIGGER_BASIS_UNRESOLVED");
  let transitionId = null;
  let transitionSource = null;
  if (decision.management_action === "EXIT" && safeId(decision.management_action_id, 320)) {
    transitionId = decision.management_action_id;
    transitionSource = "SEALED_PARENT_MANAGEMENT_ACTION_ID";
  } else if (source.management?.transition_valid) {
    transitionId = source.management.transition_id;
    transitionSource = "IMMUTABLE_POSITION_MANAGEMENT_CONTEXT";
  }
  if (managementBase && !transitionId) managementErrors.push("IMMUTABLE_MANAGEMENT_TRANSITION_ID_REQUIRED");
  const managementTriggerBasis = hold ? "HOLD_CONTEXT" : exitHardVeto ? "HARD_VETO" : exitOriginTerminal ? "ORIGIN_CAMPAIGN_TERMINAL" : contextOwnsExit ? "POSITION_CONTEXT_INVALIDATED" : null;
  const managementIdentity = managementBase && transitionId && source.position?.position_id && source.origin ? cohortIdentity({
    cohort: "MANAGEMENT", unitBasis: [decision.contract_code, source.position.position_id],
    clusterBasis: [decision.contract_code, source.origin.campaign_id, source.origin.entry_wave_id],
    dedupBasis: [decision.contract_code, transitionId], stateKey: `${decision.management_intent}:${decision.management_action}`,
    frozen, transitionId,
  }) : null;
  if (managementBase && transitionId && !managementIdentity) managementErrors.push("MANAGEMENT_STABLE_UNIT_MISSING");

  return [
    cohortRecord({ cohort: "DIRECTIONAL", applicable: directionalBase, blocked: directionErrors.length > 0 || !directionalIdentity,
      reasons: directionErrors, requiredReceiptKeys: directionReceipts, identity: directionalIdentity,
      stateRevision: null, stateKey: decision.direction, measurementSet: "RAW_DIRECTIONAL_PATH_RESEARCH_V2" }),
    cohortRecord({ cohort: "ENTRY", applicable: entryBase, blocked: entryErrors.length > 0 || !entryIdentity,
      reasons: entryErrors, requiredReceiptKeys: entryReceipts, identity: entryIdentity,
      stateRevision: source.campaign?.state_revision ?? null, stateKey: `${decision.entry_action}:${decision.campaign_phase}`,
      measurementSet: "RAW_ENTRY_PATH_AND_TIMING_RESEARCH_V2" }),
    cohortRecord({ cohort: "MANAGEMENT", applicable: managementBase, blocked: managementErrors.length > 0 || !managementIdentity,
      reasons: managementErrors, requiredReceiptKeys: [...new Set(managementReceipts)], identity: managementIdentity,
      stateRevision: source.position?.state_revision ?? null, stateKey: `${decision.management_intent}:${decision.management_action}`,
      measurementSet: "RAW_POSITION_PATH_FROM_TRANSITION_RESEARCH_V2", transitionId, transitionSource, triggerBasis: managementTriggerBasis }),
  ];
}

function sealContract(base) {
  const material = { ...base, sampling_contract_id: null, material_digest: null };
  const materialDigest = digest(material);
  return {
    ...base,
    sampling_contract_id: `FDOC:${base.contract_code}:${base.decision_observation_ts}:${digest([base.decision_anchor_id, materialDigest])}`,
    material_digest: materialDigest,
  };
}

function nextClosedMinuteExclusive(observationTs) {
  return Math.floor(observationTs / 60_000) * 60_000 + 60_000;
}

function invalidDecisionEnvelope() {
  return { decision_id: null, material_digest: null, input_lineage_digest: null, rules_version: null, status: "INVALID", contract_code: "INVALID", snapshot_id: "INVALID-SNAPSHOT", observation_ts: 1 };
}

function buildCore({ decision, source_input: sourceInput, prospective_anchor: prospectiveAnchor } = {}) {
  const parent = verifyParentDecision(decision);
  const safeDecision = parent.valid ? decision : invalidDecisionEnvelope();
  const decisionAnchorId = `FDA:${digest([safeDecision.contract_code, safeDecision.snapshot_id, safeDecision.observation_ts, safeDecision.input_lineage_digest, safeDecision.rules_version, safeDecision.material_digest])}`;
  const anchorResult = parent.valid ? validateAnchor(prospectiveAnchor, safeDecision) : { valid: false, errors: ["PARENT_DECISION_INVALID"], value: null };
  const source = parent.valid ? extractSourceContext(sourceInput, safeDecision) : null;
  const provenance = parent.valid ? directionProvenance(safeDecision, source) : "UNRESOLVED";
  const frozen = parent.valid ? frozenHypothesis(safeDecision, decisionAnchorId, provenance, source.opportunity?.event_id ?? null) : null;
  const cohorts = parent.valid ? buildCohorts(safeDecision, source, anchorResult, frozen) : COHORTS.map((cohort) => cohortRecord({ cohort, applicable: true, blocked: true, reasons: parent.errors.length ? parent.errors : ["PARENT_DECISION_INVALID"] }));
  const proposalCount = cohorts.filter((cohort) => cohort.sampling_state === "PROPOSED_NOT_RESERVED").length;
  const detailReasons = uniqReasons([
    ...parent.errors, ...anchorResult.errors,
    ...cohorts.filter((cohort) => cohort.sampling_state === "DESIGN_ONLY_BLOCKED").flatMap((cohort) => cohort.reason_codes),
  ]);
  const reasons = ["PERSISTENCE_NOT_IMPLEMENTED_ATOMIC_RESERVATION_REQUIRED", ...detailReasons.filter((code) => code !== "PERSISTENCE_NOT_IMPLEMENTED_ATOMIC_RESERVATION_REQUIRED")].slice(0, 32);
  const horizons = HORIZON_RULES.map((rule) => ({
    horizon: rule.horizon, offset_ms: rule.offset_ms, target_ts: safeDecision.observation_ts + rule.offset_ms,
    eligible_after_ts: safeDecision.observation_ts + rule.offset_ms, outcome_status: "DESIGN_ONLY_NOT_SCHEDULED",
  }));
  return sealContract({
    version: FINAL_DECISION_OUTCOME_CONTRACT_VERSION,
    rules_version: FINAL_DECISION_OUTCOME_RULES_VERSION,
    mode: FINAL_DECISION_OUTCOME_MODE,
    status: "DESIGN_ONLY_BLOCKED",
    sampling_contract_id: null,
    material_digest: null,
    parent_decision_id: parent.valid ? safeDecision.decision_id : null,
    parent_decision_material_digest: parent.valid ? safeDecision.material_digest : null,
    parent_decision_status: parent.valid ? safeDecision.status : "INVALID",
    parent_input_lineage_digest: parent.valid ? safeDecision.input_lineage_digest : null,
    parent_rules_version: parent.valid ? safeDecision.rules_version : null,
    decision_anchor_id: decisionAnchorId,
    contract_code: safeDecision.contract_code,
    snapshot_id: safeDecision.snapshot_id,
    decision_observation_ts: safeDecision.observation_ts,
    frozen_decision_state: frozen,
    prospective_anchor: anchorResult.valid ? anchorResult.value : null,
    horizons,
    cohorts,
    proposal_count: proposalCount,
    reservation_count: 0,
    enrollment_count: 0,
    designed_target_count: proposalCount * HORIZON_RULES.length,
    scheduled_target_count: 0,
    activation_gate: ACTIVATION_GATE,
    activation_deadline_ts: nextClosedMinuteExclusive(safeDecision.observation_ts),
    calibration_eligible: false,
    calibration_status: "NOT_STATISTICALLY_VALIDATED",
    shadow_only: true,
    live_probability: null,
    validated_signal: false,
    execution_authorized: false,
    telegram_eligible: false,
    anti_look_ahead: { ...ANTI_LOOK_AHEAD },
    dependence_policy: { ...DEPENDENCE_POLICY },
    bounds: { ...FINAL_DECISION_OUTCOME_LIMITS },
    reason_codes: reasons,
  });
}

export function buildFinalDecisionShadowOutcomeContract(args = {}) {
  try {
    return buildCore(args);
  } catch {
    return buildCore({});
  }
}

function validateCohort(cohort, index, errors) {
  if (!exactKeys(cohort, COHORT_KEYS) || cohort.cohort !== COHORTS[index] || !["PROPOSED_NOT_RESERVED", "DESIGN_ONLY_BLOCKED", "NOT_ELIGIBLE"].includes(cohort.sampling_state)) {
    errors.push("OUTCOME_COHORT_SCHEMA_INVALID");
    return;
  }
  if (!Array.isArray(cohort.reason_codes) || cohort.reason_codes.length < 1 || cohort.reason_codes.length > 32 || cohort.reason_codes.some((code) => typeof code !== "string" || !/^[A-Z][A-Z0-9_.:-]{0,95}$/.test(code))) errors.push("OUTCOME_COHORT_REASONS_INVALID");
  if (!Array.isArray(cohort.required_receipt_keys) || new Set(cohort.required_receipt_keys).size !== cohort.required_receipt_keys.length || cohort.required_receipt_keys.some((key) => !LINEAGE_RECEIPT_KEYS.includes(key)) || stableJson(cohort.required_receipt_keys) !== stableJson([...cohort.required_receipt_keys].sort())) errors.push("OUTCOME_COHORT_RECEIPT_POLICY_INVALID");
  if (cohort.sampling_state !== "PROPOSED_NOT_RESERVED") {
    if ([cohort.hypothesis_id, cohort.statistical_unit_id, cohort.dependence_cluster_id, cohort.dependence_cluster_basis_digest,
      cohort.cohort_dedup_key, cohort.decision_state_revision, cohort.decision_state_key, cohort.measurement_set,
      cohort.management_transition_id, cohort.management_transition_source, cohort.management_trigger_basis].some((value) => value !== null)) errors.push("OUTCOME_INACTIVE_COHORT_HAS_FACTS");
    return;
  }
  const prefix = cohort.cohort[0];
  if (!new RegExp(`^FDH:${prefix}:[0-9a-f]{16}$`).test(cohort.hypothesis_id) || !new RegExp(`^FDSU:${prefix}:[0-9a-f]{16}$`).test(cohort.statistical_unit_id) ||
      !/^FDDC:[0-9a-f]{16}$/.test(cohort.dependence_cluster_id) || !safeDigest(cohort.dependence_cluster_basis_digest) ||
      !/^FDCD:[0-9a-f]{16}$/.test(cohort.cohort_dedup_key) || cohort.dependence_cluster_id !== `FDDC:${cohort.dependence_cluster_basis_digest}`) errors.push("OUTCOME_COHORT_IDENTITY_INVALID");
  if (!safeId(cohort.decision_state_key, 128) || (cohort.cohort === "DIRECTIONAL" ? cohort.decision_state_revision !== null : positiveInteger(cohort.decision_state_revision) === null)) errors.push("OUTCOME_COHORT_STATE_INVALID");
  const measurement = { DIRECTIONAL: "RAW_DIRECTIONAL_PATH_RESEARCH_V2", ENTRY: "RAW_ENTRY_PATH_AND_TIMING_RESEARCH_V2", MANAGEMENT: "RAW_POSITION_PATH_FROM_TRANSITION_RESEARCH_V2" }[cohort.cohort];
  if (cohort.measurement_set !== measurement || stableJson(cohort.reason_codes) !== stableJson([PROPOSED_REASON])) errors.push("OUTCOME_COHORT_DESIGN_STATE_INVALID");
  if (cohort.cohort === "MANAGEMENT") {
    if (!safeId(cohort.management_transition_id, 320) || !["SEALED_PARENT_MANAGEMENT_ACTION_ID", "IMMUTABLE_POSITION_MANAGEMENT_CONTEXT"].includes(cohort.management_transition_source) ||
        !["HOLD_CONTEXT", "HARD_VETO", "ORIGIN_CAMPAIGN_TERMINAL", "POSITION_CONTEXT_INVALIDATED"].includes(cohort.management_trigger_basis)) errors.push("OUTCOME_MANAGEMENT_TRANSITION_INVALID");
  } else if ([cohort.management_transition_id, cohort.management_transition_source, cohort.management_trigger_basis].some((value) => value !== null)) errors.push("OUTCOME_NON_MANAGEMENT_TRANSITION_PRESENT");
  if (cohort.cohort === "DIRECTIONAL" && cohort.required_receipt_keys.includes("full_evidence")) errors.push("OUTCOME_DIRECTIONAL_RECEIPT_SCOPE_CONFLATED");
  if (cohort.cohort === "ENTRY" && !["campaign", "decision_evidence", "full_evidence", "full_evidence_source", "opportunity", "position", "safety_gate"].every((key) => cohort.required_receipt_keys.includes(key))) errors.push("OUTCOME_ENTRY_RECEIPT_SCOPE_INCOMPLETE");
  if (cohort.cohort === "MANAGEMENT" && !["position", "position_origin_campaign", "safety_gate"].every((key) => cohort.required_receipt_keys.includes(key))) errors.push("OUTCOME_MANAGEMENT_RECEIPT_SCOPE_INCOMPLETE");
  if (cohort.cohort === "MANAGEMENT" && ["HARD_VETO", "ORIGIN_CAMPAIGN_TERMINAL"].includes(cohort.management_trigger_basis) && cohort.required_receipt_keys.includes("position_management")) errors.push("OUTCOME_EXIT_RECEIPT_SCOPE_CONFLATED");
}

function validateFinalDecisionShadowOutcomeContractCore(contract) {
  const errors = [];
  if (!exactKeys(contract, CONTRACT_KEYS)) return { valid: false, errors: ["OUTCOME_CONTRACT_SCHEMA_INVALID"] };
  if (contract.version !== FINAL_DECISION_OUTCOME_CONTRACT_VERSION || contract.rules_version !== FINAL_DECISION_OUTCOME_RULES_VERSION || contract.mode !== FINAL_DECISION_OUTCOME_MODE) errors.push("OUTCOME_CONTRACT_VERSION_INVALID");
  if (contract.status !== "DESIGN_ONLY_BLOCKED") errors.push("OUTCOME_CONTRACT_STATUS_INVALID");
  if (!normalizedContract(contract.contract_code) || !safeId(contract.snapshot_id, 256) || timestamp(contract.decision_observation_ts) === null || !safeId(contract.decision_anchor_id, 256)) errors.push("OUTCOME_CONTRACT_IDENTITY_INVALID");
  const parentAbsent = contract.parent_decision_status === "INVALID" && contract.parent_decision_id === null && contract.parent_decision_material_digest === null && contract.parent_input_lineage_digest === null && contract.parent_rules_version === null;
  const parentPresent = ["SHADOW_EVALUATED", "FAIL_CLOSED"].includes(contract.parent_decision_status) && safeId(contract.parent_decision_id, 320) && safeDigest(contract.parent_decision_material_digest) && safeDigest(contract.parent_input_lineage_digest) && safeId(contract.parent_rules_version, 128);
  if (!parentAbsent && !parentPresent) errors.push("OUTCOME_PARENT_DECISION_LINK_INVALID");
  if (parentPresent && contract.parent_decision_id !== `FDI:${contract.contract_code}:${contract.decision_observation_ts}:${contract.parent_decision_material_digest}`) errors.push("OUTCOME_PARENT_DECISION_ID_MISMATCH");
  if (parentPresent) {
    const expectedAnchorId = `FDA:${digest([contract.contract_code, contract.snapshot_id, contract.decision_observation_ts, contract.parent_input_lineage_digest, contract.parent_rules_version, contract.parent_decision_material_digest])}`;
    if (contract.decision_anchor_id !== expectedAnchorId) errors.push("OUTCOME_DECISION_ANCHOR_ID_MISMATCH");
    if (!exactKeys(contract.frozen_decision_state, FROZEN_HYPOTHESIS_KEYS) || contract.frozen_decision_state.decision_anchor_id !== contract.decision_anchor_id || contract.frozen_decision_state.decision_observation_ts !== contract.decision_observation_ts ||
        contract.frozen_decision_state.causal_effect_claimed !== false || contract.frozen_decision_state.classification_is_probability !== false ||
        (contract.frozen_decision_state.admitted_event_id !== null && !safeId(contract.frozen_decision_state.admitted_event_id, 512)) ||
        !["PRECOMMITTED_OPPORTUNITY_EVENT", "PROSPECTIVE_CAMPAIGN_LOCK_AFTER_DIRECTIONLESS", "UNRESOLVED"].includes(contract.frozen_decision_state.direction_provenance)) errors.push("OUTCOME_FROZEN_DECISION_STATE_INVALID");
  } else if (contract.frozen_decision_state !== null) errors.push("OUTCOME_INVALID_PARENT_HAS_FROZEN_STATE");
  if (contract.calibration_eligible !== false || contract.calibration_status !== "NOT_STATISTICALLY_VALIDATED" || contract.shadow_only !== true || contract.live_probability !== null || contract.validated_signal !== false || contract.execution_authorized !== false || contract.telegram_eligible !== false) errors.push("OUTCOME_CONTRACT_SAFETY_INVALID");
  if (stableJson(contract.anti_look_ahead) !== stableJson(ANTI_LOOK_AHEAD) || stableJson(contract.dependence_policy) !== stableJson(DEPENDENCE_POLICY) || stableJson(contract.bounds) !== stableJson(FINAL_DECISION_OUTCOME_LIMITS)) errors.push("OUTCOME_CONTRACT_POLICY_INVALID");
  if (contract.activation_gate !== ACTIVATION_GATE || contract.activation_deadline_ts !== nextClosedMinuteExclusive(contract.decision_observation_ts) || contract.activation_deadline_ts <= contract.decision_observation_ts || contract.activation_deadline_ts - contract.decision_observation_ts > 60_000) errors.push("OUTCOME_ACTIVATION_GATE_INVALID");
  if (!Array.isArray(contract.horizons) || contract.horizons.length !== HORIZON_RULES.length) errors.push("OUTCOME_HORIZONS_INVALID");
  else contract.horizons.forEach((target, index) => {
    const rule = HORIZON_RULES[index];
    if (!exactKeys(target, ["horizon", "offset_ms", "target_ts", "eligible_after_ts", "outcome_status"]) || target.horizon !== rule.horizon || target.offset_ms !== rule.offset_ms ||
        target.target_ts !== contract.decision_observation_ts + rule.offset_ms || target.eligible_after_ts !== target.target_ts || target.target_ts <= contract.decision_observation_ts || target.outcome_status !== "DESIGN_ONLY_NOT_SCHEDULED") errors.push("OUTCOME_HORIZON_CONTRACT_INVALID");
  });
  if (!Array.isArray(contract.cohorts) || contract.cohorts.length !== COHORTS.length) errors.push("OUTCOME_COHORTS_INVALID");
  else contract.cohorts.forEach((cohort, index) => validateCohort(cohort, index, errors));
  const proposals = Array.isArray(contract.cohorts) ? contract.cohorts.filter((cohort) => cohort.sampling_state === "PROPOSED_NOT_RESERVED").length : -1;
  if (contract.proposal_count !== proposals || contract.reservation_count !== 0 || contract.enrollment_count !== 0 || contract.scheduled_target_count !== 0 || contract.designed_target_count !== proposals * HORIZON_RULES.length ||
      proposals > FINAL_DECISION_OUTCOME_LIMITS.max_cohorts_per_decision || contract.designed_target_count > FINAL_DECISION_OUTCOME_LIMITS.max_designed_targets_per_decision) errors.push("OUTCOME_BOUNDS_MISMATCH");
  if (contract.prospective_anchor !== null) {
    const validation = validateAnchor(contract.prospective_anchor, { contract_code: contract.contract_code, snapshot_id: contract.snapshot_id, observation_ts: contract.decision_observation_ts });
    if (!validation.valid) errors.push(...validation.errors);
  }
  if (!Array.isArray(contract.reason_codes) || !contract.reason_codes.includes("PERSISTENCE_NOT_IMPLEMENTED_ATOMIC_RESERVATION_REQUIRED") || contract.reason_codes.length > 32 || contract.reason_codes.some((code) => typeof code !== "string" || !/^[A-Z][A-Z0-9_.:-]{0,95}$/.test(code))) errors.push("OUTCOME_REASON_CODES_INVALID");
  try {
    const expectedDigest = digest({ ...contract, sampling_contract_id: null, material_digest: null });
    const expectedId = `FDOC:${contract.contract_code}:${contract.decision_observation_ts}:${digest([contract.decision_anchor_id, expectedDigest])}`;
    if (contract.material_digest !== expectedDigest || contract.sampling_contract_id !== expectedId) errors.push("OUTCOME_CONTRACT_SEAL_INVALID");
  } catch {
    errors.push("OUTCOME_CONTRACT_SEAL_UNREADABLE");
  }
  return { valid: errors.length === 0, errors: uniqReasons(errors) };
}

export function validateFinalDecisionShadowOutcomeContract(contract) {
  try {
    return validateFinalDecisionShadowOutcomeContractCore(contract);
  } catch {
    return { valid: false, errors: ["OUTCOME_CONTRACT_UNREADABLE"] };
  }
}

export const FINAL_DECISION_OUTCOME_HORIZONS = HORIZON_RULES;
