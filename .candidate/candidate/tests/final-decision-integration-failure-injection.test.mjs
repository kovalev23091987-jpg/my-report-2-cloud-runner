import assert from "node:assert/strict";
import { buildFinalDecisionIntegrationShadow, validateFinalDecisionOutput } from "../src/final-decision-integration-engine.mjs";
import {
  persistFinalDecisionIntegrationShadow,
  toFinalDecisionIntegrationRecord,
  validateFinalDecisionIntegrationRecord,
} from "../src/final-decision-integration-runtime.mjs";
import {
  NOW, completeInput, impulseCampaign, openPosition, positionOriginCampaign,
} from "./final-decision-integration-fixtures.mjs";

function baseRecord() {
  return toFinalDecisionIntegrationRecord(buildFinalDecisionIntegrationShadow(completeInput("LONG")));
}

function assertRejected(mutator, expected) {
  const candidate = baseRecord();
  mutator(candidate);
  const result = validateFinalDecisionIntegrationRecord(candidate, { now: NOW + 1_000 });
  assert.equal(result.ok, false, `unexpected valid record for ${expected}`);
  assert.ok(result.errors.some((error) => String(error).includes(expected)), `${expected}: ${result.errors.join(",")}`);
}

async function withFixtureClock(run) {
  const original = Date.now;
  Date.now = () => NOW + 1_000;
  try {
    return await run();
  } finally {
    Date.now = original;
  }
}

assertRejected((record) => { record.observation_ts = NOW + 1_001; }, "FUTURE_OBSERVATION_FORBIDDEN");
assertRejected((record) => { record.observation_ts = NOW - 5 * 60_000 - 1; }, "LIVE_OBSERVATION_COMMIT_LAG_EXCEEDED");
assertRejected((record) => { record.contract_code = "TЕST-USDT"; }, "CONTRACT_CODE_INVALID"); // Cyrillic U+0415.
assertRejected((record) => { record.live_probability = 0.5; }, "LIVE_PROBABILITY_FORBIDDEN");
assertRejected((record) => { record.validated_signal = true; }, "UNSAFE_FLAG_FORBIDDEN:validated_signal");
assertRejected((record) => { record.execution_authorized = true; }, "UNSAFE_FLAG_FORBIDDEN:execution_authorized");
assertRejected((record) => { record.telegram_eligible = true; }, "UNSAFE_FLAG_FORBIDDEN:telegram_eligible");
assertRejected((record) => { record.calibration_eligible = true; }, "UNSAFE_FLAG_FORBIDDEN:calibration_eligible");
assertRejected((record) => { record.shadow_outcome_collection_eligible = true; }, "OUTCOME_COLLECTION_ELIGIBILITY_FORBIDDEN");
assertRejected((record) => { record.payload.engine_output.explainability.shadow_outcome_collection_eligible = true; }, "UNSAFE_FLAG_FORBIDDEN:shadow_outcome_collection_eligible");
assertRejected((record) => { record.payload.engine_output.safety.live_signal = true; }, "UNSAFE_FLAG_FORBIDDEN:live_signal");
assertRejected((record) => { record.payload.engine_output.live_probability = 0; }, "LIVE_PROBABILITY_FORBIDDEN");
assertRejected((record) => { record.payload.engine_output.explainability["note.text"] = "harmless"; }, "JSON_KEY_INVALID");
assertRejected((record) => { record.payload.engine_output.opportunity_latency.event_ts = NOW + 1; }, "OPPORTUNITY_LATENCY_TIMESTAMP_INVALID:event_ts");
assertRejected((record) => { record.payload.engine_output.opportunity_latency.detection_lag_ms = Number.NaN; }, "JSON_NON_FINITE_NUMBER");
assertRejected((record) => { record.reason_codes.push(record.reason_codes[0]); }, "REASON_CODE_DUPLICATE");
assertRejected((record) => {
  record.decision_status = "FAIL_CLOSED";
  record.reason_codes = null;
  record.full_evidence_receipt_id = record.decision_evidence_receipt_id;
}, "REASON_CODES_INVALID");
assertRejected((record) => { record.extra_live_switch = false; }, "UNKNOWN_FIELD:extra_live_switch");
assertRejected((record) => { record.entry_action_id = "FDE:TAMPERED"; }, "ENGINE_OUTPUT_SCALAR_MISMATCH:entry_action_id");
assertRejected((record) => { record.material_digest = "0123456789abcdef"; }, "DECISION_MATERIAL_ID_MISMATCH");
assertRejected((record) => { record.input_lineage_digest = "0123456789abcdef"; }, "ENGINE_OUTPUT_SCALAR_MISMATCH:input_lineage_digest");

for (const malformedObservedTs of [null, {}, [], "BROKEN", 0, false, NOW + 0.5]) {
  const output = buildFinalDecisionIntegrationShadow(completeInput("LONG", { observed_ts: malformedObservedTs }));
  assert.equal(output.status, "FAIL_CLOSED");
  assert.ok(output.reason_codes.includes("INPUT_IDENTITY_UNTRUSTED"));
  assert.deepEqual(validateFinalDecisionOutput(output), { valid: true, errors: [] });
  assert.ok(Object.values(output.lineage_receipts).every((receipt) => receipt.receipt_id === null));
  assert.ok(Object.values(output.opportunity_latency).every((value) => value === null));
}

{
  const input = completeInput("LONG");
  input.evidence_registry.entries = new Array(1_000_000);
  let output;
  assert.doesNotThrow(() => { output = buildFinalDecisionIntegrationShadow(input); });
  assert.equal(output.status, "FAIL_CLOSED");
  assert.equal(output.independence_state, "BLOCKED");
  assert.notEqual(output.entry_action, "SHADOW_ENTRY_ELIGIBLE");
  assert.ok(output.reason_codes.includes("EVIDENCE_LINEAGE_REGISTRY_UNBOUNDED"));
  assert.deepEqual(validateFinalDecisionOutput(output), { valid: true, errors: [] });
}

for (const malformedContext of [{}, [], "BROKEN", 0, false]) {
  for (const field of ["position_origin_campaign", "position_management_context"]) {
    const output = buildFinalDecisionIntegrationShadow(completeInput("LONG", { [field]: malformedContext }));
    assert.equal(output.status, "FAIL_CLOSED");
    assert.equal(output.entry_action, "REJECT");
    assert.notEqual(output.entry_action, "SHADOW_ENTRY_ELIGIBLE");
    assert.deepEqual(validateFinalDecisionOutput(output), { valid: true, errors: [] });
  }
}

{
  const input = openCompleteInput();
  input.execution_authorized = true;
  const output = buildFinalDecisionIntegrationShadow(input);
  assert.equal(output.status, "FAIL_CLOSED");
  assert.equal(output.risk_state, "BLOCKED");
  assert.equal(output.management_action, "NOT_EVALUATED");
  assert.equal(output.management_intent, "NOT_EVALUATED");
  assert.deepEqual(validateFinalDecisionOutput(output), { valid: true, errors: [] });
}

function openCompleteInput() {
  const activeCampaign = impulseCampaign("LONG");
  const position = openPosition("LONG", activeCampaign);
  const origin = positionOriginCampaign(activeCampaign, position);
  return completeInput("LONG", { campaign: activeCampaign, position, position_origin_campaign: origin });
}

function setPath(target, path, value) {
  const parts = path.split(".");
  let cursor = target;
  for (const part of parts.slice(0, -1)) cursor = cursor[part];
  cursor[parts.at(-1)] = value;
}

const lineageMutationCases = [
  ["decision_evidence", "evidence_registry.receipt_id", "evidence_registry.content_digest", "evidence_registry.persistence.committed_ts"],
  ["full_evidence_source", "full_evidence.source_registry.receipt_id", "full_evidence.source_registry.content_digest", "full_evidence.source_registry.persistence.committed_ts"],
  ["full_evidence", "full_evidence.persistence.receipt_id", "full_evidence.persistence.content_digest", "full_evidence.persistence.committed_ts"],
  ["opportunity", "opportunity.persistence.receipt_id", "opportunity.persistence.content_digest", "opportunity.persistence.committed_ts"],
  ["campaign", "campaign.persistence.receipt_id", "campaign.persistence.content_digest", "campaign.persistence.committed_ts"],
  ["safety_gate", "safety_gate_receipt.receipt_id", "safety_gate_receipt.content_digest", "safety_gate_receipt.persistence.committed_ts"],
  ["position", "position.persistence.receipt_id", "position.persistence.content_digest", "position.persistence.committed_ts"],
  ["position_origin_campaign", "position_origin_campaign.persistence.receipt_id", "position_origin_campaign.persistence.content_digest", "position_origin_campaign.persistence.committed_ts"],
  ["position_management", "position_management_context.persistence.receipt_id", "position_management_context.persistence.content_digest", "position_management_context.persistence.committed_ts"],
];
for (const [lineageKey, ...paths] of lineageMutationCases) {
  for (const path of paths) {
    const input = openCompleteInput();
    setPath(input, path, null);
    const output = buildFinalDecisionIntegrationShadow(input);
    assert.deepEqual(output.lineage_receipts[lineageKey], { receipt_id: null, content_digest: null, committed_ts: null });
    assert.deepEqual(validateFinalDecisionOutput(output), { valid: true, errors: [] }, `${lineageKey}:${path}`);
  }
}

for (const [path, latencyKey] of [
  ["opportunity.newest_event.timestamp", "event_ts"],
  ["opportunity.newest_event.event_close_ts", "event_close_ts"],
  ["campaign.campaign.first_detected_time", "first_detected_ts"],
  ["campaign.campaign.entry_trigger_time", "entry_trigger_ts"],
]) {
  const input = completeInput("LONG");
  setPath(input, path, NOW + 1);
  const output = buildFinalDecisionIntegrationShadow(input);
  assert.equal(output.status, "FAIL_CLOSED", path);
  assert.equal(output.opportunity_latency[latencyKey], null, path);
  assert.deepEqual(validateFinalDecisionOutput(output), { valid: true, errors: [] }, path);
}

{
  const candidate = baseRecord();
  const withGetter = {};
  Object.defineProperty(withGetter, "engine_output", { enumerable: true, get() { throw new Error("getter executed"); } });
  candidate.payload = withGetter;
  const result = validateFinalDecisionIntegrationRecord(candidate, { now: NOW + 1_000 });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("JSON_ACCESSOR_UNSUPPORTED"));
}

for (const field of ["decision_id", "direction", "reason_codes"]) {
  const candidate = baseRecord();
  let getterReads = 0;
  Object.defineProperty(candidate, field, {
    configurable: true,
    enumerable: false,
    get() {
      getterReads += 1;
      throw new Error(`hostile ${field} getter executed`);
    },
  });
  const result = validateFinalDecisionIntegrationRecord(candidate, { now: NOW + 1_000 });
  assert.equal(result.ok, false, field);
  assert.ok(result.errors.includes("JSON_NON_ENUMERABLE_PROPERTY_UNSUPPORTED"), field);
  assert.equal(getterReads, 0, `${field} getter must not execute`);
}

for (const [trap, expected] of [
  ["getPrototypeOf", "hostile getPrototypeOf trap"],
  ["ownKeys", "hostile ownKeys trap"],
  ["getOwnPropertyDescriptor", "hostile getOwnPropertyDescriptor trap"],
]) {
  const candidate = new Proxy(baseRecord(), {
    [trap]() { throw new Error(expected); },
  });
  let result = null;
  assert.doesNotThrow(() => {
    result = validateFinalDecisionIntegrationRecord(candidate, { now: NOW + 1_000 });
  }, trap);
  assert.equal(result.ok, false, trap);
  assert.ok(result.errors.includes(expected), trap);
}

{
  const hostileThrown = {};
  Object.defineProperty(hostileThrown, "message", {
    get() { throw new Error("hostile thrown-value message getter executed"); },
  });
  const candidate = new Proxy(baseRecord(), {
    ownKeys() { throw hostileThrown; },
  });
  let result = null;
  assert.doesNotThrow(() => {
    result = validateFinalDecisionIntegrationRecord(candidate, { now: NOW + 1_000 });
  });
  assert.deepEqual(result, { ok: false, errors: ["UNINSPECTABLE_ERROR"] });
}

{
  let result = null;
  assert.doesNotThrow(() => {
    result = validateFinalDecisionIntegrationRecord(baseRecord(), null);
  });
  assert.deepEqual(result, { ok: false, errors: ["VALIDATION_OPTIONS_INVALID"] });
}

{
  let getterReads = 0;
  const options = {};
  Object.defineProperty(options, "now", {
    enumerable: true,
    get() {
      getterReads += 1;
      throw new Error("hostile options getter executed");
    },
  });
  const result = validateFinalDecisionIntegrationRecord(baseRecord(), options);
  assert.deepEqual(result, { ok: false, errors: ["VALIDATION_OPTIONS_INVALID"] });
  assert.equal(getterReads, 0, "validation options getter must not execute");
}

{
  let getterReads = 0;
  const candidate = new Proxy(baseRecord(), {
    get() {
      getterReads += 1;
      throw new Error("hostile proxy get trap executed");
    },
  });
  const result = validateFinalDecisionIntegrationRecord(candidate, { now: NOW + 1_000 });
  assert.equal(result.ok, true);
  assert.equal(getterReads, 0, "descriptor snapshot must not execute Proxy get traps");
}

{
  const candidate = baseRecord();
  let getterReads = 0;
  candidate.reason_codes = new Proxy(candidate.reason_codes, {
    get() {
      getterReads += 1;
      throw new Error("hostile array proxy get trap executed");
    },
  });
  const result = validateFinalDecisionIntegrationRecord(candidate, { now: NOW + 1_000 });
  assert.equal(result.ok, true);
  assert.equal(getterReads, 0, "array descriptor snapshot must not read Proxy length or indices");
}

{
  const candidate = baseRecord();
  Object.defineProperty(candidate.reason_codes, "0", {
    configurable: true,
    enumerable: false,
    writable: true,
    value: candidate.reason_codes[0],
  });
  const result = validateFinalDecisionIntegrationRecord(candidate, { now: NOW + 1_000 });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("JSON_ARRAY_ENUMERABILITY_INVALID"));
}

{
  const candidate = baseRecord();
  const cyclic = {};
  cyclic.self = cyclic;
  candidate.payload = cyclic;
  const result = validateFinalDecisionIntegrationRecord(candidate, { now: NOW + 1_000 });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("JSON_CYCLE_DETECTED"));
}

{
  const unsafeInput = completeInput("LONG");
  unsafeInput.execution_authorized = true;
  let persistedOutput = null;
  const env = { DATA_DB: { prepare() { return { bind(...values) { persistedOutput = JSON.parse(values.at(-2)); return this; }, async run() {
    return { success: true, meta: { changes: 1, rows_read: 0, rows_written: 1, changed_db: true }, results: [] };
  } }; } } };
  const result = await withFixtureClock(() => persistFinalDecisionIntegrationShadow({ env, input: unsafeInput }));
  assert.equal(result.status, "CLOSED", "safe fail-closed reject audit remains journalable");
  assert.equal(result.commit_state, "COMMITTED");
  assert.equal(result.decision_id, persistedOutput.decision_id);
  assert.equal(persistedOutput.status, "FAIL_CLOSED");
  assert.equal(persistedOutput.execution_authorized, false);
  assert.equal(persistedOutput.live_probability, null);
}

{
  const calls = { prepare: 0 };
  const env = { DATA_DB: { prepare() { calls.prepare += 1; throw new Error("no such table: final_decision_integration_shadow"); } } };
  const result = await withFixtureClock(() => persistFinalDecisionIntegrationShadow({ env, input: completeInput("LONG") }));
  assert.equal(result.status, "MIGRATION_REQUIRED");
  assert.equal(result.commit_state, "NOT_ATTEMPTED");
  assert.equal(result.decision_id, baseRecord().decision_id);
  assert.equal(result.prepared_statements, 0);
  assert.equal(result.bound_statements, 0);
  assert.equal(result.attempted_statements, 0);
  assert.equal(calls.prepare, 1);
}

{
  const calls = { prepare: 0, bind: 0 };
  const env = { DATA_DB: { prepare() { calls.prepare += 1; return { bind() { calls.bind += 1; throw new Error("forced bind failure"); } }; } } };
  const result = await withFixtureClock(() => persistFinalDecisionIntegrationShadow({ env, input: completeInput("LONG") }));
  assert.equal(result.status, "PARTIAL_FAIL_CLOSED");
  assert.equal(result.commit_state, "NOT_ATTEMPTED");
  assert.equal(result.decision_id, baseRecord().decision_id);
  assert.equal(result.prepared_statements, 1);
  assert.equal(result.bound_statements, 0);
  assert.equal(result.attempted_statements, 0);
  assert.deepEqual(calls, { prepare: 1, bind: 1 });
}

{
  let runs = 0;
  const env = { DATA_DB: { prepare() { return { bind() { return this; }, async run() { runs += 1; throw new Error("forced D1 partial failure"); } }; } } };
  const result = await withFixtureClock(() => persistFinalDecisionIntegrationShadow({ env, input: completeInput("LONG") }));
  assert.equal(result.status, "PARTIAL_FAIL_CLOSED");
  assert.equal(result.commit_state, "UNKNOWN");
  assert.equal(result.decision_id, baseRecord().decision_id);
  assert.equal(result.attempted_statements, 1);
  assert.equal(result.acknowledged_statements, 0);
  assert.equal(result.safety.retry_attempts, 0);
  assert.equal(runs, 1, "write failure must not retry");
}

for (const [message, expectedStatus] of [
  ["D1_ERROR: final decision action collision", "ACTION_COLLISION_FAIL_CLOSED"],
  ["D1_ERROR: final decision action target collision", "ACTION_COLLISION_FAIL_CLOSED"],
  ["UNIQUE constraint failed: final_decision_action_claim_shadow.action_id", "PARTIAL_FAIL_CLOSED"],
]) {
  const env = { DATA_DB: { prepare() { return { bind() { return this; }, async run() {
    throw new Error(message);
  } }; } } };
  const result = await withFixtureClock(() => persistFinalDecisionIntegrationShadow({
    env,
    input: completeInput("LONG"),
  }));
  assert.equal(result.status, expectedStatus, message);
  assert.equal(
    result.commit_state,
    expectedStatus === "ACTION_COLLISION_FAIL_CLOSED" ? "REJECTED" : "UNKNOWN",
    message,
  );
  assert.equal(result.decision_id, baseRecord().decision_id, message);
  assert.equal(result.acknowledged_statements, 0, message);
}

console.log(JSON.stringify({
  ok: true,
  suite: "final-decision-integration-failure-injection",
  assertions: "future/stale/Unicode/live/corrupt/tampered rejection; safe fail-closed journaling; exact action-collision classification; prepare/bind/run failure accounting; zero retry",
}));
