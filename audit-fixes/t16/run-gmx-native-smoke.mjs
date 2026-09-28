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
let calls=0;const fetch_impl=async(...args)=>{if(calls>=6)throw new Error('GMX_SMOKE_HTTP_CAP_EXHAUSTED');calls++;return globalThis.fetch(...args);};
const db=new RemoteD1Database(bridgeUrl,bridgeToken,{fetchImpl:globalThis.fetch,timeoutMs:45_000}),now=Date.now(),catalog=await loadLiquidationVenueCatalog({db,fetch_impl,now}),marketAddress=catalog.entries?.SOL?.gmx_market_address;
if(!/^0x[0-9a-f]{40}$/i.test(String(marketAddress||'')))throw new Error('GMX_SOL_EXACT_MARKET_NOT_IN_OFFICIAL_CATALOG');
const collect=createGmxRuntimeCollector({fetch_impl,clock:Date.now,max_wall_ms:30_000}),result=await collect({contract:'SOL-USDT',native_symbol:'SOL',run_id:`GMX_NATIVE_SMOKE:${now}`,acquisition_id:`GMX:${now}`,market_address:marketAddress,deadline_ts:Date.now()+30_000});
const receipt={version:'t16-gmx-native-smoke-v2',contract:'SOL-USDT',market_address:marketAddress,catalog_status:catalog.status,catalog_network_calls:catalog.network_calls,catalog_receipts:catalog.receipts,result_status:result.status,collector_requests:result.requests,total_network_calls:calls,discovery_positions:result.discovery_positions??null,selected_accounts:result.selected_accounts??null,account_http_closed:result.account_http_closed??null,normalization_statuses:result.normalization_statuses||[],discovery_http_status:result.discovery_http_status??null,discovery_reason:result.discovery_reason||null,zone_count:Number(result.acquisition?.above?.length||0)+Number(result.acquisition?.below?.length||0),telegram_network_calls:0};
console.log('T16_GMX_NATIVE_LIVE_SMOKE',JSON.stringify(receipt));
if(!new Set(['GMX_ACQUIRED_SCOPED_CONTEXT','GMX_NATIVE_SAMPLE_NOT_CLOSED']).has(result.status)||calls>6||Number(result.requests)<1)throw new Error(`GMX_NATIVE_LIVE_SMOKE_NOT_CLOSED:${result.status}`);
