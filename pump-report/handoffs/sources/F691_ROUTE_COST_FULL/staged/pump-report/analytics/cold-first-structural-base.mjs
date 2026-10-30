import {waveLifetimeValid} from '../contracts/wave-lifetime.mjs';
// Structural helper only: no IO, clock override, mutation or READY.
export const COLD_RULE_VERSION='COLD_FIRST_STRUCTURAL_BASE_V1';
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const positive=value=>finite(value)&&value>0;
const time=value=>Number.isSafeInteger(value)&&value>=0;
const none=reason=>({status:'NOT_APPLICABLE',reason});
const copy=value=>structuredClone(value);
const text=value=>typeof value==='string'&&value.length>0;

// A retained terminal is never made null. The existing selector must have
// selected a genuinely different seed beyond its existing terminal boundary.
function firstConstructionScope(input,impulse,profile){
  const p=input.previous_wave,at=input.analysis_ts;
  if(p===null)return {kind:'VERIFIED_NULL_FIRST_WAVE'};
  if(!p||p.instrument_id!==input.instrument?.instrument_id||!text(p.wave_id)||
    !time(p.created_ts)||p.created_ts>at||!time(p.expires_ts)||
    !waveLifetimeValid(p,at,profile)||
    !p.impulse||!time(p.impulse.start_ts)||!time(p.impulse.end_ts)||
    p.impulse.end_ts-p.impulse.start_ts!==profile.impulse_window_ms||p.impulse.end_ts>p.created_ts||
    !positive(p.impulse.low)||!positive(p.impulse.volume)||!positive(p.impulse.return_pct)||
    !finite(p.impulse.ratio)||p.impulse.ratio<profile.elevated_volume_ratio||
    !positive(p.impulse.baseline_median)||!positive(p.impulse.normal_range)||
    !positive(p.invalidation_price)||!positive(p.reclaim_level)||
    !time(p.covered_until_ts)||p.covered_until_ts<p.impulse.end_ts||p.covered_until_ts>at||
    !Array.isArray(p.qualification))return null;
  const known=p.qualification_known_ts??p.created_ts;
  if(!time(known)||known<p.created_ts||known>at||
    !p.qualification.every(q=>time(q.end_ts)&&q.end_ts<=known))return null;
  let terminalTs,kind;
  if(p.state==='CANCELLED'){
    if(!time(p.cancelled_ts)||p.cancelled_ts<p.created_ts||p.cancelled_ts>at)return null;
    terminalTs=p.cancelled_ts;kind='NEW_WAVE_AFTER_CANCELLED';
  }else if(p.state==='EXPIRED'){
    if(p.expires_ts>at||p.cancelled_ts!==null)return null;
    terminalTs=p.expires_ts;kind='NEW_WAVE_AFTER_EXPIRED';
  }else{
    if(!['ACTIVE_WAVE','CALM_PULLBACK','SHARP_PULLBACK_UNCONFIRMED','SHARP_PULLBACK_RECLAIMED','RESUMING','WEAKENING'].includes(p.state)||
      p.expires_ts>at||p.cancelled_ts!==null)return null;
    terminalTs=p.expires_ts;kind='NEW_WAVE_AFTER_LIFETIME_EXPIRY';
  }
  if(impulse.start_ts<terminalTs||impulse.start_ts===p.impulse.start_ts||
    p.wave_id==='PUMP:'+input.instrument.instrument_id+':'+impulse.start_ts)return null;
  return {kind,prior_wave_id:p.wave_id,prior_state:p.state,terminal_ts:terminalTs,
    old_wave_preserved:true,old_seed_reuse:false};
}

// Caller supplies the existing normalized closed rows and unchanged selected
// impulse. This is a structural boundary, never an analytics/delivery verdict.
export function proposeColdStructuralBase({input,rows,pivots,impulse,price,reclaim_level,profile}={}){
  if(!input)return none('FIRST_CONSTRUCTION_INPUT_REQUIRED');
  const at=input.analysis_ts,fact=input.facts?.candles;
  if(!time(at)||!positive(price)||!fact||typeof fact.fact_id!=='string'||!fact.fact_id||
    !time(fact.event_ts)||!time(fact.received_ts)||fact.event_ts>fact.received_ts||fact.received_ts>at||
    !time(fact.expires_ts)||fact.expires_ts<=at)return none('COLD_SOURCE_CLOCKS_UNQUALIFIED');
  if(!profile||![profile.candle_interval_ms,profile.impulse_window_ms,profile.wave_search_ms,
    profile.wave_max_age_ms,profile.elevated_volume_ratio].every(positive)||
    !Number.isSafeInteger(profile.pivot_radius_bars)||profile.pivot_radius_bars<1||
    !Number.isSafeInteger(profile.reclaim_closed_bars)||profile.reclaim_closed_bars<1)
    return none('COLD_PROFILE_REQUIRED');
  if(!impulse||!time(impulse.start_ts)||!time(impulse.end_ts)||
    impulse.end_ts-impulse.start_ts!==profile.impulse_window_ms||
    !positive(impulse.low)||!positive(impulse.volume)||!positive(impulse.baseline_median)||
    !positive(impulse.normal_range)||!finite(impulse.ratio)||impulse.ratio<profile.elevated_volume_ratio||
    !positive(impulse.return_pct))return none('EXISTING_QUALIFIED_SEED_REQUIRED');
  const construction=firstConstructionScope(input,impulse,profile);
  if(!construction)return none('FIRST_CONSTRUCTION_OR_DISTINCT_POST_TERMINAL_SEED_REQUIRED');
  if(!Array.isArray(rows)||!rows.length||!Array.isArray(pivots))return none('COLD_CLOSED_ROWS_REQUIRED');
  const interval=profile.candle_interval_ms;
  const closeIndex=new Map();
  for(let n=0;n<rows.length;n++){
    const row=rows[n];
    if(!row||row.closed!==true||!time(row.open_ts)||!time(row.close_ts)||
      row.close_ts-row.open_ts!==interval||row.close_ts>at||row.close_ts>fact.event_ts||
      ![row.open,row.high,row.low,row.close].every(positive)||
      row.low>Math.min(row.open,row.close)||row.high<Math.max(row.open,row.close)||
      n>0&&row.open_ts<=rows[n-1].open_ts)return none('COLD_NORMALIZED_ROWS_UNQUALIFIED');
    closeIndex.set(row.close_ts,n);
  }
  const tail=rows.at(-1),expires=impulse.end_ts+profile.wave_max_age_ms;
  if(impulse.end_ts>tail.close_ts||impulse.end_ts<tail.close_ts-profile.wave_search_ms||
    !time(expires)||expires<=at)return none('COLD_SEED_WINDOW_OR_LIFETIME_EXPIRED');
  let cursor=impulse.start_ts;
  for(const row of rows.filter(row=>row.open_ts>=impulse.start_ts)){
    if(row.open_ts!==cursor)return none('COLD_PATH_INCOMPLETE');
    cursor=row.close_ts;
  }
  if(cursor!==tail.close_ts)return none('COLD_PATH_INCOMPLETE');
  const seedRows=rows.filter(row=>row.open_ts>=impulse.start_ts&&row.close_ts<=impulse.end_ts);
  if(seedRows.length!==profile.impulse_window_ms/interval||
    Math.min(...seedRows.map(row=>row.low))!==impulse.low)return none('COLD_SEED_ROW_BINDING_FAILED');
  const breach=rows.find(row=>row.open_ts>=impulse.end_ts&&row.low<impulse.low);
  if(!breach)return none('NO_HISTORICAL_SEED_BOUNDARY_BREACH');

  function qualifiedPivot(pivot){
    if(!pivot||!['LOW','HIGH'].includes(pivot.kind)||!positive(pivot.price)||
      !time(pivot.event_ts)||!time(pivot.known_ts)||pivot.event_ts>pivot.known_ts||
      pivot.known_ts>at||pivot.fact_id!==fact.fact_id)return false;
    const index=closeIndex.get(pivot.event_ts),radius=profile.pivot_radius_bars;
    if(index===undefined||index<radius||index+radius>=rows.length)return false;
    if(pivot.known_ts!==rows[index+radius].close_ts)return false;
    const local=rows.slice(index-radius,index+radius+1);
    if(!local.every((row,n)=>n===0||row.open_ts===local[n-1].close_ts))return false;
    const side=pivot.kind==='LOW'?'low':'high';
    if(rows[index][side]!==pivot.price)return false;
    const left=rows.slice(index-radius,index),right=rows.slice(index+1,index+radius+1);
    const confirmed=pivot.kind==='LOW'
      ? part=>part.every(row=>row.low>=pivot.price)&&part.some(row=>row.low>pivot.price)
      : part=>part.every(row=>row.high<=pivot.price)&&part.some(row=>row.high<pivot.price);
    return confirmed(left)&&confirmed(right);
  }
  if(!positive(reclaim_level))return none('PREKNOWN_RECLAIM_LEVEL_REQUIRED');
  const support=pivots.filter(p=>qualifiedPivot(p)&&p.price===reclaim_level&&p.known_ts<=breach.open_ts)
    .sort((a,b)=>b.known_ts-a.known_ts||b.event_ts-a.event_ts||
      String(b.kind).localeCompare(String(a.kind),'en')||String(b.fact_id).localeCompare(String(a.fact_id),'en'))[0];
  if(!support)return none('PREKNOWN_RECLAIM_PIVOT_REQUIRED');
  const base=pivots.filter(p=>p.kind==='LOW'&&qualifiedPivot(p)&&p.event_ts>=breach.close_ts)
    .sort((a,b)=>a.event_ts-b.event_ts||a.known_ts-b.known_ts)[0];
  if(!base)return none('CONFIRMED_POST_BREACH_BASE_REQUIRED');
  const initialPath=rows.filter(row=>row.open_ts>=breach.open_ts&&row.close_ts<=base.known_ts);
  if(!initialPath.length||Math.min(...initialPath.map(row=>row.low))!==base.price)
    return none('FIRST_BASE_IS_NOT_OBSERVED_TROUGH');
  if(rows.some(row=>row.open_ts>=base.known_ts&&row.low<base.price))
    return none('FIRST_BASE_REBREACHED_NO_REANCHOR');
  if(price<=base.price)return none('CURRENT_PRICE_AT_OR_BELOW_STRUCTURAL_BASE');

  const bars=profile.reclaim_closed_bars;
  const afterBase=rows.filter(row=>row.open_ts>=base.known_ts);
  let confirmedTs=null;
  for(let start=0;start+bars<=afterBase.length;start++){
    const group=afterBase.slice(start,start+bars);
    if(group.every(row=>row.close>reclaim_level)){confirmedTs=group.at(-1).close_ts;break;}
  }
  const last=rows.slice(-bars);
  const confirmedNow=confirmedTs!==null&&price>reclaim_level&&last.length===bars&&
    last.every(row=>row.open_ts>=base.known_ts&&row.close>reclaim_level);
  // Missing closed reclaim is a label, never a new gate for a preliminary plan.
  const instrumentId=input.instrument?.instrument_id;
  if(typeof instrumentId!=='string'||!instrumentId)return none('COLD_INSTRUMENT_REQUIRED');
  const boundary={kind:COLD_RULE_VERSION,
    wave_id:'PUMP:'+instrumentId+':COLD_BASE_V1:'+impulse.start_ts+':'+base.event_ts+':'+base.known_ts,
    created_ts:impulse.end_ts,expires_ts:expires,
    invalidation_price:base.price,invalidation_observation_start:base.known_ts,
    structural_anchor_ts:base.known_ts,reclaim_level,
    first_reclaim_confirmation_ts:confirmedTs,reclaim_confirmed_at_first_analysis:confirmedNow,
    preliminary_allowed_without_closed_reclaim:true,
    base_pivot:copy(base),support_pivot:copy(support),
    seed_start_ts:impulse.start_ts,seed_end_ts:impulse.end_ts,seed_low_unchanged:impulse.low,
    first_seed_low_breach_open_ts:breach.open_ts,first_input_asof_ts:at,
    source_fact_id:fact.fact_id,source_received_ts:fact.received_ts,
    structural_clock_basis:'CLOSED_BAR_AVAILABILITY_NOT_EARLIER_BOT_RECEIPT',
    construction_scope:construction,
    initial_scenario_kind:'FIRST_CONSTRUCTION_OF_DISTINCT_WAVE_NOT_RETAINED_PLAN_REVIVAL'};
  return {status:'STRUCTURAL_CANDIDATE',boundary};
}
