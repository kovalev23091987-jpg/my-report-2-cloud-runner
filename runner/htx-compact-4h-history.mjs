import {createHash} from 'node:crypto';
import {isExactHtxUsdtSwapKey} from '../current-generation/files/src/htx-contract-key.mjs';

// A compact HTX-native 4h OHLC history is NOT 1m trade/event history.
// One official HTTP attempt per asset, same D1 source ledger as daily ZIPs.
export const COMPACT_HTX_4H=Object.freeze({
 schema:'HTX_COMPACT_90D_4H_PRICE_ONLY_V1',
 source:'HTX_DELAYED_KLINE_ARCHIVE_QUALIFICATION',
 endpoint:'https://api.hbdm.com/linear-swap-ex/market/history/kline',
 period:'4hour',size:1200,period_ms:14_400_000,days:90,bars:540,
 anchor_end_ts:Date.UTC(2026,9,10),daily_source_cap:6,attempts_per_asset:1,
 role:'HISTORICAL_COARSE_PRICE_ONLY'
});
const hash=v=>createHash('sha256').update(v).digest('hex');
const isTs=v=>Number.isSafeInteger(v)&&v>0;
const fail=(status,extra={})=>({schema:COMPACT_HTX_4H.schema,status,complete_90d_4h_price_only:false,
 native_1m_complete:false,volume_qualified:false,live_quote_eligible:false,
 decision_replay_eligible:false,entry_authorized:false,score_contribution:0,
 actual_ENTRY:false,project_complete:false,...extra});
export function exactCompactHtxUrl(contract) {
 if(!isExactHtxUsdtSwapKey(contract))return null;
 return COMPACT_HTX_4H.endpoint+'?contract_code='+encodeURIComponent(contract)+'&period=4hour&size=1200';
}
export function planCompactHtx90d({universe,manifests=[],now_ts=Date.now(),limit=6}={}) {
 if(universe?.status!=='CLOSED'||universe.assets?.length!==102||
   !universe.assets.every(x=>isExactHtxUsdtSwapKey(x.asset_analysis_contract))||
   !isTs(now_ts)||now_ts<COMPACT_HTX_4H.anchor_end_ts||
   !Number.isSafeInteger(limit)||limit<1||limit>COMPACT_HTX_4H.daily_source_cap||
   !Array.isArray(manifests)||manifests.length>102)
   return fail('EXACT_UNIVERSE_AND_BOUNDED_PLAN_REQUIRED',{planned:[],sourceHTTP:0});
 const contracts=universe.assets.map(x=>x.asset_analysis_contract);
 if(new Set(contracts).size!==102)return fail('DUPLICATE_ANALYSIS_CONTRACT',{planned:[],sourceHTTP:0});
 const known=new Map();
 for(const m of manifests){
   if(!contracts.includes(m?.contract)||known.has(m.contract)||
      m.schema!==COMPACT_HTX_4H.schema||m.anchor_end_ts!==COMPACT_HTX_4H.anchor_end_ts||
      !isTs(m.attempted_ts)||m.attempted_ts>now_ts||
      !['COMPLETE_90D_4H_PRICE_ONLY','PARTIAL_90D_4H_PRICE_ONLY','HTTP_UNAVAILABLE','INVALID_HTX_4H_RESPONSE','NETWORK_UNAVAILABLE'].includes(m.status))
      return fail('UNTRUSTED_EXISTING_MANIFEST',{planned:[],sourceHTTP:0});
   known.set(m.contract,m);
 }
 const fresh=[],retry=[];
 for(const contract of contracts.sort()){
   const m=known.get(contract);
   if(!m)fresh.push(contract);
   else if(m.status!=='COMPLETE_90D_4H_PRICE_ONLY'&&now_ts-m.attempted_ts>=7*86400000&&
     (m.attempts_total??1)<3)retry.push(contract);
 }
 // Calibrate against the independently retained native NEAR 1m proof first.
 fresh.sort((a,b)=>Number(b==='NEAR-USDT')-Number(a==='NEAR-USDT')||a.localeCompare(b));
 const pilot=known.get('NEAR-USDT');
 const pilotQualified=pilot?.status==='COMPLETE_90D_4H_PRICE_ONLY';
 const candidates=pilotQualified?[...fresh,...retry]:
   fresh.includes('NEAR-USDT')?['NEAR-USDT']:
   retry.includes('NEAR-USDT')?['NEAR-USDT']:[];
 const planned=candidates.slice(0,pilotQualified?limit:1).map(contract=>({
   contract,url:exactCompactHtxUrl(contract),anchor_end_ts:COMPACT_HTX_4H.anchor_end_ts,
   period:'4hour',size:1200,source_http_reserved:1,availability_unproven:true,
   native_1m_complete:false,entry_authorized:false
 }));
 return {schema:'HTX_COMPACT_90D_4H_ACQUISITION_PLAN_V1',status:planned.length?'BOUNDED_COMPACT_ACQUISITION_PLAN':pilotQualified?'ALL_CONTRACTS_ATTEMPTED_OR_COOLDOWN':'PILOT_NEAR_NOT_VERIFIED_OR_COOLDOWN',
   assets:102,pilot_qualified:pilotQualified,complete_90d_4h_price_only:[...known.values()].filter(m=>m.status==='COMPLETE_90D_4H_PRICE_ONLY').length,
   attempted_assets:known.size,unattempted_assets:fresh.length,eligible_retry_assets:retry.length,
   planned,planned_source_http:planned.length,source_daily_cap:6,source_ledger:COMPACT_HTX_4H.source,
   same_source_as_daily_zip:true,sourceHTTP:0,D1:0,Telegram:0,actual_ENTRY:false,project_complete:false};
}
export function qualifyCompactHtx90d({contract,raw,received_ts,anchor_end_ts=COMPACT_HTX_4H.anchor_end_ts}={}) {
 const base={contract,anchor_end_ts,period:'4hour',expected_bars:COMPACT_HTX_4H.bars,
   history_role:COMPACT_HTX_4H.role,venue:'HTX_USDT_LINEAR_SWAP',
   source:COMPACT_HTX_4H.source,source_url:exactCompactHtxUrl(contract),
   received_ts,raw_sha256:typeof raw==='string'?hash(raw):null};
 if(!base.source_url||!isTs(received_ts)||anchor_end_ts!==COMPACT_HTX_4H.anchor_end_ts||
   typeof raw!=='string'||Buffer.byteLength(raw,'utf8')>1_500_000)
   return {...fail('INVALID_HTX_4H_RESPONSE',base),reason:'EXACT_BOUNDED_INPUT_REQUIRED',candles:[]};
 let j;try{j=JSON.parse(raw);}catch{return {...fail('INVALID_HTX_4H_RESPONSE',base),reason:'INVALID_JSON',candles:[]};}
 if(j?.status!=='ok'||j?.ch!==('market.'+contract+'.kline.4hour')||
   !isTs(j?.ts)||j.ts>received_ts||j.ts<anchor_end_ts||
   !Array.isArray(j.data)||j.data.length>2000)
   return {...fail('INVALID_HTX_4H_RESPONSE',base),reason:'HTX_CHANNEL_CLOCK_OR_SHAPE_INVALID',candles:[]};
 const start=anchor_end_ts-COMPACT_HTX_4H.days*86400000,step=COMPACT_HTX_4H.period_ms;
 const seen=new Set(),accepted=new Map();
 for(const r of j.data){
   if(!Number.isSafeInteger(r?.id)||r.id<=0)return {...fail('INVALID_HTX_4H_RESPONSE',base),reason:'INVALID_NATIVE_BAR_ID',candles:[]};
   const ts=r.id*1000;
   if(ts%step!==0||ts+step>j.ts)continue; // Open or off-grid bars are not qualified.
   if(ts<start||ts>=anchor_end_ts)continue;
   if(seen.has(ts))return {...fail('INVALID_HTX_4H_RESPONSE',base),reason:'DUPLICATE_CLOSED_BAR',candles:[]};
   seen.add(ts);
   const n={};for(const k of ['open','high','low','close'])n[k]=Number(r[k]);
   if(Object.values(n).some(v=>!Number.isFinite(v)||v<=0)||n.low>Math.min(n.open,n.close)||
      n.high<Math.max(n.open,n.close)||n.low>n.high)
     return {...fail('INVALID_HTX_4H_RESPONSE',base),reason:'INVALID_OHLC_GEOMETRY',candles:[]};
   accepted.set(ts,{open_ts:ts,close_ts:ts+step-1,...n,closed:true,history_role:COMPACT_HTX_4H.role,
      live_quote_eligible:false,entry_authorized:false});
 }
 const candles=[...accepted.values()].sort((a,b)=>a.open_ts-b.open_ts),gaps=[];
 for(let ts=start;ts<anchor_end_ts;ts+=step)if(!accepted.has(ts)){
   if(gaps.length&&gaps.at(-1).end_ts===ts)gaps.at(-1).end_ts+=step;
   else gaps.push({start_ts:ts,end_ts:ts+step});
 }
 const complete=candles.length===COMPACT_HTX_4H.bars&&gaps.length===0;
 return {...fail(complete?'COMPLETE_90D_4H_PRICE_ONLY':'PARTIAL_90D_4H_PRICE_ONLY',base),
   source_ts:j.ts,window_start_ts:start,window_end_ts:anchor_end_ts,
   observed_bars:candles.length,missing_bars:COMPACT_HTX_4H.bars-candles.length,
   complete_90d_4h_price_only:complete,complete_30d_4h_price_only:
      candles.filter(c=>c.open_ts>=anchor_end_ts-30*86400000).length===180&&
      !gaps.some(g=>g.end_ts>anchor_end_ts-30*86400000),
   gaps,normalized_sha256:hash(JSON.stringify(candles)),candles};
}
