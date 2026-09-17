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
  fullEvidence,
  hardVeto,
  impulseCampaign,
  safetyGateReceipt,
} from "./final-decision-integration-fixtures.mjs";

function evidenceStorm(direction, count, prefix = "STORM") {
  const sign = direction === "SHORT" ? -1 : 1;
  return Array.from({ length: count }, (_, index) => evidenceRow({
    evidence_id: `${prefix}-${index + 1}`,
    causal_family: "PRICE_RESPONSE",
    metric_semantics: "DIRECTIONAL_PRICE_RESPONSE",
    correlation_group: `${prefix}-PRICE-${index + 1}`,
    source: `${prefix}_SOURCE_${index + 1}`,
    venue: "HTX",
    metric: `${prefix.toLowerCase()}_price_${index + 1}`,
    source_observation_id: `${prefix}-RAW-${index + 1}`,
    stance: direction,
    value: sign,
    fact_ids: [`${prefix}-FACT-${index + 1}`],
  }));
}

function withRows(direction, sourceInput, additions) {
  const rows = [...sourceInput.decision_evidence, ...additions];
  return completeInput(direction, {
    ...sourceInput,
    decision_evidence: rows,
    evidence_registry: evidenceRegistry(rows),
  });
}

function built(input, label) {
  const output = buildFinalDecisionIntegrationShadow(input);
  assert.deepEqual(validateFinalDecisionOutput(output), { valid: true, errors: [] }, label);
  assert.equal(output.explainability.no_score_aggregation_used, true, label);
  assert.equal(output.safety.missing_data_coerced_to_zero, false, label);
  assert.equal(output.safety.correlated_features_counted_as_independent, false, label);
  return output;
}

for (const direction of ["LONG", "SHORT"]) {
  const partialParent = completeInput(direction, {
    full_evidence: fullEvidence({ data_quality: { status: "PARTIAL" } }),
  });
  const before = built(partialParent, `${direction}:partial-before`);
  const after = built(withRows(direction, partialParent, evidenceStorm(direction, 22, `${direction}-PARTIAL`)), `${direction}:partial-after`);
  assert.equal(before.data_quality, "INSUFFICIENT");
  assert.equal(after.data_quality, before.data_quality);
  assert.equal(after.entry_action, before.entry_action);
  assert.notEqual(after.entry_action, "SHADOW_ENTRY_ELIGIBLE");
  assert.equal(after.direction, before.direction, "more evidence may not repair an unrelated mandatory parent");
}

for (const direction of ["LONG", "SHORT"]) {
  const sign = direction === "SHORT" ? -1 : 1;
  const future = evidenceRow({
    evidence_id: `${direction}-FUTURE`,
    source_observation_id: `${direction}-FUTURE-RAW`,
    source: `${direction}_FUTURE_SOURCE`,
    metric: `${direction.toLowerCase()}_future_price`,
    correlation_group: `${direction}-FUTURE-GROUP`,
    fact_ids: [`${direction}-FUTURE-FACT`],
    stance: direction,
    value: sign,
    source_ts: NOW + 1,
    available_ts: NOW + 1,
    max_age_ms: 60_000,
    valid_until_ts: NOW + 60_001,
  });
  const baseline = completeInput(direction);
  const before = built(withRows(direction, baseline, [future]), `${direction}:future-before`);
  const after = built(withRows(direction, baseline, [future, ...evidenceStorm(direction, 21, `${direction}-FUTURE-STORM`)]), `${direction}:future-after`);
  assert.equal(before.data_quality, "BLOCKED");
  assert.equal(after.data_quality, "BLOCKED");
  assert.equal(before.direction, "INSUFFICIENT");
  assert.equal(after.direction, "INSUFFICIENT");
  assert.equal(before.entry_action, "REJECT");
  assert.equal(after.entry_action, "REJECT");
  assert.ok(after.reason_codes.some((code) => code.includes("FUTURE_SOURCE_TS")));
}

{
  const input = completeInput("LONG");
  const baseline = built(input, "permutation-baseline");
  const permuted = structuredClone(input);
  permuted.decision_evidence.reverse();
  permuted.evidence_registry.entries.reverse();
  const replay = built(permuted, "permutation-replay");
  assert.equal(replay.decision_id, baseline.decision_id);
  assert.equal(replay.material_digest, baseline.material_digest);
  assert.deepEqual(replay.reason_codes, baseline.reason_codes);
  assert.deepEqual(replay.evidence_independence, baseline.evidence_independence);
}

{
  const veto = hardVeto({ status: "VETO", reasons: ["METAMORPHIC_VETO"] });
  const gate = executionGate();
  const input = completeInput("LONG", {
    hard_veto: veto,
    execution_gate: gate,
    safety_gate_receipt: safetyGateReceipt(veto, gate),
  });
  const output = built(withRows("LONG", input, evidenceStorm("LONG", 22, "VETO-STORM")), "veto-storm");
  assert.equal(output.hard_veto_state, "ACTIVE");
  assert.equal(output.entry_action, "REJECT");
  assert.equal(output.risk_state, "INVALIDATED");
}

{
  const veto = hardVeto();
  const gate = executionGate();
  gate.entry_sides.LONG = { ...gate.entry_sides.LONG, status: "NOT_CLOSED", measurable: false };
  const input = completeInput("LONG", {
    hard_veto: veto,
    execution_gate: gate,
    safety_gate_receipt: safetyGateReceipt(veto, gate),
  });
  const output = built(withRows("LONG", input, evidenceStorm("LONG", 22, "EXEC-STORM")), "execution-storm");
  assert.equal(output.direction, "LONG");
  assert.equal(output.entry_execution_quality, "INSUFFICIENT");
  assert.notEqual(output.entry_action, "SHADOW_ENTRY_ELIGIBLE");
}

{
  const input = completeInput("LONG", { campaign: impulseCampaign("LONG") });
  const output = built(withRows("LONG", input, evidenceStorm("LONG", 22, "CHASE-STORM")), "chase-storm");
  assert.equal(output.direction, "LONG");
  assert.equal(output.timing_state, "ACTIVE_MOVE");
  assert.equal(output.entry_action, "REJECT");
}

console.log(JSON.stringify({
  ok: true,
  suite: "final-decision-integration-gate-metamorphic",
  assertions: "bad data, future facts, veto, execution and chase gates cannot be compensated by evidence quantity or order",
}));
