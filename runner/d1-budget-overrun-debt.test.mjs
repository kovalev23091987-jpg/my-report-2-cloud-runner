import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {loadDailyUsageAggregate,evaluateDailyReservationBudget,finalizeRunUsage} from './d1-preaction-budget-guard.mjs';
import {reserveCanonicalCopyBudget,CANONICAL_COPY_POLICY} from './canonical-cold-copy.mjs';
import {reserveLosslessRecoveryBudget} from './lossless-full-evidence-recovery.mjs';
import {reservePrivatePriceBudget} from '../cloudflare/public-collector/private-price-consumer.mjs';
import {reservePrivateForecastBudget} from '../cloudflare/free-history/private-forecast-consumer.mjs';
import {buildR88DailyAdmissionView} from '../current-generation/files/src/v3-adaptive-budget.mjs';
const now=Date.parse('2026-10-15T14:00:00Z'),day='2026-10-15';
function fixture(){
 const raw=new DatabaseSync(':memory:');raw.exec('CREATE TABLE report2_runner_budget_ledger_shadow(reservation_id TEXT PRIMARY KEY,day_utc TEXT,reserve_rows_read INTEGER,reserve_rows_written INTEGER,state TEXT,started_ts INTEGER,source_run_id TEXT,measured_rows_read INTEGER,measured_rows_written INTEGER,measured_requests INTEGER,unknown_ops INTEGER,completed_ts INTEGER); CREATE INDEX budget_day ON report2_runner_budget_ledger_shadow(day_utc);');
 raw.exec(fs.readFileSync(new URL('../current-generation/migrations/009_public_collector_runtime.sql',import.meta.url),'utf8'));
 const db={raw,prepare(sql){let args=[];return{bind(...a){args=a;return this;},async first(){const row=raw.prepare(sql).get(...args);return row?{...row}:null;},async run(){return{meta:{changes:Number(raw.prepare(sql).run(...args).changes)}};}};}};
 const add=(id,reserveR,reserveW,read=null,write=null,state='FINALIZED',unknown=0)=>raw.prepare('INSERT INTO report2_runner_budget_ledger_shadow VALUES(?,?,?,?,?,?,NULL,?,?,NULL,?,NULL)').run(id,day,reserveR,reserveW,state,now,read,write,unknown);
 return{db,raw,add};
}
test('the actual fourth-run6778 snapshot plus finalization read charges6779 without rewriting its old ledger row',async()=>{
 const f=fixture();f.add('RETAINED_HISTORY:38746776207:1792072511063',5000,400,6778,4);const before=f.raw.prepare('SELECT * FROM report2_runner_budget_ledger_shadow').get();
 const d=await loadDailyUsageAggregate(f.db,now);assert.equal(d.reserved_rows_read,6779);assert.equal(d.reserved_rows_written,400);assert.equal(d.measured_rows_read,6778);assert.equal(d.run_count,1);assert.deepEqual(f.raw.prepare('SELECT * FROM report2_runner_budget_ledger_shadow').get(),before);
 assert.equal(evaluateDailyReservationBudget({daily:d,nextReservation:{rows_read:5000,rows_written:400},maxDailyReads:11000}).allowed,false);
});
test('finalization raises only an exceeded reserve, never refunds unused allowance, and refuses duplicate finalization',async()=>{
 for(const [read,write,expectR,expectW] of [[6778,3,6779,400],[2,450,5000,451],[2,3,5000,400]]){
  const f=fixture();f.add('run',5000,400,null,null,'RESERVED');const r=await finalizeRunUsage(f.db,{reservationId:'run',sourceRunId:'source',now,usage:{rows_read:read,rows_written:write,requests:6,unknown_ops:0}});
  const row=f.raw.prepare('SELECT * FROM report2_runner_budget_ledger_shadow').get();assert.equal(row.reserve_rows_read,expectR);assert.equal(row.reserve_rows_written,expectW);assert.equal(row.state,'FINALIZED');assert.equal(r.reservation_never_reduced,true);
  await assert.rejects(finalizeRunUsage(f.db,{reservationId:'run',sourceRunId:'source',now,usage:{rows_read:0,rows_written:0,requests:0,unknown_ops:0}}),/FINALIZE_ACK/);assert.deepEqual(f.raw.prepare('SELECT * FROM report2_runner_budget_ledger_shadow').get(),row);
 }
});
test('old per-row overrun debt blocks each active archive/price/forecast admission even while other rows have unused reserves',async()=>{
 const cases=[
  ['copy',5000,(db)=>reserveCanonicalCopyBudget(db,{reservation_id:'CANONICAL_COLD_COPY:9:9',now})],
  ['retention',5000,(db)=>reserveLosslessRecoveryBudget(db,{reservation_id:'RETAINED_HISTORY:9:9',now})],
  ['price',800,(db)=>reservePrivatePriceBudget(db,{bucket:Math.floor(now/300000)*300000,now})],
  ['forecast',5000,(db)=>reservePrivateForecastBudget(db,{scheduled_ts:Math.floor(now/3600000)*3600000,now})],
 ];
 for(const [label,next,reserve] of cases){
  const f=fixture();f.add('old-overrun',5000,400,6778,4);f.add('other-unused',3500000-next-5000-1,10,0,1);const before=f.raw.prepare('SELECT * FROM report2_runner_budget_ledger_shadow ORDER BY reservation_id').all();
  const admission=await reserve(f.db);assert.equal(admission.allowed,false,label);assert.deepEqual(f.raw.prepare('SELECT * FROM report2_runner_budget_ledger_shadow ORDER BY reservation_id').all(),before,label);
 }
 assert.equal(CANONICAL_COPY_POLICY.reservation.rows_read,5000);
});
test('unknown costs remain blocked and reserved in-flight rows cannot be discounted by measured zeros',async()=>{
 const f=fixture();f.add('in-flight',8000,600,0,0,'RESERVED');f.add('unknown',5000,400,100,4,'FINALIZED',1);
 const d=await loadDailyUsageAggregate(f.db,now);assert.equal(d.reserved_rows_read,13000);assert.equal(d.reserved_rows_written,1000);assert.equal(d.unfinished_count,1);assert.equal(evaluateDailyReservationBudget({daily:d}).status,'UNMEASURED_FINALIZED_USAGE');
});

test('the assembled analytics daily view cannot refund the ledger debt or reprice another family by its own burst cap',async()=>{
 const f=fixture();f.add('old-overrun',5000,400,6778,4);f.add('analytics-in-flight',54000,840,0,0,'RESERVED');f.add('small-in-flight',800,32,0,0,'RESERVED');f.add('completed-unused',5000,80,0,1);
 const raw=await loadDailyUsageAggregate(f.db,now),view=buildR88DailyAdmissionView(raw,{rows_read:1500,rows_written:16});
 assert.equal(raw.reserved_rows_read,66579);assert.equal(view.reserved_rows_read,raw.reserved_rows_read);assert.equal(view.reserved_rows_written,raw.reserved_rows_written);assert.equal(view.no_completed_reservation_refund,true);assert.equal(view.unfinished_reservations_charged_by_own_ledger_caps,true);
 assert.equal(evaluateDailyReservationBudget({daily:view,nextReservation:{rows_read:54000,rows_written:840},maxDailyReads:110000}).allowed,false);
 assert.equal(view.unfinished_count,2);assert.equal(view.measured_rows_read,6778);
});

test('an incomplete or contradictory analytics admission view fails closed without inventing a charged zero',()=>{
 const base={ok:true,unfinished_count:0,measured_rows_read:100,measured_rows_written:4,reserved_rows_read:200,reserved_rows_written:10};
 for(const key of ['reserved_rows_read','reserved_rows_written']){const d={...base};delete d[key];assert.equal(buildR88DailyAdmissionView(d,{rows_read:54000,rows_written:840}).ok,false);}
 const retained=buildR88DailyAdmissionView({...base,reserved_rows_read:90},{rows_read:54000,rows_written:840});assert.equal(retained.reserved_rows_read,100);
});
