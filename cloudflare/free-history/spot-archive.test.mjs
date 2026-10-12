import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {webcrypto} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {buildSpotRecord,archiveSpot,SPOT_SOURCES} from './spot-archive.mjs';

globalThis.crypto ||= webcrypto;
const HOUR=3_600_000,T=1_791_810_000_000-1_791_810_000_000%HOUR,now=T+28*60_000;
const htxPair=contract=>contract.slice(0,-5).toLowerCase()+'usdt';
const htxRows=SPOT_SOURCES.HTX.target_contracts.map(contract=>({symbol:htxPair(contract),close:1,bid:.999,ask:1.001,vol:100,count:100}));

class D1 {
  constructor(){this.db=new DatabaseSync(':memory:');this.db.exec(fs.readFileSync(new URL('./001_hourly_archive.sql',import.meta.url),'utf8'));this.bytes=16_384;}
  prepare(sql){const stmt=this.db.prepare(sql),params=[],self=this;return {bind(...values){params.push(...values);return this;},first(){return stmt.get(...params)??null;},all(){return {results:stmt.all(...params),meta:{size_after:self.bytes}};},run(){const r=stmt.run(...params);return {meta:{changes:Number(r.changes),size_after:self.bytes}};}};}
  close(){this.db.close();}
}

test('HTX spot bulk keeps 104 targets separate from 89 returned pairs and no individual trade clock',async()=>{
  const rows=htxRows.slice(0,89);
  const r=await buildSpotRecord({venue:'HTX',hour_bucket:T,body:{status:'ok',ts:now-1_000,data:rows},received_ts:now});
  assert.equal(r.target_count,104);
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

test('one charged HTX request per hour, immutable write, and no retry after source error',async()=>{
  const db=new D1();let calls=0;
  const fetch_impl=async()=>{calls++;return new Response(JSON.stringify({status:'ok',ts:now-1_000,data:htxRows}),{status:200});};
  try{
    const first=await archiveSpot({venue:'HTX',archive_db:db,scheduled_ts:now,clock:()=>now,fetch_impl});
    assert.equal(first.status,'ARCHIVED');
    assert.equal(first.present_count,104);
    assert.equal((await archiveSpot({venue:'HTX',archive_db:db,scheduled_ts:now,clock:()=>now,fetch_impl})).status,'ALREADY_ARCHIVED');
    assert.equal(calls,1);
    const failed=new D1();try{
      await assert.rejects(archiveSpot({venue:'HTX',archive_db:failed,scheduled_ts:now,clock:()=>now,fetch_impl:async()=>{calls++;throw Error('NETWORK');}}),/NETWORK/);
      assert.equal((await archiveSpot({venue:'HTX',archive_db:failed,scheduled_ts:now,clock:()=>now,fetch_impl})).status,'ALREADY_ATTEMPTED');
      assert.equal(calls,2);
    }finally{failed.close();}
  }finally{db.close();}
});

test('storage guard rejects work before external HTTP',async()=>{
  const db=new D1();db.bytes=400_000_000;let called=false;
  try{const result=await archiveSpot({venue:'HTX',archive_db:db,scheduled_ts:now,fetch_impl:async()=>{called=true;throw Error('CALLED');}});assert.equal(result.status,'FREE_STORAGE_GUARD');assert.equal(called,false);}finally{db.close();}
});
