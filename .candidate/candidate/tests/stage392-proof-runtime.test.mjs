import assert from 'node:assert/strict';
import {
  buildOpportunityProofFromAdmissionWitness,
  buildDecisionEvidenceRegistry,
  prepareFullEvidenceProofBundle,
  sealFullEvidenceProofBundleAfterAck,
  stage392ProofSafetyEnvelope,
  DECISION_EVIDENCE_REGISTRY_RULES_VERSION,
  buildPositionManagementContextFromFullEvidence,
} from '../src/stage392-proof-runtime.mjs';
import { fullEvidence, opportunity, NOW, impulseCampaign, openPosition, positionOriginCampaign } from './final-decision-integration-fixtures.mjs';
import { digest } from '../src/upstream-proof-utils.mjs';

const contract = 'TEST-USDT';
const snapshot = 'S392:TEST-USDT:1';

// Opportunity proof must originate in a factual immutable D1 witness.
{
  const analysis = opportunity('LONG');
  const event = structuredClone(analysis.newest_event);
  event.independent_sample = true;
  const rawDigest = digest({ episode_revision: 1, event });
  const closed = buildOpportunityProofFromAdmissionWitness({
    analysis,
    witness: {
      event,
      event_id: event.event_id,
      persisted_ts: NOW - 100,
      control_group: false,
      independent_sample: true,
      directional_evaluation_eligible: true,
      d1_acknowledged: true,
      immutable_row: true,
      episode_revision: 1,
      raw_event_digest: rawDigest,
      source: 'ADMISSION_READ_EXISTING_IMMUTABLE_ROW',
    },
    snapshot_id: snapshot,
    observed_ts: NOW,
    receipt_committed_ts: NOW - 50,
  });
  assert.equal(closed.status, 'CLOSED');
  assert.equal(closed.proof.persistence.status, 'CLOSED');
  assert.equal(closed.proof.persistence.immutable, true);

  const noAck = buildOpportunityProofFromAdmissionWitness({
    analysis,
    witness: {
      event,
      event_id: event.event_id,
      persisted_ts: NOW - 100,
      independent_sample: true,
      directional_evaluation_eligible: true,
      d1_acknowledged: false,
      immutable_row: true,
      episode_revision: 1,
      raw_event_digest: rawDigest,
    },
    snapshot_id: snapshot,
    observed_ts: NOW,
    receipt_committed_ts: NOW - 50,
  });
  assert.equal(noAck.status, 'UNPROVEN');

  const mismatchedAnalysis = structuredClone(analysis);
  mismatchedAnalysis.newest_event.event_id = 'OTHER-EVENT';
  const mismatched = buildOpportunityProofFromAdmissionWitness({
    analysis: mismatchedAnalysis,
    witness: {
      event, event_id: event.event_id, persisted_ts: NOW - 100, control_group: false,
      independent_sample: true, directional_evaluation_eligible: true, d1_acknowledged: true,
      immutable_row: true, episode_revision: 1, raw_event_digest: rawDigest,
    },
    snapshot_id: snapshot, observed_ts: NOW, receipt_committed_ts: NOW - 50,
  });
  assert.equal(mismatched.status, 'FAIL_CLOSED');
  assert.equal(mismatched.reason, 'OPPORTUNITY_WITNESS_NOT_CURRENT_ANALYSIS_EVENT');

  const controlEvent = structuredClone(event);
  controlEvent.control_group = true;
  const controlDigest = digest({ episode_revision: 1, event: controlEvent });
  const controlRejected = buildOpportunityProofFromAdmissionWitness({
    analysis: { ...analysis, newest_event: controlEvent },
    witness: {
      event: controlEvent,
      event_id: controlEvent.event_id,
      persisted_ts: NOW - 100,
      control_group: true,
      independent_sample: true,
      directional_evaluation_eligible: true,
      d1_acknowledged: true,
      immutable_row: true,
      episode_revision: 1,
      raw_event_digest: controlDigest,
    },
    snapshot_id: snapshot,
    observed_ts: NOW,
    receipt_committed_ts: NOW - 50,
  });
  assert.equal(controlRejected.status, 'FAIL_CLOSED');
  assert.equal(controlRejected.reason, 'CONTROL_GROUP_CANNOT_BECOME_ADMISSION_PROOF');

  const nonIndependentEvent = structuredClone(event);
  nonIndependentEvent.independent_sample = false;
  const nonIndependentDigest = digest({ episode_revision: 1, event: nonIndependentEvent });
  const nonIndependentRejected = buildOpportunityProofFromAdmissionWitness({
    analysis: { ...analysis, newest_event: nonIndependentEvent },
    witness: {
      event: nonIndependentEvent,
      event_id: nonIndependentEvent.event_id,
      persisted_ts: NOW - 100,
      control_group: false,
      independent_sample: false,
      directional_evaluation_eligible: true,
      d1_acknowledged: true,
      immutable_row: true,
      episode_revision: 1,
      raw_event_digest: nonIndependentDigest,
    },
    snapshot_id: snapshot,
    observed_ts: NOW,
    receipt_committed_ts: NOW - 50,
  });
  assert.equal(nonIndependentRejected.status, 'FAIL_CLOSED');
  assert.equal(nonIndependentRejected.reason, 'NON_INDEPENDENT_SAMPLE_CANNOT_BECOME_ADMISSION_PROOF');
}

// Same factual source cannot gain a second identity merely by relabelling chain.
{
  const record = structuredClone(fullEvidence());
  const first = structuredClone(record.evidence_compact[0]);
  const second = structuredClone(first);
  first.chain = 'MARKET_STRENGTH_SPOT';
  second.chain = 'CROSS_EXCHANGE_DERIVATIVES';
  record.evidence_compact = [first, second];
  record.contract = contract;
  record.contract_code = contract;
  record.observed_ts = NOW;
  record.htx_execution_gate_closed = true;

  const prepared = prepareFullEvidenceProofBundle({
    record,
    contract_code: contract,
    snapshot_id: snapshot,
    observed_ts: NOW,
    shadow_decision: { eq: { status: 'OK' } },
    opportunity_proof: null,
    campaign_proof: null,
    position_proof: null,
    decision_evidence: [],
    committed_ts: NOW,
  });
  assert.equal(prepared.status, 'PREPARED_UNACKNOWLEDGED');
  const rows = prepared.bundle.full_evidence.evidence_compact;
  assert.equal(rows.length, 2);
  assert.equal(rows[0].source_observation_id, rows[1].source_observation_id);
  assert.equal(rows[0].source_fact_ids[0], rows[1].source_fact_ids[0]);

  // Prepared is never proof. Only exactly one factual insert ACK closes it.
  assert.equal(sealFullEvidenceProofBundleAfterAck(prepared, { status:'CLOSED', persisted:true, changes:0 }).status, 'FAIL_CLOSED');
  assert.equal(sealFullEvidenceProofBundleAfterAck(prepared, { status:'CLOSED', persisted:true, changes:2 }).status, 'FAIL_CLOSED');
  assert.equal(sealFullEvidenceProofBundleAfterAck(prepared, { status:'CLOSED', persisted:false, changes:1 }).status, 'FAIL_CLOSED');
  const sealed = sealFullEvidenceProofBundleAfterAck(prepared, { status:'CLOSED', persisted:true, changes:1 });
  assert.equal(sealed.status, 'CLOSED');

  // No authoritative Hard Veto producer is silently invented as CLEAR.
  assert.equal(sealed.bundle.hard_veto.status, 'UNKNOWN');
  assert.equal(sealed.bundle.hard_veto.authoritative, false);
  assert.equal(sealed.bundle.safety_gate_receipt.status, 'CLOSED');
}

// Missing upstream market/group identity and availability are never fabricated by
// the Stage 3.9.2 receipt builder. They remain null and strict FD usability fails closed.
{
  const record = structuredClone(fullEvidence());
  record.contract = contract;
  record.contract_code = contract;
  record.observed_ts = NOW;
  record.evidence_compact = [structuredClone(record.evidence_compact[0])];
  record.evidence_compact[0].primary_market_id = null;
  record.evidence_compact[0].independence_group = null;
  record.evidence_compact[0].available_ts = null;
  const prepared = prepareFullEvidenceProofBundle({
    record, contract_code: contract, snapshot_id: snapshot, observed_ts: NOW,
    shadow_decision: { eq: { status: 'OK' } }, opportunity_proof: null, campaign_proof: null,
    position_proof: null, decision_evidence: [], committed_ts: NOW,
  });
  const row = prepared.bundle.full_evidence.evidence_compact[0];
  assert.equal(row.primary_market_id, null);
  assert.equal(row.independence_group, null);
  assert.equal(row.available_ts, null);
}

// Registry v3 is deterministic and immutable even when currently empty.
{
  const { rows, registry } = buildDecisionEvidenceRegistry({
    decision_evidence: [],
    contract_code: contract,
    snapshot_id: snapshot,
    observed_ts: NOW,
    episode_id: 'EP:TEST:1',
    episode_revision: 1,
    committed_ts: NOW,
  });
  assert.deepEqual(rows, []);
  assert.equal(registry.rules_version, DECISION_EVIDENCE_REGISTRY_RULES_VERSION);
  assert.equal(registry.status, 'CLOSED');
  assert.equal(registry.persistence.status, 'CLOSED');
  assert.equal(registry.persistence.immutable, true);
}


// A closed SUPPORTING_RISK lane alone must never synthesize a CLEAR position
// assessment. Without a dedicated immutable invalidation/risk producer, HOLD/EXIT
// management remains fail-closed.
{
  const campaign = impulseCampaign('LONG');
  const position = openPosition('LONG', campaign);
  const origin = positionOriginCampaign(campaign, position);
  const record = structuredClone(fullEvidence());
  const prepared = prepareFullEvidenceProofBundle({
    record,
    contract_code: position.contract_code,
    snapshot_id: position.snapshot_id,
    observed_ts: NOW,
    shadow_decision: { eq: { status: 'OK' } },
    opportunity_proof: null,
    campaign_proof: campaign,
    position_proof: position,
    position_origin_campaign: origin,
    decision_evidence: [],
    committed_ts: NOW,
  });
  assert.equal(prepared.status, 'PREPARED_UNACKNOWLEDGED');
  assert.equal(prepared.bundle.position_management_context, null);
  assert.equal(buildPositionManagementContextFromFullEvidence({
    record,
    full_evidence_proof: prepared.bundle.full_evidence,
    position_proof: position,
    position_origin_campaign: origin,
    contract_code: position.contract_code,
    snapshot_id: position.snapshot_id,
    observed_ts: NOW,
    committed_ts: NOW,
  }), null);
}

assert.deepEqual(stage392ProofSafetyEnvelope(), {
  shadow_only: true,
  live_probability: null,
  live_signal: false,
  validated_signal: false,
  telegram_started: false,
  trading_execution: false,
  automatic_weight_tuning: false,
  strategy_weights_changed: false,
});

console.log(JSON.stringify({
  ok: true,
  suite: 'stage392-proof-runtime',
  exact_d1_insert_ack_required: true,
  duplicate_source_relabelling_collapses_identity: true,
  hard_veto_clear_not_synthesized: true,
  control_group_admission_relabel_blocked: true,
  non_independent_admission_blocked: true,
  witness_current_event_match_required: true,
  upstream_identity_not_fabricated: true,
  position_risk_clear_not_synthesized: true,
  decision_evidence_registry: DECISION_EVIDENCE_REGISTRY_RULES_VERSION,
}));
