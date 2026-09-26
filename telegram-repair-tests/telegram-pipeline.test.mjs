import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pipelineDB,seedHandoff,seedWave,NOW,SCAN,START} from './pipeline-db.mjs';
import {runTelegramOutputLayer} from '../telegram-output.mjs';
import {runV3TelegramLifecycleSidecar,loadCompletedLifecycleHandoffs,deriveLifecycleContext} from '../src/v3-telegram-lifecycle-sidecar.mjs';
import {chooseEarlyPersistenceTargets,runV3EarlyPersistenceSidecar} from '../src/v3-early-sidecar.mjs';
import {deriveUserLifecycleStatus} from '../src/v3-telegram-lifecycle.mjs';
import {classifyZeroTelegram} from '../telegram-zero-reason.mjs';

const fakeRelay=calls=>async(url,init)=>{assert.equal(url,'https://relay.invalid');calls.push(JSON.parse(init.body));return {ok:true,status:200,json:async()=>({ok:true,status:'SENT',message_id:71})};};
async function publish(db,lifecycle,extra={}) {
  const calls=[];
  const out=await runTelegramOutputLayer({db,startedTs:SCAN-1000,source:'schedule',enabled:true,infoEnabled:true,infoObserveEnabled:true,
    shadowDecisionAuto:false,clock:()=>NOW,fetchImpl:fakeRelay(calls),relayUrl:'https://relay.invalid',relayKey:'FIXTURE',currentLifecycle:lifecycle,...extra});
  return {calls,out};
}
const observe=(contract)=>({contract,current_row:{market_age_sec:1,prior_discovery:{long_watch:true}},observation:{status:'CLOSED',contract,long_evidence_domain_count:2,short_evidence_domain_count:0,early_detection_quality_0_100:73}});

test('a completed handoff gets the existing bounded slot without starving behind unrelated active rows',()=>{
  const active=[{contract_code:'OLD-USDT',wave_id:'old',generation:1,last_seen_ts:1,lifecycle_stage:'DISCOVERY',first_seen_detectors_json:'[]',remaining_edge_json:'{}',evidence_refs_json:'[]'}];
  const args={observations:[observe('OLD-USDT'),observe('RAY-USDT')],active_candidates:active};
  assert.equal(chooseEarlyPersistenceTargets(args)[0].contract,'OLD-USDT');
  const selected=chooseEarlyPersistenceTargets({...args,preferred_contracts:['RAY-USDT']});
  assert.equal(selected.length,1);assert.equal(selected[0].contract,'RAY-USDT');
  const insufficient=observe('RAY-USDT');insufficient.observation.long_evidence_domain_count=0;insufficient.current_row.prior_discovery.long_watch=false;
  assert.equal(chooseEarlyPersistenceTargets({...args,observations:[insufficient],preferred_contracts:['RAY-USDT']}).length,0);
  assert.equal(chooseEarlyPersistenceTargets({...args,active_candidates:[{...active[0],lifecycle_stage:'EXIT'}],preferred_contracts:['OLD-USDT']}).some(x=>x.contract==='OLD-USDT'),false);
});

test('same-cycle completed Deep Check -> OBSERVE -> information receipt, symmetric LONG/SHORT including Unicode',async()=>{
  for(const dir of ['LONG','SHORT'])for(const contract of ['RAY-USDT','币安人生-USDT']) {
    const db=pipelineDB();seedHandoff(db,{dir,contract});seedWave(db,{dir,contract,wave:'EDW:'+contract+':1'});
    const h=await loadCompletedLifecycleHandoffs(db,{source_run_id:'cycle',now_ts:NOW});assert.equal(h.handoffs.length,1);
    const life=await runV3TelegramLifecycleSidecar(db,{source_run_id:'cycle',now_ts:NOW,dispatch_enabled:false,completed_handoffs:h});
    assert.equal(life.status,'CLOSED');assert.equal(life.transitions[0].current_status,'OBSERVE');
    const first=await publish(db,life);assert.equal(first.calls.length,1);assert.equal(first.out.early_info.sent,true);assert.equal(first.out.early_info.lifecycle_status,'OBSERVE');
    assert.deepEqual(Object.keys(first.calls[0]),['text']);
    assert.match(first.calls[0].text,/🟡 ЖДЁМ/);assert.match(first.calls[0].text,/НЕ ТОРГОВЫЙ СИГНАЛ/);assert.match(first.calls[0].text,/Оценка: 73 из 100/);assert.doesNotMatch(first.calls[0].text,/ПЕРЕЗАХОД|МОЖНО ВХОДИТЬ/);
    assert.equal((await publish(db,life)).calls.length,0);
    assert.equal(db.sqlite.prepare('SELECT count(*) n FROM final_decision_integration_shadow').get().n,0);
    assert.equal(db.sqlite.prepare('SELECT count(*) n FROM v3_telegram_dispatch_shadow').get().n,0);
    db.close();
  }
});

test('real early producer creates the missing handoff wave, while a score below 70 remains unsent',async()=>{
  const db=pipelineDB();seedHandoff(db);seedWave(db,{contract:'OLD-USDT',wave:'EDW:OLD:1',first:SCAN-60000});
  db.sqlite.exec('CREATE TABLE scan_runs(ts INTEGER PRIMARY KEY,payload_json TEXT,stage0_coverage_pct REAL,errors INTEGER,stale INTEGER)');
  const payload=JSON.stringify({schema:'stage0-compact-v2',timestamp:SCAN,contracts:[
    ['BTC-USDT',50000,1e9,100000,5e9,0.0001,8,1,'CLOSED',false,false,0,0],
    ['ETH-USDT',3000,5e8,90000,3e9,0.0001,8,1,'CLOSED',false,false,0,0],
    ['OLD-USDT',100,1000000,1000,1e7,-0.0001,8,1,'CLOSED',true,false,2,0],
    ['RAY-USDT',100,1000000,1000,1e7,-0.0001,8,1,'CLOSED',true,false,2,0],
  ]});
  db.sqlite.prepare('INSERT INTO scan_runs VALUES(?,?,100,0,0)').run(SCAN,payload);
  const h=await loadCompletedLifecycleHandoffs(db,{source_run_id:'cycle',now_ts:NOW});
  const early=await runV3EarlyPersistenceSidecar(db,{current_scan_ts:SCAN,source_run_id:'cycle',now_ts:NOW,preferred_contracts:h.handoffs.map(x=>x.contract_code)});
  assert.equal(early.status,'CLOSED');assert.equal(early.persisted,1);assert.equal(early.targets[0].contract,'RAY-USDT');
  const life=await runV3TelegramLifecycleSidecar(db,{source_run_id:'cycle',now_ts:NOW,completed_handoffs:h,dispatch_enabled:false});
  assert.equal(life.transitions[0].current_status,'OBSERVE');
  const stored=db.sqlite.prepare("SELECT early_detection_quality_0_100 FROM v3_early_candidate_wave WHERE contract_code='RAY-USDT'").get();assert.ok(stored.early_detection_quality_0_100<70);
  assert.equal((await publish(db,life)).calls.length,0);db.close();
});

test('observation publishing is explicit; it never relabels OBSERVE as WAIT or ENTRY',async()=>{
  const db=pipelineDB();seedHandoff(db);seedWave(db);const life=await runV3TelegramLifecycleSidecar(db,{source_run_id:'cycle',now_ts:NOW,dispatch_enabled:false});
  const r=await publish(db,life,{infoObserveEnabled:false});assert.equal(r.calls.length,0);
  assert.equal(db.sqlite.prepare('SELECT status FROM v3_user_lifecycle_shadow').get().status,'OBSERVE');
  const noFinal=deriveUserLifecycleStatus({deep_check_completed:true,identity_current:true,data_current:true,direction:'LONG',structure_interesting:true,useful_observation:true,data_sufficient_for_observation:true});
  assert.equal(noFinal.status,'OBSERVE');db.close();
});

test('NULL wave is joined only to an actual current wave; explicit different wave is never guessed',async()=>{
  for(const suppliedWave of [null,'OTHER-WAVE']) {
    const db=pipelineDB();seedHandoff(db,{wave:suppliedWave});
    let life=await runV3TelegramLifecycleSidecar(db,{source_run_id:'cycle',now_ts:NOW});assert.equal((await publish(db,life)).calls.length,0);
    seedWave(db);life=await runV3TelegramLifecycleSidecar(db,{source_run_id:'cycle',now_ts:NOW,dispatch_enabled:false});
    assert.equal((await publish(db,life)).calls.length,suppliedWave===null?1:0);db.close();
  }
});

test('stale, future, old-run, conflicting, insufficient and failed observations stay unsent',async()=>{
  const mutations=[
    "UPDATE shadow_decision_log SET observed_ts="+(NOW+1),
    "UPDATE shadow_decision_log SET observed_ts="+(START-1),
    "UPDATE shadow_decision_log SET created_ts="+(NOW+1),
    "UPDATE shadow_decision_log SET eq_status='NOT_CLOSED'",
    "UPDATE shadow_decision_log SET dq_status='UNKNOWN'",
    "UPDATE deep_check_run_log SET started_ts=NULL",
    "UPDATE deep_check_run_log SET completed_ts="+(NOW+1),
    "UPDATE shadow_decision_log SET direction_hint='SHORT',stage='SHADOW_OBSERVE_SHORT_BIAS'",
    "UPDATE shadow_decision_log SET stage='OBSERVE_DATA_INSUFFICIENT',dq_status='INSUFFICIENT'",
    "UPDATE deep_check_run_log SET execution_status='ERROR',error_text='failure'",
    "UPDATE deep_check_run_log SET data_sufficiency='INSUFFICIENT'",
    "UPDATE v3_early_candidate_wave SET last_seen_ts="+(NOW-600001),
    "UPDATE v3_early_candidate_wave SET last_seen_ts="+(NOW+1),
    "UPDATE v3_early_candidate_wave SET lifecycle_stage='EXIT'",
    "UPDATE v3_early_candidate_wave SET direction_hint='SHORT'",
  ];
  for(const sql of mutations) {
    const db=pipelineDB();seedHandoff(db);seedWave(db);db.sqlite.exec(sql);
    const life=await runV3TelegramLifecycleSidecar(db,{source_run_id:'cycle',now_ts:NOW,dispatch_enabled:false});
    assert.equal((await publish(db,life)).calls.length,0,sql);db.close();
  }
});

test('current lifecycle failure blocks old visible rows and produces a technical reason',async()=>{
  const db=pipelineDB();db.add({contract:'RAY-USDT',direction:'LONG',wave_id:'W1',status:'WAIT',reason:'DIRECTION_CLOSED_ENTRY_WINDOW_NOT_READY',observation_ts:NOW-1000,updated_ts:NOW-100,valid_until_ts:NOW+60000});
  const life={status:'BUDGET_ENVELOPE_EXCEEDED_FAIL_CLOSED',transitions:[]};const r=await publish(db,life);assert.equal(r.calls.length,0);
  const diagnosis=classifyZeroTelegram({telegramOutput:r.out,telegramObserver:{status:'NO_FINAL_DECISION_ROW'}});
  assert.equal(diagnosis.status,'UPSTREAM_PIPELINE_NOT_CLOSED');assert.equal(diagnosis.reason,life.status);db.close();
});

test('read budget failure precedes lifecycle writes',async()=>{
  const db=pipelineDB();seedHandoff(db);seedWave(db);let calls=0;db.usageSnapshot=()=>({rows_read:calls++?161:0,rows_written:0,requests:5,unknown_ops:0});
  const life=await runV3TelegramLifecycleSidecar(db,{source_run_id:'cycle',now_ts:NOW});assert.equal(life.status,'BUDGET_ENVELOPE_EXCEEDED_FAIL_CLOSED');
  assert.equal(db.sqlite.prepare('SELECT count(*) n FROM v3_user_lifecycle_shadow').get().n,0);db.close();
});

test('hard veto and invalidation cannot become a new WAIT/OBSERVE through a closed direction',()=>{
  const h={contract_code:'RAY-USDT',scan_ts:SCAN,deep_started_ts:START,deep_completed_ts:NOW-2000,state:'COMPLETED',execution_status:'COMPLETED',data_sufficiency:'PARTIAL',handoff_direction:'LONG',wave_id:'W1'};
  const e={contract_code:'RAY-USDT',wave_id:'W1',first_seen_ts:SCAN-1000,last_seen_ts:SCAN,lifecycle_stage:'DISCOVERY',direction_hint:'LONG'};
  const s={contract_code:'RAY-USDT',observed_ts:START+1000,created_ts:NOW-2000,direction_hint:'LONG',stage:'SHADOW_OBSERVE_LONG_BIAS',dq_status:'PARTIAL',eq_status:'SHADOW_MEASURABLE'};
  for(const patch of [{hard_veto:1},{risk_state:'INVALIDATED'},{data_quality:'INSUFFICIENT'},{direction:'NEUTRAL'}]) {
    const f={contract_code:'RAY-USDT',direction:'LONG',directional_quality:'CLOSED',observation_ts:START+1000,persisted_ts:NOW-2000,data_quality:'CLOSED',execution_quality:'CLOSED',independence_state:'CLOSED',timing_state:'EARLY',...patch};
    const r=deriveLifecycleContext({handoff:h,early:e,shadow:s,final:f,now_ts:NOW});assert.equal(r.ctx,null);assert.equal(r.status,'RISK_BLOCKED');
  }
});

test('partial lifecycle persistence and missing readback cannot authorize a notification',async()=>{
  for(const failure of ['WRITE_LOST','BAD_ACK_WITHOUT_WRITE']) {
    const db=pipelineDB();seedHandoff(db);seedWave(db);
    const batch=db.batch.bind(db);db.batch=async statements=>{
      if(!statements.some(s=>/INSERT INTO v3_user_lifecycle_shadow/.test(s.sql)))return batch(statements);
      if(failure==='WRITE_LOST')throw new Error('INJECTED_PARTIAL_WRITE');
      return statements.map(()=>({success:true,meta:{changes:1}}));
    };
    const life=await runV3TelegramLifecycleSidecar(db,{source_run_id:'cycle',now_ts:NOW});
    assert.equal(life.status,'PERSISTENCE_NOT_CLOSED');assert.equal((await publish(db,life)).calls.length,0);db.close();
  }
});

test('multiple completed handoffs cannot spend more than the single transition write envelope',async()=>{
  const db=pipelineDB();for(let i=0;i<6;i++){const contract='C'+i+'-USDT';seedHandoff(db,{contract});seedWave(db,{contract,wave:'W'+i});}
  const life=await runV3TelegramLifecycleSidecar(db,{source_run_id:'cycle',now_ts:NOW,dispatch_enabled:true});
  assert.equal(life.status,'CLOSED');assert.equal(life.transitions.filter(t=>t.status==='CLOSED').length,1);assert.equal(life.transitions.filter(t=>t.status==='CAPACITY_DEFERRED').length,5);
  assert.equal(db.sqlite.prepare('SELECT count(*) n FROM v3_user_lifecycle_shadow').get().n,1);db.close();
});

test('the handoff query starts from indexed exact run, not completed history',async()=>{
  const db=pipelineDB();seedHandoff(db);await loadCompletedLifecycleHandoffs(db,{source_run_id:'cycle',now_ts:NOW});const sql=db.sql.at(-1);
  const plan=db.sqlite.prepare('EXPLAIN QUERY PLAN '+sql).all('cycle').map(r=>r.detail).join('\n');
  assert.match(plan,/SEARCH d USING INDEX.*run_id/);assert.match(plan,/SEARCH h USING INDEX.*handoff_id/);assert.doesNotMatch(plan,/idx_v3_handoff_pending/);db.close();
});

test('explicit OBSERVE shares cooldown with existing WAIT reservations',async()=>{
  const db=pipelineDB();seedHandoff(db);seedWave(db);const life=await runV3TelegramLifecycleSidecar(db,{source_run_id:'cycle',now_ts:NOW,dispatch_enabled:false});
  assert.equal((await publish(db,life)).calls.length,1);
  db.sqlite.exec("UPDATE v3_user_lifecycle_shadow SET status='WAIT',reason='DIRECTION_CLOSED_ENTRY_WINDOW_NOT_READY'");
  life.transitions[0].current_status='WAIT';const r=await publish(db,life);assert.equal(r.calls.length,0);assert.equal(r.out.early_info.status,'INFO_COOLDOWN');db.close();
});

test('the runner orders current lifecycle before regular output, while preserving isolated test route',()=>{
  const source=fs.readFileSync(new URL('../runner-main.mjs',import.meta.url),'utf8');
  assert.ok(source.indexOf('v3TelegramLifecycleSidecar = await runV3TelegramLifecycleSidecar')<source.indexOf('if (telegramOutput === null)'));
  assert.ok(source.indexOf('loadCompletedLifecycleHandoffs(env.DATA_DB')<source.indexOf('v3EarlySidecar = await runV3EarlyPersistenceSidecar'));
  assert.match(source,/completed_handoffs:completedLifecycleHandoffs/);assert.match(source,/infoObserveEnabled:/);
});
