import test from 'node:test';
import assert from 'node:assert/strict';
import {buildHtxSourceBackedLiquidationModel,reconcileLiquidationZones} from '../files/src/htx-source-backed-liquidation-model.mjs';
import {buildPumpLiquidationZones} from '../files/src/pump-liquidation-zones.mjs';
import {displayFutureLiquidations,selectLiquidationDisplayZones} from '../files/src/canonical-display.mjs';

const T=Date.UTC(2026,9,1,5,0,0);
const context=(extra={})=>({source_ts:T-1000,open_interest_value_usdt:2_000_000,turnover_24h_usdt:8_000_000,funding_rate_pct:0.035,market_24h:{open:96,high:115,low:88},price_tick:0.001,price_change_pct:{'5m':1.2,'15m':3.5,'1h':8,'4h':22,'24h':35},oi_change_pct:{'15m':2,'1h':7,'4h':18},...extra});

test('fresh official HTX inputs cover small, ordinary and non-Latin active contracts on both sides',()=>{
 for(const contract of ['BTW-USDT','NEAR-USDT','龙虾-USDT']){
  const model=buildHtxSourceBackedLiquidationModel({contract,current_price:100,observed_ts:T,calculation_context:context()});
  assert.equal(model.status,'CLOSED',contract);assert.ok(model.zones.some(row=>row.liquidated_side==='LONG'&&row.price<100),contract);assert.ok(model.zones.some(row=>row.liquidated_side==='SHORT'&&row.price>100),contract);assert.equal(model.coverage,'ALL_ACTIVE_HTX_USDT_SWAP_WITH_CLOSED_BATCH_INPUTS');assert.ok(model.zones.every(row=>row.estimated&&row.independence_group==='HTX_OFFICIAL_MODEL'));
 }
});

test('one source-backed calculation path has no popularity whitelist across a 359-contract universe',()=>{
 const contracts=Array.from({length:358},(_,index)=>`T${index+1}-USDT`).concat('龙虾-USDT');
 const closed=contracts.map((contract,index)=>buildHtxSourceBackedLiquidationModel({contract,current_price:1+index/10,observed_ts:T,calculation_context:context({market_24h:{open:1+index/10,high:1.05+index/10,low:.95+index/10},price_tick:.0001})}));
 assert.equal(closed.length,359);
 assert.ok(closed.every(model=>model.status==='CLOSED'&&model.zones.some(row=>row.liquidated_side==='LONG')&&model.zones.some(row=>row.liquidated_side==='SHORT')));
});

test('levels respond to measured volatility and anchors instead of fixed percentage bands',()=>{
 const calm=buildHtxSourceBackedLiquidationModel({contract:'BTW-USDT',current_price:100,observed_ts:T,calculation_context:context({market_24h:{open:100,high:101,low:99},price_change_pct:{'5m':.1,'15m':.2,'1h':.4,'4h':.8,'24h':1}})});
 const pump=buildHtxSourceBackedLiquidationModel({contract:'BTW-USDT',current_price:100,observed_ts:T,calculation_context:context()});
 assert.equal(calm.status,'CLOSED');assert.equal(pump.status,'CLOSED');assert.notDeepEqual(calm.leverage_scenarios,pump.leverage_scenarios);assert.notEqual(calm.volatility_1h_pct,pump.volatility_1h_pct);assert.notDeepEqual(calm.zones.map(row=>row.price),pump.zones.map(row=>row.price));
});

test('stale or incomplete HTX data fails closed instead of producing generic bands',()=>{
 for(const bad of [context({source_ts:T-300001}),context({open_interest_value_usdt:null}),context({turnover_24h_usdt:null,market_24h:null,price_change_pct:{}})]){
  const model=buildHtxSourceBackedLiquidationModel({contract:'BTW-USDT',current_price:100,observed_ts:T,calculation_context:bad});assert.equal(model.status,'NOT_CLOSED');assert.equal(model.zones.length,0);
 }
});

test('independent sources are reconciled near one zone and their notionals are never summed',()=>{
 const rows=[
  {price:110,side:'ABOVE',source:'Provider A',venue:'A',notional:1_000_000,estimated:true,independence_group:'A'},
  {price:110.4,side:'ABOVE',source:'Provider B',venue:'B',notional:2_000_000,estimated:true,independence_group:'B'},
  {price:109.9,side:'ABOVE',source:'HTX model',venue:'HTX',notional:3_000_000,estimated:true,independence_group:'HTX_OFFICIAL_MODEL'},
 ];
 const [zone]=reconcileLiquidationZones(rows,{reference_price:100,volatility_pct:3});assert.equal(zone.independent_source_count,3);assert.equal(zone.consensus_confidence_ru,'высокая');assert.equal(zone.notional,3_000_000);assert.equal(zone.amount_semantics,'BEST_SINGLE_SOURCE_NOTIONAL_NOT_SUMMED');
});

test('pump map falls back to source-backed HTX calculation and reports full calculated coverage',()=>{
 const map=buildPumpLiquidationZones({contract:'龙虾-USDT',current_price:100,observed_ts:T,calculation_context:context()});
 assert.equal(map.status,'CLOSED');assert.equal(map.future_levels_status,'HTX_SOURCE_BACKED_MODEL_AVAILABLE');assert.equal(map.coverage_status,'FULL_HTX_CALCULATED_COVERAGE');assert.ok(map.above.length);assert.ok(map.below.length);assert.ok(map.calculated_zone_count>0);assert.equal(map.external_zone_count,0);
 const output=displayFutureLiquidations(map).join('\n');assert.match(output,/Расчётная модель HTX/);assert.match(output,/оценка/);
});

test('user display merges neighboring BTW levels into one range and keeps four separated zones per side',()=>{
 const rows=[
  [1.85195483944,9824.473498231311,'SHORT'],[1.66641146167,7610.004448781198,'SHORT'],[1.83696642985,7204.6138987029635,'SHORT'],[1.52963667959,6862.2149998057575,'SHORT'],[1.392531323,3632.779658653116,'SHORT'],
  [.931195827222,11267.707404263841,'LONG'],[.923559617605,11172.294971570274,'LONG'],[1.116739205,8727.928625330373,'LONG'],[1.24645973508,7191.413694348031,'LONG'],[.76987625,3755.902468,'LONG'],[1.367222765,2760.013371,'LONG'],
 ].map(([price,notional,side])=>({price,native_price:price,notional,notional_usdt:notional,notional_unit:'USDT',price_quote:'USDT',native_reference_price:1.389707,distance_pct:(price/1.389707-1)*100,distance_reference_basis:'HTX_CURRENT_SAME_QUOTE',side:side==='SHORT'?'ABOVE':'BELOW',liquidated_side:side==='SHORT'?'SELLERS':'BUYERS',source:'Расчётная модель HTX',venue:'HTX',source_ts:T-1000,estimated:true,independence_group:'HTX_OFFICIAL_MODEL'}));
 const liq={future_only:true,provider_zone_count:rows.length,all_zones:rows,above:rows.filter(z=>z.side==='ABOVE'),below:rows.filter(z=>z.side==='BELOW')};
 const above=selectLiquidationDisplayZones(liq,'ABOVE'),below=selectLiquidationDisplayZones(liq,'BELOW');
 assert.equal(above.length,4);assert.equal(below.length,4);
 const upper=above.find(z=>z.display_component_count===2),lower=below.find(z=>z.display_component_count===2);
 assert.ok(upper);assert.ok(lower);assert.equal(Math.round(upper.notional),17029);assert.equal(upper.strength_label_ru,'средняя');assert.equal(Math.round(lower.notional),22440);assert.equal(lower.strength_label_ru,'средняя');
 const output=displayFutureLiquidations(liq).join('\n');assert.match(output,/1,83696643–1,851954839/);assert.match(output,/0,9235596176–0,9311958272/);assert.doesNotMatch(output,/Ещё \d+ уров/);
});
