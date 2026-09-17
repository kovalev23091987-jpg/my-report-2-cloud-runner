import assert from "node:assert/strict";
import { buildFinalDecisionIntegrationShadow, validateFinalDecisionOutput } from "../src/final-decision-integration-engine.mjs";
import {
  completeInput,
  executionGate,
  hardVeto,
  impulseCampaign,
  openPosition,
  safetyGateReceipt,
  secondWaveCampaign,
} from "./final-decision-integration-fixtures.mjs";

function evaluate(input) {
  const output = buildFinalDecisionIntegrationShadow(input);
  const validation = validateFinalDecisionOutput(output);
  assert.equal(validation.valid, true, validation.errors.join(","));
  return output;
}

function assertMirror(long, short, fields) {
  assert.equal(long.direction, "LONG");
  assert.equal(short.direction, "SHORT");
  for (const field of fields) assert.deepEqual(short[field], long[field], `LONG/SHORT mirror mismatch: ${field}`);
}

{
  const long = evaluate(completeInput("LONG"));
  const short = evaluate(completeInput("SHORT"));
  assertMirror(long, short, [
    "status", "directional_quality", "entry_action", "entry_quality", "data_quality",
    "execution_quality", "entry_execution_quality", "management_execution_quality",
    "campaign_phase", "campaign_quality", "independence_state", "timing_state", "risk_state",
    "position_state", "management_action", "management_intent", "management_quality", "hard_veto",
    "hard_veto_state", "shadow_outcome_collection_eligible",
  ]);
  assert.equal(long.evidence_independence.effective_directional_vote_count, short.evidence_independence.effective_directional_vote_count);
  assert.equal(long.evidence_independence.causal_domains.PRICE_ACTION.state, "LONG");
  assert.equal(short.evidence_independence.causal_domains.PRICE_ACTION.state, "SHORT");
  assert.equal(long.live_probability, null);
  assert.equal(short.live_probability, null);
}

{
  const gate = executionGate();
  gate.entry_sides.LONG = { ...gate.entry_sides.LONG, status: "NOT_CLOSED", measurable: false };
  const veto = hardVeto();
  const overrides = {
    hard_veto: veto,
    execution_gate: gate,
    safety_gate_receipt: safetyGateReceipt(veto, gate),
  };
  const long = evaluate(completeInput("LONG", overrides));
  const short = evaluate(completeInput("SHORT", overrides));
  assert.equal(long.entry_execution_quality, "INSUFFICIENT");
  assert.equal(short.entry_execution_quality, "CLOSED");
  assert.notEqual(long.entry_action, "SHADOW_ENTRY_ELIGIBLE");
  assert.equal(short.entry_action, "SHADOW_ENTRY_ELIGIBLE");
}

{
  const long = evaluate(completeInput("LONG", { campaign: secondWaveCampaign("LONG") }));
  const short = evaluate(completeInput("SHORT", { campaign: secondWaveCampaign("SHORT") }));
  assertMirror(long, short, [
    "entry_action", "entry_quality", "data_quality", "entry_execution_quality",
    "campaign_phase", "campaign_quality", "timing_state", "risk_state",
  ]);
  assert.equal(long.campaign_phase, "NEXT_IMPULSE_ENTRY");
}

{
  const longCampaign = impulseCampaign("LONG");
  const shortCampaign = impulseCampaign("SHORT");
  const long = evaluate(completeInput("LONG", { campaign: longCampaign, position: openPosition("LONG", longCampaign) }));
  const short = evaluate(completeInput("SHORT", { campaign: shortCampaign, position: openPosition("SHORT", shortCampaign) }));
  assertMirror(long, short, [
    "entry_action", "entry_quality", "management_action", "management_intent", "management_quality",
    "management_execution_quality", "risk_state", "campaign_phase", "timing_state",
  ]);
  assert.equal(long.management_action, "HOLD");
}

console.log(JSON.stringify({
  ok: true,
  suite: "final-decision-integration-symmetry",
  assertions: "exact LONG/SHORT state symmetry for W1, W2, side-specific execution and open-position management",
}));
