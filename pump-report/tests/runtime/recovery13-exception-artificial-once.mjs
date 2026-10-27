import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRecovery13MaintenanceSqlException,RECOVERY13_LOOKUP_RUN_ID} from '../../operator/recovery13-maintenance-sql-exception.mjs';
import {reserveNativeRun,finalizeNativeRun,LOOKUP_ENVELOPE,NATIVE_POLICY} from '../../runtime/native-budget.mjs';

test('one artificial maintenance boundary: ordinary11 spent, pending0, approved exact12, no13',async()=>{
  globalThis.fetch=()=>{throw Error('NETWORK_FORBIDDEN_ARTIFICIAL_CASE');};
  const T=Date.parse('2026-10-27T12:00:00Z'),day='2026-10-27',sql=new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE report2_runner_budget_ledger_shadow(
    reservation_id TEXT PRIMARY KEY,day_utc TEXT,reserve_rows_read INTEGER,reserve_rows_written INTEGER,
    state TEXT,started_ts INTEGER,measured_rows_read INTEGER,measured_rows_written INTEGER,
    unknown_ops INTEGER,source_run_id TEXT,measured_requests INTEGER,completed_ts INTEGER);
    CREATE INDEX idx_report2_runner_budget_day ON report2_runner_budget_ledger_shadow(day_utc);`);
  const seed=sql.prepare('INSERT INTO report2_runner_budget_ledger_shadow VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
  for(let n=0;n<12;n++)seed.run('PUMP:LOOKUP:ARTIFICIAL_OLD_'+n,day,500,30,'FINALIZED',T-60000,5,4,0,'ARTIFICIAL_OLD_'+n,4,T-50000);
  let localQueries=0;
  const dbFor=transform=>({prepare(query){return {bind(...values){return {async all(){
    const request=transform(query,values);localQueries++;
    const statement=sql.prepare(request.sql);statement.setAllowBareNamedParameters(true);
    const named=Object.fromEntries(request.params.map((v,n)=>[String(n+1),v]));
    if(statement.columns().length)return {success:true,results:statement.all(named),meta:{rows_read:1,rows_written:0,changes:0}};
    const out=statement.run(named);return {success:true,results:[],meta:{rows_read:1,rows_written:Number(out.changes),changes:Number(out.changes)}};
  }}}}}});
  const identity=(query,params)=>({sql:query,params});
  await assert.rejects(reserveNativeRun({db:dbFor(identity),run_id:'ARTIFICIAL_ORDINARY_THIRTEENTH',mode:'LOOKUP',clock:()=>T}),/SHARED_NATIVE_DAY_BLOCKED_OR_DUPLICATE/);
  const base={run_id:RECOVERY13_LOOKUP_RUN_ID,expires_ts:T+600000};
  const grant={schema:'OWNER_ONE_SAME_TEXT_RECOVERY_MAINTENANCE_LOOKUP13_V1',status:'PENDING_OWNER_APPROVAL',
    owner_thread_id:'01a171f7-596e-7dc0-a82f-3e92f57f4ef6',approval_message_sha256:'a'.repeat(64),
    day_utc:day,exact_run_id:RECOVERY13_LOOKUP_RUN_ID,previous_run_count:12,additional_runs:1,maximum_count_after:13,
    rows_read:500,rows_written:30,max_queries:16,approved_ts:T,expires_ts:T+600000};
  const beforePending=localQueries;
  assert.throws(()=>createRecovery13MaintenanceSqlException({...base,lookup_single_exception:grant},T),/DIRECT_OWNER_ONE_RECOVERY13_LOOKUP_APPROVAL_REQUIRED/);
  assert.equal(localQueries,beforePending,'pending approval reaches no SQL');
  const approved={...base,lookup_single_exception:{...grant,status:'APPROVED_BY_DIRECT_OWNER'}};
  const reservation=await reserveNativeRun({db:dbFor(createRecovery13MaintenanceSqlException(approved,T)),run_id:RECOVERY13_LOOKUP_RUN_ID,mode:'LOOKUP',clock:()=>T});
  assert.equal(reservation.reservation_id,'PUMP:LOOKUP:'+RECOVERY13_LOOKUP_RUN_ID);
  const final=await finalizeNativeRun(reservation,{clock:()=>T});assert.equal(final.state,'FINALIZED');
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM report2_runner_budget_ledger_shadow').get().n,13);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM report2_runner_budget_ledger_shadow WHERE reservation_id LIKE ?').get('PUMP:LOOKUP:ARTIFICIAL_OLD_%').n,12);
  assert.deepEqual({...sql.prepare('SELECT reserve_rows_read AS r,reserve_rows_written AS w,state FROM report2_runner_budget_ledger_shadow WHERE reservation_id=?').get('PUMP:LOOKUP:'+RECOVERY13_LOOKUP_RUN_ID)},{r:500,w:30,state:'FINALIZED'});
  await assert.rejects(reserveNativeRun({db:dbFor(createRecovery13MaintenanceSqlException(approved,T)),run_id:RECOVERY13_LOOKUP_RUN_ID,mode:'LOOKUP',clock:()=>T}),/SHARED_NATIVE_DAY_BLOCKED_OR_DUPLICATE/);
  await assert.rejects(reserveNativeRun({db:dbFor(identity),run_id:'ARTIFICIAL_ORDINARY_FOURTEENTH',mode:'LOOKUP',clock:()=>T}),/SHARED_NATIVE_DAY_BLOCKED_OR_DUPLICATE/);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM report2_runner_budget_ledger_shadow').get().n,13);
  assert.equal(LOOKUP_ENVELOPE.max_runs_day,10);assert.equal(NATIVE_POLICY.manual_checks,3);
  const digest=p=>createHash('sha256').update(readFileSync(new URL(p,import.meta.url))).digest('hex');
  const result={schema:'ROOT_RECOVERY13_MAINTENANCE_EXCEPTION_ARTIFICIAL_CASE_V1',case_count:1,status:'PASS',
    evidence_class:'ARTIFICIAL_LOCAL_SQLITE_ONLY',server_native_SQL:0,provider_HTTP:0,Telegram:0,
    assertions:['ordinary thirteenth denied','pending grant before any SQL','exact named extra thirteenth finalized','all twelve spent rows retained','duplicate denied','ordinary fourteenth denied','original500R30W and default10 and manual3 retained'],
    final_local_ledger_rows:13,local_queries:localQueries,
    helper_sha256:digest('../../operator/recovery13-maintenance-sql-exception.mjs'),test_sha256:digest('./recovery13-exception-artificial-once.mjs')};
  if(process.env.PUMP_RECOVERY13_EXCEPTION_RESULT)writeFileSync(process.env.PUMP_RECOVERY13_EXCEPTION_RESULT,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
  sql.close();
});
