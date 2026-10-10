const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
export const HORIZONS=Object.freeze({h1:3600000,h4:14400000,h12:43200000,h24:86400000});
export function deliveredEntryCohort({publication,dispatch,relay_receipt}={}){const included=publication?.event==='ENTRY'&&dispatch?.publication_id===publication?.publication_id&&dispatch?.dispatch_id===relay_receipt?.dispatch_id&&relay_receipt?.state==='SENT'&&Number(relay_receipt?.message_id)>0&&dispatch?.recipient_identity===relay_receipt?.recipient_identity;return {included,status:included?'DELIVERED_ENTRY':'ANALYTICAL_ONLY',sample_key:included?[publication.generation,publication.wave_id,publication.direction,publication.publication_id,dispatch.dispatch_id].join('|'):null};}
export function selectEntryAnchor({direction,delivery_ts,quotes,notional_usd}={}){const type=direction==='LONG'?'EXECUTABLE_ASK':'EXECUTABLE_BID',rows=(quotes||[]).filter(q=>q.type===type&&q.source_ts>=delivery_ts&&q.source_ts<=delivery_ts+30000&&q.notional_usd===notional_usd&&finite(q.value)>0).sort((a,b)=>a.source_ts-b.source_ts);if(!rows.length)return {status:'ENTRY_REFERENCE_UNAVAILABLE'};const q=rows[0];return {status:'CLOSED',anchor_price:Number(q.value),anchor_ts:q.source_ts,delivery_delay_ms:q.source_ts-delivery_ts,type,notional_usd};}
export function selectHorizonEndpoint({anchor_ts,horizon,candles}={}) {
  const duration=Object.hasOwn(HORIZONS,horizon)?HORIZONS[horizon]:null;
  if(!Number.isFinite(anchor_ts)||duration===null)return {status:'CENSORED_INVALID_INPUT',target_ts:null};
  const target=anchor_ts+duration;
  const rows=(candles||[]).filter(x=>x.closed===true&&Number.isFinite(x.close_ts)&&x.close_ts<=target&&target-x.close_ts<=60000).sort((a,b)=>b.close_ts-a.close_ts);
  if(!rows.length)return {status:'CENSORED_MISSING_HISTORY',target_ts:target};
  const close=finite(rows[0].close);
  if(close===null||close<=0)return {status:'CENSORED_INVALID_HISTORY',target_ts:target};
  return {status:'CLOSED',target_ts:target,endpoint_ts:rows[0].close_ts,close};
}
export function evaluatePricePath({direction,anchor_price,target_price,invalidation_price,candles}={}) {
  const unknown={target_touch:null,invalidation_touch:null,mfe_pct:null,mae_pct:null};
  if(!['LONG','SHORT'].includes(direction)||[anchor_price,target_price,invalidation_price].some(v=>finite(v)===null||Number(v)<=0))return {status:'CENSORED_INVALID_INPUT',...unknown};
  const rows=(candles||[]).filter(x=>x.closed===true);
  if(!rows.length)return {status:'CENSORED_MISSING_HISTORY',...unknown};
  if(rows.some(x=>finite(x.high)===null||finite(x.low)===null||Number(x.low)<=0||Number(x.high)<Number(x.low)))return {status:'CENSORED_INVALID_HISTORY',...unknown};
  const high=Math.max(...rows.map(x=>Number(x.high))),low=Math.min(...rows.map(x=>Number(x.low)));
  const targetTouch=direction==='LONG'?high>=target_price:low<=target_price;
  const invalidationTouch=direction==='LONG'?low<=invalidation_price:high>=invalidation_price;
  const ambiguous=rows.some(x=>direction==='LONG'?Number(x.high)>=target_price&&Number(x.low)<=invalidation_price:Number(x.low)<=target_price&&Number(x.high)>=invalidation_price);
  const favorable=direction==='LONG'?(high/anchor_price-1)*100:(1-low/anchor_price)*100;
  const adverse=direction==='LONG'?(low/anchor_price-1)*100:(1-high/anchor_price)*100;
  return {status:ambiguous?'AMBIGUOUS_PATH':'CLOSED',target_touch:targetTouch,invalidation_touch:invalidationTouch,mfe_pct:favorable,mae_pct:adverse};
}
export function calculateOutcome({direction,anchor_price,endpoint_price,costs}={}) {
  const provenance=costs?.provenance||null;
  if(!['LONG','SHORT'].includes(direction)||[anchor_price,endpoint_price].some(v=>finite(v)===null||Number(v)<=0))return {gross_return_pct:null,net_return_pct:null,net_status:'CENSORED_INVALID_PRICE',costs_provenance:provenance};
  const gross=direction==='LONG'?(endpoint_price/anchor_price-1)*100:(1-endpoint_price/anchor_price)*100;
  const known=['fees_pct','spread_slippage_pct','funding_pct'].every(k=>finite(costs?.[k])!==null);
  const total=known?Number(costs.fees_pct)+Number(costs.spread_slippage_pct)+Number(costs.funding_pct):null;
  return {gross_return_pct:gross,net_return_pct:known?gross-total:null,net_status:known?'MODELLED_COMPLETE':'COST_INCOMPLETE',costs_provenance:provenance};
}
export function selectMatureOutcomes(rows,{now=Date.now(),limit=8}={}){const selected=[],skipped=[];for(const row of rows||[]){if(row.status!=='PENDING'||row.due_ts>now)continue;if(!row.history_available){skipped.push({...row,next_status:Number(row.attempts)>=2||now-row.due_ts>=86400000?'CENSORED_MISSING_HISTORY':'RETRY'});continue;}if(selected.length<limit)selected.push(row);}return {selected,skipped,cursor_advanced:(rows||[]).length,limit};}
