import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {inspectArchivePriceCoverage as inspect} from './htx-delayed-price-history.mjs';
const DAY=86400000,start=Date.UTC(2026,0,1),clock=start+100*DAY,hash=b=>createHash('sha256').update(b).digest('hex');
function day(index,{omit=-1,close=index+1.5}={}){
 const from=start+index*DAY,source_ts=clock-index*1000,rows=Array.from({length:1440},(_,i)=>({contract:'NEAR-USDT',open_ts:from+i*60000,close_ts:from+i*60000+59999,open:index+1,high:index+2,low:index+0.5,close,closed:true,source_ts,source:'HTX_NATIVE_KLINE_ARCHIVE_AND_EXACT_NATIVE_BAR',history_role:'HISTORICAL_PRICE_ONLY',live_quote_eligible:false})).filter((_,i)=>i!==omit),payload=gzipSync(JSON.stringify(rows));
 return {manifest:{schema:'HTX_NATIVE_KLINE_PRICE_QUALIFICATION_V1',status:'CLOSED_PRICE_HISTORY',contract:'NEAR-USDT',entry_authorized:false,live_quote_eligible:false,decision_replay_eligible:false,source_ts,available_at:clock,qualified_at:clock+1000,event_interval:[from,from+DAY],qualified_price_payload_sha256:hash(payload),archive_sha256:hash(Buffer.from(`archive-${index}-${close}`))},payload};
}
const args=(archives,days=5)=>({archives,contract:'NEAR-USDT',start_ts:start,end_ts:start+days*DAY,as_of_ts:clock+1000});
test('verified islands survive while exact missing days remain explicit',()=>{
 const r=inspect(args([day(0),day(2),day(3)]));
 assert.equal(r.status,'PARTIAL_HISTORICAL_PRICE_COVERAGE');assert.equal(r.minute_count,4320);assert.equal(r.coverage_ratio,0.6);
 assert.deepEqual(r.segments.map(x=>[x.start_ts,x.end_ts,x.minute_count]),[[start,start+DAY,1440],[start+2*DAY,start+4*DAY,2880]]);
 assert.deepEqual(r.gaps,[{start_ts:start+DAY,end_ts:start+2*DAY,reason:'ARCHIVE_DAY_NOT_RETAINED'},{start_ts:start+4*DAY,end_ts:start+5*DAY,reason:'ARCHIVE_DAY_NOT_RETAINED'}]);
 assert.equal(r.complete_30d_native,false);assert.equal(r.actual_ENTRY,false);assert.equal(r.source_ts,null);
});
test('exact duplicates collapse but conflicting same-day archives fail closed',()=>{
 const a=day(0),duplicate={manifest:{...a.manifest},payload:Buffer.from(a.payload)};
 const ok=inspect(args([a,duplicate],1));assert.equal(ok.status,'CLOSED_HISTORICAL_PRICE_COVERAGE');assert.equal(ok.archive_count,1);assert.equal(ok.deduplicated_archives,1);
 const bad=inspect(args([a,day(0,{close:9})],1));assert.equal(bad.status,'CENSORED_MISSING_HISTORY');assert.equal(bad.reason,'CONFLICTING_ARCHIVES_FOR_SAME_DAY');assert.deepEqual(bad.candles,[]);
});
test('invalid retained day becomes a factual gap without leaking its rows',()=>{
 const r=inspect(args([day(0),day(1,{omit:700}),day(2)],3));
 assert.equal(r.status,'PARTIAL_HISTORICAL_PRICE_COVERAGE');assert.equal(r.minute_count,2880);assert.equal(r.segments.length,2);
 assert.deepEqual(r.gaps,[{start_ts:start+DAY,end_ts:start+2*DAY,reason:'DISPUTED_OR_MISSING_MINUTE'}]);
 assert.equal(r.candles.some(x=>x.open_ts>=start+DAY&&x.open_ts<start+2*DAY),false);
});
test('full synthetic 30 and 90 day grids close only their exact requested scope',()=>{
 for(const days of [30,90]){const r=inspect(args(Array.from({length:days},(_,i)=>day(i)),days));assert.equal(r.status,'CLOSED_HISTORICAL_PRICE_COVERAGE');assert.equal(r.complete_30d_native,true);assert.equal(r.complete_90d_native,days===90);assert.equal(r.minute_count,days*1440);}
});
test('empty, future, oversized and foreign identity inputs remain censored',()=>{
 assert.equal(inspect(args([],30)).status,'CENSORED_MISSING_HISTORY');
 assert.equal(inspect({...args([],1),as_of_ts:start+DAY-1}).reason,'BOUNDED_EXACT_MATURE_PARTIAL_WINDOW_REQUIRED');
 assert.equal(inspect({...args([],1),archives:Array(183).fill(day(0))}).reason,'BOUNDED_EXACT_MATURE_PARTIAL_WINDOW_REQUIRED');
 const foreign=day(0);foreign.manifest.contract='BTC-USDT';assert.equal(inspect(args([foreign],1)).reason,'EXACT_SINGLE_ASSET_DAILY_ARCHIVE_SET_REQUIRED');
});
