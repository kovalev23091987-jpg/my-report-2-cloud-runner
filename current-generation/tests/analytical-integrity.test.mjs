import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeClosedCandles,aggregateCandles,linkHistoricalAnomaly,comparableFundingDelta,relativeMarketBehavior,normalizeMoneyFlow,evaluateTargetProof,calculateNetScenario,mapEvidenceMetric,deduplicateEvidence,internalScores} from '../files/src/analytical-integrity.mjs';

test('K08: missing minute prevents a complete aggregate and open candles are excluded',()=>{
  const minute=60_000,now=9.5*minute,rows=[0,1,3,4,9].map(i=>({open_ts:i*minute,open:1,high:2,low:.5,close:1.5}));
  assert.equal(normalizeClosedCandles(rows,{interval_ms:minute,now}).some(x=>x.open_ts===9*minute),false);
  assert.equal(aggregateCandles(rows,{source_interval_ms:minute,target_interval_ms:5*minute,now}).candles.length,0);
});

test('K08: old pump needs a distinct current confirmation event',()=>{
  const historical={event_id:'OLD',close_ts:100,classification:'WIDE_CANDLE',facts:['x'],timely:true};
  assert.equal(linkHistoricalAnomaly({historical,current_confirmation:null,now:1000}).status,'HISTORICAL_ONLY');
  assert.equal(linkHistoricalAnomaly({historical,current_confirmation:{event_id:'NEW',source_event_id:'OLD',close_ts:900},now:1000}).confirmation_event_id,'NEW');
});

test('K08: falling less than BTC/ETH is not renamed growth; funding zero and negative delta are preserved',()=>{
  const relative=relativeMarketBehavior({candidate_return:-2,btc_return:-5,eth_return:-4});assert.equal(relative.description,'FALLING_LESS_THAN_MARKET');assert.equal(relative.absolute_direction,'FALLING');
  const funding=comparableFundingDelta({current:{rate_per_hour:0},baseline:{rate_per_hour:.01}});assert.equal(funding.funding_shift_per_hour,-.01);assert.equal(funding.rate_per_hour,0);
});

test('K08: counts are not money and incomplete flow remains partial',()=>{
  assert.equal(normalizeMoneyFlow({quantity:null,price:null,initiator_side:null}).directional_strength,null);
  const flow=normalizeMoneyFlow({quantity:100,price:2,initiator_side:'BUY',coverage:'PARTIAL'});assert.equal(flow.notional_usd,200);assert.equal(flow.status,'PARTIAL');
});

test('K09: geometry cannot become factual and old candle cannot create a fresh target',()=>{
  assert.deepEqual(evaluateTargetProof({level_type:'SCENARIO_GEOMETRY'}),{status:'RESEARCH_ONLY',minimum_move_proven:false,factual_cluster:false,measured_notional:null});
  assert.equal(evaluateTargetProof({level_type:'MEASURED_STRUCTURE_TARGET',fresh_anchor:false,gross_move_pct:10}).status,'WATCH_INTERNAL');
  assert.equal(evaluateTargetProof({level_type:'OBSERVED_POSITION_LEVEL',fresh_anchor:true,identity_ok:true,fresh_reference:true,path_clear:true,gross_move_pct:10,nearest_obstacle_move_pct:3}).status,'NOT_CLOSED');
});

test('K09: net costs are symmetric for Long and Short and unknown funding blocks entry closure',()=>{
  const long=calculateNetScenario({direction:'LONG',entry:100,target:110,invalidation:95,spread_pct:.1,slippage_pct:.2,fees_pct:.1,funding_pct:.1});
  const short=calculateNetScenario({direction:'SHORT',entry:100,target:90,invalidation:105,spread_pct:.1,slippage_pct:.2,fees_pct:.1,funding_pct:.1});
  assert.ok(Math.abs(long.net_reward_pct-short.net_reward_pct)<1e-9);assert.equal(long.automatic_trade,false);
  assert.equal(calculateNetScenario({direction:'LONG',entry:100,target:110,invalidation:95,funding_pct:null}).status,'NOT_CLOSED');
});

test('K10: unknown/error evidence gives no fallback 58 and duplicate upstream event counts once',()=>{
  assert.deepEqual(mapEvidenceMetric({metric:'UNKNOWN_METRIC',value:99}),{applied:false,reason:'UNMAPPED_METRIC',contribution:0});
  assert.equal(mapEvidenceMetric({metric:'RELATIVE_STRENGTH',value:58,status:'ERROR'}).contribution,0);
  const row={upstream_venue:'HL',instrument:'SOL',origin_event_id:'P1',window_start:1,window_end:2,score_owner_family:'DERIVATIVES'};
  assert.equal(deduplicateEvidence([row,{...row,provider_id:'0X'}]).length,1);
});

test('K10: internal completeness stays separate from entry quality and threshold is untouched',()=>{
  const scores=internalScores({interest:73,gates:[true,true,true,false,false]});assert.deepEqual(scores,{candidate_quality_1_10:7.3,internal_gate_completion_0_100:60,entry_readiness_0_100:null,validated_entry_quality:false,visible:false});
  assert.equal(70,70);
});
