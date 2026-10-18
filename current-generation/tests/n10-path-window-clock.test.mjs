import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const moduleURL=name=>process.env.REPORT2_TEST_RUNTIME?pathToFileURL(`${process.env.REPORT2_TEST_RUNTIME}/src/${name}`):new URL(`../files/src/${name}`,import.meta.url);
const {deriveHtxRecentPathEvidence,deriveHtxSpotSameRunPathEvidence,verifyHtxSpotSameRunPathEvidence,deriveN10ReusedVenuePathEvidence,verifyN10ReusedVenuePathEvidence}=await import(moduleURL('htx-technical-structure.mjs'));
const {consumeBlockResultContext}=await import(moduleURL('block-result-context.mjs'));
import {activeSourceSamples,sampleParams} from './n10-full-cache-inputs.mjs';
const samples=activeSourceSamples.filter(s=>s.venue!=='GATE').map(s=>{const p=sampleParams(s);return{...s,htx_window:p.htx_window,now:p.now,cache_observed_ts:p.cache.observed_ts,cache_expires_ts:p.cache.expires_ts};});
// Full original caches for BTC/AAVE; Bitget uses an explicit controlled
// retained-page event clock. No padded225bar cache is treated as complete.
const fixture=sample=>sampleParams(sample);
const flatBase=(quote,price)=>{const parse=v=>{const[a,b='']=String(v).split('.');return{n:BigInt(a+b),scale:b.length};},q=parse(quote),p=parse(price),unit=10n**18n,n=q.n*10n**BigInt(18+p.scale-q.scale)/p.n,part=String(n%unit).padStart(18,'0').replace(/0+$/,'');return String(n/unit)+(part?'.'+part:'');};
for(const sample of samples)for(const flat of ['HTX','VENUE','BOTH'])test(`${sample.venue} ${sample.contract}: controlled flat ${flat} path cannot establish a common direction`,()=>{
 const p=fixture(sample);
 if(flat!=='VENUE')p.htx_window.close=p.htx_window.open;
 if(flat!=='HTX'){
  const bars=p.venue==='BITGET'?p.cache.payload.payloads.candles.data:p.cache.payload.candles,price=p.htx_window.open;
  for(const row of [...bars].sort((a,b)=>Number(a[p.venue==='POLONIEX'?12:0])-Number(b[p.venue==='POLONIEX'?12:0])).slice(-15)){
   if(p.venue==='POLONIEX'){row[0]=row[1]=row[2]=row[3]=row[10]=String(price);row[5]=flatBase(row[4],price);row[7]=flatBase(row[6],price);}
   else row[1]=row[2]=row[3]=row[4]=String(price);
  }
 }
 const evidence=deriveN10ReusedVenuePathEvidence(p);assert.equal(evidence.length,1);const row=evidence[0];
 assert.equal(row.comparison_status,'DIRECTION_UNCONFIRMED');assert.equal(verifyN10ReusedVenuePathEvidence(row,{now:p.now}),true);
 const facts=consumeBlockResultContext({contract:p.contract,evidence,now:p.now}).facts;assert.equal(facts.length,1);assert.doesNotMatch(facts[0].value,/Направление совпало/);
 assert.equal(row.directional_strength,null);assert.equal(row.entry_authorized_by_context,false);assert.equal(row.coverage_fraction,0);
});

// Controlled HTX spot response extends the existing ARB fixture. The tests
// vary window descriptors; they are not new provider observations or coverage.
const end=1800000000000,now=end+42000,start=end-900000;
const bars=Array.from({length:15},(_,i)=>({id:(start+i*60000)/1000,open:100+i,high:101+i,low:99+i,close:100.5+i,count:2}));
const spot={market:'SPOT',contract:'ARB-USDT',received_ts:end+10000,payload:{status:'ok',ch:'market.arbusdt.kline.1min',ts:end+1000,data:bars}};
const window={label:'15m',window_start_ts:start,window_end_ts:end,candle_count:15,open:100,high:115,low:99,close:110};
const spotEvidence=htx_window=>deriveHtxSpotSameRunPathEvidence({contract:'ARB-USDT',spot_kline:spot,htx_window,now});
test('exact same 15m spot/futures interval keeps comparison and its complete original window descriptor',()=>{
 const evidence=spotEvidence(window);assert.equal(evidence.length,1);const row=evidence[0];assert.equal(row.comparison_status,'SAME_WINDOW_OVERLAPPING_RANGE_AND_DIRECTION');
 assert.equal(row.htx_futures_window.window_start_ts,start);assert.equal(row.htx_futures_window.candle_count,15);assert.equal(verifyHtxSpotSameRunPathEvidence(row,{now}),true);
});
for(const [name,mutate] of Object.entries({
 '60m interval with matching end':w=>({...w,label:'1h',window_start_ts:end-3600000,candle_count:60}),
 '15m label with 60m boundaries':w=>({...w,window_start_ts:end-3600000}),
 'wrong candle count':w=>({...w,candle_count:14}),
 'missing start':w=>{delete w.window_start_ts;return w;},
 'missing candle count':w=>{delete w.candle_count;return w;},
 'wrong window label':w=>({...w,label:'4h'}),
}))test(`HTX ${name} retains useful spot-only information without a fabricated cross-market comparison`,()=>{
 const evidence=spotEvidence(mutate(structuredClone(window)));assert.equal(evidence.length,1);assert.equal(evidence[0].comparison_status,'SPOT_ONLY');assert.equal(evidence[0].htx_futures_window,null);
 assert.equal(evidence[0].source_ts,end);assert.equal(evidence[0].first_known_ts,spot.received_ts);assert.equal(verifyHtxSpotSameRunPathEvidence(evidence[0],{now}),true);
 const facts=consumeBlockResultContext({contract:'ARB-USDT',evidence,now}).facts;assert.equal(facts.length,1);assert.match(facts[0].value,/только спотовый путь/);
});
test('reconstruction rejects a changed futures interval even when all OHLC and the final timestamp match',()=>{
 const row=spotEvidence(window)[0],changed=structuredClone(row);changed.htx_futures_window.window_start_ts=end-3600000;
 assert.equal(verifyHtxSpotSameRunPathEvidence(changed,{now}),false);
});
for(const [name,change] of Object.entries({
 'future observation clock':r=>r.observed_ts=now+1,
 'knowledge before the original response was received':r=>r.first_known_ts=r.spot_received_ts-1,
 'foreign spot asset id':r=>r.asset_id='htx-spot:BTC-USDT',
}))test(`HTX spot verification rejects ${name} without rewriting retained candle clocks`,()=>{
 const row=structuredClone(spotEvidence(window)[0]);change(row);assert.equal(verifyHtxSpotSameRunPathEvidence(row,{now}),false);
});

// The retained HTX fifteen-minute OHLC window is unchanged. Response/cutoff
// variations below are explicit controls, never refreshed original facts.
const saved=samples[0],recent=p=>deriveHtxRecentPathEvidence({contract:saved.contract,window:saved.htx_window,source_ts:saved.htx_window.window_end_ts+1000,observed_ts:saved.htx_window.window_end_ts+10000,...p});
test('recent HTX path expiry is bounded by the original candle window as well as the response clock',()=>{
 const evidence=recent({});assert.equal(evidence.length,1);assert.equal(evidence[0].expires_at,saved.htx_window.window_end_ts+180000);
 assert.deepEqual(consumeBlockResultContext({contract:saved.contract,evidence,now:saved.htx_window.window_end_ts+180001}).facts,[]);
});
test('a recent provider response cannot renew a candle window older than its existing three-minute freshness',()=>{
 const w=structuredClone(saved.htx_window);w.window_end_ts-=600000;w.window_start_ts-=600000;
 assert.deepEqual(recent({window:w}),[]);
});
test('the candle-window boundary is checked independently from a slightly newer source response',()=>{
 const cutoff=saved.htx_window.window_end_ts+180001;assert.deepEqual(recent({observed_ts:cutoff}),[]);
});
test('a changed declared expiry cannot extend an original recent candle path in the report consumer',()=>{
 const evidence=recent({});evidence[0].expires_at+=60000;
 assert.deepEqual(consumeBlockResultContext({contract:saved.contract,evidence,now:saved.htx_window.window_end_ts+180001}).facts,[]);
});
test('flat independent path is described as unconfirmed direction rather than disjoint prices',()=>{
 const p=fixture(samples[0]);p.htx_window.close=p.htx_window.open;
 const evidence=deriveN10ReusedVenuePathEvidence(p),facts=consumeBlockResultContext({contract:p.contract,evidence,now:p.now}).facts;
 assert.equal(facts.length,1);assert.match(facts[0].value,/не изменилась.*направление не подтверждено/);assert.doesNotMatch(facts[0].value,/диапазоны не пересекаются/);
});
