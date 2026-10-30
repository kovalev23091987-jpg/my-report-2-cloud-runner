import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {inspectKrakenN10CachedPricePath,prepareKrakenN10RuntimeInput,verifyKrakenN10CachedPricePath,KRAKEN_N10_OWNER_NO_EXTERNAL_SPOT} from '../files/src/kraken-n10-price-path.mjs';
import {normalizeKrakenNativeFlow} from '../files/src/kraken-four-hour-flow.mjs';
import {KRAKEN_PUBLIC_TAKER_REFERENCE} from '../files/src/kraken-public-taker-reference.mjs';
const folder=new URL('../../checkpoints/n05-kraken-algo-xmr-38135993119/',import.meta.url);
const read=n=>JSON.parse(readFileSync(new URL(n,folder))),raw=n=>JSON.parse(gunzipSync(readFileSync(new URL(n,folder))));
const summary=read('batch-summary.json'),catalog=raw('KRAKEN-CURRENT-ASSET-PAIRS.json.gz');
const clone=v=>structuredClone(v);
function fixture(symbol='ALGO'){
 const component=clone(summary.windows.find(w=>w.symbol===symbol)),end=component.window_end_ts;
 // CONTROLLED cache row envelope of exact saved native responses. This is
 // neither a retained native cache ACK nor a current provider connection.
 const cache={observed_ts:component.observed_ts,expires_ts:end+300000,payload:{version:'kraken-native-flow-collector-v1-20261010',observed_ts:component.observed_ts,instrument:Object.values(catalog.result).find(r=>r.altname===symbol+'USDT'),candles:raw(`KRAKEN-${symbol}-NATIVE240.json.gz`),pages:[raw(`KRAKEN-${symbol}-HISTORY-1.json.gz`)]}};
 return{contract:component.contract,component,cache,now:component.observed_ts};
}
function controlledHtxSpot(x){
 const end=x.component.window_end_ts;
 const data=x.cache.payload.candles.result[x.cache.payload.instrument.altname].filter(r=>r[0]*1000>=end-900000&&r[0]*1000<end).map(r=>({id:r[0],open:Number(r[1]),high:Number(r[2]),low:Number(r[3]),close:Number(r[4]),vol:Number(r[6])}));
 // Explicit CONTROLLED HTX fields for guard tests. No native HTX original at
 // this same window is retained here, so cross-venue agreement remains unknown.
 return{market:'SPOT',contract:x.contract,received_ts:x.now,payload:{status:'ok',ch:`market.${x.contract.slice(0,-5).toLowerCase()}usdt.kline.1min`,ts:x.now,data}};
}
for(const [symbol,trades] of [['ALGO',2],['XMR',144]])test(`${symbol} new N10 price consumer uses actual 240 native closed bars and ${trades} last15 trades`,t=>{
 const x=fixture(symbol),out=inspectKrakenN10CachedPricePath(x),p=out.price_path;
 assert.equal(out.status,'CLOSED_WITHIN_KRAKEN_PRICE_PATH',out.reason);assert.equal(p.candle_count,15);assert.equal(p.native_grid_count,240);assert.equal(p.recent_trade_count,trades);assert.ok(p.active_minute_count>0);
 assert.equal(x.cache.payload.candles.result[x.cache.payload.instrument.altname].length,241);assert.equal(p.raw_price_bars.at(-1).closed_end,p.window_end-1);
 assert.equal(p.quote,'USDT');assert.equal(p.native_quote_volume_available,false);assert.equal(p.first_known_ts,x.component.observed_ts);assert.equal(p.source_ts,summary.window_end_ts);assert.equal(p.score_contribution,0);assert.equal(p.directional_strength,null);assert.equal(p.entry_authorized,false);assert.equal(out.runtime_input_qualified,false);
 assert.equal(p.comparison_status,'HTX_SAME_WINDOW_ORIGINAL_NOT_SUPPLIED');assert.equal(p.runtime_admission_proven,false);
 t.diagnostic('KRAKEN_PRICE_WITNESS '+JSON.stringify(Object.fromEntries(['contract','source_ts','first_known_ts','window_start','window_end','path_open','path_high','path_low','path_close','active_minute_count','recent_trade_count','source_cache_binding','runtime_admission_proven'].map(k=>[k,p[k]]))));
 assert.equal(verifyKrakenN10CachedPricePath(p,x),true);assert.equal(verifyKrakenN10CachedPricePath({...p,path_close:p.path_close*1.01},x),false);
 // Validate raw receipt provenance in the new consumer chain, not old probes.
 for(const receipt of summary.sources.filter(r=>r.name.startsWith(`KRAKEN-${symbol}-`))){const bytes=gunzipSync(readFileSync(new URL(receipt.file,folder)));assert.equal(createHash('sha256').update(bytes).digest('hex'),receipt.body_sha256);}
});
const mutations=[
 ['foreign contract',x=>x.contract='BTC-USDT'],
 ['foreign native identity',x=>x.component.identity.native_asset_id='bitcoin:mainnet'],
 ['wrong quote',x=>x.component.quote='USDC'],
 ['forged N05 quantity',x=>x.component.buy_quote+=1],
 ['forged recent tradecount',x=>x.component.recent_windows[0].trade_count+=1],
 ['forged proof bit',x=>x.component.native_vwap_verified=false],
 ['stale source window',x=>x.now=x.component.window_end_ts+300001],
 ['future cache receipt',x=>x.now=x.cache.observed_ts-1],
 ['refreshed cache clock',x=>x.cache.observed_ts+=1],
 ['raised cache expiry',x=>x.cache.expires_ts+=1],
 ['wrong collector version',x=>x.cache.payload.version='unqualified'],
 ['missing native minute',x=>x.cache.payload.candles.result.ALGOUSDT.splice(1,1)],
 ['duplicate native minute',x=>x.cache.payload.candles.result.ALGOUSDT[1]=clone(x.cache.payload.candles.result.ALGOUSDT[0])],
 ['foreign result instrument',x=>x.cache.payload.candles.result.BTCUSDT=[]],
 ['invalid native cursor',x=>x.cache.payload.pages[0].result.last='UNKNOWN'],
 ['empty raw history',x=>x.cache.payload.pages=[]],
 ['missing raw trade',x=>x.cache.payload.pages[0].result.ALGOUSDT.splice(0,1)],
 ['tampered raw tradeprice',x=>x.cache.payload.pages[0].result.ALGOUSDT[0][0]='0.01'],
 ['tampered native count',x=>{const r=x.cache.payload.candles.result.ALGOUSDT.find(r=>r[7]>0);r[7]++;}],
 ['tampered OHLC not used by flow normalizer',x=>{const r=x.cache.payload.candles.result.ALGOUSDT.find(r=>r[7]>0);r[2]=String(Number(r[2])+1);}]
];
for(const [label,mutate] of mutations)test(`Kraken N10 refuses ${label}`,()=>{const x=fixture();mutate(x);assert.equal(inspectKrakenN10CachedPricePath(x).price_path,null);});
test('native open minute and cursors never become an extra closed bar or source clock',()=>{
 const x=fixture(),row=x.cache.payload.candles.result.ALGOUSDT.at(-1);row[1]='99';row[2]='99';row[3]='99';row[4]='99';
 const path=inspectKrakenN10CachedPricePath(x).price_path;assert.ok(path);assert.ok(path.raw_price_bars.every(r=>r.ts<x.component.window_end_ts));assert.ok(path.path_high<1);assert.equal(path.source_ts,x.component.window_end_ts);
});
test('provider input requires current HTX spot evidence; old catalog or boolean never grants runtime use',()=>{
 const x=fixture();assert.equal(prepareKrakenN10RuntimeInput(x).status,'CURRENT_EXACT_HTX_SPOT_REPLY_REQUIRED');assert.equal(prepareKrakenN10RuntimeInput({...x,htx_spot_kline:{eligible:true,present:true}}).runtime_input_qualified,false);
 const y={...x,htx_spot_kline:controlledHtxSpot(x)},out=prepareKrakenN10RuntimeInput(y);assert.equal(out.runtime_input_qualified,true);assert.equal(out.price_path.runtime_admission_proven,false);assert.equal(out.price_path.comparison_status,'HTX_SAME_WINDOW_ORIGINAL_NOT_SUPPLIED');
 for(const change of [s=>s.contract='XMR-USDT',s=>s.payload.ts=x.now+1,s=>s.payload.ch='market.xmrusdt.kline.1min',s=>s.payload.data.splice(0,1),s=>s.payload.data.forEach(r=>r.vol=0)]){const s=clone(y.htx_spot_kline);change(s);assert.equal(prepareKrakenN10RuntimeInput({...y,htx_spot_kline:s}).runtime_input_qualified,false);}
});
test('N15 archive cohort does not grant runtime admission; historical ALGO/XMR membership is not freshness',()=>{
 assert.equal(KRAKEN_N10_OWNER_NO_EXTERNAL_SPOT.length,15);assert.equal(new Set(KRAKEN_N10_OWNER_NO_EXTERNAL_SPOT).size,15);
 for(const contract of KRAKEN_N10_OWNER_NO_EXTERNAL_SPOT)assert.equal(prepareKrakenN10RuntimeInput({contract}).runtime_input_qualified,false);
 const policy=JSON.parse(readFileSync(new URL('../../checkpoints/N15_FREE_HOURLY_HISTORY_DEPLOYMENT_20261012.json',import.meta.url)));
 assert.deepEqual([...KRAKEN_N10_OWNER_NO_EXTERNAL_SPOT],policy.source_checks.htx_spot_missing.map(s=>s+'-USDT'));
 const saved=JSON.parse(readFileSync(new URL('../../checkpoints/n15-spot-coverage-20261012/ALL104-SPOT-BULK-RECEIPT.json',import.meta.url)));
 for(const asset of ['ALGO','XMR']){assert.equal(saved.rows.find(r=>r.asset===asset).htx.present,true);assert.equal(KRAKEN_N10_OWNER_NO_EXTERNAL_SPOT.includes(asset+'-USDT'),false);const x=fixture(asset);assert.equal(prepareKrakenN10RuntimeInput({...x,htx_spot_kline:{payload:saved}}).runtime_input_qualified,false);}
});
test('inspection never opens provider HTTP or SQL and does not mutate original cache',()=>{
 const x=fixture(),before=JSON.stringify(x);const out=inspectKrakenN10CachedPricePath(x);assert.ok(out.price_path);assert.equal(out.provider_http,0);assert.equal(out.cache_reads,0);assert.equal(JSON.stringify(x),before);
});

test('a fully reconciled but inactive recent window cannot supply a N10 price path',()=>{
 const x=fixture(),p=x.cache.payload,end=x.component.window_end_ts,start=end-900000,key=p.instrument.altname;
 p.pages[0].result[key]=p.pages[0].result[key].filter(r=>r[2]*1000<start||r[2]*1000>=end);
 let previous;
 for(const r of p.candles.result[key]){if(r[0]*1000>=start&&r[0]*1000<end){r[1]=previous;r[2]=previous;r[3]=previous;r[4]=previous;r[5]='0';r[6]='0';r[7]=0;}previous=r[4];}
 x.component=normalizeKrakenNativeFlow({contract:x.contract,identity:x.component.identity,instrument:p.instrument,candles:p.candles,pages:p.pages,window_end_ts:end,observed_ts:x.now,direction_reference:KRAKEN_PUBLIC_TAKER_REFERENCE});
 assert.equal(x.component.check_completed,true);assert.equal(x.component.recent_windows[0].trade_count,0);
 assert.equal(inspectKrakenN10CachedPricePath(x).reason,'NO_RECONCILED_RECENT_PRICE_ACTIVITY');
});
