import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {webcrypto} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {buildSpotRecord,archiveSpot,SPOT_SOURCES,FUTURES_QUOTE_URL} from './spot-archive.mjs';
import {readAlignedHourlyPair} from './history-read.mjs';

globalThis.crypto ||= webcrypto;
const HOUR=3_600_000,T=1_791_810_000_000-1_791_810_000_000%HOUR,now=T+28*60_000;
const htxPair=contract=>contract.slice(0,-5).toLowerCase()+'usdt';
const htxRows=SPOT_SOURCES.HTX.target_contracts.map(contract=>({symbol:htxPair(contract),close:1,bid:.999,ask:1.001,vol:100,count:100}));

class D1 {
  constructor(){this.db=new DatabaseSync(':memory:');this.db.exec(fs.readFileSync(new URL('./001_hourly_archive.sql',import.meta.url),'utf8'));this.bytes=16_384;}
  prepare(sql){const stmt=this.db.prepare(sql),params=[],self=this;return {bind(...values){params.push(...values);return this;},first(){return stmt.get(...params)??null;},all(){return {results:stmt.all(...params),meta:{size_after:self.bytes}};},run(){const r=stmt.run(...params);return {meta:{changes:Number(r.changes),size_after:self.bytes}};}};}
  close(){this.db.close();}
}

test('HTX spot bulk keeps 105 targets separate from 89 returned pairs and no individual trade clock',async()=>{
  const rows=htxRows.slice(0,89);
  const r=await buildSpotRecord({venue:'HTX',hour_bucket:T,body:{status:'ok',ts:now-1_000,data:rows},received_ts:now});
  assert.equal(r.target_count,105);
  assert.equal(r.present_count,89);
  assert.equal(r.quote_checked_count,89);
  const sample=JSON.parse(r.payload_json).samples[0];
  assert.equal(sample.market,'SPOT');
  assert.equal(sample.price_basis,'LAST_TICKER_NOT_CANDLE');
  assert.equal(sample.individual_trade_clock_verified,false);
  assert.ok(Buffer.byteLength(r.payload_json)<100_000);
});

test('external spot sources are absent from the active HTX-only archive',async()=>{
  assert.deepEqual(Object.keys(SPOT_SOURCES),['HTX']);
  await assert.rejects(buildSpotRecord({venue:'GATE',hour_bucket:T,body:[],received_ts:now}),/SPOT_ARCHIVE_ARGUMENTS_INVALID/);
  await assert.rejects(buildSpotRecord({venue:'KUCOIN',hour_bucket:T,body:{},received_ts:now}),/SPOT_ARCHIVE_ARGUMENTS_INVALID/);
});

test('one spot and one futures bulk request per hour produce an original-clocked pair',async()=>{
  const db=new D1();let calls=0;
  const futures={status:'ok',ts:now-2_000,ticks:SPOT_SOURCES.HTX.target_contracts.map(contract=>({contract_code:contract,business_type:'swap',ts:now-2_000,close:1.01,bid:[1.009,1],ask:[1.011,1]}))};
  const fetch_impl=async url=>{calls++;return new Response(JSON.stringify(url===FUTURES_QUOTE_URL?futures:{status:'ok',ts:now-1_000,data:htxRows}),{status:200});};
  try{
    const first=await archiveSpot({venue:'HTX',archive_db:db,scheduled_ts:now,clock:()=>now,fetch_impl});
    assert.equal(first.status,'ARCHIVED');
    assert.equal(first.present_count,105);
    assert.equal(first.paired_futures_count,105);
    assert.equal(first.source_http,2);
    const pair=await readAlignedHourlyPair({archive_db:db,contract:'STRK-USDT',from_hour:T,to_hour:T});
    assert.equal(pair.status,'CLOSED');assert.equal(pair.hours[0].status,'ALIGNED_PAIR');assert.equal(pair.hours[0].source_skew_ms,1000);
    assert.equal(pair.hours[0].spot.price,1);assert.equal(pair.hours[0].futures.price,1.01);
    assert.equal((await archiveSpot({venue:'HTX',archive_db:db,scheduled_ts:now,clock:()=>now,fetch_impl})).status,'ALREADY_ARCHIVED');
    assert.equal(calls,2);
    const failed=new D1();try{
      await assert.rejects(archiveSpot({venue:'HTX',archive_db:failed,scheduled_ts:now,clock:()=>now,fetch_impl:async()=>{calls++;throw Error('NETWORK');}}),/NETWORK/);
      assert.equal((await archiveSpot({venue:'HTX',archive_db:failed,scheduled_ts:now,clock:()=>now,fetch_impl})).status,'ALREADY_ATTEMPTED');
      assert.equal(calls,4);
    }finally{failed.close();}
  }finally{db.close();}
});

test('ten-minute old futures quote stays available separately and never becomes an aligned pair',async()=>{
  const db=new D1();
  const futures={status:'ok',ts:now-10*60_000,ticks:[{contract_code:'STRK-USDT',business_type:'swap',ts:now-10*60_000,close:1.01,bid:[1.009,1],ask:[1.011,1]}]};
  try{
    const r=await buildSpotRecord({venue:'HTX',hour_bucket:T,body:{status:'ok',ts:now-1_000,data:htxRows},received_ts:now,futures_body:futures,futures_received_ts:now});
    assert.notEqual(r.pair_status,'PAIRED_WITHIN_10M');
    db.prepare('INSERT INTO report2_hourly_spot_archive_v1 VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(r.hour_bucket,r.venue,r.source_url,r.source_ts,r.received_ts,r.identity_scope,r.target_count,r.present_count,r.quote_checked_count,r.payload_sha256,r.payload_json,now).run();
    const pair=await readAlignedHourlyPair({archive_db:db,contract:'STRK-USDT',from_hour:T,to_hour:T});
    assert.equal(pair.status,'PARTIAL');assert.equal(pair.hours[0].comparison_usable,false);
    assert.ok(pair.hours[0].spot);
  }finally{db.close();}
});

test('storage guard rejects work before external HTTP',async()=>{
  const db=new D1();db.bytes=400_000_000;let called=false;
  try{const result=await archiveSpot({venue:'HTX',archive_db:db,scheduled_ts:now,fetch_impl:async()=>{called=true;throw Error('CALLED');}});assert.equal(result.status,'FREE_STORAGE_GUARD');assert.equal(called,false);}finally{db.close();}
});
