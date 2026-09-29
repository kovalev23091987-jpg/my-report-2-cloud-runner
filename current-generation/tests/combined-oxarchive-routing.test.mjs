import test from 'node:test';import assert from 'node:assert/strict';
import {createCombinedLiquidationService,classifyOperationalSourceOutcome} from '../files/src/liquidation-extension/combined-runner-service.mjs';

test('K23 internal scheduler skips do not penalize provider availability',()=>{
 const skipped=classifyOperationalSourceOutcome({status:'SKIPPED_RUN_HTTP_BUDGET',result:false,actual_http:0});assert.equal(skipped.evaluated,false);assert.equal(skipped.failure_origin,'INTERNAL_SCHEDULER');
 const unsupported=classifyOperationalSourceOutcome({status:'UNSUPPORTED_NATIVE_SYMBOL',result:false,actual_http:1});assert.equal(unsupported.evaluated,true);assert.equal(unsupported.operational_success,true);assert.equal(unsupported.coverage_status,'UNSUPPORTED');
});

test('configured 0xArchive participates in the same bounded liquidation rotation and returns report input',async()=>{
 const expected={schema:'MULTI_LIQUIDATION_ACQUISITION_V1'},seen=[],admissions=[];
 const ox=async params=>{seen.push(params.contract);return expected;};ox.summary=()=>({enabled:true,credit_cost:1});
 const source_weight_store={load:async()=>[{source_id:'HYPERLIQUID_NATIVE',attempts:10,reliability:0},{source_id:'OXARCHIVE_HL_BUCKETS',attempts:10,reliability:1}],record:async row=>({recorded:true,...row})};
 const service=createCombinedLiquidationService({mode:'SHADOW_ONLY',provider_admit:async request=>{admissions.push(request.reservation_id);return{allowed:true,new_reservation:true};},fetch_impl:async()=>{throw Error('not expected');},secondary_enabled:false,oxarchive_collect:ox,source_weight_store});
 const result=await service.collect({contract:'ABC-USDT',native_symbol:'ABC',run_id:'r2',deep_started_ts:1_800_000_000_000,max_deep_ms:45000});
 assert.equal(result,expected);assert.deepEqual(seen,['ABC-USDT']);assert.equal(admissions[0],'LIQ_OXARCHIVE_HL_BUCKETS:r2:ABC-USDT');assert.ok(admissions.includes('LIQ_NATIVE_CATALOG:r2'));
 const summary=service.summary();assert.equal(summary.routed[0].lane,'OXARCHIVE_HL_BUCKETS');assert.equal(summary.oxarchive.enabled,true);assert.ok(summary.rotating_lanes.includes('OXARCHIVE_HL_BUCKETS_WHEN_KEY'));
 assert.equal(summary.outside_shared_budget_http,0);assert.equal(summary.shared_budget.reserved_http,1);
});

test('a failed selected source falls through to another eligible source without inventing data',async()=>{
 const ox=async()=>null;ox.summary=()=>({enabled:true,history:[{status:'HTTP_ERROR',http_status:404}]});
 const admissions=[];
 const source_weight_store={load:async()=>[{source_id:'HYPERLIQUID_NATIVE',attempts:10,reliability:0},{source_id:'OXARCHIVE_HL_BUCKETS',attempts:10,reliability:1}],record:async row=>({recorded:true,...row})};
 const service=createCombinedLiquidationService({mode:'SHADOW_ONLY',provider_admit:async request=>{admissions.push(request.reservation_id);return{allowed:true,new_reservation:true};},fetch_impl:async()=>new Response(JSON.stringify([[{name:'OTHER'}],[]]),{status:200,headers:{'content-type':'application/json'}}),secondary_enabled:false,oxarchive_collect:ox,source_weight_store,max_http_per_run:6});
 const result=await service.collect({contract:'ABC-USDT',native_symbol:'ABC',run_id:'r2',deep_started_ts:Date.now(),max_deep_ms:45000});
 assert.equal(result,null);assert.ok(admissions.some(id=>id.startsWith('LIQ_NATIVE_CATALOG:')));
 const routed=service.summary().routed;assert.deepEqual(routed.map(x=>x.lane),['OXARCHIVE_HL_BUCKETS','HYPERLIQUID_NATIVE']);assert.equal(routed[0].status,'HTTP_ERROR');assert.equal(routed[1].fallback,true);
});

test('exact mapped native venue is tried before an estimate and an unspent denial preserves fallback',async()=>{
 const expected={schema:'MULTI_LIQUIDATION_ACQUISITION_V1'},admissions=[];
 const ox=async()=>expected;ox.summary=()=>({enabled:true});
 const service=createCombinedLiquidationService({mode:'SHADOW_ONLY',clock:()=>1000,secondary_enabled:false,oxarchive_collect:ox,provider_admit:async request=>{admissions.push(request);return request.requests.LIGHTER?{allowed:false,new_reservation:false,reservation_not_created:true,reason:'PROVIDER_QUOTA_EXHAUSTED'}:{allowed:true,new_reservation:true};},source_weight_store:{load:async()=>[{source_id:'OXARCHIVE_HL_BUCKETS',reliability:1},{source_id:'HYPERLIQUID_NATIVE',reliability:0}],record:async()=>({recorded:true})},fetch_impl:async()=>{throw Error('unexpected transport');},max_http_per_run:5});
 const out=await service.collect({contract:'TAO-USDT',native_symbol:'TAO',run_id:'R',deep_started_ts:1000,max_deep_ms:45000,source_identity:{lighter_market_id:23}});
 assert.equal(out,expected);assert.ok(admissions[0].requests.LIGHTER);
 assert.equal(service.summary().routed[0].lane,'LIGHTER_NATIVE');assert.equal(service.summary().routed[0].source_outcome.evaluated,false);
 assert.equal(service.summary().shared_budget.reserved_http,1);
});
