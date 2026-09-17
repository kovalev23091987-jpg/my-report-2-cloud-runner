import assert from "node:assert/strict";

import {
  buildFinalDecisionIntegrationShadow,
  validateFinalDecisionOutput,
} from "../src/final-decision-integration-engine.mjs";
import {
  NOW,
  completeInput,
  evidenceRegistry,
  evidenceRow,
  executionGate,
  hardVeto,
  impulseCampaign,
  openPosition,
  safetyGateReceipt,
  secondWaveCampaign,
  withImmutableReceipt,
} from "./final-decision-integration-fixtures.mjs";

for (const alias of ["hard-veto", "hard.veto", "hardVeto", "HaRd VeTo"]) {
  const input = completeInput("LONG");
  input[alias] = { status: "VETO", active: true };
  const output = buildFinalDecisionIntegrationShadow(input);
  assert.notEqual(output.entry_action, "SHADOW_ENTRY_ELIGIBLE", alias);
  assert.equal(output.hard_veto_state, "BLOCKED", alias);
  assert.ok(output.reason_codes.includes("HARD_VETO_SOURCE_CONFLICT"), alias);
  assert.deepEqual(validateFinalDecisionOutput(output), { valid: true, errors: [] }, alias);
}

for (const direction of ["LONG", "SHORT"]) {
  const input = completeInput(direction);
  input.campaign.campaign.wave_ledger[0].hard_veto_active = true;
  input.campaign = withImmutableReceipt(
    input.campaign,
    input.campaign.persistence.receipt_id,
    input.campaign.persistence.committed_ts,
  );
  const output = buildFinalDecisionIntegrationShadow(input);
  assert.equal(output.hard_veto_state, "BLOCKED", direction);
  assert.notEqual(output.entry_action, "SHADOW_ENTRY_ELIGIBLE", direction);
  assert.ok(output.reason_codes.includes("HARD_VETO_SOURCE_CONFLICT"), direction);
  assert.deepEqual(validateFinalDecisionOutput(output), { valid: true, errors: [] }, direction);
}

for (const direction of ["LONG", "SHORT"]) {
  const input = completeInput(direction);
  input.wrapper = { transition_history: [{ hard_veto_active: true }] };
  const output = buildFinalDecisionIntegrationShadow(input);
  assert.equal(output.hard_veto_state, "BLOCKED", direction);
  assert.notEqual(output.entry_action, "SHADOW_ENTRY_ELIGIBLE", direction);
  assert.ok(output.reason_codes.includes("HARD_VETO_SOURCE_CONFLICT"), direction);
  assert.deepEqual(validateFinalDecisionOutput(output), { valid: true, errors: [] }, direction);
}

for (const direction of ["LONG", "SHORT"]) {
  const input = completeInput(direction, { campaign: secondWaveCampaign(direction) });
  input.campaign.campaign.wave_ledger[0].hard_veto_active = true;
  input.campaign = withImmutableReceipt(
    input.campaign,
    input.campaign.persistence.receipt_id,
    input.campaign.persistence.committed_ts,
  );
  const output = buildFinalDecisionIntegrationShadow(input);
  assert.equal(output.hard_veto_state, "CLEAR", direction);
  assert.equal(output.entry_action, "SHADOW_ENTRY_ELIGIBLE", direction);
  assert.deepEqual(validateFinalDecisionOutput(output), { valid: true, errors: [] }, direction);
}

{
  const input = completeInput("LONG");
  input.hardVeto = true;
  const output = buildFinalDecisionIntegrationShadow(input);
  assert.notEqual(output.entry_action, "SHADOW_ENTRY_ELIGIBLE");
  assert.equal(output.hard_veto_state, "BLOCKED");
  assert.ok(output.reason_codes.includes("HARD_VETO_SOURCE_CONFLICT"));
}

{
  const input = completeInput("LONG");
  input["hard_vet\u043e"] = { status: "VETO", active: true }; // final character is Cyrillic о
  const output = buildFinalDecisionIntegrationShadow(input);
  assert.equal(output.status, "FAIL_CLOSED");
  assert.notEqual(output.entry_action, "SHADOW_ENTRY_ELIGIBLE");
  assert.ok(output.reason_codes.some((code) => code.startsWith("UNSAFE_KEY_ENCODING")));
  assert.deepEqual(validateFinalDecisionOutput(output), { valid: true, errors: [] });
}

for (const mutate of [
  (veto) => { veto.status = "VETO"; veto.reasons = ["POST_RECEIPT_MUTATION"]; },
  (veto) => { veto.reasons = ["POST_RECEIPT_MUTATION"]; },
]) {
  const veto = hardVeto();
  const gate = executionGate();
  const oldReceipt = safetyGateReceipt(veto, gate);
  mutate(veto);
  const output = buildFinalDecisionIntegrationShadow(completeInput("LONG", {
    hard_veto: veto,
    execution_gate: gate,
    safety_gate_receipt: oldReceipt,
  }));
  assert.notEqual(output.entry_action, "SHADOW_ENTRY_ELIGIBLE");
  assert.equal(output.hard_veto_state, "BLOCKED");
  assert.ok(output.reason_codes.includes("SAFETY_GATE_RECEIPT_CONTENT_DIGEST_INVALID"));
  assert.deepEqual(validateFinalDecisionOutput(output), { valid: true, errors: [] });
}

{
  const veto = hardVeto();
  const gate = executionGate();
  const oldReceipt = safetyGateReceipt(veto, gate);
  gate.entry_sides.LONG.status = "NOT_CLOSED";
  const output = buildFinalDecisionIntegrationShadow(completeInput("LONG", {
    hard_veto: veto,
    execution_gate: gate,
    safety_gate_receipt: oldReceipt,
  }));
  assert.notEqual(output.entry_action, "SHADOW_ENTRY_ELIGIBLE");
  assert.equal(output.entry_execution_quality, "BLOCKED");
  assert.ok(output.reason_codes.includes("SAFETY_GATE_RECEIPT_CONTENT_DIGEST_INVALID"));
  assert.deepEqual(validateFinalDecisionOutput(output), { valid: true, errors: [] });
}

{
  const activeCampaign = impulseCampaign("LONG");
  const position = openPosition("LONG", activeCampaign);
  const veto = hardVeto();
  const gate = executionGate();
  const oldReceipt = safetyGateReceipt(veto, gate);
  gate.close_sides.LONG.status = "NOT_CLOSED";
  const output = buildFinalDecisionIntegrationShadow(completeInput("LONG", {
    campaign: activeCampaign,
    position,
    hard_veto: veto,
    execution_gate: gate,
    safety_gate_receipt: oldReceipt,
  }));
  assert.equal(output.management_action, "NOT_EVALUATED");
  assert.notEqual(output.management_intent, "HOLD_ALLOWED");
  assert.equal(output.management_execution_quality, "BLOCKED");
  assert.ok(output.reason_codes.includes("SAFETY_GATE_RECEIPT_CONTENT_DIGEST_INVALID"));
  assert.deepEqual(validateFinalDecisionOutput(output), { valid: true, errors: [] });
}

{
  const vetoAtBoundary = hardVeto({
    source_ts: NOW - 60_000,
    available_ts: NOW - 500,
    max_age_ms: 60_000,
    valid_until_ts: NOW,
  });
  const gate = executionGate();
  const output = buildFinalDecisionIntegrationShadow(completeInput("LONG", {
    hard_veto: vetoAtBoundary,
    execution_gate: gate,
    safety_gate_receipt: safetyGateReceipt(vetoAtBoundary, gate),
  }));
  assert.equal(output.hard_veto_state, "CLEAR");
  assert.equal(output.entry_action, "SHADOW_ENTRY_ELIGIBLE");
  assert.deepEqual(validateFinalDecisionOutput(output), { valid: true, errors: [] });
}

{
  const rows = completeInput("LONG").decision_evidence;
  rows.push(evidenceRow({
    evidence_id: "REGIME-CONTEXT-1",
    causal_family: "REGIME_CONTEXT",
    metric_semantics: "MARKET_REGIME_CONTEXT",
    correlation_group: "REGIME-CONTEXT",
    source: "REGIME_MODEL",
    venue: "MULTI_VENUE",
    metric: "market_regime",
    stance: "NONE",
    effect: "CONTEXT",
    value: "RISK_ON",
    unit: "regime_state",
    fact_ids: ["FACT-REGIME-1"],
  }));
  const output = buildFinalDecisionIntegrationShadow(completeInput("LONG", {
    decision_evidence: rows,
    evidence_registry: evidenceRegistry(rows),
  }));
  assert.equal(output.hard_veto_state, "CLEAR");
  assert.equal(output.entry_action, "SHADOW_ENTRY_ELIGIBLE");
  assert.deepEqual(validateFinalDecisionOutput(output), { valid: true, errors: [] });
}

console.log(JSON.stringify({
  ok: true,
  suite: "final-decision-integration-veto-safety",
  assertions: "veto aliases; Unicode fail-closed; receipt mutation; close-side bypass; false-veto boundary",
}));
