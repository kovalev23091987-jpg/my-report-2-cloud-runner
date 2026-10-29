import {factUsable,positive,ownerPublicationRefusal} from '../contracts/index.mjs';
import {START_PROFILE} from '../profile/start-v1.mjs';
export const QUEUE_WAVE_VERSION='pump-queue-wave-v1';
// A refreshed price and membership in the old active array do not extend a wave.
// Legacy rows remain unknown until the exact retained wave has been read.
export function queueWaveMetadata(wave,instrument_id,at,profile=START_PROFILE){
  if(wave===null)return {wave_tracking_version:QUEUE_WAVE_VERSION,wave_tracking_status:'NONE',wave_id:null,wave_created_ts:null,wave_expires_ts:null,wave_state:null,wave_metadata_ts:at};
  const valid=wave?.instrument_id===instrument_id&&typeof wave.wave_id==='string'&&wave.wave_id.length>0&&
    Number.isSafeInteger(wave.created_ts)&&wave.created_ts>=0&&wave.created_ts<=at&&Number.isSafeInteger(wave.expires_ts)&&
    wave.expires_ts===wave.created_ts+profile.wave_max_age_ms&&typeof wave.state==='string';
  if(!valid)return null;
  return {wave_tracking_version:QUEUE_WAVE_VERSION,wave_tracking_status:'BOUND',wave_id:wave.wave_id,wave_created_ts:wave.created_ts,
    wave_expires_ts:wave.expires_ts,wave_state:wave.state,wave_metadata_ts:at};
}
export function queueWaveState(row,now,profile=START_PROFILE){
  if(row.wave_tracking_version!==QUEUE_WAVE_VERSION)return 'UNKNOWN';
  if(row.wave_tracking_status==='NONE')return 'NONE';
  if(row.wave_tracking_status!=='BOUND'||typeof row.wave_id!=='string'||!row.wave_id||
    !Number.isSafeInteger(row.wave_created_ts)||row.wave_created_ts<0||row.wave_created_ts>now||
    !Number.isSafeInteger(row.wave_expires_ts)||row.wave_expires_ts!==row.wave_created_ts+profile.wave_max_age_ms||
    !Number.isSafeInteger(row.wave_metadata_ts)||row.wave_metadata_ts<row.wave_created_ts||row.wave_metadata_ts>now)return 'UNKNOWN';
  return ['CANCELLED','EXPIRED'].includes(row.wave_state)||row.wave_expires_ts<=now?'EXPIRED':'LIVE';
}
export function queueWatchActive(row,now,profile=START_PROFILE){
  const state=queueWaveState(row,now,profile);
  return state==='LIVE'||state==='UNKNOWN'&&row.active_wave===true;
}
// Queue preferences are bounded; waiting age grows without a ceiling so an
// otherwise eligible coin cannot monopolize every future turn.
export function candidatePriority(row,now,{profile=START_PROFILE}={}){
  const baseSince=row.last_checked_ts??row.first_seen;
  const failed=row.last_failed_admitted_attempt_ts;
  const since=Number.isSafeInteger(failed)&&failed>=0&&failed<=now?Math.max(Number.isSafeInteger(baseSince)&&baseSince>=0&&baseSince<=now?baseSince:0,failed):baseSince;
  const age=Number.isSafeInteger(since)&&since<=now?(now-since)/60000:0;
  const fresh=Number.isSafeInteger(row.movement_event_ts)&&row.movement_event_ts<=now?Math.max(0,1-(now-row.movement_event_ts)/profile.wave_max_age_ms):0;
  const priceFresh=Number.isSafeInteger(row.price_expires_ts)&&row.price_expires_ts>=now;
  const expired=['EXPIRED','NONE'].includes(queueWaveState(row,now,profile));
  const distance=!expired&&priceFresh&&typeof row.entry_distance_pct==='number'&&Number.isFinite(row.entry_distance_pct)?Math.max(0,row.entry_distance_pct):null;
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
    ...(queueWaveMetadata(wave??null,input.instrument.instrument_id,at,profile)??{}),
    priority_evidence_ts:at,priority_is_not_signal_eligibility:true};
}
