import {buildEvidenceV2} from './evidence-source-adapters.mjs';
import {isExactHtxUsdtSwapKey} from './htx-contract-key.mjs';
const periods={'1min':60000,'5min':300000,'15min':900000,'30min':1800000,'60min':3600000,'4hour':14400000},captured=new Map(),TTL=180000;
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
  const snapshot=captured.get(contract+':'+period);if(!snapshot||snapshot.observed_ts>now)continue;
  const evidence=normalizeHtxTechnicalStructure({...snapshot,observed_ts:now});if(evidence.length)return evidence;
 }
 return rolling&&rolling.observed_ts<=now?normalizeHtxRollingRange({payload:rolling.payload,contract,observed_ts:now}):[];
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
 return {status:closed?'CHECKED_PRIMARY_TECHNICAL_CONTEXT':'TECHNICAL_PIPELINE_NOT_CLOSED',check_completed:closed,network_calls:0,evidence:closed?evidence:[],receipts:[{check_completed:closed,status:route_state||'NO_ENTRY_STATE',contract,futures_status:states[0],trajectory_status:states[1],reference_price_status:reference_price?.status||'NOT_EVALUATED',reference_source_ts:reference_price?.source_ts??null,trajectory_source_ts:t?.provider_source_ts??null,actual_price_windows:windows,failures,source_transport:'EXISTING_SAME_CANDIDATE_SNAPSHOT_AND_TRAJECTORY',signed_raw_24h_verified:false,entry_authorized_by_context:false}],entry_rules_changed:false};
}
