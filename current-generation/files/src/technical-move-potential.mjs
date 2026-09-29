export const TECHNICAL_MOVE_POTENTIAL_VERSION='technical-move-potential-v2-proof-separated-20260928';
export const MINIMUM_TECHNICAL_MOVE_PCT=5;
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
  if(observed&&row?.path_obstacle_eligible!==false)obstacles.push({price:target,move_pct:potential,kind:row.kind??null,source:row.source??null});
  // Calculated display bands and generic OI/funding/volume confirmations never
  // prove a tradable target. Only a separately admitted native/scenario level
  // can enter the target set.
  if(row?.decision_target_eligible!==true||potential<MINIMUM_TECHNICAL_MOVE_PCT)continue;
  out.push({target_price:target,potential_move_pct:potential,basis:'FRESH_SCOPED_NATIVE_LEVEL',basis_ru:'свежий проверенный уровень позиции',strength_label_ru:text(row?.strength_label_ru)||null,exact_notional_usdt:finite(row?.exact_notional_usdt),source:text(row?.source)||null,source_ts:finite(row?.source_ts),evidence_count:1});
 }
 return {candidates:out,obstacles};
}
function candleCandidate({direction,entry,opportunity}){
 const event=opportunity?.newest_event,c=event?.candle||{},high=finite(c.high),low=finite(c.low);
 const classified=event?.minute_decomposition?.classification_allowed===true;
 if(!classified||high===null||low===null||low<=0||high<=low)return null;
 const width=high-low,target=direction==='LONG'?entry+width:entry-width;
 if(target<=0||!correctSide(direction,entry,target))return null;
 const potential=move(direction,entry,target);if(potential<MINIMUM_TECHNICAL_MOVE_PCT)return null;
 return {target_price:target,potential_move_pct:potential,basis:'MEASURED_ANOMALY_CANDLE_RANGE',basis_ru:'измеренная ширина подтверждаемой свечной аномалии',evidence_count:1,technical_inputs:{anomaly_high:high,anomaly_low:low,measured_range_pct:width/entry*100,event_id:event?.event_id??null}};
}

function verifiedStructure({direction,entry,structure}){
 if(structure?.basis!=='VERIFIED_HTX_MINUTE_PIVOT'||structure?.venue!=='HTX'||structure?.market_type!=='USDT_PERP'||
  !String(structure?.contract||'').endsWith('-USDT')||!Number.isSafeInteger(Number(structure?.source_ts))||
  !Number.isSafeInteger(Number(structure?.observed_ts))||Number(structure.source_ts)>Number(structure.observed_ts))return null;
 const price=finite(structure.price);if(price===null||!correctSide(direction,entry,price))return null;
 return {target_price:price,potential_move_pct:move(direction,entry,price),basis:'VERIFIED_HTX_MINUTE_PIVOT',
  basis_ru:'измеренный уровень прошлой цены на HTX',source_ts:structure.source_ts,evidence_count:1};
}

export function evaluateTechnicalMovePotential({direction,current_price,trigger_price=null,liquidation_zones=null,opportunity=null,structure_target=null,rolling_24h_change_pct=null,oi_change_pct=null,volume_ratio=null,funding_rate_pct=null,early_anomaly=false}={}){
 const d=text(direction).toUpperCase(),current=finite(current_price),trigger=finite(trigger_price)??current;
 const base={version:TECHNICAL_MOVE_POTENTIAL_VERSION,status:'NOT_CLOSED',reason:'TECHNICAL_TARGET_AT_LEAST_5_NOT_PROVEN',direction:d||null,entry_reference_price:trigger,minimum_move_pct:MINIMUM_TECHNICAL_MOVE_PCT,target_price:null,potential_move_pct:null,basis:null,basis_ru:null,not_random_target:true};
 if(!['LONG','SHORT'].includes(d)||current===null||current<=0||trigger===null||trigger<=0)return {...base,reason:'DIRECTION_OR_PRICE_NOT_CLOSED'};
 const liquidation=liquidationCandidates({direction:d,entry:trigger,zones:liquidation_zones});
 const structure=verifiedStructure({direction:d,entry:trigger,structure:structure_target});
 if(structure&&structure.potential_move_pct<MINIMUM_TECHNICAL_MOVE_PCT)return {...base,reason:'NEAREST_CONFIRMED_STRUCTURE_BELOW_5PCT',nearest_obstacle:structure};
 const candidates=[structure?.potential_move_pct>=MINIMUM_TECHNICAL_MOVE_PCT?structure:null,candleCandidate({direction:d,entry:trigger,opportunity}),...liquidation.candidates].filter(Boolean).sort((a,b)=>a.potential_move_pct-b.potential_move_pct||b.evidence_count-a.evidence_count);
 if(!candidates.length)return base;
 const chosen=candidates[0];
 const obstacles=liquidation.obstacles.filter(row=>row.move_pct>0&&row.move_pct<chosen.potential_move_pct).sort((a,b)=>a.move_pct-b.move_pct);
 if(obstacles.some(row=>row.move_pct<MINIMUM_TECHNICAL_MOVE_PCT))return{...base,reason:'NEAREST_CONFIRMED_OBSTACLE_BELOW_5PCT',nearest_obstacle:obstacles[0],path_obstacles:obstacles.slice(0,8)};
 return {...base,...chosen,status:'CLOSED',reason:null,all_candidates:candidates.slice(0,8),path_obstacles:obstacles.slice(0,8),begin_close_price:chosen.target_price,minimum_move_proven:true};
}

export default{TECHNICAL_MOVE_POTENTIAL_VERSION,MINIMUM_TECHNICAL_MOVE_PCT,evaluateTechnicalMovePotential};
