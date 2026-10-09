import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {inspectArchivePriceSeries as inspect} from './htx-delayed-price-history.mjs';
const DAY=86400000,start=Date.UTC(2026,0,1),clock=start+92*DAY;
const hash=b=>createHash('sha256').update(b).digest('hex');
// Explicit synthetic source fixtures; never actual archived market evidence.
function day(index,{contract='NEAR-USDT',omit=-1}={}){
 const from=start+index*DAY,source_ts=clock-index*1000;
 const rows=Array.from({length:1440},(_,i)=>({contract,open_ts:from+i*60000,close_ts:from+i*60000+59999,open:index+1,high:index+2,low:index+0.5,close:index+1.5,closed:true,source_ts,source:'HTX_NATIVE_KLINE_ARCHIVE_AND_EXACT_NATIVE_BAR',history_role:'HISTORICAL_PRICE_ONLY',live_quote_eligible:false})).filter((_,i)=>i!==omit);
 const payload=gzipSync(JSON.stringify(rows));
 return {manifest:{schema:'HTX_NATIVE_KLINE_PRICE_QUALIFICATION_V1',status:'CLOSED_PRICE_HISTORY',contract,entry_authorized:false,live_quote_eligible:false,decision_replay_eligible:false,source_ts,available_at:clock,qualified_at:clock+1000,event_interval:[from,from+DAY],qualified_price_payload_sha256:hash(payload),archive_sha256:hash(Buffer.from(`synthetic:${index}:${contract}`))},payload};
}
const args=(archives,days=archives.length)=>({archives,contract:'NEAR-USDT',start_ts:start,end_ts:start+days*DAY,as_of_ts:clock+1000});
test('daily ordering and original clocks preserved across a boundary',()=>{
 const archives=[day(1),day(0)],r=inspect(args(archives));
 assert.equal(r.status,'CLOSED_HISTORICAL_PRICE_SERIES');assert.equal(r.minute_count,2880);
 assert.equal(r.candles[1439].close,1.5);assert.equal(r.candles[1440].open,2);
 assert.deepEqual(r.source_archives.map(x=>x.source_ts),[clock,clock-1000]);
 assert.equal(r.source_ts,null);assert.equal(r.entry_authorized,false);assert.equal(r.entry_samples_created,0);
});
test('synthetic 90-day complete minute grid is bounded and never an entry sample',()=>{
 const r=inspect(args(Array.from({length:90},(_,i)=>day(i))));
 assert.equal(r.status,'CLOSED_HISTORICAL_PRICE_SERIES');assert.equal(r.minute_count,129600);assert.equal(r.archive_count,90);
 assert.equal(r.all102_history_complete,false);assert.equal(r.actual_ENTRY,false);assert.equal(r.sourceHTTP,0);assert.equal(r.D1,0);
});
test('duplicate, overlapping, missing and insufficient days refuse without partial prices',()=>{
 const overlap=day(1);overlap.manifest.event_interval=[start+DAY-60000,start+2*DAY-60000];
 for(const input of [args([day(0),day(0)]),args([day(0),overlap]),args([day(0),day(2)],3),args([day(0)],30),{...args([day(1)]),end_ts:start+2*DAY}]){
  const r=inspect(input);assert.equal(r.status,'CENSORED_MISSING_HISTORY');assert.deepEqual(r.candles,[]);
 }
});
test('foreign identity, missing minute, stale availability and live role cannot enter series',()=>{
 const future=day(1);future.manifest.available_at=clock+2000;
 const live=day(1);live.manifest.live_quote_eligible=true;
 const corrupt=day(1);corrupt.payload=Buffer.from('tampered');
 for(const second of [day(1,{contract:'BTC-USDT'}),day(1,{omit:700}),future,live,corrupt]){
  const r=inspect(args([day(0),second]));assert.equal(r.status,'CENSORED_MISSING_HISTORY');assert.deepEqual(r.candles,[]);
 }
});
test('partial requested boundary uses complete exact minutes and refuses unrelated files',()=>{
 const r=inspect({...args([day(0),day(1)]),start_ts:start+DAY-60000,end_ts:start+DAY+60000});
 assert.equal(r.status,'CLOSED_HISTORICAL_PRICE_SERIES');assert.equal(r.minute_count,2);
 assert.equal(inspect({...args([day(0),day(1)]),end_ts:start+DAY}).reason,'UNRELATED_ARCHIVE_OUTSIDE_REQUESTED_WINDOW');
 assert.equal(inspect({...args([day(0)]),end_ts:start+91*DAY}).status,'CENSORED_MISSING_HISTORY');
});
