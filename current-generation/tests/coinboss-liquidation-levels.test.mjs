import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCoinBossLiquidationLevels,collectCoinBossLiquidationLevels} from '../files/src/coinboss-liquidation-levels.mjs';
import {buildPumpLiquidationZones} from '../files/src/pump-liquidation-zones.mjs';
import {displayBriefTelegramLiquidations,displayFutureLiquidations,RELEVANT_LIQUIDATION_PRESENTATION} from '../files/src/canonical-display.mjs';

const t=1_791_826_200_000;
const body={success:true,data:{symbol:'FIL',price:1.1534,updatedAt:t-60_000,oiUsd:207_092_670,tiers:{
 '10':{longPrice:1.04267,longIntensity:217_243,shortPrice:1.26413,shortIntensity:605_092},
 '25':{longPrice:1.11188,longIntensity:781_620,shortPrice:1.19492,shortIntensity:122_286},
 '50':{longPrice:1.13495,longIntensity:834_248,shortPrice:1.17185,shortIntensity:81_524},
 '100':{longPrice:1.14648,longIntensity:374_141,shortPrice:1.16032,shortIntensity:10_725},
}}};
const normalize=(payload=body,overrides={})=>normalizeCoinBossLiquidationLevels(payload,{contract:'FIL-USDT',reference_price:1.1534,observed_ts:t,...overrides});

test('exact fresh CoinBoss model remains separate from factual positions and reaches the compact display',()=>{
 const result=normalize();assert.equal(result.status,'CLOSED');assert.equal(result.scenarios.length,8);assert.equal(result.independent_primary_source,false);
 const map=buildPumpLiquidationZones({contract:'FIL-USDT',current_price:1.1534,observed_ts:t,external_calculated_scenarios:result.scenarios});
 assert.equal(map.status,'CALCULATED_CONTEXT_ONLY');assert.equal(map.provider_zone_count,0);assert.equal(map.calculated_scenario_count,8);
 assert.ok(map.calculated_scenarios.every(z=>z.notional===null&&z.exact_amount_available===false&&z.scenario_only));
 const lines=displayBriefTelegramLiquidations(map,x=>String(x),{policy:RELEVANT_LIQUIDATION_PRESENTATION});
 assert.ok(lines.some(line=>line.includes('CoinBoss')));assert.ok(lines.some(line=>line.includes('расчётный')));
 assert.equal(lines.filter(line=>line.startsWith('Ликвидационные уровни')).length,2);
});

test('provider calculations and an observed position coexist without an automatic HTX model',()=>{
 const source=normalize();
 const map=buildPumpLiquidationZones({contract:'FIL-USDT',current_price:1.1534,observed_ts:t,calculation_context:{source_ts:t-1000,open_interest_value_usdt:2_000_000,turnover_24h_usdt:8_000_000,price_change_pct:{'1h':4}},external_calculated_scenarios:source.scenarios,native_contexts:[{status:'USABLE_NATIVE_SAMPLE',binding:{contract:'FIL-USDT'},provider:'Hyperliquid official',source_ts:t-1000,below:[{native_price:1.04,notional:6000,notional_unit:'USDC',native_reference_price:1.1534,price_quote:'USDC',price_semantics:'EXCHANGE_ACCOUNT_LIQUIDATION_PRICE'}]}]});
 assert.equal(map.htx_source_backed_model.status,'DISABLED_BY_OWNER_ON_REQUEST_ONLY');
 assert.equal(map.provider_zone_count,1);assert.equal(map.calculated_scenario_count,8);
 const manual=displayFutureLiquidations(map,{policy:RELEVANT_LIQUIDATION_PRESENTATION}).join('\n');
 const telegram=displayBriefTelegramLiquidations(map,x=>String(x),{policy:RELEVANT_LIQUIDATION_PRESENTATION}).join('\n');
 for(const output of [manual,telegram]){assert.match(output,/CoinBoss/);assert.match(output,/Hyperliquid/);assert.doesNotMatch(output,/Расчётная модель HTX/);}
});

test('stale, mismatched, divergent and malformed responses fail closed',()=>{
 assert.equal(normalize({...body,data:{...body.data,updatedAt:t-300_001}}).status,'SOURCE_CLOCK_NOT_CURRENT');
 assert.equal(normalize({...body,data:{...body.data,symbol:'BTC'}}).status,'IDENTITY_NOT_CLOSED');
 assert.equal(normalize(body,{reference_price:1.30}).status,'PRICE_OR_OI_NOT_CLOSED');
 assert.equal(normalize({...body,data:{...body.data,oiUsd:0}}).status,'PRICE_OR_OI_NOT_CLOSED');
 assert.equal(normalize({...body,data:{...body.data,tiers:{}}}).status,'SCHEMA_NOT_CLOSED');
 assert.equal(normalize(body,{contract:'哈基米-USDT'}).status,'EXCLUDED_BY_USER_POLICY');
});

test('BTC and ETH create no level request or displayed level',async()=>{
 let calls=0;const fetch_impl=async()=>{calls++;throw Error('unexpected');};
 for(const contract of ['BTC-USDT','ETH-USDT']){
  const result=await collectCoinBossLiquidationLevels({contract,reference_price:10,fetch_impl});
  assert.equal(result.status,'EXCLUDED_BY_USER_POLICY');
  const map=buildPumpLiquidationZones({contract,current_price:10,observed_ts:t,external_calculated_scenarios:normalize().scenarios});
  assert.equal(map.status,'EXCLUDED_BY_USER_POLICY');assert.equal(map.calculated_scenario_count,0);
 }
 assert.equal(calls,0);
});

test('collector admits one request and checks its response identity',async()=>{
 let calls=0,admissions=0;
 const fetch_impl=async url=>{calls++;assert.match(url,/symbol=FIL$/);return{ok:true,status:200,text:async()=>JSON.stringify({...body,data:{...body.data,updatedAt:Date.now()-1_000}})};};
 const result=await collectCoinBossLiquidationLevels({contract:'FIL-USDT',reference_price:1.1534,run_id:'test',fetch_impl,request_admit:()=>{admissions++;return{allowed:true,duplicate:false}}});
 assert.equal(result.status,'CLOSED');assert.equal(result.network_calls,1);assert.equal(calls,1);assert.equal(admissions,1);
 const blocked=await collectCoinBossLiquidationLevels({contract:'FIL-USDT',reference_price:1.1534,max_http:0,fetch_impl});
 assert.equal(blocked.status,'DEFERRED_HTTP_ENVELOPE');assert.equal(calls,1);
});
