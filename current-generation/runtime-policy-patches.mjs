import fs from 'node:fs';
import path from 'node:path';

function replaceOnce(source,before,after,label){
 const first=source.indexOf(before);if(first<0){const applied=source.indexOf(after);if(applied>=0&&source.indexOf(after,applied+after.length)<0)return source;throw new Error(`CURRENT_GENERATION_POLICY_PATCH_MISSING:${label}`);}
 if(source.indexOf(before,first+before.length)>=0)throw new Error(`CURRENT_GENERATION_POLICY_PATCH_AMBIGUOUS:${label}`);
 return source.slice(0,first)+after+source.slice(first+before.length);
}

export function applyRuntimePolicyPatches(runtime){
 const file=path.join(runtime,'src/multi-wave-campaign-engine.mjs');
 let source=fs.readFileSync(file,'utf8');
 source=replaceOnce(source,`  const thresholdPct = phase === CAMPAIGN_PHASE.ENTRY_TRIGGER
    ? finite(config?.first_impulse_move_pct)
    : finite(config?.next_impulse_move_pct);
  if (thresholdPct === null || thresholdPct <= 0) return null;
  const targetPrice = direction === 'LONG'
    ? entryPrice * (1 + thresholdPct / 100)
    : entryPrice * (1 - thresholdPct / 100);`,`  const configuredThresholdPct = phase === CAMPAIGN_PHASE.ENTRY_TRIGGER
    ? finite(config?.first_impulse_move_pct)
    : finite(config?.next_impulse_move_pct);
  const measuredBaseMovePct = (baseHigh - baseLow) / entryPrice * 100;
  if (configuredThresholdPct === null || configuredThresholdPct <= 0 || !Number.isFinite(measuredBaseMovePct)) return null;
  // Five percent is a reportability filter, never a fabricated target. The
  // target exists only when the prospectively measured base itself supports it.
  // The configured impulse threshold still controls phase transitions, but it
  // cannot stretch the displayed target beyond measured market structure.
  const thresholdPct = measuredBaseMovePct;
  if (thresholdPct < 5) return null;
  const targetPrice = direction === 'LONG'
    ? entryPrice * (1 + thresholdPct / 100)
    : entryPrice * (1 - thresholdPct / 100);`,'MEASURED_BASE_TARGET');
 source=replaceOnce(source,`    target_basis: 'PRECOMMITTED_MULTI_WAVE_IMPULSE_THRESHOLD',`,`    target_basis: 'PRECOMMITTED_BASE_MEASURED_MOVE_AT_LEAST_5_PERCENT',`,'MEASURED_BASE_TARGET_BASIS');
 fs.writeFileSync(file,source);

 const decisionFile=path.join(runtime,'src/final-decision-integration-engine.mjs');
 let decision=fs.readFileSync(decisionFile,'utf8');
 decision=replaceOnce(decision,
  `    delete material.persistence.content_digest;\n  }\n  return fnv1a64(stableJson(material));`,
  `    delete material.persistence.content_digest;\n    if (material.persistence.timeline_contract === "DECISION_THEN_EXACT_D1_ACK_V1") {\n      // Only the explicitly versioned post-decision receipt changes these two\n      // fields after the immutable row is acknowledged. Legacy receipts keep\n      // their original digest and timeline contract unchanged.\n      delete material.persistence.status;\n      delete material.persistence.committed_ts;\n    }\n  }\n  return fnv1a64(stableJson(material));`,
  'EVIDENCE_REGISTRY_ACK_METADATA_EXCLUDED_FROM_CONTENT_DIGEST');
 decision=replaceOnce(decision,
  `    if (committedTs === null || committedTs > observedTs) blockers.push(\`${'${label}'}_PERSISTENCE_COMMIT_TIME_INVALID\`);`,
  `    const postDecisionAck = persistence?.timeline_contract === "DECISION_THEN_EXACT_D1_ACK_V1";\n    if (committedTs === null || (postDecisionAck ? committedTs < observedTs : committedTs > observedTs)) blockers.push(\`${'${label}'}_PERSISTENCE_COMMIT_TIME_INVALID\`);`,
  'IMMUTABLE_RECEIPT_COMMIT_RELATION');
 decision=replaceOnce(decision,
  `    content_digest: validDigest(persistence?.content_digest) ? persistence.content_digest : null,\n    committed_ts: timestamp(persistence?.committed_ts),\n    blockers: uniqSorted(blockers),`,
  `    content_digest: validDigest(persistence?.content_digest) ? persistence.content_digest : null,\n    committed_ts: timestamp(persistence?.committed_ts),\n    timeline_contract: persistence?.timeline_contract || null,\n    blockers: uniqSorted(blockers),`,
  'IMMUTABLE_RECEIPT_TIMELINE_EXPOSED');
 decision=replaceOnce(decision,
  `    if (registryCommittedTs === null || registryCommittedTs > observedTs) blockers.push("EVIDENCE_LINEAGE_REGISTRY_COMMIT_TIME_INVALID");`,
  `    const registryPostDecisionAck = registry?.persistence?.timeline_contract === "DECISION_THEN_EXACT_D1_ACK_V1";\n    if (registryCommittedTs === null || (registryPostDecisionAck ? registryCommittedTs < observedTs : registryCommittedTs > observedTs)) blockers.push("EVIDENCE_LINEAGE_REGISTRY_COMMIT_TIME_INVALID");`,
  'EVIDENCE_REGISTRY_ACK_AFTER_DECISION');
 decision=replaceOnce(decision,
  `    if (sourceRegistryCommittedTs === null || sourceRegistryCommittedTs > observedTs) blockers.push("FULL_EVIDENCE_SOURCE_REGISTRY_COMMIT_TIME_INVALID");`,
  `    const sourceRegistryPostDecisionAck = sourceRegistry?.persistence?.timeline_contract === "DECISION_THEN_EXACT_D1_ACK_V1";\n    if (sourceRegistryCommittedTs === null || (sourceRegistryPostDecisionAck ? sourceRegistryCommittedTs < observedTs : sourceRegistryCommittedTs > observedTs)) blockers.push("FULL_EVIDENCE_SOURCE_REGISTRY_COMMIT_TIME_INVALID");`,
  'SOURCE_REGISTRY_ACK_AFTER_DECISION');
 decision=replaceOnce(decision,
  `    if (committedTs === null || committedTs > observedTs) blockers.push("SAFETY_GATE_RECEIPT_COMMIT_TIME_INVALID");`,
  `    const safetyPostDecisionAck = receipt?.persistence?.timeline_contract === "DECISION_THEN_EXACT_D1_ACK_V1";\n    if (committedTs === null || (safetyPostDecisionAck ? committedTs < observedTs : committedTs > observedTs)) blockers.push("SAFETY_GATE_RECEIPT_COMMIT_TIME_INVALID");`,
  'SAFETY_ACK_AFTER_DECISION');
 decision=replaceOnce(decision,
  `    content_digest: validDigest(receipt?.content_digest) ? receipt.content_digest : null,\n    committed_ts: timestamp(receipt?.persistence?.committed_ts),\n    blockers: uniqSorted(blockers),`,
  `    content_digest: validDigest(receipt?.content_digest) ? receipt.content_digest : null,\n    committed_ts: timestamp(receipt?.persistence?.committed_ts),\n    timeline_contract: receipt?.persistence?.timeline_contract || null,\n    blockers: uniqSorted(blockers),`,
  'SAFETY_RECEIPT_TIMELINE_EXPOSED');
 decision=replaceOnce(decision,
  `  if (!validSafeId(receiptId, 256) || !validDigest(contentDigest) || committedTs === null || committedTs > observedTs) {`,
  `  const postDecisionAck = receipt?.timeline_contract === "DECISION_THEN_EXACT_D1_ACK_V1";\n  if (!validSafeId(receiptId, 256) || !validDigest(contentDigest) || committedTs === null || (postDecisionAck ? committedTs < observedTs : committedTs > observedTs)) {`,
  'ATOMIC_LINEAGE_COMMIT_RELATION');
 const lineageReplacements=[
  [`      committed_ts: evidence?.registry_committed_ts,\n    }, safeObservedTs),`,`      committed_ts: evidence?.registry_committed_ts,\n      timeline_contract: input?.evidence_registry?.persistence?.timeline_contract,\n    }, safeObservedTs),`,'LINEAGE_EVIDENCE_TIMELINE_FIRST'],
  [`      committed_ts: input?.full_evidence?.source_registry?.persistence?.committed_ts,\n    }, safeObservedTs),`,`      committed_ts: input?.full_evidence?.source_registry?.persistence?.committed_ts,\n      timeline_contract: input?.full_evidence?.source_registry?.persistence?.timeline_contract,\n    }, safeObservedTs),`,'LINEAGE_SOURCE_TIMELINE_FIRST'],
  [`      committed_ts: timestamp(input?.evidence_registry?.persistence?.committed_ts),\n      content_digest: validDigest(input?.evidence_registry?.content_digest) ? input.evidence_registry.content_digest : null,`,`      committed_ts: timestamp(input?.evidence_registry?.persistence?.committed_ts),\n      content_digest: validDigest(input?.evidence_registry?.content_digest) ? input.evidence_registry.content_digest : null,\n      timeline_contract: input?.evidence_registry?.persistence?.timeline_contract,`,'LINEAGE_EVIDENCE_TIMELINE_SECOND'],
  [`      committed_ts: timestamp(input?.full_evidence?.source_registry?.persistence?.committed_ts),\n      content_digest: validDigest(input?.full_evidence?.source_registry?.content_digest) ? input.full_evidence.source_registry.content_digest : null,`,`      committed_ts: timestamp(input?.full_evidence?.source_registry?.persistence?.committed_ts),\n      content_digest: validDigest(input?.full_evidence?.source_registry?.content_digest) ? input.full_evidence.source_registry.content_digest : null,\n      timeline_contract: input?.full_evidence?.source_registry?.persistence?.timeline_contract,`,'LINEAGE_SOURCE_TIMELINE_SECOND'],
 ];
 for(const [before,after,label] of lineageReplacements)decision=replaceOnce(decision,before,after,label);
 fs.writeFileSync(decisionFile,decision);
 return {status:'CLOSED',patched:['src/multi-wave-campaign-engine.mjs','src/final-decision-integration-engine.mjs'],minimum_reportable_move_pct:5,target_basis:'PRECOMMITTED_MEASURED_BASE',persistence_timeline:'DECISION_THEN_EXACT_D1_ACK'};
}

export default{applyRuntimePolicyPatches};
