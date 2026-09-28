import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const runtime=resolve(process.argv[2]||'runtime');
const [{RemoteD1Database},{loadLiquidationVenueCatalog},{createGmxRuntimeCollector}]=await Promise.all([
 import(pathToFileURL(resolve(runtime,'report2-d1-adapter.mjs')).href),
 import(pathToFileURL(resolve(runtime,'src/liquidation-extension/venue-catalog-cache.mjs')).href),
 import(pathToFileURL(resolve(runtime,'src/liquidation-extension/gmx-runtime-collector.mjs')).href),
]);
const bridgeUrl=String(process.env.REPORT2_D1_BRIDGE_URL||'').trim(),bridgeToken=String(process.env.REPORT2_D1_BRIDGE_TOKEN||'').trim();
if(!bridgeUrl||!bridgeToken)throw new Error('D1_BRIDGE_REQUIRED_FOR_GMX_SMOKE');
let calls=0;const fetch_impl=async(...args)=>{if(calls>=8)throw new Error('GMX_SMOKE_HTTP_CAP_EXHAUSTED');calls++;return globalThis.fetch(...args);};
const db=new RemoteD1Database(bridgeUrl,bridgeToken,{fetchImpl:globalThis.fetch,timeoutMs:45_000}),now=Date.now(),catalog=await loadLiquidationVenueCatalog({db,fetch_impl,now});
const globalQuery='query RepresentativeOpenPositions{positions(where:{sizeInUsd_gt:"0",isSnapshot_eq:false},limit:100,orderBy:sizeInUsd_DESC){account market isLong sizeInUsd}}';
const [globalResponse,htxResponse]=await Promise.all([
 fetch_impl('https://gmx.squids.live/gmx-synthetics-arbitrum:prod/api/graphql',{method:'POST',headers:{accept:'application/json','content-type':'application/json'},body:JSON.stringify({query:globalQuery})}),
 fetch_impl('https://api.hbdm.com/linear-swap-api/v1/swap_contract_info',{headers:{accept:'application/json'}}),
]);
const [globalPayload,htxPayload]=await Promise.all([globalResponse.json(),htxResponse.json()]);
if(!globalResponse.ok||!Array.isArray(globalPayload?.data?.positions)||!htxResponse.ok||htxPayload?.status!=='ok'||!Array.isArray(htxPayload?.data))throw new Error('GMX_OR_HTX_DISCOVERY_NOT_CLOSED');
const htxBases=new Set(htxPayload.data.filter(row=>Number(row?.contract_status)===1).map(row=>String(row?.contract_code||'').toUpperCase().match(/^([A-Z0-9]+)-USDT$/)?.[1]).filter(Boolean)),marketBases=new Map(Object.entries(catalog.entries||{}).filter(([base,row])=>base!=='BTC'&&base!=='ETH'&&htxBases.has(base)&&/^0x[0-9a-f]{40}$/i.test(String(row?.gmx_market_address||''))).map(([base,row])=>[String(row.gmx_market_address).toLowerCase(),base])),selected=globalPayload.data.positions.find(row=>marketBases.has(String(row?.market||'').toLowerCase())),base=selected&&marketBases.get(String(selected.market).toLowerCase()),marketAddress=base&&catalog.entries?.[base]?.gmx_market_address,contract=base&&`${base}-USDT`;
if(!base||!contract||!/^0x[0-9a-f]{40}$/i.test(String(marketAddress||'')))throw new Error('GMX_OPEN_HTX_ALT_MARKET_NOT_DISCOVERED');
const collect=createGmxRuntimeCollector({fetch_impl,clock:Date.now,max_wall_ms:30_000}),result=await collect({contract,native_symbol:base,run_id:`GMX_NATIVE_SMOKE:${now}`,acquisition_id:`GMX:${now}`,market_address:marketAddress,deadline_ts:Date.now()+30_000});
const receipt={version:'t16-gmx-native-smoke-v3',contract,market_address:marketAddress,selected_from_open_position_census:true,btc_eth_excluded:true,htx_active_future_verified:true,catalog_status:catalog.status,catalog_network_calls:catalog.network_calls,catalog_receipts:catalog.receipts,result_status:result.status,collector_requests:result.requests,total_network_calls:calls,discovery_positions:result.discovery_positions??null,selected_accounts:result.selected_accounts??null,account_http_closed:result.account_http_closed??null,normalization_statuses:result.normalization_statuses||[],discovery_http_status:result.discovery_http_status??null,discovery_reason:result.discovery_reason||null,zone_count:Number(result.acquisition?.above?.length||0)+Number(result.acquisition?.below?.length||0),telegram_network_calls:0};
console.log('T16_GMX_NATIVE_LIVE_SMOKE',JSON.stringify(receipt));
if(result.status!=='GMX_ACQUIRED_SCOPED_CONTEXT'||receipt.zone_count<1||calls>8||Number(result.requests)<2)throw new Error(`GMX_NATIVE_LIVE_SMOKE_NOT_CLOSED:${result.status}`);
