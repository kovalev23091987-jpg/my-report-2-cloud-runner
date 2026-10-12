import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLiquidationSpotReference,liquidationSpotReferenceLine} from '../files/src/liquidation-spot-reference.mjs';
import {displayFutureLiquidations,displayBriefTelegramLiquidations} from '../files/src/canonical-display.mjs';
import {formatManualReport} from '../files/src/manual-report-formatter.mjs';
import {canonicalFingerprint,renderCanonicalTelegram} from '../files/src/canonical-publication.mjs';
import fs from 'node:fs';

const T=Date.parse('2026-10-12T16:00:00Z'),contract='BTC-USDT';
const zone={kind:'NATIVE_FUTURE_LEVEL',side:'ABOVE',price:101,source_ts:T-10_000,distance_pct:1,distance_reference_price:100,distance_reference_basis:'ORIGINAL_SOURCE_REFERENCE_SAME_QUOTE',price_quote:'USDT',notional:50000,notional_unit:'USDT',strength_label_ru:'средняя',source:'Hyperliquid',native_symbol:'BTC'};
const liquidations=()=>({status:'CLOSED',contract,observed_ts:T,above:[{...zone}],below:[],future_only:true});
const market=()=>({status:'CLOSED_COMPARABLE_PRICE_AND_SPREAD',contract,observed_ts:T,spot:{mid:100,source_ts:T-15_000},futures:{mid:100.2,source_ts:T-16_000}});

test('an original same-run spot price accompanies an actual futures level in manual and brief Telegram',()=>{
 const liq=liquidations(),r=buildLiquidationSpotReference({contract,market_context:market(),liquidations:liq,observed_ts:T});
 assert.equal(r.status,'CLOSED');assert.equal(r.network_calls,0);assert.equal(r.score_contribution,0);
 assert.equal(r.independent_liquidation_source_count_added,0);
 liq.spot_reference=r;
 const line=liquidationSpotReferenceLine(liq);
 assert.match(line,/Спот ХТХ: 100 USDT; фьючерсы ХТХ: 100,2 USDT/);
 assert.match(line,/не источник уровней ликвидации/);
 assert.equal(displayFutureLiquidations(liq).filter(x=>x===line).length,1);
 assert.equal(displayBriefTelegramLiquidations(liq,String).filter(x=>x===line).length,1);
});

test('missing level, stale or foreign markets, future clocks and forged stored reference add no spot liquidation claim',()=>{
 const variants=[
  {market_context:{...market(),contract:'ETH-USDT'}},
  {market_context:{...market(),spot:{mid:100,source_ts:T-300_001}}},
  {market_context:{...market(),futures:{mid:100.2,source_ts:T+1}}},
  {liquidations:{...liquidations(),above:[]}},
  {liquidations:{...liquidations(),above:[{...zone,source_ts:T-300_001}]}},
 ];
 for(const change of variants)assert.equal(buildLiquidationSpotReference({contract,market_context:market(),liquidations:liquidations(),observed_ts:T,...change}).status,'NOT_CLOSED');
 const liq=liquidations();liq.spot_reference=buildLiquidationSpotReference({contract,market_context:market(),liquidations:liq,observed_ts:T});
 for(const mutate of [x=>x.spot_reference.contract='ETH-USDT',x=>x.spot_reference.futures_over_spot_pct=10,x=>x.observed_ts=T+301_000,x=>x.above=[]]){
  const bad=structuredClone(liq);mutate(bad);assert.equal(liquidationSpotReferenceLine(bad),null);
 }
});

test('the same canonical fact reaches full manual and approved Telegram output',()=>{
 const c=JSON.parse(fs.readFileSync(new URL('../../checkpoints/btw-preserved-block-result-input-20261004.json',import.meta.url))).canonical;
 const now=c.observed_ts,exact=c.metadata.contract;
 const liq={...liquidations(),contract:exact,observed_ts:now,above:[{...zone,native_symbol:exact.slice(0,-5),source_ts:now-10_000}],below:[]};
 const paired={...market(),contract:exact,observed_ts:now,spot:{mid:100,source_ts:now-15_000},futures:{mid:100.2,source_ts:now-16_000}};
 liq.spot_reference=buildLiquidationSpotReference({contract:exact,market_context:paired,liquidations:liq,observed_ts:now});
 assert.equal(liq.spot_reference.status,'CLOSED');
 c.state='OBSERVE';c.direction='LONG';c.liquidations=liq;
 c.trigger={metric:'price',operator:'>=',value:1,unit:'USDT',timeframe:'5m',expires_ts:now+600_000,next_recheck_ts:now+60_000,cancel_condition:'price<1'};
 c.analytical_fingerprint=canonicalFingerprint(c);
 const manual=formatManualReport(c),telegram=renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE',context_policy:'ORIGINAL_BRIEF_20261007'});
 assert.equal(manual.ok,true,manual.status);assert.equal(telegram.ok,true,telegram.status);
 assert.match(manual.text,/Спот ХТХ: 100 USDT/);assert.match(telegram.text,/Спот ХТХ: 100; фьючерсы ХТХ: 100,2/);
});
