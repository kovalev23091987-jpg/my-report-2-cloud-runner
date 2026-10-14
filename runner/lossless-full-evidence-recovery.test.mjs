import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {recoverLosslessFullEvidence,reserveLosslessRecoveryBudget,LOSSLESS_RECOVERY_POLICY} from './lossless-full-evidence-recovery.mjs';
import {retainedSchemaSql,rewriteRetainedSelect,createHistoryRestorer} from './retained-history.mjs';
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
 const db={usageSnapshot:()=>({...usage}),prepare(sql){return{args:[],bind(...a){this.args=a;return this;},async all(){calls.push(sql);const results=raw.prepare(sql).all(...this.args).map(r=>({...r}));usage.requests++;usage.rows_read+=results.length;return{results};},async first(){return(await this.all()).results[0]??null;},async run(){calls.push(sql);const ack=raw.prepare(sql).run(...this.args);usage.requests++;usage.rows_written+=Number(ack.changes);return{meta:{changes:Number(ack.changes)}};}};}};
 const prepare=db.prepare.bind(db);db.prepare=sql=>({...prepare(sql),sql});db.batch=async statements=>{raw.exec('BEGIN');try{const result=[];for(const stmt of statements)result.push(await stmt.run());raw.exec('COMMIT');return result;}catch(error){raw.exec('ROLLBACK');throw error;}};
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
