// Prepared for the coordinator's ONE assembled case. No top-level execution,
// node:test registration, output writes, provider transport or native database.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {dbFixture} from './ledger-fixture.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const NOW=1792407299550,ROOT_RUN='CONTROLLED:RUNNER_PROVIDER_CAPTURE_CONNECTED';
const FOREIGN_RUN=ROOT_RUN+':FOREIGN',CONTRACT='APR-USDT';
const CG_URL='https://api.coingecko.com/api/v3/coins/categories/list';
const CP_URL='https://api.coinpaprika.com/v1/tags';
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;

function uniqueSegment(text,start,end){
 assert.equal(text.split(start).length,2,'runner start anchor must occur once');
 const at=text.indexOf(start),tail=text.slice(at+start.length);
 assert.equal(tail.split(end).length,2,'runner end anchor must occur once after start');
 return text.slice(at,at+start.length+tail.indexOf(end));
}

/**
 * Explicit call only. runtime_root accepts assembled files/ (with src/) or src/.
 * runner_text must be the SAME assembled runtime's runner-main.mjs text when
 * supplied; the returned digest binds that input, not an installed native runner.
 * Run serially: this function temporarily fixes Date.now and restores it.
 */
export async function runProviderCaptureConnected({runtime_root,runner_text}={}){
 assert.equal(typeof runtime_root,'string');
 const suppliedRoot=path.resolve(runtime_root);
 const src=path.basename(suppliedRoot)==='src'?suppliedRoot:path.join(suppliedRoot,'src');
 const expected=JSON.parse(await fs.readFile(new URL('./expected-anchors.json',import.meta.url),'utf8'));
 const runner=runner_text===undefined?await fs.readFile(path.join(src,'..','runner-main.mjs'),'utf8'):runner_text;
 assert.equal(typeof runner,'string');
 const closure=uniqueSegment(runner,expected.closure_start,expected.closure_end_exclusive);
 const contextLines=runner.split('\n').filter(line=>line.startsWith(expected.completion_line_prefix));
 assert.equal(contextLines.length,1,'existing completion expression must be unique');
 const completion=contextLines[0];
 assert.equal(hash(closure),expected.closure_sha256,'runner callback closure changed: review before qualification');
 assert.equal(hash(completion),expected.completion_line_sha256,'completion expression changed: review before qualification');
 const moduleHashes={};
 for(const [name,digest] of Object.entries(expected.module_sha256)){
  moduleHashes[name]=hash(await fs.readFile(path.join(src,name)));
  assert.equal(moduleHashes[name],digest,'assembled provider module differs from exact543 proposal: '+name);
 }
 // Dynamic imports occur only after the caller invokes this function and pins
 // assembled bytes. The full runner entry point is never imported or started.
 const {createProviderReferenceReader}=await import(pathToFileURL(path.join(src,'provider-reference-cache.mjs')).href);
 const {createProviderBudgetReceiptCapture,buildRunBudgetContext}=await import(pathToFileURL(path.join(src,'run-budget-context.mjs')).href);
 const executeClosure=new AsyncFunction(
  'createProviderBudgetReceiptCapture','collectCandidateEvidenceV2','env','unifiedHttpBudget',
  'evaluateWithinRunReservation','d1RunReservation','envText','expectedManualMode',
  'loadBlockWeightPolicy','finalizeCandidateBlockCoverage','buildRunBudgetContext','cron',
  'completed','d1AfterAnalyticsLeaseRelease','d1DayAdmission','canonicalRunOutput','console',
  closure+'\nreturn {collect:env.REPORT2_EVIDENCE_V2_COLLECT,complete:()=>{'+completion+'\nreturn existingRunBudgetContext;}};'
 );
 const canonical=Object.freeze({contract:CONTRACT,run_id:ROOT_RUN,snapshot_id:'CONTROLLED:CANONICAL_SENTINEL',metadata:Object.freeze({unchanged:true})});
 const canonicalBefore=JSON.stringify(canonical),fingerprintBefore=hash(canonicalBefore);
 const policy=Object.freeze({status:'CONTROLLED_EXISTING_POLICY_RETURN'});
 const oldNow=Date.now;
 Date.now=()=>NOW;
 try{
  async function invocation(mode){
   const flows=[],logs=[];let hostileCalls=0,policyLoads=0,collectorCalls=0;
   const env={DATA_DB:{usageSnapshot:()=>({requests:647,rows_read:38563,rows_written:471,unknown_ops:0})}};
   // This is explicitly a CONTROLLED collector adapter, not the real V2/CG/CP
   // factory. It performs the same contract/run callback wrapper at that edge;
   // the real assembled reference reader and its reservation helpers run below.
   const adapter=async params=>{
    collectorCalls++;
    assert.equal(typeof params.provider_budget_observe,'function');
    assert.equal(params.provider_budget_observe===params.hostile_callback,false,'runner must overwrite caller hook AFTER ...params');
    const source=params.controlled_source,f=dbFixture({source}),HTTP=[],whole=[];
    const url=source==='COINGECKO_SECTOR'?CG_URL:CP_URL;
    const reader=createProviderReferenceReader({
     db:f.db,source,run_id:params.run_id,now:NOW,clock:()=>NOW,daily_cap:224,
     minute_provider:source==='COINGECKO_SECTOR'?'COINGECKO':null,minute_cap:9,
     budget_observe:event=>params.provider_budget_observe({...event,contract:params.contract,run_id:params.run_id}),
     request_admit:value=>{whole.push(value);return{allowed:true,status:'RESERVED',duplicate:false};},
     fetch_impl:async(request,options)=>{HTTP.push({url:request,headers:options.headers});return{ok:true,status:200,headers:{get:()=>null},text:async()=>'{"id":"CONTROLLED"}'};}
    });
    const payload=await reader.get('EXACT_CATEGORY_DIRECTORY',url,{ttl_ms:60000});
    assert.deepEqual(payload,{id:'CONTROLLED'},'reader must actually reach controlled transport');
    const record={source,run_id:params.run_id,payload,summary:reader.summary(),SQL:f.trace,HTTP,whole};
    flows.push(record);
    return{payload,summary:record.summary,canonical,source_health:{status:'CONTROLLED'},shared_http_envelope:{status:'CONTROLLED'}};
   };
   const captureFactory=mode==='capture'?createProviderBudgetReceiptCapture:()=>{
    const real=createProviderBudgetReceiptCapture();
    return{summary:real.summary,observe:mode==='throw'?()=>{throw Error('CONTROLLED_OPTIONAL_OBSERVER_FAILURE');}:()=>{}};
   };
   const d1RunReservation={rows_read:54000,rows_written:840};
   const bridge=await executeClosure(
    captureFactory,adapter,env,{reserve:()=>({allowed:true}),summary:()=>null},
    ()=>({allowed:true}),d1RunReservation,()=>null,'FULL',
    async()=>{policyLoads++;return policy;},()=>({status:'CONTROLLED_UNUSED'}),
    buildRunBudgetContext,{run_id:ROOT_RUN},NOW+100,env.DATA_DB.usageSnapshot(),null,
    {liquidation_source_acquisition_audit:null},{log:(...args)=>logs.push(args)}
   );
   const hostile=()=>{hostileCalls++;throw Error('CALLER_HOOK_MUST_NOT_RUN');};
   for(const [source,run_id] of [['COINGECKO_SECTOR',ROOT_RUN],['COINPAPRIKA_SECTOR',ROOT_RUN],['COINGECKO_SECTOR',FOREIGN_RUN]]){
    const result=await bridge.collect({contract:CONTRACT,run_id,controlled_source:source,provider_budget_observe:hostile,hostile_callback:hostile});
    assert.equal(result.canonical,canonical);
    assert.equal(result.block_weight_policy,policy);
   }
   assert.equal(hostileCalls,0);assert.equal(policyLoads,1);assert.equal(collectorCalls,3);
   const beforeCompletion=flows.reduce((n,f)=>n+f.SQL.length,0);
   const context=bridge.complete();
   assert.equal(flows.reduce((n,f)=>n+f.SQL.length,0),beforeCompletion,'completion metadata must issue no SQL');
   const serialized=JSON.stringify(context),parsed=JSON.parse(serialized);
   assert.deepEqual(parsed,context,'completion context must serialize without acquiring proof authority');
   assert.equal(JSON.stringify(canonical),canonicalBefore);
   assert.equal(hash(JSON.stringify(canonical)),fingerprintBefore);
   return{flows,context,serialized,policyLoads,collectorCalls,hostileCalls,logs_count:logs.length};
  }
  // Three modes form ONE connected component invocation, not old543 test cases:
  // disabled diagnostic, real capture, optional hook throwing. No old test module
  // is imported. Stable local time permits exact return/cache/SQL/binding equality.
  const disabled=await invocation('disabled'),captured=await invocation('capture'),throwing=await invocation('throw');
  assert.deepEqual(captured.flows,disabled.flows,'capture must preserve return/receipt/cache/SQL/HTTP/reservations');
  assert.deepEqual(throwing.flows,disabled.flows,'observer failure must preserve original reader path');
  const projection=captured.context.technical_provider_receipt_observations;
  assert.equal(projection.run_id,ROOT_RUN);assert.equal(projection.events.length,6);
  assert.equal(projection.foreign_run_omitted,4);
  assert.equal(projection.invalid_observations,0);assert.equal(projection.overflow_observations,0);
  assert.deepEqual(projection.events.filter(e=>e.source==='COINGECKO_SECTOR').map(e=>e.phase),[
   'DAY_PREFLIGHT_ROW','MINUTE_PREFLIGHT_ROW','DAY_RESERVATION_REPLY','MINUTE_RESERVATION_REPLY'
  ]);
  assert.deepEqual(projection.events.filter(e=>e.source==='COINPAPRIKA_SECTOR').map(e=>e.phase),['DAY_PREFLIGHT_ROW','DAY_RESERVATION_REPLY']);
  const cg=projection.events.filter(e=>e.source==='COINGECKO_SECTOR');
  assert.equal(cg[0].reported_used_units,17);assert.equal(cg[1].reported_used_units,2);
  assert.equal(cg[2].reported_own_reserved_units,1);assert.equal(cg[3].reported_used_units,3);
  assert.equal(cg[3].returned_allowed,true);assert.equal(cg[3].configured_cap,9);
  assert.ok(projection.events.every(e=>e.contract===CONTRACT&&e.run_id===ROOT_RUN&&e.query_window_end_ts===NOW));
  for(const key of ['provider_account_balances','month_headroom','manual_held_reserve','native_unknown_ops_at_individual_query'])assert.equal(projection[key],null);
  assert.equal(projection.future_work_admitted,false);assert.equal(projection.all_run_observations_complete,false);
  for(const key of ['provider_day_month_rolling60s_headroom','manual_provider_reserve_headroom','independent_global_native_capacity','observed_next_full_reservation'])assert.equal(captured.context[key],null);
  assert.equal(captured.context.admission_authorized,false);assert.equal(captured.context.whole_day_closed,false);
  assert.equal(captured.context.additional_SQL,0);assert.equal(captured.context.additional_source_HTTP,0);
  for(const other of [disabled,throwing]){
   assert.deepEqual(other.context.technical_provider_receipt_observations.events,[]);
   const removeTechnical=context=>{const{technical_provider_receipt_observations,...rest}=context;return rest;};
   assert.deepEqual(removeTechnical(other.context),removeTechnical(captured.context));
  }
  assert.equal(buildRunBudgetContext({run_id:'OTHER',provider_receipts:projection}).technical_provider_receipt_observations,null);
  const cacheWrites=captured.flows.flatMap(f=>f.SQL.filter(row=>row.sql.includes('INSERT INTO report2_evidence_source_cache')));
  assert.equal(cacheWrites.length,3);
  assert.ok(cacheWrites.every(row=>!row.params.at(-1).includes('EXISTING_PROVIDER_LEDGER_OBSERVATIONS')));
  const counts=result=>({SQL:result.flows.reduce((n,f)=>n+f.SQL.length,0),HTTP:result.flows.reduce((n,f)=>n+f.HTTP.length,0),whole_reservations:result.flows.reduce((n,f)=>n+f.whole.length,0)});
  const witness={
   schema:'PROVIDER_CAPTURE_RUNNER_CONNECTED_CONTROLLED_WITNESS_V1',classification:'CONTROLLED COMPONENT ONLY',
   actual_functions_called:['assembled createProviderReferenceReader.get/summary','existing reserveEvidenceSourceAttempts','existing reserveProviderMinuteUnits','assembled createProviderBudgetReceiptCapture.observe/summary','exact runner REPORT2_EVIDENCE_V2_COLLECT closure','exact existingRunBudgetContext completion expression','assembled buildRunBudgetContext'],
   controlled_adapters:['collectCandidateEvidenceV2 edge adapter (NOT real V2/CG/CP factories)','exact543 dbFixture','fetch_impl','loadBlockWeightPolicy/usage/admission/environment/log stubs','disabled/throw capture-factory wrappers for comparison'],
   runner_input_sha256:hash(runner),runner_closure_sha256:hash(closure),completion_expression_sha256:hash(completion),module_sha256:moduleHashes,
   controlled_counts:{disabled:counts(disabled),capture:counts(captured),throw:counts(throwing)},
   added_SQL:0,added_HTTP:0,native_SQL:0,source_HTTP:0,MAIN:0,Telegram:0,
   completion_events:projection.events.length,foreign_run_omitted:projection.foreign_run_omitted,
   callback_forced_after_params:true,caller_hook_calls:captured.hostileCalls,optional_throw_preserves_result:true,
   source_return_receipts_SQL_bindings_HTTP_reservations_equal:true,source_cache_payload_bytes_equal:true,
   source_cache_payload_sha256:cacheWrites.map(row=>hash(row.params.at(-1))),
   canonical_sentinel_bytes_and_fingerprint_equal:true,canonical_builder_executed:false,
   null_account_month_manual_held_and_headroom:true,future_admission:false,
   serialized_completion_bytes:Buffer.byteLength(captured.serialized),serialized_projection_bytes:Buffer.byteLength(JSON.stringify(projection)),
   limits:['NOT full runner/V2/CG/CP normalizers/canonical builder','mock DB/HTTP is not native SQL/provider body/account balance','configured direct-adapter caps are CONTROLLED, not actual CG/CP policy proof','no native completion persistence/cache ACK/wire/CPU/heap/daycapacity or Telegram proof','Date.now fixed only for serial controlled component and restored']
  };
  assert.ok(Buffer.byteLength(JSON.stringify(witness))<=16384,'bounded component witness exceeds16KiB');
  return witness;
 }finally{Date.now=oldNow;}
}
