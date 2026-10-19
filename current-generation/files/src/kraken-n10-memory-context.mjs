import {createHash} from 'node:crypto';
import {buildEvidenceV2} from './evidence-source-adapters.mjs';
import {prepareKrakenN10RuntimeInput,KRAKEN_N10_PRICE_VERSION} from './kraken-n10-price-path.mjs';
import {qualifiedKrakenNativeComponent} from './kraken-four-hour-flow.mjs';
import {KRAKEN_PUBLIC_TAKER_REFERENCE} from './kraken-public-taker-reference.mjs';
const METRIC='CLOSED_15M_KRAKEN_REUSED_PRICE_PATH_CONTEXT',ROOT='KRAKEN_OFFICIAL_SPOT_CANDLES';
const canonical=x=>JSON.stringify(x,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const sha=x=>createHash('sha256').update(canonical(x)).digest('hex'),hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const positive=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
const validWindow=w=>w?.label==='15m'&&w.candle_count===15&&Number.isSafeInteger(w.window_start_ts)&&Number.isSafeInteger(w.window_end_ts)&&w.window_end_ts%60000===0&&w.window_end_ts-w.window_start_ts===900000&&[w.open,w.high,w.low,w.close].every(positive)&&w.low<=w.high&&w.open>=w.low&&w.open<=w.high&&w.close>=w.low&&w.close<=w.high;
const comparison=(p,h)=>p.path_high<h.low||p.path_low>h.high?'DISJOINT_PRICE_RANGES':p.path_close===p.path_open||h.close===h.open?'DIRECTION_UNCONFIRMED':(p.path_close-p.path_open)*(h.close-h.open)>0?'SAME_WINDOW_OVERLAPPING_RANGE_AND_DIRECTION':'DIRECTION_CONFLICT';
function fact(contract,c,p,h,now){
 return buildEvidenceV2({provider_id:'PRIMARY_TECHNICAL_CONTEXT',upstream_id:ROOT,asset_id:`htx-futures:${contract}`,htx_contract:contract,block_id:'N10',metric_family:METRIC,origin_event_id:`KRAKEN:${contract}:${p.window_end}`,dependency_group:`KRAKEN_OFFICIAL_SPOT_CANDLES:${contract}:${p.window_end}`,source_ts:p.source_ts,observed_ts:now,first_known_ts:p.first_known_ts,expires_at:p.expires_at,coverage_status:'EXACT_FIFTEEN_CLOSED_ACTIVE_SPOT_MINUTE_CANDLES',coverage_fraction:0,directional_strength:null,risk_strength:null,extra:{venue:'KRAKEN',market:'SPOT',quote:'USDT',window_start:p.window_start,window_end:p.window_end,candle_count:15,active_minute_count:p.active_minute_count,path_open:p.path_open,path_high:p.path_high,path_low:p.path_low,path_close:p.path_close,change_pct:p.change_pct,htx_close_gap_pct:(p.path_close/h.close-1)*100,comparison_status:comparison(p,h),price_path:p,n05_component:c,htx_window:h,source_clock_policy:'KRAKEN_REDERIVED_ORIGINAL_N05_MEMORY_SAME_WINDOW',verification_scope:'COMPACT_PRODUCER_RECEIPT_NOT_NATIVE_CACHE_ACK',entry_authorized_by_context:false,liquidation_as_target:false,score_contribution:0}});
}
export function deriveKrakenN10MemoryEvidence({contract,component,htx_spot_kline,htx_window,now}={}){
 try{
  const capsule=component?._n05_kraken_reuse;
  if(!capsule||!validWindow(htx_window))return[];
  const prepared=prepareKrakenN10RuntimeInput({contract,component,cache:capsule.cache,htx_spot_kline,now}),p=prepared.price_path;
  if(prepared.runtime_input_qualified!==true||p.window_start!==htx_window.window_start_ts||p.window_end!==htx_window.window_end_ts)return[];
  const {receipt_hashes,...c}=component;
  return[fact(contract,structuredClone(c),structuredClone(p),structuredClone(htx_window),now)];
 }catch{return[];}
}
// Stored compact integrity at producer-receipt trust. The full 240 raw minutes
// and executions were rederived above; this is not a durable-cache/wire ACK.
export function verifyKrakenN10MemoryEvidence(row,now){
 try{
  const p=row?.price_path,c=row?.n05_component,h=row?.htx_window,b=p?.source_cache_binding,bars=p?.raw_price_bars;
  if(row.metric_family!==METRIC||![now,c?.observed_ts,p?.source_ts,p?.first_known_ts,p?.observed_ts,p?.expires_at,p?.window_start,p?.window_end].every(Number.isSafeInteger)||p.source_ts>c.observed_ts||p.window_end>p.first_known_ts||!qualifiedKrakenNativeComponent(c,KRAKEN_PUBLIC_TAKER_REFERENCE)||c.contract!==row.htx_contract||!validWindow(h)||
   c.verified_minutes!==240||c.window_end_ts!==p.window_end||c.window_start_ts!==p.window_end-14400000||p.native_grid_count!==240||p.source_clock_policy!=='ORIGINAL_N05_KRAKEN_REDERIVED_CLOSED_240M_CACHE'||p.score_contribution!==0||p.coverage_fraction!==0||p.directional_strength!==null||p.risk_strength!==null||p.entry_authorized!==false||p.liquidation_as_target!==false||p.version!==KRAKEN_N10_PRICE_VERSION||p.candle_count!==15||canonical(p.identity)!==canonical(c.identity)||p.contract!==row.htx_contract||p.venue!=='KRAKEN'||p.market!=='SPOT'||p.quote!=='USDT'||p.source_ts!==p.window_end||p.window_start!==h.window_start_ts||p.window_end!==h.window_end_ts||
   p.first_known_ts!==c.observed_ts||p.observed_ts!==row.observed_ts||p.expires_at!==h.window_end_ts+300000||p.first_known_ts>p.observed_ts||p.observed_ts>now||p.expires_at<=now||
   b?.schema!=='KRAKEN_N10_REDERIVED_CACHE_BINDING_V1'||b.source!=='N05_OFFICIAL_FLOW:KRAKEN'||b.asset_key!==`NATIVE_FLOW:${row.htx_contract}:${p.window_end}`||b.cache_observed_ts!==c.observed_ts||b.cache_expires_ts!==p.expires_at||
   !hex(b.cache_payload_sha256)||b.rederived_component_sha256!==sha(c)||!Array.isArray(bars)||bars.length!==15||b.selected_price_bars_sha256!==sha(bars)||
   !bars.every((x,i)=>x.ts===p.window_start+i*60000&&x.closed_end===x.ts+59999&&[x.open,x.high,x.low,x.close].every(positive)&&x.low<=x.high&&x.open>=x.low&&x.open<=x.high&&x.close>=x.low&&x.close<=x.high&&Number.isSafeInteger(x.activity)&&x.activity>=0))return false;
  const active=bars.filter(x=>x.activity>0).length,count=bars.reduce((s,x)=>s+x.activity,0),s=p.htx_spot_presence_binding;
  if(!active||p.active_minute_count!==active||p.recent_trade_count!==count||count!==c.recent_windows.find(x=>x.minutes===15)?.trade_count||
   p.path_open!==bars[0].open||p.path_close!==bars.at(-1).close||p.path_high!==Math.max(...bars.map(x=>x.high))||p.path_low!==Math.min(...bars.map(x=>x.low))||p.change_pct!==(p.path_close/p.path_open-1)*100||
   s?.contract!==row.htx_contract||s.channel!==`market.${row.htx_contract.slice(0,-5).toLowerCase()}usdt.kline.1min`||![s.source_ts,s.received_ts].every(Number.isSafeInteger)||s.source_ts<p.window_end||s.source_ts>s.received_ts||s.received_ts>p.observed_ts||p.observed_ts-s.source_ts>180000||!hex(s.raw_reply_sha256)||p.runtime_admission_proven!==false)return false;
  return canonical(fact(row.htx_contract,c,p,h,row.observed_ts))===canonical(row);
 }catch{return false;}
}
