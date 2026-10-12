import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {webcrypto} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {buildSpotRecord} from './spot-archive.mjs';
import {readHourlyHistory} from './history-read.mjs';

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
    const gate=await readHourlyHistory({archive_db:adapter,contract:'RAVE-USDT',market:'SPOT',venue:'GATE',from_hour:T,to_hour:T});
    assert.equal(gate.status,'IDENTITY_UNVERIFIED');assert.equal(gate.samples.length,0);
    db.exec("UPDATE report2_hourly_spot_archive_v1 SET payload_sha256='tampered'");
    await assert.rejects(readHourlyHistory({archive_db:adapter,contract:'BTC-USDT',market:'SPOT',from_hour:T,to_hour:T}),/HASH_INVALID/);
    await assert.rejects(readHourlyHistory({archive_db:adapter,contract:'BTC-USDT',market:'SPOT',from_hour:T,to_hour:T+8*24*HOUR}),/ARGUMENTS_INVALID/);
  }finally{db.close();}
});
