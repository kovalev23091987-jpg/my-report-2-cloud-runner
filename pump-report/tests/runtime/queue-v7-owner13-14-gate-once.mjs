import fs from 'node:fs';import assert from 'node:assert/strict';import vm from 'node:vm';import{createHash}from'node:crypto';
import{QUEUE_V7_LOOKUP_IDS,createQueueV7NamedSqlException}from'../../operator/queue-v7-owner13-14-sql-exception.mjs';
import{readPausedExecutorBounded}from'../../operator/paused-executor-bounded.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),a=JSON.parse(fs.readFileSync(process.argv[2])),own=JSON.parse(fs.readFileSync('checkpoints/CLOUD_PHASE_STATE_20261004.json')).lease;
assert.equal(a.status,'ADMITTED_ONE_TWO_NAMED_LOOKUP_GATE_CASE');assert.equal(a.Node_processes,1);assert(own.owner===a.own_lease.owner&&!own.released&&Date.now()<a.expires_ts);
for(const[p,h]of Object.entries(a.frozen_files))assert.equal(sha(fs.readFileSync(p)),h,p);
fs.writeFileSync(a.output+'.attempt',JSON.stringify({Node:1,started_ts:Date.now(),native_SQL:0}),{flag:'wx',mode:0o600});
globalThis.fetch=()=>{throw Error('OFFLINE_NO_NETWORK')};
for(const p of a.syntax_only_wrappers)new vm.SourceTextModule(fs.readFileSync(p,'utf8'));
const now=Date.now(),before='27258b810da32584cde054712e72be67e84d004e9af4874a4755a816e9c55bdf',after='37e4b0ed9cd5b243a94f7f56bc1ac683a7461fb1cc77570dae09379b00da0456';
const admission=n=>({run_id:QUEUE_V7_LOOKUP_IDS[n],mode:'LOOKUP',implementation_sha256:n===13?before:after,native_query_cap:16,expires_ts:now+120000,lookup_single_exception:{schema:'OWNER_QUEUE_V7_INSTALL_AND_ACCEPTANCE_13_14_V1',status:'APPROVED_BY_DIRECT_OWNER',extra_number:n,approval_message_sha256:'a'.repeat(64),owner_thread_id:'01a171f7-596e-7dc0-a82f-3e92f57f4ef6',day_utc:'2026-10-29',approved_run_ids:[QUEUE_V7_LOOKUP_IDS[13],QUEUE_V7_LOOKUP_IDS[14]],maximum_new_runs:2,exact_run_id:QUEUE_V7_LOOKUP_IDS[n],target_artifact_sha256:'531699f31a0c71a6704da3f9648fa4bf142450b524c5942b60dfeaed7f3297d1',previous_run_count:n-1,additional_runs:1,maximum_count_after:n,rows_read:500,rows_written:30,max_queries:16,approved_ts:now-1,expires_ts:now+60000}});
const sql='INSERT OR IGNORE INTO report2_runner_budget_ledger_shadow(...) AND (?16=0 OR lookup_count<?17)';
let accepted=0,refused=0;
for(const n of[13,14]){
 const ad=admission(n),params=Array(17).fill(0);Object.assign(params,{0:'PUMP:LOOKUP:'+QUEUE_V7_LOOKUP_IDS[n],1:'2026-10-29',2:500,3:30,15:1,16:10});
 const fn=createQueueV7NamedSqlException(ad,now),out=fn(sql,params);assert(out.sql.includes('AND lookup_count='+(n-1)+' AND (?16=0 OR lookup_count<?17)'));assert.equal(out.params[16],n);assert.equal(params[16],10);accepted++;
 assert.throws(()=>fn(sql,params));refused++;
 for(const change of [
  g=>{g.status='PENDING_OWNER'},
  g=>{g.schema='OWNER_ONE_CURRENT_AUTO_DIAGNOSIS_LOOKUP12_V1'},
  g=>{g.day_utc='2026-10-30'},
  g=>{g.previous_run_count=10},
  g=>{g.extra_number=15},
  g=>{g.approved_run_ids=[QUEUE_V7_LOOKUP_IDS[13]]},
  g=>{g.target_artifact_sha256='b'.repeat(64)}
 ]){const b=structuredClone(ad);change(b.lookup_single_exception);assert.throws(()=>createQueueV7NamedSqlException(b,now));refused++;}
 const other=structuredClone(ad);other.implementation_sha256=n===13?after:before;assert.throws(()=>createQueueV7NamedSqlException(other,now));refused++;
 const scope=structuredClone(ad);scope.mode='AUTO';assert.throws(()=>createQueueV7NamedSqlException(scope,now));refused++;
 const badParams=[...params];badParams[0]='PUMP:LOOKUP:UNAPPROVED';assert.throws(()=>createQueueV7NamedSqlException(ad,now)(sql,badParams));refused++;
}
let calls=0,waits=0;const busyThenFree=await readPausedExecutorBounded({store:{get:async key=>{assert.equal(key,'pump:executor');calls++;return calls<3?{owner:'CONTROLLED_BUSY'}:{owner:null}}},maximum_reads:6,wait_ms:20000,sleep:async ms=>{assert.equal(ms,20000);waits++},clock:()=>now});assert.equal(calls,3);assert.equal(waits,2);assert.equal(busyThenFree.status,'QUIESCENT_CODE_UPDATE_ALLOWED');
calls=0;waits=0;const busy=await readPausedExecutorBounded({store:{get:async()=>{calls++;return{owner:'CONTROLLED_BUSY'}}},maximum_reads:6,wait_ms:20000,sleep:async()=>{waits++},clock:()=>now});assert.equal(calls,6);assert.equal(waits,5);assert.equal(busy.status,'IN_FLIGHT_DO_NOT_DEPLOY');
calls=0;await assert.rejects(()=>readPausedExecutorBounded({store:{get:async()=>{calls++;throw Error('CONTROLLED_TRANSPORT_ERROR')}},maximum_reads:6,wait_ms:20000,sleep:async()=>assert.fail('NO_ERROR_RETRY')}));assert.equal(calls,1);
assert(Date.now()<a.expires_ts);
const proof={schema:'ROOT_TWO_NAMED_QUEUE_V7_LOOKUP_GATE_CASE_V1',status:'PASS',authority_main:a.authority_main,Node_processes:1,new_cases:1,accepted_named_operations:accepted,negative_boundaries_refused:refused,syntax_only_wrapper_parses:2,paused_executor_reads:[3,6,1],busy_waits:[2,5,0],failed_IO_retry:false,default_LOOKUP10_and_original16_500_30_envelope_unchanged:true,real_owner_approval:false,native_SQL:0,market_HTTP:0,Cloudflare:0,Telegram:0,build:0,product_engine:0,case_is_not_IO_admission:true};fs.writeFileSync(a.output,JSON.stringify(proof,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(proof));
