import {createHash} from 'node:crypto';
export const FLOW_TURNOVER_BASELINE_VERSION='flow-turnover-baseline-v1-20261010';
const HOUR=3600000,DAY=86400000,sha=value=>createHash('sha256').update(value).digest('hex'),digest=value=>sha(JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v));
const baselineFields='version status check_completed contract venue market quote history_start_ts history_end_ts observed_ts score_contribution entry_authorized individual_trade_size_calibration price_impact_calibration direction_prediction verified_hours complete_nonoverlapping_four_hour_samples median_four_hour_quote p95_four_hour_quote mean_four_hour_quote current_four_hour_quote ratio_to_median current_empirical_percentile_pct source_clock_policy history_quote_total calibration_scope'.split(' '),baselineFacts=b=>Object.fromEntries(baselineFields.map(k=>[k,b[k]]));
export function turnoverHistoryRequestURL({contract,venue,history_end_ts}={}){
 if(!/^[^-\s]{1,32}-USDT$/u.test(contract||'')||!['BINANCE','GATE'].includes(venue)||!Number.isSafeInteger(history_end_ts)||history_end_ts%HOUR)return null;
 const base=contract.slice(0,-5),start=history_end_ts-30*DAY;
 return venue==='BINANCE'?`https://data-api.binance.vision/api/v3/klines?symbol=${encodeURIComponent(base+'USDT')}&interval=1h&startTime=${start}&endTime=${history_end_ts-1}&limit=720`:`https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=${encodeURIComponent(base+'_USDT')}&from=${start/1000}&to=${history_end_ts/1000-1}&interval=1h`;
}
export function qualifiedTurnoverFlowScope({contract,flow,now}={}){
 return Boolean(turnoverHistoryRequestURL({contract,venue:flow?.venue,history_end_ts:turnoverHistoryEnd(flow?.window_start_ts)})&&Number.isSafeInteger(now)&&flow?.contract===contract&&flow.check_completed===true&&flow.exact_asset_binding===true&&flow.market==='SPOT'&&flow.quote==='USDT'&&Number.isSafeInteger(flow.window_start_ts)&&flow.window_start_ts%60000===0&&flow.window_end_ts-flow.window_start_ts===4*HOUR&&flow.window_end_ts<=now&&Number.isSafeInteger(flow.observed_ts)&&flow.observed_ts>=flow.window_end_ts&&flow.observed_ts<=now&&[flow.buy_quote,flow.sell_quote].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0)&&flow.buy_quote+flow.sell_quote>0);
}
export function qualifiedTurnoverHistoryCache(cached,{contract,venue,history_end_ts,now}={}){
 const url=turnoverHistoryRequestURL({contract,venue,history_end_ts}),receipt=cached?.receipt,observed=cached?.observed_ts,expires=history_end_ts+10*HOUR;
 if(!url||cached?.version!==FLOW_TURNOVER_BASELINE_VERSION||!Array.isArray(cached.candles)||!Number.isSafeInteger(observed)||observed<history_end_ts||observed>now||cached.cache_observed_ts!==observed||cached.cache_expires_ts!==expires||expires<=now||receipt?.url!==url||receipt.http_status!==200||receipt.received_ts!==observed||!/^[a-f0-9]{64}$/.test(receipt.body_sha256||''))return false;
 const parsed=digest(cached.candles),s=cached.cache_scope;
 // Old compact originals are verifiable without a migration HTTP. With no
 // saved wire or parsed digest, a different JSON serialization is unbound.
 if(!s)return parsed===receipt.body_sha256;
 return s.schema==='N05_TURNOVER_CACHE_SCOPE_V1'&&s.contract===contract&&s.venue===venue&&s.market==='SPOT'&&s.quote==='USDT'&&s.request_url===url&&s.history_start_ts===history_end_ts-30*DAY&&s.history_end_ts===history_end_ts&&s.observed_ts===observed&&s.expires_at===expires&&s.body_sha256===receipt.body_sha256&&s.candles_sha256===parsed;
}
export function bindTurnoverHistory(baseline,{contract,venue,candles,receipt}={}){
 if(!baseline?.check_completed)return baseline;
 const {history_binding,first_known_ts,expires_at,...facts}=baseline;
 return{...facts,first_known_ts:facts.observed_ts,expires_at:facts.history_end_ts+10*HOUR,history_binding:{schema:'N05_TURNOVER_HISTORY_BINDING_V1',contract,venue,market:'SPOT',quote:'USDT',request_url:receipt.url,history_start_ts:facts.history_start_ts,history_end_ts:facts.history_end_ts,observed_ts:facts.observed_ts,expires_at:facts.history_end_ts+10*HOUR,body_sha256:receipt.body_sha256,candles_sha256:digest(candles),baseline_sha256:digest(baselineFacts(facts))}};
}
export function qualifiedTurnoverBaseline(baseline,flow,now){
 if(!qualifiedTurnoverFlowScope({contract:flow?.contract,flow,now})||now-flow.window_end_ts>300000||!baseline||baseline.version!==FLOW_TURNOVER_BASELINE_VERSION||baseline.status!=='CLOSED_30DAY_PRIOR_HOURLY_TURNOVER_BASELINE'||baseline.check_completed!==true)return false;
 const {history_binding:s,first_known_ts,expires_at,receipts,network_calls,cache_write_receipts,...facts}=baseline,end=turnoverHistoryEnd(flow.window_start_ts);
 if(!s||baseline.contract!==flow.contract||baseline.venue!==flow.venue||baseline.market!=='SPOT'||baseline.quote!=='USDT'||baseline.history_end_ts!==end||baseline.history_start_ts!==end-30*DAY||!Number.isSafeInteger(baseline.observed_ts)||baseline.observed_ts<end||baseline.observed_ts>now||first_known_ts!==baseline.observed_ts||expires_at!==end+10*HOUR||expires_at<=now||baseline.verified_hours!==720||baseline.complete_nonoverlapping_four_hour_samples!==180||baseline.source_clock_policy!=='IMMUTABLE_NATIVE_CLOSED_PRIOR_HOURS'||baseline.calibration_scope!=='DESCRIPTIVE_VENUE_TURNOVER_ONLY_NOT_LARGE_TRADE_OR_OUTCOME'||baseline.score_contribution!==0||baseline.entry_authorized!==false||baseline.individual_trade_size_calibration!==false||baseline.price_impact_calibration!==false||baseline.direction_prediction!==false)return false;
 const median=baseline.median_four_hour_quote,current=flow.buy_quote+flow.sell_quote;
 if(![median,baseline.p95_four_hour_quote,baseline.mean_four_hour_quote,baseline.history_quote_total,baseline.current_empirical_percentile_pct,baseline.ratio_to_median].every(n=>typeof n==='number'&&Number.isFinite(n))||median<=0||baseline.p95_four_hour_quote<median||baseline.mean_four_hour_quote<=0||baseline.history_quote_total<=0||Math.abs(baseline.mean_four_hour_quote*180-baseline.history_quote_total)>Math.max(.000001,baseline.history_quote_total*.000001)||baseline.current_four_hour_quote!==current||baseline.ratio_to_median!==current/median||baseline.current_empirical_percentile_pct<0||baseline.current_empirical_percentile_pct>100)return false;
 return s.schema==='N05_TURNOVER_HISTORY_BINDING_V1'&&s.contract===flow.contract&&s.venue===flow.venue&&s.market==='SPOT'&&s.quote==='USDT'&&s.request_url===turnoverHistoryRequestURL({contract:flow.contract,venue:flow.venue,history_end_ts:end})&&s.history_start_ts===baseline.history_start_ts&&s.history_end_ts===end&&s.observed_ts===baseline.observed_ts&&s.expires_at===expires_at&&/^[a-f0-9]{64}$/.test(s.body_sha256||'')&&/^[a-f0-9]{64}$/.test(s.candles_sha256||'')&&s.baseline_sha256===digest(baselineFacts(facts));
}
const decimal=v=>{if(typeof v!=='string'||!/^\d+(\.\d+)?$/.test(v))throw Error('INVALID_DECIMAL');const[a,b='']=v.split('.');if(b.length>18)throw Error('DECIMAL_PRECISION_UNSUPPORTED');return BigInt(a+b)*10n**BigInt(18-b.length);};
const number=n=>{const r=Number(n)/1e18;if(!Number.isFinite(r))throw Error('NONFINITE_TURNOVER');return r;};
export function turnoverHistoryEnd(flow_window_start_ts){return Math.floor(flow_window_start_ts/3600000)*3600000;}
export function normalizeTurnoverBaseline({contract,venue,market='SPOT',quote='USDT',candles,history_end_ts,observed_ts,current_flow}={}){
 const start=history_end_ts-30*86400000,root={version:FLOW_TURNOVER_BASELINE_VERSION,status:'TURNOVER_HISTORY_NOT_CLOSED',check_completed:false,contract,venue,market,quote,history_start_ts:start,history_end_ts,observed_ts,score_contribution:0,entry_authorized:false,individual_trade_size_calibration:false,price_impact_calibration:false,direction_prediction:false};
 try{
  if(!['BINANCE','GATE'].includes(venue)||market!=='SPOT'||quote!=='USDT'||current_flow?.check_completed!==true||current_flow.contract!==contract||current_flow.venue!==venue||current_flow.market!==market||current_flow.quote!==quote||current_flow.window_end_ts-current_flow.window_start_ts!==14400000||current_flow.exact_asset_binding!==true)throw Error('QUALIFIED_SAME_VENUE_FLOW_REQUIRED');
  if(!Number.isSafeInteger(history_end_ts)||history_end_ts%3600000||history_end_ts!==turnoverHistoryEnd(current_flow.window_start_ts)||!Number.isSafeInteger(observed_ts)||observed_ts<history_end_ts)throw Error('HISTORY_MUST_PRECEDE_CURRENT_WINDOW');
  if(!Array.isArray(candles)||candles.length!==720)throw Error('EXACT_720_CLOSED_HOURS_REQUIRED');
  const rows=candles.map(r=>{
   if(!Array.isArray(r))throw Error('INVALID_HOURLY_CANDLE');let ts,q,b,ohlc;
   if(venue==='BINANCE'){if(r.length!==12||r[6]!==r[0]+3599999||!Number.isSafeInteger(r[8])||r[8]<0)throw Error('INVALID_NATIVE_HOUR');ts=r[0];q=decimal(r[7]);b=decimal(r[5]);ohlc=[r[1],r[2],r[3],r[4]];if(decimal(r[9])>b||decimal(r[10])>q||(r[8]===0&&(q||b))||(r[8]>0&&(!q||!b)))throw Error('INVALID_NATIVE_HOURLY_VOLUME');}
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
