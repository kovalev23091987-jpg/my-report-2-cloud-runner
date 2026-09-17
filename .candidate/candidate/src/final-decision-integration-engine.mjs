export const FINAL_DECISION_INTEGRATION_VERSION = "3.9.2-final-decision-integration-shadow";
export const FINAL_DECISION_RULES_VERSION = "decision-orchestrator-gates-v2";
export const FINAL_DECISION_MODE = "FINAL_DECISION_INTEGRATION_SHADOW_NO_EXECUTION";

export const DECISION_DIRECTION = Object.freeze({
  LONG: "LONG",
  SHORT: "SHORT",
  NEUTRAL: "NEUTRAL",
  INSUFFICIENT: "INSUFFICIENT",
});

export const DECISION_QUALITY = Object.freeze({
  CLOSED: "CLOSED",
  PARTIAL: "PARTIAL",
  CONFLICTING: "CONFLICTING",
  BLOCKED: "BLOCKED",
  INSUFFICIENT: "INSUFFICIENT",
  NOT_EVALUATED: "NOT_EVALUATED",
});

export const ENTRY_ACTION = Object.freeze({
  SHADOW_ENTRY_ELIGIBLE: "SHADOW_ENTRY_ELIGIBLE",
  WAIT: "WAIT",
  REJECT: "REJECT",
  NOT_EVALUATED: "NOT_EVALUATED",
});

export const MANAGEMENT_ACTION = Object.freeze({
  HOLD: "HOLD",
  EXIT: "EXIT",
  NOT_EVALUATED: "NOT_EVALUATED",
});

export const TIMING_STATE = Object.freeze({
  EARLY: "EARLY",
  ENTRY_WINDOW: "ENTRY_WINDOW",
  ACTIVE_MOVE: "ACTIVE_MOVE",
  RELOAD: "RELOAD",
  LATE: "LATE",
  EDGE_SPENT: "EDGE_SPENT",
  BLOCKED: "BLOCKED",
  INSUFFICIENT: "INSUFFICIENT",
  NOT_EVALUATED: "NOT_EVALUATED",
});

export const CAMPAIGN_PHASES = Object.freeze([
  "DISCOVERY",
  "PRE_IMPULSE_WATCH",
  "ENTRY_CANDIDATE",
  "ENTRY_TRIGGER",
  "IMPULSE",
  "RELOAD_BASE",
  "NEXT_IMPULSE_WATCH",
  "NEXT_IMPULSE_ENTRY",
  "EXHAUSTION_WARNING",
  "EDGE_SPENT",
  "CLOSED",
]);

export const CAUSAL_FAMILY = Object.freeze({
  PRICE_RESPONSE: "PRICE_RESPONSE",
  AGGRESSOR_RESPONSE: "AGGRESSOR_RESPONSE",
  LIQUIDITY_RESPONSE: "LIQUIDITY_RESPONSE",
  EFFORT_RESULT: "EFFORT_RESULT",
  FUNDING: "FUNDING",
  BASIS: "BASIS",
  OPEN_INTEREST: "OPEN_INTEREST",
  LIQUIDATION_POSITIONING: "LIQUIDATION_POSITIONING",
  RELATIVE_STRENGTH: "RELATIVE_STRENGTH",
  MARKET_INDEPENDENCE: "MARKET_INDEPENDENCE",
  CROSS_VENUE_BREADTH: "CROSS_VENUE_BREADTH",
  RISK_INVALIDATION: "RISK_INVALIDATION",
  REGIME_CONTEXT: "REGIME_CONTEXT",
});

const FAMILY_TO_DOMAIN = Object.freeze({
  PRICE_RESPONSE: "PRICE_ACTION",
  AGGRESSOR_RESPONSE: "PRICE_ACTION",
  LIQUIDITY_RESPONSE: "PRICE_ACTION",
  EFFORT_RESULT: "PRICE_ACTION",
  FUNDING: "POSITIONING",
  BASIS: "POSITIONING",
  OPEN_INTEREST: "POSITIONING",
  LIQUIDATION_POSITIONING: "POSITIONING",
  RELATIVE_STRENGTH: "RELATIVE_MARKET",
  MARKET_INDEPENDENCE: "RELATIVE_MARKET",
  CROSS_VENUE_BREADTH: "VENUE_BREADTH_CONTEXT",
  RISK_INVALIDATION: "RISK_INVALIDATION",
  REGIME_CONTEXT: "REGIME_CONTEXT",
});

const SEMANTIC_TO_FAMILY = Object.freeze({
  DIRECTIONAL_PRICE_RESPONSE: "PRICE_RESPONSE",
  OPPOSING_AGGRESSOR_INEFFECTIVE: "AGGRESSOR_RESPONSE",
  DIRECTIONAL_SWEEP_RECLAIM: "LIQUIDITY_RESPONSE",
  EFFORT_RESULT_RESPONSE: "EFFORT_RESULT",
  CROWDING_TRAJECTORY: "FUNDING",
  BASIS_DISLOCATION: "BASIS",
  OI_PRICE_TRAJECTORY: "OPEN_INTEREST",
  LIQUIDATION_PRESSURE_STRUCTURE: "LIQUIDATION_POSITIONING",
  RS_VS_BTC_ETH: "RELATIVE_STRENGTH",
  MARKET_RESIDUAL: "MARKET_INDEPENDENCE",
  VERIFIED_VENUE_BREADTH: "CROSS_VENUE_BREADTH",
  THESIS_INVALIDATION: "RISK_INVALIDATION",
  MARKET_REGIME_CONTEXT: "REGIME_CONTEXT",
});

const DIRECTIONAL_DOMAINS = new Set(["PRICE_ACTION", "POSITIONING", "RELATIVE_MARKET"]);
const DIRECTIONAL_SUPPORT_SEMANTICS = new Set([
  "DIRECTIONAL_PRICE_RESPONSE", "OPPOSING_AGGRESSOR_INEFFECTIVE", "DIRECTIONAL_SWEEP_RECLAIM",
  "EFFORT_RESULT_RESPONSE", "CROWDING_TRAJECTORY", "BASIS_DISLOCATION", "OI_PRICE_TRAJECTORY",
  "LIQUIDATION_PRESSURE_STRUCTURE", "RS_VS_BTC_ETH", "MARKET_RESIDUAL",
]);
const VALID_EVIDENCE_STATUS = new Set([
  "CLOSED", "PARTIAL", "NOT_CLOSED", "STALE", "FUTURE", "CONFLICT",
  "CONFLICTING", "SOURCE_INCOMPATIBLE", "MISSING", "UNSUPPORTED",
]);
const VALID_STANCE = new Set(["LONG", "SHORT", "NEUTRAL", "NONE"]);
const VALID_EFFECT = new Set(["SUPPORT", "INVALIDATE", "CONTEXT"]);
const VALID_POSITION = new Set(["NONE", "FLAT", "OPEN_LONG", "OPEN_SHORT", "UNKNOWN", "NOT_EVALUATED"]);
const PHASE_SET = new Set(CAMPAIGN_PHASES);
const OUTPUT_PHASE_SET = new Set([...CAMPAIGN_PHASES, "UNKNOWN"]);
const TERMINAL_PHASES = new Set(["EDGE_SPENT", "CLOSED"]);
const ENTRY_PHASES = new Set(["ENTRY_TRIGGER", "NEXT_IMPULSE_ENTRY"]);

const ALLOWED_TRANSITIONS = new Set([
  "DISCOVERY>PRE_IMPULSE_WATCH",
  "DISCOVERY>CLOSED",
  "PRE_IMPULSE_WATCH>ENTRY_CANDIDATE",
  "PRE_IMPULSE_WATCH>CLOSED",
  "ENTRY_CANDIDATE>ENTRY_TRIGGER",
  "ENTRY_CANDIDATE>CLOSED",
  "ENTRY_TRIGGER>IMPULSE",
  "ENTRY_TRIGGER>CLOSED",
  "IMPULSE>RELOAD_BASE",
  "IMPULSE>EXHAUSTION_WARNING",
  "IMPULSE>CLOSED",
  "RELOAD_BASE>NEXT_IMPULSE_WATCH",
  "RELOAD_BASE>EXHAUSTION_WARNING",
  "RELOAD_BASE>CLOSED",
  "NEXT_IMPULSE_WATCH>NEXT_IMPULSE_ENTRY",
  "NEXT_IMPULSE_WATCH>EXHAUSTION_WARNING",
  "NEXT_IMPULSE_WATCH>CLOSED",
  "NEXT_IMPULSE_ENTRY>IMPULSE",
  "NEXT_IMPULSE_ENTRY>EXHAUSTION_WARNING",
  "NEXT_IMPULSE_ENTRY>CLOSED",
  "EXHAUSTION_WARNING>EDGE_SPENT",
  "EXHAUSTION_WARNING>CLOSED",
  "EDGE_SPENT>CLOSED",
]);

const MAX_EVIDENCE_ROWS = 24;
const MAX_EXPLANATION_ITEMS = 16;
const MAX_REASON_CODES = 32;
const MAX_ENGINE_OUTPUT_JSON_BYTES = 24 * 1024;
const MAX_FULL_EVIDENCE_AGE_SEC = 7 * 24 * 60 * 60;
const MAX_DECISION_EVIDENCE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_SHADOW_ENTRY_WINDOW_MS = 30 * 60 * 1000;
const MAX_RECEIPT_COMMIT_LAG_MS = 60 * 1000;
const MAX_CAMPAIGN_SNAPSHOT_LAG_MS = 60 * 1000;
const EVIDENCE_LINEAGE_BLOCKING_REASONS = new Set([
  "EVIDENCE_LINEAGE_REGISTRY_COMMIT_TIME_INVALID",
  "EVIDENCE_LINEAGE_REGISTRY_CONTENT_DIGEST_INVALID",
  "EVIDENCE_LINEAGE_REGISTRY_CONTRACT_MISMATCH",
  "EVIDENCE_LINEAGE_REGISTRY_ENTRY_SET_MISMATCH",
  "EVIDENCE_LINEAGE_REGISTRY_EPISODE_MISMATCH",
  "EVIDENCE_LINEAGE_REGISTRY_PRECEDES_EVIDENCE_AVAILABILITY",
  "EVIDENCE_LINEAGE_REGISTRY_RECEIPT_INVALID",
  "EVIDENCE_LINEAGE_REGISTRY_RULES_MISMATCH",
  "EVIDENCE_LINEAGE_REGISTRY_SNAPSHOT_MISMATCH",
  "EVIDENCE_LINEAGE_REGISTRY_TIME_MISMATCH",
  "EVIDENCE_LINEAGE_REGISTRY_UNBOUNDED",
]);
const DECISION_FAMILY_FRESHNESS_MS = Object.freeze({
  PRICE_RESPONSE: 300_000,
  AGGRESSOR_RESPONSE: 120_000,
  LIQUIDITY_RESPONSE: 120_000,
  EFFORT_RESULT: 300_000,
  FUNDING: 900_000,
  BASIS: 300_000,
  OPEN_INTEREST: 300_000,
  LIQUIDATION_POSITIONING: 300_000,
  RELATIVE_STRENGTH: 300_000,
  MARKET_INDEPENDENCE: 300_000,
  CROSS_VENUE_BREADTH: 300_000,
  RISK_INVALIDATION: 120_000,
  REGIME_CONTEXT: 900_000,
});
const FULL_CHAIN_FRESHNESS_SEC = Object.freeze({
  CROSS_EXCHANGE_DERIVATIVES: 300,
  MARKET_STRENGTH_SPOT: 300,
  SMART_MONEY_ONCHAIN: 3600,
  SUPPORTING_RISK: 900,
  HTX_EXECUTION: 900,
});

function fullEvidenceFreshnessCapSec(row) {
  const chain = upper(row?.chain);
  const metric = upper(row?.metric);
  if (chain === "CROSS_EXCHANGE_DERIVATIVES") {
    if (metric === "FUNDING_RATE") {
      const match = String(row?.settlement_period || "").trim().match(/^([0-9]+(?:\.[0-9]+)?)h$/i);
      const hours = match ? Number(match[1]) : null;
      if (!Number.isFinite(hours) || hours <= 0 || hours > 8) return 300;
      return Math.min(12 * 60 * 60, Math.max(2 * 60 * 60, Math.ceil(hours * 5400)));
    }
    if (metric === "OI_CHANGE_1H") return 3 * 60 * 60;
    if (metric === "PRICE_CHANGE_4H") return 2 * 60 * 60;
    if (metric === "OPEN_INTEREST_CURRENT") return 15 * 60;
  }
  if (chain === "MARKET_STRENGTH_SPOT") {
    if (/^RS_VS_(BTC|ETH)_(1H|4H|24H)$/.test(metric)) return 2 * 60 * 60;
    if (/^DOWN_MARKET_RS_VS_(BTC|ETH)_RAW$/.test(metric)) return 2 * 60 * 60;
    if (metric === "HTX_SPOT_FLOW_DELTA_PCT") return 15 * 60;
  }
  return FULL_CHAIN_FRESHNESS_SEC[chain] ?? null;
}
const AUTHORITATIVE_STATE_FRESHNESS_MS = Object.freeze({
  HARD_VETO: 60_000,
  EXECUTION_GATE: 30_000,
  EXECUTION_SIDE: 15_000,
  POSITION: 60_000,
  POSITION_MANAGEMENT_CONTEXT: 60_000,
  CHASE_RISK: 60_000,
});
const REQUIRED_WEIGHTED_CHAINS = Object.freeze([
  "CROSS_EXCHANGE_DERIVATIVES",
  "MARKET_STRENGTH_SPOT",
  "SMART_MONEY_ONCHAIN",
  "SUPPORTING_RISK",
]);
const ENTRY_CRITICAL_FULL_CHAINS = Object.freeze([
  "CROSS_EXCHANGE_DERIVATIVES",
  "MARKET_STRENGTH_SPOT",
]);
const SUPPORTING_FULL_CHAINS = new Set([
  "SMART_MONEY_ONCHAIN",
  "SUPPORTING_RISK",
]);
const MAX_FULL_EVIDENCE_ROWS = 32;
const MAX_CROSS_PLANE_REUSE_REPORTS = 8;
const MAX_CROSS_PLANE_IDS_PER_REPORT = 8;
const MAX_CROSS_PLANE_TOTAL_REUSE = MAX_EVIDENCE_ROWS * 19;
const EVIDENCE_REGISTRY_RULES_VERSION = "causal-lineage-registry-v3-full-envelope";
const FULL_EVIDENCE_SOURCE_REGISTRY_VERSION = "full-evidence-source-registry-v1";
const FULL_CHAIN_SEMANTICS = Object.freeze({
  CROSS_EXCHANGE_DERIVATIVES: "DERIVATIVES_STRUCTURE",
  MARKET_STRENGTH_SPOT: "SPOT_MARKET_STRENGTH",
  SMART_MONEY_ONCHAIN: "ONCHAIN_FLOW_CONTEXT",
  SUPPORTING_RISK: "RISK_CONTEXT",
  HTX_EXECUTION: "HTX_EXECUTION_GATE",
});
const FULL_CHAIN_SOURCE_KIND = Object.freeze({
  CROSS_EXCHANGE_DERIVATIVES: "DERIVATIVES_VENUE_API",
  MARKET_STRENGTH_SPOT: "SPOT_VENUE_API",
  SMART_MONEY_ONCHAIN: "ONCHAIN_ANALYTICS",
  SUPPORTING_RISK: "RISK_MODEL",
  HTX_EXECUTION: "HTX_EXECUTION_GATE",
});

function finite(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function integer(value) {
  const n = finite(value);
  return n !== null && Number.isSafeInteger(n) ? n : null;
}

function nonNegativeLag(later, earlier) {
  return Number.isSafeInteger(later) && Number.isSafeInteger(earlier) && later >= earlier
    ? later - earlier
    : null;
}

function timestamp(value) {
  const n = integer(value);
  if (n === null || n <= 0) return null;
  const ms = n < 10_000_000_000 ? Math.round(n * 1000) : Math.round(n);
  return Number.isSafeInteger(ms) ? ms : null;
}

function freshnessContract(value, observedTs, maxAllowedMs, label) {
  const blockers = [];
  const missing = [];
  const sourceTs = timestamp(value?.source_ts);
  const availableTs = timestamp(value?.available_ts);
  const validUntilTs = timestamp(value?.valid_until_ts);
  const maxAgeMs = integer(value?.max_age_ms);
  if (sourceTs === null) missing.push(`${label}_SOURCE_TS_MISSING`);
  else if (sourceTs > observedTs) blockers.push(`${label}_FROM_FUTURE`);
  if (availableTs === null) missing.push(`${label}_AVAILABLE_TS_MISSING`);
  else if (availableTs > observedTs) blockers.push(`${label}_AVAILABLE_FROM_FUTURE`);
  else if (sourceTs !== null && availableTs < sourceTs) blockers.push(`${label}_AVAILABLE_BEFORE_SOURCE`);
  if (maxAgeMs === null || maxAgeMs <= 0) missing.push(`${label}_MAX_AGE_MISSING`);
  else if (maxAgeMs > maxAllowedMs) blockers.push(`${label}_FRESHNESS_POLICY_EXCEEDED`);
  const calculated = sourceTs !== null && maxAgeMs !== null && maxAgeMs > 0 && Number.isSafeInteger(sourceTs + maxAgeMs)
    ? sourceTs + maxAgeMs
    : null;
  if (validUntilTs === null) missing.push(`${label}_VALID_UNTIL_MISSING`);
  else if (calculated === null || validUntilTs !== calculated) blockers.push(`${label}_VALID_UNTIL_POLICY_MISMATCH`);
  else if (validUntilTs < observedTs) missing.push(`${label}_STALE`);
  return { blockers: uniqSorted(blockers), missing: uniqSorted(missing), source_ts: sourceTs, available_ts: availableTs, valid_until_ts: validUntilTs };
}

function text(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function bool(value) {
  return value === true;
}

function uniqSorted(values, limit = MAX_EXPLANATION_ITEMS) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).replace(/[\u0000-\u001f\u007f]/gu, "_").slice(0, 256)))].sort().slice(0, limit);
}

function reasonCode(value) {
  let code = String(value || "UNKNOWN").toUpperCase().replace(/[^A-Z0-9_.:-]+/g, "_");
  if (!/^[A-Z]/.test(code)) code = `R_${code}`;
  return code.slice(0, 96);
}

function stableProjection(value, state = { nodes: 0, keyUnits: 0, ancestors: new Set() }, depth = 0) {
  state.nodes += 1;
  if (state.nodes > 4096) throw new Error("CANONICAL_NODE_LIMIT_EXCEEDED");
  if (depth > 24) throw new Error("CANONICAL_DEPTH_LIMIT_EXCEEDED");
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  if (!value || typeof value !== "object") return value;
  if (state.ancestors.has(value)) throw new Error("CANONICAL_CYCLE_DETECTED");
  state.ancestors.add(value);
  let projected;
  if (Array.isArray(value)) {
    if (value.length > 256) throw new Error("CANONICAL_ARRAY_LIMIT_EXCEEDED");
    projected = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, index)) throw new Error("CANONICAL_SPARSE_ARRAY_FORBIDDEN");
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || descriptor.get || descriptor.set) throw new Error("CANONICAL_ACCESSOR_FORBIDDEN");
      projected.push(stableProjection(descriptor.value, state, depth + 1));
    }
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new Error("CANONICAL_NON_PLAIN_OBJECT");
    const keys = Object.keys(value).sort();
    if (keys.length > 128) throw new Error("CANONICAL_OBJECT_KEY_LIMIT_EXCEEDED");
    if (keys.some((key) => key.length > 256)) throw new Error("CANONICAL_KEY_LENGTH_EXCEEDED");
    state.keyUnits += keys.reduce((total, key) => total + key.length, 0);
    if (state.keyUnits > 65_536) throw new Error("CANONICAL_KEY_BUDGET_EXCEEDED");
    const descriptors = Object.getOwnPropertyDescriptors(value);
    projected = {};
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (!descriptor || descriptor.get || descriptor.set) throw new Error("CANONICAL_ACCESSOR_FORBIDDEN");
      projected[key] = stableProjection(descriptor.value, state, depth + 1);
    }
  }
  state.ancestors.delete(value);
  return projected;
}

function stableJson(value) {
  return JSON.stringify(stableProjection(value));
}

/*
 * Seal the complete registry envelope, including closure, authority, identity,
 * and immutable-persistence metadata. Only the two self-referential digest
 * fields are excluded. Entry order is transport-insensitive.
 */
export function decisionEvidenceRegistryContentDigest(registry) {
  if (!registry || typeof registry !== "object" || !Array.isArray(registry.entries) || registry.entries.length > MAX_EVIDENCE_ROWS) return null;
  const entries = [...registry.entries].sort((left, right) => {
    const leftId = typeof left?.evidence_id === "string" ? left.evidence_id : "";
    const rightId = typeof right?.evidence_id === "string" ? right.evidence_id : "";
    const byId = leftId.localeCompare(rightId);
    return byId || stableJson(left).localeCompare(stableJson(right));
  });
  const material = { ...registry, entries };
  delete material.content_digest;
  if (registry.persistence && typeof registry.persistence === "object") {
    material.persistence = { ...registry.persistence };
    delete material.persistence.content_digest;
  }
  return fnv1a64(stableJson(material));
}

function persistenceSafeJsonErrors(value) {
  const errors = [];
  const ancestors = new Set();
  const state = { nodes: 0, keyUnits: 0 };
  const fail = (code) => {
    if (!errors.includes(code)) errors.push(code);
  };
  const walk = (node, depth = 0) => {
    state.nodes += 1;
    if (state.nodes > 4096) { fail("PERSISTENCE_JSON_NODE_LIMIT_EXCEEDED"); return; }
    if (depth > 24) { fail("PERSISTENCE_JSON_DEPTH_LIMIT_EXCEEDED"); return; }
    if (node === null || typeof node === "boolean") return;
    if (typeof node === "number") {
      if (!Number.isFinite(node)) fail("PERSISTENCE_JSON_NON_FINITE_NUMBER");
      return;
    }
    if (typeof node === "string") {
      if (node.length > MAX_ENGINE_OUTPUT_JSON_BYTES) fail("PERSISTENCE_JSON_STRING_LIMIT_EXCEEDED");
      return;
    }
    if (typeof node !== "object") { fail(`PERSISTENCE_JSON_UNSUPPORTED_${String(typeof node).toUpperCase()}`); return; }
    if (ancestors.has(node)) { fail("PERSISTENCE_JSON_CYCLE_DETECTED"); return; }
    ancestors.add(node);
    try {
      if (Array.isArray(node)) {
        if (Object.getPrototypeOf(node) !== Array.prototype) fail("PERSISTENCE_JSON_ARRAY_PROTOTYPE_INVALID");
        if (node.length > 256) fail("PERSISTENCE_JSON_ARRAY_LIMIT_EXCEEDED");
        const ownKeys = Reflect.ownKeys(node);
        if (ownKeys.some((key) => typeof key === "symbol")) fail("PERSISTENCE_JSON_SYMBOL_KEY_FORBIDDEN");
        const stringKeys = ownKeys.filter((key) => typeof key === "string" && key !== "length");
        if (stringKeys.length !== node.length || stringKeys.some((key) => !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= node.length)) fail("PERSISTENCE_JSON_ARRAY_SHAPE_INVALID");
        const descriptors = Object.getOwnPropertyDescriptors(node);
        for (let index = 0; index < node.length; index += 1) {
          const descriptor = descriptors[String(index)];
          if (!descriptor || descriptor.get || descriptor.set || descriptor.enumerable !== true || !("value" in descriptor)) {
            fail("PERSISTENCE_JSON_ACCESSOR_OR_SPARSE_ARRAY_FORBIDDEN");
            continue;
          }
          walk(descriptor.value, depth + 1);
        }
      } else {
        const prototype = Object.getPrototypeOf(node);
        if (prototype !== Object.prototype && prototype !== null) fail("PERSISTENCE_JSON_NON_PLAIN_OBJECT");
        const ownKeys = Reflect.ownKeys(node);
        if (ownKeys.some((key) => typeof key === "symbol")) fail("PERSISTENCE_JSON_SYMBOL_KEY_FORBIDDEN");
        const keys = ownKeys.filter((key) => typeof key === "string");
        if (keys.length > 128) fail("PERSISTENCE_JSON_OBJECT_KEY_LIMIT_EXCEEDED");
        for (const key of keys) {
          if (!/^[A-Za-z0-9_]+$/.test(key)) fail("PERSISTENCE_JSON_KEY_GRAMMAR_INVALID");
          if (key.length > 256) fail("PERSISTENCE_JSON_KEY_LENGTH_EXCEEDED");
          state.keyUnits += key.length;
          if (state.keyUnits > 65_536) fail("PERSISTENCE_JSON_KEY_BUDGET_EXCEEDED");
          const descriptor = Object.getOwnPropertyDescriptor(node, key);
          if (!descriptor || descriptor.get || descriptor.set || descriptor.enumerable !== true || !("value" in descriptor)) {
            fail("PERSISTENCE_JSON_ACCESSOR_OR_HIDDEN_PROPERTY_FORBIDDEN");
            continue;
          }
          walk(descriptor.value, depth + 1);
        }
      }
    } catch {
      fail("PERSISTENCE_JSON_INSPECTION_FAILED");
    }
    ancestors.delete(node);
  };
  try {
    walk(value);
  } catch {
    fail("PERSISTENCE_JSON_INSPECTION_FAILED");
  }
  return errors.sort();
}

function fnv1a64(value) {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(String(value))) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

function normalizedContract(value) {
  if (typeof value !== "string") return { value: null, error: "INVALID_CONTRACT_CODE" };
  const raw = value;
  if (!raw || raw.length > 80) return { value: null, error: "INVALID_CONTRACT_CODE" };
  if (raw !== raw.trim()) return { value: null, error: "UNSAFE_CONTRACT_CODE" };
  const nfc = raw.normalize("NFC");
  if (raw !== nfc) return { value: null, error: "NON_NFC_CONTRACT_CODE" };
  if (!/^[A-Z0-9][A-Z0-9._:-]{0,79}$/.test(nfc)) return { value: null, error: "UNSAFE_CONTRACT_CODE" };
  return { value: nfc, error: null };
}

function validIdentifier(value, max = 256) {
  if (typeof value !== "string") return false;
  const s = value;
  if (s !== s.trim()) return false;
  let nfc;
  try { nfc = s.normalize("NFC"); } catch { return false; }
  const canonical = nfc.toLowerCase().normalize("NFC");
  const safeGrammar = (candidate) => !/[\u0000-\u001f\u007f\uD800-\uDFFF]/u.test(candidate) &&
    !/\p{Default_Ignorable_Code_Point}/u.test(candidate) &&
    /^[\p{L}\p{N}][\p{L}\p{N}\p{M}._:@/-]*$/u.test(candidate);
  return s.length > 0 && s.length <= max && s === nfc && canonical.length <= max &&
    safeGrammar(s) && safeGrammar(canonical);
}

function canonicalProvenanceToken(value) {
  if (typeof value !== "string") return null;
  return value.normalize("NFC").toLowerCase().normalize("NFC");
}

function canonicalSourceRoot(source, venue, metric, sourceTs) {
  return {
    source: canonicalProvenanceToken(source),
    venue: canonicalProvenanceToken(venue),
    metric: canonicalProvenanceToken(metric),
    source_ts: sourceTs,
  };
}

function validSafeId(value, max = 256) {
  if (typeof value !== "string") return false;
  const s = value;
  return s.length > 0 && s.length <= max && /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/.test(s);
}

function validDigest(value) {
  return typeof value === "string" && /^[0-9a-f]{16}$/.test(value);
}

function boundedDataEntries(value, maxEntries = 256) {
  const keys = Object.keys(value);
  if (keys.length > maxEntries || keys.some((key) => key.length > 256)) throw new Error("OBJECT_KEY_BOUNDS_EXCEEDED");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return keys.map((key) => {
    const descriptor = descriptors[key];
    if (!descriptor || descriptor.get || descriptor.set) throw new Error("OBJECT_ACCESSOR_FORBIDDEN");
    return [key, descriptor.value];
  });
}

function boundedWalk(root, visitor, { maxNodes = 8192, maxDepth = 24 } = {}) {
  const stack = [{ value: root, path: "$", depth: 0 }];
  const seen = new Set();
  let nodes = 0;
  let overflow = false;
  while (stack.length) {
    const item = stack.pop();
    nodes += 1;
    if (nodes > maxNodes || item.depth > maxDepth) {
      overflow = true;
      break;
    }
    visitor(item.value, item.path);
    if (!item.value || typeof item.value !== "object" || seen.has(item.value)) continue;
    seen.add(item.value);
    if (Array.isArray(item.value)) {
      const length = Math.min(item.value.length, 256);
      if (item.value.length > length) overflow = true;
      for (let i = length - 1; i >= 0; i -= 1) stack.push({ value: item.value[i], path: `${item.path}[${i}]`, depth: item.depth + 1 });
    } else {
      const keys = Object.keys(item.value);
      if (keys.some((key) => key.length > 256)) { overflow = true; continue; }
      const descriptors = Object.getOwnPropertyDescriptors(item.value);
      const entries = keys.slice(0, 256).map((key) => {
        const descriptor = descriptors[key];
        if (!descriptor || descriptor.get || descriptor.set) { overflow = true; return [key, null]; }
        return [key, descriptor.value];
      });
      if (keys.length > entries.length) overflow = true;
      for (let i = entries.length - 1; i >= 0; i -= 1) {
        const [key, value] = entries[i];
        stack.push({ value, path: `${item.path}.${key}`, depth: item.depth + 1 });
      }
    }
  }
  return { nodes, overflow };
}

export function finalDecisionSafetyEnvelope() {
  return {
    shadow_only: true,
    classification_is_probability: false,
    live_probability: null,
    live_signal: false,
    validated_signal: false,
    telegram_eligible: false,
    telegram_started: false,
    trading_execution: false,
    execution_authorized: false,
    automatic_weight_tuning: false,
    strategy_weights_changed: false,
    fixed_strategy_weights_applied_by_this_layer: false,
    statistical_validation_claimed: false,
    missing_data_coerced_to_zero: false,
    correlated_features_counted_as_independent: false,
  };
}

function scanSafety(input) {
  const violations = [];
  const trueForbidden = new Set([
    "livesignal", "validatedsignal", "validated", "telegrameligible", "telegramstarted",
    "tradingexecution", "executionauthorized", "automaticweighttuning", "strategyweightschanged",
    "classificationisprobability", "fixedstrategyweightsappliedbythislayer",
    "statisticalvalidationclaimed", "statisticalindependencevalidated",
    "missingdatacoercedtozero", "correlatedfeaturescountedasindependent",
    "calibrationeligible", "shadowoutcomecollectioneligible",
  ]);
  const result = boundedWalk(input, (value, path) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    for (const [rawKey, fieldValue] of boundedDataEntries(value)) {
      const key = rawKey.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!/^[\x20-\x7e]+$/.test(rawKey)) violations.push(`UNSAFE_KEY_ENCODING:${path}`);
      if (trueForbidden.has(key) && fieldValue !== false) violations.push(`FORBIDDEN_VALUE:${path}.${rawKey}`);
      if (key === "liveprobability" && fieldValue !== null && fieldValue !== undefined) violations.push(`LIVE_PROBABILITY_PRESENT:${path}.${rawKey}`);
      if (key === "shadowonly" && fieldValue !== true) violations.push(`SHADOW_ONLY_INVALID:${path}.${rawKey}`);
    }
  });
  if (result.overflow) violations.push("SAFETY_SCAN_BOUNDS_EXCEEDED");
  return uniqSorted(violations);
}

function evidenceFingerprint(e) {
  return stableJson({
    evidence_id: e.evidence_id,
    snapshot_id: e.snapshot_id,
    contract_code: e.contract_code,
    causal_family: e.causal_family,
    metric_semantics: e.metric_semantics,
    correlation_group: e.correlation_group,
    episode_id: e.episode_id,
    episode_revision: e.episode_revision,
    source: e.source,
    venue: e.venue,
    metric: e.metric,
    source_observation_id: e.source_observation_id,
    source_payload_digest: e.source_payload_digest,
    registry_receipt_id: e.registry_receipt_id,
    value: e.value,
    unit: e.unit,
    status: e.status,
    stance: e.stance,
    effect: e.effect,
    source_ts: e.source_ts,
    available_ts: e.available_ts,
    valid_until_ts: e.valid_until_ts,
    max_age_ms: e.max_age_ms,
    eligible_for_decision: e.eligible_for_decision,
    symbol_verified: e.symbol_verified,
    source_compatible: e.source_compatible,
    fact_complete: e.fact_complete,
    independence_basis: e.independence_basis,
    fact_ids: e.fact_ids,
    lineage_derivation_id: e.lineage_derivation_id,
    producer_rules_version: e.producer_rules_version,
    derivation_rules_version: e.derivation_rules_version,
  });
}

function decisionRawObservationDigest(e) {
  return fnv1a64(stableJson([
    e.contract_code,
    e.snapshot_id,
    e.source,
    e.venue,
    e.metric,
    e.source_ts,
    e.available_ts,
    e.valid_until_ts,
    e.max_age_ms,
    e.value,
    e.unit,
    e.episode_id,
    e.episode_revision,
  ]));
}

function evidenceScalar(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.length <= 512 && !/[\u0000-\u001f\u007f]/u.test(value)) return value;
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function normalizeDecisionEvidence(raw, contract, observedTs, snapshotId, expectedEpisode) {
  const family = upper(raw?.causal_family);
  const metricSemantics = upper(raw?.metric_semantics);
  const stance = upper(raw?.stance || "NONE");
  const effect = upper(raw?.effect || "CONTEXT");
  const status = upper(raw?.status || "MISSING");
  const sourceTs = timestamp(raw?.source_ts);
  const availableTs = timestamp(raw?.available_ts);
  const validUntilTs = timestamp(raw?.valid_until_ts);
  const maxAgeMs = integer(raw?.max_age_ms);
  const computedValidUntil = sourceTs !== null && maxAgeMs !== null && maxAgeMs > 0 && maxAgeMs <= MAX_DECISION_EVIDENCE_AGE_MS && Number.isSafeInteger(sourceTs + maxAgeMs)
    ? sourceTs + maxAgeMs
    : null;
  const derivedValidUntil = validUntilTs ?? computedValidUntil;
  const evidenceContract = normalizedContract(raw?.contract_code);
  const normalized = {
    evidence_id: text(raw?.evidence_id),
    snapshot_id: text(raw?.snapshot_id),
    contract_code: evidenceContract.value,
    causal_family: family,
    metric_semantics: metricSemantics,
    causal_domain: FAMILY_TO_DOMAIN[family] || null,
    correlation_group: text(raw?.correlation_group),
    episode_id: text(raw?.episode_id),
    episode_revision: integer(raw?.episode_revision),
    source: text(raw?.source),
    venue: text(raw?.venue) || null,
    metric: text(raw?.metric),
    source_observation_id: text(raw?.source_observation_id),
    source_payload_digest: text(raw?.source_payload_digest),
    registry_receipt_id: text(raw?.registry_receipt_id),
    value: evidenceScalar(raw?.value),
    unit: text(raw?.unit) || null,
    status,
    stance,
    effect,
    source_ts: sourceTs,
    available_ts: availableTs,
    valid_until_ts: derivedValidUntil,
    max_age_ms: maxAgeMs,
    eligible_for_decision: raw?.eligible_for_decision === true,
    symbol_verified: raw?.symbol_verified === true,
    source_compatible: raw?.source_compatible === true,
    fact_complete: raw?.fact_complete === true,
    independence_basis: upper(raw?.independence_basis),
    fact_ids: Array.isArray(raw?.fact_ids) ? uniqSorted(raw.fact_ids, 16) : [],
    lineage_derivation_id: null,
    producer_rules_version: text(raw?.producer_rules_version),
    derivation_rules_version: text(raw?.derivation_rules_version),
    errors: [],
    usability_reasons: [],
  };
  if (!validSafeId(raw?.evidence_id, 96)) normalized.errors.push("INVALID_EVIDENCE_ID");
  if (!validSafeId(raw?.snapshot_id) || normalized.snapshot_id !== snapshotId) normalized.errors.push("EVIDENCE_SNAPSHOT_MISMATCH");
  if (evidenceContract.error || normalized.contract_code !== contract) normalized.errors.push("EVIDENCE_CONTRACT_MISMATCH");
  if ([raw?.causal_family, raw?.metric_semantics, raw?.stance, raw?.effect, raw?.status, raw?.independence_basis].some((value) => typeof value !== "string")) normalized.errors.push("EVIDENCE_ENUM_FIELD_TYPE_INVALID");
  if (!Object.hasOwn(FAMILY_TO_DOMAIN, family)) normalized.errors.push("INVALID_CAUSAL_FAMILY");
  if (!Object.hasOwn(SEMANTIC_TO_FAMILY, metricSemantics) || SEMANTIC_TO_FAMILY[metricSemantics] !== family) normalized.errors.push("METRIC_FAMILY_SEMANTICS_MISMATCH");
  if (!VALID_STANCE.has(stance)) normalized.errors.push("INVALID_EVIDENCE_STANCE");
  if (!VALID_EFFECT.has(effect)) normalized.errors.push("INVALID_EVIDENCE_EFFECT");
  if (!VALID_EVIDENCE_STATUS.has(status)) normalized.errors.push("INVALID_EVIDENCE_STATUS");
  if (!validIdentifier(raw?.source, 160) || !validIdentifier(raw?.metric, 160) || (raw?.venue !== null && raw?.venue !== undefined && !validIdentifier(raw.venue, 160))) normalized.errors.push("INVALID_EVIDENCE_PROVENANCE");
  if (!validSafeId(raw?.source_observation_id, 256)) normalized.errors.push("SOURCE_OBSERVATION_ID_MISSING");
  if (!validDigest(raw?.source_payload_digest)) normalized.errors.push("SOURCE_PAYLOAD_DIGEST_INVALID");
  else if (normalized.source_payload_digest !== decisionRawObservationDigest(normalized)) normalized.errors.push("SOURCE_PAYLOAD_DIGEST_MISMATCH");
  if (!validSafeId(raw?.registry_receipt_id, 256)) normalized.errors.push("REGISTRY_RECEIPT_ID_MISSING");
  if (!validSafeId(raw?.episode_id, 256)) normalized.errors.push("MISSING_EPISODE_ID");
  if (normalized.episode_revision === null || normalized.episode_revision < 0) normalized.errors.push("INVALID_EPISODE_REVISION");
  if (expectedEpisode?.id && normalized.episode_id !== expectedEpisode.id) normalized.errors.push("EVIDENCE_EPISODE_MISMATCH");
  if (expectedEpisode?.revision !== null && expectedEpisode?.revision !== undefined && normalized.episode_revision !== expectedEpisode.revision) normalized.errors.push("EVIDENCE_EPISODE_REVISION_MISMATCH");
  if (effect !== "CONTEXT" && !validSafeId(raw?.correlation_group, 160)) normalized.errors.push("MISSING_CORRELATION_GROUP");
  if (effect !== "CONTEXT" && (!Array.isArray(raw?.fact_ids) || raw.fact_ids.length < 1 || raw.fact_ids.length > 16 || normalized.fact_ids.length !== raw.fact_ids.length || raw.fact_ids.some((id) => !validSafeId(id, 256)))) normalized.errors.push("INVALID_SOURCE_FACT_IDS");
  if (effect !== "CONTEXT" && normalized.independence_basis !== "STRUCTURAL_RULE_V1") normalized.usability_reasons.push("INDEPENDENCE_NOT_RULE_VERIFIED");
  if (effect === "SUPPORT" && !["LONG", "SHORT"].includes(stance)) normalized.errors.push("SUPPORT_WITHOUT_DIRECTION");
  if (effect === "INVALIDATE" && !["LONG", "SHORT"].includes(stance)) normalized.errors.push("INVALIDATION_WITHOUT_TARGET_DIRECTION");
  if (normalized.producer_rules_version !== "decision-evidence-producer-v1" || normalized.derivation_rules_version !== "decision-evidence-derivation-v1") normalized.errors.push("EVIDENCE_RULES_VERSION_UNSUPPORTED");
  if (DIRECTIONAL_SUPPORT_SEMANTICS.has(metricSemantics)) {
    const expectedValue = stance === "LONG" ? 1 : stance === "SHORT" ? -1 : null;
    if (effect !== "SUPPORT" || raw?.value !== expectedValue || raw?.unit !== "direction_state") normalized.errors.push("EVIDENCE_DIRECTIONAL_SEMANTICS_INVALID");
  } else if (metricSemantics === "THESIS_INVALIDATION") {
    if (effect !== "INVALIDATE" || raw?.value !== true || raw?.unit !== "boolean") normalized.errors.push("EVIDENCE_INVALIDATION_SEMANTICS_INVALID");
  } else if (metricSemantics === "VERIFIED_VENUE_BREADTH") {
    if (effect !== "CONTEXT" || !["NONE", "NEUTRAL"].includes(stance) || raw?.value !== true || raw?.unit !== "boolean") normalized.errors.push("EVIDENCE_BREADTH_SEMANTICS_INVALID");
  } else if (metricSemantics === "MARKET_REGIME_CONTEXT") {
    if (effect !== "CONTEXT" || !["NONE", "NEUTRAL"].includes(stance) || typeof raw?.value !== "string" || raw?.unit !== "regime_state") normalized.errors.push("EVIDENCE_CONTEXT_SEMANTICS_INVALID");
  }
  if (evidenceScalar(raw?.value) === null) normalized.errors.push("INVALID_EVIDENCE_VALUE");
  if (maxAgeMs === null || maxAgeMs <= 0 || maxAgeMs > MAX_DECISION_EVIDENCE_AGE_MS || computedValidUntil === null) normalized.usability_reasons.push("INVALID_EVIDENCE_MAX_AGE");
  if (maxAgeMs !== null && Object.hasOwn(DECISION_FAMILY_FRESHNESS_MS, family) && maxAgeMs > DECISION_FAMILY_FRESHNESS_MS[family]) normalized.usability_reasons.push("EVIDENCE_FAMILY_FRESHNESS_POLICY_EXCEEDED");
  if (validUntilTs !== null && computedValidUntil !== null && validUntilTs !== computedValidUntil) normalized.errors.push("EVIDENCE_VALID_UNTIL_POLICY_MISMATCH");
  if (sourceTs === null) normalized.usability_reasons.push("MISSING_SOURCE_TS");
  if (availableTs === null) normalized.usability_reasons.push("MISSING_AVAILABLE_TS");
  if (derivedValidUntil === null) normalized.usability_reasons.push("MISSING_VALID_UNTIL_TS");
  if (sourceTs !== null && sourceTs > observedTs) normalized.usability_reasons.push("FUTURE_SOURCE_TS");
  if (availableTs !== null && availableTs > observedTs) normalized.usability_reasons.push("LOOKAHEAD_AVAILABLE_TS");
  if (derivedValidUntil !== null && derivedValidUntil < observedTs) normalized.usability_reasons.push("STALE_EVIDENCE");
  if (availableTs !== null && sourceTs !== null && availableTs < sourceTs) normalized.errors.push("AVAILABLE_BEFORE_SOURCE_TS");
  if (status !== "CLOSED") normalized.usability_reasons.push(`STATUS_${status}`);
  if (!normalized.eligible_for_decision) normalized.usability_reasons.push("NOT_ELIGIBLE_FOR_DECISION");
  if (!normalized.symbol_verified) normalized.usability_reasons.push("SYMBOL_NOT_VERIFIED");
  if (!normalized.source_compatible) normalized.usability_reasons.push("SOURCE_NOT_COMPATIBLE");
  if (!normalized.fact_complete) normalized.usability_reasons.push("FACT_NOT_COMPLETE");
  normalized.errors = uniqSorted(normalized.errors);
  normalized.usability_reasons = uniqSorted(normalized.usability_reasons);
  normalized.usable = normalized.errors.length === 0 && normalized.usability_reasons.length === 0;
  normalized.fingerprint = evidenceFingerprint(normalized);
  return normalized;
}

function analyzeEvidence(rawRows, contract, observedTs, snapshotId, expectedEpisode = null, registry = null) {
  const inputRows = Array.isArray(rawRows) ? rawRows : [];
  const bounded = inputRows.slice(0, MAX_EVIDENCE_ROWS + 1);
  const overflow = inputRows.length > MAX_EVIDENCE_ROWS;
  const normalized = bounded.slice(0, MAX_EVIDENCE_ROWS).map((row) => normalizeDecisionEvidence(row, contract, observedTs, snapshotId, expectedEpisode));
  const errors = [];
  const blockers = [];
  const missing = [];
  const suppressed = [];
  if (!Array.isArray(rawRows)) errors.push("DECISION_EVIDENCE_NOT_ARRAY");
  if (overflow) blockers.push("EVIDENCE_ROW_LIMIT_EXCEEDED");
  if (!normalized.length) missing.push("NO_DECISION_EVIDENCE");

  const registryEntriesInput = Array.isArray(registry?.entries) ? registry.entries : [];
  const registryEntriesOverflow = registryEntriesInput.length > MAX_EVIDENCE_ROWS;
  const registryEntries = registryEntriesInput.slice(0, MAX_EVIDENCE_ROWS + 1);
  const rawEvidenceIds = uniqSorted(normalized.map((row) => row.evidence_id), MAX_EVIDENCE_ROWS + 1);
  const registeredEvidenceIds = uniqSorted(registryEntries.map((entry) => (
    typeof entry?.evidence_id === "string" ? entry.evidence_id : ""
  )), MAX_EVIDENCE_ROWS + 1);
  const registryReceiptId = validSafeId(registry?.receipt_id, 256) ? registry.receipt_id : "";
  const registryContentDigest = Array.isArray(registry?.entries) && !registryEntriesOverflow
    ? decisionEvidenceRegistryContentDigest(registry)
    : null;
  if (!registry || typeof registry !== "object") missing.push("EVIDENCE_LINEAGE_REGISTRY_MISSING");
  else {
    const registryContract = normalizedContract(registry?.contract_code);
    const registryTs = timestamp(registry?.observed_ts);
    if (upper(registry?.status) !== "CLOSED" || registry?.authoritative !== true) missing.push("EVIDENCE_LINEAGE_REGISTRY_NOT_CLOSED");
    if (registryContract.error || registryContract.value !== contract) blockers.push("EVIDENCE_LINEAGE_REGISTRY_CONTRACT_MISMATCH");
    if (!validSafeId(registry?.snapshot_id) || text(registry.snapshot_id) !== snapshotId) blockers.push("EVIDENCE_LINEAGE_REGISTRY_SNAPSHOT_MISMATCH");
    if (registryTs === null || registryTs !== observedTs) blockers.push("EVIDENCE_LINEAGE_REGISTRY_TIME_MISMATCH");
    if (text(registry?.episode_id) !== text(expectedEpisode?.id) || integer(registry?.episode_revision) !== expectedEpisode?.revision) blockers.push("EVIDENCE_LINEAGE_REGISTRY_EPISODE_MISMATCH");
    if (registry?.rules_version !== EVIDENCE_REGISTRY_RULES_VERSION) blockers.push("EVIDENCE_LINEAGE_REGISTRY_RULES_MISMATCH");
    if (upper(registry?.persistence?.status) !== "CLOSED") missing.push("EVIDENCE_LINEAGE_REGISTRY_PERSISTENCE_NOT_CLOSED");
    if (!validSafeId(registry?.receipt_id, 256) || registry?.persistence?.receipt_id !== registryReceiptId) blockers.push("EVIDENCE_LINEAGE_REGISTRY_RECEIPT_INVALID");
    if (!validDigest(registry?.content_digest) || registry.content_digest !== registryContentDigest || !validDigest(registry?.persistence?.content_digest) || registry.persistence.content_digest !== registryContentDigest) blockers.push("EVIDENCE_LINEAGE_REGISTRY_CONTENT_DIGEST_INVALID");
    const registryCommittedTs = timestamp(registry?.persistence?.committed_ts);
    if (registryCommittedTs === null || registryCommittedTs > observedTs) blockers.push("EVIDENCE_LINEAGE_REGISTRY_COMMIT_TIME_INVALID");
    const latestEvidenceAvailableTs = Math.max(0, ...registryEntries.map((entry) => timestamp(entry?.available_ts) ?? 0));
    if (registryCommittedTs !== null && registryCommittedTs < latestEvidenceAvailableTs) blockers.push("EVIDENCE_LINEAGE_REGISTRY_PRECEDES_EVIDENCE_AVAILABILITY");
    if (registry?.persistence?.immutable !== true || registry?.persistence?.verification_method !== "D1_IMMUTABLE_RECEIPT") missing.push("EVIDENCE_LINEAGE_REGISTRY_IMMUTABILITY_NOT_PROVEN");
    if (!Array.isArray(registry?.entries)) missing.push("EVIDENCE_LINEAGE_REGISTRY_ENTRIES_MISSING");
    if (registryEntriesOverflow) blockers.push("EVIDENCE_LINEAGE_REGISTRY_UNBOUNDED");
    if (registryEntries.length !== rawEvidenceIds.length || stableJson(registeredEvidenceIds) !== stableJson(rawEvidenceIds)) blockers.push("EVIDENCE_LINEAGE_REGISTRY_ENTRY_SET_MISMATCH");
  }
  const registryLineageClosed = ![...blockers, ...missing]
    .some((code) => typeof code === "string" && code.startsWith("EVIDENCE_LINEAGE_REGISTRY_"));
  const registryById = new Map();
  for (const entry of registryEntries.slice(0, MAX_EVIDENCE_ROWS + 1)) {
    const id = text(entry?.evidence_id);
    if (!validSafeId(id, 96) || registryById.has(id)) {
      blockers.push(`EVIDENCE_LINEAGE_REGISTRY_ID_INVALID_OR_DUPLICATE:${id || "UNKNOWN"}`);
      continue;
    }
    registryById.set(id, entry);
  }
  for (const row of normalized) {
    const entry = registryById.get(row.evidence_id);
    if (!entry) {
      row.usability_reasons.push("EVIDENCE_LINEAGE_NOT_REGISTERED");
      row.usable = false;
      continue;
    }
    const registryFacts = Array.isArray(entry?.source_fact_ids) ? uniqSorted(entry.source_fact_ids, 16) : [];
    const registeredMaterial = {
      stance: upper(entry?.stance), effect: upper(entry?.effect), value: evidenceScalar(entry?.value),
      unit: text(entry?.unit) || null, status: upper(entry?.evidence_status),
      source_ts: timestamp(entry?.source_ts), available_ts: timestamp(entry?.available_ts),
      valid_until_ts: timestamp(entry?.valid_until_ts),
      max_age_ms: integer(entry?.max_age_ms),
      eligible_for_decision: entry?.eligible_for_decision === true,
      symbol_verified: entry?.symbol_verified === true,
      source_compatible: entry?.source_compatible === true,
      fact_complete: entry?.fact_complete === true,
      independence_basis: upper(entry?.independence_basis),
    };
    const rowMaterial = {
      stance: row.stance, effect: row.effect, value: row.value, unit: row.unit, status: row.status,
      source_ts: row.source_ts, available_ts: row.available_ts, valid_until_ts: row.valid_until_ts,
      max_age_ms: row.max_age_ms,
      eligible_for_decision: row.eligible_for_decision, symbol_verified: row.symbol_verified,
      source_compatible: row.source_compatible, fact_complete: row.fact_complete,
      independence_basis: row.independence_basis,
    };
    const lineageMatches = (
      entry?.status === "CLOSED" && entry?.immutable === true &&
      entry?.causal_family === row.causal_family &&
      entry?.metric_semantics === row.metric_semantics &&
      entry?.correlation_group === row.correlation_group &&
      entry?.source === row.source && (entry?.venue ?? null) === (row.venue ?? null) &&
      entry?.metric === row.metric && entry?.episode_id === row.episode_id &&
      entry?.source_observation_id === row.source_observation_id &&
      entry?.source_payload_digest === row.source_payload_digest &&
      entry?.registry_receipt_id === registryReceiptId && row.registry_receipt_id === registryReceiptId &&
      integer(entry?.episode_revision) === row.episode_revision &&
      entry?.producer_rules_version === row.producer_rules_version &&
      entry?.derivation_rules_version === row.derivation_rules_version &&
      Array.isArray(entry?.source_fact_ids) && entry.source_fact_ids.every((factId) => validSafeId(factId, 256)) &&
      stableJson(registryFacts) === stableJson(row.fact_ids) &&
      registryFacts.length === (Array.isArray(entry?.source_fact_ids) ? entry.source_fact_ids.length : -1) &&
      stableJson(registeredMaterial) === stableJson(rowMaterial) &&
      validSafeId(entry?.lineage_derivation_id, 256)
    );
    if (!lineageMatches) {
      row.errors.push("EVIDENCE_LINEAGE_REGISTRY_MISMATCH");
      row.usable = false;
    } else {
      row.lineage_derivation_id = text(entry.lineage_derivation_id);
    }
    if (!registryLineageClosed) row.usability_reasons.push("EVIDENCE_LINEAGE_REGISTRY_NOT_TRUSTED");
    row.errors = uniqSorted(row.errors);
    row.usability_reasons = uniqSorted(row.usability_reasons);
    row.usable = row.errors.length === 0 && row.usability_reasons.length === 0;
    row.fingerprint = evidenceFingerprint(row);
  }

  const byId = new Map();
  const deduped = [];
  for (const row of normalized) {
    for (const error of row.errors) errors.push(`${row.evidence_id || "UNKNOWN"}:${error}`);
    for (const reason of row.usability_reasons) {
      if (["FUTURE_SOURCE_TS", "LOOKAHEAD_AVAILABLE_TS"].includes(reason)) blockers.push(`${row.evidence_id || "UNKNOWN"}:${reason}`);
      else missing.push(`${row.evidence_id || "UNKNOWN"}:${reason}`);
    }
    if (!row.evidence_id) continue;
    if (byId.has(row.evidence_id)) {
      const prior = byId.get(row.evidence_id);
      if (prior.fingerprint !== row.fingerprint) blockers.push(`EVIDENCE_ID_CONFLICT:${row.evidence_id}`);
      else suppressed.push(`EXACT_DUPLICATE:${row.evidence_id}`);
      continue;
    }
    byId.set(row.evidence_id, row);
    deduped.push(row);
  }

  deduped.sort((a, b) => a.evidence_id.localeCompare(b.evidence_id) || a.fingerprint.localeCompare(b.fingerprint));
  const payloadDigestsByObservationId = new Map();
  for (const row of deduped.filter((item) => item.usable)) {
    if (!payloadDigestsByObservationId.has(row.source_observation_id)) payloadDigestsByObservationId.set(row.source_observation_id, new Set());
    payloadDigestsByObservationId.get(row.source_observation_id).add(row.source_payload_digest);
  }
  if ([...payloadDigestsByObservationId.values()].some((digests) => digests.size > 1)) {
    blockers.push("SOURCE_OBSERVATION_ID_DIGEST_CONFLICT");
  }
  const observationKeys = new Map();
  const usable = [];
  for (const row of deduped) {
    if (!row.usable) continue;
    const observationKey = stableJson([
      row.contract_code, row.snapshot_id, row.source_observation_id, row.source_payload_digest,
    ]);
    if (!observationKeys.has(observationKey)) observationKeys.set(observationKey, []);
    observationKeys.get(observationKey).push(row);
  }
  for (const rows of observationKeys.values()) {
    if (rows.length === 1) {
      usable.push(rows[0]);
      continue;
    }
    const semanticKeys = new Set(rows.map((row) => stableJson({
      causal_domain: row.causal_domain,
      correlation_group: row.correlation_group,
      effect: row.effect,
      fact_ids: row.fact_ids,
      stance: row.stance,
    })));
    if (semanticKeys.size > 1) {
      blockers.push(`OBSERVATION_IDENTITY_CONFLICT:${rows.map((row) => row.evidence_id).sort().join(":")}`);
      continue;
    }
    usable.push(rows[0]);
    for (const row of rows.slice(1)) suppressed.push(`OBSERVATION_DUPLICATE:${row.evidence_id}`);
  }

  const domains = {};
  for (const domain of [...new Set(Object.values(FAMILY_TO_DOMAIN))].sort()) {
    const rows = usable.filter((row) => row.causal_domain === domain);
    const support = rows.filter((row) => row.effect === "SUPPORT");
    const invalidations = rows.filter((row) => row.effect === "INVALIDATE");
    const stances = new Set(support.map((row) => row.stance).filter((x) => ["LONG", "SHORT"].includes(x)));
    const correlationGroups = new Set(support.map((row) => row.correlation_group).filter(Boolean));
    let state = "UNKNOWN";
    if (stances.size > 1) state = "CONFLICTING";
    else if (stances.has("LONG")) state = "LONG";
    else if (stances.has("SHORT")) state = "SHORT";
    else if (rows.length) state = "NEUTRAL";
    domains[domain] = {
      state,
      evidence_ids: uniqSorted(rows.map((row) => row.evidence_id)),
      support_ids: uniqSorted(support.map((row) => row.evidence_id)),
      invalidates_long_ids: uniqSorted(invalidations.filter((row) => row.stance === "LONG").map((row) => row.evidence_id)),
      invalidates_short_ids: uniqSorted(invalidations.filter((row) => row.stance === "SHORT").map((row) => row.evidence_id)),
      causal_families: uniqSorted(rows.map((row) => row.causal_family)),
      correlation_groups: uniqSorted([...correlationGroups]),
      raw_support_count: support.length,
      effective_domain_votes: ["LONG", "SHORT"].includes(state) ? 1 : 0,
    };
    if (support.length > 1) {
      for (const id of support.slice(1).map((row) => row.evidence_id)) suppressed.push(`DOMAIN_COLLAPSED:${domain}:${id}`);
    }
  }

  const directional = Object.entries(domains).filter(([domain]) => DIRECTIONAL_DOMAINS.has(domain));
  const longDomains = directional.filter(([, state]) => state.state === "LONG").map(([domain]) => domain);
  const shortDomains = directional.filter(([, state]) => state.state === "SHORT").map(([domain]) => domain);
  const conflictingDomains = directional.filter(([, state]) => state.state === "CONFLICTING").map(([domain]) => domain);
  const invalidatesLong = Object.values(domains).flatMap((state) => state.invalidates_long_ids);
  const invalidatesShort = Object.values(domains).flatMap((state) => state.invalidates_short_ids);
  const candidateSide = longDomains.length && !shortDomains.length && !conflictingDomains.length
    ? "LONG"
    : shortDomains.length && !longDomains.length && !conflictingDomains.length
      ? "SHORT"
      : null;
  const candidateDomains = candidateSide === "LONG" ? longDomains : candidateSide === "SHORT" ? shortDomains : [];
  const correlationSets = candidateDomains.map((domain) => new Set(domains[domain].correlation_groups));
  let crossDomainCorrelation = false;
  for (let i = 0; i < correlationSets.length; i += 1) {
    for (let j = i + 1; j < correlationSets.length; j += 1) {
      if ([...correlationSets[i]].some((key) => correlationSets[j].has(key))) crossDomainCorrelation = true;
    }
  }
  if (crossDomainCorrelation) blockers.push("CROSS_DOMAIN_CORRELATION_COLLISION");
  const factToDomains = new Map();
  for (const row of usable.filter((item) => item.effect !== "CONTEXT" && DIRECTIONAL_DOMAINS.has(item.causal_domain))) {
    for (const factId of row.fact_ids) {
      if (!factToDomains.has(factId)) factToDomains.set(factId, new Set());
      factToDomains.get(factId).add(row.causal_domain);
    }
  }
  const crossDomainFactReuse = [...factToDomains.entries()].filter(([, domainsForFact]) => domainsForFact.size > 1).map(([factId]) => factId);
  if (crossDomainFactReuse.length) blockers.push(...crossDomainFactReuse.map((factId) => `CROSS_DOMAIN_FACT_REUSE:${factId}`));
  const derivationToDomains = new Map();
  for (const row of usable.filter((item) => item.effect !== "CONTEXT" && DIRECTIONAL_DOMAINS.has(item.causal_domain))) {
    if (!derivationToDomains.has(row.lineage_derivation_id)) derivationToDomains.set(row.lineage_derivation_id, new Set());
    derivationToDomains.get(row.lineage_derivation_id).add(row.causal_domain);
  }
  const crossDomainDerivationReuse = [...derivationToDomains.entries()].filter(([, domainsForDerivation]) => domainsForDerivation.size > 1).map(([derivationId]) => derivationId);
  if (crossDomainDerivationReuse.length) blockers.push(...crossDomainDerivationReuse.map((id) => `CROSS_DOMAIN_DERIVATION_REUSE:${id}`));
  const rawObservationToDomains = new Map();
  for (const row of usable.filter((item) => item.effect !== "CONTEXT" && DIRECTIONAL_DOMAINS.has(item.causal_domain))) {
    const rawIdentity = `${row.source_observation_id}:${row.source_payload_digest}`;
    if (!rawObservationToDomains.has(rawIdentity)) rawObservationToDomains.set(rawIdentity, new Set());
    rawObservationToDomains.get(rawIdentity).add(row.causal_domain);
  }
  const crossDomainRawObservationReuse = [...rawObservationToDomains.entries()]
    .filter(([, domainsForObservation]) => domainsForObservation.size > 1)
    .map(([rawIdentity]) => rawIdentity);
  if (crossDomainRawObservationReuse.length) blockers.push(...crossDomainRawObservationReuse.map((id) => `CROSS_DOMAIN_RAW_OBSERVATION_REUSE:${id}`));
  const payloadDigestToDomains = new Map();
  for (const row of usable.filter((item) => item.effect !== "CONTEXT" && DIRECTIONAL_DOMAINS.has(item.causal_domain))) {
    if (!payloadDigestToDomains.has(row.source_payload_digest)) payloadDigestToDomains.set(row.source_payload_digest, new Set());
    payloadDigestToDomains.get(row.source_payload_digest).add(row.causal_domain);
  }
  const crossDomainPayloadDigestReuse = [...payloadDigestToDomains.entries()]
    .filter(([, domainsForDigest]) => domainsForDigest.size > 1)
    .map(([payloadDigest]) => payloadDigest)
    .sort();
  if (crossDomainPayloadDigestReuse.length) blockers.push(...crossDomainPayloadDigestReuse.map((payloadDigest) => `CROSS_DOMAIN_SOURCE_PAYLOAD_DIGEST_REUSE:${payloadDigest}`));
  const sourceRootToDomains = new Map();
  for (const row of usable.filter((item) => item.effect !== "CONTEXT" && DIRECTIONAL_DOMAINS.has(item.causal_domain))) {
    const sourceRoot = stableJson(canonicalSourceRoot(row.source, row.venue, row.metric, row.source_ts));
    if (!sourceRootToDomains.has(sourceRoot)) sourceRootToDomains.set(sourceRoot, new Set());
    sourceRootToDomains.get(sourceRoot).add(row.causal_domain);
  }
  const crossDomainSourceRootReuse = [...sourceRootToDomains.entries()]
    .filter(([, domainsForRoot]) => domainsForRoot.size > 1)
    .map(([sourceRoot]) => fnv1a64(sourceRoot))
    .sort();
  if (crossDomainSourceRootReuse.length) blockers.push(...crossDomainSourceRootReuse.map((rootDigest) => `CROSS_DOMAIN_SOURCE_ROOT_REUSE:${rootDigest}`));

  const hasPriceAction = candidateDomains.includes("PRICE_ACTION");
  const hasNonPriceConfirmation = candidateDomains.some((domain) => domain !== "PRICE_ACTION");
  const evidenceIntegrityBlocked = blockers.some((reason) => (
    EVIDENCE_LINEAGE_BLOCKING_REASONS.has(reason) ||
    reason.startsWith("EVIDENCE_ID_CONFLICT") ||
    reason.startsWith("OBSERVATION_IDENTITY_CONFLICT") ||
    reason === "SOURCE_OBSERVATION_ID_DIGEST_CONFLICT" ||
    reason === "EVIDENCE_ROW_LIMIT_EXCEEDED"
  ));
  let independenceState = "INSUFFICIENT";
  if (errors.length || evidenceIntegrityBlocked) independenceState = "BLOCKED";
  else if (conflictingDomains.length || (longDomains.length && shortDomains.length)) independenceState = "CONFLICTING";
  else if (crossDomainCorrelation || crossDomainFactReuse.length || crossDomainDerivationReuse.length || crossDomainRawObservationReuse.length || crossDomainPayloadDigestReuse.length || crossDomainSourceRootReuse.length) independenceState = "CORRELATED";
  else if (hasPriceAction && hasNonPriceConfirmation) independenceState = "CLOSED";
  else if (candidateDomains.length) independenceState = "PARTIAL";

  return {
    input_count: inputRows.length,
    normalized,
    usable,
    domains,
    long_domains: longDomains,
    short_domains: shortDomains,
    conflicting_domains: conflictingDomains,
    candidate_side: candidateSide,
    candidate_domains: candidateDomains,
    has_price_action: hasPriceAction,
    has_non_price_confirmation: hasNonPriceConfirmation,
    cross_domain_correlation: crossDomainCorrelation,
    cross_domain_fact_reuse: uniqSorted(crossDomainFactReuse),
    cross_domain_derivation_reuse: uniqSorted(crossDomainDerivationReuse),
    cross_domain_raw_observation_reuse: uniqSorted(crossDomainRawObservationReuse),
    cross_domain_payload_digest_reuse: uniqSorted(crossDomainPayloadDigestReuse),
    invalidates_long_ids: uniqSorted(invalidatesLong),
    invalidates_short_ids: uniqSorted(invalidatesShort),
    independence_state: independenceState,
    errors: uniqSorted(errors),
    blockers: uniqSorted(blockers),
    missing: uniqSorted(missing),
    suppressed: uniqSorted(suppressed),
    registry_receipt_id: validSafeId(registryReceiptId, 256) ? registryReceiptId : null,
    registry_content_digest: validDigest(registry?.content_digest) ? registry.content_digest : null,
    registry_committed_ts: timestamp(registry?.persistence?.committed_ts),
  };
}

function fullEvidenceRawObservationDigest(row, contract, snapshotId) {
  return fnv1a64(stableJson([
    contract,
    snapshotId,
    text(row?.source),
    text(row?.venue),
    text(row?.metric),
    timestamp(row?.source_ts),
    timestamp(row?.available_ts),
    timestamp(row?.valid_until_ts),
    integer(row?.max_age_sec),
    evidenceScalar(row?.value),
    finite(row?.coverage_pct),
  ]));
}

function fullEvidenceRegistryProjection(row) {
  return {
    chain: upper(row?.chain),
    source_observation_id: text(row?.source_observation_id),
    source_payload_digest: text(row?.source_payload_digest),
    source: text(row?.source),
    venue: text(row?.venue),
    metric: text(row?.metric),
    source_ts: timestamp(row?.source_ts),
    available_ts: timestamp(row?.available_ts),
    valid_until_ts: timestamp(row?.valid_until_ts),
    max_age_sec: integer(row?.max_age_sec),
    producer_rules_version: text(row?.producer_rules_version),
    safety_gate_receipt_id: text(row?.safety_gate_receipt_id) || null,
  };
}

function immutableObjectReceipt(value, label, observedTs, minimumCommitTs = null) {
  const blockers = [];
  const missing = [];
  const persistence = value?.persistence;
  const material = value && typeof value === "object" ? { ...value } : null;
  if (material) delete material.persistence;
  const contentDigest = material ? fnv1a64(stableJson(material)) : null;
  if (!persistence || typeof persistence !== "object") missing.push(`${label}_PERSISTENCE_RECEIPT_MISSING`);
  else {
    if (upper(persistence?.status) !== "CLOSED") missing.push(`${label}_PERSISTENCE_NOT_CLOSED`);
    if (!validSafeId(persistence?.receipt_id, 256) || !validDigest(persistence?.content_digest) || persistence.content_digest !== contentDigest) blockers.push(`${label}_PERSISTENCE_RECEIPT_INVALID`);
    const committedTs = timestamp(persistence?.committed_ts);
    if (committedTs === null || committedTs > observedTs) blockers.push(`${label}_PERSISTENCE_COMMIT_TIME_INVALID`);
    if (committedTs !== null && minimumCommitTs !== null && committedTs < minimumCommitTs) blockers.push(`${label}_PERSISTENCE_PRECEDES_MATERIAL`);
    if (persistence?.immutable !== true || persistence?.verification_method !== "D1_IMMUTABLE_RECEIPT") missing.push(`${label}_PERSISTENCE_IMMUTABILITY_NOT_PROVEN`);
  }
  return {
    quality: blockers.length ? "BLOCKED" : missing.length ? "INSUFFICIENT" : "CLOSED",
    receipt_id: validSafeId(persistence?.receipt_id, 256) ? text(persistence.receipt_id) : null,
    content_digest: validDigest(persistence?.content_digest) ? persistence.content_digest : null,
    committed_ts: timestamp(persistence?.committed_ts),
    blockers: uniqSorted(blockers),
    missing: uniqSorted(missing),
  };
}

function analyzeFullEvidence(full, contract, observedTs, snapshotId, safetyReceipt) {
  const blockers = [];
  const missing = [];
  const advisoryMissing = [];
  const conflicts = [];
  if (!full || typeof full !== "object") {
    return { quality: "INSUFFICIENT", execution_claim: false, blockers, missing: ["FULL_EVIDENCE_MISSING"], advisory_missing: [], conflicts, strict_chain_status: {}, strictly_usable_rows: [] };
  }
  const persistenceReceipt = immutableObjectReceipt(full, "FULL_EVIDENCE", observedTs, timestamp(full?.source_registry?.persistence?.committed_ts));
  blockers.push(...persistenceReceipt.blockers);
  missing.push(...persistenceReceipt.missing);
  const fullContract = normalizedContract(full?.contract);
  if (fullContract.error || fullContract.value !== contract) blockers.push("FULL_EVIDENCE_CONTRACT_MISMATCH");
  if (full?.contract_code !== undefined) {
    const aliasContract = normalizedContract(full.contract_code);
    if (aliasContract.error || aliasContract.value !== fullContract.value) blockers.push("FULL_EVIDENCE_CONTRACT_ALIAS_CONFLICT");
  }
  if (!validSafeId(full?.snapshot_id) || text(full.snapshot_id) !== snapshotId) blockers.push("FULL_EVIDENCE_SNAPSHOT_MISMATCH");
  if (upper(full?.persistence?.status) !== "CLOSED") missing.push("FULL_EVIDENCE_PERSISTENCE_NOT_CLOSED");
  if (full?.schema_version !== "full-evidence-shadow-v1") blockers.push("FULL_EVIDENCE_SCHEMA_VERSION_UNSUPPORTED");
  const fullObservedTs = timestamp(full?.observed_ts);
  if (fullObservedTs === null) missing.push("FULL_EVIDENCE_OBSERVED_TS_MISSING");
  else if (fullObservedTs !== observedTs) blockers.push(fullObservedTs > observedTs ? "FULL_EVIDENCE_FROM_FUTURE" : "FULL_EVIDENCE_SNAPSHOT_TIME_MISMATCH");
  const topStatus = upper(full?.data_quality?.status);
  if (full?.decision?.dq_status !== undefined && upper(full.decision.dq_status) !== topStatus) blockers.push("FULL_EVIDENCE_DQ_ALIAS_CONFLICT");
  if (!Array.isArray(full?.conflicts)) missing.push("FULL_EVIDENCE_CONFLICTS_CONTRACT_MISSING");
  const unresolved = Array.isArray(full?.conflicts) ? full.conflicts.filter((row) => row?.unresolved !== false) : [];
  if (unresolved.length) conflicts.push("FULL_EVIDENCE_UNRESOLVED_CONFLICT");

  if (full?.evidence !== undefined) blockers.push("FULL_EVIDENCE_LEGACY_ROWS_ALIAS_FORBIDDEN");
  const rawRows = Array.isArray(full?.evidence_compact) ? full.evidence_compact : [];
  const rowsOverflow = rawRows.length > MAX_FULL_EVIDENCE_ROWS;
  const rows = rawRows.slice(0, MAX_FULL_EVIDENCE_ROWS);
  const sourceRegistry = full?.source_registry;
  const sourceRegistryReceiptId = validSafeId(sourceRegistry?.receipt_id, 256) ? sourceRegistry.receipt_id : "";
  const sourceRegistryCommittedTs = timestamp(sourceRegistry?.persistence?.committed_ts);
  const rawSourceRegistryEntries = Array.isArray(sourceRegistry?.entries) ? sourceRegistry.entries : [];
  const sourceRegistryEntriesOverflow = rawSourceRegistryEntries.length > MAX_FULL_EVIDENCE_ROWS;
  const sourceRegistryEntries = rawSourceRegistryEntries.slice(0, MAX_FULL_EVIDENCE_ROWS);
  const sourceRegistryContentDigest = Array.isArray(sourceRegistry?.entries) && !sourceRegistryEntriesOverflow
    ? fnv1a64(stableJson([...sourceRegistryEntries].sort((a, b) => text(a?.source_observation_id).localeCompare(text(b?.source_observation_id)))))
    : null;
  if (!sourceRegistry || typeof sourceRegistry !== "object") missing.push("FULL_EVIDENCE_SOURCE_REGISTRY_MISSING");
  else {
    if (sourceRegistry?.schema_version !== FULL_EVIDENCE_SOURCE_REGISTRY_VERSION) blockers.push("FULL_EVIDENCE_SOURCE_REGISTRY_VERSION_MISMATCH");
    if (upper(sourceRegistry?.status) !== "CLOSED" || sourceRegistry?.authoritative !== true) missing.push("FULL_EVIDENCE_SOURCE_REGISTRY_NOT_CLOSED");
    if (!validSafeId(sourceRegistry?.receipt_id, 256) || sourceRegistry?.persistence?.receipt_id !== sourceRegistryReceiptId) blockers.push("FULL_EVIDENCE_SOURCE_REGISTRY_RECEIPT_INVALID");
    if (!validDigest(sourceRegistry?.content_digest) || sourceRegistry.content_digest !== sourceRegistryContentDigest || !validDigest(sourceRegistry?.persistence?.content_digest) || sourceRegistry.persistence.content_digest !== sourceRegistryContentDigest) blockers.push("FULL_EVIDENCE_SOURCE_REGISTRY_CONTENT_DIGEST_INVALID");
    if (upper(sourceRegistry?.persistence?.status) !== "CLOSED" || sourceRegistry?.persistence?.immutable !== true || sourceRegistry?.persistence?.verification_method !== "D1_IMMUTABLE_RECEIPT") missing.push("FULL_EVIDENCE_SOURCE_REGISTRY_IMMUTABILITY_NOT_PROVEN");
    if (sourceRegistryCommittedTs === null || sourceRegistryCommittedTs > observedTs) blockers.push("FULL_EVIDENCE_SOURCE_REGISTRY_COMMIT_TIME_INVALID");
    const latestSourceAvailableTs = Math.max(0, ...rows.map((row) => timestamp(row?.available_ts) ?? 0));
    if (sourceRegistryCommittedTs !== null && sourceRegistryCommittedTs < latestSourceAvailableTs) blockers.push("FULL_EVIDENCE_SOURCE_REGISTRY_PRECEDES_SOURCE_AVAILABILITY");
    if (!Array.isArray(sourceRegistry?.entries) || rawSourceRegistryEntries.length !== rawRows.length || sourceRegistryEntriesOverflow) blockers.push("FULL_EVIDENCE_SOURCE_REGISTRY_ENTRIES_INVALID");
    const registryByObservation = new Map();
    for (const entry of sourceRegistryEntries) {
      const id = text(entry?.source_observation_id);
      if (!validSafeId(id, 256) || registryByObservation.has(id)) blockers.push(`FULL_EVIDENCE_SOURCE_REGISTRY_ID_INVALID_OR_DUPLICATE:${id || "UNKNOWN"}`);
      else registryByObservation.set(id, entry);
    }
    for (const row of rows) {
      const entry = registryByObservation.get(text(row?.source_observation_id));
      if (!entry || stableJson(entry) !== stableJson(fullEvidenceRegistryProjection(row))) blockers.push(`FULL_EVIDENCE_SOURCE_REGISTRY_ROW_MISMATCH:${text(row?.source_observation_id) || "UNKNOWN"}`);
    }
  }
  const htxSafetyRows = rows.filter((row) => upper(row?.chain) === "HTX_EXECUTION" && row?.eligible_for_chain_closure === true);
  if (htxSafetyRows.length) {
    if (safetyReceipt?.quality !== "CLOSED") missing.push("FULL_EVIDENCE_SAFETY_GATE_RECEIPT_NOT_CLOSED");
    if (htxSafetyRows.some((row) => text(row?.safety_gate_receipt_id) !== safetyReceipt?.receipt_id)) blockers.push("FULL_EVIDENCE_HTX_SAFETY_RECEIPT_LINK_INVALID");
    const safetyCommittedTs = timestamp(safetyReceipt?.committed_ts);
    if (safetyCommittedTs !== null && sourceRegistryCommittedTs !== null && sourceRegistryCommittedTs < safetyCommittedTs) blockers.push("FULL_EVIDENCE_SOURCE_REGISTRY_PRECEDES_SAFETY_GATE_RECEIPT");
    if (safetyCommittedTs !== null && persistenceReceipt.committed_ts !== null && persistenceReceipt.committed_ts < safetyCommittedTs) blockers.push("FULL_EVIDENCE_PERSISTENCE_PRECEDES_SAFETY_GATE_RECEIPT");
  }
  if (!rows.length) missing.push("FULL_EVIDENCE_ROWS_MISSING");
  if (!Array.isArray(full?.evidence_compact)) missing.push("FULL_EVIDENCE_ROWS_CONTRACT_MISSING");
  const strictRowUsable = (row, expectedChain = null) => {
    const rowContract = normalizedContract(row?.contract_code);
    const rowSourceTs = timestamp(row?.source_ts);
    const rowAvailableTs = timestamp(row?.available_ts);
    const rowValidUntilTs = timestamp(row?.valid_until_ts);
    const maxAgeSec = integer(row?.max_age_sec);
    const calculatedValidUntil = rowSourceTs !== null && maxAgeSec !== null
      ? rowSourceTs + maxAgeSec * 1000
      : null;
    const valueTypeOk = row?.value !== null && row?.value !== undefined &&
      !((typeof row.value === "number" && !Number.isFinite(row.value)) || typeof row.value === "object");
    const sourceFactIds = Array.isArray(row?.source_fact_ids) ? row.source_fact_ids : [];
    return (
      (!expectedChain || upper(row?.chain) === expectedChain) &&
      validSafeId(row?.snapshot_id) && text(row.snapshot_id) === snapshotId &&
      rowContract.error === null && rowContract.value === contract &&
      validIdentifier(row?.source, 160) && validIdentifier(row?.venue, 160) && validIdentifier(row?.metric, 160) &&
      validSafeId(row?.source_observation_id, 256) &&
      validDigest(row?.source_payload_digest) &&
      text(row?.source_payload_digest) === fullEvidenceRawObservationDigest(row, contract, snapshotId) &&
      validSafeId(row?.source_receipt_id, 256) && text(row?.source_receipt_id) === sourceRegistryReceiptId &&
      upper(row?.metric_semantics) === FULL_CHAIN_SEMANTICS[upper(row?.chain)] &&
      upper(row?.source_kind) === FULL_CHAIN_SOURCE_KIND[upper(row?.chain)] &&
      row?.producer_rules_version === "full-evidence-source-producer-v1" &&
      (upper(row?.chain) !== "HTX_EXECUTION" || (safetyReceipt?.quality === "CLOSED" && text(row?.safety_gate_receipt_id) === safetyReceipt?.receipt_id)) &&
      upper(row?.status) === "CLOSED" &&
      row?.eligible_for_chain_closure === true &&
      rowSourceTs !== null && rowSourceTs <= observedTs &&
      rowAvailableTs !== null && rowAvailableTs >= rowSourceTs && rowAvailableTs <= observedTs &&
      maxAgeSec !== null && maxAgeSec > 0 && maxAgeSec <= MAX_FULL_EVIDENCE_AGE_SEC &&
      fullEvidenceFreshnessCapSec(row) !== null && maxAgeSec <= fullEvidenceFreshnessCapSec(row) &&
      Number.isSafeInteger(calculatedValidUntil) && rowValidUntilTs === calculatedValidUntil &&
      observedTs <= rowValidUntilTs &&
      finite(row?.coverage_pct) !== null && row.coverage_pct > 0 && row.coverage_pct <= 100 &&
      row?.symbol_verified === true &&
      row?.source_compatible === true &&
      (row?.alias_required !== true || (row?.alias_verified === true && row?.asset_identity_verified === true)) &&
      validSafeId(row?.primary_market_id, 256) &&
      validSafeId(row?.independence_group, 160) &&
      sourceFactIds.length > 0 && sourceFactIds.length <= 16 &&
      sourceFactIds.every((factId) => validSafeId(factId, 256)) &&
      valueTypeOk && !row?.error
    );
  };
  for (const row of rows) {
    const status = upper(row?.status);
    const rowSourceTs = timestamp(row?.source_ts);
    const rowAvailableTs = timestamp(row?.available_ts);
    const maxAgeSec = integer(row?.max_age_sec);
    const rowValidUntilTs = timestamp(row?.valid_until_ts);
    const rowContract = normalizedContract(row?.contract_code);
    const metric = text(row?.metric) || "UNKNOWN";
    if (["CONFLICT", "CONFLICTING"].includes(status)) conflicts.push(`RAW_EVIDENCE_CONFLICT:${text(row?.metric) || "UNKNOWN"}`);
    if (status === "FUTURE") blockers.push(`RAW_EVIDENCE_FUTURE:${metric}`);
    if (rowContract.error || rowContract.value !== contract) blockers.push(`RAW_EVIDENCE_CONTRACT_MISMATCH:${metric}`);
    if (rowSourceTs !== null && rowSourceTs > observedTs) blockers.push(`RAW_EVIDENCE_FUTURE_SOURCE_TS:${metric}`);
    if (rowAvailableTs !== null && rowAvailableTs > observedTs) blockers.push(`RAW_EVIDENCE_LOOKAHEAD_AVAILABLE_TS:${metric}`);
    if (rowSourceTs !== null && rowAvailableTs !== null && rowAvailableTs < rowSourceTs) blockers.push(`RAW_EVIDENCE_AVAILABLE_BEFORE_SOURCE:${metric}`);
    if (rowValidUntilTs !== null && rowValidUntilTs < observedTs) missing.push(`REQUIRED_RAW_EVIDENCE_STALE_VALID_UNTIL:${metric}`);
    if (maxAgeSec !== null && maxAgeSec > MAX_FULL_EVIDENCE_AGE_SEC) blockers.push(`RAW_EVIDENCE_FRESHNESS_POLICY_UNBOUNDED:${metric}`);
    if (maxAgeSec !== null && fullEvidenceFreshnessCapSec(row) !== null && maxAgeSec > fullEvidenceFreshnessCapSec(row)) missing.push(`RAW_EVIDENCE_CHAIN_FRESHNESS_POLICY_EXCEEDED:${metric}`);
    if (status === "SOURCE_INCOMPATIBLE" || row?.source_compatible !== true) blockers.push(`RAW_EVIDENCE_SOURCE_INCOMPATIBLE:${metric}`);
    if (typeof row?.value === "number" && !Number.isFinite(row.value)) blockers.push(`RAW_EVIDENCE_NONFINITE_VALUE:${metric}`);
    if (row?.eligible_for_chain_closure === true && ["PARTIAL", "NOT_CLOSED", "STALE", "MISSING", "UNSUPPORTED"].includes(status)) {
      missing.push(`REQUIRED_RAW_EVIDENCE_${status}:${metric}`);
    }
    if (row?.eligible_for_chain_closure === true && rowAvailableTs === null) missing.push(`REQUIRED_RAW_EVIDENCE_AVAILABLE_TS_MISSING:${metric}`);
    if (row?.eligible_for_chain_closure === true && rowSourceTs === null) missing.push(`REQUIRED_RAW_EVIDENCE_SOURCE_TS_MISSING:${metric}`);
    if (row?.eligible_for_chain_closure === true && !strictRowUsable(row)) missing.push(`REQUIRED_RAW_EVIDENCE_NOT_STRICTLY_USABLE:${metric}`);
    if (
      row?.eligible_for_chain_closure === true && rowSourceTs !== null && maxAgeSec !== null &&
      observedTs - rowSourceTs > maxAgeSec * 1000
    ) missing.push(`REQUIRED_RAW_EVIDENCE_STALE_BY_AGE:${metric}`);
  }
  if (rowsOverflow) blockers.push("FULL_EVIDENCE_ROW_LIMIT_EXCEEDED");

  const declared = full?.chain_status || {};
  if (!full?.chain_status || typeof full.chain_status !== "object" || Array.isArray(full.chain_status)) missing.push("FULL_EVIDENCE_CHAIN_STATUS_CONTRACT_MISSING");
  const strict = {};
  const eligibleByChain = new Map();
  for (const chain of REQUIRED_WEIGHTED_CHAINS) {
    const eligible = rows.filter((row) => strictRowUsable(row, chain));
    eligibleByChain.set(chain, eligible);
    const declaredClosed = declared?.[chain]?.chain_closed === true;
    strict[chain] = { declared_closed: declaredClosed, eligible_rows: eligible.length, closed: declaredClosed && eligible.length > 0 };
    if (!strict[chain].closed) {
      const code = `WEIGHTED_CHAIN_NOT_STRICTLY_CLOSED:${chain}`;
      if (SUPPORTING_FULL_CHAINS.has(chain)) advisoryMissing.push(code);
      else missing.push(code);
    }
  }
  const criticalFullChainsClosed = ENTRY_CRITICAL_FULL_CHAINS.every((chain) => strict?.[chain]?.closed === true);
  const declaredMissing = Array.isArray(full?.missing_weighted_chains) ? full.missing_weighted_chains : [];
  const declaredMissingNormalized = declaredMissing.map((chain) => upper(chain)).filter(Boolean);
  const supportingOnlyDeclaredGap = declaredMissingNormalized.length > 0 &&
    declaredMissingNormalized.every((chain) => SUPPORTING_FULL_CHAINS.has(chain));
  if (topStatus !== "CLOSED") {
    const code = `FULL_EVIDENCE_DQ_${topStatus || "MISSING"}`;
    if (criticalFullChainsClosed && supportingOnlyDeclaredGap && ["PARTIAL", "NOT_CLOSED", "INSUFFICIENT"].includes(topStatus)) advisoryMissing.push(`${code}:SUPPORTING_ONLY_GAPS`);
    else if (["BLOCKED", "CONFLICT", "CONFLICTING", "FUTURE"].includes(topStatus)) blockers.push(code);
    else missing.push(code);
  }
  if (!Array.isArray(full?.missing_weighted_chains)) missing.push("FULL_EVIDENCE_MISSING_CHAIN_CONTRACT_MISSING");
  for (const rawChain of declaredMissing) {
    const chain = upper(rawChain);
    const code = `DECLARED_MISSING_CHAIN:${chain || rawChain}`;
    if (SUPPORTING_FULL_CHAINS.has(chain)) advisoryMissing.push(code);
    else missing.push(code);
  }

  const crossChainOwners = (selector, code) => {
    const owners = new Map();
    const identityEligibleByLane = new Map(eligibleByChain);
    identityEligibleByLane.set("HTX_EXECUTION", rows.filter((row) => strictRowUsable(row, "HTX_EXECUTION")));
    for (const [chain, chainRows] of identityEligibleByLane.entries()) {
      for (const row of chainRows) {
        for (const identity of selector(row)) {
          if (!owners.has(identity)) owners.set(identity, new Set());
          owners.get(identity).add(chain);
        }
      }
    }
    for (const [identity, chains] of owners.entries()) {
      if (chains.size > 1) blockers.push(`${code}:${identity}`);
    }
  };
  crossChainOwners((row) => [text(row?.independence_group)], "FULL_EVIDENCE_CROSS_CHAIN_GROUP_REUSE");
  crossChainOwners((row) => Array.isArray(row?.source_fact_ids) ? row.source_fact_ids : [], "FULL_EVIDENCE_CROSS_CHAIN_FACT_REUSE");
  crossChainOwners((row) => [text(row?.primary_market_id)], "FULL_EVIDENCE_CROSS_CHAIN_MARKET_REUSE");
  crossChainOwners((row) => [text(row?.source_observation_id)], "FULL_EVIDENCE_CROSS_CHAIN_RAW_OBSERVATION_REUSE");
  crossChainOwners((row) => [text(row?.source_payload_digest)], "FULL_EVIDENCE_CROSS_CHAIN_RAW_DIGEST_REUSE");
  crossChainOwners((row) => [fnv1a64(stableJson(canonicalSourceRoot(
    text(row?.source), text(row?.venue), text(row?.metric), timestamp(row?.source_ts),
  )))], "FULL_EVIDENCE_CROSS_CHAIN_SOURCE_ROOT_REUSE");

  const htxExecutionRows = rows.filter((row) => (
    strictRowUsable(row, "HTX_EXECUTION") &&
    text(row?.metric) === "execution_gate_status" && row?.value === 1 &&
    upper(row?.source) === "HTX_EXECUTION_GATE" && upper(row?.venue) === "HTX"
    && text(row?.safety_gate_receipt_id) === safetyReceipt?.receipt_id
  ));
  if (full?.htx_execution_gate_closed === true && htxExecutionRows.length !== 1) missing.push("HTX_EXECUTION_GATE_ROW_NOT_STRICTLY_CLOSED");
  let quality = "CLOSED";
  if (blockers.length || conflicts.length) quality = "BLOCKED";
  else if (missing.length) quality = "INSUFFICIENT";
  return {
    quality,
    execution_claim: full?.htx_execution_gate_closed === true && htxExecutionRows.length === 1,
    // Cross-plane identity integrity applies to every Full Evidence row that
    // actually closes a lane. HTX_EXECUTION is not a directional vote, but its
    // raw observation identity still must not conflict with decision evidence.
    strictly_usable_rows: rows.filter((row) => strictRowUsable(row)),
    blockers: uniqSorted(blockers),
    missing: uniqSorted(missing),
    advisory_missing: uniqSorted(advisoryMissing),
    conflicts: uniqSorted(conflicts),
    strict_chain_status: strict,
    persistence_receipt: persistenceReceipt,
  };
}

function analyzeCrossPlaneEvidenceReuse(evidenceAnalysis, fullAnalysis) {
  const decisionRows = (evidenceAnalysis?.usable || []).filter((row) => (
    row?.effect !== "CONTEXT"
  ));
  const fullRows = fullAnalysis?.strictly_usable_rows || [];
  const reports = [];

  const intersectOwners = (kind, decisionIdentities, fullIdentities) => {
    const decisionOwners = new Map();
    const fullOwners = new Map();
    const identities = new Map();
    for (const row of decisionRows) {
      for (const identity of decisionIdentities(row)) {
        if (identity === null || identity === undefined || identity === "") continue;
        const key = stableJson(identity);
        identities.set(key, identity);
        if (!decisionOwners.has(key)) decisionOwners.set(key, new Set());
        decisionOwners.get(key).add(row.evidence_id);
      }
    }
    for (const row of fullRows) {
      for (const identity of fullIdentities(row)) {
        if (identity === null || identity === undefined || identity === "") continue;
        const key = stableJson(identity);
        identities.set(key, identity);
        if (!fullOwners.has(key)) fullOwners.set(key, new Set());
        fullOwners.get(key).add(row.source_observation_id);
      }
    }
    for (const key of [...decisionOwners.keys()].filter((candidate) => fullOwners.has(candidate)).sort()) {
      const decisionIds = [...decisionOwners.get(key)].sort();
      const fullObservationIds = [...fullOwners.get(key)].sort();
      reports.push({
        kind,
        identity: identities.get(key),
        identity_digest: fnv1a64(key),
        decision_evidence_ids: decisionIds.slice(0, MAX_CROSS_PLANE_IDS_PER_REPORT),
        full_evidence_observation_ids: fullObservationIds.slice(0, MAX_CROSS_PLANE_IDS_PER_REPORT),
        decision_evidence_count: decisionIds.length,
        full_evidence_observation_count: fullObservationIds.length,
        detail_truncated: decisionIds.length > MAX_CROSS_PLANE_IDS_PER_REPORT || fullObservationIds.length > MAX_CROSS_PLANE_IDS_PER_REPORT,
      });
    }
  };

  intersectOwners("SOURCE_OBSERVATION_ID", (row) => [row.source_observation_id], (row) => [text(row?.source_observation_id)]);
  intersectOwners("SOURCE_PAYLOAD_DIGEST", (row) => [row.source_payload_digest], (row) => [text(row?.source_payload_digest)]);
  intersectOwners("SOURCE_FACT_ID", (row) => row.fact_ids || [], (row) => Array.isArray(row?.source_fact_ids) ? row.source_fact_ids : []);
  intersectOwners(
    "SOURCE_ROOT",
    (row) => [canonicalSourceRoot(row.source, row.venue, row.metric, row.source_ts)],
    (row) => [canonicalSourceRoot(text(row?.source), text(row?.venue), text(row?.metric), timestamp(row?.source_ts))],
  );

  reports.sort((a, b) => a.kind.localeCompare(b.kind) || a.identity_digest.localeCompare(b.identity_digest));
  const boundedReports = reports.slice(0, MAX_CROSS_PLANE_REUSE_REPORTS);
  const reportTruncated = reports.length > MAX_CROSS_PLANE_REUSE_REPORTS;
  const allReuseDigest = fnv1a64(stableJson({
    total_reuse_count: reports.length,
    report_truncated: reportTruncated,
    reports: boundedReports,
  }));
  const reasonCodes = [
    ...boundedReports.map((report) => `CROSS_PLANE_${report.kind}_REUSE:${report.identity_digest}`),
    ...(reportTruncated ? ["CROSS_PLANE_REUSE_REPORT_TRUNCATED"] : []),
  ];
  return {
    state: reports.length ? "CORRELATED" : "CLOSED",
    total_reuse_count: reports.length,
    all_reuse_digest: allReuseDigest,
    report_truncated: reportTruncated,
    reports: boundedReports,
    reason_codes: uniqSorted(reasonCodes, MAX_EXPLANATION_ITEMS),
  };
}

function analyzeOpportunity(opportunity, contract, observedTs, snapshotId) {
  const blockers = [];
  const missing = [];
  if (!opportunity || typeof opportunity !== "object") return { quality: "INSUFFICIENT", blockers, missing: ["OPPORTUNITY_MISSING"], event: null };
  const opportunityMinCommit = Math.max(
    timestamp(opportunity?.newest_event?.event_close_ts) ?? 0,
    timestamp(opportunity?.control_group_receipt?.persistence?.committed_ts) ?? 0,
    timestamp(opportunity?.direction_receipt?.persistence?.committed_ts) ?? 0,
  );
  const persistenceReceipt = immutableObjectReceipt(opportunity, "OPPORTUNITY", observedTs, opportunityMinCommit || null);
  blockers.push(...persistenceReceipt.blockers);
  missing.push(...persistenceReceipt.missing);
  const c = normalizedContract(opportunity?.contract);
  if (c.error || c.value !== contract) blockers.push("OPPORTUNITY_CONTRACT_MISMATCH");
  if (!validSafeId(opportunity?.snapshot_id) || text(opportunity.snapshot_id) !== snapshotId) blockers.push("OPPORTUNITY_SNAPSHOT_MISMATCH");
  if (upper(opportunity?.persistence?.status) !== "CLOSED") missing.push("OPPORTUNITY_PERSISTENCE_NOT_CLOSED");
  if (!["opportunity-integrity-shadow-v1", "opportunity-integrity-shadow-v2-full-event"].includes(opportunity?.schema_version)) blockers.push("OPPORTUNITY_SCHEMA_VERSION_UNSUPPORTED");
  const opportunityObservedTs = timestamp(opportunity?.observed_ts);
  if (opportunityObservedTs === null) missing.push("OPPORTUNITY_OBSERVED_TS_MISSING");
  else if (opportunityObservedTs !== observedTs) blockers.push("OPPORTUNITY_SNAPSHOT_TIME_MISMATCH");
  const status = upper(opportunity?.status);
  if (status !== "OK") {
    if (["CONFLICT", "CONFLICTING", "FUTURE"].includes(status)) blockers.push(`OPPORTUNITY_${status}`);
    else missing.push(`OPPORTUNITY_${status || "STATUS_MISSING"}`);
  }
  const event = opportunity?.newest_event || null;
  if (!event) missing.push("ADMITTED_OPPORTUNITY_EVENT_MISSING");
  if (event) {
    if (!validSafeId(event?.event_id, 512)) blockers.push("OPPORTUNITY_EVENT_ID_INVALID");
    if (!validSafeId(opportunity?.admitted_event_id, 512) || opportunity.admitted_event_id !== event?.event_id) blockers.push("OPPORTUNITY_ADMISSION_LINK_MISMATCH");
    if (event?.control_group === true) blockers.push("CONTROL_GROUP_EVENT_FORBIDDEN");
    else if (event?.control_group !== false) missing.push("CONTROL_GROUP_MEMBERSHIP_UNKNOWN");
    if (event?.control_group_membership_verified !== true) missing.push("CONTROL_GROUP_MEMBERSHIP_NOT_VERIFIED");
    if (event?.admission_eligible !== true) missing.push("OPPORTUNITY_EVENT_NOT_ADMISSION_ELIGIBLE");
    if (!validSafeId(event?.control_group_assignment_id, 256)) missing.push("CONTROL_GROUP_ASSIGNMENT_PROVENANCE_MISSING");
    const controlReceipt = opportunity?.control_group_receipt;
    if (!controlReceipt || typeof controlReceipt !== "object") missing.push("CONTROL_GROUP_ASSIGNMENT_RECEIPT_MISSING");
    else {
      if (controlReceipt?.schema_version !== "control-group-assignment-receipt-v1" || upper(controlReceipt?.status) !== "CLOSED" || controlReceipt?.authoritative !== true) missing.push("CONTROL_GROUP_ASSIGNMENT_RECEIPT_NOT_CLOSED");
      if (!validSafeId(controlReceipt?.assignment_id, 256) || controlReceipt.assignment_id !== event?.control_group_assignment_id || !validSafeId(controlReceipt?.event_id, 512) || controlReceipt.event_id !== event?.event_id || !validSafeId(controlReceipt?.episode_id, 256) || controlReceipt.episode_id !== event?.episode_id || integer(controlReceipt?.episode_revision) !== integer(event?.episode_revision) || controlReceipt?.control_group !== false) blockers.push("CONTROL_GROUP_ASSIGNMENT_RECEIPT_MISMATCH");
      if (controlReceipt?.rules_version !== "opportunity-control-group-v1" || !validSafeId(controlReceipt?.receipt_id, 256) || controlReceipt?.persistence?.receipt_id !== controlReceipt?.receipt_id) blockers.push("CONTROL_GROUP_ASSIGNMENT_RECEIPT_PROVENANCE_INVALID");
      const assignedTs = timestamp(controlReceipt?.assigned_ts);
      const committedTs = timestamp(controlReceipt?.persistence?.committed_ts);
      if (assignedTs === null || committedTs === null || assignedTs > observedTs || committedTs > observedTs || committedTs < assignedTs || committedTs - assignedTs > MAX_RECEIPT_COMMIT_LAG_MS) blockers.push("CONTROL_GROUP_ASSIGNMENT_RECEIPT_TIMELINE_INVALID");
      if (upper(controlReceipt?.persistence?.status) !== "CLOSED" || controlReceipt?.persistence?.immutable !== true || controlReceipt?.persistence?.verification_method !== "D1_IMMUTABLE_RECEIPT") missing.push("CONTROL_GROUP_ASSIGNMENT_RECEIPT_IMMUTABILITY_NOT_PROVEN");
    }
    const eventContract = normalizedContract(event?.contract);
    if (eventContract.error || eventContract.value !== contract) blockers.push("OPPORTUNITY_EVENT_CONTRACT_MISMATCH");
    if (event?.symbol !== undefined) {
      const symbolAlias = normalizedContract(event.symbol);
      if (symbolAlias.error || symbolAlias.value !== eventContract.value) blockers.push("OPPORTUNITY_EVENT_SYMBOL_ALIAS_CONFLICT");
    }
    if (!validSafeId(event?.episode_id, 256)) blockers.push("OPPORTUNITY_EPISODE_ID_INVALID");
    if (integer(event?.episode_revision) === null || integer(event?.episode_revision) < 0) blockers.push("OPPORTUNITY_EPISODE_REVISION_INVALID");
    const eventStatus = upper(event?.data_quality);
    if (event?.status !== undefined && upper(event.status) !== eventStatus) blockers.push("OPPORTUNITY_EVENT_QUALITY_ALIAS_CONFLICT");
    if (eventStatus !== "OK") {
      if (["CONFLICT", "CONFLICTING", "FUTURE"].includes(eventStatus)) blockers.push(`OPPORTUNITY_EVENT_${eventStatus}`);
      else missing.push(`OPPORTUNITY_EVENT_${eventStatus || "QUALITY_MISSING"}`);
    }
    const eventTs = timestamp(event?.timestamp);
    const closeTs = timestamp(event?.event_close_ts);
    if (eventTs === null || closeTs === null || closeTs <= eventTs) blockers.push("INVALID_EVENT_TIMELINE");
    else if (closeTs > observedTs) blockers.push("FUTURE_EVENT_REJECTED");
    const controlAssignedTs = timestamp(opportunity?.control_group_receipt?.assigned_ts);
    if (closeTs !== null && controlAssignedTs !== null && controlAssignedTs > closeTs) blockers.push("CONTROL_GROUP_ASSIGNMENT_RETROSPECTIVE");
    let rawEventDigest = fnv1a64(stableJson([
      text(event?.event_id), text(event?.episode_id), integer(event?.episode_revision),
      normalizedContract(event?.contract).value, eventTs, closeTs,
    ]));
    if (opportunity?.schema_version === "opportunity-integrity-shadow-v2-full-event") {
      // Versioned compatibility; NEVER replace a full-event digest with the
      // legacy six-field digest simply to make a receipt pass validation.
      const raw = opportunity?.source_event_payload;
      const revision = opportunity?.source_event_episode_revision;
      if (!raw || typeof raw !== "object" || Array.isArray(raw) ||
          !Number.isSafeInteger(revision) || revision !== integer(event?.episode_revision) ||
          stableJson(raw).length > 65_536) {
        blockers.push("OPPORTUNITY_FULL_EVENT_WITNESS_INVALID");
        rawEventDigest = null;
      } else {
        rawEventDigest = fnv1a64(stableJson({ episode_revision: revision, event: raw }));
        const rawDirection = upper(raw?.direction_at_event);
        const rawDirectional = raw?.directional_evaluation_eligible === true && ["LONG", "SHORT"].includes(rawDirection);
        const expectedDirection = rawDirectional ? rawDirection : "DIRECTIONLESS_EVENT";
        const requiredEqual = [
          text(raw.event_id) === text(event.event_id),
          raw.episode_revision === undefined || (Number.isSafeInteger(raw.episode_revision) && raw.episode_revision === revision),
          text(raw.episode_id || raw.event_id) === text(event.episode_id),
          normalizedContract(raw.contract).value === contract,
          timestamp(raw.timestamp) === eventTs,
          timestamp(raw.event_close_ts) === closeTs,
          upper(raw.data_quality || "PARTIAL") === upper(event.data_quality),
          raw.control_group === false,
          raw.independent_sample === true,
          event.independent_sample === true,
          expectedDirection === upper(event.direction_at_event),
          rawDirectional === (event.directional_evaluation_eligible === true),
          !rawDirectional || timestamp(raw.direction_locked_ts) === closeTs,
        ];
        // Every raw non-derived field must survive unchanged in the proven
        // event. Only the established producer's explicit derived fields are
        // exempt; their semantics are validated separately in this function.
        const derived = new Set([
          "event_id", "episode_id", "episode_revision", "contract", "timestamp", "event_close_ts",
          "data_quality", "control_group", "control_group_membership_verified", "control_group_assignment_id",
          "admission_eligible", "raw_event_digest", "direction_at_event", "direction_locked_ts",
          "direction_available_ts", "directional_evaluation_eligible", "direction_source",
          "direction_rules_version", "observation_timing",
        ]);
        for (const key of Object.keys(raw)) {
          if (!derived.has(key) && stableJson(raw[key]) !== stableJson(event[key])) requiredEqual.push(false);
        }
        if (requiredEqual.some((ok) => !ok)) blockers.push("OPPORTUNITY_FULL_EVENT_PROJECTION_MISMATCH");
      }
    }
    if (!validDigest(event?.raw_event_digest) || event.raw_event_digest !== rawEventDigest || !validDigest(opportunity?.control_group_receipt?.raw_event_digest) || opportunity.control_group_receipt.raw_event_digest !== rawEventDigest || !validDigest(opportunity?.direction_receipt?.raw_event_digest) || opportunity.direction_receipt.raw_event_digest !== rawEventDigest) blockers.push("OPPORTUNITY_RAW_EVENT_DIGEST_MISMATCH");
    const lockedTs = timestamp(event?.direction_locked_ts);
    const eventDirection = upper(event?.direction_at_event);
    const directionAvailableTs = timestamp(event?.direction_available_ts);
    const directionReceipt = opportunity?.direction_receipt;
    if (!directionReceipt || typeof directionReceipt !== "object") missing.push("EVENT_DIRECTION_RECEIPT_MISSING");
    else {
      if (directionReceipt?.schema_version !== "opportunity-direction-receipt-v1" || upper(directionReceipt?.status) !== "CLOSED" || directionReceipt?.authoritative !== true) missing.push("EVENT_DIRECTION_RECEIPT_NOT_CLOSED");
      if (!validSafeId(directionReceipt?.event_id, 512) || directionReceipt.event_id !== event?.event_id || !validSafeId(directionReceipt?.episode_id, 256) || directionReceipt.episode_id !== event?.episode_id || integer(directionReceipt?.episode_revision) !== integer(event?.episode_revision) || typeof directionReceipt?.direction !== "string" || upper(directionReceipt.direction) !== eventDirection || timestamp(directionReceipt?.direction_locked_ts) !== lockedTs || timestamp(directionReceipt?.direction_available_ts) !== directionAvailableTs) blockers.push("EVENT_DIRECTION_RECEIPT_MISMATCH");
      if (!validSafeId(directionReceipt?.receipt_id, 256) || directionReceipt?.persistence?.receipt_id !== directionReceipt?.receipt_id || directionReceipt?.rules_version !== "opportunity-direction-lock-v1") blockers.push("EVENT_DIRECTION_RECEIPT_PROVENANCE_INVALID");
      const committedTs = timestamp(directionReceipt?.persistence?.committed_ts);
      if (committedTs === null || closeTs === null || committedTs < closeTs || committedTs > closeTs + MAX_RECEIPT_COMMIT_LAG_MS || committedTs > observedTs) blockers.push("EVENT_DIRECTION_RECEIPT_COMMIT_TIME_INVALID");
      if (upper(directionReceipt?.persistence?.status) !== "CLOSED" || directionReceipt?.persistence?.immutable !== true || directionReceipt?.persistence?.verification_method !== "D1_IMMUTABLE_RECEIPT") missing.push("EVENT_DIRECTION_RECEIPT_IMMUTABILITY_NOT_PROVEN");
    }
    if (typeof event?.direction_at_event !== "string" || !["LONG", "SHORT", "DIRECTIONLESS_EVENT"].includes(eventDirection)) blockers.push("INVALID_EVENT_DIRECTION");
    if (["LONG", "SHORT"].includes(eventDirection)) {
      if (event?.observation_timing?.timely_for_precommitted_funnel !== true || event?.observation_timing?.retrospective_promotion_forbidden !== false) blockers.push("DIRECTION_NOT_PRECOMMITTED_IN_TIMELY_WINDOW");
      if (lockedTs === null || lockedTs !== closeTs || lockedTs > observedTs) blockers.push("INVALID_DIRECTION_LOCK_TIMELINE");
      if (directionAvailableTs === null || directionAvailableTs > lockedTs || directionAvailableTs < eventTs) blockers.push("INVALID_DIRECTION_AVAILABILITY_TIMELINE");
      if (event?.directional_evaluation_eligible !== true) blockers.push("EVENT_DIRECTION_NOT_ELIGIBLE");
      if (event?.direction_source !== "OPPORTUNITY_PRECOMMITTED_DIRECTION_V1" || event?.direction_rules_version !== "opportunity-direction-lock-v1") blockers.push("EVENT_DIRECTION_PROVENANCE_UNSUPPORTED");
    } else if (eventDirection === "DIRECTIONLESS_EVENT") {
      if (event?.observation_timing?.retrospective_promotion_forbidden !== true) blockers.push("DIRECTIONLESS_RETROSPECTIVE_PROTECTION_MISSING");
      if (lockedTs !== null || event?.directional_evaluation_eligible !== false) blockers.push("DIRECTIONLESS_EVENT_RETROACTIVE_LOCK_FORBIDDEN");
      if (event?.direction_source !== "OPPORTUNITY_DIRECTIONLESS_V1" || event?.direction_rules_version !== "opportunity-direction-lock-v1") blockers.push("DIRECTIONLESS_EVENT_PROVENANCE_UNSUPPORTED");
    }
  }
  let quality = "CLOSED";
  if (blockers.length) quality = "BLOCKED";
  else if (missing.length) quality = "INSUFFICIENT";
  return { quality, blockers: uniqSorted(blockers), missing: uniqSorted(missing), event, persistence_receipt: persistenceReceipt };
}

function analyzeCampaign(campaignInput, opportunityAnalysis, evidenceAnalysis, contract, observedTs, snapshotId) {
  const result = campaignInput?.campaign ? campaignInput : { campaign: campaignInput };
  const campaign = result?.campaign || null;
  const blockers = [];
  const missing = [];
  if (!campaign || typeof campaign !== "object") return { quality: "INSUFFICIENT", phase: "UNKNOWN", campaign: null, blockers, missing: ["CAMPAIGN_STATE_MISSING"] };
  const persistenceReceipt = immutableObjectReceipt(result, "CAMPAIGN", observedTs, timestamp(campaign?.last_observed_ts));
  blockers.push(...persistenceReceipt.blockers);
  missing.push(...persistenceReceipt.missing);
  const opportunityCommittedTs = timestamp(opportunityAnalysis?.persistence_receipt?.committed_ts);
  if (persistenceReceipt.committed_ts !== null && opportunityCommittedTs !== null && persistenceReceipt.committed_ts < opportunityCommittedTs) {
    blockers.push("CAMPAIGN_PERSISTENCE_PRECEDES_OPPORTUNITY_RECEIPT");
  }
  if (!validSafeId(result?.snapshot_id) || text(result.snapshot_id) !== snapshotId) blockers.push("CAMPAIGN_SNAPSHOT_MISMATCH");
  if (result?.schema_version !== "multi-wave-decision-bridge-v1" || campaign?.schema_version !== "multi-wave-decision-state-v1" || campaign?.rules_version !== "multi-wave-decision-state-rules-v1") blockers.push("CAMPAIGN_SCHEMA_OR_RULES_UNSUPPORTED");
  if (!["SHADOW_CAMPAIGN_EVALUATED", "DUPLICATE_OBSERVATION_SKIPPED"].includes(result?.status)) missing.push(`CAMPAIGN_RESULT_${upper(result?.status) || "MISSING"}`);
  if (upper(result?.persistence?.status) !== "CLOSED") missing.push("CAMPAIGN_PERSISTENCE_NOT_CLOSED");
  if (!validSafeId(campaign?.campaign_id, 256)) blockers.push("CAMPAIGN_ID_INVALID");
  const c = normalizedContract(campaign?.contract_code);
  if (c.error || c.value !== contract) blockers.push("CAMPAIGN_CONTRACT_MISMATCH");
  const phase = upper(campaign?.current_phase);
  if (!PHASE_SET.has(phase)) blockers.push("INVALID_CAMPAIGN_PHASE");
  const direction = upper(campaign?.direction);
  const directionAtDetection = upper(campaign?.direction_at_detection);
  if (!["LONG", "SHORT", "DIRECTIONLESS_EVENT"].includes(direction)) blockers.push("INVALID_CAMPAIGN_DIRECTION");
  if (!["LONG", "SHORT", "DIRECTIONLESS_EVENT"].includes(directionAtDetection)) blockers.push("INVALID_DETECTION_DIRECTION");
  const eventDirection = upper(opportunityAnalysis?.event?.direction_at_event);
  if (eventDirection !== directionAtDetection) blockers.push("DETECTION_DIRECTION_NOT_PRECOMMITTED_AT_EVENT");
  const lockTs = timestamp(campaign?.direction_locked_ts);
  const eventLockTs = timestamp(opportunityAnalysis?.event?.direction_locked_ts);
  if (["LONG", "SHORT"].includes(directionAtDetection)) {
    if (direction !== directionAtDetection) blockers.push("CAMPAIGN_DIRECTION_REWRITE");
    if (lockTs === null || eventLockTs === null || lockTs !== eventLockTs || lockTs > observedTs) blockers.push("CAMPAIGN_DIRECTION_LOCK_MISMATCH");
    if (!validSafeId(campaign?.direction_lock_observation_id, 512) || campaign.direction_lock_observation_id !== opportunityAnalysis?.event?.event_id) blockers.push("CAMPAIGN_DIRECTION_LOCK_PROVENANCE_MISMATCH");
  } else if (direction === "DIRECTIONLESS_EVENT") {
    if (lockTs !== null || campaign?.direction_lock_observation_id !== null) blockers.push("DIRECTIONLESS_CAMPAIGN_HAS_RETROSPECTIVE_LOCK");
  } else if (["LONG", "SHORT"].includes(direction)) {
    // A campaign admitted without a direction cannot later be rewritten into a
    // directional campaign. A fresh prospectively admitted event/campaign is
    // required; otherwise historical/current registries become conflated.
    blockers.push("DIRECTIONLESS_CAMPAIGN_DIRECTION_PROMOTION_FORBIDDEN");
  }
  const first = timestamp(campaign?.first_detected_time);
  const start = timestamp(campaign?.campaign_start);
  const last = timestamp(campaign?.last_observed_ts);
  const end = timestamp(campaign?.campaign_end);
  if (start === null || first === null || last === null || start !== first || last < start || last > observedTs) blockers.push("INVALID_CAMPAIGN_TIMELINE");
  else if (observedTs - last > MAX_CAMPAIGN_SNAPSHOT_LAG_MS) missing.push("CAMPAIGN_SNAPSHOT_STALE");
  const eventCloseTs = timestamp(opportunityAnalysis?.event?.event_close_ts);
  if (eventCloseTs === null || first === null || first < eventCloseTs) blockers.push("CAMPAIGN_PREDATES_ADMITTED_EVENT_CLOSE");
  if (phase === "CLOSED" && (end === null || end < start || end > observedTs)) blockers.push("INVALID_CAMPAIGN_END");
  if (phase !== "CLOSED" && end !== null) blockers.push("NONTERMINAL_CAMPAIGN_HAS_END");
  const waveIndex = integer(campaign?.wave_index);
  const completedWaves = integer(campaign?.completed_wave_count);
  const stateRevision = integer(campaign?.state_revision);
  if (waveIndex === null || waveIndex < 0 || completedWaves === null || completedWaves < 0 || completedWaves > waveIndex) blockers.push("INVALID_WAVE_COUNTERS");
  if (stateRevision !== null && waveIndex !== null && waveIndex > Math.floor(stateRevision / 4)) blockers.push("WAVE_INDEX_EXCEEDS_REVISION_HISTORY");
  if (stateRevision !== null && completedWaves !== null && completedWaves > Math.floor(Math.max(0, stateRevision - 2) / 4)) blockers.push("COMPLETED_WAVES_EXCEED_REVISION_HISTORY");
  const preWavePhase = ["DISCOVERY", "PRE_IMPULSE_WATCH", "ENTRY_CANDIDATE"].includes(phase);
  const activeWavePhase = ["ENTRY_TRIGGER", "IMPULSE", "NEXT_IMPULSE_ENTRY"].includes(phase);
  const reloadPhase = ["RELOAD_BASE", "NEXT_IMPULSE_WATCH"].includes(phase);
  if (preWavePhase && (waveIndex !== 0 || completedWaves !== 0)) blockers.push("PRE_ENTRY_PHASE_HAS_WAVE_COUNTERS");
  if (["ENTRY_TRIGGER", "IMPULSE", "NEXT_IMPULSE_ENTRY"].includes(phase)) {
    if ((waveIndex ?? 0) < 1 || timestamp(campaign?.entry_trigger_time) === null || (finite(campaign?.entry_trigger_price) ?? 0) <= 0) blockers.push("MISSING_ENTRY_PHASE_FACTS");
    if (!validSafeId(campaign?.current_wave_id, 320) || text(campaign.current_wave_id) !== `${text(campaign?.campaign_id)}:W${waveIndex}`) blockers.push("CURRENT_WAVE_ID_MISMATCH");
  }
  if (phase === "IMPULSE") {
    if (timestamp(campaign?.impulse_start) === null || finite(campaign?.impulse_start_price) === null) blockers.push("MISSING_IMPULSE_PHASE_FACTS");
  }
  if (["RELOAD_BASE", "NEXT_IMPULSE_WATCH", "NEXT_IMPULSE_ENTRY"].includes(phase) && (completedWaves ?? 0) < 1) blockers.push("RELOAD_WITHOUT_COMPLETED_WAVE");
  if (["ENTRY_TRIGGER", "IMPULSE", "NEXT_IMPULSE_ENTRY"].includes(phase) && waveIndex !== completedWaves + 1) blockers.push("ACTIVE_WAVE_COUNTER_MISMATCH");
  if (["RELOAD_BASE", "NEXT_IMPULSE_WATCH"].includes(phase) && waveIndex !== completedWaves) blockers.push("RELOAD_WAVE_COUNTER_MISMATCH");
  const boundedWaveRevision = waveIndex !== null && waveIndex <= Math.floor((Number.MAX_SAFE_INTEGER - 3) / 4);
  const expectedNonterminalRevision = phase === "DISCOVERY" ? 1
    : phase === "PRE_IMPULSE_WATCH" ? 2
      : phase === "ENTRY_CANDIDATE" ? 3
        : phase === "ENTRY_TRIGGER" && waveIndex === 1 ? 4
          : phase === "NEXT_IMPULSE_ENTRY" && boundedWaveRevision && waveIndex >= 2 ? 4 * waveIndex
            : phase === "IMPULSE" && boundedWaveRevision && waveIndex >= 1 ? 4 * waveIndex + 1
              : phase === "RELOAD_BASE" && boundedWaveRevision && waveIndex >= 1 ? 4 * waveIndex + 2
                : phase === "NEXT_IMPULSE_WATCH" && boundedWaveRevision && waveIndex >= 1 ? 4 * waveIndex + 3
                  : null;
  if (["DISCOVERY", "PRE_IMPULSE_WATCH", "ENTRY_CANDIDATE", "ENTRY_TRIGGER", "NEXT_IMPULSE_ENTRY", "IMPULSE", "RELOAD_BASE", "NEXT_IMPULSE_WATCH"].includes(phase) && stateRevision !== expectedNonterminalRevision) blockers.push("CAMPAIGN_PHASE_WAVE_REVISION_MISMATCH");
  const entryTs = timestamp(campaign?.entry_trigger_time);
  const impulseTs = timestamp(campaign?.impulse_start);
  const baseTs = timestamp(campaign?.base_start);
  const peakTs = timestamp(campaign?.impulse_peak_ts);
  const exhaustionTs = timestamp(campaign?.exhaustion_warning_ts);
  const edgeSpentTs = timestamp(campaign?.edge_spent_ts);
  const lastEventTs = timestamp(campaign?.last_event_ts);
  if (preWavePhase && (entryTs !== null || impulseTs !== null || campaign?.current_wave_id !== null || campaign?.entry_trigger_price !== null || campaign?.impulse_start_price !== null)) blockers.push("PRE_ENTRY_PHASE_HAS_WAVE_FACTS");
  if (ENTRY_PHASES.has(phase) && (impulseTs !== null || campaign?.impulse_start_price !== null)) blockers.push("ENTRY_PHASE_HAS_STALE_IMPULSE_FACTS");
  if (entryTs !== null && (start === null || last === null || entryTs < start || entryTs > last || entryTs > observedTs)) blockers.push("INVALID_ENTRY_TRIGGER_TIMELINE");
  if (entryTs !== null && impulseTs !== null && impulseTs < entryTs) blockers.push("IMPULSE_BEFORE_ENTRY");
  if (impulseTs !== null && (last === null || impulseTs > last || impulseTs > observedTs)) blockers.push("INVALID_IMPULSE_TIMELINE");
  if (baseTs !== null && (start === null || last === null || baseTs < start || baseTs > last || baseTs > observedTs)) blockers.push("INVALID_BASE_TIMELINE");
  if (peakTs !== null && (impulseTs === null || last === null || peakTs < impulseTs || peakTs > last || peakTs > observedTs)) blockers.push("INVALID_IMPULSE_PEAK_TIMELINE");
  if (lastEventTs === null) missing.push("CAMPAIGN_LAST_EVENT_TS_MISSING");
  else if (last === null || lastEventTs > last || lastEventTs > observedTs) blockers.push("INVALID_LAST_EVENT_TIMELINE");
  else if (eventCloseTs !== null && lastEventTs !== eventCloseTs) blockers.push("CAMPAIGN_LAST_EVENT_TS_MISMATCH");
  if (entryTs !== null && lockTs !== null && entryTs < lockTs) blockers.push("ENTRY_TRIGGER_BEFORE_DIRECTION_LOCK");

  const waveLedger = Array.isArray(campaign?.wave_ledger) ? campaign.wave_ledger : [];
  const waveLedgerOffset = integer(campaign?.wave_ledger_offset);
  if (!Array.isArray(campaign?.wave_ledger)) missing.push("WAVE_LEDGER_MISSING");
  if (preWavePhase && waveLedger.length) blockers.push("PRE_ENTRY_PHASE_WAVE_LEDGER_NOT_EMPTY");
  if (!preWavePhase && (waveIndex ?? 0) > 0 && !waveLedger.length) missing.push("WAVE_LEDGER_MISSING");
  if (waveLedger.length > 32) blockers.push("WAVE_LEDGER_UNBOUNDED");
  if (waveLedgerOffset === null || waveLedgerOffset < 0) blockers.push("WAVE_LEDGER_OFFSET_INVALID");
  if ((waveLedgerOffset ?? 0) > 0) {
    const anchor = campaign?.wave_ledger_anchor;
    if (!anchor || anchor?.schema_version !== "wave-ledger-anchor-v1" || !validSafeId(anchor?.campaign_id, 256) || anchor.campaign_id !== campaign?.campaign_id || integer(anchor?.completed_wave_count) !== waveLedgerOffset || !validSafeId(anchor?.last_wave_id, 320) || anchor.last_wave_id !== `${campaign?.campaign_id}:W${waveLedgerOffset}` || timestamp(anchor?.last_completed_ts) === null || !validDigest(anchor?.prefix_digest) || !validSafeId(anchor?.receipt_id, 256) || upper(anchor?.persistence?.status) !== "CLOSED" || anchor?.persistence?.immutable !== true || anchor?.persistence?.verification_method !== "D1_IMMUTABLE_RECEIPT" || anchor?.persistence?.receipt_id !== anchor?.receipt_id || !validDigest(anchor?.persistence?.content_digest) || anchor?.persistence?.content_digest !== anchor?.prefix_digest || timestamp(anchor?.persistence?.committed_ts) === null || timestamp(anchor?.persistence?.committed_ts) > observedTs || timestamp(anchor?.persistence?.committed_ts) < timestamp(anchor?.last_completed_ts)) blockers.push("WAVE_LEDGER_ANCHOR_INVALID");
    const anchorCompletedTs = timestamp(anchor?.last_completed_ts);
    if (anchorCompletedTs !== null && (start === null || last === null || anchorCompletedTs < start || anchorCompletedTs > last || anchorCompletedTs > observedTs)) blockers.push("WAVE_LEDGER_ANCHOR_TIMELINE_INVALID");
  }
  else if (campaign?.wave_ledger_anchor !== null && campaign?.wave_ledger_anchor !== undefined) blockers.push("UNEXPECTED_WAVE_LEDGER_ANCHOR");
  let expectedWave = (waveLedgerOffset ?? 0) + 1;
  let completedInLedger = 0;
  let terminatedInLedger = 0;
  let activeInLedger = 0;
  const ledgerIds = new Set();
  const ledgerFactObservationIds = new Set();
  let priorCompletedTs = (waveLedgerOffset ?? 0) > 0 ? timestamp(campaign?.wave_ledger_anchor?.last_completed_ts) : null;
  for (const wave of waveLedger.slice(0, 33)) {
    const index = integer(wave?.wave_index);
    const waveId = text(wave?.wave_id);
    const waveEntryTs = timestamp(wave?.entry_trigger_time);
    const waveImpulseTs = timestamp(wave?.impulse_start);
    if (index !== expectedWave || waveId !== `${text(campaign?.campaign_id)}:W${index}` || ledgerIds.has(waveId)) blockers.push("WAVE_LEDGER_IDENTITY_OR_SEQUENCE_INVALID");
    ledgerIds.add(waveId);
    expectedWave += 1;
    if (wave?.immutable !== true || !validSafeId(wave?.entry_observation_id, 256) || waveEntryTs === null || (finite(wave?.entry_trigger_price) ?? 0) <= 0) blockers.push(`WAVE_LEDGER_ENTRY_FACTS_INVALID:${index ?? "UNKNOWN"}`);
    if (waveEntryTs !== null && (start === null || last === null || waveEntryTs < start || waveEntryTs > last || waveEntryTs > observedTs)) blockers.push(`WAVE_LEDGER_ENTRY_TIMELINE_INVALID:${index ?? "UNKNOWN"}`);
    if (priorCompletedTs !== null && waveEntryTs !== null && waveEntryTs < priorCompletedTs) blockers.push(`WAVE_LEDGER_CROSS_WAVE_ORDER_INVALID:${index ?? "UNKNOWN"}`);
    if (waveImpulseTs !== null && waveImpulseTs < waveEntryTs) blockers.push(`WAVE_LEDGER_IMPULSE_BEFORE_ENTRY:${index ?? "UNKNOWN"}`);
    const waveStatus = upper(wave?.status);
    for (const observationId of [
      wave?.entry_observation_id,
      wave?.impulse_observation_id,
      wave?.completion_observation_id,
      wave?.termination_observation_id,
    ]) {
      if (observationId === null || observationId === undefined) continue;
      if (validSafeId(observationId, 256)) {
        if (ledgerFactObservationIds.has(observationId)) blockers.push("WAVE_LEDGER_FACT_OBSERVATION_ID_REUSE");
        else ledgerFactObservationIds.add(observationId);
      }
    }
    if (!["ENTRY_ACTIVE", "IMPULSE_ACTIVE", "COMPLETED", "TERMINATED"].includes(waveStatus)) blockers.push(`WAVE_LEDGER_STATUS_INVALID:${index ?? "UNKNOWN"}`);
    if (["IMPULSE_ACTIVE", "COMPLETED"].includes(waveStatus) && (waveImpulseTs === null || (finite(wave?.impulse_start_price) ?? 0) <= 0)) blockers.push(`WAVE_LEDGER_IMPULSE_FACTS_INVALID:${index ?? "UNKNOWN"}`);
    if (["IMPULSE_ACTIVE", "COMPLETED"].includes(waveStatus) && !validSafeId(wave?.impulse_observation_id, 256)) blockers.push(`WAVE_LEDGER_IMPULSE_OBSERVATION_INVALID:${index ?? "UNKNOWN"}`);
    if (waveStatus === "TERMINATED" && waveImpulseTs !== null && ((finite(wave?.impulse_start_price) ?? 0) <= 0 || !validSafeId(wave?.impulse_observation_id, 256))) blockers.push(`WAVE_LEDGER_TERMINATED_IMPULSE_FACTS_INVALID:${index ?? "UNKNOWN"}`);
    if (waveStatus === "TERMINATED" && waveImpulseTs === null && (wave?.impulse_start_price !== null && wave?.impulse_start_price !== undefined || wave?.impulse_observation_id !== null && wave?.impulse_observation_id !== undefined)) blockers.push(`WAVE_LEDGER_TERMINATED_IMPULSE_FACT_CONFLICT:${index ?? "UNKNOWN"}`);
    if (waveStatus === "ENTRY_ACTIVE" && (waveImpulseTs !== null || wave?.impulse_start_price !== null || wave?.completed_ts !== null || wave?.terminated_ts !== null && wave?.terminated_ts !== undefined)) blockers.push(`WAVE_LEDGER_ENTRY_STATUS_FACT_CONFLICT:${index ?? "UNKNOWN"}`);
    if (waveStatus === "IMPULSE_ACTIVE" && (wave?.completed_ts !== null || wave?.terminated_ts !== null && wave?.terminated_ts !== undefined)) blockers.push(`WAVE_LEDGER_IMPULSE_STATUS_FACT_CONFLICT:${index ?? "UNKNOWN"}`);
    if (!["COMPLETED", "TERMINATED"].includes(waveStatus)) {
      activeInLedger += 1;
      if (expectedWave - 1 !== (waveLedgerOffset ?? 0) + waveLedger.length) blockers.push(`WAVE_LEDGER_ACTIVE_NOT_LAST:${index ?? "UNKNOWN"}`);
    }
    if (waveImpulseTs !== null && (start === null || last === null || waveImpulseTs < start || waveImpulseTs > last || waveImpulseTs > observedTs)) blockers.push(`WAVE_LEDGER_IMPULSE_TIMELINE_INVALID:${index ?? "UNKNOWN"}`);
    if (waveStatus === "COMPLETED") {
      completedInLedger += 1;
      const completedTs = timestamp(wave?.completed_ts);
      if (completedTs === null || completedTs < (waveImpulseTs ?? waveEntryTs) || (last !== null && completedTs > last)) blockers.push(`WAVE_LEDGER_COMPLETION_INVALID:${index ?? "UNKNOWN"}`);
      if (!validSafeId(wave?.completion_observation_id, 256)) blockers.push(`WAVE_LEDGER_COMPLETION_OBSERVATION_INVALID:${index ?? "UNKNOWN"}`);
      if (completedTs !== null) priorCompletedTs = completedTs;
    }
    if (waveStatus === "TERMINATED") {
      terminatedInLedger += 1;
      const terminatedTs = timestamp(wave?.terminated_ts);
      const terminationPhase = upper(wave?.termination_phase);
      if (expectedWave - 1 !== (waveLedgerOffset ?? 0) + waveLedger.length) blockers.push(`WAVE_LEDGER_TERMINATED_NOT_LAST:${index ?? "UNKNOWN"}`);
      if (terminatedTs === null || !["EXHAUSTION_WARNING", "CLOSED"].includes(terminationPhase) || !validSafeId(wave?.termination_observation_id, 256)) blockers.push(`WAVE_LEDGER_TERMINATION_FACTS_INVALID:${index ?? "UNKNOWN"}`);
      if (terminationPhase === "CLOSED" && (phase !== "CLOSED" || terminatedTs !== end)) blockers.push(`WAVE_LEDGER_TERMINATION_PHASE_STATE_MISMATCH:${index ?? "UNKNOWN"}`);
      if (terminationPhase === "EXHAUSTION_WARNING" && (!["EXHAUSTION_WARNING", "EDGE_SPENT", "CLOSED"].includes(phase) || terminatedTs !== exhaustionTs)) blockers.push(`WAVE_LEDGER_TERMINATION_PHASE_STATE_MISMATCH:${index ?? "UNKNOWN"}`);
      if (wave?.completed_ts !== null || wave?.completion_observation_id !== null && wave?.completion_observation_id !== undefined) blockers.push(`WAVE_LEDGER_TERMINATION_COMPLETION_CONFLICT:${index ?? "UNKNOWN"}`);
      if (terminatedTs !== null && (terminatedTs < (waveImpulseTs ?? waveEntryTs) || (last !== null && terminatedTs > last) || terminatedTs > observedTs)) blockers.push(`WAVE_LEDGER_TERMINATION_TIMELINE_INVALID:${index ?? "UNKNOWN"}`);
    } else if (wave?.terminated_ts !== null && wave?.terminated_ts !== undefined || wave?.termination_observation_id !== null && wave?.termination_observation_id !== undefined || wave?.termination_phase !== null && wave?.termination_phase !== undefined) {
      blockers.push(`WAVE_LEDGER_UNEXPECTED_TERMINATION_FACTS:${index ?? "UNKNOWN"}`);
    }
  }
  if (activeInLedger > 1) blockers.push("WAVE_LEDGER_MULTIPLE_ACTIVE_WAVES");
  if (terminatedInLedger > 1) blockers.push("WAVE_LEDGER_MULTIPLE_TERMINATED_WAVES");
  if (waveLedger.length && integer(waveLedger.at(-1)?.wave_index) !== waveIndex) blockers.push("WAVE_LEDGER_CURRENT_INDEX_MISMATCH");
  if ((waveLedgerOffset ?? 0) + completedInLedger !== completedWaves) blockers.push("WAVE_LEDGER_COMPLETED_COUNT_MISMATCH");
  const ledgerCurrent = waveLedger.find((wave) => integer(wave?.wave_index) === waveIndex) || null;
  if (["ENTRY_TRIGGER", "NEXT_IMPULSE_ENTRY"].includes(phase)) {
    if (!ledgerCurrent || upper(ledgerCurrent.status) !== "ENTRY_ACTIVE" || timestamp(ledgerCurrent.entry_trigger_time) !== entryTs || finite(ledgerCurrent.entry_trigger_price) !== finite(campaign?.entry_trigger_price)) blockers.push("CURRENT_ENTRY_WAVE_LEDGER_MISMATCH");
  }
  if (phase === "IMPULSE") {
    if (!ledgerCurrent || upper(ledgerCurrent.status) !== "IMPULSE_ACTIVE" || timestamp(ledgerCurrent.entry_trigger_time) !== entryTs || timestamp(ledgerCurrent.impulse_start) !== impulseTs || finite(ledgerCurrent.impulse_start_price) !== finite(campaign?.impulse_start_price)) blockers.push("CURRENT_IMPULSE_WAVE_LEDGER_MISMATCH");
  }
  if (["RELOAD_BASE", "NEXT_IMPULSE_WATCH"].includes(phase) && (!ledgerCurrent || upper(ledgerCurrent.status) !== "COMPLETED")) blockers.push("RELOAD_WAVE_LEDGER_MISMATCH");
  if (["RELOAD_BASE", "NEXT_IMPULSE_WATCH", "EXHAUSTION_WARNING", "EDGE_SPENT", "CLOSED"].includes(phase) && ledgerCurrent) {
    const retainedWaveFactsMatch = validSafeId(campaign?.current_wave_id, 320) && campaign.current_wave_id === ledgerCurrent.wave_id &&
      entryTs === timestamp(ledgerCurrent?.entry_trigger_time) && finite(campaign?.entry_trigger_price) === finite(ledgerCurrent?.entry_trigger_price) &&
      impulseTs === timestamp(ledgerCurrent?.impulse_start) && finite(campaign?.impulse_start_price) === finite(ledgerCurrent?.impulse_start_price);
    if (!retainedWaveFactsMatch) blockers.push(["EXHAUSTION_WARNING", "EDGE_SPENT", "CLOSED"].includes(phase) ? "TERMINAL_CURRENT_WAVE_FACTS_MISMATCH" : "POST_ENTRY_CURRENT_WAVE_FACTS_MISMATCH");
  } else if (["EXHAUSTION_WARNING", "EDGE_SPENT", "CLOSED"].includes(phase) && !ledgerCurrent && (waveIndex ?? 0) === 0) {
    const forbiddenCurrentWaveFacts = [campaign?.current_wave_id, campaign?.entry_trigger_time, campaign?.entry_trigger_price, campaign?.impulse_start, campaign?.impulse_start_price];
    if (forbiddenCurrentWaveFacts.some((value) => value !== null && value !== undefined)) blockers.push("TERMINAL_WITHOUT_WAVE_HAS_CURRENT_WAVE_FACTS");
  }
  if (preWavePhase && activeInLedger !== 0) blockers.push("PRE_ENTRY_PHASE_HAS_ACTIVE_WAVE");
  if (activeWavePhase && activeInLedger !== 1) blockers.push("ACTIVE_PHASE_LEDGER_CARDINALITY_INVALID");
  if (reloadPhase && activeInLedger !== 0) blockers.push("RELOAD_PHASE_HAS_ACTIVE_WAVE");
  if (phase === "EXHAUSTION_WARNING" && activeInLedger !== 0) blockers.push("EXHAUSTION_PHASE_HAS_ACTIVE_WAVE");
  if (TERMINAL_PHASES.has(phase) && activeInLedger !== 0) blockers.push("TERMINAL_PHASE_HAS_ACTIVE_WAVE");
  if (terminatedInLedger && !["EXHAUSTION_WARNING", "EDGE_SPENT", "CLOSED"].includes(phase)) blockers.push("TERMINATED_WAVE_IN_ACTIVE_CAMPAIGN_PHASE");

  const expectedEntryActionId = ENTRY_PHASES.has(phase) && validSafeId(campaign?.campaign_id, 256) && validSafeId(campaign?.current_wave_id, 320) && entryTs !== null
    ? `FDE:${fnv1a64(stableJson([contract, campaign.campaign_id, campaign.current_wave_id, entryTs]))}`
    : null;
  const entryWindow = result?.entry_window;
  let entryWindowExpired = false;
  if (ENTRY_PHASES.has(phase)) {
    if (!entryWindow || typeof entryWindow !== "object") missing.push("ENTRY_WINDOW_STATE_MISSING");
    else {
      const windowContract = normalizedContract(entryWindow?.contract_code);
      const windowSourceTs = timestamp(entryWindow?.source_ts);
      const windowValidUntilTs = timestamp(entryWindow?.valid_until_ts);
      if (upper(entryWindow?.status) !== "CLOSED") missing.push("ENTRY_WINDOW_NOT_CLOSED");
      if (windowContract.error || windowContract.value !== contract) blockers.push("ENTRY_WINDOW_CONTRACT_MISMATCH");
      if (!validSafeId(entryWindow?.snapshot_id) || text(entryWindow.snapshot_id) !== snapshotId) blockers.push("ENTRY_WINDOW_SNAPSHOT_MISMATCH");
      if (text(entryWindow?.campaign_id) !== text(campaign?.campaign_id) || text(entryWindow?.wave_id) !== text(campaign?.current_wave_id)) blockers.push("ENTRY_WINDOW_CAMPAIGN_LINK_MISMATCH");
      if (integer(entryWindow?.campaign_state_revision) !== integer(campaign?.state_revision)) blockers.push("ENTRY_WINDOW_STATE_REVISION_MISMATCH");
      if (text(entryWindow?.observation_id) !== text(campaign?.observation_id)) blockers.push("ENTRY_WINDOW_OBSERVATION_LINK_MISMATCH");
      if (text(entryWindow?.action_id) !== expectedEntryActionId) blockers.push("ENTRY_WINDOW_ACTION_ID_MISMATCH");
      if (entryWindow?.single_use !== true || entryWindow?.consumed !== false) blockers.push("ENTRY_WINDOW_NOT_AVAILABLE_SINGLE_USE");
      if (upper(entryWindow?.persistence?.status) !== "CLOSED") missing.push("ENTRY_WINDOW_PERSISTENCE_NOT_CLOSED");
      if (windowSourceTs === null || entryTs === null || windowSourceTs !== entryTs) blockers.push("ENTRY_WINDOW_SOURCE_NOT_TRIGGER_TIME");
      if (windowValidUntilTs === null) missing.push("ENTRY_WINDOW_VALID_UNTIL_MISSING");
      else if (windowSourceTs !== null && (
        windowValidUntilTs <= windowSourceTs ||
        windowValidUntilTs - windowSourceTs > MAX_SHADOW_ENTRY_WINDOW_MS
      )) blockers.push("ENTRY_WINDOW_DURATION_UNBOUNDED");
      else if (windowValidUntilTs < observedTs) entryWindowExpired = true;
      if (integer(entryWindow?.max_age_ms) === null || windowSourceTs === null || windowValidUntilTs === null || integer(entryWindow.max_age_ms) !== windowValidUntilTs - windowSourceTs) blockers.push("ENTRY_WINDOW_MAX_AGE_POLICY_MISMATCH");
    }
  } else if (entryWindow?.consumed === false || entryWindow?.status === "CLOSED") {
    blockers.push("ENTRY_WINDOW_PRESENT_OUTSIDE_ENTRY_PHASE");
  }

  const chase = result?.chase_risk;
  let chaseActive = null;
  if (!chase || typeof chase !== "object") missing.push("CHASE_RISK_STATE_MISSING");
  else {
    const chaseContract = normalizedContract(chase?.contract_code);
    const chaseSourceTs = timestamp(chase?.source_ts);
    const chaseValidUntilTs = timestamp(chase?.valid_until_ts);
    if (upper(chase?.status) !== "CLOSED") missing.push("CHASE_RISK_NOT_CLOSED");
    if (typeof chase?.active !== "boolean") missing.push("CHASE_RISK_ACTIVE_NOT_BOOLEAN");
    else chaseActive = chase.active;
    if (chaseContract.error || chaseContract.value !== contract) blockers.push("CHASE_RISK_CONTRACT_MISMATCH");
    if (!validSafeId(chase?.snapshot_id) || text(chase.snapshot_id) !== snapshotId) blockers.push("CHASE_RISK_SNAPSHOT_MISMATCH");
    if (chaseSourceTs === null) missing.push("CHASE_RISK_SOURCE_TS_MISSING");
    else if (chaseSourceTs > observedTs) blockers.push("CHASE_RISK_FROM_FUTURE");
    else if (last !== null && chaseSourceTs > last) blockers.push("CHASE_RISK_SOURCE_POSTDATES_CAMPAIGN_STATE");
    if (timestamp(chase?.available_ts) !== null && last !== null && timestamp(chase.available_ts) > last) blockers.push("CHASE_RISK_AVAILABILITY_POSTDATES_CAMPAIGN_STATE");
    if (persistenceReceipt.committed_ts !== null && timestamp(chase?.available_ts) !== null && persistenceReceipt.committed_ts < timestamp(chase.available_ts)) blockers.push("CAMPAIGN_PERSISTENCE_PRECEDES_CHASE_RISK");
    if (chaseValidUntilTs === null) missing.push("CHASE_RISK_VALID_UNTIL_MISSING");
    else if (chaseValidUntilTs < observedTs) missing.push("CHASE_RISK_STALE");
    if (chase?.rules_version !== "chase-risk-state-v1") blockers.push("CHASE_RISK_RULES_VERSION_UNSUPPORTED");
    const chaseFreshness = freshnessContract(chase, observedTs, AUTHORITATIVE_STATE_FRESHNESS_MS.CHASE_RISK, "CHASE_RISK");
    blockers.push(...chaseFreshness.blockers);
    missing.push(...chaseFreshness.missing);
  }

  const history = Array.isArray(campaign?.transition_history) ? campaign.transition_history : [];
  if (history.length > 64) blockers.push("TRANSITION_HISTORY_UNBOUNDED");
  if (phase !== "DISCOVERY" && history.length === 0) blockers.push("NON_DISCOVERY_PHASE_WITHOUT_HISTORY");
  let priorTo = null;
  let priorTs = null;
  let priorRevision = null;
  const transitionIds = new Set();
  const transitionObservationIds = new Set();
  const historyTruncated = campaign?.history_truncated === true;
  const anchor = campaign?.history_anchor;
  if (phase === "DISCOVERY" && historyTruncated) blockers.push("DISCOVERY_HISTORY_CANNOT_BE_TRUNCATED");
  if (historyTruncated) {
    if (!anchor || anchor?.schema_version !== "transition-history-anchor-v1" || !validSafeId(anchor?.campaign_id, 256) || anchor.campaign_id !== campaign?.campaign_id || !PHASE_SET.has(upper(anchor?.prior_phase)) || integer(anchor?.prior_state_revision) === null || integer(anchor?.prefix_transition_count) === null || integer(anchor?.prefix_transition_count) < 1 ||
        timestamp(anchor?.prior_observation_ts) === null || !validDigest(anchor?.prefix_digest) || !validSafeId(anchor?.receipt_id, 256) ||
        upper(anchor?.persistence?.status) !== "CLOSED" || anchor?.persistence?.immutable !== true || anchor?.persistence?.verification_method !== "D1_IMMUTABLE_RECEIPT" || anchor?.persistence?.receipt_id !== anchor?.receipt_id || !validDigest(anchor?.persistence?.content_digest) || anchor?.persistence?.content_digest !== anchor?.prefix_digest || timestamp(anchor?.persistence?.committed_ts) === null || timestamp(anchor?.persistence?.committed_ts) > observedTs || timestamp(anchor?.persistence?.committed_ts) < timestamp(anchor?.prior_observation_ts)) blockers.push("INVALID_TRANSITION_HISTORY_ANCHOR");
    else {
      priorTo = upper(anchor.prior_phase);
      priorTs = timestamp(anchor.prior_observation_ts);
      priorRevision = integer(anchor.prior_state_revision);
      const prefixCount = integer(anchor.prefix_transition_count);
      if (priorTs < start || priorTs > last) blockers.push("TRANSITION_HISTORY_ANCHOR_TIMELINE_INVALID");
      if (priorRevision !== prefixCount + 1) blockers.push("TRANSITION_HISTORY_ANCHOR_REVISION_COUNT_MISMATCH");
      if (prefixCount + history.length !== integer(campaign?.state_revision) - 1) blockers.push("TRANSITION_HISTORY_TOTAL_COUNT_MISMATCH");
    }
  }
  else if (anchor !== null && anchor !== undefined) blockers.push("UNEXPECTED_TRANSITION_HISTORY_ANCHOR");
  const historyAnchorCommittedTs = historyTruncated ? timestamp(anchor?.persistence?.committed_ts) : null;
  const waveLedgerAnchorCommittedTs = (waveLedgerOffset ?? 0) > 0 ? timestamp(campaign?.wave_ledger_anchor?.persistence?.committed_ts) : null;
  if (persistenceReceipt.committed_ts !== null && [historyAnchorCommittedTs, waveLedgerAnchorCommittedTs].some((committedTs) => committedTs !== null && committedTs > persistenceReceipt.committed_ts)) {
    blockers.push("CAMPAIGN_PERSISTENCE_PRECEDES_NESTED_ANCHOR");
  }
  for (const transition of history.slice(0, 65)) {
    const from = upper(transition?.from);
    const to = upper(transition?.to);
    const transitionTs = timestamp(transition?.observed_ts);
    const fromRevision = integer(transition?.from_state_revision);
    const toRevision = integer(transition?.to_state_revision);
    const transitionId = typeof transition?.transition_id === "string" ? transition.transition_id : "";
    const transitionObservationId = typeof transition?.observation_id === "string" ? transition.observation_id : "";
    if (!ALLOWED_TRANSITIONS.has(`${from}>${to}`)) blockers.push(`ILLEGAL_CAMPAIGN_TRANSITION:${from}>${to}`);
    if (priorTo !== null && from !== priorTo) blockers.push("DISCONTINUOUS_TRANSITION_HISTORY");
    if (transitionTs === null || (priorTs !== null && transitionTs < priorTs) || start === null || last === null || transitionTs < start || transitionTs > last || transitionTs > observedTs) blockers.push("INVALID_TRANSITION_TIMELINE");
    if (!validSafeId(transitionId, 256) || transitionIds.has(transitionId)) blockers.push("INVALID_OR_DUPLICATE_TRANSITION_ID");
    else transitionIds.add(transitionId);
    if (!validSafeId(transitionObservationId, 256) || transitionObservationIds.has(transitionObservationId)) blockers.push("INVALID_OR_DUPLICATE_TRANSITION_OBSERVATION_ID");
    else transitionObservationIds.add(transitionObservationId);
    if (fromRevision === null || toRevision === null || toRevision !== fromRevision + 1 || (priorRevision !== null && fromRevision !== priorRevision)) blockers.push("INVALID_TRANSITION_REVISION_CHAIN");
    priorTo = to;
    priorTs = transitionTs;
    priorRevision = toRevision;
  }
  if (history.length && priorTo !== phase) blockers.push("TRANSITION_HISTORY_PHASE_MISMATCH");
  if (history.length && !historyTruncated && upper(history[0]?.from) !== "DISCOVERY") blockers.push("TRANSITION_HISTORY_GENESIS_MISSING");
  if (!historyTruncated && history.length && integer(history[0]?.from_state_revision) !== 1) blockers.push("TRANSITION_HISTORY_GENESIS_REVISION_INVALID");
  if (!historyTruncated && integer(campaign?.state_revision) !== history.length + 1) blockers.push("UNANCHORED_TRANSITION_HISTORY_REVISION_GAP");
  const latestTransitionInto = (target) => [...history].reverse().find((transition) => upper(transition?.to) === target) || null;
  const exhaustionPresent = campaign?.exhaustion_warning_ts !== null && campaign?.exhaustion_warning_ts !== undefined;
  const edgeSpentPresent = campaign?.edge_spent_ts !== null && campaign?.edge_spent_ts !== undefined;
  const phaseBeforeExhaustion = [
    "DISCOVERY", "PRE_IMPULSE_WATCH", "ENTRY_CANDIDATE", "ENTRY_TRIGGER", "IMPULSE", "RELOAD_BASE",
    "NEXT_IMPULSE_WATCH", "NEXT_IMPULSE_ENTRY",
  ].includes(phase);
  if (phaseBeforeExhaustion && (exhaustionPresent || edgeSpentPresent)) blockers.push("CAMPAIGN_FUTURE_MILESTONE_PRESENT");
  if (phase === "EXHAUSTION_WARNING" && (exhaustionTs === null || edgeSpentPresent)) blockers.push("CAMPAIGN_EXHAUSTION_MILESTONE_STATE_MISMATCH");
  if (phase === "EDGE_SPENT" && (exhaustionTs === null || edgeSpentTs === null)) blockers.push("CAMPAIGN_EDGE_MILESTONE_STATE_MISMATCH");
  if (phase === "CLOSED") {
    const closedFrom = upper(history.at(-1)?.from);
    if (closedFrom === "EDGE_SPENT" && (exhaustionTs === null || edgeSpentTs === null)) blockers.push("CAMPAIGN_CLOSED_MILESTONE_BRANCH_MISMATCH");
    else if (closedFrom === "EXHAUSTION_WARNING" && (exhaustionTs === null || edgeSpentPresent)) blockers.push("CAMPAIGN_CLOSED_MILESTONE_BRANCH_MISMATCH");
    else if (!["EDGE_SPENT", "EXHAUSTION_WARNING"].includes(closedFrom) && (exhaustionPresent || edgeSpentPresent)) blockers.push("CAMPAIGN_CLOSED_MILESTONE_BRANCH_MISMATCH");
    const terminalLedgerWave = [...waveLedger].reverse().find((wave) => upper(wave?.status) === "TERMINATED") || null;
    if (terminalLedgerWave) {
      const expectedTerminationPhase = ["EXHAUSTION_WARNING", "EDGE_SPENT"].includes(closedFrom) ? "EXHAUSTION_WARNING" : "CLOSED";
      if (upper(terminalLedgerWave?.termination_phase) !== expectedTerminationPhase) blockers.push("CAMPAIGN_CLOSED_TERMINATION_BRANCH_MISMATCH");
    }
  }
  if (exhaustionPresent && (exhaustionTs === null || start === null || last === null || exhaustionTs < start || exhaustionTs > last || exhaustionTs > observedTs || (end !== null && exhaustionTs > end))) blockers.push("CAMPAIGN_EXHAUSTION_MILESTONE_TIMELINE_INVALID");
  if (edgeSpentPresent && (edgeSpentTs === null || exhaustionTs === null || last === null || edgeSpentTs < exhaustionTs || edgeSpentTs > last || edgeSpentTs > observedTs || (end !== null && edgeSpentTs > end))) blockers.push("CAMPAIGN_EDGE_MILESTONE_TIMELINE_INVALID");
  const safeWaveRevision = (index, offset) => Number.isSafeInteger(index) && index >= 1 && index <= Math.floor((Number.MAX_SAFE_INTEGER - offset) / 4)
    ? 4 * index + offset
    : null;
  const sourcePhaseRevision = (sourcePhase) => {
    if (sourcePhase === "DISCOVERY" && waveIndex === 0 && completedWaves === 0) return 1;
    if (sourcePhase === "PRE_IMPULSE_WATCH" && waveIndex === 0 && completedWaves === 0) return 2;
    if (sourcePhase === "ENTRY_CANDIDATE" && waveIndex === 0 && completedWaves === 0) return 3;
    if (sourcePhase === "ENTRY_TRIGGER" && waveIndex === 1 && completedWaves === 0) return 4;
    if (sourcePhase === "NEXT_IMPULSE_ENTRY" && waveIndex !== null && waveIndex >= 2 && completedWaves === waveIndex - 1) return safeWaveRevision(waveIndex, 0);
    if (sourcePhase === "IMPULSE" && waveIndex !== null && completedWaves === waveIndex - 1) return safeWaveRevision(waveIndex, 1);
    if (sourcePhase === "RELOAD_BASE" && waveIndex !== null && completedWaves === waveIndex) return safeWaveRevision(waveIndex, 2);
    if (sourcePhase === "NEXT_IMPULSE_WATCH" && waveIndex !== null && completedWaves === waveIndex) return safeWaveRevision(waveIndex, 3);
    return null;
  };
  const exhaustionRevisionCandidates = () => {
    if (waveIndex === null || waveIndex < 1 || completedWaves === null) return [];
    if (completedWaves === waveIndex - 1) {
      const current = waveLedger.find((wave) => integer(wave?.wave_index) === waveIndex) || null;
      if (!current || upper(current?.status) !== "TERMINATED") return [];
      return [safeWaveRevision(waveIndex, timestamp(current?.impulse_start) === null ? 1 : 2)].filter((value) => value !== null);
    }
    if (completedWaves === waveIndex) return [safeWaveRevision(waveIndex, 3), safeWaveRevision(waveIndex, 4)].filter((value) => value !== null);
    return [];
  };
  if (["EXHAUSTION_WARNING", "EDGE_SPENT", "CLOSED"].includes(phase)) {
    const finalSourcePhase = upper(history.at(-1)?.from);
    let allowedTerminalRevisions = [];
    if (phase === "EXHAUSTION_WARNING") {
      const sourceRevision = sourcePhaseRevision(finalSourcePhase);
      if (sourceRevision !== null) allowedTerminalRevisions = [sourceRevision + 1];
    } else if (phase === "EDGE_SPENT" && finalSourcePhase === "EXHAUSTION_WARNING") {
      allowedTerminalRevisions = exhaustionRevisionCandidates().map((revision) => revision + 1);
    } else if (phase === "CLOSED") {
      const sourceRevision = sourcePhaseRevision(finalSourcePhase);
      if (sourceRevision !== null) allowedTerminalRevisions = [sourceRevision + 1];
      else if (finalSourcePhase === "EXHAUSTION_WARNING") allowedTerminalRevisions = exhaustionRevisionCandidates().map((revision) => revision + 1);
      else if (finalSourcePhase === "EDGE_SPENT") allowedTerminalRevisions = exhaustionRevisionCandidates().map((revision) => revision + 2);
    }
    if (!allowedTerminalRevisions.includes(stateRevision)) blockers.push("CAMPAIGN_TERMINAL_REVISION_MISMATCH");
  }
  if (phase === "ENTRY_TRIGGER" && timestamp(latestTransitionInto("ENTRY_TRIGGER")?.observed_ts) !== entryTs) blockers.push("ENTRY_TRIGGER_FACT_TRANSITION_MISMATCH");
  if (phase === "NEXT_IMPULSE_ENTRY" && timestamp(latestTransitionInto("NEXT_IMPULSE_ENTRY")?.observed_ts) !== entryTs) blockers.push("NEXT_ENTRY_FACT_TRANSITION_MISMATCH");
  if (phase === "IMPULSE" && timestamp(latestTransitionInto("IMPULSE")?.observed_ts) !== impulseTs) blockers.push("IMPULSE_FACT_TRANSITION_MISMATCH");
  if (phase === "RELOAD_BASE" && timestamp(latestTransitionInto("RELOAD_BASE")?.observed_ts) !== baseTs) blockers.push("RELOAD_BASE_FACT_TRANSITION_MISMATCH");
  if (phase === "EXHAUSTION_WARNING" && timestamp(latestTransitionInto("EXHAUSTION_WARNING")?.observed_ts) !== timestamp(campaign?.exhaustion_warning_ts)) blockers.push("EXHAUSTION_FACT_TRANSITION_MISMATCH");
  if (phase === "EDGE_SPENT" && timestamp(latestTransitionInto("EDGE_SPENT")?.observed_ts) !== timestamp(campaign?.edge_spent_ts)) blockers.push("EDGE_SPENT_FACT_TRANSITION_MISMATCH");
  if (phase === "CLOSED" && timestamp(latestTransitionInto("CLOSED")?.observed_ts) !== end) blockers.push("CAMPAIGN_END_TRANSITION_MISMATCH");
  const retainedTransitionMatches = (to, observedAt, observationId) => history.filter((transition) =>
    upper(transition?.to) === to &&
    timestamp(transition?.observed_ts) === observedAt &&
    text(transition?.observation_id) === text(observationId)
  );
  const omittedByHistoryAnchor = (observedAt) => historyTruncated && priorTs !== null && observedAt !== null && observedAt <= timestamp(anchor?.prior_observation_ts);
  const requireWaveTransition = (wave, to, factTs, observationId, suffix) => {
    const index = integer(wave?.wave_index);
    const matching = retainedTransitionMatches(to, factTs, observationId);
    if (matching.length > 1) blockers.push(`WAVE_${suffix}_TRANSITION_DUPLICATE:${index ?? "UNKNOWN"}`);
    if (matching.length === 0 && !omittedByHistoryAnchor(factTs)) blockers.push(`WAVE_${suffix}_TRANSITION_LINK_INVALID:${index ?? "UNKNOWN"}`);
    const conflicting = history.some((transition) =>
      upper(transition?.to) === to &&
      (timestamp(transition?.observed_ts) === factTs || text(transition?.observation_id) === text(observationId)) &&
      !(timestamp(transition?.observed_ts) === factTs && text(transition?.observation_id) === text(observationId))
    );
    if (conflicting) blockers.push(`WAVE_${suffix}_TRANSITION_FACT_CONFLICT:${index ?? "UNKNOWN"}`);
  };
  for (const wave of waveLedger) {
    const index = integer(wave?.wave_index);
    requireWaveTransition(
      wave,
      index === 1 ? "ENTRY_TRIGGER" : "NEXT_IMPULSE_ENTRY",
      timestamp(wave?.entry_trigger_time),
      wave?.entry_observation_id,
      "ENTRY",
    );
    if (timestamp(wave?.impulse_start) !== null) {
      requireWaveTransition(wave, "IMPULSE", timestamp(wave?.impulse_start), wave?.impulse_observation_id, "IMPULSE");
    }
    if (upper(wave?.status) === "COMPLETED") {
      requireWaveTransition(wave, "RELOAD_BASE", timestamp(wave?.completed_ts), wave?.completion_observation_id, "COMPLETION");
    }
    if (upper(wave?.status) === "TERMINATED") {
      requireWaveTransition(
        wave,
        upper(wave?.termination_phase),
        timestamp(wave?.terminated_ts),
        wave?.termination_observation_id,
        "TERMINATION",
      );
    }
  }
  const completedLedgerWaves = waveLedger.filter((wave) => upper(wave?.status) === "COMPLETED");
  const latestCompletedTs = completedLedgerWaves.length
    ? timestamp(completedLedgerWaves.at(-1)?.completed_ts)
    : timestamp(campaign?.wave_ledger_anchor?.last_completed_ts);
  if ((completedWaves ?? 0) > 0 && baseTs !== latestCompletedTs) blockers.push("BASE_START_WAVE_COMPLETION_MISMATCH");
  if ((completedWaves ?? 0) === 0 && baseTs !== null) blockers.push("BASE_START_WITHOUT_COMPLETED_WAVE");

  const eventId = text(opportunityAnalysis?.event?.event_id);
  const admittedRaw = campaignInput?.admitted_event_id ?? result?.admitted_event_id;
  const admittedId = typeof admittedRaw === "string" ? admittedRaw : "";
  if (!validSafeId(admittedRaw, 512)) blockers.push("ADMITTED_EVENT_ID_MISSING");
  if (!eventId) blockers.push("OPPORTUNITY_EVENT_LINK_MISSING");
  if (admittedId && eventId && admittedId !== eventId) blockers.push("CAMPAIGN_ORPHAN_EVENT");
  if (!validSafeId(campaign?.last_event_id, 512)) blockers.push("CAMPAIGN_LAST_EVENT_ID_MISSING");
  else if (admittedId && admittedId !== text(campaign.last_event_id)) blockers.push("CAMPAIGN_EVENT_LINK_MISMATCH");
  if (!validSafeId(campaign?.origin_episode_id, 256)) missing.push("STABLE_ORIGIN_EPISODE_ID_MISSING");
  const campaignEpisodeRevision = integer(campaign?.episode_revision);
  const eventEpisodeRevision = integer(opportunityAnalysis?.event?.episode_revision);
  if (campaignEpisodeRevision === null || campaignEpisodeRevision < 0) missing.push("EPISODE_REVISION_MISSING");
  if (text(campaign?.origin_episode_id) && text(opportunityAnalysis?.event?.episode_id) && text(campaign.origin_episode_id) !== text(opportunityAnalysis.event.episode_id)) blockers.push("CAMPAIGN_EPISODE_LINK_MISMATCH");
  if (campaignEpisodeRevision !== null && eventEpisodeRevision !== null && campaignEpisodeRevision !== eventEpisodeRevision) blockers.push("CAMPAIGN_EPISODE_REVISION_MISMATCH");
  if (stateRevision === null || stateRevision < 1) missing.push("CAMPAIGN_STATE_REVISION_MISSING");
  if (history.length && priorRevision !== stateRevision) blockers.push("CAMPAIGN_STATE_REVISION_HISTORY_MISMATCH");
  if (!validSafeId(campaign?.observation_id, 256)) missing.push("CAMPAIGN_OBSERVATION_ID_MISSING");
  if (!validSafeId(result?.observation_id, 256) || result.observation_id !== campaign?.observation_id) blockers.push("CAMPAIGN_OBSERVATION_LINK_MISMATCH");
  if (campaign?.wave_facts_immutable !== true) missing.push("WAVE_FACT_IMMUTABILITY_NOT_PROVEN");
  if (campaign?.cas_persisted !== true) missing.push("CAMPAIGN_CAS_PERSISTENCE_NOT_PROVEN");

  let quality = "CLOSED";
  if (blockers.length) quality = "BLOCKED";
  else if (missing.length) quality = "INSUFFICIENT";
  return {
    quality,
    phase: PHASE_SET.has(phase) ? phase : "UNKNOWN",
    campaign,
    blockers: uniqSorted(blockers),
    missing: uniqSorted(missing),
    chase_active: chaseActive,
    entry_window_expired: entryWindowExpired,
    lifecycle_reasons: entryWindowExpired ? ["ENTRY_WINDOW_EXPIRED"] : [],
    duplicate_observation: result?.status === "DUPLICATE_OBSERVATION_SKIPPED",
    entry_action_id: expectedEntryActionId,
    persistence_receipt: persistenceReceipt,
  };
}

function timingForPhase(phase, chaseRisk) {
  if (TERMINAL_PHASES.has(phase)) return "EDGE_SPENT";
  if (phase === "EXHAUSTION_WARNING") return "LATE";
  if (chaseRisk === true) return "LATE";
  if (["DISCOVERY", "PRE_IMPULSE_WATCH", "ENTRY_CANDIDATE"].includes(phase)) return "EARLY";
  if (["ENTRY_TRIGGER", "NEXT_IMPULSE_ENTRY"].includes(phase)) return "ENTRY_WINDOW";
  if (phase === "IMPULSE") return "ACTIVE_MOVE";
  if (["RELOAD_BASE", "NEXT_IMPULSE_WATCH"].includes(phase)) return "RELOAD";
  return "INSUFFICIENT";
}

function safetyGateMaterial(input) {
  return {
    hard_veto: input?.hard_veto ?? null,
    execution_gate: input?.execution_gate ?? null,
  };
}

function analyzeSafetyGateReceipt(input, contract, observedTs, snapshotId) {
  const blockers = [];
  const missing = [];
  const receipt = input?.safety_gate_receipt;
  const contentDigest = fnv1a64(stableJson(safetyGateMaterial(input)));
  if (!receipt || typeof receipt !== "object") missing.push("SAFETY_GATE_RECEIPT_MISSING");
  else {
    if (receipt?.schema_version !== "safety-gate-receipt-v1" || upper(receipt?.status) !== "CLOSED" || receipt?.authoritative !== true) missing.push("SAFETY_GATE_RECEIPT_NOT_CLOSED");
    const receiptContract = normalizedContract(receipt?.contract_code);
    if (receiptContract.error || receiptContract.value !== contract || text(receipt?.snapshot_id) !== snapshotId || timestamp(receipt?.observed_ts) !== observedTs) blockers.push("SAFETY_GATE_RECEIPT_SNAPSHOT_MISMATCH");
    if (!validSafeId(receipt?.receipt_id, 256) || receipt?.persistence?.receipt_id !== receipt?.receipt_id || receipt?.rules_version !== "safety-gate-snapshot-v1") blockers.push("SAFETY_GATE_RECEIPT_PROVENANCE_INVALID");
    if (!validDigest(receipt?.content_digest) || receipt.content_digest !== contentDigest || !validDigest(receipt?.persistence?.content_digest) || receipt.persistence.content_digest !== contentDigest) blockers.push("SAFETY_GATE_RECEIPT_CONTENT_DIGEST_INVALID");
    const committedTs = timestamp(receipt?.persistence?.committed_ts);
    if (committedTs === null || committedTs > observedTs) blockers.push("SAFETY_GATE_RECEIPT_COMMIT_TIME_INVALID");
    const gateAvailableTimes = [
      input?.hard_veto?.available_ts, input?.execution_gate?.available_ts,
      input?.execution_gate?.entry_sides?.LONG?.available_ts, input?.execution_gate?.entry_sides?.SHORT?.available_ts,
      input?.execution_gate?.close_sides?.LONG?.available_ts, input?.execution_gate?.close_sides?.SHORT?.available_ts,
    ].map(timestamp).filter((value) => value !== null);
    if (committedTs !== null && gateAvailableTimes.length && committedTs < Math.max(...gateAvailableTimes)) blockers.push("SAFETY_GATE_RECEIPT_PRECEDES_INPUT_AVAILABILITY");
    if (upper(receipt?.persistence?.status) !== "CLOSED" || receipt?.persistence?.immutable !== true || receipt?.persistence?.verification_method !== "D1_IMMUTABLE_RECEIPT") missing.push("SAFETY_GATE_RECEIPT_IMMUTABILITY_NOT_PROVEN");
  }
  return {
    quality: blockers.length ? "BLOCKED" : missing.length ? "INSUFFICIENT" : "CLOSED",
    receipt_id: validSafeId(receipt?.receipt_id, 256) ? receipt.receipt_id : null,
    content_digest: validDigest(receipt?.content_digest) ? receipt.content_digest : null,
    committed_ts: timestamp(receipt?.persistence?.committed_ts),
    blockers: uniqSorted(blockers),
    missing: uniqSorted(missing),
  };
}

function analyzeHardVeto(input, contract, observedTs, snapshotId, safetyReceipt) {
  const veto = input?.hard_veto;
  const blockers = [];
  const missing = [];
  let nestedVeto = false;
  let malformedVetoAlias = false;
  const campaignState = input?.campaign?.campaign || input?.campaign;
  const currentWaveId = text(campaignState?.current_wave_id);
  const waveLedger = Array.isArray(campaignState?.wave_ledger) ? campaignState.wave_ledger : [];
  const campaignPathPrefix = input?.campaign?.campaign ? "$.campaign.campaign" : "$.campaign";
  const scan = boundedWalk(input, (value, path) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const ledgerPrefix = `${campaignPathPrefix}.wave_ledger[`;
    const ledgerSuffix = path.startsWith(ledgerPrefix) ? path.slice(ledgerPrefix.length).split("]", 1)[0] : "";
    const ledgerIndex = /^[0-9]+$/.test(ledgerSuffix) ? Number(ledgerSuffix) : null;
    const ledgerRow = ledgerIndex !== null ? waveLedger[ledgerIndex] : null;
    const historicalWavePath = Boolean(ledgerIndex !== null && (
      text(ledgerRow?.wave_id) !== currentWaveId || ["COMPLETED", "TERMINATED"].includes(upper(ledgerRow?.status))
    ));
    const historicalPath = path.startsWith(`${campaignPathPrefix}.transition_history[`) || historicalWavePath ||
      path.startsWith(`${campaignPathPrefix}.history_anchor`) || path.startsWith(`${campaignPathPrefix}.wave_ledger_anchor`);
    for (const [key, field] of boundedDataEntries(value)) {
      const canonicalKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (historicalPath) continue;
      if (["hardvetoactive", "executionblocked"].includes(canonicalKey)) {
        if (typeof field !== "boolean") malformedVetoAlias = true;
        else if (field) nestedVeto = true;
      }
      if (canonicalKey === "hardveto" && !(path === "$" && key === "hard_veto")) {
        malformedVetoAlias = true;
        if (field === true || (field && typeof field === "object" && (upper(field?.status) === "VETO" || field?.active === true))) nestedVeto = true;
      }
    }
    if (/hard[_-]?veto/i.test(path) && (upper(value?.status) === "VETO" || value?.active === true)) nestedVeto = true;
  });
  if (scan.overflow) blockers.push("VETO_SCAN_BOUNDS_EXCEEDED");
  if (malformedVetoAlias) blockers.push("HARD_VETO_ALIAS_MALFORMED");
  if (!veto || typeof veto !== "object") missing.push("AUTHORITATIVE_HARD_VETO_MISSING");
  if (veto && (!validSafeId(veto?.snapshot_id) || text(veto.snapshot_id) !== snapshotId)) blockers.push("HARD_VETO_SNAPSHOT_MISMATCH");
  const status = upper(veto?.status);
  if (veto && !["CLEAR", "VETO"].includes(status)) missing.push("HARD_VETO_STATUS_UNKNOWN");
  if (veto?.authoritative !== true) missing.push("HARD_VETO_NOT_AUTHORITATIVE");
  if (!validSafeId(veto?.safety_gate_receipt_id, 256) || veto.safety_gate_receipt_id !== safetyReceipt?.receipt_id || veto?.producer_rules_version !== "safety-gate-snapshot-v1") blockers.push("HARD_VETO_RECEIPT_LINK_INVALID");
  blockers.push(...(safetyReceipt?.blockers || []));
  missing.push(...(safetyReceipt?.missing || []));
  const c = normalizedContract(veto?.contract_code);
  if (veto && (c.error || c.value !== contract)) blockers.push("HARD_VETO_CONTRACT_MISMATCH");
  const sourceTs = timestamp(veto?.source_ts);
  const validUntilTs = timestamp(veto?.valid_until_ts);
  if (veto && sourceTs === null) missing.push("HARD_VETO_SOURCE_TS_MISSING");
  else if (sourceTs !== null && sourceTs > observedTs) blockers.push("HARD_VETO_FROM_FUTURE");
  if (veto && validUntilTs === null) missing.push("HARD_VETO_VALID_UNTIL_MISSING");
  else if (validUntilTs !== null && validUntilTs < observedTs) missing.push("HARD_VETO_STALE");
  if (veto) {
    const freshness = freshnessContract(veto, observedTs, AUTHORITATIVE_STATE_FRESHNESS_MS.HARD_VETO, "HARD_VETO");
    blockers.push(...freshness.blockers);
    missing.push(...freshness.missing);
  }
  const rawActive = status === "VETO" || nestedVeto;
  if (status === "CLEAR" && nestedVeto) blockers.push("HARD_VETO_SOURCE_CONFLICT");
  const quality = blockers.length ? "BLOCKED" : missing.length ? "INSUFFICIENT" : "CLOSED";
  const active = rawActive && quality === "CLOSED";
  return {
    state: active ? "ACTIVE" : quality === "BLOCKED" ? "BLOCKED" : quality === "INSUFFICIENT" ? "INSUFFICIENT" : "CLEAR",
    quality,
    active,
    raw_active: rawActive,
    reasons: uniqSorted([...(Array.isArray(veto?.reasons) ? veto.reasons : []), ...(nestedVeto ? ["NESTED_HARD_VETO"] : [])]),
    blockers: uniqSorted(blockers),
    missing: uniqSorted(missing),
  };
}

function analyzeExecutionGate(input, fullAnalysis, contract, observedTs, direction, snapshotId, safetyReceipt, lane = "ENTRY") {
  const gate = input?.execution_gate;
  const blockers = [];
  const missing = [];
  if (!gate || typeof gate !== "object") missing.push("AUTHORITATIVE_EXECUTION_GATE_MISSING");
  if (gate && (!validSafeId(gate?.snapshot_id) || text(gate.snapshot_id) !== snapshotId)) blockers.push("EXECUTION_GATE_SNAPSHOT_MISMATCH");
  if (gate?.authoritative !== true) missing.push("EXECUTION_GATE_NOT_AUTHORITATIVE");
  if (!validSafeId(gate?.safety_gate_receipt_id, 256) || gate.safety_gate_receipt_id !== safetyReceipt?.receipt_id || gate?.producer_rules_version !== "safety-gate-snapshot-v1") blockers.push("EXECUTION_GATE_RECEIPT_LINK_INVALID");
  blockers.push(...(safetyReceipt?.blockers || []));
  missing.push(...(safetyReceipt?.missing || []));
  const c = normalizedContract(gate?.contract_code);
  if (gate && (c.error || c.value !== contract)) blockers.push("EXECUTION_GATE_CONTRACT_MISMATCH");
  const sourceTs = timestamp(gate?.source_ts);
  const validUntilTs = timestamp(gate?.valid_until_ts);
  if (gate && sourceTs === null) missing.push("EXECUTION_GATE_SOURCE_TS_MISSING");
  else if (sourceTs !== null && sourceTs > observedTs) blockers.push("EXECUTION_GATE_FROM_FUTURE");
  if (gate && validUntilTs === null) missing.push("EXECUTION_GATE_VALID_UNTIL_MISSING");
  else if (validUntilTs !== null && validUntilTs < observedTs) missing.push("EXECUTION_GATE_STALE");
  if (gate?.execution_blocked === true) blockers.push("EXECUTION_GATE_EXPLICITLY_BLOCKED");
  if (gate) {
    const freshness = freshnessContract(gate, observedTs, AUTHORITATIVE_STATE_FRESHNESS_MS.EXECUTION_GATE, "EXECUTION_GATE");
    blockers.push(...freshness.blockers);
    missing.push(...freshness.missing);
  }
  if (upper(gate?.status) !== "CLOSED" || gate?.htx_execution_gate_closed !== true) missing.push("HTX_EXECUTION_GATE_NOT_CLOSED");
  if (lane !== "MANAGEMENT_CLOSE" && fullAnalysis.execution_claim !== true) missing.push("FULL_EVIDENCE_HTX_GATE_NOT_CLOSED");
  if (["LONG", "SHORT"].includes(direction)) {
    const side = lane === "MANAGEMENT_CLOSE" ? gate?.close_sides?.[direction] : gate?.entry_sides?.[direction];
    const expectedIntent = lane === "MANAGEMENT_CLOSE"
      ? (direction === "LONG" ? "CLOSE_LONG_SELL" : "CLOSE_SHORT_BUY")
      : (direction === "LONG" ? "OPEN_LONG_BUY" : "OPEN_SHORT_SELL");
    if (!side || upper(side?.status) !== "CLOSED" || side?.measurable !== true || upper(side?.intent) !== expectedIntent) missing.push(`${lane}_SIDE_EXECUTION_NOT_MEASURABLE:${direction}`);
    const sideSourceTs = timestamp(side?.source_ts);
    const sideValidUntilTs = timestamp(side?.valid_until_ts);
    if (side && sideSourceTs === null) missing.push(`${lane}_SIDE_SOURCE_TS_MISSING:${direction}`);
    else if (sideSourceTs !== null && sideSourceTs > observedTs) blockers.push(`${lane}_SIDE_EXECUTION_FROM_FUTURE:${direction}`);
    if (side && sideValidUntilTs === null) missing.push(`${lane}_SIDE_VALID_UNTIL_MISSING:${direction}`);
    else if (sideValidUntilTs !== null && sideValidUntilTs < observedTs) missing.push(`${lane}_SIDE_EXECUTION_STALE:${direction}`);
    if (side) {
      const freshness = freshnessContract(side, observedTs, AUTHORITATIVE_STATE_FRESHNESS_MS.EXECUTION_SIDE, `${lane}_SIDE_${direction}`);
      blockers.push(...freshness.blockers);
      missing.push(...freshness.missing);
    }
  } else {
    missing.push(`${lane}_DIRECTION_REQUIRED_FOR_SIDE_EXECUTION`);
  }
  const quality = blockers.length ? "BLOCKED" : missing.length ? "INSUFFICIENT" : "CLOSED";
  return { quality, blockers: uniqSorted(blockers), missing: uniqSorted(missing) };
}

function analyzePosition(position, observedTs, contract, snapshotId) {
  const blockers = [];
  const missing = [];
  const state = upper(position?.state || "UNKNOWN");
  const persistenceReceipt = immutableObjectReceipt(position, "POSITION", observedTs, timestamp(position?.available_ts));
  blockers.push(...persistenceReceipt.blockers);
  missing.push(...persistenceReceipt.missing);
  if (typeof position?.state !== "string" || !VALID_POSITION.has(state)) blockers.push("INVALID_POSITION_STATE");
  if (position?.schema_version !== "shadow-position-ledger-v1" || position?.producer_rules_version !== "shadow-position-ledger-v1") blockers.push("POSITION_SCHEMA_OR_RULES_UNSUPPORTED");
  if (position && (!validSafeId(position?.snapshot_id) || text(position.snapshot_id) !== snapshotId)) blockers.push("POSITION_SNAPSHOT_MISMATCH");
  if (position?.authoritative !== true) missing.push("POSITION_STATE_NOT_AUTHORITATIVE");
  const positionContract = normalizedContract(position?.contract_code);
  if (position && (positionContract.error || positionContract.value !== contract)) blockers.push("POSITION_CONTRACT_MISMATCH");
  const sourceTs = timestamp(position?.source_ts);
  const availableTs = timestamp(position?.available_ts);
  const validUntilTs = timestamp(position?.valid_until_ts);
  if (sourceTs === null) missing.push("POSITION_SOURCE_TS_MISSING");
  else if (sourceTs > observedTs) blockers.push("POSITION_STATE_FROM_FUTURE");
  if (validUntilTs === null) missing.push("POSITION_VALID_UNTIL_MISSING");
  else if (validUntilTs < observedTs) missing.push("POSITION_STATE_STALE");
  if (integer(position?.state_revision) === null || integer(position?.state_revision) < 0) missing.push("POSITION_STATE_REVISION_MISSING");
  if (position) {
    const freshness = freshnessContract(position, observedTs, AUTHORITATIVE_STATE_FRESHNESS_MS.POSITION, "POSITION");
    blockers.push(...freshness.blockers);
    missing.push(...freshness.missing);
  }
  if (["OPEN_LONG", "OPEN_SHORT"].includes(state)) {
    if (typeof position?.mode !== "string" || upper(position.mode) !== "SHADOW_VIRTUAL") blockers.push("NON_SHADOW_POSITION_FORBIDDEN");
    if (!validSafeId(position?.position_id, 256)) missing.push("POSITION_ID_MISSING");
    const entryTs = timestamp(position?.entry_ts);
    if (entryTs === null) missing.push("POSITION_ENTRY_TS_MISSING");
    else if (entryTs > observedTs) blockers.push("POSITION_ENTRY_FROM_FUTURE");
    if (typeof position?.direction !== "string" || (state === "OPEN_LONG" && upper(position.direction) !== "LONG") || (state === "OPEN_SHORT" && upper(position.direction) !== "SHORT")) blockers.push("POSITION_DIRECTION_MISMATCH");
    if (!validSafeId(position?.campaign_id, 256)) blockers.push("POSITION_ORIGIN_CAMPAIGN_ID_INVALID");
    if (!validSafeId(position?.entry_wave_id, 320) || !text(position.entry_wave_id).startsWith(`${text(position?.campaign_id)}:W`)) blockers.push("POSITION_ENTRY_WAVE_MISMATCH");
    const entryDecisionTs = timestamp(position?.entry_decision_observation_ts);
    const entryDecisionDigest = text(position?.entry_decision_material_digest);
    if (!validSafeId(position?.entry_decision_id, 320) || entryDecisionTs === null || !validDigest(position?.entry_decision_material_digest) || position.entry_decision_id !== `FDI:${contract}:${entryDecisionTs}:${entryDecisionDigest}` || entryDecisionTs > observedTs || (entryTs !== null && entryDecisionTs < entryTs)) blockers.push("POSITION_ENTRY_DECISION_LINK_INVALID");
    if (entryDecisionTs !== null && (
      (sourceTs !== null && sourceTs < entryDecisionTs) ||
      (availableTs !== null && availableTs < entryDecisionTs) ||
      (persistenceReceipt.committed_ts !== null && persistenceReceipt.committed_ts < entryDecisionTs)
    )) blockers.push("POSITION_LEDGER_PRECEDES_ENTRY_DECISION");
    const expectedEntryActionId = entryTs !== null && validSafeId(position?.campaign_id, 256) && validSafeId(position?.entry_wave_id, 320)
      ? `FDE:${fnv1a64(stableJson([contract, text(position.campaign_id), text(position.entry_wave_id), entryTs]))}`
      : null;
    if (!validSafeId(position?.entry_action_id, 320) || position.entry_action_id !== expectedEntryActionId) blockers.push("POSITION_ENTRY_ACTION_LINK_INVALID");
  }
  else if (["FLAT", "NONE"].includes(state)) {
    const forbiddenOpenFields = [
      "mode", "position_id", "entry_ts", "direction", "campaign_id", "entry_wave_id",
      "entry_decision_observation_ts", "entry_decision_material_digest", "entry_decision_id", "entry_action_id",
    ];
    if (forbiddenOpenFields.some((field) => position?.[field] !== undefined && position?.[field] !== null)) blockers.push("FLAT_POSITION_HAS_OPEN_STATE_FACTS");
  }
  if (state === "UNKNOWN" || state === "NOT_EVALUATED") missing.push("POSITION_STATE_UNKNOWN");
  return {
    state: VALID_POSITION.has(state) ? state : "UNKNOWN",
    quality: blockers.length ? "BLOCKED" : missing.length ? "INSUFFICIENT" : "CLOSED",
    position,
    blockers: uniqSorted(blockers),
    missing: uniqSorted(missing),
    persistence_receipt: persistenceReceipt,
  };
}

function emptyLineageReceipt() {
  return { receipt_id: null, content_digest: null, committed_ts: null };
}

function atomicLineageReceipt(receipt, observedTs) {
  const receiptId = receipt?.receipt_id;
  const contentDigest = receipt?.content_digest;
  const committedTs = timestamp(receipt?.committed_ts);
  if (!validSafeId(receiptId, 256) || !validDigest(contentDigest) || committedTs === null || committedTs > observedTs) {
    return emptyLineageReceipt();
  }
  return { receipt_id: receiptId, content_digest: contentDigest, committed_ts: committedTs };
}

function analyzePositionOriginCampaign(origin, positionAnalysis, observedTs, contract) {
  const blockers = [];
  const missing = [];
  const open = ["OPEN_LONG", "OPEN_SHORT"].includes(positionAnalysis?.state);
  if (!open) {
    if (origin !== null && origin !== undefined) blockers.push("FLAT_POSITION_HAS_ORIGIN_CAMPAIGN_CONTEXT");
    return {
      quality: blockers.length ? "BLOCKED" : "NOT_EVALUATED",
      blockers,
      missing,
      origin: null,
      persistence_receipt: emptyLineageReceipt(),
    };
  }
  if (!origin || typeof origin !== "object") {
    return {
      quality: "INSUFFICIENT",
      blockers,
      missing: ["POSITION_ORIGIN_CAMPAIGN_MISSING"],
      origin: null,
      persistence_receipt: emptyLineageReceipt(),
    };
  }

  const sourceCampaignCommittedTs = timestamp(origin?.source_campaign_committed_ts);
  const persistenceReceipt = immutableObjectReceipt(origin, "POSITION_ORIGIN_CAMPAIGN", observedTs, sourceCampaignCommittedTs);
  blockers.push(...persistenceReceipt.blockers);
  missing.push(...persistenceReceipt.missing);
  if (origin?.schema_version !== "shadow-position-origin-campaign-v2" || origin?.producer_rules_version !== "shadow-position-origin-campaign-v2") blockers.push("POSITION_ORIGIN_CAMPAIGN_SCHEMA_OR_RULES_UNSUPPORTED");
  if (upper(origin?.status) !== "CLOSED" || origin?.authoritative !== true) missing.push("POSITION_ORIGIN_CAMPAIGN_NOT_CLOSED");
  const originContract = normalizedContract(origin?.contract_code);
  if (originContract.error || originContract.value !== contract) blockers.push("POSITION_ORIGIN_CAMPAIGN_CONTRACT_MISMATCH");

  const position = positionAnalysis?.position;
  const direction = upper(origin?.direction);
  const entryTs = timestamp(origin?.entry_trigger_ts);
  const entryPrice = finite(origin?.entry_trigger_price);
  const entryObservationId = text(origin?.entry_observation_id);
  const stateRevision = integer(origin?.campaign_state_revision_at_entry);
  const entryWavePrefix = validSafeId(origin?.campaign_id, 256) ? `${origin.campaign_id}:W` : null;
  const entryWaveSuffix = entryWavePrefix && typeof origin?.entry_wave_id === "string" && origin.entry_wave_id.startsWith(entryWavePrefix)
    ? origin.entry_wave_id.slice(entryWavePrefix.length)
    : "";
  const entryWaveIndex = /^[1-9][0-9]*$/.test(entryWaveSuffix) && Number.isSafeInteger(Number(entryWaveSuffix))
    ? Number(entryWaveSuffix)
    : null;
  if (!validSafeId(origin?.campaign_id, 256) || text(origin?.campaign_id) !== text(position?.campaign_id)) blockers.push("POSITION_ORIGIN_CAMPAIGN_ID_MISMATCH");
  if (!validSafeId(origin?.entry_wave_id, 320) || text(origin?.entry_wave_id) !== text(position?.entry_wave_id) || !text(origin?.entry_wave_id).startsWith(`${text(origin?.campaign_id)}:W`)) blockers.push("POSITION_ORIGIN_WAVE_ID_MISMATCH");
  if (typeof origin?.direction !== "string" || !["LONG", "SHORT"].includes(direction) || direction !== upper(position?.direction)) blockers.push("POSITION_ORIGIN_DIRECTION_MISMATCH");
  if (entryTs === null || entryTs !== timestamp(position?.entry_ts) || entryTs > observedTs) blockers.push("POSITION_ORIGIN_ENTRY_TIME_MISMATCH");
  if (entryPrice === null || entryPrice <= 0 || !validSafeId(entryObservationId, 256)) blockers.push("POSITION_ORIGIN_ENTRY_PROJECTION_INVALID");
  if (stateRevision === null || stateRevision < 1) blockers.push("POSITION_ORIGIN_STATE_REVISION_INVALID");
  if (entryWaveIndex === null || entryWaveIndex > Math.floor(Number.MAX_SAFE_INTEGER / 4) || stateRevision !== 4 * entryWaveIndex) blockers.push("POSITION_ORIGIN_ENTRY_REVISION_WAVE_MISMATCH");
  const expectedEntryActionId = entryTs !== null && validSafeId(origin?.campaign_id, 256) && validSafeId(origin?.entry_wave_id, 320)
    ? `FDE:${fnv1a64(stableJson([contract, text(origin.campaign_id), text(origin.entry_wave_id), entryTs]))}`
    : null;
  if (!validSafeId(origin?.entry_action_id, 320) || origin.entry_action_id !== expectedEntryActionId || origin.entry_action_id !== position?.entry_action_id) blockers.push("POSITION_ORIGIN_ENTRY_ACTION_MISMATCH");
  const expectedSourceCampaignContentDigest = entryTs !== null && entryPrice !== null && stateRevision !== null
    ? fnv1a64(stableJson([
        text(origin?.campaign_id), direction, text(origin?.entry_wave_id), entryTs,
        entryPrice, entryObservationId, stateRevision,
      ]))
    : null;
  if (!validSafeId(origin?.source_campaign_receipt_id, 256) || !validDigest(origin?.source_campaign_content_digest) || origin.source_campaign_content_digest !== expectedSourceCampaignContentDigest) blockers.push("POSITION_ORIGIN_SOURCE_RECEIPT_INVALID");
  if (sourceCampaignCommittedTs === null || sourceCampaignCommittedTs < (entryTs ?? Number.MAX_SAFE_INTEGER) || sourceCampaignCommittedTs > observedTs) blockers.push("POSITION_ORIGIN_SOURCE_COMMIT_TIME_INVALID");
  const entryDecisionTs = timestamp(position?.entry_decision_observation_ts);
  if (sourceCampaignCommittedTs !== null && entryDecisionTs !== null && sourceCampaignCommittedTs > entryDecisionTs) blockers.push("POSITION_ORIGIN_SOURCE_COMMIT_AFTER_ENTRY_DECISION");
  return {
    quality: blockers.length ? "BLOCKED" : missing.length ? "INSUFFICIENT" : "CLOSED",
    blockers: uniqSorted(blockers),
    missing: uniqSorted(missing),
    origin,
    entry_wave_index: entryWaveIndex,
    persistence_receipt: persistenceReceipt,
  };
}

function analyzePositionManagementContext(context, positionAnalysis, originAnalysis, observedTs, contract, snapshotId, availableEvidenceReceipts = []) {
  const blockers = [];
  const missing = [];
  const open = ["OPEN_LONG", "OPEN_SHORT"].includes(positionAnalysis?.state);
  if (!open) {
    if (context !== null && context !== undefined) blockers.push("FLAT_POSITION_HAS_MANAGEMENT_CONTEXT");
    return {
      quality: blockers.length ? "BLOCKED" : "NOT_EVALUATED",
      risk_state: "NOT_EVALUATED",
      risk_reason_codes: [],
      blockers,
      missing,
      persistence_receipt: emptyLineageReceipt(),
    };
  }
  if (!context || typeof context !== "object") {
    return {
      quality: "INSUFFICIENT",
      risk_state: "INSUFFICIENT",
      risk_reason_codes: [],
      blockers,
      missing: ["POSITION_MANAGEMENT_CONTEXT_MISSING"],
      persistence_receipt: emptyLineageReceipt(),
    };
  }

  const contextAvailableTs = timestamp(context?.available_ts);
  const persistenceReceipt = immutableObjectReceipt(context, "POSITION_MANAGEMENT_CONTEXT", observedTs, contextAvailableTs);
  blockers.push(...persistenceReceipt.blockers);
  missing.push(...persistenceReceipt.missing);
  if (context?.schema_version !== "shadow-position-management-context-v1" || context?.producer_rules_version !== "shadow-position-management-context-v1") blockers.push("POSITION_MANAGEMENT_CONTEXT_SCHEMA_OR_RULES_UNSUPPORTED");
  if (upper(context?.status) !== "CLOSED" || context?.authoritative !== true) missing.push("POSITION_MANAGEMENT_CONTEXT_NOT_CLOSED");
  const contextContract = normalizedContract(context?.contract_code);
  if (contextContract.error || contextContract.value !== contract) blockers.push("POSITION_MANAGEMENT_CONTEXT_CONTRACT_MISMATCH");
  if (!validSafeId(context?.snapshot_id) || text(context.snapshot_id) !== snapshotId) blockers.push("POSITION_MANAGEMENT_CONTEXT_SNAPSHOT_MISMATCH");
  if (!validSafeId(context?.assessment_id, 256)) blockers.push("POSITION_MANAGEMENT_ASSESSMENT_ID_INVALID");

  const position = positionAnalysis?.position;
  const origin = originAnalysis?.origin;
  if (!validSafeId(context?.position_id, 256) || context.position_id !== position?.position_id || integer(context?.position_state_revision) !== integer(position?.state_revision) || typeof context?.position_direction !== "string" || upper(context.position_direction) !== upper(position?.direction) || !validSafeId(context?.position_receipt_id, 256) || context.position_receipt_id !== positionAnalysis?.persistence_receipt?.receipt_id) blockers.push("POSITION_MANAGEMENT_CONTEXT_POSITION_LINK_MISMATCH");
  if (!origin || !validSafeId(context?.origin_campaign_id, 256) || context.origin_campaign_id !== origin?.campaign_id || !validSafeId(context?.origin_wave_id, 320) || context.origin_wave_id !== origin?.entry_wave_id || !validSafeId(context?.origin_campaign_receipt_id, 256) || context.origin_campaign_receipt_id !== originAnalysis?.persistence_receipt?.receipt_id) blockers.push("POSITION_MANAGEMENT_CONTEXT_ORIGIN_LINK_MISMATCH");
  if (contextAvailableTs !== null && timestamp(positionAnalysis?.persistence_receipt?.committed_ts) !== null && positionAnalysis.persistence_receipt.committed_ts > contextAvailableTs) blockers.push("POSITION_MANAGEMENT_POSITION_RECEIPT_NOT_AVAILABLE_AT_ASSESSMENT");
  if (contextAvailableTs !== null && timestamp(originAnalysis?.persistence_receipt?.committed_ts) !== null && originAnalysis.persistence_receipt.committed_ts > contextAvailableTs) blockers.push("POSITION_MANAGEMENT_ORIGIN_RECEIPT_NOT_AVAILABLE_AT_ASSESSMENT");
  if (context?.invalidation_evaluated !== true) missing.push("POSITION_INVALIDATION_NOT_EVALUATED");
  const riskState = upper(context?.risk_state);
  if (!["CLEAR", "CAUTION", "INVALIDATED"].includes(riskState)) blockers.push("POSITION_MANAGEMENT_RISK_STATE_INVALID");

  const evidenceReceiptIds = Array.isArray(context?.evidence_receipt_ids) ? context.evidence_receipt_ids : [];
  if (!Array.isArray(context?.evidence_receipt_ids) || evidenceReceiptIds.length < 1) missing.push("POSITION_MANAGEMENT_EVIDENCE_RECEIPTS_MISSING");
  else if (evidenceReceiptIds.length > 16 || new Set(evidenceReceiptIds).size !== evidenceReceiptIds.length || evidenceReceiptIds.some((id) => !validSafeId(id, 256))) blockers.push("POSITION_MANAGEMENT_EVIDENCE_RECEIPTS_INVALID");
  else {
    const availableReceipts = new Map();
    for (const descriptor of availableEvidenceReceipts) {
      const receiptId = text(descriptor?.receipt_id);
      const descriptorValid = validSafeId(receiptId, 256) &&
        validSafeId(descriptor?.kind, 64) &&
        timestamp(descriptor?.committed_ts) !== null &&
        validDigest(descriptor?.content_digest) &&
        typeof descriptor?.risk_evidence_eligible === "boolean" &&
        typeof descriptor?.invalidates_long === "boolean" &&
        typeof descriptor?.invalidates_short === "boolean";
      if (!descriptorValid) continue;
      if (availableReceipts.has(receiptId)) blockers.push("POSITION_MANAGEMENT_AVAILABLE_RECEIPT_ID_COLLISION");
      else availableReceipts.set(receiptId, descriptor);
    }
    const cited = evidenceReceiptIds.map((id) => availableReceipts.get(id));
    if (cited.some((descriptor) => !descriptor)) blockers.push("POSITION_MANAGEMENT_EVIDENCE_RECEIPT_NOT_IN_INPUT_LINEAGE");
    if (contextAvailableTs !== null && cited.some((descriptor) => descriptor && descriptor.committed_ts > contextAvailableTs)) blockers.push("POSITION_MANAGEMENT_EVIDENCE_RECEIPT_NOT_AVAILABLE_AT_ASSESSMENT");
    if (!cited.some((descriptor) => descriptor?.risk_evidence_eligible === true)) blockers.push("POSITION_MANAGEMENT_RISK_EVIDENCE_RECEIPT_MISSING");
    const positionDirection = upper(position?.direction);
    const citedInvalidatesPosition = cited.some((descriptor) => descriptor && (
      (positionDirection === "LONG" && descriptor.invalidates_long === true) ||
      (positionDirection === "SHORT" && descriptor.invalidates_short === true)
    ));
    if (citedInvalidatesPosition && riskState !== "INVALIDATED") blockers.push("POSITION_MANAGEMENT_RISK_STATE_CONTRADICTS_CITED_INVALIDATION");
  }
  const riskReasons = Array.isArray(context?.risk_reason_codes) ? context.risk_reason_codes : [];
  if (!Array.isArray(context?.risk_reason_codes) || riskReasons.length > 16 || new Set(riskReasons).size !== riskReasons.length || riskReasons.some((code) => typeof code !== "string" || !/^[A-Z][A-Z0-9_.:-]{0,95}$/.test(code))) blockers.push("POSITION_MANAGEMENT_RISK_REASONS_INVALID");
  if (riskState === "CLEAR" && riskReasons.length !== 0) blockers.push("CLEAR_POSITION_RISK_HAS_REASONS");
  if (["CAUTION", "INVALIDATED"].includes(riskState) && riskReasons.length < 1) blockers.push("NONCLEAR_POSITION_RISK_REASON_MISSING");

  const freshness = freshnessContract(context, observedTs, AUTHORITATIVE_STATE_FRESHNESS_MS.POSITION_MANAGEMENT_CONTEXT, "POSITION_MANAGEMENT_CONTEXT");
  blockers.push(...freshness.blockers);
  missing.push(...freshness.missing);
  const expectedAssessmentId = validSafeId(position?.position_id, 256) && integer(position?.state_revision) !== null && freshness.source_ts !== null && validSafeId(originAnalysis?.persistence_receipt?.receipt_id, 256)
    ? `PMA:${fnv1a64(stableJson([
        contract,
        text(position.position_id),
        integer(position.state_revision),
        freshness.source_ts,
        text(originAnalysis.persistence_receipt.receipt_id),
        [...evidenceReceiptIds].sort(),
        riskState,
      ]))}`
    : null;
  if (!expectedAssessmentId || context?.assessment_id !== expectedAssessmentId) blockers.push("POSITION_MANAGEMENT_ASSESSMENT_ID_MISMATCH");
  return {
    quality: blockers.length ? "BLOCKED" : missing.length ? "INSUFFICIENT" : "CLOSED",
    risk_state: ["CLEAR", "CAUTION", "INVALIDATED"].includes(riskState) ? riskState : "BLOCKED",
    risk_reason_codes: uniqSorted(riskReasons.filter((code) => typeof code === "string").map(reasonCode), 16),
    blockers: uniqSorted(blockers),
    missing: uniqSorted(missing),
    persistence_receipt: persistenceReceipt,
  };
}

function compactDomainEvidence(analysis, direction) {
  const confirmations = [];
  const contradictions = [];
  for (const [domain, state] of Object.entries(analysis.domains)) {
    if (state.state === direction) confirmations.push(`${domain}:${state.support_ids.join(",")}`);
    else if (["LONG", "SHORT"].includes(state.state) && state.state !== direction) contradictions.push(`${domain}:${state.state}:${state.support_ids.join(",")}`);
    else if (state.state === "CONFLICTING") contradictions.push(`${domain}:INTERNAL_CONFLICT:${state.support_ids.join(",")}`);
  }
  const invalidationIds = direction === "LONG" ? analysis.invalidates_long_ids : direction === "SHORT" ? analysis.invalidates_short_ids : [];
  contradictions.push(...invalidationIds.map((id) => `INVALIDATES_${direction}:${id}`));
  return { confirmations: uniqSorted(confirmations), contradictions: uniqSorted(contradictions), invalidationIds };
}

function buildFinalDecisionIntegrationShadowCore(input = {}, forcedTopBlockers = []) {
  const safety = finalDecisionSafetyEnvelope();
  const safetyViolations = scanSafety(input);
  const contractResult = normalizedContract(input?.contract_code);
  const contract = contractResult.value;
  const observedTs = timestamp(input?.observed_ts);
  const snapshotId = text(input?.snapshot_id);
  const topBlockers = [...forcedTopBlockers];
  const topMissing = [];
  if (contractResult.error) topBlockers.push(contractResult.error);
  if (observedTs === null) topBlockers.push("INVALID_OBSERVED_TS");
  if (!validSafeId(snapshotId)) topBlockers.push("INVALID_SNAPSHOT_ID");
  if (safetyViolations.length) topBlockers.push(...safetyViolations);
  const safeContract = contract || "INVALID";
  const safeObservedTs = observedTs ?? 1;
  const safeSnapshotId = validSafeId(snapshotId) ? snapshotId : "INVALID-SNAPSHOT";

  const opportunity = analyzeOpportunity(input?.opportunity, safeContract, safeObservedTs, snapshotId);
  const expectedEpisode = opportunity?.event ? {
    id: text(opportunity.event.episode_id),
    revision: integer(opportunity.event.episode_revision),
  } : null;
  const evidence = analyzeEvidence(input?.decision_evidence, safeContract, safeObservedTs, snapshotId, expectedEpisode, input?.evidence_registry);
  const safetyReceipt = analyzeSafetyGateReceipt(input, safeContract, safeObservedTs, snapshotId);
  const full = analyzeFullEvidence(input?.full_evidence, safeContract, safeObservedTs, snapshotId, safetyReceipt);
  const crossPlaneReuse = analyzeCrossPlaneEvidenceReuse(evidence, full);
  const independenceState = ["BLOCKED", "CONFLICTING"].includes(evidence.independence_state)
    ? evidence.independence_state
    : crossPlaneReuse.state === "CORRELATED"
      ? "CORRELATED"
      : evidence.independence_state;
  const campaign = analyzeCampaign(input?.campaign, opportunity, evidence, safeContract, safeObservedTs, snapshotId);
  const veto = analyzeHardVeto(input, safeContract, safeObservedTs, snapshotId, safetyReceipt);
  const position = analyzePosition(input?.position, safeObservedTs, safeContract, snapshotId);
  const positionOrigin = analyzePositionOriginCampaign(input?.position_origin_campaign, position, safeObservedTs, safeContract);
  const evidenceRegistryClosed = evidence.errors.length === 0 && evidence.blockers.length === 0 && evidence.missing.length === 0;
  const positionDirectionForManagement = position.state === "OPEN_LONG" ? "LONG" : position.state === "OPEN_SHORT" ? "SHORT" : null;
  const decisionRegistryInvalidatesLong = evidence.usable.some((row) => row.causal_domain === "RISK_INVALIDATION" && row.effect === "INVALIDATE" && row.stance === "LONG");
  const decisionRegistryInvalidatesShort = evidence.usable.some((row) => row.causal_domain === "RISK_INVALIDATION" && row.effect === "INVALIDATE" && row.stance === "SHORT");
  const decisionRegistryPotentialInvalidatesLong = evidence.normalized.some((row) => row.errors.length === 0 && row.causal_domain === "RISK_INVALIDATION" && row.effect === "INVALIDATE" && row.stance === "LONG");
  const decisionRegistryPotentialInvalidatesShort = evidence.normalized.some((row) => row.errors.length === 0 && row.causal_domain === "RISK_INVALIDATION" && row.effect === "INVALIDATE" && row.stance === "SHORT");
  const decisionRegistryHasPositionRiskEvidence = positionDirectionForManagement === "LONG"
    ? decisionRegistryInvalidatesLong
    : positionDirectionForManagement === "SHORT"
      ? decisionRegistryInvalidatesShort
      : false;
  const fullRiskChainClosed = full?.strict_chain_status?.SUPPORTING_RISK?.closed === true;
  const positionManagement = analyzePositionManagementContext(
    input?.position_management_context,
    position,
    positionOrigin,
    safeObservedTs,
    safeContract,
    snapshotId,
    [
      ...(evidenceRegistryClosed ? [{
        kind: "DECISION_EVIDENCE",
        receipt_id: evidence?.registry_receipt_id,
        committed_ts: evidence?.registry_committed_ts,
        content_digest: evidence?.registry_content_digest,
        risk_evidence_eligible: decisionRegistryHasPositionRiskEvidence,
        invalidates_long: decisionRegistryInvalidatesLong,
        invalidates_short: decisionRegistryInvalidatesShort,
      }] : []),
      ...(full?.quality === "CLOSED" ? [{
        kind: "FULL_EVIDENCE",
        receipt_id: full?.persistence_receipt?.receipt_id,
        committed_ts: full?.persistence_receipt?.committed_ts,
        content_digest: full?.persistence_receipt?.content_digest,
        risk_evidence_eligible: fullRiskChainClosed,
        invalidates_long: false,
        invalidates_short: false,
      }, {
        kind: "FULL_EVIDENCE_SOURCE",
        receipt_id: input?.full_evidence?.source_registry?.receipt_id,
        committed_ts: input?.full_evidence?.source_registry?.persistence?.committed_ts,
        content_digest: input?.full_evidence?.source_registry?.content_digest,
        risk_evidence_eligible: fullRiskChainClosed,
        invalidates_long: false,
        invalidates_short: false,
      }] : []),
      ...(opportunity?.quality === "CLOSED" ? [{
        kind: "OPPORTUNITY",
        ...opportunity?.persistence_receipt,
        risk_evidence_eligible: false,
        invalidates_long: false,
        invalidates_short: false,
      }] : []),
      ...(campaign?.quality === "CLOSED" ? [{
        kind: "CAMPAIGN",
        ...campaign?.persistence_receipt,
        risk_evidence_eligible: false,
        invalidates_long: false,
        invalidates_short: false,
      }] : []),
      ...(safetyReceipt?.quality === "CLOSED" ? [{
        kind: "SAFETY_GATE",
        ...safetyReceipt,
        risk_evidence_eligible: false,
        invalidates_long: false,
        invalidates_short: false,
      }] : []),
      ...(position?.quality === "CLOSED" ? [{
        kind: "POSITION",
        ...position?.persistence_receipt,
        risk_evidence_eligible: false,
        invalidates_long: false,
        invalidates_short: false,
      }] : []),
      ...(positionOrigin?.quality === "CLOSED" ? [{
        kind: "POSITION_ORIGIN_CAMPAIGN",
        ...positionOrigin?.persistence_receipt,
        risk_evidence_eligible: false,
        invalidates_long: false,
        invalidates_short: false,
      }] : []),
    ],
  );

  const lineageIdentityCandidates = [
    atomicLineageReceipt({
      receipt_id: evidence?.registry_receipt_id,
      content_digest: evidence?.registry_content_digest,
      committed_ts: evidence?.registry_committed_ts,
    }, safeObservedTs),
    atomicLineageReceipt({
      receipt_id: input?.full_evidence?.source_registry?.receipt_id,
      content_digest: input?.full_evidence?.source_registry?.content_digest,
      committed_ts: input?.full_evidence?.source_registry?.persistence?.committed_ts,
    }, safeObservedTs),
    atomicLineageReceipt(full?.persistence_receipt, safeObservedTs),
    atomicLineageReceipt(opportunity?.persistence_receipt, safeObservedTs),
    atomicLineageReceipt(campaign?.persistence_receipt, safeObservedTs),
    atomicLineageReceipt(safetyReceipt, safeObservedTs),
    atomicLineageReceipt(position?.persistence_receipt, safeObservedTs),
    atomicLineageReceipt(positionOrigin?.persistence_receipt, safeObservedTs),
    atomicLineageReceipt(positionManagement?.persistence_receipt, safeObservedTs),
  ];
  const lineageReceiptIds = [
    ...lineageIdentityCandidates
    .map((receipt) => receipt.receipt_id)
    .filter((receiptId) => receiptId !== null),
    input?.opportunity?.control_group_receipt?.receipt_id,
    input?.opportunity?.direction_receipt?.receipt_id,
    campaign?.campaign?.history_anchor?.receipt_id,
    campaign?.campaign?.wave_ledger_anchor?.receipt_id,
  ].filter((receiptId) => validSafeId(receiptId, 256));
  if (new Set(lineageReceiptIds).size !== lineageReceiptIds.length) {
    topBlockers.push("INPUT_LINEAGE_RECEIPT_ID_COLLISION");
  }

  const dataBlockers = uniqSorted([
    ...topBlockers,
    ...evidence.errors,
    ...evidence.blockers,
    ...full.blockers,
    ...full.conflicts,
    ...opportunity.blockers,
    ...campaign.blockers,
    ...crossPlaneReuse.reason_codes,
  ]);
  const dataMissing = uniqSorted([
    ...topMissing,
    ...evidence.missing,
    ...full.missing,
    ...opportunity.missing,
    ...campaign.missing,
  ]);
  let dataQuality = "CLOSED";
  if (dataBlockers.length) dataQuality = "BLOCKED";
  else if (dataMissing.length || full.quality !== "CLOSED" || opportunity.quality !== "CLOSED" || campaign.quality !== "CLOSED") dataQuality = "INSUFFICIENT";

  const rawCandidate = evidence.candidate_side;
  const rawView = compactDomainEvidence(evidence, rawCandidate);
  const thesisInvalidated = rawCandidate === "LONG"
    ? evidence.invalidates_long_ids.length > 0
    : rawCandidate === "SHORT"
      ? evidence.invalidates_short_ids.length > 0
      : false;
  let direction = DECISION_DIRECTION.INSUFFICIENT;
  let directionalQuality = DECISION_QUALITY.INSUFFICIENT;
  const directionalBlockers = uniqSorted([...topBlockers, ...evidence.errors, ...evidence.blockers, ...opportunity.blockers, ...crossPlaneReuse.reason_codes]);
  const directionalMissing = uniqSorted([...evidence.missing, ...opportunity.missing]);
  if (directionalBlockers.length) directionalQuality = DECISION_QUALITY.BLOCKED;
  else if (evidence.conflicting_domains.length || (evidence.long_domains.length && evidence.short_domains.length)) {
    direction = DECISION_DIRECTION.NEUTRAL;
    directionalQuality = DECISION_QUALITY.CONFLICTING;
  } else if (directionalMissing.length || opportunity.quality !== "CLOSED") {
    direction = DECISION_DIRECTION.INSUFFICIENT;
    directionalQuality = DECISION_QUALITY.INSUFFICIENT;
  } else if (independenceState === "CLOSED" && rawCandidate && !thesisInvalidated) {
    direction = rawCandidate;
    directionalQuality = DECISION_QUALITY.CLOSED;
  } else if (independenceState === "CONFLICTING") {
    direction = DECISION_DIRECTION.NEUTRAL;
    directionalQuality = DECISION_QUALITY.CONFLICTING;
  }

  const campaignDirection = upper(campaign?.campaign?.direction);
  const campaignDirectionAtDetection = upper(campaign?.campaign?.direction_at_detection);
  if (["LONG", "SHORT"].includes(direction) && ["LONG", "SHORT"].includes(campaignDirection) && direction !== campaignDirection) {
    direction = DECISION_DIRECTION.NEUTRAL;
    directionalQuality = DECISION_QUALITY.CONFLICTING;
    dataBlockers.push("CAMPAIGN_DIRECTION_EVIDENCE_CONFLICT");
    dataQuality = "BLOCKED";
  }
  if (["LONG", "SHORT"].includes(direction) && campaignDirection === "DIRECTIONLESS_EVENT") {
    dataMissing.push("CAMPAIGN_DIRECTION_REMAINS_DIRECTIONLESS");
    if (dataQuality === "CLOSED") dataQuality = "INSUFFICIENT";
    direction = DECISION_DIRECTION.INSUFFICIENT;
    directionalQuality = DECISION_QUALITY.INSUFFICIENT;
  }
  if (campaignDirectionAtDetection === "DIRECTIONLESS_EVENT" && ["LONG", "SHORT"].includes(campaignDirection)) {
    dataBlockers.push("DIRECTIONLESS_CAMPAIGN_DIRECTION_PROMOTION_FORBIDDEN");
    dataQuality = "BLOCKED";
    direction = DECISION_DIRECTION.INSUFFICIENT;
    directionalQuality = DECISION_QUALITY.BLOCKED;
  }

  const entryLaneRelevant = ["FLAT", "NONE"].includes(position.state);
  const execution = entryLaneRelevant
    ? analyzeExecutionGate(input, full, safeContract, safeObservedTs, direction, snapshotId, safetyReceipt, "ENTRY")
    : { quality: "NOT_EVALUATED", blockers: [], missing: [] };
  const phase = campaign.phase;
  let timing = campaign.quality === "BLOCKED"
    ? TIMING_STATE.BLOCKED
    : campaign.quality === "INSUFFICIENT"
      ? TIMING_STATE.INSUFFICIENT
      : timingForPhase(phase, campaign.chase_active);
  if (campaign.entry_window_expired === true && campaign.quality === "CLOSED") timing = TIMING_STATE.LATE;
  const openDirection = position.state === "OPEN_LONG" ? "LONG" : position.state === "OPEN_SHORT" ? "SHORT" : null;
  const managementExecution = openDirection
    ? analyzeExecutionGate(input, full, safeContract, safeObservedTs, openDirection, snapshotId, safetyReceipt, "MANAGEMENT_CLOSE")
    : { quality: "NOT_EVALUATED", blockers: [], missing: [] };
  const openInvalidated = openDirection === "LONG"
    ? evidence.invalidates_long_ids.length > 0
    : openDirection === "SHORT"
      ? evidence.invalidates_short_ids.length > 0
      : false;
  const openPotentialInvalidationClaim = openDirection === "LONG"
    ? decisionRegistryPotentialInvalidatesLong
    : openDirection === "SHORT"
      ? decisionRegistryPotentialInvalidatesShort
      : false;
  const positionContextInvalidated = positionManagement.quality === "CLOSED" && positionManagement.risk_state === "INVALIDATED";
  const decisionRiskReceiptCited = Array.isArray(input?.position_management_context?.evidence_receipt_ids) &&
    input.position_management_context.evidence_receipt_ids.includes(evidence?.registry_receipt_id);
  const crossPlaneDecisionEvidenceIds = new Set(
    (crossPlaneReuse?.reports || []).flatMap((report) => Array.isArray(report?.decision_evidence_ids) ? report.decision_evidence_ids : []),
  );
  const citedRiskEvidenceCrossPlaneConflict = Boolean(
    openDirection && decisionRiskReceiptCited && evidence.usable.some((row) => (
      row.causal_domain === "RISK_INVALIDATION" && crossPlaneDecisionEvidenceIds.has(row.evidence_id)
    )),
  );
  const managementRiskLineageBlockers = citedRiskEvidenceCrossPlaneConflict
    ? ["POSITION_MANAGEMENT_CITED_RISK_CROSS_PLANE_CONFLICT"]
    : [];
  const positionContextInvalidatedTrusted = positionContextInvalidated && !citedRiskEvidenceCrossPlaneConflict;
  const relevantInvalidated = openDirection ? positionContextInvalidatedTrusted : thesisInvalidated;
  const openOppositeDirectionClosed = Boolean(openDirection && directionalQuality === "CLOSED" && ["LONG", "SHORT"].includes(direction) && direction !== openDirection);
  const openAdverseDirectionalDomains = openDirection === "LONG" ? evidence.short_domains : openDirection === "SHORT" ? evidence.long_domains : [];
  const terminalClosed = TERMINAL_PHASES.has(phase) && campaign.quality === "CLOSED";
  const currentCampaignIdMatchesOrigin = Boolean(
    openDirection && positionOrigin.quality === "CLOSED" &&
    text(campaign?.campaign?.campaign_id) === text(positionOrigin?.origin?.campaign_id),
  );
  const originCampaignDirectionRewrite = Boolean(
    currentCampaignIdMatchesOrigin &&
    ["LONG", "SHORT"].includes(upper(campaign?.campaign?.direction)) &&
    upper(campaign?.campaign?.direction) !== upper(positionOrigin?.origin?.direction),
  );
  const originCampaignRevisionRollback = Boolean(
    currentCampaignIdMatchesOrigin &&
    integer(campaign?.campaign?.state_revision) !== null &&
    integer(positionOrigin?.origin?.campaign_state_revision_at_entry) !== null &&
    integer(campaign.campaign.state_revision) < integer(positionOrigin.origin.campaign_state_revision_at_entry),
  );
  const retainedOriginWave = currentCampaignIdMatchesOrigin && Array.isArray(campaign?.campaign?.wave_ledger)
    ? campaign.campaign.wave_ledger.find((wave) => text(wave?.wave_id) === text(positionOrigin?.origin?.entry_wave_id))
    : null;
  const originWaveIndex = integer(positionOrigin?.entry_wave_index);
  const currentCampaignWaveIndex = integer(campaign?.campaign?.wave_index);
  const currentCampaignLedgerOffset = integer(campaign?.campaign?.wave_ledger_offset);
  const originCampaignEntryFactRewrite = Boolean(
    retainedOriginWave && (
      timestamp(retainedOriginWave?.entry_trigger_time) !== timestamp(positionOrigin?.origin?.entry_trigger_ts) ||
      finite(retainedOriginWave?.entry_trigger_price) !== finite(positionOrigin?.origin?.entry_trigger_price) ||
      text(retainedOriginWave?.entry_observation_id) !== text(positionOrigin?.origin?.entry_observation_id)
    ),
  );
  const originCampaignEntryWaveNotProven = Boolean(
    currentCampaignIdMatchesOrigin && originWaveIndex !== null && (
      currentCampaignWaveIndex === null || currentCampaignWaveIndex < originWaveIndex ||
      (!retainedOriginWave && (currentCampaignLedgerOffset === null || currentCampaignLedgerOffset < originWaveIndex))
    ),
  );
  const originEntryTsForCurrent = timestamp(positionOrigin?.origin?.entry_trigger_ts);
  const currentCampaignStartTs = timestamp(campaign?.campaign?.campaign_start);
  const currentCampaignLastTs = timestamp(campaign?.campaign?.last_observed_ts);
  const currentCampaignEndTs = timestamp(campaign?.campaign?.campaign_end);
  const originCampaignTimelineFork = Boolean(
    currentCampaignIdMatchesOrigin && originEntryTsForCurrent !== null && (
      currentCampaignStartTs === null || originEntryTsForCurrent < currentCampaignStartTs ||
      currentCampaignLastTs === null || originEntryTsForCurrent > currentCampaignLastTs ||
      (campaign?.phase === "CLOSED" && (currentCampaignEndTs === null || originEntryTsForCurrent > currentCampaignEndTs))
    ),
  );
  const originWaveClaimedByAnchor = Boolean(
    currentCampaignIdMatchesOrigin && !retainedOriginWave && originWaveIndex !== null &&
    currentCampaignLedgerOffset !== null && originWaveIndex <= currentCampaignLedgerOffset,
  );
  const originSourceCommittedTs = timestamp(positionOrigin?.origin?.source_campaign_committed_ts);
  const currentWaveAnchorCompletedTs = timestamp(campaign?.campaign?.wave_ledger_anchor?.last_completed_ts);
  const currentWaveAnchorCommittedTs = timestamp(campaign?.campaign?.wave_ledger_anchor?.persistence?.committed_ts);
  const originCampaignAnchorOrderInvalid = Boolean(
    originWaveClaimedByAnchor && (
      originEntryTsForCurrent === null || currentWaveAnchorCompletedTs === null || originEntryTsForCurrent > currentWaveAnchorCompletedTs ||
      originSourceCommittedTs === null || currentWaveAnchorCommittedTs === null || originSourceCommittedTs > currentWaveAnchorCommittedTs
    ),
  );
  const currentCampaignRevision = integer(campaign?.campaign?.state_revision);
  const originEntryRevision = integer(positionOrigin?.origin?.campaign_state_revision_at_entry);
  const expectedOriginEntryPhase = originWaveIndex === 1 ? "ENTRY_TRIGGER" : "NEXT_IMPULSE_ENTRY";
  const originCampaignSameRevisionFork = Boolean(
    currentCampaignIdMatchesOrigin && currentCampaignRevision !== null && originEntryRevision !== null &&
    currentCampaignRevision === originEntryRevision && (
      campaign?.phase !== expectedOriginEntryPhase || currentCampaignWaveIndex !== originWaveIndex ||
      text(campaign?.campaign?.current_wave_id) !== text(positionOrigin?.origin?.entry_wave_id) ||
      timestamp(campaign?.campaign?.entry_trigger_time) !== timestamp(positionOrigin?.origin?.entry_trigger_ts) ||
      finite(campaign?.campaign?.entry_trigger_price) !== finite(positionOrigin?.origin?.entry_trigger_price) ||
      !retainedOriginWave || upper(retainedOriginWave?.status) !== "ENTRY_ACTIVE" ||
      finite(retainedOriginWave?.entry_trigger_price) !== finite(positionOrigin?.origin?.entry_trigger_price) ||
      text(retainedOriginWave?.entry_observation_id) !== text(positionOrigin?.origin?.entry_observation_id)
    ),
  );
  const originCampaignLinkBlockers = [
    ...(originCampaignDirectionRewrite ? ["ORIGIN_CAMPAIGN_DIRECTION_REWRITE"] : []),
    ...(originCampaignRevisionRollback ? ["ORIGIN_CAMPAIGN_REVISION_ROLLBACK"] : []),
    ...(originCampaignEntryFactRewrite ? ["ORIGIN_CAMPAIGN_ENTRY_FACT_REWRITE"] : []),
    ...(originCampaignEntryWaveNotProven ? ["ORIGIN_CAMPAIGN_ENTRY_WAVE_NOT_PROVEN"] : []),
    ...(originCampaignSameRevisionFork ? ["ORIGIN_CAMPAIGN_SAME_REVISION_FORK"] : []),
    ...(originCampaignTimelineFork ? ["ORIGIN_CAMPAIGN_TIMELINE_FORK"] : []),
    ...(originCampaignAnchorOrderInvalid ? ["ORIGIN_CAMPAIGN_ANCHOR_ORDER_INVALID"] : []),
  ];
  const currentCampaignIsOrigin = currentCampaignIdMatchesOrigin && originCampaignLinkBlockers.length === 0;
  const managementAssessmentAvailableTs = timestamp(input?.position_management_context?.available_ts);
  const decisionRiskReceiptCommittedTs = timestamp(evidence?.registry_committed_ts);
  const decisionEvidencePlaneQuality = evidence.errors.length || evidence.blockers.length
    ? "BLOCKED"
    : evidence.missing.length
      ? "INSUFFICIENT"
      : "CLOSED";
  const sameOriginEvidenceIntegrityBlockers = currentCampaignIsOrigin &&
    positionManagement.quality === "CLOSED" && positionManagement.risk_state !== "INVALIDATED" &&
    decisionEvidencePlaneQuality === "BLOCKED"
    ? ["POSITION_MANAGEMENT_SAME_ORIGIN_EVIDENCE_INTEGRITY_BLOCKED"]
    : [];
  const sameOriginRiskCausalityBlockers = currentCampaignIsOrigin && openPotentialInvalidationClaim &&
    positionManagement.quality === "CLOSED" && positionManagement.risk_state !== "INVALIDATED"
    ? decisionEvidencePlaneQuality === "BLOCKED"
      ? ["POSITION_MANAGEMENT_SAME_ORIGIN_INVALIDATION_PLANE_BLOCKED"]
      : evidenceRegistryClosed && !decisionRiskReceiptCited
        ? [
            decisionRiskReceiptCommittedTs !== null && managementAssessmentAvailableTs !== null &&
            decisionRiskReceiptCommittedTs <= managementAssessmentAvailableTs
              ? "POSITION_MANAGEMENT_OMITS_AVAILABLE_SAME_ORIGIN_INVALIDATION"
              : "POSITION_MANAGEMENT_PRECEDES_SAME_ORIGIN_RISK_EVIDENCE",
          ]
        : []
    : [];
  const sameOriginRiskCausalityMissing = currentCampaignIsOrigin && openPotentialInvalidationClaim &&
    positionManagement.quality === "CLOSED" && positionManagement.risk_state !== "INVALIDATED" &&
    decisionEvidencePlaneQuality === "INSUFFICIENT"
    ? ["POSITION_MANAGEMENT_SAME_ORIGIN_INVALIDATION_PLANE_INSUFFICIENT"]
    : [];
  const originTerminalClosed = Boolean(
    currentCampaignIsOrigin && terminalClosed,
  );
  const originLifecycleCaution = Boolean(
    currentCampaignIsOrigin && campaign.quality === "CLOSED" && phase === "EXHAUSTION_WARNING",
  );
  const holdLifecycleCausalityBlockers = currentCampaignIsOrigin && !originTerminalClosed &&
    campaign.quality === "CLOSED" && positionManagement.quality === "CLOSED" &&
    timestamp(campaign?.persistence_receipt?.committed_ts) !== null &&
    timestamp(input?.position_management_context?.available_ts) !== null &&
    campaign.persistence_receipt.committed_ts > timestamp(input.position_management_context.available_ts)
    ? ["POSITION_MANAGEMENT_PRECEDES_ORIGIN_CAMPAIGN_STATE"]
    : [];
  const riskState = openDirection
    ? (veto.active && veto.quality === "CLOSED") || relevantInvalidated || originTerminalClosed
      ? "INVALIDATED"
      : topBlockers.length || originCampaignLinkBlockers.length || holdLifecycleCausalityBlockers.length || managementRiskLineageBlockers.length || sameOriginEvidenceIntegrityBlockers.length || sameOriginRiskCausalityBlockers.length || [position.quality, positionOrigin.quality, positionManagement.quality, veto.quality, ...(currentCampaignIsOrigin ? [campaign.quality] : [])].includes("BLOCKED")
        ? "BLOCKED"
        : sameOriginRiskCausalityMissing.length || [position.quality, positionOrigin.quality, positionManagement.quality, veto.quality, ...(currentCampaignIsOrigin ? [campaign.quality] : [])].includes("INSUFFICIENT")
          ? "INSUFFICIENT"
          : originLifecycleCaution || positionManagement.risk_state === "CAUTION"
            ? "CAUTION"
            : "CLEAR"
    : (veto.active && veto.quality === "CLOSED") || relevantInvalidated || terminalClosed
      ? "INVALIDATED"
      : veto.quality === "BLOCKED" || campaign.quality === "BLOCKED"
        ? "BLOCKED"
        : veto.quality === "INSUFFICIENT"
          ? "INSUFFICIENT"
          : rawView.contradictions.length || phase === "EXHAUSTION_WARNING"
            ? "CAUTION"
            : "CLEAR";

  const entryBlockers = [];
  const entryMissing = [];
  if (entryLaneRelevant) {
    if (position.quality !== "CLOSED") entryMissing.push(...position.missing, ...position.blockers);
    if (positionOrigin.quality === "BLOCKED") entryBlockers.push("POSITION_ORIGIN_CONTEXT_BLOCKED_FOR_FLAT_ENTRY");
    if (positionManagement.quality === "BLOCKED") entryBlockers.push("POSITION_MANAGEMENT_CONTEXT_BLOCKED_FOR_FLAT_ENTRY");
    if (dataQuality !== "CLOSED") entryBlockers.push(`DATA_QUALITY_${dataQuality}`);
    if (directionalQuality !== "CLOSED" || !["LONG", "SHORT"].includes(direction)) entryBlockers.push(`DIRECTIONAL_QUALITY_${directionalQuality}`);
    if (independenceState !== "CLOSED") entryBlockers.push(`EVIDENCE_INDEPENDENCE_${independenceState}`);
    if (veto.active) entryBlockers.push("HARD_VETO_ACTIVE");
    else if (veto.state !== "CLEAR") entryBlockers.push(`HARD_VETO_${veto.state}`);
    if (execution.quality !== "CLOSED") entryBlockers.push(`EXECUTION_QUALITY_${execution.quality}`);
    if (riskState !== "CLEAR") entryBlockers.push(`RISK_STATE_${riskState}`);
    if (!ENTRY_PHASES.has(phase)) entryBlockers.push(`CAMPAIGN_PHASE_NOT_ENTRY:${phase}`);
    if (!campaign.entry_action_id) entryBlockers.push("ENTRY_ACTION_ID_MISSING");
    if (["LATE", "ACTIVE_MOVE", "EDGE_SPENT"].includes(timing)) entryBlockers.push(`OPPORTUNITY_TIMING_${timing}`);
    if (thesisInvalidated) entryBlockers.push("THESIS_INVALIDATED");
  }
  const allEntryBlockers = uniqSorted(entryBlockers);
  const entryEligible = entryLaneRelevant && allEntryBlockers.length === 0 && entryMissing.length === 0;
  let entryAction = ENTRY_ACTION.WAIT;
  let entryQuality = DECISION_QUALITY.INSUFFICIENT;
  if (entryEligible) {
    entryAction = ENTRY_ACTION.SHADOW_ENTRY_ELIGIBLE;
    entryQuality = DECISION_QUALITY.CLOSED;
  } else if (veto.active || thesisInvalidated || terminalClosed || ["LATE", "ACTIVE_MOVE", "EDGE_SPENT"].includes(timing)) {
    entryAction = ENTRY_ACTION.REJECT;
    entryQuality = DECISION_QUALITY.BLOCKED;
  } else if (allEntryBlockers.some((code) => code.includes("BLOCKED"))) {
    entryAction = ENTRY_ACTION.REJECT;
    entryQuality = DECISION_QUALITY.BLOCKED;
  }

  let managementAction = MANAGEMENT_ACTION.NOT_EVALUATED;
  let managementIntent = "NOT_EVALUATED";
  let managementQuality = DECISION_QUALITY.NOT_EVALUATED;
  let managementActionId = null;
  let managementActionBasis = null;
  let managementTriggerBasis = null;
  let managementReasonCodes = [];
  if (openDirection) {
    const exitTriggerTypes = uniqSorted([
      ...(veto.active ? ["HARD_VETO"] : []),
      ...(positionContextInvalidatedTrusted ? ["POSITION_CONTEXT_INVALIDATED"] : []),
      ...(originTerminalClosed ? ["ORIGIN_CAMPAIGN_TERMINAL"] : []),
    ]);
    if (topBlockers.length) {
      managementAction = MANAGEMENT_ACTION.NOT_EVALUATED;
      managementQuality = DECISION_QUALITY.BLOCKED;
      managementReasonCodes.push("MANAGEMENT_BLOCKED:INPUT_OR_SAFETY_ENVELOPE");
    } else if (position.quality !== "CLOSED" || positionOrigin.quality !== "CLOSED") {
      managementAction = MANAGEMENT_ACTION.NOT_EVALUATED;
      managementQuality = [position.quality, positionOrigin.quality].includes("BLOCKED") ? DECISION_QUALITY.BLOCKED : DECISION_QUALITY.INSUFFICIENT;
    } else if (exitTriggerTypes.length) {
      const triggerClosed = (
        (!veto.active || veto.quality === "CLOSED") &&
        (!positionContextInvalidatedTrusted || positionManagement.quality === "CLOSED") &&
        (!originTerminalClosed || campaign.quality === "CLOSED")
      );
      if (triggerClosed) {
        managementIntent = "EXIT_REQUIRED";
        managementTriggerBasis = {
          trigger_types: exitTriggerTypes,
          hard_veto_receipt_id: veto.active ? safetyReceipt?.receipt_id ?? null : null,
          position_management_receipt_id: positionContextInvalidatedTrusted ? positionManagement?.persistence_receipt?.receipt_id ?? null : null,
          origin_campaign_receipt_id: originTerminalClosed ? positionOrigin?.persistence_receipt?.receipt_id ?? null : null,
          campaign_receipt_id: originTerminalClosed ? campaign?.persistence_receipt?.receipt_id ?? null : null,
          origin_campaign_id: originTerminalClosed ? text(positionOrigin?.origin?.campaign_id) : null,
          current_campaign_id: originTerminalClosed ? text(campaign?.campaign?.campaign_id) : null,
          campaign_phase: originTerminalClosed ? phase : null,
        };
        managementReasonCodes = [
          ...(veto.active ? ["MANAGEMENT_EXIT_REQUIRED:HARD_VETO"] : []),
          ...(positionContextInvalidatedTrusted ? ["MANAGEMENT_EXIT_REQUIRED:POSITION_CONTEXT_INVALIDATED"] : []),
          ...(originTerminalClosed ? [`MANAGEMENT_EXIT_REQUIRED:ORIGIN_CAMPAIGN_${phase}`] : []),
        ];
        if (managementExecution.quality === "CLOSED") {
          managementAction = MANAGEMENT_ACTION.EXIT;
          managementQuality = DECISION_QUALITY.CLOSED;
          managementActionBasis = {
            contract_code: safeContract,
            position_id: text(input?.position?.position_id),
            position_state_revision: integer(input?.position?.state_revision),
            position_direction: openDirection,
            command: "EXIT",
          };
          managementActionId = `FDX:${fnv1a64(stableJson(managementActionBasis))}`;
        } else {
          managementAction = MANAGEMENT_ACTION.NOT_EVALUATED;
          managementQuality = managementExecution.quality === "BLOCKED" ? DECISION_QUALITY.BLOCKED : DECISION_QUALITY.INSUFFICIENT;
          managementReasonCodes.push(`MANAGEMENT_EXIT_ACTION_FEASIBILITY_${managementExecution.quality}`);
        }
      } else {
        managementAction = MANAGEMENT_ACTION.NOT_EVALUATED;
        managementQuality = DECISION_QUALITY.BLOCKED;
        managementReasonCodes.push("MANAGEMENT_EXIT_TRIGGER_NOT_CLOSED");
      }
    } else if (managementRiskLineageBlockers.length || positionManagement.quality !== "CLOSED" || positionManagement.risk_state !== "CLEAR" || veto.quality !== "CLOSED" || (currentCampaignIsOrigin && campaign.quality !== "CLOSED") || riskState !== "CLEAR" || managementExecution.quality !== "CLOSED") {
      managementAction = MANAGEMENT_ACTION.NOT_EVALUATED;
      managementQuality = [positionManagement.quality, veto.quality, ...(currentCampaignIsOrigin ? [campaign.quality] : []), riskState, managementExecution.quality].includes("BLOCKED")
        ? DECISION_QUALITY.BLOCKED
        : DECISION_QUALITY.INSUFFICIENT;
      managementReasonCodes = uniqSorted([
        ...(positionManagement.quality !== "CLOSED" ? [`MANAGEMENT_HOLD_BLOCKED:POSITION_CONTEXT_${positionManagement.quality}`] : []),
        ...(positionManagement.risk_state !== "CLEAR" ? [`MANAGEMENT_HOLD_BLOCKED:POSITION_RISK_${positionManagement.risk_state}`] : []),
        ...(positionManagement.risk_reason_codes || []).map((code) => `MANAGEMENT_RISK_REASON:${code}`),
        ...managementRiskLineageBlockers.map((code) => `MANAGEMENT_HOLD_BLOCKED:${code}`),
        ...(veto.quality !== "CLOSED" ? [`MANAGEMENT_HOLD_BLOCKED:HARD_VETO_${veto.quality}`] : []),
        ...(currentCampaignIsOrigin && campaign.quality !== "CLOSED" ? [`MANAGEMENT_HOLD_BLOCKED:ORIGIN_CAMPAIGN_${campaign.quality}`] : []),
        ...(riskState !== "CLEAR" ? [`MANAGEMENT_HOLD_BLOCKED:RISK_${riskState}`] : []),
        ...(managementExecution.quality !== "CLOSED" ? [`MANAGEMENT_HOLD_BLOCKED:CLOSE_EXECUTION_${managementExecution.quality}`] : []),
      ].map(reasonCode), MAX_REASON_CODES);
    } else {
      managementAction = MANAGEMENT_ACTION.HOLD;
      managementIntent = "HOLD_ALLOWED";
      managementQuality = DECISION_QUALITY.CLOSED;
      managementReasonCodes.push("MANAGEMENT_HOLD_GATES_CLOSED");
    }
    entryAction = ENTRY_ACTION.NOT_EVALUATED;
    entryQuality = DECISION_QUALITY.NOT_EVALUATED;
  }
  const entryActionId = entryAction === ENTRY_ACTION.SHADOW_ENTRY_ELIGIBLE ? campaign.entry_action_id : null;
  const entryActionBasis = entryActionId ? {
    contract_code: safeContract,
    campaign_id: text(campaign?.campaign?.campaign_id),
    wave_id: text(campaign?.campaign?.current_wave_id),
    entry_trigger_ts: timestamp(campaign?.campaign?.entry_trigger_time),
    direction,
  } : null;

  const boundedLatencyTs = (value) => {
    const parsed = timestamp(value);
    return parsed !== null && parsed <= safeObservedTs ? parsed : null;
  };
  const eventTs = boundedLatencyTs(opportunity?.event?.timestamp);
  const eventCloseTs = boundedLatencyTs(opportunity?.event?.event_close_ts);
  const firstDetectedTs = boundedLatencyTs(campaign?.campaign?.first_detected_time);
  const entryTriggerTs = boundedLatencyTs(campaign?.campaign?.entry_trigger_time);
  const mandatoryPositionReasons = uniqSorted([
    ...position.blockers,
    ...position.missing,
    ...positionOrigin.blockers,
    ...positionOrigin.missing,
    ...positionManagement.blockers,
    ...positionManagement.missing,
    ...originCampaignLinkBlockers,
    ...holdLifecycleCausalityBlockers,
    ...managementRiskLineageBlockers,
    ...sameOriginEvidenceIntegrityBlockers,
    ...sameOriginRiskCausalityBlockers,
    ...sameOriginRiskCausalityMissing,
    ...managementReasonCodes,
  ].map(reasonCode), MAX_REASON_CODES);
  const generalReasonCodes = uniqSorted([
    ...dataBlockers,
    ...dataMissing,
    ...(full.advisory_missing || []),
    ...veto.blockers,
    ...veto.missing,
    ...execution.blockers,
    ...execution.missing,
    ...managementExecution.blockers,
    ...managementExecution.missing,
    ...(campaign.lifecycle_reasons || []),
    ...allEntryBlockers,
    ...entryMissing,
    ...(rawView.contradictions.length ? ["CONTRADICTORY_EVIDENCE_PRESENT"] : []),
    ...(evidence.suppressed.length ? ["CORRELATED_OR_DUPLICATE_EVIDENCE_SUPPRESSED"] : []),
    ...(openInvalidated && !currentCampaignIsOrigin ? ["CANDIDATE_INVALIDATION_INFORMATIONAL:POSITION_CONTEXT_AUTHORITATIVE"] : []),
    ...(openOppositeDirectionClosed ? ["CANDIDATE_OPPOSITE_DIRECTION_INFORMATIONAL:POSITION_CONTEXT_AUTHORITATIVE"] : []),
    ...(openAdverseDirectionalDomains.length ? ["CANDIDATE_ADVERSE_DOMAINS_INFORMATIONAL:POSITION_CONTEXT_AUTHORITATIVE"] : []),
    ...(entryEligible
      ? [campaign.duplicate_observation ? "ENTRY_ACTION_REPLAY_UNCONSUMED_WINDOW" : "SHADOW_ENTRY_GATES_CLOSED"]
      : openDirection ? ["SHADOW_ENTRY_NOT_EVALUATED_OPEN_POSITION"] : ["SHADOW_NO_ENTRY_PROMOTION"]),
  ].map(reasonCode), MAX_REASON_CODES);
  const mandatoryGlobalReasons = topBlockers.includes("INPUT_LINEAGE_RECEIPT_ID_COLLISION")
    ? ["INPUT_LINEAGE_RECEIPT_ID_COLLISION"]
    : [];
  const reasonCodes = [
    ...mandatoryGlobalReasons,
    ...mandatoryPositionReasons.filter((code) => !mandatoryGlobalReasons.includes(code)),
    ...generalReasonCodes.filter((code) => !mandatoryGlobalReasons.includes(code) && !mandatoryPositionReasons.includes(code)),
  ].slice(0, MAX_REASON_CODES);
  const overallBlockers = uniqSorted(entryLaneRelevant ? [
    ...dataBlockers,
    ...veto.blockers,
    ...execution.blockers,
    ...position.blockers,
    ...positionOrigin.blockers,
    ...positionManagement.blockers,
    ...originCampaignLinkBlockers,
    ...holdLifecycleCausalityBlockers,
    ...managementRiskLineageBlockers,
    ...sameOriginEvidenceIntegrityBlockers,
    ...sameOriginRiskCausalityBlockers,
  ] : [
    ...topBlockers,
    ...veto.blockers,
    ...managementExecution.blockers,
    ...position.blockers,
    ...positionOrigin.blockers,
    ...positionManagement.blockers,
    ...originCampaignLinkBlockers,
    ...holdLifecycleCausalityBlockers,
    ...managementRiskLineageBlockers,
    ...sameOriginEvidenceIntegrityBlockers,
    ...sameOriginRiskCausalityBlockers,
    ...(currentCampaignIsOrigin ? campaign.blockers : []),
  ], MAX_REASON_CODES);
  const lineageReceipts = {
    decision_evidence: atomicLineageReceipt({
      receipt_id: validSafeId(input?.evidence_registry?.receipt_id, 256) ? text(input.evidence_registry.receipt_id) : null,
      committed_ts: timestamp(input?.evidence_registry?.persistence?.committed_ts),
      content_digest: validDigest(input?.evidence_registry?.content_digest) ? input.evidence_registry.content_digest : null,
    }, safeObservedTs),
    full_evidence_source: atomicLineageReceipt({
      receipt_id: validSafeId(input?.full_evidence?.source_registry?.receipt_id, 256) ? text(input.full_evidence.source_registry.receipt_id) : null,
      committed_ts: timestamp(input?.full_evidence?.source_registry?.persistence?.committed_ts),
      content_digest: validDigest(input?.full_evidence?.source_registry?.content_digest) ? input.full_evidence.source_registry.content_digest : null,
    }, safeObservedTs),
    full_evidence: atomicLineageReceipt({
      receipt_id: full?.persistence_receipt?.receipt_id ?? null,
      committed_ts: full?.persistence_receipt?.committed_ts ?? null,
      content_digest: full?.persistence_receipt?.content_digest ?? null,
    }, safeObservedTs),
    opportunity: atomicLineageReceipt({
      receipt_id: opportunity?.persistence_receipt?.receipt_id ?? null,
      committed_ts: opportunity?.persistence_receipt?.committed_ts ?? null,
      content_digest: opportunity?.persistence_receipt?.content_digest ?? null,
    }, safeObservedTs),
    campaign: atomicLineageReceipt({
      receipt_id: campaign?.persistence_receipt?.receipt_id ?? null,
      committed_ts: campaign?.persistence_receipt?.committed_ts ?? null,
      content_digest: campaign?.persistence_receipt?.content_digest ?? null,
    }, safeObservedTs),
    safety_gate: atomicLineageReceipt({
      receipt_id: safetyReceipt?.receipt_id ?? null,
      committed_ts: safetyReceipt?.committed_ts ?? null,
      content_digest: safetyReceipt?.content_digest ?? null,
    }, safeObservedTs),
    position: atomicLineageReceipt({
      receipt_id: position?.persistence_receipt?.receipt_id ?? null,
      committed_ts: position?.persistence_receipt?.committed_ts ?? null,
      content_digest: position?.persistence_receipt?.content_digest ?? null,
    }, safeObservedTs),
    position_origin_campaign: atomicLineageReceipt({
      receipt_id: positionOrigin?.persistence_receipt?.receipt_id ?? null,
      committed_ts: positionOrigin?.persistence_receipt?.committed_ts ?? null,
      content_digest: positionOrigin?.persistence_receipt?.content_digest ?? null,
    }, safeObservedTs),
    position_management: atomicLineageReceipt({
      receipt_id: positionManagement?.persistence_receipt?.receipt_id ?? null,
      committed_ts: positionManagement?.persistence_receipt?.committed_ts ?? null,
      content_digest: positionManagement?.persistence_receipt?.content_digest ?? null,
    }, safeObservedTs),
  };
  const inputLineageDigest = fnv1a64(stableJson({
    contract_code: safeContract,
    snapshot_id: safeSnapshotId,
    observation_ts: safeObservedTs,
    lineage_receipts: lineageReceipts,
  }));

  const output = {
    version: FINAL_DECISION_INTEGRATION_VERSION,
    rules_version: FINAL_DECISION_RULES_VERSION,
    mode: FINAL_DECISION_MODE,
    status: overallBlockers.length ? "FAIL_CLOSED" : "SHADOW_EVALUATED",
    decision_id: null,
    material_digest: null,
    contract_code: safeContract,
    snapshot_id: safeSnapshotId,
    observation_ts: safeObservedTs,
    direction,
    directional_quality: directionalQuality,
    entry_action: entryAction,
    entry_action_id: entryActionId,
    entry_quality: entryQuality,
    data_quality: dataQuality,
    execution_quality: openDirection ? managementExecution.quality : execution.quality,
    entry_execution_quality: execution.quality,
    management_execution_quality: managementExecution.quality,
    campaign_phase: phase,
    campaign_quality: campaign.quality,
    independence_state: independenceState,
    timing_state: timing,
    risk_state: riskState,
    position_state: position.state,
    management_action: managementAction,
    management_intent: managementIntent,
    management_action_id: managementActionId,
    management_quality: managementQuality,
    management_trigger_basis: managementTriggerBasis,
    action_identity: {
      entry: entryActionBasis,
      management: managementActionBasis,
    },
    lineage_receipts: lineageReceipts,
    input_lineage_digest: inputLineageDigest,
    hard_veto: veto.active,
    hard_veto_state: veto.state,
    calibration_eligible: false,
    calibration_status: "NOT_STATISTICALLY_VALIDATED",
    // The legacy generic flag is deliberately disabled. Directional, entry and
    // management samples have different statistical units and are emitted only
    // through the separate prospective outcome-cohort sidecar contract.
    shadow_outcome_collection_eligible: false,
    live_probability: null,
    validated_signal: false,
    execution_authorized: false,
    telegram_eligible: false,
    shadow_only: true,
    reason_codes: reasonCodes,
    opportunity_latency: {
      event_ts: eventTs,
      event_close_ts: eventCloseTs,
      first_detected_ts: firstDetectedTs,
      entry_trigger_ts: entryTriggerTs,
      detection_lag_ms: nonNegativeLag(firstDetectedTs, eventTs),
      detection_lag_from_close_ms: nonNegativeLag(firstDetectedTs, eventCloseTs),
      entry_lag_from_detection_ms: nonNegativeLag(entryTriggerTs, firstDetectedTs),
      observation_age_from_event_ms: nonNegativeLag(observedTs, eventTs),
    },
    evidence_independence: {
      semantics: "RULE_BASED_CAUSAL_DOMAIN_SEPARATION_NOT_STATISTICAL_INDEPENDENCE",
      status: independenceState,
      causal_domains: evidence.domains,
      effective_directional_domains: evidence.candidate_domains,
      raw_usable_evidence_count: evidence.usable.length,
      effective_directional_vote_count: evidence.candidate_domains.length,
      duplicate_or_correlated_suppressed: evidence.suppressed,
      cross_domain_payload_digest_reuse: evidence.cross_domain_payload_digest_reuse,
      cross_plane_reuse: crossPlaneReuse,
      statistical_independence_validated: false,
    },
    explainability: {
      confirming_evidence: rawView.confirmations,
      contradictory_evidence: rawView.contradictions,
      blockers: uniqSorted([...dataBlockers, ...veto.blockers, ...execution.blockers, ...managementExecution.blockers, ...position.blockers, ...positionOrigin.blockers, ...positionManagement.blockers, ...originCampaignLinkBlockers, ...holdLifecycleCausalityBlockers, ...managementRiskLineageBlockers, ...allEntryBlockers], MAX_REASON_CODES),
      missing_or_unusable: uniqSorted([...dataMissing, ...(full.advisory_missing || []), ...veto.missing, ...execution.missing, ...managementExecution.missing, ...position.missing, ...positionOrigin.missing, ...positionManagement.missing, ...entryMissing], MAX_REASON_CODES),
      suppressed_evidence: evidence.suppressed,
      gate_order: [
        "INPUT_AND_TEMPORAL_INTEGRITY",
        "DATA_QUALITY",
        "HARD_VETO",
        "HTX_EXECUTION",
        "DIRECTION_COHERENCE",
        "EVIDENCE_INDEPENDENCE",
        "CAMPAIGN_AND_TIMING",
        "POSITION_ACTION",
      ],
      no_score_aggregation_used: true,
    },
    source_quality: {
      full_evidence: full.quality,
      opportunity: opportunity.quality,
      campaign: campaign.quality,
      position: position.quality,
      position_origin_campaign: positionOrigin.quality,
      position_management: positionManagement.quality,
      entry_execution: execution.quality,
      management_execution: managementExecution.quality,
      hard_veto: veto.quality,
      strict_weighted_chain_status: full.strict_chain_status,
    },
    safety,
  };
  const materialDigest = fnv1a64(stableJson(output));
  return {
    ...output,
    decision_id: `FDI:${safeContract}:${safeObservedTs}:${materialDigest}`,
    material_digest: materialDigest,
  };
}

export function buildFinalDecisionIntegrationShadow(input = {}) {
  try {
    const contractResult = normalizedContract(input?.contract_code);
    const observedTs = timestamp(input?.observed_ts);
    const snapshotId = text(input?.snapshot_id);
    if (!input || typeof input !== "object" || Array.isArray(input) || contractResult.error || observedTs === null || !validSafeId(snapshotId)) {
      return buildFinalDecisionIntegrationShadowCore({
        contract_code: "INVALID",
        snapshot_id: "INVALID-SNAPSHOT",
        observed_ts: 1,
      }, ["INPUT_IDENTITY_UNTRUSTED"]);
    }
    return buildFinalDecisionIntegrationShadowCore(input);
  } catch {
    return buildFinalDecisionIntegrationShadowCore({
      contract_code: "INVALID",
      snapshot_id: "INVALID-SNAPSHOT",
      observed_ts: 1,
    }, ["INPUT_STRUCTURE_UNREADABLE"]);
  }
}

export function mirrorDecisionEvidence(rows = []) {
  return rows.map((row) => ({
    ...row,
    stance: upper(row?.stance) === "LONG" ? "SHORT" : upper(row?.stance) === "SHORT" ? "LONG" : row?.stance,
    value: typeof row?.value === "number" && Number.isFinite(row.value) ? -row.value : row?.value,
  }));
}

const FINAL_OUTPUT_KEYS = new Set([
  "version", "rules_version", "mode", "status", "decision_id", "material_digest",
  "contract_code", "snapshot_id", "observation_ts", "direction", "directional_quality",
  "entry_action", "entry_action_id", "entry_quality", "data_quality", "execution_quality",
  "entry_execution_quality", "management_execution_quality",
  "campaign_phase", "campaign_quality", "independence_state", "timing_state", "risk_state",
  "position_state", "management_action", "management_intent", "management_action_id", "management_quality", "action_identity",
  "management_trigger_basis",
  "lineage_receipts", "input_lineage_digest",
  "hard_veto", "hard_veto_state", "calibration_eligible", "calibration_status",
  "shadow_outcome_collection_eligible", "live_probability", "validated_signal",
  "execution_authorized", "telegram_eligible", "shadow_only", "reason_codes",
  "opportunity_latency", "evidence_independence", "explainability", "source_quality", "safety",
]);

const OPPORTUNITY_LATENCY_OUTPUT_KEYS = Object.freeze([
  "event_ts", "event_close_ts", "first_detected_ts", "entry_trigger_ts",
  "detection_lag_ms", "detection_lag_from_close_ms", "entry_lag_from_detection_ms",
  "observation_age_from_event_ms",
]);
const SOURCE_QUALITY_OUTPUT_KEYS = Object.freeze([
  "full_evidence", "opportunity", "campaign", "position", "position_origin_campaign",
  "position_management", "entry_execution", "management_execution", "hard_veto",
  "strict_weighted_chain_status",
]);
const EVIDENCE_INDEPENDENCE_OUTPUT_KEYS = Object.freeze([
  "semantics", "status", "causal_domains", "effective_directional_domains",
  "raw_usable_evidence_count", "effective_directional_vote_count",
  "duplicate_or_correlated_suppressed", "cross_domain_payload_digest_reuse",
  "cross_plane_reuse", "statistical_independence_validated",
]);
const STRICT_CHAIN_STATUS_KEYS = Object.freeze([
  "declared_closed", "eligible_rows", "closed",
]);
const CROSS_PLANE_REUSE_KEYS = Object.freeze([
  "state", "total_reuse_count", "all_reuse_digest", "report_truncated", "reports", "reason_codes",
]);
const CAUSAL_DOMAIN_OUTPUT_KEYS = Object.freeze([
  "state", "evidence_ids", "support_ids", "invalidates_long_ids", "invalidates_short_ids",
  "causal_families", "correlation_groups", "raw_support_count", "effective_domain_votes",
]);
const CAUSAL_DOMAIN_OUTPUT_NAMES = Object.freeze([...new Set(Object.values(FAMILY_TO_DOMAIN))].sort());
const EXPLAINABILITY_OUTPUT_KEYS = Object.freeze([
  "confirming_evidence", "contradictory_evidence", "blockers", "missing_or_unusable",
  "suppressed_evidence", "gate_order", "no_score_aggregation_used",
]);
const EXPECTED_GATE_ORDER = Object.freeze([
  "INPUT_AND_TEMPORAL_INTEGRITY", "DATA_QUALITY", "HARD_VETO", "HTX_EXECUTION",
  "DIRECTION_COHERENCE", "EVIDENCE_INDEPENDENCE", "CAMPAIGN_AND_TIMING", "POSITION_ACTION",
]);

function hasExactOwnKeys(value, expectedKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  const expected = new Set(expectedKeys);
  return keys.length === expected.size && keys.every((key) => expected.has(key));
}

export function validateFinalDecisionOutput(output) {
  const errors = [];
  if (!output || typeof output !== "object") return { valid: false, errors: ["OUTPUT_NOT_OBJECT"] };
  const persistenceErrors = persistenceSafeJsonErrors(output);
  if (persistenceErrors.length) return { valid: false, errors: persistenceErrors };
  for (const key of FINAL_OUTPUT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(output, key)) errors.push(`OUTPUT_FIELD_MISSING:${key}`);
  }
  for (const key of Object.keys(output)) {
    if (!FINAL_OUTPUT_KEYS.has(key)) errors.push(`OUTPUT_FIELD_UNKNOWN:${key}`);
  }
  if (output?.version !== FINAL_DECISION_INTEGRATION_VERSION) errors.push("INVALID_OUTPUT_VERSION");
  if (output?.rules_version !== FINAL_DECISION_RULES_VERSION) errors.push("INVALID_RULES_VERSION");
  if (output?.mode !== FINAL_DECISION_MODE) errors.push("INVALID_MODE");
  if (!["SHADOW_EVALUATED", "FAIL_CLOSED"].includes(output?.status)) errors.push("INVALID_OUTPUT_STATUS");
  try {
    if (stableJson(output?.safety) !== stableJson(finalDecisionSafetyEnvelope())) errors.push("SAFETY_ENVELOPE_MISMATCH");
  } catch {
    errors.push("SAFETY_ENVELOPE_INVALID");
  }
  if (output?.shadow_only !== true || output?.safety?.shadow_only !== true) errors.push("SHADOW_ONLY_REQUIRED");
  if (output?.live_probability !== null) errors.push("LIVE_PROBABILITY_MUST_BE_NULL");
  if (output?.validated_signal !== false) errors.push("VALIDATED_SIGNAL_MUST_BE_FALSE");
  if (output?.execution_authorized !== false) errors.push("EXECUTION_MUST_BE_FALSE");
  if (output?.telegram_eligible !== false) errors.push("TELEGRAM_MUST_BE_FALSE");
  if (!validSafeId(output?.snapshot_id) || !Number.isSafeInteger(output?.observation_ts) || output.observation_ts <= 0) errors.push("OUTPUT_IDENTITY_INVALID");
  const outputContract = normalizedContract(output?.contract_code);
  if (outputContract.error) errors.push("OUTPUT_CONTRACT_INVALID");
  if (!validDigest(output?.material_digest)) errors.push("MATERIAL_DIGEST_INVALID");
  if (outputContract.value && output?.decision_id !== `FDI:${outputContract.value}:${output.observation_ts}:${output.material_digest}`) errors.push("DECISION_ID_MATERIAL_MISMATCH");
  try {
    const expectedDigest = fnv1a64(stableJson({ ...output, decision_id: null, material_digest: null }));
    if (output?.material_digest !== expectedDigest) errors.push("OUTPUT_SEAL_DIGEST_MISMATCH");
  } catch {
    errors.push("OUTPUT_SEAL_INVALID");
  }
  if (!Object.values(DECISION_DIRECTION).includes(output?.direction)) errors.push("INVALID_DIRECTION");
  for (const [field, code] of [
    ["directional_quality", "INVALID_DIRECTIONAL_QUALITY"], ["entry_quality", "INVALID_ENTRY_QUALITY"],
    ["data_quality", "INVALID_DATA_QUALITY"], ["execution_quality", "INVALID_EXECUTION_QUALITY"],
    ["entry_execution_quality", "INVALID_ENTRY_EXECUTION_QUALITY"], ["management_execution_quality", "INVALID_MANAGEMENT_EXECUTION_QUALITY"],
    ["campaign_quality", "INVALID_CAMPAIGN_QUALITY"], ["management_quality", "INVALID_MANAGEMENT_QUALITY"],
  ]) {
    if (!Object.values(DECISION_QUALITY).includes(output?.[field])) errors.push(code);
  }
  if (!Object.values(ENTRY_ACTION).includes(output?.entry_action)) errors.push("INVALID_ENTRY_ACTION");
  if (!Object.values(MANAGEMENT_ACTION).includes(output?.management_action)) errors.push("INVALID_MANAGEMENT_ACTION");
  if (!["HOLD_ALLOWED", "EXIT_REQUIRED", "NOT_EVALUATED"].includes(output?.management_intent)) errors.push("INVALID_MANAGEMENT_INTENT");
  if (!OUTPUT_PHASE_SET.has(output?.campaign_phase)) errors.push("INVALID_OUTPUT_CAMPAIGN_PHASE");
  if (!Object.values(TIMING_STATE).includes(output?.timing_state)) errors.push("INVALID_OUTPUT_TIMING_STATE");
  const validCampaignQualities = ["CLOSED", "BLOCKED", "INSUFFICIENT"];
  if (!validCampaignQualities.includes(output?.campaign_quality)) errors.push("CAMPAIGN_QUALITY_STATE_INVALID");
  else {
    const allowedTiming = output.campaign_quality === "BLOCKED"
      ? ["BLOCKED"]
      : output.campaign_quality === "INSUFFICIENT"
        ? ["INSUFFICIENT"]
        : ({
            DISCOVERY: ["EARLY", "LATE"],
            PRE_IMPULSE_WATCH: ["EARLY", "LATE"],
            ENTRY_CANDIDATE: ["EARLY", "LATE"],
            ENTRY_TRIGGER: ["ENTRY_WINDOW", "LATE"],
            IMPULSE: ["ACTIVE_MOVE", "LATE"],
            RELOAD_BASE: ["RELOAD", "LATE"],
            NEXT_IMPULSE_WATCH: ["RELOAD", "LATE"],
            NEXT_IMPULSE_ENTRY: ["ENTRY_WINDOW", "LATE"],
            EXHAUSTION_WARNING: ["LATE"],
            EDGE_SPENT: ["EDGE_SPENT"],
            CLOSED: ["EDGE_SPENT"],
          }[output?.campaign_phase] || []);
    if (!allowedTiming.includes(output?.timing_state)) errors.push("CAMPAIGN_PHASE_TIMING_MISMATCH");
  }
  if (!VALID_POSITION.has(output?.position_state)) errors.push("INVALID_OUTPUT_POSITION_STATE");
  if (!["CLEAR", "CAUTION", "INVALIDATED", "BLOCKED", "INSUFFICIENT"].includes(output?.risk_state)) errors.push("INVALID_OUTPUT_RISK_STATE");
  if (!["CLOSED", "PARTIAL", "CORRELATED", "CONFLICTING", "BLOCKED", "INSUFFICIENT", "NOT_EVALUATED"].includes(output?.independence_state)) errors.push("INVALID_OUTPUT_INDEPENDENCE_STATE");
  if (typeof output?.hard_veto !== "boolean") errors.push("HARD_VETO_NOT_BOOLEAN");
  if (!["ACTIVE", "CLEAR", "BLOCKED", "INSUFFICIENT"].includes(output?.hard_veto_state)) errors.push("HARD_VETO_STATE_INVALID");
  if ((output?.hard_veto_state === "ACTIVE") !== (output?.hard_veto === true)) errors.push("HARD_VETO_STATE_MISMATCH");
  if (!Array.isArray(output?.reason_codes) || output.reason_codes.length < 1 || output.reason_codes.length > MAX_REASON_CODES || new Set(output.reason_codes).size !== output.reason_codes.length || output.reason_codes.some((code) => typeof code !== "string" || !/^[A-Z][A-Z0-9_.:-]{0,95}$/.test(code))) errors.push("OUTPUT_REASON_CODES_INVALID");
  const evidenceIntegrityReasonPresent = Array.isArray(output?.reason_codes) && output.reason_codes.some((code) => (
    EVIDENCE_LINEAGE_BLOCKING_REASONS.has(code) ||
    code.startsWith("EVIDENCE_ID_CONFLICT") ||
    code.startsWith("OBSERVATION_IDENTITY_CONFLICT") ||
    code === "SOURCE_OBSERVATION_ID_DIGEST_CONFLICT" ||
    code === "EVIDENCE_ROW_LIMIT_EXCEEDED"
  ));
  if (evidenceIntegrityReasonPresent && output?.independence_state !== "BLOCKED") errors.push("EVIDENCE_INTEGRITY_REQUIRES_BLOCKED_INDEPENDENCE");
  if (output?.entry_action === ENTRY_ACTION.SHADOW_ENTRY_ELIGIBLE) {
    if (output?.entry_quality !== "CLOSED") errors.push("ENTRY_ELIGIBLE_WITHOUT_CLOSED_QUALITY");
    if (output?.directional_quality !== "CLOSED") errors.push("ENTRY_ELIGIBLE_WITHOUT_CLOSED_DIRECTIONAL_QUALITY");
    if (!["LONG", "SHORT"].includes(output?.direction)) errors.push("ENTRY_ELIGIBLE_WITHOUT_DIRECTION");
    if (output?.data_quality !== "CLOSED" || output?.entry_execution_quality !== "CLOSED" || output?.execution_quality !== "CLOSED" || output?.independence_state !== "CLOSED") errors.push("ENTRY_ELIGIBLE_WITH_OPEN_GATE");
    if (output?.campaign_quality !== "CLOSED" || output?.timing_state !== "ENTRY_WINDOW" || output?.hard_veto_state !== "CLEAR") errors.push("ENTRY_ELIGIBLE_WITH_STATE_GATE_OPEN");
    if (output?.hard_veto === true) errors.push("ENTRY_ELIGIBLE_WITH_HARD_VETO");
    if (!ENTRY_PHASES.has(output?.campaign_phase)) errors.push("ENTRY_ELIGIBLE_OUTSIDE_ENTRY_PHASE");
    if (output?.risk_state !== "CLEAR") errors.push("ENTRY_ELIGIBLE_WITH_NONCLEAR_RISK");
    if (!validSafeId(output?.entry_action_id, 320)) errors.push("ENTRY_ELIGIBLE_WITHOUT_ACTION_ID");
    if (!["FLAT", "NONE"].includes(output?.position_state)) errors.push("ENTRY_ELIGIBLE_WITH_NONFLAT_POSITION");
    if (output?.source_quality?.position !== "CLOSED") errors.push("ENTRY_ELIGIBLE_WITHOUT_CLOSED_POSITION_SOURCE");
    if (output?.status !== "SHADOW_EVALUATED") errors.push("ENTRY_ELIGIBLE_ON_FAILED_OUTPUT");
  } else if (output?.entry_action_id !== null) {
    errors.push("NON_ENTRY_HAS_ACTION_ID");
  }
  const entryQualityByAction = {
    SHADOW_ENTRY_ELIGIBLE: "CLOSED",
    WAIT: "INSUFFICIENT",
    REJECT: "BLOCKED",
    NOT_EVALUATED: "NOT_EVALUATED",
  };
  if (entryQualityByAction[output?.entry_action] !== output?.entry_quality) errors.push("ENTRY_ACTION_QUALITY_MISMATCH");
  const outputOpen = ["OPEN_LONG", "OPEN_SHORT"].includes(output?.position_state);
  if (output?.execution_quality !== (outputOpen ? output?.management_execution_quality : output?.entry_execution_quality)) errors.push("EXECUTION_LANE_CONFLATION");
  if (outputOpen && output?.entry_execution_quality !== "NOT_EVALUATED") errors.push("OPEN_POSITION_ENTRY_EXECUTION_MUST_BE_NOT_EVALUATED");
  if (!outputOpen && output?.management_execution_quality !== "NOT_EVALUATED") errors.push("FLAT_POSITION_MANAGEMENT_EXECUTION_MUST_BE_NOT_EVALUATED");
  if (outputOpen && (output?.entry_action !== "NOT_EVALUATED" || output?.entry_quality !== "NOT_EVALUATED")) errors.push("OPEN_POSITION_MUST_NOT_EVALUATE_ENTRY");
  if (!outputOpen && (output?.management_action !== "NOT_EVALUATED" || output?.management_intent !== "NOT_EVALUATED" || output?.management_quality !== "NOT_EVALUATED")) errors.push("FLAT_POSITION_MUST_NOT_EVALUATE_MANAGEMENT");
  if (outputOpen && output?.management_action === "NOT_EVALUATED" && !["BLOCKED", "INSUFFICIENT"].includes(output?.management_quality)) errors.push("OPEN_POSITION_MANAGEMENT_QUALITY_INVALID");
  if (["HOLD", "EXIT"].includes(output?.management_action)) {
    if (!outputOpen) errors.push("MANAGEMENT_WITHOUT_OPEN_POSITION");
    if (output?.management_quality !== "CLOSED") errors.push("MANAGEMENT_ACTION_WITHOUT_CLOSED_QUALITY");
  }
  if ((output?.management_action === "HOLD") !== (output?.management_intent === "HOLD_ALLOWED") ||
      (output?.management_action === "EXIT" && output?.management_intent !== "EXIT_REQUIRED") ||
      (output?.management_intent === "EXIT_REQUIRED" && !["EXIT", "NOT_EVALUATED"].includes(output?.management_action))) errors.push("MANAGEMENT_INTENT_ACTION_MISMATCH");
  if (output?.management_intent === "EXIT_REQUIRED" && (
    output?.risk_state !== "INVALIDATED" ||
    output?.source_quality?.position !== "CLOSED" ||
    output?.source_quality?.position_origin_campaign !== "CLOSED"
  )) errors.push("EXIT_INTENT_WITH_OPEN_SOURCE_GATE");
  if (output?.management_action === "HOLD" && (
    output?.risk_state !== "CLEAR" || output?.hard_veto === true || output?.hard_veto_state !== "CLEAR" ||
    output?.source_quality?.position !== "CLOSED" ||
    output?.source_quality?.position_origin_campaign !== "CLOSED" || output?.source_quality?.position_management !== "CLOSED" ||
    output?.management_execution_quality !== "CLOSED" || output?.status !== "SHADOW_EVALUATED"
  )) errors.push("HOLD_WITH_OPEN_GATE");
  if (output?.management_action === "EXIT") {
    if (!validSafeId(output?.management_action_id, 320)) errors.push("EXIT_WITHOUT_ACTION_ID");
    if (output?.risk_state !== "INVALIDATED") errors.push("EXIT_WITHOUT_INVALIDATED_RISK");
    if (output?.management_execution_quality !== "CLOSED") errors.push("EXIT_WITHOUT_CLOSED_EXECUTION_FEASIBILITY");
    if (output?.source_quality?.position !== "CLOSED" || output?.source_quality?.position_origin_campaign !== "CLOSED") errors.push("EXIT_WITH_OPEN_SOURCE_GATE");
  } else if (output?.management_action_id !== null) {
    errors.push("NON_EXIT_HAS_ACTION_ID");
  }
  if (outputOpen && output?.status !== "FAIL_CLOSED" && output?.risk_state === "INVALIDATED" && output?.source_quality?.position === "CLOSED" && output?.source_quality?.position_origin_campaign === "CLOSED" && output?.management_intent !== "EXIT_REQUIRED") errors.push("INVALIDATED_OPEN_POSITION_REQUIRES_EXIT_INTENT");
  if (output?.management_intent === "EXIT_REQUIRED" && output?.management_action === "NOT_EVALUATED" && output?.management_execution_quality === "CLOSED" && output?.status !== "FAIL_CLOSED") errors.push("CLOSED_EXIT_FEASIBILITY_REQUIRES_EXIT_ACTION");
  const managementTriggerBasis = output?.management_trigger_basis;
  if (output?.management_intent === "EXIT_REQUIRED") {
    const triggerKeys = [
      "campaign_phase", "campaign_receipt_id", "current_campaign_id", "hard_veto_receipt_id",
      "origin_campaign_id", "origin_campaign_receipt_id", "position_management_receipt_id", "trigger_types",
    ];
    const exactTriggerShape = hasExactOwnKeys(managementTriggerBasis, triggerKeys);
    if (!exactTriggerShape) errors.push("MANAGEMENT_TRIGGER_BASIS_SHAPE_INVALID");
    else {
      const triggerTypes = managementTriggerBasis.trigger_types;
      const allowedTriggers = new Set(["HARD_VETO", "ORIGIN_CAMPAIGN_TERMINAL", "POSITION_CONTEXT_INVALIDATED"]);
      const triggerListValid = Array.isArray(triggerTypes) && triggerTypes.length >= 1 && triggerTypes.length <= 3 &&
        new Set(triggerTypes).size === triggerTypes.length && triggerTypes.every((value) => allowedTriggers.has(value)) &&
        stableJson(triggerTypes) === stableJson([...triggerTypes].sort());
      if (!triggerListValid) errors.push("MANAGEMENT_TRIGGER_TYPES_INVALID");
      else {
        const hasHardVeto = triggerTypes.includes("HARD_VETO");
        const hasPositionContext = triggerTypes.includes("POSITION_CONTEXT_INVALIDATED");
        const hasOriginTerminal = triggerTypes.includes("ORIGIN_CAMPAIGN_TERMINAL");
        const receiptsForTrigger = output?.lineage_receipts;
        if (hasHardVeto !== (output?.hard_veto === true) ||
            (hasHardVeto
              ? !validSafeId(managementTriggerBasis.hard_veto_receipt_id, 256) || managementTriggerBasis.hard_veto_receipt_id !== receiptsForTrigger?.safety_gate?.receipt_id || output?.hard_veto_state !== "ACTIVE" || output?.source_quality?.hard_veto !== "CLOSED"
              : managementTriggerBasis.hard_veto_receipt_id !== null)) errors.push("MANAGEMENT_HARD_VETO_TRIGGER_INVALID");
        if (hasPositionContext
          ? !validSafeId(managementTriggerBasis.position_management_receipt_id, 256) || managementTriggerBasis.position_management_receipt_id !== receiptsForTrigger?.position_management?.receipt_id || output?.source_quality?.position_management !== "CLOSED"
          : managementTriggerBasis.position_management_receipt_id !== null) errors.push("MANAGEMENT_POSITION_TRIGGER_INVALID");
        if (hasOriginTerminal) {
          if (!TERMINAL_PHASES.has(managementTriggerBasis.campaign_phase) || managementTriggerBasis.campaign_phase !== output?.campaign_phase ||
              output?.source_quality?.campaign !== "CLOSED" || output?.source_quality?.position_origin_campaign !== "CLOSED" ||
              !validSafeId(managementTriggerBasis.origin_campaign_id, 256) || managementTriggerBasis.origin_campaign_id !== managementTriggerBasis.current_campaign_id ||
              !validSafeId(managementTriggerBasis.origin_campaign_receipt_id, 256) || managementTriggerBasis.origin_campaign_receipt_id !== receiptsForTrigger?.position_origin_campaign?.receipt_id ||
              !validSafeId(managementTriggerBasis.campaign_receipt_id, 256) || managementTriggerBasis.campaign_receipt_id !== receiptsForTrigger?.campaign?.receipt_id) errors.push("MANAGEMENT_ORIGIN_TERMINAL_TRIGGER_INVALID");
        } else if ([managementTriggerBasis.campaign_phase, managementTriggerBasis.origin_campaign_id, managementTriggerBasis.current_campaign_id, managementTriggerBasis.origin_campaign_receipt_id, managementTriggerBasis.campaign_receipt_id].some((value) => value !== null)) {
          errors.push("MANAGEMENT_ORIGIN_TRIGGER_FIELDS_FORBIDDEN");
        }
      }
    }
  } else if (managementTriggerBasis !== null) {
    errors.push("MANAGEMENT_TRIGGER_BASIS_WITHOUT_EXIT_INTENT");
  }
  if (output?.hard_veto === true && output?.risk_state !== "INVALIDATED") errors.push("ACTIVE_HARD_VETO_REQUIRES_INVALIDATED_RISK");
  if (output?.status === "FAIL_CLOSED" && output?.entry_action === "SHADOW_ENTRY_ELIGIBLE") errors.push("FAILED_OUTPUT_CANNOT_PROMOTE_ENTRY");
  if (output?.status === "FAIL_CLOSED" && ["HOLD", "EXIT"].includes(output?.management_action)) errors.push("FAILED_OUTPUT_CANNOT_EXECUTE_MANAGEMENT");
  if (output?.calibration_eligible !== false || output?.calibration_status !== "NOT_STATISTICALLY_VALIDATED") errors.push("CALIBRATION_PROMOTION_FORBIDDEN");
  if (output?.shadow_outcome_collection_eligible !== false) errors.push("OUTCOME_COLLECTION_FLAG_MUST_BE_FALSE");
  if (!hasExactOwnKeys(output?.evidence_independence, EVIDENCE_INDEPENDENCE_OUTPUT_KEYS)) errors.push("EVIDENCE_INDEPENDENCE_SHAPE_INVALID");
  if (output?.evidence_independence?.statistical_independence_validated !== false || output?.evidence_independence?.status !== output?.independence_state || output?.evidence_independence?.semantics !== "RULE_BASED_CAUSAL_DOMAIN_SEPARATION_NOT_STATISTICAL_INDEPENDENCE") errors.push("INDEPENDENCE_CONTRACT_MISMATCH");
  const causalDomains = output?.evidence_independence?.causal_domains;
  const globallyListedEvidenceIds = [];
  let anyCausalEvidenceListAtBound = false;
  if (!hasExactOwnKeys(causalDomains, CAUSAL_DOMAIN_OUTPUT_NAMES)) errors.push("CAUSAL_DOMAINS_SHAPE_INVALID");
  else {
    for (const [domain, state] of Object.entries(causalDomains)) {
      if (!hasExactOwnKeys(state, CAUSAL_DOMAIN_OUTPUT_KEYS)) {
        errors.push(`CAUSAL_DOMAIN_STATE_SHAPE_INVALID:${domain}`);
        continue;
      }
      if (!["UNKNOWN", "NEUTRAL", "LONG", "SHORT", "CONFLICTING"].includes(state.state)) errors.push(`CAUSAL_DOMAIN_STATE_INVALID:${domain}`);
      const evidenceArrays = ["evidence_ids", "support_ids", "invalidates_long_ids", "invalidates_short_ids"];
      for (const key of evidenceArrays) {
        const values = state[key];
        if (!Array.isArray(values) || values.length > MAX_EXPLANATION_ITEMS || new Set(values).size !== values.length || values.some((id) => !validSafeId(id, 96))) errors.push(`CAUSAL_DOMAIN_EVIDENCE_IDS_INVALID:${domain}:${key}`);
      }
      if (Array.isArray(state.evidence_ids)) {
        globallyListedEvidenceIds.push(...state.evidence_ids);
        if (state.evidence_ids.length === MAX_EXPLANATION_ITEMS) anyCausalEvidenceListAtBound = true;
      }
      if (evidenceArrays.every((key) => Array.isArray(state[key]))) {
        const evidenceIds = new Set(state.evidence_ids);
        const classifiedIds = [...state.support_ids, ...state.invalidates_long_ids, ...state.invalidates_short_ids];
        if (classifiedIds.some((id) => !evidenceIds.has(id)) || new Set(classifiedIds).size !== classifiedIds.length) errors.push(`CAUSAL_DOMAIN_EVIDENCE_CLASSIFICATION_INVALID:${domain}`);
      }
      const families = state.causal_families;
      if (!Array.isArray(families) || families.length > Object.keys(FAMILY_TO_DOMAIN).length || new Set(families).size !== families.length || families.some((family) => FAMILY_TO_DOMAIN[family] !== domain)) errors.push(`CAUSAL_DOMAIN_FAMILIES_INVALID:${domain}`);
      const groups = state.correlation_groups;
      if (!Array.isArray(groups) || groups.length > MAX_EXPLANATION_ITEMS || new Set(groups).size !== groups.length || groups.some((group) => !validSafeId(group, 256))) errors.push(`CAUSAL_DOMAIN_CORRELATION_GROUPS_INVALID:${domain}`);
      if (!Number.isSafeInteger(state.raw_support_count) || state.raw_support_count < 0 || state.raw_support_count > MAX_EVIDENCE_ROWS || (Array.isArray(state.support_ids) && state.support_ids.length !== Math.min(state.raw_support_count, MAX_EXPLANATION_ITEMS))) errors.push(`CAUSAL_DOMAIN_SUPPORT_COUNT_INVALID:${domain}`);
      const expectedVotes = ["LONG", "SHORT"].includes(state.state) ? 1 : 0;
      if (state.effective_domain_votes !== expectedVotes) errors.push(`CAUSAL_DOMAIN_EFFECTIVE_VOTES_INVALID:${domain}`);
      const derivationArraysValid = evidenceArrays.every((key) => Array.isArray(state[key])) && Array.isArray(families) && Array.isArray(groups);
      if (derivationArraysValid) {
        if (state.state === "UNKNOWN" && (
          state.evidence_ids.length !== 0 || state.support_ids.length !== 0 || state.invalidates_long_ids.length !== 0 || state.invalidates_short_ids.length !== 0 ||
          families.length !== 0 || groups.length !== 0 || state.raw_support_count !== 0
        )) errors.push(`CAUSAL_DOMAIN_UNKNOWN_DERIVATION_INVALID:${domain}`);
        if (state.state !== "UNKNOWN" && (state.evidence_ids.length < 1 || families.length < 1)) errors.push(`CAUSAL_DOMAIN_NONEMPTY_DERIVATION_INVALID:${domain}`);
        if (state.state === "NEUTRAL" && (state.support_ids.length !== 0 || state.raw_support_count !== 0 || groups.length !== 0)) errors.push(`CAUSAL_DOMAIN_NEUTRAL_DERIVATION_INVALID:${domain}`);
        if (["LONG", "SHORT"].includes(state.state) && (state.support_ids.length < 1 || state.raw_support_count < 1 || groups.length < 1)) errors.push(`CAUSAL_DOMAIN_DIRECTIONAL_DERIVATION_INVALID:${domain}`);
        if (state.state === "CONFLICTING" && (state.support_ids.length < 2 || state.raw_support_count < 2 || groups.length < 1)) errors.push(`CAUSAL_DOMAIN_CONFLICT_DERIVATION_INVALID:${domain}`);
      }
    }
  }
  const globallyUniqueEvidenceIds = new Set(globallyListedEvidenceIds);
  if (globallyUniqueEvidenceIds.size !== globallyListedEvidenceIds.length) errors.push("CAUSAL_DOMAIN_EVIDENCE_IDS_GLOBAL_DUPLICATE");
  if (hasExactOwnKeys(causalDomains, CAUSAL_DOMAIN_OUTPUT_NAMES) &&
      ["FLAT", "NONE"].includes(output?.position_state) && ["LONG", "SHORT"].includes(output?.direction)) {
    const invalidationKey = output.direction === "LONG" ? "invalidates_long_ids" : "invalidates_short_ids";
    const matchingInvalidation = Object.values(causalDomains)
      .some((state) => Array.isArray(state?.[invalidationKey]) && state[invalidationKey].length > 0);
    if (matchingInvalidation && output?.risk_state !== "INVALIDATED") errors.push("THESIS_INVALIDATION_RISK_MISMATCH");
  }
  const globalRawSupportLowerBound = hasExactOwnKeys(causalDomains, CAUSAL_DOMAIN_OUTPUT_NAMES)
    ? Object.values(causalDomains).reduce((total, state) => total + (Number.isSafeInteger(state?.raw_support_count) ? state.raw_support_count : 0), 0)
    : 0;
  const effectiveDirectionalDomains = output?.evidence_independence?.effective_directional_domains;
  const rawUsableEvidenceCount = output?.evidence_independence?.raw_usable_evidence_count;
  const effectiveDirectionalVoteCount = output?.evidence_independence?.effective_directional_vote_count;
  if (!Array.isArray(effectiveDirectionalDomains) || effectiveDirectionalDomains.length > DIRECTIONAL_DOMAINS.size || new Set(effectiveDirectionalDomains).size !== effectiveDirectionalDomains.length || effectiveDirectionalDomains.some((domain) => !DIRECTIONAL_DOMAINS.has(domain))) errors.push("EFFECTIVE_DIRECTIONAL_DOMAINS_INVALID");
  if (!Number.isSafeInteger(effectiveDirectionalVoteCount) || effectiveDirectionalVoteCount < 0 || effectiveDirectionalVoteCount > DIRECTIONAL_DOMAINS.size || (Array.isArray(effectiveDirectionalDomains) && effectiveDirectionalVoteCount !== effectiveDirectionalDomains.length)) errors.push("EFFECTIVE_DIRECTIONAL_VOTE_COUNT_INVALID");
  if (!Number.isSafeInteger(rawUsableEvidenceCount) || rawUsableEvidenceCount < 0 || rawUsableEvidenceCount > MAX_EVIDENCE_ROWS || (Number.isSafeInteger(effectiveDirectionalVoteCount) && rawUsableEvidenceCount < effectiveDirectionalVoteCount) || rawUsableEvidenceCount < globallyUniqueEvidenceIds.size || rawUsableEvidenceCount < globalRawSupportLowerBound || (!anyCausalEvidenceListAtBound && rawUsableEvidenceCount !== globallyUniqueEvidenceIds.size)) errors.push("RAW_USABLE_EVIDENCE_COUNT_INVALID");
  const suppressedEvidence = output?.evidence_independence?.duplicate_or_correlated_suppressed;
  if (!Array.isArray(suppressedEvidence) || suppressedEvidence.length > MAX_EXPLANATION_ITEMS || new Set(suppressedEvidence).size !== suppressedEvidence.length || suppressedEvidence.some((value) => typeof value !== "string" || value.length < 1 || value.length > 256 || /[\u0000-\u001f\u007f]/u.test(value))) errors.push("SUPPRESSED_EVIDENCE_REPORT_INVALID");
  const crossDomainPayloadReuse = output?.evidence_independence?.cross_domain_payload_digest_reuse;
  if (!Array.isArray(crossDomainPayloadReuse) || crossDomainPayloadReuse.length > MAX_EVIDENCE_ROWS || new Set(crossDomainPayloadReuse).size !== crossDomainPayloadReuse.length || crossDomainPayloadReuse.some((value) => !validDigest(value))) errors.push("CROSS_DOMAIN_PAYLOAD_REUSE_REPORT_INVALID");
  else if (crossDomainPayloadReuse.length > 0 && !["CORRELATED", "BLOCKED", "CONFLICTING"].includes(output?.independence_state)) errors.push("CROSS_DOMAIN_PAYLOAD_REUSE_NOT_CORRELATED");
  const crossPlaneReuse = output?.evidence_independence?.cross_plane_reuse;
  if (!hasExactOwnKeys(crossPlaneReuse, CROSS_PLANE_REUSE_KEYS) || !["CLOSED", "CORRELATED"].includes(crossPlaneReuse?.state) ||
      !Number.isSafeInteger(crossPlaneReuse?.total_reuse_count) || crossPlaneReuse.total_reuse_count < 0 || crossPlaneReuse.total_reuse_count > MAX_CROSS_PLANE_TOTAL_REUSE ||
      !validDigest(crossPlaneReuse?.all_reuse_digest) || typeof crossPlaneReuse?.report_truncated !== "boolean" ||
      !Array.isArray(crossPlaneReuse?.reports) || crossPlaneReuse.reports.length > MAX_CROSS_PLANE_REUSE_REPORTS ||
      !Array.isArray(crossPlaneReuse?.reason_codes) || crossPlaneReuse.reason_codes.length > MAX_EXPLANATION_ITEMS || new Set(crossPlaneReuse?.reason_codes || []).size !== (crossPlaneReuse?.reason_codes || []).length) {
    errors.push("CROSS_PLANE_REUSE_REPORT_INVALID");
  } else {
    if ((crossPlaneReuse.total_reuse_count > 0) !== (crossPlaneReuse.state === "CORRELATED") ||
        crossPlaneReuse.report_truncated !== (crossPlaneReuse.total_reuse_count > MAX_CROSS_PLANE_REUSE_REPORTS) ||
        crossPlaneReuse.reports.length !== Math.min(crossPlaneReuse.total_reuse_count, MAX_CROSS_PLANE_REUSE_REPORTS) ||
        (crossPlaneReuse.total_reuse_count > 0 && !["CORRELATED", "BLOCKED", "CONFLICTING"].includes(output?.independence_state))) errors.push("CROSS_PLANE_REUSE_STATE_MISMATCH");
    const reportKeys = ["decision_evidence_count", "decision_evidence_ids", "detail_truncated", "full_evidence_observation_count", "full_evidence_observation_ids", "identity", "identity_digest", "kind"];
    const reportSortKeys = [];
    for (const report of crossPlaneReuse.reports) {
      const decisionIds = report?.decision_evidence_ids;
      const fullIds = report?.full_evidence_observation_ids;
      let identityValid = false;
      if (["SOURCE_OBSERVATION_ID", "SOURCE_FACT_ID"].includes(report?.kind)) identityValid = validSafeId(report?.identity, 256);
      else if (report?.kind === "SOURCE_PAYLOAD_DIGEST") identityValid = validDigest(report?.identity);
      else if (report?.kind === "SOURCE_ROOT") {
        identityValid = hasExactOwnKeys(report?.identity, ["metric", "source", "source_ts", "venue"]) &&
          validIdentifier(report.identity.source, 160) && validIdentifier(report.identity.venue, 160) && validIdentifier(report.identity.metric, 160) &&
          report.identity.source === canonicalProvenanceToken(report.identity.source) &&
          report.identity.venue === canonicalProvenanceToken(report.identity.venue) &&
          report.identity.metric === canonicalProvenanceToken(report.identity.metric) &&
          Number.isSafeInteger(report.identity.source_ts) && report.identity.source_ts > 0 && report.identity.source_ts <= output.observation_ts;
      }
      const decisionCountValid = Number.isSafeInteger(report?.decision_evidence_count) && report.decision_evidence_count >= 1 && report.decision_evidence_count <= MAX_EVIDENCE_ROWS;
      const fullCountValid = Number.isSafeInteger(report?.full_evidence_observation_count) && report.full_evidence_observation_count >= 1 && report.full_evidence_observation_count <= MAX_FULL_EVIDENCE_ROWS;
      if (!report || stableJson(Object.keys(report).sort()) !== stableJson(reportKeys) ||
          !["SOURCE_OBSERVATION_ID", "SOURCE_PAYLOAD_DIGEST", "SOURCE_FACT_ID", "SOURCE_ROOT"].includes(report?.kind) ||
          !identityValid ||
          report?.identity_digest !== fnv1a64(stableJson(report?.identity)) ||
          !Array.isArray(decisionIds) || decisionIds.length < 1 || decisionIds.length > MAX_CROSS_PLANE_IDS_PER_REPORT || new Set(decisionIds).size !== decisionIds.length || decisionIds.some((id) => !validSafeId(id, 96)) || stableJson(decisionIds) !== stableJson([...decisionIds].sort()) ||
          !Array.isArray(fullIds) || fullIds.length < 1 || fullIds.length > MAX_CROSS_PLANE_IDS_PER_REPORT || new Set(fullIds).size !== fullIds.length || fullIds.some((id) => !validSafeId(id, 256)) || stableJson(fullIds) !== stableJson([...fullIds].sort()) ||
          !decisionCountValid || (Array.isArray(decisionIds) && decisionIds.length !== Math.min(report?.decision_evidence_count, MAX_CROSS_PLANE_IDS_PER_REPORT)) ||
          !fullCountValid || (Array.isArray(fullIds) && fullIds.length !== Math.min(report?.full_evidence_observation_count, MAX_CROSS_PLANE_IDS_PER_REPORT)) ||
          report?.detail_truncated !== (report.decision_evidence_count > MAX_CROSS_PLANE_IDS_PER_REPORT || report.full_evidence_observation_count > MAX_CROSS_PLANE_IDS_PER_REPORT)) errors.push("CROSS_PLANE_REUSE_DETAIL_INVALID");
      reportSortKeys.push(`${report?.kind || ""}:${report?.identity_digest || ""}`);
    }
    if (stableJson(reportSortKeys) !== stableJson([...reportSortKeys].sort()) || new Set(reportSortKeys).size !== reportSortKeys.length) errors.push("CROSS_PLANE_REUSE_REPORT_ORDER_INVALID");
    const expectedReuseDigest = fnv1a64(stableJson({
      total_reuse_count: crossPlaneReuse.total_reuse_count,
      report_truncated: crossPlaneReuse.report_truncated,
      reports: crossPlaneReuse.reports,
    }));
    if (crossPlaneReuse.all_reuse_digest !== expectedReuseDigest) errors.push("CROSS_PLANE_REUSE_DIGEST_MISMATCH");
    const expectedReuseReasons = uniqSorted([
      ...crossPlaneReuse.reports.map((report) => `CROSS_PLANE_${report.kind}_REUSE:${report.identity_digest}`),
      ...(crossPlaneReuse.report_truncated ? ["CROSS_PLANE_REUSE_REPORT_TRUNCATED"] : []),
    ], MAX_EXPLANATION_ITEMS);
    if (stableJson(crossPlaneReuse.reason_codes) !== stableJson(expectedReuseReasons)) errors.push("CROSS_PLANE_REUSE_REASONS_MISMATCH");
  }
  const expectedVetoQuality = ["ACTIVE", "CLEAR"].includes(output?.hard_veto_state) ? "CLOSED" : output?.hard_veto_state;
  if (!hasExactOwnKeys(output?.source_quality, SOURCE_QUALITY_OUTPUT_KEYS)) errors.push("SOURCE_QUALITY_SHAPE_INVALID");
  const strictChainStatus = output?.source_quality?.strict_weighted_chain_status;
  const strictChainKeys = strictChainStatus && typeof strictChainStatus === "object" && !Array.isArray(strictChainStatus)
    ? Object.keys(strictChainStatus)
    : [];
  const strictChainShape = hasExactOwnKeys(strictChainStatus, []) || (
    hasExactOwnKeys(strictChainStatus, REQUIRED_WEIGHTED_CHAINS) &&
    strictChainKeys.every((chain) => {
      const state = strictChainStatus[chain];
      return hasExactOwnKeys(state, STRICT_CHAIN_STATUS_KEYS) &&
        typeof state.declared_closed === "boolean" &&
        Number.isSafeInteger(state.eligible_rows) && state.eligible_rows >= 0 && state.eligible_rows <= MAX_FULL_EVIDENCE_ROWS &&
        typeof state.closed === "boolean" &&
        state.closed === (state.declared_closed && state.eligible_rows > 0);
    })
  );
  if (!strictChainShape) errors.push("STRICT_WEIGHTED_CHAIN_STATUS_SHAPE_INVALID");
  if (strictChainShape && strictChainKeys.length === 0 && output?.source_quality?.full_evidence !== "INSUFFICIENT") errors.push("STRICT_WEIGHTED_CHAIN_STATUS_COHERENCE_INVALID");
  if (strictChainShape && output?.source_quality?.full_evidence === "CLOSED" &&
      (!hasExactOwnKeys(strictChainStatus, REQUIRED_WEIGHTED_CHAINS) || ENTRY_CRITICAL_FULL_CHAINS.some((chain) => strictChainStatus[chain]?.closed !== true))) {
    errors.push("STRICT_WEIGHTED_CHAIN_STATUS_COHERENCE_INVALID");
  }
  if (SOURCE_QUALITY_OUTPUT_KEYS.filter((key) => key !== "strict_weighted_chain_status")
    .some((key) => !Object.values(DECISION_QUALITY).includes(output?.source_quality?.[key]))) errors.push("SOURCE_QUALITY_VALUE_INVALID");
  if (output?.source_quality?.entry_execution !== output?.entry_execution_quality || output?.source_quality?.management_execution !== output?.management_execution_quality || output?.source_quality?.campaign !== output?.campaign_quality || output?.source_quality?.hard_veto !== expectedVetoQuality ||
      !Object.values(DECISION_QUALITY).includes(output?.source_quality?.position_origin_campaign) || !Object.values(DECISION_QUALITY).includes(output?.source_quality?.position_management)) errors.push("SOURCE_QUALITY_CONTRACT_MISMATCH");
  if (output?.directional_quality === "CLOSED") {
    const domains = output?.evidence_independence?.causal_domains || {};
    const directionalDomains = ["PRICE_ACTION", "POSITIONING", "RELATIVE_MARKET"];
    const matching = directionalDomains.filter((domain) => domains?.[domain]?.state === output?.direction);
    const opposing = directionalDomains.filter((domain) => ["LONG", "SHORT", "CONFLICTING"].includes(domains?.[domain]?.state) && domains[domain].state !== output?.direction);
    if (!['LONG', 'SHORT'].includes(output?.direction) || domains?.PRICE_ACTION?.state !== output?.direction || matching.filter((domain) => domain !== "PRICE_ACTION").length < 1 || opposing.length > 0 || output?.independence_state !== "CLOSED") errors.push("DIRECTION_EVIDENCE_COHERENCE_MISMATCH");
    if (!Array.isArray(output?.evidence_independence?.effective_directional_domains) || stableJson(output.evidence_independence.effective_directional_domains) !== stableJson([...matching].sort())) errors.push("DIRECTION_EFFECTIVE_DOMAIN_SET_MISMATCH");
  }
  if (output?.independence_state === "CLOSED") {
    const effective = output?.evidence_independence?.effective_directional_domains;
    const votes = output?.evidence_independence?.effective_directional_vote_count;
    const raw = output?.evidence_independence?.raw_usable_evidence_count;
    if (!Array.isArray(effective) || effective.length < 2 || effective.length > DIRECTIONAL_DOMAINS.size || new Set(effective).size !== effective.length || effective.some((domain) => !DIRECTIONAL_DOMAINS.has(domain)) || !effective.includes("PRICE_ACTION") || !effective.some((domain) => domain !== "PRICE_ACTION" && DIRECTIONAL_DOMAINS.has(domain)) || votes !== effective.length || !Number.isSafeInteger(raw) || raw < votes) errors.push("INDEPENDENCE_CLOSURE_COUNTS_INVALID");
    if (Array.isArray(effective)) {
      const effectiveCorrelationGroups = [];
      let missingEffectiveGroups = false;
      for (const domain of effective) {
        const groups = output?.evidence_independence?.causal_domains?.[domain]?.correlation_groups;
        if (!Array.isArray(groups) || groups.length < 1) missingEffectiveGroups = true;
        else effectiveCorrelationGroups.push(...groups);
      }
      if (missingEffectiveGroups) errors.push("EFFECTIVE_DOMAIN_CORRELATION_GROUP_MISSING");
      if (new Set(effectiveCorrelationGroups).size !== effectiveCorrelationGroups.length) errors.push("CROSS_DOMAIN_CORRELATION_GROUP_REUSE");
    }
  }
  if (output?.data_quality === "CLOSED" && ["full_evidence", "opportunity", "campaign"].some((key) => output?.source_quality?.[key] !== "CLOSED")) errors.push("DATA_QUALITY_SOURCE_COHERENCE_MISMATCH");
  if (output?.direction === "NEUTRAL" && output?.directional_quality !== "CONFLICTING") errors.push("NEUTRAL_WITHOUT_CONFLICT");
  if (output?.direction === "INSUFFICIENT" && output?.directional_quality === "CLOSED") errors.push("INSUFFICIENT_WITH_CLOSED_DIRECTION");
  if (["BLOCKED", "INSUFFICIENT"].includes(output?.directional_quality) && output?.direction !== "INSUFFICIENT") errors.push("UNCLOSED_DIRECTIONAL_QUALITY_WITH_DIRECTION");
  const actionIdentity = output?.action_identity;
  if (!hasExactOwnKeys(actionIdentity, ["entry", "management"])) errors.push("ACTION_IDENTITY_SHAPE_INVALID");
  else {
    if (output?.entry_action === "SHADOW_ENTRY_ELIGIBLE") {
      const basis = actionIdentity.entry;
      const exactEntryBasis = basis && stableJson(Object.keys(basis).sort()) === stableJson(["campaign_id", "contract_code", "direction", "entry_trigger_ts", "wave_id"]);
      const expected = exactEntryBasis && normalizedContract(basis?.contract_code).value === output?.contract_code && basis?.direction === output?.direction && ["LONG", "SHORT"].includes(basis?.direction) && validSafeId(basis?.campaign_id, 256) && validSafeId(basis?.wave_id, 320) && Number.isSafeInteger(basis?.entry_trigger_ts) && basis.entry_trigger_ts > 0 && basis.entry_trigger_ts <= output.observation_ts
        ? `FDE:${fnv1a64(stableJson([basis.contract_code, basis.campaign_id, basis.wave_id, basis.entry_trigger_ts]))}`
        : null;
      if (!expected || expected !== output.entry_action_id) errors.push("ENTRY_ACTION_ID_BASIS_MISMATCH");
    } else if (actionIdentity.entry !== null) errors.push("NON_ENTRY_HAS_ACTION_BASIS");
    if (output?.management_action === "EXIT") {
      const basis = actionIdentity.management;
      const exactManagementBasis = basis && stableJson(Object.keys(basis).sort()) === stableJson(["command", "contract_code", "position_direction", "position_id", "position_state_revision"]);
      const expectedPositionDirection = output?.position_state === "OPEN_LONG" ? "LONG" : output?.position_state === "OPEN_SHORT" ? "SHORT" : null;
      const expected = exactManagementBasis && basis.command === "EXIT" && normalizedContract(basis.contract_code).value === output.contract_code && basis.position_direction === expectedPositionDirection && ["LONG", "SHORT"].includes(basis.position_direction) && validSafeId(basis.position_id, 256) && Number.isSafeInteger(basis.position_state_revision) && basis.position_state_revision >= 0
        ? `FDX:${fnv1a64(stableJson(basis))}`
        : null;
      if (!expected || expected !== output.management_action_id) errors.push("MANAGEMENT_ACTION_ID_BASIS_MISMATCH");
    } else if (actionIdentity.management !== null) errors.push("NON_EXIT_HAS_ACTION_BASIS");
  }
  const receipts = output?.lineage_receipts;
  const receiptShape = receipts && typeof receipts === "object" && !Array.isArray(receipts) &&
    stableJson(Object.keys(receipts).sort()) === stableJson(["campaign", "decision_evidence", "full_evidence", "full_evidence_source", "opportunity", "position", "position_management", "position_origin_campaign", "safety_gate"]);
  if (!receiptShape) errors.push("LINEAGE_RECEIPTS_INVALID");
  else {
    for (const [kind, receipt] of Object.entries(receipts)) {
      const exactShape = receipt && typeof receipt === "object" && !Array.isArray(receipt) &&
        stableJson(Object.keys(receipt).sort()) === stableJson(["committed_ts", "content_digest", "receipt_id"]);
      const absent = exactShape && receipt.receipt_id === null && receipt.committed_ts === null && receipt.content_digest === null;
      const closed = exactShape && validSafeId(receipt.receipt_id, 256) && Number.isSafeInteger(receipt.committed_ts) &&
        receipt.committed_ts > 0 && receipt.committed_ts <= output.observation_ts && validDigest(receipt.content_digest);
      if (!absent && !closed) {
        errors.push(`LINEAGE_RECEIPT_INVALID:${kind}`);
      }
    }
    const closedReceiptIds = Object.values(receipts)
      .map((receipt) => receipt?.receipt_id)
      .filter((receiptId) => validSafeId(receiptId, 256));
    const receiptIdCollision = new Set(closedReceiptIds).size !== closedReceiptIds.length;
    const collisionSafelyQuarantined = output?.status === "FAIL_CLOSED" &&
      Array.isArray(output?.reason_codes) && output.reason_codes.includes("INPUT_LINEAGE_RECEIPT_ID_COLLISION") &&
      output?.entry_action !== "SHADOW_ENTRY_ELIGIBLE" && !["HOLD", "EXIT"].includes(output?.management_action);
    if (receiptIdCollision && !collisionSafelyQuarantined) errors.push("LINEAGE_RECEIPT_ID_COLLISION");
    const requiredDataReceipts = ["decision_evidence", "full_evidence", "full_evidence_source", "opportunity", "campaign"];
    if (output?.data_quality === "CLOSED" && requiredDataReceipts.some((kind) => !validSafeId(receipts?.[kind]?.receipt_id, 256))) errors.push("CLOSED_DATA_WITHOUT_LINEAGE_RECEIPTS");
    const closedSourceReceiptMap = [
      ["full_evidence", ["full_evidence", "full_evidence_source"]],
      ["opportunity", ["opportunity"]],
      ["campaign", ["campaign"]],
      ["position", ["position"]],
      ["position_origin_campaign", ["position_origin_campaign"]],
      ["position_management", ["position_management"]],
      ["entry_execution", ["safety_gate"]],
      ["management_execution", ["safety_gate"]],
      ["hard_veto", ["safety_gate"]],
    ];
    for (const [source, requiredReceipts] of closedSourceReceiptMap) {
      if (output?.source_quality?.[source] === "CLOSED" && requiredReceipts.some((kind) => !validSafeId(receipts?.[kind]?.receipt_id, 256))) errors.push(`CLOSED_SOURCE_WITHOUT_LINEAGE_RECEIPT:${source}`);
    }
    const causalEvidenceClaimed = output?.evidence_independence?.causal_domains && Object.values(output.evidence_independence.causal_domains)
      .some((domain) => Array.isArray(domain?.evidence_ids) && domain.evidence_ids.length > 0);
    const crossPlaneReuseClaimed = Number.isSafeInteger(output?.evidence_independence?.cross_plane_reuse?.total_reuse_count) && output.evidence_independence.cross_plane_reuse.total_reuse_count > 0;
    const decisionEvidenceClaimed = (Number.isSafeInteger(output?.evidence_independence?.raw_usable_evidence_count) && output.evidence_independence.raw_usable_evidence_count > 0) || causalEvidenceClaimed || crossPlaneReuseClaimed || ["CLOSED", "CONFLICTING"].includes(output?.directional_quality) || ["CLOSED", "CORRELATED", "CONFLICTING"].includes(output?.independence_state);
    if (decisionEvidenceClaimed && !validSafeId(receipts?.decision_evidence?.receipt_id, 256)) errors.push("DIRECTION_EVIDENCE_WITHOUT_LINEAGE_RECEIPT");
    if (crossPlaneReuseClaimed && ["full_evidence", "full_evidence_source"].some((kind) => !validSafeId(receipts?.[kind]?.receipt_id, 256))) errors.push("CROSS_PLANE_REUSE_WITHOUT_FULL_EVIDENCE_LINEAGE");
    if (output?.entry_action === "SHADOW_ENTRY_ELIGIBLE" && ["position", "safety_gate"].some((kind) => !validSafeId(receipts?.[kind]?.receipt_id, 256))) errors.push("ENTRY_WITHOUT_LANE_LINEAGE_RECEIPTS");
    if (["HOLD", "EXIT"].includes(output?.management_action) && ["position", "position_origin_campaign", "safety_gate"].some((kind) => !validSafeId(receipts?.[kind]?.receipt_id, 256))) errors.push("MANAGEMENT_ACTION_WITHOUT_LANE_LINEAGE_RECEIPTS");
    if (output?.management_action === "HOLD" && !validSafeId(receipts?.position_management?.receipt_id, 256)) errors.push("HOLD_WITHOUT_MANAGEMENT_CONTEXT_RECEIPT");
  }
  if (!validDigest(output?.input_lineage_digest)) errors.push("INPUT_LINEAGE_DIGEST_INVALID");
  else if (receiptShape && output.input_lineage_digest !== fnv1a64(stableJson({
    contract_code: output.contract_code,
    snapshot_id: output.snapshot_id,
    observation_ts: output.observation_ts,
    lineage_receipts: receipts,
  }))) errors.push("INPUT_LINEAGE_DIGEST_MISMATCH");
  if (!hasExactOwnKeys(output?.explainability, EXPLAINABILITY_OUTPUT_KEYS)) errors.push("EXPLAINABILITY_SHAPE_INVALID");
  if (output?.explainability?.no_score_aggregation_used !== true) errors.push("NO_SCORE_GUARANTEE_MISSING");
  for (const key of ["confirming_evidence", "contradictory_evidence", "blockers", "missing_or_unusable", "suppressed_evidence"]) {
    const values = output?.explainability?.[key];
    if (!Array.isArray(values) || values.length > MAX_REASON_CODES || new Set(values).size !== values.length || values.some((value) => typeof value !== "string" || value.length < 1 || value.length > 256 || /[\u0000-\u001f\u007f]/u.test(value))) errors.push(`EXPLAINABILITY_LIST_INVALID:${key}`);
  }
  if (stableJson(output?.explainability?.gate_order) !== stableJson(EXPECTED_GATE_ORDER)) errors.push("EXPLAINABILITY_GATE_ORDER_INVALID");
  const latency = output?.opportunity_latency;
  if (!hasExactOwnKeys(latency, OPPORTUNITY_LATENCY_OUTPUT_KEYS)) errors.push("OPPORTUNITY_LATENCY_SHAPE_INVALID");
  if (!latency || typeof latency !== "object" || Array.isArray(latency)) errors.push("OPPORTUNITY_LATENCY_MISSING");
  else {
    for (const key of ["event_ts", "event_close_ts", "first_detected_ts", "entry_trigger_ts"]) {
      const value = latency[key];
      if (value !== null && (!Number.isSafeInteger(value) || value <= 0 || value > output.observation_ts)) errors.push(`OPPORTUNITY_LATENCY_TIMESTAMP_INVALID:${key}`);
    }
    for (const key of ["detection_lag_ms", "detection_lag_from_close_ms", "entry_lag_from_detection_ms", "observation_age_from_event_ms"]) {
      const value = latency[key];
      if (value !== null && (!Number.isSafeInteger(value) || value < 0)) errors.push(`OPPORTUNITY_LATENCY_VALUE_INVALID:${key}`);
    }
    const expectedLatency = {
      detection_lag_ms: nonNegativeLag(latency.first_detected_ts, latency.event_ts),
      detection_lag_from_close_ms: nonNegativeLag(latency.first_detected_ts, latency.event_close_ts),
      entry_lag_from_detection_ms: nonNegativeLag(latency.entry_trigger_ts, latency.first_detected_ts),
      observation_age_from_event_ms: nonNegativeLag(output.observation_ts, latency.event_ts),
    };
    if (output.status !== "FAIL_CLOSED" && latency.event_ts !== null && latency.event_close_ts !== null && latency.event_close_ts < latency.event_ts) errors.push("OPPORTUNITY_LATENCY_EVENT_CLOSE_BEFORE_EVENT");
    if (output.status !== "FAIL_CLOSED" && latency.event_close_ts !== null && latency.first_detected_ts !== null && latency.first_detected_ts < latency.event_close_ts) errors.push("OPPORTUNITY_LATENCY_DETECTION_BEFORE_EVENT_CLOSE");
    for (const [key, expected] of Object.entries(expectedLatency)) {
      if (latency[key] !== expected) errors.push(`OPPORTUNITY_LATENCY_COHERENCE_MISMATCH:${key}`);
    }
  }
  errors.push(...scanSafety(output));
  try {
    if (new TextEncoder().encode(stableJson(output)).byteLength > MAX_ENGINE_OUTPUT_JSON_BYTES) errors.push("OUTPUT_JSON_TOO_LARGE");
  } catch {
    errors.push("OUTPUT_JSON_SERIALIZATION_INVALID");
  }
  return { valid: errors.length === 0, errors: uniqSorted(errors) };
}

export const FINAL_DECISION_LIMITS = Object.freeze({
  max_evidence_rows: MAX_EVIDENCE_ROWS,
  max_explanation_items: MAX_EXPLANATION_ITEMS,
  max_reason_codes: MAX_REASON_CODES,
  max_engine_output_json_bytes: MAX_ENGINE_OUTPUT_JSON_BYTES,
  max_full_evidence_age_sec: MAX_FULL_EVIDENCE_AGE_SEC,
  max_decision_evidence_age_ms: MAX_DECISION_EVIDENCE_AGE_MS,
  max_shadow_entry_window_ms: MAX_SHADOW_ENTRY_WINDOW_MS,
  network_calls: 0,
  strategy_weights_added: 0,
});
