import test from 'node:test';
import assert from 'node:assert/strict';
import {R88_BURST_RESERVATION,buildR88BurstReservation} from '../files/src/v3-adaptive-budget.mjs';
import {D1_BURST_RESERVATION} from '../files/src/supplemental-source-policy.mjs';

test('34k read burst closes observed projected-liquidation envelope and fits 80-run daily cap',()=>{
  assert.deepEqual(R88_BURST_RESERVATION,{rows_read:34000,rows_written:560});
  assert.deepEqual(D1_BURST_RESERVATION,R88_BURST_RESERVATION);
  assert.ok(20445+9932<=R88_BURST_RESERVATION.rows_read);
  assert.ok(R88_BURST_RESERVATION.rows_read*80<=3_500_000);
  assert.ok(R88_BURST_RESERVATION.rows_written*80<=70_000);
});

test('nominal daily budget remains the hard upper bound',()=>{
  const out=buildR88BurstReservation({ok:true,rows_read:43750,rows_written:875,daily_limits:{rows_read:3_500_000,rows_written:70_000}});
  assert.equal(out.status,'CLOSED_BURST');
  assert.equal(out.rows_read,34000);
  assert.equal(out.rows_written,560);
});
