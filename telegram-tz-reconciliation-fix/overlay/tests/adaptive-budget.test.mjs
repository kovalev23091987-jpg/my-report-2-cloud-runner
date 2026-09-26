import test from 'node:test';import assert from 'node:assert/strict';
import {R88_BURST_RESERVATION,buildR88BurstReservation} from '../files/src/v3-adaptive-budget.mjs';

test('10-minute production cadence has a 28k read burst envelope for complete critical lanes',()=>{
  assert.equal(R88_BURST_RESERVATION.rows_read,28000);
  const nominal={ok:true,status:'CLOSED',rows_read:24305,rows_written:486,daily_limits:{rows_read:3500000,rows_written:70000}};
  const b=buildR88BurstReservation(nominal);
  assert.equal(b.ok,true);assert.equal(b.rows_read,28000);assert.equal(b.rows_written,560);
  assert.ok(320+50+32<=b.rows_written);
  assert.ok(325+50+64<=b.rows_written);
  assert.ok(340+50+80<=b.rows_written);
});
