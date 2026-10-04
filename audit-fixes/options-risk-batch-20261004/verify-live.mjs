import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const root=path.resolve(process.argv[2]||'runtime'),load=n=>import(pathToFileURL(path.join(root,n)));
const {RemoteD1Database}=await load('report2-d1-adapter.mjs');
const {collectDeribitAltOptionsEvidence}=await load('src/deribit-alt-options-evidence.mjs');
const {consumeBlockResultContext}=await load('src/block-result-context.mjs');
const {consumeEvidenceV2}=await load('src/evidence-v2.mjs');
const {createUnifiedHttpBudget}=await load('src/unified-budget.mjs');
const universeBytes=fs.readFileSync('checkpoints/htx-all-modes-crypto-futures-universe-20261004.json.gz'),universe=JSON.parse(zlib.gunzipSync(universeBytes));
assert.equal(universe.status,'CLOSED');assert.equal(new Set(universe.assets.map(a=>a.symbol)).size,universe.assets.length);
const allowed=new Set(['https://www.deribit.com/api/v2/public/get_instruments?currency=any&kind=option&expired=false','https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=USDC&kind=option']);
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),budget=createUnifiedHttpBudget(),raw=[],results=[];
const run_id=`OPTIONS_RISK:${process.env.GITHUB_RUN_ID}`,owner=process.env.REPORT2_CONTINUATION_OWNER;
const state=JSON.parse(fs.readFileSync('checkpoints/CLOUD_PHASE_STATE_20261004.json','utf8'));assert.equal(state.current_phase,'CORE_BLOCKS');assert.equal(state.lease?.owner,owner);assert.ok(state.lease.expires_ts>Date.now());
const fetch_impl=async(url,options)=>{assert.ok(allowed.has(String(url)));assert.ok(raw.length<2);const r=await fetch(url,options),body=await r.clone().text();raw.push({url:String(url),http_status:r.status,observed_ts:Date.now(),sha256:crypto.createHash('sha256').update(body).digest('hex'),body});return r;};
function save(error=null){fs.writeFileSync('audit-output/options-risk-source-bodies.json',JSON.stringify(raw)+'\n');fs.writeFileSync('audit-output/options-risk-live-verification.json',JSON.stringify({schema:'options-risk-live-batch-v1',github_head:process.env.GITHUB_SHA,run_id,error,common_future_universe_sha256:crypto.createHash('sha256').update(universeBytes).digest('hex'),crypto_future_assets:universe.assets.length,contracts:universe.contracts.length,checked_assets:results.length,results,source_http:raw.length,source_receipts:raw.map(({body,...r})=>r),database_usage:db.usageSnapshot(),production_write_scope:'EXISTING_DERIBIT_QUOTA_AND_CACHE_ONLY',all_15_live_accepted:false,deep_checks_started:0,canonical_writes:0,telegram_calls:0,liquidation_started:false,historical_replay_is_fresh_acceptance:false},null,2)+'\n');}
process.on('uncaughtException',e=>{save(String(e));console.error(e);process.exitCode=1;});
// First fresh read repairs the multi-settlement BTC route. Every asset afterwards reuses the same admitted catalogue and settlement book.
const ordered=[...universe.assets].sort((a,b)=>(a.symbol==='BTC'?-1:0)-(b.symbol==='BTC'?-1:0)||a.symbol.localeCompare(b.symbol));
for(const [i,asset] of ordered.entries()){
 assert.equal(asset.asset_analysis_contract,asset.symbol+'-USDT');
 const result=await collectDeribitAltOptionsEvidence({db,fetch_impl,request_admit:r=>budget.reserve(r),contract:asset.asset_analysis_contract,run_id:run_id+':'+asset.symbol,now:Date.now(),strict_fresh_manual:i===0});
 const context=consumeBlockResultContext({contract:asset.asset_analysis_contract,evidence:result.evidence,now:Date.now()});
 results.push({symbol:asset.symbol,contract:asset.asset_analysis_contract,result,context});save();
 assert.equal(result.network_calls,i===0?2:0);assert.ok(['CLOSED','NOT_APPLICABLE'].includes(result.status));assert.equal(context.facts.length,1,asset.symbol);
 assert.ok(context.facts.every(f=>f.score_contribution===0&&f.hard_gate===false&&f.directional_vote===false));assert.equal(consumeEvidenceV2(result.evidence,{base_interest:70,decision_ts:Date.now()}).adjustment,0);
}
const usage=db.usageSnapshot();assert.equal(usage.unknown_ops,0);assert.ok(usage.rows_read<=15000&&usage.rows_written<=300);assert.equal(raw.length,2);assert.equal(results.length,universe.assets.length);
const risk=results.filter(r=>r.context.facts.some(f=>f.label==='Опционная волатильность актива'));
assert.ok(risk.length>=3,'AT_LEAST_THREE_ACTUAL_SCOPED_IV_CONTEXTS_REQUIRED');for(const base of ['BTC','ETH'])assert.ok(results.find(r=>r.symbol===base).result.summary.scoped_instrument_count<results.find(r=>r.symbol===base).result.summary.open_instrument_count);
save();console.log(JSON.stringify({status:'CLOSED_LIVE_OPTIONS_BATCH',checked_assets:results.length,scoped_iv_assets:risk.map(r=>r.symbol),catalog_absent_assets:results.filter(r=>r.result.status==='NOT_APPLICABLE').length,source_http:raw.length,database_usage:usage,deep_checks_started:0,telegram_calls:0,all_15_live_accepted:false}));
