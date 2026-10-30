import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const sha=x=>createHash('sha256').update(x).digest('hex');
const json=x=>JSON.parse(JSON.stringify(x));
const CAP=1048576,CONTRACT='BTC-USDT',T=1792520000000;
const URL_1M='https://api.hbdm.com/linear-swap-ex/market/history/kline?contract_code=BTC-USDT&period=1min&size=1600';

// One NEW affected case. No top-level call, test registration, provider or SQL.
// Both runtime roots are full assembled src directories, never repositories.
export async function runBodyCompletionIngressConnected({runtime_root,baseline_runtime_root,repo_root}={}){
 assert.ok(runtime_root&&baseline_runtime_root&&repo_root,'three explicit roots required');
 const own=path.join(repo_root,'anomaly-research/body-completion-ingress-20261020');
 const targets=JSON.parse(fs.readFileSync(path.join(own,'proposal-targets.json'),'utf8'));
 const deps=JSON.parse(fs.readFileSync(path.join(own,'dependency-pins.json'),'utf8'));
 const roots=[{label:'baseline',root:baseline_runtime_root,side:'before'},{label:'candidate',root:runtime_root,side:'after'}];
 assert.notEqual(fs.realpathSync(runtime_root),fs.realpathSync(baseline_runtime_root));
 const pins=[];
 for(const r of roots){
  for(const t of targets.targets){const b=fs.readFileSync(path.join(r.root,t.runtime_relative));assert.equal(b.length,t[r.side].bytes,t.path);assert.equal(sha(b),t[r.side].sha256,t.path);pins.push({runtime:r.label,file:t.runtime_relative,sha256:sha(b)});}
  for(const d of deps.files){const b=fs.readFileSync(path.join(r.root,d.runtime_relative));assert.equal(b.length,d.bytes,d.runtime_relative);assert.equal(sha(b),d.sha256,d.runtime_relative);}
 }
 const reports=[],originalNow=Date.now,originalFetch=globalThis.fetch;
 let clock=T,unexpectedHTTP=0,SQL=0,dbAdmissionCalls=0;
 globalThis.fetch=async()=>{unexpectedHTTP++;throw Error('UNEXPECTED_EXTERNAL_HTTP');};
 Date.now=()=>clock;
 try{
  const loaded=[];
  for(const r of roots){
   const tape=await import(pathToFileURL(path.join(r.root,'htx-signed-tape.mjs')).href);
   const parser=await import(pathToFileURL(path.join(r.root,'htx-trade-json.mjs')).href);
   const carrier=await import(pathToFileURL(path.join(r.root,'source-closure-diagnostics.mjs')).href);
   const worker=fs.readFileSync(path.join(r.root,'worker.js'),'utf8');
   const start=worker.indexOf('async function fetchJson(url) {'),end=worker.indexOf('\nfunction createPerDeepCheckFetchCache(',start+1);
   assert.ok(start>=0&&end>start,'actual named fetchJson boundaries');
   assert.equal(worker.indexOf('async function fetchJson(url) {',start+1),-1,'unique producer');
   const source=worker.slice(start,end).trim();
   assert.ok(source.endsWith('}'),'complete actual producer source');
   const db={prepare(){SQL++;throw Error('UNEXPECTED_SQL');}};
   const project=async(now=clock)=>{
    const receipt=await tape.persistCapturedHtxSignedTape({db,contract:CONTRACT,now,db_admit(){dbAdmissionCalls++;return{allowed:false,status:'CONTROLLED_NOT_ADMITTED'};}});
    const flow=tape.capturedSignedTapeFourHourFlow({contract:CONTRACT,now});
    const diagnostic=carrier.buildHtxFlowClosureDiagnostic({contract:CONTRACT,now,signed_flow:flow,trajectory:{}});
    return{receipt:json(receipt),flow:json(flow),diagnostic:json(diagnostic),retained:json(carrier.retainHtxFlowClosureDiagnostic(diagnostic))};
   };
   const producer=fetchImpl=>vm.runInNewContext('('+source+')',{
    Date,fetch:fetchImpl,AbortController,
    setTimeout:()=>1,clearTimeout:()=>{},
    observeHtxAcquisitionAttempt:tape.observeHtxAcquisitionAttempt,
    parseHtxMarketJson:parser.parseHtxMarketJson,
   },{filename:'CONTROLLED-exact-'+r.label+'-fetchJson.mjs'});
   loaded.push({...r,tape,carrier,project,producer,producer_sha256:sha(source)});
  }
  const [baseline,candidate]=loaded;
  const payload={status:'ok',ch:'market.BTC-USDT.kline.1min',ts:T-1000,data:[{id:Math.floor(T/60000)*60-60,open:1,high:1,low:1,close:1,vol:0,amount:0,trade_turnover:0,count:0}],note:'контрольный текст'};
  const raw=JSON.stringify(payload),expectedHash=sha(raw);
  const delayed=async r=>{
   r.tape.clearHtxSignedTapeSnapshots();clock=T;
   let release,bodyStarted=false,fetches=0,reads=0;
   const wait=new Promise(resolve=>{release=resolve;});
   const fetcher=r.producer(async()=>{fetches++;clock=T+2;return{ok:true,status:200,async text(){reads++;bodyStarted=true;await wait;return raw;}};});
   const pending=fetcher(URL_1M);
   for(let i=0;i<8&&!bodyStarted;i++)await Promise.resolve();
   assert.equal(bodyStarted,true,'body reader entered');
   const before=await r.project(T+2),a=before.flow.raw_acquisition_diagnostic.source_clocks.minutes.attempt;
   assert.equal(a.stage,'HTTP_RESPONSE');assert.equal(a.received_ts,T+2);
   if(r.label==='candidate'){assert.equal(a.body_knowledge.body_completed_ts,null);assert.equal(a.body_knowledge.body_text_sha256,null);}
   clock=T+11;release();const result=json(await pending),after=await r.project(T+12);
   assert.equal(fetches,1);assert.equal(reads,1);assert.equal(result.ok,true);assert.deepEqual(result.data,payload);
   return{result,before,after,fetches,reads};
  };
  const old=await delayed(baseline),next=await delayed(candidate);
  assert.deepEqual(next.result,old.result,'producer return unchanged');
  const oa=old.after.flow.raw_acquisition_diagnostic.source_clocks.minutes,na=next.after.flow.raw_acquisition_diagnostic.source_clocks.minutes;
  assert.equal(na.source_ts,payload.ts);assert.equal(na.received_ts,T+11,'legacy parse-observed clock retained');
  assert.equal(na.attempt.started_ts,T);assert.equal(na.attempt.received_ts,T+2,'header remains earlier than body');
  const {body_knowledge,...oldShape}=na.attempt;assert.deepEqual(oldShape,oa.attempt,'old attempt fields exact');
  assert.equal(Object.hasOwn(oa.attempt,'body_knowledge'),false);
  assert.deepEqual(body_knowledge,{body_completed_ts:T+11,body_text_utf8_bytes:Buffer.byteLength(raw),body_text_sha256:expectedHash,hash_scope:'SHA256_UTF8_RESPONSE_TEXT',hash_status:'TEXT_HASH_RECORDED'});
  assert.deepEqual(next.after.diagnostic.minute_body_knowledge,body_knowledge);
  assert.deepEqual(next.after.retained,next.after.diagnostic,'actual retainer preserves metadata');
  assert.deepEqual(json(JSON.parse(JSON.stringify(next.after.retained))),next.after.diagnostic,'existing JSON carrier');
  const {minute_body_knowledge,...legacyDiagnostic}=next.after.diagnostic;assert.deepEqual(legacyDiagnostic,old.after.diagnostic,'old complete carrier fields exact');
  assert.ok(!JSON.stringify(body_knowledge).includes('контрольный'),'raw text absent');
  reports.push({id:'ACTUAL_FETCHJSON_DELAYED_BODY_TO_EXISTING_JSON',classification:'CONTROLLED',old_producer_source:baseline.producer_sha256,candidate_producer_source:candidate.producer_sha256,source_ts:na.source_ts,header_received_ts:na.attempt.received_ts,legacy_parse_observed_ts:na.received_ts,body_knowledge,fetches_each:1,text_reads_each:1,old_return_equal:true,old_carrier_fields_equal:true});

  // Additional assertions belong to the same new affected case, not old suites.
  const immediate=async({text=raw,rejectBody=false,url=URL_1M}={})=>{
   candidate.tape.clearHtxSignedTapeSnapshots();clock=T;
   let reads=0;
   const fetcher=candidate.producer(async()=>{clock=T+2;return{ok:true,status:200,async text(){reads++;clock=T+11;if(rejectBody)throw Error('CONTROLLED_READ_FAILURE');return text;}};});
   const result=json(await fetcher(url)),p=await candidate.project(T+12);
   return{result,p,reads,attempt:p.flow.raw_acquisition_diagnostic.source_clocks.minutes.attempt};
  };
  const failed=await immediate({rejectBody:true});
  assert.equal(failed.result.ok,false);assert.equal(failed.attempt.stage,'BODY_READ_FAILED');assert.equal(failed.attempt.body_knowledge.body_completed_ts,null);assert.equal(failed.attempt.body_knowledge.body_text_sha256,null);
  reports.push({id:'BODY_READ_FAILURE_REMAINS_UNKNOWN',stage:failed.attempt.stage,body_knowledge:failed.attempt.body_knowledge});
  const invalid=await immediate({text:'{invalid UTF8 decoded JSON ж'});
  assert.equal(invalid.result.error,'invalid_json');assert.equal(invalid.attempt.stage,'JSON_PARSE_FAILED');assert.equal(invalid.attempt.body_knowledge.body_completed_ts,T+11);assert.equal(invalid.attempt.body_knowledge.body_text_sha256,sha('{invalid UTF8 decoded JSON ж'));
  reports.push({id:'COMPLETE_TEXT_DOES_NOT_MEAN_VALID_JSON',stage:invalid.attempt.stage,body_knowledge:invalid.attempt.body_knowledge});
  const tiny=JSON.stringify({status:'ok',ch:'market.BTC-USDT.kline.1min',ts:T-1000,data:[]});
  const atCap=tiny+' '.repeat(CAP-Buffer.byteLength(tiny));
  const cap=await immediate({text:atCap});assert.equal(cap.result.ok,true);assert.equal(cap.attempt.body_knowledge.body_text_utf8_bytes,CAP);assert.equal(cap.attempt.body_knowledge.body_text_sha256,sha(atCap));
  const over=await immediate({text:atCap+' '});assert.equal(over.result.ok,true);assert.equal(over.attempt.body_knowledge.body_completed_ts,T+11);assert.equal(over.attempt.body_knowledge.body_text_sha256,null);assert.equal(over.attempt.body_knowledge.body_text_utf8_bytes,null);assert.equal(over.attempt.body_knowledge.hash_status,'TEXT_HASH_BOUND_REACHED');
  const unicode=JSON.stringify({status:'ok',ch:'market.BTC-USDT.kline.1min',ts:T-1000,data:[],note:'я'.repeat(Math.floor(CAP/2))});
  assert.ok(unicode.length<CAP&&Buffer.byteLength(unicode)>CAP,'UTF8 bound differs from code units');
  const utf=await immediate({text:unicode});assert.equal(utf.result.ok,true);assert.equal(utf.attempt.body_knowledge.body_text_sha256,null);assert.equal(utf.attempt.body_knowledge.hash_status,'TEXT_HASH_BOUND_REACHED');
  reports.push({id:'HASH_BOUND_AND_UTF8_NOT_PARSER_BOUND',at_cap:cap.attempt.body_knowledge,over_cap:over.attempt.body_knowledge,multibyte_over_cap:utf.attempt.body_knowledge,legacy_parser_ok_all:true});

  const observe=async args=>{
   candidate.tape.clearHtxSignedTapeSnapshots();clock=T+12;
   candidate.tape.observeHtxAcquisitionAttempt({url:URL_1M,started_ts:T,received_ts:T+2,http_status:200,stage:'COMPLETED',...args});
   return candidate.project(T+12);
  };
  const legacy=await observe({});assert.equal(legacy.diagnostic.minute_body_knowledge.body_completed_ts,null);assert.equal(legacy.diagnostic.minute_body_knowledge.body_text_sha256,null);
  const backwards=await observe({body_completed_ts:T+1,body_text:raw});assert.equal(backwards.diagnostic.minute_body_knowledge.body_completed_ts,null);assert.equal(backwards.diagnostic.minute_body_knowledge.body_text_sha256,null);
  const future=await observe({body_completed_ts:T+99,body_text:raw});assert.equal(future.diagnostic.minute_body_knowledge.body_completed_ts,null);assert.equal(future.diagnostic.minute_body_knowledge.body_text_sha256,null);
  reports.push({id:'LEGACY_ORDER_FUTURE_ARE_NOT_PROMOTED',legacy:legacy.diagnostic.minute_body_knowledge,backwards:backwards.diagnostic.minute_body_knowledge,future:future.diagnostic.minute_body_knowledge});
  candidate.tape.clearHtxSignedTapeSnapshots();
  candidate.tape.observeHtxAcquisitionAttempt({url:'https://api.hbdm.com/linear-swap-api/v1/swap_contract_info?contract_code=BTC-USDT',started_ts:T,received_ts:T+2,http_status:200,stage:'COMPLETED',body_completed_ts:T+11,body_text:raw});
  const foreign=await candidate.project(T+12);assert.equal(Object.hasOwn(foreign.flow.raw_acquisition_diagnostic.source_clocks.metadata.attempt,'body_knowledge'),false);assert.equal(foreign.diagnostic.minute_body_knowledge,null);
  reports.push({id:'OTHER_EXISTING_RECEIPT_TYPE_UNCHANGED',metadata_has_new_field:false});

  // Typed projection ignores an arbitrary nested payload or invalid digest.
  const modified=json(next.after.flow);modified.raw_acquisition_diagnostic.source_clocks.minutes.attempt.body_knowledge={...body_knowledge,payload:'DO_NOT_COPY',body_text_sha256:'x'.repeat(4096)};
  const bounded=candidate.carrier.buildHtxFlowClosureDiagnostic({contract:CONTRACT,now:T+12,signed_flow:modified,trajectory:{}});
  assert.equal(bounded.minute_body_knowledge.body_text_sha256,null);assert.equal(bounded.minute_body_knowledge.body_text_utf8_bytes,null);assert.equal(Object.hasOwn(bounded.minute_body_knowledge,'payload'),false);assert.ok(Buffer.byteLength(JSON.stringify(bounded))<=2048);
  const failedCopy=json(invalid.p.flow),failureKnowledge=failedCopy.raw_acquisition_diagnostic.source_clocks.minutes.attempt.body_knowledge;
  failureKnowledge.payload='x'.repeat(4096);
  const failedCarrier=candidate.carrier.buildHtxFlowClosureDiagnostic({contract:CONTRACT,now:T+12,signed_flow:failedCopy,trajectory:{}});
  assert.ok(failedCarrier,'new metadata cannot expand legacy failure spread');
  assert.equal(Object.hasOwn(failedCarrier.acquisition.source_request_failure,'body_knowledge'),false);
  assert.equal(Object.hasOwn(failedCarrier.minute_body_knowledge,'payload'),false);
  const baselineFailure=json(failedCopy);delete baselineFailure.raw_acquisition_diagnostic.source_clocks.minutes.attempt.body_knowledge;
  const oldFailure=baseline.carrier.buildHtxFlowClosureDiagnostic({contract:CONTRACT,now:T+12,signed_flow:baselineFailure,trajectory:{}});
  const {minute_body_knowledge:failureOptional,...preservedFailure}=failedCarrier;assert.deepEqual(preservedFailure,oldFailure,'old failure fields exact');
  // Find a representable old frame whose remaining space cannot hold addition.
  let near=null;
  for(let n=0;n<=2048;n++){
   const flow={...json(next.after.flow),saved_ring_diagnostic:{status:'CONTROLLED_PADDING',padding:'x'.repeat(n)}};
   const previous=baseline.carrier.buildHtxFlowClosureDiagnostic({contract:CONTRACT,now:T+12,signed_flow:flow,trajectory:{}});
   if(previous&&Buffer.byteLength(JSON.stringify(previous))>=2030){near={flow,previous};break;}
  }
  assert.ok(near,'old representable near-limit frame');
  const protectedFrame=candidate.carrier.buildHtxFlowClosureDiagnostic({contract:CONTRACT,now:T+12,signed_flow:near.flow,trajectory:{}});
  assert.deepEqual(protectedFrame,near.previous,'optional addition cannot erase old diagnostic');assert.equal(Object.hasOwn(protectedFrame,'minute_body_knowledge'),false);
  const tooLarge={...near.flow,saved_ring_diagnostic:{padding:'x'.repeat(4096)}};
  assert.equal(baseline.carrier.buildHtxFlowClosureDiagnostic({contract:CONTRACT,now:T+12,signed_flow:tooLarge,trajectory:{}}),null);
  assert.equal(candidate.carrier.buildHtxFlowClosureDiagnostic({contract:CONTRACT,now:T+12,signed_flow:tooLarge,trajectory:{}}),null);
  reports.push({id:'TYPED_BOUNDED_CARRIER_PRESERVES_OLD_FRAME',new_field_only_omitted:true,old_frame_bytes:Buffer.byteLength(JSON.stringify(protectedFrame)),old_oversized_stays_null:true,arbitrary_payload_not_copied:true});
  assert.equal(SQL,0);assert.equal(dbAdmissionCalls,0);assert.equal(unexpectedHTTP,0);
  return{schema:'HTX_BODY_COMPLETION_EXISTING_INGRESS_CONNECTED_V1',classification:'CONTROLLED_ONLY_NOT_NATIVE_RECEIPT',new_affected_cases:1,assertion_groups:reports.length,groups:reports,baseline_candidate_pins:pins,SQL,db_admission_calls:dbAdmissionCalls,unexpected_external_HTTP:unexpectedHTTP,provider_HTTP:0,native_SQL:0,MAIN:0,Telegram:0,native_epoch:false,event_first_known:false,anomaly_domain_ACK:false,old_accepted_replays:0,limits:['SHA256_UTF8_RESPONSE_TEXT is decoded text, not wire bytes.','In-process latest attempt is not exact run/snapshot or durable event binding.','Optional metadata can be absent at unchanged2048-byte carrier cap; absence is UNKNOWN.','No provider/CPU/heap/native cost/admission/ACK/SENT or complete anomaly activation qualification.']};
 }finally{Date.now=originalNow;globalThis.fetch=originalFetch;}
}
