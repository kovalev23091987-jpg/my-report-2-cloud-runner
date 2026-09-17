import { digest, immutableReceipt, safeFinite, safeInt, safeText } from './upstream-proof-utils.mjs';

export const MULTI_WAVE_DECISION_BRIDGE_VERSION = 'multi-wave-decision-bridge-v1';
export const MULTI_WAVE_DECISION_STATE_VERSION = 'multi-wave-decision-state-v1';
export const MULTI_WAVE_DECISION_RULES_VERSION = 'multi-wave-decision-state-rules-v1';

const ENTRY_PHASES = new Set(['ENTRY_TRIGGER', 'NEXT_IMPULSE_ENTRY']);
const TERMINAL_PHASES = new Set(['EDGE_SPENT', 'CLOSED']);

function phase(value) { return safeText(value).toUpperCase(); }

function observationId(campaignId, observedTs, eventId, stateRevision) {
  return `MWO:${digest([campaignId, observedTs, eventId, stateRevision])}`;
}

function transitionId(campaignId, from, to, observedTs, fromRevision, toRevision) {
  return `MWT:${digest([campaignId, from, to, observedTs, fromRevision, toRevision])}`;
}

function waveId(campaignId, index) { return `${campaignId}:W${index}`; }

function entryActionId(contract, campaignId, wave, entryTs) {
  return `FDE:${digest([contract, campaignId, wave, entryTs])}`;
}

function clone(value) { return value == null ? value : structuredClone(value); }

function currentWave(ledger, index) {
  return Array.isArray(ledger) ? ledger.find((row) => safeInt(row?.wave_index) === index) || null : null;
}

function normalizeDirection(value) {
  const v = phase(value);
  return ['LONG', 'SHORT'].includes(v) ? v : 'DIRECTIONLESS_EVENT';
}

function scenarioAnchorValidForState(anchor, state) {
  if (!anchor || typeof anchor !== 'object' || Array.isArray(anchor)) return false;
  if (anchor.schema_version !== 'multi-wave-entry-scenario-anchor-v1' || anchor.rules_version !== MULTI_WAVE_DECISION_RULES_VERSION.replace('decision-state-rules', 'campaign')) {
    // The operational producer uses the campaign rules string, validated below
    // by exact factual fields. Accept the current known campaign-v1 literal only.
    if (anchor.rules_version !== 'multi-wave-campaign-v1') return false;
  }
  const direction = normalizeDirection(anchor.direction);
  const stateDirection = normalizeDirection(state?.direction);
  const wave = safeInt(anchor.wave_index);
  const stateWave = safeInt(state?.wave_index);
  const entryTs = safeInt(anchor.entry_trigger_time);
  const stateEntryTs = safeInt(state?.entry_trigger_time);
  const sourceTs = safeInt(anchor.source_observation_ts);
  const lastTs = safeInt(state?.last_observed_ts);
  const entryPrice = safeFinite(anchor.entry_trigger_price);
  const stateEntryPrice = safeFinite(state?.entry_trigger_price);
  const invalidation = safeFinite(anchor.invalidation_price);
  const target = safeFinite(anchor.target_price);
  const move = safeFinite(anchor.target_move_pct);
  const baseLow = safeFinite(anchor.base_low);
  const baseHigh = safeFinite(anchor.base_high);
  const baseStart = safeInt(anchor.base_start);
  if (safeText(anchor.campaign_id) !== safeText(state?.campaign_id) || safeText(anchor.contract_code) !== safeText(state?.contract_code) ||
      !['LONG','SHORT'].includes(direction) || direction !== stateDirection || wave === null || wave !== stateWave || wave < 1 ||
      entryTs === null || entryTs !== stateEntryTs || sourceTs === null || lastTs === null || sourceTs > lastTs ||
      entryPrice === null || entryPrice !== stateEntryPrice || entryPrice <= 0 || baseStart === null || baseStart > entryTs ||
      baseLow === null || baseHigh === null || baseLow <= 0 || baseHigh <= 0 || baseLow > baseHigh ||
      invalidation === null || invalidation <= 0 || target === null || target <= 0 || move === null || move <= 0 || anchor.prospective_only !== true) return false;
  if (direction === 'LONG' && !(invalidation === baseLow && invalidation < entryPrice && target > entryPrice)) return false;
  if (direction === 'SHORT' && !(invalidation === baseHigh && invalidation > entryPrice && target < entryPrice)) return false;
  if (!['FIRST_IMPULSE_THRESHOLD','NEXT_IMPULSE_THRESHOLD'].includes(anchor.scenario_type)) return false;
  if (!ENTRY_PHASES.has(phase(anchor.source_phase))) return false;
  return true;
}

function buildGenesis({ result, opportunity, snapshotId, observedTs }) {
  const c = result?.campaign;
  const event = opportunity?.newest_event;
  if (!c || !event) return { ok: false, reason: 'GENESIS_INPUT_MISSING' };
  const direction = normalizeDirection(c.direction_at_detection);
  const eventDirection = normalizeDirection(event.direction_at_event ?? event.direction_at_detection);
  if (!['LONG', 'SHORT'].includes(direction) || eventDirection !== direction) {
    return { ok: false, reason: 'DIRECTION_NOT_PROSPECTIVELY_LOCKED' };
  }
  const campaignId = safeText(c.campaign_id);
  const contract = safeText(c.contract_code);
  const episodeId = safeText(event.episode_id);
  if (!campaignId || !contract || !episodeId) return { ok: false, reason: 'GENESIS_IDENTITY_MISSING' };
  const episodeRevision = safeInt(event.episode_revision) ?? 1;
  const start = safeInt(c.campaign_start);
  if (start === null) return { ok: false, reason: 'GENESIS_START_INVALID' };
  return {
    ok: true,
    state: {
      campaign_id: campaignId,
      schema_version: MULTI_WAVE_DECISION_STATE_VERSION,
      rules_version: MULTI_WAVE_DECISION_RULES_VERSION,
      contract_code: contract,
      campaign_start: start,
      first_detected_time: start,
      last_observed_ts: start,
      campaign_end: null,
      current_phase: 'DISCOVERY',
      direction,
      direction_at_detection: direction,
      direction_locked_ts: safeInt(event.direction_locked_ts ?? event.event_close_ts),
      direction_lock_observation_id: safeText(event.event_id),
      wave_index: 0,
      completed_wave_count: 0,
      current_wave_id: null,
      base_start: null,
      entry_trigger_time: null,
      entry_trigger_price: null,
      impulse_start: null,
      impulse_start_price: null,
      impulse_peak_price: null,
      impulse_peak_ts: null,
      exhaustion_warning_ts: null,
      edge_spent_ts: null,
      last_event_id: safeText(event.event_id),
      last_event_ts: safeInt(event.event_close_ts),
      origin_episode_id: episodeId,
      episode_revision: episodeRevision,
      state_revision: 1,
      observation_id: observationId(campaignId, start, safeText(event.event_id), 1),
      wave_facts_immutable: true,
      cas_persisted: true,
      wave_ledger_offset: 0,
      wave_ledger_anchor: null,
      transition_history: [],
      history_truncated: false,
      history_anchor: null,
      wave_ledger: [],
    },
    snapshotId,
    observedTs,
  };
}

function applyTransition(state, result, opportunity) {
  const out = clone(state);
  const c = result.campaign;
  const transition = result.transition;
  const targetPhase = phase(c.current_phase);
  const priorPhase = phase(out.current_phase);
  const eventId = safeText(c.last_event_id);
  const observedAt = safeInt(c.last_observed_ts);
  if (observedAt === null) return { ok: false, reason: 'OBSERVATION_TS_INVALID' };
  const priorObservedAt = safeInt(out.last_observed_ts);
  if (priorObservedAt !== null && observedAt < priorObservedAt) {
    return { ok: false, reason: 'OBSERVATION_TIME_REGRESSION' };
  }

  if (targetPhase !== priorPhase) {
    if (!transition || phase(transition.from) !== priorPhase || phase(transition.to) !== targetPhase) {
      return { ok: false, reason: 'TRANSITION_PROVENANCE_MISSING' };
    }
    const fromRevision = out.state_revision;
    const toRevision = fromRevision + 1;
    const obsId = observationId(out.campaign_id, observedAt, eventId, toRevision);
    out.transition_history = [
      ...(Array.isArray(out.transition_history) ? out.transition_history : []),
      {
        from: priorPhase,
        to: targetPhase,
        observed_ts: observedAt,
        transition_id: transitionId(out.campaign_id, priorPhase, targetPhase, observedAt, fromRevision, toRevision),
        observation_id: obsId,
        from_state_revision: fromRevision,
        to_state_revision: toRevision,
      },
    ].slice(-64);
    out.state_revision = toRevision;
    out.observation_id = obsId;
  } else {
    out.observation_id = observationId(out.campaign_id, observedAt, eventId, out.state_revision);
  }

  const immutableEvent = opportunity?.newest_event;
  const immutableEventId = safeText(immutableEvent?.event_id);
  const immutableEventCloseTs = safeInt(immutableEvent?.event_close_ts);
  if (!immutableEventId || immutableEventId !== eventId || immutableEventCloseTs === null) {
    return { ok: false, reason: 'IMMUTABLE_EVENT_LINEAGE_MISMATCH' };
  }
  if (immutableEventCloseTs > observedAt) {
    return { ok: false, reason: 'IMMUTABLE_EVENT_FROM_FUTURE' };
  }

  out.current_phase = targetPhase;
  out.last_observed_ts = observedAt;
  out.last_event_id = eventId;
  out.last_event_ts = immutableEventCloseTs;
  out.wave_index = Math.max(0, safeInt(c.wave_index) ?? out.wave_index ?? 0);
  out.completed_wave_count = Math.max(0, safeInt(c.completed_wave_count) ?? out.completed_wave_count ?? 0);

  const index = out.wave_index;
  let ledger = Array.isArray(out.wave_ledger) ? clone(out.wave_ledger) : [];
  if (index > 0) {
    const id = waveId(out.campaign_id, index);
    let wave = currentWave(ledger, index);
    if (!wave) {
      wave = {
        wave_id: id,
        wave_index: index,
        status: 'ENTRY_ACTIVE',
        immutable: true,
        entry_observation_id: null,
        entry_trigger_time: null,
        entry_trigger_price: null,
        impulse_start: null,
        impulse_start_price: null,
        impulse_observation_id: null,
        completed_ts: null,
        completion_observation_id: null,
      };
      ledger.push(wave);
    }
    const currentTransition = out.transition_history.at(-1);
    if (ENTRY_PHASES.has(targetPhase)) {
      wave.status = 'ENTRY_ACTIVE';
      wave.entry_trigger_time = safeInt(c.entry_trigger_time);
      wave.entry_trigger_price = safeFinite(c.entry_trigger_price);
      wave.entry_observation_id = currentTransition?.to === targetPhase ? currentTransition.observation_id : wave.entry_observation_id;
    } else if (targetPhase === 'IMPULSE') {
      wave.status = 'IMPULSE_ACTIVE';
      wave.entry_trigger_time = safeInt(c.entry_trigger_time ?? wave.entry_trigger_time);
      wave.entry_trigger_price = safeFinite(c.entry_trigger_price ?? wave.entry_trigger_price);
      wave.impulse_start = safeInt(c.impulse_start);
      wave.impulse_start_price = safeFinite(c.impulse_start_price);
      if (currentTransition?.to === 'IMPULSE') wave.impulse_observation_id = currentTransition.observation_id;
    } else if (targetPhase === 'RELOAD_BASE') {
      wave.status = 'COMPLETED';
      wave.completed_ts = observedAt;
      if (currentTransition?.to === 'RELOAD_BASE') wave.completion_observation_id = currentTransition.observation_id;
    } else if (['EXHAUSTION_WARNING', 'EDGE_SPENT', 'CLOSED'].includes(targetPhase) && wave.status !== 'COMPLETED') {
      wave.status = 'TERMINATED';
      wave.termination_phase = targetPhase === 'CLOSED' ? 'CLOSED' : 'EXHAUSTION_WARNING';
      wave.terminated_ts = observedAt;
      wave.termination_observation_id = currentTransition?.observation_id ?? out.observation_id;
    }
  }
  ledger.sort((a,b) => a.wave_index - b.wave_index);
  out.wave_ledger = ledger;
  out.current_wave_id = index > 0 ? waveId(out.campaign_id, index) : null;

  out.entry_trigger_time = index > 0 ? safeInt(c.entry_trigger_time) : null;
  out.entry_trigger_price = index > 0 ? safeFinite(c.entry_trigger_price) : null;
  if (ENTRY_PHASES.has(targetPhase)) {
    out.impulse_start = null;
    out.impulse_start_price = null;
    out.impulse_peak_price = null;
    out.impulse_peak_ts = null;
  } else {
    out.impulse_start = index > 0 ? safeInt(c.impulse_start) : null;
    out.impulse_start_price = index > 0 ? safeFinite(c.impulse_start_price) : null;
    out.impulse_peak_price = index > 0 ? safeFinite(c.impulse_peak_price) : null;
    out.impulse_peak_ts = index > 0 ? safeInt(c.impulse_peak_ts) : null;
  }

  const completed = ledger.filter((w) => w.status === 'COMPLETED');
  out.base_start = completed.length ? completed.at(-1).completed_ts : null;
  if (targetPhase === 'EXHAUSTION_WARNING' && out.exhaustion_warning_ts == null) out.exhaustion_warning_ts = observedAt;
  if (targetPhase === 'EDGE_SPENT' && out.edge_spent_ts == null) out.edge_spent_ts = observedAt;
  if (targetPhase === 'CLOSED') out.campaign_end = observedAt;
  return { ok: true, state: out };
}

function buildBridgeCandidate({
  multi_wave_result,
  opportunity,
  prior_bridge = null,
  prior_operational_campaign = null,
  snapshot_id,
  observed_ts,
} = {}) {
  const result = multi_wave_result;
  if (!result || result.status !== 'SHADOW_CAMPAIGN_EVALUATED' || !result.campaign) {
    return { status: 'FAIL_CLOSED', reason: 'MULTI_WAVE_RESULT_NOT_EVALUATED', bridge: null };
  }
  if (!prior_bridge && prior_operational_campaign) {
    return { status: 'LEGACY_UNPROVEN', reason: 'ACTIVE_CAMPAIGN_PREDATES_COMPATIBILITY_HARDENING', bridge: null };
  }

  let state;
  if (prior_bridge?.campaign) {
    // Never trust a caller merely because it supplied a receipt-shaped object.
    // Recompute the immutable digest/identity before any new state is derived;
    // otherwise a tampered D1 row could be re-sealed by the next cycle.
    const verifiedPrior = verifyStoredMultiWaveDecisionBridge(prior_bridge);
    if (!verifiedPrior.ok) {
      return { status: 'FAIL_CLOSED', reason: `PRIOR_CAMPAIGN_RECEIPT_INVALID:${verifiedPrior.reason}`, bridge: null };
    }
    state = clone(prior_bridge.campaign);
    if (state.campaign_id !== result.campaign.campaign_id) return { status: 'FAIL_CLOSED', reason: 'CAMPAIGN_ID_CHANGED', bridge: null };
    if (state.contract_code !== result.campaign.contract_code ||
        safeInt(state.campaign_start) !== safeInt(result.campaign.campaign_start) ||
        normalizeDirection(state.direction) !== normalizeDirection(result.campaign.direction) ||
        normalizeDirection(state.direction_at_detection) !== normalizeDirection(result.campaign.direction_at_detection)) {
      return { status: 'FAIL_CLOSED', reason: 'CAMPAIGN_OPERATIONAL_IDENTITY_MISMATCH', bridge: null };
    }
  } else {
    const genesis = buildGenesis({ result, opportunity, snapshotId: snapshot_id, observedTs: observed_ts });
    if (!genesis.ok) return { status: 'FAIL_CLOSED', reason: genesis.reason, bridge: null };
    state = genesis.state;
  }

  const applied = applyTransition(state, result, opportunity);
  if (!applied.ok) return { status: 'FAIL_CLOSED', reason: applied.reason, bridge: null };
  state = applied.state;

  // These two facts are candidates for the row being written. They are never
  // exposed as proven until sealMultiWaveDecisionBridgeAfterAck observes the
  // factual D1 ACK for that exact CAS write.
  state.cas_persisted = true;
  state.wave_facts_immutable = true;

  const observed = safeInt(observed_ts ?? state.last_observed_ts);
  if (observed === null || observed < state.last_observed_ts) return { status: 'FAIL_CLOSED', reason: 'OBSERVED_TS_INVALID', bridge: null };
  const snapshot = safeText(snapshot_id);
  if (!snapshot) return { status: 'FAIL_CLOSED', reason: 'SNAPSHOT_ID_MISSING', bridge: null };

  const chaseRisk = {
    status: 'CLOSED',
    active: result?.chase_risk?.active === true,
    contract_code: state.contract_code,
    snapshot_id: snapshot,
    source_ts: state.last_observed_ts,
    available_ts: state.last_observed_ts,
    max_age_ms: 60_000,
    valid_until_ts: state.last_observed_ts + 60_000,
    rules_version: 'chase-risk-state-v1',
  };

  let entryWindow = null;
  if (ENTRY_PHASES.has(state.current_phase)) {
    const entryTs = safeInt(state.entry_trigger_time);
    const wave = safeText(state.current_wave_id);
    if (entryTs === null || !wave) return { status: 'FAIL_CLOSED', reason: 'ENTRY_FACTS_MISSING', bridge: null };
    entryWindow = {
      status: 'CLOSED',
      contract_code: state.contract_code,
      snapshot_id: snapshot,
      campaign_id: state.campaign_id,
      wave_id: wave,
      campaign_state_revision: state.state_revision,
      observation_id: state.observation_id,
      action_id: entryActionId(state.contract_code, state.campaign_id, wave, entryTs),
      single_use: true,
      consumed: false,
      source_ts: entryTs,
      valid_until_ts: entryTs + 30 * 60_000,
      max_age_ms: 30 * 60_000,
      persistence: { status: 'CLOSED' },
    };
  }

  let entryScenarioAnchor = null;
  if (ENTRY_PHASES.has(state.current_phase)) {
    const retained = prior_bridge?.entry_scenario_anchor ?? null;
    if (retained && scenarioAnchorValidForState(retained, state)) {
      entryScenarioAnchor = clone(retained);
    } else {
      const enteredNow = phase(result?.transition?.to) === state.current_phase &&
        safeInt(result?.transition?.observed_ts) === safeInt(state.last_observed_ts);
      const candidateAnchor = result?.entry_scenario_anchor ?? null;
      if (enteredNow && scenarioAnchorValidForState(candidateAnchor, state)) {
        entryScenarioAnchor = clone(candidateAnchor);
      }
      // Never backfill a missing anchor during an already-active entry phase.
      // Existing/legacy campaigns remain analyzable but publication stays UNKNOWN.
    }
  }

  const material = {
    schema_version: MULTI_WAVE_DECISION_BRIDGE_VERSION,
    status: 'SHADOW_CAMPAIGN_EVALUATED',
    snapshot_id: snapshot,
    admitted_event_id: safeText(opportunity?.newest_event?.event_id),
    observation_id: state.observation_id,
    campaign: state,
    chase_risk: chaseRisk,
    entry_window: entryWindow,
    entry_scenario_anchor: entryScenarioAnchor,
  };
  const receiptId = `CMR:${state.campaign_id}:${state.state_revision}:${state.observation_id}`;
  const sealed = immutableReceipt(material, receiptId, state.last_observed_ts);
  return { status: 'PREPARED_UNACKNOWLEDGED', reason: null, bridge: sealed };
}


export function verifyStoredMultiWaveDecisionBridge(bridge) {
  if (!bridge || typeof bridge !== 'object' || Array.isArray(bridge)) {
    return { ok: false, reason: 'STORED_CAMPAIGN_RECEIPT_MISSING' };
  }
  const persistence = bridge.persistence;
  if (!persistence || typeof persistence !== 'object' || Array.isArray(persistence)) {
    return { ok: false, reason: 'STORED_CAMPAIGN_PERSISTENCE_MISSING' };
  }
  const campaign = bridge.campaign;
  if (!campaign || typeof campaign !== 'object' || Array.isArray(campaign)) {
    return { ok: false, reason: 'STORED_CAMPAIGN_STATE_MISSING' };
  }
  if (bridge.schema_version !== MULTI_WAVE_DECISION_BRIDGE_VERSION ||
      campaign.schema_version !== MULTI_WAVE_DECISION_STATE_VERSION ||
      campaign.rules_version !== MULTI_WAVE_DECISION_RULES_VERSION) {
    return { ok: false, reason: 'STORED_CAMPAIGN_SCHEMA_OR_RULES_INVALID' };
  }
  if (persistence.status !== 'CLOSED' || persistence.immutable !== true ||
      persistence.verification_method !== 'D1_IMMUTABLE_RECEIPT') {
    return { ok: false, reason: 'STORED_CAMPAIGN_RECEIPT_NOT_IMMUTABLE' };
  }
  const material = clone(bridge);
  delete material.persistence;
  const expectedDigest = digest(material);
  if (!/^[0-9a-f]{16}$/.test(safeText(persistence.content_digest)) ||
      persistence.content_digest !== expectedDigest) {
    return { ok: false, reason: 'STORED_CAMPAIGN_CONTENT_DIGEST_MISMATCH' };
  }
  if (bridge.entry_scenario_anchor != null && !scenarioAnchorValidForState(bridge.entry_scenario_anchor, campaign)) {
    return { ok: false, reason: 'STORED_ENTRY_SCENARIO_ANCHOR_INVALID' };
  }
  const expectedReceiptId = `CMR:${safeText(campaign.campaign_id)}:${safeInt(campaign.state_revision)}:${safeText(campaign.observation_id)}`;
  if (!safeText(campaign.campaign_id) || safeInt(campaign.state_revision) === null ||
      !safeText(campaign.observation_id) || safeText(persistence.receipt_id) !== expectedReceiptId) {
    return { ok: false, reason: 'STORED_CAMPAIGN_RECEIPT_ID_MISMATCH' };
  }
  const committedTs = safeInt(persistence.committed_ts);
  const lastObservedTs = safeInt(campaign.last_observed_ts);
  if (committedTs === null || lastObservedTs === null || committedTs !== lastObservedTs) {
    return { ok: false, reason: 'STORED_CAMPAIGN_COMMIT_TIME_MISMATCH' };
  }
  if (campaign.cas_persisted !== true || campaign.wave_facts_immutable !== true) {
    return { ok: false, reason: 'STORED_CAMPAIGN_PROOF_FLAGS_MISSING' };
  }
  return { ok: true, reason: null, content_digest: expectedDigest, receipt_id: expectedReceiptId };
}

export function prepareMultiWaveDecisionBridge(args = {}) {
  return buildBridgeCandidate(args);
}

export function sealMultiWaveDecisionBridgeAfterAck(prepared, persistence_ack = null) {
  if (!prepared || prepared.status !== 'PREPARED_UNACKNOWLEDGED' || !prepared.bridge) {
    return { status: 'FAIL_CLOSED', reason: 'BRIDGE_PREPARATION_MISSING', bridge: null };
  }
  const changes = safeInt(persistence_ack?.changes);
  if (!persistence_ack || persistence_ack.status !== 'CLOSED' || persistence_ack.cas_persisted !== true || changes !== 1) {
    return { status: 'FAIL_CLOSED', reason: 'PERSISTENCE_CAS_ACK_MISSING', bridge: null };
  }
  return { status: 'CLOSED', reason: null, bridge: clone(prepared.bridge) };
}

export function buildMultiWaveDecisionBridge({
  multi_wave_result,
  opportunity,
  prior_bridge = null,
  prior_operational_campaign = null,
  snapshot_id,
  observed_ts,
  persistence_ack = null,
} = {}) {
  const prepared = prepareMultiWaveDecisionBridge({
    multi_wave_result,
    opportunity,
    prior_bridge,
    prior_operational_campaign,
    snapshot_id,
    observed_ts,
  });
  if (prepared.status !== 'PREPARED_UNACKNOWLEDGED') return prepared;
  return sealMultiWaveDecisionBridgeAfterAck(prepared, persistence_ack);
}
