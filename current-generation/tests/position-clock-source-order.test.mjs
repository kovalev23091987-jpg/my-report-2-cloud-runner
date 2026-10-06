import test from 'node:test';
import assert from 'node:assert/strict';
import {planLiquidationSourceOrder,buildLiquidationSourceWeightProfile} from '../files/src/liquidation-source-weighting.mjs';
const input={lanes:['GMX_NATIVE','LIGHTER_NATIVE','GTRADE_NATIVE','HYPERLIQUID_NATIVE'],exact:['GMX_NATIVE','LIGHTER_NATIVE'],costs:{GMX_NATIVE:4,LIGHTER_NATIVE:4,GTRADE_NATIVE:1,HYPERLIQUID_NATIVE:5},rows:[{source_id:'GMX_NATIVE',attempts:78,reliability:1},{source_id:'LIGHTER_NATIVE',attempts:50,reliability:.8},{source_id:'GTRADE_NATIVE',attempts:100,reliability:.2}]};
test('the actual 14:25 route-starvation mechanism is separated from position-clock-capable collection',()=>{
 const old=planLiquidationSourceOrder(input),fixed=planLiquidationSourceOrder({...input,clock_capable:['GTRADE_NATIVE','HYPERLIQUID_NATIVE']});
 assert.equal(old.ordered[0],'GMX_NATIVE');assert.equal(fixed.ordered[0],'GTRADE_NATIVE');
 assert.ok(fixed.ordered.indexOf('HYPERLIQUID_NATIVE')<fixed.ordered.indexOf('GMX_NATIVE'));
 assert.deepEqual(fixed.profile.map(r=>[r.source_id,r.selection_weight]).sort(),old.profile.map(r=>[r.source_id,r.selection_weight]).sort());
});
test('exact mapping, successful receipts and predictive weight cannot invent a provider position clock',()=>{
 const plan=planLiquidationSourceOrder({...input,clock_capable:['GTRADE_NATIVE']});
 const gmx=plan.profile.find(r=>r.source_id==='GMX_NATIVE'),gtrade=plan.profile.find(r=>r.source_id==='GTRADE_NATIVE');
 assert.equal(gmx.coverage,'EXACT_ROUTE_PROVEN');assert.equal(gmx.position_clock_verifiable,false);assert.equal(gtrade.position_clock_verifiable,true);assert.equal(gtrade.coverage,'CATALOG_DISCOVERY_REQUIRED');
 assert.ok(plan.profile.every(r=>r.source_clock_closed===undefined&&r.entry_eligible===undefined));
});
test('when clock capabilities are not supplied the existing exact and cache ordering is retained',()=>{
 assert.deepEqual(planLiquidationSourceOrder(input).ordered,['GMX_NATIVE','LIGHTER_NATIVE','GTRADE_NATIVE','HYPERLIQUID_NATIVE']);
 const plan=planLiquidationSourceOrder({lanes:['GMX_NATIVE','GTRADE_NATIVE'],exact:['GMX_NATIVE'],cached:['GTRADE_NATIVE'],costs:{GMX_NATIVE:4,GTRADE_NATIVE:0}});assert.equal(plan.ordered[0],'GTRADE_NATIVE');
});
test('a bucket cannot acquire future-position-clock priority and core weighting is unchanged',()=>{
 const plan=planLiquidationSourceOrder({lanes:['OXARCHIVE_HL_BUCKETS','GTRADE_NATIVE'],clock_capable:['OXARCHIVE_HL_BUCKETS','GTRADE_NATIVE'],costs:{OXARCHIVE_HL_BUCKETS:1,GTRADE_NATIVE:4}});assert.equal(plan.ordered[0],'GTRADE_NATIVE');assert.equal(plan.profile.at(-1).clock_capability_priority,0);assert.equal(plan.profile.at(-1).role,'PROJECTED_BUCKET_CONTEXT');assert.ok(buildLiquidationSourceWeightProfile(input.lanes,input.rows).every(r=>r.predictive_weight_eligible===false));
});
