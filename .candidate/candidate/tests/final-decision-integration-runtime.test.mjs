import assert from "node:assert/strict";
import {
  FINAL_DECISION_INTEGRATION_MODE,
  FINAL_DECISION_INTEGRATION_RUNTIME_VERSION,
  FINAL_DECISION_INTEGRATION_SCHEMA_VERSION,
  MAX_FINAL_DECISION_ACK_ROWS_READ,
  MAX_FINAL_DECISION_ACK_ROWS_WRITTEN,
  MAX_FINAL_DECISION_ACK_LOGICAL_CHANGES,
  MAX_FINAL_DECISION_D1_STATEMENTS_PER_EVALUATION,
  TARGET_FINAL_DECISION_PAYLOAD_BYTES,
  persistFinalDecisionIntegrationShadow,
  validateFinalDecisionIntegrationRecord,
  toFinalDecisionIntegrationRecord,
} from "../src/final-decision-integration-runtime.mjs";
import { buildFinalDecisionIntegrationShadow } from "../src/final-decision-integration-engine.mjs";
import {
  NOW,
  completeInput,
  digest,
  executionGate,
  hardVeto,
  impulseCampaign,
  openPosition,
  positionManagementContext,
  positionOriginCampaign,
  safetyGateReceipt,
  withImmutableReceipt,
} from "./final-decision-integration-fixtures.mjs";

function validOutput() {
  return buildFinalDecisionIntegrationShadow(completeInput("LONG"));
}

function validRecord() {
  return toFinalDecisionIntegrationRecord(validOutput());
}

function validExitOutput() {
  const campaign = impulseCampaign("LONG");
  const position = openPosition("LONG", campaign);
  const origin = positionOriginCampaign(campaign, position);
  return buildFinalDecisionIntegrationShadow(completeInput("LONG", {
    campaign,
    position,
    position_origin_campaign: origin,
    position_management_context: null,
    hard_veto: hardVeto({ status: "VETO", reasons: ["TEST_RISK"] }),
  }));
}

function resealOutput(output) {
  output.decision_id = null;
  output.material_digest = null;
  output.material_digest = digest(output);
  output.decision_id = `FDI:${output.contract_code}:${output.observation_ts}:${output.material_digest}`;
  return output;
}

function resealLineageOutput(output) {
  output.input_lineage_digest = digest({
    contract_code: output.contract_code,
    snapshot_id: output.snapshot_id,
    observation_ts: output.observation_ts,
    lineage_receipts: output.lineage_receipts,
  });
  return resealOutput(output);
}

function decoupledHoldOutput() {
  const originCampaign = impulseCampaign("LONG");
  const position = openPosition("LONG", originCampaign);
  const origin = positionOriginCampaign(originCampaign, position);
  const management = positionManagementContext(position, origin);
  const rawCurrent = impulseCampaign("LONG");
  const unrelatedId = "MW:TEST-USDT:UNRELATED-MALFORMED";
  const unrelatedState = {
    ...rawCurrent.campaign,
    campaign_id: unrelatedId,
    current_wave_id: `${unrelatedId}:W1`,
    wave_ledger: rawCurrent.campaign.wave_ledger.map((wave) => ({
      ...wave,
      wave_id: `${unrelatedId}:W1`,
    })),
  };
  const unrelated = withImmutableReceipt({
    ...rawCurrent,
    campaign: unrelatedState,
    observation_id: unrelatedState.observation_id,
    entry_window: null,
  }, `CMR:${unrelatedId}:${unrelatedState.state_revision}`, NOW - 100);
  unrelated.campaign.impulse_start = null;
  unrelated.campaign.impulse_start_price = null;
  return buildFinalDecisionIntegrationShadow(completeInput("LONG", {
    campaign: unrelated,
    position,
    position_origin_campaign: origin,
    position_management_context: management,
  }));
}

function invalidatedBlockedPositionOutput() {
  const campaign = impulseCampaign("LONG");
  const position = openPosition("LONG", campaign);
  position.schema_version = "corrupt-position-v0";
  const veto = hardVeto({ status: "VETO", reasons: ["TEST_ACTIVE_VETO"] });
  const gate = executionGate();
  return buildFinalDecisionIntegrationShadow(completeInput("LONG", {
    campaign,
    position,
    hard_veto: veto,
    execution_gate: gate,
    safety_gate_receipt: safetyGateReceipt(veto, gate),
  }));
}

function invalidatedBlockedOriginOutput() {
  const campaign = impulseCampaign("LONG");
  const position = openPosition("LONG", campaign);
  const origin = positionOriginCampaign(campaign, position);
  origin.schema_version = "corrupt-origin-v0";
  const veto = hardVeto({ status: "VETO", reasons: ["TEST_ACTIVE_VETO"] });
  const gate = executionGate();
  return buildFinalDecisionIntegrationShadow(completeInput("LONG", {
    campaign,
    position,
    position_origin_campaign: origin,
    hard_veto: veto,
    execution_gate: gate,
    safety_gate_receipt: safetyGateReceipt(veto, gate),
  }));
}

function invalidatedUnsafeEnvelopeOutput() {
  const campaign = impulseCampaign("LONG");
  const position = openPosition("LONG", campaign);
  const veto = hardVeto({ status: "VETO", reasons: ["TEST_ACTIVE_VETO"] });
  const gate = executionGate();
  return buildFinalDecisionIntegrationShadow(completeInput("LONG", {
    campaign,
    position,
    hard_veto: veto,
    execution_gate: gate,
    safety_gate_receipt: safetyGateReceipt(veto, gate),
    execution_authorized: true,
  }));
}

function ack(changes = 1, overrides = {}) {
  return {
    success: true,
    meta: {
      served_by_primary: true,
      changes,
      changed_db: changes > 0,
      rows_read: 12,
      rows_written: changes ? 8 : 0,
      total_attempts: 1,
      ...overrides,
    },
    results: null,
  };
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

{
  const output = validOutput();
  const record = validRecord();
  const valid = validateFinalDecisionIntegrationRecord(record, { now: NOW + 1_000 });
  assert.equal(valid.ok, true, valid.errors?.join(","));
  assert.ok(valid.decision_bytes > 0 && valid.decision_bytes <= 24 * 1024);
  assert.ok(valid.record_bytes > valid.decision_bytes, "outer runtime record is validated but not duplicated in D1 JSON");
  assert.ok(valid.payload_bytes > 0 && valid.payload_bytes < TARGET_FINAL_DECISION_PAYLOAD_BYTES);
  assert.deepEqual(JSON.parse(valid.decision_json), output, "persisted JSON must be exactly the sealed engine output");
}

{
  const output = decoupledHoldOutput();
  assert.equal(output.management_action, "HOLD");
  assert.equal(output.data_quality, "BLOCKED");
  assert.equal(output.campaign_quality, "BLOCKED");
  const validation = validateFinalDecisionIntegrationRecord(
    toFinalDecisionIntegrationRecord(output),
    { now: NOW + 1_000 },
  );
  assert.equal(validation.ok, true, validation.errors?.join(","));
}

{
  const output = decoupledHoldOutput();
  const record = toFinalDecisionIntegrationRecord(output);
  assert.equal(output.campaign_phase, "IMPULSE");
  assert.equal(output.timing_state, "BLOCKED");
  output.campaign_quality = "CLOSED";
  output.source_quality.campaign = "CLOSED";
  output.timing_state = "EARLY";
  resealOutput(output);
  record.campaign_quality = output.campaign_quality;
  record.timing_state = output.timing_state;
  record.material_digest = output.material_digest;
  record.decision_id = output.decision_id;
  const validation = validateFinalDecisionIntegrationRecord(
    record,
    { now: NOW + 1_000 },
  );
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.includes("CAMPAIGN_PHASE_TIMING_MISMATCH"));
  assert.ok(validation.errors.includes("ENGINE_OUTPUT:CAMPAIGN_PHASE_TIMING_MISMATCH"));
}

{
  const output = validOutput();
  const record = toFinalDecisionIntegrationRecord(output);
  output.campaign_quality = "PARTIAL";
  output.source_quality.campaign = "PARTIAL";
  resealOutput(output);
  record.campaign_quality = output.campaign_quality;
  record.material_digest = output.material_digest;
  record.decision_id = output.decision_id;
  const validation = validateFinalDecisionIntegrationRecord(
    record,
    { now: NOW + 1_000 },
  );
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.includes("CAMPAIGN_QUALITY_STATE_INVALID"));
  assert.ok(validation.errors.includes("ENGINE_OUTPUT:CAMPAIGN_QUALITY_STATE_INVALID"));
}

for (const [source, outputFactory, recordFields, lineageKeys, expected] of [
  ["full_evidence", validOutput, ["full_evidence_receipt_id"], ["full_evidence"],
    "CLOSED_SOURCE_WITHOUT_LINEAGE_RECEIPT:full_evidence"],
  ["full_evidence", validOutput, ["full_evidence_source_receipt_id"], ["full_evidence_source"],
    "CLOSED_SOURCE_WITHOUT_LINEAGE_RECEIPT:full_evidence"],
  ["opportunity", validOutput, ["opportunity_receipt_id"], ["opportunity"],
    "CLOSED_SOURCE_WITHOUT_LINEAGE_RECEIPT:opportunity"],
  ["campaign", validOutput, ["campaign_receipt_id"], ["campaign"],
    "CLOSED_SOURCE_WITHOUT_LINEAGE_RECEIPT:campaign"],
  ["position", validOutput, ["position_receipt_id"], ["position"],
    "CLOSED_SOURCE_WITHOUT_LINEAGE_RECEIPT:position"],
  ["position_origin_campaign", decoupledHoldOutput,
    ["position_origin_campaign_receipt_id"], ["position_origin_campaign"],
    "CLOSED_SOURCE_WITHOUT_LINEAGE_RECEIPT:position_origin_campaign"],
  ["position_management", decoupledHoldOutput,
    ["position_management_receipt_id"], ["position_management"],
    "CLOSED_SOURCE_WITHOUT_LINEAGE_RECEIPT:position_management"],
  ["entry_execution", validOutput, ["safety_gate_receipt_id"], ["safety_gate"],
    "CLOSED_SOURCE_WITHOUT_LINEAGE_RECEIPT:entry_execution"],
  ["management_execution", decoupledHoldOutput,
    ["safety_gate_receipt_id"], ["safety_gate"],
    "CLOSED_SOURCE_WITHOUT_LINEAGE_RECEIPT:management_execution"],
  ["hard_veto", validOutput, ["safety_gate_receipt_id"], ["safety_gate"],
    "CLOSED_SOURCE_WITHOUT_LINEAGE_RECEIPT:hard_veto"],
  ["decision_evidence", validOutput, ["decision_evidence_receipt_id"], ["decision_evidence"],
    "DIRECTION_EVIDENCE_WITHOUT_LINEAGE_RECEIPT"],
]) {
  const output = outputFactory();
  const record = toFinalDecisionIntegrationRecord(output);
  for (const field of recordFields) record[field] = null;
  for (const key of lineageKeys) {
    output.lineage_receipts[key] = { receipt_id: null, content_digest: null, committed_ts: null };
  }
  const validation = validateFinalDecisionIntegrationRecord(record, { now: NOW + 1_000 });
  assert.equal(validation.ok, false, source);
  assert.ok(validation.errors.includes(expected), `${source}:${validation.errors.join(",")}`);
}

{
  const record = validRecord();
  record.payload.engine_output.evidence_independence.cross_plane_reuse.total_reuse_count = 1;
  record.decision_evidence_receipt_id = null;
  record.full_evidence_receipt_id = null;
  record.full_evidence_source_receipt_id = null;
  const validation = validateFinalDecisionIntegrationRecord(record, { now: NOW + 1_000 });
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.includes("DIRECTION_EVIDENCE_WITHOUT_LINEAGE_RECEIPT"));
  assert.ok(validation.errors.includes("CROSS_PLANE_REUSE_WITHOUT_FULL_EVIDENCE_LINEAGE"));
}

{
  const output = validOutput();
  const record = toFinalDecisionIntegrationRecord(output);
  output.lineage_receipts.full_evidence.receipt_id =
    output.lineage_receipts.decision_evidence.receipt_id;
  resealLineageOutput(output);
  record.full_evidence_receipt_id = output.lineage_receipts.full_evidence.receipt_id;
  record.input_lineage_digest = output.input_lineage_digest;
  record.material_digest = output.material_digest;
  record.decision_id = output.decision_id;
  const validation = validateFinalDecisionIntegrationRecord(
    record,
    { now: NOW + 1_000 },
  );
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.includes("LINEAGE_RECEIPT_ID_COLLISION"));
  assert.ok(validation.errors.includes("ENGINE_OUTPUT:LINEAGE_RECEIPT_ID_COLLISION"));
}

for (const direction of ["LONG", "SHORT"]) {
  const output = buildFinalDecisionIntegrationShadow(completeInput(direction));
  const record = toFinalDecisionIntegrationRecord(output);
  const invalidationId = `FORGED-${direction}-RUNTIME-INVALIDATION`;
  output.evidence_independence.causal_domains.RISK_INVALIDATION = {
    state: "NEUTRAL",
    evidence_ids: [invalidationId],
    support_ids: [],
    invalidates_long_ids: direction === "LONG" ? [invalidationId] : [],
    invalidates_short_ids: direction === "SHORT" ? [invalidationId] : [],
    causal_families: ["RISK_INVALIDATION"],
    correlation_groups: [],
    raw_support_count: 0,
    effective_domain_votes: 0,
  };
  output.evidence_independence.raw_usable_evidence_count += 1;
  resealOutput(output);
  record.material_digest = output.material_digest;
  record.decision_id = output.decision_id;
  const validation = validateFinalDecisionIntegrationRecord(
    record,
    { now: NOW + 1_000 },
  );
  assert.equal(validation.ok, false, direction);
  assert.ok(validation.errors.includes("THESIS_INVALIDATION_RISK_MISMATCH"), direction);
  assert.ok(validation.errors.includes("ENGINE_OUTPUT:THESIS_INVALIDATION_RISK_MISMATCH"), direction);
}

{
  const output = invalidatedBlockedPositionOutput();
  assert.equal(output.status, "FAIL_CLOSED");
  assert.equal(output.position_state, "OPEN_LONG");
  assert.equal(output.source_quality.position, "BLOCKED");
  assert.equal(output.risk_state, "INVALIDATED");
  assert.equal(output.management_intent, "NOT_EVALUATED");
  assert.equal(output.management_action, "NOT_EVALUATED");
  const validation = validateFinalDecisionIntegrationRecord(
    toFinalDecisionIntegrationRecord(output),
    { now: NOW + 1_000 },
  );
  assert.equal(validation.ok, true, validation.errors?.join(","));
}

{
  const output = invalidatedBlockedOriginOutput();
  assert.equal(output.status, "FAIL_CLOSED");
  assert.equal(output.position_state, "OPEN_LONG");
  assert.equal(output.source_quality.position, "CLOSED");
  assert.equal(output.source_quality.position_origin_campaign, "BLOCKED");
  assert.equal(output.risk_state, "INVALIDATED");
  assert.equal(output.management_intent, "NOT_EVALUATED");
  assert.equal(output.management_action, "NOT_EVALUATED");
  const validation = validateFinalDecisionIntegrationRecord(
    toFinalDecisionIntegrationRecord(output),
    { now: NOW + 1_000 },
  );
  assert.equal(validation.ok, true, validation.errors?.join(","));
}

{
  const output = invalidatedUnsafeEnvelopeOutput();
  assert.equal(output.status, "FAIL_CLOSED");
  assert.equal(output.position_state, "OPEN_LONG");
  assert.equal(output.source_quality.position, "CLOSED");
  assert.equal(output.source_quality.position_origin_campaign, "CLOSED");
  assert.equal(output.risk_state, "INVALIDATED");
  assert.equal(output.management_intent, "NOT_EVALUATED");
  assert.equal(output.management_action, "NOT_EVALUATED");
  assert.equal(output.management_trigger_basis, null);
  const validation = validateFinalDecisionIntegrationRecord(
    toFinalDecisionIntegrationRecord(output),
    { now: NOW + 1_000 },
  );
  assert.equal(validation.ok, true, validation.errors?.join(","));
}

{
  const output = validExitOutput();
  const record = toFinalDecisionIntegrationRecord(output);
  output.status = "FAIL_CLOSED";
  resealOutput(output);
  record.decision_status = output.status;
  record.material_digest = output.material_digest;
  record.decision_id = output.decision_id;
  const validation = validateFinalDecisionIntegrationRecord(record, { now: NOW + 1_000 });
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.includes("FAILED_OUTPUT_CANNOT_EXECUTE_MANAGEMENT"));
}

{
  const output = validExitOutput();
  const record = toFinalDecisionIntegrationRecord(output);
  output.management_action = "NOT_EVALUATED";
  output.management_intent = "NOT_EVALUATED";
  output.management_action_id = null;
  output.action_identity.management = null;
  resealOutput(output);
  record.management_action = output.management_action;
  record.management_intent = output.management_intent;
  record.management_action_id = output.management_action_id;
  record.material_digest = output.material_digest;
  record.decision_id = output.decision_id;
  const validation = validateFinalDecisionIntegrationRecord(record, { now: NOW + 1_000 });
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.includes("OPEN_POSITION_MANAGEMENT_QUALITY_INVALID"));
}

{
  const output = validExitOutput();
  output.status = "FAIL_CLOSED";
  output.management_action = "NOT_EVALUATED";
  output.management_action_id = null;
  output.management_quality = "BLOCKED";
  output.action_identity.management = null;
  resealOutput(output);
  const validation = validateFinalDecisionIntegrationRecord(
    toFinalDecisionIntegrationRecord(output),
    { now: NOW + 1_000 },
  );
  assert.equal(validation.ok, true, validation.errors?.join(","));
}

{
  const record = validRecord();
  record.direction = "SHORT";
  const valid = validateFinalDecisionIntegrationRecord(record, { now: NOW + 1_000 });
  assert.equal(valid.ok, false);
  assert.ok(valid.errors.includes("ENGINE_OUTPUT_SCALAR_MISMATCH:direction"));
}

{
  const input = completeInput("LONG");
  input.full_evidence = withImmutableReceipt(
    input.full_evidence,
    input.evidence_registry.receipt_id,
    input.full_evidence.persistence.committed_ts,
  );
  let persistedOutput = null;
  const env = { DATA_DB: { prepare() { return { bind(...params) {
    persistedOutput = JSON.parse(params[49]);
    return this;
  }, async run() { return ack(1); } }; } } };
  const result = await withFixtureClock(() =>
    persistFinalDecisionIntegrationShadow({ env, input }));
  assert.equal(result.status, "CLOSED");
  assert.equal(result.commit_state, "COMMITTED");
  assert.equal(persistedOutput.status, "FAIL_CLOSED");
  assert.ok(persistedOutput.reason_codes.includes("INPUT_LINEAGE_RECEIPT_ID_COLLISION"));
  assert.notEqual(persistedOutput.entry_action, "SHADOW_ENTRY_ELIGIBLE");
  assert.ok(!["HOLD", "EXIT"].includes(persistedOutput.management_action));
}

{
  const calls = { prepares: 0, binds: 0, runs: 0, batches: 0, firsts: 0, params: null, sql: null };
  const env = { DATA_DB: {
    prepare(sql) {
      calls.prepares += 1;
      calls.sql = sql;
      return {
        bind(...params) {
          calls.binds += 1;
          calls.params = params;
          return this;
        },
        async run() {
          calls.runs += 1;
          return ack(1);
        },
      };
    },
    async batch() { calls.batches += 1; throw new Error("batch forbidden"); },
    async first() { calls.firsts += 1; throw new Error("read forbidden"); },
  } };
  const result = await withFixtureClock(() => persistFinalDecisionIntegrationShadow({ env, input: completeInput("LONG") }));
  assert.equal(result.status, "CLOSED");
  assert.equal(result.commit_state, "COMMITTED");
  assert.equal(result.decision_id, validOutput().decision_id);
  assert.equal(result.runtime_version, FINAL_DECISION_INTEGRATION_RUNTIME_VERSION);
  assert.equal(result.schema_version, FINAL_DECISION_INTEGRATION_SCHEMA_VERSION);
  assert.equal(result.mode, FINAL_DECISION_INTEGRATION_MODE);
  assert.equal(result.statement_cap, MAX_FINAL_DECISION_D1_STATEMENTS_PER_EVALUATION);
  assert.equal(result.statements, 1);
  assert.equal(result.prepared_statements, 1);
  assert.equal(result.bound_statements, 1);
  assert.equal(result.acknowledged_statements, 1);
  assert.equal(result.total_attempts_reported, 1);
  assert.equal(result.served_by_primary_reported, true);
  assert.equal(result.primary_routing_reported, true);
  assert.deepEqual(
    { prepares: calls.prepares, binds: calls.binds, runs: calls.runs, batches: calls.batches, firsts: calls.firsts },
    { prepares: 1, binds: 1, runs: 1, batches: 0, firsts: 0 },
  );
  assert.equal(calls.params.length, 51, "runtime and migration must share the exact bind contract");
  assert.equal(calls.params[0], validOutput().decision_id);
  assert.equal(calls.params[4], validOutput().input_lineage_digest);
  assert.equal(calls.params[8], "SHADOW_EVALUATED");
  assert.equal(calls.params[33], 0, "generic mixed-cohort outcome flag is disabled");
  assert.equal(calls.params[46], null, "flat position has no origin-campaign receipt");
  assert.equal(calls.params[47], null, "flat position has no management receipt");
  assert.deepEqual(JSON.parse(calls.params[48]), validOutput().reason_codes);
  assert.deepEqual(JSON.parse(calls.params[49]), validOutput());
  assert.equal(calls.params[50], NOW + 1_000);
  assert.match(calls.sql, /ON CONFLICT\(decision_id\) DO NOTHING/);
  assert.equal(result.safety.network_calls, 0);
  assert.equal(result.safety.retry_attempts, 0);
  assert.equal(result.safety.execution_authorized, false);
  assert.equal(result.safety.telegram_eligible, false);
}

{
  const env = { DATA_DB: { prepare() { return { bind() { return this; }, async run() {
    const result = ack(1);
    delete result.meta.served_by_primary;
    delete result.meta.total_attempts;
    return result;
  } }; } } };
  const result = await withFixtureClock(() => persistFinalDecisionIntegrationShadow({ env, input: completeInput("LONG") }));
  assert.equal(result.status, "CLOSED");
  assert.equal(result.commit_state, "COMMITTED");
  assert.equal(result.total_attempts_reported, null);
  assert.equal(result.internal_attempt_count_reported, false, "optional D1 metadata must not be invented");
  assert.equal(result.served_by_primary_reported, null);
  assert.equal(result.primary_routing_reported, false, "optional routing metadata must not be invented");
}

{
  const env = { DATA_DB: { prepare() { return { bind() { return this; }, async run() {
    return ack(2, { rows_written: 4 });
  } }; } } };
  const result = await withFixtureClock(() => persistFinalDecisionIntegrationShadow({ env, input: completeInput("LONG") }));
  assert.equal(result.status, "CLOSED", "trigger changes are logical changes, not main-row count");
  assert.equal(result.commit_state, "COMMITTED");
  assert.equal(result.decision_inserted, true);
  assert.equal(result.logical_changes_reported, 2);
}

{
  let writes = 0;
  const env = { DATA_DB: { prepare() { return { bind() { return this; }, async run() { writes += 1; return ack(0); } }; } } };
  const result = await withFixtureClock(() => persistFinalDecisionIntegrationShadow({ env, input: completeInput("LONG") }));
  assert.equal(result.status, "DEDUPLICATED");
  assert.equal(result.commit_state, "COMMITTED");
  assert.equal(result.decision_id, validOutput().decision_id);
  assert.equal(result.idempotent_duplicate, true);
  assert.equal(result.statements, 1);
  assert.equal(writes, 1);
}

{
  const result = await withFixtureClock(() => persistFinalDecisionIntegrationShadow({ input: completeInput("LONG") }));
  assert.equal(result.status, "SOURCE_UNSUPPORTED");
  assert.equal(result.commit_state, "NOT_ATTEMPTED");
  assert.equal(result.decision_id, validOutput().decision_id);
  assert.equal(result.statements, 0);
  assert.equal(result.attempted_statements, 0);
}

for (const [label, resultFactory] of [
  ["missing-meta", () => ({ success: true, results: null })],
  ["error-present", () => ({ ...ack(1), error: "unexpected success error" })],
  ["string-count", () => ack(1, { changes: "1" })],
  ["changed-db-mismatch", () => ack(1, { changed_db: false })],
  ["replica-ack", () => ack(1, { served_by_primary: false })],
  ["retry-detected", () => ack(1, { total_attempts: 2 })],
  ["read-cap", () => ack(1, { rows_read: MAX_FINAL_DECISION_ACK_ROWS_READ + 1 })],
  ["write-cap", () => ack(1, { rows_written: MAX_FINAL_DECISION_ACK_ROWS_WRITTEN + 1 })],
  ["logical-change-cap", () => ack(MAX_FINAL_DECISION_ACK_LOGICAL_CHANGES + 1, { rows_written: MAX_FINAL_DECISION_ACK_LOGICAL_CHANGES + 1 })],
  ["bad-results", () => ({ ...ack(1), results: {} })],
]) {
  const env = { DATA_DB: { prepare() { return { bind() { return this; }, async run() { return resultFactory(); } }; } } };
  const result = await withFixtureClock(() => persistFinalDecisionIntegrationShadow({ env, input: completeInput("LONG") }));
  assert.equal(result.status, "PARTIAL_FAIL_CLOSED", label);
  assert.equal(result.commit_state, "UNKNOWN", label);
  assert.equal(result.decision_id, validOutput().decision_id, label);
  assert.equal(result.attempted_statements, 1, label);
  assert.equal(result.acknowledged_statements, 0, label);
}

for (const [scope, field] of [
  ["result", "success"],
  ["result", "meta"],
  ["result", "results"],
  ["meta", "changes"],
  ["meta", "rows_read"],
  ["meta", "rows_written"],
  ["meta", "changed_db"],
  ["meta", "served_by_primary"],
  ["meta", "total_attempts"],
]) {
  let getterReads = 0;
  const hostileAck = ack(1);
  const target = scope === "result" ? hostileAck : hostileAck.meta;
  Object.defineProperty(target, field, {
    configurable: true,
    enumerable: true,
    get() {
      getterReads += 1;
      return getterReads === 1 ? 1 : MAX_FINAL_DECISION_ACK_ROWS_READ + 1;
    },
  });
  const env = { DATA_DB: { prepare() { return { bind() { return this; }, async run() {
    return hostileAck;
  } }; } } };
  const result = await withFixtureClock(() => persistFinalDecisionIntegrationShadow({
    env,
    input: completeInput("LONG"),
  }));
  assert.equal(result.status, "PARTIAL_FAIL_CLOSED", `${scope}.${field}`);
  assert.equal(result.commit_state, "UNKNOWN", `${scope}.${field}`);
  assert.equal(getterReads, 0, `${scope}.${field} getter must not execute`);
  assert.match(result.error, /^D1_ACK_(RESULT|META)_DESCRIPTOR_INVALID$/, `${scope}.${field}`);
}

for (const scope of ["result", "meta"]) {
  const hostileAck = ack(1);
  const target = scope === "result" ? hostileAck : hostileAck.meta;
  Object.defineProperty(target, "hidden_ack_state", {
    configurable: true,
    enumerable: false,
    value: true,
  });
  const env = { DATA_DB: { prepare() { return { bind() { return this; }, async run() {
    return hostileAck;
  } }; } } };
  const result = await withFixtureClock(() => persistFinalDecisionIntegrationShadow({
    env,
    input: completeInput("LONG"),
  }));
  assert.equal(result.status, "PARTIAL_FAIL_CLOSED", scope);
  assert.equal(result.commit_state, "UNKNOWN", scope);
  assert.match(result.error, /^D1_ACK_(RESULT|META)_DESCRIPTOR_INVALID$/, scope);
}

for (const scope of ["result", "meta"]) {
  const hostileAck = ack(1);
  const target = scope === "result" ? hostileAck : hostileAck.meta;
  target[Symbol("hidden_ack_state")] = true;
  const env = { DATA_DB: { prepare() { return { bind() { return this; }, async run() {
    return hostileAck;
  } }; } } };
  const result = await withFixtureClock(() => persistFinalDecisionIntegrationShadow({
    env,
    input: completeInput("LONG"),
  }));
  assert.equal(result.status, "PARTIAL_FAIL_CLOSED", scope);
  assert.equal(result.commit_state, "UNKNOWN", scope);
  assert.match(result.error, /^D1_ACK_(RESULT|META)_DESCRIPTOR_INVALID$/, scope);
}

{
  const calls = { prepare: 0, bind: 0, run: 0 };
  const env = { DATA_DB: { prepare() { calls.prepare += 1; return {
    bind() { calls.bind += 1; return this; },
    async run() { calls.run += 1; throw new Error("forced D1 partial failure"); },
  }; } } };
  const result = await withFixtureClock(() => persistFinalDecisionIntegrationShadow({ env, input: completeInput("LONG") }));
  assert.equal(result.status, "PARTIAL_FAIL_CLOSED");
  assert.equal(result.commit_state, "UNKNOWN");
  assert.equal(result.decision_id, validOutput().decision_id);
  assert.equal(result.prepared_statements, 1);
  assert.equal(result.bound_statements, 1);
  assert.equal(result.attempted_statements, 1);
  assert.equal(result.acknowledged_statements, 0);
  assert.equal(result.safety.retry_attempts, 0);
  assert.deepEqual(calls, { prepare: 1, bind: 1, run: 1 });
}

console.log(JSON.stringify({
  ok: true,
  suite: "final-decision-integration-runtime",
  assertions: "sealed output persistence; decoupled HOLD; corrupt-position fail-closed journal; typed required ACK fields; optional ACK metadata not invented; one statement; no reads/batch/network/application retry; deterministic dedupe",
}));
