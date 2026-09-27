import test from 'node:test';
import assert from 'node:assert/strict';
import {MIN_PREDICTIVE_OBSERVATIONS,predictiveWeightFactor} from '../files/src/liquidation-outcome-calibration.mjs';

test('outcome calibration waits for twenty factual one-hour outcomes',()=>{
 assert.equal(MIN_PREDICTIVE_OBSERVATIONS,20);
 assert.equal(predictiveWeightFactor({observations:0,ewma_accuracy:1}),1);
 assert.equal(predictiveWeightFactor({observations:19,ewma_accuracy:0}),1);
 assert.equal(predictiveWeightFactor({observations:20,ewma_accuracy:0}),0.75);
 assert.equal(predictiveWeightFactor({observations:20,ewma_accuracy:0.5}),1);
 assert.equal(predictiveWeightFactor({observations:20,ewma_accuracy:1}),1.25);
});
