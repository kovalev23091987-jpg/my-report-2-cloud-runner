import assert from "node:assert/strict";
import {
  buildFinalDecisionIntegrationShadow,
  decisionEvidenceRegistryContentDigest,
  validateFinalDecisionOutput,
} from "../src/final-decision-integration-engine.mjs";
import {
  completeInput,
  decisionRawDigest,
  evidenceRegistry,
  evidenceRow,
} from "./final-decision-integration-fixtures.mjs";

function evaluateRows(rows, direction = "LONG") {
  const input = completeInput(direction);
  input.decision_evidence = rows;
  input.evidence_registry = evidenceRegistry([...new Map(rows.map((row) => [row.evidence_id, row])).values()]);
  const result = buildFinalDecisionIntegrationShadow(input);
  assert.equal(validateFinalDecisionOutput(result).valid, true, validateFinalDecisionOutput(result).errors.join(","));
  return result;
}

{
  const input = completeInput("LONG");
  const baseline = buildFinalDecisionIntegrationShadow(input);
  const duplicate = { ...input.decision_evidence[0] };
  const result = evaluateRows([...input.decision_evidence, duplicate]);
  assert.equal(result.direction, baseline.direction);
  assert.equal(result.independence_state, baseline.independence_state);
  assert.equal(result.evidence_independence.effective_directional_vote_count, baseline.evidence_independence.effective_directional_vote_count);
  assert.ok(result.explainability.suppressed_evidence.includes("EXACT_DUPLICATE:PRICE-1"));
}

for (const direction of ["LONG", "SHORT"]) {
  for (const [field, forgedValue] of [["status", "NOT_CLOSED"], ["authoritative", false]]) {
    const input = completeInput(direction);
    const sealedDigest = input.evidence_registry.content_digest;
    input.evidence_registry[field] = forgedValue;
    assert.equal(input.evidence_registry.content_digest, sealedDigest, "test must retain the old receipt digest");
    const result = buildFinalDecisionIntegrationShadow(input);
    assert.equal(result.status, "FAIL_CLOSED", `${direction}:${field}`);
    assert.equal(result.data_quality, "BLOCKED", `${direction}:${field}`);
    assert.equal(result.direction, "INSUFFICIENT", `${direction}:${field}`);
    assert.notEqual(result.entry_action, "SHADOW_ENTRY_ELIGIBLE", `${direction}:${field}`);
    assert.ok(result.reason_codes.includes("EVIDENCE_LINEAGE_REGISTRY_CONTENT_DIGEST_INVALID"), `${direction}:${field}`);
    assert.equal(validateFinalDecisionOutput(result).valid, true, `${direction}:${field}`);
  }
}

{
  const baseline = completeInput("LONG");
  const sealed = baseline.evidence_registry.content_digest;
  const mutations = [
    ["status", (registry) => { registry.status = "NOT_CLOSED"; }],
    ["authoritative", (registry) => { registry.authoritative = false; }],
    ["contract", (registry) => { registry.contract_code = "OTHER-USDT"; }],
    ["snapshot", (registry) => { registry.snapshot_id = "RUN-OTHER"; }],
    ["observed", (registry) => { registry.observed_ts -= 1; }],
    ["episode", (registry) => { registry.episode_id = "EP:OTHER:1"; }],
    ["episode-revision", (registry) => { registry.episode_revision += 1; }],
    ["rules", (registry) => { registry.rules_version = "causal-lineage-registry-v2"; }],
    ["receipt", (registry) => { registry.receipt_id = "ER:OTHER"; }],
    ["persistence-status", (registry) => { registry.persistence.status = "PARTIAL"; }],
    ["persistence-receipt", (registry) => { registry.persistence.receipt_id = "ER:OTHER"; }],
    ["persistence-commit", (registry) => { registry.persistence.committed_ts -= 1; }],
    ["persistence-immutable", (registry) => { registry.persistence.immutable = false; }],
    ["persistence-method", (registry) => { registry.persistence.verification_method = "SELF_ASSERTED"; }],
    ["entry-material", (registry) => { registry.entries[0].source = "OTHER_SOURCE"; }],
  ];
  for (const [label, mutate] of mutations) {
    const input = structuredClone(baseline);
    mutate(input.evidence_registry);
    assert.notEqual(decisionEvidenceRegistryContentDigest(input.evidence_registry), sealed, label);
    const result = buildFinalDecisionIntegrationShadow(input);
    assert.ok(result.reason_codes.includes("EVIDENCE_LINEAGE_REGISTRY_CONTENT_DIGEST_INVALID"), label);
    assert.notEqual(result.entry_action, "SHADOW_ENTRY_ELIGIBLE", label);
    assert.equal(validateFinalDecisionOutput(result).valid, true, label);
  }

  const reordered = structuredClone(baseline.evidence_registry);
  reordered.entries.reverse();
  assert.equal(decisionEvidenceRegistryContentDigest(reordered), sealed, "entry transport order must not change the seal");
}

for (const direction of ["LONG", "SHORT"]) {
  const input = completeInput(direction);
  const omittedOpposite = evidenceRow({
    evidence_id: `OMITTED-${direction === "LONG" ? "SHORT" : "LONG"}`,
    causal_family: "RELATIVE_STRENGTH",
    metric_semantics: "RS_VS_BTC_ETH",
    correlation_group: `OMITTED-OPPOSITE-${direction}`,
    source: "RELATIVE_STRENGTH_MODEL",
    venue: "MULTI_VENUE",
    metric: "relative_strength",
    stance: direction === "LONG" ? "SHORT" : "LONG",
    value: direction === "LONG" ? -1 : 1,
    fact_ids: [`FACT-OMITTED-${direction}`],
  });
  input.evidence_registry = evidenceRegistry([...input.decision_evidence, omittedOpposite]);
  const result = buildFinalDecisionIntegrationShadow(input);
  assert.equal(result.data_quality, "BLOCKED", direction);
  assert.equal(result.directional_quality, "BLOCKED", direction);
  assert.equal(result.independence_state, "BLOCKED", direction);
  assert.equal(result.direction, "INSUFFICIENT", direction);
  assert.notEqual(result.entry_action, "SHADOW_ENTRY_ELIGIBLE", direction);
  assert.ok(result.reason_codes.includes("EVIDENCE_LINEAGE_REGISTRY_ENTRY_SET_MISMATCH"), direction);
  assert.equal(validateFinalDecisionOutput(result).valid, true, direction);
}

{
  const input = completeInput("LONG");
  const extraPriceRows = [
    evidenceRow({
      evidence_id: "PRICE-2", causal_family: "AGGRESSOR_RESPONSE",
      metric_semantics: "OPPOSING_AGGRESSOR_INEFFECTIVE", correlation_group: "PRICE_ACTION_FLOW",
      source: "HTX_TRADE_TAPE", metric: "aggressor_response", source_observation_id: "RAW:PRICE-2",
      fact_ids: ["FACT-PRICE-2"],
    }),
    evidenceRow({
      evidence_id: "PRICE-3", causal_family: "LIQUIDITY_RESPONSE",
      metric_semantics: "DIRECTIONAL_SWEEP_RECLAIM", correlation_group: "PRICE_ACTION_LIQUIDITY",
      source: "HTX_LIQUIDATION_TAPE", metric: "sweep_reclaim", source_observation_id: "RAW:PRICE-3",
      fact_ids: ["FACT-PRICE-3"],
    }),
  ];
  const result = evaluateRows([...input.decision_evidence, ...extraPriceRows]);
  assert.equal(result.direction, "LONG");
  assert.equal(result.evidence_independence.causal_domains.PRICE_ACTION.effective_domain_votes, 1);
  assert.equal(result.evidence_independence.effective_directional_vote_count, 2);
  assert.equal(result.evidence_independence.raw_usable_evidence_count, 4);
  assert.equal(result.explainability.suppressed_evidence.filter((item) => item.startsWith("DOMAIN_COLLAPSED:PRICE_ACTION")).length, 2);
}

{
  const input = completeInput("LONG");
  const conflicting = { ...input.decision_evidence[0], stance: "SHORT", value: -1 };
  conflicting.source_payload_digest = decisionRawDigest(conflicting);
  input.decision_evidence.push(conflicting);
  input.evidence_registry = evidenceRegistry(input.decision_evidence.slice(0, 2));
  const result = buildFinalDecisionIntegrationShadow(input);
  assert.equal(result.status, "FAIL_CLOSED");
  assert.equal(result.data_quality, "BLOCKED");
  assert.equal(result.direction, "INSUFFICIENT");
  assert.ok(result.reason_codes.some((item) => item.startsWith("EVIDENCE_ID_CONFLICT")));
  assert.equal(validateFinalDecisionOutput(result).valid, true, validateFinalDecisionOutput(result).errors.join(","));
}

{
  const rows = completeInput("LONG").decision_evidence;
  const correlatedPositioning = evidenceRow({
    evidence_id: "POSITIONING-CORRELATED", causal_family: "FUNDING",
    metric_semantics: "CROWDING_TRAJECTORY", correlation_group: "PRICE_ACTION_EPISODE",
    source: "CROSS_VENUE_VERIFIED", venue: "MULTI_VENUE", metric: "crowding_response",
    source_observation_id: "RAW:POSITIONING-CORRELATED", fact_ids: ["FACT-POSITIONING-CORRELATED"],
  });
  const result = evaluateRows([rows[0], correlatedPositioning]);
  assert.equal(result.data_quality, "BLOCKED");
  assert.equal(result.direction, "INSUFFICIENT");
  assert.notEqual(result.entry_action, "SHADOW_ENTRY_ELIGIBLE");
  assert.ok(result.reason_codes.includes("CROSS_DOMAIN_CORRELATION_COLLISION"));
}

{
  const rows = completeInput("LONG").decision_evidence;
  const sharedFact = evidenceRow({
    evidence_id: "POSITIONING-SHARED-FACT", causal_family: "FUNDING",
    metric_semantics: "CROWDING_TRAJECTORY", correlation_group: "POSITIONING_SEPARATE",
    source: "CROSS_VENUE_VERIFIED", venue: "MULTI_VENUE", metric: "crowding_response",
    source_observation_id: "RAW:POSITIONING-SHARED-FACT", fact_ids: ["FACT-PRICE-1"],
  });
  const result = evaluateRows([rows[0], sharedFact]);
  assert.equal(result.independence_state, "CORRELATED");
  assert.ok(result.reason_codes.includes("CROSS_DOMAIN_FACT_REUSE:FACT-PRICE-1"));
  assert.notEqual(result.entry_action, "SHADOW_ENTRY_ELIGIBLE");
}

{
  const input = completeInput("LONG");
  const shortRelative = evidenceRow({
    evidence_id: "RELATIVE-SHORT", causal_family: "RELATIVE_STRENGTH",
    metric_semantics: "RS_VS_BTC_ETH", correlation_group: "RELATIVE_MARKET_SHORT",
    source: "RELATIVE_MARKET_MODEL", venue: "MULTI_VENUE", metric: "relative_strength",
    source_observation_id: "RAW:RELATIVE-SHORT", stance: "SHORT", value: -1,
    fact_ids: ["FACT-RS-SHORT"],
  });
  const result = evaluateRows([...input.decision_evidence, shortRelative]);
  assert.equal(result.direction, "NEUTRAL");
  assert.equal(result.directional_quality, "CONFLICTING");
  assert.equal(result.independence_state, "CONFLICTING");
  assert.notEqual(result.entry_action, "SHADOW_ENTRY_ELIGIBLE");
  assert.ok(result.explainability.contradictory_evidence.length > 0);
}

{
  const onlyPrice = completeInput("LONG").decision_evidence.slice(0, 1);
  const result = evaluateRows(onlyPrice);
  assert.equal(result.independence_state, "PARTIAL");
  assert.equal(result.direction, "INSUFFICIENT");
  assert.notEqual(result.entry_action, "SHADOW_ENTRY_ELIGIBLE");
}

console.log(JSON.stringify({
  ok: true,
  suite: "final-decision-integration-evidence",
  assertions: "exact duplicate invariance; one vote per domain; correlation/fact reuse rejection; contradiction; independent-domain quorum",
}));
