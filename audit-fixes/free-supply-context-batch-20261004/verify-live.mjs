import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const root=path.resolve(process.argv[2]||'runtime'),load=n=>import(pathToFileURL(path.join(root,n)));
const {RemoteD1Database}=await load('report2-d1-adapter.mjs');
const {collectCoinmetricsSupplyContext,COINMETRICS_FREE_LIMITS}=await load('src/coinmetrics-supply-context.mjs');
const {consumeBlockResultContext}=await load('src/block-result-context.mjs');
const {consumeEvidenceV2}=await load('src/evidence-v2.mjs');
const {collectHtxAssetIdentity}=await load('src/htx-asset-identity.mjs');
const {buildRuntimeCanonicalBundle}=await load('src/canonical-runtime-adapter.mjs');
const {createUnifiedHttpBudget}=await load('src/unified-budget.mjs');
const bytes=fs.readFileSync('checkpoints/htx-all-modes-crypto-futures-universe-20261004.json.gz'),universe=JSON.parse(zlib.gunzipSync(bytes)),state=JSON.parse(fs.readFileSync('checkpoints/CLOUD_PHASE_STATE_20261004.json','utf8'));
assert.equal(state.lease?.owner,process.env.REPORT2_CONTINUATION_OWNER);assert.ok(state.lease.expires_ts>Date.now());assert.equal(state.current_phase,'CORE_BLOCKS');assert.equal(universe.status,'CLOSED');
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),budget=createUnifiedHttpBudget(),raw=[],results=[],run_id=`FREE_SUPPLY_HISTORY:${process.env.GITHUB_RUN_ID}`;
const fetch_impl=async(url,options)=>{const u=new URL(String(url));assert.ok(u.hostname==='community-api.coinmetrics.io'&&['/v4/catalog-all-v2/asset-metrics','/v4/timeseries/asset-metrics'].includes(u.pathname)||u.href==='https://api.huobi.pro/v2/reference/currencies');assert.ok(raw.length<3);const response=await fetch(url,options),body=await response.clone().text();raw.push({url:String(url),http_status:response.status,observed_ts:Date.now(),body_sha256:crypto.createHash('sha256').update(body).digest('hex'),body});save();return response;};
function save(error=null){fs.writeFileSync('audit-output/coinmetrics-supply-source-bodies.json',JSON.stringify(raw)+'\n');fs.writeFileSync('audit-output/coinmetrics-supply-live-verification.json',JSON.stringify({schema:'new-free-native-supply-history-real-result-v1',github_head:process.env.GITHUB_SHA,run_id,error,common_future_universe_sha256:crypto.createHash('sha256').update(bytes).digest('hex'),common_crypto_future_assets:universe.assets.length,common_crypto_future_contracts:universe.contracts.length,results,source_http:raw.length,free_limits:COINMETRICS_FREE_LIMITS,database_usage:db.usageSnapshot(),canonical_builder_reports:results.filter(r=>r.report).length,production_canonical_writes:0,deep_checks_started:0,telegram_calls:0,full_main_acceptance:false,all_15_live_accepted:false,telegram_delivery_proven:false,production_write_scope:'NEW_SOURCE_ADMITTED_QUOTA_AND_COMPACT_REFERENCE_CACHE_ONLY'},null,2)+'\n');}
process.on('uncaughtExceptionMonitor',e=>save(String(e)));
const ordered=[...universe.assets].sort((a,b)=>(a.symbol==='BTC'?-1:0)-(b.symbol==='BTC'?-1:0)||a.symbol.localeCompare(b.symbol));
for(const [i,a] of ordered.entries()){
 const contract=a.asset_analysis_contract,reference=['BTC','ETH'].includes(a.symbol)?await collectHtxAssetIdentity({db,fetch_impl,request_admit:r=>budget.reserve(r),contract,run_id:run_id+':IDENTITY:'+a.symbol,now:Date.now()}):null;
 if(reference)assert.equal(reference.status,'CLOSED');
 const result=await collectCoinmetricsSupplyContext({db,fetch_impl,request_admit:r=>budget.reserve(r),contract,asset_identity:reference?.identity,run_id:run_id+':'+a.symbol,now:Date.now(),strict_fresh_manual:i===0});
 const observed_ts=Date.now(),context=consumeBlockResultContext({evidence:result.evidence,contract,now:observed_ts});let report=null;
 if(context.facts.length){
  assert.equal(result.status,'CLOSED');assert.equal(context.facts.length,1);assert.equal(consumeEvidenceV2(result.evidence,{base_interest:70,decision_ts:observed_ts}).adjustment,0);
  const input={contract,run_id,snapshot_id:run_id+':'+contract+':'+observed_ts,observed_ts},before=buildRuntimeCanonicalBundle(input),after=buildRuntimeCanonicalBundle({...input,internal_market_context:{internal_only:true,evidence_v2:{evidence:result.evidence,sources:{COINMETRICS_SUPPLY:result}}}});
  assert.equal(after.manual.ok,true,after.manual.status);assert.ok(after.manual.text.includes(context.facts[0].label));assert.deepEqual(after.canonical.scores,before.canonical.scores);assert.equal(after.canonical.direction,before.canonical.direction);assert.equal(after.canonical.state,before.canonical.state);assert.deepEqual(after.canonical.targets,before.canonical.targets);assert.equal(after.canonical.metadata.automatic_execution,false);assert.ok(after.block_rendered_results.used_context_block_ids.includes('N02'));
  report={scope:'ACTUAL_FRESH_QUERY_OF_PROVIDER_DAILY_HISTORY_IN_CANONICAL_BUILDER_AND_APPROVED_MANUAL_RENDERER_NO_SIGNAL',canonical:after.canonical,manual:after.manual,rendered_use:after.block_rendered_results};
 }else assert.equal(result.evidence.length,0);
 results.push({symbol:a.symbol,contract,reference,result,context,report});save();
}
const covered=results.filter(r=>r.report).map(r=>r.symbol);for(const coin of ['BTC','ETH'])assert.ok(covered.includes(coin),coin+':ACTUAL_USEFUL_REPORT_CONTEXT_REQUIRED');assert.equal(raw.filter(r=>r.url.startsWith('https://community-api.coinmetrics.io/')).length,2);assert.equal(results.length,102);assert.ok(results.filter(r=>r.result.network_calls>0).length===1);const usage=db.usageSnapshot();assert.equal(usage.unknown_ops,0);assert.ok(usage.rows_read<=5000&&usage.rows_written<=100);save();
console.log(JSON.stringify({status:'CLOSED_REAL_FREE_DAILY_SUPPLY_HISTORY_AND_REPORT_CONSUMPTION',useful_assets:covered,checked_common_assets:results.length,source_http:raw.length,database_usage:usage,production_canonical_writes:0,deep_checks_started:0,telegram_calls:0,full_main_acceptance:false}));
