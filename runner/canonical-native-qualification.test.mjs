import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {canonicalExecutionMode} from './canonical-native-qualification.mjs';
import {reserveLosslessRecoveryBudget,LOSSLESS_RECOVERY_POLICY} from './lossless-full-evidence-recovery.mjs';
const manual={kind:'canonical',execute:true,enabled:false,emergency:false,event:'workflow_dispatch',borrowed_owner:'CODEX:CONTROLLED:1',prefetch:true,native_qualification:true};
test('manual native qualification requires exact explicit operator inputs and independently verified originals before mutation',()=>{
 assert.deepEqual(canonicalExecutionMode(manual),{native_qualification:true,require_native_preflight:true,automatic_activation:false,extra_retention_slot_granted:false});
 for(const alter of [{kind:'full_evidence'},{execute:false},{event:'schedule'},{borrowed_owner:''},{prefetch:false},{emergency:true}])assert.throws(()=>canonicalExecutionMode({...manual,...alter}),/EXACT_MANUAL_NATIVE_CANONICAL/);
 assert.throws(()=>canonicalExecutionMode({...manual,native_qualification:false}),/NATIVE_QUALIFICATION_NOT_ACTIVATED/);
 assert.equal(canonicalExecutionMode({...manual,execute:false,native_qualification:false}).require_native_preflight,false);
});
test('a qualification cannot create a fifth UTC15 slot or exceed two ordinary slots on a fresh day',async()=>{
 const raw=new DatabaseSync(':memory:');raw.exec('CREATE TABLE report2_runner_budget_ledger_shadow(reservation_id TEXT PRIMARY KEY,day_utc TEXT,reserve_rows_read INTEGER,reserve_rows_written INTEGER,state TEXT,started_ts INTEGER,unknown_ops INTEGER,measured_rows_read INTEGER,measured_rows_written INTEGER)');
 const db={prepare(sql){let args=[];return{bind(...a){args=a;return this;},async run(){return{meta:{changes:Number(raw.prepare(sql).run(...args).changes)}};},async first(){const r=raw.prepare(sql).get(...args);return r?{...r}:null;}};}};
 const now=Date.parse('2026-10-15T18:00:00Z');for(let i=1;i<=4;i++)raw.prepare("INSERT INTO report2_runner_budget_ledger_shadow VALUES(?,'2026-10-15',5000,400,'FINALIZED',?,0,100,4)").run('RETAINED_HISTORY:'+i+':1',now);
 const before=raw.prepare('SELECT * FROM report2_runner_budget_ledger_shadow ORDER BY reservation_id').all(),mode=canonicalExecutionMode(manual);assert.equal(mode.extra_retention_slot_granted,false);
 assert.equal((await reserveLosslessRecoveryBudget(db,{reservation_id:'RETAINED_HISTORY:5:1',now})).allowed,false);assert.deepEqual(raw.prepare('SELECT * FROM report2_runner_budget_ledger_shadow ORDER BY reservation_id').all(),before);
 const next=now+86400000;assert.equal((await reserveLosslessRecoveryBudget(db,{reservation_id:'RETAINED_HISTORY:6:1',now:next})).allowed,true);assert.equal((await reserveLosslessRecoveryBudget(db,{reservation_id:'RETAINED_HISTORY:7:1',now:next})).allowed,true);assert.equal((await reserveLosslessRecoveryBudget(db,{reservation_id:'RETAINED_HISTORY:8:1',now:next})).allowed,false);
 assert.equal(LOSSLESS_RECOVERY_POLICY.max_runs_day,2);assert.deepEqual(raw.prepare("SELECT * FROM report2_runner_budget_ledger_shadow WHERE day_utc='2026-10-15' ORDER BY reservation_id").all(),before);
});
