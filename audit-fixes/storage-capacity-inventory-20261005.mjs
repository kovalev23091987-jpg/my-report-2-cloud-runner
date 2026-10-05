import fs from 'node:fs';import assert from 'node:assert/strict';import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),orig=db._request.bind(db);
db._request=async p=>{assert.equal(p.op,'all');assert.match(p.sql,/^\s*SELECT\b/i);assert.ok(!/\b(INSERT|DELETE|UPDATE|CREATE|DROP|ALTER)\b/i.test(p.sql));const u=db.usageSnapshot();assert.ok(u.rows_read<14000&&u.rows_written===0&&u.unknown_ops===0&&u.requests<22);return orig(p);};
const inventory={},publicTables={
 full_evidence_shadow_log:['stage392_proof_bundle_json','evidence_compact_json','relative_strength_json','prior_htx_shadow_json'],
 canonical_publication_shadow:['canonical_json','presentation_inputs_json','manual_text','telegram_text'],
 report2_evidence_source_cache:['payload_json'],
 scan_runs:['payload_json'],
 report2_market_snapshot_batch_v1:['payload_json'],
 report2_global_source_cache:['payload_json'],
 report2_candidate_source_cache:['payload_json']
};
for(const [table,cols] of Object.entries(publicTables)){
 try{
  const lo=(await db.prepare('SELECT rowid AS id FROM '+table+' ORDER BY rowid ASC LIMIT 1').all()).results?.[0]?.id;
  const hi=(await db.prepare('SELECT rowid AS id FROM '+table+' ORDER BY rowid DESC LIMIT 1').all()).results?.[0]?.id;
  const span=lo==null?0:hi-lo+1,remaining=14000-db.usageSnapshot().rows_read;
  if(span+4>remaining){inventory[table]={status:'COUNT_NOT_ADMITTED_BOUND',rowid_span_upper_bound:span,not_actual_row_count:true};continue;}
  const bytes=cols.map(c=>'COALESCE(LENGTH(CAST('+c+' AS BLOB)),0)').join('+');
  const r=await db.prepare('SELECT COUNT(*) AS actual_rows,SUM('+bytes+') AS raw_payload_bytes FROM '+table).all();
  inventory[table]={status:'EXACT_COUNT_AND_RAW_BYTES',fields:cols,...r.results[0],database_bytes:r.meta?.size_after};
 }catch(e){inventory[table]={status:'READ_FAILED',error:String(e.message).slice(0,250)};}
}
fs.writeFileSync('audit-output/storage-inventory.json',JSON.stringify({schema:'report2-public-payload-storage-inventory-v1',read_at:Date.now(),inventory,usage:db.usageSnapshot(),sourceHTTP:0,MAIN:0,Telegram:0,storage_write:0},null,2));
console.log(JSON.stringify({status:'BOUNDED_INVENTORY_COMPLETE',usage:db.usageSnapshot(),sourceHTTP:0,MAIN:0,Telegram:0}));
