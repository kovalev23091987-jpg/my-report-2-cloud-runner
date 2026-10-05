import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';
import {packHistoryRow,unpackHistoryRow,archivedHeader,retainedSchemaSql,exactArchiveSql,rewriteRetainedSelect,createHistoryRestorer,HISTORY_TABLES} from '../../current-generation/files/src/retained-history.mjs';
const originals=JSON.parse(gunzipSync(Buffer.from(fs.readFileSync(new URL('./actual-history-rows.json.gz.b64',import.meta.url),'utf8').trim(),'base64')).toString());
const commit='a'.repeat(40);
test('actual retained FIL proof and canonical strings restore exactly with immutable clocks and amounts',async()=>{
 const db=new DatabaseSync(':memory:');let calls=0;
 for(const row of originals){
  const table=row.full_evidence_id?'full_evidence_shadow_log':'canonical_publication_shadow';
  const names=Object.keys(row),spec=HISTORY_TABLES[table];
  db.exec(`CREATE TABLE ${table} (${names.map(k=>`${k} ${typeof row[k]==='number'?'REAL':'TEXT'}${k===spec.key?' PRIMARY KEY':''}`).join(',')})`);
  db.prepare(`INSERT INTO ${table} VALUES (${names.map(()=>'?').join(',')})`).run(...Object.values(row));
  const cols=db.prepare(`PRAGMA table_info(${table})`).all();for(const sql of retainedSchemaSql(table,cols))db.exec(sql);
  const packed=packHistoryRow(row),header=archivedHeader(row,{commit,path:packed.path,raw_sha256:packed.envelope.raw_sha256});
  assert.deepEqual(unpackHistoryRow(packed.envelope,packed.envelope.raw_sha256),row);
  const restorer=createHistoryRestorer({fetch_impl:async()=>{calls++;return{ok:true,text:async()=>JSON.stringify(packed.envelope)};},max_fetches:1});
  const plan=exactArchiveSql(table,row,header);db.prepare(plan.insert.sql).run(...plan.insert.params);
  assert.equal(db.prepare(rewriteRetainedSelect(`SELECT COUNT(*) AS n FROM ${table}`)).get().n,1,'copy before delete does not duplicate history');
  assert.deepEqual(await restorer.restore({...db.prepare(plan.read.sql).get(...plan.read.params)}),row);
  assert.equal(db.prepare(plan.remove.sql).run(...plan.remove.params).changes,1);
  const restored=await restorer.restore({...db.prepare(rewriteRetainedSelect(`SELECT * FROM ${table} WHERE ${spec.key}=?1`)).get(row[spec.key])});
  assert.deepEqual(restored,row);
  assert.equal(db.prepare(rewriteRetainedSelect(`SELECT COUNT(*) AS n FROM ${table} WHERE observed_ts>=?1`)).get(row.observed_ts).n,1);
  assert.equal(restorer.usage().archive_http,1);
 }
 assert.equal(calls,2);
});
test('archive bytes, expiry, SQL safety and request budgets never turn a failed read into empty facts',async()=>{
 const row=originals[0],p=packHistoryRow(row);
 assert.throws(()=>unpackHistoryRow({...p.envelope,raw_sha256:'b'.repeat(64)},p.envelope.raw_sha256));
 assert.throws(()=>unpackHistoryRow({...p.envelope,raw_bytes:p.envelope.raw_bytes+1},p.envelope.raw_sha256));
 const h=archivedHeader(row,{commit,path:p.path,raw_sha256:p.envelope.raw_sha256});
 const value=h.stage392_proof_bundle_json;
 const denied=createHistoryRestorer({request_admit:()=>({allowed:false}),fetch_impl:async()=>{throw Error('must not call');}});
 await assert.rejects(denied.restore(value),/ADMISSION/);assert.equal(denied.usage().archive_http,0);
 const missing=createHistoryRestorer({fetch_impl:async()=>({ok:false,status:404})});
 await assert.rejects(missing.restore(value),/404/);
 assert.throws(()=>rewriteRetainedSelect('SELECT json_extract(stage392_proof_bundle_json,\'$.x\') FROM full_evidence_shadow_log'),/EXPLICIT_READER/);
 assert.equal(rewriteRetainedSelect('DELETE FROM full_evidence_shadow_log WHERE observed_ts<?1'),'DELETE FROM full_evidence_shadow_log WHERE observed_ts<?1');
 assert.match(rewriteRetainedSelect('SELECT * FROM full_evidence_shadow_log INDEXED BY idx_full_evidence_shadow_contract_ts WHERE contract_code=?1'),/retained_v1 WHERE/);
});
test('conditional deletion refuses a changed original and hot immutable guard is untouched',()=>{
 const row=originals[0],spec=HISTORY_TABLES.full_evidence_shadow_log,db=new DatabaseSync(':memory:');
 const names=Object.keys(row);db.exec(`CREATE TABLE full_evidence_shadow_log (${names.map(k=>`${k} ${typeof row[k]==='number'?'REAL':'TEXT'}${k===spec.key?' PRIMARY KEY':''}`).join(',')})`);
 db.prepare(`INSERT INTO full_evidence_shadow_log VALUES (${names.map(()=>'?').join(',')})`).run(...Object.values(row));
 const p=packHistoryRow(row),h=archivedHeader(row,{commit,path:p.path,raw_sha256:p.envelope.raw_sha256}),plan=exactArchiveSql('full_evidence_shadow_log',row,h);
 db.prepare('UPDATE full_evidence_shadow_log SET persisted_ts=persisted_ts+1').run();
 assert.equal(db.prepare(plan.remove.sql).run(...plan.remove.params).changes,0);
 db.exec("CREATE TRIGGER immutable BEFORE UPDATE ON full_evidence_shadow_log BEGIN SELECT RAISE(ABORT,'immutable'); END");
 for(const sql of retainedSchemaSql('full_evidence_shadow_log',db.prepare('PRAGMA table_info(full_evidence_shadow_log)').all()))db.exec(sql);
 assert.throws(()=>db.prepare('UPDATE full_evidence_shadow_log SET persisted_ts=0').run(),/immutable/);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM full_evidence_shadow_log').get().n,1);
});
