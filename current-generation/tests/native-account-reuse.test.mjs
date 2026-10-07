import test from 'node:test';
import assert from 'node:assert/strict';
import {createCombinedLiquidationService,acquisitionHasFreshLevels,classifyOperationalSourceOutcome} from '../files/src/liquidation-extension/combined-runner-service.mjs';
import {createRunnerLiquidationExtension} from '../files/src/liquidation-extension/runner-extension.mjs';
import {bindNativeAcquisition} from '../files/src/liquidation-extension/runtime-bridge.mjs';
const T=Date.parse('2026-10-07T06:30:00Z'),a='0x'+'1'.repeat(40),b='0x'+'2'.repeat(40);
function fixture({combined=true,missingClock=false,missingPrice=false}={}){
 let now=T;const calls=[],grants=[];
 const options={mode:'SHADOW_ONLY',clock:()=>now,max_total_ms:45000,max_http_per_run:5,accounts_per_deep:3,fetch_impl:async(url,init={})=>{
  const body=init.body?JSON.parse(init.body):null;calls.push({url:String(url),body});let payload;
  if(body?.type==='metaAndAssetCtxs')payload=[{universe:[{name:'FIL'},{name:'NEAR'}]},[{markPx:'1'},{markPx:'1'}]];
  else if(String(url).includes('node.liqflow.app'))payload={coin:String(url).includes('/NEAR/')?'NEAR':'FIL',positions:[{address:a,size:10,liq_price:.7},...(String(url).includes('/NEAR/')?[{address:b,size:-10,liq_price:1.3}]:[])]};
  else payload={...(missingClock?{}:{time:now}),assetPositions:['FIL','NEAR'].map(coin=>({position:{coin,szi:body.user===b?'-10':'10',positionValue:'10',liquidationPx:missingPrice?null:body.user===b?'1.3':'.7',leverage:{type:'cross',value:2}}}))};
  return new Response(JSON.stringify(payload));
 }};
 const admit=async r=>{grants.push(r);return{allowed:true,new_reservation:true};};
 const service=combined?createCombinedLiquidationService({...options,candidate_slots:2,secondary_enabled:false,provider_admit:admit}):createRunnerLiquidationExtension({...options,admit});
 const collect=(contract,run_id='same')=>service.collect({contract,native_symbol:contract.split('-')[0],run_id,deep_started_ts:now,max_http_for_candidate:combined?5:3,allowed_source_ids:['HYPERLIQUID_NATIVE']});
 return{service,calls,grants,collect,advance:ms=>{now+=ms;},clock:()=>now};
}
test('five calls verify an additional distinct second-market account while preserving both sides and original clocks',async()=>{
 const f=fixture(),first=await f.collect('FIL-USDT');f.advance(1500);const second=await f.collect('NEAR-USDT');
 assert.equal(first.accounts.length,1);assert.equal(second.accounts.length,2);assert.equal(f.calls.length,5);assert.equal(second.provenance.reused_native_accounts,1);
 assert.equal(second.accounts.find(x=>x.address===a).http_receipt.received_ts,T);assert.equal(second.accounts.find(x=>x.address===a).state.time,T);
 assert.equal(second.collection_started_ts,T);assert.equal(second.provenance.collection_attempt_started_ts,T+1500);
 const bound=bindNativeAcquisition(second,{contract:'NEAR-USDT',run_id:'same',snapshot_id:'S:NEAR',observed_ts:f.clock(),direction:null});
 assert.equal(bound.status,'USABLE_NATIVE_SAMPLE');assert.equal(bound.source_ts,T);assert.equal(bound.sample_accounts,2);assert.equal(bound.above.length,1);assert.equal(bound.below.length,1);
 assert.equal(f.grants.reduce((n,r)=>n+r.max_requests,0),5);assert.equal(bound.entry_eligible,false);assert.equal(bound.coverage,'BOUNDED_ACCOUNT_SAMPLE_NOT_FULL_MARKET');
 assert.equal(acquisitionHasFreshLevels(second,{contract:'NEAR-USDT',run_id:'same',observed_ts:T+120001}),false);
 first.accounts[0].state.time=0;assert.equal(second.accounts.find(x=>x.address===a).state.time,T);
});
test('cached accounts cannot cross run identity and an invalid source clock cannot create useful levels',async()=>{
 const f=fixture({combined:false}),first=await f.collect('FIL-USDT','first');const second=await f.collect('NEAR-USDT','second');
 assert.equal(first.accounts.length,1);assert.equal(second,null);assert.equal(f.calls.length,4);
 const bad=fixture({missingClock:true}),raw=await bad.collect('FIL-USDT');
 assert.equal(acquisitionHasFreshLevels(raw,{contract:'FIL-USDT',run_id:'same',observed_ts:T}),false);
 assert.equal(bad.service.summary().routed[0].source_outcome.operational_success,true);assert.equal(bad.service.summary().routed[0].source_outcome.role_usable,false);
});
test('a successful empty map is operationally available without being counted as useful coverage',async()=>{
 const f=fixture({missingPrice:true});await f.collect('FIL-USDT');const route=f.service.summary().routed[0];
 assert.equal(route.usable,false);assert.equal(route.source_outcome.transport_status,'CLOSED');assert.equal(route.source_outcome.role_usable,false);
 assert.equal(classifyOperationalSourceOutcome({status:'ACQUISITION_RETURNED',result:true}).role_usable,false);
});
