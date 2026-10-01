const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));

export function normalizeClosedCandles(rows,{interval_ms,now=Date.now()}={}){
  const map=new Map();for(const row of rows||[]){const open=finite(row.open_ts??row.id),close=finite(row.close_ts)??(open===null?null:open+interval_ms),o=finite(row.open),h=finite(row.high),l=finite(row.low),c=finite(row.close);if(open===null||close===null||close>now||[o,h,l,c].some(x=>x===null))continue;map.set(open,{open_ts:open,close_ts:close,open:o,high:h,low:l,close:c,closed:true});}
  return [...map.values()].sort((a,b)=>a.open_ts-b.open_ts);
}

export function aggregateCandles(rows,{source_interval_ms,target_interval_ms,now=Date.now()}={}){
  const source=normalizeClosedCandles(rows,{interval_ms:source_interval_ms,now}),need=target_interval_ms/source_interval_ms;if(!Number.isInteger(need))return {status:'NOT_CLOSED',reason:'INTERVAL_RATIO_INVALID',candles:[]};
  const groups=new Map();for(const row of source){const bucket=Math.floor(row.open_ts/target_interval_ms)*target_interval_ms;(groups.get(bucket)||groups.set(bucket,[]).get(bucket)).push(row);}
  const out=[];for(const [bucket,part] of groups){part.sort((a,b)=>a.open_ts-b.open_ts);const complete=part.length===need&&part.every((x,i)=>x.open_ts===bucket+i*source_interval_ms)&&bucket+target_interval_ms<=now;if(!complete)continue;out.push({open_ts:bucket,close_ts:bucket+target_interval_ms,open:part[0].open,high:Math.max(...part.map(x=>x.high)),low:Math.min(...part.map(x=>x.low)),close:part.at(-1).close,closed:true,source_count:part.length});}
  return {status:'CLOSED',candles:out};
}

export function linkHistoricalAnomaly({historical,current_confirmation,now=Date.now()}={}){
  if(!historical?.event_id||!historical?.close_ts)return {status:'NOT_CLOSED',reason:'HISTORICAL_EVENT_REQUIRED'};
  const base={event_id:historical.event_id,close_ts:historical.close_ts,age_ms:now-historical.close_ts,original_classification:historical.classification,original_facts:historical.facts||[],timely:historical.timely===true};
  if(!current_confirmation?.event_id||current_confirmation.source_event_id!==historical.event_id)return {...base,status:'HISTORICAL_ONLY',promoted:false};
  return {...base,status:'FRESH_CONFIRMATION_LINKED',promoted:true,confirmation_event_id:current_confirmation.event_id,confirmation_ts:current_confirmation.close_ts};
}

export function comparableFundingDelta({current,baseline}={}){
  const cur=finite(current?.rate_per_hour),prior=finite(baseline?.rate_per_hour);if(cur===null||prior===null)return {status:'UNKNOWN',reason:'COMPARABLE_FUNDING_REQUIRED'};
  return {status:'CLOSED',rate_per_hour:cur,baseline_rate_per_hour:prior,funding_shift_per_hour:cur-prior,next_funding_ts:finite(current?.next_funding_ts)};
}

export function relativeMarketBehavior({candidate_return,btc_return,eth_return}={}){
  const c=finite(candidate_return),b=finite(btc_return),e=finite(eth_return);if(c===null)return {status:'UNKNOWN'};const benchmarks=[b,e].filter(x=>x!==null);if(!benchmarks.length)return {status:'UNKNOWN'};
  return {status:benchmarks.length===2?'CLOSED':'PARTIAL',candidate_return:c,btc_return:b,eth_return:e,relative_vs_btc:b===null?null:c-b,relative_vs_eth:e===null?null:c-e,absolute_direction:c>0?'RISING':c<0?'FALLING':'FLAT',description:c<0&&benchmarks.every(x=>c>x)?'FALLING_LESS_THAN_MARKET':c>0&&benchmarks.every(x=>c>x)?'RISING_FASTER_THAN_MARKET':'MIXED'};
}

export function normalizeMoneyFlow({quantity,price,initiator_side,coverage='PARTIAL',trade_id,venue,instrument}={}){
  const q=finite(quantity),p=finite(price),side=String(initiator_side||'').toUpperCase();if(q===null||p===null||!['BUY','SELL'].includes(side))return {status:'PARTIAL',directional_strength:null,notional_usd:null};
  return {status:coverage==='COMPLETE'?'CLOSED':'PARTIAL',venue,instrument,trade_id,notional_usd:q*p,initiator_side:side,directional_strength:side==='BUY'?1:-1,coverage};
}

export function evaluateTargetProof({level_type,level_price,current_price,direction,identity_ok,fresh_reference,path_clear,fresh_anchor,gross_move_pct,nearest_obstacle_move_pct=null}={}){
  const types=new Set(['OBSERVED_POSITION_LEVEL','PROVIDER_MODELLED_LEVEL','MEASURED_STRUCTURE_TARGET','SCENARIO_GEOMETRY']);if(!types.has(level_type))return {status:'NOT_CLOSED',reason:'LEVEL_TYPE_INVALID'};
  if(level_type==='SCENARIO_GEOMETRY')return {status:'RESEARCH_ONLY',minimum_move_proven:false,factual_cluster:false,measured_notional:null};
  if(fresh_anchor!==true)return {status:'WATCH_INTERNAL',reason:'FRESH_PROSPECTIVE_ANCHOR_REQUIRED',publishable:false};
  if(identity_ok!==true||fresh_reference!==true||path_clear!==true)return {status:'NOT_CLOSED',reason:'TARGET_PATH_OR_IDENTITY_NOT_CLOSED'};
  if(finite(gross_move_pct)===null||gross_move_pct<=0)return {status:'WATCH_INTERNAL',reason:'FAVORABLE_REMAINING_MOVE_NOT_PROVEN',publishable:false};
  return {status:'CLOSED',level_type,level_price,current_price,direction,favorable_move_proven:true,nearest_obstacle_move_pct:finite(nearest_obstacle_move_pct),publishable:true};
}

export function calculateNetScenario({direction,entry,target,invalidation,spread_pct=0,slippage_pct=0,fees_pct=0,funding_pct=null,max_hold_hours=24}={}){
  const e=finite(entry),t=finite(target),stop=finite(invalidation),costs=[spread_pct,slippage_pct,fees_pct].map(finite);if(!['LONG','SHORT'].includes(direction)||[e,t,stop,...costs].some(x=>x===null)||finite(funding_pct)===null)return {status:'NOT_CLOSED',reason:'COSTS_OR_LEVELS_UNKNOWN'};
  const gross=(direction==='LONG'?(t/e-1):(1-t/e))*100,risk=Math.abs((stop/e-1)*100),totalCost=costs.reduce((a,b)=>a+b,0)+Math.abs(funding_pct),net=gross-totalCost;
  return {status:net>0?'CLOSED':'NOT_CLOSED',gross_reward_pct:gross,net_reward_pct:net,risk_to_invalidation_pct:risk,net_rr:risk>0?net/risk:null,costs_pct:totalCost,max_hold_hours,automatic_trade:false};
}

const METRICS=Object.freeze({RELATIVE_STRENGTH:{unit:'PCT_POINT',directional:true},MONEY_FLOW_USD:{unit:'USD',directional:true},EXECUTION_RISK:{unit:'RATIO',directional:false}});
export function mapEvidenceMetric(row={}){const spec=METRICS[row.metric];if(!spec)return {applied:false,reason:'UNMAPPED_METRIC',contribution:0};if(['ERROR','STALE','WRONG_IDENTITY','UNKNOWN'].includes(row.status))return {applied:false,reason:'EVIDENCE_NOT_USABLE',contribution:0};const value=finite(row.value);if(value===null)return {applied:false,reason:'VALUE_UNKNOWN',contribution:0};return {applied:true,metric:row.metric,value,unit:spec.unit,directional:spec.directional,contribution:value};}

export function deduplicateEvidence(rows=[]){const seen=new Set(),out=[];for(const row of rows){const key=[row.upstream_venue,row.instrument,row.origin_event_id,row.window_start,row.window_end,row.score_owner_family].join('|');if(seen.has(key))continue;seen.add(key);out.push(row);}return out;}

export function internalScores({interest,gates=[]}={}){const i=finite(interest),closed=gates.filter(x=>x===true).length;return {candidate_quality_1_10:i===null?null:clamp(Math.round(i)/10,1,10),internal_gate_completion_0_100:gates.length===5?closed*20:null,entry_readiness_0_100:null,validated_entry_quality:false,visible:false};}
