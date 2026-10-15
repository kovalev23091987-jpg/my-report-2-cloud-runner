import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {NEW_LIQ_SOURCE_RESEARCH as policy,reserveNewLiquidationSourceResearch as reserve} from './liquidation-new-source-admission-20261015.mjs';
const now=1792060200000,day=new Date(now).toISOString().slice(0,10);
function fixture(){
 const native=new DatabaseSync(':memory:');native.exec('CREATE TABLE report2_runner_budget_ledger_shadow(reservation_id TEXT PRIMARY KEY,day_utc TEXT,reserve_rows_read INTEGER,reserve_rows_written INTEGER,state TEXT,started_ts INTEGER,unknown_ops INTEGER,measured_rows_read INTEGER,measured_rows_written INTEGER)');
 return{native,prepare(sql){let args=[];return{bind(...a){args=a;return this;},async run(){return{meta:{changes:Number(native.prepare(sql).run(...args).changes)}};},async first(){return native.prepare(sql).get(...args);}};}};
}
test('new research cannot reset its distinct-provider allowance or claim a whole-day guarantee',async()=>{
 assert.equal(policy.complete_day_guarantee,false);assert.deepEqual(policy.protected_next_full,{rows_read:59000,rows_written:920});
 const db=fixture();assert.equal((await reserve(db,{id:'LIQ_NEW_SOURCE_VALIDATE:1:1',now})).allowed,true);
 assert.equal((await reserve(db,{id:'LIQ_NEW_SOURCE_VALIDATE:1:2',now})).allowed,false);
 assert.equal((await reserve(db,{id:'LIQ_NEW_SOURCE_VALIDATE:VIKE:2:1',now})).allowed,true);
 assert.equal((await reserve(db,{id:'LIQ_NEW_SOURCE_VALIDATE:VIKE:3:1',now})).allowed,false);
 assert.equal((await reserve(db,{id:'LIQ_NEW_SOURCE_VALIDATE:HYPERPERPS:4:1',now})).allowed,false);
 assert.equal(db.native.prepare('SELECT COUNT(*) AS n FROM report2_runner_budget_ledger_shadow').get().n,2);db.native.close();
});
test('all families and unknown operations restrict the shared native daily admission',async()=>{
 for(const [reads,writes,unknown] of [[3499000,0,0],[0,69980,0],[0,0,1]]){
  const db=fixture();db.native.prepare('INSERT INTO report2_runner_budget_ledger_shadow(reservation_id,day_utc,reserve_rows_read,reserve_rows_written,state,started_ts,unknown_ops) VALUES(?,?,?,?,?,?,?)').run('OTHER:1',day,reads,writes,'FINALIZED',now,unknown);
  assert.equal((await reserve(db,{id:'LIQ_NEW_SOURCE_VALIDATE:3:1',now})).allowed,false);assert.equal(db.native.prepare('SELECT COUNT(*) AS n FROM report2_runner_budget_ledger_shadow').get().n,1);db.native.close();
 }
});

test('research leaves the next full report plus its exact archive-copy envelope untouched',async()=>{
 for(const [reads,writes] of [[3440001,0],[0,69041]]){
  const db=fixture();db.native.prepare('INSERT INTO report2_runner_budget_ledger_shadow(reservation_id,day_utc,reserve_rows_read,reserve_rows_written,state,started_ts,unknown_ops) VALUES(?,?,?,?,?,?,?)').run('RUNTIME:1',day,reads,writes,'FINALIZED',now,0);
  assert.ok(reads+policy.reservation.rows_read<policy.limits.rows_read&&writes+policy.reservation.rows_written<policy.limits.rows_written);
  assert.equal((await reserve(db,{id:'LIQ_NEW_SOURCE_VALIDATE:VIKE:5:1',now})).allowed,false);assert.equal(db.native.prepare('SELECT COUNT(*) AS n FROM report2_runner_budget_ledger_shadow').get().n,1);db.native.close();
 }
});
