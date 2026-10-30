import test from 'node:test';
import assert from 'node:assert/strict';
import {futureCandidateReserve,futureScheduledSQL,utcBudgetPeriodEnd} from '../../runtime/future-candidate-reserve.mjs';
import {DISCOVERY_PLAN,futureDiscoveryHttp} from '../../runtime/discovery-reserve.mjs';
import {createUnifiedBudget} from '../../runtime/budget.mjs';
import {MemoryStore} from '../../runtime/store.mjs';

test('Moscow work slots reserve only the applicable UTC day or month, so tomorrow does not consume tonight daily capacity',async()=>{
  const plan={cadence_ms:3600000,start_hour:10,end_hour:20,time_zone:'Europe/Moscow',http_per_slot:12,http_by_provider:{BINGX:10,TELEGRAM:1}};
  const night=Date.parse('2026-10-25T22:00:00Z'); // 01:00 Moscow, next UTC day work window.
  assert.equal(futureDiscoveryHttp(night,DISCOVERY_PLAN,{until_ts:utcBudgetPeriodEnd(night,'DAY')}),0);
  assert.equal(futureCandidateReserve(night,plan).http,0);assert.equal(futureCandidateReserve(night,plan,{period:'MONTH'}).http,120);
  assert.deepEqual(futureScheduledSQL(night,DISCOVERY_PLAN,{rows_read:5000,rows_written:300}),{runs:0,rows_read:0,rows_written:0});
  const monthEnd=Date.parse('2026-10-31T22:00:00Z');assert.equal(futureCandidateReserve(monthEnd,plan,{period:'MONTH'}).http,0);
  const utcReset=Date.parse('2026-10-26T00:00:00Z');assert.equal(futureCandidateReserve(utcReset,plan).http,120);assert.equal(futureScheduledSQL(utcReset,DISCOVERY_PLAN,{rows_read:5000,rows_written:300}).runs,120);
  const store=new MemoryStore();await store.set('pump:resources',{days:{'2026-10-25':899},providers:{BINGX:{days:{'2026-10-25':899},months:{'2026-10':899},recent:[]}},outstanding:{},unknown:{}});
  const budget=createUnifiedBudget({store,run_id:'ARTIFICIAL_NIGHT_MANUAL',mode:'MANUAL',clock:()=>night,policies:{BINGX:{version:'ARTIFICIAL',evidence_ref:'ARTIFICIAL_ONLY',project_daily_cap:900,project_monthly_cap:27900,per_minute_cap:10,outcome_source:false,delivery_source:false}},protected_reserves:{http_by_provider:{BINGX:0},delivery_http:0,outcomes_http:0},admission:{provider_policy_version:'ARTIFICIAL',expires_ts:night+10000,discovery:DISCOVERY_PLAN,future_candidates:plan}});
  const receipt=await budget.reserve({provider:'BINGX',request_id:'ARTIFICIAL_LAST_CURRENT_DAY'});await budget.finalize(receipt);assert.equal((await store.get('pump:resources')).days['2026-10-25'],900);
});
