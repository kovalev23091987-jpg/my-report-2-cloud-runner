import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {collectCrossExchangeRiskContext,probeLiquidationVenueCoverage} from '../files/src/cross-exchange-risk-context.mjs';
import {createCombinedLiquidationService} from '../files/src/liquidation-extension/combined-runner-service.mjs';
import {providerErrorDetails,readJson} from '../files/src/liquidation-extension/io.mjs';
import {buildCandidateSourceRoutingPlan,remainingLiquidationHttpCap} from '../files/src/candidate-source-routing.mjs';
import {loadEffectivePresentationModules,outputContractScenarios,renderScenario} from './output-contract-support.mjs';
const T=1_800_000_000_000,reply=(body,status=200)=>new Response(JSON.stringify(body),{status});
function database(){const sql=new DatabaseSync(':memory:');return{sql,prepare(query){return{args:[],bind(...args){this.args=args;return this;},async run(){return sql.prepare(query).run(...this.args);},async first(){return sql.prepare(query).get(...this.args)||null;},async all(){return{results:sql.prepare(query).all(...this.args)};}};}};}
test('incremental exchange checks visit all catalogs without repeating failed calls or declaring an incomplete absence unsupported',async()=>{
 const db=database(),urls=[],fetch_impl=async url=>{urls.push(String(url));return String(url).includes('binance')?reply({symbols:[{status:'TRADING',contractType:'PERPETUAL',quoteAsset:'USDT',baseAsset:'OTHER',symbol:'OTHERUSDT'}]}):String(url).includes('bybit')?reply({},403):reply({code:'0',data:[]});};
 const params={db,fetch_impl,contract:'BTW-USDT',now:T,max_http:1},runs=[];for(let i=0;i<4;i++)runs.push(await probeLiquidationVenueCoverage(params));
 assert.deepEqual(runs.map(r=>r.network_calls),[1,1,1,0]);assert.equal(urls.length,3);const bybit=runs[3].receipts.find(r=>r.source==='BYBIT');assert.equal(bybit.http_status,403);assert.equal(bybit.coverage_status,'COVERAGE_UNKNOWN');assert.equal(runs[3].receipts.find(r=>r.source==='OKX').coverage_status,'EXACT_MARKET_UNSUPPORTED');db.sql.close();
});
test('a collector exception after HTX does not prevent Coinalyze-to-Gate fallback or exceed the actual request counter',async()=>{
 const db=database(),prepare=db.prepare.bind(db);db.prepare=query=>{if(query.includes('SELECT')&&query.includes('report2_coinalyze_catalog'))throw Error('fixture cache unavailable');return prepare(query);};let calls=0;
 const fetch_impl=async url=>{calls++;return String(url).includes('hbdm')?reply({code:200,ts:T,data:[]}):String(url).includes('/contracts/')?reply({name:'BTW_USDT',type:'direct',quanto_multiplier:'10'}):reply([{time:(T-300000)/1000,long_liq_usd:0,short_liq_usd:0,open_interest_usd:10000}]);};
 const out=await collectCrossExchangeRiskContext({db,fetch_impl,contract:'BTW-USDT',run_id:'EXCEPTION',now:T,lane_override:'HISTORY',include_htx_realized:true,coinalyze_api_key:'FIXTURE'});
 assert.equal(calls,3);assert.equal(out.network_calls,3);assert.equal(out.status,'CLOSED');assert.equal(out.sources.GATE_LIQUIDATION_HISTORY.status,'CLOSED');assert.deepEqual(out.chain_attempts.map(r=>r.status),['CLOSED','SOURCE_EXCEPTION','CLOSED']);db.sql.close();
});
test('the shared native chain checks gTrade before Hyperliquid and unsupported catalogs do not spend account or 0xArchive requests',async()=>{
 const urls=[],ox=async()=>{throw Error('unsupported route must not run');},sdk={getLiquidationPrice(){},buildLiquidationPriceContext(){}};
 const service=createCombinedLiquidationService({mode:'SHADOW_ONLY',clock:()=>T,liqflow_key:'FIXTURE_ONLY',sdk_loader:()=>({version:'1.8.10',sdk}),provider_admit:async()=>({allowed:true,new_reservation:true}),oxarchive_collect:ox,fetch_impl:async url=>{urls.push(String(url));return String(url).includes('gains.trade')?reply({pairs:[{from:'OTHER',to:'USD'}],lastRefreshed:T}):reply([{universe:[{name:'OTHER'}]},[]]);}});
 await service.collect({contract:'BTW-USDT',native_symbol:'BTW',run_id:'TAIL',deep_started_ts:T,max_deep_ms:45000});
 assert.equal(urls.length,2);assert.match(urls[0],/trading-variables/);assert.match(urls[1],/hyperliquid/);assert.deepEqual(service.summary().routed.map(r=>r.lane),['GTRADE_NATIVE','HYPERLIQUID_NATIVE','OXARCHIVE_HL_BUCKETS']);assert.equal(service.summary().shared_budget.actual_http,2);
});
test('main-report priority candidates receive the complete forward-map envelope before history',()=>{
 const plan=buildCandidateSourceRoutingPlan({discovery_row:{early_candidate_quality_0_100:85},cross_exchange_turn:false});assert.equal(plan.run_cross_exchange,true);assert.equal(remainingLiquidationHttpCap({plan,cross_exchange_context:{network_calls:0}}),5);
});
test('the main manual report displays factual history while the Telegram rendering stays unchanged',async t=>{
 const modules=await loadEffectivePresentationModules();t.after(modules.cleanup);const scenario=outputContractScenarios()[0],before=await renderScenario(modules,scenario);
 scenario.canonical.metadata.internal_market_context={cross_exchange_risk:{sources:{HTX_REALIZED_LIQUIDATIONS:{status:'CLOSED',contract:'FIL-USDT',observed_event_count:1,long_liquidated_observed_usd:0,short_liquidated_observed_usd:123.45,events:[{price:112,liquidated_side:'SHORT'}]}}}};
 const after=await renderScenario(modules,scenario);assert.match(after.expected.manual.text,/123,45 USDT/);assert.match(after.expected.manual.text,/события уже произошли/);assert.equal(after.expected.compact.message,before.expected.compact.message);assert.equal(after.expected.telegram.text,before.expected.telegram.text);
});
test('0xArchive compact and envelope errors retain their actionable code, parameter and request ID with credentials redacted',async()=>{
 const d=providerErrorDetails({error_code:'invalid_query_params',param:'buckets',error:'invalid buckets for SECRET_VALUE',request_id:'abc-123'},{headers:{'X-API-Key':'SECRET_VALUE'}});assert.equal(d.code,'invalid_query_params');assert.equal(d.param,'buckets');assert.equal(d.request_id,'abc-123');assert.ok(!d.message.includes('SECRET_VALUE'));
 const out=await readJson('https://api.0xarchive.io/v1/hyperliquid/liquidations/HYPE/levels?range_pct=50&buckets=100',{headers:{'X-API-Key':'SECRET_VALUE'},fetch_impl:async()=>reply({success:false,error:{code:'unsupported_symbol',message:'symbol not supported'},meta:{request_id:'abc-456'}},400)});assert.equal(out.reason,'HTTP_ERROR');assert.equal(out.provider_error.code,'unsupported_symbol');assert.equal(out.receipt.provider_error.request_id,'abc-456');assert.equal(out.payload,null);
});
