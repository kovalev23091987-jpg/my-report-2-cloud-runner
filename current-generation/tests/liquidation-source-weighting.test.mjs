import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLiquidationSourceWeightProfile,chooseWeightedLiquidationLane,nextLiquidationSourceReliability,planLiquidationSourceOrder,createLiquidationSourceWeightStore} from '../files/src/liquidation-source-weighting.mjs';
import {DatabaseSync} from 'node:sqlite';

test('new sources start equal and every source retains an exploration floor',()=>{
 const profile=buildLiquidationSourceWeightProfile(['NATIVE','OXARCHIVE']);
 assert.deepEqual(profile.map(row=>row.selection_weight),[1,1]);
 const weak=buildLiquidationSourceWeightProfile(['NATIVE'],[{source_id:'NATIVE',attempts:20,reliability:0}]);
 assert.equal(weak[0].selection_weight,0.5);
});

test('predictive accuracy cannot affect source weight without the explicit future statistical gate',()=>{
 const early=buildLiquidationSourceWeightProfile(['LIGHTER_NATIVE'],[{source_id:'LIGHTER_NATIVE',attempts:20,reliability:0.5,predictive_observations:199,predictive_weight_factor:1.25,predictive_accuracy:1,predictive_eligible:0}])[0];
 assert.equal(early.predictive_weight_eligible,false);assert.equal(early.predictive_weight_factor,1);assert.equal(early.selection_weight,1);
 const stillShadow=buildLiquidationSourceWeightProfile(['LIGHTER_NATIVE'],[{source_id:'LIGHTER_NATIVE',attempts:200,reliability:0.5,predictive_observations:200,predictive_weight_factor:1.25,predictive_accuracy:1,predictive_eligible:1}])[0];
 assert.equal(stillShadow.predictive_weight_eligible,false);assert.equal(stillShadow.selection_weight,1);
 const proven=buildLiquidationSourceWeightProfile(['LIGHTER_NATIVE'],[{source_id:'LIGHTER_NATIVE',attempts:200,reliability:0.5,predictive_observations:200,predictive_weight_factor:1.25,predictive_accuracy:1,predictive_eligible:1,activation_state:'ACTIVE',eligibility_protocol:'T16_5'}])[0];
 assert.equal(proven.predictive_weight_eligible,true);assert.equal(proven.selection_weight,1.25);
 const poor=buildLiquidationSourceWeightProfile(['LIGHTER_NATIVE'],[{source_id:'LIGHTER_NATIVE',attempts:200,reliability:0,predictive_observations:200,predictive_weight_factor:0.75,predictive_accuracy:0,predictive_eligible:1,activation_state:'ACTIVE',eligibility_protocol:'T16_5'}])[0];
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

test('exact native role outranks discovery and a high-availability projected bucket',()=>{
 const plan=planLiquidationSourceOrder({lanes:['OXARCHIVE_HL_BUCKETS','GTRADE_NATIVE','LIGHTER_NATIVE','GMX_NATIVE'],exact:['LIGHTER_NATIVE','GMX_NATIVE'],costs:{OXARCHIVE_HL_BUCKETS:1,GTRADE_NATIVE:3,LIGHTER_NATIVE:4,GMX_NATIVE:4},rows:[{source_id:'OXARCHIVE_HL_BUCKETS',attempts:200,reliability:1},{source_id:'GMX_NATIVE',attempts:10,reliability:.9},{source_id:'LIGHTER_NATIVE',attempts:10,reliability:.5}]});
 assert.deepEqual(plan.ordered,['GMX_NATIVE','LIGHTER_NATIVE','GTRADE_NATIVE','OXARCHIVE_HL_BUCKETS']);
 assert.equal(plan.profile.at(-1).role,'PROJECTED_BUCKET_CONTEXT');
 assert.ok(plan.profile.every(x=>x.utility_basis==='OPERATIONAL_AVAILABILITY_ONLY'));
});

test('shared zero-request native snapshot is reused before expensive independent reads',()=>{
 const plan=planLiquidationSourceOrder({lanes:['GMX_NATIVE','GTRADE_NATIVE'],exact:['GMX_NATIVE'],cached:['GTRADE_NATIVE'],costs:{GMX_NATIVE:4,GTRADE_NATIVE:0}});
 assert.deepEqual(plan.ordered,['GTRADE_NATIVE','GMX_NATIVE']);assert.equal(plan.profile[0].declared_http,0);
});

test('role statistics keep unsupported separate from transport success and deduplicate the same run',async()=>{
 const sqlite=new DatabaseSync(':memory:'),db={prepare(sql){return{args:[],bind(...args){this.args=args;return this;},async run(){return sqlite.prepare(sql).run(...this.args);},async first(){return sqlite.prepare(sql).get(...this.args)||null;},async all(){return{results:sqlite.prepare(sql).all(...this.args)};}};},async batch(rows){return Promise.all(rows.map(x=>x.run()));}};
 const store=createLiquidationSourceWeightStore({db,clock:()=>1000});
 await store.record({source_id:'GTRADE_NATIVE',usable:true,status:'UNSUPPORTED'});
 for(let i=0;i<2;i++)await store.recordRole({source_id:'GTRADE_NATIVE',contract:'TAO-USDT',run_id:'same',role:'NATIVE_POSITION_CONTEXT',status:'UNSUPPORTED',role_usable:false,actual_http:3});
 const row=sqlite.prepare('SELECT * FROM report2_liquidation_role_observation').all();assert.equal(row.length,1);assert.equal(row[0].role_usable,0);assert.equal(row[0].actual_http,3);
 const profile=buildLiquidationSourceWeightProfile(['GTRADE_NATIVE'],await store.load(['GTRADE_NATIVE']));assert.equal(profile[0].predictive_weight_factor,1);sqlite.close();
});
