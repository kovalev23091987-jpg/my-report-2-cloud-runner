import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root=path.resolve(process.argv[2]||'runtime'),load=rel=>import(pathToFileURL(path.join(root,rel)));
const {RemoteD1Database}=await load('report2-d1-adapter.mjs');
const {collectDeribitAltOptionsEvidence}=await load('src/deribit-alt-options-evidence.mjs');
const {consumeBlockResultContext}=await load('src/block-result-context.mjs');
const {createUnifiedHttpBudget}=await load('src/unified-budget.mjs');
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),budget=createUnifiedHttpBudget();
const calls=[];
const result=await collectDeribitAltOptionsEvidence({db,contract:'NEAR-USDT',run_id:`OPTIONS_REPAIR:${process.env.GITHUB_RUN_ID}`,now:Date.now(),strict_fresh_manual:true,
 request_admit:request=>budget.reserve(request),fetch_impl:async(url,options)=>{calls.push(url);assert.ok(calls.length<=2);return fetch(url,options);}});
const context=consumeBlockResultContext({evidence:result.evidence,contract:'NEAR-USDT',now:Date.now()});
assert.ok(calls.every(url=>!url.includes('get_book_summary_by_currency?currency=NEAR')));
assert.ok(context.facts.every(f=>f.score_contribution===0&&f.hard_gate===false&&f.directional_vote===false));
const usage=db.usageSnapshot();assert.equal(usage.unknown_ops,0);assert.ok(usage.rows_read<=1500&&usage.rows_written<=30);
fs.writeFileSync('audit-output/options-route-verification.json',JSON.stringify({schema:'report2-options-route-verification-v1',github_head:process.env.GITHUB_SHA,contract:'NEAR-USDT',result,context,calls,source_http:calls.length,deep_checks_started:0,database_usage:usage,production_write_scope:'EXISTING_SOURCE_QUOTA_AND_CACHE_ONLY',canonical_writes:0,telegram_calls:0,entry_authorized:false,main_accepted:false},null,2)+'\n');
console.log(JSON.stringify({status:result.status,source_http:calls.length,useful_context_count:context.facts.length,deep_checks_started:0,canonical_writes:0,telegram_calls:0}));
