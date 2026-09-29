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

const request=(id,provider,n=4)=>({reservation_id:id,contract:'TAO-USDT',run_id:'RUN',requests:{[provider]:n},max_requests:n,deadline_ts:1010000});
test('explicit unspent provider denial leaves room for the next source',async()=>{
 const b=createSharedSourceBudget({clock:()=>1000000,max_requests:5,provider_admit:async r=>r.requests.GMX?{allowed:false,new_reservation:false,reason:'FREE_QUOTA_EXHAUSTED',reservation_not_created:true}:{allowed:true,new_reservation:true}});
 assert.equal((await b.admit(request('gmx','GMX'))).allowed,false);
 assert.equal(b.summary().reserved_http,0);
 assert.equal((await b.admit(request('lighter','LIGHTER'))).allowed,true);
 assert.equal(b.summary().reserved_http,4);assert.equal(b.summary().actual_http,0);
});
test('unknown reservation acknowledgement cannot release room for another source',async()=>{
 for(const provider_admit of [async()=>{throw Error('lost acknowledgement');},async()=>({allowed:false,new_reservation:false,reason:'RESERVATION_READBACK_MISMATCH'})]){
  const b=createSharedSourceBudget({clock:()=>1000000,max_requests:5,provider_admit});
  await b.admit(request('gmx','GMX'));assert.equal(b.summary().reserved_http,4);
  assert.equal((await b.admit(request('lighter','LIGHTER'))).reason,'COMBINED_RUN_HTTP_BUDGET');
 }
});
