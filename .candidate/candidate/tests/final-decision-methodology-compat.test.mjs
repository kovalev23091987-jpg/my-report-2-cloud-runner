import assert from 'node:assert/strict';
import {
  buildFinalDecisionIntegrationShadow,
  validateFinalDecisionOutput,
} from '../src/final-decision-integration-engine.mjs';
import {
  FULL_REGISTRY_RECEIPT,
  NOW,
  completeInput,
  digest,
  fullRawDigest,
  withImmutableReceipt,
} from './final-decision-integration-fixtures.mjs';

function fullRegistryProjection(row) {
  return {
    chain: String(row.chain).toUpperCase(),
    source_observation_id: row.source_observation_id,
    source_payload_digest: row.source_payload_digest,
    source: row.source,
    venue: row.venue,
    metric: row.metric,
    source_ts: row.source_ts,
    available_ts: row.available_ts,
    valid_until_ts: row.valid_until_ts,
    max_age_sec: row.max_age_sec,
    producer_rules_version: row.producer_rules_version,
    safety_gate_receipt_id: row.safety_gate_receipt_id || null,
  };
}

function resealFullEvidence(full) {
  const clone = structuredClone(full);
  delete clone.persistence;
  for (const row of clone.evidence_compact) row.source_payload_digest = fullRawDigest(row);
  const entries = clone.evidence_compact.map(fullRegistryProjection)
    .sort((a, b) => a.source_observation_id.localeCompare(b.source_observation_id));
  const contentDigest = digest(entries);
  clone.source_registry = {
    ...clone.source_registry,
    receipt_id: FULL_REGISTRY_RECEIPT,
    content_digest: contentDigest,
    entries,
    persistence: {
      status: 'CLOSED', receipt_id: FULL_REGISTRY_RECEIPT, content_digest: contentDigest,
      committed_ts: NOW - 250, immutable: true, verification_method: 'D1_IMMUTABLE_RECEIPT',
    },
  };
  return withImmutableReceipt(clone, `FEROW:${clone.contract}:${clone.snapshot_id}`, NOW - 100);
}

function evaluate(input) {
  const output = buildFinalDecisionIntegrationShadow(input);
  const validation = validateFinalDecisionOutput(output);
  assert.equal(validation.valid, true, validation.errors.join(','));
  return output;
}

function markChainMissing(input, chain) {
  input.full_evidence.chain_status[chain] = { chain_closed: false };
  if (!input.full_evidence.missing_weighted_chains.includes(chain)) input.full_evidence.missing_weighted_chains.push(chain);
  for (const row of input.full_evidence.evidence_compact) {
    if (row.chain !== chain) continue;
    row.status = 'NOT_CLOSED';
    row.eligible_for_chain_closure = false;
    row.value = null;
    row.coverage_pct = 0;
  }
  input.full_evidence.data_quality.status = 'PARTIAL';
  input.full_evidence = resealFullEvidence(input.full_evidence);
  return input;
}

{
  const baseline = evaluate(completeInput('LONG'));
  assert.equal(baseline.entry_action, 'SHADOW_ENTRY_ELIGIBLE');
}

{
  const input = completeInput('LONG');
  markChainMissing(input, 'SMART_MONEY_ONCHAIN');
  markChainMissing(input, 'SUPPORTING_RISK');
  const output = evaluate(input);
  assert.equal(output.status, 'SHADOW_EVALUATED');
  assert.equal(output.entry_action, 'SHADOW_ENTRY_ELIGIBLE');
  assert.equal(output.data_quality, 'CLOSED');
  assert.ok(output.reason_codes.includes('DECLARED_MISSING_CHAIN:SMART_MONEY_ONCHAIN'));
  assert.ok(output.reason_codes.includes('DECLARED_MISSING_CHAIN:SUPPORTING_RISK'));
  assert.ok(output.explainability.missing_or_unusable.some((x) => x.includes('SMART_MONEY_ONCHAIN')));
}

{
  const input = completeInput('LONG');
  markChainMissing(input, 'MARKET_STRENGTH_SPOT');
  const output = evaluate(input);
  assert.notEqual(output.entry_action, 'SHADOW_ENTRY_ELIGIBLE');
  assert.equal(output.data_quality, 'INSUFFICIENT');
  assert.ok(output.reason_codes.some((x) => x.includes('WEIGHTED_CHAIN_NOT_STRICTLY_CLOSED:MARKET_STRENGTH_SPOT')));
}

{
  const input = completeInput('LONG');
  const row = input.full_evidence.evidence_compact.find((r) => r.chain === 'SMART_MONEY_ONCHAIN');
  row.status = 'FUTURE';
  row.eligible_for_chain_closure = false;
  row.source_ts = NOW + 1;
  row.available_ts = NOW + 2;
  row.valid_until_ts = NOW + 300001;
  input.full_evidence.data_quality.status = 'PARTIAL';
  input.full_evidence = resealFullEvidence(input.full_evidence);
  const output = evaluate(input);
  assert.notEqual(output.entry_action, 'SHADOW_ENTRY_ELIGIBLE');
  assert.equal(output.data_quality, 'BLOCKED');
  assert.ok(output.reason_codes.some((x) => x.includes('RAW_EVIDENCE_FUTURE')));
}

console.log(JSON.stringify({
  ok: true,
  suite: 'final-decision-methodology-compat',
  optional_supporting_gaps_do_not_auto_block: true,
  core_chain_gap_blocks: true,
  optional_future_data_still_blocks: true,
}, null, 2));
