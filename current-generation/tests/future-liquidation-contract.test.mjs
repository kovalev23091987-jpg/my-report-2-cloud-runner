import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {buildPumpLiquidationZones} from '../files/src/pump-liquidation-zones.mjs';
import {displayLegacyLiquidations} from '../files/src/canonical-display.mjs';
import {collectCrossExchangeRiskContext} from '../files/src/cross-exchange-risk-context.mjs';
import {buildLiquidationSourceChain} from '../files/src/liquidation-source-chain.mjs';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
function database(){const sql=new DatabaseSync(':memory:');return{sql,prepare(query){return{args:[],bind(...args){this.args=args;return this;},async run(){return sql.prepare(query).run(...this.args);},async first(){return sql.prepare(query).get(...this.args)||null;},async all(){return{results:sql.prepare(query).all(...this.args)};}};}};}
test('every coin reports future levels above and below; executed events and fixed bands cannot satisfy the contract',()=>{
 for(const contract of ['BTW-USDT','FIL-USDT','DOG-USDT','龙虾-USDT']){
  const map=buildPumpLiquidationZones({contract,current_price:100,realized:[{price:110,source:'HTX',size_usd:900000,status:'CLOSED'}],projected:[{price:80,source:'history adapter',role:'REALIZED_EVENTS',size_usd:900000,status:'CLOSED'}]});
  assert.equal(map.provider_zone_count,0);assert.equal(map.future_levels_status,'NOT_AVAILABLE');
  const out=displayLegacyLiquidations(map).join('\n');assert.match(out,/Сильные ликвидации выше: уровни будущих ликвидаций не получены/);assert.match(out,/Сильные ликвидации ниже: уровни будущих ликвидаций не получены/);assert.doesNotMatch(out,/900000|109|121|175/);
 }
});
test('future provider levels retain side, price, source and provider amount without guaranteeing the future',()=>{
 const map=buildPumpLiquidationZones({contract:'BTW-USDT',current_price:100,projected:[{price:112,source:'Provider',size_usd:250000,status:'CLOSED'},{price:89,source:'Provider',size_usd:310000,status:'CLOSED',price_semantics:'PROVIDER_MODEL_PRICE_BIN'}]});
 const out=displayLegacyLiquidations(map).join('\n');assert.equal(map.provider_zone_count,2);assert.match(out,/выше: 112 USDT/);assert.match(out,/ниже: 89 USDT/);assert.match(out,/источник Provider/);assert.match(out,/модельная оценка источника/);assert.doesNotMatch(out,/точная сумма|гарант/);
});
test('zero remaining history allowance makes no HTTP call and preserves cached observations',async()=>{
 const db=database();const first=await collectCrossExchangeRiskContext({db,contract:'BTW-USDT',run_id:'empty',lane_override:'HISTORY',max_http:0,fetch_impl:()=>{throw Error('history must not dispatch');}});assert.equal(first.network_calls,0);assert.equal(first.status,'DEFERRED_AFTER_FUTURE_LEVELS');
 db.sql.close();
});
test('main and standalone production consumers call future maps before realized history and preserve bounded envelopes',()=>{
 const worker=read('../files/src/worker.js'),main=worker.slice(worker.indexOf('async function buildDeepCheckInput'));
 assert.ok(main.indexOf('await env.REPORT2_LIQUIDATION_NATIVE_COLLECT')<main.indexOf('await htxLiquidationTape'));
 assert.ok(main.indexOf('await LIQUIDATION_INTELLIGENCE_API.collectCrossVenueLiquidationIntelligence')<main.indexOf('await htxLiquidationTape'));
 assert.ok(main.indexOf('await env.REPORT2_LIQUIDATION_NATIVE_COLLECT')<main.indexOf('await env.REPORT2_CROSS_EXCHANGE_RISK_COLLECT'));
 const runner=read('../files/runner-main.mjs'),solo=runner.slice(runner.indexOf('  if(commandIntent.matched){'));
 assert.ok(solo.indexOf('future_only:true')<solo.indexOf('crossExchangeRisk=await'));
 assert.ok(solo.indexOf('acquisition=await collectFor(candidate)')<solo.indexOf('crossExchangeRisk=await'));
 assert.match(solo,/max_http_for_candidate:Math.max\(0,8-bykFutureCalls\)/);
 assert.match(runner,/5-\(futureHttpByContract.get\(params.contract\)\?\?5\)/);
 const formatter=read('../files/src/manual-report-formatter.mjs');assert.ok(formatter.indexOf('...nativeLines')<formatter.indexOf('lines.push(...formatLiquidationHistoryFacts'));
});
test('historical source success does not close the future-map receipt',()=>{
 const chain=buildLiquidationSourceChain({contract:'BTW-USDT',risk:{chain_attempts:[{source:'GATE_LIQUIDATION_HISTORY',status:'CLOSED'}]}});
 assert.equal(chain.useful_future_source_count,0);assert.equal(chain.useful_history_source_count,1);assert.match(chain.policy,/FUTURE_LEVELS_FIRST/);
});
