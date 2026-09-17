import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveRunReservation, parseDailyUsageAggregate, evaluateDailyReservationBudget,
  evaluateWithinRunReservation
} from '../candidate/d1-preaction-budget-guard.mjs';

test('derived reservation fits exactly inside daily limits without invented constants',()=>{
  const r=deriveRunReservation({runsPerDay:288,maxDailyReads:3_500_000,maxDailyWrites:70_000});
  assert.equal(r.ok,true); assert.equal(r.rows_read,12152); assert.equal(r.rows_written,243);
  assert.ok(r.daily_reserved_if_all_runs.rows_read<=3_500_000); assert.ok(r.daily_reserved_if_all_runs.rows_written<=70_000);
});
test('SQL empty-day SUM NULL is zero only with COUNT=0',()=>{
  const r=parseDailyUsageAggregate({run_count:0,reserved_rows_read:null,reserved_rows_written:null,measured_rows_read:null,measured_rows_written:null,unknown_ops:null,unfinished_count:null},'2026-09-17');
  assert.equal(r.ok,true);assert.equal(r.status,'NEW_DAY_EMPTY_CONFIRMED');assert.equal(r.reserved_rows_written,0);
});
test('missing aggregate object is not zero',()=>{ assert.equal(parseDailyUsageAggregate(null,'2026-09-17').ok,false); });
test('nonempty day with NULL is fail closed',()=>{
  const r=parseDailyUsageAggregate({run_count:1,reserved_rows_read:null,reserved_rows_written:10,measured_rows_read:0,measured_rows_written:0,unknown_ops:0,unfinished_count:1},'2026-09-17');
  assert.equal(r.status,'NONEMPTY_DAY_USAGE_NULL_OR_INVALID');
});
test('day reservation blocks actual cumulative overflow',()=>{
  const d={ok:true,reserved_rows_read:3_499_900,reserved_rows_written:70_001,unknown_ops:0};
  const r=evaluateDailyReservationBudget({daily:d}); assert.equal(r.allowed,false);assert.ok(r.reasons.includes('DAY_RESERVED_WRITES_UNSAFE'));
});
test('unfinished reservation is safe when bounded and does not become unknown usage',()=>{
  const d=parseDailyUsageAggregate({run_count:2,reserved_rows_read:24000,reserved_rows_written:480,measured_rows_read:3000,measured_rows_written:50,unknown_ops:0,unfinished_count:1},'2026-09-17');
  assert.equal(d.ok,true); assert.equal(evaluateDailyReservationBudget({daily:d}).allowed,true);
});
test('within-run guard reserves optional Telegram work',()=>{
  const r=evaluateWithinRunReservation({reservation:{rows_read:12152,rows_written:243},currentUsage:{rows_read:4000,rows_written:210,requests:40,unknown_ops:0},extraRowsRead:64,extraRowsWritten:34});
  assert.equal(r.allowed,false);assert.ok(r.reasons.includes('RUN_WRITE_RESERVATION_EXCEEDED'));
});
test('within-run measured unknown op blocks action',()=>{
  const r=evaluateWithinRunReservation({reservation:{rows_read:12152,rows_written:243},currentUsage:{rows_read:1,rows_written:1,requests:2,unknown_ops:1}});
  assert.equal(r.allowed,false);assert.equal(r.status,'UNMEASURED_D1_USAGE');
});

test('next reservation is included before reservation write and can block day admission',()=>{
  const d={ok:true,reserved_rows_read:3_490_000,reserved_rows_written:69_800,unknown_ops:0};
  const next={rows_read:12_152,rows_written:243};
  const r=evaluateDailyReservationBudget({daily:d,nextReservation:next,maxDailyReads:3_500_000,maxDailyWrites:70_000});
  assert.equal(r.allowed,false);
  assert.ok(r.reasons.includes('DAY_RESERVED_READS_UNSAFE'));
  assert.ok(r.reasons.includes('DAY_RESERVED_WRITES_UNSAFE'));
});
