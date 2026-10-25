import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createPumpSources} from '../../sources/index.mjs';
import {createNativeRelativeCandleQualification} from '../../sources/native-relative-qualification.mjs';
import {analyzePump,evaluateOutcome} from '../../analytics/index.mjs';
import {closedCandles,median} from '../../analytics/math.mjs';
import {CANDLE_NATIVE_RELATIVE_UNIT,CANDLE_NATIVE_RELATIVE_KIND,CANDLE_CCXT_TIME_BASIS,candleNativeComparisonKey,CONTRACT_VERSION} from '../../contracts/index.mjs';
import {input,T,MINUTE,path,signal,zone,fact} from './fixtures.mjs';

function native(){
  const x=input(),f=x.facts.candles,key=candleNativeComparisonKey(x.instrument,MINUTE);f.unit=CANDLE_NATIVE_RELATIVE_UNIT;f.status='INCOMPLETE';
  f.coverage={time_qualified:true,volume_qualified:false,relative_volume_qualified:true,time_basis:CANDLE_CCXT_TIME_BASIS,time_evidence_ref:'ARTIFICIAL_PINNED_CONSUMER_REVIEW',semantics_owner_ref:'ARTIFICIAL_OWNER_ACCEPTED_SCOPE',base_volume_qualified:false,quote_volume_qualified:false,
    comparison_kind:CANDLE_NATIVE_RELATIVE_KIND,volume_comparison_key:key,native_quantity_unit:'UNKNOWN',absolute_base_amount_qualified:false,absolute_USD_amount_qualified:false,independent_vendor_guarantee_claimed:false};
  f.value=f.value.map(r=>({...r,volume_native:r.volume_base,native_volume_decimal:String(r.volume_base),volume_base:null,turnover_quote:null,native_quantity_unit:'UNKNOWN',comparison_kind:CANDLE_NATIVE_RELATIVE_KIND,volume_comparison_key:key}));return x;
}
function comparePlan(a,b){assert.deepEqual(a.plan,b.plan);assert.equal(a.wave_state,b.wave_state);assert.equal(a.automatic_eligible,b.automatic_eligible);assert.equal(a.current_threshold_passed,b.current_threshold_passed);}
test('I01 owner-approved dimensionless native comparison qualifies the same plan without inventing BASE/USDT volume',async()=>{
  const x=native(),before=structuredClone(x),a=analyzePump(x),base=analyzePump(input());assert.equal(a.ready,true,JSON.stringify(a.reasons));comparePlan(a,base);assert.equal(a.contract_version,CONTRACT_VERSION);
  assert.equal(a.activity.impulse.field,'volume_native');assert.equal(a.activity.impulse.unit,'UNKNOWN_NATIVE_UNIT');assert.equal(a.activity.impulse.ratio_unit,'RATIO');assert.equal(a.activity.ratio_unit,'RATIO');assert.equal(a.activity.impulse.ratio,base.activity.impulse.ratio);
  assert.equal(a.activity.volume_basis.comparison_key,candleNativeComparisonKey(x.instrument,MINUTE));assert.equal(a.activity.candle_time_basis,CANDLE_CCXT_TIME_BASIS);assert.deepEqual(a.activity.candle_provenance.coverage,x.facts.candles.coverage);assert.match(a.card_text,/абсолютная единица количества неизвестна/);assert.equal(a.probability.value_pct,null);assert.deepEqual(x,before);
  await writeFile(new URL('../../handoffs/analytics/package-i/native-analysis.json',import.meta.url),JSON.stringify({evidence:'ARTIFICIAL_RELATIVE_VOLUME_CONTRACT_ONLY',analysis:a},null,2)+'\n');await writeFile(new URL('../../handoffs/analytics/package-i/native-card.txt',import.meta.url),a.card_text+'\n');
});
test('I02 named native unit needs all time/relative/absolute-unknown coverage flags even with USABLE status',()=>{
  for(const edit of [f=>delete f.coverage.relative_volume_qualified,f=>f.coverage.relative_volume_qualified=false,f=>f.coverage.time_qualified=false,f=>f.coverage.volume_qualified=true,f=>f.coverage.time_basis='EXCHANGE_GUARANTEED',f=>f.coverage.base_volume_qualified=true]){
    const x=native();x.facts.candles.status='USABLE';edit(x.facts.candles);assert.equal(analyzePump(x).ready,false);
  }
});
test('I03 unknown absolute mode never consumes native quantity as an implicit BASE fallback',()=>{
  const x=native();x.facts.candles.unit='OHLC_USDT_VOLUME_BASE';x.facts.candles.status='USABLE';const a=analyzePump(x);assert.equal(a.ready,false);assert.equal(a.activity.impulse,null);
});
test('I04 rows preserve exact decimal strings and native metadata without filling volume_base',()=>{
  const x=native(),r=x.facts.candles.value[0];r.native_volume_decimal='001000.000';const q=closedCandles(x.facts.candles.value,T,MINUTE,{native_comparison_key:candleNativeComparisonKey(x.instrument,MINUTE)});
  assert.equal(q.reason,null);assert.equal(q.rows[0].native_volume_decimal,'001000.000');assert.equal(q.rows[0].volume_native,1000);assert.equal(q.rows[0].volume_base,null);assert.equal(q.rows[0].turnover_quote,null);assert.equal(q.rows[0].comparison_kind,CANDLE_NATIVE_RELATIVE_KIND);
});
test('I05 cross-instrument, other-route, other-field or interval comparison keys fail before ratios',()=>{
  for(const change of [k=>k.replace(xid(),'OTHER_ASSET'),k=>k.replace('/v3/','/v2/'),k=>k.replace('|volume|','|turnover|'),k=>k.replace('|60000','|300000')]){
    const x=native();x.facts.candles.value.at(-1).volume_comparison_key=change(candleNativeComparisonKey(x.instrument,MINUTE));const a=analyzePump(x);assert.equal(a.ready,false);assert.ok(a.reasons.includes('NATIVE_CANDLE_VOLUME_SCOPE_INVALID'));
  }
});
function xid(){return input().instrument.instrument_id;}
test('I06 a BASE/quote row inserted in native current or baseline windows cannot be silently mixed',()=>{
  for(const offset of [1,8,30,70]){const x=native(),r=x.facts.candles.value.at(-offset);r.volume_base=r.volume_native;r.turnover_quote=r.volume_native*r.close;const a=analyzePump(x);assert.equal(a.ready,false);assert.ok(a.reasons.includes('NATIVE_CANDLE_VOLUME_SCOPE_INVALID'));}
});
test('I07 missing, negative, nonfinite, decimal-mismatched or known-unit native fields are rejected',()=>{
  for(const edit of [r=>delete r.volume_native,r=>r.volume_native=-1,r=>r.volume_native=Infinity,r=>r.native_volume_decimal='',r=>r.native_volume_decimal='not-decimal',r=>r.native_volume_decimal='999',r=>r.native_quantity_unit='BASE_ASSET',r=>r.comparison_kind='SAME_TICKER']){
    const x=native();edit(x.facts.candles.value.at(-1));const a=analyzePump(x);assert.equal(a.ready,false);assert.ok(a.reasons.includes('NATIVE_CANDLE_VOLUME_SCOPE_INVALID'));
  }
});
test('I08 zero background produces null RATIO with reason rather than infinite activity',()=>{
  const x=native();for(const [i,r] of x.facts.candles.value.entries()){r.volume_native=i<116?0:3000;r.native_volume_decimal=String(r.volume_native);}
  const a=analyzePump(x);assert.equal(a.ready,false);assert.equal(a.status,'WAITING');assert.ok(a.reasons.includes('VOLUME_BASELINE_ZERO_OR_UNKNOWN'));assert.equal(a.activity.volume_diagnostics.ratio,null);assert.equal(a.activity.volume_diagnostics.ratio_unit,'RATIO');
});
test('I09 zero current native activity still fails the mandatory current-volume gate',()=>{
  const x=native();for(const r of x.facts.candles.value.slice(-5)){r.volume_native=0;r.native_volume_decimal='0';}const a=analyzePump(x);assert.equal(a.ready,false);assert.ok(a.reasons.includes('CURRENT_VOLUME_REQUIRED'));
});
test('I10 saved BASE wave cannot be converted to native or reanchored merely because source units changed',()=>{
  const base=analyzePump(input()),x=native();x.previous_wave=structuredClone(base.next_wave);const before=structuredClone(x.previous_wave),a=analyzePump(x);
  assert.equal(a.ready,false);assert.equal(a.status,'WAITING');assert.ok(a.reasons.includes('WAVE_VOLUME_COMPARISON_BASIS_CHANGED'));assert.equal(a.wave_id,base.wave_id);assert.deepEqual(a.next_wave,before);assert.equal(a.next_wave.created_ts,base.next_wave.created_ts);assert.equal(a.next_wave.expires_ts,base.next_wave.expires_ts);
});
test('I11 saved native wave cannot convert back to BASE or lose its original key',()=>{
  const first=analyzePump(native()),x=input();x.previous_wave=structuredClone(first.next_wave);const a=analyzePump(x);assert.equal(a.ready,false);assert.equal(a.wave_id,first.wave_id);assert.deepEqual(a.next_wave,first.next_wave);assert.ok(a.reasons.includes('WAVE_VOLUME_COMPARISON_BASIS_CHANGED'));
});
test('I12 same native basis preserves retained qualification, baseline and wave lifetime after retreat',()=>{
  const x=native(),first=analyzePump(x);x.previous_wave=structuredClone(first.next_wave);x.facts.price.value=105;const last=x.facts.candles.value.at(-1);last.close=105;last.low=104.9;
  const a=analyzePump(x);assert.equal(a.ready,true,JSON.stringify(a.reasons));assert.equal(a.current_threshold_passed,false);assert.equal(a.automatic_eligible,true);assert.equal(a.wave_id,first.wave_id);assert.deepEqual(a.next_wave.impulse,first.next_wave.impulse);assert.equal(a.next_wave.expires_ts,first.next_wave.expires_ts);
});
test('I13 a saved native comparison key changed in retained state waits without a new wave',()=>{
  const x=native(),first=analyzePump(x);x.previous_wave=structuredClone(first.next_wave);x.previous_wave.impulse.comparison_key+='CHANGED';const a=analyzePump(x);assert.equal(a.ready,false);assert.equal(a.wave_id,first.wave_id);assert.equal(a.next_wave.expires_ts,first.next_wave.expires_ts);assert.ok(a.reasons.includes('WAVE_VOLUME_COMPARISON_BASIS_CHANGED'));
});
test('I14 gaps, stale bars and unclosed future bars cannot lower the former activity/freshness requirements',()=>{
  const gap=native();gap.facts.candles.value.splice(-3,1);assert.equal(analyzePump(gap).ready,false);
  const stale=native();stale.facts.candles.event_ts=T-91000;assert.equal(analyzePump(stale).ready,false);
  const x=native(),before=analyzePump(x),r=x.facts.candles.value.at(-1);x.facts.candles.value.push({...r,open_ts:T,close_ts:T+MINUTE,volume_native:1e100,native_volume_decimal:'1e100'});assert.deepEqual(analyzePump(x),before);
});
test('I15 ratio mode does not bypass price, book or independent-plan qualification',()=>{
  for(const edit of [x=>x.facts.price.unit='MARK_UNKNOWN',x=>x.facts.orderbook.unit='CONTRACTS',x=>x.facts.price.value=125]){const x=native();edit(x);assert.equal(analyzePump(x).ready,false);}
});
test('I16 old genuine BASE and quote comparisons retain field/unit and numerical ratios',()=>{
  const x=input(),base=analyzePump(x);assert.equal(base.ready,true);assert.equal(base.activity.impulse.field,'volume_base');assert.equal(base.activity.impulse.unit,'BASE');
  for(const r of x.facts.candles.value){r.turnover_quote=r.volume_base*100;r.volume_base=null;}const quote=analyzePump(x);assert.equal(quote.ready,true);assert.equal(quote.activity.impulse.field,'turnover_quote');assert.equal(quote.activity.impulse.unit,'USDT');assert.equal(quote.activity.impulse.ratio,base.activity.impulse.ratio);comparePlan(quote,base);
});
test('I17 overflowing native sums do not create Infinity/NaN activity; finite large medians remain finite',()=>{
  const x=native();for(const r of x.facts.candles.value){r.volume_native=1e308;r.native_volume_decimal='1e308';}const a=analyzePump(x);assert.equal(a.ready,false);assert.equal(a.activity.current_volume,null);assert.ok(!JSON.stringify(a.activity).includes('Infinity'));assert.equal(median([1e308,1e308]),1e308);
});
test('I18 valid native metadata does not alter the price-only four-hour outcome',()=>{
  const rows=path();const key=candleNativeComparisonKey(input().instrument,MINUTE),nativeRows=rows.map(r=>({...r,volume_native:1,native_volume_decimal:'1',volume_base:null,native_quantity_unit:'UNKNOWN',comparison_kind:CANDLE_NATIVE_RELATIVE_KIND,volume_comparison_key:key}));
  assert.deepEqual(evaluateOutcome({signal:signal(),candles:nativeRows,as_of_ts:T+4*60*MINUTE}),evaluateOutcome({signal:signal(),candles:rows,as_of_ts:T+4*60*MINUTE}));
});
test('I19 richer absolute quote data cannot silently change a retained BASE baseline',()=>{
  const x=input(),first=analyzePump(x);x.previous_wave=structuredClone(first.next_wave);for(const r of x.facts.candles.value)r.turnover_quote=r.volume_base*100;const a=analyzePump(x);assert.equal(a.ready,true);assert.equal(a.activity.volume_basis.field,'volume_base');assert.deepEqual(a.next_wave.impulse,first.next_wave.impulse);
});
test('I20 an absolute quote-to-BASE switch waits without extending the old wave',()=>{
  const x=input();for(const r of x.facts.candles.value){r.turnover_quote=r.volume_base*100;r.volume_base=null;}const first=analyzePump(x),y=input();y.previous_wave=structuredClone(first.next_wave);const a=analyzePump(y);assert.equal(a.ready,false);assert.equal(a.wave_id,first.wave_id);assert.equal(a.next_wave.expires_ts,first.next_wave.expires_ts);assert.ok(a.reasons.includes('WAVE_VOLUME_COMPARISON_BASIS_CHANGED'));
});
test('I21 coverage scope mismatch or an asserted absolute/vendor guarantee cannot bypass native row guards',()=>{
  for(const edit of [c=>c.volume_comparison_key+='OTHER',c=>c.comparison_kind='OTHER',c=>c.absolute_base_amount_qualified=true,c=>c.absolute_USD_amount_qualified=true,c=>c.independent_vendor_guarantee_claimed=true,c=>c.native_quantity_unit='BASE']){const x=native();edit(x.facts.candles.coverage);assert.equal(analyzePump(x).ready,false);}
});
test('I22 real SOURCE normalization joins the analytics consumer with null absolutes and retained clock evidence',async()=>{
  const x=input(),rows=x.facts.candles.value,qualification=createNativeRelativeCandleQualification(x.instrument);let calls=0;
  const body={code:0,data:rows.map(r=>({time:r.open_ts,open:String(r.open),high:String(r.high),low:String(r.low),close:String(r.close),volume:String(r.volume_base)}))};
  const sources=createPumpSources({identityRegistry:[{instrument:x.instrument,native_contract_id:'ARTIFICIAL_ONLY',qualifications:{candles:qualification}}],clock:()=>T+5000,broker:{async request(){calls++;return {ok:true,status:200,data:body,received_ts:T+1000,receipt_id:'ARTIFICIAL_CONNECTED_SOURCE_ONLY',cache_hit:false};}}});
  const core=await sources.getCore({instrument:x.instrument,only_facts:['candles']});assert.equal(core.facts.candles.status,'USABLE');assert.equal(core.facts.candles.unit,CANDLE_NATIVE_RELATIVE_UNIT);
  x.facts.candles=core.facts.candles;x.analysis_ts=T+5000;const a=analyzePump(x);assert.equal(a.ready,true,JSON.stringify(a.reasons));assert.equal(calls,1,'in-memory source broker only, no HTTP');assert.equal(a.activity.impulse.unit,'UNKNOWN_NATIVE_UNIT');
  const normalized=closedCandles(core.facts.candles.value,x.analysis_ts,MINUTE,{native_comparison_key:candleNativeComparisonKey(x.instrument,MINUTE)});assert.equal(normalized.rows[0].native_time,rows[0].open_ts);assert.equal(normalized.rows[0].native_time_semantics,'OPEN_TIME');assert.equal(normalized.rows[0].time_evidence_ref,qualification.time.evidence_ref);assert.equal(normalized.rows[0].volume_evidence_ref,qualification.volume.evidence_ref);
});
test('I23 zero saved impulse denominator returns null with reason and preserves original lifetime',()=>{
  const x=native(),first=analyzePump(x);x.previous_wave=structuredClone(first.next_wave);x.previous_wave.impulse.volume=0;const a=analyzePump(x);assert.equal(a.ready,false);assert.equal(a.status,'WAITING');assert.equal(a.activity.current_to_impulse_volume_ratio,null);assert.equal(a.activity.current_to_impulse_volume_ratio_reason,'IMPULSE_VOLUME_ZERO_OR_UNKNOWN');assert.equal(a.wave_id,first.wave_id);assert.equal(a.next_wave.expires_ts,first.next_wave.expires_ts);
});
test('I24 native-relative warning coexists with a maximum complete Telegram presentation',()=>{
  const x=native(),first=analyzePump(x),long='LABEL_'.repeat(40);x.previous_wave=structuredClone(first.next_wave);x.previous_wave.confirmed_pivots.push(...[104,107,110].map((price,i)=>({kind:'HIGH',price,event_ts:T-(30-i)*MINUTE,known_ts:T-(27-i)*MINUTE,fact_id:'ARTIFICIAL_NATIVE_PLAN_'+i})));
  const zones=[];for(let i=0;i<3;i++)for(const side of ['U','D']){const low=side==='U'?113+i*15:104-i*12;for(let j=0;j<2;j++)zones.push(zone(side+i+j,low+j*0.1,low+0.2+j*0.1,{source:long,primary_provider:side+i,venue:long,model_id:long,model_version:long,magnitude_unit:'RELATIVE_INTENSITY',relative_scale:{scale_id:long,model_version:long},limitations:['PARTIAL_SOURCE_COVERAGE','OVERLAPPING_COVERAGE_NOT_SUMMED']}));}
  x.liquidations={status:'PARTIAL',zones,coverage:null};x.facts.trades=fact('trades',[{event_ts:T,price:112,quantity_base:2,aggressor_side:'BUY'}],'USDT_PRICE_BASE_QUANTITY');x.facts.open_interest=fact('open_interest',1000,'CONTRACTS');x.facts.funding=fact('funding',{rate:0.001,period_ms:28800000},'RATE_FRACTION_PER_ACTUAL_PERIOD');for(const k of ['trades','open_interest','funding']){x.facts[k].source=long;x.facts[k].venue=long;}
  const a=analyzePump(x);assert.equal(a.ready,true);assert.equal(a.plan.entry_zones.length,3);assert.equal(a.liquidations.zones_up.length,3);assert.equal(a.liquidations.zones_down.length,3);assert.ok(a.card_text.length<=4096);assert.match(a.card_text,/абсолютная единица количества неизвестна/);assert.match(a.card_text,/Карта неполная/);assert.match(a.card_text,/Фиксация всей позиции/);assert.match(a.card_text,/пересмотреть план/);
});
test('I25 positive but numerically overflowing ratios are null with an honest numeric reason',()=>{
  const x=native();for(const [i,r] of x.facts.candles.value.entries()){r.volume_native=i<116?1e-300:1e100;r.native_volume_decimal=String(r.volume_native);}const a=analyzePump(x);assert.equal(a.ready,false);assert.equal(a.activity.volume_diagnostics.ratio,null);assert.equal(a.activity.volume_diagnostics.ratio_reason,'VOLUME_RATIO_NOT_FINITE');
  const y=native(),first=analyzePump(y);y.previous_wave=structuredClone(first.next_wave);y.previous_wave.impulse.volume=1e-300;for(const r of y.facts.candles.value.slice(-5)){r.volume_native=1e100;r.native_volume_decimal='1e100';}
  const b=analyzePump(y);assert.equal(b.activity.current_to_impulse_volume_ratio,null);assert.equal(b.activity.current_to_impulse_volume_ratio_reason,'CURRENT_TO_IMPULSE_RATIO_NOT_FINITE');
});
test('I26 an expired BASE wave is not revived by switching to inactive native-relative observations',()=>{
  const first=analyzePump(input()),x=native(),later=T+4*60*MINUTE+MINUTE,delta=later-T;x.previous_wave=structuredClone(first.next_wave);x.analysis_ts=later;
  for(const f of Object.values(x.facts)){f.event_ts=later;f.received_ts=later;f.expires_ts=later+(f.kind==='orderbook'?15000:90000);}
  x.facts.price.value=100;for(const r of x.facts.candles.value){r.open_ts+=delta;r.close_ts+=delta;r.open=100;r.close=100;r.high=100.1;r.low=99.9;r.volume_native=1000;r.native_volume_decimal='1000';}
  const a=analyzePump(x);assert.equal(a.ready,false);assert.equal(a.wave_state,'EXPIRED');assert.equal(a.wave_id,first.wave_id);assert.equal(a.next_wave.created_ts,first.next_wave.created_ts);assert.equal(a.next_wave.expires_ts,first.next_wave.expires_ts);
});
