import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeHtxLargeTrades,collectHtxLargeTradesEvidence} from '../files/src/htx-large-trades-evidence.mjs';
import {normalizeHtxSpotTradeSample,reconcileN12HtxMarkets} from '../files/src/n12-market-trades.mjs';
import {consumeEvidenceV2} from '../files/src/evidence-v2.mjs';
import {jointSpotFuturesFlow} from '../files/src/joint-spot-futures-flow.mjs';
import {consumeBlockResultContext} from '../files/src/block-result-context.mjs';
import {BITGET_FLOW_VERSION} from '../files/src/bitget-four-hour-flow.mjs';
import fs from 'node:fs';
import {canonicalFingerprint,renderCanonicalTelegram} from '../files/src/canonical-publication.mjs';
import {formatManualReport} from '../files/src/manual-report-formatter.mjs';
import {auditRenderedBlockResults} from '../files/src/block-result-context.mjs';

const now=Date.parse('2026-10-11T19:00:00Z'),contract='SOL-USDT';
const future=(side='buy',tradeId='101')=>({status:'ok',ch:'market.SOL-USDT.trade.detail',ts:now-1000,data:[{data:[{id:tradeId,price:100,amount:1,quantity:1,trade_turnover:100,ts:now-2000,direction:side}]}]});
const spot=(side='buy',tradeId='201')=>({status:'ok',ch:'market.solusdt.trade.detail',ts:now-1000,data:[{data:[{'trade-id':tradeId,price:100,amount:1,ts:now-2000,direction:side}]}]});

test('same-run futures and spot agree with one HTX vote and zero extra HTTP',async()=>{
 const r=await collectHtxLargeTradesEvidence({contract,now,same_run_htx_trades:{futures:{contract,payload:future()},spot:{contract,payload:spot()}}});
 assert.equal(r.network_calls,0);assert.equal(r.check_completed,true);assert.equal(r.summary.independent_venue_count,1);
 assert.equal(r.evidence.filter(e=>e.directional_strength!==null).length,1);
 assert.equal(r.evidence.find(e=>e.metric_family==='ACTUAL_TAKER_TRADES_BOUNDED_MULTI_MARKET').coverage_status,'BOUNDED_MULTIMARKET_AGREEMENT');
});
test('opposite HTX markets stay separate and do not create a common directional score',()=>{
 const r=reconcileN12HtxMarkets({contract,futures:normalizeHtxLargeTrades(future(),{contract,observed_ts:now}),spot_payload:spot('sell'),observed_ts:now});
 const joint=r.evidence.find(e=>e.metric_family==='ACTUAL_TAKER_TRADES_BOUNDED_MULTI_MARKET');
 assert.equal(joint.coverage_fraction,0);assert.equal(joint.directional_strength,null);assert.equal(consumeEvidenceV2(r.evidence,{base_interest:70,decision_ts:now}).adjustment,0);
});
test('spot-only is labeled as one market and not independent venue agreement',()=>{
 const r=reconcileN12HtxMarkets({contract,futures:{status:'FUTURES_RESPONSE_UNAVAILABLE',evidence:[]},spot_payload:spot(),observed_ts:now});
 assert.equal(r.status,'CLOSED_BOUNDED_PARTIAL_MARKET');assert.equal(r.summary.independent_venue_count,1);assert.equal(r.evidence[0].market,'SPOT');
});
test('stale, foreign-channel and duplicate spot records are not useful evidence',()=>{
 for(const p of [{...spot(),ch:'market.btcusdt.trade.detail'},{...spot(),ts:now-61000},{...spot(),data:[{data:[spot().data[0].data[0],spot().data[0].data[0]]}]}])assert.equal(normalizeHtxSpotTradeSample(p,{contract,observed_ts:now}).evidence.length,0);
});
test('N12 context connects same-run HTX markets with validated independent four-hour venue without mixing windows',()=>{
 const end=now,start=end-14400000;
 const joint=jointSpotFuturesFlow({now,primary:{check_completed:true,evidence:[{block_id:'N05',metric_family:'EXACT_FUTURES_TAKER_FLOW_4H',provider_id:'HTX_FUTURES_RAW_FLOW',upstream_id:'HTX_OFFICIAL_RAW_FILLS',source_clock_policy:'IMMUTABLE_EXACT_RAW_MINUTES',score_contribution:0,entry_authorized:false,factual_1m_trade_count:240,raw_trade_count:240,window_start_ts:start,window_end_ts:end,buy_quote_turnover_usdt:60,sell_quote_turnover_usdt:40,htx_contract:contract,asset_id:'HTX:USDT_M_PERPETUAL:'+contract}]},external:{components:[{version:BITGET_FLOW_VERSION,status:'CLOSED_VOLUME_RECONCILED_FOUR_HOURS',check_completed:true,exact_asset_binding:true,contract,window_start_ts:start,window_end_ts:end,observed_ts:now,verified_minutes:240,venue:'BITGET',physical_root:'BITGET_OFFICIAL_PUBLIC_TRADES',market:'SPOT',quote:'USDT',buy_quote:62,sell_quote:38}]}});
 assert.equal(joint.check_completed,true);
 const recent=reconcileN12HtxMarkets({contract,futures:normalizeHtxLargeTrades(future(),{contract,observed_ts:now}),spot_payload:spot(),observed_ts:now});
 const facts=consumeBlockResultContext({contract,now,evidence:[...joint.evidence,...recent.evidence]}).facts,n12=facts.find(f=>f.block_id==='N12');
 assert.ok(n12);assert.match(n12.value,/BITGET/);assert.match(n12.value,/окно 4 часа/);assert.match(n12.value,/последние сделки не складывались/);assert.equal(n12.evidence_ids.length,2);
 assert.match(n12.value,/направления двух разновременных выборок в целом совпадают/);
});
test('opposite recent and four-hour directions cannot become one market conclusion',()=>{
 const end=now,start=end-14400000;
 const joint=jointSpotFuturesFlow({now,primary:{check_completed:true,evidence:[{block_id:'N05',metric_family:'EXACT_FUTURES_TAKER_FLOW_4H',provider_id:'HTX_FUTURES_RAW_FLOW',upstream_id:'HTX_OFFICIAL_RAW_FILLS',source_clock_policy:'IMMUTABLE_EXACT_RAW_MINUTES',score_contribution:0,entry_authorized:false,factual_1m_trade_count:240,raw_trade_count:240,window_start_ts:start,window_end_ts:end,buy_quote_turnover_usdt:40,sell_quote_turnover_usdt:60,htx_contract:contract,asset_id:'HTX:USDT_M_PERPETUAL:'+contract}]},external:{components:[{version:BITGET_FLOW_VERSION,status:'CLOSED_VOLUME_RECONCILED_FOUR_HOURS',check_completed:true,exact_asset_binding:true,contract,window_start_ts:start,window_end_ts:end,observed_ts:now,verified_minutes:240,venue:'BITGET',physical_root:'BITGET_OFFICIAL_PUBLIC_TRADES',market:'SPOT',quote:'USDT',buy_quote:38,sell_quote:62}]}});
 assert.equal(joint.check_completed,true);
 const recent=reconcileN12HtxMarkets({contract,futures:normalizeHtxLargeTrades(future(),{contract,observed_ts:now}),spot_payload:spot(),observed_ts:now});
 const n12=consumeBlockResultContext({contract,now,evidence:[...joint.evidence,...recent.evidence]}).facts.find(f=>f.block_id==='N12');
 assert.match(n12.value,/направления двух разновременных выборок расходятся; общего направленного вывода нет/);
});
test('the joint N12 fact reaches manual and Telegram output with source receipts',()=>{
 const c=structuredClone(JSON.parse(fs.readFileSync(new URL('../../checkpoints/btw-preserved-block-result-input-20261004.json',import.meta.url))).canonical),T=c.observed_ts,E=Math.floor(T/60000)*60000,S=E-14400000,k=c.metadata.contract,symbol=k.slice(0,-5).toLowerCase()+'usdt';
 const h={status:'ok',ch:`market.${k}.trade.detail`,ts:T-1000,data:[{data:[{id:'101',price:1,amount:1,quantity:1,trade_turnover:1,ts:T-2000,direction:'buy'}]}]},p={status:'ok',ch:`market.${symbol}.trade.detail`,ts:T-1000,data:[{data:[{'trade-id':'201',price:1,amount:1,ts:T-2000,direction:'buy'}]}]};
 const recent=reconcileN12HtxMarkets({contract:k,futures:normalizeHtxLargeTrades(h,{contract:k,observed_ts:T}),spot_payload:p,observed_ts:T});
 const joint=jointSpotFuturesFlow({now:T,primary:{check_completed:true,evidence:[{block_id:'N05',metric_family:'EXACT_FUTURES_TAKER_FLOW_4H',provider_id:'HTX_FUTURES_RAW_FLOW',upstream_id:'HTX_OFFICIAL_RAW_FILLS',source_clock_policy:'IMMUTABLE_EXACT_RAW_MINUTES',score_contribution:0,entry_authorized:false,factual_1m_trade_count:240,raw_trade_count:240,window_start_ts:S,window_end_ts:E,buy_quote_turnover_usdt:60,sell_quote_turnover_usdt:40,htx_contract:k,asset_id:'HTX:USDT_M_PERPETUAL:'+k}]},external:{components:[{version:BITGET_FLOW_VERSION,status:'CLOSED_VOLUME_RECONCILED_FOUR_HOURS',check_completed:true,exact_asset_binding:true,contract:k,window_start_ts:S,window_end_ts:E,observed_ts:T,verified_minutes:240,venue:'BITGET',physical_root:'BITGET_OFFICIAL_PUBLIC_TRADES',market:'SPOT',quote:'USDT',buy_quote:62,sell_quote:38}]}});
 assert.equal(joint.check_completed,true);
 const evidence=[...joint.evidence,...recent.evidence],facts=consumeBlockResultContext({contract:k,now:T,evidence}).facts;
 c.metadata.internal_market_context.evidence_v2.evidence=evidence;c.metadata.supporting_context={facts};c.direction='LONG';c.state='OBSERVE';c.trigger={metric:'price',operator:'>=',value:1,unit:'USDT',timeframe:'5m',expires_ts:T+600000,next_recheck_ts:T+60000,cancel_condition:'price<1'};c.analytical_fingerprint=canonicalFingerprint(c);
 const manual=formatManualReport(c);assert.equal(manual.ok,true);assert.match(manual.text,/Направление последних сделок HTX/);assert.match(manual.text,/BITGET/);
 for(const policy of ['ORIGINAL_V5_20261006','ORIGINAL_BRIEF_20261007']){const telegram=renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE',context_policy:policy});assert.equal(telegram.ok,true);const audit=auditRenderedBlockResults({canonical:c,manual,telegram});assert.ok(audit.used_context_block_ids.includes('N12'));assert.ok(audit.telegram_used_context_block_ids.includes('N12'));assert.ok(audit.telegram_used_context_block_ids.includes('N05'));}
});
