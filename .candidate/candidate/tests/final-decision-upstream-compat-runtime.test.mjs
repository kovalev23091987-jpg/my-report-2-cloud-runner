import assert from 'node:assert/strict';
import { completeInput } from './final-decision-integration-fixtures.mjs';
import { evaluateFinalDecisionUpstreamCompatibility } from '../src/final-decision-upstream-compat-runtime.mjs';

const proven = completeInput('LONG');
const ready = evaluateFinalDecisionUpstreamCompatibility({
  contract_code: proven.contract_code,
  snapshot_id: proven.snapshot_id,
  observed_ts: proven.observed_ts,
  full_evidence: proven.full_evidence,
  opportunity: proven.opportunity,
  multi_wave: proven.campaign,
  decision_evidence: proven.decision_evidence,
  evidence_registry: proven.evidence_registry,
  hard_veto: proven.hard_veto,
  execution_gate: proven.execution_gate,
  safety_gate_receipt: proven.safety_gate_receipt,
  position: proven.position,
});
assert.equal(ready.status, 'READY_FOR_FINAL_DECISION_SHADOW');
assert.equal(ready.ready, true);
assert.equal(ready.decision.status, 'SHADOW_EVALUATED');
assert.equal(ready.decision.entry_action, 'SHADOW_ENTRY_ELIGIBLE');
assert.equal(ready.decision.execution_authorized, false);
assert.equal(ready.decision.telegram_eligible, false);
assert.equal(ready.decision.live_probability, null);

const missingCas = structuredClone(proven);
delete missingCas.campaign.campaign.state_revision;
const blockedCas = evaluateFinalDecisionUpstreamCompatibility({
  contract_code: missingCas.contract_code,
  snapshot_id: missingCas.snapshot_id,
  observed_ts: missingCas.observed_ts,
  full_evidence: missingCas.full_evidence,
  opportunity: missingCas.opportunity,
  multi_wave: missingCas.campaign,
  decision_evidence: missingCas.decision_evidence,
  evidence_registry: missingCas.evidence_registry,
  hard_veto: missingCas.hard_veto,
  execution_gate: missingCas.execution_gate,
  safety_gate_receipt: missingCas.safety_gate_receipt,
  position: missingCas.position,
});
assert.equal(blockedCas.status, 'FAIL_CLOSED');
assert.notEqual(blockedCas.decision?.entry_action, 'SHADOW_ENTRY_ELIGIBLE');

const tamperedReceipt = structuredClone(proven);
tamperedReceipt.campaign.persistence.content_digest = '0000000000000000';
const blockedReceipt = evaluateFinalDecisionUpstreamCompatibility({
  contract_code: tamperedReceipt.contract_code,
  snapshot_id: tamperedReceipt.snapshot_id,
  observed_ts: tamperedReceipt.observed_ts,
  full_evidence: tamperedReceipt.full_evidence,
  opportunity: tamperedReceipt.opportunity,
  multi_wave: tamperedReceipt.campaign,
  decision_evidence: tamperedReceipt.decision_evidence,
  evidence_registry: tamperedReceipt.evidence_registry,
  hard_veto: tamperedReceipt.hard_veto,
  execution_gate: tamperedReceipt.execution_gate,
  safety_gate_receipt: tamperedReceipt.safety_gate_receipt,
  position: tamperedReceipt.position,
});
assert.equal(blockedReceipt.status, 'FAIL_CLOSED');
assert.notEqual(blockedReceipt.decision?.entry_action, 'SHADOW_ENTRY_ELIGIBLE');

console.log(JSON.stringify({
  ok: true,
  suite: 'final-decision-upstream-compat-runtime',
  ready_status: ready.status,
  missing_cas_status: blockedCas.status,
  tampered_receipt_status: blockedReceipt.status,
  safety: ready.safety,
}, null, 2));
