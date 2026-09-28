import test from 'node:test';
import assert from 'node:assert/strict';
import {createRunHealth,evaluateWatchdog,createOpsStateBudget,writeOpsHeartbeat} from '../files/src/run-health.mjs';

const base=()=>createRunHealth({run_id:'R',generation:'G',actor:'GITHUB_ACTIONS',started_ts:1000});

test('K17 frame: failure after analysis but before binding is terminal failed',()=>{
  const health=base();health.record('RUN_STARTED');health.record('COLLECTION_COMPLETE');health.record('ANALYSIS_COMPLETE');health.fail(new Error('BINDING_NOT_FOUND'));
  assert.deepEqual(health.finalize({now:2000,analysis_complete:true}).status,'FAILED');
  assert.match(health.finalize({now:2000,analysis_complete:true}).reason,/BINDING_NOT_FOUND/);
});

test('K17 frame: Telegram failure is degraded while healthy no-idea is success',()=>{
  const delivery=base();delivery.record('ANALYSIS_COMPLETE');delivery.record('DELIVERY_RESULT',{status:'FAILED',reason:'TELEGRAM_ACK_MISSING'});
  assert.equal(delivery.finalize({analysis_complete:true}).status,'DEGRADED');
  const empty=base();empty.record('ANALYSIS_COMPLETE');
  assert.equal(empty.finalize({analysis_complete:true,no_ideas:true,critical_contracts_ok:true}).reason,'HEALTHY_NO_IDEA');
  assert.equal(empty.finalize({analysis_complete:true,no_ideas:true,critical_contracts_ok:false}).status,'DEGRADED');
});

test('K17 frame: watchdog detects both independent stale paths and honors maintenance warm-up',()=>{
  const now=10_000_000;
  assert.deepEqual(evaluateWatchdog({now,analytics_success_ts:now-46*60_000,analytics_started_ts:now-16*60_000,collector_heartbeat_ts:now-13*60_000}).alerts,['ANALYTICS_SUCCESS_MISSING_45M','RUN_STARTED_STALE_15M','COLLECTOR_HEARTBEAT_MISSING_12M']);
  assert.equal(evaluateWatchdog({now,maintenance_until_ts:now+1}).status,'MAINTENANCE');
});

test('K17 frame: independent KV is optional fail-closed and bounded to 500 writes / 2000 reads',async()=>{
  const budget=createOpsStateBudget();const rows=[];const kv={put:async(...args)=>rows.push(args)};
  assert.equal((await writeOpsHeartbeat(null,'a',{},budget)).status,'OPS_STATE_BINDING_UNAVAILABLE');
  assert.equal((await writeOpsHeartbeat(kv,'a',{ok:true},budget)).written,true);
  assert.equal(rows.length,1);
  assert.equal(createOpsStateBudget({max_writes:0,max_reads:0}).reserve({write:1}).allowed,false);
});
