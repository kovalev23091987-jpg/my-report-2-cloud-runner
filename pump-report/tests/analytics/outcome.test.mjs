import test from 'node:test';import assert from 'node:assert/strict';import {evaluateOutcome} from '../../analytics/index.mjs';import {signal,path,T,MINUTE} from './fixtures.mjs';
const end=T+240*MINUTE;
test('full covered miss is distinct from unknown gaps or sampled points',()=>{
  assert.equal(evaluateOutcome({signal:signal(),candles:path(),as_of_ts:end}).status,'MISS');
  const missing=path();missing.splice(20,1);const a=evaluateOutcome({signal:signal(),candles:missing,as_of_ts:end});assert.equal(a.status,'UNKNOWN');assert.equal(a.drawdown_total_pct,null);
  assert.equal(evaluateOutcome({signal:signal(),price_points:[{event_ts:end,price:109}],as_of_ts:end}).status,'UNKNOWN');
});
test('known target hit survives missing history while full decline remains unknown',()=>{
  const a=evaluateOutcome({signal:signal(),price_points:[{event_ts:T+MINUTE,price:80},{event_ts:T+180*MINUTE,price:110}],as_of_ts:end});
  assert.equal(a.status,'HIT');assert.equal(a.target_price,110);assert.equal(a.hit_ts,T+180*MINUTE);assert.equal(a.drawdown_total_pct,null);assert.equal(a.drawdown_before_hit_pct,null);
});
test('decline before exact target and throughout complete period are separate',()=>{
  const candles=path();candles[30].low=80;candles[210].low=70;
  const a=evaluateOutcome({signal:signal(),candles,price_points:[{event_ts:T+180*MINUTE,price:110}],as_of_ts:end});
  assert.equal(a.status,'HIT');assert.ok(Math.abs(a.drawdown_before_hit_pct-20)<1e-10);assert.ok(Math.abs(a.drawdown_total_pct-30)<1e-10);
});
test('boundary candle high cannot prove the price was reached inside four hours',()=>{
  const s=signal({t0:T+30000}),candles=path({count:241});candles[0].high=111;candles[240].high=111;
  const a=evaluateOutcome({signal:s,candles,as_of_ts:end+30000});assert.equal(a.status,'UNKNOWN');assert.ok(a.reasons.includes('BOUNDARY_HIGH_NOT_PROOF'));
});
test('contained candle proves hit but not exact hit time or intrabar decline order',()=>{
  const candles=path();candles[30].high=111;candles[30].low=80;const a=evaluateOutcome({signal:signal(),candles,as_of_ts:end});
  assert.equal(a.status,'HIT');assert.equal(a.hit_ts,null);assert.deepEqual(a.hit_interval,{start_ts:T+30*MINUTE,end_ts:T+31*MINUTE});assert.equal(a.drawdown_before_hit_pct,null);
});
test('positive proof may be recognized before deadline; no proof is pending unknown',()=>{
  assert.equal(evaluateOutcome({signal:signal(),price_points:[{event_ts:T+MINUTE,price:110}],as_of_ts:T+MINUTE}).status,'HIT');
  const a=evaluateOutcome({signal:signal(),as_of_ts:T+MINUTE});assert.equal(a.status,'UNKNOWN');assert.ok(a.reasons.includes('HORIZON_NOT_MATURE'));
});
test('decimal target is not rounded down to a price tick',()=>{
  for(const [price,status] of [[3.33,'UNKNOWN'],[3.34,'HIT']]){const a=evaluateOutcome({signal:signal({reference_price:3.03}),price_points:[{event_ts:T+MINUTE,price}],as_of_ts:end});assert.equal(a.status,status);assert.equal(a.target_price,3.333);}
});
test('target after plan cancellation remains a hit and is flagged separately',()=>{
  const s=signal({plan:{entry_zones:[{lower:95,upper:96}],exit_zone:{lower:108,upper:109},invalidation:{kind:'PRICE_BELOW',price:90}}});
  const a=evaluateOutcome({signal:s,price_points:[{event_ts:T+MINUTE,price:80},{event_ts:T+2*MINUTE,price:110}],as_of_ts:end});assert.equal(a.status,'HIT');assert.equal(a.hit_after_invalidation,true);assert.equal(a.scenario_outcome.execution_proven,false);
});
test('wave identity and original target are preserved across report modes and versions',()=>{
  const a=evaluateOutcome({signal:signal(),as_of_ts:end}),b=evaluateOutcome({signal:signal({signal_id:'UPDATE',rules_version:'NEW',map_mode:'WITH_MAP',mode:'MANUAL'}),as_of_ts:end});
  assert.equal(a.independence_key,b.independence_key);assert.equal(a.deadline_ts,b.deadline_ts);assert.equal(a.target_price,b.target_price);
});
test('an independent positive price proof is not erased by a malformed history segment',()=>{
  const candles=path();candles[20].low=null;
  const a=evaluateOutcome({signal:signal(),candles,price_points:[{event_ts:T+180*MINUTE,price:110}],as_of_ts:end});
  assert.equal(a.status,'HIT');assert.equal(a.drawdown_total_pct,null);assert.ok(a.reasons.includes('INVALID_CANDLE'));
});
test('entry and exit inside one candle do not prove their ordering or a user fill',()=>{
  const s=signal({plan:{entry_zones:[{lower:95,upper:96}],exit_zone:{lower:108,upper:109},invalidation:{kind:'PRICE_BELOW',price:90}}}),candles=path();candles[20].low=95;
  const a=evaluateOutcome({signal:s,candles,as_of_ts:end});assert.equal(a.scenario_outcome.entry_then_exit_confirmed,true);
  const b=evaluateOutcome({signal:s,candles:candles.slice(0,21),as_of_ts:T+21*MINUTE});assert.equal(b.scenario_outcome.entry_then_exit_confirmed,null);assert.equal(b.scenario_outcome.intrabar_order_unknown,true);
});
test('an earlier candle hit cannot be relabelled after a later cancellation and later repeated target',()=>{
  const s=signal({plan:{entry_zones:[{lower:95,upper:96}],exit_zone:{lower:108,upper:109},invalidation:{kind:'PRICE_BELOW',price:90}}}),candles=path();candles[30].high=111;
  const a=evaluateOutcome({signal:s,candles,price_points:[{event_ts:T+60*MINUTE,price:80},{event_ts:T+180*MINUTE,price:110}],as_of_ts:end});
  assert.equal(a.status,'HIT');assert.equal(a.hit_after_invalidation,false);assert.equal(a.hit_interval.start_ts,T+30*MINUTE);
});
