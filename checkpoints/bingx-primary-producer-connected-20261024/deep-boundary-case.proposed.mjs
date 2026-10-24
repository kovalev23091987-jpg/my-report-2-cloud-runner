// FIRST new actual Worker caller case. Inputs are CONTROLLED; no native grant.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
export async function runBingxDeepBoundaryCase({repo_root,save_result}={}){
 const result={schema:'BINGX_ACTUAL_DEEP_BOUNDARY_CONTROLLED_V1',completed:[],actual_returns:[],groups:0,provider_HTTP:0,native_SQL:0,MAIN:0,Telegram:0};
 const originalNow=Date.now,originalFetch=globalThis.fetch;
 let fetches=0,sql=0,reads=0;
 const save=async(name,value)=>{result.actual_returns.push({name,value:structuredClone(value)});await save_result(name,structuredClone(result));return value;};
 try{
  assert.equal(typeof save_result,'function');globalThis.fetch=async()=>{fetches++;throw Error('NATIVE_NETWORK_FORBIDDEN');};
  const api=await import(pathToFileURL(join(repo_root,'current-generation/files/src/worker.js')).href);
  const source=await import(pathToFileURL(join(repo_root,'current-generation/files/src/bingx-perpetual-market.mjs')).href);
  const T=1800000000000,H='a'.repeat(64);
  const i={schema:'BINGX_CRYPTO_PERPETUAL_INSTRUMENT_V1',venue:'BINGX',market:'FUTURES',product:'PERPETUAL',family:'USDT_M',contract:'CONTROLLED-USDC',native_symbol:'CONTROLLED-USDC',native_contract_id:'CONTROLLED100',base:'CONTROLLED',quote:'USDC',settle:'USDC',margin:'USDC',linear_inverse:'LINEAR',quantity_unit:null,contract_size_decimal:null,contract_size_unit:null,price_unit:'QUOTE_PER_NATIVE_BASE',identity_revision:'CONTROLLED_V1',crypto_eligibility:'VERIFIED_CRYPTO_PERPETUAL',underlying_class:'CRYPTO_ASSET',crypto_eligibility_proof_ref:'CONTROLLED_NOT_NATIVE',catalog_payload_sha256:H,token_multiplier_decimal:null,asset_binding:{status:'VENUE_SCOPED',canonical_asset_id:null,chain_id:null,token_address:null,token_epoch:null,proof_ref:null}};
  const registry={schema:'BINGX_HISTORY_REGISTRY_V1',venue:'BINGX',actor:'CONTROLLED_RESEARCH',snapshot_schema:'report2-market-snapshot-batch-v1',row_schema:'BINGX_NATIVE_METRICS_ROW_V1',registry_revision:'CONTROLLED_V1',instruments:[{instrument_identity:i,unit_revision:'CONTROLLED_PRICE_ONLY',metric_specs:{price:{unit:'QUOTE_PER_NATIVE_BASE',basis:'LAST'},oi:{unit:null,basis:'NATIVE_OPEN_INTEREST'},turnover_24h:{unit:null,basis:'PROVIDER_ROLLING_24H'},funding_rate:{unit:'RATE_PER_ACTUAL_PERIOD',basis:'NATIVE_FUNDING_RATE'}}}]};
  const json=JSON.stringify(registry),binding={expected:{venue:'BINGX',actor:registry.actor,schema_version:registry.snapshot_schema,accepted_generations:['CONTROLLED_GENERATION']},current:{registry_json:json,expected_sha256:createHash('sha256').update(json).digest('hex'),git_blob_locator:'CONTROLLED_NOT_NATIVE'},compatible:[]};
  const metric=source.normalizeBingxMetric({kind:'last',instrument_identity:structuredClone(i),receipt:{family:'USDT_M',endpoint:'/openApi/swap/v1/ticker/price',http_status:200,body_complete:true,usage_state:'KNOWN',received_ts:T+100,payload_sha256:H,native_symbol:i.native_symbol},body:{code:0,data:{symbol:i.native_symbol,price:'101.25',time:T}}});
  const observation=await save('actual Source assembler',source.assembleBingxFuturesObservation({instrument_identity:structuredClone(i),last:metric}));
  const reader=async request=>{reads++;assert.deepEqual(request.expected_instrument_identity,i);return structuredClone(observation);};
  const env={REPORT2_PRIMARY_VENUE:'BINGX',REPORT2_BINGX_HISTORY_BINDING:binding,_bingx_snapshot_reader:reader,DATA_DB:{prepare(){sql++;throw Error('NATIVE_SQL_FORBIDDEN');}}};
  const params={contract:i.native_symbol,venue:'BINGX'};
  const check=async(name,call,verify)=>{result.current=name;const value=await save(name,await call());verify(value);result.completed.push(name);delete result.current;};
  Date.now=()=>T+200;
  await check('missing protected registry stops before all readers and old HTX',()=>api.buildDeepCheckInputForTest(params,{...env,REPORT2_BINGX_HISTORY_BINDING:null}),v=>{assert.equal(v.status,'NOT_CLOSED');assert.equal(v.reason,'BINGX_RESEARCH_BINDING_REQUIRED');assert.equal(reads,0);});
  await check('actual Deep Source-to-typed-row caller stays partial nonexecutable',()=>api.buildDeepCheckInputForTest(params,env),v=>{assert.equal(v.status,'NOT_CLOSED');assert.equal(v.reason,'BINGX_FULL_DEEP_NOT_CONNECTED');assert.equal(v.venue,'BINGX');assert.equal(v.entry_authorized,false);assert.equal(v.history_proposal_persisted,false);assert.equal(v.observation_reference_price.type,'LAST_OBSERVATION');assert.equal(v.observation_reference_price.value,101.25);assert.equal(v.history_proposal.price,101.25);assert.equal(v.history_proposal.event_first_known_ts,null);assert.equal(v.history_proposal.contract,i.contract);assert.equal(v.futures_snapshot.data.instrument_identity.quote,'USDC');assert.equal(reads,1);});
  Date.now=()=>T+300001;
  await check('actual late Deep processing preserves historical capture and rejects current LAST',()=>api.buildDeepCheckInputForTest(params,env),v=>{assert.equal(v.observation_reference_price.status,'NOT_CLOSED');assert.equal(v.history_proposal.processing_class,'BACKFILLED_RESEARCH');assert.equal(v.history_proposal.captured_ts,T+100);assert.equal(v.history_proposal.event_first_known_ts,null);});
  Date.now=()=>T+200;
  await check('foreign source identity cannot become a history proposal',()=>api.buildDeepCheckInputForTest(params,{...env,_bingx_snapshot_reader:async()=>({...observation,data:{...observation.data,instrument_identity:{...i,native_contract_id:'FOREIGN'}}})}),v=>{assert.equal(v.status,'NOT_CLOSED');assert.equal(v.history_proposal,null);assert.equal(v.futures_snapshot.reason,'BINGX_PRIMARY_NOT_CONNECTED');});
  await check('JSON caller cannot install internal capture reader',()=>api.buildDeepCheckInputForTest({...params,_bingx_snapshot_reader:true,allowed:true},{...env,_bingx_snapshot_reader:null}),v=>{assert.equal(v.status,'NOT_CLOSED');assert.equal(v.history_proposal,null);assert.equal(v.futures_snapshot.reason,'BINGX_PRIMARY_NOT_CONNECTED');});
  const before=reads;
  await check('unregistered exact contract stops before capture',()=>api.buildDeepCheckInputForTest({...params,contract:'OTHER-USDC'},env),v=>{assert.equal(v.status,'NOT_CLOSED');assert.equal(v.reason,'BINGX_RESEARCH_BINDING_REQUIRED');assert.equal(reads,before);});
  await check('identity-only BingX selection cannot reach old HTX Deep',()=>api.buildDeepCheckInputForTest({contract:i.native_symbol,instrument_identity:structuredClone(i)},{...env,REPORT2_PRIMARY_VENUE:undefined}),v=>{assert.equal(v.venue,'BINGX');assert.equal(v.status,'NOT_CLOSED');assert.equal(v.reason,'BINGX_FULL_DEEP_NOT_CONNECTED');});
  assert.equal(fetches,0);assert.equal(sql,0);assert.equal(result.completed.length,7);result.groups=1;result.variants=7;result.status='CONTROLLED_ACTUAL_DEEP_BOUNDARY_COMPLETE';return result;
 }catch(error){result.status='CONTROLLED_ACTUAL_DEEP_BOUNDARY_FAILED';error.partial_result=structuredClone(result);throw error;}
 finally{Date.now=originalNow;globalThis.fetch=originalFetch;}
}
