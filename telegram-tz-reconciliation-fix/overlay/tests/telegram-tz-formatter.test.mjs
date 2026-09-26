import test from 'node:test';
import assert from 'node:assert/strict';
import {renderTzCompliantLifecycleMessage} from '../files/src/v3-telegram-tz-formatter.mjs';

const NOW=Date.UTC(2026,8,26,0,0,0);
const base=()=>({
  now:NOW,status:'OBSERVE',ticker:'FARTCOIN-USDT',direction:'LONG',
  lifecycle:{contract:'FARTCOIN-USDT',direction:'LONG',status:'OBSERVE',reason:'USEFUL_LIVE_OBSERVATION',observation_ts:NOW-30_000,valid_until_ts:NOW+300_000},
  early:{early_detection_quality_0_100:64,lifecycle_stage:'DISCOVERY',last_seen_ts:NOW-25_000},
  shadow:{observed_ts:NOW-20_000,direction_hint:'LONG',dc_long:47.43,dc_short:2.91,evidence_flags_json:JSON.stringify({funding_pct:0.03,funding_interval_hours:4,price_1h_pct:1.13,price_4h_pct:4.18,price_24h_pct:3.57,spot_flow_delta_pct:-2.56,oi_1h_change_pct:-2.43,oi_4h_change_pct:10.98})},
  feature:{observed_ts:NOW-25_000,evidence_json:JSON.stringify([{domain:'RELATIVE_STRENGTH',side:'LONG',status:'CLOSED',btc_1h_pct_points:-2.33,eth_1h_pct_points:-2.15,btc_4h_pct_points:2.91,eth_4h_pct_points:3.01}])},
  opportunity:{observed_ts:NOW-18_000,event_json:JSON.stringify({event_type:'ANOMALOUS_EFFORT_VS_RESULT',volume_ratio_median:14.9,minute_decomposition:{classification_allowed:true,one_minute_bars:15,three_minute_bars:5,five_minute_bars:3},early_anomaly_classification:{accumulation:{evidence_score:30},distribution:{evidence_score:15},two_sided_transfer:{evidence_score:20},liquidation_futures_noise:{evidence_score:60}}})},
  campaign:{current_phase:'DISCOVERY',base_low:0.19,base_high:0.2,last_observed_ts:NOW-20_000},
  liquidation:{observed_ts:NOW-20_000,derived_json:'{}',realized_json:JSON.stringify({htx:{total_events:0,long_notional_usdt:0,short_notional_usdt:0}})},
});

test('FARTCOIN-like early message is Russian, evidence-driven and has explicit missing entry/liquidation status',()=>{
  const r=renderTzCompliantLifecycleMessage(base());
  assert.equal(r.ok,true,r.status);
  assert.match(r.message,/РАННЕЕ НАБЛЮДЕНИЕ/);
  assert.match(r.message,/Общая оценка: 47 из 100/);
  assert.match(r.message,/Монета интересна: 64 из 100/);
  assert.match(r.message,/Готовность ко входу: не подтверждена/);
  assert.match(r.message,/Свечной разбор: 15×1м, 5×3м и 3×5м закрыты/);
  assert.match(r.message,/ликвидационный или фьючерсный шум/);
  assert.match(r.message,/Открытый интерес:/);
  assert.match(r.message,/Точный уровень входа пока не подтверждён/);
  assert.match(r.message,/Ликвидации: подтверждённых сильных зон/);
  assert.doesNotMatch(r.message,/USEFUL_LIVE_OBSERVATION|ENTRY_NOW_|WAIT_FOR_TRIGGER|\bOI\b|Funding|receipt|shadow/iu);
});

test('WAIT never reaches user without a complete trigger contract',()=>{
  const r=renderTzCompliantLifecycleMessage({...base(),status:'WAIT',lifecycle:{...base().lifecycle,status:'WAIT'}});
  assert.equal(r.ok,false);assert.equal(r.status,'WAIT_TRIGGER_NOT_CLOSED');assert.equal(r.retryable,true);
});

test('WAIT with exact trigger is clear about near-entry level and recheck',()=>{
  const b=base();
  const r=renderTzCompliantLifecycleMessage({...b,status:'WAIT',lifecycle:{...b.lifecycle,status:'WAIT',valid_until_ts:NOW+600_000},campaign:{...b.campaign,entry_trigger_price:0.205},final:{context_valid_until:NOW+600_000,context_json:JSON.stringify({trigger:{value:0.205,cancel_condition:'цена ниже 0,19 USDT',expires_ts:NOW+600_000,next_recheck_ts:NOW+300_000}})}});
  assert.equal(r.ok,true,r.status);
  assert.match(r.message,/БЛИЗКО К ТОЧКЕ ВХОДА/);
  assert.match(r.message,/Уровень приближения к входу: 0,205 USDT/);
  assert.match(r.message,/только затем возможна команда «МОЖНО ВХОДИТЬ»/);
  assert.match(r.message,/Отмена ожидания: цена ниже 0,19 USDT/);
  assert.match(r.message,/Следующая автоматическая проверка/);
});

test('ENTRY requires exact entry target and invalidation and never leaks service phrases',()=>{
  const b=base();
  const r=renderTzCompliantLifecycleMessage({...b,status:'ENTRY',lifecycle:{...b.lifecycle,status:'ENTRY'},final:{direction:'LONG',score_lower_bound:78,score_upper_bound:82,context_valid_until:NOW+300_000,context_json:JSON.stringify({entry:{area:'0,20–0,205 USDT',target:'0,23 USDT',invalidation:'0,19 USDT'},funding:{rate_pct:0.01,interval_hours:4}})}});
  assert.equal(r.ok,true,r.status);
  assert.match(r.message,/МОЖНО ВХОДИТЬ СЕЙЧАС/);
  assert.match(r.message,/Вход: 0,20–0,205 USDT/);
  assert.match(r.message,/Выход: 0,23 USDT/);
  assert.match(r.message,/Отмена идеи: 0,19 USDT/);
  assert.doesNotMatch(r.message,/автоматическая торговля|не вероятность|не статистическая вероятность/iu);
});

test('pump without proven two-sided levels states that levels are not invented',()=>{
  const b=base();
  const flags=JSON.parse(b.shadow.evidence_flags_json);flags.price_24h_pct=25;
  const r=renderTzCompliantLifecycleMessage({...b,shadow:{...b.shadow,evidence_flags_json:JSON.stringify(flags)}});
  assert.equal(r.ok,true,r.status);
  assert.match(r.message,/Для памповой монеты сильные ликвидационные зоны с обеих сторон пока не подтверждены/);
});
