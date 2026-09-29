import test from 'node:test';
import assert from 'node:assert/strict';
import {unsignedSourceHash,chooseWeightedLiquidationLane,buildLiquidationSourceWeightProfile} from '../files/src/liquidation-source-weighting.mjs';
import {SOURCE_IDS,buildLiquidationRequestPlan,buildSourceReceipt,sourceHealthOutcome,chooseMappedLiquidationFallback} from '../files/src/liquidation-source-plan.mjs';

test('K06: signed hash is converted directly to uint32',()=>{
  for(const seed of ['a','b','generation:run:SOL-USDT','\uffff']){const value=unsignedSourceHash(seed);assert.ok(Number.isInteger(value)&&value>=0&&value<2**32);}
});

for(const count of [2,3,4,5])test(`K06: all ${count} equal-weight lanes are reachable and within two percentage points`,()=>{
  const lanes=['HYPERLIQUID_NATIVE','GTRADE_NATIVE','LIGHTER_NATIVE','GMX_NATIVE','OXARCHIVE_HL_BUCKETS'].slice(0,count),hits=Object.fromEntries(lanes.map(x=>[x,0]));
  for(let i=0;i<100000;i++)hits[chooseWeightedLiquidationLane({lanes,seed:`G:R:${i}:SOL-USDT`}).lane]++;
  for(const lane of lanes)assert.ok(Math.abs(hits[lane]/100000-1/count)<=0.02,`${lane}:${hits[lane]}`);
});

test('K06: gTrade is independently selectable and request plans close before reservation',()=>{
  const standard=buildLiquidationRequestPlan({available:['GTRADE_NATIVE'],seed:'x'});assert.deepEqual(standard.requests,[{source_id:'GTRADE_NATIVE',attempts:3}]);assert.ok(standard.total_requests<=5);
  const full=buildLiquidationRequestPlan({mode:'LIQUIDATION_ONLY',available:['HYPERLIQUID_NATIVE','GTRADE_NATIVE']});assert.equal(full.total_requests,8);
  const alternate=buildLiquidationRequestPlan({mode:'LIQUIDATION_ONLY',available:['LIGHTER_NATIVE','GMX_NATIVE']});assert.equal(alternate.total_requests,8);
});

test('K06: configured/present is not usable and non-attempts do not lower health',()=>{
  const denied=buildSourceReceipt({source_id:'GTRADE_NATIVE',planned:true,admitted:false,transport_attempted:false,status:'QUOTA_DENIED'});assert.deepEqual(sourceHealthOutcome(denied),{evaluated:false,reason:'QUOTA_DENIED'});
  const schema=buildSourceReceipt({source_id:'GTRADE_NATIVE',planned:true,admitted:true,transport_attempted:true,response_received:true,normalized:false,usable:false,status:'SCHEMA_INVALID'});assert.equal(sourceHealthOutcome(schema).identity_or_schema_failure,true);
  assert.equal(schema.contribution,0);assert.ok(SOURCE_IDS.includes('DERIBIT'));
});

test('K06: predictive factor remains one without an explicit future statistical gate',()=>{
  const [row]=buildLiquidationSourceWeightProfile(['GTRADE_NATIVE'],[{source_id:'GTRADE_NATIVE',attempts:500,reliability:0.9,predictive_observations:500,predictive_weight_factor:1.25,predictive_eligible:0}]);
  assert.equal(row.predictive_weight_factor,1);assert.equal(row.predictive_weight_eligible,false);
});

test('standalone fallback keeps shortlist order but requires an exact official venue identity',()=>{
 const shortlist=[{contract:'MARSCOIN-USDT'},{contract:'ENA-USDT'},{contract:'WLD-USDT'}];
 const catalog={ENA:{lighter_market_id:41},WLD:{gmx_market_address:'0x1111111111111111111111111111111111111111'}};
 assert.equal(chooseMappedLiquidationFallback(shortlist,catalog,'MARSCOIN-USDT')?.contract,'ENA-USDT');
 assert.equal(chooseMappedLiquidationFallback(shortlist,{WLD:catalog.WLD},'MARSCOIN-USDT')?.contract,'WLD-USDT');
 assert.equal(chooseMappedLiquidationFallback(shortlist,{},'MARSCOIN-USDT'),null);
 assert.equal(chooseMappedLiquidationFallback([{contract:'BTC-USDT'}],{BTC:catalog.ENA}),null);
});
