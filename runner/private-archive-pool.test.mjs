import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {DatabaseSync} from 'node:sqlite';
import {createPrivateArchivePool,retainCanonicalInPool,prefetchCanonicalArchivePool} from './private-archive-pool.mjs';
import {encodeCanonicalPublicationRow} from './canonical-cold-archive.mjs';
import {createPrivateCanonicalRestorer,privateCanonicalHeader,PRIVATE_CANONICAL_DATABASES,privateCanonicalBindings} from './private-canonical-history.mjs';
import {copyCanonicalReport} from './canonical-cold-copy.mjs';
const allow=()=>({allowed:true}),T=1792080000000;
export function measuredDB(schema=true){
 const raw=new DatabaseSync(':memory:');if(schema)raw.exec(fs.readFileSync(new URL('../cloudflare/free-history/003_canonical_cold_archive.sql',import.meta.url),'utf8'));
 const u={requests:0,rows_read:0,rows_written:0,unknown_ops:0},db={raw,storage_bytes:4096,usageSnapshot:()=>({...u}),setUsage:v=>Object.assign(u,v),prepare(sql){let args=[];return{bind(...a){args=a;return this;},async all(){u.requests++;const results=raw.prepare(sql).all(...args).map(r=>({...r}));u.rows_read+=results.length;return{results,success:true,meta:{rows_read:results.length,rows_written:0,size_after:db.storage_bytes}};},async first(){return(await this.all()).results[0]??null;},async run(){u.requests++;const r=raw.prepare(sql).run(...args);u.rows_written+=Number(r.changes);return{results:[],success:true,meta:{changes:Number(r.changes),rows_read:0,rows_written:Number(r.changes),size_after:db.storage_bytes}};}};}};return db;
}
export function original(ch='a'){
 const row={publication_id:'PUB:'+ch.repeat(40),run_id:'original-run',snapshot_id:'snapshot-'+ch,contract_code:'FIL-USDT',observed_ts:T,analytical_fingerprint:ch.repeat(64)};
 return{...row,canonical_json:JSON.stringify({...row,contract:row.contract_code,data:'preserve exact original '.repeat(1200)}),presentation_inputs_json:'{ "original" : true }',manual_text:'исходный текст '.repeat(40),telegram_text:'исходный Telegram '.repeat(40),decimal:'0001.2300',future_json:JSON.stringify({bytes:'x'.repeat(1024)})};
}
function fixture(){const databases=Object.fromEntries(Object.keys(PRIVATE_CANONICAL_DATABASES).map(s=>[s,measuredDB()]));return{databases,pool:createPrivateArchivePool({enabled:true,databases})};}
function insert(db,r){db.raw.prepare('INSERT INTO report2_canonical_cold_archive_v1 VALUES(?,?,?,?,?,?,?,?)').run(r.publication_id,r.raw_sha256,r.run_id,r.snapshot_id,r.contract_code,r.observed_ts,JSON.stringify(r),T);}
test('runtime exact location IDs match the independently verified resource registry',()=>{
 const registry=JSON.parse(fs.readFileSync(new URL('../cloudflare/free-history/canonical-archive-resource-registry.json',import.meta.url),'utf8'));
 assert.equal(PRIVATE_CANONICAL_DATABASES.LEGACY.uuid,registry.default_existing_archive.uuid);
 for(const d of registry.additional_empty_resources){assert.equal(PRIVATE_CANONICAL_DATABASES[d.slot].uuid,d.uuid);assert.equal(PRIVATE_CANONICAL_DATABASES[d.slot].name,d.name);}
 assert.equal(Object.keys(PRIVATE_CANONICAL_DATABASES).length,5);
});
test('native size routes a full legacy archive to A1; exact location restores every original byte',async()=>{
 const {pool,databases}=fixture(),row=original(),record=encodeCanonicalPublicationRow(row);databases.LEGACY.storage_bytes=400000000;
 const saved=await retainCanonicalInPool(pool,record,{db_admit:allow,request_headroom:allow,now:T});assert.equal(saved.location,'A1');
 const restored=await createPrivateCanonicalRestorer({...pool.readerOptions(),db_admit:allow}).restore(await privateCanonicalHeader(row,record,{archive_slot:'A1'}));assert.deepEqual(restored,row);
 assert.equal(databases.LEGACY.usageSnapshot().rows_written,0);assert.equal(databases.A1.usageSnapshot().rows_written,1);assert.equal(pool.usageSnapshot().rows_written,1);
});
test('exact existing revision on A4 is reused before a different free location can duplicate it',async()=>{
 const {pool,databases}=fixture(),record=encodeCanonicalPublicationRow(original());insert(databases.A4,record);
 const r=await retainCanonicalInPool(pool,record,{db_admit:allow,request_headroom:allow});assert.equal(r.location,'A4');assert.equal(pool.usageSnapshot().rows_written,0);assert.equal(databases.LEGACY.raw.prepare('SELECT COUNT(*) AS n FROM report2_canonical_cold_archive_v1').get().n,0);
});
test('all full, unknown native size, unknown cost and denied HTTP keep every original unwritten',async()=>{
 const record=encodeCanonicalPublicationRow(original());
 for(const kind of ['FULL','SIZE','USAGE','HTTP']){
  const {pool,databases}=fixture();if(kind==='FULL')for(const db of Object.values(databases))db.storage_bytes=400000000;if(kind==='SIZE')databases.LEGACY.storage_bytes=null;
  if(kind==='USAGE')databases.A3.setUsage({unknown_ops:1});
  const db_admit=()=>({allowed:pool.usageSnapshot().unknown_ops===0});
  if(kind==='SIZE')await assert.rejects(retainCanonicalInPool(pool,record,{db_admit,request_headroom:allow}),/NATIVE_STORAGE_SIZE/);
  else{const r=await retainCanonicalInPool(pool,record,{db_admit,request_headroom:()=>({allowed:kind!=='HTTP'})});assert.equal(r.retained,false);}
  assert.equal(pool.usageSnapshot().rows_written,0,kind);
 }
});
test('positive exact prefetch avoids repeated five-location scans, never caches a missing revision',async()=>{
 const {pool,databases}=fixture(),r=encodeCanonicalPublicationRow(original());insert(databases.A3,r);
 const prepared=await prefetchCanonicalArchivePool({pool,revisions:[r],db_admit:allow});const before=pool.usageSnapshot();
 const found=await retainCanonicalInPool(prepared.pool,r,{db_admit:allow,request_headroom:()=>{throw Error('cached read needs no transport');},include_verified_record:true});assert.equal(found.location,'A3');assert.deepEqual(pool.usageSnapshot(),before);
 const later=encodeCanonicalPublicationRow(original('b'));insert(databases.A4,later);const next=await retainCanonicalInPool(prepared.pool,later,{db_admit:allow,request_headroom:allow});assert.equal(next.location,'A4');assert.equal(pool.usageSnapshot().rows_written,0);
});
test('corrupt first hit refuses a valid later hit and duplicate native bindings are rejected',async()=>{
 const {pool,databases}=fixture(),r=encodeCanonicalPublicationRow(original());insert(databases.A1,r);insert(databases.A2,r);databases.A1.raw.prepare("UPDATE report2_canonical_cold_archive_v1 SET record_json='{}'").run();
 await assert.rejects(retainCanonicalInPool(pool,r,{db_admit:allow,request_headroom:allow}));assert.equal(pool.usageSnapshot().rows_written,0);
 assert.throws(()=>createPrivateArchivePool({enabled:true,databases:{...databases,A1:databases.LEGACY}}),/DISTINCT/);
});
test('optional Worker bindings preserve legacy, reject absent required aliases and do not scan spare DBs',async()=>{
 const {databases}=fixture(),env={CANONICAL_ARCHIVE_DB:databases.LEGACY,CANONICAL_ARCHIVE_DB_A2:databases.A2};assert.deepEqual(Object.keys(privateCanonicalBindings(env).archive_dbs),['A2']);assert.throws(()=>privateCanonicalBindings(env,{require_all:true}),/ALL_ARCHIVE_BINDINGS/);assert.equal(databases.A2.usageSnapshot().requests,0);
});
test('automatic two-candidate copy routes into A1 without source modification and reuses its exact revision',async()=>{
 const {pool,databases}=fixture(),row=original(),source=measuredDB(false),cols=Object.keys(row);databases.LEGACY.storage_bytes=400000000;
 source.raw.exec('CREATE TABLE canonical_publication_shadow('+cols.map(k=>k+(k==='observed_ts'?' INTEGER':' TEXT')).join(',')+')');source.raw.prepare('INSERT INTO canonical_publication_shadow VALUES('+cols.map(()=>'?').join(',')+')').run(...Object.values(row));
 const binding=Object.fromEntries(['publication_id','run_id','snapshot_id','contract_code','observed_ts','analytical_fingerprint'].map(k=>[k,row[k]]));
 const out=await copyCanonicalReport({source_db:source,archive_pool:pool,candidates:[binding],now:T});assert.equal(out.records[0].archive_location,'A1');assert.equal(out.records[0].private_reader_verified,true);assert.deepEqual({...source.raw.prepare('SELECT * FROM canonical_publication_shadow').get()},row);
 const before=pool.usageSnapshot().rows_written;await copyCanonicalReport({source_db:source,archive_pool:pool,candidates:[binding],now:T});assert.equal(pool.usageSnapshot().rows_written,before);
});
