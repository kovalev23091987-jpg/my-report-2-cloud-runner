import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeOrderlyPublicPositions,collectOrderlyPublicPositions} from '../files/src/orderly-public-liquidation-positions.mjs';
import {buildPumpLiquidationZones} from '../files/src/pump-liquidation-zones.mjs';
import {displayBriefTelegramLiquidations,RELEVANT_LIQUIDATION_PRESENTATION} from '../files/src/canonical-display.mjs';

const now=Date.now();
const row=(side,price,notional,more={})=>({symbol:'PERP_HYPE_USDC',side,mark_price:'83.228',est_liq_price:String(price),notional:String(notional),margin_mode:'CROSS',...more});
const body={success:true,ts:now-1000,data:{total_positions:4,rows:[row('LONG',80.0944114,6824.696),row('SHORT',85.1,120000),row('LONG',60,50000),row('SHORT',81,8000)]}};

test('Orderly public positions provide labelled estimates backed by reported open notional in both outputs',()=>{
 const result=normalizeOrderlyPublicPositions(body,{contract:'HYPE-USDT',reference_price:83.46,now});
 assert.equal(result.status,'CLOSED');assert.equal(result.levels.length,2);assert.equal(result.independent_primary_source,true);
 assert.ok(result.levels.every(x=>x.estimated&&x.amount_semantics==='REPORTED_OPEN_POSITION_NOTIONAL'&&x.decision_target_eligible===false&&x.position_key&&!('address' in x)));
 const map=buildPumpLiquidationZones({contract:'HYPE-USDT',current_price:83.46,observed_ts:now,projected:result.levels});
 assert.equal(map.status,'CLOSED');assert.equal(map.above.length,1);assert.equal(map.below.length,1);
 assert.equal(map.calculated_scenario_count,0);assert.equal(map.independent_source_count,undefined);
 const lines=displayBriefTelegramLiquidations(map,x=>String(x),{policy:RELEVANT_LIQUIDATION_PRESENTATION});
 assert.ok(lines.some(x=>x.includes('расчётный')));assert.ok(lines.some(x=>x.includes('крупная')));
});

test('stale clock, unknown market, wrong-side price, missing price and divergent HTX price do not become levels',()=>{
 assert.equal(normalizeOrderlyPublicPositions(body,{contract:'STRK-USDT',reference_price:83,now}).status,'EXACT_MARKET_UNVERIFIED');
 assert.equal(normalizeOrderlyPublicPositions({...body,ts:now-120001},{contract:'HYPE-USDT',reference_price:83.46,now}).status,'INVALID_SOURCE_RESPONSE');
 assert.equal(normalizeOrderlyPublicPositions(body,{contract:'HYPE-USDT',reference_price:70,now}).levels.length,0);
 const missing={...body,data:{...body.data,rows:[row('LONG',null,1000,{est_liq_price:null})]}};
 assert.equal(normalizeOrderlyPublicPositions(missing,{contract:'HYPE-USDT',reference_price:83.46,now}).levels.length,0);
});

test('collector consumes at most one admitted HTTP request and excludes BTC and ETH',async()=>{
 let calls=0,admissions=0;
 const fetch_impl=async(_url,init)=>{calls++;assert.equal(JSON.parse(init.body).symbol,'PERP_HYPE_USDC');return{ok:true,status:200,json:async()=>({...body,ts:Date.now()})};};
 const params={contract:'HYPE-USDT',reference_price:83.46,run_id:'test',fetch_impl,request_admit:()=>{admissions++;return{allowed:true,duplicate:false}}};
 const result=await collectOrderlyPublicPositions(params);assert.equal(result.status,'CLOSED');assert.equal(result.network_calls,1);assert.equal(calls,1);assert.equal(admissions,1);
 assert.equal((await collectOrderlyPublicPositions({...params,max_http:0})).network_calls,0);
 for(const contract of ['BTC-USDT','ETH-USDT'])assert.equal((await collectOrderlyPublicPositions({...params,contract})).network_calls,0);
 assert.equal(calls,1);
});
