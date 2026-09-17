import assert from "node:assert/strict";
import { buildFinalDecisionIntegrationShadow, validateFinalDecisionOutput } from "../src/final-decision-integration-engine.mjs";
import {
  NOW,
  campaign,
  completeInput,
  executionGate,
  fullEvidence,
  impulseCampaign,
  discoveryCampaign,
  evidenceRegistry,
  evidenceRow,
  openPosition,
  opportunity,
  positionManagementContext,
  positionOriginCampaign,
  resealEvidenceRegistry,
  secondWaveCampaign,
  withImmutableReceipt,
} from "./final-decision-integration-fixtures.mjs";

function distinctImpulseCampaign(direction, campaignId) {
  const raw = impulseCampaign(direction);
  const state = {
    ...raw.campaign,
    campaign_id: campaignId,
    current_wave_id: `${campaignId}:W1`,
    wave_ledger: raw.campaign.wave_ledger.map((wave) => ({
      ...wave,
      wave_id: `${campaignId}:W1`,
    })),
  };
  return withImmutableReceipt({
    ...raw,
    campaign: state,
    observation_id: state.observation_id,
    entry_window: null,
  }, `CMR:${campaignId}:${state.state_revision}`, NOW - 100);
}

function exhaustionWarningCampaign(direction = "LONG") {
  const impulse = impulseCampaign(direction).campaign;
  const warningTs = NOW - 2 * 60_000;
  return campaign(direction, {
    ...impulse,
    current_phase: "EXHAUSTION_WARNING",
    exhaustion_warning_ts: warningTs,
    transition_history: [
      ...impulse.transition_history,
      {
        from: "IMPULSE", to: "EXHAUSTION_WARNING", observed_ts: warningTs,
        transition_id: "TRANSITION-5", from_state_revision: 5, to_state_revision: 6,
        observation_id: "OBS-T5",
      },
    ],
    wave_ledger: impulse.wave_ledger.map((wave) => ({
      ...wave,
      status: "TERMINATED",
      terminated_ts: warningTs,
      termination_observation_id: "OBS-T5",
      termination_phase: "EXHAUSTION_WARNING",
    })),
    state_revision: 6,
    observation_id: "OBS-6",
  });
}

function edgeSpentCampaign(direction = "LONG") {
  const warning = exhaustionWarningCampaign(direction).campaign;
  const edgeTs = NOW - 60_000;
  return campaign(direction, {
    ...warning,
    current_phase: "EDGE_SPENT",
    edge_spent_ts: edgeTs,
    transition_history: [
      ...warning.transition_history,
      {
        from: "EXHAUSTION_WARNING", to: "EDGE_SPENT", observed_ts: edgeTs,
        transition_id: "TRANSITION-6", from_state_revision: 6, to_state_revision: 7,
        observation_id: "OBS-T6",
      },
    ],
    state_revision: 7,
    observation_id: "OBS-7",
  });
}

function directlyClosedCampaign(direction = "LONG") {
  const impulse = impulseCampaign(direction).campaign;
  const closedTs = NOW - 1_000;
  return campaign(direction, {
    ...impulse,
    current_phase: "CLOSED",
    campaign_end: closedTs,
    transition_history: [
      ...impulse.transition_history,
      {
        from: "IMPULSE", to: "CLOSED", observed_ts: closedTs,
        transition_id: "TRANSITION-5", from_state_revision: 5, to_state_revision: 6,
        observation_id: "OBS-CLOSE-6",
      },
    ],
    wave_ledger: impulse.wave_ledger.map((wave) => ({
      ...wave,
      status: "TERMINATED",
      terminated_ts: closedTs,
      termination_observation_id: "OBS-CLOSE-6",
      termination_phase: "CLOSED",
    })),
    state_revision: 6,
    observation_id: "OBS-CLOSE-6",
  });
}

function reloadCampaign(direction = "LONG") {
  const impulse = impulseCampaign(direction).campaign;
  const reloadTs = NOW - 3 * 60_000;
  return campaign(direction, {
    ...impulse,
    current_phase: "RELOAD_BASE",
    base_start: reloadTs,
    transition_history: [
      ...impulse.transition_history,
      {
        from: "IMPULSE", to: "RELOAD_BASE", observed_ts: reloadTs,
        transition_id: "TRANSITION-5", from_state_revision: 5, to_state_revision: 6,
        observation_id: "OBS-T5",
      },
    ],
    wave_ledger: impulse.wave_ledger.map((wave) => ({
      ...wave,
      status: "COMPLETED",
      completed_ts: reloadTs,
      completion_observation_id: "OBS-T5",
    })),
    completed_wave_count: 1,
    state_revision: 6,
    observation_id: "OBS-6",
  });
}

function zeroWaveClosedCampaign(direction = "LONG") {
  const discovery = discoveryCampaign(direction).campaign;
  const closedTs = NOW - 1_000;
  return campaign(direction, {
    ...discovery,
    current_phase: "CLOSED",
    campaign_end: closedTs,
    transition_history: [{
      from: "DISCOVERY", to: "CLOSED", observed_ts: closedTs,
      transition_id: "ZERO-WAVE-CLOSE-T1", from_state_revision: 1, to_state_revision: 2,
      observation_id: "ZERO-WAVE-CLOSE-O2",
    }],
    state_revision: 2,
    observation_id: "ZERO-WAVE-CLOSE-O2",
  });
}

function secondWaveImpulseCampaign(direction = "LONG") {
  const entry = secondWaveCampaign(direction).campaign;
  const impulseTs = NOW - 90_000;
  return campaign(direction, {
    ...entry,
    current_phase: "IMPULSE",
    impulse_start: impulseTs,
    impulse_start_price: direction === "LONG" ? 108 : 92,
    transition_history: [...entry.transition_history, {
      from: "NEXT_IMPULSE_ENTRY", to: "IMPULSE", observed_ts: impulseTs,
      transition_id: "W2-TRANSITION-8", observation_id: "W2-OBS-T8",
      from_state_revision: 8, to_state_revision: 9,
    }],
    wave_ledger: entry.wave_ledger.map((wave) => wave.wave_index === 2 ? {
      ...wave,
      status: "IMPULSE_ACTIVE",
      impulse_start: impulseTs,
      impulse_start_price: direction === "LONG" ? 108 : 92,
      impulse_observation_id: "W2-OBS-T8",
    } : wave),
    state_revision: 9,
    observation_id: "W2-OBS-9",
  });
}

function impossibleCrossAnchorCampaign(direction = "LONG") {
  const seed = impulseCampaign(direction).campaign;
  const campaignId = seed.campaign_id;
  const priorTs = NOW - 8 * 60_000;
  const entryTs = NOW - 6 * 60_000;
  const impulseTs = NOW - 3 * 60_000;
  return campaign(direction, {
    ...seed,
    wave_index: 100,
    completed_wave_count: 99,
    current_wave_id: `${campaignId}:W100`,
    entry_trigger_time: entryTs,
    entry_trigger_price: 100,
    impulse_start: impulseTs,
    impulse_start_price: direction === "LONG" ? 103 : 97,
    base_start: priorTs,
    state_revision: 5,
    observation_id: "OBS-W100-5",
    history_truncated: true,
    history_anchor: {
      schema_version: "transition-history-anchor-v1",
      campaign_id: campaignId,
      prior_phase: "NEXT_IMPULSE_WATCH",
      prior_state_revision: 3,
      prefix_transition_count: 2,
      prior_observation_ts: priorTs,
      prefix_digest: "1111111111111111",
      receipt_id: "THA:W100",
      persistence: {
        status: "CLOSED", immutable: true, verification_method: "D1_IMMUTABLE_RECEIPT",
        receipt_id: "THA:W100", content_digest: "1111111111111111", committed_ts: NOW - 200,
      },
    },
    transition_history: [
      {
        from: "NEXT_IMPULSE_WATCH", to: "NEXT_IMPULSE_ENTRY", observed_ts: entryTs,
        transition_id: "W100-T3", observation_id: "W100-OE",
        from_state_revision: 3, to_state_revision: 4,
      },
      {
        from: "NEXT_IMPULSE_ENTRY", to: "IMPULSE", observed_ts: impulseTs,
        transition_id: "W100-T4", observation_id: "W100-OI",
        from_state_revision: 4, to_state_revision: 5,
      },
    ],
    wave_ledger_offset: 99,
    wave_ledger_anchor: {
      schema_version: "wave-ledger-anchor-v1",
      campaign_id: campaignId,
      completed_wave_count: 99,
      last_wave_id: `${campaignId}:W99`,
      last_completed_ts: priorTs,
      prefix_digest: "2222222222222222",
      receipt_id: "WLA:W99",
      persistence: {
        status: "CLOSED", immutable: true, verification_method: "D1_IMMUTABLE_RECEIPT",
        receipt_id: "WLA:W99", content_digest: "2222222222222222", committed_ts: NOW - 200,
      },
    },
    wave_ledger: [{
      wave_id: `${campaignId}:W100`, wave_index: 100, status: "IMPULSE_ACTIVE", immutable: true,
      entry_observation_id: "W100-OE", entry_trigger_time: entryTs, entry_trigger_price: 100,
      impulse_observation_id: "W100-OI", impulse_start: impulseTs,
      impulse_start_price: direction === "LONG" ? 103 : 97, completed_ts: null,
    }],
  });
}

{
  const directionlessCampaign = campaign("LONG");
  directionlessCampaign.campaign.direction = "DIRECTIONLESS_EVENT";
  directionlessCampaign.campaign.direction_at_detection = "DIRECTIONLESS_EVENT";
  const input = completeInput("LONG", { campaign: directionlessCampaign });
  const result = buildFinalDecisionIntegrationShadow(input);
  assert.equal(result.direction, "INSUFFICIENT");
  assert.equal(result.directional_quality, "INSUFFICIENT");
  assert.ok(result.reason_codes.includes("CAMPAIGN_DIRECTION_REMAINS_DIRECTIONLESS"));
}

{
  const historical = opportunity("LONG");
  historical.newest_event = {
    ...historical.newest_event,
    direction_at_event: "NONE",
    direction_locked_ts: null,
    observation_timing: { retrospective_promotion_forbidden: true },
  };
  const directionlessCampaign = campaign("LONG");
  directionlessCampaign.campaign.direction = "DIRECTIONLESS_EVENT";
  directionlessCampaign.campaign.direction_at_detection = "DIRECTIONLESS_EVENT";
  const result = buildFinalDecisionIntegrationShadow(completeInput("LONG", {
    opportunity: historical,
    campaign: directionlessCampaign,
  }));
  assert.equal(result.direction, "INSUFFICIENT");
  assert.notEqual(result.entry_action, "SHADOW_ENTRY_ELIGIBLE");
}

{
  const malformed = impulseCampaign("LONG");
  malformed.campaign.impulse_start = null;
  malformed.campaign.impulse_start_price = null;
  const result = buildFinalDecisionIntegrationShadow(completeInput("LONG", { campaign: malformed }));
  assert.equal(result.campaign_quality, "BLOCKED");
  assert.equal(result.data_quality, "BLOCKED");
  assert.equal(result.entry_action, "REJECT");
  assert.ok(result.reason_codes.includes("MISSING_IMPULSE_PHASE_FACTS"));
}

{
  const malformed = campaign("LONG");
  malformed.campaign.transition_history = [
    { from: "DISCOVERY", to: "IMPULSE", observed_ts: NOW - 1_000 },
  ];
  const result = buildFinalDecisionIntegrationShadow(completeInput("LONG", { campaign: malformed }));
  assert.equal(result.campaign_quality, "BLOCKED");
  assert.ok(result.reason_codes.some((code) => code.startsWith("ILLEGAL_CAMPAIGN_TRANSITION")));
}

{
  const forgedHistory = [
    ["DISCOVERY", "PRE_IMPULSE_WATCH", NOW - 28 * 60_000],
    ["PRE_IMPULSE_WATCH", "ENTRY_CANDIDATE", NOW - 20 * 60_000],
    ["ENTRY_CANDIDATE", "ENTRY_TRIGGER", NOW - 10 * 60_000],
  ].map(([from, to, observed_ts], index) => ({
    from,
    to,
    observed_ts,
    transition_id: `FORGED-GAP-${index + 1}`,
    observation_id: `OBS-T${index + 1}`,
    from_state_revision: 99 + index,
    to_state_revision: 100 + index,
  }));
  const forged = campaign("LONG", { transition_history: forgedHistory, state_revision: 102 });
  const result = buildFinalDecisionIntegrationShadow(completeInput("LONG", { campaign: forged }));
  assert.equal(result.campaign_quality, "BLOCKED");
  assert.notEqual(result.entry_action, "SHADOW_ENTRY_ELIGIBLE");
  assert.ok(result.reason_codes.includes("TRANSITION_HISTORY_GENESIS_REVISION_INVALID"));
  assert.ok(result.reason_codes.includes("UNANCHORED_TRANSITION_HISTORY_REVISION_GAP"));
  assert.equal(validateFinalDecisionOutput(result).valid, true);
}

{
  const impossibleRestart = discoveryCampaign("LONG", {
    history_truncated: true,
    state_revision: 11,
    history_anchor: {
      schema_version: "transition-history-anchor-v1",
      campaign_id: "MW:TEST-USDT:1",
      prior_phase: "DISCOVERY",
      prior_state_revision: 11,
      prefix_transition_count: 10,
      prior_observation_ts: NOW - 29 * 60_000,
      prefix_digest: "0123456789abcdef",
      receipt_id: "THA:IMPOSSIBLE-DISCOVERY",
      persistence: {
        status: "CLOSED",
        immutable: true,
        verification_method: "D1_IMMUTABLE_RECEIPT",
        receipt_id: "THA:IMPOSSIBLE-DISCOVERY",
        content_digest: "0123456789abcdef",
        committed_ts: NOW - 1_000,
      },
    },
  });
  const result = buildFinalDecisionIntegrationShadow(completeInput("LONG", { campaign: impossibleRestart }));
  assert.equal(result.campaign_quality, "BLOCKED");
  assert.ok(result.reason_codes.includes("DISCOVERY_HISTORY_CANNOT_BE_TRUNCATED"));
  assert.equal(validateFinalDecisionOutput(result).valid, true);
}

{
  const anchor = {
    schema_version: "transition-history-anchor-v1",
    campaign_id: "MW:TEST-USDT:1",
    prior_phase: "ENTRY_CANDIDATE",
    prior_state_revision: 3,
    prefix_transition_count: 2,
    prior_observation_ts: NOW - 20 * 60_000,
    prefix_digest: "0123456789abcdef",
    receipt_id: "THA:VALID-ENTRY-PREFIX",
    persistence: {
      status: "CLOSED",
      immutable: true,
      verification_method: "D1_IMMUTABLE_RECEIPT",
      receipt_id: "THA:VALID-ENTRY-PREFIX",
      content_digest: "0123456789abcdef",
      committed_ts: NOW - 1_000,
    },
  };
  const retainedEntry = {
    from: "ENTRY_CANDIDATE",
    to: "ENTRY_TRIGGER",
    observed_ts: NOW - 10 * 60_000,
    transition_id: "RETAINED-ENTRY-T3",
    observation_id: "OBS-T3",
    from_state_revision: 3,
    to_state_revision: 4,
  };
  const validTruncated = campaign("LONG", {
    transition_history: [retainedEntry],
    history_truncated: true,
    history_anchor: anchor,
  });
  const valid = buildFinalDecisionIntegrationShadow(completeInput("LONG", { campaign: validTruncated }));
  assert.equal(valid.campaign_quality, "CLOSED");
  assert.equal(valid.entry_action, "SHADOW_ENTRY_ELIGIBLE");
  assert.equal(validateFinalDecisionOutput(valid).valid, true);

  const preFactAnchor = {
    ...anchor,
    persistence: {
      ...anchor.persistence,
      committed_ts: anchor.prior_observation_ts - 1,
    },
  };
  const anchorBeforeFact = campaign("LONG", {
    transition_history: [retainedEntry],
    history_truncated: true,
    history_anchor: preFactAnchor,
  });
  const preFactRejected = buildFinalDecisionIntegrationShadow(completeInput("LONG", { campaign: anchorBeforeFact }));
  assert.equal(preFactRejected.campaign_quality, "BLOCKED");
  assert.ok(preFactRejected.reason_codes.includes("INVALID_TRANSITION_HISTORY_ANCHOR"));
  assert.notEqual(preFactRejected.entry_action, "SHADOW_ENTRY_ELIGIBLE");
  assert.equal(validateFinalDecisionOutput(preFactRejected).valid, true);

  const lateAnchor = {
    ...anchor,
    persistence: { ...anchor.persistence, committed_ts: NOW - 100 },
  };
  const parentBeforeAnchor = campaign("LONG", {
    transition_history: [retainedEntry],
    history_truncated: true,
    history_anchor: lateAnchor,
  });
  const causallyRejected = buildFinalDecisionIntegrationShadow(completeInput("LONG", { campaign: parentBeforeAnchor }));
  assert.equal(causallyRejected.campaign_quality, "BLOCKED");
  assert.ok(causallyRejected.reason_codes.includes("CAMPAIGN_PERSISTENCE_PRECEDES_NESTED_ANCHOR"));
  assert.notEqual(causallyRejected.entry_action, "SHADOW_ENTRY_ELIGIBLE");
  assert.equal(validateFinalDecisionOutput(causallyRejected).valid, true);

  const discontinuous = campaign("LONG", {
    transition_history: [{ ...retainedEntry, from: "PRE_IMPULSE_WATCH" }],
    history_truncated: true,
    history_anchor: anchor,
  });
  const rejected = buildFinalDecisionIntegrationShadow(completeInput("LONG", { campaign: discontinuous }));
  assert.equal(rejected.campaign_quality, "BLOCKED");
  assert.ok(rejected.reason_codes.includes("DISCONTINUOUS_TRANSITION_HISTORY"));
  assert.notEqual(rejected.entry_action, "SHADOW_ENTRY_ELIGIBLE");
  assert.equal(validateFinalDecisionOutput(rejected).valid, true);
}

{
  const lateOpportunity = opportunity("LONG");
  const resealedOpportunity = withImmutableReceipt(
    lateOpportunity,
    lateOpportunity.persistence.receipt_id,
    NOW - 50,
  );
  const result = buildFinalDecisionIntegrationShadow(completeInput("LONG", {
    opportunity: resealedOpportunity,
  }));
  assert.equal(result.campaign_quality, "BLOCKED");
  assert.ok(result.reason_codes.includes("CAMPAIGN_PERSISTENCE_PRECEDES_OPPORTUNITY_RECEIPT"));
  assert.notEqual(result.entry_action, "SHADOW_ENTRY_ELIGIBLE");
  assert.equal(validateFinalDecisionOutput(result).valid, true);
}

{
  const raw = campaign("LONG");
  const chaseAvailableAfterState = withImmutableReceipt({
    ...raw,
    chase_risk: {
      ...raw.chase_risk,
      source_ts: NOW - 100,
      available_ts: NOW - 50,
      max_age_ms: 60_000,
      valid_until_ts: NOW + 59_900,
    },
  }, raw.persistence.receipt_id, NOW - 150);
  const result = buildFinalDecisionIntegrationShadow(completeInput("LONG", {
    campaign: chaseAvailableAfterState,
  }));
  assert.equal(result.campaign_quality, "BLOCKED");
  assert.ok(result.reason_codes.includes("CHASE_RISK_SOURCE_POSTDATES_CAMPAIGN_STATE"));
  assert.ok(result.reason_codes.includes("CHASE_RISK_AVAILABILITY_POSTDATES_CAMPAIGN_STATE"));
  assert.ok(result.reason_codes.includes("CAMPAIGN_PERSISTENCE_PRECEDES_CHASE_RISK"));
  assert.notEqual(result.entry_action, "SHADOW_ENTRY_ELIGIBLE");
  assert.equal(validateFinalDecisionOutput(result).valid, true);
}

{
  const base = completeInput("LONG");
  const lateSafetyReceipt = structuredClone(base.safety_gate_receipt);
  lateSafetyReceipt.persistence.committed_ts = NOW - 50;
  const result = buildFinalDecisionIntegrationShadow({
    ...base,
    safety_gate_receipt: lateSafetyReceipt,
  });
  assert.equal(result.source_quality.full_evidence, "BLOCKED");
  assert.equal(result.data_quality, "BLOCKED");
  assert.ok(result.reason_codes.includes("FULL_EVIDENCE_SOURCE_REGISTRY_PRECEDES_SAFETY_GATE_RECEIPT"));
  assert.ok(result.reason_codes.includes("FULL_EVIDENCE_PERSISTENCE_PRECEDES_SAFETY_GATE_RECEIPT"));
  assert.notEqual(result.entry_action, "SHADOW_ENTRY_ELIGIBLE");
  assert.equal(validateFinalDecisionOutput(result).valid, true);
}

{
  const raw = campaign("LONG");
  const consumed = withImmutableReceipt({
    ...raw,
    entry_window: { ...raw.entry_window, consumed: true },
  }, "CMR:CONSUMED-W1:4", NOW - 100);
  const result = buildFinalDecisionIntegrationShadow(completeInput("LONG", { campaign: consumed }));
  assert.equal(result.campaign_quality, "BLOCKED");
  assert.notEqual(result.entry_action, "SHADOW_ENTRY_ELIGIBLE");
  assert.ok(result.reason_codes.includes("ENTRY_WINDOW_NOT_AVAILABLE_SINGLE_USE"));
  assert.equal(validateFinalDecisionOutput(result).valid, true);
}

{
  const firstWave = campaign("LONG");
  const nextWave = secondWaveCampaign("LONG");
  const first = buildFinalDecisionIntegrationShadow(completeInput("LONG", { campaign: firstWave }));
  const next = buildFinalDecisionIntegrationShadow(completeInput("LONG", { campaign: nextWave }));
  const restarted = buildFinalDecisionIntegrationShadow(completeInput("LONG", { campaign: nextWave }));
  assert.equal(first.entry_action, "SHADOW_ENTRY_ELIGIBLE");
  assert.equal(next.entry_action, "SHADOW_ENTRY_ELIGIBLE");
  assert.notEqual(next.entry_action_id, first.entry_action_id, "a later wave is a distinct bounded re-entry unit");
  assert.equal(next.entry_action_id, restarted.entry_action_id, "restart must preserve the same W2 action identity");
  assert.equal(next.decision_id, restarted.decision_id);
  assert.equal(validateFinalDecisionOutput(next).valid, true);
}

{
  const first = buildFinalDecisionIntegrationShadow(completeInput("LONG"));
  const replay = buildFinalDecisionIntegrationShadow(completeInput("LONG"));
  assert.equal(first.decision_id, replay.decision_id);
  assert.equal(first.material_digest, replay.material_digest);
  assert.deepEqual(first.reason_codes, replay.reason_codes);
}

{
  const original = campaign("LONG");
  const first = buildFinalDecisionIntegrationShadow(completeInput("LONG", { campaign: original }));
  const duplicate = withImmutableReceipt({
    ...original,
    status: "DUPLICATE_OBSERVATION_SKIPPED",
  }, "CMR:DUPLICATE-RETRY:4", NOW - 100);
  const retry = buildFinalDecisionIntegrationShadow(completeInput("LONG", { campaign: duplicate }));
  assert.equal(first.entry_action, "SHADOW_ENTRY_ELIGIBLE");
  assert.equal(retry.entry_action, "SHADOW_ENTRY_ELIGIBLE", "upstream observation dedup must not lose an unconsumed downstream action after restart");
  assert.equal(retry.entry_action_id, first.entry_action_id);
  assert.ok(retry.reason_codes.includes("ENTRY_ACTION_REPLAY_UNCONSUMED_WINDOW"));
  assert.equal(validateFinalDecisionOutput(retry).valid, true);
}

{
  const outOfOrder = campaign("LONG", { last_observed_ts: NOW + 1 });
  const result = buildFinalDecisionIntegrationShadow(completeInput("LONG", { campaign: outOfOrder }));
  assert.equal(result.campaign_quality, "BLOCKED");
  assert.ok(result.reason_codes.includes("INVALID_CAMPAIGN_TIMELINE"));
}

for (const invalidTimestamp of [NOW - 500.25, String(NOW - 500)]) {
  const malformedClock = campaign("LONG", { last_observed_ts: invalidTimestamp });
  const result = buildFinalDecisionIntegrationShadow(completeInput("LONG", { campaign: malformedClock }));
  assert.equal(result.campaign_quality, "BLOCKED");
  assert.ok(result.reason_codes.includes("INVALID_CAMPAIGN_TIMELINE"));
  assert.equal(validateFinalDecisionOutput(result).valid, true, "non-integer/string source clocks must fail closed without rounded causal boundaries");
}

{
  const futureEntry = campaign("LONG", { entry_trigger_time: NOW + 1 });
  const result = buildFinalDecisionIntegrationShadow(completeInput("LONG", { campaign: futureEntry }));
  assert.equal(result.campaign_quality, "BLOCKED");
  assert.equal(result.entry_action, "REJECT");
  assert.ok(result.reason_codes.includes("INVALID_ENTRY_TRIGGER_TIMELINE"));
}

{
  const entryCandidate = campaign("LONG", {
    current_phase: "ENTRY_CANDIDATE",
    wave_index: 0,
    completed_wave_count: 0,
    current_wave_id: null,
    entry_trigger_time: null,
    entry_trigger_price: null,
    impulse_start: null,
    impulse_start_price: null,
    state_revision: 3,
    observation_id: "ENTRY-CANDIDATE-OBS-3",
    transition_history: [
      { from: "DISCOVERY", to: "PRE_IMPULSE_WATCH", observed_ts: NOW - 28 * 60_000, transition_id: "EC-T1", observation_id: "EC-O1", from_state_revision: 1, to_state_revision: 2 },
      { from: "PRE_IMPULSE_WATCH", to: "ENTRY_CANDIDATE", observed_ts: NOW - 20 * 60_000, transition_id: "EC-T2", observation_id: "EC-O2", from_state_revision: 2, to_state_revision: 3 },
    ],
    wave_ledger: [],
  });
  entryCandidate.observation_id = entryCandidate.campaign.observation_id;
  const resealed = withImmutableReceipt(entryCandidate, "CMR:ENTRY-CANDIDATE:3", NOW - 100);
  const result = buildFinalDecisionIntegrationShadow(completeInput("LONG", { campaign: resealed }));
  assert.equal(result.campaign_quality, "CLOSED");
  assert.equal(result.timing_state, "EARLY", "candidate formation is not yet an actionable entry window");
  assert.equal(result.entry_action, "WAIT");
  assert.equal(validateFinalDecisionOutput(result).valid, true);
}

{
  const raw = campaign("LONG");
  const expiredAt = NOW - 1;
  const expired = withImmutableReceipt({
    ...raw,
    entry_window: {
      ...raw.entry_window,
      valid_until_ts: expiredAt,
      max_age_ms: expiredAt - raw.entry_window.source_ts,
    },
  }, "CMR:EXPIRED-ENTRY-WINDOW:4", NOW - 100);
  const result = buildFinalDecisionIntegrationShadow(completeInput("LONG", { campaign: expired }));
  assert.equal(result.campaign_quality, "CLOSED");
  assert.equal(result.timing_state, "LATE");
  assert.equal(result.entry_action, "REJECT");
  assert.ok(result.reason_codes.includes("ENTRY_WINDOW_EXPIRED"));
  assert.equal(validateFinalDecisionOutput(result).valid, true);
}

{
  const result = buildFinalDecisionIntegrationShadow(completeInput("LONG"));
  assert.equal(result.opportunity_latency.event_close_ts, NOW - 59 * 60_000);
  assert.equal(result.opportunity_latency.detection_lag_from_close_ms, 29 * 60_000);
  assert.equal(result.opportunity_latency.detection_lag_ms, 30 * 60_000, "legacy event-start latency remains diagnostic only");
  const tampered = structuredClone(result);
  tampered.opportunity_latency.detection_lag_from_close_ms += 1;
  assert.ok(validateFinalDecisionOutput(tampered).errors.includes("OPPORTUNITY_LATENCY_COHERENCE_MISMATCH:detection_lag_from_close_ms"));
}

{
  const beforeClose = campaign("LONG", {
    campaign_start: NOW - 59.5 * 60_000,
    first_detected_time: NOW - 59.5 * 60_000,
  });
  const result = buildFinalDecisionIntegrationShadow(completeInput("LONG", { campaign: beforeClose }));
  assert.equal(result.status, "FAIL_CLOSED");
  assert.ok(result.reason_codes.includes("CAMPAIGN_PREDATES_ADMITTED_EVENT_CLOSE"));
  assert.equal(result.opportunity_latency.detection_lag_from_close_ms, null, "invalid chronology must not be emitted as negative latency or coerced to zero");
  assert.equal(validateFinalDecisionOutput(result).valid, true, "invalid source chronology must still produce a persistable fail-closed envelope");
}

{
  const staleRevision = campaign("LONG");
  delete staleRevision.campaign.state_revision;
  delete staleRevision.campaign.observation_id;
  staleRevision.campaign.wave_facts_immutable = false;
  staleRevision.campaign.cas_persisted = false;
  const result = buildFinalDecisionIntegrationShadow(completeInput("LONG", { campaign: staleRevision }));
  assert.equal(result.campaign_quality, "BLOCKED");
  assert.equal(result.direction, "LONG", "campaign persistence failure must block entry without retrospectively rewriting independent directional evidence");
  assert.notEqual(result.entry_action, "SHADOW_ENTRY_ELIGIBLE");
}

{
  const active = impulseCampaign("LONG");
  const closedTs = NOW - 1_000;
  const state = {
    ...active.campaign,
    current_phase: "CLOSED",
    campaign_end: closedTs,
    last_observed_ts: closedTs,
    state_revision: 6,
    observation_id: "OBS-CLOSE-6",
    transition_history: [...active.campaign.transition_history, {
      from: "IMPULSE", to: "CLOSED", observed_ts: closedTs,
      transition_id: "TRANSITION-5", observation_id: "OBS-CLOSE-6",
      from_state_revision: 5, to_state_revision: 6,
    }],
  };
  const impossibleTerminal = withImmutableReceipt({
    ...active,
    observation_id: state.observation_id,
    campaign: state,
    entry_window: null,
  }, "CMR:IMPOSSIBLE-CLOSED:6", NOW - 100);
  const result = buildFinalDecisionIntegrationShadow(completeInput("LONG", { campaign: impossibleTerminal }));
  assert.equal(result.campaign_quality, "BLOCKED");
  assert.ok(result.reason_codes.includes("TERMINAL_PHASE_HAS_ACTIVE_WAVE"));
  assert.equal(validateFinalDecisionOutput(result).valid, true);
}

for (const direction of ["LONG", "SHORT"]) {
  for (const terminalCampaign of [edgeSpentCampaign(direction), directlyClosedCampaign(direction)]) {
    const entryCampaign = impulseCampaign(direction);
    const position = openPosition(direction, entryCampaign);
    const origin = positionOriginCampaign(entryCampaign, position);
    const result = buildFinalDecisionIntegrationShadow(completeInput(direction, {
      campaign: terminalCampaign,
      position,
      position_origin_campaign: origin,
      position_management_context: positionManagementContext(position, origin, "CLEAR"),
    }));
    assert.equal(result.campaign_quality, "CLOSED", `${direction}:${terminalCampaign.campaign.current_phase}`);
    assert.equal(result.risk_state, "INVALIDATED", `${direction}:${terminalCampaign.campaign.current_phase}`);
    assert.equal(result.management_intent, "EXIT_REQUIRED", `${direction}:${terminalCampaign.campaign.current_phase}`);
    assert.equal(result.management_action, "EXIT", `${direction}:${terminalCampaign.campaign.current_phase}`);
    assert.deepEqual(result.management_trigger_basis.trigger_types, ["ORIGIN_CAMPAIGN_TERMINAL"]);
    assert.equal(result.action_identity.management.position_direction, direction);
    assert.equal(validateFinalDecisionOutput(result).valid, true, `${direction}:${terminalCampaign.campaign.current_phase}`);
  }
}

for (const direction of ["LONG", "SHORT"]) {
  const reload = reloadCampaign(direction);
  const baseline = buildFinalDecisionIntegrationShadow(completeInput(direction, { campaign: reload }));
  assert.equal(baseline.campaign_quality, "CLOSED", `${direction}:reload-baseline`);
  for (const [field, value] of [
    ["current_wave_id", null],
    ["current_wave_id", "MW:TEST-USDT:1:W999"],
    ["entry_trigger_time", null],
    ["impulse_start", null],
  ]) {
    const mutatedState = { ...reload.campaign, [field]: value };
    const resealed = withImmutableReceipt({ ...reload, campaign: mutatedState }, reload.persistence.receipt_id, reload.persistence.committed_ts);
    const result = buildFinalDecisionIntegrationShadow(completeInput(direction, { campaign: resealed }));
    assert.equal(result.campaign_quality, "BLOCKED", `${direction}:reload:${field}:${value}`);
    assert.ok(result.reason_codes.includes("POST_ENTRY_CURRENT_WAVE_FACTS_MISMATCH"), `${direction}:reload:${field}:${value}`);
    assert.equal(validateFinalDecisionOutput(result).valid, true, `${direction}:reload:${field}:${value}`);
  }
}

for (const direction of ["LONG", "SHORT"]) {
  const terminal = zeroWaveClosedCampaign(direction);
  const baseline = buildFinalDecisionIntegrationShadow(completeInput(direction, { campaign: terminal }));
  assert.equal(baseline.campaign_quality, "CLOSED", `${direction}:zero-wave-closed`);
  const forgedState = {
    ...terminal.campaign,
    current_wave_id: "MW:TEST-USDT:1:W1",
    entry_trigger_time: NOW - 2_000,
    entry_trigger_price: 100,
  };
  const forged = withImmutableReceipt({ ...terminal, campaign: forgedState }, terminal.persistence.receipt_id, terminal.persistence.committed_ts);
  const result = buildFinalDecisionIntegrationShadow(completeInput(direction, { campaign: forged }));
  assert.equal(result.campaign_quality, "BLOCKED", `${direction}:zero-wave-forged-facts`);
  assert.ok(result.reason_codes.includes("TERMINAL_WITHOUT_WAVE_HAS_CURRENT_WAVE_FACTS"), `${direction}:zero-wave-forged-facts`);
  assert.equal(validateFinalDecisionOutput(result).valid, true, `${direction}:zero-wave-forged-facts`);
}

for (const direction of ["LONG", "SHORT"]) {
  const w2Impulse = secondWaveImpulseCampaign(direction);
  const baseline = buildFinalDecisionIntegrationShadow(completeInput(direction, { campaign: w2Impulse }));
  assert.equal(baseline.campaign_quality, "CLOSED", `${direction}:w2-impulse-baseline`);
  for (const baseStart of [null, w2Impulse.campaign.base_start + 1]) {
    const mutated = withImmutableReceipt({
      ...w2Impulse,
      campaign: { ...w2Impulse.campaign, base_start: baseStart },
    }, w2Impulse.persistence.receipt_id, w2Impulse.persistence.committed_ts);
    const result = buildFinalDecisionIntegrationShadow(completeInput(direction, { campaign: mutated }));
    assert.equal(result.campaign_quality, "BLOCKED", `${direction}:w2-impulse-base:${baseStart}`);
    assert.ok(result.reason_codes.includes("BASE_START_WAVE_COMPLETION_MISMATCH"), `${direction}:w2-impulse-base:${baseStart}`);
    assert.equal(validateFinalDecisionOutput(result).valid, true, `${direction}:w2-impulse-base:${baseStart}`);
  }

  const impossible = impossibleCrossAnchorCampaign(direction);
  const position = openPosition(direction, impossible);
  const origin = positionOriginCampaign(impossible, position);
  const result = buildFinalDecisionIntegrationShadow(completeInput(direction, {
    campaign: impossible,
    position,
    position_origin_campaign: origin,
    position_management_context: positionManagementContext(position, origin, "CLEAR"),
  }));
  assert.equal(result.campaign_quality, "BLOCKED", `${direction}:cross-anchor-counter-revision`);
  assert.ok(result.reason_codes.includes("WAVE_INDEX_EXCEEDS_REVISION_HISTORY"), `${direction}:cross-anchor-counter-revision`);
  assert.ok(result.reason_codes.includes("COMPLETED_WAVES_EXCEED_REVISION_HISTORY"), `${direction}:cross-anchor-counter-revision`);
  assert.notEqual(result.management_action, "HOLD", `${direction}:cross-anchor-counter-revision`);
  assert.equal(validateFinalDecisionOutput(result).valid, true, `${direction}:cross-anchor-counter-revision`);
}

for (const direction of ["LONG", "SHORT"]) {
  const inflated = campaign(direction, {
    state_revision: 102,
    observation_id: "OBS-102",
    history_truncated: true,
    history_anchor: {
      schema_version: "transition-history-anchor-v1",
      campaign_id: "MW:TEST-USDT:1",
      prior_phase: "ENTRY_CANDIDATE",
      prior_state_revision: 101,
      prefix_transition_count: 100,
      prior_observation_ts: NOW - 20 * 60_000,
      prefix_digest: "0123456789abcdef",
      receipt_id: "THA:INFLATED",
      persistence: {
        status: "CLOSED", immutable: true, verification_method: "D1_IMMUTABLE_RECEIPT",
        receipt_id: "THA:INFLATED", content_digest: "0123456789abcdef", committed_ts: NOW - 250,
      },
    },
    transition_history: [{
      from: "ENTRY_CANDIDATE", to: "ENTRY_TRIGGER", observed_ts: NOW - 10 * 60_000,
      transition_id: "TRANSITION-INFLATED-101", observation_id: "OBS-T3",
      from_state_revision: 101, to_state_revision: 102,
    }],
  });
  const result = buildFinalDecisionIntegrationShadow(completeInput(direction, { campaign: inflated }));
  assert.equal(result.campaign_quality, "BLOCKED", `${direction}:inflated-history`);
  assert.ok(result.reason_codes.includes("CAMPAIGN_PHASE_WAVE_REVISION_MISMATCH"), `${direction}:inflated-history`);
  assert.notEqual(result.entry_action, "SHADOW_ENTRY_ELIGIBLE", `${direction}:inflated-history`);
  assert.equal(validateFinalDecisionOutput(result).valid, true, `${direction}:inflated-history`);
}

for (const direction of ["LONG", "SHORT"]) {
  const entered = impulseCampaign(direction);
  const position = openPosition(direction, entered);
  const origin = positionOriginCampaign(entered, position);
  const closedTs = NOW - 1_000;
  const divergent = campaign(direction, {
    current_phase: "CLOSED",
    campaign_end: closedTs,
    wave_index: 0,
    completed_wave_count: 0,
    current_wave_id: null,
    entry_trigger_time: null,
    entry_trigger_price: null,
    impulse_start: null,
    impulse_start_price: null,
    state_revision: 4,
    observation_id: "DIVERGENT-CLOSE-O4",
    transition_history: [
      { from: "DISCOVERY", to: "PRE_IMPULSE_WATCH", observed_ts: NOW - 28 * 60_000, transition_id: "DC-T1", observation_id: "DC-O1", from_state_revision: 1, to_state_revision: 2 },
      { from: "PRE_IMPULSE_WATCH", to: "ENTRY_CANDIDATE", observed_ts: NOW - 20 * 60_000, transition_id: "DC-T2", observation_id: "DC-O2", from_state_revision: 2, to_state_revision: 3 },
      { from: "ENTRY_CANDIDATE", to: "CLOSED", observed_ts: closedTs, transition_id: "DC-T3", observation_id: "DIVERGENT-CLOSE-O4", from_state_revision: 3, to_state_revision: 4 },
    ],
    wave_ledger: [],
  });
  const result = buildFinalDecisionIntegrationShadow(completeInput(direction, {
    campaign: divergent,
    position,
    position_origin_campaign: origin,
    position_management_context: positionManagementContext(position, origin, "CLEAR"),
  }));
  assert.equal(result.campaign_quality, "CLOSED", `${direction}:divergent-campaign-is-individually-legal`);
  assert.equal(result.risk_state, "BLOCKED", `${direction}:divergent-origin-fork`);
  assert.equal(result.management_action, "NOT_EVALUATED", `${direction}:divergent-origin-fork`);
  assert.ok(result.reason_codes.includes("ORIGIN_CAMPAIGN_ENTRY_WAVE_NOT_PROVEN"), `${direction}:divergent-origin-fork`);
  assert.ok(result.reason_codes.includes("ORIGIN_CAMPAIGN_SAME_REVISION_FORK"), `${direction}:divergent-origin-fork`);
  assert.equal(validateFinalDecisionOutput(result).valid, true, `${direction}:divergent-origin-fork`);
}

for (const direction of ["LONG", "SHORT"]) {
  for (const [field, value] of [
    ["current_wave_id", null],
    ["current_wave_id", "MW:TEST-USDT:1:W999"],
    ["entry_trigger_time", null],
    ["impulse_start", null],
  ]) {
    const terminal = directlyClosedCampaign(direction);
    const mutatedState = { ...terminal.campaign, [field]: value };
    const resealed = withImmutableReceipt({
      ...terminal,
      campaign: mutatedState,
    }, terminal.persistence.receipt_id, terminal.persistence.committed_ts);
    const result = buildFinalDecisionIntegrationShadow(completeInput(direction, { campaign: resealed }));
    assert.equal(result.campaign_quality, "BLOCKED", `${direction}:${field}:${value}`);
    assert.ok(result.reason_codes.includes("TERMINAL_CURRENT_WAVE_FACTS_MISMATCH"), `${direction}:${field}:${value}`);
    assert.notEqual(result.entry_action, "SHADOW_ENTRY_ELIGIBLE", `${direction}:${field}:${value}`);
    assert.equal(validateFinalDecisionOutput(result).valid, true, `${direction}:${field}:${value}`);
  }
}

{
  const originCampaign = impulseCampaign("LONG");
  const position = openPosition("LONG", originCampaign);
  const origin = positionOriginCampaign(originCampaign, position);
  const management = positionManagementContext(position, origin);
  const malformedCurrent = distinctImpulseCampaign("LONG", "MW:TEST-USDT:UNRELATED-MALFORMED");
  malformedCurrent.campaign.impulse_start = null;
  malformedCurrent.campaign.impulse_start_price = null;
  const result = buildFinalDecisionIntegrationShadow(completeInput("LONG", {
    campaign: malformedCurrent,
    position,
    position_origin_campaign: origin,
    position_management_context: management,
  }));
  assert.equal(result.campaign_quality, "BLOCKED");
  assert.equal(result.data_quality, "BLOCKED");
  assert.equal(result.status, "SHADOW_EVALUATED", "unrelated candidate failure must not fail the independent management lane");
  assert.equal(result.management_action, "HOLD");
  assert.equal(result.management_intent, "HOLD_ALLOWED");
  assert.equal(validateFinalDecisionOutput(result).valid, true);
}

{
  const originCampaign = impulseCampaign("LONG");
  const position = openPosition("LONG", originCampaign);
  const origin = positionOriginCampaign(originCampaign, position);
  const management = positionManagementContext(position, origin);
  const shiftedEntryTs = originCampaign.campaign.entry_trigger_time + 60_000;
  const rewrittenState = {
    ...originCampaign.campaign,
    entry_trigger_time: shiftedEntryTs,
    transition_history: originCampaign.campaign.transition_history.map((transition) => (
      transition.to === "ENTRY_TRIGGER" ? { ...transition, observed_ts: shiftedEntryTs } : transition
    )),
    wave_ledger: originCampaign.campaign.wave_ledger.map((wave) => ({ ...wave, entry_trigger_time: shiftedEntryTs })),
  };
  const rewrittenCurrent = withImmutableReceipt({
    ...originCampaign,
    campaign: rewrittenState,
  }, "CMR:REWRITTEN-ENTRY-FACT", NOW - 100);
  const result = buildFinalDecisionIntegrationShadow(completeInput("LONG", {
    campaign: rewrittenCurrent,
    position,
    position_origin_campaign: origin,
    position_management_context: management,
  }));
  assert.equal(result.status, "FAIL_CLOSED");
  assert.equal(result.management_action, "NOT_EVALUATED");
  assert.ok(result.reason_codes.includes("ORIGIN_CAMPAIGN_ENTRY_FACT_REWRITE"));
  assert.equal(validateFinalDecisionOutput(result).valid, true);
}

{
  const originCampaign = impulseCampaign("LONG");
  const position = openPosition("LONG", originCampaign);
  const origin = positionOriginCampaign(originCampaign, position);
  const management = positionManagementContext(position, origin);
  const rolledBackCurrent = discoveryCampaign("LONG");
  const result = buildFinalDecisionIntegrationShadow(completeInput("LONG", {
    campaign: rolledBackCurrent,
    position,
    position_origin_campaign: origin,
    position_management_context: management,
  }));
  assert.equal(result.status, "FAIL_CLOSED");
  assert.equal(result.risk_state, "BLOCKED");
  assert.equal(result.management_action, "NOT_EVALUATED");
  assert.ok(result.reason_codes.includes("ORIGIN_CAMPAIGN_REVISION_ROLLBACK"));
  assert.equal(validateFinalDecisionOutput(result).valid, true);
}

{
  const originCampaign = impulseCampaign("LONG");
  const position = openPosition("LONG", originCampaign);
  const origin = positionOriginCampaign(originCampaign, position);
  const management = positionManagementContext(position, origin);
  const oppositeCurrent = distinctImpulseCampaign("SHORT", "MW:TEST-USDT:UNRELATED-SHORT");
  const result = buildFinalDecisionIntegrationShadow(completeInput("SHORT", {
    campaign: oppositeCurrent,
    position,
    position_origin_campaign: origin,
    position_management_context: management,
  }));
  assert.equal(result.direction, "SHORT");
  assert.equal(result.directional_quality, "CLOSED");
  assert.equal(result.risk_state, "CLEAR");
  assert.equal(result.management_action, "HOLD", "an unrelated opposite entry candidate is not an authoritative position exit assessment");
  assert.equal(result.management_intent, "HOLD_ALLOWED");
  assert.ok(result.reason_codes.includes("CANDIDATE_OPPOSITE_DIRECTION_INFORMATIONAL:POSITION_CONTEXT_AUTHORITATIVE"));
  assert.equal(validateFinalDecisionOutput(result).valid, true);
}

{
  const originCampaign = impulseCampaign("LONG");
  const position = openPosition("LONG", originCampaign);
  const origin = positionOriginCampaign(originCampaign, position);
  const management = positionManagementContext(position, origin);
  const rawCurrent = impulseCampaign("LONG");
  const currentCampaignId = "MW:TEST-USDT:CURRENT-2";
  const currentState = {
    ...rawCurrent.campaign,
    campaign_id: currentCampaignId,
    current_wave_id: `${currentCampaignId}:W1`,
    wave_ledger: rawCurrent.campaign.wave_ledger.map((wave) => ({ ...wave, wave_id: `${currentCampaignId}:W1` })),
  };
  const currentCampaign = withImmutableReceipt({
    ...rawCurrent,
    campaign: currentState,
    observation_id: currentState.observation_id,
    entry_window: null,
  }, "CMR:CURRENT-2", NOW - 100);
  const result = buildFinalDecisionIntegrationShadow(completeInput("LONG", {
    campaign: currentCampaign,
    position,
    position_origin_campaign: origin,
    position_management_context: management,
  }));
  assert.notEqual(currentState.campaign_id, origin.campaign_id);
  assert.equal(result.source_quality.position, "CLOSED");
  assert.equal(result.source_quality.position_origin_campaign, "CLOSED");
  assert.equal(result.source_quality.position_management, "CLOSED");
  assert.equal(result.management_action, "HOLD");
  assert.equal(result.management_intent, "HOLD_ALLOWED");
  assert.equal(validateFinalDecisionOutput(result).valid, true);
}

{
  const originCampaign = impulseCampaign("LONG");
  const position = openPosition("LONG", originCampaign);
  const result = buildFinalDecisionIntegrationShadow(completeInput("LONG", {
    campaign: originCampaign,
    position,
    position_management_context: null,
  }));
  assert.equal(result.source_quality.position_management, "INSUFFICIENT");
  assert.equal(result.management_action, "NOT_EVALUATED");
  assert.equal(result.management_intent, "NOT_EVALUATED");
  assert.ok(result.reason_codes.includes("POSITION_MANAGEMENT_CONTEXT_MISSING"));
  assert.equal(validateFinalDecisionOutput(result).valid, true);
}

{
  const originCampaign = impulseCampaign("LONG");
  const position = openPosition("LONG", originCampaign);
  const origin = positionOriginCampaign(originCampaign, position);
  const caution = positionManagementContext(position, origin, "CAUTION");
  const result = buildFinalDecisionIntegrationShadow(completeInput("LONG", {
    campaign: originCampaign,
    position,
    position_origin_campaign: origin,
    position_management_context: caution,
  }));
  assert.equal(result.risk_state, "CAUTION");
  assert.equal(result.management_action, "NOT_EVALUATED");
  assert.equal(result.management_intent, "NOT_EVALUATED");
  assert.ok(result.reason_codes.includes("MANAGEMENT_HOLD_BLOCKED:POSITION_RISK_CAUTION"));
  assert.ok(result.reason_codes.includes("MANAGEMENT_RISK_REASON:POSITION_RISK_CAUTION"));
  assert.equal(validateFinalDecisionOutput(result).valid, true);
}

{
  const originCampaign = impulseCampaign("LONG");
  const position = openPosition("LONG", originCampaign);
  const origin = positionOriginCampaign(originCampaign, position);
  const staleManagement = positionManagementContext(position, origin, "CLEAR", {
    source_ts: NOW - 61_000,
    available_ts: NOW - 60,
    max_age_ms: 60_000,
    valid_until_ts: NOW - 1_000,
  });
  const result = buildFinalDecisionIntegrationShadow(completeInput("LONG", {
    campaign: originCampaign,
    position,
    position_origin_campaign: origin,
    position_management_context: staleManagement,
  }));
  assert.equal(result.source_quality.position_management, "INSUFFICIENT");
  assert.equal(result.management_action, "NOT_EVALUATED");
  assert.ok(result.reason_codes.includes("POSITION_MANAGEMENT_CONTEXT_STALE"));
  assert.equal(validateFinalDecisionOutput(result).valid, true);
}

{
  const originCampaign = impulseCampaign("LONG");
  const position = openPosition("LONG", originCampaign);
  const origin = positionOriginCampaign(originCampaign, position);
  const invalidated = positionManagementContext(position, origin, "INVALIDATED");
  const malformedCurrent = distinctImpulseCampaign("SHORT", "MW:TEST-USDT:UNRELATED-BROKEN-FOR-EXIT");
  malformedCurrent.campaign.impulse_start = null;
  malformedCurrent.campaign.impulse_start_price = null;
  const result = buildFinalDecisionIntegrationShadow(completeInput("SHORT", {
    campaign: malformedCurrent,
    full_evidence: fullEvidence({ htx_execution_gate_closed: false }),
    position,
    position_origin_campaign: origin,
    position_management_context: invalidated,
  }));
  assert.equal(result.data_quality, "BLOCKED");
  assert.equal(result.risk_state, "INVALIDATED");
  assert.equal(result.management_intent, "EXIT_REQUIRED");
  assert.equal(result.management_action, "EXIT", "position context plus close-side safety gate is sufficient for the shadow exit action");
  assert.equal(result.management_execution_quality, "CLOSED");
  assert.equal(result.status, "SHADOW_EVALUATED");
  assert.equal(validateFinalDecisionOutput(result).valid, true);
}

{
  const originCampaign = impulseCampaign("LONG");
  const position = openPosition("LONG", originCampaign);
  const origin = positionOriginCampaign(originCampaign, position);
  const invalidated = positionManagementContext(position, origin, "INVALIDATED");
  const gate = executionGate();
  gate.close_sides.LONG = { ...gate.close_sides.LONG, status: "NOT_CLOSED", measurable: false };
  const unrelatedCurrent = distinctImpulseCampaign("SHORT", "MW:TEST-USDT:UNRELATED-EXIT-NO-FILL");
  unrelatedCurrent.campaign.impulse_start = null;
  unrelatedCurrent.campaign.impulse_start_price = null;
  const result = buildFinalDecisionIntegrationShadow(completeInput("LONG", {
    campaign: unrelatedCurrent,
    position,
    position_origin_campaign: origin,
    position_management_context: invalidated,
    execution_gate: gate,
  }));
  assert.equal(result.risk_state, "INVALIDATED");
  assert.equal(result.management_intent, "EXIT_REQUIRED");
  assert.equal(result.management_action, "NOT_EVALUATED");
  assert.equal(result.management_action_id, null);
  assert.equal(result.management_execution_quality, "INSUFFICIENT");
  assert.ok(result.reason_codes.includes("MANAGEMENT_EXIT_ACTION_FEASIBILITY_INSUFFICIENT"));
  assert.equal(validateFinalDecisionOutput(result).valid, true);
}

{
  const originCampaign = impulseCampaign("LONG");
  const position = openPosition("LONG", originCampaign);
  const origin = positionOriginCampaign(originCampaign, position);
  const lateEvidence = positionManagementContext(position, origin, "CLEAR", {
    available_ts: NOW - 500,
  });
  const result = buildFinalDecisionIntegrationShadow(completeInput("LONG", {
    campaign: originCampaign,
    position,
    position_origin_campaign: origin,
    position_management_context: lateEvidence,
  }));
  assert.equal(result.source_quality.position_management, "BLOCKED");
  assert.equal(result.management_action, "NOT_EVALUATED");
  assert.ok(result.reason_codes.includes("POSITION_MANAGEMENT_EVIDENCE_RECEIPT_NOT_AVAILABLE_AT_ASSESSMENT"));
  assert.equal(validateFinalDecisionOutput(result).valid, true);
}

{
  const originCampaign = impulseCampaign("LONG");
  const position = openPosition("LONG", originCampaign);
  const origin = positionOriginCampaign(originCampaign, position);
  const nonRiskEvidence = positionManagementContext(position, origin, "CLEAR", {
    evidence_receipt_ids: [position.persistence.receipt_id],
  });
  const result = buildFinalDecisionIntegrationShadow(completeInput("LONG", {
    campaign: originCampaign,
    position,
    position_origin_campaign: origin,
    position_management_context: nonRiskEvidence,
  }));
  assert.equal(result.source_quality.position_management, "BLOCKED");
  assert.equal(result.management_action, "NOT_EVALUATED");
  assert.ok(result.reason_codes.includes("POSITION_MANAGEMENT_RISK_EVIDENCE_RECEIPT_MISSING"));
  assert.equal(validateFinalDecisionOutput(result).valid, true);
}

{
  const originCampaign = impulseCampaign("LONG");
  const position = openPosition("LONG", originCampaign);
  const origin = positionOriginCampaign(originCampaign, position);
  const unboundManagement = positionManagementContext(position, origin, "CLEAR", {
    evidence_receipt_ids: ["UNBOUND:RISK:RECEIPT"],
  });
  const result = buildFinalDecisionIntegrationShadow(completeInput("LONG", {
    campaign: originCampaign,
    position,
    position_origin_campaign: origin,
    position_management_context: unboundManagement,
  }));
  assert.equal(result.source_quality.position_management, "BLOCKED");
  assert.equal(result.management_action, "NOT_EVALUATED");
  assert.ok(result.reason_codes.includes("POSITION_MANAGEMENT_EVIDENCE_RECEIPT_NOT_IN_INPUT_LINEAGE"));
  assert.equal(validateFinalDecisionOutput(result).valid, true);
}

{
  const originCampaign = impulseCampaign("LONG");
  const position = openPosition("LONG", originCampaign);
  const origin = positionOriginCampaign(originCampaign, position);
  const blockedFullEvidence = fullEvidence();
  blockedFullEvidence.source_registry.content_digest = "0000000000000000";
  const management = positionManagementContext(position, origin, "CLEAR");
  const result = buildFinalDecisionIntegrationShadow(completeInput("LONG", {
    campaign: originCampaign,
    full_evidence: blockedFullEvidence,
    position,
    position_origin_campaign: origin,
    position_management_context: management,
  }));
  assert.equal(result.source_quality.full_evidence, "BLOCKED");
  assert.equal(result.source_quality.position_management, "BLOCKED");
  assert.equal(result.management_action, "NOT_EVALUATED");
  assert.ok(result.reason_codes.includes("POSITION_MANAGEMENT_EVIDENCE_RECEIPT_NOT_IN_INPUT_LINEAGE"));
  assert.equal(validateFinalDecisionOutput(result).valid, true);
}

{
  const malformed = completeInput("LONG", { position: { state: "FLAT" } });
  const result = buildFinalDecisionIntegrationShadow(malformed);
  assert.equal(result.status, "FAIL_CLOSED");
  assert.equal(result.source_quality.position, "BLOCKED");
  assert.ok(result.reason_codes.includes("POSITION_SCHEMA_OR_RULES_UNSUPPORTED"));
  assert.equal(validateFinalDecisionOutput(result).valid, true, "malformed position must produce a valid fail-closed envelope");
}

{
  const originCampaign = impulseCampaign("LONG");
  const originalPosition = openPosition("LONG", originCampaign);
  const impossibleDecisionTs = NOW - 100;
  const position = withImmutableReceipt({
    ...originalPosition,
    entry_decision_observation_ts: impossibleDecisionTs,
    entry_decision_id: `FDI:${originalPosition.contract_code}:${impossibleDecisionTs}:${originalPosition.entry_decision_material_digest}`,
  }, originalPosition.persistence.receipt_id, NOW - 40);
  const result = buildFinalDecisionIntegrationShadow(completeInput("LONG", {
    campaign: originCampaign,
    position,
    position_origin_campaign: positionOriginCampaign(originCampaign, position),
  }));
  assert.equal(result.source_quality.position, "BLOCKED");
  assert.equal(result.management_action, "NOT_EVALUATED");
  assert.ok(result.reason_codes.includes("POSITION_LEDGER_PRECEDES_ENTRY_DECISION"));
  assert.equal(validateFinalDecisionOutput(result).valid, true);
}

{
  const originCampaign = impulseCampaign("LONG");
  const position = openPosition("LONG", originCampaign);
  const retrospectiveOrigin = positionOriginCampaign(originCampaign, position, {
    source_campaign_committed_ts: NOW - 150,
  });
  const result = buildFinalDecisionIntegrationShadow(completeInput("LONG", {
    campaign: originCampaign,
    position,
    position_origin_campaign: retrospectiveOrigin,
    position_management_context: null,
  }));
  assert.equal(result.source_quality.position_origin_campaign, "BLOCKED");
  assert.equal(result.management_action, "NOT_EVALUATED");
  assert.ok(result.reason_codes.includes("POSITION_ORIGIN_SOURCE_COMMIT_AFTER_ENTRY_DECISION"));
  assert.equal(validateFinalDecisionOutput(result).valid, true);
}

{
  const originCampaign = impulseCampaign("LONG");
  const position = openPosition("LONG", originCampaign);
  const origin = positionOriginCampaign(originCampaign, position);
  const management = positionManagementContext(position, origin);
  const rewrittenCurrent = impulseCampaign("SHORT");
  const result = buildFinalDecisionIntegrationShadow(completeInput("SHORT", {
    campaign: rewrittenCurrent,
    position,
    position_origin_campaign: origin,
    position_management_context: management,
  }));
  assert.equal(result.status, "FAIL_CLOSED");
  assert.equal(result.risk_state, "BLOCKED");
  assert.equal(result.management_action, "NOT_EVALUATED");
  assert.ok(result.reason_codes.includes("ORIGIN_CAMPAIGN_DIRECTION_REWRITE"));
  assert.equal(validateFinalDecisionOutput(result).valid, true);
}

{
  const longCampaign = impulseCampaign("LONG");
  const shortCampaign = impulseCampaign("SHORT");
  const long = buildFinalDecisionIntegrationShadow(completeInput("LONG", { campaign: longCampaign, position: openPosition("LONG", longCampaign) }));
  const short = buildFinalDecisionIntegrationShadow(completeInput("SHORT", { campaign: shortCampaign, position: openPosition("SHORT", shortCampaign) }));
  for (const field of ["risk_state", "management_action", "management_intent", "management_quality", "management_execution_quality"]) {
    assert.equal(short[field], long[field], `position-management LONG/SHORT mirror mismatch: ${field}`);
  }
  assert.equal(validateFinalDecisionOutput(long).valid, true);
  assert.equal(validateFinalDecisionOutput(short).valid, true);
}

for (const direction of ["LONG", "SHORT"]) {
  const originCampaign = impulseCampaign(direction);
  const position = openPosition(direction, originCampaign);
  const origin = positionOriginCampaign(originCampaign, position);
  const base = completeInput(direction);
  const riskEvidence = evidenceRow({
    evidence_id: `RISK-${direction}-UNCITED`,
    causal_family: "RISK_INVALIDATION",
    metric_semantics: "THESIS_INVALIDATION",
    correlation_group: `RISK-${direction}-CURRENT-ORIGIN`,
    source: "RISK_MODEL",
    venue: "HTX",
    metric: "thesis_invalidation",
    stance: direction,
    effect: "INVALIDATE",
    value: true,
    unit: "boolean",
    fact_ids: [`FACT-RISK-${direction}-UNCITED`],
  });
  const rows = [...base.decision_evidence, riskEvidence];
  const result = buildFinalDecisionIntegrationShadow(completeInput(direction, {
    campaign: originCampaign,
    decision_evidence: rows,
    evidence_registry: evidenceRegistry(rows),
    position,
    position_origin_campaign: origin,
    position_management_context: positionManagementContext(position, origin, "CLEAR"),
  }));
  assert.equal(result.source_quality.position_management, "CLOSED", direction);
  assert.equal(result.risk_state, "BLOCKED", direction);
  assert.equal(result.management_action, "NOT_EVALUATED", direction);
  assert.notEqual(result.management_intent, "HOLD_ALLOWED", direction);
  assert.equal(result.status, "FAIL_CLOSED", direction);
  assert.ok(result.reason_codes.includes("POSITION_MANAGEMENT_OMITS_AVAILABLE_SAME_ORIGIN_INVALIDATION"), direction);
  assert.ok(!result.reason_codes.includes("CANDIDATE_INVALIDATION_INFORMATIONAL:POSITION_CONTEXT_AUTHORITATIVE"), direction);
  assert.equal(validateFinalDecisionOutput(result).valid, true, direction);
}

for (const direction of ["LONG", "SHORT"]) {
  const originCampaign = impulseCampaign(direction);
  const position = openPosition(direction, originCampaign);
  const origin = positionOriginCampaign(originCampaign, position);
  const base = completeInput(direction);
  const registryOnlyInvalidation = evidenceRow({
    evidence_id: `REGISTRY-ONLY-RISK-${direction}`,
    causal_family: "RISK_INVALIDATION",
    metric_semantics: "THESIS_INVALIDATION",
    correlation_group: `REGISTRY-ONLY-RISK-${direction}`,
    source: "RISK_MODEL",
    venue: "HTX",
    metric: "thesis_invalidation",
    stance: direction,
    effect: "INVALIDATE",
    value: true,
    unit: "boolean",
    fact_ids: [`FACT-REGISTRY-ONLY-RISK-${direction}`],
  });
  const result = buildFinalDecisionIntegrationShadow(completeInput(direction, {
    campaign: originCampaign,
    evidence_registry: evidenceRegistry([...base.decision_evidence, registryOnlyInvalidation]),
    position,
    position_origin_campaign: origin,
    position_management_context: positionManagementContext(position, origin, "CLEAR"),
  }));
  assert.equal(result.data_quality, "BLOCKED", direction);
  assert.equal(result.independence_state, "BLOCKED", direction);
  assert.equal(result.risk_state, "BLOCKED", direction);
  assert.equal(result.management_action, "NOT_EVALUATED", direction);
  assert.notEqual(result.management_intent, "HOLD_ALLOWED", direction);
  assert.ok(result.reason_codes.includes("POSITION_MANAGEMENT_SAME_ORIGIN_EVIDENCE_INTEGRITY_BLOCKED"), direction);
  assert.equal(validateFinalDecisionOutput(result).valid, true, direction);
}

for (const direction of ["LONG", "SHORT"]) {
  const originCampaign = impulseCampaign(direction);
  const position = openPosition(direction, originCampaign);
  const origin = positionOriginCampaign(originCampaign, position);
  const base = completeInput(direction);
  const riskEvidence = evidenceRow({
    evidence_id: `RISK-${direction}-PARTIAL-PLANE`,
    causal_family: "RISK_INVALIDATION",
    metric_semantics: "THESIS_INVALIDATION",
    correlation_group: `RISK-${direction}-PARTIAL-PLANE`,
    source: "RISK_MODEL",
    venue: "HTX",
    metric: "thesis_invalidation",
    stance: direction,
    effect: "INVALIDATE",
    value: true,
    unit: "boolean",
    fact_ids: [`FACT-RISK-${direction}-PARTIAL-PLANE`],
  });
  const rows = [...base.decision_evidence, riskEvidence];
  const registry = evidenceRegistry(rows);
  registry.status = "NOT_CLOSED";
  const authenticPartialRegistry = resealEvidenceRegistry(registry);
  const result = buildFinalDecisionIntegrationShadow(completeInput(direction, {
    campaign: originCampaign,
    decision_evidence: rows,
    evidence_registry: authenticPartialRegistry,
    position,
    position_origin_campaign: origin,
    position_management_context: positionManagementContext(position, origin, "CLEAR"),
  }));
  assert.equal(result.source_quality.position_management, "CLOSED", direction);
  assert.equal(result.risk_state, "INSUFFICIENT", direction);
  assert.equal(result.management_action, "NOT_EVALUATED", direction);
  assert.notEqual(result.management_intent, "HOLD_ALLOWED", direction);
  assert.equal(result.status, "SHADOW_EVALUATED", direction);
  assert.ok(result.reason_codes.includes("POSITION_MANAGEMENT_SAME_ORIGIN_INVALIDATION_PLANE_INSUFFICIENT"), direction);
  assert.equal(validateFinalDecisionOutput(result).valid, true, direction);
}

for (const direction of ["LONG", "SHORT"]) {
  const originCampaign = impulseCampaign(direction);
  const position = openPosition(direction, originCampaign);
  const origin = positionOriginCampaign(originCampaign, position);
  const base = completeInput(direction);
  const riskEvidence = evidenceRow({
    evidence_id: `RISK-${direction}-AFTER-ASSESSMENT`,
    causal_family: "RISK_INVALIDATION",
    metric_semantics: "THESIS_INVALIDATION",
    correlation_group: `RISK-${direction}-AFTER-ASSESSMENT`,
    source: "RISK_MODEL",
    venue: "HTX",
    metric: "thesis_invalidation",
    stance: direction,
    effect: "INVALIDATE",
    value: true,
    unit: "boolean",
    fact_ids: [`FACT-RISK-${direction}-AFTER-ASSESSMENT`],
  });
  const rows = [...base.decision_evidence, riskEvidence];
  const registry = evidenceRegistry(rows);
  registry.persistence.committed_ts = NOW - 20;
  const laterCommittedRegistry = resealEvidenceRegistry(registry);
  const result = buildFinalDecisionIntegrationShadow(completeInput(direction, {
    campaign: originCampaign,
    decision_evidence: rows,
    evidence_registry: laterCommittedRegistry,
    position,
    position_origin_campaign: origin,
    position_management_context: positionManagementContext(position, origin, "CLEAR"),
  }));
  assert.equal(result.risk_state, "BLOCKED", direction);
  assert.equal(result.management_action, "NOT_EVALUATED", direction);
  assert.notEqual(result.management_intent, "HOLD_ALLOWED", direction);
  assert.ok(result.reason_codes.includes("POSITION_MANAGEMENT_PRECEDES_SAME_ORIGIN_RISK_EVIDENCE"), direction);
  assert.equal(validateFinalDecisionOutput(result).valid, true, direction);
}

{
  const originCampaign = impulseCampaign("LONG");
  const position = openPosition("LONG", originCampaign);
  const origin = positionOriginCampaign(originCampaign, position);
  const base = completeInput("LONG");
  const riskEvidence = evidenceRow({
    evidence_id: "RISK-LONG",
    causal_family: "RISK_INVALIDATION",
    metric_semantics: "THESIS_INVALIDATION",
    correlation_group: "RISK-LONG-THESIS",
    source: "RISK_MODEL",
    venue: "HTX",
    metric: "thesis_invalidation",
    stance: "LONG",
    effect: "INVALIDATE",
    value: true,
    unit: "boolean",
    fact_ids: ["FACT-RISK-LONG"],
  });
  const rows = [...base.decision_evidence, riskEvidence];
  const management = positionManagementContext(position, origin, "CLEAR", {
    evidence_receipt_ids: [base.evidence_registry.receipt_id],
  });
  const result = buildFinalDecisionIntegrationShadow(completeInput("LONG", {
    campaign: originCampaign,
    decision_evidence: rows,
    evidence_registry: evidenceRegistry(rows),
    position,
    position_origin_campaign: origin,
    position_management_context: management,
  }));
  assert.equal(result.source_quality.position_management, "BLOCKED");
  assert.equal(result.risk_state, "BLOCKED");
  assert.equal(result.management_action, "NOT_EVALUATED");
  assert.ok(result.reason_codes.includes("POSITION_MANAGEMENT_RISK_STATE_CONTRADICTS_CITED_INVALIDATION"));
  assert.equal(validateFinalDecisionOutput(result).valid, true);
}

{
  const originCampaign = impulseCampaign("LONG");
  const position = openPosition("LONG", originCampaign);
  const origin = positionOriginCampaign(originCampaign, position);
  const base = completeInput("LONG");
  const oppositeRiskEvidence = evidenceRow({
    evidence_id: "RISK-SHORT-ONLY",
    causal_family: "RISK_INVALIDATION",
    metric_semantics: "THESIS_INVALIDATION",
    correlation_group: "RISK-SHORT-THESIS",
    source: "RISK_MODEL",
    venue: "HTX",
    metric: "thesis_invalidation",
    stance: "SHORT",
    effect: "INVALIDATE",
    value: true,
    unit: "boolean",
    fact_ids: ["FACT-RISK-SHORT"],
  });
  const rows = [...base.decision_evidence, oppositeRiskEvidence];
  const management = positionManagementContext(position, origin, "INVALIDATED", {
    evidence_receipt_ids: [base.evidence_registry.receipt_id],
  });
  const result = buildFinalDecisionIntegrationShadow(completeInput("LONG", {
    campaign: originCampaign,
    decision_evidence: rows,
    evidence_registry: evidenceRegistry(rows),
    position,
    position_origin_campaign: origin,
    position_management_context: management,
  }));
  assert.equal(result.source_quality.position_management, "BLOCKED");
  assert.equal(result.risk_state, "BLOCKED");
  assert.equal(result.management_action, "NOT_EVALUATED");
  assert.ok(result.reason_codes.includes("POSITION_MANAGEMENT_RISK_EVIDENCE_RECEIPT_MISSING"));
  assert.equal(validateFinalDecisionOutput(result).valid, true);
}

{
  const entryCampaign = impulseCampaign("LONG");
  const warningCampaign = exhaustionWarningCampaign("LONG");
  const position = openPosition("LONG", entryCampaign);
  const origin = positionOriginCampaign(entryCampaign, position);
  const management = positionManagementContext(position, origin, "CLEAR");
  const result = buildFinalDecisionIntegrationShadow(completeInput("LONG", {
    campaign: warningCampaign,
    position,
    position_origin_campaign: origin,
    position_management_context: management,
  }));
  assert.equal(result.campaign_phase, "EXHAUSTION_WARNING");
  assert.equal(result.risk_state, "CAUTION");
  assert.equal(result.management_intent, "NOT_EVALUATED");
  assert.equal(result.management_action, "NOT_EVALUATED");
  assert.ok(result.reason_codes.includes("MANAGEMENT_HOLD_BLOCKED:RISK_CAUTION"));
  assert.equal(result.status, "SHADOW_EVALUATED");
  assert.equal(validateFinalDecisionOutput(result).valid, true);
}

{
  const entryCampaign = impulseCampaign("LONG");
  const warning = exhaustionWarningCampaign("LONG");
  const warningCampaign = withImmutableReceipt(
    warning,
    warning.persistence.receipt_id,
    NOW - 20,
  );
  const position = openPosition("LONG", entryCampaign);
  const origin = positionOriginCampaign(entryCampaign, position);
  const management = positionManagementContext(position, origin, "CLEAR");
  const result = buildFinalDecisionIntegrationShadow(completeInput("LONG", {
    campaign: warningCampaign,
    position,
    position_origin_campaign: origin,
    position_management_context: management,
  }));
  assert.equal(result.campaign_phase, "EXHAUSTION_WARNING");
  assert.equal(result.risk_state, "BLOCKED");
  assert.equal(result.management_action, "NOT_EVALUATED");
  assert.equal(result.status, "FAIL_CLOSED");
  assert.ok(result.reason_codes.includes("POSITION_MANAGEMENT_PRECEDES_ORIGIN_CAMPAIGN_STATE"));
  assert.equal(validateFinalDecisionOutput(result).valid, true);
}

{
  const relocked = campaign("LONG", {
    direction_at_detection: "DIRECTIONLESS_EVENT",
    direction_locked_ts: NOW - 31 * 60_000,
    direction_lock_source_ts: NOW - 32 * 60_000,
    direction_lock_available_ts: NOW - 31 * 60_000,
    direction_lock_mode: "PROSPECTIVE_AFTER_DIRECTIONLESS",
  });
  const result = buildFinalDecisionIntegrationShadow(completeInput("LONG", { campaign: relocked }));
  assert.ok(result.reason_codes.includes("DIRECTIONLESS_CAMPAIGN_DIRECTION_PROMOTION_FORBIDDEN"));
  assert.equal(result.direction, "INSUFFICIENT");
  assert.equal(result.directional_quality, "BLOCKED");
  assert.notEqual(result.entry_action, "SHADOW_ENTRY_ELIGIBLE");
}

for (const direction of ["LONG", "SHORT"]) {
  const campaignWithoutDetection = campaign(direction);
  delete campaignWithoutDetection.campaign.first_detected_time;
  const resealed = withImmutableReceipt(
    campaignWithoutDetection,
    campaignWithoutDetection.persistence.receipt_id,
    campaignWithoutDetection.persistence.committed_ts,
  );
  const result = buildFinalDecisionIntegrationShadow(completeInput(direction, { campaign: resealed }));
  assert.equal(result.campaign_quality, "BLOCKED", direction);
  assert.equal(result.status, "FAIL_CLOSED", direction);
  assert.notEqual(result.entry_action, "SHADOW_ENTRY_ELIGIBLE", direction);
  assert.ok(result.reason_codes.includes("INVALID_CAMPAIGN_TIMELINE"), direction);
  assert.equal(result.opportunity_latency.first_detected_ts, null, direction);
  assert.deepEqual(validateFinalDecisionOutput(result), { valid: true, errors: [] }, direction);
}

for (const direction of ["LONG", "SHORT"]) {
  const impulse = impulseCampaign(direction).campaign;
  const warningTs = NOW - 2 * 60_000;
  const edgeTs = NOW - 60_000;
  const branchConflated = campaign(direction, {
    ...impulse,
    current_phase: "EDGE_SPENT",
    exhaustion_warning_ts: warningTs,
    edge_spent_ts: edgeTs,
    transition_history: [{
      from: "EXHAUSTION_WARNING", to: "EDGE_SPENT", observed_ts: edgeTs,
      transition_id: "RETAINED-BRANCH-EDGE-T6", observation_id: "RETAINED-BRANCH-EDGE-O6",
      from_state_revision: 6, to_state_revision: 7,
    }],
    history_truncated: true,
    history_anchor: {
      schema_version: "transition-history-anchor-v1",
      campaign_id: impulse.campaign_id,
      prior_phase: "EXHAUSTION_WARNING",
      prior_state_revision: 6,
      prefix_transition_count: 5,
      prior_observation_ts: warningTs,
      prefix_digest: "0123456789abcdef",
      receipt_id: `THA:BRANCH-CONFLATION-${direction}`,
      persistence: {
        status: "CLOSED",
        immutable: true,
        verification_method: "D1_IMMUTABLE_RECEIPT",
        receipt_id: `THA:BRANCH-CONFLATION-${direction}`,
        content_digest: "0123456789abcdef",
        committed_ts: NOW - 180,
      },
    },
    wave_ledger: impulse.wave_ledger.map((wave) => ({
      ...wave,
      status: "TERMINATED",
      terminated_ts: warningTs,
      termination_observation_id: "FORGED-OMITTED-CLOSE-O5",
      termination_phase: "CLOSED",
    })),
    state_revision: 7,
    observation_id: "RETAINED-BRANCH-EDGE-O6",
  });
  const result = buildFinalDecisionIntegrationShadow(completeInput(direction, { campaign: branchConflated }));
  assert.equal(result.campaign_quality, "BLOCKED", direction);
  assert.equal(result.status, "FAIL_CLOSED", direction);
  assert.notEqual(result.entry_action, "SHADOW_ENTRY_ELIGIBLE", direction);
  assert.equal(result.management_action, "NOT_EVALUATED", direction);
  assert.ok(result.reason_codes.includes("WAVE_LEDGER_TERMINATION_PHASE_STATE_MISMATCH:1"), direction);
  assert.deepEqual(validateFinalDecisionOutput(result), { valid: true, errors: [] }, direction);
}

for (const direction of ["LONG", "SHORT"]) {
  const originEntryCampaign = campaign(direction);
  const position = openPosition(direction, originEntryCampaign);
  const origin = positionOriginCampaign(originEntryCampaign, position);
  const management = positionManagementContext(position, origin, "CLEAR");
  const forkedState = structuredClone(originEntryCampaign.campaign);
  forkedState.entry_trigger_price = direction === "LONG" ? 999 : 1;
  forkedState.wave_ledger[0].entry_trigger_price = forkedState.entry_trigger_price;
  const sameRevisionPriceFork = withImmutableReceipt({
    ...originEntryCampaign,
    campaign: forkedState,
  }, `CMR:SAME-REVISION-PRICE-FORK-${direction}`, originEntryCampaign.persistence.committed_ts);
  const result = buildFinalDecisionIntegrationShadow(completeInput(direction, {
    campaign: sameRevisionPriceFork,
    position,
    position_origin_campaign: origin,
    position_management_context: management,
  }));

  assert.equal(result.status, "FAIL_CLOSED", direction);
  assert.equal(result.risk_state, "BLOCKED", direction);
  assert.equal(result.management_action, "NOT_EVALUATED", direction);
  assert.equal(result.management_intent, "NOT_EVALUATED", direction);
  assert.ok(result.reason_codes.includes("ORIGIN_CAMPAIGN_ENTRY_FACT_REWRITE"), direction);
  assert.ok(result.reason_codes.includes("ORIGIN_CAMPAIGN_SAME_REVISION_FORK"), direction);
  assert.deepEqual(validateFinalDecisionOutput(result), { valid: true, errors: [] }, direction);
}

console.log(JSON.stringify({
  ok: true,
  suite: "final-decision-integration-lifecycle",
  assertions: "directionless protection; impossible/terminal states; distinct position origin; explicit HOLD receipt; EXIT intent feasibility; deterministic replay; restart prerequisites",
}));
