// Levels for an early watch come only from HTX candles already fetched by the
// deep check. The old anomaly may rank a coin, but cannot anchor a new entry.
export const FRESH_STRUCTURE_PLAN_VERSION='fresh-htx-minute-structure-v1-20260929';
const MINUTE=60_000;
const number=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):null;

export function deriveFreshStructure({direction,current_price,observed_ts,one_minute,contract}={}){
 const side=String(direction||'').toUpperCase(),price=number(current_price),now=number(observed_ts);
 const fail=reason=>({status:'NOT_CLOSED',reason,version:FRESH_STRUCTURE_PLAN_VERSION});
 if(!['LONG','SHORT'].includes(side)||!price||!now||!String(contract||'').endsWith('-USDT'))return fail('FRESH_STRUCTURE_IDENTITY_OR_PRICE');
 const candles=(Array.isArray(one_minute)?one_minute:[]).filter(row=>{
  const t=number(row?.ts),o=number(row?.open),h=number(row?.high),l=number(row?.low),c=number(row?.close);
  return Number.isSafeInteger(t)&&t%MINUTE===0&&t+MINUTE<=now&&t>=now-6*60*MINUTE&&
   o>0&&h>0&&l>0&&c>0&&h>=Math.max(o,c,l)&&l<=Math.min(o,c,h);
 }).sort((a,b)=>a.ts-b.ts);
 if(candles.length<35||candles.some((row,i)=>i&&row.ts===candles[i-1].ts))return fail('FRESH_MINUTE_BARS_INCOMPLETE');
 const latest=candles.at(-1);
 if(now-(latest.ts+MINUTE)>2*MINUTE)return fail('FRESH_MINUTE_BARS_STALE');
 const tail=candles.slice(-20);
 if(tail.some((row,i)=>i&&row.ts-tail[i-1].ts!==MINUTE))return fail('FRESH_MINUTE_BARS_GAP');
 const recent=tail.slice(-15),older=candles.slice(0,-15);
 const trigger=side==='LONG'?Math.max(...recent.map(x=>Number(x.high))):Math.min(...recent.map(x=>Number(x.low)));
 const cancel=side==='LONG'?Math.min(...recent.map(x=>Number(x.low))):Math.max(...recent.map(x=>Number(x.high)));
 if(side==='LONG'?! (cancel<price&&price<trigger):!(trigger<price&&price<cancel))return fail('FRESH_LEVEL_ALREADY_CROSSED_OR_CANCELLED');
 // A target is a previously traded local extreme, never a projected leverage
 // band or the width of an unrelated historical anomaly. Take the nearest
 // obstacle, so a nearer price level below 5% cannot be skipped.
 const pivots=[];
 for(let i=2;i<older.length-2;i++){
  const row=older[i],value=side==='LONG'?Number(row.high):Number(row.low);
  const neighbors=[older[i-2],older[i-1],older[i+1],older[i+2]];
  if(neighbors.some((x,j)=>x.ts!==row.ts+[-2,-1,1,2][j]*MINUTE))continue;
  if(side==='LONG'?neighbors.every(x=>Number(x.high)<value):neighbors.every(x=>Number(x.low)>value)){
   if(side==='LONG'?value>trigger:value<trigger)pivots.push({price:value,source_ts:row.ts});
  }
 }
 pivots.sort((a,b)=>Math.abs(a.price-trigger)-Math.abs(b.price-trigger));
 const nearest=pivots[0]||null;
 return {status:'CLOSED',version:FRESH_STRUCTURE_PLAN_VERSION,contract,direction:side,entry_price:trigger,invalidation_price:cancel,
  target:nearest?{price:nearest.price,source_ts:nearest.source_ts,basis:'VERIFIED_HTX_MINUTE_PIVOT',contract,venue:'HTX',market_type:'USDT_PERP',observed_ts:now}:null,
  candle_source:'HTX_CLOSED_ONE_MINUTE',latest_closed_ts:latest.ts,entry_source_ts:recent.at(-1).ts,entry_window_start_ts:recent[0].ts,
  candidate_pivot_count:pivots.length,price_at_decision:price};
}

export default {FRESH_STRUCTURE_PLAN_VERSION,deriveFreshStructure};
