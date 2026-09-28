import {readJson} from './io.mjs';import {normalizeGTrade} from './gtrade.mjs';import {createGTradeAcquisition} from './gtrade-runtime-bridge.mjs';
const URLS={variables:'https://backend-arbitrum.gains.trade/trading-variables',trades:'https://backend-arbitrum.gains.trade/open-trades',prices:'https://backend-pricing.eu.gains.trade/charts'};
export function createGTradeRuntimeCollector({sdk,fetch_impl=globalThis.fetch,clock=Date.now,max_wall_ms=20000}={}){
 if(!sdk?.getLiquidationPrice||!sdk?.buildLiquidationPriceContext)throw Error('PINNED_GTRADE_SDK_REQUIRED');
 const snapshots=new Map();
 const loadSnapshot=(run_id,deadline_ts)=>{
  if(snapshots.has(run_id))return snapshots.get(run_id);
  const start=clock(),deadline=Math.min(Number(deadline_ts)||start+max_wall_ms,start+max_wall_ms);
  const promise=(async()=>{
   if(deadline-start<100)return{status:'GTRADE_DEADLINE_NOT_AVAILABLE',requests:0,run_id,started_ts:start,completed_ts:clock()};
   const get=async url=>readJson(url,{fetch_impl,clock,timeout_ms:Math.max(1,Math.min(10000,deadline-clock())),max_bytes:8000000});
   const result=await Promise.all([get(URLS.variables),get(URLS.trades),get(URLS.prices)]),completed=clock();
   if(result.some(x=>!x.ok))return{status:'GTRADE_HTTP_NOT_CLOSED',requests:3,reasons:result.map(x=>x.reason),run_id,started_ts:start,completed_ts:completed,transport_receipts:result.map(x=>x.receipt)};
   return{status:'GTRADE_SHARED_SNAPSHOT_CLOSED',requests:3,run_id,started_ts:start,completed_ts:completed,variables:result[0].payload,trades:result[1].payload,prices:result[2].payload,transport_receipts:result.map(x=>x.receipt)};
  })();
  snapshots.set(run_id,promise);return promise;
 };
 async function collect({contract,native_symbol,run_id,acquisition_id,deadline_ts}={}){
  const cached=snapshots.has(run_id),snapshot=await loadSnapshot(run_id,deadline_ts),completed=clock();
  if(snapshot.status!=='GTRADE_SHARED_SNAPSHOT_CLOSED')return{status:snapshot.status,requests:cached?0:snapshot.requests,reused_snapshot:cached,reasons:snapshot.reasons};
  if(completed-snapshot.completed_ts>300000)return{status:'GTRADE_SHARED_SNAPSHOT_STALE',requests:0,reused_snapshot:true};
  const c={symbol:native_symbol,route_symbol:native_symbol,run_id,snapshot_id:acquisition_id,as_of_ms:completed,received_at_ms:snapshot.completed_ts,max_age_ms:300000};
  const normalized=normalizeGTrade({variables:snapshot.variables,trades:snapshot.trades,prices:snapshot.prices,receipts:snapshot.transport_receipts},c,sdk);
  if(normalized.usable_for_context!==true)return{status:normalized.status||'GTRADE_NORMALIZATION_NOT_CLOSED',requests:cached?0:3,reused_snapshot:cached,normalized};
  const acq=createGTradeAcquisition({contract,native_symbol,run_id,acquisition_id,collection_started_ts:snapshot.started_ts,collection_completed_ts:snapshot.completed_ts,normalized_receipt:normalized,transport_receipts:snapshot.transport_receipts,sdk_version:'1.8.10'});
  return{status:'GTRADE_ACQUIRED_SCOPED_CONTEXT',requests:cached?0:3,reused_snapshot:cached,shared_snapshot_run_id:run_id,acquisition:acq,selected_market_positions:normalized.selected_market_positions,source_ts:normalized.source_ts};
 }
 collect.hasRunSnapshot=run_id=>snapshots.has(run_id);
 collect.clearRun=run_id=>snapshots.delete(run_id);
 collect.snapshotCount=()=>snapshots.size;
 return collect;
}
