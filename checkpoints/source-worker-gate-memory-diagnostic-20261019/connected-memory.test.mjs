import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const sources=path.join(here,'.assembled/current-generation/files');
const {captureGateBindingDiagnostic,projectGateSourceDiagnostic,auditObservationSourceRoles}=await import(pathToFileURL(path.join(sources,'src/observation-source-role-audit.mjs')));
const {auditObservationSourceRoles:baselineAudit}=await import(pathToFileURL(path.join(sources,'src/audit-baseline.mjs')));
const {normalizeInheritedFact}=await import(pathToFileURL(path.join(sources,'src/inherited-fact-contract.mjs')));
const {buildRoleEvidenceView}=await import(pathToFileURL(path.join(sources,'src/source-role-consumer.mjs')));
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const runner=fs.readFileSync(path.join(sources,'runner-main.mjs'),'utf8');
const worker=fs.readFileSync(path.join(sources,'src/worker.js'),'utf8');
const memoryStart=runner.indexOf('  // Invocation-local, six entries at most');
const memoryEnd=runner.indexOf('  const liquidationRiskByContract=',memoryStart);
const memorySource=runner.slice(memoryStart,memoryEnd);
const hookStart=worker.indexOf("  if(typeof env?.REPORT2_GATE_BINDING_DIAGNOSTIC_BIND==='function')");
const hookEnd=worker.indexOf('\n',hookStart);
const hookSource=worker.slice(hookStart,hookEnd);
const bytes=v=>Buffer.byteLength(JSON.stringify(v));
const clone=v=>structuredClone(v);
const contract='BTW-USDT',run_id='CONTROLLED:392358:MEMORY',observed_ts=1792404897255;
const metrics=['funding_rate','oi_change_1h','price_change_4h','taker_balance_1h_raw'];
const rawRows=metrics.map(metric=>({contract_code:contract,metric,source:'Gate Public Futures',venue:'GATE',market_type:'USDT_PERP',value:null,unit:metric==='funding_rate'?'rate_per_settlement':'pct',observed_ts,source_ts:observed_ts-30000,max_age_sec:7200,status:'CLOSED',coverage_pct:100,quality_status:'OK',alias_required:true,symbol_verified:true,asset_identity_verified:false,source_compatible:true,primary_market_id:'BTW_USDT:GATE:USDT_PERP',window:metric==='price_change_4h'?'4h':'1h',note:'CONTROLLED fixture, not original native value',error:null}));
function canonical(){
 const normalized=rawRows.map(r=>normalizeInheritedFact(r));
 const source_role_view=buildRoleEvidenceView(normalized,{contract,observed_ts});
 return{status:'CLOSED',run_id,snapshot_id:`S392:${contract}:${observed_ts}`,observed_ts,analytical_fingerprint:'f'.repeat(64),state:'OBSERVE',direction:'LONG',scores:{overall_0_100:null},source_receipts:normalized,metadata:{contract,source_role_view}};
}
async function memory(returned){
 const env={DATA_DB:{usageSnapshot:()=>({requests:0,rows_read:0,rows_written:0,unknown_ops:0})}},calls=[];
 const bindGateOfficialAssetIdentity=async args=>{calls.push({contract:args.contract,run_id:args.run_id});if(returned instanceof Error)throw returned;return clone(returned);};
 const result=await new AsyncFunction('env','captureGateBindingDiagnostic','bindGateOfficialAssetIdentity','unifiedHttpBudget','evaluateWithinRunReservation','d1RunReservation',memorySource+'\nreturn{env,gateDiagnosticFor};')(env,captureGateBindingDiagnostic,bindGateOfficialAssetIdentity,{reserve:()=>{throw Error('NO_PROVIDER_HTTP');}},()=>({allowed:false}),{rows_read:1,rows_written:1});
 return{...result,calls};
}
const invokeHook=(env,c)=>new Function('env','contract','canonicalRunId','stage392SnapshotId','now','canonicalAnalyticalBundle',hookSource)(env,c.metadata.contract,c.run_id,c.snapshot_id,c.observed_ts,{canonical:c});
const returned=reason=>({status:reason===null?'CLOSED':'NOT_CLOSED',reason,binding:null,public_evidence:{contract_code:contract,evidence:clone(rawRows)},network_calls:0});

test('one connected controlled memory binding→exact canonical tuple→existing compact projection, bounded omissions preserve analysis',async()=>{
 assert(memoryStart>=0&&memoryEnd>memoryStart&&hookStart>=0&&hookEnd>hookStart);
 assert(runner.includes('gate_diagnostic_for:gateDiagnosticFor'));
 assert(runner.includes('gate_source_diagnostic:projectGateSourceDiagnostic(canonical,{binding_receipt:gate_diagnostic_for})'));
 const originalFetch=globalThis.fetch;globalThis.fetch=()=>{throw Error('SOURCE_NETWORK_FORBIDDEN');};
 const witness={schema:'CONTROLLED_GATE_MEMORY_CONNECTED_WITNESS_V1',fixture_basis:'Synthetic missing-field carrier; no reconstructed historical first refusal or provider raw',vectors:[],native_SQL:0,provider_HTTP:0,old_suites_rerun:0,production_imports:false};
 try{
  const c=canonical(),before=JSON.stringify(c),audit=baselineAudit(c);
  assert.deepEqual(auditObservationSourceRoles(c),audit);
  const reasons=['OFFICIAL_HTX_EXACT_TOKEN_REFERENCE_REQUIRED','NO_USABLE_GATE_METRIC_REQUIRING_BINDING','D1_BINDING_ADMISSION_NOT_CLOSED','GATE_REFERENCE_CLOCK_OR_PROVENANCE_NOT_CLOSED','SUPPORTED_CHAIN_ADDRESS_NOT_PROVIDED','GATE_CHAIN_ADDRESS_NOT_EXACT','AMBIGUOUS_GATE_CHAIN_ADDRESSES','HTX_GATE_ADDRESS_MISMATCH','GATE_REFERENCE_UNAVAILABLE',null];
  for(const reason of reasons){
   const m=await memory(returned(reason));
   const actual=await m.env.REPORT2_PUBLIC_ASSET_BINDING({contract,run_id,public_evidence:{contract_code:contract}});
   assert.deepEqual(actual,returned(reason)); // Same producer return, never annotate its evidence.
   assert.equal(m.gateDiagnosticFor(c),null); // Not bound merely by contract/run.
   invokeHook(m.env,c);
   const out=projectGateSourceDiagnostic(c,{binding_receipt:m.gateDiagnosticFor});
   assert.equal(out.first_binding.carrier_status,'CAPTURED');assert.equal(out.first_binding.reason,reason);
   assert.equal(out.normalized_rows_status,'CAPTURED');assert.equal(out.rows.length,4);
   assert.deepEqual(out.canonical_tuple,{contract,run_id,snapshot_id:c.snapshot_id,observed_ts,analytical_fingerprint:c.analytical_fingerprint});
   assert(bytes(out)<=8192&&bytes(out.first_binding)<=512);
   const forbidden=['raw_value','normalized_value','asset_identity_binding','contract_or_mint','body_sha256','url','note','error'];
   for(const key of forbidden)assert(!JSON.stringify(out).includes('"'+key+'"'));
   for(const row of out.rows){assert.equal(row.identity.asset_identity_verified,false);assert.equal(row.identity_status,'NOT_CLOSED');assert.equal(row.decision_usable,false);}
   assert.equal(m.calls.length,1);
   witness.vectors.push({name:'literal_return_'+(reason??'CLOSED_NULL_REASON'),bytes:bytes(out),first_binding_bytes:bytes(out.first_binding)});
   witness.example??=out;
  }
  const m=await memory(returned(reasons[0]));await m.env.REPORT2_PUBLIC_ASSET_BINDING({contract,run_id});invokeHook(m.env,c);
  for(const field of ['run_id','snapshot_id','observed_ts','analytical_fingerprint']){
   const altered=clone(c);altered[field]=field==='observed_ts'?c[field]+1:field==='analytical_fingerprint'?'e'.repeat(64):c[field]+'X';
   assert.equal(projectGateSourceDiagnostic(altered,{binding_receipt:m.gateDiagnosticFor}).first_binding.carrier_status,'UNKNOWN');witness.vectors.push({name:'foreign_'+field});
  }
  const foreign=clone(c);foreign.metadata.contract='CT-USDT';assert.equal(projectGateSourceDiagnostic(foreign,{binding_receipt:m.gateDiagnosticFor}).first_binding.carrier_status,'UNKNOWN');
  invokeHook(m.env,c);assert.equal(projectGateSourceDiagnostic(c,{binding_receipt:m.gateDiagnosticFor}).first_binding.carrier_status,'UNKNOWN'); // Duplicate tuple is not latest-wins.
  const duplicate=await memory(returned(reasons[0]));await duplicate.env.REPORT2_PUBLIC_ASSET_BINDING({contract,run_id});await duplicate.env.REPORT2_PUBLIC_ASSET_BINDING({contract,run_id});invokeHook(duplicate.env,c);assert.equal(duplicate.gateDiagnosticFor(c),null);
  const absent=projectGateSourceDiagnostic(c);assert.equal(absent.first_binding.carrier_status,'UNKNOWN');assert.equal(absent.first_binding.reason,null);assert.equal(absent.rows.length,4);
  const thrown=await memory(new Error('CONTROLLED_THROW_NOT_A_RETURNED_BINDING_REASON'));await assert.rejects(thrown.env.REPORT2_PUBLIC_ASSET_BINDING({contract,run_id}),/CONTROLLED_THROW/);invokeHook(thrown.env,c);assert.equal(projectGateSourceDiagnostic(c,{binding_receipt:thrown.gateDiagnosticFor}).first_binding.reason,null);
  const mismatch=returned(reasons[0]);mismatch.public_evidence.contract_code='CT-USDT';assert.equal(captureGateBindingDiagnostic(mismatch,{contract}).carrier_status,'UNKNOWN');
  const tooLong=returned('A'.repeat(513));assert.equal(captureGateBindingDiagnostic(tooLong,{contract}).carrier_status,'OVERFLOW');assert(bytes(captureGateBindingDiagnostic(tooLong,{contract}))<=512);
  const noReason=returned(reasons[0]);delete noReason.reason;assert.equal(captureGateBindingDiagnostic(noReason,{contract}).carrier_status,'UNKNOWN');
  const url=returned('https://provider.invalid/body');assert.equal(captureGateBindingDiagnostic(url,{contract}).carrier_status,'UNKNOWN');
  const overRows=clone(c);overRows.metadata.source_role_view.classified.push(clone(overRows.metadata.source_role_view.classified[0]));assert.equal(projectGateSourceDiagnostic(overRows).normalized_rows_status,'OVERFLOW');assert.equal(projectGateSourceDiagnostic(overRows).rows.length,0);
  const duplicateRows=clone(c);duplicateRows.metadata.source_role_view.classified[1]=clone(duplicateRows.metadata.source_role_view.classified[0]);assert.equal(projectGateSourceDiagnostic(duplicateRows).normalized_rows_status,'UNKNOWN');
  const longIdentity=clone(c);longIdentity.metadata.source_role_view.classified[0].identity.asset_identity_verification_method='X'.repeat(129);assert.equal(projectGateSourceDiagnostic(longIdentity).normalized_rows_status,'OVERFLOW');
  // Adversarial maximal scalar strings, explicitly not a native normalized row.
  const wholeOverflow=clone(c);for(const row of wholeOverflow.metadata.source_role_view.classified){for(const key of ['status','base_asset','quote_asset','market_type','market_type_raw','multiplier_status','asset_identity_verification_method'])row.identity[key]='A'.repeat(128);for(const key of ['status','legacy_status','fact_contract_status','identity_status','freshness_status','normalization_status','quality_status','reason_code','unit','interval'])row[key]='A'.repeat(128);}assert.equal(projectGateSourceDiagnostic(wholeOverflow).normalized_rows_status,'OVERFLOW');assert(bytes(projectGateSourceDiagnostic(wholeOverflow))<=8192);
  const wrongIdentity=clone(c);wrongIdentity.metadata.source_role_view.classified[0].identity.contract_code='CT-USDT';assert.equal(projectGateSourceDiagnostic(wrongIdentity).normalized_rows_status,'UNKNOWN');
  const privateFields=clone(c);privateFields.metadata.source_role_view.classified[0].identity.asset_identity_binding={url:'https://provider.invalid',contract_or_mint:'0x'+'a'.repeat(40),body:'PRIVATE'};
  assert.deepEqual(projectGateSourceDiagnostic(privateFields),absent);
  const noRows=clone(c);delete noRows.metadata.source_role_view;assert.equal(projectGateSourceDiagnostic(noRows).normalized_rows_status,'UNKNOWN');
  const capacity=await memory(returned(reasons[0]));
  for(let i=0;i<7;i++)await capacity.env.REPORT2_PUBLIC_ASSET_BINDING({contract,run_id:run_id+i});
  const seventh=clone(c);seventh.run_id=run_id+6;assert.equal(projectGateSourceDiagnostic(seventh,{binding_receipt:capacity.gateDiagnosticFor}).first_binding.carrier_status,'OVERFLOW');assert.equal(capacity.calls.length,7); // Diagnostic cap never caps producer calls.
  witness.vectors.push(...['foreign_contract','duplicate_tuple','duplicate_attempt','absent','throw_without_return','foreign_return','reason_overflow','missing_reason','URL_not_code','row_overflow','duplicate_metric','identity_overflow','whole8192overflow','foreign_identity','private_fields_omitted','missing_rows','memory_capacity_no_provider_cap'].map(name=>({name})));
  assert.equal(JSON.stringify(c),before);assert.deepEqual(auditObservationSourceRoles(c),audit);
  // Actual proposed loadCanonicalRunOutput uses the existing query/read code.
  const start=runner.indexOf('async function loadCanonicalRunOutput('),end=runner.indexOf('\n}',start)+2;
  const fn=runner.slice(start,end);let queries=0;
  const parsed=JSON.parse(before),row={publication_id:'PUB:'+'1'.repeat(40),contract_code:contract,run_id,snapshot_id:parsed.snapshot_id,observed_ts,canonical_json:before,presentation_inputs_json:'{}',manual_text:'CONTROLLED original text'};
  const db={prepare(sql){assert(sql.includes('FROM canonical_publication_shadow WHERE run_id=?1'));queries++;return{bind(...args){assert.deepEqual(args,[run_id,contract]);return this;},async all(){return{results:[row]};}};}};
  const live=await memory(returned(reasons[0]));await live.env.REPORT2_PUBLIC_ASSET_BINDING({contract,run_id});invokeHook(live.env,parsed);
  const load=new Function('auditCanonicalCandidateSet','classifyCanonicalRunCompletion','sourceCollectionPriorityProof','auditObservationSourceRoles','projectGateSourceDiagnostic','auditCanonicalBlockDecisionUse','auditRenderedBlockResults','loadExecutionReportSource','enforceManualBlockCoverage','formatManualRunSummary','auditExecutionReportRendering',fn+'\nreturn loadCanonicalRunOutput;')(()=>({present_candidate_count:1,expected_candidate_count:1}),()=>({status:'CLOSED'}),()=>({}),auditObservationSourceRoles,projectGateSourceDiagnostic,()=>({}),()=>({}),async()=>null,v=>v,()=>row.manual_text,()=>({}));
  const exported=await load(db,{runId:run_id,source:'CONTROLLED',generation:'CONTROLLED',head:'CONTROLLED',cron:null,candidateContracts:[contract],gate_diagnostic_for:live.gateDiagnosticFor});
  assert.equal(exported.status,'CLOSED');assert.equal(queries,1);assert.equal(exported.candidates[0].gate_source_diagnostic.first_binding.reason,reasons[0]);assert.equal(exported.candidates[0].manual_text,row.manual_text);assert.equal(exported.candidates[0].canonical.analytical_fingerprint,c.analytical_fingerprint);
  const {gate_source_diagnostic,...withoutNew}=exported.candidates[0];witness.exported_diagnostic_bytes=bytes(gate_source_diagnostic);witness.original_fp_unchanged=true;witness.metadata_unchanged=true;witness.existing_mock_candidate_SQL=queries;witness.additional_mock_SQL=0;witness.mock_producer_calls_not_HTTP=live.calls.length;witness.manual_text_unchanged=true;witness.full_worker_or_runtime_imported=false;witness.boundary='Actual new functions/runner closure, exact worker callback and exact output loader executed with local dependency stubs; no whole assembled Worker/native persistence/HTTP, historical first reason remains UNKNOWN.';
  fs.writeFileSync(path.join(here,'connected-witness.json'),JSON.stringify(witness,null,2)+'\n');
 }finally{globalThis.fetch=originalFetch;}
});
