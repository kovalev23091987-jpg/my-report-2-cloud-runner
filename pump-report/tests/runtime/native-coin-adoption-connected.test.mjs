import test from 'node:test';
import assert from 'node:assert/strict';
import {createReviewedNativeScopeRegistry} from '../../registry/native-reviewed550.mjs';
import {BINGX_IDENTITY_REGISTRY} from '../../registry/index.mjs';
import {createPumpSources} from '../../sources/index.mjs';
import {measureLiquidity} from '../../analytics/liquidity.mjs';
import {START_PROFILE} from '../../profile/start-v1.mjs';

test('ROOT adopts the exact541 Coin review through its real registry and source parser while9 denomination ambiguities and old qualifications retain their meanings',async()=>{
  const registry=createReviewedNativeScopeRegistry(BINGX_IDENTITY_REGISTRY),summary=registry.summary();
  assert.equal(summary.selected_native_coin_unit_semantics_qualified,541);assert.equal(summary.selected_native_coin_unit_unknown,9);assert.equal(summary.scoped_new_execution_unit_reviews,530);assert.equal(summary.full_CORE550_qualified,false);
  for(const entry of BINGX_IDENTITY_REGISTRY)assert.deepEqual(registry.resolve({instrument_id:entry.instrument.instrument_id}),entry);
  const entry=registry.resolve({native_symbol:'1INCH-USDT'});assert.equal(entry.qualifications.orderbook.native_base_unit,'1INCH');assert.equal(entry.instrument.contract_multiplier,null);assert.equal(entry.instrument.canonical_cross_venue_identity_qualified,false);
  assert.ok(!entry.limitations.includes('NEW_PRICE_RELATIVE_CANDLES_ONLY'));assert.ok(entry.prior_price_scope_limitations.includes('NEW_PRICE_RELATIVE_CANDLES_ONLY'));
  for(const symbol of ['1000000BABYDOGE','1000000MOG','10000NEX','10000SATS','1000BONK','1000CAT','1000CHEEMS','1000PEPE','1000SHIB'])assert.equal(registry.resolve({native_symbol:symbol+'-USDT'}).qualifications.orderbook,undefined);
  let calls=0;const T=1800000000000,source=createPumpSources({identityRegistry:registry,clock:()=>T,broker:{request:async()=>{calls++;return {ok:true,status:200,receipt_id:'ARTIFICIAL_F564_ROOT_ADOPTION',received_ts:T,data:{code:0,data:{T,bidsCoin:[['99.9','1000']],asksCoin:[['100.1','1000']],bids:[['99.9','0.000001']],asks:[['100.1','0.000001']]}}};}}});
  const result=await source.getCore({instrument:entry.instrument,only_facts:['orderbook']});assert.equal(result.facts.orderbook.status,'USABLE');assert.equal(result.facts.orderbook.unit,'USDT_PRICE_BASE_QUANTITY');assert.deepEqual(result.facts.orderbook.value.bids,[[99.9,1000]]);
  const liquidity=measureLiquidity(result.facts.orderbook.value,entry.instrument,START_PROFILE);assert.ok(liquidity.position_limit_usdt>=700);assert.equal(liquidity.quantity_step_known,false);assert.equal(calls,1);
});
