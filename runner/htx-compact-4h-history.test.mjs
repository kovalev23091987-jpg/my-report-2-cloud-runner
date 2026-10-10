import test from 'node:test';
import assert from 'node:assert/strict';
import {COMPACT_HTX_4H,exactCompactHtxUrl,planCompactHtx90d,qualifyCompactHtx90d} from './htx-compact-4h-history.mjs';
const anchor=COMPACT_HTX_4H.anchor_end_ts,step=COMPACT_HTX_4H.period_ms;
const universe={status:'CLOSED',assets:Array.from({length:101},(_,i)=>({asset_analysis_contract:'C'+String(i).padStart(3,'0')+'-USDT'})).concat([{asset_analysis_contract:'NEAR-USDT'}])};
const received=anchor+3600000;
const bars=()=>Array.from({length:540},(_,i)=>({id:(anchor-90*86400000+i*step)/1000,open:10,high:11,low:9,close:10.5,vol:100}));
const payload=(rows=bars(),opts={})=>JSON.stringify({status:'ok',ch:'market.NEAR-USDT.kline.4hour',ts:anchor+1000,data:rows,...opts});
test('real 102-contract universe plans one bounded NEAR pilot before the six-attempt phase',()=>{
 const p=planCompactHtx90d({universe,now_ts:received});
 assert.equal(p.status,'BOUNDED_COMPACT_ACQUISITION_PLAN');
 assert.equal(p.planned.length,1);assert.equal(p.planned_source_http,1);assert.equal(p.pilot_qualified,false);
 assert.equal(p.planned[0].contract,'NEAR-USDT');
 assert.equal(p.source_ledger,'HTX_DELAYED_KLINE_ARCHIVE_QUALIFICATION');
 assert.equal(p.source_daily_cap,6);assert.equal(p.same_source_as_daily_zip,true);
 assert.equal(p.planned[0].url,'https://api.hbdm.com/linear-swap-ex/market/history/kline?contract_code=NEAR-USDT&period=4hour&size=1200');
 assert.equal(p.actual_ENTRY,false);assert.equal(p.project_complete,false);
});
test('exact 540 native 4h closed candles qualify only historical coarse 90d prices',()=>{
 const r=qualifyCompactHtx90d({contract:'NEAR-USDT',raw:payload(),received_ts:received});
 assert.equal(r.status,'COMPLETE_90D_4H_PRICE_ONLY');
 assert.equal(r.candles.length,540);assert.equal(r.complete_30d_4h_price_only,true);
 assert.equal(r.gaps.length,0);assert.equal(r.native_1m_complete,false);
 assert.equal(r.live_quote_eligible,false);assert.equal(r.decision_replay_eligible,false);
 assert.equal(r.entry_authorized,false);assert.equal(r.actual_ENTRY,false);
 assert.equal(r.candles[0].open_ts,anchor-90*86400000);
 assert.equal(r.candles.at(-1).close_ts,anchor-1);
});
test('missing candle is explicitly censored, no complete 90d claim',()=>{
 const missing=bars();missing.splice(120,1);
 const r=qualifyCompactHtx90d({contract:'NEAR-USDT',raw:payload(missing),received_ts:received});
 assert.equal(r.status,'PARTIAL_90D_4H_PRICE_ONLY');assert.equal(r.missing_bars,1);
 assert.deepEqual(r.gaps,[{start_ts:anchor-90*86400000+120*step,end_ts:anchor-90*86400000+121*step}]);
 assert.equal(r.complete_90d_4h_price_only,false);
});
test('duplicate, wrong channel, future clock, invalid geometry, oversize and alien asset fail closed',()=>{
 const dup=bars();dup.push(dup[2]);
 const bad=bars();bad[10].high=8;
 for(const [raw,contract] of [
   [payload(dup),'NEAR-USDT'],[payload(bad),'NEAR-USDT'],
   [payload(bars(),{ch:'market.BTC-USDT.kline.4hour'}),'NEAR-USDT'],
   [payload(bars(),{ts:received+1}),'NEAR-USDT'],
   [payload(),'../NEAR-USDT'],['x'.repeat(1_500_001),'NEAR-USDT']
 ]){
   const r=qualifyCompactHtx90d({contract,raw,received_ts:received});
   assert.equal(r.status,'INVALID_HTX_4H_RESPONSE');assert.equal(r.complete_90d_4h_price_only,false);
   assert.equal(r.candles.length,0);
 }
 assert.equal(exactCompactHtxUrl('../NEAR-USDT'),null);
});
test('untrusted manifests and duplicate contracts never schedule HTTP',()=>{
 const invalid=planCompactHtx90d({universe,manifests:[{contract:'BTC-USDT'}],now_ts:received});
 assert.equal(invalid.planned.length,0);assert.equal(invalid.sourceHTTP,0);
 const dupe={...universe,assets:[...universe.assets.slice(0,101),universe.assets[0]]};
 assert.equal(planCompactHtx90d({universe:dupe,now_ts:received}).status,'DUPLICATE_ANALYSIS_CONTRACT');
});
test('existing completed assets are skipped, partials are retried only after 7d and max three attempts',()=>{
 const m={schema:COMPACT_HTX_4H.schema,contract:'NEAR-USDT',anchor_end_ts:anchor,attempted_ts:received,status:'COMPLETE_90D_4H_PRICE_ONLY',attempts_total:1};
 const p=planCompactHtx90d({universe,manifests:[m],now_ts:received});
 assert.equal(p.complete_90d_4h_price_only,1);assert.equal(p.planned.length,6);assert.equal(p.pilot_qualified,true);assert.ok(p.planned.every(x=>x.contract!=='NEAR-USDT'));
 const partial={...m,status:'PARTIAL_90D_4H_PRICE_ONLY'};
 assert.equal(planCompactHtx90d({universe,manifests:[partial],now_ts:received+8*86400000}).planned.length,1);
 assert.equal(planCompactHtx90d({universe,manifests:[partial],now_ts:received+8*86400000}).eligible_retry_assets,1);
 assert.equal(planCompactHtx90d({universe,manifests:[{...partial,attempts_total:3}],now_ts:received+8*86400000}).eligible_retry_assets,0);
 assert.equal(planCompactHtx90d({universe,manifests:[{...partial,attempts_total:3}],now_ts:received+8*86400000}).status,'PILOT_NEAR_NOT_VERIFIED_OR_COOLDOWN');
});
test('coarse bar price path cannot be interpreted as minute-grid or a retrospective ENTRY',()=>{
 const r=qualifyCompactHtx90d({contract:'NEAR-USDT',raw:payload(),received_ts:received});
 assert.equal(r.history_role,'HISTORICAL_COARSE_PRICE_ONLY');
 assert.equal(r.venue,'HTX_USDT_LINEAR_SWAP');
 assert.equal(r.volume_qualified,false);assert.equal(r.score_contribution,0);
 assert.equal(r.project_complete,false);
});
