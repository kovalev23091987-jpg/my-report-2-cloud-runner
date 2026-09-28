import crypto from 'node:crypto';

export const SNAPSHOT_SCHEMA='report2-market-snapshot-batch-v1';
export const MAX_CONTRACTS_PER_SHARD=64;
export const MAX_PAYLOAD_BYTES=64*1024;
export const RETENTION_MS=72*60*60*1000;
const WINDOWS=Object.freeze({m5:5*60_000,m15:15*60_000,h1:60*60_000,h4:4*60*60_000,h24:24*60*60_000});
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');

function encoded(rows){const payload=JSON.stringify(rows);return {payload,bytes:Buffer.byteLength(payload)};}
export function packSnapshotShards({bucket,actor,generation,source_timestamps={},received_ts,rows,status='COMPLETE'}={}){
  if(!Number.isSafeInteger(bucket)||!actor||!generation||!Number.isFinite(received_ts)||!Array.isArray(rows))throw new Error('SNAPSHOT_INPUT_INVALID');
  const ordered=[...rows].sort((a,b)=>String(a.contract).localeCompare(String(b.contract)));
  const shards=[];let current=[];
  const flush=()=>{if(!current.length)return;const body=encoded(current);shards.push({bucket,actor,generation,schema_version:SNAPSHOT_SCHEMA,shard:shards.length,source_timestamps,received_ts,status,payload_hash:sha(body.payload),payload:body.payload,contracts:current.length,payload_bytes:body.bytes});current=[];};
  for(const row of ordered){
    if(!row?.contract)throw new Error('SNAPSHOT_CONTRACT_REQUIRED');
    const single=encoded([row]);if(single.bytes>MAX_PAYLOAD_BYTES)throw new Error('SNAPSHOT_SINGLE_CONTRACT_TOO_LARGE');
    const candidate=encoded([...current,row]);
    if(current.length>=MAX_CONTRACTS_PER_SHARD||candidate.bytes>MAX_PAYLOAD_BYTES)flush();
    current.push(row);
  }
  flush();
  const snapshotMeta={...source_timestamps,expected_shards:shards.length,universe_total:ordered.length};
  return shards.map(shard=>({...shard,source_timestamps:snapshotMeta}));
}

export async function installMarketSnapshotBatch(db){
  await db.prepare(`CREATE TABLE IF NOT EXISTS report2_market_snapshot_batch_v1(bucket INTEGER NOT NULL,actor TEXT NOT NULL,generation TEXT NOT NULL,schema_version TEXT NOT NULL,shard INTEGER NOT NULL,source_timestamps_json TEXT NOT NULL,received_ts INTEGER NOT NULL,status TEXT NOT NULL,payload_hash TEXT NOT NULL,payload TEXT NOT NULL,contract_count INTEGER NOT NULL,payload_bytes INTEGER NOT NULL,PRIMARY KEY(actor,generation,bucket,shard))`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_report2_market_snapshot_batch_v1_range ON report2_market_snapshot_batch_v1(generation,bucket,shard)`).run();
}

export async function persistSnapshotShard(db,shard){
  await db.prepare(`INSERT INTO report2_market_snapshot_batch_v1(bucket,actor,generation,schema_version,shard,source_timestamps_json,received_ts,status,payload_hash,payload,contract_count,payload_bytes) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12) ON CONFLICT(actor,generation,bucket,shard) DO NOTHING`).bind(shard.bucket,shard.actor,shard.generation,shard.schema_version,shard.shard,JSON.stringify(shard.source_timestamps),shard.received_ts,shard.status,shard.payload_hash,shard.payload,shard.contracts,shard.payload_bytes).run();
  const row=await db.prepare(`SELECT payload_hash,status FROM report2_market_snapshot_batch_v1 WHERE actor=?1 AND generation=?2 AND bucket=?3 AND shard=?4`).bind(shard.actor,shard.generation,shard.bucket,shard.shard).first();
  if(row?.payload_hash!==shard.payload_hash)return {ok:false,status:'IMMUTABLE_BUCKET_CONFLICT'};
  return {ok:true,status:'STORED_OR_IDENTICAL_NOOP'};
}

const tolerance=period=>period<=15*60_000?Math.min(period*.2,2*60_000):5*60_000;
export function selectHistoricalWindows({contract,now_ts,snapshots}={}){
  const usable=[];
  for(const snapshot of snapshots||[]){
    if(snapshot.status!=='COMPLETE')continue;
    const rows=Array.isArray(snapshot.rows)?snapshot.rows:JSON.parse(snapshot.payload||'[]');
    const row=rows.find(x=>x.contract===contract);if(row)usable.push({ts:Number(snapshot.bucket),row,snapshot});
  }
  const windows={};
  for(const [label,period] of Object.entries(WINDOWS)){
    const target=now_ts-period;let chosen=null;
    for(const item of usable){const delta=Math.abs(item.ts-target);if(delta<=tolerance(period)&&(!chosen||delta<chosen.delta))chosen={...item,delta};}
    windows[label]=chosen?{status:'CLOSED',target_ts:target,point_ts:chosen.ts,current_ts:now_ts,actual_window_ms:now_ts-chosen.ts,row:chosen.row}:{status:'UNKNOWN',reason:'NO_POINT_WITHIN_WINDOW_TOLERANCE',target_ts:target,tolerance_ms:tolerance(period)};
  }
  return {contract,now_ts,windows};
}

export async function cleanupExpiredSnapshots(db,{now=Date.now(),limit=50}={}){
  const cutoff=now-RETENTION_MS;
  return db.prepare(`DELETE FROM report2_market_snapshot_batch_v1 WHERE rowid IN (SELECT rowid FROM report2_market_snapshot_batch_v1 WHERE bucket<?1 ORDER BY bucket LIMIT ?2)`).bind(cutoff,limit).run();
}

export function admitFiveMinuteCollector(measurement={}){
  const required=['cpu_ms','memory_bytes','subrequests','rows_read','rows_written','db_bytes'];
  if(required.some(key=>!Number.isFinite(Number(measurement[key]))))return {enabled:false,status:'BLOCKED_RUNTIME_LIMIT',reason:'MEASUREMENT_REQUIRED'};
  const allowedSubrequests=measurement.catalog_refresh===true?4:3;
  if(Number(measurement.subrequests)>allowedSubrequests||Number(measurement.rows_written)>10000/288)return {enabled:false,status:'BLOCKED_RUNTIME_LIMIT',reason:'MEASURED_BUDGET_EXCEEDED'};
  return {enabled:true,status:'ADMITTED_MEASURED'};
}
