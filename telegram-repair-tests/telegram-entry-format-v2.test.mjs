import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFinalChainTelegramMessage,extractMajorLiquidationLevels} from '../telegram-output.mjs';

const NOW=Date.UTC(2026,8,21,8);
const observer=(direction='LONG',extra={})=>({
  decision_id:'FDI:RAY:1',material_digest:'material',snapshot_id:'SNAP:1',
  mode:'SHADOW_ONLY_NO_EXECUTION',decision_status:'SHADOW_EVALUATED',contract_code:'RAY-USDT',
  observation_ts:NOW-30_000,persisted_ts:NOW-20_000,direction,directional_quality:'CLOSED',
  entry_action:'SHADOW_ENTRY_ELIGIBLE',entry_action_id:'FDE:RAY:1',entry_quality:'CLOSED',
  data_quality:'CLOSED',execution_quality:'CLOSED',entry_execution_quality:'CLOSED',
  campaign_phase:'NEXT_IMPULSE_ENTRY',campaign_quality:'CLOSED',independence_state:'CLOSED',
  timing_state:'ENTRY_WINDOW',risk_state:'CLEAR',position_state:'FLAT',management_action:'NOT_EVALUATED',
  hard_veto:false,hard_veto_state:'CLEAR',shadow_only:1,live_probability:null,validated_signal:0,
  execution_authorized:0,telegram_eligible:0,position_source_quality:'CLOSED',...extra,
});
const cluster=(side,level,distance,extra={})=>({
  side,level_price:level,distance_pct:distance,significance:'MAJOR',lifecycle:'ACTIVE',
  observed_ts:NOW-40_000,asset_identity_verified:true,source_status:'CLOSED_SHADOW',...extra,
});
const context=(direction='LONG',extra={})=>({
  schema:'telegram-final-context-v1',score_semantics:'FOUR_BLOCK_35_30_20_15_V1',direction,
  valid_until_ts:NOW+300_000,score_lower_bound:78,score_upper_bound:82,
  weighted_blocks:[
    {id:'DERIVATIVES_CROSS_VENUE',contribution_lower:25},
    {id:'RELATIVE_STRENGTH_SPOT',contribution_lower:21},
    {id:'SMART_MONEY_ONCHAIN',contribution_lower:17},
    {id:'SUPPORTING_RISK',contribution_lower:15},
  ],
  entry:{area:'1,20–1,23 USDT',target:'1,35 USDT',invalidation:'1,14 USDT'},
  funding:{rate_pct:0.01,interval_hours:8,observed_ts:NOW-60_000},
  position_semantics:{alert_implies_user_trade:false,user_position_confirmed:false},
  liquidations:{status:'CONFIRMED',
    short_above:[cluster('SHORT_LIQUIDATION_ABOVE',1.42,18.3),cluster('SHORT_LIQUIDATION_ABOVE',1.68,40)],
    long_below:[cluster('LONG_LIQUIDATION_BELOW',1.01,-15.8),cluster('LONG_LIQUIDATION_BELOW',0.82,-31.7)]},
  ...extra,
});
const reasonWords=message=>[...(message.split('\n').find(x=>x.startsWith('Почему интересно:'))||'').replace(/^Почему интересно:\s*/,'').matchAll(/\p{L}+/gu)].length;

test('entry notification is explicit, compact and contains real entry/exit/invalidation levels',()=>{
  for(const direction of ['LONG','SHORT']){
    const built=buildFinalChainTelegramMessage(observer(direction),context(direction),{now:NOW});
    assert.equal(built.ok,true,built.status);
    assert.match(built.message,direction==='LONG'?/RAY\n🟢 ЛОНГ\n✅ МОЖНО ВХОДИТЬ СЕЙЧАС/:/RAY\n🔴 ШОРТ\n✅ МОЖНО ВХОДИТЬ СЕЙЧАС/);
    assert.match(built.message,/Вход: 1,20–1,23 USDT/);assert.match(built.message,/Выход: 1,35 USDT/);assert.match(built.message,/Отмена идеи: 1,14 USDT/);
    assert.ok(reasonWords(built.message)>=10&&reasonWords(built.message)<=15,reasonWords(built.message));
    assert.doesNotMatch(built.message,/Оценка\s*:|\b(?:78|82)\s*\/\s*100\b|вероятност|ПРОПУСТИТЬ|ПЕРЕЗАХОД/iu);
  }
});

test('confirmed major liquidation levels are shown on both sides without becoming targets',()=>{
  const built=buildFinalChainTelegramMessage(observer(),context(),{now:NOW});
  assert.match(built.message,/Крупные ликвидации выше: 1,42 USDT \(\+18,3%\), 1,68 USDT \(\+40,0%\)\./);
  assert.match(built.message,/Крупные ликвидации ниже: 1,01 USDT \(-15,8%\), 0,82 USDT \(-31,7%\)\./);
  assert.match(built.message,/Выход: 1,35 USDT/);
});

test('missing, one-sided or unsafe liquidation data never blocks entry and is simply omitted',()=>{
  const cases=[
    null,
    {status:'CONFIRMED',short_above:[cluster('SHORT_LIQUIDATION_ABOVE',1.42,18.3)],long_below:[]},
    {status:'CONFIRMED',short_above:[cluster('SHORT_LIQUIDATION_ABOVE',1.42,18.3,{observed_ts:NOW+1})],long_below:[cluster('LONG_LIQUIDATION_BELOW',1.01,-15.8)]},
    {status:'CONFIRMED',short_above:[cluster('SHORT_LIQUIDATION_ABOVE',1.42,18.3,{asset_identity_verified:false})],long_below:[cluster('LONG_LIQUIDATION_BELOW',1.01,-15.8)]},
  ];
  for(const liquidations of cases){
    const built=buildFinalChainTelegramMessage(observer(),context('LONG',{liquidations}),{now:NOW});
    assert.equal(built.ok,true,built.status);assert.doesNotMatch(built.message,/Крупные ликвидации/);
  }
});

test('liquidation normalization rejects swept, duplicate, non-major and future rows',()=>{
  const observed=NOW-30_000;
  const value={status:'PARTIAL',short_above:[
    cluster('SHORT_LIQUIDATION_ABOVE',1.42,18.3),
    cluster('SHORT_LIQUIDATION_ABOVE',1.42,18.3),
    cluster('SHORT_LIQUIDATION_ABOVE',1.50,25,{significance:'SIGNIFICANT'}),
    cluster('SHORT_LIQUIDATION_ABOVE',1.60,33,{lifecycle:'SWEPT'}),
  ],long_below:[cluster('LONG_LIQUIDATION_BELOW',1.01,-15.8)]};
  const levels=extractMajorLiquidationLevels(value,{observationTs:observed});
  assert.equal(levels.complete,true);assert.equal(levels.above.length,1);assert.equal(levels.below.length,1);
});
