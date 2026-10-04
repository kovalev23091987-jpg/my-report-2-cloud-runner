import test from 'node:test';import assert from 'node:assert/strict';
import {createCombinedLiquidationService,classifyOperationalSourceOutcome} from '../files/src/liquidation-extension/combined-runner-service.mjs';

test('K23 internal scheduler skips do not penalize provider availability',()=>{
 const skipped=classifyOperationalSourceOutcome({status:'SKIPPED_RUN_HTTP_BUDGET',result:false,actual_http:0});assert.equal(skipped.evaluated,false);assert.equal(skipped.failure_origin,'INTERNAL_SCHEDULER');
 const unsupported=classifyOperationalSourceOutcome({status:'UNSUPPORTED_NATIVE_SYMBOL',result:false,actual_http:1});assert.equal(unsupported.evaluated,true);assert.equal(unsupported.operational_success,true);assert.equal(unsupported.coverage_status,'UNSUPPORTED');
});
test('explicit provider quota failures are recorded without lowering source reliability',async()=>{
 const updates=[],roles=[];const ox=async()=>null;ox.summary=()=>({history:[{status:'HTTP_429'}]});
 const service=createCombinedLiquidationService({mode:'SHADOW_ONLY',secondary_enabled:false,oxarchive_collect:ox,provider_admit:async()=>({allowed:true,new_reservation:true}),fetch_impl:async()=>new Response(JSON.stringify([{universe:[{name:'ABC'}]},[]])),source_weight_store:{load:async()=>[],record:async row=>{updates.push(row);return{recorded:true};},recordRole:async row=>{roles.push(row);return{recorded:true};}}});
 await service.collect({contract:'ABC-USDT',native_symbol:'ABC',run_id:'quota',deep_started_ts:Date.now(),max_deep_ms:45000});
 assert.equal(updates.some(row=>row.source_id==='OXARCHIVE_HL_BUCKETS'),false);
 assert.equal(roles.find(row=>row.source_id==='OXARCHIVE_HL_BUCKETS').status,'HTTP_429');
 assert.equal(service.summary().routed.find(row=>row.lane==='OXARCHIVE_HL_BUCKETS').source_outcome.failure_origin,'PROVIDER_QUOTA');
});

test('configured 0xArchive participates in the same bounded liquidation rotation and returns report input',async()=>{
 const expected={schema:'MULTI_LIQUIDATION_ACQUISITION_V1'},seen=[],admissions=[];
 const ox=async params=>{seen.push(params.contract);return expected;};ox.summary=()=>({enabled:true,credit_cost:1});
 const source_weight_store={load:async()=>[{source_id:'HYPERLIQUID_NATIVE',attempts:10,reliability:0},{source_id:'OXARCHIVE_HL_BUCKETS',attempts:10,reliability:1}],record:async row=>({recorded:true,...row})};
 const service=createCombinedLiquidationService({mode:'SHADOW_ONLY',provider_admit:async request=>{admissions.push(request.reservation_id);return{allowed:true,new_reservation:true};},fetch_impl:async(url,init)=>{if(init?.body&&JSON.parse(init.body).type==='metaAndAssetCtxs')return new Response(JSON.stringify([{universe:[{name:'ABC'}]},[]]));throw Error('discovery unavailable');},secondary_enabled:false,oxarchive_collect:ox,source_weight_store});
 const result=await service.collect({contract:'ABC-USDT',native_symbol:'ABC',run_id:'r2',deep_started_ts:1_800_000_000_000,max_deep_ms:45000});
 assert.equal(result,expected);assert.deepEqual(seen,['ABC-USDT']);assert.equal(admissions[0],'LIQ_NATIVE_CATALOG:r2');assert.ok(admissions.includes('LIQ_NATIVE_CATALOG:r2'));
 const summary=service.summary();assert.equal(summary.routed[0].lane,'HYPERLIQUID_NATIVE');assert.equal(summary.oxarchive.enabled,true);assert.ok(summary.rotating_lanes.includes('OXARCHIVE_HL_BUCKETS_WHEN_KEY'));
 assert.equal(summary.outside_shared_budget_http,0);assert.equal(summary.shared_budget.reserved_http,2);
});

test('a failed selected source falls through to another eligible source without inventing data',async()=>{
 const ox=async()=>null;ox.summary=()=>({enabled:true,history:[{status:'HTTP_ERROR',http_status:404}]});
 const admissions=[];
 const source_weight_store={load:async()=>[{source_id:'HYPERLIQUID_NATIVE',attempts:10,reliability:0},{source_id:'OXARCHIVE_HL_BUCKETS',attempts:10,reliability:1}],record:async row=>({recorded:true,...row})};
 const service=createCombinedLiquidationService({mode:'SHADOW_ONLY',provider_admit:async request=>{admissions.push(request.reservation_id);return{allowed:true,new_reservation:true};},fetch_impl:async()=>new Response(JSON.stringify([{universe:[{name:'ABC'}]},[]]),{status:200,headers:{'content-type':'application/json'}}),secondary_enabled:false,oxarchive_collect:ox,source_weight_store,max_http_per_run:6});
 const result=await service.collect({contract:'ABC-USDT',native_symbol:'ABC',run_id:'r2',deep_started_ts:Date.now(),max_deep_ms:45000});
 assert.equal(result,null);assert.ok(admissions.some(id=>id.startsWith('LIQ_NATIVE_CATALOG:')));
 const routed=service.summary().routed;assert.deepEqual(routed.map(x=>x.lane),['HYPERLIQUID_NATIVE','OXARCHIVE_HL_BUCKETS']);assert.equal(routed[1].status,'HTTP_ERROR');assert.equal(routed[1].fallback,true);
});

test('durable per-asset coverage restricts runtime calls to admitted source ids',async()=>{
 let oxCalls=0;const ox=async()=>{oxCalls++;return null;};ox.summary=()=>({enabled:true});
 const service=createCombinedLiquidationService({mode:'SHADOW_ONLY',secondary_enabled:false,oxarchive_collect:ox,provider_admit:async()=>({allowed:true,new_reservation:true}),fetch_impl:async()=>new Response(JSON.stringify([{universe:[{name:'OTHER'}]},[]]),{status:200})});
 await service.collect({contract:'ABC-USDT',native_symbol:'ABC',run_id:'coverage',deep_started_ts:Date.now(),max_deep_ms:45000,allowed_source_ids:['HYPERLIQUID_NATIVE']});
 assert.equal(oxCalls,0);assert.deepEqual(service.summary().routed.map(row=>row.lane),['HYPERLIQUID_NATIVE']);
});
