import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomBytes,createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';
import {encodeCanonicalPublicationRow,decodeCanonicalPublicationRow,retainCanonicalPublicationRow,readCanonicalPublicationArchive} from './canonical-cold-archive.mjs';
const report=JSON.parse(gunzipSync(fs.readFileSync(new URL('../checkpoints/n04-shared-header-natural-38438709759/report2-run-result.json.gz',import.meta.url)))),original=report.candidates[0];
function row(extra={}){return{publication_id:original.publication_id,contract_code:original.contract,run_id:original.run_id,snapshot_id:original.snapshot_id,observed_ts:original.observed_ts,analytical_fingerprint:original.canonical.analytical_fingerprint,canonical_json:JSON.stringify(original.canonical,null,2),presentation_inputs_json:'{ "original_spacing": true, "unknown_field": "сохранить" }',manual_text:original.manual_text,telegram_text:null,shadow_only:1,created_ts:original.observed_ts,bound_ts:original.observed_ts+1,...extra};}
function database(){const sqlite=new DatabaseSync(':memory:');sqlite.exec(fs.readFileSync(new URL('../cloudflare/free-history/003_canonical_cold_archive.sql',import.meta.url),'utf8'));return{sqlite,prepare(sql){return{args:[],bind(...a){this.args=a;return this;},async run(){return sqlite.prepare(sql).run(...this.args);},async first(){return sqlite.prepare(sql).get(...this.args)||null;}};}};}
const allow=()=>({allowed:true});
test('saved original report canonical and text survive byte-for-byte; unknown columns are preserved',()=>{
 const source=row({future_column:'future\ncolumn',decimal_string:'000001.00000001'}),record=encodeCanonicalPublicationRow(source),back=decodeCanonicalPublicationRow(record);assert.deepEqual(back,source);assert.equal(back.canonical_json,source.canonical_json);assert.equal(back.presentation_inputs_json,source.presentation_inputs_json);assert.equal(back.manual_text,source.manual_text);assert.ok(record.gzip_bytes<record.raw_bytes);assert.equal(back.observed_ts,original.observed_ts);
});
test('full producer metadata identity is accepted without changing its original JSON',()=>{
 const c={...original.canonical,metadata:{contract:original.contract,raw_sources:{spot:'original spot',futures:'original futures'}}};delete c.contract;
 const source=row({canonical_json:JSON.stringify(c)});assert.deepEqual(decodeCanonicalPublicationRow(encodeCanonicalPublicationRow(source)),source);
 assert.throws(()=>encodeCanonicalPublicationRow(row({canonical_json:JSON.stringify({...c,metadata:{contract:'OTHER-USDT'}})})),/BINDING_MISMATCH/);
});
test('source/manifest identity, content bytes and compressed hash are all checked',()=>{
 const record=encodeCanonicalPublicationRow(row());for(const patch of [{run_id:'foreign'},{observed_ts:record.observed_ts+1},{raw_sha256:'0'.repeat(64)},{gzip_sha256:'0'.repeat(64)},{raw_bytes:record.raw_bytes+1},{payload_gzip_base64:record.payload_gzip_base64+'\n'}])assert.throws(()=>decodeCanonicalPublicationRow({...record,...patch}));
 for(const patch of [{snapshot_id:'foreign'},{observed_ts:1},{analytical_fingerprint:'f'.repeat(64)},{canonical_json:'[]'}])assert.throws(()=>encodeCanonicalPublicationRow(row(patch)));
});
test('large compressible source remains lossless; incompressible and decompression bombs are bounded',()=>{
 const source=row({retained_metadata:'x'.repeat(1000000)}),record=encodeCanonicalPublicationRow(source);assert.equal(decodeCanonicalPublicationRow(record).retained_metadata,source.retained_metadata);
 assert.throws(()=>encodeCanonicalPublicationRow(row({retained_metadata:randomBytes(600000).toString('base64')})),/COMPRESSED_BOUND/);
 const bomb=gzipSync(Buffer.alloc(4000001,97)),manifest={...record,raw_bytes:4000000,gzip_bytes:bomb.length,gzip_sha256:createHash('sha256').update(bomb).digest('hex'),payload_gzip_base64:bomb.toString('base64')};assert.throws(()=>decodeCanonicalPublicationRow(manifest));
});
test('durable readback and exact revision reader preserve original source without latest-only guesses',async()=>{
 const db=database(),a=encodeCanonicalPublicationRow(row()),r=await retainCanonicalPublicationRow(db,a,{db_admit:allow,storage_bytes:100000,now:original.observed_ts+1000});assert.equal(r.status,'ARCHIVE_DURABLE_ORIGINAL_BYTES_CONFIRMED');assert.equal(r.main_deletion_authorized,false);assert.equal(r.report_or_score_effect,false);
 const duplicate=await retainCanonicalPublicationRow(db,a,{db_admit:allow,storage_bytes:400000000});assert.equal(duplicate.status,'ARCHIVE_IDENTICAL_RETAINED');
 const b=encodeCanonicalPublicationRow(row({telegram_text:'A later original bound revision'}));await retainCanonicalPublicationRow(db,b,{db_admit:allow,storage_bytes:100000});assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM report2_canonical_cold_archive_v1').get().n,2);
 for(const version of [a,b]){const found=await readCanonicalPublicationArchive(db,{publication_id:version.publication_id,raw_sha256:version.raw_sha256,db_admit:allow});assert.equal(found.status,'ARCHIVE_ORIGINAL_REVISION_READ');assert.deepEqual(found.row,decodeCanonicalPublicationRow(version));assert.equal(found.source_clocks_refreshed,false);assert.equal(found.live_decision_eligible,false);}
 assert.equal((await readCanonicalPublicationArchive(db,{publication_id:a.publication_id,db_admit:allow})).row,null);db.sqlite.close();
});
test('shared D1 admission and measured storage are required before any new archival write',async()=>{
 const db=database(),record=encodeCanonicalPublicationRow(row());
 for(const options of [{},{storage_bytes:0},{db_admit:allow},{db_admit:()=>({allowed:false}),storage_bytes:0},{db_admit:allow,storage_bytes:400000000}])assert.equal((await retainCanonicalPublicationRow(db,record,options)).retained,false);
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM report2_canonical_cold_archive_v1').get().n,0);assert.equal((await readCanonicalPublicationArchive(db,{publication_id:record.publication_id,raw_sha256:record.raw_sha256})).row,null);db.sqlite.close();
});
test('a different lossless gzip encoding keeps the immutable original row and never overwrites it',async()=>{
 const db=database(),first=encodeCanonicalPublicationRow(row());await retainCanonicalPublicationRow(db,first,{db_admit:allow,storage_bytes:0});
 const alternate=gzipSync(Buffer.from(JSON.stringify(row())),{level:1}),record={...first,gzip_sha256:createHash('sha256').update(alternate).digest('hex'),gzip_bytes:alternate.length,payload_gzip_base64:alternate.toString('base64')};assert.deepEqual(decodeCanonicalPublicationRow(record),row());
 const r=await retainCanonicalPublicationRow(db,record,{db_admit:allow,storage_bytes:0});assert.equal(r.status,'ARCHIVE_IDENTICAL_RETAINED');assert.equal(r.stored_gzip_sha256,first.gzip_sha256);assert.equal(JSON.parse(db.sqlite.prepare('SELECT record_json FROM report2_canonical_cold_archive_v1').get().record_json).gzip_sha256,first.gzip_sha256);db.sqlite.close();
});
