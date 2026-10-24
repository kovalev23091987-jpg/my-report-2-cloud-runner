// FIRST new callable, author UNEXECUTED. All market bodies below are CONTROLLED.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

export async function runBingxLastReferenceCase({repo_root,save_result}={}){
 const result={schema:'BINGX_LAST_OBSERVATION_CONNECTED_CONTROLLED_V1',fixture_kind:'CONTROLLED_NOT_NATIVE_ORIGINAL',completed:[],actual_returns:[],groups:0,provider_HTTP:0,native_SQL:0,CF:0,MAIN:0,Telegram:0};
 const saved=async(name,value)=>{result.actual_returns.push({name,value:structuredClone(value)});await save_result(name,structuredClone(result));return value;};
 try{
  assert.equal(typeof save_result,'function');
  const contracts=await import(pathToFileURL(join(repo_root,'current-generation/files/src/market-contracts.mjs')).href);
  const adapter=await import(pathToFileURL(join(repo_root,'current-generation/files/src/bingx-perpetual-market.mjs')).href);
  const worker=await fs.readFile(join(repo_root,'current-generation/files/src/worker.js'),'utf8');
  const start=worker.indexOf('    const lastOrigins=Array.isArray(source?.data?.component_origins)'),end=worker.indexOf('\n    let historyProposal=',start);
  assert(start>=0&&end>start);
  const observe=new Function('buildHtxReferencePrice','contract','futures','params','const source=futures;const expectedIdentity=params.instrument_identity;const decisionTs=futures.available_ts;'+worker.slice(start,end)+'\nreturn bingxObservationReferencePrice;');
  const ts=1792862000000,H='c'.repeat(64);
  const identity={schema:'BINGX_CRYPTO_PERPETUAL_INSTRUMENT_V1',venue:'BINGX',market:'FUTURES',product:'PERPETUAL',family:'USDT_M',contract:'CONTROLLED-USDT',native_symbol:'CONTROLLED-USDT',native_contract_id:'CONTROLLED_ONLY',base:'CONTROLLED',quote:'USDT',settle:'USDT',margin:'USDT',linear_inverse:'LINEAR',quantity_unit:null,contract_size_decimal:null,contract_size_unit:null,price_unit:'QUOTE_PER_NATIVE_BASE',identity_revision:'CONTROLLED_REV1',crypto_eligibility:'VERIFIED_CRYPTO_PERPETUAL',underlying_class:'CRYPTO_ASSET',crypto_eligibility_proof_ref:'CONTROLLED_CLASSIFICATION_NOT_NATIVE',catalog_payload_sha256:H,asset_binding:{status:'VENUE_SCOPED',canonical_asset_id:null,chain_id:null,token_address:null,token_epoch:null,proof_ref:null},token_multiplier_decimal:null};
  const receipt=(kind,symbol=identity.native_symbol)=>({family:'USDT_M',endpoint:{last:'/openApi/swap/v1/ticker/price',premium:'/openApi/swap/v2/quote/premiumIndex'}[kind],http_status:200,body_complete:true,usage_state:'KNOWN',received_ts:ts+100,payload_sha256:H,native_symbol:symbol});
  const last=adapter.normalizeBingxMetric({kind:'last',instrument_identity:identity,receipt:receipt('last'),body:{code:0,data:{symbol:identity.native_symbol,price:'101.25',time:ts}}});
  const mixedPremium=adapter.normalizeBingxMetric({kind:'premium',instrument_identity:identity,receipt:{...receipt('premium'),received_ts:ts+250},body:{code:0,data:{symbol:identity.native_symbol,markPrice:'102',indexPrice:'103',lastFundingRate:'0.0002',fundingIntervalHours:8,updateTime:ts-3600000}}});
  const carrier=await saved('actual Source last+later premium carrier',adapter.assembleBingxFuturesObservation({instrument_identity:identity,last,premium:mixedPremium}));
  const futures={available_ts:ts+300,data:carrier.data};
  const run=async(name,call,verify)=>{result.current=name;const value=await saved(name,call());verify(value);result.completed.push(name);delete result.current;};
  const ref=(extra={})=>contracts.buildHtxReferencePrice({venue:'BINGX',contract:identity.contract,type:'LAST_OBSERVATION',value:101.25,source_ts:ts,received_ts:ts+100,decision_ts:ts+200,maximum_age_ms:300000,instrument_identity:identity,expected_instrument_identity:identity,...extra});
  await run('actual Worker uses Source LAST without invented BBO',()=>observe(contracts.buildHtxReferencePrice,identity.contract,futures,{instrument_identity:identity}),v=>{assert.equal(v.status,'CLOSED');assert.equal(v.type,'LAST_OBSERVATION');assert.equal(v.value,101.25);assert.equal(v.source_ts,ts);assert.equal(v.received_ts,ts+100);assert.equal(carrier.data.received_ts,ts+250);assert.equal(v.venue,'BINGX');assert.equal(v.native_identity_authenticated,false);assert.equal(carrier.execution_status,'PARTIAL');assert.equal(carrier.data.native_admission,false);assert.equal(carrier.data.entry_allowed,false);});
  await run('late retained research cannot become current price',()=>observe(contracts.buildHtxReferencePrice,identity.contract,{...futures,available_ts:ts+300001},{instrument_identity:identity}),v=>{assert.equal(v.status,'NOT_CLOSED');assert.equal(v.reason,'BINGX_LAST_OBSERVATION_FRESHNESS_NOT_CLOSED');});
  await run('LAST lacks execution receipt even with caller SUCCESS',()=>contracts.buildHtxExecutionReceipt({component:{execution_status:'SUCCESS',venue:'BINGX',instrument_identity:identity},reference_price:ref(),expected_instrument_identity:identity}),v=>assert.equal(v.status,'NOT_CLOSED'));
  await run('LAST cannot be relabelled ask without original book',()=>ref({type:'EXECUTABLE_ASK'}),v=>assert.equal(v.status,'NOT_CLOSED'));
  await run('missing decision clock refuses LAST',()=>ref({decision_ts:null}),v=>assert.equal(v.status,'NOT_CLOSED'));
  await run('future original clock refuses LAST',()=>ref({source_ts:ts+101}),v=>assert.equal(v.status,'NOT_CLOSED'));
  await run('caller cannot widen current LAST age beyond bounded horizon',()=>ref({maximum_age_ms:300001}),v=>assert.equal(v.status,'NOT_CLOSED'));
  await run('missing native price clock cannot borrow received time',()=>ref({source_ts:null}),v=>assert.equal(v.status,'NOT_CLOSED'));
  await run('raw numeric string cannot bypass strict reference value',()=>ref({value:'101.25'}),v=>assert.equal(v.status,'NOT_CLOSED'));
  await run('independent identity mismatch refuses actual Worker LAST',()=>observe(contracts.buildHtxReferencePrice,identity.contract,futures,{instrument_identity:{...identity,native_contract_id:'OTHER_CONTROLLED_ID'}}),v=>assert.equal(v.status,'NOT_CLOSED'));
  await run('same API route USDC remains distinct quote settlement and identity',()=>{const usdc={...identity,contract:'CONTROLLED-USDC',native_symbol:'CONTROLLED-USDC',quote:'USDC',settle:'USDC',margin:'USDC',native_contract_id:'OTHER_USDC_CONTROLLED'};return{usdt:ref(),usdc:ref({contract:usdc.contract,instrument_identity:usdc,expected_instrument_identity:usdc})};},v=>{assert.equal(v.usdc.status,'CLOSED');assert.equal(v.usdc.instrument_identity.family,'USDT_M');assert.equal(v.usdc.instrument_identity.quote,'USDC');assert.equal(v.usdc.instrument_identity.settle,'USDC');assert.notEqual(v.usdc.instrument_key,v.usdt.instrument_key);});
  const premium=adapter.normalizeBingxMetric({kind:'premium',instrument_identity:identity,receipt:receipt('premium'),body:{code:0,data:{symbol:identity.native_symbol,markPrice:'102',indexPrice:'103',lastFundingRate:'0.0002',fundingIntervalHours:8,updateTime:ts-3600000}}});
  await run('missing LAST cannot promote mark index or funding metadata clock',()=>{const data=adapter.assembleBingxFuturesObservation({instrument_identity:identity,premium}).data;return observe(contracts.buildHtxReferencePrice,identity.contract,{available_ts:ts+200,data},{instrument_identity:identity});},v=>assert.equal(v.status,'NOT_CLOSED'));
  assert.equal(result.completed.length,12);result.groups=1;result.variants=result.completed.length;result.status='CONTROLLED_LAST_REFERENCE_CHAIN_COMPLETE';return result;
 }catch(error){result.status='CONTROLLED_LAST_REFERENCE_CHAIN_FAILED';error.partial_result=structuredClone(result);throw error;}
}
