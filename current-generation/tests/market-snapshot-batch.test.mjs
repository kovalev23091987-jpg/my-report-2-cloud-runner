import test from 'node:test';
import assert from 'node:assert/strict';
import {packSnapshotShards,selectHistoricalWindows,admitFiveMinuteCollector,MAX_CONTRACTS_PER_SHARD,MAX_PAYLOAD_BYTES} from '../files/src/market-snapshot-batch.mjs';

const makeRows=n=>Array.from({length:n},(_,i)=>({contract:`C${String(i).padStart(4,'0')}-USDT`,price:i+1,oi:i%7===0?null:i*10,funding:0.001}));
const pack=n=>packSnapshotShards({bucket:1_000_000,actor:'HUB_PUBLIC_COLLECTOR',generation:'G',received_ts:1_000_100,source_timestamps:{market:1_000_000,oi:999_900,funding:999_800},rows:makeRows(n),status:'COMPLETE'});

for(const count of [358,1024])test(`K03: ${count} contracts are completely sharded without truncation`,()=>{
  const shards=pack(count);
  assert.equal(shards.reduce((sum,x)=>sum+x.contracts,0),count);
  assert.ok(shards.every(x=>x.contracts<=MAX_CONTRACTS_PER_SHARD&&x.payload_bytes<=MAX_PAYLOAD_BYTES));
  assert.deepEqual(shards.map(x=>x.shard),Array.from({length:shards.length},(_,i)=>i));
});

test('K03: partial OI and a new contract remain explicit data, not a dropped universe member',()=>{
  const shards=pack(70);const rows=shards.flatMap(x=>JSON.parse(x.payload));
  assert.equal(rows.length,70);assert.equal(rows[0].oi,null);assert.equal(rows.some(x=>x.contract==='C0069-USDT'),true);
});

test('K03: missing two slots never labels a 20-minute-old point as 15m',()=>{
  const now=24*60*60_000;
  const snapshots=[{bucket:now-20*60_000,status:'COMPLETE',rows:[{contract:'SOL-USDT',price:100}]},{bucket:now-60*60_000,status:'COMPLETE',rows:[{contract:'SOL-USDT',price:90}]},{bucket:now-24*60*60_000,status:'COMPLETE',rows:[{contract:'SOL-USDT',price:50}]}];
  const result=selectHistoricalWindows({contract:'SOL-USDT',now_ts:now,snapshots});
  assert.equal(result.windows.m15.status,'UNKNOWN');
  assert.equal(result.windows.h1.actual_window_ms,60*60_000);
  assert.equal(result.windows.h24.actual_window_ms,24*60*60_000);
});

test('K03: STARTED/PARTIAL snapshots never become historical evidence',()=>{
  const now=2_000_000,point=now-5*60_000;
  for(const status of ['STARTED','PARTIAL'])assert.equal(selectHistoricalWindows({contract:'X-USDT',now_ts:now,snapshots:[{bucket:point,status,rows:[{contract:'X-USDT'}]}]}).windows.m5.status,'UNKNOWN');
});

test('K03: five-minute collector remains blocked until real runtime measurements fit',()=>{
  assert.equal(admitFiveMinuteCollector({}).status,'BLOCKED_RUNTIME_LIMIT');
  assert.equal(admitFiveMinuteCollector({cpu_ms:1,memory_bytes:1,subrequests:4,rows_read:1,rows_written:1,db_bytes:1}).status,'BLOCKED_RUNTIME_LIMIT');
  assert.equal(admitFiveMinuteCollector({cpu_ms:1,memory_bytes:1,subrequests:3,rows_read:1,rows_written:20,db_bytes:1}).status,'ADMITTED_MEASURED');
});
