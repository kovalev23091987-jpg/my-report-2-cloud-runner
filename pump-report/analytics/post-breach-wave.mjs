import {positive, finite, validTime} from '../contracts/index.mjs';
import {waveLifetimeValid,POST_BREACH_WAVE_VERSION} from '../contracts/wave-lifetime.mjs';

export const POST_BREACH_REARM_VERSION=POST_BREACH_WAVE_VERSION;
const text=x=>typeof x==='string'&&x.length>0&&x.length<=512;

// A current, complete closed path may prove an older cancellation cause.
// Receipt belongs to this proof, never to the old bot's knowledge clock.
export function provePostBreachCause(input,rows,profile){
  const p=input?.previous_wave,f=input?.facts?.candles,at=input?.analysis_ts;
  if(p?.state!=='CANCELLED'||!validTime(at)||!waveLifetimeValid(p,at,profile)||
    p.expires_ts<=at||p.instrument_id!==input.instrument?.instrument_id||!text(p.wave_id)||
    !validTime(p.cancelled_ts)||p.cancelled_ts<p.created_ts||p.cancelled_ts>at||
    !p.impulse||!validTime(p.impulse.start_ts)||!validTime(p.impulse.end_ts)||
    p.impulse.end_ts-p.impulse.start_ts!==profile.impulse_window_ms||p.impulse.end_ts>p.created_ts||
    !positive(p.invalidation_price)||!positive(p.impulse.low)||!positive(p.impulse.volume)||
    !positive(p.impulse.baseline_median)||!positive(p.impulse.normal_range)||
    !finite(p.impulse.ratio)||p.impulse.ratio<profile.elevated_volume_ratio||!positive(p.impulse.return_pct)||
    !validTime(p.covered_until_ts)||p.covered_until_ts<p.impulse.end_ts||p.covered_until_ts>p.cancelled_ts||
    !Array.isArray(p.qualification))return null;
  const qualificationKnown=p.qualification_known_ts??p.created_ts;
  if(!validTime(qualificationKnown)||qualificationKnown<p.created_ts||qualificationKnown>p.cancelled_ts||
    !p.qualification.every(q=>validTime(q?.end_ts)&&q.end_ts<=qualificationKnown))return null;
  if(!f||f.kind!=='candles'||f.origin!=='OBSERVED'||f.venue!=='BINGX'||
    f.instrument_id!==input.instrument.instrument_id||!['USABLE','INCOMPLETE'].includes(f.status)||
    !text(f.fact_id)||!text(f.evidence_ref)||!text(f.source)||!validTime(f.event_ts)||!validTime(f.received_ts)||
    !validTime(f.expires_ts)||f.event_ts>f.received_ts||f.received_ts>at||f.expires_ts<=at||
    at-f.event_ts>profile.freshness_ms.candles||!Array.isArray(f.value)||
    !Array.isArray(rows)||!rows.length)return null;
  const cold=p.cold_first_structural_base;
  let start=p.impulse.end_ts;
  if(cold){
    if(cold.wave_id!==p.wave_id||cold.invalidation_price!==p.invalidation_price||
      !validTime(cold.invalidation_observation_start)||cold.structural_anchor_ts!==cold.invalidation_observation_start||
      cold.invalidation_observation_start<p.impulse.end_ts||
      !validTime(cold.first_input_asof_ts)||cold.first_input_asof_ts>p.cancelled_ts||
      !validTime(cold.source_received_ts)||cold.source_received_ts>cold.first_input_asof_ts||
      cold.invalidation_observation_start>cold.source_received_ts)return null;
    start=cold.invalidation_observation_start;
  }else if(p.invalidation_price!==p.impulse.low)return null;
  if(start>p.cancelled_ts)return null;
  const raw=new Map();
  for(const row of f.value){
    if(row?.closed!==true||!validTime(row.open_ts))continue;
    if(raw.has(row.open_ts))return null;
    raw.set(row.open_ts,row);
  }
  const step=profile.candle_interval_ms;
  for(let k=0;k<rows.length;k++){
    const r=rows[k],original=raw.get(r?.open_ts);
    if(!r||r.closed!==true||!validTime(r.open_ts)||!validTime(r.close_ts)||r.close_ts-r.open_ts!==step||
      r.close_ts>f.event_ts||r.close_ts>at||![r.open,r.high,r.low,r.close].every(positive)||
      r.low>Math.min(r.open,r.close)||r.high<Math.max(r.open,r.close)||
      k>0&&r.open_ts<=rows[k-1].open_ts||!original||
      !['open_ts','close_ts','open','high','low','close'].every(key=>r[key]===original[key]))return null;
  }
  const path=rows.filter(r=>r.open_ts>=start),end=rows.at(-1).close_ts;
  if(!path.length||path[0].open_ts!==start||!path.every((r,k)=>k===0||r.open_ts===path[k-1].close_ts)||
    path.at(-1).close_ts!==end)return null;
  const breach=path.find(r=>r.low<p.invalidation_price);
  if(!breach||breach.close_ts>p.cancelled_ts)return null;
  return {version:POST_BREACH_REARM_VERSION,prior_wave_id:p.wave_id,prior_cancelled_ts:p.cancelled_ts,
    terminal_event_ts:breach.close_ts,proof_received_ts:f.received_ts,rearm_decided_ts:at,
    cause_fact_id:f.fact_id,cause_evidence_ref:f.evidence_ref,
    breach_open_ts:breach.open_ts,breach_close_ts:breach.close_ts,breach_low:breach.low,
    protected_base:p.invalidation_price,cause_path_start_ts:start};
}

// Only an intact independent seed is eligible. No cold-base rescue of this seed.
export function selectPostBreachSeed(candidates,cause,rows,price,at,profile){
  if(!cause)return null;
  return candidates.filter(v=>v.start_ts>=cause.terminal_event_ts&&
    positive(v.volume)&&positive(v.baseline_median)&&positive(v.normal_range)&&
    v.end_ts+profile.wave_max_age_ms>at&&v.end_ts<=at&&price>=v.low&&
    !rows.some(r=>r.open_ts>=v.end_ts&&r.low<v.low))
    .sort((a,b)=>a.start_ts-b.start_ts||a.end_ts-b.end_ts)[0]??null;
}
