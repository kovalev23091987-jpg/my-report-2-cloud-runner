import {
  FINAL_DECISION_INTEGRATION_VERSION,
  FINAL_DECISION_RULES_VERSION,
  buildFinalDecisionIntegrationShadow,
  validateFinalDecisionOutput,
} from "./final-decision-integration-engine.mjs";

export const FINAL_DECISION_INTEGRATION_RUNTIME_VERSION = "final-decision-integration-runtime-v1";
export const FINAL_DECISION_INTEGRATION_SCHEMA_VERSION = "final-decision-integration-shadow-v1";
export const FINAL_DECISION_INTEGRATION_MODE = "SHADOW_ONLY_NO_EXECUTION";

export const MAX_FINAL_DECISION_D1_STATEMENTS_PER_EVALUATION = 1;
export const MAX_FINAL_DECISION_JSON_BYTES = 24 * 1024;
export const TARGET_FINAL_DECISION_PAYLOAD_BYTES = 12 * 1024;
export const FINAL_DECISION_TTL_MS = 180 * 24 * 60 * 60 * 1000;
export const FINAL_DECISION_CLOCK_SKEW_MS = 5 * 60 * 1000;
export const MAX_FINAL_DECISION_ACK_ROWS_READ = 16_384;
export const MAX_FINAL_DECISION_ACK_ROWS_WRITTEN = 160;
export const MAX_FINAL_DECISION_ACK_LOGICAL_CHANGES = 36;

const DIRECTIONS = new Set(["LONG", "SHORT", "NEUTRAL", "INSUFFICIENT"]);
const QUALITY_STATES = new Set([
  "CLOSED", "PARTIAL", "CONFLICTING", "BLOCKED", "INSUFFICIENT", "NOT_EVALUATED",
]);
const CAMPAIGN_QUALITY_STATES = new Set(["CLOSED", "BLOCKED", "INSUFFICIENT"]);
const ENTRY_ACTIONS = new Set(["SHADOW_ENTRY_ELIGIBLE", "WAIT", "REJECT", "NOT_EVALUATED"]);
const CAMPAIGN_PHASES = new Set([
  "DISCOVERY", "PRE_IMPULSE_WATCH", "ENTRY_CANDIDATE", "ENTRY_TRIGGER", "IMPULSE",
  "RELOAD_BASE", "NEXT_IMPULSE_WATCH", "NEXT_IMPULSE_ENTRY", "EXHAUSTION_WARNING",
  "EDGE_SPENT", "CLOSED", "UNKNOWN",
]);
const INDEPENDENCE_STATES = new Set([
  "CLOSED", "PARTIAL", "CORRELATED", "CONFLICTING", "BLOCKED", "INSUFFICIENT", "NOT_EVALUATED",
]);
const TIMING_STATES = new Set([
  "EARLY", "ENTRY_WINDOW", "ACTIVE_MOVE", "RELOAD", "LATE", "EDGE_SPENT",
  "BLOCKED", "INSUFFICIENT", "NOT_EVALUATED",
]);
const RISK_STATES = new Set(["CLEAR", "CAUTION", "INVALIDATED", "BLOCKED", "INSUFFICIENT"]);
const POSITION_STATES = new Set(["NONE", "FLAT", "OPEN_LONG", "OPEN_SHORT", "UNKNOWN", "NOT_EVALUATED"]);
const MANAGEMENT_ACTIONS = new Set(["HOLD", "EXIT", "NOT_EVALUATED"]);
const MANAGEMENT_INTENTS = new Set(["HOLD_ALLOWED", "EXIT_REQUIRED", "NOT_EVALUATED"]);

const REQUIRED_FIELDS = Object.freeze([
  "decision_id", "material_digest", "input_lineage_digest", "snapshot_id", "engine_version", "rules_version", "decision_status",
  "contract_code", "observation_ts", "direction", "directional_quality",
  "entry_action", "entry_action_id", "entry_quality", "data_quality", "execution_quality",
  "entry_execution_quality", "management_execution_quality", "campaign_phase", "campaign_quality",
  "independence_state", "timing_state", "risk_state", "position_state", "management_action",
  "management_intent", "management_action_id", "management_quality",
  "hard_veto", "hard_veto_state", "calibration_eligible", "shadow_outcome_collection_eligible",
  "shadow_only", "live_probability", "validated_signal", "execution_authorized", "telegram_eligible",
  "decision_evidence_receipt_id", "full_evidence_receipt_id", "full_evidence_source_receipt_id",
  "opportunity_receipt_id", "campaign_receipt_id", "safety_gate_receipt_id", "position_receipt_id",
  "position_origin_campaign_receipt_id", "position_management_receipt_id",
  "reason_codes", "payload",
]);
const REQUIRED_FIELD_SET = new Set(REQUIRED_FIELDS);

const MUST_BE_FALSE_KEYS = new Set([
  "automaticweighttuning", "executionauthorized", "livesignal", "strategyweightschanged",
  "telegrameligible", "telegramstarted", "tradingexecution", "validatedsignal",
  "validated", "classificationisprobability", "fixedstrategyweightsappliedbythislayer",
  "statisticalvalidationclaimed", "statisticalindependencevalidated",
  "missingdatacoercedtozero", "correlatedfeaturescountedasindependent",
  "calibrationeligible",
]);
const MUST_BE_NULL_KEYS = new Set(["liveprobability"]);
const EVIDENCE_TIMESTAMP_KEYS = new Set([
  "asofts", "availablets", "campaignstart", "candleclosets", "detectionts",
  "directionavailablets", "directionlockedts", "entrytriggertime", "entrytriggerts",
  "eventclosets", "eventts", "firstdetectedtime", "firstdetectedts", "impulsepeakts",
  "impulsestart", "lasteventts", "lastobservedts", "observationts", "observedts",
  "sourcets", "timestamp", "committedts", "assignedts", "persistedts",
]);

function canonicalKey(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function byteLength(value) {
  return new TextEncoder().encode(value).byteLength;
}

function boundedErrorText(error, maxLength, fallback = "UNINSPECTABLE_ERROR") {
  try {
    if (typeof error === "string") return error.slice(0, maxLength);
    if (error === null || ["undefined", "boolean", "number", "bigint", "symbol"].includes(typeof error)) {
      return String(error).slice(0, maxLength);
    }
    if (typeof error === "object" || typeof error === "function") {
      const descriptor = Object.getOwnPropertyDescriptor(error, "message");
      if (descriptor && !descriptor.get && !descriptor.set && typeof descriptor.value === "string") {
        return descriptor.value.slice(0, maxLength);
      }
    }
  } catch {
    // Hostile thrown values must not make the validator/persistence error path throw.
  }
  return fallback.slice(0, maxLength);
}

function stableJson(value, { observationTs = null } = {}) {
  const ancestors = new Set();
  const state = { nodes: 0, codeUnits: 0, keyUnits: 0 };

  function account(units) {
    state.codeUnits += units;
    if (state.codeUnits > 64 * 1024) throw new Error("JSON_PREFLIGHT_SIZE_LIMIT_EXCEEDED");
  }

  function encode(node, depth, parentKey = null) {
    state.nodes += 1;
    if (state.nodes > 4096) throw new Error("JSON_NODE_LIMIT_EXCEEDED");
    if (depth > 24) throw new Error("JSON_DEPTH_LIMIT_EXCEEDED");
    if (node === null) { account(4); return "null"; }
    if (typeof node === "boolean") { account(5); return node ? "true" : "false"; }
    if (typeof node === "number") {
      if (!Number.isFinite(node)) throw new Error("JSON_NON_FINITE_NUMBER");
      if (EVIDENCE_TIMESTAMP_KEYS.has(canonicalKey(parentKey))) {
        if (!Number.isSafeInteger(node) || node <= 0) throw new Error("EVIDENCE_TIMESTAMP_INVALID");
        if (Number.isSafeInteger(observationTs) && node > observationTs) throw new Error("FUTURE_EVIDENCE_TIMESTAMP");
      }
      const encodedNumber = JSON.stringify(node);
      account(encodedNumber.length);
      return encodedNumber;
    }
    if (typeof node === "string") {
      if (node.length > MAX_FINAL_DECISION_JSON_BYTES) throw new Error("JSON_STRING_LIMIT_EXCEEDED");
      const encodedString = JSON.stringify(node);
      account(encodedString.length);
      return encodedString;
    }
    if (typeof node !== "object") throw new Error("JSON_UNSUPPORTED_VALUE");
    if (ancestors.has(node)) throw new Error("JSON_CYCLE_DETECTED");
    ancestors.add(node);

    let encoded;
    if (Array.isArray(node)) {
      if (Object.getPrototypeOf(node) !== Array.prototype) throw new Error("JSON_ARRAY_PROTOTYPE_INVALID");
      const allOwnKeys = Reflect.ownKeys(node);
      const descriptors = Object.getOwnPropertyDescriptors(node);
      const lengthDescriptor = descriptors.length;
      if (!lengthDescriptor || lengthDescriptor.get || lengthDescriptor.set ||
          lengthDescriptor.enumerable !== false || !Number.isSafeInteger(lengthDescriptor.value) ||
          lengthDescriptor.value < 0) throw new Error("JSON_ARRAY_LENGTH_DESCRIPTOR_INVALID");
      const arrayLength = lengthDescriptor.value;
      if (arrayLength > 256) throw new Error("JSON_ARRAY_LIMIT_EXCEEDED");
      const ownKeys = allOwnKeys.filter((key) => key !== "length");
      if (ownKeys.some((key) => typeof key === "symbol" || !/^(0|[1-9][0-9]*)$/.test(key)) ||
          ownKeys.length !== arrayLength) throw new Error("JSON_ARRAY_SHAPE_INVALID");
      const items = [];
      for (let index = 0; index < arrayLength; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || descriptor.enumerable !== true) throw new Error("JSON_ARRAY_ENUMERABILITY_INVALID");
        if (descriptor.get || descriptor.set) throw new Error("JSON_ARRAY_ACCESSOR_UNSUPPORTED");
        items.push(encode(descriptor.value, depth + 1));
      }
      encoded = `[${items.join(",")}]`;
    } else {
      if (!isPlainObject(node)) throw new Error("JSON_NON_PLAIN_OBJECT");
      const ownKeys = Reflect.ownKeys(node);
      if (ownKeys.some((key) => typeof key === "symbol")) throw new Error("JSON_SYMBOL_KEY_UNSUPPORTED");
      const descriptors = Object.getOwnPropertyDescriptors(node);
      if (ownKeys.some((key) => descriptors[key]?.enumerable !== true)) {
        throw new Error("JSON_NON_ENUMERABLE_PROPERTY_UNSUPPORTED");
      }
      const keys = ownKeys.sort();
      if (keys.length > 128) throw new Error("JSON_OBJECT_KEY_LIMIT_EXCEEDED");
      if (keys.some((key) => key.length > 256)) throw new Error("JSON_KEY_LENGTH_EXCEEDED");
      if (keys.some((key) => !/^[A-Za-z0-9_]+$/.test(key))) throw new Error("JSON_KEY_INVALID");
      state.keyUnits += keys.reduce((total, key) => total + key.length, 0);
      if (state.keyUnits > 65_536) throw new Error("JSON_KEY_BUDGET_EXCEEDED");
      const fields = [];
      for (const key of keys) {
        const descriptor = descriptors[key];
        if (!descriptor || descriptor.get || descriptor.set) throw new Error("JSON_ACCESSOR_UNSUPPORTED");
        const child = descriptor.value;
        const canonical = canonicalKey(key);
        if (MUST_BE_NULL_KEYS.has(canonical) && child !== null) throw new Error("LIVE_PROBABILITY_FORBIDDEN");
        if (canonical === "shadowoutcomecollectioneligible" && child !== false) {
          throw new Error(depth === 0
            ? "OUTCOME_COLLECTION_ELIGIBILITY_FORBIDDEN"
            : `UNSAFE_FLAG_FORBIDDEN:${key}`);
        }
        if (MUST_BE_FALSE_KEYS.has(canonical) && child !== false) throw new Error(`UNSAFE_FLAG_FORBIDDEN:${key}`);
        if (canonical === "shadowonly" && child !== true) throw new Error("SHADOW_ONLY_REQUIRED");
        if (EVIDENCE_TIMESTAMP_KEYS.has(canonical) && child !== null && typeof child !== "number") {
          throw new Error("EVIDENCE_TIMESTAMP_INVALID");
        }
        const encodedKey = JSON.stringify(key);
        account(encodedKey.length + 1);
        fields.push(`${encodedKey}:${encode(child, depth + 1, key)}`);
      }
      encoded = `{${fields.join(",")}}`;
    }
    ancestors.delete(node);
    return encoded;
  }

  return encode(value, 0);
}

function enumError(errors, value, allowed, code) {
  if (typeof value !== "string" || !allowed.has(value)) errors.push(code);
}

function safeId(value, max = 320) {
  return typeof value === "string" && value.length <= max && /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/.test(value);
}

export function validateFinalDecisionIntegrationRecord(decision, options = {}) {
  const errors = [];
  let now;
  try {
    if (!isPlainObject(options)) return { ok: false, errors: ["VALIDATION_OPTIONS_INVALID"] };
    const optionKeys = Reflect.ownKeys(options);
    const optionDescriptors = Object.getOwnPropertyDescriptors(options);
    if (optionKeys.some((key) => typeof key !== "string" || key !== "now" ||
        optionDescriptors[key]?.enumerable !== true || optionDescriptors[key]?.get ||
        optionDescriptors[key]?.set)) {
      return { ok: false, errors: ["VALIDATION_OPTIONS_INVALID"] };
    }
    now = Object.prototype.hasOwnProperty.call(optionDescriptors, "now")
      ? optionDescriptors.now.value
      : Date.now();
  } catch (error) {
    return { ok: false, errors: [boundedErrorText(error, 160)] };
  }
  if (!Number.isSafeInteger(now) || now <= 0) {
    return { ok: false, errors: ["PERSISTED_TIMESTAMP_INVALID"] };
  }
  try {
    // Snapshot exclusively through descriptors before any ordinary property
    // access. This rejects accessors/non-enumerable/symbol properties and keeps
    // Proxy get traps out of all later validation reads.
    if (!isPlainObject(decision)) return { ok: false, errors: ["DECISION_NOT_PLAIN_OBJECT"] };
    decision = JSON.parse(stableJson(decision));
  } catch (error) {
    return { ok: false, errors: [boundedErrorText(error, 160)] };
  }

  for (const field of REQUIRED_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(decision, field)) errors.push(`MISSING_FIELD:${field}`);
  }
  for (const field of Object.keys(decision)) {
    if (!REQUIRED_FIELD_SET.has(field)) errors.push(`UNKNOWN_FIELD:${field}`);
  }
  if (errors.length) return { ok: false, errors };

  if (typeof decision.decision_id !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,319}$/.test(decision.decision_id)) {
    errors.push("DECISION_ID_INVALID");
  }
  if (!/^[0-9a-f]{16}$/.test(decision.material_digest) || decision.decision_id !== `FDI:${decision.contract_code}:${decision.observation_ts}:${decision.material_digest}`) errors.push("DECISION_MATERIAL_ID_MISMATCH");
  if (!/^[0-9a-f]{16}$/.test(decision.input_lineage_digest)) errors.push("INPUT_LINEAGE_DIGEST_INVALID");
  if (!safeId(decision.snapshot_id, 256)) errors.push("SNAPSHOT_ID_INVALID");
  if (decision.engine_version !== FINAL_DECISION_INTEGRATION_VERSION) errors.push("ENGINE_VERSION_INVALID");
  if (decision.rules_version !== FINAL_DECISION_RULES_VERSION) errors.push("RULES_VERSION_INVALID");
  if (!["SHADOW_EVALUATED", "FAIL_CLOSED"].includes(decision.decision_status)) errors.push("DECISION_STATUS_INVALID");
  if (typeof decision.contract_code !== "string" ||
      !/^[A-Z0-9][A-Z0-9._:-]{0,79}$/.test(decision.contract_code) ||
      decision.contract_code !== decision.contract_code.normalize("NFC")) {
    errors.push("CONTRACT_CODE_INVALID");
  }
  if (!Number.isSafeInteger(decision.observation_ts) || decision.observation_ts <= 0) {
    errors.push("OBSERVATION_TIMESTAMP_INVALID");
  } else {
    if (decision.observation_ts > now) errors.push("FUTURE_OBSERVATION_FORBIDDEN");
    if (decision.observation_ts < now - FINAL_DECISION_CLOCK_SKEW_MS) errors.push("LIVE_OBSERVATION_COMMIT_LAG_EXCEEDED");
  }

  enumError(errors, decision.direction, DIRECTIONS, "DIRECTION_INVALID");
  enumError(errors, decision.directional_quality, QUALITY_STATES, "DIRECTIONAL_QUALITY_INVALID");
  enumError(errors, decision.entry_action, ENTRY_ACTIONS, "ENTRY_ACTION_INVALID");
  enumError(errors, decision.entry_quality, QUALITY_STATES, "ENTRY_QUALITY_INVALID");
  enumError(errors, decision.data_quality, QUALITY_STATES, "DATA_QUALITY_INVALID");
  enumError(errors, decision.execution_quality, QUALITY_STATES, "EXECUTION_QUALITY_INVALID");
  enumError(errors, decision.entry_execution_quality, QUALITY_STATES, "ENTRY_EXECUTION_QUALITY_INVALID");
  enumError(errors, decision.management_execution_quality, QUALITY_STATES, "MANAGEMENT_EXECUTION_QUALITY_INVALID");
  enumError(errors, decision.campaign_phase, CAMPAIGN_PHASES, "CAMPAIGN_PHASE_INVALID");
  enumError(errors, decision.campaign_quality, CAMPAIGN_QUALITY_STATES, "CAMPAIGN_QUALITY_STATE_INVALID");
  enumError(errors, decision.independence_state, INDEPENDENCE_STATES, "INDEPENDENCE_STATE_INVALID");
  enumError(errors, decision.timing_state, TIMING_STATES, "TIMING_STATE_INVALID");
  enumError(errors, decision.risk_state, RISK_STATES, "RISK_STATE_INVALID");
  enumError(errors, decision.position_state, POSITION_STATES, "POSITION_STATE_INVALID");
  enumError(errors, decision.management_action, MANAGEMENT_ACTIONS, "MANAGEMENT_ACTION_INVALID");
  enumError(errors, decision.management_intent, MANAGEMENT_INTENTS, "MANAGEMENT_INTENT_INVALID");
  enumError(errors, decision.management_quality, QUALITY_STATES, "MANAGEMENT_QUALITY_INVALID");

  const closedCampaignTiming = {
    DISCOVERY: ["EARLY", "LATE"],
    PRE_IMPULSE_WATCH: ["EARLY", "LATE"],
    ENTRY_CANDIDATE: ["EARLY", "LATE"],
    ENTRY_TRIGGER: ["ENTRY_WINDOW", "LATE"],
    NEXT_IMPULSE_ENTRY: ["ENTRY_WINDOW", "LATE"],
    IMPULSE: ["ACTIVE_MOVE", "LATE"],
    RELOAD_BASE: ["RELOAD", "LATE"],
    NEXT_IMPULSE_WATCH: ["RELOAD", "LATE"],
    EXHAUSTION_WARNING: ["LATE"],
    EDGE_SPENT: ["EDGE_SPENT"],
    CLOSED: ["EDGE_SPENT"],
  };
  const allowedCampaignTiming = decision.campaign_quality === "BLOCKED"
    ? ["BLOCKED"]
    : decision.campaign_quality === "INSUFFICIENT"
      ? ["INSUFFICIENT"]
      : closedCampaignTiming[decision.campaign_phase] || [];
  if (!allowedCampaignTiming.includes(decision.timing_state)) {
    errors.push("CAMPAIGN_PHASE_TIMING_MISMATCH");
  }

  if (typeof decision.hard_veto !== "boolean") errors.push("HARD_VETO_NOT_BOOLEAN");
  if (!["ACTIVE", "CLEAR", "BLOCKED", "INSUFFICIENT"].includes(decision.hard_veto_state)) errors.push("HARD_VETO_STATE_INVALID");
  if ((decision.hard_veto_state === "ACTIVE") !== (decision.hard_veto === true)) errors.push("HARD_VETO_STATE_MISMATCH");
  if (decision.calibration_eligible !== false) errors.push("CALIBRATION_ELIGIBILITY_FORBIDDEN");
  if (decision.shadow_outcome_collection_eligible !== false) errors.push("OUTCOME_COLLECTION_ELIGIBILITY_FORBIDDEN");
  if (decision.shadow_only !== true) errors.push("SHADOW_ONLY_REQUIRED");
  if (decision.live_probability !== null) errors.push("LIVE_PROBABILITY_FORBIDDEN");
  if (decision.validated_signal !== false) errors.push("VALIDATED_SIGNAL_FORBIDDEN");
  if (decision.execution_authorized !== false) errors.push("EXECUTION_AUTHORIZATION_FORBIDDEN");
  if (decision.telegram_eligible !== false) errors.push("TELEGRAM_ELIGIBILITY_FORBIDDEN");

  for (const field of [
    "decision_evidence_receipt_id", "full_evidence_receipt_id", "full_evidence_source_receipt_id",
    "opportunity_receipt_id", "campaign_receipt_id", "safety_gate_receipt_id", "position_receipt_id",
    "position_origin_campaign_receipt_id", "position_management_receipt_id",
  ]) {
    if (decision[field] !== null && !safeId(decision[field], 256)) errors.push(`LINEAGE_RECEIPT_ID_INVALID:${field}`);
  }
  if (!Array.isArray(decision.reason_codes) || decision.reason_codes.length < 1 || decision.reason_codes.length > 32) {
    errors.push("REASON_CODES_INVALID");
  } else {
    const seen = new Set();
    for (const code of decision.reason_codes) {
      if (typeof code !== "string" || !/^[A-Z][A-Z0-9_.:-]{0,95}$/.test(code)) {
        errors.push("REASON_CODE_INVALID");
        break;
      }
      if (seen.has(code)) {
        errors.push("REASON_CODE_DUPLICATE");
        break;
      }
      seen.add(code);
    }
  }
  if (!isPlainObject(decision.payload)) errors.push("PAYLOAD_NOT_PLAIN_OBJECT");
  else {
    if (Object.keys(decision.payload).length !== 1 || !Object.prototype.hasOwnProperty.call(decision.payload, "engine_output")) errors.push("PAYLOAD_ENGINE_OUTPUT_ENVELOPE_INVALID");
    const engineOutput = decision.payload.engine_output;
    const engineValidation = validateFinalDecisionOutput(engineOutput);
    if (!engineValidation.valid) errors.push(...engineValidation.errors.map((code) => `ENGINE_OUTPUT:${code}`));
    const scalarMap = {
      decision_id: "decision_id", material_digest: "material_digest", snapshot_id: "snapshot_id",
      input_lineage_digest: "input_lineage_digest", decision_status: "status",
      contract_code: "contract_code", observation_ts: "observation_ts", direction: "direction",
      directional_quality: "directional_quality", entry_action: "entry_action",
      entry_action_id: "entry_action_id", entry_quality: "entry_quality", data_quality: "data_quality",
      execution_quality: "execution_quality", entry_execution_quality: "entry_execution_quality",
      management_execution_quality: "management_execution_quality", campaign_phase: "campaign_phase",
      campaign_quality: "campaign_quality", independence_state: "independence_state",
      timing_state: "timing_state", risk_state: "risk_state", position_state: "position_state",
      management_action: "management_action", management_intent: "management_intent",
      management_action_id: "management_action_id", management_quality: "management_quality",
      hard_veto: "hard_veto", hard_veto_state: "hard_veto_state",
      calibration_eligible: "calibration_eligible", shadow_outcome_collection_eligible: "shadow_outcome_collection_eligible", shadow_only: "shadow_only",
      live_probability: "live_probability", validated_signal: "validated_signal",
      execution_authorized: "execution_authorized", telegram_eligible: "telegram_eligible",
    };
    for (const [recordKey, outputKey] of Object.entries(scalarMap)) {
      if (decision[recordKey] !== engineOutput?.[outputKey]) errors.push(`ENGINE_OUTPUT_SCALAR_MISMATCH:${recordKey}`);
    }
    if (decision.engine_version !== engineOutput?.version || decision.rules_version !== engineOutput?.rules_version) errors.push("ENGINE_OUTPUT_VERSION_MISMATCH");
    const receiptMap = {
      decision_evidence_receipt_id: "decision_evidence",
      full_evidence_receipt_id: "full_evidence",
      full_evidence_source_receipt_id: "full_evidence_source",
      opportunity_receipt_id: "opportunity",
      campaign_receipt_id: "campaign",
      safety_gate_receipt_id: "safety_gate",
      position_receipt_id: "position",
      position_origin_campaign_receipt_id: "position_origin_campaign",
      position_management_receipt_id: "position_management",
    };
    for (const [recordKey, receiptKey] of Object.entries(receiptMap)) {
      if (decision[recordKey] !== (engineOutput?.lineage_receipts?.[receiptKey]?.receipt_id ?? null)) errors.push(`ENGINE_OUTPUT_RECEIPT_MISMATCH:${recordKey}`);
    }
    try {
      if (stableJson(decision.reason_codes) !== stableJson(engineOutput?.reason_codes)) errors.push("ENGINE_OUTPUT_REASON_CODES_MISMATCH");
    } catch {
      errors.push("ENGINE_OUTPUT_REASON_CODES_INVALID");
    }
  }

  const sourceQuality = decision.payload?.engine_output?.source_quality;
  const closedSourceReceipts = {
    full_evidence: [decision.full_evidence_receipt_id, decision.full_evidence_source_receipt_id],
    opportunity: [decision.opportunity_receipt_id],
    campaign: [decision.campaign_receipt_id],
    position: [decision.position_receipt_id],
    position_origin_campaign: [decision.position_origin_campaign_receipt_id],
    position_management: [decision.position_management_receipt_id],
    entry_execution: [decision.safety_gate_receipt_id],
    management_execution: [decision.safety_gate_receipt_id],
    hard_veto: [decision.safety_gate_receipt_id],
  };
  for (const [source, receipts] of Object.entries(closedSourceReceipts)) {
    if (sourceQuality?.[source] === "CLOSED" && receipts.some((receiptId) => receiptId === null)) {
      errors.push(`CLOSED_SOURCE_WITHOUT_LINEAGE_RECEIPT:${source}`);
    }
  }
  const independence = decision.payload?.engine_output?.evidence_independence;
  const causalEvidenceClaimed = isPlainObject(independence?.causal_domains) &&
    Object.values(independence.causal_domains).some(
      (domain) => Array.isArray(domain?.evidence_ids) && domain.evidence_ids.length > 0,
    );
  const crossPlaneReuseClaimed = Number.isSafeInteger(independence?.cross_plane_reuse?.total_reuse_count) &&
    independence.cross_plane_reuse.total_reuse_count > 0;
  const decisionEvidenceClaimed =
    (Number.isSafeInteger(independence?.raw_usable_evidence_count) &&
      independence.raw_usable_evidence_count > 0) ||
    causalEvidenceClaimed || crossPlaneReuseClaimed ||
    ["CLOSED", "CONFLICTING"].includes(decision.directional_quality) ||
    ["CLOSED", "CORRELATED", "CONFLICTING"].includes(decision.independence_state);
  if (decisionEvidenceClaimed && decision.decision_evidence_receipt_id === null) {
    errors.push("DIRECTION_EVIDENCE_WITHOUT_LINEAGE_RECEIPT");
  }
  if (crossPlaneReuseClaimed &&
      [decision.full_evidence_receipt_id, decision.full_evidence_source_receipt_id]
        .some((receiptId) => receiptId === null)) {
    errors.push("CROSS_PLANE_REUSE_WITHOUT_FULL_EVIDENCE_LINEAGE");
  }

  const lineageReceiptIds = [
    decision.decision_evidence_receipt_id,
    decision.full_evidence_receipt_id,
    decision.full_evidence_source_receipt_id,
    decision.opportunity_receipt_id,
    decision.campaign_receipt_id,
    decision.safety_gate_receipt_id,
    decision.position_receipt_id,
    decision.position_origin_campaign_receipt_id,
    decision.position_management_receipt_id,
  ].filter((receiptId) => receiptId !== null);
  const lineageReceiptCollision = new Set(lineageReceiptIds).size !== lineageReceiptIds.length;
  const lineageCollisionSafelyQuarantined = decision.decision_status === "FAIL_CLOSED" &&
    Array.isArray(decision.reason_codes) &&
    decision.reason_codes.includes("INPUT_LINEAGE_RECEIPT_ID_COLLISION") &&
    decision.entry_action !== "SHADOW_ENTRY_ELIGIBLE" &&
    !["HOLD", "EXIT"].includes(decision.management_action);
  if (lineageReceiptCollision && !lineageCollisionSafelyQuarantined) {
    errors.push("LINEAGE_RECEIPT_ID_COLLISION");
  }

  if (["FLAT", "NONE"].includes(decision.position_state) &&
      ["LONG", "SHORT"].includes(decision.direction)) {
    const invalidationKey = decision.direction === "LONG"
      ? "invalidates_long_ids"
      : "invalidates_short_ids";
    const matchingInvalidation = isPlainObject(independence?.causal_domains) &&
      Object.values(independence.causal_domains).some(
        (domain) => Array.isArray(domain?.[invalidationKey]) &&
          domain[invalidationKey].length > 0,
      );
    if (matchingInvalidation && decision.risk_state !== "INVALIDATED") {
      errors.push("THESIS_INVALIDATION_RISK_MISMATCH");
    }
  }

  const entryEligible = decision.entry_action === "SHADOW_ENTRY_ELIGIBLE";
  if (entryEligible && !["LONG", "SHORT"].includes(decision.direction)) errors.push("ENTRY_REQUIRES_DIRECTION");
  if (entryEligible && decision.directional_quality !== "CLOSED") errors.push("ENTRY_REQUIRES_DIRECTIONAL_QUALITY");
  if (entryEligible && decision.entry_quality !== "CLOSED") errors.push("ENTRY_REQUIRES_ENTRY_QUALITY");
  if (entryEligible && decision.data_quality !== "CLOSED") errors.push("ENTRY_REQUIRES_DATA_QUALITY");
  if (entryEligible && decision.execution_quality !== "CLOSED") errors.push("ENTRY_REQUIRES_EXECUTION_QUALITY");
  if (entryEligible && decision.entry_execution_quality !== "CLOSED") errors.push("ENTRY_REQUIRES_ENTRY_EXECUTION_QUALITY");
  if (entryEligible && decision.campaign_quality !== "CLOSED") errors.push("ENTRY_REQUIRES_CAMPAIGN_QUALITY");
  if (entryEligible && decision.independence_state !== "CLOSED") errors.push("ENTRY_REQUIRES_INDEPENDENT_EVIDENCE");
  if (entryEligible && decision.timing_state !== "ENTRY_WINDOW") errors.push("ENTRY_REQUIRES_ENTRY_WINDOW");
  if (entryEligible && !["ENTRY_TRIGGER", "NEXT_IMPULSE_ENTRY"].includes(decision.campaign_phase)) errors.push("ENTRY_REQUIRES_ENTRY_PHASE");
  if (entryEligible && decision.risk_state !== "CLEAR") errors.push("ENTRY_REQUIRES_CLEAR_RISK");
  if (entryEligible && decision.hard_veto === true) errors.push("ENTRY_FORBIDDEN_BY_HARD_VETO");
  if (entryEligible && !["FLAT", "NONE"].includes(decision.position_state)) errors.push("ENTRY_REQUIRES_KNOWN_FLAT_POSITION");
  if (entryEligible && decision.payload?.engine_output?.source_quality?.position !== "CLOSED") errors.push("ENTRY_REQUIRES_CLOSED_POSITION_SOURCE");
  if (entryEligible && decision.payload?.engine_output?.action_identity?.entry?.direction !== decision.direction) errors.push("ENTRY_ACTION_DIRECTION_MISMATCH");
  if (entryEligible && !safeId(decision.entry_action_id)) errors.push("ENTRY_ACTION_ID_REQUIRED");
  if (!entryEligible && decision.entry_action_id !== null) errors.push("NON_ENTRY_ACTION_ID_FORBIDDEN");
  if (["NEUTRAL", "INSUFFICIENT"].includes(decision.direction) && entryEligible) errors.push("DIRECTIONLESS_ENTRY_FORBIDDEN");
  const entryQualityByAction = { SHADOW_ENTRY_ELIGIBLE: "CLOSED", WAIT: "INSUFFICIENT", REJECT: "BLOCKED", NOT_EVALUATED: "NOT_EVALUATED" };
  if (entryQualityByAction[decision.entry_action] !== decision.entry_quality) errors.push("ENTRY_ACTION_QUALITY_MISMATCH");
  const positionOpen = ["OPEN_LONG", "OPEN_SHORT"].includes(decision.position_state);
  const managementActive = ["HOLD", "EXIT"].includes(decision.management_action);
  if (managementActive && !positionOpen) errors.push("MANAGEMENT_REQUIRES_OPEN_POSITION");
  if (positionOpen && (decision.entry_action !== "NOT_EVALUATED" || decision.entry_quality !== "NOT_EVALUATED")) errors.push("OPEN_POSITION_ENTRY_MUST_NOT_BE_EVALUATED");
  if (positionOpen && decision.entry_execution_quality !== "NOT_EVALUATED") errors.push("OPEN_POSITION_ENTRY_EXECUTION_MUST_NOT_BE_EVALUATED");
  if (!positionOpen && decision.management_execution_quality !== "NOT_EVALUATED") errors.push("FLAT_MANAGEMENT_EXECUTION_MUST_BE_NOT_EVALUATED");
  if (!positionOpen && (decision.management_action !== "NOT_EVALUATED" || decision.management_intent !== "NOT_EVALUATED" || decision.management_quality !== "NOT_EVALUATED")) errors.push("FLAT_MANAGEMENT_MUST_BE_NOT_EVALUATED");
  if (managementActive && decision.management_quality !== "CLOSED") errors.push("MANAGEMENT_REQUIRES_CLOSED_QUALITY");
  if (positionOpen && decision.management_action === "NOT_EVALUATED" &&
      !["BLOCKED", "INSUFFICIENT"].includes(decision.management_quality)) {
    errors.push("OPEN_POSITION_MANAGEMENT_QUALITY_INVALID");
  }
  if ((decision.management_action === "HOLD") !== (decision.management_intent === "HOLD_ALLOWED") ||
      (decision.management_action === "EXIT" && decision.management_intent !== "EXIT_REQUIRED") ||
      (decision.management_intent === "EXIT_REQUIRED" && !["EXIT", "NOT_EVALUATED"].includes(decision.management_action))) errors.push("MANAGEMENT_INTENT_MISMATCH");
  if (decision.management_intent === "EXIT_REQUIRED" && (
    decision.risk_state !== "INVALIDATED" ||
    decision.payload?.engine_output?.source_quality?.position !== "CLOSED" ||
    decision.payload?.engine_output?.source_quality?.position_origin_campaign !== "CLOSED"
  )) errors.push("EXIT_INTENT_WITH_OPEN_SOURCE_GATE");
  if (decision.management_action === "HOLD" && (
    decision.risk_state !== "CLEAR" || decision.hard_veto || decision.hard_veto_state !== "CLEAR" ||
    decision.management_execution_quality !== "CLOSED" || decision.decision_status !== "SHADOW_EVALUATED"
  )) errors.push("HOLD_WITH_OPEN_GATE");
  if (decision.management_action === "EXIT" && (
    decision.risk_state !== "INVALIDATED" || decision.management_execution_quality !== "CLOSED" ||
    !safeId(decision.management_action_id) ||
    decision.payload?.engine_output?.source_quality?.position !== "CLOSED" ||
    decision.payload?.engine_output?.source_quality?.position_origin_campaign !== "CLOSED" ||
    decision.payload?.engine_output?.action_identity?.management?.position_direction !==
      (decision.position_state === "OPEN_LONG" ? "LONG" : decision.position_state === "OPEN_SHORT" ? "SHORT" : null)
  )) errors.push("EXIT_CONTRACT_INVALID");
  if (decision.decision_status !== "FAIL_CLOSED" && decision.management_intent === "EXIT_REQUIRED" &&
      decision.management_action === "NOT_EVALUATED" && decision.management_execution_quality === "CLOSED") {
    errors.push("CLOSED_EXIT_FEASIBILITY_REQUIRES_EXIT_ACTION");
  }
  if (decision.decision_status !== "FAIL_CLOSED" && positionOpen && decision.risk_state === "INVALIDATED" &&
      decision.payload?.engine_output?.source_quality?.position === "CLOSED" &&
      decision.payload?.engine_output?.source_quality?.position_origin_campaign === "CLOSED" &&
      decision.management_intent !== "EXIT_REQUIRED") errors.push("INVALIDATED_OPEN_POSITION_REQUIRES_EXIT_INTENT");
  if (decision.management_action !== "EXIT" && decision.management_action_id !== null) errors.push("NON_EXIT_ACTION_ID_FORBIDDEN");
  if (decision.execution_quality !== (positionOpen ? decision.management_execution_quality : decision.entry_execution_quality)) errors.push("EXECUTION_LANE_MISMATCH");
  if (decision.hard_veto && decision.risk_state !== "INVALIDATED") errors.push("ACTIVE_VETO_REQUIRES_INVALIDATED_RISK");
  if (decision.decision_status === "FAIL_CLOSED" && entryEligible) errors.push("FAILED_DECISION_CANNOT_PROMOTE_ENTRY");
  if (decision.decision_status === "FAIL_CLOSED" && managementActive) errors.push("FAILED_OUTPUT_CANNOT_EXECUTE_MANAGEMENT");

  let decisionJson = null;
  let reasonCodesJson = null;
  let decisionBytes = null;
  let recordBytes = null;
  let payloadBytes = null;
  if (!errors.length) {
    try {
      payloadBytes = byteLength(stableJson(decision.payload, { observationTs: decision.observation_ts }));
      reasonCodesJson = stableJson(decision.reason_codes, { observationTs: decision.observation_ts });
      decisionJson = stableJson(decision.payload.engine_output, { observationTs: decision.observation_ts });
      decisionBytes = byteLength(decisionJson);
      recordBytes = byteLength(stableJson(decision, { observationTs: decision.observation_ts }));
      if (decisionBytes > MAX_FINAL_DECISION_JSON_BYTES) errors.push("DECISION_JSON_TOO_LARGE");
    } catch (error) {
      errors.push(boundedErrorText(error, 160));
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    decision_json: errors.length === 0 ? decisionJson : null,
    reason_codes_json: errors.length === 0 ? reasonCodesJson : null,
    decision_bytes: decisionBytes,
    record_bytes: recordBytes,
    payload_bytes: payloadBytes,
    payload_target_exceeded: Number.isFinite(payloadBytes) && payloadBytes > TARGET_FINAL_DECISION_PAYLOAD_BYTES,
  };
}

export function toFinalDecisionIntegrationRecord(output) {
  if (!isPlainObject(output)) return output;
  const validation = validateFinalDecisionOutput(output);
  if (!validation.valid) throw new Error(`INVALID_ENGINE_OUTPUT:${validation.errors.join(",")}`);
  return {
    decision_id: output.decision_id,
    material_digest: output.material_digest,
    input_lineage_digest: output.input_lineage_digest,
    snapshot_id: output.snapshot_id,
    engine_version: output.version,
    rules_version: output.rules_version,
    decision_status: output.status,
    contract_code: output.contract_code,
    observation_ts: output.observation_ts,
    direction: output.direction,
    directional_quality: output.directional_quality,
    entry_action: output.entry_action,
    entry_action_id: output.entry_action_id,
    entry_quality: output.entry_quality,
    data_quality: output.data_quality,
    execution_quality: output.execution_quality,
    entry_execution_quality: output.entry_execution_quality,
    management_execution_quality: output.management_execution_quality,
    campaign_phase: output.campaign_phase,
    campaign_quality: output.campaign_quality,
    independence_state: output.independence_state,
    timing_state: output.timing_state,
    risk_state: output.risk_state,
    position_state: output.position_state,
    management_action: output.management_action,
    management_intent: output.management_intent,
    management_action_id: output.management_action_id,
    management_quality: output.management_quality,
    hard_veto: output.hard_veto,
    hard_veto_state: output.hard_veto_state,
    calibration_eligible: output.calibration_eligible,
    shadow_outcome_collection_eligible: output.shadow_outcome_collection_eligible,
    shadow_only: true,
    live_probability: null,
    validated_signal: false,
    execution_authorized: false,
    telegram_eligible: false,
    decision_evidence_receipt_id: output.lineage_receipts.decision_evidence.receipt_id,
    full_evidence_receipt_id: output.lineage_receipts.full_evidence.receipt_id,
    full_evidence_source_receipt_id: output.lineage_receipts.full_evidence_source.receipt_id,
    opportunity_receipt_id: output.lineage_receipts.opportunity.receipt_id,
    campaign_receipt_id: output.lineage_receipts.campaign.receipt_id,
    safety_gate_receipt_id: output.lineage_receipts.safety_gate.receipt_id,
    position_receipt_id: output.lineage_receipts.position.receipt_id,
    position_origin_campaign_receipt_id: output.lineage_receipts.position_origin_campaign.receipt_id,
    position_management_receipt_id: output.lineage_receipts.position_management.receipt_id,
    reason_codes: output.reason_codes,
    payload: {
      engine_output: output,
    },
  };
}

function safetyEnvelope() {
  return {
    shadow_only: true,
    live_probability: null,
    validated_signal: false,
    execution_authorized: false,
    telegram_eligible: false,
    strategy_weights_changed: false,
    automatic_weight_tuning: false,
    network_calls: 0,
    retry_attempts: 0,
  };
}

function snapshotAckObject(value, errorCode) {
  if (!isPlainObject(value)) throw new Error(errorCode);
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key === "symbol")) throw new Error(errorCode);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const snapshot = Object.create(null);
  for (const key of ownKeys) {
    const descriptor = descriptors[key];
    if (!descriptor || descriptor.enumerable !== true || descriptor.get || descriptor.set ||
        !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
      throw new Error(errorCode);
    }
    Object.defineProperty(snapshot, key, {
      value: descriptor.value,
      enumerable: true,
      configurable: false,
      writable: false,
    });
  }
  return snapshot;
}

function validateD1WriteAck(result) {
  const resultSnapshot = snapshotAckObject(result, "D1_ACK_RESULT_DESCRIPTOR_INVALID");
  if (Object.prototype.hasOwnProperty.call(resultSnapshot, "error")) {
    throw new Error("D1_COMMIT_ACK_ERROR_PRESENT");
  }
  if (resultSnapshot.success !== true) {
    throw new Error("D1_COMMIT_ACK_INVALID");
  }
  const meta = snapshotAckObject(resultSnapshot.meta, "D1_ACK_META_DESCRIPTOR_INVALID");
  for (const field of ["changes", "rows_read", "rows_written"]) {
    if (!Number.isSafeInteger(meta[field]) || meta[field] < 0) throw new Error(`D1_ACK_${field.toUpperCase()}_INVALID`);
  }
  if (meta.changes > MAX_FINAL_DECISION_ACK_LOGICAL_CHANGES) throw new Error("D1_ACK_CHANGES_OUT_OF_RANGE");
  if (typeof meta.changed_db !== "boolean" || meta.changed_db !== (meta.rows_written > 0)) throw new Error("D1_ACK_CHANGED_DB_INCONSISTENT");
  if (meta.changes === 0 && meta.rows_written !== 0) throw new Error("D1_ACK_DEDUP_WRITE_INCONSISTENT");
  if (meta.changes > 0 && meta.rows_written < meta.changes) throw new Error("D1_ACK_INSERT_WRITE_INCONSISTENT");
  if (Object.prototype.hasOwnProperty.call(meta, "served_by_primary") && meta.served_by_primary !== true) throw new Error("D1_ACK_NOT_PRIMARY");
  if (Object.prototype.hasOwnProperty.call(meta, "total_attempts") && (!Number.isSafeInteger(meta.total_attempts) || meta.total_attempts !== 1)) throw new Error("D1_ACK_RETRY_DETECTED");
  if (meta.rows_read > MAX_FINAL_DECISION_ACK_ROWS_READ) throw new Error("D1_ACK_ROWS_READ_LIMIT_EXCEEDED");
  if (meta.rows_written > MAX_FINAL_DECISION_ACK_ROWS_WRITTEN) throw new Error("D1_ACK_ROWS_WRITTEN_LIMIT_EXCEEDED");
  if (!(Array.isArray(resultSnapshot.results) || resultSnapshot.results === null)) throw new Error("D1_ACK_RESULTS_INVALID");
  return {
    changes: meta.changes,
    rows_read: meta.rows_read,
    rows_written: meta.rows_written,
    total_attempts: Number.isSafeInteger(meta.total_attempts) ? meta.total_attempts : null,
    served_by_primary: Object.prototype.hasOwnProperty.call(meta, "served_by_primary")
      ? meta.served_by_primary
      : null,
  };
}

export async function persistFinalDecisionIntegrationShadow({ env, input, require_exact_insert_ack = false, expected_position_cas = null } = {}) {
  const safety = safetyEnvelope();
  const now = Date.now();
  let output = null;
  let record = null;
  let engineOutputErrors = [];
  try {
    output = buildFinalDecisionIntegrationShadow(input);
    const engineValidation = validateFinalDecisionOutput(output);
    engineOutputErrors = engineValidation.errors;
    if (engineValidation.valid) record = toFinalDecisionIntegrationRecord(output);
  } catch (error) {
    engineOutputErrors = [`ENGINE_BUILD_FAILED:${boundedErrorText(error, 200)}`];
  }
  const validation = validateFinalDecisionIntegrationRecord(record, { now });
  const base = {
    runtime_version: FINAL_DECISION_INTEGRATION_RUNTIME_VERSION,
    schema_version: FINAL_DECISION_INTEGRATION_SCHEMA_VERSION,
    mode: FINAL_DECISION_INTEGRATION_MODE,
    safety,
    statement_cap: MAX_FINAL_DECISION_D1_STATEMENTS_PER_EVALUATION,
    commit_state: "NOT_ATTEMPTED",
  };
  if (engineOutputErrors.length || !validation.ok) {
    return { ...base, status: "VALIDATION_FAIL_CLOSED", statements: 0, attempted_statements: 0, prepared_statements: 0, bound_statements: 0, acknowledged_statements: 0, errors: [...engineOutputErrors, ...validation.errors] };
  }
  if (!env?.DATA_DB || typeof env.DATA_DB.prepare !== "function") {
    return {
      ...base,
      status: "SOURCE_UNSUPPORTED",
      statements: 0,
      attempted_statements: 0,
      prepared_statements: 0,
      bound_statements: 0,
      acknowledged_statements: 0,
      decision_id: record.decision_id,
    };
  }

  let preparedStatements = 0;
  let boundStatements = 0;
  let attemptedStatements = 0;
  try {
    const positionCas = expected_position_cas && typeof expected_position_cas === "object"
      ? {
          contract_code: String(expected_position_cas.contract_code || "").trim(),
          state: String(expected_position_cas.state || "").trim().toUpperCase(),
          state_revision: Number(expected_position_cas.state_revision),
        }
      : null;
    const positionCasValid = Boolean(
      positionCas &&
      positionCas.contract_code === record.contract_code &&
      ["FLAT", "OPEN_LONG", "OPEN_SHORT"].includes(positionCas.state) &&
      Number.isSafeInteger(positionCas.state_revision) && positionCas.state_revision >= 1
    );
    if (expected_position_cas && !positionCasValid) throw new Error("POSITION_CAS_INPUT_INVALID");

    // Stage 3.9.2 may bind a position CAS directly into this SAME INSERT.
    // This is still exactly one D1 statement; there is no preflight read. If a
    // concurrent invocation changes the virtual position after the upstream
    // JOIN-read, the INSERT affects zero rows and the caller fails closed.
    const prepared = env.DATA_DB.prepare(positionCasValid ? `
      INSERT INTO final_decision_integration_shadow (
        decision_id,schema_version,mode,material_digest,input_lineage_digest,snapshot_id,
        engine_version,rules_version,decision_status,contract_code,observation_ts,direction,
        directional_quality,entry_action,entry_action_id,entry_quality,data_quality,execution_quality,
        entry_execution_quality,management_execution_quality,campaign_phase,campaign_quality,
        independence_state,timing_state,risk_state,position_state,management_action,management_intent,
        management_action_id,management_quality,hard_veto,hard_veto_state,calibration_eligible,
        shadow_outcome_collection_eligible,shadow_only,live_probability,validated_signal,
        execution_authorized,telegram_eligible,decision_evidence_receipt_id,full_evidence_receipt_id,
        full_evidence_source_receipt_id,opportunity_receipt_id,campaign_receipt_id,safety_gate_receipt_id,
        position_receipt_id,position_origin_campaign_receipt_id,position_management_receipt_id,
        reason_codes_json,decision_json,persisted_ts
      ) SELECT
        ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,
        ?18,?19,?20,?21,?22,?23,?24,?25,?26,?27,?28,?29,?30,?31,?32,?33,
        ?34,?35,?36,?37,?38,?39,?40,?41,?42,?43,?44,?45,?46,?47,?48,?49,
        ?50,?51
      WHERE EXISTS (
        SELECT 1 FROM shadow_virtual_position_ledger
        WHERE contract_code=?52 AND state=?53 AND state_revision=?54
      )
      ON CONFLICT(decision_id) DO NOTHING
    ` : `
      INSERT INTO final_decision_integration_shadow (
        decision_id,schema_version,mode,material_digest,input_lineage_digest,snapshot_id,
        engine_version,rules_version,decision_status,contract_code,observation_ts,direction,
        directional_quality,entry_action,entry_action_id,entry_quality,data_quality,execution_quality,
        entry_execution_quality,management_execution_quality,campaign_phase,campaign_quality,
        independence_state,timing_state,risk_state,position_state,management_action,management_intent,
        management_action_id,management_quality,hard_veto,hard_veto_state,calibration_eligible,
        shadow_outcome_collection_eligible,shadow_only,live_probability,validated_signal,
        execution_authorized,telegram_eligible,decision_evidence_receipt_id,full_evidence_receipt_id,
        full_evidence_source_receipt_id,opportunity_receipt_id,campaign_receipt_id,safety_gate_receipt_id,
        position_receipt_id,position_origin_campaign_receipt_id,position_management_receipt_id,
        reason_codes_json,decision_json,persisted_ts
      ) VALUES (
        ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,
        ?18,?19,?20,?21,?22,?23,?24,?25,?26,?27,?28,?29,?30,?31,?32,?33,
        ?34,?35,?36,?37,?38,?39,?40,?41,?42,?43,?44,?45,?46,?47,?48,?49,
        ?50,?51
      ) ON CONFLICT(decision_id) DO NOTHING
    `);
    preparedStatements = 1;
    if (!prepared || typeof prepared.bind !== "function") throw new Error("D1_PREPARE_RESULT_INVALID");
    const statement = prepared.bind(
      record.decision_id,
      FINAL_DECISION_INTEGRATION_SCHEMA_VERSION,
      FINAL_DECISION_INTEGRATION_MODE,
      record.material_digest,
      record.input_lineage_digest,
      record.snapshot_id,
      record.engine_version,
      record.rules_version,
      record.decision_status,
      record.contract_code,
      record.observation_ts,
      record.direction,
      record.directional_quality,
      record.entry_action,
      record.entry_action_id,
      record.entry_quality,
      record.data_quality,
      record.execution_quality,
      record.entry_execution_quality,
      record.management_execution_quality,
      record.campaign_phase,
      record.campaign_quality,
      record.independence_state,
      record.timing_state,
      record.risk_state,
      record.position_state,
      record.management_action,
      record.management_intent,
      record.management_action_id,
      record.management_quality,
      record.hard_veto ? 1 : 0,
      record.hard_veto_state,
      record.calibration_eligible ? 1 : 0,
      record.shadow_outcome_collection_eligible ? 1 : 0,
      record.shadow_only ? 1 : 0,
      record.live_probability,
      record.validated_signal ? 1 : 0,
      record.execution_authorized ? 1 : 0,
      record.telegram_eligible ? 1 : 0,
      record.decision_evidence_receipt_id,
      record.full_evidence_receipt_id,
      record.full_evidence_source_receipt_id,
      record.opportunity_receipt_id,
      record.campaign_receipt_id,
      record.safety_gate_receipt_id,
      record.position_receipt_id,
      record.position_origin_campaign_receipt_id,
      record.position_management_receipt_id,
      validation.reason_codes_json,
      validation.decision_json,
      now,
      ...(positionCasValid ? [positionCas.contract_code, positionCas.state, positionCas.state_revision] : []),
    );
    boundStatements = 1;
    if (!statement || typeof statement.run !== "function") throw new Error("D1_BIND_RESULT_INVALID");
    attemptedStatements = 1;
    const result = await statement.run();
    const ack = validateD1WriteAck(result);
    const exactInsertMissing = require_exact_insert_ack === true && ack.changes !== 1;
    return {
      ...base,
      status: exactInsertMissing
        ? "NO_COMMIT_FAIL_CLOSED"
        : ack.changes > 0 ? "CLOSED" : "DEDUPLICATED",
      commit_state: exactInsertMissing ? "NOT_COMMITTED" : "COMMITTED",
      statements: 1,
      attempted_statements: 1,
      prepared_statements: 1,
      bound_statements: 1,
      acknowledged_statements: 1,
      decision_inserted: ack.changes > 0,
      logical_changes_reported: ack.changes,
      rows_read_reported: ack.rows_read,
      rows_written_reported: ack.rows_written,
      total_attempts_reported: ack.total_attempts,
      internal_attempt_count_reported: ack.total_attempts !== null,
      served_by_primary_reported: ack.served_by_primary,
      primary_routing_reported: ack.served_by_primary !== null,
      trigger_write_count_unknown: false,
      idempotent_duplicate: ack.changes === 0 && require_exact_insert_ack !== true,
      exact_insert_ack_required: require_exact_insert_ack === true,
      position_cas_bound: positionCasValid,
      position_cas_state: positionCasValid ? positionCas.state : null,
      position_cas_revision: positionCasValid ? positionCas.state_revision : null,
      decision_id: record.decision_id,
      decision_bytes: validation.decision_bytes,
      record_bytes: validation.record_bytes,
      payload_bytes: validation.payload_bytes,
      payload_target_exceeded: validation.payload_target_exceeded,
      decision_summary: {
        decision_id: record.decision_id,
        material_digest: record.material_digest,
        snapshot_id: record.snapshot_id,
        contract_code: record.contract_code,
        observation_ts: record.observation_ts,
        direction: record.direction,
        entry_action: record.entry_action,
        entry_action_id: record.entry_action_id,
        entry_quality: record.entry_quality,
        data_quality: record.data_quality,
        execution_quality: record.execution_quality,
        independence_state: record.independence_state,
        timing_state: record.timing_state,
        risk_state: record.risk_state,
        hard_veto: record.hard_veto,
        hard_veto_state: record.hard_veto_state,
        decision_evidence_receipt_id: record.decision_evidence_receipt_id,
        full_evidence_receipt_id: record.full_evidence_receipt_id,
        campaign_receipt_id: record.campaign_receipt_id,
        safety_gate_receipt_id: record.safety_gate_receipt_id,
      },
    };
  } catch (error) {
    const message = boundedErrorText(error, 400);
    const actionCollision = attemptedStatements === 1 && (
      message.includes("final decision action collision") ||
      message.includes("final decision action target collision")
    );
    const commitState = actionCollision
      ? "REJECTED"
      : attemptedStatements === 1
        ? "UNKNOWN"
        : "NOT_ATTEMPTED";
    return {
      ...base,
      status: /no such (table|column)|schema|has no column/i.test(message)
        ? "MIGRATION_REQUIRED"
        : actionCollision
          ? "ACTION_COLLISION_FAIL_CLOSED"
          : "PARTIAL_FAIL_CLOSED",
      commit_state: commitState,
      statements: attemptedStatements,
      attempted_statements: attemptedStatements,
      prepared_statements: preparedStatements,
      bound_statements: boundStatements,
      acknowledged_statements: 0,
      decision_id: record.decision_id,
      error: message,
    };
  }
}

export const FINAL_DECISION_INTEGRATION_ENUMS = Object.freeze({
  directions: Object.freeze([...DIRECTIONS]),
  quality_states: Object.freeze([...QUALITY_STATES]),
  entry_actions: Object.freeze([...ENTRY_ACTIONS]),
  campaign_phases: Object.freeze([...CAMPAIGN_PHASES]),
  independence_states: Object.freeze([...INDEPENDENCE_STATES]),
  timing_states: Object.freeze([...TIMING_STATES]),
  risk_states: Object.freeze([...RISK_STATES]),
  position_states: Object.freeze([...POSITION_STATES]),
  management_actions: Object.freeze([...MANAGEMENT_ACTIONS]),
});
