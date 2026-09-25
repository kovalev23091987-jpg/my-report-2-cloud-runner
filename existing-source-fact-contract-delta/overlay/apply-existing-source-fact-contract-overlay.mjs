import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));const runtime=path.resolve(process.argv[2]||'runtime');
const target=path.join(runtime,'src/canonical-runtime-adapter.mjs'),newTarget=path.join(runtime,'src/inherited-fact-contract.mjs'),source=path.join(here,'src/inherited-fact-contract.mjs');
const BEFORE='a59376bd384d1686064361a54e47b58d3863031de0670b45e60e0f558a23a71d';const AFTER='d8fc61a37d829af382ab6e52eb73f3494aac791bbcd2ef1ba459482ce6e0f016';const MODULE_SHA='b5735d261a3c5ada118b6a530536422ddbe2811373054d1c4ea53a80a8f732a5';
const VERSION_OLD="export const CANONICAL_RUNTIME_ADAPTER_VERSION='canonical-runtime-adapter-v4-existing-source-consumer-20260925';";
const VERSION_NEW="export const CANONICAL_RUNTIME_ADAPTER_VERSION='canonical-runtime-adapter-v5-rich-fact-contract-20260925';";
const IMPORT_OLD="import { consumeExistingSourceReceipts } from './existing-source-consumer.mjs';";
const IMPORT_NEW=IMPORT_OLD+"\nimport { normalizeInheritedFactEnvelope } from './inherited-fact-contract.mjs';";
const RECEIPTS_OLD=`function sourceReceipts(publicEvidence){
 return arr(publicEvidence?.evidence).slice(0,48).map(e=>({
  metric:e?.metric??null,source:e?.source??null,venue:e?.venue??null,status:e?.status??null,
  source_ts:e?.source_ts??null,observed_ts:e?.observed_ts??null,value:e?.value??null,unit:e?.unit??null,
  reason_code:e?.reason_code??null,coverage_pct:e?.coverage_pct??null,
 }));
}`;
const RECEIPTS_NEW=`function sourceReceipts(publicEvidence){
 const rows=arr(publicEvidence?.evidence).slice(0,48);
 return normalizeInheritedFactEnvelope(rows,{
  default_contract_code:publicEvidence?.contract_code??null,
  default_observed_ts:publicEvidence?.observed_ts??null,
  default_quality_status:publicEvidence?.dq_status??publicEvidence?.data_quality?.status??'UNKNOWN',
 }).facts;
}`;
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
if(!fs.existsSync(target)||!fs.existsSync(source))throw new Error('FACT_CONTRACT_OVERLAY_SOURCE_OR_TARGET_MISSING');
const sourceSha=sha(source);if(sourceSha!==MODULE_SHA)throw new Error(`FACT_CONTRACT_MODULE_HASH_MISMATCH:${sourceSha}`);
let text=fs.readFileSync(target,'utf8');
if(text.includes(VERSION_NEW)&&text.includes("normalizeInheritedFactEnvelope")){
  if(sha(target)!==AFTER)throw new Error(`FACT_CONTRACT_AFTER_HASH_MISMATCH:${sha(target)}`);if(!fs.existsSync(newTarget)||sha(newTarget)!==sourceSha)throw new Error('FACT_CONTRACT_PARTIAL_ALREADY_STATE');
  const proof={version:'existing-source-fact-contract-overlay-v1-20260925',status:'ALREADY_APPLIED',base_candidate_sha:'31ada6f72d6f7dd36615478922dbc45309322b28',production_base:'08d98579c5ecbeb4de426ffeb1160f25ece52708',before_sha256:BEFORE,after_sha256:sha(target),module_sha256:sourceSha,production_changed:false,d1_migration:false,telegram_send:false,telegram_recipients_changed:false,cloudflare_deploy:false,force_push:false,hard_gates_changed:false,strategy_weights_changed:false,thresholds_changed:false,automatic_execution:false,validated_signal:false,live_probability:false,new_sources_added:false,worker_copy_added:false,hot_cycle_external_request_delta:0};
  fs.writeFileSync(path.join(runtime,'existing-source-fact-contract-overlay-proof.json'),JSON.stringify(proof,null,2)+'\n');console.log('EXISTING_SOURCE_FACT_CONTRACT_OVERLAY_APPLIED',JSON.stringify(proof));process.exit(0);
}
const current=sha(target);if(current!==BEFORE)throw new Error(`FACT_CONTRACT_TARGET_HASH_MISMATCH:${current}`);
if(!text.includes(IMPORT_OLD)||!text.includes(VERSION_OLD)||!text.includes(RECEIPTS_OLD))throw new Error('FACT_CONTRACT_PATCH_ANCHOR_MISSING');
text=text.replace(IMPORT_OLD,IMPORT_NEW).replace(VERSION_OLD,VERSION_NEW).replace(RECEIPTS_OLD,RECEIPTS_NEW);
const tmp=`${target}.fact-contract.tmp`,backup=`${target}.fact-contract.bak`;
fs.writeFileSync(tmp,text);fs.copyFileSync(target,backup);
try{
 fs.renameSync(tmp,target);fs.copyFileSync(source,newTarget);if(sha(target)!==AFTER)throw new Error(`FACT_CONTRACT_AFTER_HASH_MISMATCH:${sha(target)}`);
 const proof={version:'existing-source-fact-contract-overlay-v1-20260925',status:'APPLIED',base_candidate_sha:'31ada6f72d6f7dd36615478922dbc45309322b28',production_base:'08d98579c5ecbeb4de426ffeb1160f25ece52708',before_sha256:BEFORE,after_sha256:sha(target),module_sha256:sha(newTarget),production_changed:false,d1_migration:false,telegram_send:false,telegram_recipients_changed:false,cloudflare_deploy:false,force_push:false,hard_gates_changed:false,strategy_weights_changed:false,thresholds_changed:false,automatic_execution:false,validated_signal:false,live_probability:false,new_sources_added:false,worker_copy_added:false,hot_cycle_external_request_delta:0};
 fs.rmSync(backup,{force:true});fs.writeFileSync(path.join(runtime,'existing-source-fact-contract-overlay-proof.json'),JSON.stringify(proof,null,2)+'\n');console.log('EXISTING_SOURCE_FACT_CONTRACT_OVERLAY_APPLIED',JSON.stringify(proof));
}catch(e){fs.rmSync(target,{force:true});if(fs.existsSync(backup))fs.renameSync(backup,target);fs.rmSync(newTarget,{force:true});fs.rmSync(tmp,{force:true});throw e;}
