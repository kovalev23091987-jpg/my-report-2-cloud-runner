import test from 'node:test';
import assert from 'node:assert/strict';
import {PRODUCTION_PLAN,productionPolicies,productionAdmission} from '../../runtime/production-policy.mjs';
import {PROVIDER_POLICIES,PROVIDER_POLICY_VERSION,PROTECTED_HTTP} from '../../runtime/provider-policy.mjs';
import {createUnifiedBudget,utcDay,utcMonth} from '../../runtime/budget.mjs';
import {MemoryStore} from '../../runtime/store.mjs';

const T=Date.parse('2026-10-26T07:00:00Z'),day=utcDay(T),month=utcMonth(T);
const forecast={http_upper_bound:PRODUCTION_PLAN.candidate_http_upper_bound,http_by_provider:PRODUCTION_PLAN.candidate_http_by_provider};
const admission=(at,mode)=>productionAdmission({evidence_ref:'ARTIFICIAL_NATIVE_NOT_ADMISSION',expires_ts:at+900000},PROVIDER_POLICY_VERSION,{mode});
const make=(store,at,mode='AUTO')=>createUnifiedBudget({store,run_id:crypto.randomUUID(),mode,clock:()=>at,policies:productionPolicies(PROVIDER_POLICIES),protected_reserves:PROTECTED_HTTP,admission:admission(at,mode)});

test('genuine production uses a fresh bounded run admission while trial caps and charged qualification counters stay intact',async()=>{
  const original=JSON.stringify(PROVIDER_POLICIES),policies=productionPolicies(PROVIDER_POLICIES),store=new MemoryStore();
  assert.equal(policies.BINGX.project_daily_cap,900);assert.equal(policies.BINGX.project_monthly_cap,27900);assert.ok(policies.BINGX.allowed_paths.includes('/openApi/swap/v2/quote/trades'));
  assert.equal(policies.TELEGRAM.project_daily_cap,27);assert.equal(policies.TELEGRAM.project_monthly_cap,837);assert.equal(policies.BINGX.qualification_limits_retained.attempt_cap,24);
  assert.equal(JSON.stringify(PROVIDER_POLICIES),original);assert.equal(PROVIDER_POLICIES.TELEGRAM.project_monthly_cap,2);
  const priorUnknown={provider:'BINGX',cost:2};await store.set('pump:resources',{days:{[day]:25},providers:{BINGX:{days:{[day]:20},months:{[month]:20},recent:[],qualification_totals:{[PROVIDER_POLICY_VERSION]:24}},TELEGRAM:{days:{[day]:2},months:{[month]:2},recent:[],qualification_totals:{[PROVIDER_POLICY_VERSION]:1}}},outstanding:{},unknown:{retained:priorUnknown}});
  const qualification=createUnifiedBudget({store,run_id:'ARTIFICIAL_SPENT_TRIAL',mode:'MANUAL',clock:()=>T,policies:PROVIDER_POLICIES,protected_reserves:PROTECTED_HTTP,admission:{provider_policy_version:PROVIDER_POLICY_VERSION,expires_ts:T+10000,run_purpose:'ACCEPTANCE_TEST'}});
  await assert.rejects(qualification.reserve({provider:'BINGX',request_id:'ARTIFICIAL_CANNOT_REARM'}),{code:'QUALIFICATION_ATTEMPTS_EXHAUSTED'});
  const production=make(store,T,'MANUAL');for(const provider of ['BINGX','TELEGRAM']){const r=await production.reserve({provider,family:provider==='TELEGRAM'?'DELIVERY':'USDT_M',request_id:'ARTIFICIAL_REAL_PURPOSE_'+provider});assert.equal(r.run_purpose,'PRODUCTION');await production.finalize(r);}
  const state=await store.get('pump:resources');assert.equal(state.days[day],27);assert.equal(state.providers.BINGX.qualification_totals[PROVIDER_POLICY_VERSION],24);assert.equal(state.providers.TELEGRAM.qualification_totals[PROVIDER_POLICY_VERSION],1);assert.deepEqual(state.unknown.retained,priorUnknown);
  assert.equal(admission(T,'MANUAL').expires_ts,T+900000);assert.deepEqual(admission(T,'LOOKUP').allowed_providers,[]);assert.throws(()=>admission(T,'CONTROL'),/BOUNDED_PRODUCTION_NATIVE_ADMISSION_REQUIRED/);
});

test('whole-candidate forecast protects the planned 80 percent and later discovery/full-candidate slots across separate genuine runs',async()=>{
  const store=new MemoryStore();await store.set('pump:resources',{days:{[day]:25},providers:{},outstanding:{},unknown:{}});
  const early=make(store,T);const r=await early.reserve({provider:'BINGX',family:'USDT_M',purpose:'DISCOVERY',request_id:'ARTIFICIAL_FIRST_SCAN'});await early.finalize(r);
  let state=await store.get('pump:resources');assert.equal(state.automatic_plans[day].baseline_charged,25);assert.equal(state.automatic_plans[day].limit,618);
  await store.atomic('pump:resources',s=>{s.automatic_plans[day].charged=280;s.days[day]=305;s.providers.BINGX.days[day]=280;s.providers.BINGX.months[month]=280;s.providers.BINGX.recent=[];return {state:s,result:true};});
  const denied=await early.admitCandidate(forecast);assert.equal(denied.allowed,false);assert.equal(denied.detail,'WHOLE_CANDIDATE_PLANNED_ALLOCATION');assert.equal((await store.get('pump:resources')).days[day],305);
  const later=make(store,T+4*3600000);assert.equal((await later.admitCandidate(forecast)).allowed,true);assert.equal((await store.get('pump:resources')).automatic_plans[day].baseline_charged,25,'a new invocation does not reset the day plan');
});

test('the complete next candidate is declined before spending its first source request when day or monthly capacity only covers a partial check',async()=>{
  const at=T+10*3600000+1000;
  for(const [daily,monthly,detail]of [[850,850,'WHOLE_CANDIDATE_DAY_CAPACITY'],[0,27845,'WHOLE_CANDIDATE_PROVIDER_MONTH']]){
    const store=new MemoryStore();await store.set('pump:resources',{days:{[day]:daily},providers:{BINGX:{days:{[day]:daily},months:{[month]:monthly},recent:[]}},outstanding:{},unknown:{}});
    const budget=make(store,at,'MANUAL'),result=await budget.admitCandidate(forecast);assert.equal(result.allowed,false);assert.equal(result.detail,detail);assert.equal(budget.summary().total,0);assert.equal((await store.get('pump:resources')).days[day],daily);
  }
});
