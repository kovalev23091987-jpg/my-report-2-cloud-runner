import assert from "node:assert/strict";
import { buildFinalDecisionIntegrationShadow, validateFinalDecisionOutput } from "../src/final-decision-integration-engine.mjs";
import {
  FULL_REGISTRY_RECEIPT,
  NOW,
  completeInput,
  decisionRawDigest,
  digest,
  evidenceRegistry,
  fullEvidence,
  fullRawDigest,
  hardVeto,
  executionGate,
  safetyGateReceipt,
  withImmutableReceipt,
} from "./final-decision-integration-fixtures.mjs";

function evaluate(input) {
  const output = buildFinalDecisionIntegrationShadow(input);
  const validation = validateFinalDecisionOutput(output);
  assert.equal(validation.valid, true, validation.errors.join(","));
  return output;
}

function replaceDecisionRow(input, index, patch) {
  const row = { ...input.decision_evidence[index], ...patch };
  row.source_payload_digest = decisionRawDigest(row);
  input.decision_evidence[index] = row;
  input.evidence_registry = evidenceRegistry(input.decision_evidence);
  return input;
}

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
    .sort((left, right) => left.source_observation_id.localeCompare(right.source_observation_id));
  const contentDigest = digest(entries);
  clone.source_registry = {
    ...clone.source_registry,
    receipt_id: FULL_REGISTRY_RECEIPT,
    content_digest: contentDigest,
    entries,
    persistence: {
      status: "CLOSED", receipt_id: FULL_REGISTRY_RECEIPT, content_digest: contentDigest,
      committed_ts: NOW - 250, immutable: true, verification_method: "D1_IMMUTABLE_RECEIPT",
    },
  };
  return withImmutableReceipt(clone, `FEROW:${clone.contract}:${clone.snapshot_id}`, NOW - 100);
}

{
  const input = replaceDecisionRow(completeInput("LONG"), 0, {
    source_ts: NOW + 1,
    available_ts: NOW + 2,
    valid_until_ts: NOW + 60_001,
  });
  const result = evaluate(input);
  assert.equal(result.status, "FAIL_CLOSED");
  assert.equal(result.data_quality, "BLOCKED");
  assert.equal(result.direction, "INSUFFICIENT");
  assert.ok(result.reason_codes.some((item) => item.includes("FUTURE_SOURCE_TS")));
}

{
  const input = replaceDecisionRow(completeInput("LONG"), 0, { available_ts: NOW + 1 });
  const result = evaluate(input);
  assert.equal(result.data_quality, "BLOCKED");
  assert.equal(result.direction, "INSUFFICIENT");
  assert.ok(result.reason_codes.some((item) => item.includes("LOOKAHEAD_AVAILABLE_TS")));
}

{
  const input = replaceDecisionRow(completeInput("LONG"), 0, {
    source_ts: NOW - 61_000,
    available_ts: NOW - 60_500,
    max_age_ms: 60_000,
    valid_until_ts: NOW - 1_000,
  });
  const result = evaluate(input);
  assert.equal(result.data_quality, "INSUFFICIENT");
  assert.equal(result.direction, "INSUFFICIENT");
  assert.notEqual(result.entry_action, "SHADOW_ENTRY_ELIGIBLE");
  assert.ok(result.reason_codes.some((item) => item.includes("STALE_EVIDENCE")));
}

{
  const input = replaceDecisionRow(completeInput("LONG"), 0, {
    status: "PARTIAL",
    eligible_for_decision: false,
    fact_complete: false,
  });
  const result = evaluate(input);
  assert.equal(result.data_quality, "INSUFFICIENT");
  assert.equal(result.direction, "INSUFFICIENT");
  assert.notEqual(result.entry_action, "SHADOW_ENTRY_ELIGIBLE");
  assert.equal(result.evidence_independence.causal_domains.PRICE_ACTION.state, "UNKNOWN");
}

{
  const input = completeInput("LONG");
  const raw = fullEvidence();
  raw.evidence_compact[0] = {
    ...raw.evidence_compact[0],
    status: "FUTURE",
    eligible_for_chain_closure: false,
    source_ts: NOW + 1,
    available_ts: NOW + 2,
    valid_until_ts: NOW + 300_001,
  };
  input.full_evidence = resealFullEvidence(raw);
  const result = evaluate(input);
  assert.equal(result.data_quality, "BLOCKED");
  assert.equal(result.entry_action, "REJECT");
  assert.ok(result.reason_codes.some((item) => item.includes("FUTURE")));
}

{
  const input = completeInput("LONG");
  const opportunity = structuredClone(input.opportunity);
  delete opportunity.persistence;
  opportunity.status = "STALE";
  input.opportunity = withImmutableReceipt(opportunity, "OPR:EVENT-1", NOW - 200);
  const result = evaluate(input);
  assert.equal(result.data_quality, "INSUFFICIENT", "closed child cannot improve stale parent");
  assert.equal(result.direction, "INSUFFICIENT");
}

{
  const input = completeInput("LONG");
  const raw = fullEvidence();
  raw.evidence_compact[0] = { ...raw.evidence_compact[0], eligible_for_chain_closure: false };
  input.full_evidence = resealFullEvidence(raw);
  const result = evaluate(input);
  assert.equal(result.data_quality, "INSUFFICIENT");
  assert.ok(result.reason_codes.includes("WEIGHTED_CHAIN_NOT_STRICTLY_CLOSED:CROSS_EXCHANGE_DERIVATIVES"));
}

{
  const input = completeInput("LONG");
  const raw = fullEvidence();
  raw.evidence_compact[1] = {
    ...raw.evidence_compact[1], status: "CONFLICT", eligible_for_chain_closure: false,
  };
  input.full_evidence = resealFullEvidence(raw);
  const result = evaluate(input);
  assert.equal(result.data_quality, "BLOCKED");
  assert.ok(result.reason_codes.some((item) => item.startsWith("RAW_EVIDENCE_CONFLICT")));
}

{
  const veto = hardVeto({
    source_ts: NOW - 61_000,
    available_ts: NOW - 60_500,
    max_age_ms: 60_000,
    valid_until_ts: NOW - 1_000,
  });
  const gate = executionGate();
  const result = evaluate(completeInput("LONG", {
    hard_veto: veto,
    execution_gate: gate,
    safety_gate_receipt: safetyGateReceipt(veto, gate),
  }));
  assert.equal(result.hard_veto_state, "INSUFFICIENT");
  assert.notEqual(result.entry_action, "SHADOW_ENTRY_ELIGIBLE");
}

for (const direction of ["LONG", "SHORT"]) {
  const input = completeInput(direction);
  input.observed_ts = NOW + 21 * 60_000;
  const result = evaluate(input);
  assert.equal(result.campaign_quality, "INSUFFICIENT", direction);
  assert.equal(result.timing_state, "INSUFFICIENT", direction);
  assert.equal(result.status, "FAIL_CLOSED", direction);
  assert.notEqual(result.entry_action, "SHADOW_ENTRY_ELIGIBLE", direction);
}

console.log(JSON.stringify({
  ok: true,
  suite: "final-decision-integration-temporal",
  assertions: "source/availability anti-look-ahead; stale/partial preservation; parent dominance; full-evidence conflict; stale veto fail-closed",
}));
