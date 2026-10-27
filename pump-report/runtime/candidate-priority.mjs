import {factUsable,positive,ownerPublicationRefusal} from '../contracts/index.mjs';
import {START_PROFILE} from '../profile/start-v1.mjs';
// Queue preferences are bounded; waiting age grows without a ceiling so an
// otherwise eligible coin cannot monopolize every future turn.
export function candidatePriority(row,now,{profile=START_PROFILE}={}){
  const baseSince=row.last_checked_ts??row.first_seen;
  const failed=row.last_failed_admitted_attempt_ts;
  const since=Number.isSafeInteger(failed)&&failed>=0&&failed<=now?Math.max(Number.isSafeInteger(baseSince)&&baseSince>=0&&baseSince<=now?baseSince:0,failed):baseSince;
  const age=Number.isSafeInteger(since)&&since<=now?(now-since)/60000:0;
  const fresh=Number.isSafeInteger(row.movement_event_ts)&&row.movement_event_ts<=now?Math.max(0,1-(now-row.movement_event_ts)/profile.wave_max_age_ms):0;
  const priceFresh=Number.isSafeInteger(row.price_expires_ts)&&row.price_expires_ts>=now;
  const distance=priceFresh&&typeof row.entry_distance_pct==='number'&&Number.isFinite(row.entry_distance_pct)?Math.max(0,row.entry_distance_pct):null;
  const proximity=distance===null?0:1/(1+distance);
  const quality=Number.isSafeInteger(row.confirmed_core_count)&&Number.isSafeInteger(row.core_expires_ts)&&row.core_expires_ts>=now?Math.min(3,Math.max(0,row.confirmed_core_count))/3:0;
  return {score:age+20*fresh+20*proximity+20*quality,waiting_minutes:age,movement_freshness:fresh,entry_proximity:proximity,confirmed_data_fraction:quality};
}
export function analysisQueueEvidence(analysis,input,profile=START_PROFILE){
  const at=input.analysis_ts,price=input.facts?.price,zones=analysis.ready&&ownerPublicationRefusal(analysis)===null?analysis.plan?.entry_zones??[]:[];
  const valid=zones.filter(z=>positive(z.lower)&&positive(z.upper)&&z.lower<=z.upper);
  const priceFresh=factUsable(price,at)&&positive(price.value);
  const distance=priceFresh&&valid.length?Math.min(...valid.map(z=>price.value<z.lower?100*(z.lower-price.value)/price.value:price.value>z.upper?100*(price.value-z.upper)/price.value:0)):null;
  const confirmed=['price','candles','orderbook'].filter(k=>{
    const f=input.facts?.[k];
    return factUsable(f,at)&&!(analysis.reasons??[]).includes('MANDATORY_'+k.toUpperCase()+'_NOT_USABLE');
  });
  const times=confirmed.map(k=>input.facts[k].expires_ts);
  const wave=analysis.next_wave??analysis.previous_wave;
  return {entry_distance_pct:distance,price_expires_ts:priceFresh?price.expires_ts:null,confirmed_core_count:confirmed.length,
    core_expires_ts:times.length?Math.min(...times):null,movement_event_ts:wave?.impulse?.end_ts??null,
    priority_evidence_ts:at,priority_is_not_signal_eligibility:true};
}
