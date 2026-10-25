import {finite, positive, validTime, CANDLE_NATIVE_RELATIVE_KIND} from '../contracts/index.mjs';

export const pct = (from, to) => positive(from) && positive(to) ? (to / from - 1) * 100 : null;
export const median = xs => {
  const a = xs.filter(finite).slice().sort((x,y) => x-y), n = a.length;
  if(!n)return null;if(n%2)return a[(n-1)/2];
  const left=a[n/2-1],right=a[n/2],total=left+right;if(finite(total))return total/2;
  const difference=right-left;return finite(difference)?left+difference/2:left/2+right/2;
};
export const sum = xs => xs.reduce((a,b) => a+b, 0);
export const unique = xs => [...new Set(xs)];

// Compare decimal prices as published, without a fuzzy market threshold.
function fraction(value) {
  if (!finite(value)) throw Error('FINITE_DECIMAL_REQUIRED');
  const parts = String(value).toLowerCase().split('e'), exponent = Number(parts[1] ?? 0);
  const decimal = parts[0].split('.'), digits = decimal.join(''), scale = (decimal[1]?.length ?? 0)-exponent;
  return scale >= 0 ? [BigInt(digits),10n**BigInt(scale)] : [BigInt(digits)*10n**BigInt(-scale),1n];
}
export function growthAtLeast(price, anchor, percent) {
  if (!positive(price) || !positive(anchor) || !finite(percent)) return false;
  const [p,pd]=fraction(price),[a,ad]=fraction(anchor),[r,rd]=fraction(percent);
  return p*ad*100n*rd >= a*pd*(100n*rd+r);
}
export function plusTenPrice(price) {
  const [n,d]=fraction(price);
  return Number(n*11n)/Number(d*10n);
}

export function closedCandles(rows, at, interval, options={}) {
  if (!Array.isArray(rows)) return {rows:[],reason:'CANDLES_REQUIRED'};
  const map=new Map();
  for (const r of rows) {
    if (r?.closed !== true || !validTime(r.close_ts) || r.close_ts>at) continue;
    if (!validTime(r.open_ts) || r.close_ts-r.open_ts!==interval ||
        ![r.open,r.high,r.low,r.close].every(positive) || r.low>Math.min(r.open,r.close) || r.high<Math.max(r.open,r.close) ||
        [r.volume_base,r.turnover_quote].some(v=>v!==null&&v!==undefined&&(!finite(v)||v<0))) return {rows:[],reason:'INVALID_CANDLE'};
    const c={open_ts:r.open_ts,close_ts:r.close_ts,closed:true,open:r.open,high:r.high,low:r.low,close:r.close,
      volume_base:r.volume_base??null,turnover_quote:r.turnover_quote??null};
    const native=r.volume_native!==null&&r.volume_native!==undefined;
    if(native||options.native_comparison_key){
      const decimal=r.native_volume_decimal;
      if(!finite(r.volume_native)||r.volume_native<0||typeof decimal!=='string'||! /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(decimal)||
        !finite(Number(decimal))||Number(decimal)<0||Number(decimal)!==r.volume_native||r.native_quantity_unit!=='UNKNOWN'||r.comparison_kind!==CANDLE_NATIVE_RELATIVE_KIND||
        typeof r.volume_comparison_key!=='string'||!r.volume_comparison_key.endsWith('|/openApi/swap/v3/quote/klines|volume|'+interval)||
        options.native_comparison_key&&(r.volume_comparison_key!==options.native_comparison_key||c.volume_base!==null||c.turnover_quote!==null))return {rows:[],reason:'NATIVE_CANDLE_VOLUME_SCOPE_INVALID'};
      Object.assign(c,{volume_native:r.volume_native,native_volume_decimal:decimal,native_quantity_unit:r.native_quantity_unit,comparison_kind:r.comparison_kind,volume_comparison_key:r.volume_comparison_key});
    }
    if(r.native_time!==undefined&&(!validTime(r.native_time)||r.native_time!==r.open_ts)||r.native_time_semantics!==undefined&&r.native_time_semantics!=='OPEN_TIME')return {rows:[],reason:'CANDLE_TIME_PROVENANCE_INVALID'};
    for(const key of ['native_time','native_time_semantics','native_volume_decimal','time_evidence_ref','volume_evidence_ref'])if(r[key]!==undefined)c[key]=r[key];
    if (map.has(c.open_ts) && JSON.stringify(map.get(c.open_ts))!==JSON.stringify(c)) return {rows:[],reason:'CONFLICTING_CANDLES'};
    map.set(c.open_ts,c);
  }
  return {rows:[...map.values()].sort((a,b)=>a.open_ts-b.open_ts),reason:null};
}
export function windowRows(rows, end, duration, interval) {
  const xs=rows.filter(r=>r.open_ts>=end-duration&&r.close_ts<=end);
  return xs.length===duration/interval && xs.every((r,i)=>r.open_ts===end-duration+i*interval) ? xs : null;
}
export function completeInterval(rows, start, end) {
  if(end<=start)return end===start;
  let cursor=start;
  for(const r of rows.filter(r=>r.open_ts>=start&&r.close_ts<=end).sort((a,b)=>a.open_ts-b.open_ts)){
    if(r.open_ts>cursor)return false;
    cursor=Math.max(cursor,r.close_ts);
  }
  return cursor>=end;
}
