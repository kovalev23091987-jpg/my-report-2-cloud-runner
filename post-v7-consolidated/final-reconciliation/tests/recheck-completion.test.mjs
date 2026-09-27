import test from 'node:test';
import assert from 'node:assert/strict';
import {DB,canonical,T} from './full-runtime-fixture.mjs';
import {canonicalFingerprint,persistCanonicalSnapshot} from '../files/src/canonical-publication.mjs';
import {enqueueRecheck,claimDueRecheck,completeRecheck,requeueExpiredLease} from '../files/src/recheck-scheduler.mjs';
async function setup(t){const db=new DB();t.after(()=>db.close());const c=canonical();await persistCanonicalSnapshot(db,{canonical:c,wave_id:'W1',now_ts:T});const q=await enqueueRecheck(db,{publication_id:'PUB:OLD',contract:'FIL-USDT',direction:'LONG',wave_id:'W1',snapshot_id:c.snapshot_id,run_id:c.run_id,due_ts:T+1000,expires_ts:T+1800000,now_ts:T});assert(q.enqueued);return {db,c,q};}
test('R006: completion requires a fresh saved canonical result, not just a fulfilled HTTP request',async t=>{
 const {db,c}=await setup(t);const claim=await claimDueRecheck(db,{now_ts:T+1000,lease_ms:60000});assert(claim.claimed);
 const args={task_id:claim.task.task_id,lease_started_ts:claim.task.lease_started_ts,actor:claim.task.lease_owner,result:'DONE',now_ts:T+2000};
 assert.equal((await completeRecheck(db,args)).completed,false);
 assert.equal((await completeRecheck(db,{...args,new_publication_id:'PUB:MISSING'})).completed,false);
 const fresh=structuredClone(c);fresh.run_id='FRESH-RUN';fresh.snapshot_id='FRESH-SNAPSHOT';fresh.observed_ts=T+1500;fresh.snapshot_time_utc=new Date(fresh.observed_ts).toISOString();fresh.liquidations=null;fresh.analytical_fingerprint=canonicalFingerprint(fresh);
 const saved=await persistCanonicalSnapshot(db,{canonical:fresh,wave_id:'W1',now_ts:T+1500});assert(saved.persisted);
 assert.equal((await completeRecheck(db,{...args,new_publication_id:saved.publication_id})).completed,true);
});
test('R006: a stale attempt cannot cancel a reclaimed task',async t=>{
 const {db}=await setup(t);const a=await claimDueRecheck(db,{now_ts:T+1000,lease_ms:60000});assert(a.claimed);await requeueExpiredLease(db,{now_ts:T+61001});const b=await claimDueRecheck(db,{now_ts:T+61002});assert(b.claimed);
 const stale=await completeRecheck(db,{task_id:a.task.task_id,actor:a.task.lease_owner,lease_started_ts:a.task.lease_started_ts,result:'CANCELLED',now_ts:T+61003});assert.equal(stale.completed,false);
 assert.equal(db.s.prepare('SELECT state FROM v3_recheck_task_shadow WHERE task_id=?').get(a.task.task_id).state,'CLAIMED');
});
test('R006: an absent write acknowledgement cannot invent a durable recheck',async()=>{
 const db={prepare(){return {bind(){return this;},async run(){return {meta:{changes:0}};},async first(){return null;}};}};
 const out=await enqueueRecheck(db,{publication_id:'P',contract:'FIL-USDT',direction:'LONG',wave_id:'W',run_id:'R',snapshot_id:'S',due_ts:T+1000,expires_ts:T+60000,now_ts:T});assert.equal(out.enqueued,false);assert.equal(out.status,'RECHECK_READBACK_FAILED');
});
