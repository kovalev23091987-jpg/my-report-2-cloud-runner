import assert from "node:assert/strict";

import {
  buildFinalDecisionIntegrationShadow,
  validateFinalDecisionOutput,
} from "../src/final-decision-integration-engine.mjs";
import {
  NOW,
  campaign,
  completeInput,
  digest,
  discoveryCampaign,
  evidenceRegistry,
  evidenceRow,
  executionGate,
  hardVeto,
  impulseCampaign,
  openPosition,
  positionManagementContext,
  positionOriginCampaign,
  safetyGateReceipt,
  withImmutableReceipt,
} from "./final-decision-integration-fixtures.mjs";

function evaluate(input, label) {
  const output = buildFinalDecisionIntegrationShadow(input);
  const validation = validateFinalDecisionOutput(output);
  assert.equal(validation.valid, true, `${label}: ${validation.errors.join(",")}`);
  return output;
}

function sealCampaign(value, receiptId = "CMR:STATE-GRID") {
  const material = structuredClone(value);
  delete material.persistence;
  return withImmutableReceipt(material, receiptId, NOW - 100);
}

function sealPosition(value, receiptId = "PSR:STATE-GRID") {
  const material = structuredClone(value);
  delete material.persistence;
  return withImmutableReceipt(material, receiptId, NOW - 100);
}

function mirrorProjection(output) {
  return {
    status: output.status,
    directional_quality: output.directional_quality,
    entry_action: output.entry_action,
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
    position_state: ["OPEN_LONG", "OPEN_SHORT"].includes(output.position_state) ? "OPEN" : output.position_state,
    management_action: output.management_action,
    management_intent: output.management_intent,
    management_quality: output.management_quality,
    hard_veto: output.hard_veto,
    hard_veto_state: output.hard_veto_state,
  };
}

function assertDirectionalMirror(makeInput, label) {
  const long = evaluate(makeInput("LONG"), `${label}:LONG`);
  const short = evaluate(makeInput("SHORT"), `${label}:SHORT`);
  assert.equal(long.direction, "LONG", `${label}:LONG direction`);
  assert.equal(short.direction, "SHORT", `${label}:SHORT direction`);
  assert.deepEqual(mirrorProjection(short), mirrorProjection(long), `${label}: mirror`);
  return { long, short };
}

function resealOutput(output) {
  output.decision_id = null;
  output.material_digest = null;
  const materialDigest = digest(output);
  output.material_digest = materialDigest;
  output.decision_id = `FDI:${output.contract_code}:${output.observation_ts}:${materialDigest}`;
  return output;
}

// Entry-side temporal envelope: exact max-age boundary is accepted; +1 ms is stale.
for (const direction of ["LONG", "SHORT"]) {
  const atBoundaryGate = executionGate();
  const atBoundarySide = atBoundaryGate.entry_sides[direction];
  atBoundarySide.source_ts = NOW - atBoundarySide.max_age_ms;
  atBoundarySide.available_ts = atBoundarySide.source_ts;
  atBoundarySide.valid_until_ts = NOW;
  const veto = hardVeto();
  const accepted = evaluate(completeInput(direction, {
    execution_gate: atBoundaryGate,
    hard_veto: veto,
    safety_gate_receipt: safetyGateReceipt(veto, atBoundaryGate),
  }), `entry-side-boundary:${direction}`);
  assert.equal(accepted.entry_execution_quality, "CLOSED");
  assert.equal(accepted.entry_action, "SHADOW_ENTRY_ELIGIBLE");

  const staleGate = executionGate();
  const staleSide = staleGate.entry_sides[direction];
  staleSide.source_ts = NOW - staleSide.max_age_ms - 1;
  staleSide.available_ts = staleSide.source_ts;
  staleSide.valid_until_ts = NOW - 1;
  const staleVeto = hardVeto();
  const stale = evaluate(completeInput(direction, {
    execution_gate: staleGate,
    hard_veto: staleVeto,
    safety_gate_receipt: safetyGateReceipt(staleVeto, staleGate),
  }), `entry-side-stale:${direction}`);
  assert.equal(stale.entry_execution_quality, "INSUFFICIENT");
  assert.notEqual(stale.entry_action, "SHADOW_ENTRY_ELIGIBLE");

  const impossibleGate = executionGate();
  const impossibleSide = impossibleGate.entry_sides[direction];
  impossibleSide.available_ts = impossibleSide.source_ts - 1;
  const impossibleVeto = hardVeto();
  const impossible = evaluate(completeInput(direction, {
    execution_gate: impossibleGate,
    hard_veto: impossibleVeto,
    safety_gate_receipt: safetyGateReceipt(impossibleVeto, impossibleGate),
  }), `entry-side-available-before-source:${direction}`);
  assert.equal(impossible.entry_execution_quality, "BLOCKED");
  assert.notEqual(impossible.entry_action, "SHADOW_ENTRY_ELIGIBLE");
}

// Authoritative veto boundary is symmetric and a stale veto never becomes CLEAR.
for (const direction of ["LONG", "SHORT"]) {
  const gate = executionGate();
  const boundaryVeto = hardVeto({
    source_ts: NOW - 60_000,
    available_ts: NOW - 60_000,
    valid_until_ts: NOW,
  });
  const boundary = evaluate(completeInput(direction, {
    hard_veto: boundaryVeto,
    execution_gate: gate,
    safety_gate_receipt: safetyGateReceipt(boundaryVeto, gate),
  }), `veto-boundary:${direction}`);
  assert.equal(boundary.hard_veto_state, "CLEAR");

  const staleVeto = hardVeto({
    source_ts: NOW - 60_001,
    available_ts: NOW - 60_001,
    valid_until_ts: NOW - 1,
  });
  const stale = evaluate(completeInput(direction, {
    hard_veto: staleVeto,
    execution_gate: gate,
    safety_gate_receipt: safetyGateReceipt(staleVeto, gate),
  }), `veto-stale:${direction}`);
  assert.equal(stale.hard_veto_state, "INSUFFICIENT");
  assert.notEqual(stale.entry_action, "SHADOW_ENTRY_ELIGIBLE");
}

// Chase state is a gate; future or stale state cannot be compensated by direction evidence.
for (const [name, mutate, quality] of [
  ["future", (state) => {
    state.chase_risk.source_ts = NOW + 1;
    state.chase_risk.available_ts = NOW + 1;
    state.chase_risk.valid_until_ts = NOW + state.chase_risk.max_age_ms + 1;
  }, "BLOCKED"],
  ["stale", (state) => {
    state.chase_risk.source_ts = NOW - state.chase_risk.max_age_ms - 1;
    state.chase_risk.available_ts = state.chase_risk.source_ts;
    state.chase_risk.valid_until_ts = NOW - 1;
  }, "INSUFFICIENT"],
]) {
  for (const direction of ["LONG", "SHORT"]) {
    const state = campaign(direction);
    mutate(state);
    const output = evaluate(completeInput(direction, { campaign: sealCampaign(state, `CMR:CHASE:${name}:${direction}`) }), `chase-${name}:${direction}`);
    assert.equal(output.campaign_quality, quality);
    assert.notEqual(output.entry_action, "SHADOW_ENTRY_ELIGIBLE");
  }
}

// Position time is authoritative and cannot be rounded or repaired by the candidate lane.
for (const [name, patch, expected] of [
  ["future", { source_ts: NOW + 1, available_ts: NOW + 1, valid_until_ts: NOW + 60_001 }, "BLOCKED"],
  ["stale", { source_ts: NOW - 60_001, available_ts: NOW - 60_001, valid_until_ts: NOW - 1 }, "INSUFFICIENT"],
  ["available-before-source", { source_ts: NOW - 1_000, available_ts: NOW - 1_001, valid_until_ts: NOW + 59_000 }, "BLOCKED"],
]) {
  for (const direction of ["LONG", "SHORT"]) {
    const input = completeInput(direction);
    const raw = { ...input.position, ...patch };
    delete raw.persistence;
    const position = sealPosition(raw, `PSR:${name}:${direction}`);
    const output = evaluate(completeInput(direction, { position }), `position-${name}:${direction}`);
    assert.equal(output.source_quality.position, expected);
    assert.notEqual(output.entry_action, "SHADOW_ENTRY_ELIGIBLE");
  }
}

// Directional quality can remain correct while phase/timing independently rejects Entry.
for (const phaseFactory of [impulseCampaign, discoveryCampaign]) {
  const { long, short } = assertDirectionalMirror(
    (direction) => completeInput(direction, { campaign: phaseFactory(direction) }),
    `phase-${phaseFactory.name}`,
  );
  if (phaseFactory === impulseCampaign) {
    assert.equal(long.timing_state, "ACTIVE_MOVE");
    assert.equal(long.entry_action, "REJECT");
  } else {
    assert.equal(long.timing_state, "EARLY");
    assert.equal(long.entry_action, "WAIT");
  }
  assert.equal(short.directional_quality, "CLOSED");
}

function openContext(direction, risk = "CLEAR", { closeMeasurable = true, vetoActive = false, includeManagement = true } = {}) {
  const activeCampaign = impulseCampaign(direction);
  const position = openPosition(direction, activeCampaign);
  const origin = positionOriginCampaign(activeCampaign, position);
  const management = includeManagement ? positionManagementContext(position, origin, risk) : null;
  const gate = executionGate();
  if (!closeMeasurable) {
    gate.close_sides[direction] = {
      ...gate.close_sides[direction],
      status: "NOT_CLOSED",
      measurable: false,
    };
  }
  const veto = hardVeto(vetoActive ? { status: "VETO", reasons: ["GLOBAL_SAFETY_STOP"] } : {});
  return completeInput(direction, {
    campaign: activeCampaign,
    position,
    position_origin_campaign: origin,
    position_management_context: management,
    hard_veto: veto,
    execution_gate: gate,
    safety_gate_receipt: safetyGateReceipt(veto, gate),
  });
}

for (const [name, options, expected] of [
  ["invalidation-exit", { risk: "INVALIDATED" }, { intent: "EXIT_REQUIRED", action: "EXIT", risk: "INVALIDATED", quality: "CLOSED" }],
  ["hard-veto-exit", { vetoActive: true }, { intent: "EXIT_REQUIRED", action: "EXIT", risk: "INVALIDATED", quality: "CLOSED" }],
  ["exit-infeasible", { risk: "INVALIDATED", closeMeasurable: false }, { intent: "EXIT_REQUIRED", action: "NOT_EVALUATED", risk: "INVALIDATED", quality: "INSUFFICIENT" }],
  ["caution", { risk: "CAUTION" }, { intent: "NOT_EVALUATED", action: "NOT_EVALUATED", risk: "CAUTION", quality: "INSUFFICIENT" }],
  ["missing-management", { includeManagement: false }, { intent: "NOT_EVALUATED", action: "NOT_EVALUATED", risk: "INSUFFICIENT", quality: "INSUFFICIENT" }],
]) {
  const { risk = "CLEAR", ...flags } = options;
  const long = evaluate(openContext("LONG", risk, flags), `${name}:LONG`);
  const short = evaluate(openContext("SHORT", risk, flags), `${name}:SHORT`);
  assert.deepEqual(mirrorProjection(short), mirrorProjection(long), `${name}: LONG/SHORT symmetry`);
  for (const output of [long, short]) {
    assert.equal(output.management_intent, expected.intent, name);
    assert.equal(output.management_action, expected.action, name);
    assert.equal(output.risk_state, expected.risk, name);
    assert.equal(output.management_quality, expected.quality, name);
    assert.equal(output.entry_action, "NOT_EVALUATED", name);
  }
}

// Stale management assessment blocks HOLD symmetrically instead of becoming a CLEAR zero.
for (const direction of ["LONG", "SHORT"]) {
  const activeCampaign = impulseCampaign(direction);
  const position = openPosition(direction, activeCampaign);
  const origin = positionOriginCampaign(activeCampaign, position);
  const management = positionManagementContext(position, origin, "CLEAR", {
    source_ts: NOW - 60_001,
    available_ts: NOW - 60,
    valid_until_ts: NOW - 1,
  });
  const output = evaluate(completeInput(direction, {
    campaign: activeCampaign,
    position,
    position_origin_campaign: origin,
    position_management_context: management,
  }), `stale-management:${direction}`);
  assert.equal(output.source_quality.position_management, "INSUFFICIENT");
  assert.equal(output.management_action, "NOT_EVALUATED");
  assert.notEqual(output.management_intent, "HOLD_ALLOWED");
}

// Insufficient is absence of quorum; Neutral is an actual directional conflict.
for (const direction of ["LONG", "SHORT"]) {
  const onlyPrice = [evidenceRow({ stance: direction, value: direction === "LONG" ? 1 : -1 })];
  const insufficient = evaluate(completeInput(direction, {
    decision_evidence: onlyPrice,
    evidence_registry: evidenceRegistry(onlyPrice),
  }), `insufficient:${direction}`);
  assert.equal(insufficient.direction, "INSUFFICIENT");
  assert.notEqual(insufficient.directional_quality, "CONFLICTING");

  const opposite = direction === "LONG" ? "SHORT" : "LONG";
  const conflicting = [
    evidenceRow({ stance: direction, value: direction === "LONG" ? 1 : -1 }),
    evidenceRow({
      evidence_id: "POSITIONING-CONFLICT",
      causal_family: "FUNDING",
      metric_semantics: "CROWDING_TRAJECTORY",
      correlation_group: "POSITIONING-CONFLICT",
      source: "CROSS_VENUE_VERIFIED",
      venue: "MULTI_VENUE",
      metric: "crowding_response_conflict",
      stance: opposite,
      value: opposite === "LONG" ? 1 : -1,
      fact_ids: ["FACT-POSITIONING-CONFLICT"],
    }),
  ];
  const neutral = evaluate(completeInput(direction, {
    decision_evidence: conflicting,
    evidence_registry: evidenceRegistry(conflicting),
  }), `neutral:${direction}`);
  assert.equal(neutral.direction, "NEUTRAL");
  assert.equal(neutral.directional_quality, "CONFLICTING");
}

// Public validator independently rejects impossible state tuples after a valid reseal.
for (const [name, mutate, expectedCode] of [
  ["entry-with-active-veto", (output) => {
    output.hard_veto = true;
    output.hard_veto_state = "ACTIVE";
    output.risk_state = "INVALIDATED";
  }, "ENTRY_ELIGIBLE_WITH_HARD_VETO"],
  ["flat-hold", (output) => {
    output.management_action = "HOLD";
    output.management_intent = "HOLD_ALLOWED";
    output.management_quality = "CLOSED";
  }, "MANAGEMENT_WITHOUT_OPEN_POSITION"],
  ["open-entry", (output) => {
    output.position_state = "OPEN_LONG";
  }, "OPEN_POSITION_MUST_NOT_EVALUATE_ENTRY"],
  ["exit-without-intent", (output) => {
    output.position_state = "OPEN_LONG";
    output.entry_action = "NOT_EVALUATED";
    output.entry_action_id = null;
    output.entry_quality = "NOT_EVALUATED";
    output.entry_execution_quality = "NOT_EVALUATED";
    output.execution_quality = "CLOSED";
    output.management_execution_quality = "CLOSED";
    output.management_action = "EXIT";
    output.management_intent = "HOLD_ALLOWED";
    output.management_quality = "CLOSED";
    output.risk_state = "INVALIDATED";
  }, "MANAGEMENT_INTENT_ACTION_MISMATCH"],
]) {
  const output = buildFinalDecisionIntegrationShadow(completeInput("LONG"));
  mutate(output);
  resealOutput(output);
  const validation = validateFinalDecisionOutput(output);
  assert.equal(validation.valid, false, name);
  assert.ok(validation.errors.includes(expectedCode), `${name}: ${validation.errors.join(",")}`);
}

console.log(JSON.stringify({
  ok: true,
  suite: "final-decision-integration-state-grid",
  assertions: "temporal boundaries; gate/state separation; LONG/SHORT Entry/HOLD/EXIT symmetry; impossible state rejection",
}));
