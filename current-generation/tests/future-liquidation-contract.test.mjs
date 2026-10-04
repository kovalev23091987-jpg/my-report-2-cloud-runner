import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {buildPumpLiquidationZones} from '../files/src/pump-liquidation-zones.mjs';
import {displayLegacyLiquidations} from '../files/src/canonical-display.mjs';
import {collectCrossExchangeRiskContext} from '../files/src/cross-exchange-risk-context.mjs';
import {buildLiquidationSourceChain,buildLiquidationFreshnessAudit} from '../files/src/liquidation-source-chain.mjs';
import {outputContractScenarios} from './output-contract-support.mjs';
import {formatManualReport} from '../files/src/manual-report-formatter.mjs';
import {formatTelegramCompact} from '../files/src/telegram-compact-formatter.mjs';
import {renderCanonicalTelegram} from '../files/src/canonical-publication.mjs';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
function database(){const sql=new DatabaseSync(':memory:');return{sql,prepare(query){return{args:[],bind(...args){this.args=args;return this;},async run(){return sql.prepare(query).run(...this.args);},async first(){return sql.prepare(query).get(...this.args)||null;},async all(){return{results:sql.prepare(query).all(...this.args)};}};}};}
test('every coin reports future levels above and below; executed events and fixed bands cannot satisfy the contract',()=>{
 for(const contract of ['BTW-USDT','FIL-USDT','DOG-USDT','龙虾-USDT']){
  const map=buildPumpLiquidationZones({contract,current_price:100,realized:[{price:110,source:'HTX',size_usd:900000,status:'CLOSED'}],projected:[{price:80,source:'history adapter',role:'REALIZED_HISTORY',kind:'PROJECTED',size_usd:900000,status:'CLOSED'}]});
  assert.equal(map.provider_zone_count,0);assert.equal(map.future_levels_status,'NOT_AVAILABLE');
  const out=displayLegacyLiquidations(map).join('\n');assert.match(out,/Сильные ликвидации выше: уровни будущих ликвидаций не получены/);assert.match(out,/Сильные ликвидации ниже: уровни будущих ликвидаций не получены/);assert.doesNotMatch(out,/900000|109|121|175/);
 }
});
test('future provider levels retain side, price, source and provider amount without guaranteeing the future',()=>{
 const map=buildPumpLiquidationZones({contract:'BTW-USDT',current_price:100,observed_ts:1790806000000,projected:[{price:112,source:'Provider',source_ts:1790806000000,native_reference_price:100,side:'SHORT',notional_usd:250000,status:'CLOSED',price_quote:'USD'},{price:89,source:'Provider',source_ts:1790806000000,native_reference_price:100,side:'LONG',notional_usd:310000,status:'CLOSED',price_quote:'USD',price_semantics:'PROVIDER_MODEL_PRICE_BIN'}]});
 const out=displayLegacyLiquidations(map).join('\n');assert.equal(map.provider_zone_count,2);assert.match(out,/выше: 112 USD/);assert.match(out,/ниже: 89 USD/);assert.match(out,/Provider/);assert.match(out,/оценка 310000 USD/);assert.doesNotMatch(out,/точная сумма|гарант/);
});
test('zero remaining history allowance makes no HTTP call and preserves cached observations',async()=>{
 const db=database();const first=await collectCrossExchangeRiskContext({db,contract:'BTW-USDT',run_id:'empty',lane_override:'HISTORY',max_http:0,fetch_impl:()=>{throw Error('history must not dispatch');}});assert.equal(first.network_calls,0);assert.equal(first.status,'DEFERRED_AFTER_FUTURE_LEVELS');
 db.sql.close();
});
test('main and standalone production consumers enforce durable real-level coverage before source calls',()=>{
 const worker=read('../files/src/worker.js'),main=worker.slice(worker.indexOf('async function buildDeepCheckInput'));
 assert.ok(main.indexOf('await env.REPORT2_LIQUIDATION_NATIVE_COLLECT')<main.indexOf('await htxLiquidationTape'));
 assert.ok(main.indexOf('await LIQUIDATION_INTELLIGENCE_API.collectCrossVenueLiquidationIntelligence')<main.indexOf('await htxLiquidationTape'));
 assert.ok(main.indexOf('await env.REPORT2_LIQUIDATION_NATIVE_COLLECT')<main.indexOf('await env.REPORT2_CROSS_EXCHANGE_RISK_COLLECT'));
 const runner=read('../files/runner-main.mjs'),solo=runner.slice(runner.indexOf('  if(commandIntent.matched){'));
 assert.ok(solo.indexOf('candidateCoverage=candidate?liquidationCoverageFor')<solo.indexOf('acquisition=await collectFor(candidate)'));
 assert.ok(solo.indexOf('acquisition=await collectFor(candidate)')<solo.indexOf('crossExchangeRisk=await'));
 assert.match(solo,/max_http_for_candidate:Math.max\(0,8-bykFutureCalls\)/);
 assert.ok(main.indexOf('await env.REPORT2_LIQUIDATION_NATIVE_COLLECT')<main.indexOf('await env.REPORT2_FUTURE_PROVIDER_MODEL_COLLECT'));
 assert.match(solo,/projected:\[\]/);assert.match(solo,/futureMapSource=null/);
 assert.match(runner,/5-\(futureHttpByContract.get\(params.contract\)\?\?5\)/);
 const formatter=read('../files/src/manual-report-formatter.mjs');assert.ok(formatter.indexOf('...nativeLines')<formatter.indexOf('lines.push(...formatLiquidationHistoryFacts'));
});
test('historical source success does not close the future-map receipt',()=>{
 const chain=buildLiquidationSourceChain({contract:'BTW-USDT',risk:{chain_attempts:[{source:'GATE_LIQUIDATION_HISTORY',status:'CLOSED'}]}});
 assert.equal(chain.configured_future_connection_count,8);assert.equal(chain.useful_future_source_count,0);assert.equal(chain.useful_history_source_count,1);assert.match(chain.policy,/REAL_EXTERNAL_NUMERIC_LEVELS_ONLY/);assert.equal(chain.evaluated_not_enabled.length,3);assert.ok(chain.evaluated_not_enabled.every(row=>row.network_calls===0));
});

test('manual liquidation freshness audit requires new usable data from all eight external future sources',()=>{
 const empty=buildLiquidationFreshnessAudit(buildLiquidationSourceChain({contract:'BTW-USDT'}));
 assert.equal(empty.required_source_count,8);assert.equal(empty.complete,false);assert.equal(empty.status,'PARTIAL_SOURCE_COVERAGE');
 const native={routed:['HYPERLIQUID_NATIVE','LIGHTER_NATIVE','GMX_NATIVE','GTRADE_NATIVE','OXARCHIVE_HL_BUCKETS'].map(lane=>({contract:'BTW-USDT',lane,status:'CLOSED',usable:true,source_outcome:{attempted_http_count:1}}))};
 const closed=buildLiquidationFreshnessAudit(buildLiquidationSourceChain({contract:'BTW-USDT',native,byk_future:{projected_map_status:'CLOSED_SHADOW',projected_clusters:[{}],source_health:{external_fetches:1}},tracked_hl:{status:'CLOSED',data_available:true,network_calls:1},future_models:{status:'CLOSED',levels:[{}],network_calls:1}}));
 assert.equal(closed.required_source_count,8);assert.equal(closed.fresh_network_check_count,8);assert.equal(closed.fresh_data_used_count,8);assert.equal(closed.complete,true);
});

test('shared coverage prerequisites never masquerade as direct source requests',()=>{
 const chain=buildLiquidationSourceChain({contract:'BTW-USDT',native:{routed:[{contract:'BTW-USDT',lane:'HYPERLIQUID_NATIVE',status:'UNSUPPORTED',usable:false,source_outcome:{attempted_http_count:1}}]},byk_future:{projected_map_status:'SOURCE_UNSUPPORTED',projected_clusters:[],source_health:{external_fetches:1}},tracked_hl:{status:'NOT_REQUESTED',data_available:false,network_calls:0}});
 const audit=buildLiquidationFreshnessAudit(chain);
 assert.equal(audit.fresh_coverage_check_count,4);
 assert.equal(audit.direct_network_check_count,2);
 assert.equal(audit.receipts.find(row=>row.source==='BYK_TRACKED_HL_BANDS').direct_network_check,false);
 assert.equal(audit.receipts.find(row=>row.source==='OXARCHIVE_HL_BUCKETS').direct_network_check,false);
});

test('the actual ByK real_v1_multi snapshot yields future long/short prices and never realized totals',()=>{
 const source=read('../files/src/worker.js'),start=source.indexOf('const LIQUIDATION_INTELLIGENCE_API = (() => {'),end=source.indexOf('\nasync function buildDeepCheckInput',start);
 const api=new Function(source.slice(start,end)+'; return LIQUIDATION_INTELLIGENCE_API;')();
 const payload=JSON.parse(read('./fixtures/byk-forward-model-live-hype-20261001.json'));
 const map=api.parseProjectedMap(payload,{observedTs:Date.parse(payload.as_of)+1000,expectedSymbol:'HYPE'});
 assert.equal(map.schema_closed,true);assert.ok(map.clusters.length>50);assert.ok(map.clusters.some(r=>r.side==='LONG_LIQUIDATION_BELOW'&&r.level_price<map.current_price));assert.ok(map.clusters.some(r=>r.side==='SHORT_LIQUIDATION_ABOVE'&&r.level_price>map.current_price));assert.ok(map.clusters.every(r=>r.raw_size>0&&r.source_unit==='USD_NOTIONAL_PROVIDER'));assert.deepEqual(api.parseRealizedSummary(payload,'HYPE',Date.parse(payload.as_of)).rows,[]);
 assert.equal(api.parseProjectedMap({...payload,real_levels:{...payload.real_levels,model_version:'unknown'}},{observedTs:Date.parse(payload.as_of),expectedSymbol:'HYPE'}).schema_closed,false);
 assert.equal(api.parseProjectedMap(payload,{observedTs:Date.parse(payload.as_of),expectedSymbol:'BTW'}).schema_closed,false);
});

test('positive future volumes render in main manual, compact and actual publication without historical substitution',()=>{
 const c=outputContractScenarios()[1].canonical,T=c.observed_ts;
 c.liquidations=buildPumpLiquidationZones({contract:c.metadata.contract,current_price:100,observed_ts:T,projected:[101,102,105,110,500,90,89,85,75,2].map(price=>({price,notional_usd:2200000,source:'Verified provider',source_ts:T,native_reference_price:100,side:price>100?'SHORT':'LONG',price_quote:'USD',status:'CLOSED'}))});
 const manual=formatManualReport(c),compact=formatTelegramCompact(c),telegram=renderCanonicalTelegram({canonical:c,lifecycle_event:'WAIT'});
 for(const r of [manual,compact,telegram])assert.equal(r.ok,true,JSON.stringify(r));
 for(const out of [manual.text,compact.message,telegram.text]){assert.match(out,/огромная/);assert.match(out,/2200000 USD/);assert.doesNotMatch(out,/точная сумма|произошедших|расчётная вероятная зона/);}
 assert.match(manual.text,/500 USD/);assert.match(manual.text,/2 USD/);assert.ok(compact.length<=compact.max_length);assert.equal(c.liquidations.all_zones.length,10);
});
