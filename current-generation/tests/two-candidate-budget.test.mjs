import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {TWO_CANDIDATE_PLAN,TWO_NODE_HTTP_LIMITS,proveTwoCandidateBudget,deepRuntimeOptions} from '../files/src/two-candidate-policy.mjs';
import {createUnifiedHttpBudget,HTTP_LIMITS} from '../files/src/unified-budget.mjs';
import {compareOrdinaryDeepCandidates} from '../files/src/deep-candidate-order.mjs';
import {buildLiquidationMaintenanceStatements,buildBoundedRetentionStatement} from '../files/src/bounded-hot-maintenance.mjs';
import {evaluateBykQuotaAdmission,makeBykReserve,installBykQuotaLedger} from '../files/byk-quota-budget.mjs';
import {claimMaintenanceCadence,completeMaintenanceCadence} from '../../post-v7-consolidated/post-v7/src/scheduler-control.mjs';

class D1{
 constructor(){this.sql=new DatabaseSync(':memory:');}
 prepare(sql){const db=this;const stmt=args=>({bind:(...next)=>stmt(next),async run(){const r=db.sql.prepare(sql).run(...args);return{meta:{changes:r.changes}};},async first(){return db.sql.prepare(sql).get(...args)||null;}});return stmt([]);}
 async batch(statements){const out=[];for(const s of statements)out.push(await s.run());return out;}
}
test('two real checks fit the unchanged monthly allowance and eight manual commands',()=>{
 const p=proveTwoCandidateBudget();assert.equal(p.safe,true);assert.equal(p.monthly_units,13330);
 assert.equal(p.scheduled_monthly_units,11625);assert.equal(p.manual_monthly_units,1705);
 assert.equal(p.manual_commands_per_day,8);assert.equal(p.manual_deep_checks_per_day,11);
 assert.equal(p.maximum_analytics_rows_read,2538000);assert.equal(p.maximum_analytics_rows_written,39480);
});
test('two checks require admitted Node execution, while an exact coin and Worker stay at one',()=>{
 const src=fs.readFileSync(new URL('../files/src/worker.js',import.meta.url),'utf8');
 const body=src.match(/function buildBoundedDeepCheckPlan\([\s\S]*?\n\}/u)?.[0];assert.ok(body);
 const plan=new Function('schedulerNumber','compareOrdinaryDeepCandidates',`const STAGE0_EXTERNAL_REQUESTS=4,DEEP_CHECK_EXTERNAL_REQUESTS=39,SMART_MONEY_EXTERNAL_REQUESTS=1,WORKERS_FREE_EXTERNAL_LIMIT=50,EXTERNAL_REQUEST_RESERVE=6;${body};return buildBoundedDeepCheckPlan;`)(v=>v==null?null:Number(v),compareOrdinaryDeepCandidates);
 const shortlist=[{contract:'BEST-USDT',priority_rank:1},{contract:'SECOND-USDT',priority_rank:2},{contract:'THIRD-USDT',priority_rank:3}],scope=shortlist.map(r=>r.contract);
 const options={confirmed_scope_contracts:scope,...deepRuntimeOptions({actor:'GITHUB_ACTIONS',mode:'FULL_MANUAL'})};
 const p=plan({shortlist},[],Date.now(),options);
 assert.deepEqual(p.selected.map(r=>r.contract),['BEST-USDT','SECOND-USDT']);assert.equal(p.budget.estimated_external_requests_this_run,84);assert.equal(p.budget.within_known_external_limit,true);
 const worker=plan({shortlist},[],Date.now(),{...options,execution_runtime:'CLOUDFLARE_WORKER'});
 assert.equal(worker.selected.length,1);assert.equal(worker.budget.execution_external_limit,50);
 const exact=plan({shortlist},[],Date.now(),{...options,...deepRuntimeOptions({actor:'GITHUB_ACTIONS',mode:'MANUAL_COIN'}),require_exact_contract:true,required_contract:'SECOND-USDT'});
 assert.deepEqual(exact.selected.map(r=>r.contract),['SECOND-USDT']);
});
test('both candidates share 164 attempts and retain real capacity for their additional sources',()=>{
 const budget=createUnifiedHttpBudget({...HTTP_LIMITS,...TWO_NODE_HTTP_LIMITS});
 for(const [id,lane,attempts] of [['SCAN','hot',4],['A','hot',40],['B','hot',40],['A_RISK','hot',4],['B_RISK','hot',4],['A_CONTEXT','background',24],['B_CONTEXT','background',24],['EXTRA','background',8],['STATS','statistics',12]]){
   assert.equal(budget.reserve({logical_request_id:id,lane,attempts}).allowed,true,id);
 }
 assert.equal(budget.summary().total,160);
 assert.equal(budget.reserve({logical_request_id:'BEYOND_BACKGROUND',lane:'background',attempts:1}).allowed,false);
 assert.equal(budget.reserve({logical_request_id:'BEYOND_TOTAL',lane:'hot',attempts:5}).allowed,false);
});
test('funding and legacy direction priority cannot replace a better measured market rank',()=>{
 const a={contract:'BEST-USDT',priority_rank:1,_v3_discovery_source:{selection_score_0_100:75,discovery_direction_hint:'NEUTRAL_ANOMALY'}};
 const b={contract:'WEAKER-USDT',priority_rank:2,_v3_discovery_source:{selection_score_0_100:60,discovery_direction_hint:'LONG_WATCH'}};
 assert.ok(compareOrdinaryDeepCandidates(a,b)<0);
});
test('full manual exact top-two order cannot be replaced by a higher enrichment score',()=>{
 const src=fs.readFileSync(new URL('../files/src/worker.js',import.meta.url),'utf8');
 const body=src.match(/function buildBoundedDeepCheckPlan\([\s\S]*?\n\}/u)?.[0];assert.ok(body);
 const plan=new Function('schedulerNumber','compareOrdinaryDeepCandidates',`const STAGE0_EXTERNAL_REQUESTS=4,DEEP_CHECK_EXTERNAL_REQUESTS=39,SMART_MONEY_EXTERNAL_REQUESTS=1,WORKERS_FREE_EXTERNAL_LIMIT=50,EXTERNAL_REQUEST_RESERVE=6;${body};return buildBoundedDeepCheckPlan;`)(v=>v==null?null:Number(v),compareOrdinaryDeepCandidates);
 const shortlist=[
  {contract:'LEADER-USDT',priority_rank:1,selection_score_0_100:63},
  {contract:'SECOND-USDT',priority_rank:2,selection_score_0_100:88},
  {contract:'EASIER-USDT',priority_rank:3,selection_score_0_100:95},
 ],scope=shortlist.map(row=>row.contract);
 const result=plan({shortlist},[],Date.now(),{confirmed_scope_contracts:scope,...deepRuntimeOptions({actor:'GITHUB_ACTIONS',mode:'FULL_MANUAL'}),required_contracts:['LEADER-USDT','SECOND-USDT']});
 assert.deepEqual(result.selected.map(row=>row.contract),['LEADER-USDT','SECOND-USDT']);
 assert.equal(result.parameters.required_contracts_status,'READY_EXACT_ORDER');
 const unavailable=plan({shortlist:shortlist.slice(1)},[],Date.now(),{confirmed_scope_contracts:scope,...deepRuntimeOptions({actor:'GITHUB_ACTIONS',mode:'FULL_MANUAL'}),required_contracts:['LEADER-USDT','SECOND-USDT']});
 assert.deepEqual(unavailable.selected.map(row=>row.contract),['SECOND-USDT']);
 assert.equal(unavailable.parameters.required_contracts_status,'PARTIAL_EXACT_ORDER_FAIL_CLOSED_NO_REPLACEMENT');
});
test('hot maintenance drains hundreds of expired rows in bounded batches and preserves fresh rows',async()=>{
 const db=new D1(),now=Date.now(),cutoff=now-7*24*60*60_000;
 db.sql.exec('CREATE TABLE liquidation_shadow_observation(observed_ts INTEGER);CREATE TABLE liquidation_cluster_state(last_seen_ts INTEGER,lifecycle TEXT);');
 for(let i=0;i<300;i++){db.sql.prepare('INSERT INTO liquidation_shadow_observation VALUES(?)').run(cutoff-i-1);db.sql.prepare("INSERT INTO liquidation_cluster_state VALUES(?,'ACTIVE')").run(cutoff-i-1);}
 db.sql.prepare('INSERT INTO liquidation_shadow_observation VALUES(?)').run(now);db.sql.prepare("INSERT INTO liquidation_cluster_state VALUES(?,'ACTIVE')").run(now);
 for(let i=0;i<40;i++){const rs=await db.batch(buildLiquidationMaintenanceStatements(db,{now,cutoff}));assert.ok(rs.every(r=>r.meta.changes<=8));}
 assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM liquidation_shadow_observation').get().n,1);
 assert.deepEqual({...db.sql.prepare('SELECT * FROM liquidation_cluster_state').get()},{last_seen_ts:now,lifecycle:'ACTIVE'});
});
test('attempted automatic cycles consume a 40-minute slot even if later analysis fails',async()=>{
 const db=new D1(),now=Date.now();db.sql.exec('CREATE TABLE v3_maintenance_cadence_shadow(job_key TEXT PRIMARY KEY,interval_ms INTEGER,last_success_ts INTEGER,lease_owner TEXT,lease_started_ts INTEGER,lease_expires_ts INTEGER,updated_ts INTEGER,shadow_only INTEGER,last_result TEXT);');
 const args={job_key:'TWO_CANDIDATE_ANALYTICS_40M',actor:'NODE',now_ts:now,interval_ms:40*60_000};
 assert.equal((await claimMaintenanceCadence(db,args)).claimed,true);
 assert.equal((await completeMaintenanceCadence(db,{...args,success:true,result:'ATTEMPT_ADMITTED'})).completed,true);
 assert.equal((await claimMaintenanceCadence(db,{...args,now_ts:now+20*60_000})).status,'NOT_DUE');
 assert.equal((await claimMaintenanceCadence(db,{...args,now_ts:now+40*60_000})).claimed,true);
});
test('scheduled provider spending cannot consume the protected owner reserve, enforced by SQL too',async()=>{
 assert.equal(evaluateBykQuotaAdmission({source:'schedule',units:5,used_total:11795,used_scheduled:11795,used_manual:0}).status,'MANUAL_RESERVE_PROTECTED');
 const db=new D1();await installBykQuotaLedger(db);
 const now=Date.now(),month=new Date(now).toISOString().slice(0,7);
 db.sql.prepare('INSERT INTO report2_byk_monthly_usage VALUES(?,?,?,?,?,?,?,?,?,?)').run(month,15000,13500,12900,11795,11795,0,0,null,now);
 assert.equal((await makeBykReserve(db,{source:'schedule',clock:()=>now})({contract:'SECOND-USDT',run_id:'R',units:5})).allowed,false);
 assert.equal((await makeBykReserve(db,{source:'manual',clock:()=>now})({contract:'OWNER-USDT',run_id:'M',units:5})).allowed,true);
});
test('scheduled execution cannot acquire full-manual freshness or cooldown bypass',()=>{
 const runner=fs.readFileSync(new URL('../files/runner-main.mjs',import.meta.url),'utf8');
 assert.match(runner,/expectedManualMode=source==='schedule'\?'SCHEDULE'/);
 assert.ok(runner.indexOf("if(source==='schedule'){")<runner.indexOf('collectHtxBoundSupplementalContext({'));
});

test('ordinary hot retention is bounded without changing freshness or retention dates',async()=>{
 const db=new D1(),cutoff=100;
 for(const [table,column] of Object.entries({scan_runs:'ts_bucket',deep_check_run_log:'completed_ts',shadow_decision_log:'observed_ts',shadow_outcome_log:'computed_ts',shadow_calibration_signal:'observed_ts'})){
  db.sql.exec(`CREATE TABLE ${table}(${column} INTEGER);`);
  for(let i=0;i<40;i++)db.sql.prepare(`INSERT INTO ${table} VALUES(?)`).run(i);
  db.sql.prepare(`INSERT INTO ${table} VALUES(?)`).run(cutoff);
  assert.equal((await buildBoundedRetentionStatement(db,{table,cutoff}).run()).meta.changes,8);
  assert.equal(db.sql.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n,33);
  assert.equal(db.sql.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column}>=?`).get(cutoff).n,1);
 }
 assert.throws(()=>buildBoundedRetentionStatement(db,{table:'canonical_report',cutoff}));
});
