// UNEXECUTED pure archival price comparisons. No trading outcome or admission.
const D=14400000,H=Object.freeze({'4h':D,'24h':6*D,'7d':42*D,'30d':180*D});
const stamp=x=>Number.isSafeInteger(x)&&x>=1e12;
const price=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
const need=(ok,message)=>{if(!ok)throw Error(message);};

export function describeFollowingClosed({target,native_bars,source_asof_ts,horizon}={}){
 need(target&&stamp(target.end_ts)&&target.end_ts%D===0&&price(target.close),'CLOSED_TARGET_COMPARISON_REQUIRED');
 need(stamp(source_asof_ts)&&target.end_ts<=source_asof_ts&&Object.hasOwn(H,horizon),'ORIGINAL_SOURCE_ASOF_AND_FIXED_HORIZON_REQUIRED');
 need(Array.isArray(native_bars)&&native_bars.length<=2000,'BOUNDED_RETAINED_NATIVE_SERIES_REQUIRED');
 const desiredEnd=target.end_ts+H[horizon],needed=H[horizon]/D,seen=new Set();
 const closed=[];
 for(const b of native_bars){
  need(stamp(b.start_ts)&&b.start_ts%D===0&&b.end_ts===b.start_ts+D&&!seen.has(b.start_ts),'NATIVE_GRID_OR_DUPLICATE_INVALID');seen.add(b.start_ts);
  if(b.end_ts<=source_asof_ts)closed.push(b);
 }
 closed.sort((a,b)=>a.start_ts-b.start_ts);
 const future=closed.filter(b=>b.start_ts>=target.end_ts&&b.end_ts<=desiredEnd);
 for(const b of future)need(['open','high','low','close'].every(k=>price(b[k]))&&b.low<=Math.min(b.open,b.close)&&b.high>=Math.max(b.open,b.close)&&b.low<=b.high,'CLOSED_FUTURE_OHLC_INVALID');
 const empty={end_close_change_pct:null,following_min_low_relative_close_pct:null,following_max_high_relative_close_pct:null};
 const base={horizon,comparison_start_ts:target.end_ts,comparison_end_ts:desiredEnd,original_source_asof_ts:source_asof_ts,required_native_bars:needed,available_following_closed_bars:future.length,comparison_reference:'TARGET_CLOSED_PRICE_ONLY_NOT_ENTRY_OR_KNOWN_TIME_QUOTE',intrabar_order:'UNKNOWN',is_trade_or_directional_outcome:false};
 const missing=status=>({...base,status,metrics:{...empty},future_native_cohort_indices:null,future_original_source_row_indices:null});
 if(desiredEnd>source_asof_ts)return missing('RIGHT_CENSORED_SOURCE_ASOF');
 if(!closed.length||closed[0].start_ts>target.end_ts||closed.at(-1).end_ts<desiredEnd)return missing('INSUFFICIENT_RETAINED_FUTURE_HISTORY');
 if(future.length!==needed||future.some((b,k)=>b.start_ts!==target.end_ts+k*D))return missing('INTERNAL_FUTURE_GAP');
 let low=Infinity,high=-Infinity;
 for(const b of future){
  low=Math.min(low,b.low);high=Math.max(high,b.high);
 }
 const pct=x=>100*(x/target.close-1),metrics={end_close_change_pct:pct(future.at(-1).close),following_min_low_relative_close_pct:pct(low),following_max_high_relative_close_pct:pct(high)};
 need(Object.values(metrics).every(Number.isFinite),'FINITE_COMPARATIVE_PERCENTAGES_REQUIRED');
 return {...base,status:'FULL_COMPARABLE_CLOSED_CONTEXT',metrics,future_native_cohort_indices:future.map(b=>b.cohort_index),future_original_source_row_indices:future.map(b=>b.source_row_index)};
}
