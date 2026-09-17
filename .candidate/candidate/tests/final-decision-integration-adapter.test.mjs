import assert from "node:assert/strict";
import {
  adaptStage391ToFinalDecisionInput,
  buildFinalDecisionFromStage391Shadow,
} from "../src/final-decision-integration-adapter.mjs";
import { validateFinalDecisionOutput } from "../src/final-decision-integration-engine.mjs";
import {
  NOW, campaign, completeInput, executionGate, fullEvidence, hardVeto, impulseCampaign,
  openPosition, opportunity, positionState,
} from "./final-decision-integration-fixtures.mjs";

{
  const adapted = adaptStage391ToFinalDecisionInput({
    shadow_decision: {
      contract: "TEST-USDT",
      observed_ts: NOW,
      direction_hint: "LONG",
      dc_shadow_long: 100,
      live_probability: null,
      validated_signal: false,
    },
    full_evidence: fullEvidence(),
    opportunity: opportunity("LONG"),
    multi_wave: campaign("LONG"),
    hard_veto: hardVeto(),
    execution_gate: executionGate(),
    position: positionState(),
  });
  assert.equal(adapted.decision_evidence.length, 0, "legacy weighted score must not become evidence");
  assert.equal(adapted.compatibility.legacy_strategy_weights_applied, false);
  assert.equal(adapted.compatibility.legacy_shadow_scores_imported, false);
  assert.ok(adapted.compatibility.findings.includes("LEGACY_SHADOW_SCORES_NOT_IMPORTED"));

  const built = buildFinalDecisionFromStage391Shadow({
    shadow_decision: { contract: "TEST-USDT", observed_ts: NOW, direction_hint: "LONG", live_probability: null },
    full_evidence: fullEvidence(),
    opportunity: opportunity("LONG"),
    multi_wave: campaign("LONG"),
    hard_veto: hardVeto(),
    execution_gate: executionGate(),
    position: positionState(),
  });
  assert.deepEqual(Object.keys(built).sort(), ["adapter_metadata", "decision"]);
  assert.equal(built.decision.direction, "INSUFFICIENT");
  assert.notEqual(built.decision.entry_action, "SHADOW_ENTRY_ELIGIBLE");
  assert.equal(built.adapter_metadata.compatibility.legacy_shadow_scores_imported, false);
  assert.equal(validateFinalDecisionOutput(built.decision).valid, true);
}

{
  const activeCampaign = impulseCampaign("LONG");
  const position = openPosition("LONG", activeCampaign);
  const input = completeInput("LONG", { campaign: activeCampaign, position });
  const built = buildFinalDecisionFromStage391Shadow({
    full_evidence: input.full_evidence,
    opportunity: input.opportunity,
    multi_wave: input.campaign,
    decision_evidence: input.decision_evidence,
    evidence_registry: input.evidence_registry,
    hard_veto: input.hard_veto,
    execution_gate: input.execution_gate,
    safety_gate_receipt: input.safety_gate_receipt,
    position: input.position,
    position_origin_campaign: input.position_origin_campaign,
    position_management_context: input.position_management_context,
    observed_ts: input.observed_ts,
    contract_code: input.contract_code,
    snapshot_id: input.snapshot_id,
  });
  assert.equal(built.decision.management_action, "HOLD");
  assert.equal(built.decision.source_quality.position_origin_campaign, "CLOSED");
  assert.equal(built.decision.source_quality.position_management, "CLOSED");
  assert.equal(validateFinalDecisionOutput(built.decision).valid, true);
}

{
  const input = completeInput("LONG");
  const built = buildFinalDecisionFromStage391Shadow({
    full_evidence: input.full_evidence,
    opportunity: input.opportunity,
    multi_wave: input.campaign,
    decision_evidence: input.decision_evidence,
    evidence_registry: input.evidence_registry,
    hard_veto: input.hard_veto,
    execution_gate: input.execution_gate,
    safety_gate_receipt: input.safety_gate_receipt,
    position: input.position,
    observed_ts: input.observed_ts,
    contract_code: input.contract_code,
    snapshot_id: input.snapshot_id,
  });
  assert.equal(built.decision.status, "SHADOW_EVALUATED");
  assert.equal(built.decision.entry_action, "SHADOW_ENTRY_ELIGIBLE");
  assert.equal(built.adapter_metadata.compatibility.legacy_shadow_scores_imported, false);
  assert.equal(validateFinalDecisionOutput(built.decision).valid, true);
}

for (const [name, malformed] of [
  ["null", null],
  ["array", []],
  ["throwing-getter", Object.defineProperty({}, "contract_code", {
    enumerable: true,
    get() { throw new Error("untrusted adapter getter"); },
  })],
  ["throwing-proxy", new Proxy({}, { get() { throw new Error("untrusted adapter proxy"); } })],
]) {
  let adapted;
  assert.doesNotThrow(() => { adapted = adaptStage391ToFinalDecisionInput(malformed); }, name);
  assert.deepEqual(adapted.compatibility.findings, ["ADAPTER_INPUT_UNREADABLE"], name);
  const built = buildFinalDecisionFromStage391Shadow(malformed);
  assert.equal(built.decision.status, "FAIL_CLOSED", name);
  assert.notEqual(built.decision.entry_action, "SHADOW_ENTRY_ELIGIBLE", name);
  assert.equal(validateFinalDecisionOutput(built.decision).valid, true, name);
}

{
  const adapted = adaptStage391ToFinalDecisionInput({
    contract_code: "TEST-USDT",
    snapshot_id: "RUN-TEST-1",
    observed_ts: NOW + 0.25,
  });
  assert.equal(adapted.observed_ts, null, "fractional timestamp must not be rounded across a causal boundary");
  const built = buildFinalDecisionFromStage391Shadow({
    contract_code: "TEST-USDT",
    snapshot_id: "RUN-TEST-1",
    observed_ts: NOW + 0.25,
  });
  assert.equal(built.decision.status, "FAIL_CLOSED");
  assert.notEqual(built.decision.entry_action, "SHADOW_ENTRY_ELIGIBLE");
  assert.equal(validateFinalDecisionOutput(built.decision).valid, true);
}

console.log(JSON.stringify({
  ok: true,
  suite: "final-decision-integration-adapter",
  assertions: "Stage 3.9.1 boundary refuses score/count promotion; malformed inputs and fractional time fail closed",
}));
