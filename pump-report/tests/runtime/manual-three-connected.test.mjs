import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {START_PROFILE} from '../../profile/start-v1.mjs';
import {NATIVE_POLICY,reserveNativeRun} from '../../runtime/native-budget.mjs';
import {PROTECTED_HTTP} from '../../runtime/provider-policy.mjs';
import {createUnifiedBudget,utcDay} from '../../runtime/budget.mjs';
import {MemoryStore} from '../../runtime/store.mjs';

test('the owner three-manual amendment reaches native and HTTP protection without refunding old ledger obligations or unknown attempts',async()=>{
  assert.equal(START_PROFILE.manual_checks_daily_reserve,3);assert.equal(NATIVE_POLICY.manual_checks,3);
  assert.equal(PROTECTED_HTTP.http_by_provider.BINGX,3*17);assert.equal(PROTECTED_HTTP.http_by_provider.TELEGRAM,3);
  assert.equal(PROTECTED_HTTP.delivery_http,24);assert.equal(PROTECTED_HTTP.outcomes_http,24);
  const now=Date.parse('2026-10-26T07:00:00Z'),day=utcDay(now),sql=new DatabaseSync(':memory:');
  try{
    sql.exec('CREATE TABLE report2_runner_budget_ledger_shadow(reservation_id TEXT PRIMARY KEY,day_utc TEXT,reserve_rows_read INTEGER,reserve_rows_written INTEGER,measured_rows_read INTEGER,measured_rows_written INTEGER,measured_requests INTEGER,unknown_ops INTEGER,state TEXT,started_ts INTEGER,completed_ts INTEGER,source_run_id TEXT);CREATE INDEX idx_report2_runner_budget_day ON report2_runner_budget_ledger_shadow(day_utc,started_ts);');
    sql.prepare("INSERT INTO report2_runner_budget_ledger_shadow VALUES('ARTIFICIAL_ISSUED',?,3340000,0,7,0,1,0,'FINALIZED',1,2,'ARTIFICIAL')").run(day);
    const old=sql.prepare("SELECT * FROM report2_runner_budget_ledger_shadow WHERE reservation_id='ARTIFICIAL_ISSUED'").get();
    const db={prepare(query){let args=[];return {bind(...values){args=values;return this;},async all(){const results=sql.prepare(query).all(...args),write=/^(INSERT|UPDATE|CREATE)/.test(query.trim()),changes=write?Number(sql.prepare('SELECT changes() AS n').get().n):0;return {success:true,results,meta:{rows_read:write?1:results.length,rows_written:changes,changes}};}};}};
    await assert.rejects(reserveNativeRun({db,run_id:'ARTIFICIAL_OLD_SIX',mode:'AUTO',clock:()=>now,policy:{...NATIVE_POLICY,manual_checks:6}}),{code:'SHARED_NATIVE_DAY_BLOCKED_OR_DUPLICATE'});
    const native=await reserveNativeRun({db,run_id:'ARTIFICIAL_NEW_THREE',mode:'AUTO',clock:()=>now});assert.equal(native.admission.max_rows_read,5000);assert.equal(native.admission.max_rows_written,300);
    assert.deepEqual(sql.prepare("SELECT * FROM report2_runner_budget_ledger_shadow WHERE reservation_id='ARTIFICIAL_ISSUED'").get(),old);
    const held=sql.prepare("SELECT reserve_rows_read AS r,reserve_rows_written AS w,state FROM report2_runner_budget_ledger_shadow WHERE reservation_id='PUMP:AUTO:ARTIFICIAL_NEW_THREE'").get();assert.deepEqual({...held},{r:5000,w:300,state:'RESERVED'});
    const store=new MemoryStore(),unknown={provider:'BINGX',cost:2,reason:'ARTIFICIAL_PRIOR_UNKNOWN'},outstanding={run_id:'ARTIFICIAL_OLD',provider:'BINGX',cost:1};
    await store.set('pump:resources',{schema:'PUMP_SHARED_RESOURCE_V1',days:{[day]:797},providers:{BINGX:{days:{[day]:797},months:{'2026-10':797},recent:[]}},outstanding:{issued:outstanding},unknown:{old:unknown}});
    const make=(id,reserves)=>createUnifiedBudget({store,run_id:id,mode:'AUTO',clock:()=>now,policies:{BINGX:{version:'ARTIFICIAL',evidence_ref:'ARTIFICIAL_ONLY',project_daily_cap:900,project_monthly_cap:27900,per_minute_cap:10}},protected_reserves:reserves,admission:{provider_policy_version:'ARTIFICIAL',expires_ts:now+10000}});
    await assert.rejects(make('ARTIFICIAL_OLD_RESERVE',{...PROTECTED_HTTP,http_by_provider:{...PROTECTED_HTTP.http_by_provider,BINGX:102,TELEGRAM:6}}).reserve({provider:'BINGX',request_id:'ARTIFICIAL_OLD_DENIED'}),{code:'PROTECTED_DAY_RESERVE'});
    await make('ARTIFICIAL_OWNER_THREE',PROTECTED_HTTP).reserve({provider:'BINGX',request_id:'ARTIFICIAL_NEW_ONE'});
    const state=await store.get('pump:resources');assert.equal(state.days[day],798);assert.equal(state.providers.BINGX.days[day],798);assert.deepEqual(state.unknown.old,unknown);assert.deepEqual(state.outstanding.issued,outstanding);
  }finally{sql.close();}
});
