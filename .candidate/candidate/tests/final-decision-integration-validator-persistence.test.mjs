import assert from "node:assert/strict";

import {
  buildFinalDecisionIntegrationShadow,
  validateFinalDecisionOutput,
} from "../src/final-decision-integration-engine.mjs";
import {
  NOW, completeInput, digest, evidenceRegistry, evidenceRow, hardVeto, impulseCampaign, openPosition,
  positionManagementContext, positionOriginCampaign, withImmutableReceipt,
} from "./final-decision-integration-fixtures.mjs";

function validOutput(direction = "LONG") {
  return buildFinalDecisionIntegrationShadow(completeInput(direction));
}

function validExitOutput() {
  const activeCampaign = impulseCampaign("LONG");
  const position = openPosition("LONG", activeCampaign);
  const origin = positionOriginCampaign(activeCampaign, position);
  return buildFinalDecisionIntegrationShadow(completeInput("LONG", {
    campaign: activeCampaign,
    position,
    position_origin_campaign: origin,
    position_management_context: null,
    hard_veto: hardVeto({ status: "VETO", reasons: ["TEST_RISK"] }),
  }));
}

function validHoldOutput() {
  const activeCampaign = impulseCampaign("LONG");
  const position = openPosition("LONG", activeCampaign);
  const origin = positionOriginCampaign(activeCampaign, position);
  return buildFinalDecisionIntegrationShadow(completeInput("LONG", {
    campaign: activeCampaign,
    position,
    position_origin_campaign: origin,
    position_management_context: positionManagementContext(position, origin, "CLEAR"),
  }));
}

function reseal(output) {
  output.decision_id = null;
  output.material_digest = null;
  const materialDigest = digest(output);
  output.material_digest = materialDigest;
  output.decision_id = `FDI:${output.contract_code}:${output.observation_ts}:${materialDigest}`;
  return output;
}

function resealLineage(output) {
  output.input_lineage_digest = digest({
    contract_code: output.contract_code,
    snapshot_id: output.snapshot_id,
    observation_ts: output.observation_ts,
    lineage_receipts: output.lineage_receipts,
  });
  return reseal(output);
}

function rejects(mutator, expected, { seal = true } = {}) {
  const output = validOutput();
  mutator(output);
  if (seal) reseal(output);
  let validation;
  assert.doesNotThrow(() => { validation = validateFinalDecisionOutput(output); });
  assert.equal(validation.valid, false, expected);
  assert.ok(validation.errors.includes(expected), `${expected}: ${validation.errors.join(",")}`);
}

assert.deepEqual(validateFinalDecisionOutput(validOutput()), { valid: true, errors: [] });

{
  const output = validHoldOutput();
  assert.equal(output.campaign_phase, "IMPULSE");
  assert.equal(output.timing_state, "ACTIVE_MOVE");
  output.timing_state = "EARLY";
  reseal(output);
  const validation = validateFinalDecisionOutput(output);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.includes("CAMPAIGN_PHASE_TIMING_MISMATCH"), validation.errors.join(","));
}

rejects((output) => { output.timing_state = "EARLY"; }, "CAMPAIGN_PHASE_TIMING_MISMATCH");
rejects((output) => {
  output.campaign_quality = "PARTIAL";
  output.source_quality.campaign = "PARTIAL";
}, "CAMPAIGN_QUALITY_STATE_INVALID");

for (const direction of ["LONG", "SHORT"]) {
  const input = completeInput(direction);
  input.full_evidence = withImmutableReceipt(
    input.full_evidence,
    input.evidence_registry.receipt_id,
    input.full_evidence.persistence.committed_ts,
  );
  const output = buildFinalDecisionIntegrationShadow(input);
  assert.equal(output.status, "FAIL_CLOSED", direction);
  assert.ok(output.reason_codes.includes("INPUT_LINEAGE_RECEIPT_ID_COLLISION"), direction);
  assert.notEqual(output.entry_action, "SHADOW_ENTRY_ELIGIBLE", direction);
  assert.deepEqual(validateFinalDecisionOutput(output), { valid: true, errors: [] }, direction);
}

for (const direction of ["LONG", "SHORT"]) {
  const input = completeInput(direction);
  const opportunityWithCollision = structuredClone(input.opportunity);
  opportunityWithCollision.control_group_receipt.receipt_id = opportunityWithCollision.direction_receipt.receipt_id;
  opportunityWithCollision.control_group_receipt.persistence.receipt_id = opportunityWithCollision.direction_receipt.receipt_id;
  input.opportunity = withImmutableReceipt(
    opportunityWithCollision,
    opportunityWithCollision.persistence.receipt_id,
    opportunityWithCollision.persistence.committed_ts,
  );
  const output = buildFinalDecisionIntegrationShadow(input);
  assert.equal(output.status, "FAIL_CLOSED", direction);
  assert.ok(output.reason_codes.includes("INPUT_LINEAGE_RECEIPT_ID_COLLISION"), direction);
  assert.notEqual(output.entry_action, "SHADOW_ENTRY_ELIGIBLE", direction);
  assert.deepEqual(validateFinalDecisionOutput(output), { valid: true, errors: [] }, direction);
}

for (const direction of ["LONG", "SHORT"]) {
  const activeCampaign = impulseCampaign(direction);
  const position = openPosition(direction, activeCampaign);
  const origin = positionOriginCampaign(activeCampaign, position);
  const management = positionManagementContext(position, origin);
  const input = completeInput(direction, {
    campaign: activeCampaign,
    position,
    position_origin_campaign: origin,
    position_management_context: management,
  });

  const opportunityWithCollision = structuredClone(input.opportunity);
  opportunityWithCollision.control_group_receipt.receipt_id = opportunityWithCollision.direction_receipt.receipt_id;
  opportunityWithCollision.control_group_receipt.persistence.receipt_id = opportunityWithCollision.direction_receipt.receipt_id;
  input.opportunity = withImmutableReceipt(
    opportunityWithCollision,
    opportunityWithCollision.persistence.receipt_id,
    opportunityWithCollision.persistence.committed_ts,
  );

  Object.assign(input.position, {
    schema_version: "unsupported-position-v0",
    producer_rules_version: "unsupported-position-v0",
    authoritative: false,
    contract_code: "OTHER-USDT",
    snapshot_id: "OTHER-SNAPSHOT",
    source_ts: NOW + 1_000,
    available_ts: NOW + 2_000,
    valid_until_ts: NOW - 1,
    max_age_ms: 120_001,
    state_revision: -1,
    mode: "LIVE",
    position_id: "",
    entry_ts: NOW + 3_000,
    direction: direction === "LONG" ? "SHORT" : "LONG",
    campaign_id: "",
    entry_wave_id: "BAD-WAVE",
    entry_decision_observation_ts: NOW + 4_000,
    entry_decision_material_digest: "bad",
    entry_decision_id: "BAD-DECISION",
    entry_action_id: "BAD-ACTION",
  });
  Object.assign(input.position_origin_campaign, {
    schema_version: "unsupported-origin-v0",
    producer_rules_version: "unsupported-origin-v0",
    status: "PARTIAL",
    authoritative: false,
    contract_code: "OTHER-USDT",
    campaign_id: "OTHER-CAMPAIGN",
    entry_wave_id: "OTHER-CAMPAIGN:W99",
    direction: direction === "LONG" ? "SHORT" : "LONG",
    entry_trigger_ts: NOW + 5_000,
    entry_trigger_price: -1,
    entry_observation_id: "",
    campaign_state_revision_at_entry: 0,
    entry_action_id: "BAD-ORIGIN-ACTION",
    source_campaign_receipt_id: "BAD-SOURCE",
    source_campaign_content_digest: "bad",
    source_campaign_committed_ts: 0,
  });
  Object.assign(input.position_management_context, {
    schema_version: "unsupported-management-v0",
    producer_rules_version: "unsupported-management-v0",
    status: "PARTIAL",
    authoritative: false,
    contract_code: "OTHER-USDT",
    snapshot_id: "OTHER-SNAPSHOT",
    assessment_id: "BAD-ASSESSMENT",
    position_id: "OTHER-POSITION",
    position_state_revision: 99,
    position_direction: direction === "LONG" ? "SHORT" : "LONG",
    position_receipt_id: "OTHER-POSITION-RECEIPT",
    origin_campaign_id: "OTHER-CAMPAIGN",
    origin_wave_id: "OTHER-CAMPAIGN:W99",
    origin_campaign_receipt_id: "OTHER-ORIGIN-RECEIPT",
    invalidation_evaluated: false,
    risk_state: "INVALID",
    risk_reason_codes: ["bad reason"],
    evidence_receipt_ids: ["DUPLICATE-RECEIPT", "DUPLICATE-RECEIPT"],
    source_ts: NOW + 1_000,
    available_ts: NOW + 2_000,
    valid_until_ts: NOW - 1,
    max_age_ms: 120_001,
  });

  const output = buildFinalDecisionIntegrationShadow(input);
  assert.equal(output.status, "FAIL_CLOSED", direction);
  assert.equal(output.reason_codes.length, 32, direction);
  assert.equal(output.reason_codes[0], "INPUT_LINEAGE_RECEIPT_ID_COLLISION", direction);
  assert.equal(output.entry_action, "NOT_EVALUATED", direction);
  assert.equal(output.management_action, "NOT_EVALUATED", direction);
  assert.equal(output.management_intent, "NOT_EVALUATED", direction);
  assert.deepEqual(validateFinalDecisionOutput(output), { valid: true, errors: [] }, direction);
}

{
  const output = validOutput();
  output.lineage_receipts.full_evidence.receipt_id = output.lineage_receipts.decision_evidence.receipt_id;
  resealLineage(output);
  const validation = validateFinalDecisionOutput(output);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.includes("LINEAGE_RECEIPT_ID_COLLISION"), validation.errors.join(","));
}

for (const direction of ["LONG", "SHORT"]) {
  const output = validOutput(direction);
  const invalidationId = `FORGED-${direction}-INVALIDATION`;
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
  reseal(output);
  const validation = validateFinalDecisionOutput(output);
  assert.equal(validation.valid, false, direction);
  assert.ok(validation.errors.includes("THESIS_INVALIDATION_RISK_MISMATCH"), `${direction}:${validation.errors.join(",")}`);
}

for (const [source, receipt, factory] of [
  ["full_evidence", "full_evidence", validOutput],
  ["full_evidence", "full_evidence_source", validOutput],
  ["opportunity", "opportunity", validOutput],
  ["campaign", "campaign", validOutput],
  ["position", "position", validOutput],
  ["entry_execution", "safety_gate", validOutput],
  ["hard_veto", "safety_gate", validOutput],
  ["position_origin_campaign", "position_origin_campaign", validHoldOutput],
  ["position_management", "position_management", validHoldOutput],
  ["management_execution", "safety_gate", validHoldOutput],
]) {
  const output = factory();
  output.lineage_receipts[receipt] = { receipt_id: null, content_digest: null, committed_ts: null };
  resealLineage(output);
  const validation = validateFinalDecisionOutput(output);
  assert.equal(validation.valid, false, `${source}:${receipt}`);
  assert.ok(validation.errors.includes(`CLOSED_SOURCE_WITHOUT_LINEAGE_RECEIPT:${source}`), `${source}:${receipt}:${validation.errors.join(",")}`);
}

{
  const output = validOutput();
  output.lineage_receipts.decision_evidence = { receipt_id: null, content_digest: null, committed_ts: null };
  resealLineage(output);
  const validation = validateFinalDecisionOutput(output);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.includes("DIRECTION_EVIDENCE_WITHOUT_LINEAGE_RECEIPT"), validation.errors.join(","));
}

{
  const output = validOutput();
  output.evidence_independence.causal_domains.POSITIONING.correlation_groups = [
    ...output.evidence_independence.causal_domains.PRICE_ACTION.correlation_groups,
  ];
  reseal(output);
  const validation = validateFinalDecisionOutput(output);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.includes("CROSS_DOMAIN_CORRELATION_GROUP_REUSE"), validation.errors.join(","));
}

{
  const output = validOutput();
  output.evidence_independence.causal_domains.POSITIONING.correlation_groups = [];
  reseal(output);
  const validation = validateFinalDecisionOutput(output);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.includes("EFFECTIVE_DOMAIN_CORRELATION_GROUP_MISSING"), validation.errors.join(","));
}

for (const field of [
  "evidence_ids",
  "support_ids",
  "invalidates_long_ids",
  "invalidates_short_ids",
  "causal_families",
  "correlation_groups",
]) {
  const output = validOutput();
  output.evidence_independence.causal_domains.POSITIONING[field] = null;
  reseal(output);
  let validation;
  assert.doesNotThrow(() => { validation = validateFinalDecisionOutput(output); }, `null ${field} must fail closed without throwing`);
  assert.equal(validation.valid, false, `null ${field} must be rejected`);
}

{
  const input = completeInput("LONG");
  input.decision_evidence.push(evidenceRow({
    evidence_id: "RELATIVE-VALIDATOR-SET",
    causal_family: "RELATIVE_STRENGTH",
    metric_semantics: "RS_VS_BTC_ETH",
    correlation_group: "RELATIVE-VALIDATOR-GROUP",
    source: "RELATIVE_MARKET_MODEL",
    venue: "MULTI_VENUE",
    metric: "relative_strength",
    source_observation_id: "RAW:RELATIVE-VALIDATOR-SET",
    fact_ids: ["FACT-RELATIVE-VALIDATOR-SET"],
  }));
  input.evidence_registry = evidenceRegistry(input.decision_evidence);
  const output = buildFinalDecisionIntegrationShadow(input);
  assert.deepEqual(output.evidence_independence.effective_directional_domains, ["POSITIONING", "PRICE_ACTION", "RELATIVE_MARKET"]);
  output.evidence_independence.effective_directional_domains = ["POSITIONING", "PRICE_ACTION"];
  output.evidence_independence.effective_directional_vote_count = 2;
  reseal(output);
  const validation = validateFinalDecisionOutput(output);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.includes("DIRECTION_EFFECTIVE_DOMAIN_SET_MISMATCH"), validation.errors.join(","));
}

rejects((output) => { output.explainability.adversarial_value = Number.NaN; }, "PERSISTENCE_JSON_NON_FINITE_NUMBER");
rejects((output) => { output.explainability.adversarial_value = Number.POSITIVE_INFINITY; }, "PERSISTENCE_JSON_NON_FINITE_NUMBER");
rejects((output) => { output.explainability.adversarial_value = undefined; }, "PERSISTENCE_JSON_UNSUPPORTED_UNDEFINED");
rejects((output) => { output.explainability.adversarial_value = () => true; }, "PERSISTENCE_JSON_UNSUPPORTED_FUNCTION");
rejects((output) => { output.explainability["harmless.note"] = "not persistable by the D1 key grammar"; }, "PERSISTENCE_JSON_KEY_GRAMMAR_INVALID");

rejects((output) => { output.explainability.adversarial_value = 1n; }, "PERSISTENCE_JSON_UNSUPPORTED_BIGINT", { seal: false });
rejects((output) => { output.explainability.adversarial_value = Symbol("value"); }, "PERSISTENCE_JSON_UNSUPPORTED_SYMBOL", { seal: false });
rejects((output) => { output.explainability[Symbol("key")] = true; }, "PERSISTENCE_JSON_SYMBOL_KEY_FORBIDDEN", { seal: false });
rejects((output) => {
  Object.defineProperty(output.explainability, "adversarial_accessor", {
    enumerable: true,
    get() { throw new Error("validator invoked hostile getter"); },
  });
}, "PERSISTENCE_JSON_ACCESSOR_OR_HIDDEN_PROPERTY_FORBIDDEN", { seal: false });
rejects((output) => { output.explainability.adversarial_cycle = output; }, "PERSISTENCE_JSON_CYCLE_DETECTED", { seal: false });
rejects((output) => { output.explainability.adversarial_value = new Date(0); }, "PERSISTENCE_JSON_NON_PLAIN_OBJECT", { seal: false });
rejects((output) => { output.explainability.adversarial_array = new Array(2); }, "PERSISTENCE_JSON_ARRAY_SHAPE_INVALID", { seal: false });
rejects((output) => { output.explainability.shadow_outcome_collection_eligible = true; }, "FORBIDDEN_VALUE:$.explainability.shadow_outcome_collection_eligible");
rejects((output) => { output.explainability.shadowOutcomeCollectionEligible = true; }, "FORBIDDEN_VALUE:$.explainability.shadowOutcomeCollectionEligible");
rejects((output) => {
  output.management_intent = "EXIT_REQUIRED";
  output.risk_state = "INVALIDATED";
}, "FLAT_POSITION_MUST_NOT_EVALUATE_MANAGEMENT");
for (const invalidEntryTs of [0, NOW + 1]) {
  rejects((output) => {
    output.action_identity.entry.entry_trigger_ts = invalidEntryTs;
    output.entry_action_id = `FDE:${digest([
      output.action_identity.entry.contract_code,
      output.action_identity.entry.campaign_id,
      output.action_identity.entry.wave_id,
      invalidEntryTs,
    ])}`;
  }, "ENTRY_ACTION_ID_BASIS_MISMATCH");
}
rejects((output) => {
  output.evidence_independence.effective_directional_domains.push("REGIME_CONTEXT");
  output.evidence_independence.effective_directional_vote_count = 3;
  output.evidence_independence.raw_usable_evidence_count = 3;
}, "INDEPENDENCE_CLOSURE_COUNTS_INVALID");
rejects((output) => { output.source_quality.position = "BLOCKED"; }, "ENTRY_ELIGIBLE_WITHOUT_CLOSED_POSITION_SOURCE");
rejects((output) => { output.action_identity.entry.direction = "SHORT"; }, "ENTRY_ACTION_ID_BASIS_MISMATCH");

{
  const exitOutput = validExitOutput();
  assert.deepEqual(validateFinalDecisionOutput(exitOutput), { valid: true, errors: [] });
  exitOutput.source_quality.position_origin_campaign = "BLOCKED";
  reseal(exitOutput);
  const validation = validateFinalDecisionOutput(exitOutput);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.includes("EXIT_INTENT_WITH_OPEN_SOURCE_GATE"));
  assert.ok(validation.errors.includes("EXIT_WITH_OPEN_SOURCE_GATE"));
}
{
  const failClosedExit = validExitOutput();
  failClosedExit.status = "FAIL_CLOSED";
  reseal(failClosedExit);
  const validation = validateFinalDecisionOutput(failClosedExit);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.includes("FAILED_OUTPUT_CANNOT_EXECUTE_MANAGEMENT"));
}
{
  const failClosedDeferredExit = validExitOutput();
  failClosedDeferredExit.status = "FAIL_CLOSED";
  failClosedDeferredExit.management_action = "NOT_EVALUATED";
  failClosedDeferredExit.management_action_id = null;
  failClosedDeferredExit.management_quality = "BLOCKED";
  failClosedDeferredExit.action_identity.management = null;
  reseal(failClosedDeferredExit);
  assert.deepEqual(
    validateFinalDecisionOutput(failClosedDeferredExit),
    { valid: true, errors: [] },
    "FAIL_CLOSED may preserve EXIT_REQUIRED intent but cannot carry the executable action",
  );
}
{
  const falseClosedManagement = validExitOutput();
  falseClosedManagement.management_action = "NOT_EVALUATED";
  falseClosedManagement.management_intent = "NOT_EVALUATED";
  falseClosedManagement.management_action_id = null;
  falseClosedManagement.action_identity.management = null;
  reseal(falseClosedManagement);
  const validation = validateFinalDecisionOutput(falseClosedManagement);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.includes("OPEN_POSITION_MANAGEMENT_QUALITY_INVALID"));
}
{
  const exitOutput = validExitOutput();
  exitOutput.position_state = "OPEN_SHORT";
  reseal(exitOutput);
  const validation = validateFinalDecisionOutput(exitOutput);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.includes("MANAGEMENT_ACTION_ID_BASIS_MISMATCH"));
}
for (const mutate of [
  (output) => { output.management_trigger_basis = null; },
  (output) => { output.management_trigger_basis.trigger_types = []; },
  (output) => { output.management_trigger_basis.hard_veto_receipt_id = "SGR:WRONG"; },
]) {
  const exitOutput = validExitOutput();
  mutate(exitOutput);
  reseal(exitOutput);
  const validation = validateFinalDecisionOutput(exitOutput);
  assert.equal(validation.valid, false, validation.errors.join(","));
}

rejects((output) => { output.opportunity_latency.extension_probe = null; }, "OPPORTUNITY_LATENCY_SHAPE_INVALID");
rejects((output) => { delete output.opportunity_latency.event_close_ts; }, "OPPORTUNITY_LATENCY_SHAPE_INVALID");
rejects((output) => { output.source_quality.extension_probe = "CLOSED"; }, "SOURCE_QUALITY_SHAPE_INVALID");
rejects((output) => { delete output.source_quality.position_management; }, "SOURCE_QUALITY_SHAPE_INVALID");
rejects((output) => { output.source_quality.strict_weighted_chain_status.extension_probe = {}; }, "STRICT_WEIGHTED_CHAIN_STATUS_SHAPE_INVALID");
rejects((output) => {
  output.source_quality.strict_weighted_chain_status.CROSS_EXCHANGE_DERIVATIVES.extension_probe = false;
}, "STRICT_WEIGHTED_CHAIN_STATUS_SHAPE_INVALID");
rejects((output) => {
  output.source_quality.strict_weighted_chain_status.CROSS_EXCHANGE_DERIVATIVES.eligible_rows = 999;
}, "STRICT_WEIGHTED_CHAIN_STATUS_SHAPE_INVALID");
rejects((output) => { output.source_quality.strict_weighted_chain_status = {}; }, "STRICT_WEIGHTED_CHAIN_STATUS_COHERENCE_INVALID");
rejects((output) => { output.source_quality.position = "UNKNOWN"; }, "SOURCE_QUALITY_VALUE_INVALID");
rejects((output) => { output.snapshot_id = 123; }, "OUTPUT_IDENTITY_INVALID");
rejects((output) => { output.contract_code = 123; }, "OUTPUT_CONTRACT_INVALID");
rejects((output) => { output.lineage_receipts.position.receipt_id = 123; }, "LINEAGE_RECEIPT_INVALID:position");
rejects((output) => { output.lineage_receipts.position.content_digest = 1234567890123456; }, "LINEAGE_RECEIPT_INVALID:position");
rejects((output) => {
  output.evidence_independence.causal_domains.PRICE_ACTION.evidence_ids = [123];
  output.evidence_independence.causal_domains.PRICE_ACTION.support_ids = [123];
}, "CAUSAL_DOMAIN_EVIDENCE_IDS_INVALID:PRICE_ACTION:evidence_ids");
rejects((output) => { output.evidence_independence.causal_domains.PRICE_ACTION.correlation_groups = [123]; }, "CAUSAL_DOMAIN_CORRELATION_GROUPS_INVALID:PRICE_ACTION");
rejects((output) => {
  output.evidence_independence.causal_domains.REGIME_CONTEXT.evidence_ids = Array.from({ length: 17 }, (_, index) => `REGIME-${index}`);
}, "CAUSAL_DOMAIN_EVIDENCE_IDS_INVALID:REGIME_CONTEXT:evidence_ids");
rejects((output) => {
  output.evidence_independence.causal_domains.REGIME_CONTEXT.evidence_ids = ["PRICE-1"];
  output.evidence_independence.raw_usable_evidence_count += 1;
}, "CAUSAL_DOMAIN_EVIDENCE_IDS_GLOBAL_DUPLICATE");
rejects((output) => {
  output.action_identity.entry.campaign_id = 123;
  output.entry_action_id = `FDE:${digest([
    output.action_identity.entry.contract_code,
    output.action_identity.entry.campaign_id,
    output.action_identity.entry.wave_id,
    output.action_identity.entry.entry_trigger_ts,
  ])}`;
}, "ENTRY_ACTION_ID_BASIS_MISMATCH");
rejects((output) => { output.evidence_independence.extension_probe = false; }, "EVIDENCE_INDEPENDENCE_SHAPE_INVALID");
rejects((output) => { delete output.evidence_independence.causal_domains; }, "EVIDENCE_INDEPENDENCE_SHAPE_INVALID");
rejects((output) => { output.evidence_independence.causal_domains = []; }, "CAUSAL_DOMAINS_SHAPE_INVALID");
rejects((output) => { output.evidence_independence.causal_domains.PRICE_ACTION.extension_probe = false; }, "CAUSAL_DOMAIN_STATE_SHAPE_INVALID:PRICE_ACTION");
rejects((output) => { output.evidence_independence.causal_domains.PRICE_ACTION.raw_support_count = 999; }, "CAUSAL_DOMAIN_SUPPORT_COUNT_INVALID:PRICE_ACTION");
rejects((output) => { output.evidence_independence.effective_directional_domains = "PRICE_ACTION"; }, "EFFECTIVE_DIRECTIONAL_DOMAINS_INVALID");
rejects((output) => { output.evidence_independence.raw_usable_evidence_count = -1; }, "RAW_USABLE_EVIDENCE_COUNT_INVALID");
rejects((output) => { output.evidence_independence.raw_usable_evidence_count = 24; }, "RAW_USABLE_EVIDENCE_COUNT_INVALID");
rejects((output) => { output.evidence_independence.duplicate_or_correlated_suppressed = "NONE"; }, "SUPPRESSED_EVIDENCE_REPORT_INVALID");
rejects((output) => { output.evidence_independence.cross_plane_reuse.extension_probe = []; }, "CROSS_PLANE_REUSE_REPORT_INVALID");
rejects((output) => { output.explainability.extension_probe = false; }, "EXPLAINABILITY_SHAPE_INVALID");
rejects((output) => { output.action_identity.extension_probe = null; }, "ACTION_IDENTITY_SHAPE_INVALID");

console.log(JSON.stringify({
  ok: true,
  suite: "final-decision-integration-validator-persistence",
  assertions: "finite JSON domain; key grammar; no symbols/accessors/cycles/sparse arrays/non-plain objects",
}));
