import {readJson} from './io.mjs';import {normalizeGTrade} from './gtrade.mjs';import {createGTradeAcquisition} from './gtrade-runtime-bridge.mjs';
const URLS={variables:'https://backend-arbitrum.gains.trade/trading-variables',trades:'https://backend-arbitrum.gains.trade/open-trades',prices:'https://backend-pricing.eu.gains.trade/charts'};
export function createGTradeRuntimeCollector({sdk,fetch_impl=globalThis.fetch,clock=Date.now,max_wall_ms=20000}={}){
 if(!sdk?.getLiquidationPrice||!sdk?.buildLiquidationPriceContext)throw Error('PINNED_GTRADE_SDK_REQUIRED');
 return async function collect({contract,native_symbol,run_id,acquisition_id,deadline_ts}={}){
  const start=clock(),deadline=Math.min(Number(deadline_ts)||start+max_wall_ms,start+max_wall_ms);if(deadline-start<100)return{status:'GTRADE_DEADLINE_NOT_AVAILABLE',requests:0};
  const get=async url=>readJson(url,{fetch_impl,clock,timeout_ms:Math.max(1,Math.min(10000,deadline-clock())),max_bytes:8000000});
  const result=await Promise.all([get(URLS.variables),get(URLS.trades),get(URLS.prices)]);const completed=clock();
  if(result.some(x=>!x.ok))return{status:'GTRADE_HTTP_NOT_CLOSED',requests:3,reasons:result.map(x=>x.reason)};
  const c={symbol:native_symbol,route_symbol:native_symbol,run_id,snapshot_id:acquisition_id,as_of_ms:completed,received_at_ms:completed,max_age_ms:300000};
  const normalized=normalizeGTrade({variables:result[0].payload,trades:result[1].payload,prices:result[2].payload,receipts:result.map(x=>x.receipt)},c,sdk);
  if(normalized.usable_for_context!==true)return{status:normalized.status||'GTRADE_NORMALIZATION_NOT_CLOSED',requests:3,normalized};
  const acq=createGTradeAcquisition({contract,native_symbol,run_id,acquisition_id,collection_started_ts:start,collection_completed_ts:completed,normalized_receipt:normalized,transport_receipts:result.map(x=>x.receipt),sdk_version:'1.8.10'});
  return{status:'GTRADE_ACQUIRED_SCOPED_CONTEXT',requests:3,acquisition:acq,selected_market_positions:normalized.selected_market_positions,source_ts:normalized.source_ts};
 };
}
