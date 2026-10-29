// F658 one admitted offline case. Not a production import or native IO admission.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const root=process.cwd(),sha=b=>createHash('sha256').update(b).digest('hex');
const a=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),now=Date.now();
const outputRoot=path.resolve(a.output_root);
if(!outputRoot.startsWith(path.join(root,'pump-report/.private/handoffs/sources/F658')+path.sep))throw Error('F658_PRIVATE_OUTPUT_REQUIRED');
fs.mkdirSync(outputRoot,{recursive:true,mode:0o700});
const attempt=path.join(outputRoot,'attempt.json'),receipt=path.join(outputRoot,'receipt.json');
fs.writeFileSync(attempt,JSON.stringify({schema:'F658_OFFLINE_ATTEMPT_V1',started_ts:now,owner:a.own_owner,maximum_invocations:1})+'\n',{flag:'wx',mode:0o600});
globalThis.fetch=()=>{throw Error('F658_NETWORK_FORBIDDEN');};
const proof={schema:'F658_ACTUAL_SAVED_CATALOG_OFFLINE_RECEIPT_V1',status:'ATTEMPTED',authority_main:a.authority_main,
  owner:a.own_owner,started_ts:now,node_invocations:1,compare_calls:0,registry_resolves:0,negative_decisions_compared:0,
  actual_native_SQL:0,actual_provider_HTTP:0,Cloudflare_HTTP:0,Telegram:0,engine_calls:0,builds:0,stage:'ADMISSION'};
let stageId=null;
const json=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const same=(left,right,label)=>{stageId=label;assert.deepEqual(left,right,label);};
try{
  assert.equal(a.schema,'F658_SOURCE_ONE_OFFLINE_RUNTIME_ADMISSION_V1');
  assert.equal(a.status,'ADMITTED_ONE_OFFLINE_CASE');
  assert.equal(a.maximum_node_invocations,1);assert.equal(a.maximum_compare_calls,1);
  assert(Number.isSafeInteger(a.expires_ts)&&now<a.expires_ts);
  for(const [file,digest]of Object.entries(a.frozen_files))assert.equal(sha(fs.readFileSync(file)),digest,'SHA:'+file);
  const own=json(a.own_lease_file),phase=json('checkpoints/CLOUD_PHASE_STATE_20261004.json');
  assert.equal(own.owner,a.own_owner);assert.equal(own.released,false);
  assert(now<own.expires_ts&&a.expires_ts<=own.expires_ts-120000);
  assert.equal(phase.lease.owner,a.parent_owner);assert.equal(phase.lease.expires_ts,a.parent_expires_ts);
  assert.equal(phase.active_working_state.lease_released,false);assert(now<phase.lease.expires_ts);
  proof.input_file_SHA256=a.frozen_files;
  const artifact=json(a.producer_artifact),frozenRoot=path.join(outputRoot,'frozen-registry');
  fs.mkdirSync(frozenRoot,{mode:0o700});
  for(const [name,digest]of Object.entries(a.frozen_registry_modules)){
    const text=artifact.modules[name];assert.equal(typeof text,'string');assert.equal(sha(text),digest,'REGISTRY_MODULE:'+name);
    const dest=path.resolve(frozenRoot,name);assert(dest.startsWith(frozenRoot+path.sep));
    fs.mkdirSync(path.dirname(dest),{recursive:true,mode:0o700});fs.writeFileSync(dest,text,{flag:'wx',mode:0o600});
  }
  const imp=name=>import(pathToFileURL(path.join(frozenRoot,name)).href);
  const [{BINGX_IDENTITY_REGISTRY},{createReviewedNativeScopeRegistry},{REVIEWED_ROWS},
    {NON_TARGET_BUNDLE},{REACTIVATED_NEGATIVE_BUNDLE},{USDKRW_NEGATIVE_BUNDLE}]=await Promise.all([
    imp('registry/index.mjs'),imp('registry/native-reviewed550.mjs'),imp('registry/native-reviewed550-data.mjs'),
    imp('registry/native-nontarget380-data.mjs'),imp('registry/native-reactivated53-data.mjs'),imp('registry/native-usdkrw1-data.mjs')]);
  const selected=json(a.selected_scope),negative=json(a.negative_decisions),positive=json(a.verified_entries),expected=json(a.expected),observer=json(a.packet);
  const {stableCapturedJSON}=await import(pathToFileURL(path.join(root,'pump-report/sources/captured-bulk-price-coverage.mjs')).href);
  assert.equal(sha(stableCapturedJSON(selected)),expected.selected_scope_canonical_sha256);
  assert.equal(sha(stableCapturedJSON(negative)),expected.negative_decisions_canonical_sha256);
  assert.equal(sha(stableCapturedJSON(positive)),expected.verified_entries_canonical_sha256);
  proof.stage='FROZEN_REGISTRY_COHERENCE';
  const registry=createReviewedNativeScopeRegistry(BINGX_IDENTITY_REGISTRY);
  const ids=[...BINGX_IDENTITY_REGISTRY.map(e=>e.instrument.instrument_id),
    ...REVIEWED_ROWS.map(([id,base,symbol])=>'BINGX:USDT_M:'+id+':'+symbol)];
  assert.equal(ids.length,552);assert.equal(new Set(ids).size,552);assert.equal(positive.length,552);
  same([...positive.map(e=>e.instrument.instrument_id)].sort(),[...ids].sort(),'ALL552_IDS');
  for(const p of positive){
    stageId=p.instrument.instrument_id;
    const full=registry.resolve({instrument_id:p.instrument.instrument_id});proof.registry_resolves++;
    assert(full,'MISSING_FROZEN_POSITIVE:'+stageId);
    for(const k of ['instrument','native_contract_id','native_base','family'])same(p[k],full[k],stageId+':'+k);
    same(p.qualifications?.orderbook??null,full.qualifications?.orderbook??null,stageId+':orderbook');
  }
  const fullNeg=[...NON_TARGET_BUNDLE.decisions,...REACTIVATED_NEGATIVE_BUNDLE.decisions,...USDKRW_NEGATIVE_BUNDLE.decisions];
  same([NON_TARGET_BUNDLE.decisions.length,REACTIVATED_NEGATIVE_BUNDLE.decisions.length,USDKRW_NEGATIVE_BUNDLE.decisions.length],[380,53,1],'NEGATIVE_BUNDLE_SIZES');
  assert.equal(negative.length,434);
  for(let n=0;n<fullNeg.length;n++){same(negative[n],fullNeg[n],'NEGATIVE:'+fullNeg[n].decision_id);proof.negative_decisions_compared++;}
  proof.positive_projection_coherent=true;proof.negative_objects_coherent=true;
  proof.stage='ONE_COMPARISON';stageId=null;
  const {compareSavedCatalogScope}=await import(pathToFileURL(path.join(root,a.consumer)).href);
  proof.compare_calls++;
  const result=compareSavedCatalogScope({observer,expected,selected_scope:selected,negative_decisions:negative,
    verified_entries:positive,sha256:sha,evidence_mode:'OBSERVED'});
  const resultRaw=JSON.stringify(result,null,2)+'\n',resultPath=path.join(outputRoot,'comparison-result.json');
  fs.writeFileSync(resultPath,resultRaw,{flag:'wx',mode:0o600});
  proof.result_path=resultPath;proof.result_SHA256=sha(resultRaw);proof.result_file_bytes=Buffer.byteLength(resultRaw);
  proof.result_compact_bytes=Buffer.byteLength(JSON.stringify(result));
  proof.actual_summary=result.summary;proof.actual_disposition_counts=result.disposition_counts;
  proof.actual_missing_or_changed_identity=result.missing_or_changed_identity;proof.provenance=result.provenance;
  proof.stage='COHERENCE_ASSERTIONS';
  for(const [k,v]of Object.entries(a.predicted_summary))same(result.summary[k],v,'SUMMARY:'+k);
  for(const [k,v]of Object.entries(a.predicted_dispositions))same(result.disposition_counts[k]??0,v,'DISPOSITION:'+k);
  const rows=observer.catalog_snapshot.private_evidence.snapshot.body.data;
  assert.equal(result.rows.length,rows.length);
  for(let n=0;n<rows.length;n++){assert.equal(result.rows[n].row_index,n);assert.equal(result.rows[n].native_symbol,rows[n].symbol);}
  proof.all_raw_symbols_preserved=true;proof.non_ASCII_symbols=rows.filter(r=>!/^[\x00-\x7F]*$/.test(r.symbol)).length;
  same(result.missing_or_changed_identity.map(r=>r.instrument_id).sort(),a.predicted_missing_ids.slice().sort(),'MISSING_IDENTITIES');
  assert(result.missing_or_changed_identity.every(r=>r.disposition==='NOT_PRESENT_IN_CAPTURE'&&r.row_indices.length===0&&r.not_unsupported));
  assert.equal(result.current_global_crypto_N,null);assert.equal(result.current_global_N_proven,false);
  assert.equal(result.new_registry_decisions,0);assert.equal(result.unknown_is_not_unsupported,true);
  assert(result.rows.every(r=>r.current_CORE_proven===false&&r.market_data_checked===false));
  assert.equal(result.actual_native_SQL,0);assert.equal(result.actual_provider_HTTP,0);assert.equal(result.engine_calls,0);assert.equal(result.Telegram,0);
  assert.equal(result.provenance.producer_pin,expected.implementation_sha256);
  assert.equal(result.provenance.producer_received_ts,expected.received_ts);
  assert.equal(result.provenance.producer_receipt_id,expected.receipt_id);
  assert.equal(result.provenance.observed_ts,expected.observed_ts);assert.equal(result.provenance.as_of_ts,expected.as_of_ts);
  assert(Date.now()<a.expires_ts);proof.status='PASS';proof.stage='COMPLETE';
}catch(error){
  proof.status='FAIL';proof.failure_stage=proof.stage;proof.failure_label=stageId;
  proof.error=String(error.message??error).slice(0,12000);process.exitCode=1;
}
proof.completed_ts=Date.now();
proof.limitations=['Original saved ca0 catalog capture only; not current272 membership/globalN.',
  'Deep eligible means saved unit-evidence admission, not current native CORE/book data.',
  'No market/SQL/Telegram IO or new taxonomy qualification; exactly one admitted case, no retry.'];
fs.writeFileSync(receipt,JSON.stringify(proof,null,2)+'\n',{flag:'wx',mode:0o600});
fs.writeFileSync(path.join(outputRoot,'completion.json'),JSON.stringify({status:proof.status,receipt_SHA256:sha(fs.readFileSync(receipt)),
  compare_calls:proof.compare_calls,completed_ts:proof.completed_ts,no_retry:true})+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({status:proof.status,stage:proof.stage,failure_label:proof.failure_label??null,error:proof.status==='FAIL'?proof.error:null,
  compare_calls:proof.compare_calls,registry_resolves:proof.registry_resolves,negative_compared:proof.negative_decisions_compared,
  summary:proof.actual_summary??null,dispositions:proof.actual_disposition_counts??null,result_SHA256:proof.result_SHA256??null,
  result_compact_bytes:proof.result_compact_bytes??null,receipt_path:receipt,receipt_SHA256:sha(fs.readFileSync(receipt)),
  native_SQL:0,provider_HTTP:0,engine:0,build:0,Telegram:0}));
