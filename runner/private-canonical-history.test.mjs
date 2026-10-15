import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync,gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {encodeCanonicalPublicationRow} from './canonical-cold-archive.mjs';
const root=process.env.REPORT2_TEST_RUNTIME;
const {decodePrivateCanonicalRecord,privateCanonicalHeader,createPrivateCanonicalRestorer}=await import(root?pathToFileURL(path.resolve(root,'private-canonical-history.mjs')):new URL('./private-canonical-history.mjs',import.meta.url));
const {RemoteD1Database}=await import(root?pathToFileURL(path.resolve(root,'report2-d1-adapter.mjs')):new URL('./report2-d1-adapter.mjs',import.meta.url));
import {buildLiquidationForecastSnapshot} from '../current-generation/files/src/liquidation-forecast-memory.mjs';
const report=JSON.parse(gunzipSync(fs.readFileSync(new URL('../checkpoints/private-copy-natural-38468644125/report2-run-result.json.gz',import.meta.url))));
const candidate=report.candidates[0];
function row(extra={}){return {publication_id:candidate.publication_id,run_id:candidate.run_id,snapshot_id:candidate.snapshot_id,contract_code:candidate.contract,observed_ts:candidate.observed_ts,analytical_fingerprint:candidate.canonical.analytical_fingerprint,canonical_json:JSON.stringify(candidate.canonical,null,2),presentation_inputs_json:'{ "spacing": true, "preserve": "исходная строка" }',manual_text:candidate.manual_text,telegram_text:'Оригинальный текст\n'.repeat(30),canonical_state:candidate.canonical.state,...extra};}
const allow=()=>({allowed:true});
function database(records){const sql=new DatabaseSync(':memory:');sql.exec(fs.readFileSync(new URL('../cloudflare/free-history/003_canonical_cold_archive.sql',import.meta.url),'utf8'));let requests=0;for(const r of records)sql.prepare('INSERT INTO report2_canonical_cold_archive_v1 VALUES(?,?,?,?,?,?,?,?)').run(r.publication_id,r.raw_sha256,r.run_id,r.snapshot_id,r.contract_code,r.observed_ts,JSON.stringify(r),r.observed_ts+1);return{sql,usageSnapshot(){return{requests,rows_read:requests,rows_written:0,unknown_ops:0};},prepare(query){let args=[];return{bind(...values){args=values;return this;},async first(){requests++;return sql.prepare(query).get(...args)||null;}};}};}

test('an explicitly installed additional archive restores exact original bytes without searching other databases',async()=>{
 const source=row(),record=encodeCanonicalPublicationRow(source),legacy=database([]),extra=database([record]);
 try{
  const header=await privateCanonicalHeader(source,record,{archive_slot:'A1'});
  const reader=createPrivateCanonicalRestorer({archive_db:legacy,archive_dbs:{A1:extra},db_admit:allow});
  assert.deepEqual(await reader.restore(header),source);assert.equal(legacy.usageSnapshot().requests,0);assert.equal(extra.usageSnapshot().requests,1);
  assert.deepEqual(await reader.restore(header),source);assert.equal(extra.usageSnapshot().requests,1);
  const absent=await privateCanonicalHeader(source,record,{archive_slot:'A2'});
  await assert.rejects(reader.restore([header,absent]),/ARCHIVE_SLOT_NOT_INSTALLED/);assert.equal(extra.usageSnapshot().requests,1);
 }finally{legacy.sql.close();extra.sql.close();}
});

test('legacy locators remain unchanged and separate shard locations cannot poison the revision cache',async()=>{
 const source=row(),record=encodeCanonicalPublicationRow(source),legacy=database([record]),extra=database([]);
 try{
  const old=await privateCanonicalHeader(source,record),sharded=await privateCanonicalHeader(source,record,{archive_slot:'A1'});
  assert.ok(old.canonical_json.endsWith(':canonical_json'));
  const reader=createPrivateCanonicalRestorer({archive_db:legacy,archive_dbs:{A1:extra},db_admit:allow});
  assert.deepEqual(await reader.restore(old),source);
  await assert.rejects(reader.restore(sharded),/EXACT_REVISION_MISSING/);assert.equal(extra.usageSnapshot().requests,1);
  await assert.rejects(reader.restore({...old,canonical_json:sharded.canonical_json}),/MIXED_REVISIONS/);
  await assert.rejects(privateCanonicalHeader(source,record,{archive_slot:'https://foreign.invalid'}),/ARCHIVE_SLOT_INVALID/);
  assert.throws(()=>createPrivateCanonicalRestorer({archive_db:legacy,archive_dbs:{A9:extra},db_admit:allow}),/ARCHIVE_POOL_INVALID/);
 }finally{legacy.sql.close();extra.sql.close();}
});

test('additional archive locations share the original whole-result row and admission limits',async()=>{
 const source=row(),record=encodeCanonicalPublicationRow(source),legacy=database([record]),extra=database([record]);
 try{
  const old=await privateCanonicalHeader(source,record),sharded=await privateCanonicalHeader(source,record,{archive_slot:'A1'});
  const reader=createPrivateCanonicalRestorer({archive_db:legacy,archive_dbs:{A1:extra},db_admit:allow,max_rows:1});
  await assert.rejects(reader.restore([old,sharded]),/READER_ROW_BOUND/);assert.equal(legacy.usageSnapshot().requests+extra.usageSnapshot().requests,0);
  const denied=createPrivateCanonicalRestorer({archive_db:legacy,archive_dbs:{A1:extra},db_admit:()=>({allowed:false})});
  await assert.rejects(denied.restore(sharded),/SHARED_D1_ADMISSION_REQUIRED/);assert.equal(extra.usageSnapshot().requests,0);
 }finally{legacy.sql.close();extra.sql.close();}
});

test('the real report adapter charges additional archive reads exactly once to the shared native usage',async()=>{
 const source=row(),record=encodeCanonicalPublicationRow(source),legacy=database([]),extra=database([record]);
 const header=await privateCanonicalHeader(source,record,{archive_slot:'A1'});
 const native=new RemoteD1Database('https://example.invalid/bridge','test-token',{fetchImpl:async()=>Response.json({ok:true,result:header,usage:{measured:true,rows_read:1,rows_written:0}})});
 try{
  native.enablePrivateCanonicalHistory({archive_db:legacy,archive_dbs:{A1:extra},db_admit:allow});
  assert.deepEqual(await native.prepare('SELECT * FROM canonical_publication_shadow').first(),source);
  const usage=native.usageSnapshot();assert.equal(usage.rows_read,2);assert.equal(usage.requests,2);assert.equal(usage.targets['private-canonical:report2_canonical_cold_archive_v1:A1'].requests,1);
  await native.prepare('SELECT * FROM canonical_publication_shadow').first();assert.equal(native.usageSnapshot().requests,3);assert.equal(extra.usageSnapshot().requests,1);assert.equal(legacy.usageSnapshot().requests,0);
  assert.throws(()=>new RemoteD1Database('https://example.invalid/bridge','test-token').enablePrivateCanonicalHistory({archive_db:legacy,archive_dbs:{A1:{prepare(){}}},db_admit:allow}),/NATIVE_COUNTERS_REQUIRED/);
 }finally{legacy.sql.close();extra.sql.close();}
});

test('Worker-compatible private decoder and exact header restore keep saved OP original bytes and all clocks',async()=>{
 const source=row({future_column:'00001.00'}),record=encodeCanonicalPublicationRow(source),db=database([record]);
 try{
  assert.deepEqual(await decodePrivateCanonicalRecord(record),source);
  const header=await privateCanonicalHeader(source,record);assert(header.canonical_json.startsWith('R2PRIVATE_CANONICAL_V1:'));
  const restorer=createPrivateCanonicalRestorer({archive_db:db,db_admit:allow});
  assert.deepEqual(await restorer.restore(header),source);assert.deepEqual(await restorer.restore([header,header]),[source,source]);
  assert.equal(db.usageSnapshot().requests,1);assert.equal(restorer.usage().private_revision_reads,1);assert.equal(restorer.usage().sourceHTTP,0);
  const original=JSON.parse(source.canonical_json),restored=JSON.parse((await restorer.restore(header)).canonical_json);
  const forecast=c=>buildLiquidationForecastSnapshot({contract:source.contract_code,run_id:source.run_id,liquidations:c.liquidations,observed_ts:source.observed_ts,reference_price:c.liquidations?.current_price});
  assert.deepEqual(forecast(restored),forecast(original));assert.equal(restored.observed_ts,candidate.observed_ts);
 }finally{db.sql.close();}
});

test('private revisions never select latest or mix presentation bytes across the same publication',async()=>{
 const a=row(),b=row({telegram_text:'другая исходная версия\n'.repeat(30)}),ra=encodeCanonicalPublicationRow(a),rb=encodeCanonicalPublicationRow(b),db=database([ra,rb]);
 try{
  const ha=await privateCanonicalHeader(a,ra),hb=await privateCanonicalHeader(b,rb),r=createPrivateCanonicalRestorer({archive_db:db,db_admit:allow});
  assert.deepEqual(await r.restore(ha),a);assert.deepEqual(await r.restore(hb),b);
  await assert.rejects(r.restore({...ha,telegram_text:hb.telegram_text}),/MIXED_REVISIONS/);
  await assert.rejects(r.restore({...ha,publication_id:'PUB:'+'f'.repeat(40)}),/QUERY_BINDING_MISMATCH/);
  await assert.rejects(r.restore({...ha,canonical_json:ha.manual_text}),/COLUMN_LOCATOR_INVALID/);
  await assert.rejects(privateCanonicalHeader(a,rb),/HEADER_REVISION_MISMATCH/);
 }finally{db.sql.close();}
});

test('private read needs exact revision, admission and a bounded number of unique rows; failed replies are not retried',async()=>{
 const source=row(),record=encodeCanonicalPublicationRow(source),header=await privateCanonicalHeader(source,record),db=database([]);
 try{
  const denied=createPrivateCanonicalRestorer({archive_db:db,db_admit:()=>({allowed:false})});await assert.rejects(denied.restore(header),/SHARED_D1_ADMISSION_REQUIRED/);assert.equal(db.usageSnapshot().requests,0);
  const r=createPrivateCanonicalRestorer({archive_db:db,db_admit:allow,max_rows:1});
  await assert.rejects(r.restore(header),/EXACT_REVISION_MISSING/);await assert.rejects(r.restore(header),/EXACT_REVISION_MISSING/);assert.equal(db.usageSnapshot().requests,1);
  const otherRow=row({telegram_text:'другая исходная ревизия\n'.repeat(30)}),other=await privateCanonicalHeader(otherRow,encodeCanonicalPublicationRow(otherRow));await assert.rejects(r.restore(other),/READER_ROW_BOUND/);
  await assert.rejects(r.restore(header.canonical_json),/COLUMN_CONTEXT_REQUIRED/);
 }finally{db.sql.close();}
});

test('compressed corruption and a forged small manifest cannot inflate beyond the declared bound',async()=>{
 const r=encodeCanonicalPublicationRow(row());await assert.rejects(decodePrivateCanonicalRecord({...r,gzip_sha256:'0'.repeat(64)}),/COMPRESSED_HASH_MISMATCH/);
 const bytes=gzipSync(Buffer.alloc(4_000_001,97)),bomb={...r,raw_bytes:4_000_000,gzip_bytes:bytes.length,payload_gzip_base64:bytes.toString('base64'),gzip_sha256:createHash('sha256').update(bytes).digest('hex')};
 await assert.rejects(decodePrivateCanonicalRecord(bomb),/DECOMPRESSION_BOUND/);
 await assert.rejects(decodePrivateCanonicalRecord({...r,run_id:'foreign'}),/MANIFEST_BINDING_MISMATCH/);
});

test('actual adapter readthrough includes private native usage once and preserves SQL projection',async()=>{
 const source=row(),record=encodeCanonicalPublicationRow(source),header=await privateCanonicalHeader(source,record),db=database([record]);
 const projection={publication_id:header.publication_id,canonical_json:header.canonical_json};
 const native=new RemoteD1Database('https://example.invalid/bridge','test-token',{fetchImpl:async()=>new Response(JSON.stringify({ok:true,result:projection,usage:{measured:true,rows_read:1,rows_written:0}}))});
 native.enablePrivateCanonicalHistory({archive_db:db,db_admit:allow});
 try{
  assert.deepEqual(await native.prepare('SELECT publication_id,canonical_json FROM canonical_publication_shadow WHERE publication_id=?1').bind(source.publication_id).first(),{publication_id:source.publication_id,canonical_json:source.canonical_json});
  assert.deepEqual(native.usageSnapshot().targets['private-canonical:report2_canonical_cold_archive_v1'],{requests:1,rows_read:1,rows_written:0,unknown_ops:0});assert.equal(native.usageSnapshot().requests,2);assert.equal(native.usageSnapshot().rows_read,2);
  await native.prepare('SELECT publication_id,canonical_json FROM canonical_publication_shadow').first();assert.equal(native.usageSnapshot().requests,3);assert.equal(db.usageSnapshot().requests,1);
 }finally{db.sql.close();}
});

test('private read rejection never turns a measured primary reply into an unmeasured primary operation',async()=>{
 const record=encodeCanonicalPublicationRow(row()),header=await privateCanonicalHeader(row(),record),db=database([]);
 const native=new RemoteD1Database('https://example.invalid/bridge','test-token',{fetchImpl:async()=>new Response(JSON.stringify({ok:true,result:header,usage:{measured:true,rows_read:1,rows_written:0}}))});
 native.enablePrivateCanonicalHistory({archive_db:db,db_admit:allow});
 try{await assert.rejects(native.prepare('SELECT * FROM canonical_publication_shadow').first(),/EXACT_REVISION_MISSING/);assert.equal(native.usageSnapshot().unknown_ops,0);assert.equal(native.usageSnapshot().requests,2);}finally{db.sql.close();}
});

test('D1 first(column) returns the original scalar with one measured private read',async()=>{
 const source=row(),record=encodeCanonicalPublicationRow(source),header=await privateCanonicalHeader(source,record),db=database([record]);
 const native=new RemoteD1Database('https://example.invalid/bridge','test-token',{fetchImpl:async()=>new Response(JSON.stringify({ok:true,result:header.canonical_json,usage:{measured:true,rows_read:1,rows_written:0}}))});
 native.enablePrivateCanonicalHistory({archive_db:db,db_admit:allow});
 try{assert.equal(await native.prepare('SELECT canonical_json FROM canonical_publication_shadow').first('canonical_json'),source.canonical_json);assert.equal(native.usageSnapshot().requests,2);assert.equal(native.usageSnapshot().unknown_ops,0);}finally{db.sql.close();}
});

test('an oversized whole result refuses before any partial archive read and preserves exact four-row reuse',async()=>{
 const originals=Array.from({length:5},(_,i)=>row({telegram_text:`исходная ревизия ${i}\n`.repeat(30)})),records=originals.map(encodeCanonicalPublicationRow),headers=await Promise.all(originals.map((r,i)=>privateCanonicalHeader(r,records[i]))),db=database(records),grants=[];
 try{
  const restorer=createPrivateCanonicalRestorer({archive_db:db,db_admit:r=>{grants.push(r);return{allowed:true};}});
  await assert.rejects(restorer.restore(headers),/READER_ROW_BOUND/);assert.equal(db.usageSnapshot().requests,0);assert.equal(grants.length,0);assert.equal(restorer.usage().private_revision_reads,0);
  assert.deepEqual(await restorer.restore(headers.slice(0,4)),originals.slice(0,4));assert.equal(db.usageSnapshot().requests,4);
  assert.deepEqual(await restorer.restore([headers[0],headers[0]]),[originals[0],originals[0]]);assert.equal(db.usageSnapshot().requests,4);
  await assert.rejects(restorer.restore(headers[4]),/READER_ROW_BOUND/);assert.equal(db.usageSnapshot().requests,4);assert.equal(restorer.usage().source_clocks_refreshed,false);
 }finally{db.sql.close();}
});

test('the real adapter keeps measured primary cost when archive preflight refuses the entire result',async()=>{
 const originals=Array.from({length:5},(_,i)=>row({telegram_text:`исходный текст ${i}\n`.repeat(30)})),records=originals.map(encodeCanonicalPublicationRow),headers=await Promise.all(originals.map((r,i)=>privateCanonicalHeader(r,records[i]))),db=database(records);
 const native=new RemoteD1Database('https://example.invalid/bridge','test-token',{fetchImpl:async()=>new Response(JSON.stringify({ok:true,result:{results:headers},usage:{measured:true,rows_read:5,rows_written:0}}))});
 native.enablePrivateCanonicalHistory({archive_db:db,db_admit:allow});
 try{await assert.rejects(native.prepare('SELECT * FROM canonical_publication_shadow LIMIT 12').all(),/READER_ROW_BOUND/);assert.equal(db.usageSnapshot().requests,0);assert.equal(native.usageSnapshot().requests,1);assert.equal(native.usageSnapshot().rows_read,5);assert.equal(native.usageSnapshot().unknown_ops,0);}finally{db.sql.close();}
});
