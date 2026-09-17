import assert from "node:assert/strict";
import test from "node:test";

import { buildFinalDecisionIntegrationShadow, validateFinalDecisionOutput } from "../src/final-decision-integration-engine.mjs";
import {
  FINAL_DECISION_OUTCOME_HORIZONS,
  FINAL_DECISION_OUTCOME_LIMITS,
  FINAL_DECISION_OUTCOME_MODE,
  buildFinalDecisionShadowOutcomeContract,
  buildProspectiveOutcomeAnchor,
  validateFinalDecisionShadowOutcomeContract,
} from "../src/final-decision-shadow-outcome-contract.mjs";
import {
  NOW, campaign, completeInput, digest, discoveryCampaign, executionGate, hardVeto,
  impulseCampaign, openPosition, opportunity, positionManagementContext,
  positionOriginCampaign, safetyGateReceipt, withImmutableReceipt,
} from "./final-decision-integration-fixtures.mjs";

function anchorFor(decision, overrides = {}) {
  return buildProspectiveOutcomeAnchor({
    contract_code: decision.contract_code,
    snapshot_id: decision.snapshot_id,
    decision_observation_ts: decision.observation_ts,
    reference_price: 100,
    reference_ts: decision.observation_ts - 1_000,
    available_ts: decision.observation_ts - 500,
    max_age_ms: 60_000,
    valid_until_ts: decision.observation_ts + 59_000,
    source_observation_id: "HTX-CLOSED-1M-TEST-1",
    source_payload_digest: "0123456789abcdef",
    source_receipt_id: "HTXR:TEST-USDT:1",
    source_receipt_content_digest: "fedcba9876543210",
    symbol_verified: true,
    source_compatible: true,
    closed_bar: true,
    interpolation_used: false,
    future_data_used: false,
    ...overrides,
  });
}

function sealDecision(decision) {
  const sealed = { ...decision, decision_id: null, material_digest: null };
  sealed.material_digest = digest(sealed);
  sealed.decision_id = `FDI:${sealed.contract_code}:${sealed.observation_ts}:${sealed.material_digest}`;
  return sealed;
}

function receipt(envelope) {
  const persistence = envelope?.persistence;
  if (!persistence || typeof persistence !== "object") return { receipt_id: null, committed_ts: null, content_digest: null };
  return { receipt_id: persistence.receipt_id ?? null, committed_ts: persistence.committed_ts ?? null, content_digest: persistence.content_digest ?? null };
}

function rebindDecision(decision, input) {
  const lineage_receipts = {
    decision_evidence: receipt(input.evidence_registry),
    full_evidence_source: receipt(input?.full_evidence?.source_registry),
    full_evidence: receipt(input.full_evidence),
    opportunity: receipt(input.opportunity),
    campaign: receipt(input.campaign),
    safety_gate: receipt(input.safety_gate_receipt),
    position: receipt(input.position),
    position_origin_campaign: receipt(input.position_origin_campaign),
    position_management: receipt(input.position_management_context),
  };
  return sealDecision({
    ...decision,
    lineage_receipts,
    input_lineage_digest: digest({
      contract_code: decision.contract_code,
      snapshot_id: decision.snapshot_id,
      observation_ts: decision.observation_ts,
      lineage_receipts,
    }),
  });
}

function buildFromInput(input, decisionOverride = null) {
  const decision = decisionOverride || buildFinalDecisionIntegrationShadow(input);
  assert.deepEqual(validateFinalDecisionOutput(decision), { valid: true, errors: [] });
  const contract = buildFinalDecisionShadowOutcomeContract({ decision, source_input: input, prospective_anchor: anchorFor(decision) });
  assert.deepEqual(validateFinalDecisionShadowOutcomeContract(contract), { valid: true, errors: [] });
  return { input, decision, contract };
}

function built(direction = "LONG", overrides = {}) {
  return buildFromInput(completeInput(direction, overrides));
}

function cohort(contract, name) {
  return contract.cohorts.find((row) => row.cohort === name);
}

function withManagementTransition(context, decisionIntent, decisionAction, transitionId) {
  const material = { ...context };
  delete material.persistence;
  return withImmutableReceipt({
    ...material,
    management_transition_id: transitionId,
    management_transition_immutable: true,
    management_transition_observed_ts: NOW - 250,
    management_transition_intent: decisionIntent,
    management_transition_action: decisionAction,
  }, `PMR:${transitionId}`, NOW - 40);
}

function distinctImpulseCampaign(direction, campaignId, malformed = false) {
  const raw = impulseCampaign(direction);
  const state = {
    ...raw.campaign,
    campaign_id: campaignId,
    current_wave_id: `${campaignId}:W1`,
    wave_ledger: raw.campaign.wave_ledger.map((wave) => ({ ...wave, wave_id: `${campaignId}:W1` })),
    ...(malformed ? { impulse_start: null, impulse_start_price: null } : {}),
  };
  return withImmutableReceipt({ ...raw, campaign: state, observation_id: state.observation_id, entry_window: null }, `CMR:${campaignId}:${state.state_revision}`, NOW - 100);
}

function directionlessProspectiveInput(direction = "LONG") {
  const input = completeInput(direction);
  const rawOpportunity = opportunity(direction);
  const opportunityMaterial = { ...rawOpportunity };
  delete opportunityMaterial.persistence;
  opportunityMaterial.newest_event = {
    ...rawOpportunity.newest_event,
    direction_at_event: "DIRECTIONLESS_EVENT",
    direction_locked_ts: null,
    direction_available_ts: null,
    directional_evaluation_eligible: false,
    direction_source: "OPPORTUNITY_DIRECTIONLESS_V1",
    observation_timing: { timely_for_precommitted_funnel: false, retrospective_promotion_forbidden: true },
  };
  opportunityMaterial.direction_receipt = {
    ...rawOpportunity.direction_receipt,
    direction: "DIRECTIONLESS_EVENT",
    direction_locked_ts: null,
    direction_available_ts: null,
  };
  input.opportunity = withImmutableReceipt(opportunityMaterial, rawOpportunity.persistence.receipt_id, NOW - 200);

  const rawCampaign = campaign(direction);
  const lockEvidenceIds = ["POSITIONING-1", "PRICE-1"];
  const lockRows = lockEvidenceIds.map((id) => input.evidence_registry.entries.find((row) => row.evidence_id === id));
  const lockEvidenceDigest = digest(lockRows.map((row) => ({
    evidence_id: row.evidence_id,
    source_payload_digest: row.source_payload_digest,
    lineage_derivation_id: row.lineage_derivation_id,
  })).sort((a, b) => a.evidence_id.localeCompare(b.evidence_id)));
  const lockedTs = NOW - 500;
  const state = {
    ...rawCampaign.campaign,
    direction_at_detection: "DIRECTIONLESS_EVENT",
    direction,
    direction_locked_ts: lockedTs,
    direction_lock_source_ts: NOW - 2_000,
    direction_lock_available_ts: NOW - 1_000,
    direction_lock_mode: "PROSPECTIVE_AFTER_DIRECTIONLESS",
    direction_lock_observation_id: "LOCK-OBS-1",
    direction_lock_rules_version: "prospective-direction-lock-v1",
    direction_lock_evidence_ids: lockEvidenceIds,
    direction_lock_receipt: {
      schema_version: "prospective-direction-lock-receipt-v1",
      status: "CLOSED",
      authoritative: true,
      campaign_id: rawCampaign.campaign.campaign_id,
      direction,
      direction_locked_ts: lockedTs,
      evidence_ids: lockEvidenceIds,
      evidence_content_digest: lockEvidenceDigest,
      rules_version: "prospective-direction-lock-v1",
      receipt_id: "PDLR:LOCK-OBS-1",
      persistence: {
        status: "CLOSED", receipt_id: "PDLR:LOCK-OBS-1", committed_ts: NOW - 400,
        immutable: true, verification_method: "D1_IMMUTABLE_RECEIPT",
      },
    },
    last_observed_ts: NOW - 300,
  };
  const campaignMaterial = { ...rawCampaign, campaign: state, observation_id: state.observation_id };
  delete campaignMaterial.persistence;
  input.campaign = withImmutableReceipt(campaignMaterial, rawCampaign.persistence.receipt_id, NOW - 200);
  return input;
}

test("research-only contract proposes cohorts but cannot reserve, enroll, schedule, calibrate, or promote", () => {
  const { contract } = built("LONG");
  assert.equal(contract.mode, FINAL_DECISION_OUTCOME_MODE);
  assert.equal(contract.mode, "SHADOW_DESIGN_ONLY_NO_PERSISTENCE");
  assert.equal(contract.status, "DESIGN_ONLY_BLOCKED");
  assert.equal(contract.proposal_count, 2);
  assert.equal(contract.reservation_count, 0);
  assert.equal(contract.enrollment_count, 0);
  assert.equal(contract.scheduled_target_count, 0);
  assert.equal(contract.designed_target_count, 8);
  assert.equal(cohort(contract, "DIRECTIONAL").sampling_state, "PROPOSED_NOT_RESERVED");
  assert.equal(cohort(contract, "ENTRY").sampling_state, "PROPOSED_NOT_RESERVED");
  assert.equal(cohort(contract, "MANAGEMENT").sampling_state, "NOT_ELIGIBLE");
  assert.equal(contract.calibration_eligible, false);
  assert.equal(contract.live_probability, null);
  assert.equal(contract.validated_signal, false);
  assert.equal(contract.execution_authorized, false);
  assert.equal(contract.telegram_eligible, false);
  assert.equal(contract.prospective_anchor.source_receipt_preexistence_verified, false);
  assert.equal(contract.frozen_decision_state.admitted_event_id, "EVENT-1");
  assert.doesNotMatch(JSON.stringify(contract), /READY_TO_COMMIT|PENDING_PARENT_COMMIT/);
});

test("activation is blocked and expires exclusively at the first post-decision closed HTX 1m bar", () => {
  const { decision, contract } = built("LONG");
  assert.equal(contract.activation_gate, "BLOCKED_UNTIL_ATOMIC_PARENT_COHORT_RESERVATION_WITH_PREEXISTING_ANCHOR_RECEIPT");
  assert.equal(contract.activation_deadline_ts, Math.floor(decision.observation_ts / 60_000) * 60_000 + 60_000);
  assert.ok(contract.activation_deadline_ts > decision.observation_ts);
  assert.ok(contract.activation_deadline_ts - decision.observation_ts <= 60_000);
  assert.notEqual(contract.activation_deadline_ts, contract.horizons[0].target_ts);
  assert.equal(contract.anti_look_ahead.activation_deadline_exclusive, true);
  assert.equal(contract.anti_look_ahead.atomic_parent_and_cohort_reservation_required, true);
  assert.equal(contract.anti_look_ahead.anchor_receipt_must_preexist_atomic_reservation, true);
  assert.equal(contract.anti_look_ahead.late_activation_result, "CENSORED_NO_BACKFILL");
});

test("directional lane ignores unrelated full-evidence and campaign corruption while entry blocks", () => {
  const input = completeInput("LONG");
  const decision = buildFinalDecisionIntegrationShadow(input);
  const tampered = structuredClone(input);
  tampered.full_evidence.evidence_compact[0].value = 999;
  tampered.campaign.campaign.entry_trigger_price = 999;
  const contract = buildFinalDecisionShadowOutcomeContract({ decision, source_input: tampered, prospective_anchor: anchorFor(decision) });
  assert.deepEqual(validateFinalDecisionShadowOutcomeContract(contract), { valid: true, errors: [] });
  assert.equal(cohort(contract, "DIRECTIONAL").sampling_state, "PROPOSED_NOT_RESERVED");
  assert.deepEqual(cohort(contract, "DIRECTIONAL").required_receipt_keys, ["decision_evidence", "opportunity"]);
  assert.equal(cohort(contract, "ENTRY").sampling_state, "DESIGN_ONLY_BLOCKED");
  assert.ok(cohort(contract, "ENTRY").reason_codes.some((code) => code.includes("FULL_EVIDENCE")));
  assert.ok(cohort(contract, "ENTRY").reason_codes.some((code) => code.includes("CAMPAIGN")));
});

test("valid global FAIL_CLOSED does not suppress an independently closed directional hypothesis", () => {
  const input = completeInput("LONG", { campaign: discoveryCampaign("LONG") });
  const original = buildFinalDecisionIntegrationShadow(input);
  assert.equal(original.entry_action, "WAIT");
  const failClosed = sealDecision({ ...original, status: "FAIL_CLOSED" });
  assert.deepEqual(validateFinalDecisionOutput(failClosed), { valid: true, errors: [] });
  const { contract } = buildFromInput(input, failClosed);
  assert.equal(contract.parent_decision_status, "FAIL_CLOSED");
  assert.equal(cohort(contract, "DIRECTIONAL").sampling_state, "PROPOSED_NOT_RESERVED");
});

test("HOLD requires immutable transition identity and ignores unrelated malformed current candidate", () => {
  const originCampaign = impulseCampaign("LONG");
  const position = openPosition("LONG", originCampaign);
  const origin = positionOriginCampaign(originCampaign, position);
  const plainManagement = positionManagementContext(position, origin);
  const malformedCurrent = distinctImpulseCampaign("LONG", "MW:TEST-USDT:UNRELATED-MALFORMED", true);
  const blockedInput = completeInput("LONG", { campaign: malformedCurrent, position, position_origin_campaign: origin, position_management_context: plainManagement });
  const blocked = buildFromInput(blockedInput).contract;
  assert.equal(cohort(blocked, "MANAGEMENT").sampling_state, "DESIGN_ONLY_BLOCKED");
  assert.ok(cohort(blocked, "MANAGEMENT").reason_codes.includes("IMMUTABLE_MANAGEMENT_TRANSITION_ID_REQUIRED"));

  const transitioned = withManagementTransition(plainManagement, "HOLD_ALLOWED", "HOLD", "PMT:HOLD:1");
  const input = completeInput("LONG", { campaign: malformedCurrent, position, position_origin_campaign: origin, position_management_context: transitioned });
  const { decision, contract } = buildFromInput(input);
  assert.equal(decision.status, "SHADOW_EVALUATED");
  assert.equal(decision.data_quality, "BLOCKED");
  assert.equal(decision.management_action, "HOLD");
  const management = cohort(contract, "MANAGEMENT");
  assert.equal(management.sampling_state, "PROPOSED_NOT_RESERVED");
  assert.equal(management.management_transition_id, "PMT:HOLD:1");
  assert.equal(management.management_transition_source, "IMMUTABLE_POSITION_MANAGEMENT_CONTEXT");
  assert.ok(!management.required_receipt_keys.includes("campaign"));
  assert.ok(!management.required_receipt_keys.includes("full_evidence"));
});

test("hard-veto EXIT uses sealed parent action and does not require position-management context", () => {
  const activeCampaign = impulseCampaign("LONG");
  const position = openPosition("LONG", activeCampaign);
  const origin = positionOriginCampaign(activeCampaign, position);
  const veto = hardVeto({ status: "VETO", reasons: ["TEST_RISK"] });
  const gate = executionGate();
  const input = completeInput("LONG", {
    campaign: activeCampaign, position, position_origin_campaign: origin, position_management_context: null,
    hard_veto: veto, execution_gate: gate, safety_gate_receipt: safetyGateReceipt(veto, gate),
  });
  const { decision, contract } = buildFromInput(input);
  assert.equal(decision.management_intent, "EXIT_REQUIRED");
  assert.equal(decision.management_action, "EXIT");
  const management = cohort(contract, "MANAGEMENT");
  assert.equal(management.sampling_state, "PROPOSED_NOT_RESERVED");
  assert.equal(management.management_trigger_basis, "HARD_VETO");
  assert.equal(management.management_transition_id, decision.management_action_id);
  assert.equal(management.management_transition_source, "SEALED_PARENT_MANAGEMENT_ACTION_ID");
  assert.ok(!management.required_receipt_keys.includes("position_management"));

  const redundantContext = positionManagementContext(position, origin, "INVALIDATED");
  const inputWithContext = completeInput("LONG", {
    campaign: activeCampaign, position, position_origin_campaign: origin, position_management_context: redundantContext,
    hard_veto: veto, execution_gate: gate, safety_gate_receipt: safetyGateReceipt(veto, gate),
  });
  const parentWithContext = buildFinalDecisionIntegrationShadow(inputWithContext);
  const tamperedSource = structuredClone(inputWithContext);
  tamperedSource.position_management_context.persistence.receipt_id += ":TAMPER";
  const hardVetoStillOwnsLane = buildFinalDecisionShadowOutcomeContract({
    decision: parentWithContext,
    source_input: tamperedSource,
    prospective_anchor: anchorFor(parentWithContext),
  });
  assert.deepEqual(validateFinalDecisionShadowOutcomeContract(hardVetoStillOwnsLane), { valid: true, errors: [] });
  assert.equal(cohort(hardVetoStillOwnsLane, "MANAGEMENT").sampling_state, "PROPOSED_NOT_RESERVED");
  assert.ok(!cohort(hardVetoStillOwnsLane, "MANAGEMENT").required_receipt_keys.includes("position_management"));
});

test("EXIT_REQUIRED plus NOT_EVALUATED is frozen and cannot proceed without immutable transition", () => {
  const activeCampaign = impulseCampaign("LONG");
  const position = openPosition("LONG", activeCampaign);
  const origin = positionOriginCampaign(activeCampaign, position);
  const veto = hardVeto({ status: "VETO", reasons: ["TEST_RISK"] });
  const gate = executionGate();
  gate.close_sides.LONG = { ...gate.close_sides.LONG, status: "MISSING", measurable: false };
  const input = completeInput("LONG", {
    campaign: activeCampaign, position, position_origin_campaign: origin, position_management_context: null,
    hard_veto: veto, execution_gate: gate, safety_gate_receipt: safetyGateReceipt(veto, gate),
  });
  const { decision, contract } = buildFromInput(input);
  assert.equal(decision.management_intent, "EXIT_REQUIRED");
  assert.equal(decision.management_action, "NOT_EVALUATED");
  assert.equal(contract.frozen_decision_state.management_intent, "EXIT_REQUIRED");
  assert.equal(contract.frozen_decision_state.management_action, "NOT_EVALUATED");
  assert.equal(cohort(contract, "MANAGEMENT").sampling_state, "DESIGN_ONLY_BLOCKED");
  assert.ok(cohort(contract, "MANAGEMENT").reason_codes.includes("IMMUTABLE_MANAGEMENT_TRANSITION_ID_REQUIRED"));
});

test("directionless admitted event cannot be rewritten by a later same-campaign lock", () => {
  const input = directionlessProspectiveInput("LONG");
  const { decision, contract } = buildFromInput(input);
  assert.equal(decision.direction, "INSUFFICIENT");
  assert.equal(decision.directional_quality, "BLOCKED");
  assert.ok(decision.reason_codes.includes("DIRECTIONLESS_CAMPAIGN_DIRECTION_PROMOTION_FORBIDDEN"));
  assert.equal(contract.frozen_decision_state.direction_provenance, "UNRESOLVED");
  const directional = cohort(contract, "DIRECTIONAL");
  assert.equal(directional.sampling_state, "NOT_ELIGIBLE");
});

test("mutable episode and campaign revisions do not enter unit, cluster, or entry-dedup identities", () => {
  const first = built("LONG");
  const revisedInput = structuredClone(first.input);
  const opportunityMaterial = { ...revisedInput.opportunity };
  delete opportunityMaterial.persistence;
  opportunityMaterial.newest_event = { ...opportunityMaterial.newest_event, episode_revision: 77 };
  revisedInput.opportunity = withImmutableReceipt(opportunityMaterial, "OPR:EVENT-1:REV77", NOW - 200);
  const campaignMaterial = { ...revisedInput.campaign };
  delete campaignMaterial.persistence;
  campaignMaterial.campaign = { ...campaignMaterial.campaign, episode_revision: 77, state_revision: 88 };
  revisedInput.campaign = withImmutableReceipt(campaignMaterial, "CMR:REV88", NOW - 150);
  const rebound = rebindDecision(first.decision, revisedInput);
  assert.deepEqual(validateFinalDecisionOutput(rebound), { valid: true, errors: [] });
  const second = buildFromInput(revisedInput, rebound);
  const d1 = cohort(first.contract, "DIRECTIONAL");
  const d2 = cohort(second.contract, "DIRECTIONAL");
  assert.equal(d2.statistical_unit_id, d1.statistical_unit_id);
  assert.equal(d2.dependence_cluster_id, d1.dependence_cluster_id);
  assert.equal(d2.cohort_dedup_key, d1.cohort_dedup_key);
  const e1 = cohort(first.contract, "ENTRY");
  const e2 = cohort(second.contract, "ENTRY");
  assert.notEqual(e2.decision_state_revision, e1.decision_state_revision);
  assert.equal(e2.statistical_unit_id, e1.statistical_unit_id);
  assert.equal(e2.dependence_cluster_id, e1.dependence_cluster_id);
  assert.equal(e2.cohort_dedup_key, e1.cohort_dedup_key);
});

test("different immutable management transitions share position unit and cluster but not dedup key", () => {
  const active = impulseCampaign("LONG");
  const position = openPosition("LONG", active);
  const origin = positionOriginCampaign(active, position);
  const plain = positionManagementContext(position, origin);
  const contracts = ["PMT:HOLD:1", "PMT:HOLD:2"].map((transitionId) => buildFromInput(completeInput("LONG", {
    campaign: active,
    position,
    position_origin_campaign: origin,
    position_management_context: withManagementTransition(plain, "HOLD_ALLOWED", "HOLD", transitionId),
  })).contract);
  const first = cohort(contracts[0], "MANAGEMENT");
  const second = cohort(contracts[1], "MANAGEMENT");
  assert.equal(first.statistical_unit_id, second.statistical_unit_id);
  assert.equal(first.dependence_cluster_id, second.dependence_cluster_id);
  assert.notEqual(first.cohort_dedup_key, second.cohort_dedup_key);
  assert.notEqual(first.hypothesis_id, second.hypothesis_id);

  const veto = hardVeto({ status: "VETO", reasons: ["TEST_RISK"] });
  const gate = executionGate();
  const exitContract = buildFromInput(completeInput("LONG", {
    campaign: active,
    position,
    position_origin_campaign: origin,
    position_management_context: null,
    hard_veto: veto,
    execution_gate: gate,
    safety_gate_receipt: safetyGateReceipt(veto, gate),
  })).contract;
  const exit = cohort(exitContract, "MANAGEMENT");
  assert.equal(exit.decision_state_revision, first.decision_state_revision, "HOLD and EXIT may occur on one position revision");
  assert.equal(exit.statistical_unit_id, first.statistical_unit_id);
  assert.equal(exit.dependence_cluster_id, first.dependence_cluster_id);
  assert.notEqual(exit.cohort_dedup_key, first.cohort_dedup_key, "later EXIT must not be hidden by the earlier HOLD transition");
  assert.equal(exit.management_trigger_basis, "HARD_VETO");
});

test("complete engine validator rejects a deeply invalid but resealed parent", () => {
  const { input, decision } = built("LONG");
  const tampered = structuredClone(decision);
  tampered.evidence_independence.statistical_independence_validated = true;
  const resealed = sealDecision(tampered);
  assert.ok(validateFinalDecisionOutput(resealed).errors.includes("INDEPENDENCE_CONTRACT_MISMATCH"));
  const contract = buildFinalDecisionShadowOutcomeContract({ decision: resealed, source_input: input, prospective_anchor: anchorFor(decision) });
  assert.equal(contract.parent_decision_status, "INVALID");
  assert.equal(contract.proposal_count, 0);
  assert.ok(contract.cohorts.every((row) => row.sampling_state === "DESIGN_ONLY_BLOCKED"));
  assert.deepEqual(validateFinalDecisionShadowOutcomeContract(contract), { valid: true, errors: [] });
});

test("missing, future, stale, partial, or interpolated anchors cannot create proposals", () => {
  const { input, decision } = built("LONG");
  const missing = buildFinalDecisionShadowOutcomeContract({ decision, source_input: input, prospective_anchor: null });
  assert.equal(missing.proposal_count, 0);
  assert.equal(cohort(missing, "DIRECTIONAL").sampling_state, "DESIGN_ONLY_BLOCKED");
  assert.deepEqual(validateFinalDecisionShadowOutcomeContract(missing), { valid: true, errors: [] });
  for (const invalid of [
    { reference_ts: NOW + 1 },
    { available_ts: NOW + 1 },
    { reference_ts: NOW - 61_000, available_ts: NOW - 60_500, valid_until_ts: NOW - 1_000 },
    { reference_price: null },
    { closed_bar: false },
    { interpolation_used: true },
    { future_data_used: true },
  ]) assert.throws(() => anchorFor(decision, invalid));
});

test("contract is deterministic, bounded, pure; validator rejects activation and promotion", () => {
  const first = built("SHORT");
  const replay = buildFinalDecisionShadowOutcomeContract({ decision: first.decision, source_input: first.input, prospective_anchor: anchorFor(first.decision) });
  assert.deepEqual(replay, first.contract);
  assert.equal(first.contract.cohorts.length, FINAL_DECISION_OUTCOME_LIMITS.max_cohorts_per_decision);
  assert.equal(first.contract.horizons.length, FINAL_DECISION_OUTCOME_LIMITS.max_horizons_per_cohort);
  assert.deepEqual(first.contract.horizons.map((row) => row.horizon), FINAL_DECISION_OUTCOME_HORIZONS.map((row) => row.horizon));
  assert.equal(first.contract.bounds.d1_statements_added_by_builder, 0);
  assert.equal(first.contract.bounds.network_calls_added_by_builder, 0);
  for (const mutation of [
    (copy) => { copy.status = "READY_TO_COMMIT"; },
    (copy) => { copy.reservation_count = 1; },
    (copy) => { copy.enrollment_count = 1; },
    (copy) => { copy.scheduled_target_count = 1; },
    (copy) => { copy.calibration_eligible = true; },
    (copy) => { copy.live_probability = 0.7; },
    (copy) => { copy.validated_signal = true; },
    (copy) => { copy.execution_authorized = true; },
    (copy) => { copy.anti_look_ahead.anchor_receipt_must_preexist_atomic_reservation = false; },
    (copy) => { copy.activation_deadline_ts = copy.horizons[0].target_ts; },
  ]) {
    const copy = structuredClone(first.contract);
    mutation(copy);
    assert.equal(validateFinalDecisionShadowOutcomeContract(copy).valid, false);
  }
});

test("malformed object traps fail closed without throwing or producing a proposal", () => {
  const poisonous = new Proxy({}, { ownKeys() { throw new Error("poison"); } });
  assert.doesNotThrow(() => validateFinalDecisionShadowOutcomeContract(poisonous));
  assert.deepEqual(validateFinalDecisionShadowOutcomeContract(poisonous), { valid: false, errors: ["OUTCOME_CONTRACT_UNREADABLE"] });
  const fallback = buildFinalDecisionShadowOutcomeContract({ decision: poisonous });
  assert.equal(fallback.status, "DESIGN_ONLY_BLOCKED");
  assert.equal(fallback.proposal_count, 0);
  assert.equal(fallback.enrollment_count, 0);
  assert.deepEqual(validateFinalDecisionShadowOutcomeContract(fallback), { valid: true, errors: [] });
});
