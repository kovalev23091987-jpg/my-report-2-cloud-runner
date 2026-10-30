// New component prepared for ONE coordinator qualification. No test registration.
// Do not invoke locally or import accepted test modules. All inputs below are
// explicitly CONTROLLED; the saved393850 missing catalog is never reconstructed.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export async function runNativeAvailabilityConnected({runtime_root,baseline_runtime_root,repo_root,original_root}){
 original_root=original_root||resolve(repo_root,'checkpoints/source-worker-native-availability-20261020/originals');
 const sha=b=>createHash('sha256').update(b).digest('hex');
 const name='approved-htx-analysis-scope.mjs';
 const before=await readFile(resolve(baseline_runtime_root,name));
 const after=await readFile(resolve(runtime_root,name));
 assert.equal(sha(before),'4782dde4b525619cfefd54e4c99516cdf7922e04808e28effebae29fdf544a23');
 // Candidate hash is supplied by the exact frozen proposal, no unpinned module.
 const proposal=JSON.parse(await readFile(new URL('./proposal-target.json',import.meta.url),'utf8'));
 assert.equal(sha(after),proposal.after_sha256);
 const worker=await readFile(resolve(runtime_root,'worker.js'),'utf8');
 const call=worker.match(/const approvedScope=bindApprovedHtxAnalysisScope\(allContracts,\{[^\n]+\);/g)||[];
 assert.equal(call.length,1);assert.match(call[0],/include_native_availability_diagnostic\s*:\s*true/);
 assert.ok(worker.includes('env.REPORT2_CURRENT_CYCLE_UNIVERSE_AUDIT=approvedScope.audit;'));
 const original=await readFile(resolve(original_root,'report2-failure-accounting.json'));
 assert.equal(sha(original),'427d1d11f3c81058c01c42926d62d22b03043fdada7e3500be65fc45f53a063d');
 const saved=JSON.parse(original).partial_cron_failure;
 assert.equal(saved.cron.scanned,99);assert.equal(saved.cron.universe_total,105);
 assert.deepEqual(saved.approved_universe_audit.unresolved_approved_analysis_contracts,['BTR-USDT','DOS-USDT','GPS-USDT','PIPPIN-USDT','SKR-USDT','UB-USDT']);
 assert.deepEqual(saved.approved_universe_audit.officially_unavailable_analysis_contracts,[]);
 assert.equal(Object.hasOwn(saved.approved_universe_audit,'native_availability_diagnostic'),false);
 const baseline=await import(pathToFileURL(resolve(baseline_runtime_root,name)).href);
 const candidate=await import(pathToFileURL(resolve(runtime_root,name)).href);
 const missing=saved.approved_universe_audit.unresolved_approved_analysis_contracts;
 const observed=1792480414924,received=observed+1000,source=observed-1000;
 const cases=[];
 function fixture(){
  const calls=[];
  return {calls,rows:baseline.APPROVED_HTX_ANALYSIS_CONTRACTS.filter(x=>!missing.includes(x.contract_code)).map(x=>({contract_code:x.contract_code,symbol:x.asset_symbol,instrument_scope:{classification:'CRYPTO_CONFIRMED'}})),
   n:{ok:true,http_status:200,url:'https://api.hbdm.com/linear-swap-api/v1/swap_contract_info',observed_ts:received,data:{status:'ok',ts:source,data:missing.map(c=>({contract_code:c,symbol:c.slice(0,-5),contract_status:3,business_type:'swap',contract_type:'swap',trade_partition:'USDT',labels:[],tradfi_labels:[]}))},classify:r=>{calls.push(r.contract_code);return{classification:'CRYPTO_CONFIRMED'};}},observed};
 }
 function compare(label,f,check){
  const inputBefore=JSON.stringify({rows:f.rows,n:f.n});
  const options={observed_ts:f.observed,native_catalog:f.n};
  const old=baseline.bindApprovedHtxAnalysisScope(f.rows,options),oldCalls=[...f.calls];f.calls.length=0;
  const legacy=candidate.bindApprovedHtxAnalysisScope(f.rows,options);
  assert.deepEqual(legacy,old,label+' default output');assert.deepEqual(f.calls,oldCalls,label+' default classifier calls');f.calls.length=0;
  const current=candidate.bindApprovedHtxAnalysisScope(f.rows,{...options,include_native_availability_diagnostic:true});
  const d=current.audit.native_availability_diagnostic;assert.ok(d,label+' diagnostic');
  const {native_availability_diagnostic:ignored,...audit}=current.audit;
  assert.deepEqual({...current,audit},old,label+' analytic output');assert.deepEqual(f.calls,oldCalls,label+' opt-in classifier calls');
  assert.equal(JSON.stringify({rows:f.rows,n:f.n}),inputBefore,label+' input mutation');
  assert.equal(d.admission_granted,false);assert.equal(d.original_body_completion_ts,null);assert.equal(d.raw_body_sha256,null);
  assert.ok(d.records.length<=8);assert.ok(Buffer.byteLength(JSON.stringify(d))<=8192);
  for(const row of d.records)assert.ok(Buffer.byteLength(JSON.stringify(row))<=1024);
  assert.equal(candidate.approvedHtxScopeAccounted(current.audit),baseline.approvedHtxScopeAccounted(old.audit));
  check(d,current,old);cases.push({label,classification:'CONTROLLED_NOT_NATIVE_RECONSTRUCTION',classifier_calls:oldCalls.length,diagnostic_utf8:Buffer.byteLength(JSON.stringify(d))});
 }
 compare('six controlled explicit suspended rows',fixture(),(d,c)=>{assert.equal(c.audit.status,'CLOSED');assert.equal(d.qualified_contracts_count,6);assert.equal(d.catalog_gate.first_failed_term,null);assert.ok(d.records.every(x=>x.first_failed_term===null));});
 const global=[
  ['CATALOG_OK_NOT_TRUE',f=>f.n.ok=false],['HTTP_STATUS_NOT_200',f=>f.n.http_status=503],['CATALOG_URL_NOT_EXACT',f=>f.n.url='https://controlled.invalid/catalog'],
  ['PAYLOAD_STATUS_NOT_OK',f=>f.n.data.status='error'],['CATALOG_DATA_NOT_ARRAY',f=>f.n.data.data=null],['CLASSIFIER_NOT_FUNCTION',f=>f.n.classify=null],
  ['OBSERVATION_NOT_SAFE_INTEGER',f=>f.observed=String(observed)],['CATALOG_OBSERVATION_NOT_SAFE_INTEGER',f=>f.n.observed_ts=undefined],
  ['CATALOG_OBSERVATION_BEFORE_EVALUATION',f=>f.n.observed_ts=observed-1],['CATALOG_OBSERVATION_DELAY_OVER_120000',f=>f.n.observed_ts=observed+120001],
  ['CATALOG_SOURCE_NOT_SAFE_INTEGER',f=>f.n.data.ts=String(source)],['CATALOG_SOURCE_AFTER_OBSERVATION',f=>f.n.data.ts=received+1],['CATALOG_SOURCE_AGE_OVER_120000',f=>f.n.data.ts=received-120001]
 ];
 for(const [term,mutate] of global){const f=fixture();mutate(f);compare('global '+term,f,d=>{assert.equal(d.catalog_gate.first_failed_term,term);assert.equal(d.records.length,0);assert.equal(d.qualified_contracts_count,0);assert.equal(f.calls.length,0);});}
 const fields=[['NATIVE_SYMBOL_NOT_APPROVED','symbol','OTHER'],['NATIVE_STATUS_NOT_EXPLICIT_3','contract_status','3'],['NATIVE_BUSINESS_TYPE_NOT_SWAP','business_type','future'],['NATIVE_CONTRACT_TYPE_NOT_SWAP','contract_type','next_week'],['NATIVE_TRADE_PARTITION_NOT_USDT','trade_partition','USD'],['NATIVE_LABELS_NOT_ARRAY','labels',null],['NATIVE_TRADFI_LABELS_NOT_ARRAY','tradfi_labels',null]];
 for(const [term,key,value] of fields){const f=fixture();f.n.data.data[0][key]=value;compare('row '+term,f,d=>{assert.equal(d.records[0].first_failed_term,term);assert.equal(d.records[0].native_catalog_match_count,1);assert.equal(d.qualified_contracts_count,5);});}
 {const f=fixture();f.n.ok=false;f.n.http_status=503;f.n.data.ts=received+1;compare('first term order preserved',f,d=>assert.equal(d.catalog_gate.first_failed_term,'CATALOG_OK_NOT_TRUE'));}
 for(const duplicate of [false,true]){const f=fixture();if(duplicate)f.n.data.data.push({...f.n.data.data[0]});else f.n.data.data.shift();compare('raw match '+(duplicate?'duplicate':'missing'),f,d=>{assert.equal(d.records[0].first_failed_term,'NATIVE_CATALOG_MATCH_COUNT_NOT_ONE');assert.equal(d.records[0].native_catalog_match_count,duplicate?2:0);});}
 for(const copies of [1,2]){const f=fixture();for(let i=0;i<copies;i++)f.rows.push({contract_code:'BTR-USDT',symbol:'BTR',instrument_scope:{classification:copies===1?'UNKNOWN_FAIL_CLOSED':'CRYPTO_CONFIRMED'}});compare('analysis input present '+copies,f,d=>{assert.equal(d.records[0].first_failed_term,'ANALYSIS_INPUT_ALREADY_PRESENT');assert.equal(d.records[0].analysis_input_match_count,copies);assert.equal(d.records[0].native_catalog_match_count,null);});}
 for(const mode of ['throw','unknown']){const f=fixture();f.n.classify=r=>{f.calls.push(r.contract_code);if(r.contract_code==='BTR-USDT'){if(mode==='throw')throw Error('SECRET_CLASSIFIER_ERROR');return{classification:'UNKNOWN_FAIL_CLOSED',secret:'SECRET_DETAILS'};}return{classification:'CRYPTO_CONFIRMED'};};compare('classifier '+mode,f,d=>{assert.equal(d.records[0].first_failed_term,mode==='throw'?'CLASSIFIER_THREW':'CLASSIFICATION_NOT_CRYPTO_CONFIRMED');assert.ok(!JSON.stringify(d).includes('SECRET_'));});}
 {const f=fixture();f.n.data.data[0].symbol='Я'.repeat(33);f.n.headers={Authorization:'SECRET_HEADER'};f.n.data.data[0].body='SECRET_BODY';compare('bounded UTF8 fields and privacy',f,d=>{assert.equal(d.records[0].native_symbol,null);assert.equal(d.records[0].value_overflow,true);assert.equal(d.status,'OVERFLOW');assert.ok(!JSON.stringify(d).includes('SECRET_'));});}
 {const f=fixture();f.rows=[];f.n.data.data=baseline.APPROVED_HTX_ANALYSIS_CONTRACTS.map(x=>({contract_code:x.contract_code,symbol:x.asset_symbol,contract_status:3,business_type:'swap',contract_type:'swap',trade_partition:'USDT',labels:[],tradfi_labels:[]}));compare('CONTROLLED105 missing record-pressure',f,(d,c)=>{assert.equal(d.missing_contracts_count,105);assert.equal(d.qualified_contracts_count,105);assert.equal(d.status,'OVERFLOW');assert.ok(d.records_omitted>=97);assert.equal(c.audit.checked_analysis_contracts,105);});}
 {const f=fixture();const old=baseline.bindApprovedHtxAnalysisScope(f.rows,{observed_ts:f.observed,native_catalog:f.n});for(const flag of [false,undefined,'true',1])assert.deepEqual(candidate.bindApprovedHtxAnalysisScope(f.rows,{observed_ts:f.observed,native_catalog:f.n,include_native_availability_diagnostic:flag}),old);cases.push({label:'strict optin only',classification:'CONTROLLED_NOT_NATIVE_RECONSTRUCTION'});}
 return {schema:'NATIVE_AVAILABILITY_CONNECTED_CONTROLLED_V1',saved_run:39385062635,saved_actual_failed_term:null,saved_raw_catalog_recovered:false,production_helper_sha256:sha(after),worker_call_sha256:sha(call[0]),controls:cases,provider_HTTP:0,native_SQL:0,local_SQL:0,raw_native_proof:false,admission:false,native_cost_or_wire_bound:null};
}
