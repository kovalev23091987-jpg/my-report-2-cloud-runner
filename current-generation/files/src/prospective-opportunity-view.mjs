import {isExactHtxUsdtSwapKey} from './htx-contract-key.mjs';
export const PROSPECTIVE_OPPORTUNITY_VERSION='prospective-opportunity-view-v1-20261006';
const MINUTE=60_000,MAX_LAG=10*MINUTE,MAX_RECEIPT_AGE=5*MINUTE;
const stamp=v=>Number.isSafeInteger(v)&&v>0;
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const durations={'15m':15*MINUTE,'1h':60*MINUTE,'4h':240*MINUTE,'1d':1440*MINUTE};
function candleClosed(e){
 const c=e?.candle;
 return c&&['open','high','low','close'].every(k=>finite(c[k])&&c[k]>0)&&c.low<=c.open&&c.low<=c.close&&c.high>=c.open&&c.high>=c.close&&c.low<=c.high;
}
function exactDetectedEvent(e,contract){
 return isExactHtxUsdtSwapKey(contract)&&e?.contract===contract&&e.exchange==='HTX'&&typeof e.event_id==='string'&&e.event_id.length>0&&stamp(e.timestamp)&&stamp(e.event_close_ts)&&durations[e.timeframe]===e.event_close_ts-e.timestamp&&candleClosed(e)&&['WATCH_THRESHOLD','EXTREME_OUTLIER_REVIEW'].includes(e.threshold_path);
}
// Statistical episode representatives retain their original earliest event.
// This view only selects an already detected, currently timely source event.
export function selectProspectiveRawAnomaly(detected,episodes,{contract,observed_ts,max_lag_ms=MAX_LAG}={}){
 if(!isExactHtxUsdtSwapKey(contract)||!stamp(observed_ts)||!stamp(max_lag_ms)||max_lag_ms>MAX_LAG)return null;
 const selected=(Array.isArray(detected)?detected:[]).filter(e=>exactDetectedEvent(e,contract)&&e.event_close_ts<=observed_ts&&observed_ts-e.event_close_ts<=max_lag_ms)
  .sort((a,b)=>b.event_close_ts-a.event_close_ts||b.timestamp-a.timestamp||a.event_id.localeCompare(b.event_id))[0];
 if(!selected)return null;
 const owners=(Array.isArray(episodes)?episodes:[]).filter(e=>e.contract===contract&&stamp(e.episode_start_ts)&&stamp(e.episode_end_ts)&&e.episode_start_ts<=selected.timestamp&&e.episode_end_ts>=selected.event_close_ts);
 if(owners.length!==1)return null;
 return {...selected,statistical_episode_id:owners[0].event_id,independent_sample:false,control_group:false,control_eligible:false,prospective_observation_only:true,outcome_scoring_eligible:false};
}
function exactDecomposition(e){
 const d=e?.minute_decomposition,n=(e.event_close_ts-e.timestamp)/MINUTE;
 return d?.status==='CLOSED'&&d.classification_allowed===true&&d.event_start_ts===e.timestamp&&d.event_close_ts===e.event_close_ts&&d.expected_one_minute_bars===n&&d.one_minute_bars===n&&d.missing_or_incomplete===false;
}
export function sealProspectiveOpportunity(assessed,{contract,observed_ts}={}){
 if(!exactDetectedEvent(assessed,contract)||!stamp(observed_ts)||assessed.event_close_ts>observed_ts||observed_ts-assessed.event_close_ts>MAX_LAG||!exactDecomposition(assessed)||assessed.prospective_observation_only!==true||assessed.independent_sample!==false||assessed.outcome_scoring_eligible!==false||typeof assessed.statistical_episode_id!=='string')return null;
 return {...assessed,prospective_version:PROSPECTIVE_OPPORTUNITY_VERSION,prospective_status:'CLOSED',prospective_source:'EXISTING_DETECTED_HTX_ANOMALY',source_ts:assessed.event_close_ts,observed_ts,available_at:observed_ts,entry_authorized:false,additional_directional_votes:0,score_contribution:0};
}
export function readProspectiveOpportunity(opportunity,{contract,decision_ts}={}){
 const e=opportunity?.live_observation_event;
 if(e?.prospective_version!==PROSPECTIVE_OPPORTUNITY_VERSION||e.prospective_status!=='CLOSED'||e.prospective_source!=='EXISTING_DETECTED_HTX_ANOMALY'||!stamp(decision_ts)||!stamp(e.observed_ts)||e.available_at!==e.observed_ts||e.available_at>decision_ts||decision_ts-e.available_at>MAX_RECEIPT_AGE||decision_ts-e.event_close_ts>MAX_LAG||e.source_ts!==e.event_close_ts||e.entry_authorized!==false||e.additional_directional_votes!==0||e.score_contribution!==0)return null;
 return sealProspectiveOpportunity(e,{contract,observed_ts:e.observed_ts})?e:null;
}
