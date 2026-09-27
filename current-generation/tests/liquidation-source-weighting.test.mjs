import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLiquidationSourceWeightProfile,chooseWeightedLiquidationLane,nextLiquidationSourceReliability} from '../files/src/liquidation-source-weighting.mjs';

test('new sources start equal and every source retains an exploration floor',()=>{
 const profile=buildLiquidationSourceWeightProfile(['NATIVE','OXARCHIVE']);
 assert.deepEqual(profile.map(row=>row.selection_weight),[1,1]);
 const weak=buildLiquidationSourceWeightProfile(['NATIVE'],[{source_id:'NATIVE',attempts:20,reliability:0}]);
 assert.equal(weak[0].selection_weight,0.5);
});

test('predictive accuracy cannot affect source weight before twenty settled observations',()=>{
 const early=buildLiquidationSourceWeightProfile(['LIGHTER'],[{source_id:'LIGHTER',attempts:20,reliability:0.5,predictive_observations:19,predictive_weight_factor:1.25,predictive_accuracy:1}])[0];
 assert.equal(early.predictive_weight_eligible,false);assert.equal(early.predictive_weight_factor,1);assert.equal(early.selection_weight,1);
 const proven=buildLiquidationSourceWeightProfile(['LIGHTER'],[{source_id:'LIGHTER',attempts:20,reliability:0.5,predictive_observations:20,predictive_weight_factor:1.25,predictive_accuracy:1}])[0];
 assert.equal(proven.predictive_weight_eligible,true);assert.equal(proven.selection_weight,1.25);
 const poor=buildLiquidationSourceWeightProfile(['LIGHTER'],[{source_id:'LIGHTER',attempts:20,reliability:0,predictive_observations:20,predictive_weight_factor:0.75,predictive_accuracy:0}])[0];
 assert.equal(poor.selection_weight,0.5);
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
