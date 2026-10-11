import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';
import {normalizeGateFuturesTradeSample,validateGateFuturesTradeSample} from '../files/src/gate-futures-trade-sample.mjs';
import {collectGateFuturesTradeSample} from '../files/src/gate-futures-trade-collector.mjs';
import {installEvidenceSourceStore,writeEvidenceSourceCache} from '../files/src/evidence-source-store.mjs';
import {installProviderMinuteLedger} from '../files/src/provider-minute-ledger.mjs';
import {reconcileN12HtxMarkets} from '../files/src/n12-market-trades.mjs';
import {normalizeHtxLargeTrades} from '../files/src/htx-large-trades-evidence.mjs';
import {consumeBlockResultContext} from '../files/src/block-result-context.mjs';
import {collectExternalN05Flow} from '../files/src/external-n05-flow-collector.mjs';
import {canonicalFingerprint,renderCanonicalTelegram} from '../files/src/canonical-publication.mjs';
import {formatManualReport} from '../files/src/manual-report-formatter.mjs';
import {auditRenderedBlockResults} from '../files/src/block-result-context.mjs';

const data=path=>JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('../../checkpoints/n05-actual-qualification-38049404414/'+path,import.meta.url))));
const actualTrades=data('flow-GATE-FUTURES-AAVE.json.gz'),actualContract=data('catalog-GATE-FUTURES.json.gz').find(x=>x.name==='AAVE_USDT');
const identity={asset_kind:'TOKEN',chain:'ethereum',contract_or_mint:'0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9'};
const currencies=[{currency:'AAVE',chains:[{name:'ETH',addr:identity.contract_or_mint}]}],spot=[{id:'AAVE_USDT',base:'AAVE',quote:'USDT',trade_status:'tradable'}];
const observed=Math.round(Math.max(...actualTrades.map(x=>x.create_time_ms))*1000)+1000;
const sample=(patch={})=>normalizeGateFuturesTradeSample({contract:'AAVE-USDT',identity,currencies,spot,future_contract:actualContract,trades:actualTrades,observed_ts:observed,...patch});

test('retained original Gate futures trades produce bounded signed quote evidence with the real contract multiplier',()=>{
 const result=sample();assert.equal(result.status,'CLOSED_BOUNDED_SAMPLE');assert.equal(result.summary.returned_rows,1000);assert.equal(result.summary.valid_recent_rows,144);assert.equal(result.summary.quanto_multiplier,.01);assert.ok(result.summary.buy_quote_turnover_usdt>0);assert.ok(result.summary.sell_quote_turnover_usdt>0);assert.ok(result.summary.taker_imbalance<0);assert.equal(result.summary.whole_window_coverage_proven,false);assert.equal(validateGateFuturesTradeSample(result.evidence[0],observed),true);assert.equal(result.evidence[0].directional_strength,null);assert.equal(result.evidence[0].score_contribution,0);
});
test('foreign token identity, multiplier, contract status and duplicate public fills cannot count as useful Gate evidence',()=>{
 for(const patch of [{identity:{...identity,contract_or_mint:'0x'+'a'.repeat(40)}},{future_contract:{...actualContract,quanto_multiplier:null}},{future_contract:{...actualContract,status:'prelaunch'}},{future_contract:{...actualContract,name:'OTHER_USDT'}}])assert.equal(sample(patch).evidence.length,0);
 const two=[actualTrades[0],actualTrades[0]];assert.equal(sample({trades:two}).evidence.length,0);
});

function db(){const native=new DatabaseSync(':memory:');return{prepare(sql){const st=native.prepare(sql);return{bind(...p){this.p=Object.fromEntries(p.map((v,i)=>[String(i+1),v]));return this;},async first(){return st.get(this.p||{});},async all(){return{results:st.all(this.p||{})};},async run(){return st.run(this.p||{});}};},async batch(ss){native.exec('BEGIN');try{const r=[];for(const s of ss)r.push(await s.run());native.exec('COMMIT');return r;}catch(e){native.exec('ROLLBACK');throw e;}},close(){native.close();}};}
async function seeded(){const d=db();await installEvidenceSourceStore(d);await installProviderMinuteLedger(d);for(const [source,key,payload] of [['GATE_ASSET_REFERENCE','N05:CURRENCIES',currencies],['N05_OFFICIAL_FLOW:GATE','METADATA:SPOT',spot]])await writeEvidenceSourceCache(d,{source,asset_key:key,observed_ts:observed-1000,expires_ts:observed+3600000,payload:{version:'gate-flow-collector-v1-20261010',observed_ts:observed-1000,payload}});return d;}
test('Gate N12 collector spends existing Gate daily/minute ledger and reuses original-clock cache',async()=>{
 const d=await seeded();let calls=0,grants=0;
 const params={db:d,contract:'AAVE-USDT',asset_identity:identity,identity_method:'HTX_OFFICIAL_CURRENCY_CHAIN_ADDRESS',run_id:'GATE_N12',now:observed,clock:()=>observed,request_admit:()=>{grants++;return{allowed:true};},source_health_admit:()=>({allowed:true}),fetch_impl:async url=>{calls++;return new Response(JSON.stringify(url.includes('/contracts/')?actualContract:actualTrades));}};
 const first=await collectGateFuturesTradeSample(params);assert.equal(first.check_completed,true,first.status);assert.equal(calls,2);assert.equal(grants,2);assert.equal(first.network_calls,2);const daily=await d.prepare('SELECT attempts FROM report2_evidence_source_daily WHERE source=?1').bind('N05_OFFICIAL_FLOW:GATE').first();assert.equal(daily.attempts,2);
 const cached=await collectGateFuturesTradeSample({...params,run_id:'GATE_N12_CACHED'});assert.equal(cached.check_completed,true);assert.equal(cached.network_calls,0);assert.equal(cached.evidence[0].observed_ts,observed);assert.equal(calls,2);d.close();
 const denied=await seeded();await denied.prepare('INSERT INTO report2_evidence_source_daily VALUES(?1,?2,16,NULL,?3)').bind('N05_OFFICIAL_FLOW:GATE',new Date(observed).toISOString().slice(0,10),observed).run();const blocked=await collectGateFuturesTradeSample({...params,db:denied,fetch_impl:async()=>{throw Error('UNEXPECTED_HTTP');}});assert.equal(blocked.network_calls,0);assert.equal(blocked.evidence.length,0);denied.close();
});
test('full external route preserves the Gate futures sample under the shared five-request cap',async()=>{
 const d=await seeded(),end=Math.floor(observed/60000)*60000;
 await writeEvidenceSourceCache(d,{source:'N05_OFFICIAL_FLOW:GATE',asset_key:`TOKEN_FLOW:AAVE-USDT:${end}`,observed_ts:observed,expires_ts:end+300000,payload:{version:'gate-flow-collector-v1-20261010',observed_ts:observed,currencies,spot,pages:[],candles:[]}});
 for(const venue of ['BACKPACK','BITGET','POLONIEX'])await d.prepare('INSERT INTO report2_evidence_source_daily VALUES(?1,?2,16,NULL,?3)').bind('N05_OFFICIAL_FLOW:'+venue,new Date(observed).toISOString().slice(0,10),observed).run();
 let calls=0,grants=0;const result=await collectExternalN05Flow({db:d,contract:'AAVE-USDT',asset_identity:identity,identity_method:'HTX_OFFICIAL_CURRENCY_CHAIN_ADDRESS',run_id:'GATE_N12_ROUTED',now:observed,clock:()=>observed,request_admit:()=>{grants++;return{allowed:true};},source_health_admit:()=>({allowed:true}),fetch_impl:async url=>{calls++;assert.ok(url.includes('/futures/usdt/'));return new Response(JSON.stringify(url.includes('/contracts/')?actualContract:actualTrades));}});
 assert.equal(result.evidence.filter(row=>row.provider_id==='GATE_FUTURES_TRADES').length,1);assert.equal(result.caller_reserved_requests,2);assert.equal(result.network_calls,2);assert.equal(calls,2);assert.equal(grants,2);d.close();
});
test('N12 combines HTX and independent Gate samples only as bounded facts and exposes disagreement',()=>{
 const now=observed,k='AAVE-USDT',future={status:'ok',ch:`market.${k}.trade.detail`,ts:now-1000,data:[{data:[{id:'101',price:100,amount:1,quantity:1,trade_turnover:100,ts:now-2000,direction:'buy'}]}]},sp={status:'ok',ch:'market.aaveusdt.trade.detail',ts:now-1000,data:[{data:[{'trade-id':'201',price:100,amount:1,ts:now-2000,direction:'buy'}]}]},htx=reconcileN12HtxMarkets({contract:k,futures:normalizeHtxLargeTrades(future,{contract:k,observed_ts:now}),spot_payload:sp,observed_ts:now}),gate=sample().evidence;
 const facts=consumeBlockResultContext({contract:k,now,evidence:[...htx.evidence,...gate]}).facts,n12=facts.find(f=>f.block_id==='N12');assert.ok(n12);assert.match(n12.value,/Gate фьючерсы: 144/);assert.match(n12.value,/направления HTX и Gate расходятся; общего направленного вывода нет/);assert.equal(n12.evidence_ids.length,2);assert.equal(facts.filter(f=>f.label==='Направление последних сделок Gate').length,0);
 const fallback=consumeBlockResultContext({contract:k,now,evidence:gate}).facts;assert.equal(fallback[0].label,'Направление последних сделок Gate');
});
test('Gate N12 fact reaches manual and approved Telegram context with exact source IDs',()=>{
 const c=structuredClone(JSON.parse(fs.readFileSync(new URL('../../checkpoints/btw-preserved-block-result-input-20261004.json',import.meta.url))).canonical),now=c.observed_ts,k=c.metadata.contract,base=k.slice(0,-5),i={...identity,contract_or_mint:'0x'+'a'.repeat(40)},coins=[{currency:base,chains:[{name:'ETH',addr:i.contract_or_mint}]}],markets=[{id:base+'_USDT',base,quote:'USDT',trade_status:'tradable'}],contract={...actualContract,name:base+'_USDT'},trades=[{id:991,contract:base+'_USDT',create_time_ms:(now-2000)/1000,size:'-10',price:'1'},{id:992,contract:base+'_USDT',create_time_ms:(now-1000)/1000,size:'-10',price:'1'}];
 const gate=normalizeGateFuturesTradeSample({contract:k,identity:i,currencies:coins,spot:markets,future_contract:contract,trades,observed_ts:now});assert.equal(gate.check_completed,true);
 const h={status:'ok',ch:`market.${k}.trade.detail`,ts:now-1000,data:[{data:[{id:'101',price:1,amount:1,quantity:1,trade_turnover:1,ts:now-2000,direction:'buy'}]}]},s={status:'ok',ch:`market.${base.toLowerCase()}usdt.trade.detail`,ts:now-1000,data:[{data:[{'trade-id':'201',price:1,amount:1,ts:now-2000,direction:'buy'}]}]};
 const htx=reconcileN12HtxMarkets({contract:k,futures:normalizeHtxLargeTrades(h,{contract:k,observed_ts:now}),spot_payload:s,observed_ts:now}),evidence=[...htx.evidence,...gate.evidence],facts=consumeBlockResultContext({contract:k,now,evidence}).facts;
 c.metadata.internal_market_context.evidence_v2.evidence=evidence;c.metadata.internal_market_context.decision_ts=now;c.metadata.supporting_context={facts};c.direction='LONG';c.state='OBSERVE';c.trigger={metric:'price',operator:'>=',value:1,unit:'USDT',timeframe:'5m',expires_ts:now+600000,next_recheck_ts:now+60000,cancel_condition:'price<1'};c.analytical_fingerprint=canonicalFingerprint(c);
 const manual=formatManualReport(c);assert.equal(manual.ok,true);assert.match(manual.text,/Gate фьючерсы/);
 for(const policy of ['ORIGINAL_V5_20261006','ORIGINAL_BRIEF_20261007']){const telegram=renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE',context_policy:policy});assert.equal(telegram.ok,true);assert.match(telegram.text,/Gate фьючерсы/);const audit=auditRenderedBlockResults({canonical:c,manual,telegram});assert.ok(audit.used_context_block_ids.includes('N12'));assert.ok(audit.telegram_used_context_block_ids.includes('N12'));assert.ok(audit.context_receipts.some(row=>row.evidence_ids?.includes(gate.evidence[0].evidence_id)));assert.ok(audit.telegram_context_receipts.some(row=>row.evidence_ids?.includes(gate.evidence[0].evidence_id)));}
});
