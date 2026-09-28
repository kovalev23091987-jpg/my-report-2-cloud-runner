import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const runtime=resolve(process.argv[2]||'runtime'),require=createRequire(pathToFileURL(resolve(runtime,'src/liquidation-extension/package.json')).href);
const [{createGTradeRuntimeCollector},sdkPackage,sdk]=await Promise.all([
 import(pathToFileURL(resolve(runtime,'src/liquidation-extension/gtrade-runtime-collector.mjs')).href),
 Promise.resolve(require('@gainsnetwork/sdk/package.json')),
 Promise.resolve(require('@gainsnetwork/sdk')),
]);
if(sdkPackage?.version!=='1.8.10'||typeof sdk?.getLiquidationPrice!=='function'||typeof sdk?.buildLiquidationPriceContext!=='function')throw new Error('PINNED_GTRADE_SDK_NOT_CLOSED');
let calls=0;const fetch_impl=async(...args)=>{if(calls>=3)throw new Error('GTRADE_SMOKE_HTTP_CAP_EXHAUSTED');calls++;return globalThis.fetch(...args);};
const now=Date.now(),collect=createGTradeRuntimeCollector({sdk,fetch_impl,clock:Date.now,max_wall_ms:30_000}),result=await collect({contract:'SOL-USDT',native_symbol:'SOL',run_id:`GTRADE_NATIVE_SMOKE:${now}`,acquisition_id:`GTRADE:${now}`,deadline_ts:Date.now()+30_000});
const receipt={version:'t16-gtrade-native-smoke-v1',contract:'SOL-USDT',sdk_version:sdkPackage.version,result_status:result.status,collector_requests:result.requests,total_network_calls:calls,selected_market_positions:result.selected_market_positions??result.normalized?.selected_market_positions??null,normalization_status:result.normalized?.status||null,zone_count:Number(result.acquisition?.above?.length||0)+Number(result.acquisition?.below?.length||0),telegram_network_calls:0};
console.log('T16_GTRADE_NATIVE_LIVE_SMOKE',JSON.stringify(receipt));
if(!new Set(['GTRADE_ACQUIRED_SCOPED_CONTEXT','GTRADE_NORMALIZATION_NOT_CLOSED','GTRADE_NO_MARKET_POSITIONS']).has(result.status)||calls!==3||result.requests!==3)throw new Error(`GTRADE_NATIVE_LIVE_SMOKE_NOT_CLOSED:${result.status}`);
