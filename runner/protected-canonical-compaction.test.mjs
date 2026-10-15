import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';import {gunzipSync} from 'node:zlib';import {DatabaseSync} from 'node:sqlite';
import {compactProtectedCanonical,PROTECTED_CANONICAL_POLICY as P,exactCanonicalBodyUpdate} from './protected-canonical-compaction.mjs';
import {encodeCanonicalPublicationRow} from './canonical-cold-archive.mjs';
import {createPrivateCanonicalRestorer} from './private-canonical-history.mjs';
import {PrivateArchiveD1API} from './private-archive-d1-api.mjs';import {RemoteD1Database} from './report2-d1-adapter.mjs';
import {createUnifiedHttpBudget} from '../current-generation/files/src/unified-budget.mjs';import {LOSSLESS_RECOVERY_POLICY,reserveLosslessRecoveryBudget} from './lossless-full-evidence-recovery.mjs';import {finalizeRunUsage} from './d1-preaction-budget-guard.mjs';
import bridge from '../current-generation/tests/fixtures/actual-d1-bridge-20261008.mjs';
const now=1792026000000,DAY=86400000,allow=()=>({allowed:true}),headroom=()=>true;
const original=JSON.parse(gunzipSync(fs.readFileSync(new URL('../checkpoints/storage-recovery-natural-38638248237/report2-run-result.json.gz',import.meta.url)))).candidates[0];
const schema=JSON.parse(fs.readFileSync(new URL('../audit-fixes/t00/fixtures/d1-schema.json',import.meta.url),'utf8')).rows;
function wrap(raw){let usage={requests:0,rows_read:0,rows_written:0,unknown_ops:0};const calls=[];const db={raw,calls,usageSnapshot:()=>({...usage}),setUsage:u=>{usage={...usage,...u};},prepare(sql){return{sql,args:[],bind(...args){this.args=args;return this;},async all(){calls.push(sql);const results=raw.prepare(sql).all(...this.args).map(r=>({...r}));usage.requests++;usage.rows_read+=results.length;return{results,success:true,meta:{changes:0,rows_read:results.length,rows_written:0,size_after:100000}};},async first(){return(await this.all()).results[0]??null;},async run(){calls.push(sql);const r=raw.prepare(sql).run(...this.args);usage.requests++;usage.rows_written+=Number(r.changes);return{results:[],success:true,meta:{changes:Number(r.changes),rows_read:0,rows_written:Number(r.changes),size_after:100000}};}};},async batch(statements){raw.exec('BEGIN');try{const rows=[];for(const s of statements)rows.push(await (/^\s*SELECT\b/i.test(s.sql)?s.all():s.run()));raw.exec('COMMIT');return rows;}catch(error){raw.exec('ROLLBACK');throw error;}}};return db;}
function fixture(count=2){
 const raw=new DatabaseSync(':memory:');
 for(const name of ['canonical_publication_shadow','v3_recheck_task_shadow','v3_dispatch_publication_binding_shadow','v3_user_lifecycle_shadow'])raw.exec(schema.find(r=>r.type==='table'&&r.name===name).sql);
 raw.exec(fs.readFileSync(new URL('../current-generation/migrations/007_commands_delivery.sql',import.meta.url),'utf8'));raw.exec(fs.readFileSync(new URL('../current-generation/migrations/008_outcomes_calibration_v2.sql',import.meta.url),'utf8'));
 raw.exec('ALTER TABLE canonical_publication_shadow ADD COLUMN future_json TEXT;ALTER TABLE canonical_publication_shadow ADD COLUMN decimal_string TEXT');
 const coldraw=new DatabaseSync(':memory:');coldraw.exec(fs.readFileSync(new URL('../cloudflare/free-history/003_canonical_cold_archive.sql',import.meta.url),'utf8'));
 const source_db=wrap(raw),archive_db=wrap(coldraw);archive_db.storage_bytes=100000;
 function add(id,extra={}){
  const ts=now-(id+3)*DAY,pub='PUB:'+id.toString(16).padStart(40,'0'),c=structuredClone(original.canonical);c.run_id='old-run:'+id;c.snapshot_id='old-snapshot:'+id;c.observed_ts=ts;c.state='REJECTED';c.metadata={...(c.metadata||{}),contract:original.contract,test_padding:'x'.repeat(25000)};
  const row={publication_id:pub,contract_code:original.contract,direction:'SHORT',run_id:c.run_id,snapshot_id:c.snapshot_id,wave_id:null,decision_id:'decision:'+id,observed_ts:ts,valid_until_ts:null,lifecycle_event:null,canonical_state:'REJECTED',analytical_fingerprint:c.analytical_fingerprint,canonical_json:JSON.stringify(c,null,2),presentation_inputs_json:'{ "preserve_spaces": true }',manual_text:'Оригинальная строка\n'.repeat(30),telegram_text:null,presentation_hash:null,actionability_status:'UNASSESSED',actionability_reason:null,created_ts:ts,bound_ts:null,shadow_only:1,future_json:JSON.stringify({data:'z'.repeat(1200)}),decimal_string:'00001.2300',...extra};
  raw.prepare('INSERT INTO canonical_publication_shadow('+Object.keys(row).join(',')+') VALUES('+Object.keys(row).map(()=>'?').join(',')+')').run(...Object.values(row));return row;
 }
 const old=Array.from({length:count},(_,i)=>add(i+1));const latest=add(count+1,{observed_ts:now-1000,created_ts:now-1000}),rare=add(count+2,{contract_code:'RARE-USDT'});
 return{source_db,archive_db,raw,coldraw,old,latest,rare,add};
}
const get=(f,id)=>({...f.raw.prepare('SELECT * FROM canonical_publication_shadow WHERE publication_id=?').get(id)});
const compact=(f,options={})=>compactProtectedCanonical({...f,archive_headroom:headroom,before_modify:async()=>{},now,...options});
function archiveAll(f){for(const row of f.old){const r=encodeCanonicalPublicationRow(row);f.coldraw.prepare('INSERT INTO report2_canonical_cold_archive_v1 VALUES(?,?,?,?,?,?,?,?)').run(r.publication_id,r.raw_sha256,r.run_id,r.snapshot_id,r.contract_code,r.observed_ts,JSON.stringify(r),now);}}
test('saved REJECTED bodies use exact private native originals; preparation leaves every primary byte unchanged',async()=>{
 const f=fixture(),before=f.raw.prepare('SELECT * FROM canonical_publication_shadow ORDER BY publication_id').all();const r=await compact(f);
 assert.equal(r.prepared,2);assert.equal(r.compacted.length,0);assert.deepEqual(f.raw.prepare('SELECT * FROM canonical_publication_shadow ORDER BY publication_id').all(),before);assert.equal(f.coldraw.prepare('SELECT COUNT(*) AS n FROM report2_canonical_cold_archive_v1').get().n,2);assert.equal(r.sourceHTTP,0);assert.equal(r.history_discarded,false);assert.ok(!JSON.stringify(r).includes('payload_gzip_base64'));
});
test('body-only conditional compaction preserves ids, unknown scalars, latest/rare originals, source clocks and native readthrough',async()=>{
 const f=fixture();const r=await compact(f,{execute:true});assert.equal(r.compacted.length,2);assert.equal(r.native_readbacks.length,2);
 const reader=createPrivateCanonicalRestorer({archive_db:f.archive_db,db_admit:allow});for(const row of f.old){const hot=get(f,row.publication_id);assert.ok(hot.canonical_json.startsWith('R2PRIVATE_CANONICAL_V1:'));assert.deepEqual(await reader.restore(hot),row);assert.equal(hot.decimal_string,'00001.2300');assert.equal(hot.observed_ts,row.observed_ts);}
 assert.deepEqual(get(f,f.latest.publication_id),f.latest);assert.deepEqual(get(f,f.rare.publication_id),f.rare);assert.equal(f.raw.prepare('SELECT COUNT(*) AS n FROM canonical_publication_shadow').get().n,4);assert.equal(r.reference_or_statistic_rows_modified,0);assert.equal(r.publication_rows_deleted,0);assert.equal(r.physical_database_free_bytes_measured,false);
});
test('the actual schema protects every ENTRY, ACTIONABLE, current command, delivered/outcome, recheck and lifecycle reference',async()=>{
 for(const kind of ['ENTRY','ACTIONABLE','FRESH','LATEST_RARE','COMMAND','PUBLICATION','OUTCOME','RECHECK','RESULT_REFERENCE','BINDING','LIFECYCLE']){
  const f=fixture(1),r=f.old[0],pub=r.publication_id;
  if(kind==='ENTRY')f.raw.prepare("UPDATE canonical_publication_shadow SET lifecycle_event='ENTRY' WHERE publication_id=?").run(pub);
  if(kind==='ACTIONABLE')f.raw.prepare("UPDATE canonical_publication_shadow SET actionability_status='ACTIONABLE' WHERE publication_id=?").run(pub);
  if(kind==='FRESH')f.raw.prepare('UPDATE canonical_publication_shadow SET created_ts=? WHERE publication_id=?').run(now-1000,pub);
  if(kind==='LATEST_RARE')f.raw.prepare('UPDATE canonical_publication_shadow SET contract_code=? WHERE publication_id=?').run('ONLY-USDT',pub);
  if(kind==='COMMAND')f.raw.prepare("INSERT INTO report2_command_v2 VALUES('cmd','FULL',NULL,'MANUAL',1,2,'gen','COMPLETED',NULL,NULL,?,NULL,NULL,1)").run(r.snapshot_id);
  if(kind==='PUBLICATION')f.raw.prepare("INSERT INTO report2_publication_v2 VALUES(?,?,'snap','wave','BTW-USDT','SHORT','OBSERVE','gen','text','hash',1)").run(pub,r.run_id);
  if(kind==='OUTCOME')f.raw.prepare("INSERT INTO report2_delivered_outcome_v2 VALUES('sample','gen','wave','SHORT',?,'dispatch',1,1,1,1,'PENDING',1)").run(pub);
  if(['RECHECK','RESULT_REFERENCE'].includes(kind))f.raw.prepare("INSERT INTO v3_recheck_task_shadow(task_id,publication_id,contract_code,direction,wave_id,snapshot_id,run_id,due_ts,expires_ts,state,last_result,created_ts,updated_ts) VALUES('task',?,?,'SHORT','wave','snap','run',1,2,'DONE',?,1,2)").run(kind==='RECHECK'?pub:'other',r.contract_code,kind==='RESULT_REFERENCE'?JSON.stringify({completed_publication:pub}):null);
  if(kind==='BINDING')f.raw.prepare("INSERT INTO v3_dispatch_publication_binding_shadow(idempotency_key,publication_id,contract_code,direction,wave_id,lifecycle_event,rules_version,snapshot_id,run_id,observed_ts,analytical_fingerprint,presentation_hash,created_ts) VALUES('key',?,?,'SHORT','wave','OBSERVE','v','snap','run',1,'hash','hash',1)").run(pub,r.contract_code);
  if(kind==='LIFECYCLE')f.raw.prepare("INSERT INTO v3_user_lifecycle_shadow VALUES(?,'SHORT','wave','v','WAIT','reason',?,NULL,1,1)").run(r.contract_code,r.observed_ts);
  const before=get(f,pub),result=await compact(f,{execute:true});assert.equal(result.compacted.length,0,kind);assert.deepEqual(get(f,pub),before,kind);assert.equal(f.archive_db.usageSnapshot().requests,0,kind);
 }
});
test('a newly added protected reference or changed original after copy prevents that primary update',async()=>{
 for(const kind of ['SCALAR','REFERENCE']){const f=fixture(1),id=f.old[0].publication_id;const r=await compact(f,{execute:true,before_modify:async()=>{if(kind==='SCALAR')f.raw.prepare('UPDATE canonical_publication_shadow SET decimal_string=? WHERE publication_id=?').run('00002.00',id);else f.raw.prepare("INSERT INTO report2_delivered_outcome_v2 VALUES('sample','gen','wave','SHORT',?,'dispatch',1,1,1,1,'PENDING',1)").run(id);}});assert.equal(r.compacted.length,0);assert.deepEqual(r.conflicts_retained_hot,[id]);assert.ok(!get(f,id).canonical_json.startsWith('R2PRIVATE_CANONICAL_V1:'));assert.equal(f.coldraw.prepare('SELECT COUNT(*) AS n FROM report2_canonical_cold_archive_v1').get().n,1);}
});
test('corruption, missing reference schema, unknown cost and storage guard never replace an unverified original',async()=>{
 for(const kind of ['CORRUPT','SCHEMA','UNKNOWN','STORAGE']){const f=fixture(1),before=get(f,f.old[0].publication_id);if(kind==='CORRUPT'){archiveAll(f);f.coldraw.prepare("UPDATE report2_canonical_cold_archive_v1 SET record_json='{}'").run();}if(kind==='SCHEMA')f.raw.exec('DROP TABLE report2_delivered_outcome_v2');if(kind==='UNKNOWN')f.archive_db.setUsage({unknown_ops:1});if(kind==='STORAGE')f.archive_db.storage_bytes=400000000;
  if(kind==='STORAGE'){const r=await compact(f,{execute:true});assert.equal(r.compacted.length,0);assert.ok(r.deferred_hot.some(r=>r.reason==='ARCHIVE_STORAGE_GUARD_REACHED'));}else await assert.rejects(compact(f,{execute:true}));assert.deepEqual(get(f,before.publication_id),before,kind);
 }
});
test('transaction failure rolls back the complete group while every private original remains immutable',async()=>{
 const f=fixture();f.raw.exec(`CREATE TRIGGER update_failure BEFORE UPDATE ON canonical_publication_shadow WHEN NEW.publication_id='${f.old[0].publication_id}' BEGIN SELECT RAISE(ABORT,'CONTROLLED_CAPACITY'); END`);
 await assert.rejects(compact(f,{execute:true}),e=>{assert.match(e.message,/CONTROLLED_CAPACITY/);assert.equal(e.compaction_receipt.compacted.length,0);return true;});for(const row of f.old)assert.deepEqual(get(f,row.publication_id),row);assert.equal(f.coldraw.prepare('SELECT COUNT(*) AS n FROM report2_canonical_cold_archive_v1').get().n,2);
});
test('existing exact revisions are reused without additional writes and repeated compaction does not nest archive markers',async()=>{
 const f=fixture();archiveAll(f);const r=await compact(f,{execute:true});assert.equal(r.compacted.length,2);assert.equal(f.archive_db.usageSnapshot().rows_written,0);const before=f.archive_db.usageSnapshot().requests;const repeated=await compact(f,{execute:true});assert.equal(repeated.compacted.length,0);assert.equal(f.archive_db.usageSnapshot().requests,before);
 assert.throws(()=>exactCanonicalBodyUpdate(f.old[0],{...f.old[0],observed_ts:1},now-2*DAY),/ONLY_ORIGINAL_BODY_COLUMNS/);
});
test('opt-in grouped copies retain four independent private readbacks and every protected original',async()=>{
 const f=fixture(48);archiveAll(f);
 const r=await compact(f,{execute:true,prefetch_private:true});
 assert.equal(r.compacted.length,48);assert.equal(r.private_prefetch.cached,48);assert.equal(r.native_readbacks.length,4);
 const expected=r.private_prefetch.metadata_queries+r.private_prefetch.body_queries+4;
 assert.equal(f.archive_db.usageSnapshot().requests,expected);assert.ok(expected<52);assert.equal(f.archive_db.usageSnapshot().rows_written,0);
 assert.deepEqual(get(f,f.latest.publication_id),f.latest);assert.deepEqual(get(f,f.rare.publication_id),f.rare);
 assert.equal(r.private_prefetch.native_production_cost_qualified,false);assert.equal(r.history_discarded,false);
 const reader=createPrivateCanonicalRestorer({archive_db:f.archive_db,db_admit:allow,max_rows:8});
 assert.deepEqual(await reader.restore(f.old.slice(0,8).map(row=>get(f,row.publication_id))),f.old.slice(0,8));
});
test('all48 pre-copied originals share the real bridge/private HTTP and D1 reservation; cold backlog stops before manual headroom',async()=>{
 const cases=[];
 for(const precopied of [true,false]){
  const f=fixture(48);if(precopied)archiveAll(f);f.raw.exec('CREATE TABLE report2_runner_budget_ledger_shadow(reservation_id TEXT PRIMARY KEY,day_utc TEXT,reserve_rows_read INTEGER,reserve_rows_written INTEGER,state TEXT,started_ts INTEGER,unknown_ops INTEGER DEFAULT 0,source_run_id TEXT,measured_rows_read INTEGER,measured_rows_written INTEGER,measured_requests INTEGER,completed_ts INTEGER)');
  const budget=createUnifiedHttpBudget(LOSSLESS_RECOVERY_POLICY.http_limits);budget.reserve({logical_request_id:'ALL_GITHUB_CONTROL',lane:'hot',attempts:40});let primaryHTTP=0,privateHTTP=0;
  const source_db=new RemoteD1Database('https://bridge.invalid/d1','fixture-token',{beforeRequest:e=>{assert.ok(primaryHTTP<16);assert.ok(e.wire_bytes<=P.bridge_wire_bytes);const grant=budget.reserve({logical_request_id:'PRIMARY:'+primaryHTTP,lane:'hot',attempts:1});if(grant.allowed)primaryHTTP++;return grant;},fetchImpl:(u,init)=>bridge.fetch(new Request(u,init),{DATA_DB:f.source_db,REPORT2_CLOUD_BRIDGE_TOKEN:'fixture-token'})});
  const archive_db=new PrivateArchiveD1API({token:'private-fixture-token',beforeRequest:()=>{const grant=budget.reserve({logical_request_id:'PRIVATE:'+privateHTTP,lane:'background',attempts:1});if(grant.allowed)privateHTTP++;return grant;},fetch_impl:async(url,init)=>{if(!url.endsWith('/query'))return new Response(JSON.stringify({success:true,result:{uuid:'f66e7081-0e67-49a2-8f69-68af00cdaf92',name:'report2-free-canonical-history'}}));const {sql,params}=JSON.parse(init.body);const s=f.archive_db.prepare(sql).bind(...params),r=await (/^SELECT/.test(sql)?s.all():s.run());return new Response(JSON.stringify({success:true,result:[r]}));}});
  assert.equal((await reserveLosslessRecoveryBudget(source_db,{reservation_id:'RETAINED_HISTORY:15:15',now})).allowed,true);await archive_db.verifyDatabase();await archive_db.query('SELECT 1 AS size_marker');
  const r=await compactProtectedCanonical({source_db,archive_db,archive_headroom:({max_copy_requests,reserved_native_readbacks})=>{const s=budget.summary();return s.limits.background-s.used.background>=max_copy_requests+reserved_native_readbacks;},before_modify:async()=>{},execute:true,now});
  await finalizeRunUsage(source_db,{reservationId:'RETAINED_HISTORY:15:15',sourceRunId:'15',now,usage:r.D1});
  assert.equal(r.compacted.length,precopied?48:16);assert.equal(r.native_readbacks.length,4);assert.equal(primaryHTTP,precopied?15:11);assert.equal(privateHTTP,54);assert.ok(budget.summary().total<=164);assert.ok(96-budget.summary().used.hot>=24);assert.equal(source_db.usageSnapshot().unknown_ops+archive_db.usageSnapshot().unknown_ops,0);assert.ok(r.D1.rows_read<=5000&&r.D1.rows_written<=400);assert.equal(r.publication_rows_deleted,0);assert.equal(f.raw.prepare('SELECT COUNT(*) AS n FROM canonical_publication_shadow').get().n,50);
  if(!precopied)assert.equal(r.deferred_hot.filter(r=>r.reason==='SHARED_HTTP_HEADROOM').length,32);
  cases.push({pre_copied:precopied,selected:r.selected,compacted:r.compacted.length,retained_hot:r.deferred_hot.length,primary_HTTP:primaryHTTP,private_HTTP:privateHTTP,all_control_HTTP_reserved:40,whole_HTTP:budget.summary(),controlled_SQLite_usage:r.D1,native_production_usage_measured:false,readthrough_native_fixture_sample:r.native_readbacks.length,publication_rows_deleted:r.publication_rows_deleted,history_discarded:r.history_discarded,source_clocks_refreshed:r.source_clocks_refreshed});
 }
 if(process.env.REPORT2_COMPACTION_PROOF_OUTPUT)fs.writeFileSync(process.env.REPORT2_COMPACTION_PROOF_OUTPUT,JSON.stringify({schema:'CONTROLLED_PROTECTED_CANONICAL_TRANSPORT_CASES_V1',cases,sourceHTTP:0,productionD1:0,MAIN:0,Telegram:0,automatic_activation:false},null,2)+'\n');
});
test('unqualified canonical execution stops before authority, transport or native reservations',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'report2-canonical-disabled-'));
 try{const script=`globalThis.fetch=async()=>{throw Error('NO_NETWORK_ALLOWED')};await import(${JSON.stringify(new URL('../tools/recover-lossless-retained-history-20261014.mjs',import.meta.url).href)});`;
  const r=spawnSync(process.execPath,['--input-type=module','-e',script],{cwd:dir,env:{PATH:process.env.PATH,GITHUB_REPOSITORY:'kovalev23091987-jpg/my-report-2-cloud-runner',GITHUB_RUN_ID:'1000',GITHUB_SHA:'a'.repeat(40),GITHUB_TOKEN:'controlled-token',RETAINED_HISTORY_KIND:'canonical',LOSSLESS_EXECUTE:'true',REPORT2_CANONICAL_COMPACTION_ENABLED:'false'},encoding:'utf8'});assert.equal(r.status,0,r.stderr);
  const proof=JSON.parse(fs.readFileSync(path.join(dir,'audit-output/lossless-retained-history/proof.json'),'utf8'));assert.equal(proof.reason,'CANONICAL_COMPACTION_NATIVE_QUALIFICATION_NOT_ACTIVATED');assert.equal(proof.whole_HTTP.total,0);assert.equal(proof.github_control_HTTP,0);assert.equal(proof.D1_bridge_HTTP,0);assert.equal(proof.private_D1_HTTP,0);assert.ok(!proof.admission);assert.equal(proof.canonical_rows_modified,0);
 }finally{fs.rmSync(dir,{recursive:true});}
});
