import fs from 'node:fs';
import crypto from 'node:crypto';
import {createGzip} from 'node:zlib';
import {once} from 'node:events';
import {RemoteD1Database} from '../../runner/report2-d1-adapter.mjs';

const ACTOR='HUB_PUBLIC_COLLECTOR';
const GENERATION='MY_REPORT_2_CURRENT_20260928_CANONICAL_RUNTIME_V12_CONTRACT_INTEGRITY_20M';
const CUTOFF=1790837064088;
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN,{timeoutMs:45000});
const scope='actor=?1 AND generation=?2 AND bucket<?3';
const before=await db.prepare(`SELECT COUNT(*) AS rows,SUM(payload_bytes) AS bytes FROM report2_market_snapshot_batch_v1 WHERE ${scope}`).bind(ACTOR,GENERATION,CUTOFF).first();
if(Number(before.rows)!==2814||Number(before.bytes)!==51643435)throw Error('APPROVED_BACKUP_SCOPE_CHANGED');
const file='report2-expired-market-snapshots-20261004.jsonl.gz';
const output=fs.createWriteStream(file,{flags:'wx'}),gzip=createGzip({level:9});gzip.pipe(output);
let bucket=-1,shard=-1,count=0,bytes=0;
const digest=crypto.createHash('sha256');
while(true){
 const page=await db.prepare(`SELECT * FROM report2_market_snapshot_batch_v1 WHERE ${scope} AND (bucket>?4 OR (bucket=?4 AND shard>?5)) ORDER BY bucket,shard LIMIT 48`).bind(ACTOR,GENERATION,CUTOFF,bucket,shard).all();
 const rows=page.results||[];if(!rows.length)break;
 for(const row of rows){
  if(row.actor!==ACTOR||row.generation!==GENERATION||Number(row.bucket)>=CUTOFF)throw Error('BACKUP_SCOPE_MISMATCH');
  const payload=Buffer.from(row.payload);
  if(payload.length!==Number(row.payload_bytes)||crypto.createHash('sha256').update(payload).digest('hex')!==row.payload_hash)throw Error('BACKUP_PAYLOAD_HASH_MISMATCH');
  const line=JSON.stringify(row)+'\n';digest.update(line);
  if(!gzip.write(line))await once(gzip,'drain');
  count++;bytes+=payload.length;bucket=Number(row.bucket);shard=Number(row.shard);
 }
}
gzip.end();await once(output,'close');
if(count!==Number(before.rows)||bytes!==Number(before.bytes))throw Error('BACKUP_COUNT_MISMATCH');
const after=await db.prepare(`SELECT COUNT(*) AS rows,SUM(payload_bytes) AS bytes FROM report2_market_snapshot_batch_v1 WHERE ${scope}`).bind(ACTOR,GENERATION,CUTOFF).first();
if(Number(after.rows)!==count||Number(after.bytes)!==bytes)throw Error('BACKUP_SOURCE_CHANGED');
const retained=await db.prepare(`SELECT bucket,shard,payload_hash FROM report2_market_snapshot_batch_v1 WHERE actor=?1 AND generation=?2 AND bucket>=?3 ORDER BY bucket,shard`).bind(ACTOR,GENERATION,CUTOFF).all();
fs.writeFileSync('report2-retained-snapshot-hashes.json',JSON.stringify(retained.results));
const manifest={status:'BACKUP_VERIFIED',actor:ACTOR,generation:GENERATION,cutoff:CUTOFF,rows:count,payload_bytes:bytes,jsonl_sha256:digest.digest('hex'),gzip_sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),file_bytes:fs.statSync(file).size,retained_rows:retained.results.length,usage:db.usageSnapshot(),completed_at:new Date().toISOString(),production_writes:0};
fs.writeFileSync('report2-storage-backup-manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log('REPORT2_STORAGE_BACKUP_VERIFIED',JSON.stringify(manifest));
