import {selectGTradePinnedPositionSample,buildGTradePinnedRpcBatch,decodeGTradePinnedRpcSnapshot,GTRADE_RPC} from './gtrade-pinned-position-snapshot.mjs';
import {readJson} from './io.mjs';import {normalizeGTrade,resolveGTradeCryptoMarket} from './gtrade.mjs';import {createGTradeAcquisition} from './gtrade-runtime-bridge.mjs';import {timestamp} from './core.mjs';
const URLS={variables:'https://backend-arbitrum.gains.trade/trading-variables',trades:'https://backend-arbitrum.gains.trade/open-trades',prices:'https://backend-pricing.eu.gains.trade/charts'};
export function createGTradeRuntimeCollector({sdk,fetch_impl=globalThis.fetch,clock=Date.now,max_wall_ms=20000}={}){
 if(!sdk?.getLiquidationPrice||!sdk?.buildLiquidationPriceContext)throw Error('PINNED_GTRADE_SDK_REQUIRED');
 const snapshots=new Map(),catalogs=new Map(),catalogValues=new Map(),pinnedPositions=new Map();
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
 async function collect({contract,native_symbol,run_id,acquisition_id,deadline_ts,snapshot_admitted=false,admit_market_snapshot=null,admit_position_snapshot=null,position_batch_contracts=[]}={}){
  if(!(Number(deadline_ts)>clock()))return{status:'GTRADE_DEADLINE_NOT_AVAILABLE',requests:0};
  const catalogCached=catalogs.has(run_id),catalog=await loadCatalog(run_id,deadline_ts),catalogCalls=catalogCached?0:1,sourceTs=timestamp(catalog.payload?.lastRefreshed);
  if(!catalog.ok)return{status:'GTRADE_HTTP_NOT_CLOSED',requests:catalogCalls,reused_catalog:catalogCached,reasons:[catalog.reason]};
  if((!Array.isArray(catalog.payload?.pairs)||!catalog.payload.pairs.length||catalog.payload.pairs.some(p=>typeof p?.from!=='string'||!p.from||typeof p?.to!=='string'||!p.to))||sourceTs===null||sourceTs>clock()||clock()-sourceTs>300000)return{status:'GTRADE_CATALOG_NOT_CLOSED',requests:catalogCalls,reused_catalog:catalogCached};
  const market=resolveGTradeCryptoMarket(catalog.payload,native_symbol);if(!market.supported)return{status:market.status,requests:catalogCalls,reused_catalog:catalogCached,catalog_verified:true};
  if(!snapshots.has(run_id)&&!snapshot_admitted&&typeof admit_market_snapshot==='function'){const grant=await admit_market_snapshot();if(grant?.allowed!==true||grant?.new_reservation!==true)return{status:'SKIPPED_GTRADE_MARKET_SNAPSHOT_BUDGET',reason:grant?.reason??'MARKET_SNAPSHOT_NOT_ADMITTED',requests:catalogCalls,catalog_verified:true,exact_market_supported:true};}
  const cached=snapshots.has(run_id),snapshot=await loadSnapshot(run_id,deadline_ts,catalog),completed=clock(),requests=catalogCalls+(cached?0:snapshot.requests);
  if(snapshot.status!=='GTRADE_SHARED_SNAPSHOT_CLOSED')return{status:snapshot.status,requests,reused_snapshot:cached,reasons:snapshot.reasons};
  if(completed-snapshot.completed_ts>300000)return{status:'GTRADE_SHARED_SNAPSHOT_STALE',requests:0,reused_snapshot:true};
  const pinKey=run_id+':'+native_symbol;let pin=pinnedPositions.get(pinKey)??null,pinCalls=0;
  if(!pin&&typeof admit_position_snapshot==='function'){
   const batchContracts=Array.isArray(position_batch_contracts)&&position_batch_contracts.length>0?position_batch_contracts:[contract];
   if(batchContracts.length>2||new Set(batchContracts).size!==batchContracts.length||!batchContracts.includes(contract)||batchContracts.some(x=>typeof x!=='string'||!/^([^\s-]+)-USDT$/u.test(x)))throw Error('GTRADE_SELECTED_CONTRACT_BATCH_INVALID');
   const markets=batchContracts.map(code=>({contract:code,symbol:code.replace(/-USDT$/,''),market:resolveGTradeCryptoMarket(snapshot.variables,code.replace(/-USDT$/,''))})).filter(x=>x.market.supported).map(x=>({...x,selection:selectGTradePinnedPositionSample(snapshot.trades,x.market.pair_index)}));
   const selected=markets.flatMap(x=>x.selection.selected);
   if(selected.length){
    const grant=await admit_position_snapshot();
    let raw=null,body=null,status,reason=null;
    if(grant?.allowed===true&&grant?.new_reservation===true){
     body=buildGTradePinnedRpcBatch({current_block:snapshot.variables.currentBlock,selected});
     pinCalls=1;
     raw=await readJson(GTRADE_RPC,{method:'POST',body,fetch_impl,clock,timeout_ms:Math.max(1,Math.min(10000,Number(deadline_ts)-clock())),max_bytes:2000000});
     status=raw.ok?'GTRADE_PINNED_SNAPSHOT_NOT_CLOSED':'GTRADE_PINNED_RPC_'+raw.reason;
    }else{status='SKIPPED_GTRADE_PINNED_POSITION_BUDGET';reason=grant?.reason??'POSITION_SNAPSHOT_NOT_ADMITTED';}
    for(const entry of markets.filter(x=>x.selection.selected.length)){
     let result={status,reason,requests:pinCalls,receipt:raw?.receipt??null,batch_contracts:batchContracts,selected_discovery_positions:entry.selection.selected.length};
     if(raw?.ok)try{
      const decoded=decodeGTradePinnedRpcSnapshot({body,response:raw.payload,selected,current_block:snapshot.variables.currentBlock,pair_index:entry.market.pair_index,receipt:raw.receipt,as_of_ms:clock()});
      result={...result,status:decoded.trades.length?'GTRADE_PINNED_OPEN_POSITIONS_CLOSED':'GTRADE_PINNED_SELECTED_POSITIONS_NO_LONGER_OPEN',reason:null,...decoded,candidate_position_count:entry.selection.candidate_count};
     }catch(error){result.reason=String(error.message).slice(0,160);}
     pinnedPositions.set(run_id+':'+entry.symbol,result);
    }
    pin=pinnedPositions.get(pinKey)??null;
   }else pin={status:'GTRADE_NO_SELECTABLE_OPEN_POSITIONS',reason:'NO_EXACT_MARKET_OPEN_POSITION_IDS',requests:0};
  }
  const verifiedPin=pin?.status==='GTRADE_PINNED_OPEN_POSITIONS_CLOSED'?pin:null,normalizationClock=clock();
  const c={symbol:native_symbol,route_symbol:native_symbol,run_id,snapshot_id:acquisition_id,as_of_ms:normalizationClock,received_at_ms:verifiedPin?Math.max(snapshot.completed_ts,verifiedPin.receipt.received_ts):snapshot.completed_ts,max_age_ms:300000};
  const normalized=normalizeGTrade({variables:snapshot.variables,trades:verifiedPin?verifiedPin.trades:snapshot.trades,prices:snapshot.prices,receipts:verifiedPin?[...snapshot.transport_receipts,verifiedPin.receipt]:snapshot.transport_receipts,pinned_positions:verifiedPin?.evidence??null},c,sdk);
  if(normalized.usable_for_context!==true)return{status:normalized.status||'GTRADE_NORMALIZATION_NOT_CLOSED',requests:requests+pinCalls,reused_snapshot:cached,normalized,pinned_position_status:pin?.status??'PINNED_POSITION_SOURCE_NOT_REQUESTED',pinned_position_reason:pin?.reason??null,position_batch_contracts:pin?.batch_contracts??[contract]};
  const acq=createGTradeAcquisition({contract,native_symbol,run_id,acquisition_id,collection_started_ts:snapshot.started_ts,collection_completed_ts:verifiedPin?Math.max(snapshot.completed_ts,verifiedPin.receipt.received_ts):snapshot.completed_ts,normalized_receipt:normalized,transport_receipts:verifiedPin?[...snapshot.transport_receipts,verifiedPin.receipt]:snapshot.transport_receipts,sdk_version:'1.8.10'});
  return{status:'GTRADE_ACQUIRED_SCOPED_CONTEXT',requests:requests+pinCalls,pinned_position_status:pin?.status??'PINNED_POSITION_SOURCE_NOT_REQUESTED',pinned_position_reason:pin?.reason??null,position_batch_contracts:pin?.batch_contracts??[contract],position_source_clock_known:normalized.source_clock_closed===true,reused_snapshot:cached,shared_snapshot_run_id:run_id,acquisition:acq,selected_market_positions:normalized.selected_market_positions,source_ts:normalized.source_ts};
 }
 collect.nativeMarketCoverage=({run_id,native_symbol}={})=>{
  const catalog=catalogValues.get(run_id);if(!catalog)return{status:'CATALOG_DISCOVERY_REQUIRED'};
  const pairs=catalog.payload?.pairs,sourceTs=timestamp(catalog.payload?.lastRefreshed),now=clock();
  if(!catalog.ok||!Array.isArray(pairs)||!pairs.length||pairs.some(p=>typeof p?.from!=='string'||!p.from||typeof p?.to!=='string'||!p.to)||sourceTs===null||sourceTs>now||now-sourceTs>300000)return{status:'CATALOG_NOT_CLOSED'};
  const market=resolveGTradeCryptoMarket(catalog.payload,native_symbol);
  return {status:market.supported?'SUPPORTED':market.status==='GTRADE_SYMBOL_UNSUPPORTED'?'UNSUPPORTED':'IDENTITY_NOT_CLOSED',source_ts:sourceTs,run_id,market_status:market.status};
 };
 collect.hasRunSnapshot=run_id=>snapshots.has(run_id);
 collect.estimateHttpCost=({run_id,native_symbol}={})=>{const catalog=catalogValues.get(run_id);if(!catalog)return 1;if(!catalog.ok||!Array.isArray(catalog.payload?.pairs))return 0;if(!resolveGTradeCryptoMarket(catalog.payload,native_symbol).supported)return 0;return snapshots.has(run_id)?0:2;};
 collect.clearRun=run_id=>{snapshots.delete(run_id);catalogs.delete(run_id);catalogValues.delete(run_id);for(const key of pinnedPositions.keys())if(key.startsWith(run_id+':'))pinnedPositions.delete(key);};
 collect.snapshotCount=()=>snapshots.size;
 collect.catalogCount=()=>catalogs.size;
 return collect;
}
