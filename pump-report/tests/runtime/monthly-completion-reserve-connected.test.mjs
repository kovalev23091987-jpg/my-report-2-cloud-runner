import test from 'node:test';
import assert from 'node:assert/strict';
import {createUnifiedBudget} from '../../runtime/budget.mjs';
import {PROTECTED_HTTP} from '../../runtime/provider-policy.mjs';
import {MemoryStore} from '../../runtime/store.mjs';

test('near monthly exhaustion the real governor protects finishing delivery and outcomes before admitting more candidate data',async()=>{
  const at=Date.parse('2026-10-26T07:00:00Z'),store=new MemoryStore(),oldUnknown={cost:2,provider:'BINGX'},spent=27900-51-24-24;
  await store.set('pump:resources',{schema:'PUMP_SHARED_RESOURCE_V1',days:{'2026-10-26':0},providers:{BINGX:{days:{'2026-10-26':0},months:{'2026-10':spent},recent:[]}},outstanding:{},unknown:{prior:oldUnknown}});
  const budget=createUnifiedBudget({store,run_id:'ARTIFICIAL_MONTHLY_FINISH',mode:'AUTO',clock:()=>at,policies:{BINGX:{version:'ARTIFICIAL',evidence_ref:'ARTIFICIAL_ONLY',project_daily_cap:900,project_monthly_cap:27900,per_minute_cap:10}},protected_reserves:PROTECTED_HTTP,admission:{provider_policy_version:'ARTIFICIAL',expires_ts:at+10000}});
  await assert.rejects(budget.reserve({provider:'BINGX',request_id:'ARTIFICIAL_NO_MORE_CORE'}),{code:'PROVIDER_MONTH_EXHAUSTED'});
  assert.equal((await store.get('pump:resources')).providers.BINGX.months['2026-10'],spent);
  const delivery=await budget.reserve({provider:'BINGX',family:'USDT_M',purpose:'DELIVERY',request_id:'ARTIFICIAL_FINISH_EXISTING'});await budget.finalize(delivery);
  const saved=await store.get('pump:resources');assert.equal(saved.providers.BINGX.months['2026-10'],spent+1);assert.deepEqual(saved.unknown.prior,oldUnknown);assert.equal(budget.summary().total,1);
});
