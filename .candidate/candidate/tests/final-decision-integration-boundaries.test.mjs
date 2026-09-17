import assert from "node:assert/strict";

import {
  buildFinalDecisionIntegrationShadow,
  validateFinalDecisionOutput,
} from "../src/final-decision-integration-engine.mjs";
import {
  toFinalDecisionIntegrationRecord,
  validateFinalDecisionIntegrationRecord,
} from "../src/final-decision-integration-runtime.mjs";
import {
  NOW,
  campaign,
  completeInput,
  digest,
  fullEvidence,
  fullRawDigest,
  secondWaveCampaign,
  stableJson,
  withImmutableReceipt,
} from "./final-decision-integration-fixtures.mjs";

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

function longCampaignWithWaves(waveCount, { retainWaveSuffix = false } = {}) {
  const campaignId = "MW:TEST-USDT:BOUNDARY";
  const start = NOW - 3_000_000;
  const transitions = [];
  let cursor = start;
  let revision = 1;
  const add = (from, to) => {
    cursor += 20_000;
    const number = transitions.length + 1;
    const row = {
      from,
      to,
      observed_ts: cursor,
      transition_id: `BOUNDARY-T${number}`,
      observation_id: `BOUNDARY-O${number}`,
      from_state_revision: revision,
      to_state_revision: revision + 1,
    };
    transitions.push(row);
    revision += 1;
    return row;
  };

  add("DISCOVERY", "PRE_IMPULSE_WATCH");
  add("PRE_IMPULSE_WATCH", "ENTRY_CANDIDATE");
  const firstEntry = add("ENTRY_CANDIDATE", "ENTRY_TRIGGER");
  const ledger = [];
  let entry = firstEntry;
  let latestCompletion = null;

  for (let waveIndex = 1; waveIndex <= waveCount; waveIndex += 1) {
    const impulse = add(waveIndex === 1 ? "ENTRY_TRIGGER" : "NEXT_IMPULSE_ENTRY", "IMPULSE");
    if (waveIndex === waveCount) {
      ledger.push({
        wave_id: `${campaignId}:W${waveIndex}`,
        wave_index: waveIndex,
        status: "IMPULSE_ACTIVE",
        immutable: true,
        entry_observation_id: entry.observation_id,
        entry_trigger_time: entry.observed_ts,
        entry_trigger_price: 100 + waveIndex,
        impulse_observation_id: impulse.observation_id,
        impulse_start: impulse.observed_ts,
        impulse_start_price: 101 + waveIndex,
        completed_ts: null,
      });
      break;
    }
    const completion = add("IMPULSE", "RELOAD_BASE");
    latestCompletion = completion;
    ledger.push({
      wave_id: `${campaignId}:W${waveIndex}`,
      wave_index: waveIndex,
      status: "COMPLETED",
      immutable: true,
      entry_observation_id: entry.observation_id,
      entry_trigger_time: entry.observed_ts,
      entry_trigger_price: 100 + waveIndex,
      impulse_observation_id: impulse.observation_id,
      impulse_start: impulse.observed_ts,
      impulse_start_price: 101 + waveIndex,
      completion_observation_id: completion.observation_id,
      completed_ts: completion.observed_ts,
    });
    add("RELOAD_BASE", "NEXT_IMPULSE_WATCH");
    entry = add("NEXT_IMPULSE_WATCH", "NEXT_IMPULSE_ENTRY");
  }

  const retained = transitions.slice(-64);
  const omitted = transitions.length - retained.length;
  const historyAnchor = omitted > 0 ? {
    schema_version: "transition-history-anchor-v1",
    campaign_id: campaignId,
    prior_phase: transitions[omitted - 1].to,
    prior_state_revision: transitions[omitted - 1].to_state_revision,
    prior_observation_ts: transitions[omitted - 1].observed_ts,
    prefix_transition_count: omitted,
    prefix_digest: "0123456789abcdef",
    receipt_id: `THA:${campaignId}:${omitted}`,
    persistence: {
      status: "CLOSED",
      immutable: true,
      verification_method: "D1_IMMUTABLE_RECEIPT",
      receipt_id: `THA:${campaignId}:${omitted}`,
      content_digest: "0123456789abcdef",
      committed_ts: NOW - 200,
    },
  } : null;
  const current = ledger.at(-1);
  const retainedLedger = retainWaveSuffix ? ledger.slice(-32) : ledger;
  const waveLedgerOffset = ledger.length - retainedLedger.length;
  const waveLedgerAnchor = waveLedgerOffset > 0 ? {
    schema_version: "wave-ledger-anchor-v1",
    campaign_id: campaignId,
    completed_wave_count: waveLedgerOffset,
    last_wave_id: `${campaignId}:W${waveLedgerOffset}`,
    last_completed_ts: ledger[waveLedgerOffset - 1].completed_ts,
    prefix_digest: "fedcba9876543210",
    receipt_id: `WLA:${campaignId}:${waveLedgerOffset}`,
    persistence: {
      status: "CLOSED",
      immutable: true,
      verification_method: "D1_IMMUTABLE_RECEIPT",
      receipt_id: `WLA:${campaignId}:${waveLedgerOffset}`,
      content_digest: "fedcba9876543210",
      committed_ts: NOW - 200,
    },
  } : null;
  return campaign("LONG", {
    campaign_id: campaignId,
    campaign_start: start,
    first_detected_time: start,
    last_observed_ts: NOW - 500,
    current_phase: "IMPULSE",
    wave_index: waveCount,
    completed_wave_count: waveCount - 1,
    current_wave_id: current.wave_id,
    entry_trigger_time: current.entry_trigger_time,
    entry_trigger_price: current.entry_trigger_price,
    impulse_start: current.impulse_start,
    impulse_start_price: current.impulse_start_price,
    base_start: latestCompletion?.observed_ts ?? null,
    state_revision: revision,
    observation_id: `BOUNDARY-STATE-${revision}`,
    transition_history: retained,
    history_truncated: omitted > 0,
    history_anchor: historyAnchor,
    wave_ledger: retainedLedger,
    wave_ledger_offset: waveLedgerOffset,
    wave_ledger_anchor: waveLedgerAnchor,
  });
}

{
  const atHistoryLimit = longCampaignWithWaves(16);
  assert.equal(atHistoryLimit.campaign.transition_history.length, 64);
  const output = buildFinalDecisionIntegrationShadow(completeInput("LONG", { campaign: atHistoryLimit }));
  assert.equal(output.campaign_quality, "CLOSED");
  assert.ok(!output.reason_codes.includes("TRANSITION_HISTORY_UNBOUNDED"));
  assert.deepEqual(validateFinalDecisionOutput(output), { valid: true, errors: [] });
}

{
  const overHistoryLimit = longCampaignWithWaves(16);
  overHistoryLimit.campaign.transition_history.push({ ...overHistoryLimit.campaign.transition_history.at(-1) });
  const output = buildFinalDecisionIntegrationShadow(completeInput("LONG", { campaign: overHistoryLimit }));
  assert.equal(output.campaign_quality, "BLOCKED");
  assert.ok(output.reason_codes.includes("TRANSITION_HISTORY_UNBOUNDED"));
  assert.deepEqual(validateFinalDecisionOutput(output), { valid: true, errors: [] });
}

{
  const atLedgerLimit = longCampaignWithWaves(32);
  assert.equal(atLedgerLimit.campaign.wave_ledger.length, 32);
  assert.equal(atLedgerLimit.campaign.transition_history.length, 64);
  const output = buildFinalDecisionIntegrationShadow(completeInput("LONG", { campaign: atLedgerLimit }));
  assert.equal(output.campaign_quality, "CLOSED");
  assert.ok(!output.reason_codes.includes("WAVE_LEDGER_UNBOUNDED"));
  assert.deepEqual(validateFinalDecisionOutput(output), { valid: true, errors: [] });
}

{
  const overLedgerLimit = longCampaignWithWaves(33);
  assert.equal(overLedgerLimit.campaign.wave_ledger.length, 33);
  const output = buildFinalDecisionIntegrationShadow(completeInput("LONG", { campaign: overLedgerLimit }));
  assert.equal(output.campaign_quality, "BLOCKED");
  assert.ok(output.reason_codes.includes("WAVE_LEDGER_UNBOUNDED"));
  assert.deepEqual(validateFinalDecisionOutput(output), { valid: true, errors: [] });
}

{
  const boundedLedgerSuffix = longCampaignWithWaves(33, { retainWaveSuffix: true });
  assert.equal(boundedLedgerSuffix.campaign.wave_ledger.length, 32);
  assert.equal(boundedLedgerSuffix.campaign.wave_ledger_offset, 1);
  const output = buildFinalDecisionIntegrationShadow(completeInput("LONG", { campaign: boundedLedgerSuffix }));
  assert.equal(output.campaign_quality, "CLOSED");
  assert.ok(!output.reason_codes.includes("WAVE_LEDGER_UNBOUNDED"));
  assert.deepEqual(validateFinalDecisionOutput(output), { valid: true, errors: [] });
}

{
  const input = completeInput("LONG");
  const decisionSource = input.decision_evidence[0];
  const original = fullEvidence();
  const template = original.evidence_compact.find((row) => row.chain === "CROSS_EXCHANGE_DERIVATIVES");
  const rows = Array.from({ length: 33 }, (_, index) => {
    const row = {
      ...template,
      source_observation_id: `FULL-OVERFLOW-RAW-${index}`,
      source: decisionSource.source,
      venue: decisionSource.venue,
      metric: decisionSource.metric,
      source_ts: decisionSource.source_ts,
      available_ts: decisionSource.available_ts,
      valid_until_ts: decisionSource.source_ts + template.max_age_sec * 1000,
      value: index + 1,
      primary_market_id: `FULL-OVERFLOW-MARKET-${index}`,
      independence_group: `FULL-OVERFLOW-GROUP-${index}`,
      source_fact_ids: [`FULL-OVERFLOW-FACT-${index}`],
    };
    row.source_payload_digest = fullRawDigest(row);
    return row;
  });
  const entries = rows.map(fullRegistryProjection).sort((a, b) => a.source_observation_id.localeCompare(b.source_observation_id));
  const registryDigest = digest(entries);
  const overflowingFullEvidence = withImmutableReceipt({
    ...original,
    evidence_compact: rows,
    source_registry: {
      ...original.source_registry,
      entries,
      content_digest: registryDigest,
      persistence: {
        ...original.source_registry.persistence,
        content_digest: registryDigest,
      },
    },
  }, original.persistence.receipt_id, original.persistence.committed_ts);
  const output = buildFinalDecisionIntegrationShadow({ ...input, full_evidence: overflowingFullEvidence });
  const sourceRootReport = output.evidence_independence.cross_plane_reuse.reports.find((report) => report.kind === "SOURCE_ROOT");

  assert.equal(output.status, "FAIL_CLOSED");
  assert.ok(output.reason_codes.includes("FULL_EVIDENCE_ROW_LIMIT_EXCEEDED"));
  assert.ok(Object.values(output.source_quality.strict_weighted_chain_status).every((state) => state.eligible_rows <= 32));
  assert.ok(sourceRootReport);
  assert.equal(sourceRootReport.full_evidence_observation_count, 32);
  assert.deepEqual(validateFinalDecisionOutput(output), { valid: true, errors: [] });
}

{
  const boundedLedgerSuffix = longCampaignWithWaves(33, { retainWaveSuffix: true });
  const anchor = boundedLedgerSuffix.campaign.wave_ledger_anchor;
  const preFactAnchor = {
    ...anchor,
    persistence: {
      ...anchor.persistence,
      committed_ts: anchor.last_completed_ts - 1,
    },
  };
  const resealed = withImmutableReceipt({
    ...boundedLedgerSuffix,
    campaign: {
      ...boundedLedgerSuffix.campaign,
      wave_ledger_anchor: preFactAnchor,
    },
  }, boundedLedgerSuffix.persistence.receipt_id, NOW - 100);
  const output = buildFinalDecisionIntegrationShadow(completeInput("LONG", { campaign: resealed }));
  assert.equal(output.campaign_quality, "BLOCKED");
  assert.ok(output.reason_codes.includes("WAVE_LEDGER_ANCHOR_INVALID"));
  assert.notEqual(output.entry_action, "SHADOW_ENTRY_ELIGIBLE");
  assert.deepEqual(validateFinalDecisionOutput(output), { valid: true, errors: [] });
}

{
  const boundedLedgerSuffix = longCampaignWithWaves(33, { retainWaveSuffix: true });
  boundedLedgerSuffix.campaign.wave_ledger.at(-1).impulse_observation_id = "CONFLICTING-OVERLAP";
  const resealed = withImmutableReceipt({
    ...boundedLedgerSuffix,
    campaign: boundedLedgerSuffix.campaign,
  }, "CMR:BOUNDARY-OVERLAP", NOW - 100);
  const output = buildFinalDecisionIntegrationShadow(completeInput("LONG", { campaign: resealed }));
  assert.equal(output.campaign_quality, "BLOCKED");
  assert.ok(output.reason_codes.some((code) => code.startsWith("WAVE_IMPULSE_TRANSITION_LINK_INVALID")));
  assert.deepEqual(validateFinalDecisionOutput(output), { valid: true, errors: [] });
}

{
  const mixedWave = secondWaveCampaign("LONG");
  mixedWave.campaign.impulse_start = mixedWave.campaign.wave_ledger[0].impulse_start;
  mixedWave.campaign.impulse_start_price = mixedWave.campaign.wave_ledger[0].impulse_start_price;
  const resealed = withImmutableReceipt({ ...mixedWave, campaign: mixedWave.campaign }, "CMR:W2-MIXED", NOW - 100);
  const output = buildFinalDecisionIntegrationShadow(completeInput("LONG", { campaign: resealed }));
  assert.equal(output.campaign_quality, "BLOCKED");
  assert.ok(output.reason_codes.includes("ENTRY_PHASE_HAS_STALE_IMPULSE_FACTS"));
  assert.deepEqual(validateFinalDecisionOutput(output), { valid: true, errors: [] });
}

{
  const input = completeInput("LONG");
  input.nested_safety_alias = { "hard.veto.active": true };
  const output = buildFinalDecisionIntegrationShadow(input);
  assert.equal(output.entry_action, "REJECT");
  assert.equal(output.hard_veto_state, "BLOCKED");
  assert.ok(output.reason_codes.includes("HARD_VETO_SOURCE_CONFLICT"));
  assert.deepEqual(validateFinalDecisionOutput(output), { valid: true, errors: [] });
}

function resealDecision(output) {
  output.decision_id = null;
  output.material_digest = null;
  output.material_digest = digest(output);
  output.decision_id = `FDI:${output.contract_code}:${output.observation_ts}:${output.material_digest}`;
  return output;
}

function decisionBytes(output) {
  return new TextEncoder().encode(stableJson(output)).byteLength;
}

function exactSizedDecision(base, targetBytes) {
  const output = structuredClone(base);
  const listKeys = ["confirming_evidence", "contradictory_evidence", "blockers", "missing_or_unusable", "suppressed_evidence"];
  for (const key of listKeys) output.explainability[key] = [];
  let sequence = 0;
  while (decisionBytes(resealDecision(output)) < targetBytes) {
    const remaining = targetBytes - decisionBytes(output);
    const length = Math.min(256, Math.max(1, remaining - 3));
    const key = listKeys[Math.floor(sequence / 32)];
    if (!key) throw new Error(`insufficient contract-compatible padding capacity: ${remaining}`);
    const prefix = `P${String(sequence).padStart(3, "0")}:`;
    output.explainability[key].push(prefix + "X".repeat(Math.max(length, prefix.length) - prefix.length));
    resealDecision(output);
    const overflow = decisionBytes(output) - targetBytes;
    if (overflow > 0) {
      const values = output.explainability[key];
      values[values.length - 1] = values.at(-1).slice(0, -overflow);
      resealDecision(output);
    }
    sequence += 1;
  }
  assert.equal(decisionBytes(output), targetBytes);
  return output;
}

{
  const exact = exactSizedDecision(buildFinalDecisionIntegrationShadow(completeInput("LONG")), 24 * 1024);
  assert.deepEqual(validateFinalDecisionOutput(exact), { valid: true, errors: [] });
  const runtimeValidation = validateFinalDecisionIntegrationRecord(toFinalDecisionIntegrationRecord(exact), { now: NOW });
  assert.equal(runtimeValidation.ok, true);
  assert.equal(runtimeValidation.decision_bytes, 24 * 1024);

  const over = structuredClone(exact);
  const lastKey = ["suppressed_evidence", "missing_or_unusable", "blockers", "contradictory_evidence", "confirming_evidence"]
    .find((key) => over.explainability[key].length > 0);
  over.explainability[lastKey][over.explainability[lastKey].length - 1] += "Y";
  resealDecision(over);
  assert.equal(decisionBytes(over), 24 * 1024 + 1);
  assert.ok(validateFinalDecisionOutput(over).errors.includes("OUTPUT_JSON_TOO_LARGE"));
  assert.throws(() => toFinalDecisionIntegrationRecord(over), /OUTPUT_JSON_TOO_LARGE/);
}

for (const [name, malformed, expectedAction, expectedReason] of [
  ["object-key-limit", Object.fromEntries(Array.from({ length: 257 }, (_, index) => [`k${index}`, index])), "WAIT", "INPUT_STRUCTURE_UNREADABLE"],
  ["depth-limit", (() => { const root = {}; let node = root; for (let i = 0; i < 26; i += 1) node = node.next = {}; return root; })(), "REJECT", "SAFETY_SCAN_BOUNDS_EXCEEDED"],
]) {
  const input = completeInput("LONG");
  input.boundary_probe = malformed;
  const output = buildFinalDecisionIntegrationShadow(input);
  assert.equal(output.status, "FAIL_CLOSED", name);
  assert.equal(output.entry_action, expectedAction, name);
  assert.ok(output.reason_codes.includes(expectedReason), name);
  assert.deepEqual(validateFinalDecisionOutput(output), { valid: true, errors: [] }, name);
}

console.log(JSON.stringify({
  ok: true,
  suite: "final-decision-integration-boundaries",
  assertions: "valid 64/32 retained boundaries; 65/33 rejection; veto aliases; structural limits",
}));
