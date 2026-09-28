import test from 'node:test';import assert from 'node:assert/strict';
import {createCombinedLiquidationService} from '../files/src/liquidation-extension/combined-runner-service.mjs';

test('configured 0xArchive participates in the same bounded liquidation rotation and returns report input',async()=>{
 const expected={schema:'MULTI_LIQUIDATION_ACQUISITION_V1'},seen=[],admissions=[];
 const ox=async params=>{seen.push(params.contract);return expected;};ox.summary=()=>({enabled:true,credit_cost:1});
 const source_weight_store={load:async()=>[{source_id:'HYPERLIQUID_NATIVE',attempts:10,reliability:0},{source_id:'OXARCHIVE_HL_BUCKETS',attempts:10,reliability:1}],record:async row=>({recorded:true,...row})};
 const service=createCombinedLiquidationService({mode:'SHADOW_ONLY',provider_admit:async request=>{admissions.push(request.reservation_id);return{allowed:false,new_reservation:false};},fetch_impl:async()=>{throw Error('not expected');},secondary_enabled:false,oxarchive_collect:ox,source_weight_store});
 const result=await service.collect({contract:'ABC-USDT',native_symbol:'ABC',run_id:'r2',deep_started_ts:1_800_000_000_000,max_deep_ms:45000});
 assert.equal(result,expected);assert.deepEqual(seen,['ABC-USDT']);assert.ok(admissions.some(id=>id.startsWith('LIQ_NATIVE_CATALOG:')));
 const summary=service.summary();assert.equal(summary.routed[0].lane,'OXARCHIVE_HL_BUCKETS');assert.equal(summary.oxarchive.enabled,true);assert.ok(summary.rotating_lanes.includes('OXARCHIVE_HL_BUCKETS_WHEN_KEY'));
});

test('a failed selected source falls through to another eligible source without inventing data',async()=>{
 const ox=async()=>null;ox.summary=()=>({enabled:true,history:[{status:'HTTP_ERROR',http_status:404}]});
 const admissions=[];
 const source_weight_store={load:async()=>[{source_id:'HYPERLIQUID_NATIVE',attempts:10,reliability:0},{source_id:'OXARCHIVE_HL_BUCKETS',attempts:10,reliability:1}],record:async row=>({recorded:true,...row})};
 const service=createCombinedLiquidationService({mode:'SHADOW_ONLY',provider_admit:async request=>{admissions.push(request.reservation_id);return{allowed:true,new_reservation:true};},fetch_impl:async()=>new Response(JSON.stringify([[{name:'OTHER'}],[]]),{status:200,headers:{'content-type':'application/json'}}),secondary_enabled:false,oxarchive_collect:ox,source_weight_store});
 const result=await service.collect({contract:'ABC-USDT',native_symbol:'ABC',run_id:'r2',deep_started_ts:Date.now(),max_deep_ms:45000});
 assert.equal(result,null);assert.ok(admissions.some(id=>id.startsWith('LIQ_NATIVE_CATALOG:')));
 const routed=service.summary().routed;assert.deepEqual(routed.map(x=>x.lane),['OXARCHIVE_HL_BUCKETS','HYPERLIQUID_NATIVE']);assert.equal(routed[0].status,'HTTP_ERROR');assert.equal(routed[1].fallback,true);
});
