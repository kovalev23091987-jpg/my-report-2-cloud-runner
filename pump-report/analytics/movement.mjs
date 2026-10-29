import {positive, finite, validTime, CANDLE_NATIVE_RELATIVE_UNIT, CANDLE_NATIVE_RELATIVE_KIND, candleNativeComparisonKey, OWNER_MIN_PLAN_POTENTIAL_PCT} from '../contracts/index.mjs';
import {median, sum, pct, growthAtLeast, windowRows, completeInterval} from './math.mjs';
import {proposeColdStructuralBase} from './cold-first-structural-base.mjs';

export function growthWindows(rows, ticker, profile, observedDay=null) {
  const end=rows.at(-1)?.close_ts, out=[];
  for(const duration of [...profile.automatic_growth.short_windows_ms,86400000]){
    const xs=end?windowRows(rows,end,duration,profile.candle_interval_ms):null;
    if(duration===86400000&&observedDay?.usable){out.push(structuredClone(observedDay.window));
    }else if(xs){const start=xs[0].open,finish=xs.at(-1).close,threshold=duration===86400000?profile.automatic_growth.day_pct:profile.automatic_growth.short_pct;
      out.push({window_ms:duration,start_ts:end-duration,end_ts:end,start_price:start,end_price:finish,return_pct:pct(start,finish),passed:growthAtLeast(finish,start,threshold)});
    }else if(duration===86400000&&ticker&&positive(ticker.value?.open)&&positive(ticker.value?.last)){
      out.push({window_ms:duration,start_ts:ticker.event_ts-duration,end_ts:ticker.event_ts,start_price:ticker.value.open,end_price:ticker.value.last,
        return_pct:pct(ticker.value.open,ticker.value.last),passed:growthAtLeast(ticker.value.last,ticker.value.open,profile.automatic_growth.day_pct),fact_ids:[ticker.fact_id]});
    }else out.push({window_ms:duration,start_ts:end?end-duration:null,end_ts:end??null,return_pct:null,passed:false,reason:'EXACT_WINDOW_UNAVAILABLE'});
  }
  return out;
}
export function confirmedPivots(rows, radius) {
  const out=[];
  for(let i=radius;i<rows.length-radius;i++){
    const left=rows.slice(i-radius,i),right=rows.slice(i+1,i+radius+1),r=rows[i];
    if(!rows.slice(i-radius,i+radius+1).every((x,j,a)=>j===0||x.open_ts===a[j-1].close_ts))continue;
    for(const side of ['high','low']){
      const ok=side==='high'?xs=>xs.every(x=>x.high<=r.high)&&xs.some(x=>x.high<r.high):xs=>xs.every(x=>x.low>=r.low)&&xs.some(x=>x.low>r.low);
      if(ok(left)&&ok(right))out.push({kind:side==='high'?'HIGH':'LOW',price:r[side],event_ts:r.close_ts,known_ts:rows[i+radius].close_ts});
    }
  }
  return out;
}
function volumeBasis(rows,input,profile,preferred=null){
  if(!rows.length)return null;
  if(input.facts.candles.unit===CANDLE_NATIVE_RELATIVE_UNIT){
    const comparison_key=candleNativeComparisonKey(input.instrument,profile.candle_interval_ms);
    return rows.every(r=>finite(r.volume_native)&&r.volume_native>=0&&r.volume_base===null&&r.turnover_quote===null&&r.native_quantity_unit==='UNKNOWN'&&r.comparison_kind===CANDLE_NATIVE_RELATIVE_KIND&&r.volume_comparison_key===comparison_key)?
      {field:'volume_native',unit:'UNKNOWN_NATIVE_UNIT',comparison_kind:CANDLE_NATIVE_RELATIVE_KIND,comparison_key,interval_ms:profile.candle_interval_ms}:null;
  }
  const known=field=>rows.every(r=>finite(r[field])&&r[field]>=0),field=preferred&&['turnover_quote','volume_base'].includes(preferred)&&known(preferred)?preferred:known('turnover_quote')?'turnover_quote':known('volume_base')?'volume_base':null;
  return field?{field,unit:field==='turnover_quote'?'USDT':'BASE',comparison_kind:'QUALIFIED_ABSOLUTE_SAME_FIELD',comparison_key:null,interval_ms:profile.candle_interval_ms}:null;
}
function sameVolumeBasis(impulse,basis){
  if(!basis||impulse.field!==basis.field||impulse.unit!==basis.unit)return false;
  return basis.field!=='volume_native'||impulse.comparison_kind===basis.comparison_kind&&impulse.comparison_key===basis.comparison_key&&impulse.interval_ms===basis.interval_ms;
}
function volumeComparison(rows, end, profile,input,duration=profile.impulse_window_ms) {
  const interval=profile.candle_interval_ms,current=windowRows(rows,end,duration,interval);
  if(!current)return null;
  const prior=[];
  for(let e=end-duration;e>=end-duration-profile.volume_baseline_ms+duration;e-=duration){const w=windowRows(rows,e,duration,interval);if(w)prior.push(w);}
  if(!prior.length)return null;
  const all=[...current,...prior.flat()],basis=volumeBasis(all,input,profile);if(!basis)return null;const {field}=basis;
  const priorVolumes=prior.map(w=>sum(w.map(r=>r[field]))),volume=sum(current.map(r=>r[field]));
  if(!finite(volume)||!priorVolumes.every(finite))return null;
  const background=median(priorVolumes),ratio=positive(background)&&finite(volume/background)?volume/background:null;
  return {...basis,volume,baseline_median:background,ratio,ratio_unit:'RATIO',ratio_reason:ratio===null?positive(background)?'VOLUME_RATIO_NOT_FINITE':'VOLUME_BASELINE_ZERO_OR_UNKNOWN':null,
    baseline_windows:prior.length,baseline_status:prior.length*duration>=profile.volume_baseline_ms?'FULL':'SHORT_HISTORY',
    normal_range:median(prior.map(w=>Math.max(...w.map(r=>r.high))-Math.min(...w.map(r=>r.low)))),start_ts:end-duration,end_ts:end,
    open:current[0].open,close:current.at(-1).close,low:Math.min(...current.map(r=>r.low)),return_pct:pct(current[0].open,current.at(-1).close)};
}
export const MOVEMENT_DETAILS_VERSION='pump-closed-movement-details-v1-20261026';
const knownNumber=value=>finite(value)?value:null;
// Observations of the already qualified, normalized closed rows. These do not
// change wave qualification, state, lifetime, plan or publication.
export function describeMovementDetails(input,rows,movement,price,profile){
  const f=input.facts.candles,at=input.analysis_ts,end=rows.at(-1)?.close_ts;
  const provenance={fact_id:f.fact_id,source:f.source,event_ts:f.event_ts,received_ts:f.received_ts,known_ts:at,evidence_ref:f.evidence_ref??null};
  const absent=reason=>({version:MOVEMENT_DETAILS_VERSION,status:'UNAVAILABLE',reason,provenance,activity_windows:[],failed_high_tests:null,pullback_return:null,changes_signal_gates:false});
  if(f.kind!=='candles'||f.origin!=='OBSERVED'||f.venue!=='BINGX'||f.instrument_id!==input.instrument.instrument_id||!rows.length||!validTime(end)||!validTime(f.event_ts)||!validTime(f.received_ts)||f.event_ts>f.received_ts||f.received_ts>at||end>f.event_ts||typeof f.evidence_ref!=='string'||!f.evidence_ref)return absent('CLOSED_ROW_SOURCE_CLOCK_OR_EVIDENCE_UNBOUND');
  const configured=profile.activity_windows_ms;
  if(!Array.isArray(configured)||configured.length!==2||!configured.includes(180000)||!configured.includes(300000))return absent('ACTIVITY_WINDOWS_PROFILE_UNQUALIFIED');
  const activity_windows=configured.map(duration=>{
    const current=windowRows(rows,end,duration,profile.candle_interval_ms),previous=windowRows(rows,end-duration,duration,profile.candle_interval_ms);
    const comparison=volumeComparison(rows,end,profile,input,duration),basis=current?volumeBasis([...(previous??[]),...current],input,profile,comparison?.field??movement.impulse?.field??null):null;
    const volume=current&&basis?knownNumber(sum(current.map(r=>r[basis.field]))):null,priorVolume=previous&&basis?knownNumber(sum(previous.map(r=>r[basis.field]))):null;
    const change=current?knownNumber(pct(current[0].open,current.at(-1).close)):null,priorChange=previous?knownNumber(pct(previous[0].open,previous.at(-1).close)):null,minutes=duration/60000;
    const speed=change===null?null:change/minutes,priorSpeed=priorChange===null?null:priorChange/minutes;
    const comparable=volume!==null&&priorVolume!==null&&positive(priorVolume),lessGrowth=comparable&&priorChange!==null&&priorChange>0&&change!==null?volume>=priorVolume&&change<priorChange:null;
    const previousRatio=comparable?knownNumber(volume/priorVolume):null;
    const baselineComparable=comparison&&basis&&sameVolumeBasis(comparison,basis);
    return {window_ms:duration,start_ts:end-duration,end_ts:end,previous_start_ts:end-2*duration,previous_end_ts:end-duration,
      price_return_pct:change,price_return_pct_reason:current?change===null?'PRICE_RETURN_NOT_FINITE':null:'CURRENT_CLOSED_WINDOW_UNAVAILABLE',
      previous_price_return_pct:priorChange,previous_price_return_pct_reason:previous?priorChange===null?'PRICE_RETURN_NOT_FINITE':null:'PREVIOUS_CLOSED_WINDOW_UNAVAILABLE',speed_pct_per_min:speed,previous_speed_pct_per_min:priorSpeed,
      speed_change_pct_per_min:speed!==null&&priorSpeed!==null?knownNumber(speed-priorSpeed):null,
      volume_counter:volume,previous_volume_counter:priorVolume,volume_basis:basis,
      current_to_previous_volume_ratio:previousRatio,
      current_to_previous_volume_ratio_reason:comparable?previousRatio===null?'CURRENT_PREVIOUS_VOLUME_RATIO_NOT_FINITE':null:previous?'PREVIOUS_VOLUME_ZERO_OR_UNKNOWN':'PREVIOUS_CLOSED_WINDOW_UNAVAILABLE',
      baseline_median:baselineComparable?comparison.baseline_median:null,baseline_windows:baselineComparable?comparison.baseline_windows:0,
      baseline_status:baselineComparable?comparison.baseline_status:'UNAVAILABLE',current_to_baseline_ratio:baselineComparable?comparison.ratio:null,
      current_to_baseline_ratio_reason:baselineComparable?comparison.ratio_reason:'MATCHED_VOLUME_BASELINE_UNAVAILABLE',
      volume_at_least_previous_with_less_growth:lessGrowth,
      positive_growth_accelerated:speed!==null&&priorSpeed!==null?speed>0&&speed>priorSpeed:null,
      reason:current?volume===null?'CURRENT_VOLUME_BASIS_UNQUALIFIED':null:'CURRENT_CLOSED_WINDOW_UNAVAILABLE'};
  });
  const waveStart=movement.impulse?.start_ts,latest=rows.at(-1),level=(movement.pivots??[]).filter(p=>p.kind==='HIGH'&&positive(p.price)&&validTime(p.known_ts)&&p.known_ts<=latest.open_ts&&
    validTime(p.event_ts)&&(!validTime(waveStart)||p.event_ts>=waveStart)).sort((a,b)=>b.known_ts-a.known_ts||b.event_ts-a.event_ts||b.price-a.price)[0];
  const tests=level?rows.filter(r=>r.open_ts>=level.known_ts&&(!validTime(waveStart)||r.open_ts>=waveStart)&&r.open<=level.price&&r.high>level.price&&r.close<=level.price):[];
  const failed_high_tests={scope:'SUPPLIED_CLOSED_BARS_AFTER_PREKNOWN_HIGH_ONLY',level:level?{kind:level.kind,price:level.price,event_ts:level.event_ts,known_ts:level.known_ts,fact_id:level.fact_id??null}:null,
    failed_closed_bars:level?tests.length:null,repeated:level?tests.length>=2:null,first_test_interval:tests.length?{start_ts:tests[0].open_ts,end_ts:tests[0].close_ts}:null,
    last_test_interval:tests.length?{start_ts:tests.at(-1).open_ts,end_ts:tests.at(-1).close_ts}:null,
    last_close_above_level:level?latest.close>level.price:null,current_price_above_level:level?price>level.price:null,
    full_wave_history_proven:false,intrabar_attempt_count_unknown:true,reason:level?null:'PREKNOWN_CONFIRMED_HIGH_UNAVAILABLE'};
  const peakTs=movement.next_wave?.peak_event_ts,peak=movement.peak_price,peakBar=rows.find(r=>r.close_ts===peakTs&&r.high===peak),after=validTime(peakTs)?rows.filter(r=>r.open_ts>=peakTs):[],reclaim=movement.reclaim_level;
  const path=after.length>0&&completeInterval(rows,peakTs,end),lowBar=path?after.reduce((a,r)=>!a||r.low<=a.low?r:a,null):null;
  const bounds=(change,start,endTime)=>{
    if(!finite(change)||!start||!validTime(endTime)||endTime<start.close_ts)return null;
    const min=endTime-start.close_ts,max=endTime-start.open_ts;
    return {duration_min_ms:min,duration_max_ms:max,lower_pct_per_min:max>0?knownNumber(change/(max/60000)):null,
      upper_pct_per_min:min>0?knownNumber(change/(min/60000)):null,upper_reason:min>0?null:'INTRABAR_EXTREME_TIME_UNKNOWN',basis:'OHLC_EXTREME_TIME_INTERVAL_NOT_EXACT_TICK'};
  };
  const returnPct=lowBar?knownNumber(pct(lowBar.low,latest.close)):null,fallPct=positive(peak)?knownNumber(100*(1-latest.close/peak)):null;
  const breaches=path&&positive(reclaim)?after.filter(r=>r.low<reclaim):[],first=breaches[0],last=breaches.at(-1),firstReclaim=first?after.find(r=>r.close_ts>=first.close_ts&&r.close>reclaim):null,lastReclaim=last?after.find(r=>r.close_ts>=last.close_ts&&r.close>reclaim):null;
  const pullback_return={scope:'SUPPLIED_CLOSED_POST_PEAK_PATH',peak_price:positive(peak)?peak:null,peak_close_ts:validTime(peakTs)?peakTs:null,path_complete_in_supplied_rows:path,
    closed_fall_from_peak_pct:fallPct,fall_speed_bounds:peakBar&&fallPct!==null&&fallPct>=0?bounds(fallPct,peakBar,end):null,
    low_price:lowBar?.low??null,low_interval:lowBar?{start_ts:lowBar.open_ts,end_ts:lowBar.close_ts}:null,last_close_price:latest.close,last_close_ts:end,
    closed_return_from_low_pct:returnPct,closed_return_reason:lowBar?returnPct===null?'CLOSED_RETURN_NOT_FINITE':null:'POST_PEAK_LOW_UNAVAILABLE',return_speed_bounds:returnPct!==null?bounds(returnPct,lowBar,end):null,
    reclaim_level:positive(reclaim)?reclaim:null,first_breach_interval:first?{start_ts:first.open_ts,end_ts:first.close_ts}:null,
    first_reclaim_close_ts:firstReclaim?.close_ts??null,reclaim_after_last_breach_close_ts:lastReclaim?.close_ts??null,
    last_close_above_reclaim:positive(reclaim)?latest.close>reclaim:null,current_price_above_reclaim:positive(reclaim)?price>reclaim:null,
    reason:!validTime(peakTs)?'WAVE_PEAK_UNAVAILABLE':!path?'POST_PEAK_CLOSED_PATH_UNAVAILABLE':!peakBar?'PEAK_BAR_NOT_IN_SUPPLIED_ROWS':null,
    no_prior_breach_reason:breaches.length?null:movement.next_wave?.reclaim_breached?'EARLIER_BREACH_NOT_IN_SUPPLIED_ROWS':'NO_OBSERVED_POST_PEAK_BREACH'};
  return {version:MOVEMENT_DETAILS_VERSION,status:'OBSERVED_CLOSED_WINDOW_MEASUREMENTS',reason:null,provenance,activity_windows,failed_high_tests,pullback_return,changes_signal_gates:false};
}
function qualificationClockValid(p,at){
  const known=p.qualification_known_ts??p.created_ts;
  return validTime(known)&&validTime(p.created_ts)&&known>=p.created_ts&&known<=at&&
    Array.isArray(p.qualification)&&p.qualification.every(q=>validTime(q.end_ts)&&q.end_ts<=known);
}
function usablePrevious(p,input,profile) {
  return p&&p.instrument_id===input.instrument.instrument_id&&typeof p.wave_id==='string'&&validTime(p.created_ts)&&p.created_ts<=input.analysis_ts&&
    validTime(p.expires_ts)&&p.expires_ts===p.created_ts+profile.wave_max_age_ms&&p.expires_ts>input.analysis_ts&&!['CANCELLED','EXPIRED'].includes(p.state)&&
    qualificationClockValid(p,input.analysis_ts)&&
    p.impulse&&positive(p.impulse.baseline_median)&&positive(p.impulse.normal_range)&&validTime(p.impulse.end_ts)&&p.impulse.end_ts<=p.created_ts;
}
export function analyzeMovement(input, rows, price, ticker, profile, observedDay=null) {
  const windows=growthWindows(rows,ticker,profile,observedDay).map(w=>{
    if(!positive(w.start_price)||!positive(w.end_price))return w;
    const fact=w.basis==='OBSERVED_CLOSED_OHLC_24H'?input.facts.growth_24h:w.fact_ids?.includes(ticker?.fact_id)?ticker:input.facts.candles;
    return {...w,fact_ids:w.fact_ids??[fact.fact_id],evidence_ref:w.evidence_ref??fact.evidence_ref??null,source:fact.source,source_event_ts:fact.event_ts};
  }),current_threshold_passed=windows.some(w=>w.passed),now=input.analysis_ts,end=rows.at(-1)?.close_ts;
  const p=input.previous_wave,previous=usablePrevious(p,input,profile)?p:null;
  const expired=p?.instrument_id===input.instrument.instrument_id&&validTime(p.expires_ts)&&p.expires_ts<=now;
  const candidates=[];
  for(const row of rows){if(row.close_ts<end-profile.wave_search_ms)continue;const v=volumeComparison(rows,row.close_ts,profile,input);
    if(v&&v.ratio!==null&&v.ratio>=profile.elevated_volume_ratio&&v.return_pct>0)candidates.push(v);}
  // A retained impulse keeps its original baseline and lifetime.
  const terminal=p?.instrument_id===input.instrument.instrument_id&&['CANCELLED','EXPIRED'].includes(p.state);
  const terminalTs=terminal?(p.cancelled_ts??p.expires_ts):expired?p.expires_ts:null;
  const eligibleCandidates=terminalTs===null?candidates:candidates.filter(v=>v.start_ts>=terminalTs);
  // First observation prefers the earliest intact initial seed as of now.
  // If none is intact, retain the original selector and cold-base path.
  const initialImpulse=p===null?eligibleCandidates.slice().sort((a,b)=>a.start_ts-b.start_ts||a.end_ts-b.end_ts)
    .find(v=>completeInterval(rows,v.start_ts,end)&&price>=v.low&&
      !rows.some(r=>r.open_ts>=v.end_ts&&r.low<v.low))??null:null;
  const impulse=initialImpulse??previous?.impulse??eligibleCandidates.sort((a,b)=>b.ratio-a.ratio||a.end_ts-b.end_ts)[0]??null;
  const facts=[input.facts.candles.fact_id],pivotMap=new Map();
  for(const pivot of [...(previous?.confirmed_pivots??[]),...confirmedPivots(rows,profile.pivot_radius_bars).map(p=>({...p,fact_id:facts[0]}))]){
    if(validTime(pivot.known_ts)&&pivot.known_ts<=now&&positive(pivot.price))pivotMap.set(pivot.kind+':'+pivot.event_ts+':'+pivot.price,pivot);
  }
  const pivots=[...pivotMap.values()];
  const base={windows,current_threshold_passed,automatic_eligible:false,wave_id:previous?.wave_id??null,state:null,impulse,pivots,normal_range:impulse?.normal_range??null,
    active:false,reasons:[],next_wave:null};
  if(expired&&!candidates.some(v=>v.start_ts>=p.expires_ts))return {...base,wave_id:p.wave_id,state:'EXPIRED',reasons:['WAVE_LIFETIME_EXPIRED'],next_wave:{...p,state:'EXPIRED'}};
  if(terminal&&!eligibleCandidates.length)return {...base,wave_id:p.wave_id,state:p.state,reasons:[p.state==='CANCELLED'?'PLAN_INVALIDATED':'WAVE_LIFETIME_EXPIRED'],next_wave:{...p}};
  if(p?.instrument_id===input.instrument.instrument_id&&!expired&&!terminal&&Array.isArray(p.qualification)&&!qualificationClockValid(p,now))return {...base,wave_id:p.wave_id,state:p.state??null,
    reasons:['WAVE_QUALIFICATION_CLOCK_INVALID'],next_wave:{...p}};
  if(!impulse){
    const recent=end?windowRows(rows,end,profile.impulse_window_ms,profile.candle_interval_ms):null;
    const basis=recent?volumeBasis(recent,input,profile):null;
    if(!basis)return {...base,reasons:['CURRENT_VOLUME_REQUIRED']};
    const current=sum(recent.map(r=>r[basis.field])),comparison=volumeComparison(rows,end,profile,input);
    const reason=comparison?.ratio_reason??(current>0&&!comparison?'VOLUME_BASELINE_UNAVAILABLE':'CURRENT_ACTIVITY_NOT_CONFIRMED');
    return {...base,current_volume:finite(current)?current:null,volume_basis:basis,volume_diagnostics:comparison,reasons:[reason]};
  }
  const recent=windowRows(rows,end,profile.impulse_window_ms,profile.candle_interval_ms),field=impulse.field;
  const basis=recent?volumeBasis(recent,input,profile,field):null;
  if(basis&&!sameVolumeBasis(impulse,basis))return {...base,wave_id:previous?.wave_id??null,state:previous?.state??null,next_wave:previous?{...previous}:null,
    volume_basis:basis,reasons:['WAVE_VOLUME_COMPARISON_BASIS_CHANGED']};
  if(!positive(impulse.volume))return {...base,wave_id:previous?.wave_id??null,state:previous?.state??null,next_wave:previous?{...previous}:null,
    volume_basis:basis,current_to_impulse_volume_ratio:null,current_to_impulse_volume_ratio_reason:'IMPULSE_VOLUME_ZERO_OR_UNKNOWN',reasons:['IMPULSE_VOLUME_ZERO_OR_UNKNOWN']};
  const continuityStart=previous?.covered_until_ts??impulse.start_ts;
  if(!completeInterval(rows,continuityStart,end))return {...base,state:previous?.state??null,next_wave:previous?{...previous}:null,reasons:['WAVE_PATH_INCOMPLETE']};
  // PROTOTYPE: a verified first cold classification may use the first
  // confirmed post-breach base. A terminal permits only a distinct seed already
  // admitted by the existing post-terminal selector; the old wave is preserved.
  const originalInvalidation=previous?.invalidation_price??impulse.low;
  const originalCancel=price<originalInvalidation||rows.some(r=>r.open_ts>=Math.max(impulse.end_ts,continuityStart)&&r.low<originalInvalidation);
  let cold=null;
  if((p===null||terminal||expired)&&originalCancel){
    const seedWaveRows=rows.filter(r=>r.close_ts>=impulse.start_ts),seedPeak=Math.max(...seedWaveRows.map(r=>r.high));
    const seedPeakRow=seedWaveRows.find(r=>r.high===seedPeak);
    const seedLevels=pivots.filter(r=>r.known_ts<=seedPeakRow.close_ts&&r.price<seedPeak&&r.price>impulse.low).sort((a,b)=>b.price-a.price);
    const proposal=proposeColdStructuralBase({input,rows,pivots,impulse,price,reclaim_level:seedLevels[0]?.price??impulse.open,profile});
    if(proposal.status==='STRUCTURAL_CANDIDATE')cold=proposal.boundary;
  }
  const invalidation=cold?.invalidation_price??originalInvalidation;
  const invalidationStart=cold?.invalidation_observation_start??Math.max(impulse.end_ts,continuityStart);
  const observedCancel=cold?price<invalidation||rows.some(r=>r.open_ts>=invalidationStart&&r.low<invalidation):originalCancel;
  if(!observedCancel&&(!recent||!basis||!recent.every(r=>finite(r[field]))||!finite(sum(recent.map(r=>r[field])))||sum(recent.map(r=>r[field]))<=0))return {...base,state:previous?'WEAKENING':null,next_wave:previous?{...previous,state:'WEAKENING',covered_until_ts:end}:null,reasons:['CURRENT_VOLUME_REQUIRED']};
  let qualification=previous?.qualification??[],qualificationKnown=previous?.qualification_known_ts??(qualification.length?previous.created_ts:null);
  // The first observation can be a manual review below AUTO thresholds. Latch
  // the first later confirmed threshold once, without restarting this wave.
  if(!observedCancel&&qualification.length===0&&windows.some(w=>w.passed)){
    qualification=windows.filter(w=>w.passed).map(w=>({...w,fact_ids:w.fact_ids??facts}));qualificationKnown=now;
  }
  const qualified=validTime(qualificationKnown)&&qualificationKnown<=now&&qualification.some(w=>validTime(w.end_ts)&&w.end_ts<=qualificationKnown&&w.passed===true&&positive(w.start_price)&&positive(w.end_price)&&
    growthAtLeast(w.end_price,w.start_price,w.window_ms===86400000?profile.automatic_growth.day_pct:profile.automatic_growth.short_pct));
  const created=previous?.created_ts??cold?.created_ts??now,wave_id=previous?.wave_id??cold?.wave_id??('PUMP:'+input.instrument.instrument_id+':'+impulse.start_ts);
  const waveRows=rows.filter(r=>r.close_ts>=impulse.start_ts),peak=Math.max(previous?.peak_price??0,...waveRows.map(r=>r.high));
  const peakRow=waveRows.find(r=>r.high===peak)??{close_ts:previous.peak_event_ts},afterPeak=waveRows.filter(r=>r.close_ts>peakRow.close_ts);
  const fall=100*(1-price/peak),minutes=Math.max(1,(end-peakRow.close_ts)/60000),normalSpeed=(impulse.normal_range/peak*100)/(profile.impulse_window_ms/60000);
  const sharp=fall/minutes>normalSpeed*profile.sharp_speed_multiple||['SHARP_PULLBACK_UNCONFIRMED','SHARP_PULLBACK_RECLAIMED'].includes(previous?.state);
  const levels=pivots.filter(r=>r.known_ts<=peakRow.close_ts&&r.price<peak&&r.price>impulse.low).sort((a,b)=>b.price-a.price);
  const reclaim=previous?.reclaim_level??cold?.reclaim_level??levels[0]?.price??impulse.open;
  const breached=afterPeak.some(r=>r.low<reclaim)||previous?.reclaim_breached===true;
  const last=rows.slice(-profile.reclaim_closed_bars),returned=breached&&last.length===profile.reclaim_closed_bars&&last.every(r=>r.close>reclaim);
  const cancelled=observedCancel;
  let state=price>=peak?'ACTIVE_WAVE':sharp?(returned?'SHARP_PULLBACK_RECLAIMED':'SHARP_PULLBACK_UNCONFIRMED'):'CALM_PULLBACK';
  if(recent&&previous&&['CALM_PULLBACK','SHARP_PULLBACK_RECLAIMED'].includes(previous.state)&&recent.at(-1).close>recent[0].open&&sum(recent.map(r=>r[field]??0))>(previous.current_volume??Infinity))state='RESUMING';
  if(recent&&!sharp&&sum(recent.map(r=>r[field]??0))>=impulse.volume&&recent.at(-1).close<=recent[0].open)state='WEAKENING';
  if(cancelled)state='CANCELLED';
  const next_wave={wave_id,instrument_id:input.instrument.instrument_id,created_ts:created,expires_ts:created+profile.wave_max_age_ms,qualification,qualification_known_ts:qualificationKnown,
    impulse:{...impulse},state,reclaim_level:reclaim,reclaim_breached:breached,invalidation_price:invalidation,current_volume:recent?sum(recent.map(r=>r[field]??0)):null,
    covered_until_ts:end,peak_price:peak,peak_event_ts:peakRow.close_ts,confirmed_pivots:pivots,cancelled_ts:cancelled?now:null,
    ...((cold??previous?.cold_first_structural_base)?{cold_first_structural_base:structuredClone(cold??previous.cold_first_structural_base)}:{})};
  const currentRatio=positive(impulse.volume)&&finite(next_wave.current_volume/impulse.volume)?next_wave.current_volume/impulse.volume:null;
  return {...base,active:!cancelled,state,wave_id,automatic_eligible:qualified&&!cancelled,qualification,next_wave,peak_price:peak,reclaim_level:reclaim,
    volume_basis:basis,current_volume:next_wave.current_volume,current_to_impulse_volume_ratio:currentRatio,current_to_impulse_volume_ratio_reason:currentRatio===null?'CURRENT_TO_IMPULSE_RATIO_NOT_FINITE':null,
    current_to_impulse_volume_ratio_unit:'RATIO',reasons:cancelled?['PLAN_INVALIDATED']:[]};
}

export function constructPlan(movement, price, liquidity, fact_id, tick, profile, as_of_ts=null) {
  return constructPlanDecision(movement,price,liquidity,fact_id,tick,profile,as_of_ts).plan;
}

// Target comparison never receives entry prices, potential or the owner10%.
export function selectJustifiedPlanTarget(movement,price,halfWidth,profile,as_of_ts){
  const ctx=movement.target_context,wave=movement.next_wave,seed=movement.impulse;
  const fail=reason=>({allowed:false,reason});
  if(!ctx||movement.active!==true||!wave||!seed||!validTime(seed.start_ts)||!validTime(as_of_ts)||
    !validTime(wave.created_ts)||wave.created_ts>as_of_ts||
    !validTime(wave.expires_ts)||wave.expires_ts<=as_of_ts||['CANCELLED','EXPIRED'].includes(wave.state))return fail('TARGET_CONTEXT_OR_WAVE_NOT_ACTIVE');
  const cap=1440,step=profile.candle_interval_ms,radius=profile.pivot_radius_bars,base=wave.invalidation_price;
  const factOk=(f,core=false)=>f&&typeof f.fact_id==='string'&&f.fact_id.length>0&&f.fact_id.length<=512&&(f.status==='USABLE'||core&&ctx.core_qualified===true&&f.status==='INCOMPLETE')&&
    validTime(f.event_ts)&&validTime(f.received_ts)&&validTime(f.expires_ts)&&f.event_ts<=f.received_ts&&f.received_ts<=as_of_ts&&f.expires_ts>=as_of_ts;
  const rowsOk=rows=>Array.isArray(rows)&&rows.length>0&&rows.length<=cap&&rows.every((r,n)=>
    validTime(r.open_ts)&&validTime(r.close_ts)&&r.close_ts-r.open_ts===step&&r.close_ts<=as_of_ts&&
    [r.open,r.high,r.low,r.close].every(positive)&&r.low<=Math.min(r.open,r.close)&&r.high>=Math.max(r.open,r.close)&&
    (n===0||rows[n-1].close_ts===r.open_ts));
  if(!positive(base)||!positive(step)||!Number.isSafeInteger(radius)||radius<1||!factOk(ctx.core_fact,true)||!rowsOk(ctx.core_rows)||!ctx.core_rows.every(r=>r.closed===true))return fail('TARGET_CORE_CONTEXT_UNBOUND');
  const core=ctx.core_rows;let end=core.at(-1).close_ts;
  let history=null,hrows=[];
  if(ctx.history_qualified===true&&factOk(ctx.history_fact)&&Array.isArray(ctx.history_fact.value)&&ctx.history_fact.value.length<=cap){
    const f=ctx.history_fact;
    const converted=f.value.map(r=>Array.isArray(r)&&r.length===5?{open_ts:r[0],close_ts:r[0]+step,open:r[1],high:r[2],low:r[3],close:r[4]}:null);
    if(converted.every(Boolean)&&rowsOk(converted)&&converted.at(-1).close_ts===f.event_ts&&f.coverage?.window_start===converted[0].open_ts){
      const byTime=new Map(converted.map(r=>[r.open_ts,r]));
      if(core.every(r=>!byTime.has(r.open_ts)||['open','high','low','close'].every(k=>r[k]===byTime.get(r.open_ts)[k]))){history=f;hrows=converted;}
    }
  }
  // Fresh OHLC confirmation, never trust an unbound retained fact_id. Event
  // and known clocks stay the original closed-bar clocks on explicit rebinding.
  const withFact=(rows,f)=>confirmedPivots(rows,radius).map(p=>({...p,fact_id:f.fact_id,evidence_ref:f.evidence_ref??null}));
  const hp=history?withFact(hrows,history):[],pool=new Map();
  for(const p of [...hp,...withFact(core,ctx.core_fact)])pool.set(p.kind+':'+p.event_ts+':'+p.price,p);
  const pivots=[...pool.values()].filter(p=>p.event_ts<=p.known_ts&&p.known_ts<=as_of_ts),highs=pivots.filter(p=>p.kind==='HIGH'),lows=pivots.filter(p=>p.kind==='LOW');
  const observed=[...new Map([...hrows,...core].map(r=>[r.open_ts,r])).values()].sort((a,b)=>a.open_ts-b.open_ts);
  end=observed.at(-1).close_ts;
  const intact=p=>completeInterval(observed,p.known_ts,end)&&price>=p.price&&!observed.some(r=>r.open_ts>=p.known_ts&&r.low<p.price);
  const waveHigh=highs.filter(p=>p.event_ts>=seed.start_ts).sort((a,b)=>b.price-a.price||a.known_ts-b.known_ts)[0]??null;
  const near=highs.filter(p=>p.price-halfWidth>price&&p.price-halfWidth>base+2*halfWidth).sort((a,b)=>a.price-b.price||a.known_ts-b.known_ts)[0]??null;
  const anchor=wave.cold_first_structural_base?.structural_anchor_ts??seed.start_ts;
  const floor=hp.filter(p=>p.kind==='LOW'&&p.known_ts<=anchor&&Math.abs(p.price-base)<=halfWidth)
    .sort((a,b)=>b.known_ts-a.known_ts||b.event_ts-a.event_ts)[0]??null;
  const floorBound=Boolean(floor&&completeInterval(observed,floor.known_ts,end)&&price>=floor.price-halfWidth&&
    !observed.some(r=>r.open_ts>=floor.known_ts&&r.low<floor.price-halfWidth));
  const outer=floorBound?hp.filter(p=>p.kind==='HIGH'&&p.known_ts<=floor.event_ts&&
    p.price-halfWidth>Math.max(price,base+2*halfWidth,waveHigh?waveHigh.price+halfWidth:0)&&
    !hp.some(q=>q.kind==='HIGH'&&q.event_ts>p.event_ts&&q.known_ts<=floor.event_ts&&q.price>p.price))
    .sort((a,b)=>a.price-b.price||a.known_ts-b.known_ts):[];
  const candidates=[];
  const add=(kind,p)=>{if(p&&p.price-halfWidth>base+2*halfWidth&&!candidates.some(c=>c.pivot.price===p.price&&c.pivot.event_ts===p.event_ts))candidates.push({kind,pivot:p});};
  add('HISTORICAL_OUTER_RANGE',outer.at(-1));add('HISTORICAL_NEAREST_OUTER',outer[0]);
  if(waveHigh&&(waveHigh.price+halfWidth>price||!near))add('CURRENT_WAVE_CEILING',waveHigh);
  add('NEAREST_CONFIRMED_HIGH',near);
  if(!candidates.length)return fail('NO_BOUND_JUSTIFIED_TARGET');
  const assess=p=>{
    if(price>=p.price+halfWidth)return {high:p,status:'CURRENT_PRICE_ABOVE',blocking:false,low_before:null,low_after:null};
    const before=lows.filter(q=>q.known_ts<=p.event_ts).sort((a,b)=>b.event_ts-a.event_ts)[0]??null;
    const after=lows.filter(q=>q.event_ts>p.event_ts&&q.known_ts<=as_of_ts).sort((a,b)=>a.event_ts-b.event_ts)[0]??null;
    if(!before||!after||!completeInterval(observed,after.known_ts,end))return {high:p,status:'UNRESOLVED_STRUCTURE',blocking:true,low_before:before,low_after:after};
    const minor=after.price>=before.price&&intact(before)&&intact(after);
    return {high:p,status:minor?'MINOR_HIGHER_LOW_REACTION':'MATERIAL_LOWER_LOW_OR_REBREACH',blocking:!minor,low_before:before,low_after:after};
  };
  let chosen=candidates[0],obstacles=[];
  for(let iteration=0;iteration<=highs.length;iteration++){
    obstacles=highs.filter(p=>p.price>base+halfWidth&&p.price+halfWidth<chosen.pivot.price-halfWidth)
      .sort((a,b)=>a.price-b.price||a.known_ts-b.known_ts).map(assess);
    const blocker=obstacles.find(o=>o.blocking);
    if(!blocker)break;
    chosen={kind:'NEARER_STRUCTURAL_BARRIER',pivot:blocker.high};
    if(iteration===highs.length)return fail('TARGET_OBSTACLE_REDUCTION_UNBOUND');
  }
  const refs=[...new Set([chosen.pivot.fact_id,...(chosen.kind.startsWith('HISTORICAL_')&&floor?[floor.fact_id]:[]),
    ...obstacles.flatMap(o=>[o.high.fact_id,o.low_before?.fact_id,o.low_after?.fact_id]).filter(Boolean)])];
  const evidence={version:'JUSTIFIED_TARGETS_V1',selected_kind:chosen.kind,selected:chosen.pivot,
    historical_floor:chosen.kind.startsWith('HISTORICAL_')?floor:null,history_fact_id:history?.fact_id??null,
    historical_role_bound:floorBound,qualified_historical_ceilings:outer.length,
    candidates:candidates.map(c=>({kind:c.kind,pivot:c.pivot})),obstacle_count:obstacles.length,
    current_above_count:obstacles.filter(o=>o.status==='CURRENT_PRICE_ABOVE').length,
    minor_reaction_count:obstacles.filter(o=>o.status==='MINOR_HIGHER_LOW_REACTION').length,
    minor_is_not_passed_or_guaranteed:true,selection_before_entry_and_potential:true};
  const intermediate=obstacles.map(o=>({...o.high,obstacle_status:o.status,low_before:o.low_before,low_after:o.low_after}));
  if(refs.length>16||new TextEncoder().encode(JSON.stringify({evidence,intermediate,refs})).byteLength>65536)return fail('TARGET_EVIDENCE_BOUND_EXCEEDED');
  const explanation=chosen.kind.startsWith('HISTORICAL_')?'Возврат к подтверждённой верхней границе связанного прежнего диапазона; защищённое основание сохранено.':
    chosen.kind==='CURRENT_WAVE_CEILING'?'Возврат к подтверждённой вершине текущей волны после будущего входа.':
    chosen.kind==='NEARER_STRUCTURAL_BARRIER'?'Более дальняя цель ограничена подтверждённым сопротивлением: структура за ним не доказана.':'Ближайшее подтверждённое сопротивление выше текущей цены.';
  return {allowed:true,pivot:chosen.pivot,kind:chosen.kind,refs,intermediate,evidence,explanation};
}


export function constructPlanDecision(movement, price, liquidity, fact_id, tick, profile, as_of_ts=null) {
  const {pivots,impulse,normal_range}=movement;
  const diagnostic={version:'pump-plan-diagnostic-v1-20261029',stage:'PLAN',code:null,required_minimum_pct:OWNER_MIN_PLAN_POTENTIAL_PCT,
    half_width:null,invalidation_price:movement.next_wave?.invalidation_price??null,target:null,support_candidates:0,
    entry_candidates_below_current:0,entry_candidates_meeting_minimum:0,best_candidate_minimum_potential_pct:null,
    fixed_invalidation_potential_supremum_pct:null,accepted_entry_count:0};
  const refuse=code=>({plan:null,diagnostic:{...diagnostic,code}});
  if(!impulse||!positive(normal_range)||!positive(liquidity.position_limit_usdt))return refuse('PLAN_INPUT_NOT_USABLE');
  const halfWidth=Math.max(positive(tick)?tick:0,normal_range*profile.entry_zone_normal_range_fraction);
  const invalidation=movement.next_wave.invalidation_price;
  diagnostic.half_width=halfWidth;
  const knownPivot=p=>positive(p.price)&&validTime(p.event_ts)&&validTime(p.known_ts)&&p.event_ts<=p.known_ts&&p.known_ts<=as_of_ts&&typeof p.fact_id==='string'&&p.fact_id.length>0;
  let resistance=null,returnTarget=false,targetSelection=null;
  if(movement.target_context){
    targetSelection=selectJustifiedPlanTarget(movement,price,halfWidth,profile,as_of_ts);
    if(!targetSelection.allowed)return refuse(targetSelection.reason);
    resistance=targetSelection.pivot;returnTarget=targetSelection.kind!=='NEAREST_CONFIRMED_HIGH';
    diagnostic.target_assessment=targetSelection.evidence;
  }else{
    // Legacy direct pure-plan callers retain their existing no-context path.
    resistance=pivots.filter(p=>p.kind==='HIGH'&&p.price-halfWidth>price).sort((a,b)=>a.price-b.price||a.known_ts-b.known_ts)[0];
    if(!resistance){
      const wave=movement.next_wave;
      if(movement.active!==true||!validTime(as_of_ts)||!validTime(impulse.start_ts)||!validTime(wave.created_ts)||wave.created_ts>as_of_ts||
        !validTime(wave.expires_ts)||wave.expires_ts<=as_of_ts||['CANCELLED','EXPIRED'].includes(wave.state))return refuse('RETURN_TARGET_WAVE_NOT_ACTIVE');
      resistance=pivots.filter(p=>p.kind==='HIGH'&&knownPivot(p)&&p.event_ts>=impulse.start_ts).sort((a,b)=>b.price-a.price||a.known_ts-b.known_ts)[0];
      returnTarget=true;
    }
  }
  if(!resistance)return refuse('NO_KNOWN_TARGET');
  const exit_zone={lower:resistance.price-halfWidth,upper:resistance.price+halfWidth,basis_fact_ids:targetSelection?.refs??[resistance.fact_id??fact_id],basis_level:resistance,
    explanation:targetSelection?targetSelection.explanation:(returnTarget?'Возврат к прежней подтверждённой вершине '+resistance.price+' после будущего отката к области входа; фиксация всей позиции.':'Ближайшая подтверждённая вершина '+resistance.price+' выше текущей цены; фиксация всей позиции.'),
    ...(targetSelection?{target_assessment:targetSelection.evidence,intermediate_highs:targetSelection.intermediate}:{})};
  const support=pivots.filter(p=>p.price<price&&p.price-halfWidth>invalidation&&(!returnTarget||knownPivot(p))).sort((a,b)=>b.price-a.price||a.known_ts-b.known_ts),entries=[];
  diagnostic.target={kind:targetSelection?.kind??(returnTarget?'RETURN_TO_CONFIRMED_HIGH':'ABOVE_CURRENT_RESISTANCE'),lower:exit_zone.lower,upper:exit_zone.upper,basis_level:resistance};
  diagnostic.support_candidates=support.length;
  for(const p of support){
    const upper=p.price+halfWidth;if(upper>=price)continue;
    diagnostic.entry_candidates_below_current++;
    const potential=100*(exit_zone.lower/upper-1);if(!finite(potential))continue;
    diagnostic.best_candidate_minimum_potential_pct=diagnostic.best_candidate_minimum_potential_pct===null?potential:Math.max(diagnostic.best_candidate_minimum_potential_pct,potential);
    if(potential>=OWNER_MIN_PLAN_POTENTIAL_PCT)diagnostic.entry_candidates_meeting_minimum++;
  }
  if(positive(invalidation+2*halfWidth))diagnostic.fixed_invalidation_potential_supremum_pct=100*(exit_zone.lower/(invalidation+2*halfWidth)-1);
  for(const p of support){
    const lower=p.price-halfWidth,upper=p.price+halfWidth;if(upper>=price)continue;
    const minimumPotential=100*(exit_zone.lower/upper-1);
    if(!finite(minimumPotential)||minimumPotential<OWNER_MIN_PLAN_POTENTIAL_PCT)continue;
    if(entries.some(e=>p.price>=e.lower-halfWidth&&p.price<=e.upper+halfWidth))continue;
    const reclaimed=movement.state==='SHARP_PULLBACK_RECLAIMED'&&movement.reclaim_level>=lower&&movement.reclaim_level<=upper;
    entries.push({lower,upper,basis_fact_ids:[p.fact_id??fact_id],basis_level:p,explanation:(p.kind==='HIGH'?'Прежняя подтверждённая вершина':'Прежний подтверждённый минимум')+' '+p.price+'; уровень был известен до анализа.',
      confirmation_level:reclaimed?movement.reclaim_level:null,confirmation_status:reclaimed?'CONFIRMED_RECLAIM':'PRELIMINARY_AREA'});
    if(entries.length>=profile.maximum_entry_zones)break;}
  if(!entries.length)return refuse(!support.length?'NO_ENTRY_ABOVE_INVALIDATION':diagnostic.entry_candidates_below_current?'NO_ENTRY_MEETS_OWNER_MINIMUM':'NO_ENTRY_BELOW_CURRENT_PRICE');
  if(exit_zone.lower<=Math.max(...entries.map(e=>e.upper)))return refuse('TARGET_NOT_ABOVE_ENTRY');
  if(returnTarget&&!targetSelection){
    const lowestEntryUpper=Math.min(...entries.map(e=>e.upper));
    exit_zone.intermediate_highs=pivots.filter(p=>p.kind==='HIGH'&&knownPivot(p)&&p.price>lowestEntryUpper&&p.price<exit_zone.lower)
      .sort((a,b)=>a.price-b.price||a.known_ts-b.known_ts).map(p=>({...p}));
  }
  const min=100*(exit_zone.lower/Math.max(...entries.map(e=>e.upper))-1),max=100*(exit_zone.upper/Math.min(...entries.map(e=>e.lower))-1);
  const plan={entry_zones:entries,exit_zone,invalidation:{kind:'PRICE_BELOW',price:invalidation,explanation:'Цена ниже сохранённой границы основания волны.'},
    position_limit_usdt:liquidity.position_limit_usdt,potential_pct:{minimum:min,maximum:max,basis:'GROSS_ENTRY_TO_EXIT_NOT_EXECUTED_PROFIT'},
    desired_plan_potential_pct:profile.desired_plan_potential_pct,desired_potential_status:min>=profile.desired_plan_potential_pct?'MEETS_DESIRED':max>=profile.desired_plan_potential_pct?'PARTLY_MEETS_DESIRED':'BELOW_DESIRED',automatic_orders:false};
  return {plan,diagnostic:{...diagnostic,code:'PLAN_BUILT',accepted_entry_count:entries.length}};
}
