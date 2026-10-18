import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import test from 'node:test';
import {pathToFileURL} from 'node:url';
const moduleRoot=process.env.REPORT2_TEST_RUNTIME?pathToFileURL(process.env.REPORT2_TEST_RUNTIME+'/src/'):new URL('../files/src/',import.meta.url);
const actual=await import(new URL('htx-asset-identity.mjs',moduleRoot));
import {installEvidenceSourceStore} from '../files/src/evidence-source-store.mjs';
import {parseSupplementalIdentityRegistry} from '../files/src/supplemental-candidate-context.mjs';
import {planCandidateEvidenceRoutes} from '../files/src/candidate-evidence-v2-runtime.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const source=new URL('../../checkpoints/n05-actual-qualification-38049404414/identity-HTX.json.gz',import.meta.url),compressed=readFileSync(source),raw=gunzipSync(compressed);
assert.equal(hash(compressed),'f662bdb1562bce5c19a3b7df96978b2fe27264ff271121d12d0f44b5ee94497c');
assert.equal(hash(raw),'f2bcb443ac8b167fa0b64709fa019107043208e37ae94df96b676ef9c51a0d29');
const original=JSON.parse(raw),identity={chain:'ethereum',contract_or_mint:'0x0a092e544da31150b439a1aaa1a3a2214a867f46'};
// This original reference has no network receipt clock. NOW/RECEIVED below
// are explicitly controlled replay clocks, never historical detection proof.
const NOW=Date.parse('2026-10-18T00:00:00Z'),RECEIVED=NOW+17;
const baseline=JSON.parse(readFileSync(new URL('./fixtures/htx-identity-cache-baseline-sql.json',import.meta.url)));
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

for(const failure of ['known-error','unknown-error','unknown-ack'])for(const consumer of [false,true])test(`qualified original CT identity survives ${failure}, consumer=${consumer}`,async()=>{
 const out=await run(actual,{failure,consumer,name:failure+'-'+consumer});assert.equal(out.cache_failure_fired,true);assert.deepEqual(out.identity,identity);assert.equal(out.reference_observed_ts,RECEIVED);assert.equal(out.simulated_HTTP,1);assert.equal(out.durable_reference_daily_attempts,1);assert.equal(out.durable_reference_reservations,1);assert.equal(out.cache_receipts.length,1);
 if(failure==='known-error'){assert.equal(out.consumer_calls,consumer?1:0);if(consumer){assert.deepEqual(out.consumer_identity,identity);assert.ok(out.consumer_route_names.includes('JOINT_FLOW'));}}
 else{assert.equal(out.unknown_ops,1);assert.equal(out.SQL_after_unknown,0);assert.equal(out.consumer_calls,0);if(consumer)assert.equal(out.status,'SOURCE_CHAIN_STOPPED_UNCLOSED_NATIVE_USAGE');}
 assert.equal(out.reference_cache_rows,failure==='unknown-ack'?1:0);
});
for(const config of [{name:'preexisting_unknown',unknown_before:true},{name:'unknown_after_cache_read',stage:'cache-read'},{name:'unknown_after_day_read',stage:'day-read'}])test(config.name+' prevents later SQL, HTTP and supplemental work',async()=>{
 const out=await run(actual,{...config,consumer:true});assert.equal(out.consumer_calls,0);assert.equal(out.simulated_HTTP,0);assert.equal(out.SQL_after_unknown,0);assert.equal(out.unknown_ops,1);assert.equal(out.status,'SOURCE_CHAIN_STOPPED_UNCLOSED_NATIVE_USAGE');if(config.unknown_before)assert.equal(out.SQL_statements,0);
});
for(const consumer of [false,true])test(`ordinary identity success keeps the existing logical SQL envelope, consumer=${consumer}`,async()=>{
 const out=await run(actual,{consumer});assert.deepEqual(out.identity,identity);assert.equal(out.simulated_HTTP,1);assert.equal(out.SQL_statements,12);assert.deepEqual(out.SQL_shapes,baseline.logical_sql_shapes);assert.equal(out.unknown_ops,0);assert.equal(out.consumer_calls,consumer?1:0);
});
test('whole-job admission denial creates no provider request or identity',async()=>{const out=await run(actual,{no_admission:true});assert.equal(out.identity,null);assert.equal(out.simulated_HTTP,0);assert.equal(out.durable_reference_reservations,0);});
for(const invalid of ['bad-address','duplicate'])test(`optional persistence cannot qualify ${invalid} identity`,async()=>{const out=await run(actual,{failure:'known-error',invalid});assert.equal(out.identity,null);});

test('already-known identity is retained while unclosed usage prevents the supplemental caller',async()=>{
 const db=new DB();db.unknown=1;let calls=0;
 try{const out=await actual.collectHtxBoundSupplementalContext({db,contract:'CT-USDT',run_id:'KNOWN-CONTROL',now:NOW,registry:{CT:{official_name:'RetainedCT',...identity}},supplemental_collect:async()=>{calls++;return{status:'CLOSED',network_calls:0};}});
 assert.equal(out.status,'SOURCE_CHAIN_STOPPED_UNCLOSED_NATIVE_USAGE');assert.deepEqual(out.asset_identity,identity);assert.equal(out.identity_status,'CLOSED');assert.equal(calls,0);assert.equal(db.log.length,0);assert.equal(db.unknown,1);
 }finally{db.close();}
});
