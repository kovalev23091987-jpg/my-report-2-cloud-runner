import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {oneUnusableFollowingReserveMayFinishPosition as may} from '../files/src/liquidation-extension/selected-native-reserve-policy.mjs';
import {createGTradeRuntimeCollector} from '../files/src/liquidation-extension/gtrade-runtime-collector.mjs';
import {collectSelectedNativeBatch} from '../files/src/liquidation-extension/selected-native-batch.mjs';
import {classifyOperationalSourceOutcome} from '../files/src/liquidation-extension/combined-runner-service.mjs';
import {gunzipSync} from 'node:zlib';
const T=1790489990092,run_id='CONTROLLED_QNT_LSK_COST_SHAPE';
const fixture=()=>({now:T,run_id,contract:'QNT-USDT',batch:['QNT-USDT'],current_allowed:['GTRADE_NATIVE','DYDX_PINNED_NATIVE'],current_coverage:{status:'SUPPORTED',run_id,source_ts:T-1000},following_costs:{DYDX_PINNED_NATIVE:3},plan:{schema:'SELECTED_NATIVE_SOURCE_PLAN_V1',run_id,entries:[{contract:'QNT-USDT',eligible:true,source_ids:['GTRADE_NATIVE','DYDX_PINNED_NATIVE']},{contract:'LSK-USDT',eligible:true,source_ids:['DYDX_PINNED_NATIVE']}]}});

test('one unused native reserve can finish a current exact position when all following lanes cost zero or at least three',()=>{
 for(const cost of [0,3,4]){const f=fixture();f.following_costs.DYDX_PINNED_NATIVE=cost;assert.equal(may(f),true);}
});
test('a viable one/two-request or unknown following lane retains its reserve',()=>{
 for(const cost of [1,2,-1,null,NaN,undefined]){const f=fixture();f.following_costs.DYDX_PINNED_NATIVE=cost;assert.equal(may(f),false);}
 for(const id of ['HYPERLIQUID_NATIVE','OXARCHIVE_HL_BUCKETS','UNKNOWN']){const f=fixture();f.plan.entries[1].source_ids.push(id);assert.equal(may(f),false);}
});
test('current source clocks, immutable selected pair and exact allowed lanes are mandatory',()=>{
 for(const change of ['FOREIGN_RUN','STALE','FUTURE','UNKNOWN_MARKET','FOREIGN_CURRENT','DUPLICATE','INELIGIBLE','CURRENT_ALLOWED','OTHER_GTRADE','EXTRA_COST']){
  const f=fixture();if(change==='FOREIGN_RUN')f.plan.run_id='FOREIGN';if(change==='STALE')f.current_coverage.source_ts=T-300001;if(change==='FUTURE')f.current_coverage.source_ts=T+1;if(change==='UNKNOWN_MARKET')f.current_coverage.status='CATALOG_DISCOVERY_REQUIRED';if(change==='FOREIGN_CURRENT')f.current_coverage.run_id='FOREIGN';if(change==='DUPLICATE')f.plan.entries[1].contract='QNT-USDT';if(change==='INELIGIBLE')f.plan.entries[1].eligible=false;if(change==='CURRENT_ALLOWED')f.current_allowed=['GTRADE_NATIVE'];if(change==='OTHER_GTRADE')f.plan.entries[1].source_ids.push('GTRADE_NATIVE');if(change==='EXTRA_COST')f.following_costs.UNKNOWN=0;assert.equal(may(f),false,change);
 }
});
test('actual retained catalog is preserved but unfinishable market/position acquisition makes no price or trade HTTP',async()=>{
 const raw=fs.readFileSync(new URL('../../post-v7-consolidated/liquidation/liquidation-extension/evidence/gtrade_variables_v2.raw',import.meta.url));
 const calls=[],checks=[],collector=createGTradeRuntimeCollector({clock:()=>T,sdk:{getLiquidationPrice(){throw Error('NO_LOCAL_LEVEL');},buildLiquidationPriceContext(){throw Error('NO_LOCAL_LEVEL');}},fetch_impl:async url=>{calls.push(String(url));assert.ok(String(url).endsWith('/trading-variables'));return new Response(raw);}});
 const r=await collector({contract:'FIL-USDT',native_symbol:'FIL',run_id,acquisition_id:'RETAINED_CATALOG',deadline_ts:T+20000,admit_position_snapshot:async()=>{throw Error('NO_UNADMITTED_PIN');},admit_useful_snapshot:async e=>{checks.push(e);return{allowed:false};},admit_market_snapshot:async()=>{throw Error('NO_PARTIAL_MARKET_RESERVATION');}});
 assert.equal(r.status,'SKIPPED_GTRADE_USEFUL_CHAIN_BUDGET');assert.equal(r.requests,1);assert.equal(calls.length,1);assert.equal(checks[0].additional_requests,3);assert.equal(collector.nativeMarketCoverage({run_id,native_symbol:'FIL'}).status,'SUPPORTED');
});
test('unused first-candidate room reaches the following candidate inside the same total and explicit caller cap',async()=>{
 for(const callerCap of [2,4]){
  let used=0;const calls=[];
  const service={summary:()=>({total_http_cap:4,shared_budget:{reserved_http:used}}),async collect(p){calls.push(p);used+=calls.length===1?1:Math.min(p.max_http_for_candidate,3);return null;}};
  const contracts=['QNT-USDT','LSK-USDT'];
  await collectSelectedNativeBatch({service,params:{contract:contracts[0],native_symbol:'QNT',run_id,deep_started_ts:T,max_http_for_candidate:callerCap},selection:{run_id,contracts},coverage_for:()=>({eligible:true,source_ids:['DYDX_PINNED_NATIVE']}),http_by_contract:new Map(),clock:()=>T});
  assert.equal(calls.length,2);assert.equal(calls[1].max_http_for_candidate,callerCap===2?2:3);assert(used<=4);
 }
});

test('original QNT local pinned-read refusal is not charged as provider failure or useful role evidence',()=>{
 const saved=JSON.parse(gunzipSync(fs.readFileSync(new URL('../../checkpoints/index-economy-natural-38484212820/report2-run-result.json.gz',import.meta.url))));
 const route=saved.liquidation_source_acquisition_audit.routes.find(r=>r.contract==='QNT-USDT'&&r.lane==='GTRADE_NATIVE');
 assert.equal(route.position_proof.status,'SKIPPED_GTRADE_PINNED_POSITION_BUDGET');assert.equal(route.position_proof.reason,'CANDIDATE_HTTP_ENVELOPE');
 const outcome=classifyOperationalSourceOutcome({status:route.status,source_state:route.position_proof,actual_http:route.source_outcome.actual_http,now:saved.candidates.find(c=>c.contract==='QNT-USDT').observed_ts});
 assert.equal(outcome.evaluated,false);assert.equal(outcome.failure_origin,'INTERNAL_SCHEDULER');assert.equal(outcome.attempted_http_count,2);assert.equal(outcome.role_usable,false);
 assert.equal(classifyOperationalSourceOutcome({status:'GTRADE_RECEIPT_WINDOW_NOT_CLOSED',source_state:{status:'GTRADE_PINNED_RPC_NETWORK_OR_TRANSPORT_ERROR'},actual_http:3}).failure_origin,'TRANSPORT');
 assert.equal(classifyOperationalSourceOutcome({status:'HTTP_429',actual_http:1}).failure_origin,'PROVIDER_QUOTA');
});
