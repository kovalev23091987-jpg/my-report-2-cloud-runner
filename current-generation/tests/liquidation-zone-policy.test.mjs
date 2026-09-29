import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPumpLiquidationZones,classifyPump24h} from '../files/src/pump-liquidation-zones.mjs';
import {displayLegacyLiquidations} from '../files/src/canonical-display.mjs';
const zones=[
 {price:110,status:'CLOSED',source:'ByKaranteli',notional_usdt:1000},
 {price:121,status:'CLOSED',source:'ByKaranteli',notional_usdt:15000},
 {price:142,status:'CLOSED',source:'ByKaranteli',notional_usdt:250000},
 {price:175,status:'CLOSED',source:'ByKaranteli',notional_usdt:2500000},
 {price:90,status:'CLOSED',source:'ByKaranteli',notional_usdt:900},
 {price:79,status:'CLOSED',source:'ByKaranteli',notional_usdt:12000},
 {price:58,status:'CLOSED',source:'ByKaranteli',notional_usdt:220000},
 {price:25,status:'CLOSED',source:'ByKaranteli',notional_usdt:2200000},
];
test('five percent starts liquidation-map urgency and has no upper ceiling',()=>{
 for(const move of [5,40,100,200,-250])assert.equal(classifyPump24h(move).is_pump,true);
 assert.equal(classifyPump24h(200).upper_ceiling_pct,null);
});
test('early anomaly can show verified zones before five percent',()=>{
 const x=buildPumpLiquidationZones({contract:'FIL-USDT',rolling_24h_change_pct:2,current_price:100,early_anomaly:true,projected:zones});
 assert.equal(x.status,'CLOSED');assert.equal(x.above.length,4);assert.equal(x.below.length,4);
 assert.deepEqual(x.above.map(row=>row.band),['5_15','15_30','30_60','60_PLUS']);
 assert.deepEqual(x.below.map(row=>row.band),['5_15','15_30','30_60','60_PLUS']);
 assert.ok(x.above.every(row=>['небольшая','средняя','крупная','огромная'].includes(row.strength_label_ru)));
 assert.ok(x.above.every(row=>row.exact_amount_available===true));
 assert.equal(x.coverage_status,'PROVIDER_ZONES_ALL_BANDS');
});
test('every eligible HTX futures contract gets four calculated zones on both sides',()=>{
 for(const contract of ['SUI-USDT','FIL-USDT','龙虾-USDT']){
  const x=buildPumpLiquidationZones({contract,rolling_24h_change_pct:0,current_price:10,projected:[]});
  assert.equal(x.status,'CLOSED');assert.equal(x.coverage_scope,'ALL_HTX_FUTURES_EXCEPT_BTC_ETH');
  assert.equal(x.coverage_status,'CALCULATED_FOR_ALL_BANDS');assert.equal(x.above.length,4);assert.equal(x.below.length,4);
  assert.ok(x.above.concat(x.below).every(row=>row.kind==='CALCULATED'&&row.exact_amount_available===false&&row.strength_label_ru));
 }
});
test('provider holes are filled by calculated bands without inventing exact amounts',()=>{
 const x=buildPumpLiquidationZones({contract:'SUI-USDT',rolling_24h_change_pct:18,current_price:100,projected:[zones[0],zones[6]],calculation_context:{oi_change_pct:8,volume_ratio:3,funding_rate_pct:0.02}});
 assert.equal(x.status,'CLOSED');assert.equal(x.coverage_status,'MIXED_PROVIDER_AND_CALCULATED');
 assert.equal(x.above.length,4);assert.equal(x.below.length,4);
 assert.equal(x.above[0].exact_amount_available,true);assert.ok(x.above.slice(1).every(row=>row.exact_notional_usdt===null));
});
test('0xArchive projected buckets never masquerade as an exact liquidation amount',()=>{
 const map=buildPumpLiquidationZones({contract:'FIL-USDT',rolling_24h_change_pct:8,current_price:100,projected:[{status:'CLOSED',source:'0xArchive',providers:['0xArchive'],center_price:110,largest_provider_position_usd:42000,position_count:3}]});
 assert.equal(map.above[0].kind,'PROJECTED');assert.equal(map.above[0].exact_amount_available,false);
 const rendered=displayLegacyLiquidations(map).join(' ');
 assert.doesNotMatch(rendered,/точная сумма 42000/);
});
test('BTC and ETH never show liquidation maps',()=>{
 for(const contract of ['BTC-USDT','ETH-USDT'])assert.equal(buildPumpLiquidationZones({contract,rolling_24h_change_pct:200,current_price:100,projected:zones}).status,'EXCLUDED_BY_USER_POLICY');
});
