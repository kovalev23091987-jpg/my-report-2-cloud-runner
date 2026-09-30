import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {installProviderMinuteLedger,reserveProviderMinuteUnits} from '../files/src/provider-minute-ledger.mjs';
import {buildSupplementalScoreEvidence,applySupplementalScoreAdjustment} from '../files/src/supplemental-score-evidence.mjs';
const {collectCrossExchangeRiskContext,loadCoinalyzeMarkets}=await import(process.env.REPORT2_QUOTA_TEST_MODULE||new URL('../files/src/cross-exchange-risk-context.mjs',import.meta.url));
const T=Math.floor(Date.now()/1000)*1000+86400000,catalog=['TAO','SOL'].map(base=>({symbol:`${base}.A`,base_asset:base,quote_asset:'USDT',exchange:'BINANCE',is_perpetual:true}));
const reply=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers});
function database(){const sql=new DatabaseSync(':memory:');return{sql,prepare(query){return{args:[],bind(...args){this.args=args;return this;},async run(){const r=sql.prepare(query).run(...this.args);return{meta:{changes:Number(r.changes)}};},async first(){return sql.prepare(query).get(...this.args)||null;},async all(){return{results:sql.prepare(query).all(...this.args)};}};}};}
async function prepare(){const db=database();await installProviderMinuteLedger(db);db.sql.exec('CREATE TABLE report2_cross_exchange_catalog(catalog_id TEXT PRIMARY KEY,observed_ts INTEGER,expires_ts INTEGER,payload_json TEXT)');db.sql.prepare('INSERT INTO report2_cross_exchange_catalog VALUES(?,?,?,?)').run('CEX_V3',T,T+86400000,JSON.stringify({schema:'CEX_CATALOG_V3',entries:{TAO:{base:'TAO'},SOL:{base:'SOL'}},receipts:[]}));return db;}
function gateResponse(url,now=T){const u=new URL(url),symbol=u.pathname.includes('/contracts/')?u.pathname.split('/').at(-1):u.searchParams.get('contract');return u.pathname.includes('/contracts/')?reply({name:symbol,type:'direct',quanto_multiplier:'0.01',in_delisting:false}):reply([{time:Math.floor(now/300000)*300-300,long_liq_usd:1500,short_liq_usd:500,open_interest_usd:10000}]);}
const args=(db,fetch_impl,extra={})=>({db,fetch_impl,contract:'TAO-USDT',run_id:'R',reference_price:300,coinalyze_api_key:'FIXTURE_ONLY_NOT_SECRET',lane_override:'HISTORY',now:T,...extra});
const coinalyzeReceipt=out=>out.receipts.find(r=>r.source==='COINALYZE'&&r.fallback);

for(const mode of ['FULL_REPORT','STANDALONE_LIQUIDATION_BLOCK'])test(`${mode}: exhausted Coinalyze falls through to exact Gate context within three HTTP, without a fabricated baseline or direction`,async()=>{
 const db=await prepare(),urls=[],fetch_impl=async url=>{urls.push(String(url));return String(url).includes('coinalyze')?reply({error:'quota'},429,{'retry-after':'120'}):gateResponse(url);};
 const out=await collectCrossExchangeRiskContext(args(db,fetch_impl,{allowed_lanes:mode==='FULL_REPORT'?null:['REALIZED','HISTORY']}));
 assert.equal(out.status,'CLOSED');assert.equal(out.network_calls,3);assert.equal(urls.length,3);const first=coinalyzeReceipt(out);assert.equal(first.status,'RATE_LIMITED_429');assert.equal(first.reason,'HTTP_429');assert.equal(first.next_allowed_at,T+120000);assert.equal(first.network_calls,1);
 const gate=out.sources.GATE_LIQUIDATION_HISTORY;assert.equal(gate.native_symbol,'TAO_USDT');assert.equal(gate.intensity_ratio,null);assert.equal(gate.baseline_window_comparable,false);assert.equal(gate.equivalent_baseline_replacement,false);
 const evidence=buildSupplementalScoreEvidence({direction:'SHORT',internal_market_context:{cross_exchange_risk:out}});assert.equal(applySupplementalScoreAdjustment(70,evidence).adjustment,0);db.sql.close();
});

test('provider cooldown is durable, shared across assets and consumes no new Coinalyze units before Retry-After',async()=>{
 const db=await prepare(),urls=[],fetch_impl=async url=>{urls.push(String(url));return String(url).includes('coinalyze')?reply({},429,{'retry-after':'120'}):gateResponse(url);};
 await collectCrossExchangeRiskContext(args(db,fetch_impl));const second=await collectCrossExchangeRiskContext(args(db,fetch_impl,{contract:'SOL-USDT',run_id:'R2',now:T+1000}));
 assert.equal(urls.filter(u=>u.includes('coinalyze')).length,1);assert.equal(second.network_calls,2);assert.equal(coinalyzeReceipt(second).network_calls,0);assert.equal(coinalyzeReceipt(second).next_allowed_at,T+120000);
 assert.equal(db.sql.prepare("SELECT SUM(units) n FROM report2_provider_minute_ledger_v1 WHERE provider='COINALYZE'").get().n,1);assert.equal(second.sources.GATE_LIQUIDATION_HISTORY.native_symbol,'SOL_USDT');db.sql.close();
});

test('provider retries only at cooldown expiry and can resume its stronger comparable-history role',async()=>{
 const db=await prepare();let limited=true,coinalyze=0;const resumed=T+120000;
 const fetch_impl=async url=>{if(!String(url).includes('coinalyze'))return gateResponse(url);coinalyze++;if(limited)return reply({},429,{'retry-after':'120'});if(String(url).includes('future-markets'))return reply(catalog);const end=Math.floor(resumed/300000)*300000;return reply([{symbol:'TAO.A',history:Array.from({length:24},(_,i)=>({t:(end-(24-i)*300000)/1000,l:100,s:50}))}]);};
 await collectCrossExchangeRiskContext(args(db,fetch_impl));limited=false;const still=await loadCoinalyzeMarkets({db,fetch_impl,api_key:'FIXTURE',base:'TAO',run_id:'EARLY',now:resumed-1});assert.equal(still.network_calls,0);assert.equal(coinalyze,1);
 const out=await collectCrossExchangeRiskContext(args(db,fetch_impl,{run_id:'RESUMED',now:resumed}));assert.equal(coinalyze,3);assert.equal(out.sources.COINALYZE.status,'CLOSED');assert.equal(out.sources.COINALYZE.intensity_ratio,1);assert.equal(coinalyzeReceipt(out),undefined);db.sql.close();
});

test('rolling local quota is not mislabeled as missing futures markets',async()=>{
 const db=await prepare();await reserveProviderMinuteUnits(db,{provider:'COINALYZE',reservation_id:'FILL',units:30,cap:30,now:T});let calls=0;const out=await collectCrossExchangeRiskContext(args(db,async url=>{calls++;assert.ok(!String(url).includes('coinalyze'));return gateResponse(url);}));
 assert.equal(calls,2);const receipt=coinalyzeReceipt(out);assert.equal(receipt.status,'DEFERRED_RATE_LIMIT');assert.equal(receipt.reason,'ROLLING_60S_CAP_REACHED');assert.equal(receipt.network_calls,0);db.sql.close();
});

for(const status of [403,500])test(`catalog HTTP${status} preserves the real refusal, not unsupported-market or monthly-quota claims`,async()=>{
 const db=await prepare();const out=await collectCrossExchangeRiskContext(args(db,async url=>String(url).includes('coinalyze')?reply({},status):gateResponse(url)));const receipt=coinalyzeReceipt(out);assert.equal(receipt.status,'SOURCE_ERROR');assert.equal(receipt.reason,`HTTP_${status}`);assert.equal(receipt.http_status,status);assert.equal(receipt.next_allowed_at,null);db.sql.close();
});

test('only a valid complete catalog can establish an absent exact market; malformed catalog cannot',async()=>{
 for(const [payload,expected] of [[{error:'not a catalog'},'INVALID_RESPONSE'],[catalog,'SOURCE_UNSUPPORTED']]){const db=await prepare(),out=await collectCrossExchangeRiskContext(args(db,async url=>String(url).includes('coinalyze')?reply(payload):gateResponse(url),{contract:'ABC-USDT'}));assert.equal(coinalyzeReceipt(out).status,expected);assert.equal(coinalyzeReceipt(out).reason==='NO_EXACT_FUTURES_MARKETS',expected==='SOURCE_UNSUPPORTED');db.sql.close();}
});

for(const retry of [null,'invalid',new Date(T+90000).toUTCString()])test(`history-route429 persists bounded Retry-After (${String(retry)}) even with valid catalog cache`,async()=>{
 const db=await prepare();let catalogCalls=0,historyCalls=0;const fetch_impl=async url=>{if(String(url).includes('future-markets')){catalogCalls++;return reply(catalog);}if(String(url).includes('coinalyze')){historyCalls++;return reply({},429,retry?{'retry-after':retry}:{});}return gateResponse(url);};
 await loadCoinalyzeMarkets({db,fetch_impl,api_key:'FIXTURE',base:'TAO',run_id:'CAT',now:T});const out=await collectCrossExchangeRiskContext(args(db,fetch_impl));assert.equal(coinalyzeReceipt(out).next_allowed_at,T+(retry?.includes('GMT')?90000:60000));
 await collectCrossExchangeRiskContext(args(db,fetch_impl,{contract:'SOL-USDT',run_id:'LATER',now:T+1000}));assert.equal(catalogCalls,1);assert.equal(historyCalls,1);db.sql.close();
});
