import test from 'node:test';import assert from 'node:assert/strict';
import {createCombinedLiquidationService} from '../files/src/liquidation-extension/combined-runner-service.mjs';

test('configured 0xArchive participates in the same bounded liquidation rotation and returns report input',async()=>{
 const expected={schema:'MULTI_LIQUIDATION_ACQUISITION_V1'},seen=[];
 const ox=async params=>{seen.push(params.contract);return expected;};ox.summary=()=>({enabled:true,credit_cost:1});
 const source_weight_store={load:async()=>[{source_id:'HYPERLIQUID_NATIVE',attempts:10,reliability:0},{source_id:'OXARCHIVE_HL_BUCKETS',attempts:10,reliability:1}],record:async row=>({recorded:true,...row})};
 const service=createCombinedLiquidationService({mode:'SHADOW_ONLY',provider_admit:async()=>({allowed:false,new_reservation:false}),fetch_impl:async()=>{throw Error('not expected');},secondary_enabled:false,oxarchive_collect:ox,source_weight_store});
 const result=await service.collect({contract:'ABC-USDT',native_symbol:'ABC',run_id:'r2',deep_started_ts:1_800_000_000_000,max_deep_ms:45000});
 assert.equal(result,expected);assert.deepEqual(seen,['ABC-USDT']);
 const summary=service.summary();assert.equal(summary.routed[0].lane,'OXARCHIVE_HL_BUCKETS');assert.equal(summary.oxarchive.enabled,true);assert.ok(summary.rotating_lanes.includes('OXARCHIVE_HL_BUCKETS_WHEN_KEY'));
});
