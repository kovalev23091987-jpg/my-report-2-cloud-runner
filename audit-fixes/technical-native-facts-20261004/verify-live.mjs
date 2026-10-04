import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const root=path.resolve(process.argv[2]||'runtime'),load=n=>import(pathToFileURL(path.join(root,n)));
const {RemoteD1Database}=await load('report2-d1-adapter.mjs');
const {HTX_CATALOG_URLS,HTX_LINEAR_MARGIN_CATALOG_URLS,mergeHtxLinearCatalogModes,buildHtxCryptoUniverse}=await load('src/htx-crypto-universe.mjs');
const {collectChainSupplyEvidence}=await load('src/chain-supply-evidence.mjs');
const {parseHtxMarketJson}=await load('src/htx-trade-json.mjs');
const {readHtxTechnicalStructure}=await load('src/htx-technical-structure.mjs');
const {consumeBlockResultContext}=await load('src/block-result-context.mjs');
const {reserveEvidenceSourceAttempts}=await load('src/evidence-source-store.mjs');
const {createUnifiedHttpBudget}=await load('src/unified-budget.mjs');
const marketUrl='https://api.hbdm.com/linear-swap-ex/market/detail/batch_merged';
const allowed=new Set([...Object.values(HTX_CATALOG_URLS),...Object.values(HTX_LINEAR_MARGIN_CATALOG_URLS),marketUrl,'https://rpc.mainnet.near.org','https://api.mainnet-beta.solana.com']);
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),budget=createUnifiedHttpBudget(),raw=[],run_id=`TECHNICAL_NATIVE:${process.env.GITHUB_RUN_ID}`;
const fetch_impl=async(url,options)=>{
 assert.ok(allowed.has(url),`UNPLANNED_SOURCE:${url}`);assert.ok(raw.length<13,'SOURCE_TRANSPORT_CAP');
 // Record before awaiting so failed transports count toward the same cap.
 const row={url,request_body:options?.body||null,started_ts:Date.now()};raw.push(row);
 try{const r=await fetch(url,options),body=await r.clone().text();Object.assign(row,{http_status:r.status,received_ts:Date.now(),body_sha256:crypto.createHash('sha256').update(body).digest('hex'),body});return r;}
 catch(e){Object.assign(row,{received_ts:Date.now(),error:String(e?.name||e)});throw e;}
};
process.on('uncaughtExceptionMonitor',error=>{fs.writeFileSync('audit-output/technical-native-failure.json',JSON.stringify({github_head:process.env.GITHUB_SHA,run_id,error:String(error),source_http:raw.length,database_usage:db.usageSnapshot(),deep_checks_started:0,canonical_writes:0,telegram_calls:0},null,2)+'\n');fs.writeFileSync('audit-output/technical-native-source-bodies.json',JSON.stringify(raw,null,2)+'\n');});
const request_admit=r=>budget.reserve(r);
async function native(contract,chain,suffix){
 const result=await collectChainSupplyEvidence({db,fetch_impl,request_admit,contract,run_id:run_id+suffix,asset_identity:{chain,asset_kind:'NATIVE',native_asset_id:`${chain}:mainnet`,contract_or_mint:null},identity_method:'OFFICIAL_MAINNET_NATIVE_ASSET',now:Date.now(),strict_fresh_manual:true});
 const context=consumeBlockResultContext({contract,evidence:result.evidence,now:Date.now()});assert.ok(context.facts.every(r=>r.score_contribution===0&&r.hard_gate===false&&r.directional_vote===false));return{contract,result,context};
}
const nearFirst=await native('NEAR-USDT','near',':NEAR_FIRST');
async function htx(url,key){
 const id=run_id+':'+key;assert.equal(request_admit({logical_request_id:id,lane:'background',attempts:1}).allowed,true);
 assert.equal((await reserveEvidenceSourceAttempts(db,{source:'HTX_PUBLIC_RISK',reservation_id:id,attempts:1,daily_cap:144,now:Date.now()})).allowed,true);
 const r=await fetch_impl(url,{redirect:'error',signal:AbortSignal.timeout(10000)});assert.ok(r.ok);return parseHtxMarketJson(await r.text(),url);
}
const catalogs={};for(const [family,url] of Object.entries(HTX_CATALOG_URLS))catalogs[family]=await htx(url,'CATALOG:'+family);
const modes={};for(const [mode,url] of Object.entries(HTX_LINEAR_MARGIN_CATALOG_URLS))modes[mode]=await htx(url,'MARGIN:'+mode);
const marginEnumeration=mergeHtxLinearCatalogModes({base:catalogs.linear,modes,observed_ts:Date.now()});assert.equal(marginEnumeration.status,'CLOSED',JSON.stringify(marginEnumeration.failures));catalogs.linear=marginEnumeration.payload;
const worker=fs.readFileSync(path.join(root,'src/worker.js'),'utf8'),classify=vm.runInNewContext(worker.slice(worker.indexOf('function classifyHtxInstrumentScope('),worker.indexOf('function symbolFingerprint('))+';classifyHtxInstrumentScope',{});
const universe=buildHtxCryptoUniverse({catalogs,classify_linear:classify,observed_ts:Date.now()});assert.equal(universe.status,'CLOSED');
for(const symbol of ['NEAR','SOL','PAXG','XAUT'])assert.ok(universe.assets.some(r=>r.symbol===symbol));
await htx(marketUrl,'SHARED_ROLLING_MARKET');
const matrix=universe.contracts.map(row=>{
 const evidence=row.production_market_adapter_supported?readHtxTechnicalStructure({contract:row.contract_code,now:Date.now()}):[];
 const context=consumeBlockResultContext({contract:row.contract_code,evidence,now:Date.now()});
 return{...row,n10_status:context.facts.length?'REAL_PRIMARY_PRICE_CONTEXT':row.production_market_adapter_supported?'FRESH_EXACT_PRICE_CONTEXT_UNAVAILABLE':'EXACT_SETTLEMENT_ADAPTER_REQUIRED',actual_facts:context.facts,all_15_live_accepted:false};
});
const sol=await native('SOL-USDT','solana',':SOL'),nearSecond=await native('NEAR-USDT','near',':NEAR_SECOND'),usage=db.usageSnapshot();
assert.equal(usage.unknown_ops,0);assert.ok(usage.rows_read<=15000&&usage.rows_written<=80);
const proof={schema:'technical-native-live-v1',github_head:process.env.GITHUB_SHA,run_id,observed_ts:Date.now(),counts:universe.counts,margin_modes_checked:['default','all','cross','isolated'],margin_mode_counts:marginEnumeration.counts,new_contracts_vs_default:marginEnumeration.new_contracts_vs_default,common_future_asset_symbols:universe.assets.map(r=>r.symbol),spot_assets_included:false,liquidation_phase_started:false,n10_actual_context_contracts:matrix.filter(r=>r.actual_facts.length).length,native_results:[nearFirst,sol,nearSecond],source_http:raw.length,source_receipts:raw.map(({body,...r})=>r),database_usage:usage,production_write_scope:'EXISTING_PROVIDER_QUOTA_AND_CHAIN_SUPPLY_CACHE_ONLY',deep_checks_started:0,canonical_writes:0,telegram_calls:0,all_15_live_accepted:false};
fs.writeFileSync('audit-output/technical-native-live-verification.json',JSON.stringify(proof,null,2)+'\n');
fs.writeFileSync('audit-output/htx-all-modes-crypto-futures-universe.json',JSON.stringify({...universe,margin_mode_enumeration:marginEnumeration,matrix},null,2)+'\n');
fs.writeFileSync('audit-output/technical-native-source-bodies.json',JSON.stringify(raw,null,2)+'\n');
console.log(JSON.stringify({counts:proof.counts,new_contracts_vs_default:proof.new_contracts_vs_default,n10:proof.n10_actual_context_contracts,native_statuses:proof.native_results.map(r=>({contract:r.contract,status:r.result.status,metrics:r.result.evidence?.map(e=>e.metric_family),facts:r.context.facts.length})),source_http:raw.length,database_usage:usage}));
