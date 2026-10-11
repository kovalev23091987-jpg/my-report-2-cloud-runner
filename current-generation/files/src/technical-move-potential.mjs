import {isExactHtxUsdtSwapKey} from './htx-contract-key.mjs';
export const TECHNICAL_MOVE_POTENTIAL_VERSION='technical-move-potential-v5-actual-producer-timing-20261009';
export const MINIMUM_TECHNICAL_MOVE_PCT=null;
const finite=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
const arr=v=>Array.isArray(v)?v:[];
const text=v=>v===null||v===undefined?'':String(v).trim();
const move=(direction,entry,target)=>direction==='LONG'?(target/entry-1)*100:(1-target/entry)*100;
const correctSide=(direction,entry,target)=>direction==='LONG'?target>entry:target<entry;

function liquidationCandidates({direction,entry,zones}){
 const rows=direction==='LONG'?arr(zones?.above):arr(zones?.below),out=[],obstacles=[];
 for(const row of rows){
  const target=finite(row?.price??row?.level_price),potential=target===null?null:move(direction,entry,target);
  if(target===null||!correctSide(direction,entry,target))continue;
  const observed=row?.kind!=='CALCULATED'&&(finite(row?.exact_notional_usdt)!==null||finite(row?.strength_score_0_100)!==null||finite(row?.relative_strength_value)!==null);
  // Calculated display bands and generic OI/funding/volume confirmations never
  // prove a tradable target. Only a separately admitted native/scenario level
  // can enter the target set.
  const estimated=/BUCKET|CLUSTER_CENTER|MODEL_PRICE_BIN|SDK_ESTIMATE/.test(text(row?.price_semantics).toUpperCase());
  const conditional=row?.conditional_cross===true||row?.conditional_on_other_positions===true||text(row?.margin_mode).toUpperCase()==='CROSS';
  if(observed&&row?.path_obstacle_eligible===true&&!estimated&&!conditional)obstacles.push({price:target,move_pct:potential,kind:row.kind??null,source:row.source??null});
  if(row?.decision_target_eligible!==true||row?.kind==='CALCULATED'||estimated||conditional||potential<=0)continue;
  out.push({target_price:target,potential_move_pct:potential,basis:'FRESH_SCOPED_NATIVE_LEVEL',basis_ru:'свежий проверенный уровень позиции',target_proof_admitted:true,strength_label_ru:text(row?.strength_label_ru)||null,exact_notional_usdt:finite(row?.exact_notional_usdt),source:text(row?.source)||null,source_ts:finite(row?.source_ts),evidence_count:1});
 }
 return {candidates:out,obstacles};
}
function producerTimingClosed(event,{contract,decision_ts}={}){
 const timing=event?.observation_timing;
 // A legacy timely flag has no original source clock or exact market proof.
 if(timing==null)return false;
 const d=event?.minute_decomposition,first=timing.first_seen_ts,close=event?.event_close_ts,start=event?.timestamp;
 return isExactHtxUsdtSwapKey(contract)&&event?.contract===contract&&event?.exchange==='HTX'&&
  timing.timely_for_precommitted_funnel===true&&timing.retrospective_promotion_forbidden===false&&
  [first,close,start,decision_ts].every(Number.isSafeInteger)&&start<close&&close<=first&&first<=decision_ts&&
  first-close<=600000&&decision_ts-close<=600000&&decision_ts-first<=300000&&timing.lag_from_event_close_ms===first-close&&
  d?.status==='CLOSED'&&d.classification_allowed===true&&d.missing_or_incomplete===false&&
  d.event_start_ts===start&&d.event_close_ts===close&&d.expected_one_minute_bars===(close-start)/60000&&
  Number.isSafeInteger(d.expected_one_minute_bars)&&d.expected_one_minute_bars>0&&d.one_minute_bars===d.expected_one_minute_bars;
}
function candleCandidate({direction,entry,opportunity,contract,decision_ts}){
 const event=opportunity?.newest_event,c=event?.candle||{},high=finite(c.high),low=finite(c.low);
 const classified=event?.minute_decomposition?.classification_allowed===true;
 // A historical candle may remain useful context, but it cannot create a new
 // tradable target unless the opportunity engine marked this exact event timely.
 if(!classified||!producerTimingClosed(event,{contract,decision_ts})||high===null||low===null||low<=0||high<=low)return null;
 const width=high-low,target=direction==='LONG'?entry+width:entry-width;
 if(target<=0||!correctSide(direction,entry,target))return null;
 const potential=move(direction,entry,target);if(potential<=0)return null;
 return {target_price:target,potential_move_pct:potential,basis:'MEASURED_ANOMALY_CANDLE_RANGE',basis_ru:'измеренная ширина подтверждаемой свечной аномалии',evidence_count:1,technical_inputs:{anomaly_high:high,anomaly_low:low,measured_range_pct:width/entry*100,event_id:event?.event_id??null}};
}

export function evaluateTechnicalMovePotential({direction,current_price,trigger_price=null,liquidation_zones=null,opportunity=null,contract=null,decision_ts=null,rolling_24h_change_pct=null,oi_change_pct=null,volume_ratio=null,funding_rate_pct=null,early_anomaly=false}={}){
 const d=text(direction).toUpperCase(),current=finite(current_price),trigger=finite(trigger_price)??current;
 const base={version:TECHNICAL_MOVE_POTENTIAL_VERSION,status:'NOT_CLOSED',reason:'FAVORABLE_TECHNICAL_TARGET_NOT_PROVEN',direction:d||null,entry_reference_price:trigger,minimum_move_pct:null,target_price:null,potential_move_pct:null,basis:null,basis_ru:null,not_random_target:true};
 if(!['LONG','SHORT'].includes(d)||current===null||current<=0||trigger===null||trigger<=0)return {...base,reason:'DIRECTION_OR_PRICE_NOT_CLOSED'};
 const liquidation=liquidationCandidates({direction:d,entry:trigger,zones:liquidation_zones});
 const candidates=[candleCandidate({direction:d,entry:trigger,opportunity,contract,decision_ts}),...liquidation.candidates].filter(Boolean).sort((a,b)=>a.potential_move_pct-b.potential_move_pct||b.evidence_count-a.evidence_count);
 if(!candidates.length)return base;
 const forward=candidates.filter(row=>correctSide(d,current,row.target_price));
 if(!forward.length)return {...base,reason:'TARGET_ALREADY_REACHED_OR_BEHIND_CURRENT_PRICE'};
 const chosen=forward[0];
 // Only a level still ahead of both the snapshot price and the trigger can
 // obstruct the remaining path. A crossed level is historical context.
 const obstacles=liquidation.obstacles.filter(row=>correctSide(d,current,row.price)&&row.move_pct>0&&row.move_pct<chosen.potential_move_pct).sort((a,b)=>a.move_pct-b.move_pct);
 if(obstacles.length)return {...base,reason:'OBSERVED_PATH_OBSTACLE_BEFORE_TARGET',all_candidates:forward.slice(0,8),path_obstacles:obstacles.slice(0,8)};
 return {...base,...chosen,status:'CLOSED',reason:null,all_candidates:candidates.slice(0,8),path_obstacles:obstacles.slice(0,8),begin_close_price:chosen.target_price,favorable_move_proven:true};
}

export default{TECHNICAL_MOVE_POTENTIAL_VERSION,MINIMUM_TECHNICAL_MOVE_PCT,evaluateTechnicalMovePotential};

