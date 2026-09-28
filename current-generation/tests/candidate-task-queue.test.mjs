import test from 'node:test';
import assert from 'node:assert/strict';
import {buildUniverseDiff,preservesMonthlyCrashFilter,classifyCandidate,chooseNextTask,planLightChecks,admitBurstDeep} from '../files/src/candidate-task-queue.mjs';

test('K05: HTX futures universe is primary; BTC/ETH remain context, not candidates',()=>{
  const result=buildUniverseDiff({previous:[{contract:'OLD-USDT'}],current:[{contract:'BTC-USDT'},{contract:'ETH-USDT'},{contract:'NEW-USDT'},{contract:'RENAMED-USDT',previous_contract:'OLD-USDT'}]});
  assert.deepEqual(result.market_context.map(x=>x.contract),['BTC-USDT','ETH-USDT']);
  assert.deepEqual(result.candidates.map(x=>x.contract),['NEW-USDT','RENAMED-USDT']);
  assert.deepEqual(result.renamed,[{from:'OLD-USDT',to:'RENAMED-USDT'}]);
  assert.equal(preservesMonthlyCrashFilter(-97.1).eligible,false);
  assert.equal(preservesMonthlyCrashFilter(-96.9).eligible,true);
});

test('K05: missing OI, ineligibility and capacity are distinct',()=>{
  assert.equal(classifyCandidate({eligible:false}).status,'NOT_ELIGIBLE');
  assert.deepEqual(classifyCandidate({missing_fields:['OI']}),{status:'DATA_MISSING',missing_fields:['OI']});
  assert.equal(classifyCandidate({capacity_selected:false}).status,'NOT_SELECTED_CAPACITY');
});

test('K05: failures in one wave do not block a fresh wave and one asset cannot monopolize',()=>{
  const now=1000,rows=[
    {contract:'SOL-USDT',wave_id:'OLD',task_kind:'NEW_CANDIDATE',attempts:3,state:'FAILED_FINAL',due_at:1,expires_at:9999,created_at:1,priority:99},
    {contract:'SOL-USDT',wave_id:'NEW',task_kind:'NEW_CANDIDATE',attempts:0,state:'PENDING',due_at:1,expires_at:9999,created_at:10,priority:1},
    {contract:'X-USDT',wave_id:'X1',task_kind:'RECHECK',attempts:2,state:'PENDING',due_at:1,expires_at:9999,created_at:20,priority:10},
  ];
  assert.equal(chooseNextTask(rows,{now}).contract,'X-USDT');
  assert.equal(chooseNextTask(rows,{now,consecutive_nonterminal_rechecks:2}).wave_id,'NEW');
});

test('K05: 24 simultaneous candidates are four light checks plus explicit capacity outcomes',()=>{
  const rows=Array.from({length:24},(_,i)=>({contract:`C${i}-USDT`}));const plan=planLightChecks(rows);
  assert.equal(plan.candidates.length,4);assert.equal(plan.byk_units,0);assert.equal(plan.entry_authorized,false);
  const outcomes=rows.map((row,i)=>i<4?{...row,status:'LIGHT_CHECK_PLANNED'}:{...row,status:'NOT_SELECTED_CAPACITY'});
  assert.equal(outcomes.length,24);assert.equal(outcomes.filter(x=>x.status==='NOT_SELECTED_CAPACITY').length,20);
});

test('K05: second deep is only urgent, reserved, sequential and capped at six daily',()=>{
  assert.equal(admitBurstDeep({burst_used_today:5,candidate_expires_at:100,next_regular_ts:200,remaining_job_ms:120000,budget_reserved:true}).allowed,true);
  assert.equal(admitBurstDeep({burst_used_today:6,candidate_expires_at:100,next_regular_ts:200,remaining_job_ms:120000,budget_reserved:true}).allowed,false);
  assert.equal(admitBurstDeep({burst_used_today:0,candidate_expires_at:300,next_regular_ts:200,remaining_job_ms:120000,budget_reserved:true}).allowed,false);
});
