// Pure preparation of an already retained Bitfinex USD price path.
// No production caller, I/O, FX conversion or HTX price comparison.
import {createHash} from 'node:crypto';
import {normalizeBitfinexNativeFlow,qualifiedBitfinexNativeComponent,bitfinexNativeMarket} from './bitfinex-native-four-hour-flow.mjs';
import {APPROVED_HTX_ANALYSIS_CONTRACTS} from './approved-htx-analysis-scope.mjs';
export const BITFINEX_N10_PRICE_VERSION='bitfinex-n10-native-usd-price-path-v1-20261019';
const CACHE_VERSION='bitfinex-native-flow-collector-v1-20261011',M=60000,TTL=5*M;
const approved=new Set(APPROVED_HTX_ANALYSIS_CONTRACTS.map(c=>c.contract_code));
const canonical=x=>JSON.stringify(x,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const sha=x=>createHash('sha256').update(canonical(x)).digest('hex');
const wirePayloadSha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const safeBar=b=>[b.open,b.close,b.high,b.low,b.base_volume].every(x=>typeof x==='number'&&Number.isFinite(x)&&x>0)&&b.low<=b.high&&b.open>=b.low&&b.open<=b.high&&b.close>=b.low&&b.close<=b.high;

export function inspectBitfinexN10CachedPricePath({contract,component:c,cache,now}={}){
 const fail=reason=>({version:BITFINEX_N10_PRICE_VERSION,status:'NO_QUALIFIED_BITFINEX_USD_PRICE_PATH',reason,price_path:null,runtime_input_qualified:false,provider_http:0,cache_reads:0});
 try{
  const end=c?.window_end_ts,start=end-240*M,p=cache?.payload;
  if(!approved.has(contract)||!qualifiedBitfinexNativeComponent(c)||c.contract!==contract||c.window_start_ts!==start)return fail('EXACT_QUALIFIED_N05_BITFINEX_COMPONENT_REQUIRED');
  if(![now,end,cache?.observed_ts,cache?.expires_ts].every(Number.isSafeInteger)||end%M||cache.observed_ts<end||cache.observed_ts>now||cache.observed_ts!==c.observed_ts||cache.expires_ts!==end+TTL||now>cache.expires_ts)return fail('ORIGINAL_CACHE_CLOCK_OR_CLOSED_WINDOW_REQUIRED');
  if(p?.version!==CACHE_VERSION||p.observed_ts!==cache.observed_ts||Buffer.byteLength(JSON.stringify(p))>900000)return fail('BOUNDED_ORIGINAL_N05_PAYLOAD_REQUIRED');
  const pair=bitfinexNativeMarket(contract),r=p.trade_receipt;
  if(r?.url!==`https://api-pub.bitfinex.com/v2/trades/t${pair}/hist?start=${start}&end=${end-1}&limit=10000&sort=1`||r.http_status!==200||r.received_ts!==cache.observed_ts||!hex(r.body_sha256)||!hex(r.payload_sha256)||r.payload_sha256!==wirePayloadSha(p.trades))return fail('EXACT_ORIGINAL_BOUNDED_TRADE_RECEIPT_REQUIRED');
  const rebuilt=normalizeBitfinexNativeFlow({contract,identity:c.identity,catalog:p.catalog,candles:p.candles,trades:p.trades,window_end_ts:end,observed_ts:cache.observed_ts});
  if(!qualifiedBitfinexNativeComponent(rebuilt)||canonical(rebuilt)!==canonical(Object.fromEntries(Object.keys(rebuilt).map(k=>[k,c[k]]))))return fail('RAW_FLOW_OR_COMPONENT_REDERIVATION_MISMATCH');
  // Four-hour sparse presence reconciliation never fills a price candle.
  // The new price window needs all fifteen actual native candle rows.
  const recent=p.candles.filter(x=>x[0]>=end-15*M&&x[0]<end).map(x=>({ts:x[0],closed_end:x[0]+M-1,open:x[1],close:x[2],high:x[3],low:x[4],base_volume:x[5]})).sort((a,b)=>a.ts-b.ts);
  if(recent.length!==15||!recent.every((b,i)=>b.ts===end-15*M+i*M&&safeBar(b)))return fail('FIFTEEN_CONSECUTIVE_NATIVE_CANDLES_REQUIRED');
  const trades=new Map();
  for(const trade of p.trades){const minute=Math.floor(trade[1]/M)*M;if(minute<end-15*M)continue;if(!trades.has(minute))trades.set(minute,[]);trades.get(minute).push(trade[3]);}
  for(const bar of recent){const prices=trades.get(bar.ts)||[];if(!prices.length||bar.open!==prices[0]||bar.close!==prices.at(-1)||bar.high!==Math.max(...prices)||bar.low!==Math.min(...prices))return fail('NATIVE_15M_OHLC_NOT_RECONCILED_TO_RAW_EXECUTIONS');}
  const count=[...trades.values()].reduce((n,prices)=>n+prices.length,0);
  if(count!==rebuilt.recent_windows.find(w=>w.minutes===15)?.trade_count)return fail('RECENT_NATIVE_ACTIVITY_NOT_RECONCILED');
  const open=recent[0].open,close=recent.at(-1).close;
  const price_path={version:BITFINEX_N10_PRICE_VERSION,contract,venue:'BITFINEX',market:'SPOT',source_symbol:pair,quote:'USD',window_start:end-15*M,window_end:end,source_ts:end,observed_ts:now,first_known_ts:cache.observed_ts,expires_at:cache.expires_ts,candle_count:15,active_minute_count:15,recent_trade_count:count,native_candle_rows_in_four_hours:p.candles.length,verified_flow_presence_minutes:240,path_open:open,path_close:close,path_high:Math.max(...recent.map(b=>b.high)),path_low:Math.min(...recent.map(b=>b.low)),change_pct:(close/open-1)*100,raw_price_bars:recent,identity:structuredClone(c.identity),source_cache_binding:{source:'N05_OFFICIAL_FLOW:BITFINEX',asset_key:`NATIVE_FLOW:${contract}:${end}`,observed_ts:cache.observed_ts,expires_ts:cache.expires_ts,payload_sha256:sha(p),rederived_component_sha256:sha(rebuilt),selected_price_bars_sha256:sha(recent)},source_clock_policy:'ORIGINAL_N05_BITFINEX_NATIVE_15M_WITH_SPARSE_4H_FLOW_PROOF',native_base_volume_available:true,native_quote_volume_available:false,comparison_status:'WITHIN_BITFINEX_USD_ONLY',htx_comparison:null,exact_price_usdt:null,fx_conversion_proven:false,score_contribution:0,coverage_fraction:0,directional_strength:null,risk_strength:null,entry_authorized:false,liquidation_as_target:false,provider_http:0,cache_reads:0,runtime_admission_proven:false,native_cache_ACK:false};
  return{version:BITFINEX_N10_PRICE_VERSION,status:'CLOSED_WITHIN_BITFINEX_USD_PRICE_PATH',price_path,runtime_input_qualified:false,provider_http:0,cache_reads:0};
 }catch{return fail('MALFORMED_NATIVE_PRICE_INPUT');}
}
export function verifyBitfinexN10CachedPricePath(path,params){
 const rebuilt=inspectBitfinexN10CachedPricePath(params).price_path;
 return Boolean(rebuilt&&canonical(rebuilt)===canonical(path));
}
