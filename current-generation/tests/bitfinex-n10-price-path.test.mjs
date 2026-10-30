import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
import {inspectBitfinexN10CachedPricePath,verifyBitfinexN10CachedPricePath} from '../files/src/bitfinex-n10-price-path.mjs';
import {normalizeBitfinexNativeFlow} from '../files/src/bitfinex-native-four-hour-flow.mjs';
import {deriveN10ReusedVenuePathEvidence} from '../files/src/htx-technical-structure.mjs';
const read=p=>fs.readFileSync(new URL('../../'+p,import.meta.url)),sha=b=>createHash('sha256').update(b).digest('hex');
const dir='checkpoints/n05-bitfinex-pilot-38138608166/',catalogDir='checkpoints/n05-bitfinex-pilot-38138499328/';
const summary=JSON.parse(read(dir+'batch-summary.json')),metadata=JSON.parse(read(catalogDir+'batch-summary.json'));
function original(name){const r=summary.sources.find(r=>r.name===name),body=gunzipSync(read(dir+r.file));assert.equal(sha(body),r.body_sha256);return{payload:JSON.parse(body),receipt:r};}
function fixture(){
 const catalog=JSON.parse(gunzipSync(read(catalogDir+'BITFINEX-CURRENT-CATALOG.json.gz'))),candles=original('BITFINEX-XMR-CANDLES1M'),trades=original('BITFINEX-XMR-TRADES10000'),end=summary.window_end_ts,observed=trades.receipt.received_ts;
 const identity={asset_kind:'NATIVE',chain:'monero',native_asset_id:'monero:mainnet',contract_or_mint:null},contract='XMR-USDT';
 const component=normalizeBitfinexNativeFlow({contract,identity,catalog,candles:candles.payload,trades:trades.payload,window_end_ts:end,observed_ts:observed});
 // CONTROLLED existing-cache envelope, exact historical provider bodies/clocks.
 const payload={version:'bitfinex-native-flow-collector-v1-20261011',observed_ts:observed,catalog,candles:candles.payload,trades:trades.payload,trade_receipt:{...trades.receipt,payload_sha256:sha(JSON.stringify(trades.payload))}};
 return{contract,component,cache:{observed_ts:observed,expires_ts:end+300000,payload},now:observed};
}
test('NEW exact XMR native USD price path is rejected by old N10 USDT venue consumer',()=>{
 const p=fixture(),result=inspectBitfinexN10CachedPricePath(p),path=result.price_path;assert(path,result.reason);
 assert.equal(path.native_candle_rows_in_four_hours,232);assert.equal(path.verified_flow_presence_minutes,240);
 assert.equal(path.raw_price_bars.length,15);assert.equal(path.active_minute_count,15);assert.equal(path.recent_trade_count,322);
 assert.equal(path.path_open,532.67);assert.equal(path.path_close,533.61);assert.equal(path.path_high,534.26);assert.equal(path.path_low,532.51);
 assert.equal(path.quote,'USD');assert.equal(path.first_known_ts,1791720977667);assert.equal(path.window_end,1791720960000);
 assert.equal(path.exact_price_usdt,null);assert.equal(path.htx_comparison,null);assert.equal(path.fx_conversion_proven,false);assert.equal(result.runtime_input_qualified,false);
 const old=deriveN10ReusedVenuePathEvidence({...p,venue:'BITFINEX',htx_window:{window_start_ts:path.window_start,window_end_ts:path.window_end}});assert.deepEqual(old,[]);
 assert(verifyBitfinexN10CachedPricePath(path,p));
 if(process.env.REPORT2_BITFINEX_N10_WITNESS_OUTPUT)fs.writeFileSync(process.env.REPORT2_BITFINEX_N10_WITNESS_OUTPUT,JSON.stringify({scope:'EXACT_HISTORICAL_XMR_NATIVE_USD_BODY_WITH_CONTROLLED_CACHE_ENVELOPE',historical_source_run:38138608166,current_coverage:false,native_cache_ACK:false,HTX_same_window_original:false,old_consumer_evidence_count:old.length,result},null,2)+'\n');
});
test('original first-known is retained on still-valid reuse; input unmodified',()=>{
 const p=fixture(),before=JSON.stringify(p),a=inspectBitfinexN10CachedPricePath(p).price_path,b=inspectBitfinexN10CachedPricePath({...p,now:p.now+1000}).price_path;assert.equal(JSON.stringify(p),before);assert.equal(b.first_known_ts,a.first_known_ts);assert.equal(b.expires_at,a.expires_at);assert.equal(b.observed_ts,p.now+1000);
});
for(const [name,change] of [
 ['foreign contract',p=>p.contract='BTC-USDT'],
 ['foreign identity',p=>p.component.identity.native_asset_id='algorand:mainnet'],
 ['wrong quote',p=>p.component.quote='USDT'],
 ['incomplete flow',p=>p.component.verified_minutes=239],
 ['descriptor amount tamper',p=>p.component.buy_quote++],
 ['future first-known',p=>p.now=p.cache.observed_ts-1],
 ['stale source',p=>p.now=p.cache.expires_ts+1],
 ['unknown cache observed',p=>p.cache.observed_ts=null],
 ['altered cache observed',p=>p.cache.observed_ts++],
 ['refreshed payload clock',p=>p.cache.payload.observed_ts++],
 ['extended expiry',p=>p.cache.expires_ts++],
 ['missing raw candles',p=>delete p.cache.payload.candles],
 ['missing raw executions',p=>delete p.cache.payload.trades],
 ['native candle duplicate',p=>p.cache.payload.candles.push([...p.cache.payload.candles.at(-1)])],
 ['native candle missing',p=>p.cache.payload.candles.pop()],
 ['native candle shifted',p=>p.cache.payload.candles.at(-1)[0]+=60000],
 ['native candle base volume tamper',p=>p.cache.payload.candles.at(-1)[5]++],
 ['OPEN tamper invisible to prior flow min/max reconciliation',p=>p.cache.payload.candles.at(-1)[1]+=.001],
 ['CLOSE tamper invisible to prior flow min/max reconciliation',p=>p.cache.payload.candles.at(-1)[2]+=.001],
 ['receipt for foreign market',p=>p.cache.payload.trade_receipt.url=p.cache.payload.trade_receipt.url.replace('XMRUSD','XMRUST')],
 ['receipt clock refreshed',p=>p.cache.payload.trade_receipt.received_ts++],
 ['receipt payload hash missing',p=>delete p.cache.payload.trade_receipt.payload_sha256],
 ['wrong native payload version',p=>p.cache.payload.version='other'],
 ['oversized payload',p=>p.cache.payload.padding='x'.repeat(900001)],
 ])test(name+' cannot produce a new USD price context',()=>{const p=fixture();change(p);assert.equal(inspectBitfinexN10CachedPricePath(p).price_path,null);});
test('missing native minute is not filled from a price carry or raw trade',()=>{
 const p=fixture(),start=p.component.window_end_ts-900000;p.cache.payload.candles=p.cache.payload.candles.filter(b=>b[0]!==start);p.cache.payload.trades=p.cache.payload.trades.filter(t=>Math.floor(t[1]/60000)*60000!==start);p.cache.payload.trade_receipt.payload_sha256=sha(JSON.stringify(p.cache.payload.trades));p.component=normalizeBitfinexNativeFlow({contract:p.contract,identity:p.component.identity,...p.cache.payload,window_end_ts:p.component.window_end_ts,observed_ts:p.cache.observed_ts});assert.equal(p.component.check_completed,true);assert.equal(inspectBitfinexN10CachedPricePath(p).reason,'FIFTEEN_CONSECUTIVE_NATIVE_CANDLES_REQUIRED');
});
for(const [name,change]of [['price',p=>p.path_close++],['quote',p=>p.quote='USDT'],['first-known',p=>p.first_known_ts++],['FX',p=>p.exact_price_usdt=p.path_close],['score',p=>p.score_contribution=1],['bars',p=>p.raw_price_bars[0].open++],['binding',p=>p.source_cache_binding.payload_sha256='f'.repeat(64)]])test('new consumer verification rejects altered '+name,()=>{const params=fixture(),path=inspectBitfinexN10CachedPricePath(params).price_path;change(path);assert.equal(verifyBitfinexN10CachedPricePath(path,params),false);});
