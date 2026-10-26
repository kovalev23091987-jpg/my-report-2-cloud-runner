import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../runtime/store.mjs';
import {createUnifiedBudget,utcDay,utcMonth} from '../../runtime/budget.mjs';
import {productionAdmission,productionPolicies,PRODUCTION_PLAN} from '../../runtime/production-policy.mjs';
import {PROVIDER_POLICIES,PROVIDER_POLICY_VERSION,PROTECTED_HTTP} from '../../runtime/provider-policy.mjs';
import {createPumpRunner} from '../../runtime/runner.mjs';

const T=Date.parse('2026-10-26T08:12:00Z'),day=utcDay(T),month=utcMonth(T);
const whole={http_upper_bound:12,http_by_provider:PRODUCTION_PLAN.candidate_http_by_provider};
async function fixture(){
  const store=new MemoryStore();
  await store.set('pump:resources',{days:{[day]:209},providers:{BINGX:{days:{[day]:209},months:{[month]:239},recent:[]}},outstanding:{},unknown:{retained1:{cost:1},retained2:{cost:1}},automatic_plans:{[day]:{schema:'PUMP_PLANNED_AUTOMATIC_DAY_V1',day,created_ts:T-3600000,baseline_charged:5,protected_at_creation:102,fraction:0.8,limit:634,charged:204}}});
  let now=T;
  const make=(mode='AUTO')=>createUnifiedBudget({store,run_id:crypto.randomUUID(),mode,clock:()=>now,policies:productionPolicies(PROVIDER_POLICIES),protected_reserves:PROTECTED_HTTP,admission:productionAdmission({evidence_ref:'ARTIFICIAL_NOT_NATIVE_ADMISSION',expires_ts:now+900000},PROVIDER_POLICY_VERSION,{mode})});
  const spend=async(budget,n)=>{for(let k=0;k<n;k++){now+=10000;const r=await budget.reserve({provider:'BINGX',family:'USDT_M',purpose:'CORE',request_id:crypto.randomUUID()});await budget.finalize(r);}};
  return {store,make,spend,setTime:n=>{now=n;}};
}

test('ARTIFICIAL runner saves two completed checks and a separate quota deferral, then releases its executor',async()=>{
  const f=await fixture(),instruments=['FIXTURE_A','FIXTURE_B','FIXTURE_C'].map(base=>({instrument_id:'BINGX:USDT_M:'+base,asset_id:'ARTIFICIAL:'+base,native_symbol:base+'-USDT',base,venue:'BINGX',market_type:'PERPETUAL',quote:'USDT',settle:'USDT',classification_status:'VERIFIED_CRYPTO'}));
  const price=i=>({instrument_id:i.instrument_id,status:'USABLE',value:1,event_ts:T-1,received_ts:T,expires_ts:T+30000});
  const sources={getCatalog:async()=>({instruments,unqualified:[],coverage:{status:'CHECKED'}}),getOverview:async({instruments:subset})=>({observations:subset.map(instrument=>({instrument,facts:{price:price(instrument)},reported_change_pct:30})),coverage:{status:'CHECKED'}}),getCore:async()=>({facts:{},coverage:{status:'CHECKED'}})};
  const runner=createPumpRunner({store:f.store,sources,budget:f.make(),clock:()=>T,delivery:{pending:async()=>[],drain:async()=>[]},evaluateOutcome:()=>{throw Error('NO_READY_OUTCOME_EXPECTED');},analyzePump:input=>({run_id:input.run_id,mode:input.mode,run_purpose:input.run_purpose,analysis_ts:input.analysis_ts,instrument:input.instrument,ready:false,automatic_eligible:false,status:'REJECTED',reasons:['ARTIFICIAL_REFUSAL']}),run_purpose:'PRODUCTION'});
  const result=await runner.execute({mode:'AUTO',run_id:'ARTIFICIAL_QUOTA_SAVE',publish:false});
  assert.equal(result.checked.length,2);assert.equal(result.deferred.length,1);assert.equal(result.deferred[0].source_coverage.detail,'EVEN_DAY_CANDIDATE_ALLOCATION');
  assert.ok(result.checked.every(x=>x.analysis&&x.candidate_quota.maximum===2));
  const saved=await f.store.get('pump:run:ARTIFICIAL_QUOTA_SAVE');assert.equal(saved.checked.length,2);assert.equal(saved.deferred.length,1);assert.equal((await f.store.get('pump:executor')).owner,null);
});

test('ARTIFICIAL saved209 snapshot spreads deep work across remaining hours and a new invocation cannot reset the current share',async()=>{
  const f=await fixture(),budget=f.make();
  for(let n=0;n<2;n++){assert.equal((await budget.admitCandidate(whole)).allowed,true);await f.spend(budget,4);}
  const denied=await budget.admitCandidate(whole);assert.equal(denied.allowed,false);assert.equal(denied.detail,'EVEN_DAY_CANDIDATE_ALLOCATION');
  assert.equal((await f.make().admitCandidate(whole)).allowed,false);
  let state=await f.store.get('pump:resources'),bucket=Object.values(state.automatic_deep_pacing[day])[0];
  assert.equal(bucket.limit,24);assert.equal(bucket.charged,8);assert.equal(bucket.candidate_count,2);assert.equal(state.days[day],217);assert.equal(state.automatic_plans[day].charged,212);
  f.setTime(T+3600000);assert.equal((await f.make().admitCandidate(whole)).allowed,true,'later hour retains capacity instead of inheriting an exhausted day');
  state=await f.store.get('pump:resources');assert.equal(state.automatic_plans[day].baseline_charged,5);assert.equal(state.automatic_plans[day].limit,634);assert.equal(Object.keys(state.unknown).length,2);
  f.setTime(Date.parse('2026-10-26T16:12:00Z'));
  const later=await f.make().admitCandidate(whole);assert.equal(later.allowed,true);assert.equal(later.candidate_quota.base_per_period,2);assert.equal(later.candidate_quota.carried_in,13);assert.equal(later.candidate_quota.maximum,15,'unused candidate places carry; cheap rejections never refund spent places');
});

test('ARTIFICIAL full10hour window retains two candidate places in every hour, all120scans, delivery and unknowns',async()=>{
  const f=await fixture(),retained=(await f.store.get('pump:resources')).unknown;
  await f.store.set('pump:resources',{days:{},providers:{},outstanding:{},unknown:retained});
  const begin=Date.parse('2026-10-26T07:00:00Z'),counts=[];
  for(let h=0;h<10;h++){
    let checked=0;
    for(let slot=0;slot<12;slot++){
      f.setTime(begin+h*3600000+slot*300000+1000);const budget=f.make();
      for(let n=0;n<2;n++){const r=await budget.reserve({provider:'BINGX',family:'USDT_M',purpose:'DISCOVERY',request_id:crypto.randomUUID()});await budget.finalize(r);f.setTime(begin+h*3600000+slot*300000+1000+(n+1)*10000);}
      if(slot===0){
        for(let n=0;n<2;n++){
          const admitted=await budget.admitCandidate(whole);assert.equal(admitted.allowed,true);assert.equal(admitted.candidate_quota.maximum,2);checked++;
          await f.spend(budget,10);
          const r=await budget.reserve({provider:'TELEGRAM',family:'DELIVERY',purpose:'DELIVERY',request_id:crypto.randomUUID()});await budget.finalize(r);
        }
        assert.equal((await f.make().admitCandidate(whole)).allowed,false);
      }
    }
    counts.push(checked);
  }
  const state=await f.store.get('pump:resources');assert.deepEqual(counts,Array(10).fill(2));assert.equal(state.days[day],460);assert.equal(state.providers.TELEGRAM.days[day],20);
  assert.ok(20*12+240<=state.automatic_plans[day].limit,'maximum complete checks include the unassigned map slot');
  assert.equal(state.automatic_candidate_allocations[day].candidates_per_period,2);assert.equal(Object.keys(state.unknown).length,2);
});

test('ARTIFICIAL concurrent whole-candidate tickets cannot exceed the same quota; manual and discovery keep protected paths',async()=>{
  const f=await fixture();const choices=await Promise.all([f.make().admitCandidate(whole),f.make().admitCandidate(whole),f.make().admitCandidate(whole)]);
  assert.equal(choices.filter(x=>x.allowed).length,2);assert.equal(choices.filter(x=>!x.allowed).length,1);
  assert.equal((await f.store.get('pump:resources')).days[day],209,'logical quota does not fabricate a physical HTTP charge');
  await f.spend(f.make('MANUAL'),1);
  f.setTime(T+270000);
  const scan=f.make(),r=await scan.reserve({provider:'BINGX',family:'USDT_M',purpose:'DISCOVERY',request_id:'ARTIFICIAL_FUTURE_SCAN'});await scan.finalize(r);
  const state=await f.store.get('pump:resources');assert.equal(state.days[day],211);assert.equal(Object.values(state.automatic_deep_pacing[day])[0].candidate_count,2);assert.equal(Object.keys(state.unknown).length,2);
  assert.equal(PROTECTED_HTTP.http_by_provider.BINGX,51);assert.equal(PROTECTED_HTTP.http_by_provider.TELEGRAM,3);assert.equal(PRODUCTION_PLAN.planned_load_fraction,0.8);
});


test('ARTIFICIAL an empty first hour carries two unused places into four qualified checks next hour, without borrowing later hours',async()=>{
  const f=await fixture();await f.store.set('pump:resources',{days:{},providers:{},outstanding:{},unknown:{retained:{cost:1}}});
  const begin=Date.parse('2026-10-26T07:00:00Z');f.setTime(begin);
  const scan=f.make(),r=await scan.reserve({provider:'BINGX',family:'USDT_M',purpose:'DISCOVERY',request_id:'EMPTY_FIRST_HOUR'});await scan.finalize(r);
  let state=await f.store.get('pump:resources');assert.equal(state.automatic_candidate_allocations[day].candidates_per_period,2);assert.equal(Object.keys(state.automatic_deep_pacing??{}).length,0,'an empty queue issues no candidate places');
  f.setTime(begin+3600000);const results=await Promise.all(Array.from({length:5},()=>f.make().admitCandidate(whole)));
  assert.equal(results.filter(x=>x.allowed).length,4);assert.equal(results.filter(x=>!x.allowed).length,1);assert.equal(results[0].candidate_quota.maximum,4);assert.equal(results[0].candidate_quota.carried_in,2);
  assert.equal((await f.store.get('pump:resources')).days[day],1,'candidate tickets do not invent HTTP attempts');
  f.setTime(begin+2*3600000);assert.equal((await f.make().admitCandidate(whole)).candidate_quota.maximum,2,'the next hour still owns its two places');
  f.setTime(begin+3*3600000);const next=await f.make().admitCandidate(whole);assert.equal(next.candidate_quota.maximum,3,'one unused place carries, one spent place does not refund');
});


test('ARTIFICIAL a quiet discovery scan never fabricates a candidate or starts core analysis to fill capacity',async()=>{
  const f=await fixture(),instrument={instrument_id:'BINGX:USDT_M:QUIET',asset_id:'ARTIFICIAL:QUIET',native_symbol:'QUIET-USDT',base:'QUIET',venue:'BINGX',market_type:'PERPETUAL',quote:'USDT',settle:'USDT',classification_status:'VERIFIED_CRYPTO'};
  const runner=createPumpRunner({store:f.store,budget:f.make(),clock:()=>T,delivery:{pending:async()=>[],drain:async()=>[]},sources:{getCatalog:async()=>({instruments:[instrument],unqualified:[],coverage:{status:'CHECKED'}}),getOverview:async()=>({observations:[{instrument,reported_change_pct:1,facts:{price:{instrument_id:instrument.instrument_id,status:'USABLE',value:1,event_ts:T-1,received_ts:T,expires_ts:T+30000}}}],coverage:{status:'CHECKED'}}),getCore:async()=>{throw Error('NO_CANDIDATE_NO_CORE_REQUEST');}},analyzePump:()=>{throw Error('NO_CANDIDATE_NO_ANALYSIS');},evaluateOutcome:()=>{throw Error('NO_READY_OUTCOME_EXPECTED');},run_purpose:'PRODUCTION'});
  const result=await runner.execute({mode:'AUTO',run_id:'ARTIFICIAL_QUIET_SCAN',publish:false});assert.equal(result.checked.length,0);assert.deepEqual(await f.store.get('pump:candidate-queue'),{});assert.equal((await f.store.get('pump:resources')).days[day],209);
});
