// Offline original-clock scheduling diagnosis, not a live publication replay.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {claimMaintenanceCadence,completeMaintenanceCadence} from '../../post-v7-consolidated/final-reconciliation/files/src/scheduler-control.mjs';
import {enqueueRecheck,claimDueRecheck} from '../../post-v7-consolidated/final-reconciliation/files/src/recheck-scheduler.mjs';
import {TWO_CANDIDATE_PLAN,proveTwoCandidateBudget} from '../../current-generation/files/src/two-candidate-policy.mjs';
const root=new URL('../../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8');
const runner=read('current-generation/files/runner-main.mjs'),worker=read('current-generation/files/src/worker.js'),collector=read('cloudflare/public-collector/injected-worker-tail.js');
assert(runner.indexOf("if(!cadence.claimed)")<runner.indexOf('await worker.scheduled('));
assert(runner.slice(runner.indexOf("if(!cadence.claimed)"),runner.indexOf('// Failed attempts')).includes('return;'));
assert(worker.includes('await claimDueRecheck(env.DATA_DB'));
assert(!collector.includes('claimDueRecheck'));
assert(collector.includes('PUBLIC_COLLECTOR_ANALYTICS_ROLE_FORBIDDEN'));
const source=JSON.parse(read('checkpoints/ACTUAL_SCHEDULED_1425MSK_20261006.json'));
const projection=JSON.parse(read('checkpoints/batched-original-clock-plan-projection-20261006.json'));
const qualified=projection.rows.find(r=>r.projected_action?.deliver===true);assert(qualified);
const observed=qualified.original_decision_ts,cycleStart=1791285825482;
assert.equal(projection.scope,'RETAINED_CANONICAL_PLAN_COMPONENT_PROJECTION_NOT_FULL_PRODUCER_REPLAY_OR_FRESH_DELIVERY');
class LocalDB{
 constructor(){this.raw=new DatabaseSync(':memory:');this.raw.exec(read('post-v7-consolidated/post-v7/migrations.sql'));}
 prepare(sql){const db=this.raw;return {args:[],bind(...a){this.args=a;return this;},query(){const indexes=[],q=sql.replace(/\?(\d+)/g,(_,n)=>{indexes.push(Number(n)-1);return '?';});return [q,indexes.length?indexes.map(i=>this.args[i]):this.args];},async first(){const [q,a]=this.query();return db.prepare(q).get(...a)||null;},async run(){const[q,a]=this.query();return {success:true,meta:{changes:Number(db.prepare(q).run(...a).changes)}};}};}
}
const results=[];
for(const direction of ['LONG','SHORT']){
 const db=new LocalDB(),actor='GITHUB_ACTIONS',job_key='TWO_CANDIDATE_ANALYTICS_40M',interval_ms=TWO_CANDIDATE_PLAN.scheduled_interval_minutes*60000;
 const first=await claimMaintenanceCadence(db,{actor,job_key,now_ts:cycleStart,interval_ms});assert(first.claimed);
 assert((await completeMaintenanceCadence(db,{actor,job_key,lease_started_ts:cycleStart,success:true,now_ts:cycleStart,result:'ATTEMPT_ADMITTED'})).completed);
 const due_ts=observed+300000,expires_ts=observed+1800000;
 const queued=await enqueueRecheck(db,{publication_id:'CONTROLLED_PROJECTED_PUBLICATION',contract:'ADA-USDT',direction,wave_id:'CONTROLLED_PROJECTED_WAVE',snapshot_id:qualified.snapshot_id,run_id:qualified.run_id,due_ts,expires_ts,now_ts:observed});assert(queued.enqueued);
 const early=await claimMaintenanceCadence(db,{actor,job_key,now_ts:due_ts,interval_ms});assert.equal(early.status,'NOT_DUE');
 const next=await claimMaintenanceCadence(db,{actor,job_key,now_ts:cycleStart+interval_ms,interval_ms});assert(next.claimed);
 const actual=await claimDueRecheck(db,{actor,now_ts:cycleStart+interval_ms});assert.equal(actual.status,'NO_DUE_TASK');
 const task=db.raw.prepare('SELECT state,last_result FROM v3_recheck_task_shadow WHERE task_id=?').get(queued.task_id);
 assert.equal(task.state,'EXPIRED');assert.equal(task.last_result,'TTL_EXPIRED_BEFORE_RECHECK');
 results.push({direction,scope:'CONTROLLED_TASK_AT_RETAINED_ORIGINAL_CLOCK_NOT_AN_ACTUAL_SENT_TASK',observed_ts:observed,due_ts,expires_ts,next_admissible_analytics_ts:cycleStart+interval_ms,at_promised_recheck:early.status,at_next_analytics:actual.status,final_task:task});db.raw.close();
}
const fasterBudget=proveTwoCandidateBudget({...TWO_CANDIDATE_PLAN,scheduled_interval_minutes:30,scheduled_cycles_per_day:48});assert.equal(fasterBudget.safe,false);
const proof={schema:'RECHECK_CADENCE_ORIGINAL_CLOCK_DIAGNOSIS_V1',source_proof:'checkpoints/ACTUAL_SCHEDULED_1425MSK_20261006.json',source_run_id:qualified.run_id,source_snapshot_id:qualified.snapshot_id,source_fingerprint:qualified.original_fingerprint,source_clock_unchanged:true,scope:'CURRENT_SCHEDULER_COMPONENTS_AND_CALLER_ORDER_WITH_CONTROLLED_PROJECTED_TASKS_NOT_ACTUAL_DELIVERY',sourceHTTP:0,MAIN:0,production_D1:0,Telegram:0,checks:results,collector_role:'COLLECTION_ONLY_NO_ANALYTICS_OR_DELIVERY',thirty_minute_full_cycle_budget:fasterBudget,automatic_cadence_or_ttl_change:false,diagnosis:'FIVE_MINUTE_RECHECK_UNREACHABLE_BEFORE_THIRTY_MINUTE_TTL_WITH_FORTY_MINUTE_ANALYTICS_FOR_THIS_ORIGINAL_CLOCK',code_sha256:Object.fromEntries(['current-generation/files/runner-main.mjs','current-generation/files/src/worker.js','post-v7-consolidated/final-reconciliation/files/src/scheduler-control.mjs','post-v7-consolidated/final-reconciliation/files/src/recheck-scheduler.mjs','cloudflare/public-collector/injected-worker-tail.js'].map(p=>[p,createHash('sha256').update(read(p)).digest('hex')]))};
const out=process.argv[2];if(out)fs.writeFileSync(out,JSON.stringify(proof,null,2)+'\n');else console.log(JSON.stringify(proof,null,2));
