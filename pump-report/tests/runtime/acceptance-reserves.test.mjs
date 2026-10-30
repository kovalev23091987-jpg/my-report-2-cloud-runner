import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {reserveNativeRun} from '../../runtime/native-budget.mjs';
import {ACCEPTANCE_MANUAL_RUN_IDS} from '../../contracts/run-purpose.mjs';
import {createUnifiedBudget,utcDay} from '../../runtime/budget.mjs';
import {MemoryStore} from '../../runtime/store.mjs';
const now=Date.parse('2026-10-25T15:30:00Z');
function database(otherRead,{historicAcceptance=false}={}){
  const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE report2_runner_budget_ledger_shadow(reservation_id TEXT PRIMARY KEY,day_utc TEXT,reserve_rows_read INTEGER,reserve_rows_written INTEGER,measured_rows_read INTEGER,measured_rows_written INTEGER,measured_requests INTEGER,unknown_ops INTEGER,state TEXT,started_ts INTEGER,completed_ts INTEGER,source_run_id TEXT);CREATE INDEX idx_report2_runner_budget_day ON report2_runner_budget_ledger_shadow(day_utc,started_ts);');
  const insert=(id,r,w)=>sql.prepare("INSERT INTO report2_runner_budget_ledger_shadow VALUES(?,'2026-10-25',?,?,1,0,1,0,'FINALIZED',1,2,'ARTIFICIAL')").run(id,r,w);
  insert('ARTIFICIAL_OLD_SPENT',otherRead,0);if(historicAcceptance)insert('PUMP:MANUAL:'+ACCEPTANCE_MANUAL_RUN_IDS[0],5000,300);
  const db={prepare(query){let args=[];return {bind(...values){args=values;return this;},async all(){const results=sql.prepare(query).all(...args),write=/^(WITH|INSERT|UPDATE|CREATE)/.test(query.trim()),changes=write?Number(sql.prepare('SELECT changes() AS n').get().n):0;return {success:true,results,meta:{rows_read:write?1:results.length,rows_written:changes,changes}};}};}};
  return {sql,db};
}
test('historical acceptance240 costs stay charged while three user-manual slots remain protected',async()=>{
  const f=database(3337000,{historicAcceptance:true});try{
    const before=JSON.stringify(f.sql.prepare('SELECT * FROM report2_runner_budget_ledger_shadow ORDER BY reservation_id').all());
    await assert.rejects(reserveNativeRun({db:f.db,run_id:'ARTIFICIAL_AUTO',mode:'AUTO',clock:()=>now}),{code:'SHARED_NATIVE_DAY_BLOCKED_OR_DUPLICATE'});
    assert.equal(JSON.stringify(f.sql.prepare('SELECT * FROM report2_runner_budget_ledger_shadow ORDER BY reservation_id').all()),before);
    assert.equal(f.sql.prepare("SELECT reserve_rows_read AS r,reserve_rows_written AS w FROM report2_runner_budget_ledger_shadow WHERE reservation_id=?").get('PUMP:MANUAL:'+ACCEPTANCE_MANUAL_RUN_IDS[0]).r,5000);
  }finally{f.sql.close();}
});
test('an acceptance run cannot borrow a user slot, while a real user manual check can use its own protected slot',async()=>{
  const f=database(3341000);try{
    await assert.rejects(reserveNativeRun({db:f.db,run_id:ACCEPTANCE_MANUAL_RUN_IDS[1],mode:'MANUAL',run_purpose:'ACCEPTANCE_TEST',clock:()=>now}),{code:'SHARED_NATIVE_DAY_BLOCKED_OR_DUPLICATE'});
    const r=await reserveNativeRun({db:f.db,run_id:'ARTIFICIAL_REAL_USER_MANUAL',mode:'MANUAL',run_purpose:'PRODUCTION',clock:()=>now});assert.equal(r.admission.max_rows_read,5000);assert.equal(r.admission.max_rows_written,300);
  }finally{f.sql.close();}
});
test('inventing a new acceptance run ID is refused before native SQL',async()=>{
  let calls=0;await assert.rejects(reserveNativeRun({db:{prepare(){calls++;throw Error('Forbidden SQL');}},run_id:'ANOTHER_TEST_ID',mode:'MANUAL',run_purpose:'ACCEPTANCE_TEST',clock:()=>now}),{code:'EXACT_ACCEPTANCE_MANUAL_ID_REQUIRED'});assert.equal(calls,0);
});
test('acceptance HTTP cannot spend the shared six-manual reserve even when per-provider test allowance remains',async()=>{
  const store=new MemoryStore(),day=utcDay(now),historicUnknown={cost:1,provider:'ARTIFICIAL_OLD'};await store.set('pump:resources',{schema:'PUMP_SHARED_RESOURCE_V1',days:{[day]:800},providers:{},outstanding:{},unknown:{historic:historicUnknown}});
  const make=(purpose,id)=>createUnifiedBudget({store,run_id:id,mode:'MANUAL',clock:()=>now,policies:{TEST:{version:'ARTIFICIAL',evidence_ref:'ARTIFICIAL',project_daily_cap:900,project_monthly_cap:27900,per_minute_cap:10}},admission:{provider_policy_version:'ARTIFICIAL',expires_ts:now+10000,run_purpose:purpose},protected_reserves:{http_by_provider:{TEST:108},delivery_http:24,outcomes_http:24}});
  await assert.rejects(make('ACCEPTANCE_TEST','test').reserve({provider:'TEST',request_id:'ARTIFICIAL_TEST'}),{code:'PROTECTED_DAY_RESERVE'});
  assert.equal((await store.get('pump:resources')).days[day],800);await make('PRODUCTION','manual').reserve({provider:'TEST',request_id:'ARTIFICIAL_USER'});
  const saved=await store.get('pump:resources');assert.equal(saved.days[day],801);assert.deepEqual(saved.unknown.historic,historicUnknown);
});
