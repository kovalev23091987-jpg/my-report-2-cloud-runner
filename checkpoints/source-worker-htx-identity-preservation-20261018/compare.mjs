import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import * as current from '../../current-generation/files/src/htx-asset-identity.mjs';
import * as proposal from './proposal-htx-asset-identity.mjs';
import {installEvidenceSourceStore} from '../../current-generation/files/src/evidence-source-store.mjs';
import {parseSupplementalIdentityRegistry} from '../../current-generation/files/src/supplemental-candidate-context.mjs';
import {planCandidateEvidenceRoutes} from '../../current-generation/files/src/candidate-evidence-v2-runtime.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const source=new URL('../n05-actual-qualification-38049404414/identity-HTX.json.gz',import.meta.url),compressed=readFileSync(source),raw=gunzipSync(compressed);
assert.equal(hash(compressed),'f662bdb1562bce5c19a3b7df96978b2fe27264ff271121d12d0f44b5ee94497c');
assert.equal(hash(raw),'f2bcb443ac8b167fa0b64709fa019107043208e37ae94df96b676ef9c51a0d29');
const original=JSON.parse(raw),identity={chain:'ethereum',contract_or_mint:'0x0a092e544da31150b439a1aaa1a3a2214a867f46'};
// This original reference has no network receipt clock. NOW/RECEIVED below
// are explicitly controlled replay clocks, never historical detection proof.
const NOW=Date.parse('2026-10-18T00:00:00Z'),RECEIVED=NOW+17;
class DB{
 constructor(){this.sql=new DatabaseSync(':memory:');this.unknown=0;this.log=[];this.hook=()=>{};}
 usageSnapshot(){return{unknown_ops:this.unknown};}
 prepare(sql){const d=this;return{args:[],bind(...a){this.args=a;return this;},async run(){return d.exec('run',sql,this.args);},async first(){return d.exec('first',sql,this.args);},async all(){return{results:d.exec('all',sql,this.args)};}};}
 exec(method,sql,args){this.log.push({method,sql,args,after_unknown:this.unknown>0});this.hook('before',sql,args);const stmt=this.sql.prepare(sql),r=method==='first'?stmt.get(...args)||null:method==='all'?stmt.all(...args):{meta:{changes:Number(stmt.run(...args).changes)}};this.hook('after',sql,args);return r;}
 async batch(rows){const out=[];for(const r of rows)out.push(await r.run());return out;}
 close(){this.sql.close();}
}
function cacheFailure(db,mode){let fired=false;db.hook=(phase,sql,args)=>{
 if(fired||!sql.startsWith('INSERT INTO report2_evidence_source_cache')||args[0]!=='HTX_ASSET_REFERENCE'||phase!==(mode==='unknown-ack'?'after':'before'))return;
 fired=true;if(mode!=='known-error')db.unknown=1;if(mode!=='unknown-ack')throw Error('CONTROLLED_REFERENCE_CACHE_FAILURE');
};return()=>fired;}
async function run(module,options={}){
 const db=new DB(),urls=[],admissions=[];let consumerCalls=0,consumerIdentity=null,consumerRoutes=[];
 try{
  if(options.stage){await installEvidenceSourceStore(db);db.log=[];let fired=false;db.hook=(phase,sql)=>{if(!fired&&phase==='after'&&(options.stage==='cache-read'?sql.startsWith('SELECT observed_ts'):sql.startsWith('SELECT attempts'))){fired=true;db.unknown=1;}};}
  const failed=options.failure?cacheFailure(db,options.failure):()=>false;
  if(options.unknown_before)db.unknown=1;
  const payload=structuredClone(original);
  if(options.invalid){const row=payload.data.find(r=>r.currency==='ct');if(options.invalid==='bad-address')row.chains[0].contractAddress='NOT_A_TOKEN';else payload.data.push(structuredClone(row));}
  const request={db,contract:'CT-USDT',run_id:'CONTROLLED_HTX_IDENTITY_'+(options.name||'case'),now:NOW,clock:()=>RECEIVED,
   request_admit:r=>{admissions.push(r);return{allowed:options.no_admission!==true,status:options.no_admission?'CONTROLLED_DENIED':'CONTROLLED_ALLOWED'};},
   fetch_impl:async url=>{urls.push(url);return url.includes('/v2/reference/currencies')?new Response(JSON.stringify(payload),{status:200}):new Response('{}',{status:503});}};
  let out;
  if(options.consumer){out=await module.collectHtxBoundSupplementalContext({...request,registry:{CT:{official_name:'RetainedCT'}},supplemental_collect:async p=>{
   consumerCalls++;consumerIdentity=parseSupplementalIdentityRegistry(p.registry).entries.CT?.identity??null;
   return{status:consumerIdentity?'CLOSED':'IDENTITY_NOT_CLOSED',contract:'CT-USDT',asset_identity:consumerIdentity,identity_method:'MANUAL_EXACT_REGISTRY',network_calls:0};
  }});if(consumerCalls&&out.asset_identity)consumerRoutes=planCandidateEvidenceRoutes({contract:'CT-USDT',...out,source_health_admit:()=>({allowed:true})}).routes.map(r=>r.name);}
  else out=await module.collectHtxAssetIdentity(request);
  const exists=name=>db.sql.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
  const daily=exists('report2_evidence_source_daily')?db.sql.prepare("SELECT attempts FROM report2_evidence_source_daily WHERE source='HTX_ASSET_REFERENCE'").get()?.attempts??0:0;
  const reservation=exists('report2_evidence_source_reservation')?db.sql.prepare("SELECT COUNT(*) AS n FROM report2_evidence_source_reservation WHERE source='HTX_ASSET_REFERENCE'").get().n:0;
  const cached=exists('report2_evidence_source_cache')?db.sql.prepare("SELECT COUNT(*) AS n FROM report2_evidence_source_cache WHERE source='HTX_ASSET_REFERENCE'").get().n:0;
  return{status:out.status,identity:options.consumer?out.asset_identity??null:out.identity??null,reference_observed_ts:options.consumer?out.asset_reference?.reference_observed_ts??null:out.reference_observed_ts??null,
   cache_receipts:options.consumer?out.asset_reference?.cache_write_receipts??[]:out.cache_write_receipts??[],cache_failure_fired:failed(),consumer_calls:consumerCalls,consumer_identity:consumerIdentity,consumer_route_names:consumerRoutes,
   simulated_HTTP:urls.length,URLs:urls,admissions:admissions.length,SQL_statements:db.log.length,SQL_after_unknown:db.log.filter(r=>r.after_unknown).length,SQL_shapes:db.log.map(r=>r.method+':'+r.sql),unknown_ops:db.unknown,durable_reference_daily_attempts:daily,durable_reference_reservations:Number(reservation),reference_cache_rows:Number(cached),full_result:out};
 }finally{db.close();}
}
const cases=[];
for(const failure of ['known-error','unknown-error','unknown-ack'])for(const consumer of [false,true])cases.push({name:(consumer?'consumer':'identity')+'_'+failure,failure,consumer});
cases.push({name:'ordinary_no_failure'},{name:'consumer_ordinary',consumer:true},{name:'preexisting_unknown',unknown_before:true,consumer:true},{name:'unknown_after_cache_read',stage:'cache-read',consumer:true},{name:'unknown_after_day_read',stage:'day-read',consumer:true},{name:'whole_admission_denied',no_admission:true},{name:'invalid_address_not_rescued',failure:'known-error',invalid:'bad-address'},{name:'duplicate_currency_not_rescued',failure:'known-error',invalid:'duplicate'});
const results=[];
for(const config of cases){const before=await run(current,config),after=await run(proposal,config);
 if(config.failure&&!config.invalid){
  assert.equal(after.cache_failure_fired,true);assert.deepEqual(after.identity,identity,config.name);assert.equal(after.reference_observed_ts,RECEIVED);assert.equal(after.simulated_HTTP,1);assert.equal(after.durable_reference_daily_attempts,1);assert.equal(after.durable_reference_reservations,1);
  if(config.failure==='known-error'){assert.equal(before.identity,null);assert.ok(before.simulated_HTTP>after.simulated_HTTP);if(config.consumer){assert.equal(after.consumer_calls,1);assert.deepEqual(after.consumer_identity,identity);assert.ok(after.consumer_route_names.includes('JOINT_FLOW'));}}
  else{assert.equal(after.unknown_ops,1);assert.equal(after.SQL_after_unknown,0);if(config.consumer)assert.equal(after.consumer_calls,0);}
  if(config.failure==='unknown-error')assert.equal(before.identity,null);
  if(config.failure==='unknown-ack')assert.equal(after.reference_cache_rows,1);else assert.equal(after.reference_cache_rows,0);
 }
 if(config.unknown_before||config.stage){assert.equal(after.consumer_calls,0);assert.equal(after.simulated_HTTP,0);assert.equal(after.SQL_after_unknown,0);assert.equal(after.unknown_ops,1);if(config.unknown_before)assert.equal(after.SQL_statements,0);}
 if(config.invalid||config.no_admission){assert.equal(after.identity,null);assert.equal(before.identity,null);}
 if(config.name==='ordinary_no_failure'||config.name==='consumer_ordinary'){assert.deepEqual(after.identity,identity);assert.deepEqual(after.SQL_shapes,before.SQL_shapes);assert.equal(after.simulated_HTTP,before.simulated_HTTP);}
 results.push({case:config,before,after});
}
const doc={schema:'HTX_IDENTITY_OPTIONAL_CACHE_BEFORE_AFTER_CONTROLLED_V1',status:'PASS',case_count:cases.length,
 original:{path:'checkpoints/n05-actual-qualification-38049404414/identity-HTX.json.gz',compressed_sha256:hash(compressed),decoded_sha256:hash(raw),currency:'ct',identity,original_transport_clock_present:false},
 controlled_clock:{now:NOW,received_ts:RECEIVED,status:'CONTROLLED_REPLAY_NOT_ORIGINAL_SOURCE_OR_FIRST_DETECTION_TIME'},
 original_production_sha256:hash(readFileSync(new URL('../../current-generation/files/src/htx-asset-identity.mjs',import.meta.url))),proposal_sha256:hash(readFileSync(new URL('./proposal-htx-asset-identity.mjs',import.meta.url))),
 results,interpretation:{new_cache_insert_failure_path_not_accepted_N04_fact_cache_tests:true,ordinary_logical_SQL_shapes_unchanged:true,no_native_read_write_upper_bound_claim:true,actual_provider_HTTP:0,actual_native_SQL:0,BR_actual_cause_or_binding_claim:false,production_activation:false,consumer_proof:'Existing production supplemental and route-planning seams with an injected pure consumer, not new manual/TG or source delivery.'}};
writeFileSync(new URL('./comparison.json',import.meta.url),JSON.stringify(doc,null,2)+'\n');
console.log(JSON.stringify({status:'PASS',new_controlled_pairs:cases.length,ordinary_SQL_shapes_equal:true,source_clock:'CONTROLLED_REPLAY',provider_HTTP:0,native_SQL:0,production_changes:0}));
