import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const root=path.resolve(process.argv[2]||'runtime'),load=n=>import(pathToFileURL(path.join(root,n)));
const [{RemoteD1Database},coverage,tracked,io,providers,sampler,allowances,admission,bykQuota]=await Promise.all([
 load('report2-d1-adapter.mjs'),load('src/liquidation-futures-coverage.mjs'),load('src/byk-tracked-future-map.mjs'),load('src/liquidation-extension/io.mjs'),load('src/liquidation-extension/providers.mjs'),load('src/liquidation-extension/select-native-account-sample.mjs'),load('src/liquidation-extension/install-source-allowances.mjs'),load('src/liquidation-extension/d1-source-admission.mjs'),load('byk-quota-budget.mjs')]);
const sha=value=>crypto.createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const setMaintenanceOutput=value=>{if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,`maintenance_active=${value?'true':'false'}\n`);};
const universeBytes=fs.readFileSync('checkpoints/htx-all-modes-crypto-futures-universe-20261004.json.gz'),universe=JSON.parse(zlib.gunzipSync(universeBytes)),universeSha=sha(universeBytes);
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),started=Date.now(),requestedCap=Number(process.env.REPORT2_COVERAGE_MAINTENANCE_HTTP_CAP||120),maxHttp=Number.isSafeInteger(requestedCap)?Math.max(1,Math.min(120,requestedCap)):120,runId=`LIQ_WEEKLY:${process.env.GITHUB_RUN_ID}:${started}`;
const active=await coverage.loadFuturesCoverageDatabase({db,now:started});assert.equal(coverage.validateFuturesCoverageDatabase(active),true);assert.equal(active.universe_sha256,universeSha);assert.equal(active.crypto_future_assets,102);assert.equal(active.crypto_future_contracts,119);
if(started<active.weekly_refresh_due_ts){const result={schema:'report2-liquidation-coverage-weekly-v1',status:'NOT_DUE',source_http:0,weekly_refresh_due_ts:active.weekly_refresh_due_ts,assets:102,cells:816,technical_telegram:false};setMaintenanceOutput(false);fs.writeFileSync('liquidation-coverage-weekly-result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));process.exit(0);}
setMaintenanceOutput(true);
let database=await coverage.loadFuturesCoverageRefreshDatabase({db,now:started});
if(!coverage.validateFuturesCoverageDatabase(database)||database.universe_sha256!==universeSha||database.refresh_from_updated_ts!==active.updated_ts){const refresh=coverage.resetFuturesCoverageForWeeklyRefresh(active,{now:started});assert.equal(refresh.reset,true);database=refresh.database;}

let http=0,lastNow=Math.max(database.updated_ts,started),bykCalls=0,hyperCalls=0;const checks=[],sourceReceipts=[];
const clock=()=>Math.max(Date.now(),++lastNow),proof=value=>sha({universe_sha256:universeSha,...value});
const pending=(asset,source)=>asset.source_checks[source].status==='UNVERIFIED'||asset.source_checks[source].status==='QUOTA_DEFERRED';
for(const asset of database.assets)for(const [source_id,policy] of Object.entries(coverage.NON_QUALIFYING_FUTURE_SOURCE_POLICIES))if(pending(asset,source_id))checks.push({contract:asset.analysis_contract,source_id,status:'NO_REAL_NUMERIC_LEVELS',source_proof_sha256:proof({source_id,policy,contract:asset.analysis_contract,policy_version:coverage.LIQUIDATION_COVERAGE_VERSION}),now:clock()});
const proxyUrl=String(process.env.REPORT2_SOURCE_PROXY_URL||''),proxyToken=String(process.env.REPORT2_SOURCE_PROXY_TOKEN||'');
const protectedFetch=async target=>{if(!proxyUrl||!proxyToken)throw Error('SOURCE_PROXY_REQUIRED');http++;bykCalls++;return fetch(proxyUrl,{method:'POST',headers:{'content-type':'application/json',accept:'application/json',authorization:`Bearer ${proxyToken}`,'user-agent':'My-Report-2/Liquidation-Coverage-Audit'},body:JSON.stringify({url:String(target)})});};
await bykQuota.installBykQuotaLedger(db);const reserveByk=bykQuota.makeBykReserve(db,{source:'schedule'});
const bykCap=Math.min(102,Math.max(0,maxHttp-1));
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
const setup=await allowances.installSourceAllowances({db,now:clock(),liqflow_key:process.env.LIQFLOW_API_KEY||'',oxarchive_key:process.env.OXARCHIVE_API_KEY||''});
const sourceAdmit=admission.createD1SourceAdmission({db,scope_bindings:setup.bindings,within_run_budget:()=>{const usage=db.usageSnapshot();return{allowed:usage.unknown_ops===0&&usage.rows_read<50000&&usage.rows_written<800};}});
let catalog=null;if(database.assets.some(a=>pending(a,'HYPERLIQUID_NATIVE'))&&http<maxHttp){http++;hyperCalls++;catalog=await io.readJson('https://api.hyperliquid.xyz/info',{method:'POST',body:{type:'metaAndAssetCtxs'},timeout_ms:12000,max_bytes:8000000});}
const hlRows=Array.isArray(catalog?.payload?.[0]?.universe)?catalog.payload[0].universe:[],contexts=Array.isArray(catalog?.payload?.[1])?catalog.payload[1]:[];
for(const asset of database.assets){
 if(!pending(asset,'HYPERLIQUID_NATIVE'))continue;const contract=asset.analysis_contract,symbol=asset.symbol,index=hlRows.findIndex(r=>r?.name===symbol&&r?.isDelisted!==true),checked=clock();
 if(!catalog?.ok){checks.push({contract,source_id:'HYPERLIQUID_NATIVE',status:'QUOTA_DEFERRED',source_proof_sha256:proof({source_id:'HYPERLIQUID_NATIVE',contract,catalog_status:catalog?.reason??'NOT_RUN'}),now:checked});continue;}
 if(index<0){checks.push({contract,source_id:'HYPERLIQUID_NATIVE',status:'EXACT_SOURCE_MARKET_UNSUPPORTED',source_proof_sha256:proof({source_id:'HYPERLIQUID_NATIVE',contract,catalog_sha256:catalog.receipt.sha256}),now:checked});continue;}
 if(http+2>maxHttp)continue;
 const grant=await sourceAdmit({reservation_id:`LIQ_COVERAGE_NATIVE:${runId}:${contract}`,contract,run_id:runId,requests:{LIQFLOW:1,HYPERLIQUID:1},max_requests:2,deadline_ts:Date.now()+45000});
 if(grant.allowed!==true){checks.push({contract,source_id:'HYPERLIQUID_NATIVE',status:'QUOTA_DEFERRED',source_proof_sha256:proof({source_id:'HYPERLIQUID_NATIVE',contract,reason:grant.reason}),now:clock()});continue;}
 http++;hyperCalls++;const list=await io.readJson(`https://node.liqflow.app/api/coin/${encodeURIComponent(symbol)}/positions`,{headers:String(process.env.LIQFLOW_API_KEY||'')?{'X-API-Key':String(process.env.LIQFLOW_API_KEY)}:{},timeout_ms:12000,max_bytes:2000000});
 const mark=Number(contexts[index]?.markPx),selected=list.ok&&list.payload?.coin===symbol&&Array.isArray(list.payload.positions)?sampler.selectNativeAccountSample(list.payload.positions,{mark_price:Number.isFinite(mark)?mark:null,max_accounts:1}).selected:[];
 if(!selected.length){const status=list.ok?'NO_REAL_NUMERIC_LEVELS':'QUOTA_DEFERRED';checks.push({contract,source_id:'HYPERLIQUID_NATIVE',status,source_proof_sha256:proof({source_id:'HYPERLIQUID_NATIVE',contract,status,catalog_sha256:catalog.receipt.sha256,discovery_sha256:list.receipt?.sha256??null}),now:clock()});sourceReceipts.push({source_id:'HYPERLIQUID_NATIVE',contract,status,http_status:list.receipt?.http_status??null,zone_count:0});continue;}
 http++;hyperCalls++;const stateRead=await io.fetchNativeHLState(selected[0].address,{timeout_ms:12000,max_bytes:2000000}),observed=clock();let receipt=null,status='SOURCE_ERROR';
 if(stateRead.ok)receipt=providers.normalizeNativeHL({accounts:[{address:selected[0].address,state:stateRead.payload}],selection_bias:'ONE_ACCOUNT_WEEKLY_CAPABILITY_SAMPLE'},{symbol,route_symbol:symbol,run_id:runId,snapshot_id:`COVERAGE:${contract}:${observed}`,as_of_ms:observed,received_at_ms:stateRead.receipt.received_ts,max_age_ms:300000});
 if(receipt&&coverage.qualifyNumericFutureReceipt({source_id:'HYPERLIQUID_NATIVE',receipt,contract,now:observed}))status='REAL_NUMERIC_LEVELS';else if(stateRead.ok)status='NO_REAL_NUMERIC_LEVELS';else status='QUOTA_DEFERRED';
 checks.push({contract,source_id:'HYPERLIQUID_NATIVE',status,receipt:status==='REAL_NUMERIC_LEVELS'?receipt:null,source_proof_sha256:status==='REAL_NUMERIC_LEVELS'?null:proof({source_id:'HYPERLIQUID_NATIVE',contract,status,catalog_sha256:catalog.receipt.sha256,discovery_sha256:list.receipt?.sha256??null,state_sha256:stateRead.receipt?.sha256??null}),now:observed});
 sourceReceipts.push({source_id:'HYPERLIQUID_NATIVE',contract,status,http_status:stateRead.receipt?.http_status??null,transport_sha256:stateRead.receipt?.sha256??null,zone_count:receipt?.zones?.length??0});
}
if(checks.length)database=coverage.applyFuturesCoverageChecks(database,checks.sort((a,b)=>a.now-b.now));
const priorPending=await coverage.loadFuturesCoverageRefreshDatabase({db,now:clock()}),priorPendingSha=priorPending?sha(priorPending.assets):null,admit=extra=>{const u=db.usageSnapshot();return{allowed:u.unknown_ops===0&&u.rows_read+extra.rows_read<=54000&&u.rows_written+extra.rows_written<=840};};
const staged=await coverage.saveFuturesCoverageRefreshDatabase({db,database,now:clock(),expected_previous_assets_sha256:priorPendingSha,db_admit:admit});assert.equal(staged.saved,true);
let summary=coverage.summarizeFuturesCoverage(database,{now:clock()}),committed={saved:false,status:'REFRESH_IN_PROGRESS'};
if(summary.complete){const activeAssetsSha=sha(active.assets);committed=await coverage.saveFuturesCoverageDatabase({db,database,now:clock(),expected_previous_assets_sha256:activeAssetsSha,db_admit:admit});assert.equal(committed.saved,true);const live=await coverage.loadFuturesCoverageDatabase({db,now:clock()});assert.deepEqual(live.assets,database.assets);summary=coverage.summarizeFuturesCoverage(live,{now:clock()});}
const readback=await coverage.loadFuturesCoverageRefreshDatabase({db,now:clock()});assert.equal(coverage.validateFuturesCoverageDatabase(readback),true);assert.deepEqual(readback.assets,database.assets);
const usage=db.usageSnapshot();assert.equal(usage.unknown_ops,0);assert.ok(http<=maxHttp);assert.equal(summary.assets,102);assert.equal(summary.cells,816);
const report={schema:'report2-liquidation-coverage-weekly-v1',status:summary.complete?'WEEKLY_REFRESH_COMMITTED':'WEEKLY_REFRESH_IN_PROGRESS',github_head:process.env.GITHUB_SHA,observed_ts:clock(),run_id:runId,universe_sha256:universeSha,contracts:119,assets:102,cells:816,checks_written:checks.length,source_http:http,source_http_cap:maxHttp,byk_http:bykCalls,hyperliquid_http:hyperCalls,nonqualifying_sources:Object.fromEntries(Object.entries(coverage.NON_QUALIFYING_FUTURE_SOURCE_POLICIES)),summary,staging_persistence:staged,active_commit:committed,database_usage:usage,source_receipts:sourceReceipts,calculated_htx_fallback:false,synthetic_maps_admitted:false,model_or_projected_levels_admitted:false,top2_replacement_allowed:false,technical_telegram:false};
fs.writeFileSync('liquidation-coverage-weekly-result.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,source_receipts:undefined}));
