import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createCombinedLiquidationService} from '../files/src/liquidation-extension/combined-runner-service.mjs';
import {buildDydxRouting} from '../files/src/liquidation-extension/dydx-runtime-collector.mjs';
import {decodeDydxPinnedSnapshot} from '../files/src/liquidation-extension/dydx-pinned-conditional-levels.mjs';

const raw=JSON.parse(gunzipSync(fs.readFileSync(new URL('../../checkpoints/source-inputs/dydx-pinned-native-37612540426.json.gz',import.meta.url))));
const now=1791371575827,assets=new Set(['WIF','ETH','ATOM']);
const routing=buildDydxRouting({snapshot:decodeDydxPinnedSnapshot({raw:structuredClone(raw),now}),crypto_assets:assets,now});

test('verified structural Hyperliquid market gets an acquisition slot before a recently empty dYdX sample',async()=>{
 const routeOrder=async structural=>{
  let http=0;
  const service=createCombinedLiquidationService({mode:'SHADOW_ONLY',secondary_enabled:false,dydx_enabled:true,dydx_crypto_assets:assets,dydx_routing:routing,candidate_slots:1,max_http_per_run:5,clock:()=>now,fetch_impl:async()=>{http++;throw Error('UNADMITTED_HTTP');},provider_admit:async()=>{throw Error('UNADMITTED_SOURCE');},source_weight_store:{load:async()=>[{source_id:'DYDX_PINNED_NATIVE',attempts:20,reliability:1,last_status:'ROLE_NOT_USABLE:NATIVE_POSITION_CONTEXT:DYDX_NO_ELIGIBLE_SAMPLE_LEVEL',updated_ts:now-1000}]}});
  const result=await service.collect({contract:'WIF-USDT',native_symbol:'WIF',run_id:'OFFLINE_ROUTE_PRIORITY',deep_started_ts:now,max_http_for_candidate:0,allowed_source_ids:['DYDX_PINNED_NATIVE','HYPERLIQUID_NATIVE'],structural_market_source_ids:structural?['HYPERLIQUID_NATIVE']:[]});
  assert.equal(result,null);assert.equal(http,0);assert.equal(service.summary().shared_budget.actual_http,0);
  return service.summary().routed.map(row=>row.lane);
 };
 assert.deepEqual(await routeOrder(false),['DYDX_PINNED_NATIVE','HYPERLIQUID_NATIVE']);
 assert.deepEqual(await routeOrder(true),['HYPERLIQUID_NATIVE','DYDX_PINNED_NATIVE']);
});
