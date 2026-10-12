import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {webcrypto} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {buildSpotRecord,archiveSpot,SPOT_SOURCES} from './spot-archive.mjs';

globalThis.crypto ||= webcrypto;
const HOUR=3_600_000,T=1_791_810_000_000-1_791_810_000_000%HOUR,now=T+28*60_000;
const htxPair=contract=>contract.slice(0,-5).toLowerCase()+'usdt';
const gatePair=contract=>contract.slice(0,-5)+'_USDT';
const htxRows=SPOT_SOURCES.HTX.target_contracts.map(contract=>({symbol:htxPair(contract),close:1,bid:.999,ask:1.001,vol:100,count:100}));
const gateRows=SPOT_SOURCES.GATE.target_contracts.map(contract=>({currency_pair:gatePair(contract),last:'1',highest_bid:'.999',lowest_ask:'1.001',quote_volume:'100'}));

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

test('Gate bulk covers the approved 104 targets without promoting identity candidates',async()=>{
  const r=await buildSpotRecord({venue:'GATE',hour_bucket:T,body:gateRows,received_ts:now});
  assert.equal(r.target_count,104);
  assert.equal(r.present_count,104);
  assert.equal(r.quote_checked_count,103);
  assert.equal(r.source_ts,null);
  assert.equal(r.identity_scope,'GATE_PAIR_CANDIDATE_UNBOUND');
  assert.ok(Buffer.byteLength(r.payload_json)<100_000);
  assert.ok(JSON.parse(r.payload_json).samples.every(x=>x.asset_identity_status==='EXTERNAL_PAIR_IDENTITY_UNVERIFIED'||x.asset_identity_status==='EXTERNAL_PAIR_PRICE_CONFLICT'));
});

test('Gate RAVE price conflict is retained but not qualified; KuCoin RAVE keeps exchange clock',async()=>{
  const gate=await buildSpotRecord({venue:'GATE',hour_bucket:T,body:gateRows,received_ts:now});
  const rave=JSON.parse(gate.payload_json).samples.find(x=>x.contract==='RAVE-USDT');
  assert.equal(rave.source_status,'CROSS_VENUE_PRICE_CONFLICT');
  assert.equal(rave.asset_identity_status,'EXTERNAL_PAIR_PRICE_CONFLICT');
  const kucoin=await buildSpotRecord({venue:'KUCOIN',hour_bucket:T,body:{code:'200000',data:{symbol:'RAVE-USDT',last:'0.173',buy:'0.172',sell:'0.174',volValue:'10000',time:now-900}},received_ts:now});
  assert.equal(kucoin.present_count,1);
  assert.equal(kucoin.quote_checked_count,1);
  assert.equal(JSON.parse(kucoin.payload_json).samples[0].source_ts,now-900);
  await assert.rejects(buildSpotRecord({venue:'KUCOIN',hour_bucket:T,body:{code:'200000',data:{symbol:'RAVE-USDT',last:'0.173',buy:'0.172',sell:'0.174',volValue:'10000',time:now-70_000}},received_ts:now}),/SPOT_SOURCE_CLOCK_INVALID/);
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
