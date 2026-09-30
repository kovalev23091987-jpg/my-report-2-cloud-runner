import {readJson} from './io.mjs';import {normalizeGTrade} from './gtrade.mjs';import {createGTradeAcquisition} from './gtrade-runtime-bridge.mjs';import {timestamp} from './core.mjs';
const URLS={variables:'https://backend-arbitrum.gains.trade/trading-variables',trades:'https://backend-arbitrum.gains.trade/open-trades',prices:'https://backend-pricing.eu.gains.trade/charts'};
export function createGTradeRuntimeCollector({sdk,fetch_impl=globalThis.fetch,clock=Date.now,max_wall_ms=20000}={}){
 if(!sdk?.getLiquidationPrice||!sdk?.buildLiquidationPriceContext)throw Error('PINNED_GTRADE_SDK_REQUIRED');
 const snapshots=new Map(),catalogs=new Map(),catalogValues=new Map();
 const loadCatalog=(run_id,deadline_ts)=>{if(catalogs.has(run_id))return catalogs.get(run_id);const promise=readJson(URLS.variables,{fetch_impl,clock,timeout_ms:Math.max(1,Math.min(10000,Number(deadline_ts)-clock())),max_bytes:8000000}).then(raw=>{catalogValues.set(run_id,raw);return raw;});catalogs.set(run_id,promise);return promise;};
 const loadSnapshot=(run_id,deadline_ts,catalog)=>{
  if(snapshots.has(run_id))return snapshots.get(run_id);
  const start=clock(),deadline=Math.min(Number(deadline_ts)||start+max_wall_ms,start+max_wall_ms);
  const promise=(async()=>{
   if(deadline-start<100)return{status:'GTRADE_DEADLINE_NOT_AVAILABLE',requests:0,run_id,started_ts:start,completed_ts:clock()};
   const get=async url=>readJson(url,{fetch_impl,clock,timeout_ms:Math.max(1,Math.min(10000,deadline-clock())),max_bytes:8000000});
   const result=[catalog,...await Promise.all([get(URLS.trades),get(URLS.prices)])],completed=clock();
   if(result.some(x=>!x.ok))return{status:'GTRADE_HTTP_NOT_CLOSED',requests:2,reasons:result.map(x=>x.reason),run_id,started_ts:start,completed_ts:completed,transport_receipts:result.map(x=>x.receipt)};
   return{status:'GTRADE_SHARED_SNAPSHOT_CLOSED',requests:2,run_id,started_ts:start,completed_ts:completed,variables:result[0].payload,trades:result[1].payload,prices:result[2].payload,transport_receipts:result.map(x=>x.receipt)};
  })();
  snapshots.set(run_id,promise);return promise;
 };
 async function collect({contract,native_symbol,run_id,acquisition_id,deadline_ts,snapshot_admitted=false,admit_market_snapshot=null}={}){
  if(!(Number(deadline_ts)>clock()))return{status:'GTRADE_DEADLINE_NOT_AVAILABLE',requests:0};
  const catalogCached=catalogs.has(run_id),catalog=await loadCatalog(run_id,deadline_ts),catalogCalls=catalogCached?0:1,sourceTs=timestamp(catalog.payload?.lastRefreshed);
  if(!catalog.ok)return{status:'GTRADE_HTTP_NOT_CLOSED',requests:catalogCalls,reused_catalog:catalogCached,reasons:[catalog.reason]};
  if((!Array.isArray(catalog.payload?.pairs)||!catalog.payload.pairs.length||catalog.payload.pairs.some(p=>typeof p?.from!=='string'||!p.from||typeof p?.to!=='string'||!p.to))||sourceTs===null||sourceTs>clock()||clock()-sourceTs>300000)return{status:'GTRADE_CATALOG_NOT_CLOSED',requests:catalogCalls,reused_catalog:catalogCached};
  if(!catalog.payload.pairs.some(p=>p?.from===native_symbol&&p?.to==='USD'))return{status:'GTRADE_SYMBOL_UNSUPPORTED',requests:catalogCalls,reused_catalog:catalogCached,catalog_verified:true};
  if(!snapshots.has(run_id)&&!snapshot_admitted&&typeof admit_market_snapshot==='function'){const grant=await admit_market_snapshot();if(grant?.allowed!==true||grant?.new_reservation!==true)return{status:'SKIPPED_GTRADE_MARKET_SNAPSHOT_BUDGET',reason:grant?.reason??'MARKET_SNAPSHOT_NOT_ADMITTED',requests:catalogCalls,catalog_verified:true,exact_market_supported:true};}
  const cached=snapshots.has(run_id),snapshot=await loadSnapshot(run_id,deadline_ts,catalog),completed=clock(),requests=catalogCalls+(cached?0:snapshot.requests);
  if(snapshot.status!=='GTRADE_SHARED_SNAPSHOT_CLOSED')return{status:snapshot.status,requests,reused_snapshot:cached,reasons:snapshot.reasons};
  if(completed-snapshot.completed_ts>300000)return{status:'GTRADE_SHARED_SNAPSHOT_STALE',requests:0,reused_snapshot:true};
  const c={symbol:native_symbol,route_symbol:native_symbol,run_id,snapshot_id:acquisition_id,as_of_ms:completed,received_at_ms:snapshot.completed_ts,max_age_ms:300000};
  const normalized=normalizeGTrade({variables:snapshot.variables,trades:snapshot.trades,prices:snapshot.prices,receipts:snapshot.transport_receipts},c,sdk);
  if(normalized.usable_for_context!==true)return{status:normalized.status||'GTRADE_NORMALIZATION_NOT_CLOSED',requests,reused_snapshot:cached,normalized};
  const acq=createGTradeAcquisition({contract,native_symbol,run_id,acquisition_id,collection_started_ts:snapshot.started_ts,collection_completed_ts:snapshot.completed_ts,normalized_receipt:normalized,transport_receipts:snapshot.transport_receipts,sdk_version:'1.8.10'});
  return{status:'GTRADE_ACQUIRED_SCOPED_CONTEXT',requests,reused_snapshot:cached,shared_snapshot_run_id:run_id,acquisition:acq,selected_market_positions:normalized.selected_market_positions,source_ts:normalized.source_ts};
 }
 collect.hasRunSnapshot=run_id=>snapshots.has(run_id);
 collect.estimateHttpCost=({run_id,native_symbol}={})=>{const catalog=catalogValues.get(run_id);if(!catalog)return 1;if(!catalog.ok||!Array.isArray(catalog.payload?.pairs))return 0;if(!catalog.payload.pairs.some(p=>p?.from===native_symbol&&p?.to==='USD'))return 0;return snapshots.has(run_id)?0:2;};
 collect.clearRun=run_id=>{snapshots.delete(run_id);catalogs.delete(run_id);catalogValues.delete(run_id);};
 collect.snapshotCount=()=>snapshots.size;
 collect.catalogCount=()=>catalogs.size;
 return collect;
}
