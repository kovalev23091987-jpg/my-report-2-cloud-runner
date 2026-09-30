import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {collectCrossExchangeRiskContext} from '../files/src/cross-exchange-risk-context.mjs';
import {normalizeGateLiquidationStatistics,collectGateLiquidationHistory,formatLiquidationHistoryFacts} from '../files/src/gate-liquidation-history.mjs';
import {installProviderMinuteLedger} from '../files/src/provider-minute-ledger.mjs';
import {createCombinedLiquidationService} from '../files/src/liquidation-extension/combined-runner-service.mjs';
const T=1_800_000_000_000,step=300_000;
const row=(i,long=0,short=0)=>({time:(T-i*step)/1000,long_liq_usd:long,short_liq_usd:short,open_interest_usd:9000000,mark_price:1.34,long_users:280,short_users:540});
function database(){const sql=new DatabaseSync(':memory:');return{sql,prepare(query){return{args:[],bind(...args){this.args=args;return this;},async run(){return sql.prepare(query).run(...this.args);},async first(){return sql.prepare(query).get(...this.args)||null;},async all(){return{results:sql.prepare(query).all(...this.args)};}};}};}
const reply=body=>new Response(JSON.stringify(body),{status:200});
test('Gate closes exactly 24 buckets, excludes open guards and retains factual zeros and positioning',()=>{
 const payload=Array.from({length:26},(_,i)=>row(i)),out=normalizeGateLiquidationStatistics(payload,{contract:'BTW-USDT',now:T});
 assert.equal(out.status,'CLOSED');assert.equal(out.history.complete_window,true);assert.equal(out.history.observed_buckets,24);assert.equal(out.history.long_liquidated_observed_usd,0);assert.equal(out.intensity_ratio,null);assert.equal(out.whole_market_coverage,false);assert.equal(out.positioning.long_users,280);
 const lines=formatLiquidationHistoryFacts({sources:{GATE_LIQUIDATION_HISTORY:{...out,exact_identity:true,native_symbol:'BTW_USDT'}}});assert.match(lines[0],/120 закрытых минут/);assert.match(lines[1],/OI/);
 for(const payload of [Array.from({length:23},(_,i)=>row(i+1)),[row(1),row(24)]]){const incomplete=normalizeGateLiquidationStatistics(payload,{contract:'BTW-USDT',now:T});assert.equal(incomplete.history.complete_window,false);assert.equal(incomplete.baseline_window_comparable,false);assert.equal(incomplete.intensity_ratio,null);}
});
test('Gate intensity uses the same complete market windows and documented current USD fields',()=>{
 const payload=Array.from({length:24},(_,i)=>({...row(i+1,999,999),long_liq_usd_new:i<3?200:100,short_liq_usd_new:0})),out=normalizeGateLiquidationStatistics(payload,{contract:'BTW-USDT',now:T});
 assert.equal(out.long_liquidated_recent,600);assert.equal(out.intensity_ratio,2);assert.equal(out.native_statistics.liquidation_amount_fields.long,'long_liq_usd_new');
 const bad=normalizeGateLiquidationStatistics([...payload,{...payload[0],long_liq_usd_new:-1}],{contract:'BTW-USDT',now:T});assert.equal(bad.status,'NOT_CLOSED');assert.equal(bad.baseline_window_comparable,false);
});
test('one remaining HTTP verifies Gate identity for the next cycle instead of repeating an impossible cold fallback',async()=>{
 const db=database(),urls=[],fetch_impl=async url=>{urls.push(url);return reply(String(url).includes('/contracts/')?{name:'BTW_USDT',type:'direct',quanto_multiplier:'0.1',in_delisting:false}:Array.from({length:26},(_,i)=>row(i)));};
 const params={db,fetch_impl,contract:'BTW-USDT',now:T,max_http:1},first=await collectGateLiquidationHistory({...params,run_id:'identity'}),second=await collectGateLiquidationHistory({...params,run_id:'data'});
 assert.equal(first.status,'IDENTITY_VERIFIED');assert.equal(first.network_calls,1);assert.equal(second.status,'CLOSED');assert.equal(second.network_calls,1);assert.match(urls[1],/limit=26/);db.sql.close();
});
test('forced HISTORY bypasses unrelated CEX catalogs and preserves partial Coinalyze alongside Gate, within three HTTP',async()=>{
 const db=database();await installProviderMinuteLedger(db);const urls=[];
 const fetch_impl=async url=>{urls.push(String(url));if(String(url).includes('future-markets'))return reply([{symbol:'BTW.A',base_asset:'BTW',quote_asset:'USDT',exchange:'GATE',is_perpetual:true}]);if(String(url).includes('coinalyze'))return reply([{symbol:'BTW.A',history:[{t:(T-step)/1000,l:12,s:5},{t:(T-2*step)/1000,l:-50,s:0}]}]);return reply(String(url).includes('/contracts/')?{name:'BTW_USDT',type:'direct',quanto_multiplier:'0.1',in_delisting:false}:Array.from({length:26},(_,i)=>row(i)));};
 const params={db,fetch_impl,contract:'BTW-USDT',lane_override:'HISTORY',now:T,coinalyze_api_key:'TEST_ONLY'};
 const first=await collectCrossExchangeRiskContext({...params,run_id:'cold'});assert.equal(first.network_calls,3);assert.equal(first.sources.COINALYZE.status,'PARTIAL');assert.equal(first.sources.COINALYZE.partial_observation.datapoints,1);assert.equal(first.sources.COINALYZE.partial_observation.markets[0].long_liquidated_observed_usd,12);assert.equal(first.sources.COINALYZE.intensity_ratio,null);assert.equal(first.status,'NOT_CLOSED');
 const second=await collectCrossExchangeRiskContext({...params,run_id:'warm'});assert.equal(second.network_calls,2);assert.equal(second.status,'CLOSED');assert.equal(second.sources.GATE_LIQUIDATION_HISTORY.history.observed_buckets,24);assert.equal(second.sources.COINALYZE.status,'PARTIAL');assert.equal(urls.some(url=>/binance|bybit|okx/.test(url)),false);db.sql.close();
});
test('an exact complete Hyperliquid catalog prevents unsupported 0xArchive requests and reservations',async()=>{
 let oxCalls=0;const admissions=[],ox=async()=>{oxCalls++;return null;};
 const service=createCombinedLiquidationService({mode:'SHADOW_ONLY',secondary_enabled:false,oxarchive_collect:ox,fetch_impl:async()=>reply([{universe:[{name:'OTHER'}]},[]]),provider_admit:async request=>{admissions.push(request);return{allowed:true,new_reservation:true};}});
 assert.equal(await service.collect({contract:'BTW-USDT',native_symbol:'BTW',run_id:'coverage',deep_started_ts:Date.now(),max_deep_ms:45000}),null);assert.equal(oxCalls,0);assert.equal(admissions.some(row=>row.requests?.OXARCHIVE),false);
 const outcome=service.summary().routed.find(row=>row.lane==='OXARCHIVE_HL_BUCKETS');assert.match(outcome.status,/UNSUPPORTED_NATIVE_SYMBOL/);assert.equal(outcome.source_outcome.attempted_http_count,0);
});
