import test from 'node:test';
import assert from 'node:assert/strict';
import {createSharedSourceBudget} from '../files/src/liquidation-extension/run-source-budget.mjs';

test('source admission preserves the exact upstream denial reason',async()=>{
 const clock=()=>1_000_000;
 const budget=createSharedSourceBudget({
  clock,
  max_requests:5,
  provider_admit:async()=>({allowed:false,new_reservation:false,reason:'PROVIDER_ALLOWANCE_NOT_CLOSED'}),
  fetch_impl:async()=>{throw new Error('NETWORK_MUST_NOT_START');},
 });
 const receipt=await budget.admit({
  reservation_id:'R1',contract:'DASH-USDT',run_id:'RUN1',
  requests:{GMX:4},max_requests:4,deadline_ts:clock()+10_000,
 });
 assert.equal(receipt.allowed,false);
 assert.equal(receipt.reason,'UPSTREAM_QUOTA_NOT_GRANTED:PROVIDER_ALLOWANCE_NOT_CLOSED');
 assert.equal(budget.summary().actual_http,0);
});
