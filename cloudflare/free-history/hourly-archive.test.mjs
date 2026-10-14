import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash, webcrypto} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {archiveHour,buildHourlyRecord,MANIFEST_SHA256,SOURCE_GENERATION,TARGETS} from './hourly-archive.mjs';
import {APPROVED_HTX_SCOPE,APPROVED_HTX_ANALYSIS_CONTRACTS} from '../../current-generation/files/src/approved-htx-analysis-scope.mjs';

globalThis.crypto ||= webcrypto;
const HOUR=3_600_000;
const T=1_791_810_000_000 - 1_791_810_000_000%HOUR;
const bucket=T+25*60_000;
const received=bucket+2_000;
const sha=value=>createHash('sha256').update(value).digest('hex');

test('current frozen targets exactly bind the current approved manifest and runtime',()=>{
  const compressed=fs.readFileSync(new URL('../../'+APPROVED_HTX_SCOPE.manifest,import.meta.url));
  assert.equal(sha(compressed),MANIFEST_SHA256);
  const manifest=JSON.parse(gunzipSync(compressed));
  const expected=manifest.contracts.filter(x=>x.market_kind==='LINEAR_PERPETUAL').map(x=>x.contract_code).sort();
  assert.deepEqual([...TARGETS].sort(),expected);
  assert.deepEqual([...TARGETS].sort(),APPROVED_HTX_ANALYSIS_CONTRACTS.map(r=>r.contract_code).sort());
});

function fixture(mutate=()=>{}) {
  const data=TARGETS.map(contract=>({contract,catalog_active:true,source_status:'CLOSED',price:1,observed_ts:bucket+1_000,turnover_24h_usdt:100,oi_value_usdt:100,funding_rate:0.0001,funding_interval_hours:4}));
  mutate(data);
  const payload=JSON.stringify(data);
  return [{bucket,generation:SOURCE_GENERATION,shard:0,source_timestamps_json:JSON.stringify({expected_shards:1,universe_total:data.length,market:bucket+1_000}),received_ts:received,status:'COMPLETE',payload_hash:sha(payload),payload,contract_count:data.length}];
}

test('exact 105-asset sampled futures archive retains clocks and remains compact',async()=>{
  const record=await buildHourlyRecord({hour_bucket:T,source_rows:fixture()});
  assert.equal(record.target_count,TARGETS.length);
  assert.equal(record.present_count,TARGETS.length);
  assert.equal(record.qualified_count,TARGETS.length);
  assert.equal(record.manifest_sha256,MANIFEST_SHA256);
  assert.equal(record.source_market_ts,bucket+1_000);
  assert.ok(Buffer.byteLength(record.payload_json)<100_000);
  assert.equal(JSON.parse(record.payload_json).samples[0].market,'HTX_LINEAR_PERPETUAL');
});

test('source tampering, duplicate contracts, missing shards and stale prices fail closed',async()=>{
  const corrupted=fixture();corrupted[0].payload_hash='0'.repeat(64);
  await assert.rejects(buildHourlyRecord({hour_bucket:T,source_rows:corrupted}),/HASH_INVALID/);
  await assert.rejects(buildHourlyRecord({hour_bucket:T,source_rows:fixture(rows=>rows.push({...rows[0]}))}),/DUPLICATE_CONTRACT/);
  const missing=fixture();missing[0].source_timestamps_json=JSON.stringify({expected_shards:2,universe_total:105,market:bucket+1_000});
  await assert.rejects(buildHourlyRecord({hour_bucket:T,source_rows:missing}),/SHARDS_INVALID/);
  const partial=await buildHourlyRecord({hour_bucket:T,source_rows:fixture(rows=>rows[0].observed_ts=bucket-10*60_000)});
  assert.equal(partial.qualified_count,TARGETS.length-1);
  assert.equal(JSON.parse(partial.payload_json).samples[0].price,null);
});

class D1 {
  constructor(schema) {this.db=new DatabaseSync(':memory:');this.db.exec(schema);}
  prepare(sql) {
    const stmt=this.db.prepare(sql);
    const params=[];
    return {bind(...values){params.push(...values);return this;},first(){return stmt.get(...params)??null;},all(){return {results:stmt.all(...params),meta:{size_after:16_384}};},run(){const result=stmt.run(...params);return {meta:{changes:Number(result.changes),size_after:16_384}};}};
  }
  close(){this.db.close();}
}

test('hourly lane inserts once into separate D1 and never calls a source',async()=>{
  const source=new D1(fs.readFileSync(new URL('../../current-generation/migrations/004_market_snapshot_batch.sql',import.meta.url),'utf8'));
  const archive=new D1(fs.readFileSync(new URL('./001_hourly_archive.sql',import.meta.url),'utf8'));
  const rows=fixture();
  source.db.prepare(`INSERT INTO report2_market_snapshot_batch_v1(bucket,actor,generation,schema_version,shard,source_timestamps_json,received_ts,status,payload_hash,payload,contract_count,payload_bytes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(bucket,'HUB_PUBLIC_COLLECTOR',SOURCE_GENERATION,'report2-market-snapshot-batch-v1',0,rows[0].source_timestamps_json,received,'COMPLETE',rows[0].payload_hash,rows[0].payload,TARGETS.length,Buffer.byteLength(rows[0].payload));
  const previousFetch=globalThis.fetch;
  globalThis.fetch=()=>{throw Error('NO_EXCHANGE_HTTP_ALLOWED');};
  try {
    const first=await archiveHour({source_db:source,archive_db:archive,scheduled_ts:T+28*60_000});
    assert.equal(first.status,'ARCHIVED');
    assert.equal(first.source_http,0);
    assert.equal(first.qualified_count,TARGETS.length);
    const second=await archiveHour({source_db:source,archive_db:archive,scheduled_ts:T+38*60_000});
    assert.equal(second.status,'ALREADY_ARCHIVED');
    assert.equal(archive.db.prepare('SELECT COUNT(*) AS n FROM report2_hourly_market_archive_v1').get().n,1);
  } finally {globalThis.fetch=previousFetch;source.close();archive.close();}
});
