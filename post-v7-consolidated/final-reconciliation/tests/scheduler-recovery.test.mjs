import test from 'node:test';
import assert from 'node:assert/strict';
import {DB,T} from '../../liquidation/liquidation-extension/integration/tests/merged-unified-fixture.mjs';
import {claimMaintenanceCadence,completeMaintenanceCadence,maintenanceSucceeded} from '../files/src/scheduler-control.mjs';
test('R039 R049: an old process cannot complete a newer lease of the same actor',async t=>{
 const db=new DB();t.after(()=>db.close());const options={job_key:'HOURLY_LOW_PRIORITY_STATS',actor:'GITHUB_ACTIONS',interval_ms:3600000,lease_ms:60000};
 const a=await claimMaintenanceCadence(db,{...options,now_ts:T});assert(a.claimed);
 const b=await claimMaintenanceCadence(db,{...options,now_ts:T+60001});assert(b.claimed);
 const stale=await completeMaintenanceCadence(db,{...options,lease_started_ts:a.lease_started_ts,success:true,now_ts:T+60002});
 assert.equal(stale.completed,false);assert.equal(stale.success_recorded,false);
 const row=db.s.prepare('SELECT * FROM v3_maintenance_cadence_shadow WHERE job_key=?').get(options.job_key);
 assert.equal(row.last_success_ts,null);assert.equal(row.lease_started_ts,b.lease_started_ts);
 const done=await completeMaintenanceCadence(db,{...options,lease_started_ts:b.lease_started_ts,success:true,now_ts:T+60003});assert(done.completed);assert(done.success_recorded);
});
test('R049: a missing lease token or expired lease cannot advance last success',async t=>{
 const db=new DB();t.after(()=>db.close());const a=await claimMaintenanceCadence(db,{job_key:'X',now_ts:T,interval_ms:3600000,lease_ms:60000});assert(a.claimed);
 assert.equal((await completeMaintenanceCadence(db,{job_key:'X',success:true,now_ts:T+1000})).completed,false);
 assert.equal((await completeMaintenanceCadence(db,{job_key:'X',lease_started_ts:a.lease_started_ts,success:true,now_ts:T+60001})).completed,false);
 assert.equal(db.s.prepare('SELECT last_success_ts FROM v3_maintenance_cadence_shadow WHERE job_key=?').get('X').last_success_ts,null);
});
test('R049 R051: deferral, unknown result and migration failure are not successful maintenance',()=>{
 for(const status of ['CAPACITY_DEFERRED_LOW_PRIORITY','DEFERRED_LOW_PRIORITY_CADENCE','OBSERVER_ERROR_FAIL_CLOSED',undefined])assert.equal(maintenanceSucceeded({recall:{status,persisted:false},prospective:{status:'CLOSED'},prospective_enabled:true}),false);
 for(const status of ['MIGRATION_REQUIRED','CAPACITY_DEFERRED_FAIL_CLOSED','DISABLED',undefined])assert.equal(maintenanceSucceeded({recall:{status:'CLOSED',persisted:true},prospective:{status},prospective_enabled:true}),false);
 assert.equal(maintenanceSucceeded({recall:{status:'CLOSED',persisted:true},prospective:{status:'CLOSED'},prospective_enabled:true}),true);
 assert.equal(maintenanceSucceeded({recall:{status:'PARTIAL',persisted:true},prospective:{status:'DISABLED'},prospective_enabled:false}),true);
});
