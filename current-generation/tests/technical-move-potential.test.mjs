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
test('observed liquidation cluster can prove a target without inventing an amount',()=>{
 const r=evaluateTechnicalMovePotential({direction:'SHORT',current_price:100,trigger_price:99,liquidation_zones:{below:[{kind:'PROJECTED',price:90,strength_score_0_100:70,strength_label_ru:'крупная',exact_notional_usdt:null}]}});
 assert.equal(r.status,'CLOSED');assert.equal(r.basis,'OBSERVED_LIQUIDATION_ZONE');assert.ok(r.potential_move_pct>=5);assert.equal(r.exact_notional_usdt,null);
});
test('calculated zone needs at least three independent market confirmations',()=>{
 const zone={kind:'CALCULATED',price:110,strength_label_ru:'крупная'};
 const weak=evaluateTechnicalMovePotential({direction:'LONG',current_price:100,trigger_price:101,liquidation_zones:{above:[zone]},oi_change_pct:3});
 assert.equal(weak.status,'NOT_CLOSED');
 const strong=evaluateTechnicalMovePotential({direction:'LONG',current_price:100,trigger_price:101,liquidation_zones:{above:[zone]},oi_change_pct:3,volume_ratio:2,funding_rate_pct:.02});
 assert.equal(strong.status,'CLOSED');assert.equal(strong.basis,'CALCULATED_LIQUIDATION_ZONE_WITH_MARKET_CONFIRMATION');assert.ok(strong.evidence_count>=3);
});

test('a verified liquidation zone can support a waiting entry even when candle width is below five percent',()=>{
 const r=evaluateTechnicalMovePotential({direction:'LONG',current_price:100,trigger_price:102,opportunity:{newest_event:{minute_decomposition:{classification_allowed:true},candle:{high:102,low:99}}},liquidation_zones:{above:[{kind:'PROJECTED',price:109,strength_score_0_100:72,strength_label_ru:'крупная'}]}});
 assert.equal(r.status,'CLOSED');assert.equal(r.basis,'OBSERVED_LIQUIDATION_ZONE');assert.equal(r.target_price,109);assert.ok(r.potential_move_pct>=5);
});
