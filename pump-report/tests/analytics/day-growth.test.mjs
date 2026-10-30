import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {analyzePump,RULES_VERSION} from '../../analytics/index.mjs';
import {consumeObservedDayGrowth} from '../../analytics/day-growth.mjs';
import {START_PROFILE} from '../../profile/start-v1.mjs';
import {GROWTH_24H_UNIT,GROWTH_24H_WINDOW_MS,CANDLE_CCXT_TIME_BASIS,CANDLE_SEMANTICS_OWNER_REF} from '../../contracts/index.mjs';
import {input,fact,T,MINUTE} from './fixtures.mjs';
import {selectOutcomeAnchor} from '../../analytics/anchors.mjs';
import {evaluateOutcome} from '../../analytics/outcome.mjs';

function narrow(){const x=input();for(const r of x.facts.candles.value)for(const k of ['open','high','low','close'])r[k]=117+(r[k]-100)/4;x.facts.price.value=120;return x;}
function day(x=narrow()){
  const end=T,start=end-GROWTH_24H_WINDOW_MS,receipt='ARTIFICIAL_DAY_RECEIPT',evidence='ARTIFICIAL_APPROVED_TIME_REVIEW';
  return {...fact('growth_24h',{open:100,last:120,start_ts:start,end_ts:end,window_ms:GROWTH_24H_WINDOW_MS},GROWTH_24H_UNIT),asset_id:x.instrument.asset_id,
    source:'BINGX_OFFICIAL_PUBLIC_API',primary_provider:'BINGX',market_type:'PERPETUAL',quote:'USDT',settle:'USDT',identity_evidence_ref:x.instrument.identity_evidence_ref,evidence_ref:receipt,
    coverage:{window_start:start,window_end:end,window_ms:GROWTH_24H_WINDOW_MS,interval_ms:MINUTE,expected_rows:1440,complete:true,time_qualified:true,time_basis:CANDLE_CCXT_TIME_BASIS,
      time_evidence_ref:evidence,owner_decision_ref:CANDLE_SEMANTICS_OWNER_REF,source_route:'/openApi/swap/v3/quote/klines',quantity_used:false,absolute_quantity:null,independent_vendor_guarantee_claimed:false,
      native_returned_rows:1440,included_closed_rows:1440,outside_window_rows:0,captured_unclosed_rows:0,gaps:[],start_boundary_present:true,end_boundary_present:true},
    derived_from:{kind:'OBSERVED_OHLC_WINDOW_BOUNDARIES',source_route:'/openApi/swap/v3/quote/klines',interval_ms:MINUTE,observed_closed_rows:1440,original_receipt_id:receipt,original_received_ts:T,
      open_field:'first.open',last_field:'last.close',start_field:'first.time',end_field:'last.time+60000',time_basis:CANDLE_CCXT_TIME_BASIS,time_evidence_ref:evidence,absolute_quantity:null}};
}
function consume(f,x=narrow()){return consumeObservedDayGrowth(f,{instrument:x.instrument,as_of_ts:x.analysis_ts,profile:START_PROFILE});}
test('J01 exact observed +20% qualifies the day cohort although all short windows are below +10%',()=>{
  const x=narrow(),before=analyzePump(x);assert.equal(before.ready,true);assert.equal(before.automatic_eligible,false);x.facts.growth_24h=day(x);const frozen=structuredClone(x),a=analyzePump(x),w=a.growth_windows.at(-1);
  assert.equal(a.ready,true);assert.equal(a.automatic_eligible,true);assert.equal(w.passed,true);assert.ok(Math.abs(w.return_pct-20)<1e-12);assert.equal(w.start_price,100);assert.equal(w.end_price,120);assert.equal(w.window_ms,86400000);
  assert.equal(w.basis,'OBSERVED_CLOSED_OHLC_24H');assert.deepEqual(a.next_wave.qualification[0].fact_ids,[x.facts.growth_24h.fact_id]);assert.ok(a.fact_ids.includes(x.facts.growth_24h.fact_id));assert.equal(a.rules_version,RULES_VERSION);assert.notEqual(RULES_VERSION,'pump-analytics-v1-tz2-20261025');assert.deepEqual(x,frozen);
});
test('J02 no favorable minimum or reported percentage substitutes for first.open to last.close',()=>{
  const f=day();f.value.open=110;f.value.low=1;f.value.reported_change_pct=1000;const a=consume(f);assert.equal(a.usable,true);assert.equal(a.window.passed,false);assert.equal(a.window.start_price,110);assert.ok(a.window.return_pct<10);
  f.value.open=100;f.value.last=119.999999;assert.equal(consume(f).window.passed,false);
});
test('J03 different identity, venue, source, origin, market or unit cannot qualify',()=>{
  for(const [key,value] of Object.entries({instrument_id:'OTHER',asset_id:'OTHER',identity_evidence_ref:'OTHER',venue:'OTHER',source:'REPORTED_TICKER',primary_provider:'OTHER',origin:'ESTIMATED',market_type:'SPOT',quote:'USD',settle:'BTC',kind:'ticker_24h',unit:'USDT_ROLLING_24H'})){
    const f=day();f[key]=value;assert.equal(consume(f).usable,false,key);
  }
});
test('J04 stale, future, delayed or extended-expiry day facts never qualify',()=>{
  for(const edit of [f=>f.status='INCOMPLETE',f=>f.status='STALE',f=>f.expires_ts=T-1,f=>f.expires_ts=T+999999,f=>f.received_ts=T+1,f=>f.received_ts=T-1,f=>f.event_ts=T+1]){const f=day();edit(f);assert.equal(consume(f).usable,false);}
  const x=narrow();x.analysis_ts=T+90001;assert.equal(consume(day(),x).usable,false);
});
test('J05 exact full aligned 24h boundaries are mandatory',()=>{
  for(const edit of [f=>f.value.start_ts+=MINUTE,f=>f.value.end_ts-=MINUTE,f=>f.value.start_ts++,f=>f.value.window_ms=3600000,f=>f.value.open=0,f=>f.value.last=Infinity,f=>f.value.last=0]){const f=day();edit(f);assert.equal(consume(f).usable,false);}
});
test('J06 missing minute, open row, incomplete coverage or false absolute/time assertions cannot qualify',()=>{
  for(const edit of [c=>c.complete=false,c=>c.included_closed_rows=1439,c=>c.native_returned_rows=1439,c=>c.expected_rows=1439,c=>c.gaps=[T-MINUTE],c=>c.start_boundary_present=false,c=>c.end_boundary_present=false,
    c=>c.outside_window_rows=1,c=>c.captured_unclosed_rows=1,c=>c.time_qualified=false,c=>c.time_basis='EXCHANGE_GUARANTEED',c=>c.time_evidence_ref=null,c=>c.owner_decision_ref='OTHER',c=>c.window_start++,c=>c.interval_ms=300000,
    c=>c.source_route='/openApi/swap/v2/quote/ticker',c=>c.quantity_used=true,c=>c.absolute_quantity='BASE',c=>c.independent_vendor_guarantee_claimed=true]){const f=day();edit(f.coverage);assert.equal(consume(f).usable,false);}
});
test('J07 receipt and original OHLC fields and clocks remain bound',()=>{
  for(const edit of [f=>f.evidence_ref='',f=>f.fact_id='',f=>f.derived_from=null,f=>f.derived_from.original_receipt_id='OTHER',f=>f.derived_from.original_received_ts--,
    f=>f.derived_from.open_field='minimum.low',f=>f.derived_from.last_field='reported_price',f=>f.derived_from.start_field='ticker.openTime',f=>f.derived_from.end_field='now',
    f=>f.derived_from.observed_closed_rows=1439,f=>f.derived_from.time_evidence_ref='OTHER',f=>f.derived_from.absolute_quantity='USD']){const f=day();edit(f);assert.equal(consume(f).usable,false);}
});
test('J08 a conflicting endpoint in the independently observed core window is ignored without poisoning a short-window idea',()=>{
  const x=input(),before=analyzePump(x);x.facts.growth_24h=day(x);const a=analyzePump(x);assert.equal(a.day_growth_diagnostic.reason,'DAY_END_PRICE_CONFLICT');assert.equal(a.ready,true);assert.equal(a.automatic_eligible,before.automatic_eligible);assert.deepEqual(a.plan,before.plan);assert.ok(!a.fact_ids.includes(x.facts.growth_24h.fact_id));
});
test('J09 invalid optional day data does not suppress independently qualifying short windows',()=>{
  const x=input(),before=analyzePump(x);x.facts.growth_24h=day(x);x.facts.growth_24h.coverage.gaps=[T-MINUTE];const a=analyzePump(x);assert.equal(a.ready,true);assert.equal(a.automatic_eligible,true);assert.deepEqual(a.plan,before.plan);assert.equal(a.probability.value_pct,null);
});
test('J10 observed day does not bypass current activity, current book or an independent pullback plan',()=>{
  for(const edit of [x=>x.facts.candles.value.slice(-5).forEach(r=>r.volume_base=0),x=>x.facts.orderbook.status='STALE',x=>x.facts.orderbook.value={asks:[[120.1,0.001]],bids:[[119.9,0.001]]},x=>x.facts.price.value=130]){
    const x=narrow();x.facts.growth_24h=day(x);edit(x);const a=analyzePump(x);assert.equal(a.ready,false);assert.equal(a.card_text,null);assert.equal(a.probability.value_pct,null);assert.ok(a.manual_text.length>20);
  }
});
test('J11 retained original qualification, impulse, creation and expiry cannot be moved by new day boundaries',()=>{
  const x=narrow();x.facts.growth_24h=day(x);const first=analyzePump(x);x.previous_wave=structuredClone(first.next_wave);const original=structuredClone(x.previous_wave);x.facts.growth_24h.value.open=119;const a=analyzePump(x);
  assert.equal(a.current_threshold_passed,false);assert.equal(a.automatic_eligible,true);assert.equal(a.wave_id,first.wave_id);assert.equal(a.next_wave.created_ts,original.created_ts);assert.equal(a.next_wave.expires_ts,original.expires_ts);assert.deepEqual(a.next_wave.qualification,original.qualification);assert.deepEqual(a.next_wave.impulse,original.impulse);
});
test('J12 the former positively qualified ticker fixture path remains and reported-only status is not promoted',()=>{
  const x=narrow();x.facts.ticker_24h=fact('ticker_24h',{open:100,last:120},'USDT_ROLLING_24H');const a=analyzePump(x);assert.equal(a.automatic_eligible,true);assert.deepEqual(a.next_wave.qualification[0].fact_ids,[x.facts.ticker_24h.fact_id]);
  x.facts.ticker_24h.status='INCOMPLETE';x.facts.ticker_24h.value={reported_change_pct:200};assert.equal(analyzePump(x).automatic_eligible,false);
});
test('J13 manual refusal explains verified price, growth, activity, liquidity and the missing plan',async()=>{
  const x=narrow();x.mode='MANUAL';x.facts.growth_24h=day(x);x.facts.price.value=130;const before=structuredClone(x),a=analyzePump(x);
  assert.equal(a.ready,false);assert.equal(a.card_text,null);assert.match(a.manual_text,/Готовой идеи пока нет/);assert.match(a.manual_text,/Проверенная цена: 130 USDT/);assert.match(a.manual_text,/24 ч \+20%/);assert.match(a.manual_text,/Активность исходного импульса к фону/);assert.match(a.manual_text,/двусторонний стакан/);assert.match(a.manual_text,/самостоятельный план/);assert.doesNotMatch(a.manual_text,/вероятность.*\d|ликвидации.*\d|будет отправлен|BUY|ENTRY_CAPACITY/);assert.deepEqual(x,before);assert.equal(a.original_card,undefined);assert.equal(a.outcome,undefined);
  await writeFile(new URL('../../handoffs/analytics/package-j/manual-refusal-artificial.txt',import.meta.url),'ARTIFICIAL_ONLY — не рыночное наблюдение\n'+a.manual_text+'\n');
});
test('J14 missing or unqualified data is explained as unknown rather than zero activity or fabricated liquidity',()=>{
  const x=input();x.facts.price.status='STALE';x.facts.orderbook.status='ABSENT';const a=analyzePump(x);assert.match(a.manual_text,/цена недоступна/);assert.match(a.manual_text,/Отношение торговой активности к фону не определено/);assert.match(a.manual_text,/Ликвидность.*не подтверждена/);assert.doesNotMatch(a.manual_text,/0 USDT|0 раза|0%/);assert.equal(a.ready,false);assert.equal(a.card_text,null);
});
test('J15 an inactive wave can still explain an independently verified book without becoming READY',()=>{
  const x=input();for(const r of x.facts.candles.value)r.volume_base=1000;const a=analyzePump(x);assert.equal(a.ready,false);assert.match(a.manual_text,/Текущий двусторонний стакан допускает/);assert.match(a.manual_text,/Активный рост.*не подтверждён/);assert.equal(a.card_text,null);
});
test('J16 invalid profiles receive a plain refusal without a formatter exception',()=>{const a=analyzePump(input(),null);assert.equal(a.ready,false);assert.match(a.manual_text,/настроек анализа/);});
test('J17 ready presentation remains exactly the ready card, with optional map absent',()=>{const a=analyzePump(input());assert.equal(a.ready,true);assert.equal(a.manual_text,a.card_text);assert.equal(a.liquidations.map_mode,'WITHOUT_MAP');});

test('J18 the real SOURCE producer joins the consumer using an artificial 1440-row broker receipt',async()=>{
  const {createPumpSources}=await import('../../sources/index.mjs');
  const {createNativeRelativeCandleQualification}=await import('../../sources/native-relative-qualification.mjs');
  const x=narrow(),qualification=createNativeRelativeCandleQualification(x.instrument);let calls=0;
  const data=Array.from({length:1440},(_,i)=>({time:T-86400000+i*MINUTE,open:i===0?'100':'110',high:'121',low:'1',close:i===1439?'120':'110',volume:'UNQUALIFIED_UNUSED'}));
  const loader=createPumpSources({clock:()=>T,identityRegistry:[{instrument:x.instrument,native_contract_id:'ARTIFICIAL_ONLY',qualifications:{candles:qualification}}],broker:{async request(request){calls++;assert.match(request.url,/limit=1440/);return {ok:true,status:200,received_ts:T,receipt_id:'ARTIFICIAL_SOURCE_DAY_CONNECTED',data:{code:0,data},cache_hit:false};}}});
  const result=await loader.getDayGrowth({instrument:x.instrument});assert.equal(result.facts.growth_24h.status,'USABLE');x.facts.growth_24h=result.facts.growth_24h;const a=analyzePump(x);assert.equal(a.ready,true);assert.equal(a.automatic_eligible,true);assert.equal(a.growth_windows.at(-1).start_price,100);assert.equal(a.growth_windows.at(-1).end_price,120);assert.equal(calls,1,'in-memory broker, native HTTP=0');assert.equal(a.probability.value_pct,null);
});

test('J19 changed J rules and a newer day observation preserve an already published original t0, P0 and target',()=>{
  const x=narrow(),old=analyzePump(x),origin={instrument_id:x.instrument.instrument_id,asset_id:x.instrument.asset_id,wave_id:old.wave_id,signal_id:'ARTIFICIAL_ORIGINAL',t0:T,reference_price:120,
    rules_version:'pump-analytics-v1-tz2-20261025',profile_version:START_PROFILE.version,mode:'MANUAL',map_mode:'NO_MAP',evidence_class:'ARTIFICIAL',ready:true};
  const first={analysis_id:'ORIGINAL',analysis_sha256:'a'.repeat(64),recorded_ts:T,features_known_ts:T,origin};
  const publications=[{event_id:'ORIGINAL_SENT',analysis_id:'ORIGINAL',event_ts:T+1000,recorded_ts:T+1000,state:'SENT',message_id:'ARTIFICIAL_ONLY',receipt_ref:'ARTIFICIAL_ONLY'}];
  const before=selectOutcomeAnchor({analyses:[first],publications,as_of_ts:T+MINUTE,wave_expires_ts:T+4*60*MINUTE});assert.equal(before.eligible,true);
  x.previous_wave=old.next_wave;x.facts.growth_24h=day(x);x.facts.price.value=121;const updated=analyzePump(x);
  const newer={analysis_id:'J_UPDATE',analysis_sha256:'b'.repeat(64),recorded_ts:T+MINUTE,features_known_ts:T+MINUTE,origin:{...origin,signal_id:'ARTIFICIAL_UPDATE',reference_price:updated.reference_price,t0:T+MINUTE,rules_version:RULES_VERSION}};
  const after=selectOutcomeAnchor({analyses:[first,newer],publications,frozen_anchor:before.anchor,as_of_ts:T+2*MINUTE,wave_expires_ts:T+4*60*MINUTE});
  assert.equal(after.eligible,true);assert.deepEqual(after.anchor,before.anchor);assert.equal(after.summary_origin.t0,T);assert.equal(after.summary_origin.reference_price,120);assert.equal(after.summary_origin.rules_version,origin.rules_version);
  const outcome=evaluateOutcome({signal:after.summary_origin,as_of_ts:T+MINUTE});assert.equal(outcome.target_price,132);assert.equal(outcome.t0,T);assert.equal(outcome.reference_price,120);
});
test('J20 manual rejection exposes a dimensionless native activity comparison without an absolute quantity claim',()=>{
  const x=input(),f=x.facts.candles,key='BINGX|USDT_M|'+x.instrument.instrument_id+'|/openApi/swap/v3/quote/klines|volume|60000';
  f.unit='OHLC_USDT_NATIVE_REPORTED_QUANTITY';f.status='INCOMPLETE';f.coverage={time_qualified:true,relative_volume_qualified:true,volume_qualified:false,time_basis:CANDLE_CCXT_TIME_BASIS,
    comparison_kind:'SAME_NATIVE_REPORTED_QUANTITY',volume_comparison_key:key,native_quantity_unit:'UNKNOWN'};
  f.value=f.value.map(r=>({...r,volume_native:r.volume_base,native_volume_decimal:String(r.volume_base),volume_base:null,native_quantity_unit:'UNKNOWN',comparison_kind:'SAME_NATIVE_REPORTED_QUANTITY',volume_comparison_key:key}));
  x.facts.price.value=125;const a=analyzePump(x);assert.equal(a.ready,false);assert.match(a.manual_text,/абсолютная единица неизвестна/);assert.match(a.manual_text,/Активность текущего окна к исходному импульсу/);assert.doesNotMatch(a.manual_text,/объём.*USDT|USD.*объём/);assert.equal(a.card_text,null);
});
