import test from 'node:test';
import assert from 'node:assert/strict';
import {selectRepresentativePositions,buildDynamicLiquidationPanel} from '../files/src/dynamic-liquidation-panel.mjs';

test('representative selector balances side, proximity and size without wallet dominance',()=>{
 const rows=[
  {address:'a',side:'LONG',liq_price:99,notional:100},{address:'a',side:'LONG',liq_price:80,notional:1000000},
  {address:'b',side:'SHORT',liq_price:101,notional:110},{address:'c',side:'LONG',liq_price:70,notional:900000},
  {address:'d',side:'SHORT',liq_price:140,notional:800000},
 ];
 const out=selectRepresentativePositions(rows,{reference_price:100,max_positions:4});
 assert.equal(out.selected.length,4);assert.equal(new Set(out.selected.map(x=>x.account)).size,4);
 assert.ok(out.selected.some(x=>x.side==='LONG'));assert.ok(out.selected.some(x=>x.side==='SHORT'));
 assert.ok(out.selected.some(x=>x.selection_reason.startsWith('NEAREST_')));assert.ok(out.selected.some(x=>x.selection_reason.startsWith('LARGEST_')));
 assert.equal(out.discovery_values_are_evidence,false);
});

test('panel deduplicates positions, discounts cross margin and never sums venue notionals',()=>{
 const contexts=[
  {status:'USABLE_NATIVE_SAMPLE',provider:'A',above:[{native_price:105,side:'SHORT',notional:100000,native_reference_price:100,position_key:'a1',source_ts:1}],below:[{native_price:95,side:'LONG',notional:200000,native_reference_price:100,position_key:'a2',conditional_cross:true,source_ts:1}]},
  {status:'USABLE_SCOPED_NATIVE_CONTEXT',provider:'B',above:[{native_price:105.4,side:'SHORT',notional:90000,native_reference_price:100,position_key:'b1',source_ts:1},{native_price:105.4,side:'SHORT',notional:90000,native_reference_price:100,position_key:'b1',source_ts:1}],below:[]},
 ];
 const out=buildDynamicLiquidationPanel({contexts,reference_price:100,observed_ts:1});
 assert.equal(out.status,'CLOSED');assert.equal(out.zones_seen,3);assert.equal(out.notional_summed_across_providers,false);
 const above=out.clusters.find(x=>x.liquidated_side==='SHORT');assert.equal(above.provider_count,2);assert.equal(above.agreement,'MULTI_PROVIDER');assert.equal(above.largest_provider_position_usd,100000);
 const below=out.clusters.find(x=>x.liquidated_side==='LONG');assert.equal(below.largest_provider_position_usd,100000);assert.equal(below.cross_margin_discount_applied,true);
 assert.ok(out.score_evidence.quality<=0.85);
});

test('missing, wrong-side or unverified data has zero influence',()=>{
 const out=buildDynamicLiquidationPanel({contexts:[{status:'NOT_CLOSED',provider:'A',above:[{native_price:105,side:'SHORT',notional:1e9}]}],reference_price:100});
 assert.equal(out.status,'NOT_CLOSED');assert.equal(out.score_evidence,null);
});

test('stale receipt is excluded from both targets and score evidence',()=>{
 const observed=1_800_000_000_000;
 const stale=buildDynamicLiquidationPanel({observed_ts:observed,reference_price:100,contexts:[{status:'USABLE_NATIVE_SAMPLE',provider:'A',freshness_max_age_ms:120000,above:[{native_price:105,side:'SHORT',notional:1e9,position_key:'stale',source_ts:observed-120001}]}]});
 assert.equal(stale.status,'NOT_CLOSED');assert.equal(stale.clusters.length,0);assert.equal(stale.score_evidence,null);assert.equal(stale.stale_zones_excluded,1);
 const mixed=buildDynamicLiquidationPanel({observed_ts:observed,reference_price:100,contexts:[{status:'USABLE_NATIVE_SAMPLE',provider:'A',freshness_max_age_ms:120000,above:[{native_price:105,side:'SHORT',notional:1e9,position_key:'stale',source_ts:observed-120001},{native_price:106,side:'SHORT',notional:100,position_key:'fresh',source_ts:observed-1000}]}]});
 assert.equal(mixed.status,'CLOSED');assert.equal(mixed.clusters.length,1);assert.equal(mixed.clusters[0].largest_provider_position_usd,100);assert.equal(mixed.score_evidence.source_ts,observed-1000);assert.equal(mixed.stale_zones_excluded,1);
});
