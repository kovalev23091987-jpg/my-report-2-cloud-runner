import test from 'node:test';
import assert from 'node:assert/strict';
import {createRunnerLiquidationExtension} from '../files/src/liquidation-extension/runner-extension.mjs';

const response=value=>new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});

test('BTC and ETH make zero native external requests',async()=>{
 for(const base of ['BTC','ETH']){
  let admits=0,fetches=0;
  const extension=createRunnerLiquidationExtension({mode:'SHADOW_ONLY',clock:()=>1000,
   admit:async()=>{admits++;return{allowed:true,new_reservation:true};},fetch_impl:async()=>{fetches++;return response({});}});
  assert.equal(await extension.collect({contract:`${base}-USDT`,native_symbol:base,run_id:`run-${base}`,deep_started_ts:900}),null);
  assert.equal(admits,0);assert.equal(fetches,0);
  assert.equal(extension.summary().records[0].status,'SKIPPED_BTC_ETH_BY_USER_POLICY');
 }
});

test('unsupported HTX symbol spends only one catalog request and no LiqFlow/account requests',async()=>{
 const admitted=[],urls=[];
 const now=1790521000000;
 const extension=createRunnerLiquidationExtension({
  mode:'SHADOW_ONLY',clock:()=>now,accounts_per_deep:4,
  admit:async request=>(admitted.push(request),{allowed:true,new_reservation:true,reservation_id:request.reservation_id}),
  fetch_impl:async(url,init)=>(urls.push([String(url),init?.body]),response([{universe:[{name:'BTC',isDelisted:false}]},{}])),
 });
 const result=await extension.collect({contract:'FIL-USDT',native_symbol:'FIL',run_id:'run-1',deep_started_ts:now,max_deep_ms:45000});
 assert.equal(result,null);
 assert.equal(admitted.length,1);
 assert.deepEqual(admitted[0].requests,{HYPERLIQUID:1});
 assert.equal(urls.length,1);
 assert.equal(extension.summary().reserved_http,1);
 assert.equal(extension.summary().records[0].status,'UNSUPPORTED_NATIVE_SYMBOL');
 assert.equal(extension.summary().records[0].htx_factual_still_eligible,true);
});

test('supported HTX alt reserves sample requests only after exact catalog match',async()=>{
 const admitted=[],urls=[];
 const now=1790521000000;
 const fetch_impl=async(url,init)=>{
  urls.push(String(url));
  if(String(url).includes('api.hyperliquid.xyz')){
   const body=JSON.parse(init.body);
   if(body.type==='metaAndAssetCtxs')return response([{universe:[{name:'FIL',isDelisted:false}]},{markPx:'3'}]);
   if(body.type==='clearinghouseState')return response({assetPositions:[]});
  }
  return response({coin:'FIL',positions:[]});
 };
 const extension=createRunnerLiquidationExtension({mode:'SHADOW_ONLY',clock:()=>now,accounts_per_deep:3,max_http_per_run:5,fetch_impl,
  admit:async request=>(admitted.push(request),{allowed:true,new_reservation:true,reservation_id:request.reservation_id})});
 const result=await extension.collect({contract:'FIL-USDT',native_symbol:'FIL',run_id:'run-2',deep_started_ts:now,max_deep_ms:45000});
 assert.ok(result);
 assert.equal(admitted.length,2);
 assert.deepEqual(admitted[0].requests,{HYPERLIQUID:1});
 assert.deepEqual(admitted[1].requests,{HYPERLIQUID:3,LIQFLOW:1});
 assert.equal(extension.summary().reserved_http,5);
});
