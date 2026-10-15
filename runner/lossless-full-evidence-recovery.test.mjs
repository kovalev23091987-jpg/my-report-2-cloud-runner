import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {recoverLosslessFullEvidence,reserveLosslessRecoveryBudget,LOSSLESS_RECOVERY_POLICY} from './lossless-full-evidence-recovery.mjs';
import {retainedSchemaSql,rewriteRetainedSelect,createHistoryRestorer} from './retained-history.mjs';
import {createUnifiedHttpBudget} from '../current-generation/files/src/unified-budget.mjs';
import {RemoteD1Database} from './report2-d1-adapter.mjs';
import bridge from '../current-generation/tests/fixtures/actual-d1-bridge-20261008.mjs';
import {finalizeRunUsage} from './d1-preaction-budget-guard.mjs';
const now=1792010000000,DAY=86400000,commit='a'.repeat(40);
function fixture(){
 const raw=new DatabaseSync(':memory:');raw.exec(`CREATE TABLE full_evidence_shadow_log(full_evidence_id TEXT PRIMARY KEY,contract_code TEXT,observed_ts INTEGER,evidence_compact_json TEXT,persisted_ts INTEGER);
 CREATE INDEX idx_full_evidence_shadow_contract_ts ON full_evidence_shadow_log(contract_code,observed_ts);
 CREATE TABLE canonical_publication_shadow(publication_id TEXT PRIMARY KEY,canonical_json TEXT);
 CREATE TABLE report2_runner_budget_ledger_shadow(reservation_id TEXT PRIMARY KEY,day_utc TEXT,reserve_rows_read INTEGER,reserve_rows_written INTEGER,state TEXT,started_ts INTEGER,unknown_ops INTEGER DEFAULT 0);`);
 for(const sql of retainedSchemaSql('full_evidence_shadow_log',raw.prepare('PRAGMA table_info(full_evidence_shadow_log)').all()))raw.exec(sql);
 for(const [id,contract,ts] of [['OLD1','A-USDT',now-5*DAY],['OLD2','A-USDT',now-4*DAY],['CURRENT','A-USDT',now-1000],['LAST_RARE','RARE-USDT',now-5*DAY]])raw.prepare('INSERT INTO full_evidence_shadow_log VALUES(?,?,?,?,?)').run(id,contract,ts,JSON.stringify({original:'exact',data:'x'.repeat(900)}),ts);
 raw.prepare('INSERT INTO canonical_publication_shadow VALUES(?,?)').run('PROTECTED',JSON.stringify({original:'retain'}));
 let usage={requests:0,rows_read:0,rows_written:0,unknown_ops:0};const calls=[];
 const db={usageSnapshot:()=>({...usage}),prepare(sql){return{args:[],bind(...a){this.args=a;return this;},async all(){calls.push(sql);const results=raw.prepare(sql).all(...this.args).map(r=>({...r}));usage.requests++;usage.rows_read+=results.length;return{results,meta:{rows_read:results.length,rows_written:0}};},async first(){return(await this.all()).results[0]??null;},async run(){calls.push(sql);const ack=raw.prepare(sql).run(...this.args);usage.requests++;usage.rows_written+=Number(ack.changes);return{meta:{changes:Number(ack.changes),rows_read:0,rows_written:Number(ack.changes)}};}};}};
 const prepare=db.prepare.bind(db);db.prepare=sql=>({...prepare(sql),sql});db.batch=async statements=>{raw.exec('BEGIN');try{const result=[];for(const stmt of statements)result.push(await (/^\s*SELECT\b/i.test(stmt.sql)?stmt.all():stmt.run()));raw.exec('COMMIT');return result;}catch(error){raw.exec('ROLLBACK');throw error;}};
 const objects=new Map();let saves=0,fetches=0;const save_originals=async rows=>{saves++;for(const r of rows)objects.set(r.path,JSON.stringify(r.envelope));return{commit};};
 const fetch_archive=async url=>{fetches++;return new Response(objects.get(new URL(url).pathname.split('/'+commit+'/')[1]),{status:200});};
 return{raw,db,calls,objects,save_originals,fetch_archive,get saves(){return saves;},get fetches(){return fetches;},setUsage:value=>{usage={...usage,...value};}};
}
test('durable preparation uses original clocks, keeps hot/latest rare-coin and every canonical row, and never modifies primary rows',async()=>{
 const f=fixture(),before=f.raw.prepare('SELECT * FROM full_evidence_shadow_log ORDER BY full_evidence_id').all();const r=await recoverLosslessFullEvidence({...f,request_admit:()=>({allowed:true}) ,now});
 assert.equal(r.originals_verified,2);assert.equal(r.moved.length,0);assert.equal(r.execute,false);assert.equal(f.saves,1);assert.equal(f.fetches,2);assert.deepEqual(f.raw.prepare('SELECT * FROM full_evidence_shadow_log ORDER BY full_evidence_id').all(),before);assert.equal(r.sourceHTTP,0);assert.equal(r.canonical_rows_modified,0);
});
test('conditional relocation restores exact originals through the current reader and leaves rare-coin and canonical references hot',async()=>{
 const f=fixture(),before=f.raw.prepare("SELECT * FROM full_evidence_shadow_log WHERE full_evidence_id='OLD1'").get();let checked=0;
 const r=await recoverLosslessFullEvidence({...f,request_admit:()=>({allowed:true}),before_modify:async()=>{checked++;},execute:true,now});
 assert.equal(r.moved.length,2);assert.equal(checked,1);assert.equal(f.fetches,2);assert.ok(f.raw.prepare("SELECT * FROM full_evidence_shadow_log WHERE full_evidence_id='LAST_RARE'").get());assert.ok(f.raw.prepare("SELECT * FROM canonical_publication_shadow WHERE publication_id='PROTECTED'").get());
 const reader=createHistoryRestorer({fetch_impl:f.fetch_archive,max_fetches:4});const restored=await reader.restore(f.raw.prepare(rewriteRetainedSelect('SELECT * FROM full_evidence_shadow_log WHERE full_evidence_id=? LIMIT 1')).get('OLD1'));assert.deepEqual(restored,{...before});assert.equal(r.history_discarded,false);assert.equal(r.source_clocks_refreshed,false);
});
test('a corrupt/missing durable original or whole HTTP denial leaves every primary row untouched',async()=>{
 for(const bad of ['CORRUPT','DENIED']){const f=fixture();await assert.rejects(recoverLosslessFullEvidence({...f,fetch_archive:bad==='CORRUPT'?async()=>new Response('{}'):f.fetch_archive,request_admit:()=>({allowed:bad!=='DENIED'}),before_modify:async()=>{},execute:true,now}));assert.equal(f.raw.prepare('SELECT COUNT(*) AS n FROM full_evidence_shadow_log').get().n,4);assert.equal(f.raw.prepare('SELECT COUNT(*) AS n FROM report2_full_evidence_archive_v1').get().n,0);}
});
test('concurrent changes are not erased and a partial batch retains its exact successful-move receipt',async()=>{
 const f=fixture();const run=recoverLosslessFullEvidence({...f,request_admit:()=>({allowed:true}),before_modify:async()=>f.raw.prepare("UPDATE full_evidence_shadow_log SET persisted_ts=persisted_ts+1 WHERE full_evidence_id='OLD2'").run(),execute:true,now});
 await assert.rejects(run,error=>{assert.equal(error.message,'RETAINED_ORIGINAL_CHANGED_KEEP_HOT');assert.equal(error.recovery_receipt.moved.length,1);assert.equal(error.recovery_receipt.moved[0].id,'OLD1');return true;});assert.ok(f.raw.prepare("SELECT * FROM full_evidence_shadow_log WHERE full_evidence_id='OLD2'").get());
});
test('unknown native cost or private values deny export/relocation without a fabricated zero cost',async()=>{
 for(const kind of ['UNKNOWN','PRIVATE']){const f=fixture();if(kind==='UNKNOWN')f.setUsage({unknown_ops:1});else f.raw.prepare("UPDATE full_evidence_shadow_log SET evidence_compact_json=? WHERE full_evidence_id='OLD1'").run('CONTROLLED_PRIVATE_VALUE');await assert.rejects(recoverLosslessFullEvidence({...f,request_admit:()=>({allowed:true}),now,secrets:['CONTROLLED_PRIVATE_VALUE']}));assert.equal(f.saves,0);assert.equal(f.raw.prepare('SELECT COUNT(*) AS n FROM full_evidence_shadow_log').get().n,4);}
});
test('the existing reservation family counts legacy maintenance and never refunds a preparation-only or duplicate run',async()=>{
 const f=fixture(),day=new Date(now).toISOString().slice(0,10);f.raw.prepare('INSERT INTO report2_runner_budget_ledger_shadow VALUES(?,?,?,?,?,?,?)').run('RETAINED_HISTORY:1:1',day,5000,400,'FINALIZED',now,0);
 assert.equal((await reserveLosslessRecoveryBudget(f.db,{reservation_id:'RETAINED_HISTORY:2:2',now})).allowed,true);assert.equal((await reserveLosslessRecoveryBudget(f.db,{reservation_id:'RETAINED_HISTORY:2:2',now})).allowed,false);assert.equal((await reserveLosslessRecoveryBudget(f.db,{reservation_id:'RETAINED_HISTORY:3:3',now})).allowed,false);assert.equal(f.raw.prepare('SELECT COUNT(*) AS n FROM report2_runner_budget_ledger_shadow').get().n,2);
 assert.ok(LOSSLESS_RECOVERY_POLICY.planned_whole_day.rows_read<3500000&&LOSSLESS_RECOVERY_POLICY.planned_whole_day.rows_written<70000);assert.equal(LOSSLESS_RECOVERY_POLICY.max_rows*LOSSLESS_RECOVERY_POLICY.max_runs_day,96);
});
test('the transaction frees old-row capacity before header allocation and rolls back deletion on an insertion failure',async()=>{
 for(const fail of [false,true]){const f=fixture();f.raw.exec(`CREATE TRIGGER simulated_capacity BEFORE INSERT ON report2_full_evidence_archive_v1 WHEN ${fail?'1':'(SELECT COUNT(*) FROM full_evidence_shadow_log)>3'} BEGIN SELECT RAISE(ABORT,'CONTROLLED_CAPACITY'); END`);
  const run=recoverLosslessFullEvidence({...f,request_admit:()=>({allowed:true}),before_modify:async()=>{},execute:true,now});
  if(fail){await assert.rejects(run,/CONTROLLED_CAPACITY/);assert.equal(f.raw.prepare('SELECT COUNT(*) AS n FROM full_evidence_shadow_log').get().n,4);}else assert.equal((await run).moved.length,2);
 }
});
test('all48 archive rows include the real bridge requests, finalization and bounded control in whole164, preserving manual24',async()=>{
 const f=fixture(),p=LOSSLESS_RECOVERY_POLICY,b=createUnifiedHttpBudget(p.http_limits);let bridgeHTTP=0,wireMax=0;
 for(let i=3;i<=48;i++)f.raw.prepare('INSERT INTO full_evidence_shadow_log VALUES(?,?,?,?,?)').run('OLD'+i,'A-USDT',now-(i+5)*DAY,JSON.stringify({data:'x'.repeat(900)}),now-(i+5)*DAY);
 for(const column of ['source_run_id TEXT','measured_rows_read INTEGER','measured_rows_written INTEGER','measured_requests INTEGER','completed_ts INTEGER'])f.raw.exec('ALTER TABLE report2_runner_budget_ledger_shadow ADD COLUMN '+column);
 assert.equal(b.reserve({logical_request_id:'ALL_GITHUB_CONTROL',lane:'hot',attempts:p.max_control_HTTP}).allowed,true);
 const db=new RemoteD1Database('https://bridge.invalid/d1','fixture-token',{beforeRequest:e=>{assert.ok(bridgeHTTP<p.max_bridge_HTTP);assert.ok(e.wire_bytes<=p.bridge_wire_bytes);wireMax=Math.max(wireMax,e.wire_bytes);const g=b.reserve({logical_request_id:'D1:'+bridgeHTTP,lane:'hot',attempts:1});if(g.allowed)bridgeHTTP++;return g;},fetchImpl:(url,init)=>bridge.fetch(new Request(url,init),{DATA_DB:f.db,REPORT2_CLOUD_BRIDGE_TOKEN:'fixture-token'})});
 const reservation_id='RETAINED_HISTORY:123:123';assert.equal((await reserveLosslessRecoveryBudget(db,{reservation_id,now})).allowed,true);
 const result=await recoverLosslessFullEvidence({...f,db,request_admit:e=>b.reserve(e),before_modify:async()=>{},execute:true,now});
 await finalizeRunUsage(db,{reservationId:reservation_id,sourceRunId:'123',now,usage:db.usageSnapshot()});
 assert.equal(result.moved.length,48);assert.equal(result.bridge_mutation_batches,6);assert.equal(bridgeHTTP,12);assert.equal(f.fetches,48);assert.ok(wireMax<p.bridge_wire_bytes);
 // Actual acquire8, initial guard3, immutable save6, six guards3 and own
 // release4: even the automatic owner path fits without borrowing release.
 assert.ok(8+3+6+result.bridge_mutation_batches*3+4<=p.max_control_HTTP);
 assert.equal(b.summary().total,100);assert.equal(b.summary().used.hot,52);assert.ok(b.summary().limits.hot-b.summary().used.hot>=24);assert.equal(db.usageSnapshot().unknown_ops,0);
 assert.equal(f.raw.prepare('SELECT COUNT(*) AS n FROM report2_full_evidence_archive_v1').get().n,48);
 assert.ok(f.raw.prepare("SELECT * FROM full_evidence_shadow_log WHERE full_evidence_id='LAST_RARE'").get());
});
test('oversized bridge rows and the six-transaction cap retain untouched originals for a later admitted run',async()=>{
 const f=fixture();for(let i=3;i<=12;i++)f.raw.prepare('INSERT INTO full_evidence_shadow_log VALUES(?,?,?,?,?)').run('OLD'+i,'A-USDT',now-(i+5)*DAY,JSON.stringify({data:'x'.repeat(800000)}),now-(i+5)*DAY);
 f.raw.prepare("UPDATE full_evidence_shadow_log SET evidence_compact_json=? WHERE full_evidence_id='OLD1'").run(JSON.stringify({data:'x'.repeat(1500000)}));
 const result=await recoverLosslessFullEvidence({...f,request_admit:()=>({allowed:true}),before_modify:async()=>{},execute:true,now});
 assert.equal(result.bridge_mutation_batches,6);assert.ok(result.bridge_bound_retained_hot.length>0);assert.equal(result.partial_candidate_set,true);assert.ok(f.raw.prepare("SELECT * FROM full_evidence_shadow_log WHERE full_evidence_id='OLD1'").get());assert.equal(result.history_discarded,false);
});
test('a local pre-request refusal never spends native SQL or fabricates unknown operations',async()=>{
 let sent=0;const db=new RemoteD1Database('https://bridge.invalid/d1','fixture-token',{beforeRequest:()=>({allowed:false}),fetchImpl:async()=>{sent++;throw Error('must not send');}});
 await assert.rejects(db.prepare('SELECT 1').first(),/LOCAL_HTTP_ADMISSION_DENIED/);assert.equal(sent,0);assert.deepEqual(db.usageSnapshot(),{requests:0,rows_read:0,rows_written:0,unknown_ops:0,targets:{}});
});

test('a separately owner-approved UTC15 emergency uses exactly the third existing slot, preserving old spend and next-report headroom',async()=>{
 const f=fixture(),stamp=Date.parse('2026-10-15T12:00:00Z'),day='2026-10-15',owner_emergency_day=day;
 const add=id=>f.raw.prepare('INSERT INTO report2_runner_budget_ledger_shadow VALUES(?,?,?,?,?,?,?)').run('RETAINED_HISTORY:'+id+':1',day,5000,400,'FINALIZED',stamp,0);
 assert.equal((await reserveLosslessRecoveryBudget(f.db,{reservation_id:'RETAINED_HISTORY:3:1',now:stamp,owner_emergency_day})).allowed,false);
 add(1);add(2);assert.equal((await reserveLosslessRecoveryBudget(f.db,{reservation_id:'RETAINED_HISTORY:3:1',now:stamp})).allowed,false);
 const third=await reserveLosslessRecoveryBudget(f.db,{reservation_id:'RETAINED_HISTORY:3:1',now:stamp,owner_emergency_day});assert.equal(third.allowed,true);assert.deepEqual(third.protected_next_full,{rows_read:59000,rows_written:920});
 assert.equal((await reserveLosslessRecoveryBudget(f.db,{reservation_id:'RETAINED_HISTORY:4:1',now:stamp,owner_emergency_day})).allowed,false);assert.equal(f.raw.prepare('SELECT COUNT(*) n FROM report2_runner_budget_ledger_shadow').get().n,3);assert.equal(LOSSLESS_RECOVERY_POLICY.max_runs_day,2);
 await assert.rejects(reserveLosslessRecoveryBudget(f.db,{reservation_id:'RETAINED_HISTORY:5:1',now:stamp+DAY,owner_emergency_day}),/EXACT_OWNER_EMERGENCY/);
});

test('the exceptional third slot refuses unknown costs or consumption of next-full-report headroom',async()=>{
 for(const kind of ['READS','WRITES','UNKNOWN']){
  const f=fixture(),stamp=Date.parse('2026-10-15T12:00:00Z'),day='2026-10-15';
  for(let id=1;id<=2;id++)f.raw.prepare('INSERT INTO report2_runner_budget_ledger_shadow VALUES(?,?,?,?,?,?,?)').run('RETAINED_HISTORY:'+id+':1',day,5000,400,'FINALIZED',stamp,0);
  f.raw.prepare('INSERT INTO report2_runner_budget_ledger_shadow VALUES(?,?,?,?,?,?,?)').run('OTHER:1',day,kind==='READS'?3430000:1,kind==='WRITES'?68400:1,'FINALIZED',stamp,kind==='UNKNOWN'?1:0);
  assert.equal((await reserveLosslessRecoveryBudget(f.db,{reservation_id:'RETAINED_HISTORY:3:1',now:stamp,owner_emergency_day:day})).allowed,false,kind);
 }
});
