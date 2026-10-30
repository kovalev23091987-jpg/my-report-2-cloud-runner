// PREPARED_UNEXECUTED. ONE affected controlled group; ROOT owns FIRST.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const sha=b=>createHash('sha256').update(b).digest('hex');
const clone=x=>JSON.parse(JSON.stringify(x));
export async function runBingxProducerIndividualCase({repo_root,expected_closure_sha256,save_result,binding_path='anomaly-research/bingx-observation-producer-20261024/import-closure.json'}={}){
 const partial={schema:'BINGX_PRODUCER_INDIVIDUAL_PARTIAL_V1',returned:[],completed:[],provider_HTTP:0,native_SQL:0,MAIN:0,Telegram:0};
 const save=async(name,result)=>{const item={name,result:structuredClone(result)};partial.returned.push(item);await save_result(item);return result;};
 const check=async(name,run,verify)=>{let result;try{result=await run();}catch(error){result={threw:true,error:String(error.message)};}await save(name,result);verify(result);partial.completed.push(name);return result;};
 try{
  if(typeof save_result!=='function'||!/^[a-f0-9]{64}$/.test(String(expected_closure_sha256)))throw Error('ROOT_EXTERNAL_CLOSURE_PIN_AND_RESULT_WRITER_REQUIRED');
  const root=resolve(repo_root),closureFile=resolve(root,binding_path);if(!closureFile.startsWith(root+'/'))throw Error('CLOSURE_OUTSIDE_ROOT');
  const raw=await readFile(closureFile);await save('EXTERNAL_CLOSURE',{bytes:raw.length,sha256:sha(raw),expected:expected_closure_sha256});assert.equal(sha(raw),expected_closure_sha256);
  const closure=JSON.parse(raw);assert.equal(closure.schema,'BINGX_PRODUCER_INDIVIDUAL_IMPORT_CLOSURE_V1');
  const attest=async stage=>{const result=[];for(const pin of closure.files){const p=resolve(root,pin.path);if(!p.startsWith(root+'/'))throw Error('PIN_OUTSIDE_ROOT');const b=await readFile(p);result.push({...pin,observed_bytes:b.length,observed_sha256:sha(b)});}await save(stage,result);for(const x of result){assert.equal(x.observed_bytes,x.bytes,x.path);assert.equal(x.observed_sha256,x.sha256,x.path);}return result;};
  await attest('BEFORE_FIRST_APPLICATION_IMPORT');
  const moduleAt=role=>{const x=closure.files.filter(x=>x.role===role);assert.equal(x.length,1,role);return join(root,x[0].path);};
  const batch=await import(pathToFileURL(moduleAt('market_snapshot_batch')).href);
  const reader=await import(pathToFileURL(moduleAt('market_history_reader')).href);
  const source=await import(pathToFileURL(moduleAt('source_assembler')).href);
  const i={schema:'BINGX_CRYPTO_PERPETUAL_INSTRUMENT_V1',venue:'BINGX',market:'FUTURES',product:'PERPETUAL',family:'USDT_M',contract:'BTC-USDT',native_symbol:'BTC-USDT',native_contract_id:'CONTROLLED100',base:'BTC',quote:'USDT',settle:'USDT',margin:'USDT',linear_inverse:'LINEAR',quantity_unit:null,contract_size_decimal:null,contract_size_unit:null,price_unit:'QUOTE_PER_NATIVE_BASE',identity_revision:'CONTROLLED_V1',crypto_eligibility:'VERIFIED_CRYPTO_PERPETUAL',underlying_class:'CRYPTO_ASSET',crypto_eligibility_proof_ref:'CONTROLLED_NOT_NATIVE',catalog_payload_sha256:'a'.repeat(64),token_multiplier_decimal:null,asset_binding:{status:'VENUE_SCOPED',canonical_asset_id:null,chain_id:null,token_address:null,token_epoch:null,proof_ref:'CONTROLLED_NOT_NATIVE'}};
  const actor='CONTROLLED_BINGX_RESEARCH',generation='CONTROLLED_GENERATION',specs={price:{unit:'QUOTE_PER_NATIVE_BASE',basis:'LAST'},oi:{unit:null,basis:'NATIVE_OPEN_INTEREST'},turnover_24h:{unit:null,basis:'PROVIDER_ROLLING_24H'},funding_rate:{unit:'RATE_PER_ACTUAL_PERIOD',basis:'NATIVE_FUNDING_RATE'}};
  const registry={schema:'BINGX_HISTORY_REGISTRY_V1',venue:'BINGX',actor,snapshot_schema:batch.SNAPSHOT_SCHEMA,row_schema:'BINGX_NATIVE_METRICS_ROW_V1',registry_revision:'CONTROLLED_V1',instruments:[{instrument_identity:i,unit_revision:'CONTROLLED_PRICE_ONLY',metric_specs:specs}]};
  const registryJSON=JSON.stringify(registry),binding={expected:{venue:'BINGX',actor,schema_version:batch.SNAPSHOT_SCHEMA,accepted_generations:[generation]},current:{registry_json:registryJSON,expected_sha256:sha(registryJSON),git_blob_locator:'CONTROLLED_NOT_NATIVE'},compatible:[]};
  const context=batch.bindBingxHistoryRegistry(binding),ref=batch.resolveBingxExpectedHistoryRef({context,expected_identity:clone(i)}),now=1800000000000,key='CONTROLLED_RUN_1';
  const observationAt=(bucket,price='100')=>{
   const metric=(kind,source_ts,received_ts)=>({kind,instrument_identity:clone(i),source_ts,received_ts,provenance:{endpoint:'/CONTROLLED/'+kind,payload_sha256:({last:'b',oi:'c',premium:'d'})[kind].repeat(64)}});
   return source.assembleBingxFuturesObservation({instrument_identity:clone(i),last:{...metric('last',bucket+1000,bucket+1500),value_decimal:price},oi:{...metric('oi',bucket+1200,bucket+1800),oi:{native_value_decimal:'500'}},premium:{...metric('premium',null,bucket+2000),last_funding_rate_decimal:'0.000054',funding_period_ms:28800000,funding_period_origin:'NATIVE_EXPLICIT_FUNDING_INTERVAL_HOURS',funding_update_time:bucket-3600000,funding_update_clock_scope:'UNQUALIFIED'}});
  };
  const bucket=now-300000,observation=observationAt(bucket),capture=observation.available_ts;
  await save('CONTROLLED_SOURCE_ASSEMBLER_RETURN',observation);
  const produce=(o=observation,process=capture+100,c=context,r=ref)=>batch.produceBingxHistoryRow({observation:o,processed_ts:process,context:c,instrument_ref:r});
  const produced=await check('SOURCE_ASSEMBLER_TO_PRODUCER',()=>produce(),r=>{assert.equal(r.price,100);assert.equal(r.captured_ts,capture);assert.equal(r.metrics.price.source_ts,bucket+1000);assert.equal(r.metrics.oi.usable,false);assert.equal(r.oi_contracts,null);assert.equal(r.funding_rate,null);assert.equal(r.funding_interval_hours,8);assert.equal(r.metrics.funding_rate.source_ts,null);assert.equal(r.event_first_known_ts,null);});
  await check('UNBOUND_CONTEXT_REJECTED',()=>produce(observation,capture+100,{}),r=>assert.equal(r.threw,true));
  await check('WRONG_NATIVE_ID_REJECTED',()=>{const x=clone(observation);x.data.instrument_identity.native_contract_id='OTHER';return produce(x);},r=>assert.equal(r.threw,true));
  await check('USDC_USDT_IDENTITY_SEPARATE',()=>{const x=clone(observation);Object.assign(x.data.instrument_identity,{quote:'USDC',settle:'USDC',margin:'USDC'});return produce(x);},r=>assert.equal(r.threw,true));
  await check('SOURCE_GRANT_UPLIFT_REJECTED',()=>{const x=clone(observation);x.data.entry_allowed=true;return produce(x);},r=>assert.equal(r.threw,true));
  await check('MISSING_LAST_SOURCE_CLOCK_REJECTED',()=>{const x=clone(observation);x.data.last_price_source_ts=null;return produce(x);},r=>assert.equal(r.threw,true));
  const delayed=await check('DELAYED_PROCESSING_IS_BACKFILL',()=>produce(observation,now+1000),r=>{assert.equal(r.processing_class,'BACKFILLED_RESEARCH');assert.equal(r.captured_ts,capture);assert.equal(r.event_first_known_ts,null);});
  await check('PROCESSING_LOOKAHEAD_REJECTED',()=>batch.normalizeBingxHistoryRow(delayed,{context,bucket,received_ts:capture,decision_ts:capture+200}),r=>assert.equal(r.threw,true));
  const dbRows=new Map();for(const period of [300000,900000,3600000,14400000,86400000]){
   const b=now-period,o=observationAt(b);await save('CONTROLLED_SOURCE_'+period,o);
   const shards=batch.packSnapshotShards({bucket:b,actor,generation,received_ts:o.available_ts,history_context:context,processed_ts:o.available_ts+100,source_observations:[{observation:o,instrument_ref:ref}]});
   await save('PACKED_SOURCE_'+period,shards);
   dbRows.set(b,shards.map(s=>({...s,source_timestamps_json:JSON.stringify(s.source_timestamps),contract_count:s.contracts})));
  }
  const database=()=>{
   const calls=[];
   return{calls,prepare(sql){
    return{bind(...args){
     return{async all(){
      calls.push({sql,args});
      return{success:true,results:clone(dbRows.get(args[5])??[])};
     }};
    }};
   }};
  };
  const db=database(),whole=await reader.readMarketHistoryTargets({db,now_ts:now,venue:'BINGX',root_history_binding:binding,history_reuse_key:key});
  await save('WHOLE_VERIFIED_RESULT',{queries:db.calls.length,status:whole.status,targets:Object.fromEntries(Object.entries(whole.targets).map(([k,v])=>[k,[...v]]))});assert.equal(db.calls.length,5);assert.equal(whole.populated,true);
  const args={contract:i.native_symbol,now_ts:now,hours:6,venue:'BINGX',instrument_identity:clone(i),root_history_binding:binding,whole_history_result:whole,history_reuse_key:key,history_purpose:'PRIMARY_MARKET_HISTORY'};
  await check('INDIVIDUAL_PRIVATE_CACHE_NO_NEW_SQL',()=>reader.readMarketHistoryForContract(args),r=>{assert.equal(r.additional_SQL,0);assert.equal(r.series.length,4);assert.equal(r.status,'PARTIAL');assert.equal(r.coverage.complete_5m_window,false);assert.equal(r.native_billable_cost,null);});
  for(const map of Object.values(whole.targets)){for(const row of map.values())row.price=999999;map.clear();}
  await check('PUBLIC_MAP_MUTATION_CANNOT_CHANGE_PRIVATE_POINTS',()=>reader.readMarketHistoryForContract(args),r=>{assert.equal(r.series.length,4);assert.equal(r.series[0].price,100);});
  await check('JSON_FORGED_CACHE_REJECTED',()=>reader.readMarketHistoryForContract({...args,whole_history_result:clone(whole),allow_bounded_read:true}),r=>{assert.equal(r.status,'NOT_CLOSED');assert.equal(r.additional_SQL,0);});
  await check('WRONG_CURRENT_RUN_REJECTED',()=>reader.readMarketHistoryForContract({...args,history_reuse_key:'OTHER'}),r=>assert.equal(r.status,'NOT_CLOSED'));
  await check('WRONG_EXPECTED_IDENTITY_REJECTED',()=>reader.readMarketHistoryForContract({...args,instrument_identity:{...i,native_contract_id:'OTHER'}}),r=>assert.equal(r.status,'NOT_CLOSED'));
  await check('ENTRY_PURPOSE_EXCLUDED',()=>reader.readMarketHistoryForContract({...args,history_purpose:'ENTRY_FOLLOWUP'}),r=>assert.equal(r.status,'NOT_CLOSED'));
  await check('EXPLICIT_BOUNDED_INDIVIDUAL_READ',async()=>{const bounded=database();const r=await reader.readMarketHistoryForContract({...args,db:bounded,whole_history_result:null,allow_bounded_read:true});return{result:r,logical_queries:bounded.calls.length};},r=>{assert.equal(r.logical_queries,5);assert.equal(r.result.additional_SQL,5);assert.equal(r.result.series.length,4);});
  const workerText=await readFile(moduleAt('worker_history_text'),'utf8');
  const getRegion=(start,end)=>{const a=workerText.indexOf(start),b=workerText.indexOf(end,a);assert.ok(a>=0&&b>a);return workerText.slice(a,b);};
  const wholeRegion=getRegion('async function loadHistoryTargets(\n','\nasync function loadHistoryTargetsLegacy('),individualRegion=getRegion('async function htxStage0History(\n','\n// Retained only to keep the historical parser');
  const workerDB=database(),env={DATA_DB:workerDB,REPORT2_PRIMARY_VENUE:'BINGX',REPORT2_BINGX_HISTORY_BINDING:binding,REPORT2_BINGX_HISTORY_READ_KEY:key};
  const load=new Function('readMarketHistoryTargets',wholeRegion+';return loadHistoryTargets;')(reader.readMarketHistoryTargets);
  const individual=new Function('readMarketHistoryForContract','Date','clamp','normalizeFuturesContract',individualRegion+';return htxStage0History;')(reader.readMarketHistoryForContract,{now:()=>now},(v,l,u,d)=>Number.isFinite(Number(v))?Math.min(u,Math.max(l,Number(v))):d,()=>{throw Error('BINGX_MUST_NOT_USE_HTX_NORMALIZER');});
  const loaded=await load(env,now);await save('ACTUAL_WORKER_WHOLE_RETURN',{...loaded,targets:Object.fromEntries(Object.entries(loaded.targets).map(([k,v])=>[k,[...v]])),logical_queries:workerDB.calls.length});
  await check('ACTUAL_WORKER_INDIVIDUAL_REUSES_WHOLE',async()=>{const r=await individual({...args},env);return{result:r,logical_total_queries:workerDB.calls.length};},r=>{assert.equal(r.logical_total_queries,5);assert.equal(r.result.additional_SQL,0);assert.equal(r.result.series.length,4);});
  await attest('AFTER_AFFECTED_GROUP');
  const result={schema:'BINGX_PRODUCER_INDIVIDUAL_CONTROLLED_V1',status:'CONTROLLED_CASE_RETURNED',completed:partial.completed,whole_Worker_imported:false,source_fixture:'CONTROLLED_ASSEMBLER_INPUT_NOT_PROVIDER_CAPTURE',logical_SQL_only:true,native_billable_cost:null,native_admission:false,first_knowledge_or_production_qualification:false};await save('FINAL_RETURN',result);return result;
 }catch(error){partial.error=String(error?.stack??error);if(typeof save_result==='function')await save_result({name:'PARTIAL_ON_THROW',result:structuredClone(partial)});throw error;}
}
