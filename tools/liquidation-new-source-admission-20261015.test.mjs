import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {NEW_LIQ_SOURCE_RESEARCH as policy,reserveNewLiquidationSourceResearch as reserve} from './liquidation-new-source-admission-20261015.mjs';
const now=1792060200000,day=new Date(now).toISOString().slice(0,10);
function fixture(){
 const native=new DatabaseSync(':memory:');native.exec('CREATE TABLE report2_runner_budget_ledger_shadow(reservation_id TEXT PRIMARY KEY,day_utc TEXT,reserve_rows_read INTEGER,reserve_rows_written INTEGER,state TEXT,started_ts INTEGER,unknown_ops INTEGER)');
 return{native,prepare(sql){let args=[];return{bind(...a){args=a;return this;},async run(){return{meta:{changes:Number(native.prepare(sql).run(...args).changes)}};},async first(){return native.prepare(sql).get(...args);}};}};
}
test('new research fits the retained complete-day plan and cannot reset its once-daily allowance',async()=>{
 assert.equal(policy.planned_day.rows_read,3413280+policy.reservation.rows_read);assert.equal(policy.planned_day.rows_written,69738+policy.reservation.rows_written);
 assert.ok(policy.planned_day.rows_read<=policy.limits.rows_read&&policy.planned_day.rows_written<=policy.limits.rows_written);
 const db=fixture();assert.equal((await reserve(db,{id:'LIQ_NEW_SOURCE_VALIDATE:1:1',now})).allowed,true);
 assert.equal((await reserve(db,{id:'LIQ_NEW_SOURCE_VALIDATE:1:2',now})).allowed,false);
 assert.equal((await reserve(db,{id:'LIQ_NEW_SOURCE_VALIDATE:2:1',now})).allowed,false);db.native.close();
});
test('all families and unknown operations restrict the shared native daily admission',async()=>{
 for(const [reads,writes,unknown] of [[3499000,0,0],[0,69980,0],[0,0,1]]){
  const db=fixture();db.native.prepare('INSERT INTO report2_runner_budget_ledger_shadow VALUES(?,?,?,?,?,?,?)').run('OTHER:1',day,reads,writes,'FINALIZED',now,unknown);
  assert.equal((await reserve(db,{id:'LIQ_NEW_SOURCE_VALIDATE:3:1',now})).allowed,false);assert.equal(db.native.prepare('SELECT COUNT(*) AS n FROM report2_runner_budget_ledger_shadow').get().n,1);db.native.close();
 }
});
