import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';
import {encodeCanonicalPublicationRow} from '../../runner/canonical-cold-archive.mjs';
import {privateCanonicalHeader,createPrivateCanonicalRestorer} from '../../current-generation/files/src/private-canonical-history.mjs';
import {nativeMeasuredD1} from './native-measured-d1.mjs';
import {runPrivateForecastConsumer,reservePrivateForecastBudget,PRIVATE_FORECAST_POLICY} from './private-forecast-consumer.mjs';

const report=JSON.parse(gunzipSync(fs.readFileSync(new URL('../../checkpoints/private-copy-natural-38474226393/report2-run-result.json.gz',import.meta.url))));
const candidate=report.candidates.find(c=>c.contract==='QNT-USDT'),T=candidate.observed_ts;
const ledger=`CREATE TABLE report2_runner_budget_ledger_shadow(reservation_id TEXT PRIMARY KEY,day_utc TEXT,reserve_rows_read INTEGER,reserve_rows_written INTEGER,state TEXT,started_ts INTEGER,completed_ts INTEGER,source_run_id TEXT,measured_rows_read INTEGER,measured_rows_written INTEGER,measured_requests INTEGER,unknown_ops INTEGER);`;
const sourceSchema=ledger+`CREATE TABLE canonical_publication_shadow(publication_id TEXT PRIMARY KEY,run_id TEXT,snapshot_id TEXT,contract_code TEXT,observed_ts INTEGER,analytical_fingerprint TEXT,canonical_json TEXT,presentation_inputs_json TEXT,manual_text TEXT,telegram_text TEXT);`;
class D1{
 constructor(schema){this.raw=new DatabaseSync(':memory:');this.raw.exec(schema);this.calls=0;this.fail=null;this.bytes=16384;}
 prepare(sql){const db=this;let args=[];return{bind(...a){args=a;return this;},async all(){db.calls++;if(db.fail)throw Error(db.fail);const rows=db.raw.prepare(sql).all(...args);return{success:true,results:rows,meta:{rows_read:rows.length,rows_written:0,size_after:db.bytes}};},async run(){db.calls++;if(db.fail)throw Error(db.fail);const r=db.raw.prepare(sql).run(...args);return{success:true,results:[],meta:{rows_read:0,rows_written:Number(r.changes),changes:Number(r.changes),size_after:db.bytes}};}};}
 close(){this.raw.close();}
}
function original(){return{publication_id:candidate.publication_id,run_id:candidate.run_id,snapshot_id:candidate.snapshot_id,contract_code:candidate.contract,observed_ts:T,analytical_fingerprint:candidate.canonical.analytical_fingerprint,canonical_json:JSON.stringify(candidate.canonical),presentation_inputs_json:'{}',manual_text:candidate.manual_text,telegram_text:'original Telegram bytes\n'.repeat(30)};}
function setup(){const source=new D1(sourceSchema),archive=new D1(fs.readFileSync(new URL('./002_liq_forecast_archive.sql',import.meta.url),'utf8')),privateDB=new D1(fs.readFileSync(new URL('./003_canonical_cold_archive.sql',import.meta.url),'utf8'));return{source,archive,privateDB,close(){source.close();archive.close();privateDB.close();}};}
function storeSource(db,row){const cols=Object.keys(row);db.raw.prepare('INSERT INTO canonical_publication_shadow('+cols.join(',')+') VALUES('+cols.map(()=>'?').join(',')+')').run(...Object.values(row));}
function storePrivate(db,record){db.raw.prepare('INSERT INTO report2_canonical_cold_archive_v1 VALUES(?,?,?,?,?,?,?,?)').run(record.publication_id,record.raw_sha256,record.run_id,record.snapshot_id,record.contract_code,record.observed_ts,JSON.stringify(record),T+1);}
const run=s=>runPrivateForecastConsumer({source_db:s.source,archive_db:s.archive,private_db:s.privateDB,scheduled_ts:T+60000,clock:()=>T+60000});

test('actual original QNT forecast is byte-identical through hot and exact private source consumers',async()=>{
 const hot=setup(),cold=setup(),row=original(),record=encodeCanonicalPublicationRow(row);
 const previous=globalThis.fetch;globalThis.fetch=()=>{throw Error('NO_PROVIDER_CALLS');};
 try{
  storeSource(hot.source,row);storeSource(cold.source,await privateCanonicalHeader(row,record));storePrivate(cold.privateDB,record);
  const a=await run(hot),b=await run(cold);
  assert.equal(a.status,'ARCHIVED');assert.equal(b.status,'ARCHIVED');assert.equal(a.recorded,1);assert.equal(b.private_rows_restored,1);
  const query='SELECT payload_json,payload_sha256,observed_ts,status FROM report2_liq_forecast_archive_v1';
  assert.deepEqual(cold.archive.raw.prepare(query).get(),hot.archive.raw.prepare(query).get());
  assert.equal(b.private_D1.requests,1);assert.equal(b.private_D1.rows_read,1);assert.equal(b.D1.unknown_ops,0);assert.equal(b.sourceHTTP,0);assert.equal(b.report_effect,false);assert.equal(b.weight_effect,false);
  assert.equal(cold.source.raw.prepare('SELECT canonical_json FROM canonical_publication_shadow').get().canonical_json,(await privateCanonicalHeader(row,record)).canonical_json);
 }finally{globalThis.fetch=previous;hot.close();cold.close();}
});

test('forecast consumer restores an installed additional archive and includes its cost in the existing reservation',async()=>{
 const s=setup(),extra=new D1(fs.readFileSync(new URL('./003_canonical_cold_archive.sql',import.meta.url),'utf8')),row=original(),record=encodeCanonicalPublicationRow(row);
 try{
  storeSource(s.source,await privateCanonicalHeader(row,record,{archive_slot:'A1'}));storePrivate(extra,record);
  const r=await runPrivateForecastConsumer({source_db:s.source,archive_db:s.archive,private_db:s.privateDB,private_dbs:{A1:extra},scheduled_ts:T+60000,clock:()=>T+60000});
  assert.equal(r.status,'ARCHIVED');assert.equal(r.private_rows_restored,1);assert.equal(r.private_D1.requests,1);assert.equal(r.D1.unknown_ops,0);assert.equal(s.privateDB.calls,0);assert.equal(extra.calls,1);
  const saved=s.source.raw.prepare('SELECT measured_rows_read,reserve_rows_read FROM report2_runner_budget_ledger_shadow').get();assert.equal(saved.reserve_rows_read,5000);assert.equal(saved.measured_rows_read,r.finalized_usage.measured_rows_read);assert.equal(saved.measured_rows_read,r.D1.rows_read);
 }finally{s.close();extra.close();}
});

test('unavailable private revision keeps cursor retryable; next hour restores rather than permanently skipping it',async()=>{
 const s=setup(),row=original(),record=encodeCanonicalPublicationRow(row);
 try{
  storeSource(s.source,await privateCanonicalHeader(row,record));
  const denied=await run(s);assert.equal(denied.status,'FORECAST_RETRY_REQUIRED');assert.equal(denied.cursor_retry_required,true);assert.equal(denied.D1.unknown_ops,0);assert.equal(s.archive.raw.prepare('SELECT COUNT(*) AS n FROM report2_liq_forecast_archive_v1').get().n,0);
  storePrivate(s.privateDB,record);
  const recovered=await runPrivateForecastConsumer({source_db:s.source,archive_db:s.archive,private_db:s.privateDB,scheduled_ts:T+3600000,clock:()=>T+3600000});assert.equal(recovered.status,'ARCHIVED');assert.equal(recovered.recorded,1);
 }finally{s.close();}
});

test('corrupt private bytes never become a skipped forecast, price or refreshed original clock',async()=>{
 const s=setup(),row=original(),record=encodeCanonicalPublicationRow(row);
 try{storeSource(s.source,await privateCanonicalHeader(row,record));storePrivate(s.privateDB,{...record,gzip_sha256:'0'.repeat(64)});const r=await run(s);assert.equal(r.status,'FORECAST_RETRY_REQUIRED');assert.match(r.reason,/COMPRESSED_HASH_MISMATCH/);assert.equal(s.archive.raw.prepare('SELECT COUNT(*) AS n FROM report2_liq_forecast_archive_v1').get().n,0);assert.equal(r.sourceHTTP,0);}finally{s.close();}
});

test('hourly reservation is atomic, keeps both daily caps, and refuses duplicate or unmeasured usage',async()=>{
 for(const existing of [{reads:3500000-5000,writes:0,unknown:0,state:'RESERVED'},{reads:0,writes:70000,unknown:0,state:'RESERVED'},{reads:0,writes:0,unknown:1,state:'FINALIZED'},{reads:0,writes:0,unknown:null,state:'FINALIZED'}]){
  const d=new D1(ledger),db=nativeMeasuredD1(d),day=new Date(T).toISOString().slice(0,10);
  try{
   d.raw.prepare('INSERT INTO report2_runner_budget_ledger_shadow(reservation_id,day_utc,reserve_rows_read,reserve_rows_written,state,started_ts,unknown_ops) VALUES(?,?,?,?,?,?,?)').run('existing',day,existing.reads,existing.writes,existing.state,T,existing.unknown);
   const results=await Promise.all([0,1].map(i=>reservePrivateForecastBudget(db,{scheduled_ts:T+i*3600000,now:T+i*3600000})));
   assert.equal(results.filter(r=>r.allowed).length,existing.reads===3495000?1:0);
   assert.equal((await reservePrivateForecastBudget(db,{scheduled_ts:T,now:T})).allowed,false);
  }finally{d.close();}
 }
});

test('8 historical exact reads are bounded independently of the default 4-row full-report reader',async()=>{
 assert.equal(PRIVATE_FORECAST_POLICY.max_rows,8);
 const s=setup(),db=nativeMeasuredD1(s.privateDB);try{
  assert.throws(()=>createPrivateCanonicalRestorer({archive_db:db,db_admit:()=>({allowed:true}),max_rows:9}),/MEASURED_READER_REQUIRED/);
  const r=createPrivateCanonicalRestorer({archive_db:db,db_admit:()=>({allowed:true}),max_rows:8});
  for(let i=0;i<8;i++){const v=original(),pub='PUB:'+i.toString(16).repeat(40);v.publication_id=pub;const record=encodeCanonicalPublicationRow(v);storePrivate(s.privateDB,record);assert.equal((await r.restore(await privateCanonicalHeader(v,record))).observed_ts,T);}
  assert.equal(r.usage().private_revision_reads,8);assert.equal(db.usageSnapshot().requests,8);
 }finally{s.close();}
});

test('missing native billing or a lost reply remains unknown and is never inferred as zero',async()=>{
 for(const binding of [{prepare:()=>({bind(){return this;},async all(){return{results:[]};}})},{prepare:()=>({bind(){return this;},async all(){throw Error('LOST');}})}]){
  const db=nativeMeasuredD1(binding);await assert.rejects(db.prepare('SELECT 1').first(),/UNMEASURED/);assert.equal(db.usageSnapshot().requests,1);assert.equal(db.usageSnapshot().unknown_ops,1);
 }
});
test('native measured failures preserve known partial reads and writes before refusing further admission',async()=>{
 const replies=[{meta:{rows_read:41}},{meta:{rows_written:7}},{success:false,meta:{rows_read:13,rows_written:5}}];let i=0;
 const db=nativeMeasuredD1({prepare(){return{bind(){return this;},async all(){return replies[i++];}};}});
 for(let k=0;k<3;k++)await assert.rejects(db.prepare('SELECT fixture').first(),/NATIVE_D1_USAGE_UNMEASURED/);
 assert.deepEqual(db.usageSnapshot(),{requests:3,rows_read:54,rows_written:12,unknown_ops:3});
});
