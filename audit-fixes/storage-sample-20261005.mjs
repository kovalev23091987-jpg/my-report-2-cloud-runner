import fs from 'node:fs';import assert from 'node:assert/strict';import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),orig=db._request.bind(db);
db._request=async p=>{assert.ok(p.op==='all'&&/^\s*SELECT\b/i.test(p.sql)&&!/\b(INSERT|DELETE|UPDATE|CREATE|DROP|ALTER)\b/i.test(p.sql));const u=db.usageSnapshot();assert.ok(u.rows_read<1400&&u.rows_written===0&&u.unknown_ops===0&&u.requests<9);return orig(p);};
const records={};
for(const [name,sql] of [
 ['cache_bounded_inventory','SELECT source,asset_key,observed_ts,expires_ts,LENGTH(CAST(payload_json AS BLOB)) AS bytes FROM report2_evidence_source_cache ORDER BY source,asset_key LIMIT 256'],
 ['old_scan','SELECT ts_bucket,ts,LENGTH(CAST(payload_json AS BLOB)) AS bytes FROM scan_runs ORDER BY ts_bucket LIMIT 10'],
 ['new_scan','SELECT ts_bucket,ts,LENGTH(CAST(payload_json AS BLOB)) AS bytes FROM scan_runs ORDER BY ts_bucket DESC LIMIT 10'],
 ['old_collector','SELECT bucket,actor,generation,shard,payload_bytes FROM report2_market_snapshot_batch_v1 ORDER BY actor,generation,bucket,shard LIMIT 12'],
 ['recent_collector','SELECT bucket,actor,generation,shard,payload_bytes FROM report2_market_snapshot_batch_v1 INDEXED BY idx_report2_market_snapshot_batch_v1_range ORDER BY actor,generation,bucket DESC,shard LIMIT 12'],
 ['tables','SELECT name,sql FROM sqlite_schema WHERE type=\'table\' LIMIT 120']
]){try{records[name]=await db.prepare(sql).all();}catch(e){records[name]={error:String(e.message).slice(0,200)};}}
fs.writeFileSync('audit-output/storage-sample.json',JSON.stringify({schema:'report2-bounded-storage-sample-v1',read_at:Date.now(),records,usage:db.usageSnapshot(),sourceHTTP:0,MAIN:0,Telegram:0,storage_write:0},null,2));console.log(JSON.stringify({status:'BOUNDED_READ_ONLY_COMPLETE',usage:db.usageSnapshot(),sourceHTTP:0,MAIN:0,Telegram:0}));
