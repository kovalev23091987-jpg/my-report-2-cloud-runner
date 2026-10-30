import {createHash} from 'node:crypto';
import {buildEvidenceV2} from './evidence-source-adapters.mjs';
import {inspectBitfinexN10CachedPricePath,BITFINEX_N10_PRICE_VERSION} from './bitfinex-n10-price-path.mjs';
import {qualifiedBitfinexNativeComponent,bitfinexNativeMarket} from './bitfinex-native-four-hour-flow.mjs';
const METRIC='CLOSED_15M_BITFINEX_USD_PRICE_CONTEXT',M=60000;
export const BITFINEX_N10_MEMORY_MAX_DTO_BYTES=16384;
const canonical=x=>JSON.stringify(x,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const sha=x=>createHash('sha256').update(canonical(x)).digest('hex'),hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const positive=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
const ohlc=x=>[x?.open,x?.high,x?.low,x?.close].every(positive)&&x.low<=x.high&&x.open>=x.low&&x.open<=x.high&&x.close>=x.low&&x.close<=x.high;
const validWindow=w=>w?.label==='15m'&&w.candle_count===15&&Number.isSafeInteger(w.window_start_ts)&&Number.isSafeInteger(w.window_end_ts)&&w.window_end_ts%M===0&&w.window_end_ts-w.window_start_ts===15*M;

// Private same-invocation references, never persisted inside the N05 payload.
export function attachBitfinexN10Memory({contract,component,payload,observed_ts,expires_ts,now}={}){
 try{
  if(!qualifiedBitfinexNativeComponent(component)||component.contract!==contract||observed_ts!==component.observed_ts||payload?.observed_ts!==observed_ts||payload?.version!=='bitfinex-native-flow-collector-v1-20261011'||Buffer.byteLength(JSON.stringify(payload))>900000||
   ![now,observed_ts,expires_ts].every(Number.isSafeInteger)||observed_ts>now||expires_ts!==component.window_end_ts+5*M||expires_ts<now)return false;
  Object.defineProperty(component,'_n05_bitfinex_reuse',{enumerable:false,writable:false,configurable:false,value:Object.freeze({cache:{observed_ts,expires_ts,payload}})});
  return true;
 }catch{return false;}
}
function currentSpotBinding(contract,s,start,end,now){
 const p=s?.payload,symbol=contract.slice(0,-5).toLowerCase()+'usdt';
 // Same freshness, identity and native-bar requirements as the existing
 // Kraken preparation, without interpreting USD as a HTX/USDT price.
 if(s?.market!=='SPOT'||s.contract!==contract||p?.status!=='ok'||p.ch!==`market.${symbol}.kline.1min`||![s.received_ts,p.ts].every(Number.isSafeInteger)||p.ts<end||p.ts>s.received_ts||s.received_ts>now||now-p.ts>3*M||!Array.isArray(p.data)||p.data.length>2000)return null;
 const bars=p.data.filter(r=>Number.isSafeInteger(r?.id)&&r.id*1000>=start&&r.id*1000<end).sort((a,b)=>a.id-b.id);
 if(bars.length!==15||!bars.every((r,i)=>r.id*1000===start+i*M&&ohlc(r)&&typeof r.vol==='number'&&Number.isFinite(r.vol)&&r.vol>=0)||!bars.some(r=>r.vol>0))return null;
 return{contract,channel:p.ch,source_ts:p.ts,received_ts:s.received_ts,raw_reply_sha256:sha(p)};
}
function fact(contract,c,p,h,s,now){
 return buildEvidenceV2({provider_id:'PRIMARY_TECHNICAL_CONTEXT',upstream_id:'BITFINEX_OFFICIAL_SPOT_CANDLES',asset_id:`htx-futures:${contract}`,htx_contract:contract,block_id:'N10',metric_family:METRIC,origin_event_id:`BITFINEX_USD:${contract}:${p.window_end}`,dependency_group:`BITFINEX_OFFICIAL_SPOT_CANDLES:${contract}:${p.window_end}`,source_ts:p.source_ts,observed_ts:now,first_known_ts:p.first_known_ts,expires_at:p.expires_at,coverage_status:'EXACT_FIFTEEN_NATIVE_BITFINEX_USD_MINUTES',coverage_fraction:0,directional_strength:null,risk_strength:null,unit:'USD',extra:{venue:'BITFINEX',market:'SPOT',quote:'USD',price_path:p,n05_component:c,primary_window:h,htx_spot_presence_binding:s,verification_scope:'COMPACT_PRODUCER_RECEIPT_NOT_NATIVE_CACHE_ACK',entry_authorized_by_context:false,liquidation_as_target:false,score_contribution:0}});
}
export function deriveBitfinexN10MemoryEvidence({contract,component,htx_spot_kline,htx_window,now}={}){
 try{
  const capsule=component?._n05_bitfinex_reuse;
  if(!capsule||!validWindow(htx_window))return[];
  const p=inspectBitfinexN10CachedPricePath({contract,component,cache:capsule.cache,now}).price_path;
  if(!p||p.window_start!==htx_window.window_start_ts||p.window_end!==htx_window.window_end_ts)return[];
  const spot=currentSpotBinding(contract,htx_spot_kline,p.window_start,p.window_end,now);if(!spot)return[];
  const {receipt_hashes,n12_bounded_sample_status,...c}=component;
  const h={label:'15m',candle_count:15,window_start_ts:p.window_start,window_end_ts:p.window_end};
  const row=fact(contract,structuredClone(c),structuredClone(p),h,spot,now);
  return Buffer.byteLength(JSON.stringify(row))<=BITFINEX_N10_MEMORY_MAX_DTO_BYTES?[row]:[];
 }catch{return[];}
}
// Persisted compact integrity at the qualified producer's trust. Full original
// raw execution reconciliation happened above; this is no independent wire ACK.
export function verifyBitfinexN10MemoryEvidence(row,now){
 try{
  const p=row?.price_path,c=row?.n05_component,h=row?.primary_window,s=row?.htx_spot_presence_binding,b=p?.source_cache_binding,bars=p?.raw_price_bars;
  if(Buffer.byteLength(JSON.stringify(row))>BITFINEX_N10_MEMORY_MAX_DTO_BYTES||row?.metric_family!==METRIC||!qualifiedBitfinexNativeComponent(c)||c.contract!==row.htx_contract||
   p?.version!==BITFINEX_N10_PRICE_VERSION||p.contract!==row.htx_contract||p.venue!=='BITFINEX'||p.market!=='SPOT'||p.source_symbol!==bitfinexNativeMarket(row.htx_contract)||p.quote!=='USD'||canonical(p.identity)!==canonical(c.identity)||
   ![now,p.window_start,p.window_end,p.source_ts,p.observed_ts,p.first_known_ts,p.expires_at].every(Number.isSafeInteger)||p.window_end%M||p.window_end-p.window_start!==15*M||p.source_ts!==p.window_end||p.first_known_ts!==c.observed_ts||p.first_known_ts<p.window_end||p.first_known_ts>p.observed_ts||p.observed_ts!==row.observed_ts||p.observed_ts>now||p.expires_at!==p.window_end+5*M||p.expires_at<now||
   c.window_end_ts!==p.window_end||c.window_start_ts!==p.window_end-240*M||p.candle_count!==15||p.active_minute_count!==15||p.verified_flow_presence_minutes!==240||!Number.isSafeInteger(p.native_candle_rows_in_four_hours)||p.native_candle_rows_in_four_hours<15||p.native_candle_rows_in_four_hours>240||
   p.native_base_volume_available!==true||p.native_quote_volume_available!==false||p.comparison_status!=='WITHIN_BITFINEX_USD_ONLY'||p.htx_comparison!==null||p.exact_price_usdt!==null||p.fx_conversion_proven!==false||p.native_cache_ACK!==false||p.runtime_admission_proven!==false||p.score_contribution!==0||p.coverage_fraction!==0||p.directional_strength!==null||p.risk_strength!==null||p.entry_authorized!==false||p.liquidation_as_target!==false||p.provider_http!==0||p.cache_reads!==0||p.source_clock_policy!=='ORIGINAL_N05_BITFINEX_NATIVE_15M_WITH_SPARSE_4H_FLOW_PROOF')return false;
  if(b?.source!=='N05_OFFICIAL_FLOW:BITFINEX'||b.asset_key!==`NATIVE_FLOW:${row.htx_contract}:${p.window_end}`||b.observed_ts!==p.first_known_ts||b.expires_ts!==p.expires_at||!hex(b.payload_sha256)||b.rederived_component_sha256!==sha(c)||b.selected_price_bars_sha256!==sha(bars)||
   !Array.isArray(bars)||bars.length!==15||!bars.every((x,i)=>x.ts===p.window_start+i*M&&x.closed_end===x.ts+M-1&&ohlc(x)&&positive(x.base_volume))||
   p.path_open!==bars[0].open||p.path_close!==bars.at(-1).close||p.path_high!==Math.max(...bars.map(x=>x.high))||p.path_low!==Math.min(...bars.map(x=>x.low))||p.change_pct!==(p.path_close/p.path_open-1)*100||!Number.isSafeInteger(p.recent_trade_count)||p.recent_trade_count!==c.recent_windows.find(x=>x.minutes===15)?.trade_count||p.recent_trade_count<15||p.recent_trade_count>c.trade_count||c.recent_windows.find(x=>x.minutes===15)?.window_start_ts!==p.window_start||c.recent_windows.find(x=>x.minutes===15)?.window_end_ts!==p.window_end)return false;
  if(!validWindow(h)||h.window_start_ts!==p.window_start||h.window_end_ts!==p.window_end||s?.contract!==row.htx_contract||s.channel!==`market.${row.htx_contract.slice(0,-5).toLowerCase()}usdt.kline.1min`||![s.source_ts,s.received_ts].every(Number.isSafeInteger)||s.source_ts<p.window_end||s.source_ts>s.received_ts||s.received_ts>p.observed_ts||p.observed_ts-s.source_ts>3*M||!hex(s.raw_reply_sha256))return false;
  return canonical(fact(row.htx_contract,c,p,h,s,row.observed_ts))===canonical(row);
 }catch{return false;}
}
