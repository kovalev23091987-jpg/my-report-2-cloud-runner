import assert from "node:assert/strict";
import {
  buildFinalDecisionIntegrationShadow,
  validateFinalDecisionOutput,
} from "../src/final-decision-integration-engine.mjs";
import {
  campaign,
  completeInput,
  discoveryCampaign,
  evidenceRegistry,
  executionGate,
  hardVeto,
  impulseCampaign,
  openPosition,
  positionManagementContext,
  positionOriginCampaign,
  safetyGateReceipt,
  secondWaveCampaign,
} from "./final-decision-integration-fixtures.mjs";

function evaluate(input) {
  const result = buildFinalDecisionIntegrationShadow(input);
  const validation = validateFinalDecisionOutput(result);
  assert.equal(validation.valid, true, validation.errors.join(","));
  return result;
}

{
  const result = evaluate(completeInput("LONG"));
  assert.equal(result.status, "SHADOW_EVALUATED");
  assert.equal(result.direction, "LONG");
  assert.equal(result.directional_quality, "CLOSED");
  assert.equal(result.data_quality, "CLOSED");
  assert.equal(result.execution_quality, "CLOSED");
  assert.equal(result.independence_state, "CLOSED");
  assert.equal(result.entry_action, "SHADOW_ENTRY_ELIGIBLE");
  assert.equal(result.entry_quality, "CLOSED");
  assert.equal(result.timing_state, "ENTRY_WINDOW");
  assert.equal(result.management_action, "NOT_EVALUATED");
  assert.equal(result.calibration_eligible, false);
  assert.equal(result.shadow_outcome_collection_eligible, false, "generic mixed-cohort outcome flag must remain disabled");
  assert.equal(result.live_probability, null);
  assert.equal(result.validated_signal, false);
  assert.equal(result.execution_authorized, false);
  assert.equal(result.telegram_eligible, false);
  assert.equal(result.safety.strategy_weights_changed, false);
  assert.equal(result.explainability.no_score_aggregation_used, true);
}

{
  const veto = hardVeto({ status: "VETO", reasons: ["HTX_LIQUIDITY_COLLAPSE"] });
  const gate = executionGate();
  const input = completeInput("LONG", {
    hard_veto: veto,
    execution_gate: gate,
    safety_gate_receipt: safetyGateReceipt(veto, gate),
  });
  const result = evaluate(input);
  assert.equal(result.direction, "LONG", "veto must not rewrite independent directional quality");
  assert.equal(result.hard_veto, true);
  assert.equal(result.hard_veto_state, "ACTIVE");
  assert.equal(result.entry_action, "REJECT");
  assert.equal(result.entry_quality, "BLOCKED");
  assert.equal(result.risk_state, "INVALIDATED");
  assert.ok(result.reason_codes.includes("HARD_VETO_ACTIVE"));
}

{
  const veto = hardVeto();
  const gate = executionGate({ status: "NOT_CLOSED", htx_execution_gate_closed: false });
  const result = evaluate(completeInput("LONG", {
    hard_veto: veto,
    execution_gate: gate,
    safety_gate_receipt: safetyGateReceipt(veto, gate),
  }));
  assert.equal(result.direction, "LONG");
  assert.equal(result.execution_quality, "INSUFFICIENT");
  assert.notEqual(result.entry_action, "SHADOW_ENTRY_ELIGIBLE", "direction cannot bypass HTX execution gate");
}

{
  const result = evaluate(completeInput("LONG", { campaign: impulseCampaign("LONG") }));
  assert.equal(result.direction, "LONG");
  assert.equal(result.timing_state, "ACTIVE_MOVE");
  assert.equal(result.entry_action, "REJECT", "direction quality and entry quality must remain separate");
}

{
  const activeCampaign = impulseCampaign("LONG");
  const position = openPosition("LONG", activeCampaign);
  const result = evaluate(completeInput("LONG", { campaign: activeCampaign, position }));
  assert.equal(result.entry_action, "NOT_EVALUATED");
  assert.equal(result.management_action, "HOLD");
  assert.equal(result.management_intent, "HOLD_ALLOWED");
  assert.equal(result.management_quality, "CLOSED");
  assert.equal(result.entry_execution_quality, "NOT_EVALUATED");
  assert.equal(result.management_execution_quality, "CLOSED");
}

{
  const activeCampaign = impulseCampaign("LONG");
  const position = openPosition("LONG", activeCampaign);
  const origin = positionOriginCampaign(activeCampaign, position);
  const invalidated = positionManagementContext(position, origin, "INVALIDATED");
  const result = evaluate(completeInput("LONG", {
    campaign: activeCampaign,
    position,
    position_origin_campaign: origin,
    position_management_context: invalidated,
  }));
  assert.equal(result.management_intent, "EXIT_REQUIRED");
  assert.equal(result.management_action, "EXIT");
  assert.equal(result.entry_action, "NOT_EVALUATED");
  assert.equal(result.risk_state, "INVALIDATED");
}

{
  const result = evaluate(completeInput("LONG", { position: { state: "UNKNOWN" } }));
  assert.equal(result.status, "FAIL_CLOSED");
  assert.notEqual(result.entry_action, "SHADOW_ENTRY_ELIGIBLE");
  assert.equal(result.management_action, "NOT_EVALUATED");
  assert.ok(result.reason_codes.includes("POSITION_SCHEMA_OR_RULES_UNSUPPORTED"));
}

{
  const input = completeInput("LONG");
  input.live_signal = true;
  const result = evaluate(input);
  assert.equal(result.status, "FAIL_CLOSED");
  assert.equal(result.entry_action, "REJECT");
  assert.equal(result.live_probability, null);
  assert.equal(result.validated_signal, false);
  assert.equal(result.execution_authorized, false);
}

{
  const input = completeInput("LONG");
  input.decision_evidence = [];
  input.evidence_registry = evidenceRegistry([]);
  const result = evaluate(input);
  assert.equal(result.direction, "INSUFFICIENT");
  assert.equal(result.independence_state, "INSUFFICIENT");
  assert.notEqual(result.entry_action, "SHADOW_ENTRY_ELIGIBLE");
}

{
  const w2 = evaluate(completeInput("LONG", { campaign: secondWaveCampaign("LONG") }));
  assert.equal(w2.campaign_phase, "NEXT_IMPULSE_ENTRY");
  assert.equal(w2.timing_state, "ENTRY_WINDOW");
  assert.equal(w2.entry_action, "SHADOW_ENTRY_ELIGIBLE");
}

{
  const discovery = evaluate(completeInput("LONG", { campaign: discoveryCampaign("LONG") }));
  assert.equal(discovery.campaign_phase, "DISCOVERY");
  assert.equal(discovery.timing_state, "EARLY");
  assert.equal(discovery.entry_action, "WAIT");
}

console.log(JSON.stringify({
  ok: true,
  suite: "final-decision-integration-engine",
  assertions: "orthogonal direction/entry/management gates; hard veto; HTX execution; W1/W2/discovery lifecycle; shadow-only safety",
}));
