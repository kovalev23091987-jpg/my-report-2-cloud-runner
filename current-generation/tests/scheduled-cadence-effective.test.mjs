import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
const runtime=process.env.REPORT2_CADENCE_RUNTIME_ROOT;
const scheduler=await import(runtime?pathToFileURL(runtime+'/src/scheduler-control.mjs'):new URL('../../post-v7-consolidated/final-reconciliation/files/src/scheduler-control.mjs',import.meta.url));
const source=fs.readFileSync(runtime?runtime+'/runner-main.mjs':new URL('../files/runner-main.mjs',import.meta.url),'utf8');
const start=source.indexOf("  if(source==='schedule'){",source.indexOf("console.log('TWO_CANDIDATE_EXECUTION_BUDGET'")),end=source.indexOf('  if(manualCommandClaim.claimed&&',start);assert.ok(start>0&&end>start);
const {enforcePeriodicOwnership,enforceDailyAnalysisAdmission}=await import(runtime?pathToFileURL(runtime+'/src/pre-analysis-failure-receipt.mjs'):new URL('../files/src/pre-analysis-failure-receipt.mjs',import.meta.url));
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const admission=new AsyncFunction('source','env','preflight','manualCommandActor','started','TWO_CANDIDATE_PLAN','actorOwnsPeriodicAnalytics','claimMaintenanceCadence','completeMaintenanceCadence','releaseAnalyticsLease','console','admitTriggeredRecheck','loadDailyUsageAggregate','evaluateDailyReservationBudget','envNumber','proveTriggeredRecheckD1Budget','TRIGGERED_RECHECK_D1_RESERVATION','triggerOnly','triggerKickTaskId','enforcePeriodicOwnership','generation','process','fs','enforceDailyAnalysisAdmission',source.slice(start,end)+"\nreturn 'ANALYTICS_ADMITTED';");
const T=1791142500000;
class DB{constructor(){this.sql=new DatabaseSync(':memory:');this.sql.exec(`CREATE TABLE v3_scheduler_job_ownership_shadow(job_key TEXT PRIMARY KEY,owner TEXT,updated_ts INTEGER);INSERT INTO v3_scheduler_job_ownership_shadow VALUES('PERIODIC_ANALYTICS','GITHUB_ACTIONS',0);CREATE TABLE v3_maintenance_cadence_shadow(job_key TEXT PRIMARY KEY,interval_ms INTEGER,last_success_ts INTEGER,lease_owner TEXT,lease_started_ts INTEGER,lease_expires_ts INTEGER,updated_ts INTEGER,shadow_only INTEGER,last_result TEXT);`);}prepare(q){const db=this;return{args:[],bind(...a){this.args=a;return this;},async first(){return db.sql.prepare(q).get(...this.args)||null;},async run(){return db.sql.prepare(q).run(...this.args);}};}}
async function run(db,now=T,actor='GITHUB_ACTIONS'){let released=0;const result=await admission('schedule',{DATA_DB:db},{actor},actor+':EXACT_OWNER:'+now,now,{scheduled_interval_minutes:40,d1_run_cap:{rows_read:54000,rows_written:840}},scheduler.actorOwnsPeriodicAnalytics,scheduler.claimMaintenanceCadence,scheduler.completeMaintenanceCadence,async()=>{released++;return{finished:true};},{log(){}},async()=>({claimed:false,status:'NO_FRESH_EXACT_SENT_TRIGGER'}),async()=>({}),()=>({allowed:false}),(_,v)=>v,()=>({safe:true}),{rows_read:1500,rows_written:16},false,null,enforcePeriodicOwnership,'MY_REPORT_2_CURRENT_20260929_CURRENT_CYCLE_V13_20M',{env:{}},{writeFile:async()=>{}},enforceDailyAnalysisAdmission);return{result,released};}
test('actual assembled runner passes the exact lease_started_ts and charges one scheduled attempt before analysis',async()=>{
 const db=new DB();const out=await run(db);assert.equal(out.result,'ANALYTICS_ADMITTED');assert.equal(out.released,0);const row=db.sql.prepare('SELECT * FROM v3_maintenance_cadence_shadow').get();assert.equal(row.last_success_ts,T);assert.equal(row.last_result,'ATTEMPT_ADMITTED');assert.equal(row.lease_owner,null);assert.equal(row.lease_started_ts,null);
 await assert.rejects(()=>run(db,T+39*60000),/D1_DAY_PREACTION_BUDGET_BLOCKED/);assert.equal(db.sql.prepare('SELECT last_success_ts FROM v3_maintenance_cadence_shadow').get().last_success_ts,T);
 assert.equal((await run(db,T+40*60000)).result,'ANALYTICS_ADMITTED');
});
test('foreign scheduler owner or missing original lease cannot charge or launch a competing scheduled analysis',async()=>{
 const db=new DB();await assert.rejects(()=>run(db,T,'FOREIGN'),/PERIODIC_ANALYTICS_OWNER_NOT_GITHUB/);assert.equal(db.sql.prepare('SELECT count(*) AS n FROM v3_maintenance_cadence_shadow').get().n,0);
 const args={job_key:'TEST',actor:'OWNER',now_ts:T,interval_ms:40*60000};const lease=await scheduler.claimMaintenanceCadence(db,args);assert.equal(lease.claimed,true);assert.equal((await scheduler.completeMaintenanceCadence(db,{...args,success:true})).status,'INVALID_INPUT');assert.equal((await scheduler.completeMaintenanceCadence(db,{...args,actor:'OTHER',lease_started_ts:lease.lease_started_ts,success:true})).completed,false);assert.equal((await scheduler.completeMaintenanceCadence(db,{...args,lease_started_ts:lease.lease_started_ts,success:true})).completed,true);
});

