import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzePump} from '../../analytics/index.mjs';
import {START_PROFILE} from '../../profile/start-v1.mjs';
import {input,fact,zone,T,MINUTE} from './fixtures.mjs';

test('12%/15m produces a standalone long pullback card without map, OI or trade direction',()=>{
  const x=input(),before=JSON.stringify(x),a=analyzePump(x);
  assert.equal(a.ready,true,JSON.stringify(a.reasons));assert.equal(a.status,'READY');assert.equal(a.automatic_eligible,true);assert.equal(a.current_threshold_passed,true);
  assert.equal(a.wave_state,'CALM_PULLBACK');assert.equal(a.probability.value_pct,null);assert.equal(a.liquidations.map_mode,'WITHOUT_MAP');
  assert.match(a.card_text,/Карта ликвидаций недоступна/);assert.doesNotMatch(a.card_text,/поглощ|набирает|точно|100%/i);
  assert.ok(a.plan.entry_zones.every(z=>z.lower>0&&z.upper<a.reference_price&&z.lower>a.plan.invalidation.price));assert.ok(a.plan.exit_zone.lower>a.reference_price);
  assert.ok(a.plan.entry_zones.length<=3);assert.equal(JSON.stringify(x),before);assert.deepEqual(analyzePump(x),a);
});
test('manual analysis uses same kernel while automatic thresholds remain separate',()=>{
  const x=input(),profile={...START_PROFILE,automatic_growth:{...START_PROFILE.automatic_growth,day_pct:200,short_pct:200}};x.mode='MANUAL';
  const a=analyzePump(x,profile);assert.equal(a.ready,true);assert.equal(a.automatic_eligible,false);assert.equal(a.status,'READY');
});
test('old inactive 50% daily gain cannot manufacture a current wave',()=>{
  const x=input();for(const r of x.facts.candles.value){r.open=100;r.close=100;r.high=100;r.low=100;r.volume_base=0;}
  x.facts.ticker_24h=fact('ticker_24h',{open:100,last:150},'USDT_ROLLING_24H');
  const a=analyzePump(x);assert.equal(a.ready,false);assert.ok(a.reasons.includes('VOLUME_BASELINE_ZERO_OR_UNKNOWN'));assert.equal(a.plan,null);
});
test('retained wave survives retreat below the original percentage with unchanged ID, baseline and expiry',()=>{
  const x=input(),first=analyzePump(x);x.previous_wave=first.next_wave;x.facts.price.value=105;
  const last=x.facts.candles.value.at(-1);last.close=105;last.low=104.9;
  const a=analyzePump(x);assert.equal(a.current_threshold_passed,false);assert.equal(a.automatic_eligible,true);assert.equal(a.ready,true,JSON.stringify(a.reasons));
  assert.equal(a.wave_id,first.wave_id);assert.equal(a.next_wave.expires_ts,first.next_wave.expires_ts);assert.deepEqual(a.next_wave.impulse,first.next_wave.impulse);
});
test('more than 100% growth has no upper rejection ceiling',()=>{
  const x=input();x.facts.ticker_24h=fact('ticker_24h',{open:50,last:112},'USDT_ROLLING_24H');const a=analyzePump(x);
  assert.equal(a.ready,true);assert.ok(a.growth_windows.some(w=>w.window_ms===86400000&&w.return_pct>100&&w.passed));
});
test('sharp unconfirmed and reclaimed cases have distinct factual explanations',()=>{
  const x=input();x.facts.price.value=100.5;const sharp=analyzePump(x);assert.equal(sharp.wave_state,'SHARP_PULLBACK_UNCONFIRMED');
  const y=input();y.previous_wave=sharp.next_wave;const n=y.facts.candles.value.length;
  y.facts.candles.value[n-3].low=101;y.facts.candles.value[n-2].low=101;
  const reclaimed=analyzePump(y);assert.equal(reclaimed.wave_state,'SHARP_PULLBACK_RECLAIMED');assert.match(reclaimed.findings[0].text,/закрылась выше/);
  assert.notEqual(sharp.findings[0].text,reclaimed.findings[0].text);
});
test('missing quote turnover stays null and base volume remains a correctly labelled comparison',()=>{
  const x=input(),a=analyzePump(x);assert.equal(a.ready,true);assert.equal(a.activity.impulse.unit,'BASE');
  assert.ok(x.facts.candles.value.every(r=>r.turnover_quote===null));
  for(const r of x.facts.candles.value)r.volume_base=null;
  const b=analyzePump(x);assert.equal(b.ready,false);assert.equal(b.plan,null);
});
test('partial old history can qualify exact available windows without inventing 24h',()=>{
  const x=input();x.facts.candles.value=x.facts.candles.value.slice(-24);x.facts.candles.coverage={complete:false,time_qualified:true,volume_qualified:true};
  x.facts.candles.status='INCOMPLETE';const a=analyzePump(x);assert.equal(a.current_threshold_passed,true);assert.equal(a.activity.impulse.baseline_status,'SHORT_HISTORY');
  assert.equal(a.growth_windows.find(w=>w.window_ms===86400000).return_pct,null);assert.ok(a.activity.impulse.ratio!==Infinity);
});
test('future confirmation candles cannot improve an earlier plan or create a pivot',()=>{
  const x=input(),a=analyzePump(x),last=x.facts.candles.value.at(-1);
  x.facts.candles.value.push({...last,open_ts:T,close_ts:T+MINUTE,close:140,high:141});
  x.facts.candles.value.push({...last,open_ts:T+MINUTE,close_ts:T+2*MINUTE,close:145,high:146});
  const b=analyzePump(x);assert.deepEqual(b,a);
});
test('a price extreme inside the period does not replace its starting price',()=>{
  const x=input();for(const r of x.facts.candles.value.slice(-5))r.low=80;
  const a=analyzePump(x),w=a.growth_windows.find(w=>w.window_ms===300000);
  assert.equal(w.passed,false);assert.ok(w.return_pct<10);
});
test('unjustified plan is refused even when a map exists',()=>{
  const x=input();x.facts.price.value=125;x.liquidations={status:'USABLE',reason:null,zones:[zone('far',145,146)],checked_sources:['ARTIFICIAL'],coverage:null};
  const a=analyzePump(x);assert.equal(a.ready,false);assert.equal(a.plan,null);assert.ok(a.reasons.includes('INDEPENDENT_PULLBACK_PLAN_NOT_JUSTIFIED'));
});
test('desired ten percent is an explanation, never a new blanket gate',()=>{
  const a=analyzePump(input(),{...START_PROFILE,desired_plan_potential_pct:100});assert.equal(a.ready,true);assert.equal(a.plan.desired_potential_status,'BELOW_DESIRED');
  assert.match(a.card_text,/ниже желаемых 100%/);
});
test('unknown directional trades and rising OI cannot create absorption or short-building claims',()=>{
  const x=input();x.facts.trades=fact('trades',[{event_ts:T,price:112,quantity_base:100,aggressor_side:null}],'USDT_PRICE_BASE_QUANTITY');
  x.facts.open_interest=fact('open_interest',10000,'CONTRACTS');const a=analyzePump(x);
  assert.equal(a.ready,true);assert.equal(a.trade_context,undefined);assert.doesNotMatch(a.card_text,/поглощ|набор шорт|набирает/);
});
test('stale mandatory data returns waiting instead of a ready card',()=>{
  const x=input();x.facts.orderbook.event_ts=T-15001;const a=analyzePump(x);assert.equal(a.status,'WAITING');assert.equal(a.card_text,null);
});
test('expiry is anchored at first observation and cannot be renewed by inactive updates',()=>{
  const x=input(),first=analyzePump(x),end=T+START_PROFILE.wave_max_age_ms;
  x.previous_wave=first.next_wave;x.analysis_ts=end;
  for(let i=0;i<240;i++)x.facts.candles.value.push({open_ts:T+i*MINUTE,close_ts:T+(i+1)*MINUTE,closed:true,open:112,high:112,low:112,close:112,volume_base:0,turnover_quote:null});
  for(const key of ['price','candles','orderbook'])x.facts[key]=fact(key,x.facts[key].value,x.facts[key].unit,end);
  const a=analyzePump(x);assert.equal(a.ready,false);assert.equal(a.wave_state,'EXPIRED');assert.equal(a.wave_id,first.wave_id);assert.equal(a.next_wave.expires_ts,first.next_wave.expires_ts);assert.ok(a.reasons.includes('WAVE_LIFETIME_EXPIRED'));
});
test('a temporary empty activity window keeps the prior wave record without extending it',()=>{
  const x=input(),first=analyzePump(x);x.previous_wave=first.next_wave;for(const r of x.facts.candles.value.slice(-5))r.volume_base=0;
  const a=analyzePump(x);assert.equal(a.ready,false);assert.equal(a.next_wave.wave_id,first.wave_id);assert.equal(a.next_wave.expires_ts,first.next_wave.expires_ts);
});
test('mark price under a last-price key is refused rather than silently substituted',()=>{
  const x=input();x.facts.price.kind='mark_price';const a=analyzePump(x);assert.equal(a.ready,false);assert.ok(a.reasons.includes('MANDATORY_PRICE_NOT_USABLE'));
});
test('unknown or zero prior volume never becomes infinite confirmation',()=>{
  const x=input();for(const r of x.facts.candles.value.slice(0,106))r.volume_base=0;
  const a=analyzePump(x);assert.ok(!JSON.stringify(a).includes('Infinity'));assert.equal(a.probability.value_pct,null);
});
test('missing mandatory volume is a precise waiting reason rather than zero or a market inactivity claim',()=>{
  const x=input();for(const r of x.facts.candles.value)r.volume_base=null;
  const a=analyzePump(x);assert.equal(a.status,'WAITING');assert.ok(a.reasons.includes('CURRENT_VOLUME_REQUIRED'));assert.equal(a.activity.impulse,null);
});
test('an observed invalidation inside a closed candle cannot be resurrected by a later price recovery',()=>{
  const x=input(),a=analyzePump(x);x.previous_wave=a.next_wave;
  const at=T+MINUTE;x.analysis_ts=at;x.facts.candles.value.push({open_ts:T,close_ts:at,closed:true,open:112,high:113,low:80,close:112,volume_base:300,turnover_quote:null});
  for(const key of ['price','candles','orderbook'])x.facts[key]=fact(key,x.facts[key].value,x.facts[key].unit,at);
  const b=analyzePump(x);assert.equal(b.wave_state,'CANCELLED');assert.equal(b.ready,false);x.previous_wave=b.next_wave;
  const c=analyzePump(x);assert.equal(c.ready,false);assert.equal(c.wave_state,'CANCELLED');assert.equal(c.wave_id,b.wave_id);
});
test('a missing interval after the previous observation requires new mandatory history',()=>{
  const x=input(),a=analyzePump(x);x.previous_wave=a.next_wave;const at=T+2*MINUTE;x.analysis_ts=at;
  x.facts.candles.value.push({open_ts:T+MINUTE,close_ts:at,closed:true,open:112,high:113,low:111,close:112,volume_base:300,turnover_quote:null});
  for(const key of ['price','candles','orderbook'])x.facts[key]=fact(key,x.facts[key].value,x.facts[key].unit,at);
  const b=analyzePump(x);assert.equal(b.ready,false);assert.equal(b.status,'WAITING');assert.ok(b.reasons.includes('WAVE_PATH_INCOMPLETE'));
});
