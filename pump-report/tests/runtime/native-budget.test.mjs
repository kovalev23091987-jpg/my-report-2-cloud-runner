import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {reserveNativeRun,finalizeNativeRun} from '../../runtime/native-budget.mjs';

function database(){
  const sql=new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE report2_runner_budget_ledger_shadow(reservation_id TEXT PRIMARY KEY,day_utc TEXT,reserve_rows_read INTEGER,reserve_rows_written INTEGER,measured_rows_read INTEGER,measured_rows_written INTEGER,measured_requests INTEGER,unknown_ops INTEGER,state TEXT,started_ts INTEGER,completed_ts INTEGER,source_run_id TEXT);CREATE INDEX idx_report2_runner_budget_day ON report2_runner_budget_ledger_shadow(day_utc,started_ts);`);
  const db={prepare(query){let args=[];return {bind(...values){args=values;return this;},async all(){const statement=sql.prepare(query);const results=statement.all(...args);const write=/^(INSERT|UPDATE|CREATE)/.test(query.trim());return {success:true,results,meta:{rows_read:write?1:results.length,rows_written:write?Number(sql.prepare('SELECT changes() AS n').get().n):0,changes:write?Number(sql.prepare('SELECT changes() AS n').get().n):0}};}};}};
  return {db,sql};
}
const now=Date.parse('2026-10-25T10:00:00Z');
test('actual SQLite executes atomic native admission, state CAS and finalization SQL',async()=>{const {db,sql}=database();const r=await reserveNativeRun({db,run_id:'one',mode:'AUTO',clock:()=>now});await r.store.install();await r.store.set('sample',{n:1});await Promise.all([r.store.atomic('sample',v=>({state:{n:v.n+1},result:true})),r.store.atomic('sample',v=>({state:{n:v.n+1},result:true}))]);assert.equal((await r.store.get('sample')).n,3);const result=await finalizeNativeRun(r,{clock:()=>now+1});assert.equal(result.state,'FINALIZED');const row=sql.prepare('SELECT * FROM report2_runner_budget_ledger_shadow').get();assert.equal(row.reserve_rows_read,5000);assert.equal(row.reserve_rows_written,300);assert.equal(row.unknown_ops,0);sql.close();});
test('legacy unknown cost stops a new native run without changing the old row',async()=>{const {db,sql}=database();sql.prepare("INSERT INTO report2_runner_budget_ledger_shadow VALUES('OLD','2026-10-25',59000,920,100,10,2,1,'FINALIZED',1,2,'old')").run();await assert.rejects(reserveNativeRun({db,run_id:'blocked',mode:'AUTO',clock:()=>now}),{code:'SHARED_NATIVE_DAY_BLOCKED_OR_DUPLICATE'});assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM report2_runner_budget_ledger_shadow').get().n,1);sql.close();});
test('six manual reservations and next-full reserve are protected by shared admission',async()=>{const {db,sql}=database();sql.prepare("INSERT INTO report2_runner_budget_ledger_shadow VALUES('OLD','2026-10-25',3450000,69000,1,1,1,0,'FINALIZED',1,2,'old')").run();await assert.rejects(reserveNativeRun({db,run_id:'budget',mode:'AUTO',clock:()=>now}),{code:'SHARED_NATIVE_DAY_BLOCKED_OR_DUPLICATE'});sql.close();});
