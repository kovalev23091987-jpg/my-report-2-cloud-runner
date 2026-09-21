import test from 'node:test';
import assert from 'node:assert/strict';
import {buildObserveInformationalMessage,buildWaitInformationalMessage,normalizeInfoRow,INFO_MIN_SCORE} from '../telegram-info-runtime.mjs';

const NOW=Date.UTC(2026,8,21,5);
const evidence=(direction='LONG')=>JSON.stringify([
  {domain:'OI_ACCELERATION',side:'BOTH',status:'CLOSED'},
  {domain:'RELATIVE_STRENGTH',side:direction,status:'CLOSED'},
  {domain:'ORDERFLOW_ABSORPTION',side:direction,status:'CLOSED'},
  {domain:'FUNDING_TRAJECTORY',side:direction,status:'CLOSED'},
]);
const row=(direction='LONG',extra={})=>({
  contract:'RAY-USDT',direction,wave_id:'W1',status:'OBSERVE',
  reason:'DIRECTION_CLOSED_ENTRY_WINDOW_NOT_READY',observation_ts:NOW-10_000,
  updated_ts:NOW-5_000,valid_until_ts:NOW+120_000,early_last_seen_ts:NOW-5_000,
  evidence_observed_ts:NOW-5_000,early_detection_quality_0_100:73,
  current_evidence_json:evidence(direction),...extra,
});
const reasonWords=message=>{
  const line=message.split('\n').find(x=>x.startsWith('Почему интересно:'))||'';
  return [...line.replace(/^Почему интересно:\s*/,'').matchAll(/\p{L}+/gu)].length;
};

test('internal threshold is 70, but no score or probability is rendered',()=>{
  assert.equal(INFO_MIN_SCORE,70);
  assert.equal(normalizeInfoRow(row('LONG',{early_detection_quality_0_100:69}),NOW),null);
  assert.ok(normalizeInfoRow(row('LONG',{early_detection_quality_0_100:70}),NOW));
  const message=buildObserveInformationalMessage(row(),{now:NOW}).message;
  assert.doesNotMatch(message,/\b(?:70|73)\b|\/100|процент|вероятност|оценк/iu);
});

test('compact LONG and SHORT layout is symmetric: coin, colour, WAIT and one reason',()=>{
  const long=buildObserveInformationalMessage(row('LONG'),{now:NOW});
  const short=buildObserveInformationalMessage(row('SHORT'),{now:NOW});
  assert.equal(long.ok,true);assert.equal(short.ok,true);
  assert.match(long.message,/RAY\n🟢 ЛОНГ\n🟡 ЖДЁМ/);
  assert.match(short.message,/RAY\n🔴 ШОРТ\n🟡 ЖДЁМ/);
  for(const message of [long.message,short.message]){
    assert.match(message,/Раннее наблюдение — НЕ ТОРГОВЫЙ СИГНАЛ/);
    assert.equal((message.match(/Почему интересно:/g)||[]).length,1);
    assert.ok(reasonWords(message)>=10&&reasonWords(message)<=15,reasonWords(message));
    assert.doesNotMatch(message,/предварительн|внутренняя оценка|OI_ACCELERATION|RELATIVE_STRENGTH|ПЕРЕЗАХОД/iu);
  }
});

test('reason uses only current closed direction-compatible evidence',()=>{
  const mixed=JSON.stringify([
    {domain:'RELATIVE_STRENGTH',side:'LONG',status:'CLOSED'},
    {domain:'FUNDING_TRAJECTORY',side:'SHORT',status:'CLOSED'},
    {domain:'ORDERFLOW_ABSORPTION',side:'LONG',status:'PARTIAL'},
    {domain:'UNVERIFIED_NEW_DOMAIN',side:'LONG',status:'CLOSED'},
  ]);
  const message=buildObserveInformationalMessage(row('LONG',{current_evidence_json:mixed}),{now:NOW}).message;
  assert.match(message,/монета сильнее рынка/);
  assert.doesNotMatch(message,/финансирование|поглощаются|UNVERIFIED/iu);
  assert.ok(reasonWords(message)>=10&&reasonWords(message)<=15,reasonWords(message));
});

test('missing, malformed, stale or future evidence fails closed',()=>{
  for(const bad of [null,'','{}','[]','not json',JSON.stringify([{domain:'UNKNOWN',side:'LONG',status:'CLOSED'}])]){
    assert.equal(normalizeInfoRow(row('LONG',{current_evidence_json:bad}),NOW),null);
    assert.equal(buildObserveInformationalMessage(row('LONG',{current_evidence_json:bad}),{now:NOW}).ok,false);
  }
  assert.equal(normalizeInfoRow(row('LONG',{evidence_observed_ts:NOW-5_001}),NOW),null);
  assert.equal(normalizeInfoRow(row('LONG',{evidence_observed_ts:NOW+1,early_last_seen_ts:NOW+1}),NOW),null);
});

test('WAIT means required entry confirmation is missing; it never says enter now',()=>{
  const wait=buildWaitInformationalMessage(row('SHORT',{status:'WAIT'}),{now:NOW});
  assert.equal(wait.ok,true);assert.match(wait.message,/🔴 ШОРТ\n🟡 ЖДЁМ/);
  assert.match(wait.message,/вход ещё требует подтверждения/);
  assert.doesNotMatch(wait.message,/МОЖНО ВХОДИТЬ|ЗАХОДИМ|ПЕРЕЗАХОД/iu);
});
