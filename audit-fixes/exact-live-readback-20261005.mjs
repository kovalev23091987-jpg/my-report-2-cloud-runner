import fs from 'node:fs';import assert from 'node:assert/strict';import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),orig=db._request.bind(db);db._request=async p=>{assert.equal(p.op,'all');assert.match(p.sql,/^\s*(SELECT|EXPLAIN QUERY PLAN)\b/i);assert.ok(!/\b(INSERT|DELETE|UPDATE|CREATE|DROP|ALTER)\b/i.test(p.sql));const u=db.usageSnapshot();assert.ok(u.rows_read<3500&&u.rows_written===0&&u.unknown_ops===0&&u.requests<24);return orig(p);};
const records={},read=async(name,sql,args=[])=>{try{records[name]=await db.prepare(sql).bind(...args).all();}catch(e){records[name]={error:String(e.message).slice(0,300)};}};
await read('schema','SELECT name,type,sql FROM sqlite_schema WHERE type IN (\'table\',\'index\') LIMIT 220');
for(const [contract,pub,ts] of [['FIL-USDT','PUB:4cdfdc',1791239015611],['BR-USDT','PUB:44d1adac3456611f1244747058466c2289e6c994',1791239045813]]){
 await read('canonical:'+contract,'SELECT publication_id,canonical_json,presentation_inputs_json,run_id,snapshot_id,observed_ts,created_ts,wave_id,contract_code,direction,state FROM canonical_publication_shadow WHERE run_id=?1 AND contract_code=?2 ORDER BY created_ts DESC LIMIT 3',['1791238967062-1791238979498',contract]);
 await read('full:'+contract,'SELECT * FROM full_evidence_shadow_log INDEXED BY idx_full_evidence_shadow_contract_ts WHERE contract_code=?1 AND observed_ts=?2 ORDER BY full_evidence_id LIMIT 2',[contract,ts]);
}
await read('dispatch','SELECT dispatch_id,idempotency_key,contract,direction,wave_id,lifecycle_event,state,created_ts,updated_ts,telegram_message_id,decision_id FROM v3_telegram_dispatch_shadow WHERE idempotency_key=?1 LIMIT 1',['FIL-USDT|LONG|EDW:FIL-USDT:1791235752894:G5|OBSERVE|v3-telegram-shadow-r6|R2985398']);
await read('wave','SELECT * FROM v3_early_candidate_wave WHERE wave_id=?1 LIMIT 1',['EDW:FIL-USDT:1791235752894:G5']);
const size=await db.prepare('SELECT 1 AS bounded_size_read').all();records.database_bytes=size?.meta?.size_after??null;
const tables=records.schema?.results?.filter(r=>r.type==='table')||[];
for(const name of ['report2_evidence_source_cache','scan_runs','full_evidence_shadow_log','report2_market_snapshot_batch_v1','liquidation_cluster_state']){
 const schema=tables.find(t=>t.name===name);if(!schema)continue;const sql=schema.sql, cols=['payload_json','stage392_proof_bundle_json','relative_market_json','payload_bytes'].filter(c=>sql.includes(c));if(!cols.length)continue;
 const values=cols.map(c=>c==='payload_bytes'?c:'LENGTH(CAST('+c+' AS BLOB)) AS '+c+'_bytes').join(',');
 await read('size_sample:'+name,'SELECT '+values+' FROM '+name+' LIMIT 3');
}
fs.writeFileSync('audit-output/exact-live-readback.json',JSON.stringify({schema:'report2-exact-live-source-read-v1',read_at:Date.now(),source_run_id:'1791238967062-1791238979498',records,usage:db.usageSnapshot(),sourceHTTP:0,MAIN:0,Telegram:0,storage_write:0},null,2));console.log(JSON.stringify({status:'READ_COMPLETE',usage:db.usageSnapshot(),sourceHTTP:0,MAIN:0,Telegram:0}));
