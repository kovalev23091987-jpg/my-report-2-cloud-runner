import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

const root=path.resolve(process.argv[2]||'runtime'),load=name=>import(pathToFileURL(path.join(root,name)));
const dependencies=JSON.parse(fs.readFileSync('audit-fixes/n07-official-context-acceptance-20261004/accepted-runtime-dependencies.json'));
for(const [file,hash] of Object.entries(dependencies.files))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'),hash,'CHANGED_DEPENDENCY_REQUIRES_NEW_TEST:'+file);
assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'src/worker.js'))).digest('hex'),dependencies.accepted_worker_sha256);

const {RemoteD1Database}=await load('report2-d1-adapter.mjs');
const {compileOfficialSourceRegistry}=await load('src/official-source-registry.mjs');
const {collectOfficialEventsEvidence}=await load('src/official-events-evidence.mjs');
const {consumeBlockResultContext}=await load('src/block-result-context.mjs');
const {consumeEvidenceV2}=await load('src/evidence-v2.mjs');
const {buildRuntimeCanonicalBundle}=await load('src/canonical-runtime-adapter.mjs');
const {createUnifiedHttpBudget}=await load('src/unified-budget.mjs');

const phase=JSON.parse(fs.readFileSync('checkpoints/CLOUD_PHASE_STATE_20261004.json'));
assert.equal(phase.current_phase,'CORE_BLOCKS');
assert.equal(phase.lease?.owner,process.env.REPORT2_CONTINUATION_OWNER);
assert.ok(phase.lease.expires_ts>Date.now());
const universeBytes=fs.readFileSync('checkpoints/htx-all-modes-crypto-futures-universe-20261004.json.gz');
const universe=JSON.parse(zlib.gunzipSync(universeBytes));
assert.equal(universe.status,'CLOSED');assert.equal(universe.assets.length,102);assert.equal(universe.contracts.length,119);
const compiled=compileOfficialSourceRegistry(JSON.parse(fs.readFileSync(path.join(root,'official-event-sources.json'))));
const entry=compiled.registry.LINK;
assert.equal(entry?.chain,'ethereum');assert.equal(entry?.contract_or_mint,'0x514910771af9ca656af840dff83e8264ecf986ca');
assert.deepEqual(entry?.official_feeds,['https://chain.link/newsroom']);
assert.ok(universe.assets.some(row=>row.symbol==='LINK'&&row.asset_analysis_contract==='LINK-USDT'));

const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),budget=createUnifiedHttpBudget(),run_id=`N07_OFFICIAL_ACTUAL:${process.env.GITHUB_RUN_ID}`,raw=[],results=[];
function save(error=null){
 fs.writeFileSync('audit-output/n07-official-source-body.json',JSON.stringify(raw)+'\n');
 fs.writeFileSync('audit-output/n07-official-live-verification.json',JSON.stringify({schema:'report2-actual-official-event-context-acceptance-v1',github_head:process.env.GITHUB_SHA,run_id,error,dependency_checks:'EXACT_PR111_ACCEPTED_RUNTIME_REUSED_TARGETED_NEW_REQUIREMENT_TEST_ONLY',dependency_proof:dependencies,common_universe_sha256:crypto.createHash('sha256').update(universeBytes).digest('hex'),common_future_assets:universe.assets.length,common_future_contracts:universe.contracts.length,all_assets_retained:universe.assets.map(row=>({symbol:row.symbol,contract:row.asset_analysis_contract})),results,source_http:raw.length,source_limits:{provider_published_numeric_limit:null,unknown_limit_is_not_unlimited:true,internal_refresh_period_ms:86400000,per_acceptance_http_cap:1,retries:0,response_max_bytes:524288,timeout_ms:8000,daily_source_cap:288,shared_job_http_cap_unchanged:164},database_usage:db.usageSnapshot(),production_canonical_writes:0,deep_checks_started:0,telegram_calls:0,full_main_acceptance:false,all_15_live_accepted:false,telegram_delivery_proven:false},null,2)+'\n');
}
process.on('uncaughtExceptionMonitor',error=>save(String(error)));
const fetch_impl=async(url,options)=>{
 assert.equal(String(url),'https://chain.link/newsroom');assert.equal(raw.length,0);
 const response=await fetch(url,options),body=await response.clone().text();
 raw.push({url:String(url),http_status:response.status,observed_ts:Date.now(),body_sha256:crypto.createHash('sha256').update(body).digest('hex'),body});save();return response;
};
const now=Date.now(),result=await collectOfficialEventsEvidence({db,fetch_impl,request_admit:request=>budget.reserve(request),contract:'LINK-USDT',run_id,asset_identity:{chain:entry.chain,contract_or_mint:entry.contract_or_mint},asset_metadata:entry,now,strict_fresh_manual:true});
const context=consumeBlockResultContext({evidence:result.evidence,contract:'LINK-USDT',now:Date.now()});
assert.equal(result.status,'CLOSED');assert.equal(result.network_calls,1);assert.equal(raw.length,1);assert.ok(result.evidence.length>=1);assert.ok(context.facts.length>=1);
assert.ok(result.evidence.every(row=>row.block_id==='N07'&&row.metric_family==='OFFICIAL_ANNOUNCEMENT'&&row.directional_strength===null&&row.risk_strength===null));
assert.equal(consumeEvidenceV2(result.evidence,{base_interest:70,decision_ts:Date.now()}).adjustment,0);
const observed_ts=Date.now(),input={contract:'LINK-USDT',run_id,snapshot_id:`${run_id}:LINK-USDT:${observed_ts}`,observed_ts},before=buildRuntimeCanonicalBundle(input),after=buildRuntimeCanonicalBundle({...input,internal_market_context:{internal_only:true,evidence_v2:{evidence:result.evidence,sources:{OFFICIAL_EVENTS:result}}}});
assert.equal(after.manual.ok,true);assert.ok(after.manual.text.includes('Официальное объявление проекта'));assert.deepEqual(after.canonical.scores,before.canonical.scores);assert.equal(after.canonical.direction,before.canonical.direction);assert.equal(after.canonical.state,before.canonical.state);assert.deepEqual(after.canonical.targets,before.canonical.targets);assert.equal(after.canonical.metadata.automatic_execution,false);assert.ok(after.block_rendered_results.used_context_block_ids.includes('N07'));
results.push({symbol:'LINK',contract:'LINK-USDT',identity:{chain:entry.chain,contract_or_mint:entry.contract_or_mint},result,context,report:{scope:'ACTUAL_FRESH_OFFICIAL_CONTEXT_IN_CANONICAL_BUILDER_AND_APPROVED_MANUAL_RENDERER_NO_SIGNAL',canonical:after.canonical,manual:after.manual,rendered_use:after.block_rendered_results}});save();
const usage=db.usageSnapshot();assert.equal(usage.unknown_ops,0);assert.ok(usage.rows_read<=1000&&usage.rows_written<=50);save();
console.log(JSON.stringify({status:'CLOSED_ACTUAL_OFFICIAL_N07_REPORT_CONTEXT',useful_assets:['LINK'],checked_common_assets:universe.assets.length,source_http:raw.length,database_usage:usage,production_canonical_writes:0,deep_checks_started:0,telegram_calls:0,full_main_acceptance:false}));
