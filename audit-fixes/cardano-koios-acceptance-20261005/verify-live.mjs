import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

const root=path.resolve(process.argv[2]||'runtime'),load=name=>import(pathToFileURL(path.join(root,name)));
const {RemoteD1Database}=await load('report2-d1-adapter.mjs');
const {collectChainSupplyEvidence}=await load('src/chain-supply-evidence.mjs');
const {consumeEvidenceV2}=await load('src/evidence-v2.mjs');
const {consumeBlockResultContext,auditRenderedBlockResults}=await load('src/block-result-context.mjs');
const {auditCandidateBlocks}=await load('src/candidate-evidence-v2-runtime.mjs');
const {buildRuntimeCanonicalBundle}=await load('src/canonical-runtime-adapter.mjs');
const {renderCanonicalTelegram}=await load('src/canonical-publication.mjs');
const {createUnifiedHttpBudget}=await load('src/unified-budget.mjs');

const phase=JSON.parse(fs.readFileSync('checkpoints/CLOUD_PHASE_STATE_20261004.json'));
assert.equal(phase.current_phase,'CORE_BLOCKS');assert.equal(phase.lease?.owner,process.env.REPORT2_CONTINUATION_OWNER);assert.ok(phase.lease.expires_ts>Date.now());
const universeBytes=fs.readFileSync('checkpoints/htx-all-modes-crypto-futures-universe-20261004.json.gz'),universe=JSON.parse(zlib.gunzipSync(universeBytes));
assert.equal(universe.status,'CLOSED');assert.equal(universe.assets.length,102);assert.equal(universe.contracts.length,119);assert.ok(universe.assets.some(row=>row.symbol==='ADA'&&row.asset_analysis_contract==='ADA-USDT'));

const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),budget=createUnifiedHttpBudget(),run_id=`ADA_KOIOS_ACTUAL:${process.env.GITHUB_RUN_ID}`,raw=[],results=[];
function save(error=null){fs.writeFileSync('audit-output/cardano-koios-source-bodies.json',JSON.stringify(raw)+'\n');fs.writeFileSync('audit-output/cardano-koios-live-verification.json',JSON.stringify({schema:'report2-actual-cardano-koios-native-supply-v1',github_head:process.env.GITHUB_SHA,run_id,error,common_universe_sha256:crypto.createHash('sha256').update(universeBytes).digest('hex'),common_future_assets:universe.assets.length,common_future_contracts:universe.contracts.length,results,source_http:raw.length,source_limits:{official_public_daily_cap:5000,official_burst_cap:100,official_burst_window_seconds:10,official_timeout_seconds:30,internal_daily_cap:48,internal_refresh_period_ms:21600000,per_refresh_http:4,retries:0,auth:'PUBLIC_NO_KEY'},http_budget:budget.summary(),database_usage:db.usageSnapshot(),production_canonical_writes:0,deep_checks_started:0,telegram_calls:0,full_main_acceptance:false,all_15_live_accepted:false,telegram_delivery_proven:false},null,2)+'\n');}
process.on('uncaughtExceptionMonitor',error=>save(String(error)));
const fetch_impl=async(url,options)=>{const parsed=new URL(String(url));assert.equal(parsed.origin,'https://api.koios.rest');assert.ok(['/api/v1/tip','/api/v1/genesis','/api/v1/totals'].includes(parsed.pathname));assert.ok(raw.length<4);const response=await fetch(url,options),body=await response.clone().text();raw.push({url:String(url),http_status:response.status,observed_ts:Date.now(),body_sha256:crypto.createHash('sha256').update(body).digest('hex'),body});save();return response;};
const now=Date.now(),result=await collectChainSupplyEvidence({db,fetch_impl,request_admit:request=>budget.reserve(request),contract:'ADA-USDT',run_id,asset_identity:{chain:'cardano',asset_kind:'NATIVE',native_asset_id:'cardano:mainnet',contract_or_mint:null},identity_method:'HTX_OFFICIAL_NATIVE_CURRENCY_NETWORK',now,clock:Date.now,strict_fresh_manual:true});
assert.equal(result.status,'CLOSED');assert.equal(result.network_calls,4);assert.equal(raw.length,4);assert.deepEqual(result.evidence.map(row=>row.block_id),['N02','N03']);assert.deepEqual(result.evidence.map(row=>row.metric_family),['CARDANO_ACTIVE_SUPPLY_OBSERVATION','SUPPLY_REDUCTION_CHECK']);assert.ok(result.evidence.every(row=>row.provider_id==='KOIOS_NATIVE_SUPPLY'&&row.upstream_id==='KOIOS_CARDANO_MAINNET'&&row.asset_id==='cardano:native:mainnet'&&row.htx_contract==='ADA-USDT'));
assert.equal(consumeEvidenceV2(result.evidence,{base_interest:70,decision_ts:Date.now()}).adjustment,0);
const context=consumeBlockResultContext({evidence:result.evidence,contract:'ADA-USDT',now:Date.now()});assert.deepEqual(context.facts.map(row=>row.block_id),['N02','N03']);assert.ok(context.facts.every(row=>row.score_contribution===0&&row.directional_vote===false));
const audit=auditCandidateBlocks({sources:{CHAIN_SUPPLY:result,CHAIN_SUPPLY_COMPARISON:{...result,check_completed:true,scope:'EXACT_TWO_CLOSED_CARDANO_EPOCHS'}},evidence:result.evidence,decision_ts:Date.now()});assert.equal(audit.blocks.N02.usable_facts,1);assert.equal(audit.blocks.N03.usable_facts,1);
const observed_ts=Date.now(),input={contract:'ADA-USDT',run_id,snapshot_id:`${run_id}:ADA-USDT:${observed_ts}`,observed_ts},before=buildRuntimeCanonicalBundle(input),after=buildRuntimeCanonicalBundle({...input,internal_market_context:{internal_only:true,evidence_v2:{evidence:result.evidence,sources:{CHAIN_SUPPLY:result,CHAIN_SUPPLY_COMPARISON:{...result,check_completed:true}}}}});
assert.equal(after.manual.ok,true);assert.ok(after.manual.text.includes('Активное предложение нативного ADA'));assert.ok(after.manual.text.includes('Сравнение активного предложения ADA'));assert.deepEqual(after.canonical.scores,before.canonical.scores);assert.equal(after.canonical.direction,before.canonical.direction);assert.equal(after.canonical.state,before.canonical.state);assert.deepEqual(after.canonical.targets,before.canonical.targets);assert.equal(after.canonical.metadata.automatic_execution,false);assert.deepEqual(after.block_rendered_results.used_context_block_ids,['N02','N03']);
const telegram=renderCanonicalTelegram({canonical:after.canonical,lifecycle_event:'OBSERVE'});assert.equal(telegram.ok,true);assert.ok(telegram.text.includes('Активное предложение нативного ADA'));assert.ok(telegram.text.includes('Сравнение активного предложения ADA'));const renderAudit=auditRenderedBlockResults({canonical:after.canonical,manual:after.manual,telegram});assert.deepEqual(renderAudit.used_context_block_ids,['N02','N03']);assert.deepEqual(renderAudit.telegram_used_context_block_ids,['N02','N03']);assert.equal(renderAudit.telegram_delivery_proven,false);
results.push({symbol:'ADA',contract:'ADA-USDT',identity:{chain:'cardano',asset_kind:'NATIVE',native_asset_id:'cardano:mainnet',contract_or_mint:null},result,context,audit,report:{scope:'ACTUAL_FRESH_KOIOS_TWO_CLOSED_EPOCHS_IN_CANONICAL_AND_APPROVED_RENDERERS_NO_SIGNAL',manual:after.manual,telegram,rendered_use:renderAudit}});save();
const usage=db.usageSnapshot();assert.equal(usage.unknown_ops,0);assert.ok(usage.rows_read<=1000&&usage.rows_written<=50);save();
console.log(JSON.stringify({status:'CLOSED_ACTUAL_CARDANO_KOIOS_N02_N03_REPORT_CONTEXT',useful_assets:['ADA'],useful_blocks:['N02','N03'],checked_common_assets:universe.assets.length,source_http:raw.length,database_usage:usage,production_canonical_writes:0,deep_checks_started:0,telegram_calls:0,full_main_acceptance:false}));
