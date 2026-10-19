import {deriveBitfinexN10MemoryEvidence} from './bitfinex-n10-memory-context.mjs';
import {deriveKrakenN10MemoryEvidence} from './kraken-n10-memory-context.mjs';
import {createHash} from 'node:crypto';
import {buildEvidenceV2} from './evidence-source-adapters.mjs';
import {nativeSourceUsageUnclosed} from './evidence-source-store.mjs';
import {isExactHtxUsdtSwapKey} from './htx-contract-key.mjs';
import {qualifiedBinanceNativeComponent,normalizeBinanceNativeFlow} from './binance-native-four-hour-flow.mjs';
import {qualifiedPoloniexNativeComponent,normalizePoloniexNativeFlow} from './poloniex-native-four-hour-flow.mjs';
import {qualifiedGateSpotComponent,normalizeGateSpotFlow} from './gate-four-hour-flow.mjs';
import {GATE_PUBLIC_TAKER_REFERENCE} from './gate-public-taker-reference.mjs';
import {BITGET_FLOW_VERSION,reconcileBitgetFlow} from './bitget-four-hour-flow.mjs';
const periods={'1min':60000,'5min':300000,'15min':900000,'30min':1800000,'60min':3600000,'4hour':14400000},captured=new Map(),TTL=180000;
const exact15mWindow=w=>w?.label==='15m'&&w.candle_count===15&&Number.isSafeInteger(w.window_start_ts)&&Number.isSafeInteger(w.window_end_ts)&&w.window_end_ts%60000===0&&w.window_end_ts-w.window_start_ts===900000;
const comparePricePaths=(open,high,low,close,h)=>high<h.low||low>h.high?'DISJOINT_PRICE_RANGES':close===open||h.close===h.open?'DIRECTION_UNCONFIRMED':(close-open)*(h.close-h.open)>0?'SAME_WINDOW_OVERLAPPING_RANGE_AND_DIRECTION':'DIRECTION_CONFLICT';
let rolling=null;
export function clearHtxTechnicalSnapshots(){captured.clear();rolling=null;}
export function observeHtxTechnicalSnapshot(payload,url,observed_ts=Date.now()){
 const u=new URL(url),contract=u.searchParams.get('contract_code'),period=u.searchParams.get('period');
 if(u.hostname==='api.hbdm.com'&&['/linear-swap-ex/market/detail/batch_merged','/v2/linear-swap-ex/market/detail/batch_merged'].includes(u.pathname)){
  rolling={payload,observed_ts};return;
 }
 if(u.hostname!=='api.hbdm.com'||u.pathname!=='/linear-swap-ex/market/history/kline'||!isExactHtxUsdtSwapKey(contract)||!periods[period])return;
 const key=contract+':'+period;
 if(!captured.has(key)&&captured.size>=24)captured.delete(captured.keys().next().value);
 captured.set(key,{payload,contract,period,observed_ts});
}
export function normalizeHtxTechnicalStructure({payload,contract,period,observed_ts}={}){
 const duration=periods[period],ts=payload?.ts;
 if(!isExactHtxUsdtSwapKey(contract)||!duration||payload?.status!=='ok'||payload.ch!==`market.${contract}.kline.${period}`||!Number.isSafeInteger(ts)||ts>observed_ts||observed_ts-ts>TTL||!Array.isArray(payload.data))return[];
 const end=Math.floor(ts/duration)*duration,start=end-20*duration,rows=payload.data.filter(r=>Number.isSafeInteger(r?.id)&&r.id*1000>=start&&r.id*1000<end).sort((a,b)=>a.id-b.id);
 if(rows.length!==20||!rows.every((r,i)=>r.id*1000===start+i*duration&&['open','high','low','close'].every(k=>typeof r[k]==='number'&&Number.isFinite(r[k])&&r[k]>0)&&r.low<=r.high&&r.open>=r.low&&r.open<=r.high&&r.close>=r.low&&r.close<=r.high))return[];
 const high=Math.max(...rows.map(r=>r.high)),low=Math.min(...rows.map(r=>r.low)),last=rows.at(-1).close,rangePct=(high/low-1)*100;
 return[buildEvidenceV2({provider_id:'PRIMARY_TECHNICAL_CONTEXT',upstream_id:'HTX_OFFICIAL_CLOSED_CANDLES',asset_id:`htx-futures:${contract}`,htx_contract:contract,block_id:'N10',metric_family:'CLOSED_CANDLE_RANGE_CONTEXT',origin_event_id:`${contract}:${period}:${end}`,dependency_group:`HTX_CLOSED_CANDLES:${contract}:${period}:${end}`,source_ts:ts,observed_ts,expires_at:ts+TTL,coverage_status:'EXACT_TWENTY_CLOSED_CANDLES',coverage_fraction:0,directional_strength:null,risk_strength:null,extra:{period,interval_ms:duration,candle_count:20,window_start:start,window_end:end,range_high:high,range_low:low,last_closed_price:last,range_pct:rangePct,all_candles_closed:true,source_clock_policy:'HTX_PRIMARY_RESPONSE_AND_CLOSED_CANDLE_IDS',entry_authorized_by_context:false,liquidation_as_target:false}})];
}
export function normalizeHtxRollingRange({payload,contract,observed_ts}={}){
 if(!isExactHtxUsdtSwapKey(contract)||payload?.status!=='ok'||!Array.isArray(payload.ticks)||!Number.isSafeInteger(payload.ts)||payload.ts>observed_ts||observed_ts-payload.ts>TTL)return[];
 const matches=payload.ticks.filter(r=>r?.contract_code===contract),r=matches[0];
 if(matches.length!==1||r.business_type!=='swap'||r.trade_partition!=='USDT'||!Number.isSafeInteger(r.ts)||r.ts>payload.ts||observed_ts-r.ts>TTL)return[];
 const n=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null,low=n(r.low),high=n(r.high),last=n(r.close),open=n(r.open);
 if(!(low>0&&high>=low&&last>=low&&last<=high&&open>=low&&open<=high))return[];
 return[buildEvidenceV2({provider_id:'PRIMARY_TECHNICAL_CONTEXT',upstream_id:'HTX_OFFICIAL_ROLLING_MARKET_SUMMARY',asset_id:`htx-futures:${contract}`,htx_contract:contract,block_id:'N10',metric_family:'ROLLING_24H_PRICE_RANGE_CONTEXT',origin_event_id:`${contract}:${r.ts}`,dependency_group:`HTX_ROLLING_RANGE:${contract}:${r.ts}`,source_ts:r.ts,observed_ts,expires_at:r.ts+TTL,coverage_status:'PROVIDER_ROLLING_24H_PRICE_SUMMARY',coverage_fraction:0,directional_strength:null,risk_strength:null,extra:{range_low:low,range_high:high,last_price:last,range_pct:(high/low-1)*100,source_clock_policy:'HTX_PRIMARY_ROLLING_24H_SUMMARY',closed_candle_claim:false,entry_authorized_by_context:false,liquidation_as_target:false,signed_trade_flow_claim:false}})];
}
export function readHtxTechnicalStructure({contract,now=Date.now()}={}){
 // The strongest existing time window takes precedence; no extra transport.
 for(const period of ['4hour','60min','30min','15min','5min','1min']){
  const snapshot=captured.get(contract+':'+period);if(!snapshot||snapshot.observed_ts>now||now-snapshot.payload?.ts>TTL)continue;
  const evidence=normalizeHtxTechnicalStructure(snapshot);if(evidence.length)return evidence;
 }
 return rolling&&rolling.observed_ts<=now&&now-rolling.payload?.ts<=TTL?normalizeHtxRollingRange({payload:rolling.payload,contract,observed_ts:rolling.observed_ts}):[];
}

// Read existing raw responses only; a rolling summary or range high/low never
// proves a trigger's candle close. Five exact 1m bars may form one closed 5m bar.
export function readHtxClosedTriggerCandles({contract,now=Date.now()}={}){
 const out=[];
 for(const period of ['5min','1min']){
  const s=captured.get(contract+':'+period),p=s?.payload,duration=periods[period];
  if(!s||p?.status!=='ok'||p.ch!==`market.${contract}.kline.${period}`||!Number.isSafeInteger(p.ts)||p.ts>s.observed_ts||s.observed_ts>now||now-p.ts>TTL||!Array.isArray(p.data))continue;
  const end=Math.floor(p.ts/duration)*duration;
  const valid=r=>Number.isSafeInteger(r?.id)&&['open','high','low','close'].every(k=>typeof r[k]==='number'&&Number.isFinite(r[k])&&r[k]>0)&&r.low<=r.high&&r.open>=r.low&&r.open<=r.high&&r.close>=r.low&&r.close<=r.high;
  const make=(rows,start,finish,source)=>({contract,source,source_ts:p.ts,observed_ts:s.observed_ts,interval_ms:finish-start,window_start:start,window_end:finish,open:rows[0].open,high:Math.max(...rows.map(r=>r.high)),low:Math.min(...rows.map(r=>r.low)),close:rows.at(-1).close,all_candles_closed:true,candle_ids:rows.map(r=>r.id)});
  const rows=p.data.filter(r=>valid(r)&&r.id*1000===end-duration);
  if(rows.length===1)out.push(make(rows,end-duration,end,'HTX_OFFICIAL_CLOSED_CANDLE'));
  if(period==='1min'){
   const finish=Math.floor(p.ts/300000)*300000,start=finish-300000;
   const five=p.data.filter(r=>r?.id*1000>=start&&r?.id*1000<finish).sort((a,b)=>a.id-b.id);
   if(five.length===5&&five.every((r,i)=>valid(r)&&r.id*1000===start+i*60000))out.push(make(five,start,finish,'HTX_OFFICIAL_FIVE_CLOSED_1M_CANDLES'));
  }
 }
 return out;
}

// A recent path is useful context when the trajectory already contains the
// exact fifteen closed one-minute candles. It is the same HTX upstream as the
// longer range and never supplies a target, score or entry permission.
export function deriveHtxRecentPathEvidence({contract,window,source_ts,observed_ts}={}){
 const w=window,M=60000,positive=v=>typeof v==='number'&&Number.isFinite(v)&&v>0;
 if(!isExactHtxUsdtSwapKey(contract)||!exact15mWindow(w)||
  ![w.window_start_ts,w.window_end_ts,source_ts,observed_ts].every(Number.isSafeInteger)||
  w.window_end_ts-w.window_start_ts!==15*M||w.window_end_ts%M!==0||
  w.window_end_ts>source_ts||source_ts>observed_ts||observed_ts-source_ts>TTL||observed_ts-w.window_end_ts>TTL||
  ![w.open,w.high,w.low,w.close].every(positive)||w.low>w.high||
  w.open<w.low||w.open>w.high||w.close<w.low||w.close>w.high)return[];
 return[buildEvidenceV2({provider_id:'PRIMARY_TECHNICAL_CONTEXT',upstream_id:'HTX_OFFICIAL_CLOSED_1M_CANDLES',
  asset_id:`htx-futures:${contract}`,htx_contract:contract,block_id:'N10',metric_family:'CLOSED_15M_PRICE_PATH_CONTEXT',
  origin_event_id:`${contract}:15m:${w.window_end_ts}`,dependency_group:`HTX_CLOSED_CANDLES:${contract}:${w.window_end_ts}`,
  source_ts,observed_ts,expires_at:Math.min(source_ts+TTL,w.window_end_ts+TTL),coverage_status:'EXACT_FIFTEEN_CLOSED_1M_CANDLES',coverage_fraction:0,
  directional_strength:null,risk_strength:null,extra:{window_start:w.window_start_ts,window_end:w.window_end_ts,candle_count:15,
   path_open:w.open,path_high:w.high,path_low:w.low,path_close:w.close,change_pct:(w.close/w.open-1)*100,
   range_pct:(w.high/w.low-1)*100,source_clock_policy:'HTX_PRIMARY_TRAJECTORY_EXACT_CLOSED_1M',
   same_htx_upstream_not_independent:true,entry_authorized_by_context:false,liquidation_as_target:false}})];
}

// The existing HTX spot snapshot already requests one-minute candles. Use its
// original response for a factual second market path without another HTTP call.
// Spot and futures from HTX are two markets, never independent venue votes.
export function deriveHtxSpotSameRunPathEvidence({contract,spot_kline,htx_window,now=Date.now()}={}){
 const p=spot_kline?.payload,received=spot_kline?.received_ts,base=String(contract||'').slice(0,-5).toLowerCase();
 if(!isExactHtxUsdtSwapKey(contract)||spot_kline?.market!=='SPOT'||spot_kline.contract!==contract||
  p?.status!=='ok'||p.ch!==`market.${base}usdt.kline.1min`||!Number.isSafeInteger(p.ts)||
  !Number.isSafeInteger(received)||!Number.isSafeInteger(now)||p.ts>received||received>now||now-p.ts>TTL||!Array.isArray(p.data))return[];
 const latestEnd=Math.floor(p.ts/60000)*60000,anchor=exact15mWindow(htx_window)?htx_window.window_end_ts:null;
 const end=Number.isSafeInteger(anchor)&&anchor<=latestEnd&&latestEnd-anchor<=120000?anchor:latestEnd,start=end-15*60000;
 if(end>now||now-end>TTL)return[];
 const raw=p.data.filter(r=>Number.isSafeInteger(r?.id)&&r.id*1000>=start&&r.id*1000<end).sort((a,b)=>a.id-b.id);
 if(raw.length!==15||!raw.every((r,i)=>r.id*1000===start+i*60000&&['open','high','low','close'].every(k=>typeof r[k]==='number'&&Number.isFinite(r[k])&&r[k]>0)&&
  r.low<=r.high&&r.open>=r.low&&r.open<=r.high&&r.close>=r.low&&r.close<=r.high&&Number.isSafeInteger(r.count)&&r.count>=0))return[];
 const active=raw.filter(r=>r.count>0).length;if(!active)return[];
 const bars=raw.map(r=>({id:r.id,open:r.open,high:r.high,low:r.low,close:r.close,count:r.count}));
 const open=bars[0].open,high=Math.max(...bars.map(r=>r.high)),low=Math.min(...bars.map(r=>r.low)),close=bars.at(-1).close;
 const h=exact15mWindow(htx_window)&&htx_window.window_end_ts===end&&[htx_window.open,htx_window.high,htx_window.low,htx_window.close].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>0)&&htx_window.low<=htx_window.high&&htx_window.open>=htx_window.low&&htx_window.open<=htx_window.high&&htx_window.close>=htx_window.low&&htx_window.close<=htx_window.high?htx_window:null;
 const comparison=h?comparePricePaths(open,high,low,close,h):'SPOT_ONLY';
 return[buildEvidenceV2({provider_id:'PRIMARY_TECHNICAL_CONTEXT',upstream_id:'HTX_OFFICIAL_SPOT_CLOSED_1M_CANDLES',asset_id:`htx-spot:${contract}`,htx_contract:contract,block_id:'N10',metric_family:'CLOSED_15M_HTX_SPOT_PRICE_PATH_CONTEXT',origin_event_id:`HTX_SPOT:${contract}:${end}`,dependency_group:`HTX_SPOT_CLOSED_CANDLES:${contract}:${end}`,source_ts:end,observed_ts:now,first_known_ts:received,expires_at:Math.min(end+TTL,received+TTL),coverage_status:'EXACT_FIFTEEN_CLOSED_ACTIVE_SPOT_MINUTE_CANDLES',coverage_fraction:0,directional_strength:null,risk_strength:null,extra:{venue:'HTX',market:'SPOT',quote:'USDT',window_start:start,window_end:end,candle_count:15,active_minute_count:active,path_open:open,path_high:high,path_low:low,path_close:close,change_pct:(close/open-1)*100,comparison_status:comparison,htx_futures_window:h?{label:'15m',window_start_ts:h.window_start_ts,window_end_ts:end,candle_count:15,open:h.open,high:h.high,low:h.low,close:h.close}:null,raw_spot_bars:bars,provider_response_ts:p.ts,spot_received_ts:received,source_clock_policy:'SAME_RUN_HTX_SPOT_ORIGINAL_CLOSED_1M',same_htx_upstream_not_independent:true,entry_authorized_by_context:false,liquidation_as_target:false,score_contribution:0}})];
}

export function verifyHtxSpotSameRunPathEvidence(row,{now=row?.observed_ts}={}){
 if(row?.block_id!=='N10'||row.metric_family!=='CLOSED_15M_HTX_SPOT_PRICE_PATH_CONTEXT'||row.provider_id!=='PRIMARY_TECHNICAL_CONTEXT'||row.upstream_id!=='HTX_OFFICIAL_SPOT_CLOSED_1M_CANDLES'||row.market!=='SPOT'||row.venue!=='HTX'||row.same_htx_upstream_not_independent!==true||row.score_contribution!==0||row.entry_authorized_by_context!==false||row.liquidation_as_target!==false||row.coverage_fraction!==0||row.directional_strength!==null||row.risk_strength!==null||!Array.isArray(row.raw_spot_bars)||row.raw_spot_bars.length!==15)return false;
 if(row.asset_id!==`htx-spot:${row.htx_contract}`||!Number.isSafeInteger(row.observed_ts)||row.observed_ts>now||row.observed_ts<row.spot_received_ts||row.first_known_ts!==row.spot_received_ts)return false;
 const rebuilt=deriveHtxSpotSameRunPathEvidence({contract:row.htx_contract,spot_kline:{market:'SPOT',contract:row.htx_contract,received_ts:row.spot_received_ts,payload:{status:'ok',ch:`market.${row.htx_contract.slice(0,-5).toLowerCase()}usdt.kline.1min`,ts:row.provider_response_ts,data:row.raw_spot_bars}},htx_window:row.htx_futures_window,now});
 return rebuilt.length===1&&rebuilt[0].evidence_id===row.evidence_id&&rebuilt[0].raw_hash===row.raw_hash&&rebuilt[0].source_ts===row.source_ts&&rebuilt[0].expires_at===row.expires_at;
}

// N05 has already paid for and validated these *original* 240 closed minute
// candles. Reuse its exact same-window cache without provider HTTP. A venue is
// an independent price root only when its N05 component has an exact asset
// binding and the fifteen raw bars contain actual trading activity. No source
// here is allowed to set a target, entry, direction vote or score.
const VENUE_PRICE_ROOTS={BINANCE:'BINANCE_OFFICIAL_SPOT_CANDLES',POLONIEX:'POLONIEX_OFFICIAL_SPOT_CANDLES',BITGET:'BITGET_OFFICIAL_SPOT_CANDLES',GATE:'GATE_OFFICIAL_SPOT_CANDLES'};
const finitePrice=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))&&Number(v)>0?Number(v):null;
const qualifiedVenueComponent=c=>c?.venue==='BINANCE'?qualifiedBinanceNativeComponent(c):c?.venue==='POLONIEX'?qualifiedPoloniexNativeComponent(c):c?.venue==='GATE'?qualifiedGateSpotComponent(c,GATE_PUBLIC_TAKER_REFERENCE):c?.venue==='BITGET'&&c.version===BITGET_FLOW_VERSION&&c.status==='CLOSED_VOLUME_RECONCILED_FOUR_HOURS'&&c.physical_root==='BITGET_OFFICIAL_PUBLIC_TRADES'&&c.check_completed===true&&c.exact_asset_binding===true;
function venuePriceBar(venue,r){
 if(venue==='BINANCE'&&Array.isArray(r)&&r.length>=9)return{ts:Number(r[0]),open:finitePrice(r[1]),high:finitePrice(r[2]),low:finitePrice(r[3]),close:finitePrice(r[4]),activity:Number(r[8]),closed_end:Number(r[6])};
 if(venue==='POLONIEX'&&Array.isArray(r)&&r.length===14&&r[11]==='MINUTE_1')return{ts:Number(r[12]),open:finitePrice(r[2]),high:finitePrice(r[1]),low:finitePrice(r[0]),close:finitePrice(r[3]),activity:Number(r[8]),closed_end:Number(r[13])};
 if(venue==='BITGET'&&Array.isArray(r)&&r.length>=8)return{ts:Number(r[0]),open:finitePrice(r[1]),high:finitePrice(r[2]),low:finitePrice(r[3]),close:finitePrice(r[4]),activity:Number(r[5]),closed_end:Number(r[0])+59999};
 if(venue==='GATE'&&Array.isArray(r)&&r.length>=7)return{ts:Number(r[0])*1000,open:finitePrice(r[5]),high:finitePrice(r[3]),low:finitePrice(r[4]),close:finitePrice(r[2]),activity:Number(r[6]),closed_end:Number(r[0])*1000+59999};
 return null;
}
function rawVenueCandles(venue,p){return venue==='BITGET'?p?.payloads?.candles?.code==='00000'?p.payloads.candles.data:null:p?.candles;}
const N10_REDERIVED_CACHE_CLOCK='EXISTING_N05_REDERIVED_CLOSED_240M_CACHE_SAME_WINDOW';
const cacheDigest=value=>createHash('sha256').update(JSON.stringify(value,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v)).digest('hex');
const flowBindingFields='version contract venue market quote status check_completed window_start_ts window_end_ts observed_ts verified_minutes buy_quote sell_quote trade_count score_contribution entry_authorized'.split(' ');
const flowDescriptor=c=>({...Object.fromEntries(flowBindingFields.map(k=>[k,c[k]])),identity:c.identity,physical_root:c.physical_root,direction_semantics:c.direction_semantics,source_clock_policy:c.source_clock_policy});
function rederiveCachedN05Flow({contract,venue,component:c,payload:p,end,observed}){
 try{
  const common={contract,identity:c.identity,window_end_ts:end,observed_ts:observed};let rebuilt;
  if(venue==='BINANCE')rebuilt=normalizeBinanceNativeFlow({...common,catalog:p.catalog,candles:p.candles});
  else if(venue==='POLONIEX')rebuilt=normalizePoloniexNativeFlow({...common,assets:p.assets,markets:p.markets,candles:p.candles});
  else if(venue==='GATE')rebuilt=normalizeGateSpotFlow({...common,currencies:p.currencies,spot:p.spot,pages:p.pages,candles:p.candles,direction_reference:GATE_PUBLIC_TAKER_REFERENCE});
  else if(venue==='BITGET')rebuilt=reconcileBitgetFlow({...common,market:'SPOT',pages:p.payloads?.pages,candles:p.payloads?.candles});
  return Boolean(rebuilt?.check_completed===true&&flowBindingFields.every(k=>rebuilt[k]===c[k]));
 }catch{return false;}
}
function validN10CacheBinding(binding,row,c,bars){
 return binding?.schema==='N10_REDERIVED_N05_CACHE_BINDING_V1'&&binding.contract===row.htx_contract&&binding.venue===row.venue&&binding.market==='SPOT'&&binding.quote==='USDT'&&binding.window_start_ts===c.window_start_ts&&binding.window_end_ts===row.window_end&&binding.observed_ts===c.observed_ts&&binding.expires_ts===row.window_end+300000&&row.expires_at===binding.expires_ts&&binding.flow_component_sha256===cacheDigest(flowDescriptor(c))&&binding.selected_price_bars_sha256===cacheDigest(bars)&&/^[a-f0-9]{64}$/.test(binding.cache_payload_sha256||'');
}
export function deriveN10ReusedVenuePathEvidence({contract,venue,component,cache,htx_window,now=Date.now()}={}){
 const end=htx_window?.window_end_ts,start=htx_window?.window_start_ts,root=VENUE_PRICE_ROOTS[venue],p=cache?.payload;
 if(!root||!isExactHtxUsdtSwapKey(contract)||!qualifiedVenueComponent(component)||component.contract!==contract||component.market!=='SPOT'||component.quote!=='USDT'||component.window_end_ts!==end||component.window_start_ts!==end-240*60000||component.verified_minutes!==240||
  !Number.isSafeInteger(now)||!Number.isSafeInteger(end)||start!==end-15*60000||end>now||now-end>5*60000||
  !Number.isSafeInteger(cache?.observed_ts)||cache.observed_ts!==component.observed_ts||cache.observed_ts<end||cache.observed_ts>now||cache.expires_ts<now||p?.observed_ts!==cache.observed_ts)return[];
 if(!Number.isSafeInteger(cache.expires_ts)||cache.expires_ts!==end+300000||!rederiveCachedN05Flow({contract,venue,component,payload:p,end,observed:cache.observed_ts}))return[];
 const raw=rawVenueCandles(venue,p);if(!Array.isArray(raw)||raw.length!==240)return[];
 const bars=raw.map(r=>venuePriceBar(venue,r)).sort((a,b)=>(a?.ts??-1)-(b?.ts??-1));
 const fullStart=end-240*60000;
 if(!bars.every((b,i)=>b&&b.ts===fullStart+i*60000&&b.closed_end===b.ts+59999&&[b.open,b.high,b.low,b.close].every(v=>v!==null)&&b.low<=b.high&&b.open>=b.low&&b.open<=b.high&&b.close>=b.low&&b.close<=b.high&&Number.isFinite(b.activity)&&b.activity>=0))return[];
 const recent=bars.slice(-15),active=recent.filter(b=>b.activity>0).length;
 if(active===0||recent[0].ts!==start||recent.at(-1).ts!==end-60000)return[];
 const open=recent[0].open,high=Math.max(...recent.map(b=>b.high)),low=Math.min(...recent.map(b=>b.low)),close=recent.at(-1).close;
 const h=htx_window;if(![h.open,h.high,h.low,h.close].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>0)||h.low>h.high||h.open<h.low||h.open>h.high||h.close<h.low||h.close>h.high)return[];
 const comparison=comparePricePaths(open,high,low,close,h),binding={schema:'N10_REDERIVED_N05_CACHE_BINDING_V1',contract,venue,market:'SPOT',quote:'USDT',window_start_ts:component.window_start_ts,window_end_ts:end,observed_ts:cache.observed_ts,expires_ts:cache.expires_ts,flow_component_sha256:cacheDigest(flowDescriptor(component)),selected_price_bars_sha256:cacheDigest(recent),cache_payload_sha256:cacheDigest(p)};
 return[buildEvidenceV2({provider_id:'PRIMARY_TECHNICAL_CONTEXT',upstream_id:root,asset_id:`htx-futures:${contract}`,htx_contract:contract,block_id:'N10',metric_family:'CLOSED_15M_INDEPENDENT_PRICE_PATH_CONTEXT',origin_event_id:`${venue}:${contract}:${end}`,dependency_group:`${venue}_OFFICIAL_SPOT_CANDLES:${contract}:${end}`,source_ts:end,observed_ts:now,first_known_ts:cache.observed_ts,expires_at:Math.min(cache.expires_ts,end+5*60000),coverage_status:'EXACT_FIFTEEN_CLOSED_ACTIVE_SPOT_MINUTE_CANDLES',coverage_fraction:0,directional_strength:null,risk_strength:null,extra:{venue,market:'SPOT',quote:'USDT',window_start:start,window_end:end,candle_count:15,active_minute_count:active,path_open:open,path_high:high,path_low:low,path_close:close,change_pct:(close/open-1)*100,htx_path_open:h.open,htx_path_high:h.high,htx_path_low:h.low,htx_path_close:h.close,htx_close_gap_pct:(close/h.close-1)*100,comparison_status:comparison,source_cache_observed_ts:cache.observed_ts,source_clock_policy:N10_REDERIVED_CACHE_CLOCK,source_cache_binding:binding,n05_component:component,raw_price_bars:recent,entry_authorized_by_context:false,liquidation_as_target:false,independent_upstream_root:true}})];
}
export async function loadN10ReusedVenuePaths({db,contract,flow_result,primary_receipt,htx_spot_kline,now=Date.now()}={}){
 const h=primary_receipt?.receipts?.[0]?.actual_price_windows?.find(w=>w.label==='15m');
 if(!db?.prepare||primary_receipt?.check_completed!==true||!h)return{status:'PRIMARY_15M_WINDOW_REQUIRED',evidence:[],cache_reads:0,provider_http:0,receipts:[]};
 // Apply the path's market/window requirements before its four-read ceiling.
 // Several components of one source share a cache key; read it once and use
 // the component whose original observation matches the retained cache row.
 const groups=new Map(),memory=[],bitfinexMemory=[];
 for(const c of flow_result?.components||[]){
  if(c?.venue==='KRAKEN'){memory.push(c);continue;}
  if(c?.venue==='BITFINEX'){bitfinexMemory.push(c);continue;}
  if(!qualifiedVenueComponent(c)||c.contract!==contract||c.market!=='SPOT'||c.quote!=='USDT'||c.window_end_ts!==h.window_end_ts||c.window_start_ts!==h.window_end_ts-240*60000||c.verified_minutes!==240)continue;
  if(!groups.has(c.venue))groups.set(c.venue,[]);groups.get(c.venue).push(c);
 }
 const evidence=[],receipts=[];let cache_reads=0,native_unclosed=false;
 for(const [venue,components] of [...groups].slice(0,4)){if(nativeSourceUsageUnclosed(db)){native_unclosed=true;receipts.push({venue,status:'SOURCE_CHAIN_STOPPED_UNCLOSED_NATIVE_USAGE',provider_http:0});break;}const key=venue==='BITGET'?`FLOW:${contract}:SPOT:${h.window_end_ts}`:`${venue==='BINANCE'||venue==='POLONIEX'?'NATIVE_FLOW':'TOKEN_FLOW'}:${contract}:${h.window_end_ts}`;cache_reads++;
  let row=null;try{row=await db.prepare('SELECT observed_ts,expires_ts,payload_json FROM report2_evidence_source_cache WHERE source=?1 AND asset_key=?2 AND expires_ts>=?3 LIMIT 1').bind(`N05_OFFICIAL_FLOW:${venue}`,key,now).first();}catch{}
  let parsed=null;try{if(row)parsed=JSON.parse(row.payload_json);}catch{}
  const c=components.find(c=>c.observed_ts===Number(row?.observed_ts))||components[0];
  const facts=deriveN10ReusedVenuePathEvidence({contract,venue,component:c,cache:row?{observed_ts:Number(row.observed_ts),expires_ts:Number(row.expires_ts),payload:parsed}:null,htx_window:h,now});
  evidence.push(...facts);receipts.push({venue,status:facts.length?'CLOSED_INDEPENDENT_SAME_WINDOW_PRICE_PATH':'NO_USEFUL_FRESH_CLOSED_PRICE_PATH',cache_key:key,component_check_completed:c.check_completed===true,provider_http:0});
 }
 for(const component of memory){
  const facts=deriveKrakenN10MemoryEvidence({contract,component,htx_spot_kline,htx_window:h,now});
  evidence.push(...facts);receipts.push({venue:'KRAKEN',status:facts.length?'CLOSED_INDEPENDENT_SAME_WINDOW_PRICE_PATH':'NO_USEFUL_FRESH_CLOSED_PRICE_PATH',provider_http:0,cache_reads:0,producer_receipt_not_native_cache_ACK:true});
 }
 for(const component of bitfinexMemory){
  const facts=deriveBitfinexN10MemoryEvidence({contract,component,htx_spot_kline,htx_window:h,now});
  evidence.push(...facts);receipts.push({venue:'BITFINEX',status:facts.length?'CLOSED_WITHIN_BITFINEX_USD_PRICE_PATH':'NO_USEFUL_FRESH_CLOSED_USD_PRICE_PATH',provider_http:0,cache_reads:0,producer_receipt_not_native_cache_ACK:true});
 }
 native_unclosed||=nativeSourceUsageUnclosed(db);
 return{status:native_unclosed?'SOURCE_CHAIN_STOPPED_UNCLOSED_NATIVE_USAGE':evidence.length?'CLOSED':'NO_USEFUL_EXISTING_VENUE_PATH',evidence,cache_reads,provider_http:0,receipts};
}
export function verifyN10ReusedVenuePathEvidence(row,{now=row?.observed_ts}={}){
 const c=row?.n05_component,bars=row?.raw_price_bars,end=row?.window_end,start=row?.window_start,venue=row?.venue;
 if(row?.block_id!=='N10'||row.metric_family!=='CLOSED_15M_INDEPENDENT_PRICE_PATH_CONTEXT'||row.provider_id!=='PRIMARY_TECHNICAL_CONTEXT'||row.upstream_id!==VENUE_PRICE_ROOTS[venue]||!qualifiedVenueComponent(c)||c.contract!==row.htx_contract||c.market!=='SPOT'||c.quote!=='USDT'||c.window_end_ts!==end||c.window_start_ts!==end-240*60000||c.verified_minutes!==240||c.observed_ts!==row.source_cache_observed_ts||
  !Number.isSafeInteger(now)||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||end-start!==15*60000||row.candle_count!==15||row.source_ts!==end||row.first_known_ts!==c.observed_ts||row.observed_ts<row.first_known_ts||row.observed_ts>now||row.expires_at<now||row.expires_at>end+5*60000||!['EXISTING_N05_EXACT_CLOSED_240M_CACHE_SAME_WINDOW',N10_REDERIVED_CACHE_CLOCK].includes(row.source_clock_policy)||row.entry_authorized_by_context!==false||row.liquidation_as_target!==false||row.independent_upstream_root!==true||row.directional_strength!==null||row.risk_strength!==null||row.coverage_fraction!==0||!Array.isArray(bars)||bars.length!==15)return false;
 if(!bars.every((b,i)=>b?.ts===start+i*60000&&b.closed_end===b.ts+59999&&[b.open,b.high,b.low,b.close].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>0)&&b.low<=b.high&&b.open>=b.low&&b.open<=b.high&&b.close>=b.low&&b.close<=b.high&&Number.isFinite(b.activity)&&b.activity>=0))return false;
 // Newly derived rows carry a compact proof of the cached flow rederivation.
 // Historical saved rows retain their existing fifteen-bar verification.
 const binding=row.source_cache_binding;
 if(row.source_clock_policy===N10_REDERIVED_CACHE_CLOCK?!validN10CacheBinding(binding,row,c,bars):binding!==undefined)return false;
 const active=bars.filter(b=>b.activity>0).length,open=bars[0].open,high=Math.max(...bars.map(b=>b.high)),low=Math.min(...bars.map(b=>b.low)),close=bars.at(-1).close,h={open:row.htx_path_open,high:row.htx_path_high,low:row.htx_path_low,close:row.htx_path_close};
 if(active===0||active!==row.active_minute_count||![h.open,h.high,h.low,h.close].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>0)||h.low>h.high||h.open<h.low||h.open>h.high||h.close<h.low||h.close>h.high)return false;
 const comparison=comparePricePaths(open,high,low,close,h);
 const eq=(a,b)=>typeof a==='number'&&Number.isFinite(a)&&Math.abs(a-b)<=Math.max(1,Math.abs(b))*1e-10;
 if(!eq(row.path_open,open)||!eq(row.path_high,high)||!eq(row.path_low,low)||!eq(row.path_close,close)||!eq(row.change_pct,(close/open-1)*100)||!eq(row.htx_close_gap_pct,(close/h.close-1)*100)||row.comparison_status!==comparison)return false;
 const rebuilt=buildEvidenceV2({provider_id:'PRIMARY_TECHNICAL_CONTEXT',upstream_id:VENUE_PRICE_ROOTS[venue],asset_id:`htx-futures:${row.htx_contract}`,htx_contract:row.htx_contract,block_id:'N10',metric_family:'CLOSED_15M_INDEPENDENT_PRICE_PATH_CONTEXT',origin_event_id:`${venue}:${row.htx_contract}:${end}`,dependency_group:`${venue}_OFFICIAL_SPOT_CANDLES:${row.htx_contract}:${end}`,source_ts:end,observed_ts:row.observed_ts,first_known_ts:c.observed_ts,expires_at:row.expires_at,coverage_status:'EXACT_FIFTEEN_CLOSED_ACTIVE_SPOT_MINUTE_CANDLES',coverage_fraction:0,directional_strength:null,risk_strength:null,extra:{venue,market:'SPOT',quote:'USDT',window_start:start,window_end:end,candle_count:15,active_minute_count:active,path_open:open,path_high:high,path_low:low,path_close:close,change_pct:(close/open-1)*100,htx_path_open:h.open,htx_path_high:h.high,htx_path_low:h.low,htx_path_close:h.close,htx_close_gap_pct:(close/h.close-1)*100,comparison_status:comparison,source_cache_observed_ts:c.observed_ts,source_clock_policy:row.source_clock_policy,...(binding?{source_cache_binding:binding}:{}),n05_component:c,raw_price_bars:bars,entry_authorized_by_context:false,liquidation_as_target:false,independent_upstream_root:true}});
 return rebuilt.evidence_id===row.evidence_id&&rebuilt.raw_hash===row.raw_hash;
}

// A completed promise is not proof that its provider returned useful data.
// Check the existing snapshot AND trajectory; a rolling price summary alone
// cannot admit the primary technical pipeline. Flow coverage is independent.
export function buildHtxPrimaryTechnicalReceipt({contract,futures,trajectory,reference_price,now=Date.now(),route_state=null}={}){
 const f=futures?.data,t=trajectory?.data,failures=[];
 const positive=v=>typeof v==='number'&&Number.isFinite(v)&&v>0;
 const fresh=ts=>Number.isSafeInteger(ts)&&ts<=now&&now-ts<=TTL;
 const states=[futures?.execution_status,trajectory?.execution_status].map(v=>String(v||'').toUpperCase());
 if(!isExactHtxUsdtSwapKey(contract)||f?.contract!==contract||t?.contract!==contract||reference_price?.contract!==contract)failures.push('EXACT_SAME_LINEAR_PERPETUAL_REQUIRED');
 if(!states.every(v=>v==='FULFILLED'))failures.push('SNAPSHOT_AND_TRAJECTORY_NOT_COMPLETED');
 if(f?.health?.info!==true||f?.health?.depth!==true||f?.contract_info?.contract_code!==contract||f?.contract_info?.contract_status!==1||!positive(f?.contract_info?.contract_size))failures.push('FACTUAL_ACTIVE_INSTRUMENT_AND_DEPTH_REQUIRED');
 if(reference_price?.status!=='CLOSED'||reference_price?.venue!=='HTX'||reference_price?.type!=='MID_OBSERVATION'||Date.parse(f?.liquidity?.depth_timestamp||'')!==reference_price?.source_ts||!positive(reference_price?.value)||!positive(f?.bbo?.best_bid)||!positive(f?.bbo?.best_ask)||f.bbo.best_ask<f.bbo.best_bid||!fresh(reference_price?.source_ts)||!fresh(reference_price?.received_ts))failures.push('FRESH_PRIMARY_PRICE_REQUIRED');
 if(positive(f?.bbo?.best_bid)&&positive(f?.bbo?.best_ask)&&Math.abs(Number(reference_price?.value)-(f.bbo.best_bid+f.bbo.best_ask)/2)>Math.max(1,(f.bbo.best_bid+f.bbo.best_ask)/2)*1e-9)failures.push('REFERENCE_MUST_MATCH_ACTUAL_BID_ASK');
 if(t?.health?.info!==true||t?.health?.price_1m!==true||t?.contract_info?.contract_code!==contract||!fresh(t?.provider_source_ts))failures.push('FACTUAL_FRESH_TRAJECTORY_REQUIRED');
 const windows=[];
 for(const [label,duration] of Object.entries({'15m':900000,'1h':3600000,'4h':14400000,'24h':86400000})){
  const row=t?.windows?.[label],p=row?.price,start=row?.synchronized_window_start_ts,end=row?.synchronized_window_end_ts;
  if(p?.usable!==true||p?.coverage!=='closed'||p.exact_1m_bars!==true||p.expected_1m_bars!==duration/60000||p.received_1m_bars!==duration/60000||!Number.isSafeInteger(start)||end-start!==duration||!fresh(end)||p.window_start_ts!==start||p.window_end_ts!==end||![p.open,p.high,p.low,p.close].every(positive)||p.low>p.high||p.open<p.low||p.open>p.high||p.close<p.low||p.close>p.high)continue;
  windows.push({label,window_start_ts:start,window_end_ts:end,candle_count:p.received_1m_bars,open:p.open,high:p.high,low:p.low,close:p.close});
 }
 if(!windows.length)failures.push('EXACT_COMPLETE_CLOSED_PRICE_WINDOW_REQUIRED');
 const evidence=readHtxTechnicalStructure({contract,now}).filter(r=>r.metric_family==='CLOSED_CANDLE_RANGE_CONTEXT');
 if(!evidence.length)failures.push('VALIDATED_CLOSED_CANDLE_CONTEXT_REQUIRED');
 const closed=failures.length===0;
 const recentPath=closed?deriveHtxRecentPathEvidence({contract,window:windows.find(w=>w.label==='15m'),source_ts:t.provider_source_ts,observed_ts:now}):[];
 return {status:closed?'CHECKED_PRIMARY_TECHNICAL_CONTEXT':'TECHNICAL_PIPELINE_NOT_CLOSED',check_completed:closed,network_calls:0,evidence:closed?[...evidence,...recentPath]:[],receipts:[{check_completed:closed,status:route_state||'NO_ENTRY_STATE',contract,futures_status:states[0],trajectory_status:states[1],reference_price_status:reference_price?.status||'NOT_EVALUATED',reference_source_ts:reference_price?.source_ts??null,trajectory_source_ts:t?.provider_source_ts??null,actual_price_windows:windows,failures,source_transport:'EXISTING_SAME_CANDIDATE_SNAPSHOT_AND_TRAJECTORY',signed_raw_24h_verified:false,entry_authorized_by_context:false}],entry_rules_changed:false};
}

