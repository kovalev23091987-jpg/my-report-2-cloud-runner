import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCandidateDataRequirements,buildHtxSpotMarketConfirmation,runOptionalCompactStatistics} from '../files/src/candidate-data-requirements.mjs';
const NOW=1790792400000;
function inputs(){return {receipt:{classification:'INSUFFICIENT',gaps:['spot_snapshot.quality_status_GREEN','futures_trajectory.flow_24h'],components:{spot_snapshot:{execution_status:'REJECTED',sufficiency:'INSUFFICIENT'}}},futures:{execution_status:'FULFILLED',data:{coverage:Object.fromEntries(['htx_futures_liquidity','htx_open_interest','htx_funding','htx_futures_order_flow_sample'].map(k=>[k,'closed']))}},trajectory:{execution_status:'FULFILLED',data:{coverage:Object.fromEntries(['price_5m','price_15m','price_1h','price_4h','oi_1h','oi_4h','funding_current','funding_history'].map(k=>[k,'closed']))}},history:{execution_status:'FULFILLED',data:{health:{data_db:true},coverage:{persistent_history:'closed',complete_5m_window:true},series:[{ts:NOW}]}}};}
function native(){return {contract:'NIL-USDT',available_ts:NOW-500,now:NOW,spot:{source:'HTX official public API',market:'HTX Spot',market_identity_verified:true,symbol:'nilusdt',requested_symbol:'NIL-USDT',depth_source_ts:NOW-1000,health:{ticker:true,depth:true},coverage:{htx_spot_liquidity:'closed',htx_spot_order_flow:'not_closed'},depth_bbo:{best_bid:99,best_ask:100},liquidity:{top_20_depth_bid:{notional_usdt:10000},top_20_depth_ask:{notional_usdt:12000}}}};}
test('extended missing history and unavailable spot remain explicit without making measurable futures acquisition fail',()=>{
 const input=inputs(),r=applyCandidateDataRequirements(input);
 assert.equal(r.classification,'PARTIAL');assert.equal(r.core_classification,'SUFFICIENT');assert.equal(r.full_data_classification,'INSUFFICIENT');assert.equal(r.sufficient,false);
 assert.ok(r.advisory_gaps.includes('futures_trajectory.flow_24h'));assert.ok(r.advisory_gaps.includes('spot_snapshot.execution_status_FULFILLED'));
 assert.equal(r.components.spot_snapshot.sufficiency,'INSUFFICIENT');assert.equal(r.requirements_policy.missing_context_directional_votes,0);assert.equal(r.requirements_policy.final_entry_gates_unchanged,true);
 assert.equal(input.trajectory.data.coverage.flow_24h,undefined);
});
test('every required execution, price, OI, funding and persisted-history gap still fails acquisition',()=>{
 for(const [component,key] of [['futures','htx_futures_liquidity'],['futures','htx_futures_order_flow_sample'],['futures','htx_open_interest'],['futures','htx_funding'],...['price_5m','price_15m','price_1h','price_4h','oi_1h','oi_4h','funding_current','funding_history'].map(k=>['trajectory',k])]){
  const x=inputs();x[component].data.coverage[key]='not_closed';const r=applyCandidateDataRequirements(x);assert.equal(r.classification,'INSUFFICIENT',key);assert.ok(r.mandatory_gaps.some(k=>k.endsWith(key)));
 }
 for(const component of ['futures','trajectory','history']){const x=inputs();x[component].execution_status='REJECTED';assert.equal(applyCandidateDataRequirements(x).classification,'INSUFFICIENT');}
 const x=inputs();x.history.data.coverage.complete_5m_window=false;assert.equal(applyCandidateDataRequirements(x).classification,'INSUFFICIENT');
});
test('native spot depth proves only factual two-sided market availability',()=>{
 const x=native(),r=buildHtxSpotMarketConfirmation(x);assert.equal(r.status,'CLOSED');assert.equal(r.value,10000);assert.equal(r.directional_votes,0);assert.equal(r.flow_window_closed,false);assert.equal(r.full_24h_coverage_claimed,false);assert.equal(x.spot.coverage.htx_spot_order_flow,'not_closed');
});
test('native spot confirmation rejects aliases, unavailable quotes, malformed book and stale/future clocks',()=>{
 const changes=[x=>x.spot.symbol='otherusdt',x=>x.spot.requested_symbol='OTHER-USDT',x=>x.contract='龙虾-USDT',x=>x.spot.market_identity_verified=false,x=>x.spot.health.depth=false,x=>x.spot.coverage.htx_spot_liquidity='not_closed',x=>x.spot.depth_source_ts=NOW-300001,x=>x.spot.depth_source_ts=NOW+1,x=>x.available_ts=NOW+1,x=>x.spot.depth_source_ts=null,x=>x.spot.depth_bbo.best_ask=98,x=>x.spot.liquidity.top_20_depth_bid.notional_usdt=0];
 for(const change of changes){const x=native();change(x);assert.equal(buildHtxSpotMarketConfirmation(x).status,'NOT_CLOSED');}
});
test('bounded statistics failure is visible and cannot cancel a finished report or manufacture a validated signal',async()=>{
 const report={state:'ENTRY_NOW_ANALYTICAL',score:75},r=await runOptionalCompactStatistics(async()=>{throw Error('simulated storage failure with private details');});
 assert.equal(r.status,'STATISTICS_ERROR_DEFERRED');assert.equal(r.report_blocked,false);assert.equal(r.validated_signal,false);assert.equal(r.automatic_weight_tuning,false);assert.equal(r.live_probability,null);assert.equal(JSON.stringify(r).includes('private details'),false);assert.deepEqual(report,{state:'ENTRY_NOW_ANALYTICAL',score:75});
 const factual={status:'CLOSED',early_outcome:{closed:0}};assert.equal(await runOptionalCompactStatistics(async()=>factual),factual);
});
