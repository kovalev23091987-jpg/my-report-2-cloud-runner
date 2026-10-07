import {createWeeklyNativeCoverageSession} from './weekly-native-coverage-session.mjs';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const root=path.resolve(process.argv[2]||'runtime'),load=n=>import(pathToFileURL(path.join(root,n)));
const [{RemoteD1Database},coverage,tracked,io,providers,sampler,allowances,admission,bykQuota,swole,dydx,sourceBudget]=await Promise.all([
 load('report2-d1-adapter.mjs'),load('src/liquidation-futures-coverage.mjs'),load('src/byk-tracked-future-map.mjs'),load('src/liquidation-extension/io.mjs'),load('src/liquidation-extension/providers.mjs'),load('src/liquidation-extension/select-native-account-sample.mjs'),load('src/liquidation-extension/install-source-allowances.mjs'),load('src/liquidation-extension/d1-source-admission.mjs'),load('byk-quota-budget.mjs'),load('src/liquidation-extension/swole-account-discovery.mjs'),load('src/liquidation-extension/dydx-runtime-collector.mjs'),load('src/liquidation-extension/run-source-budget.mjs')]);
const sha=value=>crypto.createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const setMaintenanceOutput=value=>{if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,`maintenance_active=${value?'true':'false'}\n`);};
const universeBytes=fs.readFileSync('checkpoints/htx-all-modes-crypto-futures-universe-20261004.json.gz'),universe=JSON.parse(zlib.gunzipSync(universeBytes)),universeSha=sha(universeBytes);
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),started=Date.now(),requestedCap=Number(process.env.REPORT2_COVERAGE_MAINTENANCE_HTTP_CAP||120),maxHttp=Number.isSafeInteger(requestedCap)?Math.max(1,Math.min(120,requestedCap)):120,runId=`LIQ_WEEKLY:${process.env.GITHUB_RUN_ID}:${started}`;
const active=await coverage.loadFuturesCoverageDatabase({db,now:started});assert.equal(coverage.validateFuturesCoverageDatabase(active),true);assert.equal(active.universe_sha256,universeSha);assert.equal(active.crypto_future_assets,102);assert.equal(active.crypto_future_contracts,119);
if(started<active.weekly_refresh_due_ts){const result={schema:'report2-liquidation-coverage-weekly-v1',status:'NOT_DUE',source_http:0,weekly_refresh_due_ts:active.weekly_refresh_due_ts,assets:102,cells:816,technical_telegram:false};setMaintenanceOutput(false);fs.writeFileSync('liquidation-coverage-weekly-result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));process.exit(0);}
setMaintenanceOutput(true);
let database=await coverage.loadFuturesCoverageRefreshDatabase({db,now:started});
if(!coverage.validateFuturesCoverageDatabase(database)||database.universe_sha256!==universeSha||database.refresh_from_updated_ts!==active.updated_ts){const refresh=coverage.resetFuturesCoverageForWeeklyRefresh(active,{now:started});assert.equal(refresh.reset,true);database=refresh.database;}

let http=0,lastNow=Math.max(database.updated_ts,started),bykCalls=0,hyperCalls=0,liqflowCalls=0,nativeReusedChecks=0,swoleCalls=0,dydxCalls=0;const checks=[],sourceReceipts=[];
const clock=()=>Math.max(Date.now(),++lastNow),proof=value=>sha({universe_sha256:universeSha,...value});
const pending=(asset,source)=>asset.source_checks[source].status==='UNVERIFIED'||asset.source_checks[source].status==='QUOTA_DEFERRED';
for(const asset of database.assets)for(const [source_id,policy] of Object.entries(coverage.NON_QUALIFYING_FUTURE_SOURCE_POLICIES))if(pending(asset,source_id))checks.push({contract:asset.analysis_contract,source_id,status:'NO_REAL_NUMERIC_LEVELS',source_proof_sha256:proof({source_id,policy,contract:asset.analysis_contract,policy_version:coverage.LIQUIDATION_COVERAGE_VERSION}),now:clock()});
const proxyUrl=String(process.env.REPORT2_SOURCE_PROXY_URL||''),proxyToken=String(process.env.REPORT2_SOURCE_PROXY_TOKEN||'');
const protectedFetch=async target=>{if(!proxyUrl||!proxyToken)throw Error('SOURCE_PROXY_REQUIRED');http++;bykCalls++;return fetch(proxyUrl,{method:'POST',headers:{'content-type':'application/json',accept:'application/json',authorization:`Bearer ${proxyToken}`,'user-agent':'My-Report-2/Liquidation-Coverage-Audit'},body:JSON.stringify({url:String(target)})});};
await bykQuota.installBykQuotaLedger(db);const reserveByk=bykQuota.makeBykReserve(db,{source:'schedule'});
const nativeHttpReserve=Math.min(40,Math.max(1,Math.floor(maxHttp/3))); // Includes the bounded additional dYdX discovery, never raises maxHttp.
const bykCap=Math.min(102,Math.max(0,maxHttp-nativeHttpReserve));
for(const asset of database.assets){
 if(!pending(asset,'BYK_TRACKED_HL_BANDS')||bykCalls>=bykCap)continue;
 const contract=asset.analysis_contract,symbol=asset.symbol,now=clock(),grant=await reserveByk({contract,run_id:runId,units:1});
 if(grant.allowed!==true){checks.push({contract,source_id:'BYK_TRACKED_HL_BANDS',status:'QUOTA_DEFERRED',source_proof_sha256:proof({source_id:'BYK_TRACKED_HL_BANDS',contract,status:grant.status}),now});continue;}
 const raw=await io.readJson(`https://bykaranteli.com/api/public/hyperliquid-positions?coin=${encodeURIComponent(symbol)}&hours=1`,{fetch_impl:protectedFetch,max_bytes:8000000,timeout_ms:12000});
 const normalized=raw.ok?tracked.normalizeTrackedBands(raw.payload,{contract,run_id:runId,observed_ts:raw.receipt.received_ts??clock()}):null,map=normalized?.maps?.[0]??null,checked=clock();
 let status='QUOTA_DEFERRED',receipt=null;if(map&&coverage.qualifyNumericFutureReceipt({source_id:'BYK_TRACKED_HL_BANDS',receipt:map,contract,now:checked})){status='REAL_NUMERIC_LEVELS';receipt=map;}else if(['INVALID_CONTRACT','EXACT_SYMBOL_MISMATCH'].includes(normalized?.status))status='EXACT_SOURCE_MARKET_UNSUPPORTED';else if(raw.ok)status='NO_REAL_NUMERIC_LEVELS';
 checks.push({contract,source_id:'BYK_TRACKED_HL_BANDS',status,receipt,source_proof_sha256:receipt?null:proof({source_id:'BYK_TRACKED_HL_BANDS',contract,status,transport:raw.receipt?.sha256??null,reason:raw.reason??normalized?.status??null}),now:checked});
 sourceReceipts.push({source_id:'BYK_TRACKED_HL_BANDS',contract,status,http_status:raw.receipt?.http_status??null,transport_sha256:raw.receipt?.sha256??null,zone_count:map?.zones?.length??0});
}
const setup=await allowances.installSourceAllowances({db,enable_swole_discovery:true,enable_dydx_native:true,now:clock(),liqflow_key:process.env.LIQFLOW_API_KEY||'',oxarchive_key:process.env.OXARCHIVE_API_KEY||''});
const sourceAdmit=admission.createD1SourceAdmission({db,scope_bindings:setup.bindings,within_run_budget:()=>{const usage=db.usageSnapshot();return{allowed:usage.unknown_ops===0&&usage.rows_read<50000&&usage.rows_written<800};}});
// The eight legacy evidence cells remain unchanged. dYdX is a separately
// admitted calculated-context lane with original native account hints only.
let dydxDiscovery={status:'EXISTING_WEEKLY_HTTP_ROOM_NOT_AVAILABLE',source_http:0};
if(maxHttp-http>=3){
 const within=extra=>{const u=db.usageSnapshot();return{allowed:u.unknown_ops===0&&u.rows_read+extra.rows_read+100<=54000&&u.rows_written+extra.rows_written+12<=840};};
 let routing=await dydx.loadDydxRouting({db,now:clock(),db_admit:within}),saved=null;
 const budget=sourceBudget.createSharedSourceBudget({provider_admit:sourceAdmit,max_requests:3,clock,fetch_impl:async(...args)=>{http++;dydxCalls++;return fetch(...args);}}),deadline=clock()+45000;
 const grant=await budget.admit({reservation_id:runId+':DYDX_PAGE',run_id:runId,contract:'ALL_VERIFIED_HTX_CRYPTO_FUTURES',requests:{DYDX_RPC:3},max_requests:3,deadline_ts:deadline});
 if(grant.allowed===true&&grant.new_reservation===true){
  const collect=dydx.createDydxRuntimeCollector({fetch_impl:budget.fetch,clock,crypto_assets:new Set(database.assets.map(a=>a.symbol)),routing,on_snapshot:async payload=>{saved=await dydx.saveDydxRouting({db,previous:routing,...payload,db_admit:within});routing=saved.routing??routing;}}),result=await collect({run_id:runId,discovery:true,activity_discovery:routing?.last_discovery_kind!=='CURRENT_BLOCK_ACTIVE_ACCOUNTS',deadline_ts:deadline});
  dydxDiscovery={status:result.status,reason:result.reason??null,source_http:budget.summary().actual_http,source_ts:result.snapshot?.source_ts??null,height:result.snapshot?.height??null,sample_accounts:result.snapshot?.subaccounts.length??0,discovery_kind:result.routing?.last_discovery_kind??null,active_block_account_count:result.snapshot?.activity_discovery?.unique_observed_accounts??null,structural_routing_status:saved?.status??'NOT_SAVED',structural_accounts:saved?.accounts??null,pagination_retained:Boolean(result.routing?.next_page_key_hex),current_levels_claimed:false,full_market_coverage_claimed:false};
 }else dydxDiscovery={status:'DYDX_SOURCE_NOT_ADMITTED',reason:grant.reason,source_http:0};
 sourceReceipts.push({source_id:'DYDX_PINNED_NATIVE',...dydxDiscovery});
}
const nativeSession=createWeeklyNativeCoverageSession({official_trades_enabled:true,run_id:runId,source_admit:sourceAdmit,read_json:io.readJson,select_accounts:sampler.selectNativeAccountSample,normalize_native:providers.normalizeNativeHL,available_requests:()=>Math.max(0,maxHttp-http),on_request:provider=>{http++;if(provider==='HYPERLIQUID')hyperCalls++;else if(provider==='SWOLE_DISCOVERY')swoleCalls++;else liqflowCalls++;},read_swole:setup.bindings.SWOLE_DISCOVERY?swole.readSwoleAccountDiscovery:null,clock,liqflow_key:process.env.LIQFLOW_API_KEY||''});
const catalog=database.assets.some(a=>pending(a,'HYPERLIQUID_NATIVE'))?await nativeSession.ensureCatalog():null;
const hlRows=Array.isArray(catalog?.payload?.[0]?.universe)?catalog.payload[0].universe:[],contexts=Array.isArray(catalog?.payload?.[1])?catalog.payload[1]:[];
for(const asset of database.assets){
 if(!pending(asset,'HYPERLIQUID_NATIVE'))continue;const contract=asset.analysis_contract,symbol=asset.symbol,index=hlRows.findIndex(r=>r?.name===symbol&&r?.isDelisted!==true),checked=clock();
 if(!catalog?.ok){checks.push({contract,source_id:'HYPERLIQUID_NATIVE',status:'QUOTA_DEFERRED',source_proof_sha256:proof({source_id:'HYPERLIQUID_NATIVE',contract,catalog_status:catalog?.reason??'NOT_RUN'}),now:checked});continue;}
 if(index<0){checks.push({contract,source_id:'HYPERLIQUID_NATIVE',status:'EXACT_SOURCE_MARKET_UNSUPPORTED',source_proof_sha256:proof({source_id:'HYPERLIQUID_NATIVE',contract,catalog_sha256:catalog.receipt.sha256}),now:checked});continue;}
 const sample=await nativeSession.collect({contract,symbol,mark_price:Number.isFinite(Number(contexts[index]?.markPx))?Number(contexts[index].markPx):null}),observed=clock(),receipt=sample.receipt;
 const status=receipt&&coverage.qualifyNumericFutureReceipt({source_id:'HYPERLIQUID_NATIVE',receipt,contract,now:observed})?'REAL_NUMERIC_LEVELS':sample.status==='QUOTA_DEFERRED'?'QUOTA_DEFERRED':'NO_REAL_NUMERIC_LEVELS';
 if(sample.reused_accounts>0)nativeReusedChecks++;
 checks.push({contract,source_id:'HYPERLIQUID_NATIVE',status,receipt:status==='REAL_NUMERIC_LEVELS'?receipt:null,source_proof_sha256:status==='REAL_NUMERIC_LEVELS'?null:proof({source_id:'HYPERLIQUID_NATIVE',contract,status,catalog_sha256:catalog.receipt?.sha256??null,transport:sample.transport??[],reason:sample.reason}),now:observed});
 sourceReceipts.push({source_id:'HYPERLIQUID_NATIVE',contract,status,network_calls:sample.network_calls,reused_accounts:sample.reused_accounts,source_ts:receipt?.source_ts??null,original_transport_sha256:sample.original_transport_sha256??[],zone_count:receipt?.zones?.length??0});
}
// Later native responses can include markets whose earlier discovery failed.
// Replace that one capability check using the same original-clock cache only.
for(const check of checks.filter(x=>x.source_id==='HYPERLIQUID_NATIVE'&&['NO_REAL_NUMERIC_LEVELS','QUOTA_DEFERRED'].includes(x.status))){
 const symbol=check.contract.replace(/-USDT$/,''),sample=await nativeSession.collect({contract:check.contract,symbol,allow_discovery:false}),observed=clock();
 if(sample.receipt&&coverage.qualifyNumericFutureReceipt({source_id:'HYPERLIQUID_NATIVE',receipt:sample.receipt,contract:check.contract,now:observed})){
  Object.assign(check,{status:'REAL_NUMERIC_LEVELS',receipt:sample.receipt,source_proof_sha256:null,now:observed});nativeReusedChecks++;
  sourceReceipts.push({source_id:'HYPERLIQUID_NATIVE',contract:check.contract,status:'REAL_NUMERIC_LEVELS',network_calls:0,reused_accounts:sample.reused_accounts,source_ts:sample.receipt.source_ts,original_transport_sha256:sample.original_transport_sha256,zone_count:sample.receipt.zones.length,earlier_check_replaced_from_same_run_cache:true});
 }
}
if(checks.length)database=coverage.applyFuturesCoverageChecks(database,checks.sort((a,b)=>a.now-b.now));
const priorPending=await coverage.loadFuturesCoverageRefreshDatabase({db,now:clock()}),priorPendingSha=priorPending?sha(priorPending.assets):null,admit=extra=>{const u=db.usageSnapshot();return{allowed:u.unknown_ops===0&&u.rows_read+extra.rows_read<=54000&&u.rows_written+extra.rows_written<=840};};
const staged=await coverage.saveFuturesCoverageRefreshDatabase({db,database,now:clock(),expected_previous_assets_sha256:priorPendingSha,db_admit:admit});assert.equal(staged.saved,true);
let summary=coverage.summarizeFuturesCoverage(database,{now:clock()}),committed={saved:false,status:'REFRESH_IN_PROGRESS'};
if(summary.complete){const activeAssetsSha=sha(active.assets);committed=await coverage.saveFuturesCoverageDatabase({db,database,now:clock(),expected_previous_assets_sha256:activeAssetsSha,db_admit:admit});assert.equal(committed.saved,true);const live=await coverage.loadFuturesCoverageDatabase({db,now:clock()});assert.deepEqual(live.assets,database.assets);summary=coverage.summarizeFuturesCoverage(live,{now:clock()});}
const readback=await coverage.loadFuturesCoverageRefreshDatabase({db,now:clock()});assert.equal(coverage.validateFuturesCoverageDatabase(readback),true);assert.deepEqual(readback.assets,database.assets);
const usage=db.usageSnapshot();assert.equal(usage.unknown_ops,0);assert.ok(http<=maxHttp);assert.equal(summary.assets,102);assert.equal(summary.cells,816);
const report={schema:'report2-liquidation-coverage-weekly-v1',status:summary.complete?'WEEKLY_REFRESH_COMMITTED':'WEEKLY_REFRESH_IN_PROGRESS',github_head:process.env.GITHUB_SHA,observed_ts:clock(),run_id:runId,universe_sha256:universeSha,contracts:119,assets:102,cells:816,checks_written:checks.length,source_http:http,source_http_cap:maxHttp,byk_http:bykCalls,native_http_protected_before_byk:nativeHttpReserve,hyperliquid_http:hyperCalls,liqflow_http:liqflowCalls,swole_discovery_http:swoleCalls,dydx_rpc_http:dydxCalls,additional_calculated_discovery:dydxDiscovery,native_same_run_reused_checks:nativeReusedChecks,nonqualifying_sources:Object.fromEntries(Object.entries(coverage.NON_QUALIFYING_FUTURE_SOURCE_POLICIES)),summary,staging_persistence:staged,active_commit:committed,database_usage:usage,source_receipts:sourceReceipts,calculated_htx_fallback:false,synthetic_maps_admitted:false,model_or_projected_levels_admitted:false,top2_replacement_allowed:false,technical_telegram:false};
fs.writeFileSync('liquidation-coverage-weekly-result.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,source_receipts:undefined}));
