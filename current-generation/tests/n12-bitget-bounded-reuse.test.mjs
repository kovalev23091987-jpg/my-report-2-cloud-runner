import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {exactBitgetBinding} from '../files/src/bitget-four-hour-flow.mjs';
import {normalizeBitgetN12BoundedTradeSample,validateBitgetN12BoundedTradeSample} from '../files/src/bitget-n12-bounded-trade-sample.mjs';
import {normalizeHtxLargeTrades} from '../files/src/htx-large-trades-evidence.mjs';
import {reconcileN12HtxMarkets} from '../files/src/n12-market-trades.mjs';
import {consumeBlockResultContext,auditRenderedBlockResults} from '../files/src/block-result-context.mjs';
import {canonicalFingerprint,renderCanonicalTelegram} from '../files/src/canonical-publication.mjs';
import {formatManualReport} from '../files/src/manual-report-formatter.mjs';

const original=name=>JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('../../checkpoints/n05-actual-qualification-38049404414/'+name+'.json.gz',import.meta.url))));
const coins=original('identity-BITGET'),spotCatalog=original('catalog-BITGET-SPOT'),futureCatalog=original('catalog-BITGET-FUTURES');
const btc={asset_kind:'NATIVE',chain:'bitcoin',native_asset_id:'bitcoin:mainnet'};
const sample=(contract,market,page,identity)=>{const newest=Math.max(...page.data.map(r=>Number(r.ts))),end=(Math.floor(newest/60000)+1)*60000;return normalizeBitgetN12BoundedTradeSample({contract,market,identity,identity_method:'HTX_OFFICIAL_NATIVE_CURRENCY_NETWORK',exact_asset_binding:true,pages:[page],window_end_ts:end,observed_ts:end+1000});};

test('retained original Bitget fills have useful bounded market facts after exact native binding, with no full-window or score claim',()=>{
 for(const market of ['SPOT','FUTURES'])assert.equal(exactBitgetBinding({contract:'BTC-USDT',identity:btc,coins,instrument:(market==='SPOT'?spotCatalog:futureCatalog).data.find(r=>r.symbol==='BTCUSDT'),market}),true);
 const futures=sample('BTC-USDT','FUTURES',original('flow-BITGET-FUTURES-BTC'),btc);
 assert.equal(futures.status,'CLOSED_BOUNDED_SAMPLE');
 assert.equal(futures.summary.returned_rows,1000);
 assert.equal(futures.summary.valid_recent_rows,334);
 assert.ok(futures.summary.buy_quote_turnover_usdt>0&&futures.summary.sell_quote_turnover_usdt>0);
 assert.equal(futures.summary.whole_window_coverage_proven,false);
 assert.equal(futures.evidence[0].directional_strength,null);
 assert.equal(futures.evidence[0].score_contribution,0);
 assert.equal(validateBitgetN12BoundedTradeSample(futures.evidence[0],futures.evidence[0].observed_ts),true);
 const trx={asset_kind:'NATIVE',chain:'tron',native_asset_id:'tron:mainnet'};
 assert.equal(exactBitgetBinding({contract:'TRX-USDT',identity:trx,coins,instrument:spotCatalog.data.find(r=>r.symbol==='TRXUSDT'),market:'SPOT'}),true);
 const spot=sample('TRX-USDT','SPOT',original('flow-BITGET-SPOT-TRX'),trx);
 assert.equal(spot.summary.valid_recent_rows,29);
 assert.equal(validateBitgetN12BoundedTradeSample(spot.evidence[0],spot.evidence[0].observed_ts),true);
});

test('foreign, duplicate, expired or unbound Bitget rows cannot be promoted',()=>{
 const page=original('flow-BITGET-FUTURES-BTC'),valid=sample('BTC-USDT','FUTURES',page,btc).evidence[0];
 assert.equal(validateBitgetN12BoundedTradeSample(valid,valid.expires_at),false);
 const newest=Math.max(...page.data.map(r=>Number(r.ts))),end=(Math.floor(newest/60000)+1)*60000,base={contract:'BTC-USDT',market:'FUTURES',identity:btc,identity_method:'HTX_OFFICIAL_NATIVE_CURRENCY_NETWORK',exact_asset_binding:true,window_end_ts:end,observed_ts:end+1000};
 for(const patch of [{exact_asset_binding:false},{identity_method:'TICKER_ONLY'},{pages:[{...page,data:[{...page.data[0],symbol:'OTHERUSDT'}]}]},{pages:[{...page,data:[page.data[0],page.data[0]]}]}])assert.equal(normalizeBitgetN12BoundedTradeSample({...base,pages:[page],...patch}).evidence.length,0);
});

test('controlled same-run Bitget spot and futures join HTX as bounded facts in manual and approved Telegram',()=>{
 const c=structuredClone(JSON.parse(fs.readFileSync(new URL('../../checkpoints/btw-preserved-block-result-input-20261004.json',import.meta.url))).canonical),now=c.observed_ts,k=c.metadata.contract,base=k.slice(0,-5),end=Math.floor(now/60000)*60000,identity={asset_kind:'TOKEN',chain:'ethereum',contract_or_mint:'0x'+'a'.repeat(40)};
 const bitget=['SPOT','FUTURES'].map((market,i)=>normalizeBitgetN12BoundedTradeSample({contract:k,market,identity,identity_method:'HTX_OFFICIAL_CURRENCY_CHAIN_ADDRESS',exact_asset_binding:true,window_end_ts:end,observed_ts:now,pages:[{code:'00000',data:[{tradeId:String(100+i),symbol:base+'USDT',price:'1',size:'10',side:i?'sell':'buy',ts:String(end-1000-i*1000)}]}]}).evidence[0]);
 assert.equal(bitget.filter(Boolean).length,2);
 const future={status:'ok',ch:`market.${k}.trade.detail`,ts:now-1000,data:[{data:[{id:'301',price:1,amount:1,quantity:1,trade_turnover:1,ts:now-2000,direction:'buy'}]}]},spot={status:'ok',ch:`market.${base.toLowerCase()}usdt.trade.detail`,ts:now-1000,data:[{data:[{'trade-id':'401',price:1,amount:1,ts:now-2000,direction:'buy'}]}]};
 const htx=reconcileN12HtxMarkets({contract:k,futures:normalizeHtxLargeTrades(future,{contract:k,observed_ts:now}),spot_payload:spot,observed_ts:now}),evidence=[...htx.evidence,...bitget],facts=consumeBlockResultContext({contract:k,now,evidence}).facts,joined=facts.find(f=>f.label==='Направление последних сделок HTX');
 assert.ok(joined);assert.equal(joined.evidence_ids.length,3);assert.match(joined.value,/Bitget спот/);assert.match(joined.value,/Bitget фьючерсы/);assert.match(joined.value,/общего направления по всем доступным неполным выборкам нет/);
 assert.equal(facts.filter(f=>f.label==='Направление последних сделок Bitget').length,0);
 c.metadata.internal_market_context.evidence_v2.evidence=evidence;c.metadata.internal_market_context.decision_ts=now;c.metadata.supporting_context={facts};c.direction='LONG';c.state='OBSERVE';c.trigger={metric:'price',operator:'>=',value:1,unit:'USDT',timeframe:'5m',expires_ts:now+600000,next_recheck_ts:now+60000,cancel_condition:'price<1'};c.analytical_fingerprint=canonicalFingerprint(c);
 const manual=formatManualReport(c);assert.equal(manual.ok,true);assert.match(manual.text,/Bitget спот/);
 for(const policy of ['ORIGINAL_V5_20261006','ORIGINAL_BRIEF_20261007']){const telegram=renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE',context_policy:policy});assert.equal(telegram.ok,true);assert.match(telegram.text,/Bitget спот/);assert.match(telegram.text,/Bitget фьючерсы/);const audit=auditRenderedBlockResults({canonical:c,manual,telegram});assert.ok(audit.used_context_block_ids.includes('N12'));assert.ok(audit.telegram_used_context_block_ids.includes('N12'));for(const row of bitget){assert.ok(audit.context_receipts.some(x=>x.evidence_ids?.includes(row.evidence_id)));assert.ok(audit.telegram_context_receipts.some(x=>x.evidence_ids?.includes(row.evidence_id)));}}
});
