import {createHash} from 'node:crypto';
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
  // The target exists only when the prospectively measured base itself supports
  // a favorable move. No fixed percentage is imposed on that measured target.
  // The configured impulse threshold still controls phase transitions, but it
  // cannot stretch the displayed target beyond measured market structure.
  const thresholdPct = measuredBaseMovePct;
  if (thresholdPct <= 0) return null;
  const targetPrice = direction === 'LONG'
    ? entryPrice * (1 + thresholdPct / 100)
    : entryPrice * (1 - thresholdPct / 100);`,'MEASURED_BASE_TARGET');
 source=replaceOnce(source,`    target_basis: 'PRECOMMITTED_MULTI_WAVE_IMPULSE_THRESHOLD',`,`    target_basis: 'PRECOMMITTED_BASE_MEASURED_FAVORABLE_MOVE',`,'MEASURED_BASE_TARGET_BASIS');
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
 const relayFile=path.join(runtime,'src/v3-telegram-delivery-sidecar.mjs');
 let relay=fs.readFileSync(relayFile,'utf8');
 relay=replaceOnce(relay,"import {claimLifecycleDispatch,finalizeLifecycleDispatch} from './v3-telegram-runtime.mjs';\nimport {renderPipelineHealthMessage,classifyHealthDelivery}","import {claimLifecycleDispatch,finalizeLifecycleDispatch} from './v3-telegram-runtime.mjs';\nimport {confirmedRelayReceipt} from './telegram-delivery-receipt.mjs';\nimport {renderPipelineHealthMessage,classifyHealthDelivery}",'TELEGRAM_RELAY_RECEIPT_IMPORT');
 relay=replaceOnce(relay,"    if(response.ok&&body?.ok===true)return {ok:true,network_result:'CONFIRMED_SENT',status:text(body.status)||'SENT',message_id:body.message_id??null,http_status:response.status};","    const receipt=response.ok?confirmedRelayReceipt(body):null;\n    if(receipt)return {ok:true,network_result:'CONFIRMED_SENT',status:'SENT',message_id:receipt.message_id,http_status:response.status};",'TELEGRAM_RELAY_POSITIVE_MESSAGE_RECEIPT');
 fs.writeFileSync(relayFile,relay);
 return {status:'CLOSED',patched:['src/multi-wave-campaign-engine.mjs','src/final-decision-integration-engine.mjs','src/v3-telegram-delivery-sidecar.mjs'],minimum_reportable_move_pct:null,target_basis:'PRECOMMITTED_MEASURED_BASE_NO_FIXED_MINIMUM',persistence_timeline:'DECISION_THEN_EXACT_D1_ACK',telegram_delivery:'POSITIVE_MESSAGE_ID_REQUIRED'};
}

export default{applyRuntimePolicyPatches};

// One hash-bound private-sidecar edit. Full private source is never exported.
const REALIZED_EMPTY_ADDITION = "    const emptyUsage = usageDelta(before, after);\n    if (emptyUsage && (\n      emptyUsage.rows_read > V3_REALIZED_LIQUIDATION_SIDECAR_BUDGET.rows_read ||\n      emptyUsage.rows_written > V3_REALIZED_LIQUIDATION_SIDECAR_BUDGET.rows_written ||\n      emptyUsage.unknown_ops > 0\n    )) {\n      return {\n        ...base,\n        status: 'BUDGET_ENVELOPE_EXCEEDED_FAIL_CLOSED',\n        events_loaded: normalized.length,\n        contracts_selected: 0,\n        persisted: 0,\n        usage_delta: emptyUsage,\n      };\n    }\n";
const realizedHash = value => createHash('sha256').update(value).digest('hex');
const realizedBeforeHash = 'a56b7b9f2908648c19bfc4ff30f1d2f22bc202365eef1a1a7c858a20360e648a';
function realizedEmptyForward(source){
 if(Buffer.byteLength(source)!==6995||realizedHash(source)!==realizedBeforeHash||/\bemptyUsage\b/.test(source))throw Error('REALIZED_EMPTY_GUARD_ORIGINAL_CHANGED');
 const lines=source.split('\n'),locate=h=>lines.flatMap((line,index)=>realizedHash(line)===h?[index]:[]),empty=locate('87b8bdfd550ed6fc354c02389cec010beb27933a09f6b5b4b3de131eaf03a2ad'),guard=locate('101e7285580ee15a8cf48f64bce554815123c54efe0f5e4446f973166ae58c8e');
 if(empty.length!==1||guard.length!==1||empty[0]>=guard[0]||realizedHash(REALIZED_EMPTY_ADDITION)!=='df8fdf4bc4b31f93468d082e616b92455d58b3bfe6e50d65c559d5197ad783e0')throw Error('REALIZED_EMPTY_GUARD_BINDING_CHANGED');
 const compact=v=>v.replace(/\s/g,''),oldPredicate=lines[guard[0]].match(/if\((.+)\)return /)?.[1],start=REALIZED_EMPTY_ADDITION.indexOf('if ('),end=REALIZED_EMPTY_ADDITION.indexOf(') {',start);
 if(!oldPredicate||start<0||end<=start||compact(REALIZED_EMPTY_ADDITION.slice(start+4,end))!==compact(oldPredicate).replace(/\bdelta\b/g,'emptyUsage'))throw Error('REALIZED_EMPTY_GUARD_PREDICATES_CHANGED');
 const old=lines[empty[0]];if(old.split(';return ').length!==2||old.split('usageDelta(before,after)').length!==2)throw Error('REALIZED_EMPTY_GUARD_GRAMMAR_CHANGED');
 const cut=old.indexOf(';return ')+1;lines[empty[0]]=old.slice(0,cut)+'\n'+REALIZED_EMPTY_ADDITION.trimEnd()+'\n'+old.slice(cut).replace('usageDelta(before,after)','emptyUsage');
 if(realizedHash(lines[empty[0]])!=='1af31db34d4202707df25d09d33b71ecad3ff981822d9d6ccae115f9eeb4b68d')throw Error('REALIZED_EMPTY_GUARD_BLOCK_CHANGED');
 const after=lines.join('\n');if(Buffer.byteLength(after)!==7497)throw Error('REALIZED_EMPTY_GUARD_BYTES_CHANGED');return after;
}
function realizedEmptyOriginal(source){
 const token='\n'+REALIZED_EMPTY_ADDITION.trimEnd()+'\n',at=source.indexOf(token);if(Buffer.byteLength(source)!==7497||at<0||source.indexOf(token,at+token.length)>=0)throw Error('REALIZED_EMPTY_GUARD_AFTER_NOT_BOUND');
 const rest=source.slice(at+token.length),end=rest.indexOf('\n'),suffix=end<0?rest:rest.slice(0,end),expression=REALIZED_EMPTY_ADDITION.match(/const emptyUsage = ([^;]+);/)?.[1]?.replace(/\s/g,'');
 if(!expression||suffix.split('emptyUsage').length!==2)throw Error('REALIZED_EMPTY_GUARD_AFTER_GRAMMAR');
 const before=source.slice(0,at)+suffix.replace('emptyUsage',expression)+(end<0?'':rest.slice(end));
 if(realizedHash(before)!==realizedBeforeHash||realizedEmptyForward(before)!==source)throw Error('REALIZED_EMPTY_GUARD_AFTER_NOT_EXACT');return before;
}
export function applyRealizedEmptyBudgetGuard(runtime,{verifyOnly=false}={}){
 const file=path.join(runtime,'src/v3-realized-liquidation-sidecar.mjs'),bytes=fs.readFileSync(file),source=bytes.toString('utf8');if(!Buffer.from(source).equals(bytes))throw Error('REALIZED_EMPTY_GUARD_UTF8_CHANGED');
 if(realizedHash(source)===realizedBeforeHash){if(verifyOnly)throw Error('REALIZED_EMPTY_GUARD_NOT_APPLIED');const after=realizedEmptyForward(source);fs.writeFileSync(file,after);return{status:'APPLIED',before_sha256:realizedBeforeHash,after_sha256:realizedHash(after),after_bytes:7497,private_source_exported:false};}
 realizedEmptyOriginal(source);return{status:'ALREADY_APPLIED_EXACT',before_sha256:realizedBeforeHash,after_sha256:realizedHash(source),after_bytes:7497,private_source_exported:false};
}
