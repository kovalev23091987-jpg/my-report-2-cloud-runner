import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=path.resolve(process.env.REPORT2_TEST_RUNTIME||'current-generation/files');
const [{collectSelectedNativeBatch},{createCombinedLiquidationService},{bindNativeAcquisition}]=await Promise.all(['selected-native-batch.mjs','combined-runner-service.mjs','runtime-bridge.mjs'].map(n=>import(pathToFileURL(path.join(root,'src/liquidation-extension',n)))));
const T=Date.parse('2026-10-08T11:25:00Z'),contracts=['ZEC-USDT','NEAR-USDT'],run='CONTROLLED_TWO_NATIVE_SOURCE_PHASE',address='0x'+'1'.repeat(40);
const coverage_for=()=>({eligible:true,source_ids:['HYPERLIQUID_NATIVE'],proven_level_source_ids:[],structural_market_source_ids:[]});
const p=contract=>({contract,native_symbol:contract.replace(/-USDT$/,''),run_id:run,deep_started_ts:T,max_deep_ms:45000,max_http_for_candidate:5,manual_liquidation_request:false});
function fixture({latency=0,denied=false}={}){
 let now=T;const calls=[],grants=[],http_by_contract=new Map(),selection={run_id:run,contracts};
 const service=createCombinedLiquidationService({mode:'SHADOW_ONLY',candidate_slots:2,clock:()=>now,secondary_enabled:false,provider_admit:async r=>{grants.push(r);return denied?{allowed:false,new_reservation:false,reservation_not_created:true}:{allowed:true,new_reservation:true};},fetch_impl:async(url,init={})=>{
  calls.push({url:String(url),at:now,body:init.body?JSON.parse(init.body):null});now+=latency;let body;
  if(String(url).includes('node.liqflow.app')){const coin=String(url).includes('/NEAR/')?'NEAR':'ZEC';body={coin,positions:[{address:coin==='NEAR'?'0x'+'2'.repeat(40):address,size:10,liq_price:.7}]};}
  else if(JSON.parse(init.body).type==='metaAndAssetCtxs')body=[{universe:[{name:'ZEC'},{name:'NEAR'}]},[{markPx:'1'},{markPx:'1'}]];
  else body={time:now,marginSummary:{accountValue:'10',totalNtlPos:'10',totalMarginUsed:'5'},assetPositions:[JSON.parse(init.body).user===address?'ZEC':'NEAR'].map(coin=>({position:{coin,szi:'10',entryPx:'1',positionValue:'10',liquidationPx:'.7',marginUsed:'5',unrealizedPnl:'0',leverage:{type:'cross',value:2}}}))};
  return new Response(JSON.stringify(body));
 }});
 const collect=params=>collectSelectedNativeBatch({service,params,selection,coverage_for,http_by_contract,clock:()=>now});
 return{service,calls,grants,http_by_contract,selection,collect,setNow:v=>now=v};
}
test('retained failure shape: unrelated first-coin deep work expires the shared source phase with two requests unused',async()=>{
 const f=fixture();assert.ok(await f.service.collect({...p(contracts[0]),allowed_source_ids:['HYPERLIQUID_NATIVE']}));f.setNow(T+60000);
 assert.equal(await f.service.collect({...p(contracts[1]),deep_started_ts:T+60000,allowed_source_ids:['HYPERLIQUID_NATIVE']}),null);
 assert.ok(f.service.summary().shared_budget.actual_http<5);assert.ok(f.service.summary().routed.some(r=>r.status==='SKIPPED_DEADLINE'));
});
test('both selected markets are collected contiguously and the second deep consumer uses original raw at zero new HTTP',async()=>{
 const f=fixture(),first=await f.collect(p(contracts[0]));assert.ok(first);const counts=[f.calls.length,f.grants.length],budget=structuredClone(f.service.summary().shared_budget);
 assert.ok(f.calls.length<=5);assert.ok(f.http_by_contract.get(contracts[0])<=3);assert.ok(f.http_by_contract.get(contracts[1])<=2);
 f.setNow(T+60000);const second=await f.collect({...p(contracts[1]),deep_started_ts:T+60000,max_http_for_candidate:0,cache_only:true});assert.ok(second);
 assert.deepEqual([f.calls.length,f.grants.length],counts);assert.deepEqual(f.service.summary().shared_budget,budget);assert.equal(second.collection_completed_ts,T);
 const bound=bindNativeAcquisition(second,{contract:contracts[1],run_id:run,snapshot_id:'CONTROLLED_SECOND',observed_ts:T+60000,direction:'LONG'});
 assert.equal(bound.status,'USABLE_NATIVE_SAMPLE');assert.equal(bound.entry_eligible,false);assert.equal(bound.source_ts,T);
});
test('stale, future, changed and foreign acquisitions never acquire new transport in a cache-only consumer',async()=>{
 const f=fixture();await f.collect(p(contracts[0]));const second=await f.collect({...p(contracts[1]),cache_only:true}),n=f.calls.length;
 for(const now of [T-1,T+120001]){f.setNow(now);assert.equal(await f.collect({...p(contracts[1]),cache_only:true}),null);}
 f.setNow(T);second.accounts[0].state.time++;assert.equal(await f.collect({...p(contracts[1]),cache_only:true}),null);
 assert.equal(await f.collect({...p(contracts[1]),cache_only:true,run_id:'FOREIGN'}),null);assert.equal(f.calls.length,n);
});
test('cold cache-only, a single candidate and an explicit manual request cannot start a selected-pair batch',async()=>{
 const cold=fixture();assert.equal(await cold.collect({...p(contracts[0]),max_http_for_candidate:0,cache_only:true}),null);assert.equal(cold.calls.length,0);
 for(const change of ['SINGLE','MANUAL','FOREIGN_SELECTION']){const f=fixture();if(change==='SINGLE')f.selection.contracts=[contracts[0]];if(change==='FOREIGN_SELECTION')f.selection.run_id='FOREIGN';await f.collect({...p(contracts[0]),manual_liquidation_request:change==='MANUAL'});assert.equal(f.http_by_contract.has(contracts[1]),false);}
});
test('provider denial and transport deadline keep the five-request and 45s bounds unchanged',async()=>{
 const denied=fixture({denied:true});assert.equal(await denied.collect(p(contracts[0])),null);assert.equal(denied.calls.length,0);assert.equal(denied.service.summary().shared_budget.actual_http,0);
 const slow=fixture({latency:23000});await slow.collect(p(contracts[0]));assert.ok(slow.calls.length<=2);assert.equal(slow.service.summary().shared_budget.max_total_ms,45000);assert.equal(slow.service.summary().shared_budget.max_http,5);
});
test('frozen production runner calls the tested batch coordinator and retains per-contract accounting',()=>{
 const runner=fs.readFileSync(path.join(root,'runner-main.mjs'),'utf8');assert.match(runner,/collectSelectedNativeBatch\(\{service:liquidationSources,params,selection:env\.REPORT2_LIQUIDATION_SELECTED_CONTRACTS,coverage_for:liquidationCoverageFor,http_by_contract:futureHttpByContract\}\)/);
});
