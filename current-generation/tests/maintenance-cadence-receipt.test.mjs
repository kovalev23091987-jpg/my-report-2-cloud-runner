import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const root=process.env.REPORT2_TEST_RUNTIME?pathToFileURL(process.env.REPORT2_TEST_RUNTIME+'/'):new URL('../files/',import.meta.url);
const {buildMaintenanceCadenceReceipt:receipt}=await import(new URL('src/maintenance-cadence-receipt.mjs',root));
const scheduler=process.env.REPORT2_TEST_RUNTIME?new URL('src/scheduler-control.mjs',root):new URL('../../post-v7-consolidated/final-reconciliation/files/src/scheduler-control.mjs',import.meta.url);
const {claimMaintenanceCadence:claim,completeMaintenanceCadence:complete}=await import(scheduler);
const NOW=1792353600000,opts={job_key:'HOURLY_LOW_PRIORITY_STATS',actor:'GITHUB_ACTIONS',now_ts:NOW,interval_ms:3600000};
const context={source:'schedule',unified_enabled:true,scheduled_minute_utc:21,low_priority_cadence_due:false};
class DB{
 constructor(){this.s=new DatabaseSync(':memory:');this.calls=[];this.fail=null;this.s.exec('CREATE TABLE v3_maintenance_cadence_shadow(job_key TEXT PRIMARY KEY,interval_ms INTEGER,last_success_ts INTEGER,lease_owner TEXT,lease_started_ts INTEGER,lease_expires_ts INTEGER,updated_ts INTEGER,shadow_only INTEGER,last_result TEXT)');}
 prepare(sql){const d=this;return{args:[],bind(...args){this.args=args;return this;},async first(){return d.exec(sql,this.args,'first');},async run(){return d.exec(sql,this.args,'run');}};}
 exec(sql,args,method){this.calls.push({sql,args,method});if(this.fail===method)throw Error('CONTROLLED_SQL_FAILURE SELECT secret_parameter');const stmt=this.s.prepare(sql);return method==='first'?stmt.get(...args)||null:{meta:{changes:Number(stmt.run(...args).changes)}};}
 close(){this.s.close();}
}
function db(t){const d=new DB();t.after(()=>d.close());return d;}
function projectWithoutQueries(d,values){const before=d.calls.length,out=receipt(values);assert.equal(d.calls.length,before);assert.equal(out.projection_SQL_added,0);assert.equal(out.projection_HTTP_added,0);return out;}
test('actual NOT_DUE keeps last-success and next-due clocks instead of a generic deferral',async t=>{
 const d=db(t);d.s.prepare('INSERT INTO v3_maintenance_cadence_shadow(job_key,last_success_ts) VALUES(?,?)').run(opts.job_key,NOW-60000);
 const c=await claim(d,opts),out=projectWithoutQueries(d,{...context,claim:c});assert.equal(d.calls.length,1);assert.equal(out.claim.status,'NOT_DUE');assert.equal(out.claim.due,false);assert.equal(out.claim.claimed,false);assert.equal(out.claim.last_success_ts,NOW-60000);assert.equal(out.claim.next_due_ts,NOW-60000+3600000);assert.equal(out.completion,null);
});
test('actual LEASE_ACTIVE preserves due=true and lease owner while execution remains deferred',async t=>{
 const d=db(t);d.s.prepare('INSERT INTO v3_maintenance_cadence_shadow(job_key,lease_owner,lease_expires_ts) VALUES(?,?,?)').run(opts.job_key,'OTHER_ACTOR',NOW+60000);
 const c=await claim(d,opts),out=projectWithoutQueries(d,{...context,claim:c});assert.equal(out.claim.status,'LEASE_ACTIVE');assert.equal(out.claim.due,true);assert.equal(out.claim.claimed,false);assert.equal(out.low_priority_cadence_due,false);assert.equal(out.claim.lease_owner,'OTHER_ACTOR');assert.equal(out.claim.lease_expires_ts,NOW+60000);assert.equal(out.claim.last_success_ts,null);
});
test('actual claim errors retain failure status without exporting raw SQL/error or inventing due success',async t=>{
 const d=db(t);d.fail='first';let c=await claim(d,opts);assert.equal(c.status,'CLAIM_FAILED');let out=projectWithoutQueries(d,{...context,claim:c});assert.equal(out.claim.status,'CLAIM_FAILED');assert.equal(out.claim.due,false);assert.equal(out.claim.claimed,false);assert.equal(out.claim.last_success_ts,null);assert.ok(!JSON.stringify(out).includes('secret_parameter'));assert.ok(!Object.hasOwn(out.claim,'error'));
 d.fail=null;d.s.exec('DROP TABLE v3_maintenance_cadence_shadow');c=await claim(d,opts);out=projectWithoutQueries(d,{...context,claim:c});assert.equal(out.claim.status,'MIGRATION_REQUIRED');assert.equal(out.completion,null);
});
test('actual successful completion is captured from the one existing call with exact original lease token',async t=>{
 const d=db(t),c=await claim(d,opts);assert.equal(d.calls.length,3);const end=await complete(d,{...opts,lease_started_ts:c.lease_started_ts,success:true,now_ts:NOW+1});assert.equal(d.calls.length,4);
 const out=projectWithoutQueries(d,{...context,low_priority_cadence_due:true,claim:c,completion:end});assert.equal(out.claim.lease_started_ts,NOW);assert.equal(out.claim.lease_expires_ts,NOW+600000);assert.deepEqual(out.completion,{status:'CLOSED',completed:true,success_recorded:true});assert.equal(out.low_priority_cadence_due,true);
});
test('actual NOT_UPDATED and COMPLETE_FAILED are distinct and missing success remains null',async t=>{
 const d=db(t),c=await claim(d,opts);let end=await complete(d,{...opts,lease_started_ts:c.lease_started_ts+1,success:true,now_ts:NOW+2});let out=projectWithoutQueries(d,{...context,claim:c,completion:end});assert.deepEqual(out.completion,{status:'NOT_UPDATED',completed:false,success_recorded:false});
 d.fail='run';end=await complete(d,{...opts,lease_started_ts:c.lease_started_ts,success:true,now_ts:NOW+2});out=projectWithoutQueries(d,{...context,claim:c,completion:end});assert.deepEqual(out.completion,{status:'COMPLETE_FAILED',completed:false,success_recorded:null});assert.ok(!JSON.stringify(out).includes('secret_parameter'));
});
test('manual, legacy and absent values retain uncalled receipts and unknown booleans without coercion',()=>{
 for(const [source,unified,due,minute] of [['manual',true,true,21],['schedule',false,false,21],['schedule',false,true,2]]){
  const out=receipt({source,unified_enabled:unified,low_priority_cadence_due:due,scheduled_minute_utc:minute});assert.equal(out.low_priority_cadence_due,due);assert.equal(out.claim,null);assert.equal(out.completion,null);assert.equal(out.scheduled_minute_utc,minute);
 }
 const out=receipt({unified_enabled:'false',low_priority_cadence_due:0,scheduled_minute_utc:60,claim:{status:'CLAIM_FAILED',claimed:'false',due:null,last_success_ts:'123',error:'secret',SQL:'secret'},completion:{status:'COMPLETE_FAILED',completed:false}});assert.equal(out.unified_enabled,null);assert.equal(out.low_priority_cadence_due,null);assert.equal(out.scheduled_minute_utc,null);assert.equal(out.claim.claimed,null);assert.equal(out.claim.last_success_ts,null);assert.equal(out.completion.success_recorded,null);assert.ok(!JSON.stringify(out).includes('secret'));
});
const runner=readFileSync(new URL('runner-main.mjs',root),'utf8');
function runnerSlice(){
 const start=runner.indexOf('  const scheduledMinuteUtc = new Date(started).getUTCMinutes();');
 const stop=runner.indexOf('  if (!telegramInstallValidation && lowPriorityCadenceDue)',start);
 const finish=runner.indexOf('  if (postV7UnifiedEnabled && postV7MaintenanceClaim?.claimed===true)',stop);
 const end=runner.indexOf('  const r820ManualNonFatalStatuses=',finish);
 assert.ok(start>0&&stop>start&&finish>stop&&end>finish);
 return runner.slice(start,stop)+runner.slice(finish,end)+'\nreturn lowPriorityMaintenanceReceipt;';
}
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
async function executeRunner({source='schedule',unified=true,c={status:'CLOSED',claimed:true,due:true,lease_started_ts:NOW},end={status:'NOT_UPDATED',completed:false,success_recorded:false},minute=21}={}){
 const calls=[],body=runnerSlice(),fn=new AsyncFunction('started','postV7UnifiedEnabled','source','env','claimMaintenanceCadence','completeMaintenanceCadence','maintenanceSucceeded','discoveryRecallKpi','r820ProspectiveValidationSidecar','r820ProspectiveValidationConfigured','buildMaintenanceCadenceReceipt',body);
 const value=await fn(Date.UTC(2026,9,18,19,minute),unified,source,{DATA_DB:'SAME_DB'},async(d,args)=>{calls.push({operation:'claim',d,args});return c;},async(d,args)=>{calls.push({operation:'complete',d,args});return end;},()=>false,{status:'DEFERRED_LOW_PRIORITY_CADENCE'},{status:'DEFERRED_LOW_PRIORITY_CADENCE'},true,receipt);
 return{value,calls};
}
test('effective runner captures one existing claim and completion without changing DB token or failed result',async()=>{
 const {value,calls}=await executeRunner();assert.deepEqual(calls.map(c=>c.operation),['claim','complete']);assert.equal(calls[0].d,'SAME_DB');assert.equal(calls[1].d,'SAME_DB');assert.equal(calls[1].args.lease_started_ts,NOW);assert.equal(calls[1].args.success,false);assert.equal(calls[1].args.result,'NOT_CLOSED');assert.equal(value.claim.claimed,true);assert.deepEqual(value.completion,{status:'NOT_UPDATED',completed:false,success_recorded:false});
 assert.ok(runner.includes('maintenance_cadence:lowPriorityMaintenanceReceipt'));assert.ok(runner.includes('statistics:{maintenance:lowPriorityMaintenanceReceipt,'));
});
test('effective runner does not add a completion attempt after an unsuccessful durable claim',async()=>{
 for(const status of ['NOT_DUE','LEASE_ACTIVE','CLAIM_FAILED','CLAIM_RACE_LOST','CLAIM_READBACK_FAILED']){
  const {value,calls}=await executeRunner({c:{status,claimed:false,due:status==='LEASE_ACTIVE'}});assert.deepEqual(calls.map(c=>c.operation),['claim']);assert.equal(value.claim.status,status);assert.equal(value.low_priority_cadence_due,false);assert.equal(value.completion,null);
 }
});
test('effective runner keeps manual and legacy minute gates without invoking durable scheduler',async()=>{
 for(const options of [{source:'manual',unified:true,minute:21},{source:'schedule',unified:false,minute:21},{source:'schedule',unified:false,minute:2}]){
  const {value,calls}=await executeRunner(options);assert.equal(calls.length,0);assert.equal(value.low_priority_cadence_due,options.source!=='schedule'||options.minute===2);assert.equal(value.claim,null);assert.equal(value.completion,null);
 }
});
