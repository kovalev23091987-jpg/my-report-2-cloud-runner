import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const root=path.resolve(process.argv[2]||'runtime'),load=n=>import(pathToFileURL(path.join(root,n)));
const dependencies=JSON.parse(fs.readFileSync('audit-fixes/native-peers-acceptance-20261004/accepted-runtime-dependencies.json'));
for(const [file,hash] of Object.entries(dependencies.files))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'),hash,'CHANGED_DEPENDENCY_REQUIRES_NEW_TEST:'+file);
assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'src/worker.js'))).digest('hex'),dependencies.accepted_worker_sha256);
const {RemoteD1Database}=await load('report2-d1-adapter.mjs');
const {collectHtxAssetIdentity,HTX_ASSET_IDENTITY_VERSION}=await load('src/htx-asset-identity.mjs');
const {collectCoingeckoSectorEvidence,exactNativeSectorBinding}=await load('src/coingecko-sector-evidence.mjs');
const {consumeSectorContext}=await load('src/sector-context.mjs');
const {buildRuntimeCanonicalBundle}=await load('src/canonical-runtime-adapter.mjs');
const {createUnifiedHttpBudget}=await load('src/unified-budget.mjs');
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),budget=createUnifiedHttpBudget(),run_id=`N15_ACTUAL_PEERS:${process.env.GITHUB_RUN_ID}`,raw=[],results=[];
const bytes=fs.readFileSync('checkpoints/htx-all-modes-crypto-futures-universe-20261004.json.gz'),universe=JSON.parse(zlib.gunzipSync(bytes)),phase=JSON.parse(fs.readFileSync('checkpoints/CLOUD_PHASE_STATE_20261004.json'));
assert.equal(phase.lease?.owner,process.env.REPORT2_CONTINUATION_OWNER);assert.ok(phase.lease.expires_ts>Date.now());assert.equal(phase.current_phase,'CORE_BLOCKS');assert.equal(universe.status,'CLOSED');
let reference=null,sourceCalls=0;
function save(error=null){const useful=results.filter(x=>x.report);fs.writeFileSync('audit-output/native-peers-source-bodies.json',JSON.stringify(raw)+'\n');fs.writeFileSync('audit-output/native-peers-live-verification.json',JSON.stringify({schema:'report2-new-actual-functional-peers-acceptance-v1',github_head:process.env.GITHUB_SHA,run_id,error,status:useful.length?'CLOSED_ACTUAL_SCOPED_PEER_USE':'PARTIAL_NO_ACTUAL_USEFUL_PEER_CONTEXT',dependency_checks:'PR109_UNCHANGED_FILES_EXACT_PLUS_NATIVE_REPAIR_NEW_FULL_CLOUD_VALIDATION',dependency_proof:dependencies,common_future_universe_sha256:crypto.createHash('sha256').update(bytes).digest('hex'),common_future_assets:universe.assets.length,common_future_contracts:universe.contracts.length,reference,results,useful_assets:useful.map(x=>x.symbol),source_http:raw.length,coingecko_http:sourceCalls,database_usage:db.usageSnapshot(),production_canonical_writes:0,deep_checks_started:0,telegram_calls:0,full_main_acceptance:false,all_15_live_accepted:false,telegram_delivery_proven:false},null,2)+'\n');}
process.on('uncaughtExceptionMonitor',e=>save(String(e)));
const fetch_impl=async(url,options)=>{const u=new URL(url);assert.ok(u.href==='https://api.huobi.pro/v2/reference/currencies'||u.hostname==='api.coingecko.com'&&u.pathname.startsWith('/api/v3/'));assert.ok(raw.length<9);if(u.hostname==='api.coingecko.com'){assert.ok(sourceCalls<8);sourceCalls++;}const response=await fetch(url,options),body=await response.clone().text();raw.push({url:String(url),http_status:response.status,observed_ts:Date.now(),body_sha256:crypto.createHash('sha256').update(body).digest('hex'),body});save();return response;};
reference=await collectHtxAssetIdentity({db,fetch_impl,request_admit:r=>budget.reserve(r),contract:universe.assets[0].asset_analysis_contract,run_id,now:Date.now()});
const cacheRow=await db.prepare('SELECT payload_json,observed_ts,expires_ts FROM report2_evidence_source_cache WHERE source=?1 AND asset_key=?2 LIMIT 1').bind('HTX_ASSET_REFERENCE','ALL_CURRENCIES_CHAIN_ADDRESSES_V1').first();
const bundle=cacheRow?JSON.parse(cacheRow.payload_json):null;
const validReference=bundle?.version===HTX_ASSET_IDENTITY_VERSION&&cacheRow.observed_ts<=Date.now()&&cacheRow.expires_ts>Date.now()&&bundle.receipt?.http_status===200;
let firstEligible=true;
const repairedTargets=new Set(['APT','ATOM']);
for(const asset of [...universe.assets].sort((a,b)=>Number(repairedTargets.has(b.symbol))-Number(repairedTargets.has(a.symbol))||a.symbol.localeCompare(b.symbol))){
 const contract=asset.asset_analysis_contract,entry=validReference?bundle.entries?.[asset.symbol]:null,identity=entry?.status==='CLOSED'?entry.identities?.[0]:null;
 const eligible=Boolean(identity&&exactNativeSectorBinding(identity,contract)&&repairedTargets.has(asset.symbol));
 let result={status:!validReference?'HTX_REFERENCE_NOT_CLOSED':!identity?(entry?.status||'EXACT_IDENTITY_NOT_AVAILABLE'):'RETAINED_IN_UNIVERSE_NOT_PART_OF_CHANGED_NATIVE_REPAIR_ACCEPTANCE',evidence:[],network_calls:0},report=null,context={status:'NOT_CLOSED',facts:[]};
 if(eligible){
  const now=Date.now();result=await collectCoingeckoSectorEvidence({db,fetch_impl,request_admit:r=>sourceCalls>=8?{allowed:false,status:'AUDIT_REQUEST_BOUND_REACHED'}:budget.reserve(r),contract,asset_identity:identity,run_id:run_id+':'+asset.symbol,now,strict_fresh_manual:firstEligible});firstEligible=false;
  context=consumeSectorContext({evidence:result.evidence,contract,asset_identity:identity,now:Date.now()});
  if(context.facts.length){
   assert.equal(result.status,'CLOSED');const observed_ts=Date.now(),input={contract,run_id,snapshot_id:run_id+':'+contract+':'+observed_ts,observed_ts};
   const before=buildRuntimeCanonicalBundle(input),after=buildRuntimeCanonicalBundle({...input,internal_market_context:{internal_only:true,candidate_context:{asset_identity:identity},evidence_v2:{evidence:result.evidence,sources:{COINGECKO_SECTOR:result}}}});
   assert.equal(after.manual.ok,true);assert.ok(after.manual.text.includes(context.facts[0].label));assert.ok(after.canonical.metadata.supporting_context.blocks.sector_comparison.status==='CLOSED');assert.equal(after.canonical.metadata.automatic_execution,false);assert.equal(after.canonical.state,before.canonical.state);assert.deepEqual(after.canonical.targets,before.canonical.targets);
   report={scope:'ACTUAL_SCOPED_PEERS_IN_CANONICAL_BUILDER_AND_APPROVED_MANUAL_RENDERER_NO_SIGNAL',canonical:after.canonical,manual:after.manual,peer_context:context};
  }
 }
 results.push({symbol:asset.symbol,contract,identity,identity_status:entry?.status||null,scope:eligible?'EXACT_NATIVE_ROUTE':'RETAINED_IN_COMMON_UNIVERSE',result,context,report});save();
}
assert.equal(results.length,102);assert.ok(sourceCalls<=8&&raw.length<=9);const usage=db.usageSnapshot();assert.equal(usage.unknown_ops,0);assert.ok(usage.rows_read<=10000&&usage.rows_written<=150);save();
console.log(JSON.stringify({status:results.some(x=>x.report)?'CLOSED_ACTUAL_SCOPED_PEER_USE':'PARTIAL_NO_ACTUAL_USEFUL_PEER_CONTEXT',useful_assets:results.filter(x=>x.report).map(x=>x.symbol),common_assets:results.length,source_http:raw.length,coingecko_http:sourceCalls,database_usage:usage,production_canonical_writes:0,deep_checks_started:0,telegram_calls:0}));
