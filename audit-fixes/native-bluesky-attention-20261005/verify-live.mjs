import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

const root=path.resolve(process.argv[2]||'runtime');
const load=p=>import(pathToFileURL(path.join(root,p)));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const {RemoteD1Database}=await load('report2-d1-adapter.mjs');
const {collectBlueskyAttentionEvidence}=await load('src/bluesky-attention-evidence.mjs');
const {SOURCE_POLICIES}=await load('src/evidence-source-adapters.mjs');
const {consumeEvidenceV2}=await load('src/evidence-v2.mjs');
const {consumeBlockResultContext}=await load('src/block-result-context.mjs');
const {auditCandidateBlocks,planCandidateEvidenceRoutes}=await load('src/candidate-evidence-v2-runtime.mjs');
const {buildRuntimeCanonicalBundle}=await load('src/canonical-runtime-adapter.mjs');
const {createUnifiedHttpBudget}=await load('src/unified-budget.mjs');

const phase=JSON.parse(fs.readFileSync('checkpoints/CLOUD_PHASE_STATE_20261004.json'));
assert.equal(phase.current_phase,'CORE_BLOCKS');
assert.equal(phase.lease?.owner,process.env.REPORT2_CONTINUATION_OWNER);
assert.ok(phase.lease.expires_ts>Date.now());
const universeBytes=fs.readFileSync('checkpoints/htx-all-modes-crypto-futures-universe-20261004.json.gz');
const universe=JSON.parse(zlib.gunzipSync(universeBytes));
assert.equal(universe.assets.length,102);
assert.equal(universe.contracts.length,119);
assert.ok(universe.assets.some(x=>x.symbol==='ADA'));

const files=['src/bluesky-attention-evidence.mjs','src/candidate-evidence-v2-runtime.mjs','src/block-result-context.mjs'];
const runtime_sha256=Object.fromEntries(files.map(p=>{
 const h=hash(fs.readFileSync(path.join(root,p)));
 assert.equal(h,hash(fs.readFileSync(path.join('current-generation/files',p))));
 return[p,h];
}));
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN);
const budget=createUnifiedHttpBudget();
const run_id=`BLUESKY_NATIVE_ACTUAL:${process.env.GITHUB_RUN_ID}`;
const identity={chain:'cardano',asset_kind:'NATIVE',native_asset_id:'cardano:mainnet',contract_or_mint:null};
const asset_metadata={official_domains:['cardano.org']};
const raw=[];
const results=[];
function save(error=null){
 fs.writeFileSync('audit-output/bluesky-source-body.json',JSON.stringify(raw)+'\n');
 fs.writeFileSync('audit-output/bluesky-native-live-verification.json',JSON.stringify({
  schema:'report2-native-bluesky-attention-acceptance-v1',github_head:process.env.GITHUB_SHA,run_id,error,runtime_sha256,
  common_universe_sha256:hash(universeBytes),common_future_assets:102,common_future_contracts:119,results,
  source_http:raw.length,source_limits:SOURCE_POLICIES.BLUESKY_PUBLIC,database_usage:db.usageSnapshot(),
  production_canonical_writes:0,full_main_acceptance:false,all_15_live_accepted:false,telegram_calls:0,
 },null,2)+'\n');
}
process.on('uncaughtExceptionMonitor',error=>save(String(error)));
const fetch_impl=async(url,opts)=>{
 const parsed=new URL(url);
 assert.equal(parsed.origin,'https://api.bsky.app');
 assert.equal(parsed.pathname,'/xrpc/app.bsky.feed.searchPosts');
 assert.equal(parsed.searchParams.get('q'),'cardano.org');
 assert.equal(raw.length,0);
 const response=await fetch(url,opts),body=await response.clone().text();
 raw.push({url:String(url),http_status:response.status,observed_ts:Date.now(),body_sha256:hash(body),body});
 save();
 return response;
};
const now=Date.now();
const params={db,fetch_impl,request_admit:request=>budget.reserve(request),contract:'ADA-USDT',run_id,asset_identity:identity,asset_metadata,now,strict_fresh_manual:true};
const plan=planCandidateEvidenceRoutes(params);
assert.ok(plan.routes.some(route=>route.name==='BLUESKY'&&route.role==='ATTENTION_CONTEXT'));
const result=await collectBlueskyAttentionEvidence(params);
assert.equal(result.status,'CLOSED');
assert.equal(result.network_calls,1);
assert.equal(raw.length,1);
assert.equal(result.evidence.length,1);
assert.equal(result.evidence[0].asset_id,'cardano:native:mainnet');
assert.equal(result.evidence[0].query_identity,'EXACT_OFFICIAL_DOMAIN_NATIVE');
assert.equal(result.evidence[0].official_domain,'cardano.org');
assert.equal(result.evidence[0].directional_strength,null);
assert.equal(consumeEvidenceV2(result.evidence,{base_interest:70,decision_ts:Date.now()}).adjustment,0);
const context=consumeBlockResultContext({evidence:result.evidence,contract:'ADA-USDT',now:Date.now()});
assert.equal(context.status,'CLOSED');
assert.equal(context.facts.length,1);
assert.equal(context.facts[0].block_id,'N06');
assert.equal(context.facts[0].label,'Публичные сообщения с официальным доменом проекта');
assert.match(context.facts[0].value,/подтверждённому домену cardano\.org/);
assert.equal(context.facts[0].directional_vote,false);
const sources={BLUESKY_PUBLIC:result};
const audit=auditCandidateBlocks({evidence:result.evidence,sources,decision_ts:Date.now()});
assert.equal(audit.blocks.N06.checked,true);
assert.equal(audit.blocks.N06.missing_required.length,0);
assert.equal(audit.blocks.N06.decision_path,'ADMITTED_NEUTRAL_CONTEXT');
const observed_ts=Date.now();
const input={contract:'ADA-USDT',run_id,snapshot_id:`${run_id}:${observed_ts}`,observed_ts};
const before=buildRuntimeCanonicalBundle(input);
const after=buildRuntimeCanonicalBundle({...input,internal_market_context:{internal_only:true,evidence_v2:{evidence:result.evidence,sources}}});
assert.equal(after.manual.ok,true);
assert.ok(after.manual.text.includes('Публичные сообщения с официальным доменом проекта'));
assert.ok(after.manual.text.includes('cardano.org'));
assert.ok(after.block_rendered_results.used_context_block_ids.includes('N06'));
assert.deepEqual(after.canonical.scores,before.canonical.scores);
assert.equal(after.canonical.direction,before.canonical.direction);
assert.equal(after.canonical.state,before.canonical.state);
assert.deepEqual(after.canonical.targets,before.canonical.targets);
results.push({contract:'ADA-USDT',identity,asset_metadata,result,context,audit,report:{scope:'ACTUAL_FRESH_NATIVE_OFFICIAL_DOMAIN_ATTENTION_IN_CANONICAL_AND_APPROVED_MANUAL_NO_DIRECTION_OR_SCORE',manual:after.manual,rendered_use:after.block_rendered_results}});
save();
const usage=db.usageSnapshot();
assert.equal(usage.unknown_ops,0);
assert.ok(usage.rows_read<=1000&&usage.rows_written<=60);
save();
console.log(JSON.stringify({status:'CLOSED_ACTUAL_NATIVE_BLUESKY_N06_CONTEXT',source_http:raw.length,database_usage:usage,full_main_acceptance:false,telegram_calls:0}));
