import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.env.REPORT2_TEST_RUNTIME?pathToFileURL(path.resolve(process.env.REPORT2_TEST_RUNTIME)+'/src/'):new URL('../files/src/',import.meta.url);
const load=name=>import(new URL(name,root));
const {decodeDydxPinnedSnapshot}=await load('liquidation-extension/dydx-pinned-conditional-levels.mjs');
const {buildDydxNativeMarketCatalog,validateDydxNativeMarketCatalog,dydxNativeMarketCoverage,DYDX_MARKET_CATALOG_TTL}=await load('liquidation-extension/dydx-native-market-catalog.mjs');
const {buildDydxRouting,addDydxCollectionPermission,createDydxRuntimeCollector,validateDydxRouting}=await load('liquidation-extension/dydx-runtime-collector.mjs');
const {fingerprint}=await load('liquidation-extension/core.mjs');
const raw=JSON.parse(gunzipSync(fs.readFileSync('checkpoints/source-inputs/dydx-pinned-native-37612540426.json.gz'))),T=1791371575827;
const universe=JSON.parse(gunzipSync(fs.readFileSync('checkpoints/htx-approved-crypto-futures-universe-20261012.json.gz'))),crypto_assets=new Set(universe.assets.map(a=>a.symbol));
const snapshot=()=>decodeDydxPinnedSnapshot({raw:structuredClone(raw),now:T});
const routing=()=>buildDydxRouting({snapshot:snapshot(),crypto_assets,now:T});

test('original complete296 product catalog prequalifies54 exact assets without claiming any current positions or quote coverage',()=>{
 const catalog=buildDydxNativeMarketCatalog(snapshot());assert.equal(catalog.markets.length,296);
 const supported=universe.assets.filter(a=>dydxNativeMarketCoverage(catalog,{contract:a.asset_analysis_contract,now:T}).status==='SUPPORTED');
 assert.equal(supported.length,54);assert.equal(dydxNativeMarketCoverage(catalog,{contract:'BTW-USDT',now:T}).status,'UNSUPPORTED');
 assert.equal(dydxNativeMarketCoverage(catalog,{contract:'ZEC-USDT',now:T}).position_coverage,false);
 assert.equal(catalog.context_response_sha256,raw.raw[2].receipt.sha256);
 assert.ok(!/oracle|liquidation|quantums|prices|notional|funding_index/.test(JSON.stringify(catalog)));
});
test('fresh complete absence prevents permission, reservation and transport; another exact native product remains collectible',async()=>{
 const r=routing(),base={eligible:false,source_ids:[],proven_level_source_ids:[]};
 let calls=0;const collector=createDydxRuntimeCollector({routing:r,crypto_assets,clock:()=>T,automatic_discovery_enabled:true,fetch_impl:async()=>{calls++;throw Error('UNSUPPORTED_HTTP_FORBIDDEN');}});
 for(const contract of ['BTW-USDT','LSK-USDT','龙虾-USDT']){
  assert.equal(collector.canCollect({contract}),false);
  assert.equal(addDydxCollectionPermission(base,{contract,crypto_assets,routing:r,now:T,automatic_discovery_enabled:true}),base);
  const out=await collector({contract,run_id:'ABSENT',deadline_ts:T+36000});assert.equal(out.status,'SKIPPED_DYDX_NO_EXACT_NATIVE_PRODUCT');assert.equal(out.requests,0);
 }
 assert.equal(calls,0);assert.equal(collector.canCollect({contract:'WIF-USDT'}),true);
 assert.deepEqual(addDydxCollectionPermission(base,{contract:'WIF-USDT',crypto_assets,routing:r,now:T,automatic_discovery_enabled:true}).source_ids,['DYDX_PINNED_NATIVE']);
});
test('old or absent catalog remains unknown so absence never becomes a permanent ban',()=>{
 const r=routing(),base={eligible:false,source_ids:[]},future=r.native_market_catalog.expires_ts;
 assert.equal(dydxNativeMarketCoverage(r.native_market_catalog,{contract:'BTW-USDT',now:future}).status,'CATALOG_DISCOVERY_REQUIRED');
 for(const now of [future,T+2*DYDX_MARKET_CATALOG_TTL])assert.equal(addDydxCollectionPermission(base,{contract:'BTW-USDT',crypto_assets,routing:r,now,automatic_discovery_enabled:true}).eligible,true);
 delete r.native_market_catalog;const {routing_fingerprint,...body}=r;r.routing_fingerprint=fingerprint(body);
 assert.ok(validateDydxRouting(r,{now:T}));assert.equal(addDydxCollectionPermission(base,{contract:'BTW-USDT',crypto_assets,routing:r,now:T,automatic_discovery_enabled:true}).eligible,true);
});
test('partial, future, duplicate IDs, modified catalogs and untrusted snapshots fail closed',()=>{
 const catalog=buildDydxNativeMarketCatalog(snapshot());
 for(const patch of [{complete:false},{received_ts:T+1},{source_ts:T+1},{context_response_sha256:'bad'},{markets:[...catalog.markets,catalog.markets[0]]}]){
  const body={...catalog,...patch};delete body.fingerprint;assert.equal(validateDydxNativeMarketCatalog({...body,fingerprint:fingerprint(body)},{now:T}),null);
 }
 const altered=structuredClone(catalog);altered.markets[0].ticker='FAKE-USD';assert.equal(validateDydxNativeMarketCatalog(altered,{now:T}),null);
 assert.equal(buildDydxNativeMarketCatalog(structuredClone(snapshot())),null);
 const r=routing();r.native_market_catalog.markets[0].id++;assert.equal(validateDydxRouting(r,{now:T}),null);
});
