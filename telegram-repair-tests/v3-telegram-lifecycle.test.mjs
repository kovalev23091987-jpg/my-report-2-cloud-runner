import test from 'node:test';
import assert from 'node:assert/strict';
import {
  USER_STATE, DISPATCH_STATE, deriveUserLifecycleStatus, decideLifecycleDispatch,
  revalidateBeforeSend, nextDispatchState, renderRussianLifecycleMessage,renderGroupedEarlyLifecycleReport,renderImmediateEntryLifecycleMessage,
  assessPipelineHealth, decideHealthAlert, buildLifecycleKey
} from '../src/v3-telegram-lifecycle.mjs';

const closed={data_quality:'CLOSED',execution_quality:'CLOSED',evidence_independence:'CLOSED'};
const base={deep_check_completed:true,identity_current:true,data_current:true,hard_veto:false,lifecycle_stage:'ENTRY_CANDIDATE'};

test('nothing -> OBSERVE only after useful live deep check',()=>{
  const r=deriveUserLifecycleStatus({...base,structure_interesting:true,useful_observation:true,data_sufficient_for_observation:true});
  assert.equal(r.status,USER_STATE.OBSERVE);
});

test('WAIT requires direction plus closed quality but not entry window',()=>{
  const r=deriveUserLifecycleStatus({...base,...closed,direction:'LONG',direction_confirmed:true,timing_state:'WAIT_TRIGGER'});
  assert.equal(r.status,USER_STATE.WAIT);
});

test('ENTRY requires entire strict final chain',()=>{
  const r=deriveUserLifecycleStatus({...base,...closed,direction:'SHORT',direction_confirmed:true,final_row_exists:true,timing_state:'ENTRY_WINDOW',freshness_future_pass:true,final_score_threshold_pass:true,d1_pretelegram_budget_closed:true,dedup_pass:true,valid_until_active:true,superseded:false});
  assert.equal(r.status,USER_STATE.ENTRY);
  assert.notEqual(deriveUserLifecycleStatus({...base,...closed,direction:'SHORT',direction_confirmed:true,final_row_exists:true,timing_state:'ENTRY_WINDOW',freshness_future_pass:true,final_score_threshold_pass:false,d1_pretelegram_budget_closed:true,dedup_pass:true,valid_until_active:true}).status,USER_STATE.ENTRY);
});

test('surfaced idea is removed once when invalidated',()=>{
  const r=deriveUserLifecycleStatus({...base,previous_status:'WAIT',removal_reason:'STRUCTURE_BROKEN'});
  assert.equal(r.status,USER_STATE.IDEA_REMOVED);
  assert.equal(decideLifecycleDispatch({previous_status:'WAIT',current_status:'IDEA_REMOVED',contract:'ETHFI-USDT',direction:'LONG',wave_id:'W1',rules_version:'V3'}).dispatch,true);
  assert.equal(decideLifecycleDispatch({previous_status:'IDEA_REMOVED',current_status:'IDEA_REMOVED',contract:'ETHFI-USDT',direction:'LONG',wave_id:'W1',rules_version:'V3'}).dispatch,false);
});

test('WAIT -> ENTRY bypasses cooldown and dedup key contains wave/rules/event',()=>{
  const d=decideLifecycleDispatch({previous_status:'WAIT',current_status:'ENTRY',contract:'RAY-USDT',direction:'LONG',wave_id:'W2',rules_version:'V3',cooldown_active:true});
  assert.equal(d.dispatch,true); assert.equal(d.cooldown_bypass,true);
  assert.equal(d.key,'RAY-USDT|LONG|W2|ENTRY|V3');
  assert.equal(buildLifecycleKey({contract:'RAY-USDT',direction:'LONG',wave_id:'W3',rules_version:'V3',event:'ENTRY'}),'RAY-USDT|LONG|W3|ENTRY|V3');
});

test('repeat status suppressed',()=>{
  assert.equal(decideLifecycleDispatch({previous_status:'OBSERVE',current_status:'OBSERVE',contract:'A-USDT',direction:'LONG',wave_id:'W',rules_version:'V3'}).reason,'NO_STATE_CHANGE');
});

test('entry expires before send and timeout is never SENT',()=>{
  const now=10000;
  assert.equal(revalidateBeforeSend({status:'ENTRY',now,observation_ts:9000,valid_until_ts:9500,identity_current:true,data_current:true,lifecycle_stage:'ENTRY_TRIGGER',hard_veto:false,superseded:false,timing_state:'ENTRY_WINDOW'}).status,'EXPIRED_NOT_SENT');
  assert.equal(nextDispatchState({current:'SENDING',network_result:'TIMEOUT'}),DISPATCH_STATE.FAILED_RETRYABLE);
  assert.equal(nextDispatchState({current:'SENDING',network_result:'CONFIRMED_SENT'}),DISPATCH_STATE.SENT);
});

test('Russian user format calls score internal not probability',()=>{
  const r=renderRussianLifecycleMessage({status:'WAIT',ticker:'ZEC-USDT',direction:'LONG',score_0_100:68,why:'Сильнее рынка.',risk:'Движение частично прошло.'});
  assert.equal(r.ok,true); assert.match(r.message,/68\/100/); assert.match(r.message,/внутренняя/); assert.doesNotMatch(r.message,/68%/);
});

test('pipeline health distinguishes healthy no idea from technical degradation',()=>{
  assert.equal(assessPipelineHealth({stage0_closed:true,discovery_closed:true,eligible_live_count:0,live_deep_check_count:0,telegram_relay_ok:true,persistent_db_ok:true}).status,'HEALTHY_NO_IDEA');
  const bad=assessPipelineHealth({stage0_closed:true,discovery_closed:true,eligible_live_count:2,live_deep_check_count:0,live_zero_reason:'',telegram_relay_ok:true,persistent_db_ok:true});
  assert.equal(bad.status,'DEGRADED_PIPELINE'); assert.ok(bad.reasons.includes('LIVE_DEEP_CHECK_SILENT_DROP'));
});

test('health alerts only on transitions',()=>{
  assert.equal(decideHealthAlert({previous:'HEALTHY_NO_IDEA',current:'DEGRADED_PIPELINE'}).send,true);
  assert.equal(decideHealthAlert({previous:'DEGRADED_PIPELINE',current:'DEGRADED_PIPELINE'}).send,false);
  assert.equal(decideHealthAlert({previous:'DEGRADED_PIPELINE',current:'HEALTHY_NO_IDEA'}).event,'RECOVERED');
});


test('grouped early report caps 3 LONG and 3 SHORT and excludes ENTRY',()=>{
  const candidates=[];
  for(let i=0;i<5;i++) candidates.push({status:i===4?'ENTRY':(i%2?'OBSERVE':'WAIT'),ticker:`L${i}-USDT`,direction:'LONG',score_0_100:60+i,why:'x'});
  for(let i=0;i<5;i++) candidates.push({status:i%2?'OBSERVE':'WAIT',ticker:`S${i}-USDT`,direction:'SHORT',score_0_100:70+i,risk:'y'});
  const r=renderGroupedEarlyLifecycleReport(candidates);
  assert.equal(r.ok,true);assert.equal(r.long_count,3);assert.equal(r.short_count,3);assert.equal(r.entry_included,false);
  assert.equal(r.message.includes('L4'),false);assert.equal((r.message.match(/— НАБЛЮДАТЬ|— ЖДАТЬ/g)||[]).length,6);
  assert.match(r.message,/внутренняя, не статистическая вероятность прибыли/);
});

test('ENTRY is rendered only as separate immediate lifecycle message',()=>{
  const r=renderImmediateEntryLifecycleMessage({status:'ENTRY',ticker:'RAY-USDT',direction:'LONG',score_0_100:78,why:'Финальная цепочка закрыта.'});
  assert.equal(r.ok,true);assert.equal(r.separate_immediate,true);assert.equal(r.grouped_early,false);assert.match(r.message,/ВХОД/);
  assert.equal(renderImmediateEntryLifecycleMessage({status:'WAIT',ticker:'RAY-USDT',direction:'LONG'}).status,'ENTRY_REQUIRED');
});
