import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTz101LiquidationContext} from '../src/tz101-liquidation-context.mjs';

const NOW=2_000_000_000_000;
const cluster=(side,level,size,extra={})=>({side,level_price:level,raw_size:size,source_unit:'PROVIDER_RAW_SIZE',explicit_major:true,source_ts:NOW-1_000,lifecycle:'ACTIVE',...extra});
const record={provider:'ByKaranteli LiqMap Public API',provider_symbol:'BTC',asset_identity_verified:true,projected_map_status:'CLOSED_SHADOW',projected_freshness:'CURRENT',
  projected_source_age_sec:1,provider_current_price:100,source_health:{provider_symbol_registry_exact_match:true,projected_scan_truncated:false,projected_cluster_output_truncated:false},
  projected_clusters:[cluster('SHORT_LIQUIDATION_ABOVE',120,500),cluster('SHORT_LIQUIDATION_ABOVE',150,1000),cluster('LONG_LIQUIDATION_BELOW',80,600),cluster('LONG_LIQUIDATION_BELOW',60,1200)]};

test('existing extended scan maps only current major two-sided levels',()=>{
  const out=buildTz101LiquidationContext({projected_record:record,contract_code:'BTC-USDT',current_price:100,move_24h_pct:12,observed_ts:NOW});
  assert.equal(out.status,'CONFIRMED');assert.equal(out.entry_blocking,false);assert.equal(out.guaranteed_target,false);
  assert.ok(out.short_above.every(x=>x.side==='SHORT_LIQUIDATION_ABOVE'&&x.significance==='MAJOR'&&x.lifecycle==='ACTIVE'&&x.source_status==='CLOSED_SHADOW'));
  assert.ok(out.long_below.every(x=>x.side==='LONG_LIQUIDATION_BELOW'&&x.distance_pct<0&&x.observed_ts===NOW-1_000));
});

test('not-triggered, one-sided and unsafe identity stay optional',()=>{
  assert.equal(buildTz101LiquidationContext({projected_record:record,contract_code:'BTC-USDT',current_price:100,move_24h_pct:9.9,observed_ts:NOW}).status,'NOT_CONFIRMED');
  const one={...record,projected_clusters:[cluster('SHORT_LIQUIDATION_ABOVE',120,500)]};
  const partial=buildTz101LiquidationContext({projected_record:one,contract_code:'BTC-USDT',current_price:100,move_24h_pct:12,observed_ts:NOW});
  assert.equal(partial.status,'PARTIAL');assert.equal(partial.long_below.length,0);assert.equal(partial.entry_blocking,false);
  assert.equal(buildTz101LiquidationContext({projected_record:{...record,asset_identity_verified:false},contract_code:'BTC-USDT',current_price:100,move_24h_pct:12,observed_ts:NOW}).status,'NOT_CONFIRMED');
});

test('future or swept cluster timestamps are never rewritten into current facts',()=>{
  const unsafe={...record,projected_clusters:[cluster('SHORT_LIQUIDATION_ABOVE',120,500,{source_ts:NOW+1}),cluster('LONG_LIQUIDATION_BELOW',80,600,{lifecycle:'SWEPT'})]};
  const out=buildTz101LiquidationContext({projected_record:unsafe,contract_code:'BTC-USDT',current_price:100,move_24h_pct:12,observed_ts:NOW});
  assert.equal(out.status,'NOT_CONFIRMED');assert.deepEqual(out.short_above,[]);assert.deepEqual(out.long_below,[]);
});
