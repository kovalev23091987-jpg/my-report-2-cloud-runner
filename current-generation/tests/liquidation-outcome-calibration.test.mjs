import test from 'node:test';
import assert from 'node:assert/strict';
import {MIN_PREDICTIVE_OBSERVATIONS,predictiveWeightFactor} from '../files/src/liquidation-outcome-calibration.mjs';

test('legacy outcome calibration remains factor one until explicit T16.5 activation after 200 observations',()=>{
 assert.equal(MIN_PREDICTIVE_OBSERVATIONS,200);
 assert.equal(predictiveWeightFactor({observations:0,ewma_accuracy:1}),1);
 assert.equal(predictiveWeightFactor({observations:199,ewma_accuracy:0,activation_eligible:true}),1);
 assert.equal(predictiveWeightFactor({observations:200,ewma_accuracy:0}),1);
 assert.equal(predictiveWeightFactor({observations:200,ewma_accuracy:0,activation_eligible:true}),0.75);
 assert.equal(predictiveWeightFactor({observations:200,ewma_accuracy:0.5,activation_eligible:true}),1);
 assert.equal(predictiveWeightFactor({observations:200,ewma_accuracy:1,activation_eligible:true}),1.25);
});
