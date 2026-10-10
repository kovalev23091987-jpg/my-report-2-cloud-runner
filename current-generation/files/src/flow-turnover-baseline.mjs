export const FLOW_TURNOVER_BASELINE_VERSION='flow-turnover-baseline-v1-20261010';
const decimal=v=>{if(typeof v!=='string'||!/^\d+(\.\d+)?$/.test(v))throw Error('INVALID_DECIMAL');const[a,b='']=v.split('.');if(b.length>18)throw Error('DECIMAL_PRECISION_UNSUPPORTED');return BigInt(a+b)*10n**BigInt(18-b.length);};
const number=n=>{const r=Number(n)/1e18;if(!Number.isFinite(r))throw Error('NONFINITE_TURNOVER');return r;};
export function turnoverHistoryEnd(flow_window_start_ts){return Math.floor(flow_window_start_ts/3600000)*3600000;}
export function normalizeTurnoverBaseline({contract,venue,market='SPOT',quote='USDT',candles,history_end_ts,observed_ts,current_flow}={}){
 const start=history_end_ts-30*86400000,root={version:FLOW_TURNOVER_BASELINE_VERSION,status:'TURNOVER_HISTORY_NOT_CLOSED',check_completed:false,contract,venue,market,quote,history_start_ts:start,history_end_ts,observed_ts,score_contribution:0,entry_authorized:false,individual_trade_size_calibration:false,price_impact_calibration:false,direction_prediction:false};
 try{
  if(!['BINANCE','GATE'].includes(venue)||market!=='SPOT'||quote!=='USDT'||current_flow?.check_completed!==true||current_flow.contract!==contract||current_flow.venue!==venue||current_flow.market!==market||current_flow.quote!==quote||current_flow.window_end_ts-current_flow.window_start_ts!==14400000||current_flow.exact_asset_binding!==true)throw Error('QUALIFIED_SAME_VENUE_FLOW_REQUIRED');
  if(!Number.isSafeInteger(history_end_ts)||history_end_ts%3600000||history_end_ts!==turnoverHistoryEnd(current_flow.window_start_ts)||!Number.isSafeInteger(observed_ts)||observed_ts<history_end_ts||observed_ts<current_flow.observed_ts)throw Error('HISTORY_MUST_PRECEDE_CURRENT_WINDOW');
  if(!Array.isArray(candles)||candles.length!==720)throw Error('EXACT_720_CLOSED_HOURS_REQUIRED');
  const rows=candles.map(r=>{
   if(!Array.isArray(r))throw Error('INVALID_HOURLY_CANDLE');let ts,q,b,ohlc;
   if(venue==='BINANCE'){if(r.length!==12||r[6]!==r[0]+3599999||!Number.isSafeInteger(r[8])||r[8]<0)throw Error('INVALID_NATIVE_HOUR');ts=r[0];q=decimal(r[7]);b=decimal(r[5]);ohlc=[r[1],r[2],r[3],r[4]];if(decimal(r[9])>b||decimal(r[10])>q||(r[8]===0&&(q||b)))throw Error('INVALID_NATIVE_HOURLY_VOLUME');}
   else{if(r.length!==8||r[7]!=='true'||!/^\d+$/.test(r[0]))throw Error('INVALID_NATIVE_HOUR');ts=Number(r[0])*1000;q=decimal(r[1]);b=decimal(r[6]);ohlc=[r[5],r[3],r[4],r[2]];}
   const[o,h,l,c]=ohlc.map(decimal);if(l<=0n||o<l||o>h||c<l||c>h||h<l||Boolean(q)!==Boolean(b))throw Error('INVALID_NATIVE_HOURLY_PRICE_OR_VOLUME');
   return{ts,q};
  }).sort((a,b)=>a.ts-b.ts);
  if(rows.some((r,i)=>r.ts!==start+i*3600000))throw Error('GAPPED_DUPLICATE_OR_FOREIGN_HOURS');
  const windows=Array.from({length:180},(_,i)=>rows.slice(i*4,i*4+4).reduce((n,r)=>n+r.q,0n)),sorted=[...windows].sort((a,b)=>a<b?-1:a>b?1:0),median=(sorted[89]+sorted[90])/2n,total=windows.reduce((n,r)=>n+r,0n),current=current_flow.buy_quote+current_flow.sell_quote;
  if(total===0n||!Number.isFinite(current)||current<=0)throw Error('POSITIVE_TURNOVER_REFERENCE_REQUIRED');
  return{...root,status:'CLOSED_30DAY_PRIOR_HOURLY_TURNOVER_BASELINE',check_completed:true,verified_hours:720,complete_nonoverlapping_four_hour_samples:180,median_four_hour_quote:number(median),p95_four_hour_quote:number(sorted[Math.ceil(180*.95)-1]),mean_four_hour_quote:number(total)/180,current_four_hour_quote:current,ratio_to_median:median?current/number(median):null,current_empirical_percentile_pct:100*windows.filter(v=>number(v)<=current).length/180,source_clock_policy:'IMMUTABLE_NATIVE_CLOSED_PRIOR_HOURS',history_quote_total:number(total),calibration_scope:'DESCRIPTIVE_VENUE_TURNOVER_ONLY_NOT_LARGE_TRADE_OR_OUTCOME'};
 }catch(e){return{...root,reason:e.message};}
}
