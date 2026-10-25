import {positive, finite, validTime, CANDLE_NATIVE_RELATIVE_UNIT, CANDLE_NATIVE_RELATIVE_KIND, candleNativeComparisonKey} from '../contracts/index.mjs';
import {median, sum, pct, growthAtLeast, windowRows, completeInterval} from './math.mjs';

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
function volumeComparison(rows, end, profile,input) {
  const duration=profile.impulse_window_ms,interval=profile.candle_interval_ms,current=windowRows(rows,end,duration,interval);
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
function usablePrevious(p,input,profile) {
  return p&&p.instrument_id===input.instrument.instrument_id&&typeof p.wave_id==='string'&&validTime(p.created_ts)&&p.created_ts<=input.analysis_ts&&
    validTime(p.expires_ts)&&p.expires_ts===p.created_ts+profile.wave_max_age_ms&&p.expires_ts>input.analysis_ts&&!['CANCELLED','EXPIRED'].includes(p.state)&&
    Array.isArray(p.qualification)&&p.qualification.every(q=>validTime(q.end_ts)&&q.end_ts<=p.created_ts)&&
    p.impulse&&positive(p.impulse.baseline_median)&&positive(p.impulse.normal_range)&&validTime(p.impulse.end_ts)&&p.impulse.end_ts<=p.created_ts;
}
export function analyzeMovement(input, rows, price, ticker, profile, observedDay=null) {
  const windows=growthWindows(rows,ticker,profile,observedDay),current_threshold_passed=windows.some(w=>w.passed),now=input.analysis_ts,end=rows.at(-1)?.close_ts;
  const p=input.previous_wave,previous=usablePrevious(p,input,profile)?p:null;
  const expired=p?.instrument_id===input.instrument.instrument_id&&validTime(p.expires_ts)&&p.expires_ts<=now;
  const candidates=[];
  for(const row of rows){if(row.close_ts<end-profile.wave_search_ms)continue;const v=volumeComparison(rows,row.close_ts,profile,input);
    if(v&&v.ratio!==null&&v.ratio>=profile.elevated_volume_ratio&&v.return_pct>0)candidates.push(v);}
  // A retained impulse keeps its original baseline and lifetime.
  const terminal=p?.instrument_id===input.instrument.instrument_id&&['CANCELLED','EXPIRED'].includes(p.state);
  const terminalTs=terminal?(p.cancelled_ts??p.expires_ts):expired?p.expires_ts:null;
  const eligibleCandidates=terminalTs===null?candidates:candidates.filter(v=>v.start_ts>=terminalTs);
  const impulse=previous?.impulse??eligibleCandidates.sort((a,b)=>b.ratio-a.ratio||a.end_ts-b.end_ts)[0]??null;
  const facts=[input.facts.candles.fact_id],pivotMap=new Map();
  for(const pivot of [...(previous?.confirmed_pivots??[]),...confirmedPivots(rows,profile.pivot_radius_bars).map(p=>({...p,fact_id:facts[0]}))]){
    if(validTime(pivot.known_ts)&&pivot.known_ts<=now&&positive(pivot.price))pivotMap.set(pivot.kind+':'+pivot.event_ts+':'+pivot.price,pivot);
  }
  const pivots=[...pivotMap.values()];
  const base={windows,current_threshold_passed,automatic_eligible:false,wave_id:previous?.wave_id??null,state:null,impulse,pivots,normal_range:impulse?.normal_range??null,
    active:false,reasons:[],next_wave:null};
  if(expired&&!candidates.some(v=>v.start_ts>=p.expires_ts))return {...base,wave_id:p.wave_id,state:'EXPIRED',reasons:['WAVE_LIFETIME_EXPIRED'],next_wave:{...p,state:'EXPIRED'}};
  if(terminal&&!eligibleCandidates.length)return {...base,wave_id:p.wave_id,state:p.state,reasons:[p.state==='CANCELLED'?'PLAN_INVALIDATED':'WAVE_LIFETIME_EXPIRED'],next_wave:{...p}};
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
  const invalidation=previous?.invalidation_price??impulse.low;
  const observedCancel=price<invalidation||rows.some(r=>r.open_ts>=Math.max(impulse.end_ts,continuityStart)&&r.low<invalidation);
  if(!observedCancel&&(!recent||!basis||!recent.every(r=>finite(r[field]))||!finite(sum(recent.map(r=>r[field])))||sum(recent.map(r=>r[field]))<=0))return {...base,state:previous?'WEAKENING':null,next_wave:previous?{...previous,state:'WEAKENING',covered_until_ts:end}:null,reasons:['CURRENT_VOLUME_REQUIRED']};
  const qualification=previous?.qualification??windows.filter(w=>w.passed).map(w=>({...w,fact_ids:w.fact_ids??facts}));
  const qualified=qualification.some(w=>w.passed===true&&positive(w.start_price)&&positive(w.end_price)&&
    growthAtLeast(w.end_price,w.start_price,w.window_ms===86400000?profile.automatic_growth.day_pct:profile.automatic_growth.short_pct));
  const created=previous?.created_ts??now,wave_id=previous?.wave_id??('PUMP:'+input.instrument.instrument_id+':'+impulse.start_ts);
  const waveRows=rows.filter(r=>r.close_ts>=impulse.start_ts),peak=Math.max(previous?.peak_price??0,...waveRows.map(r=>r.high));
  const peakRow=waveRows.find(r=>r.high===peak)??{close_ts:previous.peak_event_ts},afterPeak=waveRows.filter(r=>r.close_ts>peakRow.close_ts);
  const fall=100*(1-price/peak),minutes=Math.max(1,(end-peakRow.close_ts)/60000),normalSpeed=(impulse.normal_range/peak*100)/(profile.impulse_window_ms/60000);
  const sharp=fall/minutes>normalSpeed*profile.sharp_speed_multiple||['SHARP_PULLBACK_UNCONFIRMED','SHARP_PULLBACK_RECLAIMED'].includes(previous?.state);
  const levels=pivots.filter(r=>r.known_ts<=peakRow.close_ts&&r.price<peak&&r.price>impulse.low).sort((a,b)=>b.price-a.price);
  const reclaim=previous?.reclaim_level??levels[0]?.price??impulse.open;
  const breached=afterPeak.some(r=>r.low<reclaim)||previous?.reclaim_breached===true;
  const last=rows.slice(-profile.reclaim_closed_bars),returned=breached&&last.length===profile.reclaim_closed_bars&&last.every(r=>r.close>reclaim);
  const cancelled=observedCancel;
  let state=price>=peak?'ACTIVE_WAVE':sharp?(returned?'SHARP_PULLBACK_RECLAIMED':'SHARP_PULLBACK_UNCONFIRMED'):'CALM_PULLBACK';
  if(recent&&previous&&['CALM_PULLBACK','SHARP_PULLBACK_RECLAIMED'].includes(previous.state)&&recent.at(-1).close>recent[0].open&&sum(recent.map(r=>r[field]??0))>(previous.current_volume??Infinity))state='RESUMING';
  if(recent&&!sharp&&sum(recent.map(r=>r[field]??0))>=impulse.volume&&recent.at(-1).close<=recent[0].open)state='WEAKENING';
  if(cancelled)state='CANCELLED';
  const next_wave={wave_id,instrument_id:input.instrument.instrument_id,created_ts:created,expires_ts:created+profile.wave_max_age_ms,qualification,
    impulse:{...impulse},state,reclaim_level:reclaim,reclaim_breached:breached,invalidation_price:invalidation,current_volume:recent?sum(recent.map(r=>r[field]??0)):null,
    covered_until_ts:end,peak_price:peak,peak_event_ts:peakRow.close_ts,confirmed_pivots:pivots,cancelled_ts:cancelled?now:null};
  const currentRatio=positive(impulse.volume)&&finite(next_wave.current_volume/impulse.volume)?next_wave.current_volume/impulse.volume:null;
  return {...base,active:!cancelled,state,wave_id,automatic_eligible:qualified&&!cancelled,qualification,next_wave,peak_price:peak,reclaim_level:reclaim,
    volume_basis:basis,current_volume:next_wave.current_volume,current_to_impulse_volume_ratio:currentRatio,current_to_impulse_volume_ratio_reason:currentRatio===null?'CURRENT_TO_IMPULSE_RATIO_NOT_FINITE':null,
    current_to_impulse_volume_ratio_unit:'RATIO',reasons:cancelled?['PLAN_INVALIDATED']:[]};
}

export function constructPlan(movement, price, liquidity, fact_id, tick, profile) {
  const {pivots,impulse,normal_range}=movement;
  if(!impulse||!positive(normal_range)||!positive(liquidity.position_limit_usdt))return null;
  const halfWidth=Math.max(positive(tick)?tick:0,normal_range*profile.entry_zone_normal_range_fraction);
  const invalidation=movement.next_wave.invalidation_price;
  const support=pivots.filter(p=>p.price<price&&p.price-halfWidth>invalidation).sort((a,b)=>b.price-a.price||a.known_ts-b.known_ts),entries=[];
  for(const p of support){if(entries.some(e=>p.price>=e.lower-halfWidth&&p.price<=e.upper+halfWidth))continue;
    const lower=p.price-halfWidth,upper=p.price+halfWidth;if(upper>=price)continue;
    const reclaimed=movement.state==='SHARP_PULLBACK_RECLAIMED'&&movement.reclaim_level>=lower&&movement.reclaim_level<=upper;
    entries.push({lower,upper,basis_fact_ids:[p.fact_id??fact_id],basis_level:p,explanation:(p.kind==='HIGH'?'Прежняя подтверждённая вершина':'Прежний подтверждённый минимум')+' '+p.price+'; уровень был известен до анализа.',
      confirmation_level:reclaimed?movement.reclaim_level:null,confirmation_status:reclaimed?'CONFIRMED_RECLAIM':'PRELIMINARY_AREA'});
    if(entries.length>=profile.maximum_entry_zones)break;}
  const resistance=pivots.filter(p=>p.kind==='HIGH'&&p.price-halfWidth>price).sort((a,b)=>a.price-b.price||a.known_ts-b.known_ts)[0];
  if(!entries.length||!resistance)return null;
  const exit_zone={lower:resistance.price-halfWidth,upper:resistance.price+halfWidth,basis_fact_ids:[resistance.fact_id??fact_id],basis_level:resistance,
    explanation:'Ближайшая подтверждённая вершина '+resistance.price+' выше текущей цены; фиксация всей позиции.'};
  if(exit_zone.lower<=Math.max(...entries.map(e=>e.upper)))return null;
  const min=100*(exit_zone.lower/Math.max(...entries.map(e=>e.upper))-1),max=100*(exit_zone.upper/Math.min(...entries.map(e=>e.lower))-1);
  return {entry_zones:entries,exit_zone,invalidation:{kind:'PRICE_BELOW',price:invalidation,explanation:'Цена ниже сохранённой границы основания волны.'},
    position_limit_usdt:liquidity.position_limit_usdt,potential_pct:{minimum:min,maximum:max,basis:'GROSS_ENTRY_TO_EXIT_NOT_EXECUTED_PROFIT'},
    desired_plan_potential_pct:profile.desired_plan_potential_pct,desired_potential_status:min>=profile.desired_plan_potential_pct?'MEETS_DESIRED':max>=profile.desired_plan_potential_pct?'PARTLY_MEETS_DESIRED':'BELOW_DESIRED',automatic_orders:false};
}
