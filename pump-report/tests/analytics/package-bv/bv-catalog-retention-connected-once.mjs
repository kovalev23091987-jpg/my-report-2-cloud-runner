// BV: one connected catalog retention case. Genuine old fixture, controlled stores, no live IO.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const repo=fileURLToPath(new URL('../../../../',import.meta.url));
const out=path.join(repo,'pump-report/handoffs/analytics/package-bv'),priv=path.join(out,'.private');
const sha=b=>createHash('sha256').update(b).digest('hex'),clone=structuredClone;
const bytes=p=>fs.readFileSync(path.resolve(repo,p)),read=p=>JSON.parse(bytes(p));
const save=(n,v,p=false)=>fs.writeFileSync(path.join(p?priv:out,n),JSON.stringify(v,null,2)+'\n',{mode:0o600});
const report={schema:'BV_CONNECTED_CATALOG_RETENTION_ACTUAL_V1',status:'STARTED',Node:1,logical_cases:1,
  evidence_class:'ARTIFICIAL',fixture_is_genuine_old:true,current_global_N_proven:false,native_acceptance:false,
  engine:0,sourceHTTP:0,nativeSQL:0,Telegram:0,build:0,deploy:0,old_tests:0,SOURCE12cases_executed:0,
  simulated_broker_requests:0,callback_invocations:0,writer_invocations:0,phases:[],limitations:[
    'Old25Oct1278 capture is not latest1294/249 or current global cryptoN.',
    'Controlled KV interface calls are not native D1 ACK/billed rows/admission.',
    'Default worker/native environment/operator CLI are not invoked; their wiring is hash/static scope only.',
    'Full2000row/2MiB boundary matrix is not executed in this one connected case.']};
let stage='ENTRY',entered=false;
const mark=(name,v={})=>{stage=name;report.phases.push({name,...v});save('BV_AFFECTED_RESULT.json',report);};
try{
  fs.mkdirSync(priv,{recursive:true,mode:0o700});const fd=fs.openSync(path.join(out,'BV_NODE_ONCE.lock'),'wx',0o600);
  entered=true;fs.writeFileSync(fd,'BV single admitted invocation; preserve failure, no blind rerun\n');fs.closeSync(fd);save('BV_AFFECTED_RESULT.json',report);
  assert.equal(process.argv.length,3);const admission=read(process.argv[2]);
  assert.equal(admission.status,'ROOT_BV_ONE_CATALOG_RETENTION_CASE_AUTHORIZED');
  assert.equal(admission.Node_invocations,1);assert.equal(admission.max_simulated_broker_requests,3);
  assert.ok(Date.now()<admission.own_expires_ts&&Date.now()<admission.root_expires_ts);
  assert.equal(admission.test_sha256,sha(fs.readFileSync(fileURLToPath(import.meta.url))));
  const auth=read('pump-report/handoffs/analytics/package-bv/BV_EXECUTION_AUTHORITY.json');
  assert.equal(auth.own_owner,admission.own_owner);assert.equal(auth.all4_equal,true);
  assert.equal(auth.own_exact_bytes_match,true);assert.equal(auth.own_actual_ref_match,true);
  assert.equal(auth.owner_paused,false);assert.equal(auth.fence,false);assert.equal(auth.authority_main,admission.authority_main);
  assert.ok(Date.now()-auth.checked_ts>=0&&Date.now()-auth.checked_ts<=90000,'FRESH_AUTHORITY_REQUIRED');
  const manifestPath='pump-report/handoffs/analytics/package-bv/BV_FROZEN_INPUTS_V2.json';
  assert.equal(sha(bytes(manifestPath)),admission.frozen_inputs_sha256);const frozen=read(manifestPath);
  assert.equal(frozen.F614_final_sha256,'50043056ecb69267fcf2c922b7be401e525d4286f7fa664aa27dd22ae13287df');
  assert.equal(sha(bytes(frozen.F614_final_path)),frozen.F614_final_sha256);
  for(const f of frozen.files){assert.equal(sha(bytes(f.path)),f.sha256,'FROZEN_BYTES_CHANGED:'+f.path);assert.equal(bytes(f.path).length,f.bytes);}
  assert.match(frozen.control_implementation_sha256,/^[a-f0-9]{64}$/);
  assert.equal(frozen.old_source_sha256,'bcf5178ecea9ba84cd879198f833bf2549bf8b8fea5c586b83b3c954effa0c8f');
  assert.equal(frozen.new_source_sha256,'32257ea6d5f625d31cc8bd24d7ec99c29044d82f1b90945e4d90fb74754f29dd');
  assert.equal(frozen.writer_sha256,'922b29490907dc61c029764e8bad29e4fbcc84f258a9b5e67ee60d0312b604c8');
  assert.equal(frozen.reader_sha256,'643de7ce595018e1fd7a7f5f165048ff8500daef94071c71b616eba4240c92ed');
  assert.equal(sha(bytes(frozen.paths.old_source)),frozen.old_source_sha256);
  assert.equal(sha(bytes(frozen.paths.new_source)),frozen.new_source_sha256);
  assert.equal(sha(bytes(frozen.paths.writer)),frozen.writer_sha256);assert.equal(sha(bytes(frozen.paths.reader)),frozen.reader_sha256);
  assert.ok(process.execArgv.includes('/private/tmp/pump-e-native-http-forbidden.mjs'));
  assert.equal(sha(fs.readFileSync('/private/tmp/pump-e-native-http-forbidden.mjs')),'7a57d4036d30146735628cb4013f69721fa7cb6794932362f3a2155e36cb6783');
  globalThis.fetch=async()=>{throw Error('BV_REAL_HTTP_FORBIDDEN');};
  const load=p=>import(pathToFileURL(path.resolve(repo,p)).href);
  const [{createPumpSources:oldSources},{createPumpSources:newSources},writerModule,{readSavedCatalogSnapshot},
    {BINGX_IDENTITY_REGISTRY},{createReviewedNativeScopeRegistry},{withReviewedFundingQuoteRegistry}]=await Promise.all([
      load(frozen.paths.old_source),load(frozen.paths.new_source),load(frozen.paths.writer),load(frozen.paths.reader),
      load(frozen.paths.registry),load(frozen.paths.reviewed_registry),load(frozen.paths.funding_registry)]);
  const {createCatalogSnapshotWriter,CATALOG_SNAPSHOT_KEY,CATALOG_SNAPSHOT_BOUNDS,CATALOG_SNAPSHOT_SERIALIZATION}=writerModule;
  assert.equal(CATALOG_SNAPSHOT_KEY,'pump:catalog:last-observed:v1');assert.equal(CATALOG_SNAPSHOT_BOUNDS.rows,2000);
  assert.equal(CATALOG_SNAPSHOT_BOUNDS.body_utf8_bytes,2097152);assert.equal(CATALOG_SNAPSHOT_BOUNDS.record_utf8_bytes,1900000);
  assert.equal(CATALOG_SNAPSHOT_SERIALIZATION,'BROKER_PARSED_JSON_STRINGIFY_UTF8_NOT_WIRE_BYTES');
  const originalPath='pump-report/.private/evidence/pump-report-native-catalog-corrected.json';
  assert.equal(sha(bytes(originalPath)),'7b683509fea9d5b3aa1d2612ddb8ad259680a3bc33cc4df5cc97f23b4555e9f5');
  const original=read(originalPath),response=original.body.response,originalJSON=JSON.stringify(response);
  assert.equal(response.received_ts,1792931870932);assert.equal(response.data.data.length,1278);
  assert.equal(response.receipt_id,'0320c4b0-ce38-48dc-a275-88a6770ec2b1');assert.equal(Object.hasOwn(response,'request_started_ts'),false);
  const fixtureClock=()=>response.received_ts+1,observedAt=Date.now();
  const registry=withReviewedFundingQuoteRegistry(createReviewedNativeScopeRegistry(BINGX_IDENTITY_REGISTRY));
  const brokerCalls=[];
  const broker=()=>({async request(args){
    report.simulated_broker_requests++;assert.ok(report.simulated_broker_requests<=3,'BROKER_CALL_BOUND');
    assert.equal(args.ttl_ms,0);assert.equal(args.provider,'BINGX');assert.equal(args.family,'USDT_M');
    assert.equal(args.purpose,'DISCOVERY');assert.equal(args.method,'GET');assert.equal(args.estimated_cost.http,1);
    assert.equal(args.url,'https://open-api.bingx.com/openApi/swap/v2/quote/contracts');
    brokerCalls.push(clone(args));return clone(response);
  }});
  const baseline=await oldSources({broker:broker(),identityRegistry:registry,clock:fixtureClock}).getCatalog({purpose:'DISCOVERY'});
  mark('OLD71_DEFAULT_BASELINE',{simulated_broker_requests:1,ttl_ms:0,output_sha256:sha(JSON.stringify(baseline)),historical_scope_only:true});
  class ControlledKV{
    constructor(error=null){this.rows=new Map();this.calls=[];this.error=error;this.unknown_ops=0;}
    async set(key,value){this.calls.push({op:'SET',key});assert.equal(key,CATALOG_SNAPSHOT_KEY);this.rows.set(key,clone(value));
      if(this.error){this.unknown_ops=1;throw this.error;}return value;}
    async get(key){this.calls.push({op:'GET',key});assert.equal(key,CATALOG_SNAPSHOT_KEY);return clone(this.rows.get(key)??null);}
  }
  const store=new ControlledKV(),writer=createCatalogSnapshotWriter({store,implementation_sha256:frozen.control_implementation_sha256,evidence_class:'ARTIFICIAL',clock:fixtureClock});
  let ingress=null,retained=null;
  const changed=await newSources({broker:broker(),identityRegistry:registry,clock:fixtureClock,on_catalog_snapshot:async payload=>{
    report.callback_invocations++;ingress=clone(payload);const before=JSON.stringify(payload);report.writer_invocations++;retained=await writer(payload);assert.equal(JSON.stringify(payload),before,'WRITER_MUTATED_INGRESS');
  }}).getCatalog({purpose:'DISCOVERY'});
  save('BV_PRIVATE_CONNECTED_OUTPUT.json',{baseline,changed,ingress,retained,store:[...store.rows]},true);
  assert.deepEqual(changed,baseline,'CATALOG_OUTPUT_CHANGED');assert.equal(retained.status,'RETAINED');assert.equal(retained.provider_HTTP,0);
  assert.deepEqual(brokerCalls[1],brokerCalls[0],'BROKER_REQUEST_OR_CACHEKEY_CHANGED');
  assert.deepEqual(ingress,{schema:'PUMP_CATALOG_INGRESS_V1',provider:'BINGX',family:'USDT_M',route:'/openApi/swap/v2/quote/contracts',received_ts:response.received_ts,receipt_id:response.receipt_id,body:response.data});
  assert.deepEqual(store.calls,[{op:'SET',key:CATALOG_SNAPSHOT_KEY},{op:'GET',key:CATALOG_SNAPSHOT_KEY}]);
  const record=clone(store.rows.get(CATALOG_SNAPSHOT_KEY)),serialized=JSON.stringify(response.data);
  assert.deepEqual(record.body,response.data);assert.equal(record.received_ts,response.received_ts);assert.equal(record.receipt_id,response.receipt_id);
  assert.equal(record.saved_ts,response.received_ts+1);assert.equal(record.source_event_ts,null);assert.equal(record.evidence_class,'ARTIFICIAL');
  assert.equal(record.body_sha256,sha(serialized));assert.equal(record.body_utf8_bytes,Buffer.byteLength(serialized,'utf8'));
  assert.equal(record.serialization_basis,CATALOG_SNAPSHOT_SERIALIZATION);assert.equal(record.row_count,1278);assert.ok(Buffer.byteLength(JSON.stringify(record),'utf8')<=1900000);
  const observation=await readSavedCatalogSnapshot({store,implementation_sha256:frozen.control_implementation_sha256,clock:()=>observedAt});
  save('BV_PRIVATE_OBSERVER.json',observation,true);
  assert.equal(observation.snapshot_bytes_clocks_bound,true);assert.equal(observation.implementation_bound,true);
  assert.equal(observation.native_source_response_bound,false);assert.equal(observation.scope.current_global_crypto_N_proven,false);
  assert.equal(observation.scope.CORE_qualification,false);assert.equal(observation.status,'BOUND_CATALOG_NON_OBSERVED_NOT_NATIVE');
  assert.equal(observation.received_ts,response.received_ts);assert.equal(observation.received_age_ms,observedAt-response.received_ts);
  assert.equal(observation.scope.native_PK_reads,1);assert.equal(store.calls.length,3);assert.equal(store.rows.size,1);
  mark('NEW_PRODUCER_WRITER_PRIVATE_OBSERVER',{ttl_ms:0,catalog_output_equal:true,callback:1,positive_SET:1,writer_GET_readback:1,observer_PK_GET:1,
    only_state_key:CATALOG_SNAPSHOT_KEY,row_count:1278,body_sha256:record.body_sha256,body_utf8_bytes:record.body_utf8_bytes,
    received_ts:record.received_ts,saved_ts:record.saved_ts,received_age_ms:observation.received_age_ms,
    evidence_class:'ARTIFICIAL',native_source_response_bound:false,current_global_N_proven:false,source_event_ts:null});
  const callsBefore=clone(store.calls),recordBefore=JSON.stringify(store.rows.get(CATALOG_SNAPSHOT_KEY));
  report.writer_invocations++;const skipped=await writer({...clone(ingress),receipt_id:null});
  assert.equal(skipped.status,'SKIPPED');assert.equal(skipped.reason,'CATALOG_INGRESS_UNBOUND');assert.equal(skipped.native_store_calls,0);
  assert.deepEqual(store.calls,callsBefore);assert.equal(JSON.stringify(store.rows.get(CATALOG_SNAPSHOT_KEY)),recordBefore);
  mark('METADATA_REJECTION_DIRECT_WRITER',{status:skipped.status,reason:skipped.reason,extra_broker:0,extra_store:0,record_clock_unchanged:true});
  const oversizedBody=clone(ingress.body);oversizedBody.bv_controlled_padding='';
  const targetBodyBytes=1950000,emptyBytes=Buffer.byteLength(JSON.stringify(oversizedBody),'utf8');assert.ok(emptyBytes<targetBodyBytes);
  oversizedBody.bv_controlled_padding='x'.repeat(targetBodyBytes-emptyBytes);
  assert.equal(Buffer.byteLength(JSON.stringify(oversizedBody),'utf8'),targetBodyBytes);assert.ok(targetBodyBytes<CATALOG_SNAPSHOT_BOUNDS.body_utf8_bytes);
  report.writer_invocations++;const oversize=await writer({...clone(ingress),body:oversizedBody});
  assert.equal(oversize.status,'SKIPPED');assert.equal(oversize.reason,'CATALOG_RECORD_BYTE_BOUND');assert.equal(oversize.native_store_calls,0);
  assert.deepEqual(store.calls,callsBefore);assert.equal(JSON.stringify(store.rows.get(CATALOG_SNAPSHOT_KEY)),recordBefore);
  mark('OVERSIZED_RECORD_DIRECT_WRITER',{body_utf8_bytes:targetBodyBytes,record_limit:1900000,status:oversize.status,reason:oversize.reason,extra_broker:0,extra_store:0,original_body_unchanged:true});
  const nativeError=Object.assign(Error('BV_CONTROLLED_UNKNOWN_ACK'),{code:'NATIVE_SQL_COST_ACK_UNKNOWN'}),unknownStore=new ControlledKV(nativeError);
  const unknownWriter=createCatalogSnapshotWriter({store:unknownStore,implementation_sha256:frozen.control_implementation_sha256,evidence_class:'ARTIFICIAL',clock:fixtureClock});
  let caught=null,unexpectedReturn=null;
  try{unexpectedReturn=await newSources({broker:broker(),identityRegistry:registry,clock:fixtureClock,on_catalog_snapshot:async payload=>{
    report.callback_invocations++;report.writer_invocations++;return unknownWriter(payload);
  }}).getCatalog({purpose:'DISCOVERY'});}catch(error){caught=error;}
  save('BV_PRIVATE_UNKNOWN_ACK.json',{same_error:caught===nativeError,error_code:caught?.code??null,unexpectedReturn,
    controlled_unknown_ops:unknownStore.unknown_ops,calls:unknownStore.calls,possible_committed_value:[...unknownStore.rows]},true);
  assert.equal(caught,nativeError,'CALLBACK_UNKNOWN_ERROR_MASKED');assert.equal(unexpectedReturn,null);assert.equal(unknownStore.unknown_ops,1);
  assert.deepEqual(unknownStore.calls,[{op:'SET',key:CATALOG_SNAPSHOT_KEY}]);
  mark('NATIVE_UNKNOWN_PROPAGATES_THROUGH_PRODUCER',{same_error_object:true,error_code:nativeError.code,unknown_ops:1,
    SET_attempt:1,possible_commit_not_refunded:true,GET_after_unknown:0,extra_broker_recovery:0,only_state_key:CATALOG_SNAPSHOT_KEY});
  assert.equal(report.simulated_broker_requests,3);assert.equal(report.callback_invocations,2);assert.equal(report.writer_invocations,4);
  assert.equal(JSON.stringify(response),originalJSON);assert.equal(store.rows.size,1);assert.equal(unknownStore.rows.size,1);
  for(const f of frozen.files)assert.equal(sha(bytes(f.path)),f.sha256,'POSTRUN_FROZEN_CHANGED:'+f.path);
  assert.equal(sha(bytes(manifestPath)),admission.frozen_inputs_sha256);assert.equal(sha(bytes(frozen.F614_final_path)),frozen.F614_final_sha256);
  report.status='PASS_CONNECTED_CATALOG_RETENTION_ARTIFICIAL_OLD_FIXTURE';report.positive_SET=1;report.unknown_SET_attempt=1;
  report.writer_success_GET=1;report.observer_PK_GET=1;report.current_records_per_store=1;report.no_other_keys_or_history=true;
  report.original_source_clock_preserved=true;report.prepared_code_not_deployed=true;report.completed_wall_utc=new Date().toISOString();save('BV_AFFECTED_RESULT.json',report);
  process.stdout.write(JSON.stringify({status:report.status,Node:1,logical_cases:1,mock_broker:3,engine:0,sourceHTTP:0,nativeSQL:0,Telegram:0})+'\n');
}catch(error){
  report.status='FAIL_PRESERVED_NO_AUTOMATIC_RERUN';report.failure_stage=stage;report.failure={name:error.name,code:error.code??null,message:String(error.message).slice(0,300)};
  report.completed_wall_utc=new Date().toISOString();if(entered){save('BV_PRIVATE_FAILURE.json',{stack:error.stack,report},true);save('BV_AFFECTED_RESULT.json',report);}
  process.stderr.write(JSON.stringify({status:report.status,stage,error_name:error.name,code:error.code??null})+'\n');process.exitCode=1;
}
