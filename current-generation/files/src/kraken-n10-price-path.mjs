// Pure provider preparation. The shared memory consumer supplies only existing
// originals; no SQL, HTTP or trading authority is granted by this module.
import {createHash} from 'node:crypto';
import {normalizeKrakenNativeFlow,qualifiedKrakenNativeComponent} from './kraken-four-hour-flow.mjs';
import {KRAKEN_PUBLIC_TAKER_REFERENCE} from './kraken-public-taker-reference.mjs';
import {APPROVED_HTX_ANALYSIS_CONTRACTS} from './approved-htx-analysis-scope.mjs';
export const KRAKEN_N10_PRICE_VERSION='kraken-n10-native-price-preparation-v1-20261019';
const COLLECTOR_VERSION='kraken-native-flow-collector-v1-20261010',M=60000,TTL=5*M;
// Historical N15/hourly archive cohort. It does not authorize a new global
// exclusion of ordinary N10 inputs; exact current HTX spot proof is still required.
export const KRAKEN_N10_OWNER_NO_EXTERNAL_SPOT=Object.freeze(['AKE','BR','BTR','CASHCAT','GPS','LAB','MYX','OKB','ONG','PAXG','RAVE','UB','USELESS','VELVET','哈基米'].map(s=>s+'-USDT'));
const approved=new Set(APPROVED_HTX_ANALYSIS_CONTRACTS.map(x=>x.contract_code));
const canonical=v=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const digest=v=>createHash('sha256').update(canonical(v)).digest('hex');
const positive=v=>typeof v==='string'&&/^\d+(\.\d+)?$/.test(v)&&Number.isFinite(Number(v))&&Number(v)>0?Number(v):null;
const safeOHLC=b=>[b.open,b.high,b.low,b.close].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>0)&&b.low<=b.high&&b.open>=b.low&&b.open<=b.high&&b.close>=b.low&&b.close<=b.high;

// Read a bounded existing N05 payload. Reconcile it again for the NEW price
// consumer; a CLOSED descriptor/digest alone never validates altered raw bars.
export function inspectKrakenN10CachedPricePath({contract,component,cache,now}={}){
 const fail=reason=>({version:KRAKEN_N10_PRICE_VERSION,status:'NO_QUALIFIED_KRAKEN_PRICE_PATH',reason,price_path:null,provider_http:0,cache_reads:0});
 try{
  const c=component,p=cache?.payload,end=c?.window_end_ts,start=end-240*M;
  if(!qualifiedKrakenNativeComponent(c,KRAKEN_PUBLIC_TAKER_REFERENCE)||c.contract!==contract||c.verified_minutes!==240||c.window_start_ts!==start) return fail('EXACT_QUALIFIED_N05_KRAKEN_COMPONENT_REQUIRED');
  if(![now,end,cache?.observed_ts,cache?.expires_ts].every(Number.isSafeInteger)||end%M||now<end||now-end>TTL||cache.observed_ts<end||cache.observed_ts>now||cache.observed_ts!==c.observed_ts||cache.expires_ts!==end+TTL||now>cache.expires_ts)return fail('ORIGINAL_CACHE_CLOCK_OR_CLOSED_WINDOW_REQUIRED');
  if(p?.version!==COLLECTOR_VERSION||p.observed_ts!==cache.observed_ts||Buffer.byteLength(JSON.stringify(p))>900000)return fail('BOUNDED_ORIGINAL_N05_CACHE_PAYLOAD_REQUIRED');
  const key=p.instrument?.altname,raw=p.candles?.result?.[key],last=p.candles?.result?.last;
  // result.last is an OHLC continuation cursor, never a substitute for the
  // explicit closed cutoff. The final native in-progress row is excluded.
  if(!Array.isArray(raw)||raw.length>721||!Number.isSafeInteger(last)||last<0||last*1000>now||Object.keys(p.candles.result).some(k=>k!==key&&k!=='last'))return fail('EXACT_BOUNDED_NATIVE_OHLC_RESULT_REQUIRED');
  if(!Array.isArray(p.pages)||!p.pages.length||p.pages.length>3)return fail('BOUNDED_RAW_HISTORY_REQUIRED');
  let previousCursor=null;
  for(const page of p.pages){
   const cursor=page?.result?.last;
   if(typeof cursor!=='string'||!/^\d{1,24}$/.test(cursor)||previousCursor!==null&&BigInt(cursor)<=previousCursor||Object.keys(page.result).some(k=>k!==key&&k!=='last'))return fail('NATIVE_HISTORY_CURSOR_NOT_CLOSED');
   previousCursor=BigInt(cursor);
  }
  const rebuilt=normalizeKrakenNativeFlow({contract,identity:c.identity,instrument:p.instrument,candles:p.candles,pages:p.pages,window_end_ts:end,observed_ts:cache.observed_ts,direction_reference:KRAKEN_PUBLIC_TAKER_REFERENCE});
  if(!qualifiedKrakenNativeComponent(rebuilt,KRAKEN_PUBLIC_TAKER_REFERENCE)||canonical(rebuilt)!==canonical(Object.fromEntries(Object.keys(rebuilt).map(k=>[k,c[k]]))))return fail('RAW_NATIVE_FLOW_OR_COMPONENT_REDERIVATION_MISMATCH');
  const bars=raw.filter(r=>r[0]*1000>=start&&r[0]*1000<end).map(r=>({ts:r[0]*1000,closed_end:r[0]*1000+M-1,open:positive(r[1]),high:positive(r[2]),low:positive(r[3]),close:positive(r[4]),activity:r[7]})).sort((a,b)=>a.ts-b.ts);
  if(bars.length!==240||!bars.every((b,i)=>b.ts===start+i*M&&safeOHLC(b)&&Number.isSafeInteger(b.activity)&&b.activity>=0))return fail('EXACT_240_NATIVE_CLOSED_MINUTES_REQUIRED');
  // Flow reconciliation alone does not prove OHLC prices. This new consumer
  // also compares each traded minute with its retained raw execution prices.
  const prices=new Map();let priorTime=-1;
  for(const page of p.pages)for(const trade of page.result[key]){
   if(trade[2]<priorTime)return fail('NATIVE_TRADE_PRICE_ORDER_REQUIRED');priorTime=trade[2];
   const ts=Math.floor(trade[2]*1000),minute=Math.floor(ts/M)*M;
   if(ts<start||ts>=end)continue;
   if(!prices.has(minute))prices.set(minute,[]);prices.get(minute).push(Number(trade[0]));
  }
  for(let i=0;i<bars.length;i++){
   const bar=bars[i],xs=prices.get(bar.ts)||[];
   if(xs.length&&(bar.open!==xs[0]||bar.close!==xs.at(-1)||bar.high!==Math.max(...xs)||bar.low!==Math.min(...xs)))return fail('NATIVE_OHLC_NOT_RECONCILED_TO_RAW_TRADE_PRICES');
   if(!xs.length&&(bar.open!==bar.high||bar.open!==bar.low||bar.open!==bar.close||i>0&&bar.close!==bars[i-1].close))return fail('IDLE_NATIVE_MINUTE_NOT_CARRY_FORWARD_PRICE');
  }
  const recent=bars.slice(-15),active=recent.filter(b=>b.activity>0).length,trades=recent.reduce((n,b)=>n+b.activity,0);
  if(!active||trades!==rebuilt.recent_windows.find(w=>w.minutes===15)?.trade_count)return fail('NO_RECONCILED_RECENT_PRICE_ACTIVITY');
  const open=recent[0].open,close=recent.at(-1).close;
  const price_path={version:KRAKEN_N10_PRICE_VERSION,contract,venue:'KRAKEN',market:'SPOT',quote:'USDT',source_ts:end,observed_ts:now,first_known_ts:cache.observed_ts,expires_at:cache.expires_ts,window_start:end-15*M,window_end:end,candle_count:15,native_grid_count:240,active_minute_count:active,recent_trade_count:trades,path_open:open,path_high:Math.max(...recent.map(b=>b.high)),path_low:Math.min(...recent.map(b=>b.low)),path_close:close,change_pct:(close/open-1)*100,raw_price_bars:recent,identity:c.identity,source_cache_binding:{schema:'KRAKEN_N10_REDERIVED_CACHE_BINDING_V1',source:'N05_OFFICIAL_FLOW:KRAKEN',asset_key:`NATIVE_FLOW:${contract}:${end}`,cache_observed_ts:cache.observed_ts,cache_expires_ts:cache.expires_ts,cache_payload_sha256:digest(p),rederived_component_sha256:digest(rebuilt),selected_price_bars_sha256:digest(recent)},source_clock_policy:'ORIGINAL_N05_KRAKEN_REDERIVED_CLOSED_240M_CACHE',native_quote_volume_available:false,provider_http:0,score_contribution:0,directional_strength:null,risk_strength:null,coverage_fraction:0,entry_authorized:false,liquidation_as_target:false,comparison_status:'HTX_SAME_WINDOW_ORIGINAL_NOT_SUPPLIED',runtime_admission_proven:false};
  return{version:KRAKEN_N10_PRICE_VERSION,status:'CLOSED_WITHIN_KRAKEN_PRICE_PATH',price_path,provider_http:0,cache_reads:0,runtime_input_qualified:false};
 }catch{return fail('MALFORMED_NATIVE_PRICE_INPUT');}
}

// A saved old spot catalog establishes historical pair presence only. Runtime
// preparation additionally requires an already collected exact fresh HTX spot
// reply for the same closed minute window. The archive cohort grants no admission.
export function prepareKrakenN10RuntimeInput(params={}){
 const {contract,htx_spot_kline:s,now}=params,denied=reason=>({version:KRAKEN_N10_PRICE_VERSION,status:reason,price_path:null,runtime_input_qualified:false,provider_http:0,cache_reads:0});
 if(!approved.has(contract))return denied('APPROVED_HTX_CONTRACT_REQUIRED');
 const inspected=inspectKrakenN10CachedPricePath(params);if(!inspected.price_path)return{...inspected,runtime_input_qualified:false};
 const p=s?.payload,end=inspected.price_path.window_end,start=end-15*M,symbol=contract.slice(0,-5).toLowerCase()+'usdt';
 if(s?.market!=='SPOT'||s.contract!==contract||p?.status!=='ok'||p.ch!==`market.${symbol}.kline.1min`||![s.received_ts,p.ts].every(Number.isSafeInteger)||p.ts<end||p.ts>s.received_ts||s.received_ts>now||now-p.ts>3*M||!Array.isArray(p.data)||p.data.length>2000)return denied('CURRENT_EXACT_HTX_SPOT_REPLY_REQUIRED');
 const bars=p.data.filter(r=>Number.isSafeInteger(r?.id)&&r.id*1000>=start&&r.id*1000<end).sort((a,b)=>a.id-b.id);
 if(bars.length!==15||!bars.every((r,i)=>r.id*1000===start+i*M&&safeOHLC(r)&&typeof r.vol==='number'&&Number.isFinite(r.vol)&&r.vol>=0)||!bars.some(r=>r.vol>0))return denied('CURRENT_HTX_SPOT_CLOSED_WINDOW_REQUIRED');
 return{...inspected,status:'CLOSED_KRAKEN_N10_INPUT_PENDING_SHARED_INTEGRATION',runtime_input_qualified:true,price_path:{...inspected.price_path,htx_spot_presence_binding:{contract,channel:p.ch,source_ts:p.ts,received_ts:s.received_ts,raw_reply_sha256:digest(p)},runtime_admission_proven:false}};
}
export function verifyKrakenN10CachedPricePath(path,params={}){
 const rebuilt=inspectKrakenN10CachedPricePath(params).price_path;
 return Boolean(rebuilt&&canonical(rebuilt)===canonical(path));
}
