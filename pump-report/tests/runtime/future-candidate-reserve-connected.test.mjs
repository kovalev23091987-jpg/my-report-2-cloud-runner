import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {futureCandidateReserve,futureScheduledSQL} from '../../runtime/future-candidate-reserve.mjs';
import {DISCOVERY_PLAN} from '../../runtime/discovery-reserve.mjs';
import {createUnifiedBudget,utcDay} from '../../runtime/budget.mjs';
import {reserveNativeRun} from '../../runtime/native-budget.mjs';
import {PROTECTED_HTTP} from '../../runtime/provider-policy.mjs';
import {MemoryStore} from '../../runtime/store.mjs';

const start=Date.parse('2026-10-26T07:00:00Z');
// Costs are deliberately artificial; no selected-source production plan or
// provider entitlement is asserted by these tests.
const plan={cadence_ms:3600000,start_hour:10,end_hour:20,time_zone:'Europe/Moscow',http_per_slot:13,http_by_provider:{BINGX:11,TELEGRAM:1}};

test('actual HTTP governor retains full future-candidate capacity alongside future discovery, manual, delivery and outcome pools',async()=>{
  assert.deepEqual(futureCandidateReserve(start,plan),{slots:9,http:117,http_by_provider:{BINGX:99,TELEGRAM:9}});
  assert.equal(futureCandidateReserve(start-1,plan).slots,10);assert.equal(futureCandidateReserve(start+10*3600000,plan).slots,0);
  let now=start;const store=new MemoryStore(),day=utcDay(now),oldUnknown={cost:2,provider:'BINGX'};
  await store.set('pump:resources',{schema:'PUMP_SHARED_RESOURCE_V1',days:{[day]:443},providers:{BINGX:{days:{[day]:443},months:{'2026-10':443},recent:[]}},outstanding:{},unknown:{retained:oldUnknown}});
  const make=id=>createUnifiedBudget({store,run_id:id,mode:'AUTO',clock:()=>now,policies:{BINGX:{version:'ARTIFICIAL',evidence_ref:'ARTIFICIAL_ONLY',project_daily_cap:900,project_monthly_cap:27900,per_minute_cap:10}},protected_reserves:PROTECTED_HTTP,admission:{provider_policy_version:'ARTIFICIAL',expires_ts:start+86400000,discovery:DISCOVERY_PLAN,future_candidates:plan}});
  await assert.rejects(make('ARTIFICIAL_EARLY').reserve({provider:'BINGX',request_id:'ARTIFICIAL_NO_EARLY_DRAIN'}),{code:'PROTECTED_DAY_RESERVE'});
  assert.equal((await store.get('pump:resources')).days[day],443);
  now+=3600000;const budget=make('ARTIFICIAL_LATER');const receipt=await budget.reserve({provider:'BINGX',request_id:'ARTIFICIAL_LATER_CAPACITY'});await budget.finalize(receipt);
  const state=await store.get('pump:resources');assert.equal(state.days[day],444);assert.deepEqual(state.unknown.retained,oldUnknown);assert.equal(futureCandidateReserve(now,plan).slots,8);
  const monthStore=new MemoryStore();await monthStore.set('pump:resources',{days:{},providers:{BINGX:{days:{},months:{'2026-10':27900-51-214-88},recent:[]}},outstanding:{},unknown:{}});
  const monthly=createUnifiedBudget({store:monthStore,run_id:'ARTIFICIAL_MONTH',mode:'MANUAL',clock:()=>now,policies:{BINGX:{version:'ARTIFICIAL',evidence_ref:'ARTIFICIAL_ONLY',project_daily_cap:900,project_monthly_cap:27900,per_minute_cap:10}},protected_reserves:PROTECTED_HTTP,admission:{provider_policy_version:'ARTIFICIAL',expires_ts:now+10000,discovery:DISCOVERY_PLAN,future_candidates:plan}});
  // MANUAL may consume its manual reserve, but still preserves later automatic
  // source availability. Put the exact monthly boundary beyond that reserve.
  await monthStore.atomic('pump:resources',s=>{s.providers.BINGX.months['2026-10']+=51;return {state:s,result:true};});
  await assert.rejects(monthly.reserve({provider:'BINGX',request_id:'ARTIFICIAL_MONTH_DENIED'}),{code:'PROVIDER_MONTH_EXHAUSTED'});
});

test('native admission protects all future scheduled SQL envelopes without charging a second invocation for an embedded deep check',async()=>{
  assert.deepEqual(futureScheduledSQL(start,DISCOVERY_PLAN,{rows_read:5000,rows_written:300}),{runs:119,rows_read:595000,rows_written:35700});
  const sql=new DatabaseSync(':memory:');try{
    sql.exec('CREATE TABLE report2_runner_budget_ledger_shadow(reservation_id TEXT PRIMARY KEY,day_utc TEXT,reserve_rows_read INTEGER,reserve_rows_written INTEGER,measured_rows_read INTEGER,measured_rows_written INTEGER,measured_requests INTEGER,unknown_ops INTEGER,state TEXT,started_ts INTEGER,completed_ts INTEGER,source_run_id TEXT);CREATE INDEX idx_report2_runner_budget_day ON report2_runner_budget_ledger_shadow(day_utc,started_ts);');
    sql.prepare("INSERT INTO report2_runner_budget_ledger_shadow VALUES('ARTIFICIAL_PRIOR',?,0,24000,0,10,1,0,'FINALIZED',1,2,'ARTIFICIAL')").run(utcDay(start));
    const before=sql.prepare('SELECT * FROM report2_runner_budget_ledger_shadow').all();
    const db={prepare(query){let args=[];return {bind(...values){args=values;return this;},async all(){const results=sql.prepare(query).all(...args),write=/^(INSERT|UPDATE|CREATE)/.test(query.trim()),changes=write?Number(sql.prepare('SELECT changes() AS n').get().n):0;return {success:true,results,meta:{rows_read:write?1:results.length,rows_written:changes,changes}};}};}};
    await assert.rejects(reserveNativeRun({db,run_id:'ARTIFICIAL_PROTECT_DAY',mode:'AUTO',clock:()=>start,future_schedule:DISCOVERY_PLAN}),{code:'SHARED_NATIVE_DAY_BLOCKED_OR_DUPLICATE'});
    assert.deepEqual(sql.prepare('SELECT * FROM report2_runner_budget_ledger_shadow').all(),before);
    const permitted=await reserveNativeRun({db,run_id:'ARTIFICIAL_LATE_WINDOW',mode:'AUTO',clock:()=>start+9*3600000,future_schedule:DISCOVERY_PLAN});assert.equal(permitted.admission.max_rows_written,300);
    assert.deepEqual(sql.prepare("SELECT * FROM report2_runner_budget_ledger_shadow WHERE reservation_id='ARTIFICIAL_PRIOR'").get(),before[0]);
  }finally{sql.close();}
});
