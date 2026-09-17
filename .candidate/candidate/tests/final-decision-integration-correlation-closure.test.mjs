import assert from "node:assert/strict";

import {
  buildFinalDecisionIntegrationShadow,
  validateFinalDecisionOutput,
} from "../src/final-decision-integration-engine.mjs";
import {
  NOW,
  completeInput,
  decisionRawDigest,
  digest,
  evidenceRegistry,
  evidenceRow,
  fullEvidence,
  fullRawDigest,
  withImmutableReceipt,
} from "./final-decision-integration-fixtures.mjs";

function registryProjection(row) {
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

function fullEvidenceWithMutation(mutate, rowIndex = 0) {
  const original = fullEvidence();
  const rows = structuredClone(original.evidence_compact);
  mutate(rows[rowIndex]);
  rows[rowIndex].source_payload_digest = fullRawDigest(rows[rowIndex]);
  const entries = rows.map(registryProjection).sort((a, b) => a.source_observation_id.localeCompare(b.source_observation_id));
  const registryDigest = digest(entries);
  const material = {
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
  };
  return withImmutableReceipt(material, original.persistence.receipt_id, NOW - 100);
}

for (const direction of ["LONG", "SHORT"]) {
  const input = completeInput(direction);
  const decisionRow = input.decision_evidence[0];
  const htxRowIndex = input.full_evidence.evidence_compact.findIndex((row) => row.chain === "HTX_EXECUTION");
  input.full_evidence = fullEvidenceWithMutation((row) => {
    row.source_observation_id = decisionRow.source_observation_id;
  }, htxRowIndex);
  const htxRow = input.full_evidence.evidence_compact[htxRowIndex];
  assert.notEqual(htxRow.source_payload_digest, decisionRow.source_payload_digest, direction);

  const result = buildFinalDecisionIntegrationShadow(input);
  const reuse = result.evidence_independence.cross_plane_reuse;
  const report = reuse.reports.find((candidate) => candidate.kind === "SOURCE_OBSERVATION_ID");
  assert.equal(result.source_quality.full_evidence, "CLOSED", direction);
  assert.equal(reuse.state, "CORRELATED", direction);
  assert.equal(reuse.total_reuse_count, 1, direction);
  assert.ok(report, direction);
  assert.equal(report.identity, decisionRow.source_observation_id, direction);
  assert.deepEqual(report.decision_evidence_ids, [decisionRow.evidence_id], direction);
  assert.deepEqual(report.full_evidence_observation_ids, [htxRow.source_observation_id], direction);
  assert.equal(result.independence_state, "CORRELATED", direction);
  assert.equal(result.data_quality, "BLOCKED", direction);
  assert.equal(result.directional_quality, "BLOCKED", direction);
  assert.notEqual(result.entry_action, "SHADOW_ENTRY_ELIGIBLE", direction);
  assert.ok(result.reason_codes.includes(`CROSS_PLANE_SOURCE_OBSERVATION_ID_REUSE:${report.identity_digest.toUpperCase()}`), direction);
  assert.deepEqual(validateFinalDecisionOutput(result), { valid: true, errors: [] }, direction);
}

for (const direction of ["LONG", "SHORT"]) {
  const sourceRoot = fullEvidence().evidence_compact[0];
  const input = completeInput(direction);
  input.full_evidence = fullEvidenceWithMutation((row) => {
    row.source = sourceRoot.source;
    row.venue = sourceRoot.venue;
    row.metric = sourceRoot.metric;
    row.source_ts = sourceRoot.source_ts;
    row.valid_until_ts = row.source_ts + row.max_age_sec * 1000;
    row.value = 2;
  }, 1);
  assert.notEqual(
    input.full_evidence.evidence_compact[0].source_payload_digest,
    input.full_evidence.evidence_compact[1].source_payload_digest,
    direction,
  );
  const result = buildFinalDecisionIntegrationShadow(input);
  assert.equal(result.source_quality.full_evidence, "BLOCKED", direction);
  assert.equal(result.data_quality, "BLOCKED", direction);
  assert.notEqual(result.entry_action, "SHADOW_ENTRY_ELIGIBLE", direction);
  assert.ok(result.reason_codes.some((code) => code.startsWith("FULL_EVIDENCE_CROSS_CHAIN_SOURCE_ROOT_REUSE:")), direction);
  assert.deepEqual(validateFinalDecisionOutput(result), { valid: true, errors: [] }, direction);
}

for (const direction of ["LONG", "SHORT"]) {
  const baseline = fullEvidence();
  const htxExecution = baseline.evidence_compact.find((row) => row.chain === "HTX_EXECUTION");
  const weightedIndex = baseline.evidence_compact.findIndex((row) => row.chain === "CROSS_EXCHANGE_DERIVATIVES");
  const input = completeInput(direction, {
    full_evidence: fullEvidenceWithMutation((row) => {
      row.source = htxExecution.source;
      row.venue = htxExecution.venue;
      row.metric = htxExecution.metric;
      row.source_ts = htxExecution.source_ts;
      row.valid_until_ts = row.source_ts + row.max_age_sec * 1000;
    }, weightedIndex),
  });
  const weighted = input.full_evidence.evidence_compact[weightedIndex];
  const htx = input.full_evidence.evidence_compact.find((row) => row.chain === "HTX_EXECUTION");

  assert.deepEqual(
    [weighted.source, weighted.venue, weighted.metric, weighted.source_ts],
    [htx.source, htx.venue, htx.metric, htx.source_ts],
    direction,
  );
  assert.notEqual(weighted.source_observation_id, htx.source_observation_id, direction);
  assert.notEqual(weighted.source_payload_digest, htx.source_payload_digest, direction);
  const result = buildFinalDecisionIntegrationShadow(input);
  assert.equal(result.source_quality.full_evidence, "BLOCKED", direction);
  assert.equal(result.data_quality, "BLOCKED", direction);
  assert.notEqual(result.entry_action, "SHADOW_ENTRY_ELIGIBLE", direction);
  assert.ok(result.reason_codes.some((code) => code.startsWith("FULL_EVIDENCE_CROSS_CHAIN_SOURCE_ROOT_REUSE:")), direction);
  assert.deepEqual(validateFinalDecisionOutput(result), { valid: true, errors: [] }, direction);
}

{
  const input = completeInput("LONG");
  const collision = {
    ...input.decision_evidence[0],
    source_observation_id: input.full_evidence.evidence_compact[0].source_observation_id,
  };
  collision.source_payload_digest = decisionRawDigest(collision);
  const rows = [collision, input.decision_evidence[1]];
  const omitted = evidenceRow({
    evidence_id: "OMITTED-COMBINED-INTEGRITY",
    causal_family: "RELATIVE_STRENGTH",
    metric_semantics: "RS_VS_BTC_ETH",
    correlation_group: "OMITTED-COMBINED-INTEGRITY",
    source: "RELATIVE_STRENGTH_MODEL",
    venue: "MULTI_VENUE",
    metric: "relative_strength",
    fact_ids: ["FACT-OMITTED-COMBINED-INTEGRITY"],
  });
  const result = buildFinalDecisionIntegrationShadow({
    ...input,
    decision_evidence: rows,
    evidence_registry: evidenceRegistry([...rows, omitted]),
  });
  assert.equal(result.evidence_independence.cross_plane_reuse.state, "CLOSED", "untrusted registry rows must not make cross-plane claims");
  assert.equal(result.evidence_independence.raw_usable_evidence_count, 0);
  assert.equal(result.independence_state, "BLOCKED", "registry integrity failure must dominate evidence state");
  assert.equal(result.status, "FAIL_CLOSED");
  assert.notEqual(result.entry_action, "SHADOW_ENTRY_ELIGIBLE");
  assert.ok(result.reason_codes.includes("EVIDENCE_LINEAGE_REGISTRY_ENTRY_SET_MISMATCH"));
  assert.deepEqual(validateFinalDecisionOutput(result), { valid: true, errors: [] });
}

function correlationProjection(output) {
  return {
    status: output.status,
    direction: output.direction,
    directional_quality: output.directional_quality,
    entry_action: output.entry_action,
    independence_state: output.independence_state,
    reasons: output.reason_codes.filter((reason) => reason.startsWith("CROSS_")),
    cross_domain_payload_digest_reuse: output.evidence_independence.cross_domain_payload_digest_reuse,
    cross_plane_reuse: output.evidence_independence.cross_plane_reuse,
  };
}

function reseal(output) {
  output.decision_id = null;
  output.material_digest = null;
  output.material_digest = digest(output);
  output.decision_id = `FDI:${output.contract_code}:${output.observation_ts}:${output.material_digest}`;
  return output;
}

function resealCrossPlane(output) {
  const reuse = output.evidence_independence.cross_plane_reuse;
  reuse.all_reuse_digest = digest({
    total_reuse_count: reuse.total_reuse_count,
    report_truncated: reuse.report_truncated,
    reports: reuse.reports,
  });
  reuse.reason_codes = [
    ...reuse.reports.map((report) => `CROSS_PLANE_${report.kind}_REUSE:${report.identity_digest}`),
    ...(reuse.report_truncated ? ["CROSS_PLANE_REUSE_REPORT_TRUNCATED"] : []),
  ].sort();
  return reseal(output);
}

{
  const price = evidenceRow();
  const disguisedCopy = evidenceRow({
    evidence_id: "RELATIVE-DIGEST-COPY",
    causal_family: "RELATIVE_STRENGTH",
    metric_semantics: "RS_VS_BTC_ETH",
    correlation_group: "RELATIVE-MARKET-EPISODE",
    source_observation_id: "RAW:RELATIVE-DIGEST-COPY",
    fact_ids: ["FACT-RELATIVE-DIGEST-COPY"],
  });
  assert.equal(disguisedCopy.source_payload_digest, price.source_payload_digest, "raw digest excludes derived domain labels by design");
  const positioning = evidenceRow({
    evidence_id: "POSITIONING-1",
    causal_family: "FUNDING",
    metric_semantics: "CROWDING_TRAJECTORY",
    correlation_group: "POSITIONING_EPISODE",
    source: "CROSS_VENUE_VERIFIED",
    venue: "MULTI_VENUE",
    metric: "crowding_response",
    fact_ids: ["FACT-POSITIONING-1"],
  });
  const rows = [price, positioning, disguisedCopy];
  const registry = evidenceRegistry(rows);
  const first = buildFinalDecisionIntegrationShadow(completeInput("LONG", {
    decision_evidence: rows,
    evidence_registry: registry,
  }));
  const permuted = buildFinalDecisionIntegrationShadow(completeInput("LONG", {
    decision_evidence: [...rows].reverse(),
    evidence_registry: registry,
  }));
  assert.equal(first.independence_state, "CORRELATED");
  assert.equal(first.direction, "INSUFFICIENT");
  assert.equal(first.directional_quality, "BLOCKED");
  assert.notEqual(first.entry_action, "SHADOW_ENTRY_ELIGIBLE");
  assert.deepEqual(first.evidence_independence.cross_domain_payload_digest_reuse, [price.source_payload_digest]);
  assert.ok(first.reason_codes.includes(`CROSS_DOMAIN_SOURCE_PAYLOAD_DIGEST_REUSE:${price.source_payload_digest.toUpperCase()}`));
  assert.deepEqual(correlationProjection(permuted), correlationProjection(first));
  assert.deepEqual(validateFinalDecisionOutput(first), { valid: true, errors: [] });
}

for (const direction of ["LONG", "SHORT"]) {
  const sign = direction === "SHORT" ? -1 : 1;
  const sharedObservationId = `RAW:SHARED-${direction}`;
  const price = evidenceRow({
    evidence_id: `PRICE-SHARED-${direction}`,
    source_observation_id: sharedObservationId,
    stance: direction,
    value: sign,
    fact_ids: [`FACT-PRICE-SHARED-${direction}`],
  });
  const positioning = evidenceRow({
    evidence_id: `POSITIONING-SHARED-${direction}`,
    causal_family: "FUNDING",
    metric_semantics: "CROWDING_TRAJECTORY",
    correlation_group: `POSITIONING-SHARED-${direction}`,
    source: "CROSS_VENUE_VERIFIED",
    venue: "MULTI_VENUE",
    metric: "crowding_response",
    source_observation_id: sharedObservationId,
    stance: direction,
    value: sign,
    fact_ids: [`FACT-POSITIONING-SHARED-${direction}`],
  });
  assert.notEqual(price.source_payload_digest, positioning.source_payload_digest, direction);
  const rows = [price, positioning];
  const registry = evidenceRegistry(rows);
  const first = buildFinalDecisionIntegrationShadow(completeInput(direction, {
    decision_evidence: rows,
    evidence_registry: registry,
  }));
  const permuted = buildFinalDecisionIntegrationShadow(completeInput(direction, {
    decision_evidence: [...rows].reverse(),
    evidence_registry: registry,
  }));
  assert.equal(first.independence_state, "BLOCKED", direction);
  assert.equal(first.direction, "INSUFFICIENT", direction);
  assert.equal(first.directional_quality, "BLOCKED", direction);
  assert.notEqual(first.entry_action, "SHADOW_ENTRY_ELIGIBLE", direction);
  assert.ok(first.reason_codes.includes("SOURCE_OBSERVATION_ID_DIGEST_CONFLICT"), direction);
  assert.deepEqual(correlationProjection(permuted), correlationProjection(first), direction);
  assert.deepEqual(validateFinalDecisionOutput(first), { valid: true, errors: [] }, direction);
}

for (const direction of ["LONG", "SHORT"]) {
  const sign = direction === "SHORT" ? -1 : 1;
  const price = evidenceRow({
    evidence_id: `PRICE-SOURCE-ROOT-${direction}`,
    source: "SHARED_FEED",
    venue: "HTX",
    metric: "same_root_metric",
    stance: direction,
    value: sign,
    fact_ids: [`FACT-PRICE-SOURCE-ROOT-${direction}`],
  });
  const positioning = evidenceRow({
    evidence_id: `POSITIONING-SOURCE-ROOT-${direction}`,
    causal_family: "FUNDING",
    metric_semantics: "CROWDING_TRAJECTORY",
    correlation_group: `POSITIONING-SOURCE-ROOT-${direction}`,
    source: price.source,
    venue: price.venue,
    metric: price.metric,
    source_ts: price.source_ts,
    source_observation_id: `RAW:POSITIONING-SOURCE-ROOT-${direction}`,
    max_age_ms: 120_000,
    valid_until_ts: price.source_ts + 120_000,
    stance: direction,
    value: sign,
    fact_ids: [`FACT-POSITIONING-SOURCE-ROOT-${direction}`],
  });
  assert.notEqual(price.source_payload_digest, positioning.source_payload_digest, direction);
  const rows = [price, positioning];
  const result = buildFinalDecisionIntegrationShadow(completeInput(direction, {
    decision_evidence: rows,
    evidence_registry: evidenceRegistry(rows),
  }));
  assert.equal(result.independence_state, "CORRELATED", direction);
  assert.equal(result.direction, "INSUFFICIENT", direction);
  assert.equal(result.directional_quality, "BLOCKED", direction);
  assert.notEqual(result.entry_action, "SHADOW_ENTRY_ELIGIBLE", direction);
  assert.ok(result.reason_codes.some((code) => code.startsWith("CROSS_DOMAIN_SOURCE_ROOT_REUSE:")), direction);
  assert.deepEqual(validateFinalDecisionOutput(result), { valid: true, errors: [] }, direction);
}

for (const collision of ["SOURCE_OBSERVATION_ID", "SOURCE_FACT_ID", "SOURCE_ROOT"]) {
  const input = completeInput("LONG");
  const decisionRow = input.decision_evidence[0];
  input.full_evidence = fullEvidenceWithMutation((row) => {
    if (collision === "SOURCE_OBSERVATION_ID") row.source_observation_id = decisionRow.source_observation_id;
    if (collision === "SOURCE_FACT_ID") row.source_fact_ids = [decisionRow.fact_ids[0]];
    if (collision === "SOURCE_ROOT") {
      row.source = decisionRow.source;
      row.venue = decisionRow.venue;
      row.metric = decisionRow.metric;
      row.source_ts = decisionRow.source_ts;
      row.valid_until_ts = row.source_ts + row.max_age_sec * 1000;
    }
  });
  const result = buildFinalDecisionIntegrationShadow(input);
  const permuted = buildFinalDecisionIntegrationShadow({
    ...input,
    decision_evidence: [...input.decision_evidence].reverse(),
  });
  const reuse = result.evidence_independence.cross_plane_reuse;
  const report = reuse.reports.find((candidate) => candidate.kind === collision);
  assert.equal(result.independence_state, "CORRELATED", collision);
  assert.equal(result.direction, "INSUFFICIENT", collision);
  assert.equal(result.directional_quality, "BLOCKED", collision);
  assert.notEqual(result.entry_action, "SHADOW_ENTRY_ELIGIBLE", collision);
  assert.ok(report, `missing exact ${collision} reuse report`);
  assert.deepEqual(report.decision_evidence_ids, [decisionRow.evidence_id]);
  assert.deepEqual(report.full_evidence_observation_ids, [input.full_evidence.evidence_compact[0].source_observation_id]);
  assert.ok(result.reason_codes.includes(`CROSS_PLANE_${collision}_REUSE:${report.identity_digest.toUpperCase()}`));
  assert.deepEqual(correlationProjection(permuted), correlationProjection(result), `${collision} result must be permutation invariant`);
  assert.deepEqual(validateFinalDecisionOutput(result), { valid: true, errors: [] });

  if (collision === "SOURCE_ROOT") {
    for (const forgedIdentity of [17, { probe: false }, { hard_veto_active: true }, {
      ...report.identity,
      source_ts: NOW + 1,
    }]) {
      const forged = structuredClone(result);
      const forgedReport = forged.evidence_independence.cross_plane_reuse.reports.find((candidate) => candidate.kind === "SOURCE_ROOT");
      forgedReport.identity = forgedIdentity;
      forgedReport.identity_digest = digest(forgedIdentity);
      resealCrossPlane(forged);
      const validation = validateFinalDecisionOutput(forged);
      assert.equal(validation.valid, false, JSON.stringify(forgedIdentity));
      assert.ok(validation.errors.some((code) => code === "CROSS_PLANE_REUSE_DETAIL_INVALID" || code.startsWith("FORBIDDEN_VALUE:")), validation.errors.join(","));
    }

    const forgedDigest = structuredClone(result);
    forgedDigest.evidence_independence.cross_plane_reuse.all_reuse_digest = "0000000000000000";
    reseal(forgedDigest);
    assert.ok(validateFinalDecisionOutput(forgedDigest).errors.includes("CROSS_PLANE_REUSE_DIGEST_MISMATCH"));

    const forgedCount = structuredClone(result);
    forgedCount.evidence_independence.cross_plane_reuse.reports.find((candidate) => candidate.kind === "SOURCE_ROOT").decision_evidence_count = 999;
    resealCrossPlane(forgedCount);
    assert.ok(validateFinalDecisionOutput(forgedCount).errors.includes("CROSS_PLANE_REUSE_DETAIL_INVALID"));
  }
}

for (const direction of ["LONG", "SHORT"]) {
  const input = completeInput(direction);
  const decisionRow = input.decision_evidence[0];
  input.full_evidence = fullEvidenceWithMutation((row) => {
    row.source = decisionRow.source.toLowerCase();
    row.venue = decisionRow.venue.toLowerCase();
    row.metric = decisionRow.metric.toUpperCase();
    row.source_ts = decisionRow.source_ts;
    row.valid_until_ts = row.source_ts + row.max_age_sec * 1000;
  });
  const result = buildFinalDecisionIntegrationShadow(input);
  assert.equal(result.evidence_independence.cross_plane_reuse.state, "CORRELATED", direction);
  assert.ok(result.evidence_independence.cross_plane_reuse.reports.some((report) => report.kind === "SOURCE_ROOT"), direction);
  assert.equal(result.independence_state, "CORRELATED", direction);
  assert.notEqual(result.entry_action, "SHADOW_ENTRY_ELIGIBLE", direction);
  assert.deepEqual(validateFinalDecisionOutput(result), { valid: true, errors: [] }, direction);
}

for (const direction of ["LONG", "SHORT"]) {
  const input = completeInput(direction);
  const dotted = evidenceRow({
    ...input.decision_evidence[0],
    source: "İ".repeat(80),
    stance: direction,
    value: direction === "LONG" ? 1 : -1,
  });
  dotted.source_payload_digest = decisionRawDigest(dotted);
  input.decision_evidence = [dotted, input.decision_evidence[1]];
  input.evidence_registry = evidenceRegistry(input.decision_evidence);
  input.full_evidence = fullEvidenceWithMutation((row) => {
    row.source = "i\u0307".repeat(80);
    row.venue = dotted.venue;
    row.metric = dotted.metric;
    row.source_ts = dotted.source_ts;
    row.valid_until_ts = row.source_ts + row.max_age_sec * 1000;
  });
  const result = buildFinalDecisionIntegrationShadow(input);
  assert.equal(result.evidence_independence.cross_plane_reuse.state, "CORRELATED", direction);
  assert.notEqual(result.entry_action, "SHADOW_ENTRY_ELIGIBLE", direction);
  assert.deepEqual(validateFinalDecisionOutput(result), { valid: true, errors: [] }, direction);
}

for (const unsafeSource of ["HTX_e\u0301", "HTX\u200B_OFFICIAL", "HTX_\uD800", "İ".repeat(81)]) {
  for (const direction of ["LONG", "SHORT"]) {
    const input = completeInput(direction);
    const unsafe = evidenceRow({
      ...input.decision_evidence[0],
      source: unsafeSource,
      stance: direction,
      value: direction === "LONG" ? 1 : -1,
    });
    unsafe.source_payload_digest = decisionRawDigest(unsafe);
    const rows = [unsafe, input.decision_evidence[1]];
    input.decision_evidence = rows;
    input.evidence_registry = evidenceRegistry(rows);
    const result = buildFinalDecisionIntegrationShadow(input);
    assert.equal(result.status, "FAIL_CLOSED", `${direction}:${JSON.stringify(unsafeSource)}`);
    assert.notEqual(result.entry_action, "SHADOW_ENTRY_ELIGIBLE", direction);
    assert.ok(result.reason_codes.some((code) => code.endsWith(":INVALID_EVIDENCE_PROVENANCE")), direction);
    assert.deepEqual(validateFinalDecisionOutput(result), { valid: true, errors: [] }, direction);
  }
}

{
  const base = completeInput("LONG");
  const storm = Array.from({ length: 12 }, (_, index) => evidenceRow({
    evidence_id: `PRICE-STORM-${String(index).padStart(2, "0")}`,
    source_observation_id: `RAW:PRICE-STORM-${String(index).padStart(2, "0")}`,
    metric: `price_response_storm_${index}`,
    correlation_group: `PRICE-STORM-GROUP-${index}`,
    fact_ids: [`FACT-PRICE-STORM-${index}`],
  }));
  const rows = [base.decision_evidence[1], ...storm];
  const registry = evidenceRegistry(rows);
  const first = buildFinalDecisionIntegrationShadow(completeInput("LONG", {
    decision_evidence: rows,
    evidence_registry: registry,
  }));
  const permuted = buildFinalDecisionIntegrationShadow(completeInput("LONG", {
    decision_evidence: [...rows].reverse(),
    evidence_registry: registry,
  }));
  assert.equal(first.independence_state, "CLOSED");
  assert.equal(first.directional_quality, "CLOSED");
  assert.equal(first.entry_action, "SHADOW_ENTRY_ELIGIBLE");
  assert.equal(first.evidence_independence.effective_directional_vote_count, 2);
  assert.equal(first.evidence_independence.causal_domains.PRICE_ACTION.effective_domain_votes, 1);
  assert.equal(first.evidence_independence.causal_domains.PRICE_ACTION.raw_support_count, storm.length);
  assert.equal(first.evidence_independence.cross_plane_reuse.total_reuse_count, 0);
  assert.deepEqual(correlationProjection(permuted), correlationProjection(first));
  assert.deepEqual(validateFinalDecisionOutput(first), { valid: true, errors: [] });
}

{
  const positioning = evidenceRow({
    evidence_id: "POSITIONING-UNICODE-PROBE",
    causal_family: "FUNDING",
    metric_semantics: "CROWDING_TRAJECTORY",
    correlation_group: "POSITIONING-UNICODE-PROBE",
    source: "CROSS_VENUE_VERIFIED",
    venue: "MULTI_VENUE",
    metric: "crowding_unicode_probe",
    fact_ids: ["FACT-POSITIONING-UNICODE-PROBE"],
  });
  const asciiPrice = evidenceRow({ source: "AA" });
  const unicodePrice = evidenceRow({ source: "䅁" });
  assert.notEqual(asciiPrice.source_payload_digest, unicodePrice.source_payload_digest, "UTF-8 hashing must distinguish distinct Unicode byte strings");

  const asciiRows = [asciiPrice, positioning];
  const unicodeRows = [unicodePrice, positioning];
  const ascii = buildFinalDecisionIntegrationShadow(completeInput("LONG", {
    decision_evidence: asciiRows,
    evidence_registry: evidenceRegistry(asciiRows),
  }));
  const unicode = buildFinalDecisionIntegrationShadow(completeInput("LONG", {
    decision_evidence: unicodeRows,
    evidence_registry: evidenceRegistry(unicodeRows),
  }));
  assert.equal(ascii.entry_action, "SHADOW_ENTRY_ELIGIBLE");
  assert.equal(unicode.entry_action, "SHADOW_ENTRY_ELIGIBLE");
  assert.notEqual(ascii.input_lineage_digest, unicode.input_lineage_digest);
  assert.notEqual(ascii.material_digest, unicode.material_digest);
  assert.notEqual(ascii.decision_id, unicode.decision_id);
  assert.deepEqual(validateFinalDecisionOutput(ascii), { valid: true, errors: [] });
  assert.deepEqual(validateFinalDecisionOutput(unicode), { valid: true, errors: [] });
}

console.log(JSON.stringify({
  ok: true,
  suite: "final-decision-integration-correlation-closure",
  assertions: "cross-domain/cross-plane reuse; permutation invariance; one vote per domain; UTF-8 digest separation",
}));
