export const PUMP_LIQUIDATION_ZONES_VERSION='pump-liquidation-zones-v1-20260924';
const finite=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
const text=v=>v===null||v===undefined?'':String(v).trim();
const strengthNumber=r=>finite(r?.notional_usdt??r?.cluster_notional_usd??r?.size_usd??r?.strength_score??r?.strength)??0;
function normalize(rows,kind,current){
 return (Array.isArray(rows)?rows:[]).map(r=>{
   const price=finite(r?.level_price??r?.price??r?.level);if(price===null||price<=0||!text(r?.source)||String(r?.status||'CLOSED').toUpperCase()!=='CLOSED')return null;
   const distance=(price/current-1)*100; const side=price>current?'ABOVE':price<current?'BELOW':'AT_PRICE';
   if(side==='AT_PRICE')return null;
   return {kind,price,range:r?.range??null,distance_pct:distance,side,strength_value:strengthNumber(r),strength_label:text(r?.strength_label)||null,source:text(r.source),source_ts:finite(r?.source_ts??r?.observed_ts),coverage:r?.coverage??null,freshness:r?.freshness??null,lifecycle:text(r?.lifecycle)||null,raw:r};
 }).filter(Boolean).filter(r=>!['SWEPT','INVALIDATED','EXPIRED'].includes(String(r.lifecycle||'').toUpperCase()));
}
function pickSide(rows,side){
 const xs=rows.filter(r=>r.side===side);if(!xs.length)return[];
 const nearest=[...xs].sort((a,b)=>Math.abs(a.distance_pct)-Math.abs(b.distance_pct)||b.strength_value-a.strength_value)[0];
 const largest=[...xs].sort((a,b)=>b.strength_value-a.strength_value||Math.abs(b.distance_pct)-Math.abs(a.distance_pct))[0];
 const out=[nearest];if(largest&&largest.price!==nearest.price)out.push(largest);
 const comparable=[...xs].filter(r=>!out.some(x=>x.price===r.price)).sort((a,b)=>b.strength_value-a.strength_value||Math.abs(a.distance_pct)-Math.abs(b.distance_pct))[0];
 if(comparable&&out.length<3){const top=Math.max(...xs.map(x=>x.strength_value));if(top===0||comparable.strength_value>=top*0.65)out.push(comparable);}
 return out.slice(0,3).map((r,i)=>({...r,selection_role:i===0?'NEAREST_STRONG':(r.price===largest?.price?'LARGEST_DISTANT':'COMPARABLE'),liquidated_side:side==='ABOVE'?'SELLERS':'BUYERS'}));
}
export function classifyPump24h(changePct){const x=finite(changePct);return{status:x===null?'NOT_CLOSED':'CLOSED',rolling_24h_change_pct:x,is_pump:x!==null&&x>=20,threshold_pct:20,inclusive:true};}
export function buildPumpLiquidationZones({rolling_24h_change_pct,current_price,realized=[],projected=[]}={}){
 const pump=classifyPump24h(rolling_24h_change_pct);const px=finite(current_price);
 if(pump.status!=='CLOSED'||px===null||px<=0)return{version:PUMP_LIQUIDATION_ZONES_VERSION,status:'NOT_CLOSED',pump,current_price:px,above:[],below:[],reason:'PUMP_OR_PRICE_NOT_CLOSED'};
 if(!pump.is_pump)return{version:PUMP_LIQUIDATION_ZONES_VERSION,status:'NOT_APPLICABLE',pump,current_price:px,above:[],below:[],reason:'ROLLING_24H_BELOW_20'};
 const rows=[...normalize(realized,'REALIZED',px),...normalize(projected,'PROJECTED',px)];
 const above=pickSide(rows,'ABOVE'),below=pickSide(rows,'BELOW');
 return{version:PUMP_LIQUIDATION_ZONES_VERSION,status:'CLOSED',pump,current_price:px,above,below,realized_projected_separate:true,distance_cap_pct:null,max_per_side:3,no_invented_levels:true,above_status:above.length?'CLOSED':'STRONG_ZONES_NOT_CONFIRMED',below_status:below.length?'CLOSED':'STRONG_ZONES_NOT_CONFIRMED'};
}
export default{PUMP_LIQUIDATION_ZONES_VERSION,classifyPump24h,buildPumpLiquidationZones};
