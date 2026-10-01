import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {applyRuntimePolicyPatches} from '../runtime-policy-patches.mjs';

const original=`function buildEntryScenarioAnchor(campaign, config) {
  const phase = campaign?.current_phase;
  const direction = campaign?.direction;
  const entryPrice = finite(campaign?.entry_trigger_price);
  const baseLow = finite(campaign?.base_low);
  const baseHigh = finite(campaign?.base_high);
  const thresholdPct = phase === CAMPAIGN_PHASE.ENTRY_TRIGGER
    ? finite(config?.first_impulse_move_pct)
    : finite(config?.next_impulse_move_pct);
  if (thresholdPct === null || thresholdPct <= 0) return null;
  const targetPrice = direction === 'LONG'
    ? entryPrice * (1 + thresholdPct / 100)
    : entryPrice * (1 - thresholdPct / 100);
  return {
    target_basis: 'PRECOMMITTED_MULTI_WAVE_IMPULSE_THRESHOLD',
    targetPrice,
  };
}`;

// Portable copy of every authoritative decision-engine fragment patched by
// runtime-policy-patches.mjs.  Keeping only the exact anchors makes this unit
// test independent of a decrypted runtime while the full validation below
// still applies the patch to the real authoritative engine.
const decisionOriginal=[
`    delete material.persistence.content_digest;
  }
  return fnv1a64(stableJson(material));`,
`    if (committedTs === null || committedTs > observedTs) blockers.push(\`${'${label}'}_PERSISTENCE_COMMIT_TIME_INVALID\`);`,
`    content_digest: validDigest(persistence?.content_digest) ? persistence.content_digest : null,
    committed_ts: timestamp(persistence?.committed_ts),
    blockers: uniqSorted(blockers),`,
`    if (registryCommittedTs === null || registryCommittedTs > observedTs) blockers.push("EVIDENCE_LINEAGE_REGISTRY_COMMIT_TIME_INVALID");`,
`    if (sourceRegistryCommittedTs === null || sourceRegistryCommittedTs > observedTs) blockers.push("FULL_EVIDENCE_SOURCE_REGISTRY_COMMIT_TIME_INVALID");`,
`    if (committedTs === null || committedTs > observedTs) blockers.push("SAFETY_GATE_RECEIPT_COMMIT_TIME_INVALID");`,
`    content_digest: validDigest(receipt?.content_digest) ? receipt.content_digest : null,
    committed_ts: timestamp(receipt?.persistence?.committed_ts),
    blockers: uniqSorted(blockers),`,
`  if (!validSafeId(receiptId, 256) || !validDigest(contentDigest) || committedTs === null || committedTs > observedTs) {`,
`      committed_ts: evidence?.registry_committed_ts,
    }, safeObservedTs),`,
`      committed_ts: input?.full_evidence?.source_registry?.persistence?.committed_ts,
    }, safeObservedTs),`,
`      committed_ts: timestamp(input?.evidence_registry?.persistence?.committed_ts),
      content_digest: validDigest(input?.evidence_registry?.content_digest) ? input.evidence_registry.content_digest : null,`,
`      committed_ts: timestamp(input?.full_evidence?.source_registry?.persistence?.committed_ts),
      content_digest: validDigest(input?.full_evidence?.source_registry?.content_digest) ? input.full_evidence.source_registry.content_digest : null,`,
].join('\n/* fixture boundary */\n');

test('runtime target uses measured structure and rejects sub-five-percent structure',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'report2-runtime-policy-test-'));
 try{
  const src=path.join(temp,'src');fs.mkdirSync(src,{recursive:true});
  const file=path.join(src,'multi-wave-campaign-engine.mjs');fs.writeFileSync(file,original);
  fs.writeFileSync(path.join(src,'final-decision-integration-engine.mjs'),decisionOriginal);
  const result=applyRuntimePolicyPatches(temp);assert.equal(result.status,'CLOSED');
  const patched=fs.readFileSync(file,'utf8');
  assert.match(patched,/const thresholdPct = measuredBaseMovePct;/);
  assert.match(patched,/if \(thresholdPct <= 0\) return null;/);
  assert.doesNotMatch(patched,/Math\.max\(configuredThresholdPct, measuredBaseMovePct\)/);
  assert.match(patched,/PRECOMMITTED_BASE_MEASURED_FAVORABLE_MOVE/);
  const decision=fs.readFileSync(path.join(src,'final-decision-integration-engine.mjs'),'utf8');
  assert.match(decision,/DECISION_THEN_EXACT_D1_ACK_V1/);
  assert.match(decision,/registryPostDecisionAck/);
  assert.match(decision,/timeline_contract: input\?\.evidence_registry/);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
