import assert from 'node:assert/strict';
import { buildFinalDecisionIntegrationShadow, validateFinalDecisionOutput } from '../src/final-decision-integration-engine.mjs';
import { NOW, completeInput, digest, fullRawDigest, withImmutableReceipt, FULL_REGISTRY_RECEIPT } from './final-decision-integration-fixtures.mjs';

function projection(row) {
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

function reseal(full) {
  const clone = structuredClone(full);
  delete clone.persistence;
  for (const row of clone.evidence_compact) row.source_payload_digest = fullRawDigest(row);
  const entries = clone.evidence_compact.map(projection).sort((a,b)=>a.source_observation_id.localeCompare(b.source_observation_id));
  const contentDigest = digest(entries);
  clone.source_registry = {
    ...clone.source_registry,
    receipt_id: FULL_REGISTRY_RECEIPT,
    content_digest: contentDigest,
    entries,
    persistence: {
      status:'CLOSED', receipt_id:FULL_REGISTRY_RECEIPT, content_digest:contentDigest,
      committed_ts:NOW-250, immutable:true, verification_method:'D1_IMMUTABLE_RECEIPT',
    },
  };
  return withImmutableReceipt(clone, `FEROW:${clone.contract}:${clone.snapshot_id}`, NOW-100);
}

function derivativeRow(input, metric='price_change_4h') {
  const row = input.full_evidence.evidence_compact.find((r)=>r.chain==='CROSS_EXCHANGE_DERIVATIVES');
  assert.ok(row);
  row.metric = metric;
  return row;
}

// Existing upstream producer contract: fresh 4h price evidence may declare 2h validity.
{
  const input = completeInput('LONG');
  const row = derivativeRow(input);
  row.source_ts = NOW - 60_000;
  row.available_ts = NOW - 30_000;
  row.max_age_sec = 2 * 60 * 60;
  row.valid_until_ts = row.source_ts + row.max_age_sec * 1000;
  input.full_evidence = reseal(input.full_evidence);
  const out = buildFinalDecisionIntegrationShadow(input);
  const valid = validateFinalDecisionOutput(out);
  assert.equal(valid.valid, true, valid.errors.join(','));
  assert.equal(out.entry_action, 'SHADOW_ENTRY_ELIGIBLE');
  assert.ok(!out.reason_codes.some((x)=>x.includes('RAW_EVIDENCE_CHAIN_FRESHNESS_POLICY_EXCEEDED:PRICE_CHANGE_4H')));
}

// Same producer window must fail when the factual observation itself is older than 2h.
{
  const input = completeInput('LONG');
  const row = derivativeRow(input);
  row.source_ts = NOW - (2 * 60 * 60 * 1000) - 1;
  row.available_ts = row.source_ts + 1000;
  row.max_age_sec = 2 * 60 * 60;
  row.valid_until_ts = row.source_ts + row.max_age_sec * 1000;
  input.full_evidence = reseal(input.full_evidence);
  const out = buildFinalDecisionIntegrationShadow(input);
  assert.notEqual(out.entry_action, 'SHADOW_ENTRY_ELIGIBLE');
  assert.ok(out.reason_codes.some((x)=>x.includes('REQUIRED_RAW_EVIDENCE_STALE_VALID_UNTIL:PRICE_CHANGE_4H') || x.includes('REQUIRED_RAW_EVIDENCE_STALE_BY_AGE:PRICE_CHANGE_4H')));
}

// Future availability remains anti-look-ahead blocked.
{
  const input = completeInput('LONG');
  const row = derivativeRow(input);
  row.source_ts = NOW - 60_000;
  row.available_ts = NOW + 1;
  row.max_age_sec = 2 * 60 * 60;
  row.valid_until_ts = row.source_ts + row.max_age_sec * 1000;
  input.full_evidence = reseal(input.full_evidence);
  const out = buildFinalDecisionIntegrationShadow(input);
  assert.notEqual(out.entry_action, 'SHADOW_ENTRY_ELIGIBLE');
  assert.ok(out.reason_codes.some((x)=>x.includes('RAW_EVIDENCE_LOOKAHEAD_AVAILABLE_TS:PRICE_CHANGE_4H')));
}

// Producer window longer than the pinned metric contract is not accepted.
{
  const input = completeInput('LONG');
  const row = derivativeRow(input);
  row.source_ts = NOW - 60_000;
  row.available_ts = NOW - 30_000;
  row.max_age_sec = 2 * 60 * 60 + 1;
  row.valid_until_ts = row.source_ts + row.max_age_sec * 1000;
  input.full_evidence = reseal(input.full_evidence);
  const out = buildFinalDecisionIntegrationShadow(input);
  assert.notEqual(out.entry_action, 'SHADOW_ENTRY_ELIGIBLE');
  assert.ok(out.reason_codes.some((x)=>x.includes('RAW_EVIDENCE_CHAIN_FRESHNESS_POLICY_EXCEEDED:PRICE_CHANGE_4H')));
}

console.log(JSON.stringify({
  ok:true,
  suite:'final-decision-upstream-freshness-contract',
  factual_upstream_max_age_sec:7200,
  metric_cap_sec:7200,
  fresh_producer_window_accepted:true,
  stale_blocked:true,
  future_blocked:true,
  overlong_policy_blocked:true,
}, null, 2));
