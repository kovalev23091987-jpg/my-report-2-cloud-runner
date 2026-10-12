import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {webcrypto,createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {buildSpotRecord} from './spot-archive.mjs';
import {readHourlyHistory,readAlignedHourlyPair} from './history-read.mjs';
import {PREVIOUS_MANIFEST_SHA256} from './hourly-archive.mjs';

globalThis.crypto ||= webcrypto;
const HOUR=3_600_000,T=1_791_810_000_000-1_791_810_000_000%HOUR;
test('bounded archive read returns source-clocked HTX spot, gap and no decision authorization',async()=>{
  const db=new DatabaseSync(':memory:');
  try{
    db.exec(fs.readFileSync(new URL('./001_hourly_archive.sql',import.meta.url),'utf8'));
    const r=await buildSpotRecord({venue:'HTX',hour_bucket:T,received_ts:T+30*60_000,body:{status:'ok',ts:T+30*60_000-1_000,data:[{symbol:'btcusdt',close:100,bid:99.9,ask:100.1,vol:1000}]}});
    db.prepare('INSERT INTO report2_hourly_spot_archive_v1 VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(r.hour_bucket,r.venue,r.source_url,r.source_ts,r.received_ts,r.identity_scope,r.target_count,r.present_count,r.quote_checked_count,r.payload_sha256,r.payload_json,T);
    const adapter={prepare(sql){const s=db.prepare(sql);return{bind(...p){return{all(){return{results:s.all(...p)}}}}}}};
    const result=await readHourlyHistory({archive_db:adapter,contract:'BTC-USDT',market:'SPOT',from_hour:T,to_hour:T+HOUR});
    assert.equal(result.status,'PARTIAL');assert.equal(result.samples.length,1);assert.equal(result.gaps.length,1);assert.equal(result.samples[0].price,100);assert.equal(result.samples[0].individual_trade_clock_verified,false);assert.equal(result.decision_usable,false);
    await assert.rejects(readHourlyHistory({archive_db:adapter,contract:'RAVE-USDT',market:'SPOT',venue:'GATE',from_hour:T,to_hour:T}),/ARGUMENTS_INVALID/);
    await assert.rejects(readHourlyHistory({archive_db:adapter,contract:'RAVE-USDT',market:'SPOT',venue:'KUCOIN',from_hour:T,to_hour:T}),/ARGUMENTS_INVALID/);
    db.exec("UPDATE report2_hourly_spot_archive_v1 SET payload_sha256='tampered'");
    await assert.rejects(readHourlyHistory({archive_db:adapter,contract:'BTC-USDT',market:'SPOT',from_hour:T,to_hour:T}),/HASH_INVALID/);
    await assert.rejects(readHourlyHistory({archive_db:adapter,contract:'BTC-USDT',market:'SPOT',from_hour:T,to_hour:T+8*24*HOUR}),/ARGUMENTS_INVALID/);
  }finally{db.close();}
});
test('pre-STRK 104-asset futures archive remains readable and STRK has an honest gap',async()=>{
  const db=new DatabaseSync(':memory:');
  try{
    db.exec(fs.readFileSync(new URL('./001_hourly_archive.sql',import.meta.url),'utf8'));
    const source=T+25*60_000,payload=JSON.stringify({schema:'report2-hourly-market-archive-v1',source:'HTX_OFFICIAL_COLLECTOR',source_bucket:source,source_market_ts:source+1000,received_ts:source+2000,samples:[{contract:'ADA-USDT',market:'HTX_LINEAR_PERPETUAL',source_status:'CLOSED',price:1,observed_ts:source+1000}]});
    const digest=createHash('sha256').update(payload).digest('hex');
    db.prepare('INSERT INTO report2_hourly_market_archive_v1 VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(T,source,'OLD',source+1000,source+2000,PREVIOUS_MANIFEST_SHA256,104,1,1,digest,payload,T);
    const adapter={prepare(sql){const s=db.prepare(sql);return{bind(...p){return{all(){return{results:s.all(...p)}}}}}}};
    const old=await readHourlyHistory({archive_db:adapter,contract:'ADA-USDT',market:'FUTURES',from_hour:T,to_hour:T});
    const newCoin=await readHourlyHistory({archive_db:adapter,contract:'STRK-USDT',market:'FUTURES',from_hour:T,to_hour:T});
    assert.equal(old.status,'CLOSED');assert.equal(old.samples[0].price,1);
    assert.equal(newCoin.status,'PARTIAL');assert.equal(newCoin.samples.length,0);assert.deepEqual(newCoin.gaps,[T]);
  }finally{db.close();}
});

test('legacy ten-minute spot and futures snapshots become bounded-lag context only',async()=>{
  const db=new DatabaseSync(':memory:');
  try{
    db.exec(fs.readFileSync(new URL('./001_hourly_archive.sql',import.meta.url),'utf8'));
    const futureTs=T+25*60_000,spotTs=T+35*60_000+1_560;
    const fp=JSON.stringify({schema:'report2-hourly-market-archive-v1',source:'HTX_OFFICIAL_COLLECTOR',source_bucket:futureTs,source_market_ts:futureTs,received_ts:futureTs+1000,samples:[{contract:'ADA-USDT',market:'HTX_LINEAR_PERPETUAL',source_status:'CLOSED',price:1.05,observed_ts:futureTs}]});
    db.prepare('INSERT INTO report2_hourly_market_archive_v1 VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(T,futureTs,'OLD',futureTs,futureTs+1000,PREVIOUS_MANIFEST_SHA256,104,1,1,createHash('sha256').update(fp).digest('hex'),fp,T);
    const spot=await buildSpotRecord({venue:'HTX',hour_bucket:T,received_ts:spotTs+1000,body:{status:'ok',ts:spotTs,data:[{symbol:'adausdt',close:1,bid:.999,ask:1.001,vol:1000}]}});
    db.prepare('INSERT INTO report2_hourly_spot_archive_v1 VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(spot.hour_bucket,spot.venue,spot.source_url,spot.source_ts,spot.received_ts,spot.identity_scope,spot.target_count,spot.present_count,spot.quote_checked_count,spot.payload_sha256,spot.payload_json,T);
    const adapter={prepare(sql){const s=db.prepare(sql);return{bind(...p){return{all(){return{results:s.all(...p)}}}}}}};
    const pair=await readAlignedHourlyPair({archive_db:adapter,contract:'ADA-USDT',from_hour:T,to_hour:T});
    assert.equal(pair.status,'CLOSED');assert.equal(pair.hours[0].status,'BOUNDED_LAG_PAIR');assert.equal(pair.hours[0].source_skew_ms,601_560);
    assert.equal(pair.hours[0].spot.price,1);assert.equal(pair.hours[0].futures.price,1.05);assert.equal(pair.hours[0].comparison_usable,true);assert.equal(pair.hours[0].decision_usable,false);
  }finally{db.close();}
});
