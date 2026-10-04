import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const root=path.resolve(process.argv[2]||'runtime'),load=rel=>import(pathToFileURL(path.join(root,rel)));
const {planCandidateEvidenceRoutes,BLOCK_SOURCE_REQUIREMENTS}=await load('src/candidate-evidence-v2-runtime.mjs');
const {reserveEvidenceSourceAttempts}=await load('src/evidence-source-store.mjs');
const {collectHtxAssetIdentity}=await load('src/htx-asset-identity.mjs');
const {readMarketHistoryForContract,readEarlyMarketSnapshots}=await load('src/market-history-reader.mjs');
const {RemoteD1Database}=await load('report2-d1-adapter.mjs');
const {collectCoingeckoSectorEvidence}=await load('src/coingecko-sector-evidence.mjs');
const {collectOfficialEventsEvidence}=await load('src/official-events-evidence.mjs');
const {compileOfficialSourceRegistry,mergeOfficialAndConfiguredRegistries}=await load('src/official-source-registry.mjs');
const {parseSupplementalIdentityRegistry}=await load('src/supplemental-candidate-context.mjs');
const {consumeSectorContext}=await load('src/sector-context.mjs');
const {consumeBlockResultContext}=await load('src/block-result-context.mjs');
const {createUnifiedHttpBudget}=await load('src/unified-budget.mjs');
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),budget=createUnifiedHttpBudget(),calls=[],raw=[];
const fetch_impl=async(url,options)=>{
 assert.ok(calls.length<6);assert.ok(url.startsWith('https://api.coingecko.com/api/v3/')||url==='https://api.huobi.pro/v2/reference/currencies'||url==='https://api.hbdm.com/linear-swap-api/v1/swap_contract_info'||url==='https://medium.com/feed/@bitwayofficial');
 calls.push({url,method:options?.method||'GET'});const response=await fetch(url,options);raw.push({url,status:response.status,headers:Object.fromEntries(response.headers),body:await response.clone().text(),received_ts:Date.now()});return response;
};
const configured=mergeOfficialAndConfiguredRegistries({official:compileOfficialSourceRegistry(JSON.parse(fs.readFileSync(path.join(root,'official-event-sources.json')))),configured:process.env.REPORT2_SUPPLEMENTAL_IDENTITY_REGISTRY_JSON||{}});
const registry=parseSupplementalIdentityRegistry(mergeOfficialAndConfiguredRegistries({official:compileOfficialSourceRegistry(JSON.parse(fs.readFileSync(path.join(root,'main-official-event-sources.json')))),configured:configured.registry}).registry).entries;
const near=registry.NEAR,run_id=`SHARED_SECTOR_REPAIR:${process.env.GITHUB_RUN_ID}`;
const result=await collectCoingeckoSectorEvidence({db,fetch_impl,request_admit:r=>budget.reserve(r),run_id,contract:'NEAR-USDT',asset_identity:near.identity,asset_metadata:{},now:Date.now(),strict_fresh_manual:process.env.REPORT2_REFERENCE_AUDIT_REPLAY!=='1'});
const context=consumeSectorContext({evidence:result.evidence,contract:'NEAR-USDT',asset_identity:near.identity,now:Date.now()});
const btw=registry.BTW;
const official=await collectOfficialEventsEvidence({db,fetch_impl,request_admit:r=>budget.reserve(r),run_id,contract:'BTW-USDT',asset_identity:btw.identity,asset_metadata:btw,now:Date.now(),strict_fresh_manual:false});
const official_context=consumeBlockResultContext({evidence:official.evidence,contract:'BTW-USDT',now:Date.now()});
const now=Date.now(),tables=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'report2_market_%' OR name IN ('report2_command_v2','canonical_publication_shadow','report2_public_collector_health_v1','report2_runtime_control_v1','report2_evidence_source_daily')) LIMIT 40").all();
const states={};
for(const name of ['report2_command_v2','canonical_publication_shadow','report2_public_collector_health_v1','report2_runtime_control_v1'])if(tables.results.some(r=>r.name===name)){
 const cols=await db.prepare(`PRAGMA table_info(${name})`).all();const names=cols.results.map(r=>r.name);states[name]={columns:names};
 const time=names.find(x=>['updated_at','created_ts','updated_ts','received_ts'].includes(x));
 if(time){const selected=names.filter(n=>!/(json|payload|text|token|secret)/i.test(n)).join(',');states[name].rows=(await db.prepare(`SELECT ${selected} FROM ${name} ORDER BY ${time} DESC LIMIT 6`).all()).results;}
}
if(tables.results.some(r=>r.name==='report2_market_snapshot_batch_v1')){
 states.recent_slots=(await db.prepare('SELECT bucket,generation,COUNT(*) AS shards,SUM(contract_count) AS contracts,MIN(received_ts) AS first_received,MAX(received_ts) AS last_received FROM report2_market_snapshot_batch_v1 WHERE actor=?1 AND bucket>=?2 GROUP BY bucket,generation ORDER BY bucket DESC LIMIT 80').bind('HUB_PUBLIC_COLLECTOR',now-7*3600000).all()).results;
}
const universe=await readEarlyMarketSnapshots({db,now_ts:now});
const latest=universe.snapshots.at(-1);assert.ok(latest?.rows?.size>0,'ACTUAL_HTX_UNIVERSE_REQUIRED');
const reference=await collectHtxAssetIdentity({db,fetch_impl,request_admit:r=>budget.reserve(r),run_id,contract:'BR-USDT',now:Date.now()});
const rawReference=await db.prepare('SELECT payload_json FROM report2_evidence_source_cache WHERE source=?1 AND asset_key=?2 LIMIT 1').bind('HTX_ASSET_REFERENCE','ALL_CURRENCIES_CHAIN_ADDRESSES_V1').first();
const bundle=JSON.parse(rawReference?.payload_json||'null'),matrix=[],excluded=[];
const catalogRequest=`UNIVERSE_SCOPE:${run_id}`,scopeGrant=budget.reserve({logical_request_id:catalogRequest,lane:'background',attempts:1});assert.equal(scopeGrant.allowed,true);
const scopeAdmission=await reserveEvidenceSourceAttempts(db,{source:'HTX_PUBLIC_RISK',reservation_id:catalogRequest,attempts:1,daily_cap:144,now:Date.now()});assert.equal(scopeAdmission.allowed,true);
const catalogResponse=await fetch_impl('https://api.hbdm.com/linear-swap-api/v1/swap_contract_info',{signal:AbortSignal.timeout(8000),redirect:'error'}),catalog=await catalogResponse.json();assert.ok(catalogResponse.ok&&catalog.status==='ok'&&Array.isArray(catalog.data));
const worker=fs.readFileSync(path.join(root,'src/worker.js'),'utf8'),classificationCode=worker.slice(worker.indexOf('function classifyHtxInstrumentScope('),worker.indexOf('function symbolFingerprint('));
const classify=vm.runInNewContext(classificationCode+';classifyHtxInstrumentScope',{}, {timeout:1000}),metadataByContract=new Map(catalog.data.map(row=>[row.contract_code,row]));

for(const contract of [...latest.rows.keys()].sort()){
 const info=metadataByContract.get(contract),scope=classify(info);if(!scope.eligible_for_crypto_discovery){excluded.push({contract,classification:scope.classification,reasons:scope.reasons,evidence:scope.evidence});continue;}
 const base=contract.replace(/-USDT$/,''),entry=bundle?.entries?.[base],configured=registry[base],identity=configured?.identity||(entry?.status==='CLOSED'?entry.identities[0]:null),metadata=configured||{};
 const plan=planCandidateEvidenceRoutes({contract,asset_identity:identity,asset_metadata:metadata}),routes=plan.routes.map(r=>r.name);
 matrix.push({contract,identity_status:identity?'EXACT':entry?.status||'HTX_CURRENCY_NOT_FOUND',identity,route_names:['HTX',...routes],block_assignments:BLOCK_SOURCE_REQUIREMENTS,availability:{N01:'STRUCTURED_TOKEN_SCHEDULE_REQUIRED',N02:plan.supplyEligible?'ROUTE_AVAILABLE':identity?.asset_kind==='NATIVE'?'NATIVE_SUPPLY_PROVIDER_ROUTE_REQUIRED':'EXACT_ASSET_IDENTITY_REQUIRED',N03:plan.chainEligible?'ROUTE_AVAILABLE':'EXACT_TRANSACTION_EVENT_ROUTE_REQUIRED',N04:plan.chainEligible?'ROUTE_AVAILABLE':'EXACT_TRANSACTION_EVENT_ROUTE_REQUIRED',N05:identity?.contract_or_mint?'EXACT_IDENTITY_AVAILABLE_PROVIDER_ADMISSION_REQUIRED':'EXACT_FLOW_ROUTE_REQUIRED',N06:plan.socialEligible?'ROUTE_AVAILABLE':'EXACT_ATTENTION_ROUTE_REQUIRED',N07:plan.officialEligible?'ROUTE_AVAILABLE':'OFFICIAL_FEED_REQUIRED',N08:'ROUTE_AVAILABLE',N09:'ROUTE_AVAILABLE',N10:'PRIMARY_TECHNICAL_OWNER',N11:'PRIMARY_EXECUTION_OWNER',N12:'ROUTE_AVAILABLE',N14:'PROVIDER_CATALOG_ROUTE_AVAILABLE',N15:routes.includes('SECTOR_COINGECKO')||routes.includes('SECTOR')?'ROUTE_AVAILABLE':'EXACT_SECTOR_BINDING_REQUIRED',N16:'PRIMARY_EXECUTION_OWNER'},executed:false,all_blocks_accepted:false});
}
states.universe_audit={scope:'CURRENT_HTX_CRYPTO_USDT_FUTURES_ONLY',source:latest.source,generation:latest.source_generation,source_ts:latest.ts,payload_validation_rejections:universe.rejections,collector_contracts:latest.rows.size,contracts:matrix.length,excluded_non_crypto:excluded.filter(r=>r.classification==='NON_CRYPTO_HTX_CLASSIFIED').length,excluded_unknown_scope:excluded.filter(r=>r.classification==='UNKNOWN_FAIL_CLOSED').length,scope_source:'HTX swap_contract_info labels/tradfi_labels',classifier_sha256:crypto.createHash('sha256').update(classificationCode).digest('hex'),exact_identities:matrix.filter(r=>r.identity).length,native_sector_routes:matrix.filter(r=>r.identity?.asset_kind==='NATIVE'&&r.availability.N15==='ROUTE_AVAILABLE').length,all_15_assigned:matrix.every(r=>Object.keys(r.block_assignments).length===15),no_per_contract_source_calls:true,br_reference:reference};
fs.writeFileSync('audit-output/htx-universe-block-route-matrix.json',JSON.stringify({audit:states.universe_audit,matrix,excluded},null,2)+'\n');
states.verified_history={};
for(const contract of ['NEAR-USDT','BR-USDT'])states.verified_history[contract]=await readMarketHistoryForContract({db,contract,now_ts:now,hours:6});
const usage=db.usageSnapshot();assert.equal(usage.unknown_ops,0);assert.ok(usage.rows_read<=25000&&usage.rows_written<=100);
fs.writeFileSync('audit-output/shared-sector-live-verification.json',JSON.stringify({schema:'report2-shared-sector-verification-v1',github_head:process.env.GITHUB_SHA,run_id,result,context,official,official_context,calls,source_http:calls.length,database_usage:usage,states,production_write_scope:'EXISTING_PROVIDER_QUOTA_AND_SOURCE_CACHE_ONLY',deep_checks_started:0,canonical_writes:0,telegram_calls:0,main_accepted:false,telegram_delivery_proven:false},null,2)+'\n');
fs.writeFileSync('audit-output/shared-sector-source-bodies.json',JSON.stringify(raw,null,2)+'\n');
console.log(JSON.stringify({status:result.status,source_http:calls.length,sector_facts:context.facts.length,official_status:official.status,official_facts:official_context.facts.length,database_usage:usage}));
