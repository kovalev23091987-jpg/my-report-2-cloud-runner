import {validateEvidenceV2} from './evidence-v2.mjs';

// Reuse a factual closed-candle range only as forward observation conditions.
// It supplies no directional vote, target, score or entry authorization.
export function verifiedObservationRange({evidence=[],contract,direction,price,decision_ts}={}){
 if(!['LONG','SHORT'].includes(direction)||typeof price!=='number'||!Number.isFinite(price)||price<=0||!Number.isSafeInteger(decision_ts))return null;
 const periods={'1min':60000,'5min':300000,'15min':900000,'30min':1800000,'60min':3600000,'4hour':14400000};
 const rows=evidence.filter(r=>{
  if(r?.htx_contract!==contract||r.asset_id!==`htx-futures:${contract}`||r.block_id!=='N10'||r.provider_id!=='PRIMARY_TECHNICAL_CONTEXT'||r.upstream_id!=='HTX_OFFICIAL_CLOSED_CANDLES'||r.metric_family!=='CLOSED_CANDLE_RANGE_CONTEXT'||!validateEvidenceV2(r,{decision_ts}).usable)return false;
  const duration=periods[r.period];
  if(!duration||r.interval_ms!==duration||r.candle_count!==20||r.coverage_status!=='EXACT_TWENTY_CLOSED_CANDLES'||r.all_candles_closed!==true||r.source_clock_policy!=='HTX_PRIMARY_RESPONSE_AND_CLOSED_CANDLE_IDS'||r.entry_authorized_by_context!==false)return false;
  if(![r.window_start,r.window_end,r.source_ts,r.observed_ts,r.first_known_ts,r.expires_at].every(Number.isSafeInteger)||r.window_end-r.window_start!==20*duration||r.window_end%duration!==0||r.window_end>r.source_ts||r.source_ts>r.observed_ts||r.observed_ts>r.first_known_ts||r.first_known_ts>decision_ts||decision_ts-r.source_ts>180000||r.expires_at>r.source_ts+180000||r.expires_at<=decision_ts)return false;
  if(![r.range_low,r.range_high,r.last_closed_price].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>0)||r.range_low>=r.range_high||r.last_closed_price<r.range_low||r.last_closed_price>r.range_high)return false;
  return direction==='LONG'?r.range_high>price&&r.range_low<price:r.range_low<price&&r.range_high>price;
 }).sort((a,b)=>a.interval_ms-b.interval_ms||b.source_ts-a.source_ts||a.evidence_id.localeCompare(b.evidence_id));
 const r=rows[0];if(!r)return null;
 return{level:direction==='LONG'?r.range_high:r.range_low,cancel:direction==='LONG'?r.range_low:r.range_high,evidence_id:r.evidence_id,source_ts:r.source_ts,observed_ts:r.observed_ts,window_start:r.window_start,window_end:r.window_end,period:r.period,basis:'VERIFIED_CLOSED_CANDLE_RANGE',score_contribution:0,entry_authorized:false};
}
