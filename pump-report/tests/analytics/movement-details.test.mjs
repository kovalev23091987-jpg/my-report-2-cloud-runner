import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {analyzePump,RULES_VERSION} from '../../analytics/index.mjs';
import {describeMovementDetails,MOVEMENT_DETAILS_VERSION} from '../../analytics/movement.mjs';
import {movementDetailFindings,selectUserNarrative,movementStateText} from '../../analytics/presentation.mjs';
import {START_PROFILE} from '../../profile/start-v1.mjs';
import {INPUT_SCHEMA,createFact,emptyMap,CANDLE_NATIVE_RELATIVE_UNIT,CANDLE_NATIVE_RELATIVE_KIND,CANDLE_CCXT_TIME_BASIS,candleNativeComparisonKey} from '../../contracts/index.mjs';

const T=1800180000000,M=60000,clone=structuredClone,proof=[],out=new URL('../../handoffs/analytics/package-af/',import.meta.url);
const absolute=(raw,name)=>raw.replace(/from\s*'([^']+)'/g,(all,p)=>p.startsWith('.')?"from '"+pathToFileURL(resolve(dirname(name),p)).href+"'":all);
const oldModule=async(name)=>'data:text/javascript;base64,'+Buffer.from(absolute(await readFile(new URL(name+'.before.mjs.txt',out),'utf8'),resolve('pump-report/analytics',name))).toString('base64');
const oldMovement=await oldModule('movement.mjs'),oldPresentation=await oldModule('presentation.mjs');
const oldIndex=absolute(await readFile(new URL('index.mjs.before.mjs.txt',out),'utf8'),resolve('pump-report/analytics/index.mjs'))
  .replace(pathToFileURL(resolve('pump-report/analytics/movement.mjs')).href,oldMovement).replace(pathToFileURL(resolve('pump-report/analytics/presentation.mjs')).href,oldPresentation);
const {analyzePump:before}=await import('data:text/javascript;base64,'+Buffer.from(oldIndex).toString('base64'));
const instrument={instrument_id:'ARTIFICIAL:AF:币🚀-USDT',asset_id:'ARTIFICIAL:AF:币🚀',native_symbol:'币🚀-USDT',base:'币🚀',quote:'USDT',settle:'USDT',venue:'BINGX',market_type:'PERPETUAL',
  classification_status:'VERIFIED_CRYPTO',identity_evidence_ref:'ARTIFICIAL_AF_NOT_NATIVE',price_tick:0.01,quantity_step:0.000001,contract_multiplier:1};
function fact(kind,value,unit){return createFact({fact_id:'ARTIFICIAL_AF_'+kind,instrument_id:instrument.instrument_id,kind,value,unit,event_ts:T,received_ts:T,
  expires_ts:T+(START_PROFILE.freshness_ms[kind]??90000),source:'ARTIFICIAL_AF_ONLY',venue:'BINGX',origin:'OBSERVED',status:'USABLE',evidence_ref:'ARTIFICIAL_AF_'+kind});}
function frame(rows){return {schema_version:INPUT_SCHEMA,run_id:'ARTIFICIAL_AF_NEW_QUALIFICATION',run_purpose:'ACCEPTANCE_TEST',mode:'AUTO',analysis_ts:T,instrument:clone(instrument),previous_wave:null,
  liquidations:emptyMap('NOT_CHECKED','ARTIFICIAL_AF_WITHOUT_MAP'),facts:{price:fact('price',rows.at(-1).close,'USDT_PER_BASE'),candles:fact('candles',rows,'OHLC_USDT_VOLUME_BASE'),
    orderbook:fact('orderbook',{asks:[[112.1,1000],[112.2,1000]],bids:[[111.9,1000],[111.8,1000]]},'USDT_PRICE_BASE_QUANTITY')}};}
function rows({count=70,finish=132}={}){let last=100;return Array.from({length:count},(_,i)=>{
  const tail=i-(count-10),close=tail<0?100:tail<5?100+(tail+1)*2:110+(tail-4)*(finish-110)/5;
  const r={open_ts:T-(count-i)*M,close_ts:T-(count-i-1)*M,closed:true,open:last,high:Math.max(last,close)+0.1,low:Math.min(last,close)-0.1,close,
    volume_base:i>=count-5?20:10,turnover_quote:null};last=close;return r;});}
const measurement=(x,movement={pivots:[]})=>describeMovementDetails(x,x.facts.candles.value,movement,x.facts.price.value,START_PROFILE);
const window=(d,n)=>d.activity_windows.find(w=>w.window_ms===n*M);
function result(d,extra={}){return {activity:{details:d},wave_state:'CALM_PULLBACK',findings:[],reference_price:112,next_wave:{reclaim_level:105},plan_context:null,...extra};}
function safeNumbers(v){if(typeof v==='number')assert.ok(Number.isFinite(v));else if(v&&typeof v==='object')Object.values(v).forEach(safeNumbers);}
function native(x){const f=x.facts.candles,key=candleNativeComparisonKey(x.instrument);f.unit=CANDLE_NATIVE_RELATIVE_UNIT;
  f.coverage={time_qualified:true,relative_volume_qualified:true,volume_qualified:false,time_basis:CANDLE_CCXT_TIME_BASIS,comparison_kind:CANDLE_NATIVE_RELATIVE_KIND,volume_comparison_key:key,
    native_quantity_unit:'UNKNOWN',base_volume_qualified:false,quote_volume_qualified:false,turnover_quote_qualified:false,absolute_base_amount_qualified:false,absolute_USD_amount_qualified:false,independent_vendor_guarantee_claimed:false};
  for(const r of f.value){r.volume_native=r.volume_base;r.native_volume_decimal=String(r.volume_base);r.volume_base=null;r.turnover_quote=null;r.native_quantity_unit='UNKNOWN';r.comparison_kind=CANDLE_NATIVE_RELATIVE_KIND;r.volume_comparison_key=key;}return x;}
function coreFrame(){
  const tail=[102,105,110,115,117,118,117.5,116,115,114,113.5,113,112,111,114],r=[];let previous=100;
  for(let i=0;i<121;i++){const close=i<106?100+2*Math.sin(i*Math.PI/5):tail[i-106];r.push({open_ts:T-(121-i)*M,close_ts:T-(120-i)*M,closed:true,open:previous,
    high:Math.max(previous,close)+0.1,low:Math.min(previous,close)-0.1,close,volume_base:i>=106&&i<=111||i>=116?3000:i>111?300:1000,turnover_quote:null});previous=close;}
  const x=frame(r);x.facts.orderbook.value={asks:[[114.1,1000],[114.2,1000]],bids:[[113.9,1000],[113.8,1000]]};return x;
}
const coreFields=['schema_version','contract_version','rules_version','profile_version','run_id','mode','run_purpose','instrument','analysis_ts','reference_price','wave_id','wave_state','previous_wave','next_wave',
  'current_threshold_passed','automatic_eligible','ready','status','reasons','plan','liquidity','liquidations','probability','notification_eligibility','fact_ids','growth_windows','growth_proof','day_growth_diagnostic'];
function unchangedCore(x,a){const b=before(x);for(const k of coreFields)assert.deepEqual(a[k],b[k],k);if(a.activity){const {details,...rest}=a.activity;assert.deepEqual(rest,b.activity);}return b;}

test('AF01 both configured3m5m windows use exact closed ranges and exclude the current sample from full baselines',()=>{
  const x=frame(rows()),frozen=clone(x),d=measurement(x),five=window(d,5),three=window(d,3);assert.equal(d.version,MOVEMENT_DETAILS_VERSION);assert.equal(d.status,'OBSERVED_CLOSED_WINDOW_MEASUREMENTS');
  assert.deepEqual(d.activity_windows.map(w=>w.window_ms),[180000,300000]);assert.equal(five.volume_counter,100);assert.equal(five.previous_volume_counter,50);assert.equal(five.baseline_median,50);assert.equal(five.baseline_windows,12);assert.equal(five.current_to_baseline_ratio,2);
  assert.equal(three.volume_counter,60);assert.equal(three.previous_volume_counter,50);assert.equal(three.baseline_median,30);assert.equal(three.baseline_windows,20);assert.equal(three.current_to_baseline_ratio,2);
  assert.ok(Math.abs(five.price_return_pct-20)<1e-10);assert.ok(Math.abs(five.previous_price_return_pct-10)<1e-10);assert.ok(Math.abs(five.speed_change_pct_per_min-2)<1e-10);assert.equal(five.positive_growth_accelerated,true);
  assert.equal(d.changes_signal_gates,false);assert.equal(d.provenance.known_ts,T);assert.deepEqual(x,frozen);safeNumbers(d);proof.push({case:'AF01',windows:[3,5],baseline_windows:[20,12],current_excluded:true});
});
test('AF02 zero missing short-history and native quantities keep explicit nulls and units without turnover fabrication',()=>{
  const zero=frame(rows());zero.facts.candles.value.forEach(r=>r.volume_base=0);const z=measurement(zero);assert.equal(window(z,5).current_to_previous_volume_ratio,null);assert.equal(window(z,5).current_to_baseline_ratio,null);assert.equal(window(z,5).current_to_baseline_ratio_reason,'VOLUME_BASELINE_ZERO_OR_UNKNOWN');
  const gap=frame(rows());gap.facts.candles.value.splice(-2,1);const g=measurement(gap);for(const w of g.activity_windows){assert.equal(w.volume_counter,null);assert.equal(w.reason,'CURRENT_CLOSED_WINDOW_UNAVAILABLE');}
  const short=measurement(frame(rows({count:8})));assert.equal(window(short,3).baseline_status,'SHORT_HISTORY');assert.equal(window(short,5).current_to_previous_volume_ratio,null);assert.equal(window(short,5).previous_volume_counter,null);
  const n=measurement(native(frame(rows())));assert.equal(window(n,3).volume_basis.field,'volume_native');assert.equal(window(n,3).volume_basis.unit,'UNKNOWN_NATIVE_UNIT');assert.equal(window(n,3).current_to_baseline_ratio,2);assert.equal(window(n,5).current_to_baseline_ratio,2);safeNumbers(z);safeNumbers(g);safeNumbers(short);safeNumbers(n);
  const extreme=frame(rows());extreme.facts.candles.value.forEach((r,i)=>r.volume_base=i>=65?1e300:1e-300);const huge=window(measurement(extreme),5);assert.equal(huge.current_to_previous_volume_ratio,null);assert.equal(huge.current_to_previous_volume_ratio_reason,'CURRENT_PREVIOUS_VOLUME_RATIO_NOT_FINITE');safeNumbers(huge);
  proof.push({case:'AF02',zero_not_infinity:true,missing_not_zero:true,short_history_explicit:true,native_no_absolute_unit_claim:true});
});
test('AF03 adjacent equal-window acceleration and effort/progress are factual observations with no causal absorption or new gate',()=>{
  const d=measurement(frame(rows({finish:112.2}))),five=window(d,5);assert.equal(five.volume_at_least_previous_with_less_growth,true);assert.equal(five.positive_growth_accelerated,false);
  const a=result(d);a.findings=movementDetailFindings(a,['ARTIFICIAL_AF_candles']);assert.ok(a.findings.some(f=>f.code==='PRICE_ACTIVITY_DECELERATION'));for(const f of a.findings){assert.equal(f.causation_proven,false);assert.doesNotMatch(f.text,/поглощ|игрок|точно будет|шорт/);}
  const rising=result(measurement(frame(rows())));rising.findings=movementDetailFindings(rising);assert.ok(rising.findings.some(f=>f.code==='CLOSED_WINDOW_ACCELERATION'));assert.equal(d.changes_signal_gates,false);
  proof.push({case:'AF03',adjacent_window_only:true,effort_not_causation:true,no_classifier_gate_changed:true});
});
test('AF04 failed-high observations require a preknown confirmed level and separate closed bars, never future pivots',()=>{
  const x=frame(rows());for(const r of x.facts.candles.value.slice(-8)){Object.assign(r,{open:104,close:104,high:104.5,low:103});}for(const i of [66,68])x.facts.candles.value[i].high=106;x.facts.price.value=104;
  const level={kind:'HIGH',price:105,event_ts:T-10*M,known_ts:T-8*M,fact_id:'ARTIFICIAL_AF_PIVOT'},m={pivots:[level],impulse:{start_ts:T-60*M}},d=measurement(x,m),f=d.failed_high_tests;
  assert.equal(f.failed_closed_bars,2);assert.equal(f.repeated,true);assert.equal(f.full_wave_history_proven,false);assert.equal(f.intrabar_attempt_count_unknown,true);assert.ok(f.first_test_interval.start_ts>=level.known_ts);
  assert.equal(measurement(x,{...m,pivots:[{...level,known_ts:T-2*M}]}).failed_high_tests.failed_closed_bars,1);
  assert.equal(measurement(x,{...m,pivots:[{...level,known_ts:T+M}]}).failed_high_tests.level,null);
  const r=result(d,{reference_price:104});r.findings=[{code:r.wave_state,text:'ARTIFICIAL_STAGE'},...movementDetailFindings(r)];assert.ok(r.findings.some(f=>f.code==='FAILED_PREKNOWN_HIGH_TESTS'));assert.equal(selectUserNarrative(r).reasons.length,2);assert.ok(selectUserNarrative(r).warning);
  const above=result(measurement({...x,facts:{...x.facts,price:{...x.facts.price,value:106}}},m));assert.ok(!movementDetailFindings(above).some(f=>f.code==='FAILED_PREKNOWN_HIGH_TESTS'));
  proof.push({case:'AF04',distinct_bars:2,preknown_only:true,no_full_wave_count_claim:true,current_break_above_suppresses_stale_failure_warning:true});
});
test('AF05 reclaim and return magnitude keep OHLC time intervals and unknown same-bar speed upper bound',()=>{
  const values=[[110,120,109,119],[119,119,99,100],[100,108,100,106],[106,112,105.5,110],[110,113,109,112]],r=values.map(([open,high,low,close],i)=>({open_ts:T-(5-i)*M,close_ts:T-(4-i)*M,closed:true,open,high,low,close,volume_base:10,turnover_quote:null}));
  const x=frame(r),m={pivots:[],peak_price:120,reclaim_level:105,next_wave:{peak_event_ts:r[0].close_ts,reclaim_breached:true},impulse:{start_ts:r[0].open_ts}},d=measurement(x,m),p=d.pullback_return;
  assert.equal(p.path_complete_in_supplied_rows,true);assert.equal(p.low_price,99);assert.equal(p.first_reclaim_close_ts,T-2*M);assert.equal(p.reclaim_after_last_breach_close_ts,T-2*M);
  assert.equal(p.return_speed_bounds.duration_min_ms,3*M);assert.equal(p.return_speed_bounds.duration_max_ms,4*M);assert.ok(Math.abs(p.closed_return_from_low_pct-100*(112/99-1))<1e-10);
  assert.ok(p.return_speed_bounds.lower_pct_per_min<=p.return_speed_bounds.upper_pct_per_min);assert.equal(p.fall_speed_bounds.duration_min_ms,4*M);assert.equal(p.fall_speed_bounds.duration_max_ms,5*M);
  const same=clone(x);same.facts.candles.value.at(-1).low=98;const q=measurement(same,m).pullback_return;assert.equal(q.return_speed_bounds.duration_min_ms,0);assert.equal(q.return_speed_bounds.upper_pct_per_min,null);assert.equal(q.return_speed_bounds.upper_reason,'INTRABAR_EXTREME_TIME_UNKNOWN');
  const missing=clone(x);missing.facts.candles.value.splice(2,1);const noPath=measurement(missing,m).pullback_return;assert.equal(noPath.closed_return_from_low_pct,null);assert.equal(noPath.return_speed_bounds,null);assert.equal(noPath.reason,'POST_PEAK_CLOSED_PATH_UNAVAILABLE');
  const current=clone(x);current.facts.price.value=104;const rr=result(measurement(current,m),{wave_state:'SHARP_PULLBACK_RECLAIMED',reference_price:104,next_wave:{reclaim_level:105}});rr.findings=[{code:rr.wave_state,text:movementStateText(rr)},...movementDetailFindings(rr)];assert.equal(selectUserNarrative(rr).warning,'цена снова ниже уровня возврата');safeNumbers(p);safeNumbers(q);
  proof.push({case:'AF05',OHLC_extreme_time_bounds:true,same_bar_upper_unknown:true,missing_path_unknown:true,closed_reclaim_and_live_price_distinct:true});
});
test('AF06 actual core consumes both-window observations and factual card while before numeric core plan and wave stay identical',()=>{
  const traces=[];for(const mode of ['AUTO','MANUAL'])for(const nativeVolume of [false,true]){
    const x=coreFrame();x.mode=mode;if(nativeVolume)native(x);const original=clone(x),a=analyzePump(x);unchangedCore(x,a);assert.equal(a.ready,true,JSON.stringify(a.reasons));assert.equal(a.rules_version,RULES_VERSION);assert.ok(a.plan.potential_pct.minimum>=10);assert.equal(a.probability.value_pct,null);
    assert.deepEqual(a.activity.details.activity_windows.map(w=>w.window_ms),[180000,300000]);assert.ok(a.findings.some(f=>f.code==='CLOSED_WINDOW_ACCELERATION'));assert.ok(a.user_narrative.reasons.some(f=>f.code==='CLOSED_WINDOW_ACCELERATION'));assert.ok(a.user_narrative.reasons.length<=2);
    assert.match(a.card_text,/мин ускорился/);assert.match(a.card_text,/Карта ликвидаций недоступна/);assert.match(a.card_text,/вероятность пока не оценена/);assert.match(a.card_text,/ТЕСТ — приёмочная проверка/);assert.doesNotMatch(a.card_text,/Размер: до|BTC|ETH|поглощ|игрок|точно будет/);assert.ok(a.card_text.length<=4096);assert.ok(a.card_text.isWellFormed());assert.deepEqual(x,original);
    traces.push({mode,native_volume:nativeVolume,state:a.wave_state,ready:a.ready,minimum_plan_pct:a.plan.potential_pct.minimum,reasons:a.user_narrative.reasons.map(f=>f.code)});
  }proof.push({case:'AF06',new_artificial_full_core_traces:traces,before_numeric_core_unchanged:true});
});
test('AF07 owner minimum liquidity mandatory facts and noBTCETH refusals remain identical to before on new affected controls',()=>{
  const controls=[];
  for(const [name,mutate]of [['BTC',x=>x.instrument.base='BTC'],['ETH',x=>x.instrument.base='ETH'],['stale_book',x=>x.facts.orderbook.event_ts=T-15001],['unknown_book',x=>x.facts.orderbook.unit=null],['no_candles',x=>x.facts.candles.status='INCOMPLETE'],['zero_volume',x=>x.facts.candles.value.forEach(r=>r.volume_base=0)]]){
    const x=coreFrame();mutate(x);const a=analyzePump(x);unchangedCore(x,a);assert.equal(a.ready,false,name);assert.equal(a.card_text,null);controls.push({name,status:a.status,reasons:a.reasons});
  }proof.push({case:'AF07',controls,no_gate_relaxed:true});
});
test('AF08 absent observation evidence or profile is explicit and cannot create an extra ready gate or an unsupported finding',()=>{
  const x=coreFrame();x.facts.candles.evidence_ref=null;const a=analyzePump(x);unchangedCore(x,a);assert.equal(a.ready,true);assert.equal(a.activity.details.status,'UNAVAILABLE');assert.equal(a.activity.details.reason,'CLOSED_ROW_SOURCE_CLOCK_OR_EVIDENCE_UNBOUND');assert.ok(!a.findings.some(f=>f.observations_version));
  const y=coreFrame(),p={...START_PROFILE,activity_windows_ms:[180000]},q=analyzePump(y,p);assert.equal(q.activity.details.reason,'ACTIVITY_WINDOWS_PROFILE_UNQUALIFIED');assert.equal(q.ready,before(y,p).ready);
  const b=coreFrame();b.facts.candles.received_ts=T+1;const d=measurement(b);assert.equal(d.status,'UNAVAILABLE');assert.equal(d.activity_windows.length,0);safeNumbers(a);safeNumbers(q);
  proof.push({case:'AF08',unbound_observation_does_not_publish_new_fact:true,missing_profile_not_new_signal_gate:true,new_thresholds:0});
});
after(async()=>{await writeFile(new URL('new-qualification-cases.json',out),JSON.stringify({schema:'AF_NEW_AFFECTED_QUALIFICATION_V1',evidence:'NEW_ARTIFICIAL_ONLY_NOT_NATIVE_OR_A_REAL_SIGNAL',old_tests_replayed:false,native_HTTP:0,SQL:0,Telegram:0,results:proof},null,2)+'\n');});
