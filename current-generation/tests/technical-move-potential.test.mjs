import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateTechnicalMovePotential} from '../files/src/technical-move-potential.mjs';

test('a bare five-percent wish is rejected without technical evidence',()=>{
 const r=evaluateTechnicalMovePotential({direction:'LONG',current_price:100,trigger_price:101,liquidation_zones:{above:[{kind:'CALCULATED',price:110,strength_label_ru:'крупная'}]}});
 assert.equal(r.status,'NOT_CLOSED');assert.equal(r.target_price,null);assert.equal(r.not_random_target,true);
});
test('measured candle range can prove more than five percent',()=>{
 const r=evaluateTechnicalMovePotential({direction:'LONG',current_price:100,trigger_price:101,opportunity:{newest_event:{minute_decomposition:{classification_allowed:true},candle:{high:101,low:94}}}});
 assert.equal(r.status,'CLOSED');assert.equal(r.basis,'MEASURED_ANOMALY_CANDLE_RANGE');assert.ok(r.potential_move_pct>=5);assert.equal(r.target_price,108);
});
test('only a separately admitted fresh native liquidation level can prove a target',()=>{
 const unscoped=evaluateTechnicalMovePotential({direction:'SHORT',current_price:100,trigger_price:99,liquidation_zones:{below:[{kind:'PROJECTED',price:90,strength_score_0_100:70,strength_label_ru:'крупная',exact_notional_usdt:null}]}});
 assert.equal(unscoped.status,'NOT_CLOSED');
 const r=evaluateTechnicalMovePotential({direction:'SHORT',current_price:100,trigger_price:99,liquidation_zones:{below:[{kind:'NATIVE',price:90,strength_score_0_100:70,strength_label_ru:'крупная',exact_notional_usdt:null,decision_target_eligible:true,source:'LIGHTER',source_ts:1000}]}});
 assert.equal(r.status,'CLOSED');assert.equal(r.basis,'FRESH_SCOPED_NATIVE_LEVEL');assert.ok(r.potential_move_pct>=5);assert.equal(r.exact_notional_usdt,null);
});
test('calculated zone never becomes a decision target from generic confirmations',()=>{
 const zone={kind:'CALCULATED',price:110,strength_label_ru:'крупная'};
 const weak=evaluateTechnicalMovePotential({direction:'LONG',current_price:100,trigger_price:101,liquidation_zones:{above:[zone]},oi_change_pct:3});
 assert.equal(weak.status,'NOT_CLOSED');
 const strong=evaluateTechnicalMovePotential({direction:'LONG',current_price:100,trigger_price:101,liquidation_zones:{above:[zone]},oi_change_pct:3,volume_ratio:2,funding_rate_pct:.02});
 assert.equal(strong.status,'NOT_CLOSED');assert.equal(strong.minimum_move_proven,undefined);
});

test('a verified scoped native level can support waiting entry when candle width is below five percent',()=>{
 const r=evaluateTechnicalMovePotential({direction:'LONG',current_price:100,trigger_price:102,opportunity:{newest_event:{minute_decomposition:{classification_allowed:true},candle:{high:102,low:99}}},liquidation_zones:{above:[{kind:'NATIVE',price:109,strength_score_0_100:72,strength_label_ru:'крупная',decision_target_eligible:true,source:'GMX',source_ts:1000}]}});
 assert.equal(r.status,'CLOSED');assert.equal(r.basis,'FRESH_SCOPED_NATIVE_LEVEL');assert.equal(r.target_price,109);assert.ok(r.potential_move_pct>=5);
});

test('estimated or conditional account levels cannot override the target proof gate',()=>{
 for(const row of [
  {price:202.84495,price_semantics:'BUCKET_CENTER'},
  {price:14.4718582272,price_semantics:'EXCHANGE_ACCOUNT_REPORTED_PRICE',conditional_cross:true},
  {price:280,kind:'CALCULATED'},
  {price:280,entry_eligible:false},
  {price:280,is_htx_price:false},
 ]){
  const r=evaluateTechnicalMovePotential({direction:'SHORT',current_price:304.8,trigger_price:302.05,liquidation_zones:{below:[{kind:'NATIVE_SCOPED',decision_target_eligible:true,...row}]}});
  assert.equal(r.status,'NOT_CLOSED');assert.equal(r.target_price,null);
 }
});

test('an estimated nearby bucket cannot veto a measured five-percent target',()=>{
 const r=evaluateTechnicalMovePotential({direction:'LONG',current_price:100,trigger_price:100,opportunity:{newest_event:{minute_decomposition:{classification_allowed:true},candle:{high:101,low:94}}},liquidation_zones:{above:[{kind:'NATIVE_SCOPED',price:102,exact_notional_usdt:10000,price_semantics:'BUCKET_CENTER'}]}});
 assert.equal(r.status,'CLOSED');assert.equal(r.target_price,107);assert.deepEqual(r.path_obstacles,[]);
});
