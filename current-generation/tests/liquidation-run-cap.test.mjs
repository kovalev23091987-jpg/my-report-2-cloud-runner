import test from 'node:test';
import assert from 'node:assert/strict';
import {createSharedSourceBudget} from '../files/src/liquidation-extension/run-source-budget.mjs';

const T=1_800_000_000_000;
const admit=async request=>({allowed:true,new_reservation:true,reservation_id:request.reservation_id});
test('thirty simultaneous movers cannot exceed one five-request supplemental lane',async()=>{
 const budget=createSharedSourceBudget({provider_admit:admit,clock:()=>T,max_requests:5});
 const results=await Promise.all(Array.from({length:30},(_,i)=>budget.admit({reservation_id:`MOVE:${i}`,contract:`C${i}-USDT`,run_id:'one-run',requests:{LIGHTER:4},max_requests:4,deadline_ts:T+10000})));
 assert.equal(results.filter(x=>x.allowed).length,1);
 assert.equal(budget.summary().reserved_http,4);assert.ok(budget.summary().reserved_http<=5);
 assert.equal(results.filter(x=>x.reason==='COMBINED_RUN_HTTP_BUDGET').length,29);
});

test('a full five-request native lane blocks every later mover in the same run',async()=>{
 const budget=createSharedSourceBudget({provider_admit:admit,clock:()=>T,max_requests:5});
 assert.equal((await budget.admit({reservation_id:'FIRST',contract:'A-USDT',run_id:'r',requests:{HYPERLIQUID:4,LIQFLOW:1},max_requests:5,deadline_ts:T+10000})).allowed,true);
 assert.equal((await budget.admit({reservation_id:'SECOND',contract:'B-USDT',run_id:'r',requests:{GMX:4},max_requests:4,deadline_ts:T+10000})).reason,'COMBINED_RUN_HTTP_BUDGET');
 assert.equal(budget.summary().reserved_http,5);
});
