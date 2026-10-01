import test from 'node:test';
import assert from 'node:assert/strict';
import {fundingDirectionalRoutes} from '../files/src/funding-directional-policy.mjs';

test('negative funding supports LONG only with independent confirmation',()=>{
 const confirmed=fundingDirectionalRoutes({early_liquidity:true,negative_funding_tail:true,oi_building:true});
 assert.deepEqual(confirmed.long_routes,['LONG_NEGATIVE_FUNDING_FUEL']);assert.deepEqual(confirmed.short_routes,[]);assert.equal(confirmed.directional_vote,true);
 const alone=fundingDirectionalRoutes({early_liquidity:true,negative_funding_tail:true});
 assert.deepEqual(alone.long_routes,[]);assert.equal(alone.directional_vote,false);assert.equal(alone.funding_alone_can_authorize_entry,false);assert.equal(alone.funding_alone_is_veto,false);
});

test('positive funding supports SHORT only with independent confirmation',()=>{
 const confirmed=fundingDirectionalRoutes({early_liquidity:true,positive_funding_tail:true,negative_momentum:true});
 assert.deepEqual(confirmed.short_routes,['SHORT_POSITIVE_FUNDING_FUEL']);assert.deepEqual(confirmed.long_routes,[]);assert.equal(confirmed.directional_vote,true);
 const alone=fundingDirectionalRoutes({early_liquidity:true,positive_funding_tail:true});
 assert.deepEqual(alone.short_routes,[]);assert.equal(alone.directional_vote,false);
});
