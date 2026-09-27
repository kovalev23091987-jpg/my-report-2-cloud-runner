import test from 'node:test';
import assert from 'node:assert/strict';
import {runsPerDayForInterval,calculateScheduleQuota,fastestSafeInterval,cachedSourceMonthlyCalls} from '../files/src/schedule-quota-calculator.mjs';

test('19 minutes is mathematical minimum with eight daily manual runs',()=>{
  const fastest=fastestSafeInterval({manual_runs_per_day:8});
  assert.equal(fastest.interval_minutes,19);
  assert.equal(fastest.total_units,13020);
  assert.equal(fastest.operational_headroom,480);
});

test('18 minutes is rejected before relying on the provider official ceiling',()=>{
  const result=calculateScheduleQuota({interval_minutes:18});
  assert.equal(result.scheduled_runs_per_day,80);
  assert.equal(result.total_units,13640);
  assert.equal(result.safe,false);
  assert.ok(!result.reasons.includes('SCHEDULED_CAP_EXCEEDED'));
  assert.ok(result.reasons.includes('OPERATIONAL_CAP_EXCEEDED'));
  assert.ok(!result.reasons.includes('OFFICIAL_QUOTA_EXCEEDED'));
});

test('20, 22 and 25 minute choices leave progressively more quota headroom',()=>{
  const rows=[20,22,25].map(interval=>calculateScheduleQuota({interval_minutes:interval}));
  assert.deepEqual(rows.map(x=>x.scheduled_runs_per_day),[72,66,58]);
  assert.ok(rows.every(x=>x.safe));
  for(let i=1;i<rows.length;i+=1)assert.ok(rows[i].operational_headroom>rows[i-1].operational_headroom);
});

test('cached global sources are budgeted independently from report frequency',()=>{
  assert.equal(cachedSourceMonthlyCalls({calls_per_refresh:4,ttl_minutes:60}),2976);
  assert.equal(cachedSourceMonthlyCalls({calls_per_refresh:2,ttl_minutes:15}),5952);
});
