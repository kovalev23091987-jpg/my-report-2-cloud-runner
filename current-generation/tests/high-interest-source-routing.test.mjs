import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCandidateSourceRoutingPlan,remainingLiquidationHttpCap} from '../files/src/candidate-source-routing.mjs';
import {createCombinedLiquidationService} from '../files/src/liquidation-extension/combined-runner-service.mjs';

test('a score of 70 or higher reserves confirmation sources even on the cross-exchange turn',()=>{
 const plan=buildCandidateSourceRoutingPlan({discovery_row:{early_candidate_quality_0_100:91},cross_exchange_turn:true});
 assert.equal(plan.high_interest,true);
 assert.equal(plan.run_cross_exchange,true);
 assert.equal(plan.reserve_liquidation_lane,true);
 assert.equal(plan.reason,'HIGH_INTEREST_REQUIRES_CONFIRMATION');
 assert.equal(remainingLiquidationHttpCap({plan,cross_exchange_context:{network_calls:3}}),2);
});

test('ordinary candidates keep bounded rotation and unknown cross-exchange cost fails closed',()=>{
 const ordinary=buildCandidateSourceRoutingPlan({discovery_row:{early_candidate_quality_0_100:69},cross_exchange_turn:true});
 assert.equal(ordinary.reserve_liquidation_lane,false);
 const priority=buildCandidateSourceRoutingPlan({discovery_row:{early_candidate_quality_0_100:91},cross_exchange_turn:true});
 assert.equal(remainingLiquidationHttpCap({plan:priority,cross_exchange_context:{status:'SOURCE_ERROR'}}),0);
});

test('remaining candidate envelope skips costly lanes and still admits a fitting source',async()=>{
 const expected={schema:'MULTI_LIQUIDATION_ACQUISITION_V1'};
 const ox=async()=>expected;ox.summary=()=>({enabled:true,credit_cost:1});
 const admissions=[];
 const sourceWeightStore={load:async()=>[{source_id:'HYPERLIQUID_NATIVE',attempts:10,reliability:1},{source_id:'OXARCHIVE_HL_BUCKETS',attempts:10,reliability:.5}],record:async row=>({recorded:true,...row})};
 const service=createCombinedLiquidationService({mode:'SHADOW_ONLY',provider_admit:async request=>{admissions.push(request.reservation_id);return{allowed:true,new_reservation:true};},fetch_impl:async()=>{throw Error('high-cost source must be skipped');},secondary_enabled:false,oxarchive_collect:ox,source_weight_store:sourceWeightStore,max_http_per_run:5});
 const result=await service.collect({contract:'HYPE-USDT',native_symbol:'HYPE',run_id:'high-interest',deep_started_ts:Date.now(),max_deep_ms:45000,max_http_for_candidate:2});
 assert.equal(result,expected);
 assert.deepEqual(admissions,['LIQ_OXARCHIVE_HL_BUCKETS:high-interest:HYPE-USDT']);
 const routed=service.summary().routed;
 assert.equal(routed[0].lane,'HYPERLIQUID_NATIVE');
 assert.equal(routed[0].status,'SKIPPED_CANDIDATE_HTTP_ENVELOPE');
 assert.equal(routed.at(-1).lane,'OXARCHIVE_HL_BUCKETS');
 assert.equal(service.summary().shared_budget.gross_reserved_http,1);
});
