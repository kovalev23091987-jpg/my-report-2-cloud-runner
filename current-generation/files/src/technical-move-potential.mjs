export const TECHNICAL_MOVE_POTENTIAL_VERSION='technical-move-potential-v1-20260927';
export const MINIMUM_TECHNICAL_MOVE_PCT=5;
const finite=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
const arr=v=>Array.isArray(v)?v:[];
const text=v=>v===null||v===undefined?'':String(v).trim();
const move=(direction,entry,target)=>direction==='LONG'?(target/entry-1)*100:(1-target/entry)*100;
const correctSide=(direction,entry,target)=>direction==='LONG'?target>entry:target<entry;

function liquidationCandidates({direction,entry,zones,oi,volume,funding,earlyAnomaly,move24}){
 const rows=direction==='LONG'?arr(zones?.above):arr(zones?.below),out=[];
 for(const row of rows){
  const target=finite(row?.price??row?.level_price),potential=target===null?null:move(direction,entry,target);
  if(target===null||!correctSide(direction,entry,target)||potential<MINIMUM_TECHNICAL_MOVE_PCT)continue;
  const observed=row?.kind!=='CALCULATED'&&(finite(row?.exact_notional_usdt)!==null||finite(row?.strength_score_0_100)!==null||finite(row?.relative_strength_value)!==null);
  const calculatedSupport=[finite(oi)!==null&&Math.abs(oi)>=2,finite(volume)!==null&&volume>=1.5,finite(funding)!==null,earlyAnomaly===true,finite(move24)!==null&&Math.abs(move24)>=3].filter(Boolean).length;
  if(!observed&&!(row?.kind==='CALCULATED'&&calculatedSupport>=3))continue;
  out.push({target_price:target,potential_move_pct:potential,basis:observed?'OBSERVED_LIQUIDATION_ZONE':'CALCULATED_LIQUIDATION_ZONE_WITH_MARKET_CONFIRMATION',basis_ru:observed?'подтверждённая ликвидационная зона':'расчётная ликвидационная зона, подтверждённая рыночными показателями',strength_label_ru:text(row?.strength_label_ru)||null,exact_notional_usdt:finite(row?.exact_notional_usdt),technical_inputs:{oi_change_pct:oi,volume_ratio:volume,funding_rate_pct:funding,rolling_24h_change_pct:move24,early_anomaly:earlyAnomaly},evidence_count:observed?1:calculatedSupport});
 }
 return out;
}
function candleCandidate({direction,entry,opportunity}){
 const event=opportunity?.newest_event,c=event?.candle||{},high=finite(c.high),low=finite(c.low);
 const classified=event?.minute_decomposition?.classification_allowed===true||Boolean(event?.early_anomaly_classification);
 if(!classified||high===null||low===null||low<=0||high<=low)return null;
 const width=high-low,target=direction==='LONG'?entry+width:entry-width;
 if(target<=0||!correctSide(direction,entry,target))return null;
 const potential=move(direction,entry,target);if(potential<MINIMUM_TECHNICAL_MOVE_PCT)return null;
 return {target_price:target,potential_move_pct:potential,basis:'MEASURED_ANOMALY_CANDLE_RANGE',basis_ru:'измеренная ширина подтверждаемой свечной аномалии',evidence_count:1,technical_inputs:{anomaly_high:high,anomaly_low:low,measured_range_pct:width/entry*100,event_id:event?.event_id??null}};
}

export function evaluateTechnicalMovePotential({direction,current_price,trigger_price=null,liquidation_zones=null,opportunity=null,rolling_24h_change_pct=null,oi_change_pct=null,volume_ratio=null,funding_rate_pct=null,early_anomaly=false}={}){
 const d=text(direction).toUpperCase(),current=finite(current_price),trigger=finite(trigger_price)??current;
 const base={version:TECHNICAL_MOVE_POTENTIAL_VERSION,status:'NOT_CLOSED',reason:'TECHNICAL_TARGET_AT_LEAST_5_NOT_PROVEN',direction:d||null,entry_reference_price:trigger,minimum_move_pct:MINIMUM_TECHNICAL_MOVE_PCT,target_price:null,potential_move_pct:null,basis:null,basis_ru:null,not_random_target:true};
 if(!['LONG','SHORT'].includes(d)||current===null||current<=0||trigger===null||trigger<=0)return {...base,reason:'DIRECTION_OR_PRICE_NOT_CLOSED'};
 const oi=finite(oi_change_pct),volume=finite(volume_ratio),funding=finite(funding_rate_pct),move24=finite(rolling_24h_change_pct);
 const candidates=[candleCandidate({direction:d,entry:trigger,opportunity}),...liquidationCandidates({direction:d,entry:trigger,zones:liquidation_zones,oi,volume,funding,earlyAnomaly:early_anomaly,move24})].filter(Boolean).sort((a,b)=>a.potential_move_pct-b.potential_move_pct||b.evidence_count-a.evidence_count);
 if(!candidates.length)return base;
 const chosen=candidates[0];
 return {...base,...chosen,status:'CLOSED',reason:null,all_candidates:candidates.slice(0,8),begin_close_price:chosen.target_price,minimum_move_proven:true};
}

export default{TECHNICAL_MOVE_POTENTIAL_VERSION,MINIMUM_TECHNICAL_MOVE_PCT,evaluateTechnicalMovePotential};
