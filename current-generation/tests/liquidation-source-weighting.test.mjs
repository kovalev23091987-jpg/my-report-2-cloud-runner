import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLiquidationSourceWeightProfile,chooseWeightedLiquidationLane,nextLiquidationSourceReliability} from '../files/src/liquidation-source-weighting.mjs';

test('new sources start equal and every source retains an exploration floor',()=>{
 const profile=buildLiquidationSourceWeightProfile(['NATIVE','OXARCHIVE']);
 assert.deepEqual(profile.map(row=>row.selection_weight),[1,1]);
 const weak=buildLiquidationSourceWeightProfile(['NATIVE'],[{source_id:'NATIVE',attempts:20,reliability:0}]);
 assert.equal(weak[0].selection_weight,0.5);
});

test('reliability moves gradually toward observed usability',()=>{
 assert.equal(nextLiquidationSourceReliability(0.5,true),0.575);
 assert.equal(nextLiquidationSourceReliability(0.5,false),0.425);
});

test('weighted lane choice is deterministic and exposes responsibilities',()=>{
 const args={lanes:['NATIVE','LIGHTER','OXARCHIVE'],seed:'run:SOL-USDT',rows:[{source_id:'NATIVE',attempts:4,reliability:0.9},{source_id:'LIGHTER',attempts:4,reliability:0.2}]};
 const a=chooseWeightedLiquidationLane(args),b=chooseWeightedLiquidationLane(args);
 assert.equal(a.lane,b.lane);assert.equal(a.profile.length,3);
 assert.ok(a.profile.every(row=>row.responsibility&&row.selection_weight>=0.5));
});
