import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';import {gunzipSync} from 'node:zlib';import {DatabaseSync} from 'node:sqlite';
import {compactProtectedCanonical,PROTECTED_CANONICAL_POLICY as P,exactCanonicalBodyUpdate} from './protected-canonical-compaction.mjs';
import {encodeCanonicalPublicationRow} from './canonical-cold-archive.mjs';
import {createPrivateCanonicalRestorer} from './private-canonical-history.mjs';
import {loadBoundedCanonicalCandidates,loadBoundedCanonicalWindowSequence} from './bounded-canonical-selection.mjs';
import {PrivateArchiveD1API} from './private-archive-d1-api.mjs';import {RemoteD1Database} from './report2-d1-adapter.mjs';
import {createPrivateArchivePool} from './private-archive-pool.mjs';
import {createUnifiedHttpBudget} from '../current-generation/files/src/unified-budget.mjs';import {LOSSLESS_RECOVERY_POLICY,reserveLosslessRecoveryBudget} from './lossless-full-evidence-recovery.mjs';import {finalizeRunUsage} from './d1-preaction-budget-guard.mjs';
import bridge from '../current-generation/tests/fixtures/actual-d1-bridge-20261008.mjs';
const now=1792026000000,DAY=86400000,allow=()=>({allowed:true}),headroom=()=>true;
const original=JSON.parse(gunzipSync(fs.readFileSync(new URL('../checkpoints/storage-recovery-natural-38638248237/report2-run-result.json.gz',import.meta.url)))).candidates[0];
const schema=JSON.parse(fs.readFileSync(new URL('../audit-fixes/t00/fixtures/d1-schema.json',import.meta.url),'utf8')).rows;
function wrap(raw){let usage={requests:0,rows_read:0,rows_written:0,unknown_ops:0};const calls=[];const db={raw,calls,usageSnapshot:()=>({...usage}),setUsage:u=>{usage={...usage,...u};},prepare(sql){return{sql,args:[],bind(...args){this.args=args;return this;},async all(){calls.push(sql);const results=raw.prepare(sql).all(...this.args).map(r=>({...r}));usage.requests++;usage.rows_read+=results.length;return{results,success:true,meta:{changes:0,rows_read:results.length,rows_written:0,size_after:100000}};},async first(){return(await this.all()).results[0]??null;},async run(){calls.push(sql);const r=raw.prepare(sql).run(...this.args);usage.requests++;usage.rows_written+=Number(r.changes);return{results:[],success:true,meta:{changes:Number(r.changes),rows_read:0,rows_written:Number(r.changes),size_after:100000}};}};},async batch(statements){raw.exec('BEGIN');try{const rows=[];for(const s of statements)rows.push(await (/^\s*SELECT\b/i.test(s.sql)?s.all():s.run()));raw.exec('COMMIT');return rows;}catch(error){raw.exec('ROLLBACK');throw error;}}};return db;}
function fixture(count=2,{v2=true}={}){
 const raw=new DatabaseSync(':memory:');
 for(const name of ['canonical_publication_shadow','v3_recheck_task_shadow','v3_dispatch_publication_binding_shadow','v3_user_lifecycle_shadow','v3_telegram_dispatch_shadow','tz101_entry_area_calibration_signal'])raw.exec(schema.find(r=>r.type==='table'&&r.name===name).sql);
 for(const index of schema.filter(r=>r.type==='index'&&r.sql&&['canonical_publication_shadow','v3_recheck_task_shadow','v3_dispatch_publication_binding_shadow','v3_user_lifecycle_shadow','v3_telegram_dispatch_shadow','tz101_entry_area_calibration_signal'].includes(r.tbl_name)))raw.exec(index.sql);
 if(v2){raw.exec(fs.readFileSync(new URL('../current-generation/migrations/007_commands_delivery.sql',import.meta.url),'utf8'));raw.exec(fs.readFileSync(new URL('../current-generation/migrations/008_outcomes_calibration_v2.sql',import.meta.url),'utf8'));}
 raw.exec('ALTER TABLE canonical_publication_shadow ADD COLUMN future_json TEXT;ALTER TABLE canonical_publication_shadow ADD COLUMN decimal_string TEXT');
 const coldraw=new DatabaseSync(':memory:');coldraw.exec(fs.readFileSync(new URL('../cloudflare/free-history/003_canonical_cold_archive.sql',import.meta.url),'utf8'));
 const source_db=wrap(raw),archive_db=wrap(coldraw);archive_db.storage_bytes=100000;
 function add(id,extra={}){
  const ts=now-(id+3)*DAY,pub='PUB:'+id.toString(16).padStart(40,'0'),c=structuredClone(original.canonical);c.run_id='old-run:'+String(id).padStart(8,'0');c.snapshot_id='old-snapshot:'+id;c.observed_ts=ts;c.state='REJECTED';c.metadata={...(c.metadata||{}),contract:original.contract,test_padding:'x'.repeat(25000)};
  const row={publication_id:pub,contract_code:original.contract,direction:'SHORT',run_id:c.run_id,snapshot_id:c.snapshot_id,wave_id:null,decision_id:'decision:'+id,observed_ts:ts,valid_until_ts:null,lifecycle_event:null,canonical_state:'REJECTED',analytical_fingerprint:c.analytical_fingerprint,canonical_json:JSON.stringify(c,null,2),presentation_inputs_json:'{ "preserve_spaces": true }',manual_text:'Оригинальная строка\n'.repeat(30),telegram_text:null,presentation_hash:null,actionability_status:'UNASSESSED',actionability_reason:null,created_ts:ts,bound_ts:null,shadow_only:1,future_json:JSON.stringify({data:'z'.repeat(1200)}),decimal_string:'00001.2300',...extra};
  raw.prepare('INSERT INTO canonical_publication_shadow('+Object.keys(row).join(',')+') VALUES('+Object.keys(row).map(()=>'?').join(',')+')').run(...Object.values(row));return row;
 }
 const old=Array.from({length:count},(_,i)=>add(i+1));const latest=add(count+1,{observed_ts:now-1000,created_ts:now-1000}),rare=add(count+2,{contract_code:'RARE-USDT'});
 return{source_db,archive_db,raw,coldraw,old,latest,rare,add};
}
const get=(f,id)=>({...f.raw.prepare('SELECT * FROM canonical_publication_shadow WHERE publication_id=?').get(id)});
const compact=(f,options={})=>compactProtectedCanonical({...f,archive_headroom:headroom,before_modify:async()=>{},now,...options});
function archiveAll(f){for(const row of f.old){const r=encodeCanonicalPublicationRow(row);f.coldraw.prepare('INSERT INTO report2_canonical_cold_archive_v1 VALUES(?,?,?,?,?,?,?,?)').run(r.publication_id,r.raw_sha256,r.run_id,r.snapshot_id,r.contract_code,r.observed_ts,JSON.stringify(r),now);}}
test('protected conditional compaction addresses A1 exactly when legacy is full, retaining preflight and independent post-readbacks',async()=>{
 const f=fixture(),databases={LEGACY:f.archive_db};f.archive_db.storage_bytes=400000000;
 for(const slot of ['A1','A2','A3','A4']){const raw=new DatabaseSync(':memory:');raw.exec(fs.readFileSync(new URL('../cloudflare/free-history/003_canonical_cold_archive.sql',import.meta.url),'utf8'));databases[slot]=wrap(raw);databases[slot].storage_bytes=100000;}
 const pool=createPrivateArchivePool({enabled:true,databases});
 const out=await compact(f,{archive_pool:pool,execute:true,prefetch_private:true,require_native_preflight:true});assert.equal(out.compacted.length,2);assert(out.compacted.every(r=>r.archive_location==='A1'));assert.equal(out.native_preflight.length,2);assert.equal(out.native_readbacks.length,2);assert.equal(f.archive_db.usageSnapshot().rows_written,0);
 const reader=createPrivateCanonicalRestorer({...pool.readerOptions(),db_admit:allow});for(const row of f.old){const header=get(f,row.publication_id);assert(header.canonical_json.endsWith(':A1'));assert.deepEqual(await reader.restore(header),row);}
 assert.deepEqual(get(f,f.latest.publication_id),f.latest);assert.deepEqual(get(f,f.rare.publication_id),f.rare);
});
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
 for(const kind of ['CORRUPT','SCHEMA','UNKNOWN','STORAGE']){const f=fixture(1),before=get(f,f.old[0].publication_id);if(kind==='CORRUPT'){archiveAll(f);f.coldraw.prepare("UPDATE report2_canonical_cold_archive_v1 SET record_json='{}'").run();}if(kind==='SCHEMA')f.raw.exec('DROP TABLE v3_recheck_task_shadow');if(kind==='UNKNOWN')f.archive_db.setUsage({unknown_ops:1});if(kind==='STORAGE')f.archive_db.storage_bytes=400000000;
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
  assert.equal(r.compacted.length,precopied?48:16);assert.equal(r.native_readbacks.length,4);assert.equal(primaryHTTP,precopied?14:10);assert.equal(privateHTTP,54);assert.ok(budget.summary().total<=164);assert.ok(96-budget.summary().used.hot>=24);assert.equal(source_db.usageSnapshot().unknown_ops+archive_db.usageSnapshot().unknown_ops,0);assert.ok(r.D1.rows_read<=5000&&r.D1.rows_written<=400);assert.equal(r.publication_rows_deleted,0);assert.equal(f.raw.prepare('SELECT COUNT(*) AS n FROM canonical_publication_shadow').get().n,50);
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

test('exceptional execution verifies independent native originals before its first primary mutation',async()=>{
 const f=fixture();archiveAll(f);let guards=0;
 const r=await compact(f,{execute:true,prefetch_private:true,require_native_preflight:true,before_modify:async()=>{guards++;assert.ok(f.archive_db.usageSnapshot().requests>=4);}});
 assert.equal(r.native_preflight_required_before_mutation,true);assert.equal(r.native_preflight.length,2);assert.equal(r.compacted.length,2);assert.ok(guards>0);assert.equal(r.native_readbacks.length,2);
});

test('a corrupt independent preflight read leaves every hot canonical body unchanged',async()=>{
 const f=fixture();archiveAll(f);const before=f.old.map(r=>get(f,r.publication_id)),prepare=f.archive_db.prepare.bind(f.archive_db);let guarded=0;
 f.archive_db.prepare=sql=>{const original=prepare(sql);if(sql==='SELECT record_json FROM report2_canonical_cold_archive_v1 WHERE publication_id=?1 AND raw_sha256=?2 LIMIT 1')original.first=async()=>({record_json:'{}'});return original;};
 await assert.rejects(compact(f,{execute:true,prefetch_private:true,require_native_preflight:true,before_modify:async()=>{guarded++;}}));
 assert.equal(guarded,0);assert.deepEqual(f.old.map(r=>get(f,r.publication_id)),before);
});

test('the retained production namespace works without creating the three uninstalled V2 tables',async()=>{
 const f=fixture(2,{v2:false});archiveAll(f);
 for(const name of ['report2_command_v2','report2_publication_v2','report2_delivered_outcome_v2'])assert.equal(schema.some(r=>r.type==='table'&&r.name===name),false);
 const before=f.raw.prepare("SELECT name,sql FROM sqlite_schema ORDER BY name").all(),r=await compact(f,{execute:true,prefetch_private:true,require_native_preflight:true});
 assert.equal(r.compacted.length,2);assert.equal(r.reference_schema.missing_required.length,0);assert.equal(r.reference_schema.absent_optional.length,3);assert.equal(r.reference_schema.schema_creation_performed,false);assert.deepEqual(f.raw.prepare("SELECT name,sql FROM sqlite_schema ORDER BY name").all(),before);
 const reader=createPrivateCanonicalRestorer({archive_db:f.archive_db,db_admit:allow});for(const row of f.old)assert.deepEqual(await reader.restore(get(f,row.publication_id)),row);
});

test('a partially installed V2 namespace still protects the references that exist',async()=>{
 const f=fixture(1,{v2:false}),r=f.old[0];f.raw.exec(fs.readFileSync(new URL('../current-generation/migrations/007_commands_delivery.sql',import.meta.url),'utf8'));
 f.raw.prepare("INSERT INTO report2_command_v2 VALUES('cmd','FULL',NULL,'MANUAL',1,2,'gen','COMPLETED',NULL,NULL,?,NULL,NULL,1)").run(r.snapshot_id);
 const result=await compact(f,{execute:true});assert.equal(result.compacted.length,0);assert.deepEqual(result.reference_schema.absent_optional,['report2_delivered_outcome_v2']);assert.deepEqual(get(f,r.publication_id),r);
});

test('creation of a previously absent reference namespace between copy and update keeps originals hot',async()=>{
 const f=fixture(2,{v2:false});archiveAll(f);
 const result=await compact(f,{execute:true,before_modify:async()=>f.raw.exec(fs.readFileSync(new URL('../current-generation/migrations/007_commands_delivery.sql',import.meta.url),'utf8'))});
 assert.equal(result.compacted.length,0);assert.equal(result.conflicts_retained_hot.length,2);for(const row of f.old)assert.deepEqual(get(f,row.publication_id),row);
});

test('unbound legacy dispatch and calibration references are protected in both schema variants',async()=>{
 for(const v2 of [false,true])for(const kind of ['DISPATCH','CALIBRATION']){
  const f=fixture(1,{v2}),r=f.old[0];
  if(kind==='DISPATCH')f.raw.prepare("INSERT INTO v3_telegram_dispatch_shadow(dispatch_id,idempotency_key,contract,direction,wave_id,lifecycle_event,rules_version,state,decision_id,created_ts,updated_ts) VALUES('dispatch','key',?,'SHORT','wave','OBSERVE','v','PENDING',?,1,1)").run(r.contract_code,r.decision_id);
  else{const s={sample_id:'sample',decision_id:r.decision_id,snapshot_id:r.snapshot_id,contract_code:r.contract_code,direction:'SHORT',campaign_receipt_id:'receipt',campaign_id:'campaign',observed_ts:1,anchor_committed_ts:1,entry_trigger_time:1,entry_trigger_price:1,base_low:1,base_high:2,invalidation_price:1,target_price:3,scenario_type:'CONTROLLED',sample_json:'{}',material_digest:'hash',created_ts:1};f.raw.prepare('INSERT INTO tz101_entry_area_calibration_signal('+Object.keys(s).join(',')+') VALUES('+Object.keys(s).map(()=>'?').join(',')+')').run(...Object.values(s));}
  const before=f.raw.prepare('SELECT * FROM '+(kind==='DISPATCH'?'v3_telegram_dispatch_shadow':'tz101_entry_area_calibration_signal')).all();
  const result=await compact(f,{execute:true});assert.equal(result.compacted.length,0);assert.equal(f.archive_db.usageSnapshot().requests,0);assert.deepEqual(get(f,r.publication_id),r);assert.deepEqual(f.raw.prepare('SELECT * FROM '+(kind==='DISPATCH'?'v3_telegram_dispatch_shadow':'tz101_entry_area_calibration_signal')).all(),before);
 }
});

test('missing mandatory tables and unexpected views retain a precise refusal receipt before archive or body mutation',async()=>{
 for(const kind of ['MANDATORY','VIEW']){
  const f=fixture(1,{v2:false}),before=get(f,f.old[0].publication_id);
  if(kind==='MANDATORY')f.raw.exec('DROP TABLE v3_recheck_task_shadow');else f.raw.exec('CREATE VIEW report2_delivered_outcome_v2 AS SELECT publication_id FROM canonical_publication_shadow');
  await assert.rejects(compact(f,{execute:true}),e=>{assert.equal(e.message,'CANONICAL_PROTECTED_REFERENCE_SCHEMA_REQUIRED');const r=e.compaction_receipt;assert.equal(r.status,'CANONICAL_SCHEMA_PREFLIGHT_REFUSED');assert.equal(r.reference_schema.missing_required.length,kind==='MANDATORY'?1:0);assert.equal(r.reference_schema.non_table_objects.length,kind==='VIEW'?1:0);assert.equal(r.selected,0);assert.equal(r.compacted.length,0);return true;});assert.deepEqual(get(f,before.publication_id),before);assert.equal(f.archive_db.usageSnapshot().requests,0);
 }
});

test('a large native metadata scan reduces compaction within the existing reservation',async()=>{
 const f=fixture(48,{v2:false});archiveAll(f);const prepare=f.source_db.prepare.bind(f.source_db);
 f.source_db.prepare=sql=>{const s=prepare(sql);
  if(sql.startsWith('SELECT name,type FROM sqlite_schema')){const all=s.all;s.all=async()=>{const r=await all.call(s),u=f.source_db.usageSnapshot();f.source_db.setUsage({rows_read:u.rows_read+200});r.meta.rows_read+=200;return r;};}
  if(sql.includes('UPDATE canonical_publication_shadow AS p SET')){const run=s.run;s.run=async()=>{const r=await run.call(s),u=f.source_db.usageSnapshot();f.source_db.setUsage({rows_read:u.rows_read+200});r.meta.rows_read+=200;return r;};}
  return s;};
 const r=await compact(f,{execute:true,prefetch_private:true,require_native_preflight:true});assert.ok(r.compacted.length>0&&r.compacted.length<48);assert.ok(r.deferred_hot.some(x=>['SHARED_NATIVE_HEADROOM','SHARED_NATIVE_HEADROOM_BEFORE_COPY','TRANSACTION_BOUND'].includes(x.reason)));assert.ok(r.D1.rows_read<=5000&&r.D1.rows_written<=400);assert.equal(r.D1.unknown_ops,0);assert.ok(r.reference_schema.per_update_read_reserve>=230);
 const moved=new Set(r.compacted.map(x=>x.publication_id));for(const row of f.old)if(!moved.has(row.publication_id))assert.deepEqual(get(f,row.publication_id),row);
});

test('an incomplete bounded reference census never reads a large body or touches either original store',async()=>{
 const f=fixture(2,{v2:false});
 for(let i=0;i<257;i++)f.raw.prepare(`INSERT INTO v3_telegram_dispatch_shadow(dispatch_id,idempotency_key,contract,direction,wave_id,lifecycle_event,rules_version,state,decision_id,created_ts,updated_ts) VALUES(?,?,'${f.old[0].contract_code}','SHORT','wave','OBSERVE','v','PENDING','other',1,1)`).run('dispatch:'+i,'key:'+i);
 const before=f.old.map(r=>get(f,r.publication_id)),r=await compact(f,{execute:true});
 assert.equal(r.status,'REFERENCE_CENSUS_BOUND_REACHED_ORIGINALS_UNTOUCHED');assert.equal(r.bounded_discovery.complete_reference_census,false);assert.equal(r.bounded_discovery.next_cursor,0);assert.equal(r.bounded_discovery.large_bodies_read,0);assert.equal(f.archive_db.usageSnapshot().requests,0);assert.deepEqual(f.old.map(r=>get(f,r.publication_id)),before);
 assert.ok(f.source_db.calls.every(sql=>!sql.includes('SELECT p.*')&&!sql.includes('UPDATE canonical_publication_shadow')));
});

test('one admitted run reaches an eligible body behind an empty128-row window while each query stays indexed and bounded',async()=>{
 const f=fixture(130,{v2:false});f.raw.exec("UPDATE canonical_publication_shadow SET canonical_state='ACTIVE' WHERE rowid<=128");
 const result=await compact(f,{execute:true});assert.equal(result.bounded_discovery.window_count,2);assert.equal(result.bounded_discovery.windows[0].metadata_rows,128);assert.equal(result.bounded_discovery.metadata_rows,4);assert.equal(result.compacted.length,2);assert.equal(result.bounded_discovery.next_cursor,0);
 const rootSQL=f.source_db.calls.find(sql=>sql.startsWith('SELECT rowid AS source_rowid'));
 const plan=f.raw.prepare('EXPLAIN QUERY PLAN '+rootSQL).all(128).map(r=>r.detail).join('\n');assert.match(plan,/SEARCH canonical_publication_shadow USING INTEGER PRIMARY KEY/);assert.doesNotMatch(rootSQL,/(?:^|,)canonical_json(?:,| FROM)|SELECT \*/);
});

test('complete protected candidate windows are skipped without relaxing a single dispatch reference',async()=>{
 const f=fixture(60,{v2:false});for(const row of f.old.slice(0,48))f.raw.prepare("INSERT INTO v3_telegram_dispatch_shadow(dispatch_id,idempotency_key,contract,direction,wave_id,lifecycle_event,rules_version,state,decision_id,created_ts,updated_ts) VALUES(?,?,?,'SHORT','wave','OBSERVE','v','PENDING',?,1,1)").run('d:'+row.publication_id,'k:'+row.publication_id,row.contract_code,row.decision_id);
 const r=await compact(f,{execute:true});assert.equal(r.bounded_discovery.window_count,2);assert.equal(r.bounded_discovery.windows[0].reference_protected,48);assert.equal(r.bounded_discovery.windows[0].reference_protection_counts.v3_telegram_dispatch_shadow,48);assert(r.compacted.length>0);assert(r.compacted.every(x=>!f.old.slice(0,48).some(y=>y.publication_id===x.publication_id)));for(const row of f.old.slice(0,48))assert.deepEqual(get(f,row.publication_id),row);
});

test('lookahead stops for bridge headroom and at four metadata windows without reading any archive body',async()=>{
 for(const limited of [true,false]){const f=fixture(520,{v2:false});f.raw.exec("UPDATE canonical_publication_shadow SET canonical_state='ACTIVE'");const r=await compact(f,{execute:true,discovery_headroom:()=>!limited});assert.equal(r.bounded_discovery.window_count,limited?1:4);assert.equal(r.bounded_discovery.next_cursor,limited?128:512);assert.equal(r.bounded_discovery.window_stop,limited?'SHARED_BRIDGE_HEADROOM':'WINDOW_BOUND');assert.equal(f.archive_db.usageSnapshot().requests,0);assert.equal(f.source_db.calls.filter(s=>s.startsWith('SELECT rowid AS source_rowid')).length,limited?1:4);}
});

test('a lookahead admission refusal preserves only the preceding completely checked cursor',async()=>{
 const f=fixture(260,{v2:false});f.raw.exec("UPDATE canonical_publication_shadow SET canonical_state='ACTIVE'");let admissions=0;const r=await loadBoundedCanonicalWindowSequence({source_db:f.source_db,present_tables:[],cutoff:now-2*DAY,prefix:'R2PRIVATE_CANONICAL_V1:',admit:()=>({allowed:++admissions===1})});assert.equal(r.receipt.window_count,1);assert.equal(r.receipt.next_cursor,128);assert.equal(r.receipt.window_stop,'CANONICAL_BOUNDED_METADATA_HEADROOM_REQUIRED');assert.equal(f.source_db.calls.length,1);
});

test('reference growth beyond its complete census allowance retains the original even if its new link is outside the window',async()=>{
 const f=fixture(1,{v2:false}),row=f.old[0];archiveAll(f);
 const r=await compact(f,{execute:true,before_modify:async()=>{
  for(let i=0;i<10;i++)f.raw.prepare("INSERT INTO v3_telegram_dispatch_shadow(dispatch_id,idempotency_key,contract,direction,wave_id,lifecycle_event,rules_version,state,decision_id,created_ts,updated_ts) VALUES(?, ?, ?, 'SHORT','new-wave','OBSERVE','v','PENDING',?,1,1)").run('dispatch:'+i,'key:'+i,i===9?row.contract_code:'OTHER-USDT',i===9?row.decision_id:'other');
 }});
 assert.equal(r.compacted.length,0);assert.deepEqual(r.conflicts_retained_hot,[row.publication_id]);assert.deepEqual(get(f,row.publication_id),row);assert.equal(r.bounded_discovery.next_cursor,0);
});

test('deleting the exact newer witness after durable copy keeps the latest remaining original hot',async()=>{
 const f=fixture(1,{v2:false}),row=f.old[0];archiveAll(f);
 const r=await compact(f,{execute:true,before_modify:async()=>f.raw.prepare('DELETE FROM canonical_publication_shadow WHERE publication_id=?').run(f.latest.publication_id)});
 assert.equal(r.compacted.length,0);assert.deepEqual(r.conflicts_retained_hot,[row.publication_id]);assert.deepEqual(get(f,row.publication_id),row);
});

test('bounded discovery uses only retained production indexes and advances past a completed48-candidate slice',async()=>{
 const f=fixture(60,{v2:false}),present=['canonical_publication_shadow','v3_recheck_task_shadow','v3_dispatch_publication_binding_shadow','v3_user_lifecycle_shadow','v3_telegram_dispatch_shadow','tz101_entry_area_calibration_signal'];
 const r=await loadBoundedCanonicalCandidates({source_db:f.source_db,present_tables:present,cutoff:now-2*DAY,prefix:'R2PRIVATE_CANONICAL_V1:',admit:allow});
 assert.equal(r.rows.length,48);assert.equal(r.receipt.cursor_after_complete_window,48);assert.equal(r.receipt.exact_newer_witness_count,48);
 const sql=f.source_db.calls.find(sql=>sql.startsWith('SELECT p.*')),plan=f.raw.prepare('EXPLAIN QUERY PLAN '+sql).all(f.old[0].publication_id,f.latest.publication_id).map(r=>r.detail).join('\n');
 assert.match(plan,/SEARCH p USING INDEX sqlite_autoindex_canonical_publication_shadow_1/);assert.match(plan,/SEARCH newer(?: EXISTS)? USING INDEX sqlite_autoindex_canonical_publication_shadow_1/);assert.doesNotMatch(plan,/SCAN (?:p|newer)\b/);
 assert.equal(f.archive_db.usageSnapshot().requests,0);
});
test('thousands of unrelated dispatches no longer block a complete indexed census for the selected coin',async()=>{
 const f=fixture(2,{v2:false}),insert=f.raw.prepare("INSERT INTO v3_telegram_dispatch_shadow(dispatch_id,idempotency_key,contract,direction,wave_id,lifecycle_event,rules_version,state,decision_id,created_ts,updated_ts) VALUES(?,?,'OTHER-USDT','SHORT','wave','OBSERVE','v','PENDING','other',1,1)");
 for(let i=0;i<10000;i++)insert.run('noise:'+i,'key:'+i);
 const before=f.raw.prepare('SELECT COUNT(*) AS n FROM v3_telegram_dispatch_shadow').get().n,r=await compact(f,{execute:true});assert.equal(r.compacted.length,2);assert.equal(r.bounded_discovery.reference_counts.v3_telegram_dispatch_shadow,0);assert.equal(f.raw.prepare('SELECT COUNT(*) AS n FROM v3_telegram_dispatch_shadow').get().n,before);
 const sql=f.source_db.calls.find(s=>s.startsWith('SELECT contract,direction,wave_id,decision_id FROM v3_telegram_dispatch_shadow'));
 const plan=f.raw.prepare('EXPLAIN QUERY PLAN '+sql).all().map(r=>r.detail).join('\n');assert.match(plan,/SEARCH v3_telegram_dispatch_shadow USING INDEX idx_v3_dispatch_wave/);assert.doesNotMatch(plan,/SCAN v3_telegram_dispatch_shadow/);
});
test('a matching dispatch after thousands of unrelated rows remains protected by exact indexed lookup',async()=>{
 const f=fixture(1,{v2:false}),row=f.old[0],insert=f.raw.prepare("INSERT INTO v3_telegram_dispatch_shadow(dispatch_id,idempotency_key,contract,direction,wave_id,lifecycle_event,rules_version,state,decision_id,created_ts,updated_ts) VALUES(?,?,?,'SHORT','wave','OBSERVE','v','PENDING',?,1,1)");
 for(let i=0;i<1000;i++)insert.run('noise:'+i,'key:'+i,'OTHER-USDT','other');insert.run('real','real-key',row.contract_code,row.decision_id);
 const r=await compact(f,{execute:true});assert.equal(r.compacted.length,0);assert.deepEqual(get(f,row.publication_id),row);assert.equal(f.archive_db.usageSnapshot().requests,0);assert.equal(r.bounded_discovery.reference_counts.v3_telegram_dispatch_shadow,1);
});
test('missing pinned reference index refuses without fallback to an unbounded scan or original mutation',async()=>{
 const f=fixture(1,{v2:false}),before=get(f,f.old[0].publication_id);f.raw.exec('DROP INDEX idx_v3_dispatch_wave');
 await assert.rejects(compact(f,{execute:true}),/no such index/);assert.deepEqual(get(f,before.publication_id),before);assert.equal(f.archive_db.usageSnapshot().requests,0);assert(!f.source_db.calls.some(s=>s.includes('SELECT p.*')));
});
test('a smaller control-derived transaction count keeps the ordinary six-batch cap and all deferred originals',async()=>{
 const f=fixture(20,{v2:false});archiveAll(f);const r=await compact(f,{execute:true,max_mutation_batches:1});assert.equal(r.mutation_batches,1);assert.equal(r.compacted.length,8);assert.equal(r.deferred_hot.length,12);
 const moved=new Set(r.compacted.map(x=>x.publication_id));for(const row of f.old)if(!moved.has(row.publication_id))assert.deepEqual(get(f,row.publication_id),row);assert.equal(r.bounded_discovery.next_cursor,0);
 await assert.rejects(compact(f,{max_mutation_batches:7}),/EXISTING_CANONICAL_BATCH_CAP_REQUIRED/);
});


test('individual indexed reference plans retain global namespaces and avoid the other candidates reference rows',async()=>{
 const f=fixture(2),other=f.old[1],c=JSON.parse(other.canonical_json);c.metadata.contract='OTHER-USDT';if(c.contract!==undefined)c.contract='OTHER-USDT';
 f.raw.prepare('UPDATE canonical_publication_shadow SET contract_code=?,canonical_json=? WHERE publication_id=?').run('OTHER-USDT',JSON.stringify(c),other.publication_id);
 f.add(100,{contract_code:'OTHER-USDT',observed_ts:now-1000,created_ts:now-1000});
 for(let i=0;i<100;i++)f.raw.prepare("INSERT INTO v3_telegram_dispatch_shadow(dispatch_id,idempotency_key,contract,direction,wave_id,lifecycle_event,rules_version,state,decision_id,created_ts,updated_ts) VALUES(?,?,'OTHER-USDT','SHORT','unrelated','OBSERVE','v','PENDING','other',1,1)").run('noise:'+i,'key:'+i);
 f.raw.prepare("INSERT INTO report2_command_v2 VALUES('cmd','FULL',NULL,'MANUAL',1,2,'gen','COMPLETED',NULL,NULL,'unrelated',NULL,NULL,1)").run();
 const d=await loadBoundedCanonicalCandidates({source_db:f.source_db,present_tables:['canonical_publication_shadow','v3_recheck_task_shadow','v3_dispatch_publication_binding_shadow','v3_user_lifecycle_shadow','v3_telegram_dispatch_shadow','tz101_entry_area_calibration_signal','report2_command_v2','report2_publication_v2','report2_delivered_outcome_v2'],cutoff:now-2*DAY,prefix:'R2PRIVATE_CANONICAL_V1:',admit:allow});
 const r=d.reference_plans[f.old[0].publication_id],o=d.reference_plans[other.publication_id];
 assert.equal(d.bounds.v3_telegram_dispatch_shadow,108);assert.equal(r.bounds.v3_telegram_dispatch_shadow,8);assert.equal(o.bounds.v3_telegram_dispatch_shadow,108);assert.equal(r.bounds.report2_command_v2,9);assert.equal(o.bounds.report2_command_v2,9);
 assert.deepEqual(r.scope.contracts,[f.old[0].contract_code]);assert.deepEqual(r.scope.publication_ids,[f.old[0].publication_id]);
 const result=await compact(f,{execute:true});assert.equal(result.compacted.length,2);assert(result.reference_schema.per_row_plans.some(p=>p.rows_read_reserve<result.reference_schema.union_per_update_read_reserve));
 const sql=f.source_db.calls.find(s=>s.includes('UPDATE canonical_publication_shadow AS p SET')&&s.includes("WHERE contract IN ('"+f.old[0].contract_code+"')"));assert(sql);assert(!sql.includes("WHERE contract IN ('"+f.old[0].contract_code+"','OTHER-USDT')"));
 assert.equal(f.raw.prepare('SELECT COUNT(*) AS n FROM v3_telegram_dispatch_shadow').get().n,100);assert.equal(f.raw.prepare('SELECT COUNT(*) AS n FROM report2_command_v2').get().n,1);
});

test('a contract identity changed after discovery cannot borrow an unrelated reference scope',async()=>{
 const f=fixture(1),before=f.old[0],batch=f.source_db.batch.bind(f.source_db);let changed=false;
 f.source_db.batch=async statements=>{if(!changed&&statements[0]?.sql.startsWith('SELECT p.*')){changed=true;f.raw.prepare('UPDATE canonical_publication_shadow SET contract_code=? WHERE publication_id IN (?,?)').run('CHANGED-USDT',before.publication_id,f.latest.publication_id);}return batch(statements);};
 await assert.rejects(compact(f,{execute:true}),/CANONICAL_REFERENCE_SCOPE_IDENTITY_CHANGED/);assert.equal(f.archive_db.usageSnapshot().requests,0);assert(!get(f,before.publication_id).canonical_json.startsWith('R2PRIVATE_CANONICAL_V1:'));
 assert.throws(()=>exactCanonicalBodyUpdate(before,{...before,manual_text:'header'},now-2*DAY,undefined,{},null,{contracts:['OTHER-USDT'],publication_ids:[before.publication_id]}),/EXACT_CANONICAL_ROW_SCOPE_REQUIRED/);
});

test('outstanding mutation costs are held before copies and measured groups are reconciled without lowering the reservation',async()=>{
 const f=fixture(12,{v2:false});f.raw.exec(fs.readFileSync(new URL('../current-generation/migrations/007_commands_delivery.sql',import.meta.url),'utf8'));
 for(let i=0;i<162;i++)f.raw.prepare("INSERT INTO report2_command_v2 VALUES(?,'FULL',NULL,'MANUAL',1,2,'gen','COMPLETED',NULL,NULL,'unrelated',NULL,NULL,1)").run('cmd:'+i);
 const prepare=f.source_db.prepare.bind(f.source_db);
 f.source_db.prepare=sql=>{const s=prepare(sql);if(sql.startsWith('SELECT name,type FROM sqlite_schema')){const all=s.all;s.all=async()=>{const r=await all.call(s),u=f.source_db.usageSnapshot();f.source_db.setUsage({rows_read:u.rows_read+404-r.meta.rows_read});r.meta.rows_read=404;return r;};}
  if(sql.includes('UPDATE canonical_publication_shadow AS p SET')){const run=s.run;s.run=async()=>{const r=await run.call(s),u=f.source_db.usageSnapshot();f.source_db.setUsage({rows_read:u.rows_read+1300});r.meta.rows_read+=1300;return r;};}return s;};
 const result=await compact(f,{execute:true,require_native_preflight:true});
 assert(result.compacted.length>0&&result.compacted.length<12);assert.equal(result.prepared,result.compacted.length);assert.equal(f.coldraw.prepare('SELECT COUNT(*) AS n FROM report2_canonical_cold_archive_v1').get().n,result.prepared);assert.equal(result.deferred_hot.length,12-result.prepared);assert(result.deferred_hot.every(r=>r.reason==='SHARED_NATIVE_HEADROOM_BEFORE_COPY'));
 assert(result.copy_admission.groups.every(g=>g.usage_before.rows_read+g.rows_read_reserved+96<=5000));assert(result.D1.rows_read<=5000&&result.D1.rows_written<=400);assert.equal(result.D1.unknown_ops,0);assert.equal(result.copy_admission.native_cost_qualified,false);
 assert(result.copy_admission.groups.every(g=>g.statement_costs.every(s=>s.counters_present)));assert(result.copy_admission.groups.every(g=>g.statement_costs.filter(s=>s.operation==='CONDITIONAL_BODY_UPDATE').every(s=>s.rows_read===1300)));
 if(process.env.REPORT2_COMPACTION_PROOF_OUTPUT){const file=process.env.REPORT2_COMPACTION_PROOF_OUTPUT,proof=JSON.parse(fs.readFileSync(file,'utf8'));proof.row_mutation_admission_stress={schema:'CONTROLLED_CUMULATIVE_ROW_ADMISSION_V1',schema_reads_charged:404,reads_charged_per_update:1300,selected:result.selected,prepared:result.prepared,moved:result.compacted.length,deferred:result.deferred_hot,copy_admission:result.copy_admission,D1:result.D1,fixture_counters_only:true,native_cost_qualified:false,productionD1:0,sourceHTTP:0,MAIN:0,Telegram:0};fs.writeFileSync(file,JSON.stringify(proof,null,2)+'\n');}
 const moved=new Set(result.compacted.map(r=>r.publication_id));for(const row of f.old)if(!moved.has(row.publication_id))assert.deepEqual(get(f,row.publication_id),row);
});

test('zero admitted mutation groups do not create unusable archive copies',async()=>{
 const f=fixture(12,{v2:false}),result=await compact(f,{execute:true,max_mutation_batches:0});assert.equal(result.prepared,0);assert.equal(result.compacted.length,0);assert.equal(result.deferred_hot.length,12);assert.equal(f.archive_db.usageSnapshot().rows_written,0);assert.equal(result.mutation_batches,0);
});
