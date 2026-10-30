import test from 'node:test';import assert from 'node:assert/strict';
import {evaluateOutcome,analyzePump} from '../../analytics/index.mjs';import {summarizeOutcomes} from '../../analytics/summary.mjs';
import {input,zone,signal,path,T,MINUTE} from './fixtures.mjs';
const start=T+30001,end=start+240*MINUTE,asof=T+242*MINUTE;
test('fractional-millisecond report can have a proven MISS from continuous enclosing no-hit candles',()=>{
  const a=evaluateOutcome({signal:signal({t0:start}),candles:path({count:241}),as_of_ts:asof});
  assert.equal(a.status,'MISS');assert.equal(a.coverage.complete,false);assert.equal(a.coverage.no_hit_period_covered,true);assert.equal(a.coverage.no_hit_basis,'ENCLOSING_CLOSED_MINUTE_BARS_ALL_HIGHS_BELOW_TARGET');
  assert.equal(a.drawdown_total_pct,null);assert.equal(a.drawdown_before_hit_pct,null);
});
test('high on the opening boundary remains ambiguous, not HIT and not MISS',()=>{
  const c=path({count:241});c[0].high=110;const a=evaluateOutcome({signal:signal({t0:start}),candles:c,as_of_ts:asof});assert.equal(a.status,'UNKNOWN');assert.equal(a.coverage.no_hit_period_covered,false);
});
test('high on the ending boundary remains ambiguous even though the rest is below target',()=>{
  const c=path({count:241});c[240].high=110;const a=evaluateOutcome({signal:signal({t0:start}),candles:c,as_of_ts:asof});assert.equal(a.status,'UNKNOWN');assert.equal(a.hit_ts,null);
});
test('an internal missing minute prevents the enclosing no-hit proof',()=>{
  const c=path({count:241});c.splice(100,1);const a=evaluateOutcome({signal:signal({t0:start}),candles:c,as_of_ts:asof});assert.equal(a.status,'UNKNOWN');assert.equal(a.coverage.no_hit_period_covered,false);
});
test('contained HIT is still recognized despite boundary ambiguity and another history gap',()=>{
  const c=path({count:241});c[0].high=111;c[120].high=111;c.splice(100,1);const a=evaluateOutcome({signal:signal({t0:start}),candles:c,as_of_ts:asof});assert.equal(a.status,'HIT');assert.equal(a.drawdown_total_pct,null);
});
test('an extreme boundary low never becomes a measured intraperiod decline',()=>{
  const c=path({count:241});c[0].low=1;c[240].low=2;const a=evaluateOutcome({signal:signal({t0:start}),candles:c,as_of_ts:asof});assert.equal(a.status,'MISS');assert.equal(a.drawdown_total_pct,null);
});
function summaryRecord(o){return {record_id:'ARTIFICIAL_C',recorded_ts:asof,origin:{instrument_id:'ARTIFICIAL:TEST',asset_id:'ARTIFICIAL:ASSET',wave_id:o.wave_id,signal_id:o.signal_id,t0:o.t0,reference_price:o.reference_price,rules_version:o.rules_version,profile_version:'ARTIFICIAL',mode:o.mode,map_mode:'NO_MAP',evidence_class:'NON_NATIVE',ready:true},publication:{state:'UNSENT',message_id:null,receipt_ref:null},outcome:o};}
test('summary accepts mature enclosing MISS without pretending exact price coverage',()=>{
  const o=evaluateOutcome({signal:signal({t0:start}),candles:path({count:241}),as_of_ts:asof}),a=summarizeOutcomes([summaryRecord(o)],{as_of_ts:asof});
  assert.equal(a.mature_outcomes.miss,1);assert.equal(a.invalid_records,0);assert.equal(a.enclosing_no_hit_proof_mature_waves,1);assert.equal(a.gapped_mature_waves,0);assert.equal(a.probability.value_pct,null);
});
test('a bare no-hit boolean without its declared coverage basis cannot close MISS in the summary',()=>{
  const o=evaluateOutcome({signal:signal({t0:start}),candles:path({count:241}),as_of_ts:asof});o.coverage.no_hit_basis=null;
  const a=summarizeOutcomes([summaryRecord(o)],{as_of_ts:asof});assert.equal(a.mature_outcomes.miss,0);assert.equal(a.mature_outcomes.unknown,1);
});
test('card shows source as-of age, venue, model and limitations instead of refreshing age from receipt',()=>{
  const x=input();x.liquidations={status:'PARTIAL',reason:'PARTIAL',zones:[zone('OLD',125,126,{event_ts:T-45000,received_ts:T,expires_ts:T+100000,model_id:'EXTERNAL_MODEL_X',model_version:'v7',limitations:['PARTIAL_SOURCE_COVERAGE']})],coverage:null};
  const a=analyzePump(x);assert.equal(a.ready,true);assert.match(a.card_text,/45 с назад/);assert.match(a.card_text,/МСК/);assert.match(a.card_text,/OTHER_VENUE/);assert.match(a.card_text,/EXTERNAL_MODEL_X \/ v7/);assert.match(a.card_text,/ограничения источника/);assert.match(a.card_text,/Охват карты/);
});
test('uncalibrated event is named without inventing a numerical probability or user profit',()=>{
  const a=analyzePump(input());assert.match(a.card_text,/\+10% за 4 часа: вероятность пока не оценена/);assert.equal(a.probability.value_pct,null);assert.doesNotMatch(a.card_text,/прибыль состав|вероятность 9[0-9]/i);
});
test('six long source/model descriptions remain within Telegram length while preserving all six zones',()=>{
  const x=input(),zs=[];for(let i=0;i<3;i++){zs.push(zone('UP'+i,125+10*i,126+10*i));zs.push(zone('DOWN'+i,90-10*i,91-10*i));}
  for(const z of zs){z.source='SOURCE'.repeat(30);z.venue='VENUE'.repeat(30);z.model_id='MODEL'.repeat(30);z.model_version='VERSION'.repeat(30);z.limitations=['SOURCE_LIMIT'];}
  x.liquidations={status:'USABLE',zones:zs,coverage:null};const a=analyzePump(x);assert.equal(a.ready,true);assert.equal(a.liquidations.zones_up.length,3);assert.equal(a.liquidations.zones_down.length,3);assert.ok(a.card_text.length<=4096);
});
test('a positive in-period point never coexists with a contradictory no-hit flag',()=>{
  const a=evaluateOutcome({signal:signal({t0:start}),candles:path({count:241}),price_points:[{event_ts:start+MINUTE,price:110}],as_of_ts:asof});
  assert.equal(a.status,'HIT');assert.equal(a.coverage.no_hit_period_covered,false);assert.equal(a.coverage.no_hit_basis,null);
});
