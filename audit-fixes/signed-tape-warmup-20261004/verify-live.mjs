import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const root=path.resolve(process.argv[2]||'runtime'),load=n=>import(pathToFileURL(path.join(root,n)));
const {RemoteD1Database}=await load('report2-d1-adapter.mjs');
const {parseHtxMarketJson}=await load('src/htx-trade-json.mjs');
const {persistCapturedHtxSignedTape,clearHtxSignedTapeSnapshots}=await load('src/htx-signed-tape.mjs');
const {installEvidenceSourceStore,reserveEvidenceSourceAttempts}=await load('src/evidence-source-store.mjs');
const {createUnifiedHttpBudget}=await load('src/unified-budget.mjs');
const universeBytes=fs.readFileSync('checkpoints/htx-all-modes-crypto-futures-universe-20261004.json.gz'),universe=JSON.parse(zlib.gunzipSync(universeBytes));
const state=JSON.parse(fs.readFileSync('checkpoints/CLOUD_PHASE_STATE_20261004.json','utf8'));
assert.equal(state.current_phase,'CORE_BLOCKS');assert.equal(state.lease?.owner,process.env.REPORT2_CONTINUATION_OWNER);assert.ok(state.lease.expires_ts>Date.now());assert.equal(universe.status,'CLOSED');
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),budget=createUnifiedHttpBudget(),raw=[],results=[];
const run_id=`SIGNED_TAPE:${process.env.GITHUB_RUN_ID}`,contracts=['NEAR-USDT','SOL-USDT'];
for(const contract of contracts)assert.ok(universe.assets.some(a=>a.asset_analysis_contract===contract));
function save(error=null){fs.writeFileSync('audit-output/signed-tape-source-bodies.json',JSON.stringify(raw)+'\n');fs.writeFileSync('audit-output/signed-tape-live-verification.json',JSON.stringify({schema:'signed-raw-tape-live-warmup-v1',github_head:process.env.GITHUB_SHA,run_id,error,common_future_universe_sha256:crypto.createHash('sha256').update(universeBytes).digest('hex'),universe_crypto_future_assets:universe.assets.length,universe_contracts:universe.contracts.length,contracts_checked:results.length,results,source_http:raw.length,source_receipts:raw.map(({body,...r})=>r),database_usage:db.usageSnapshot(),production_write_scope:'EXISTING_HTX_SOURCE_QUOTA_AND_EXACT_RAW_MINUTE_CACHE_ONLY',additional_pipeline_http:0,raw_24h_live_accepted:false,all_15_live_accepted:false,deep_checks_started:0,canonical_writes:0,telegram_calls:0,liquidation_started:false,historical_replay_is_fresh_acceptance:false},null,2)+'\n');}
process.on('uncaughtExceptionMonitor',e=>save(String(e)));
await installEvidenceSourceStore(db);clearHtxSignedTapeSnapshots();
async function htx(url,key){
 const id=run_id+':'+key;assert.equal(budget.reserve({logical_request_id:id,lane:'background',attempts:1}).allowed,true);
 assert.equal((await reserveEvidenceSourceAttempts(db,{source:'HTX_PUBLIC_RISK',reservation_id:id,attempts:1,daily_cap:144,now:Date.now()})).allowed,true);
 assert.ok(raw.length<6);const row={url,started_ts:Date.now()};raw.push(row);save();
 const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(10000)}),body=await response.text();Object.assign(row,{http_status:response.status,observed_ts:Date.now(),sha256:crypto.createHash('sha256').update(body).digest('hex'),body});save();assert.equal(response.ok,true);
 return parseHtxMarketJson(body,url);
}
for(const contract of contracts){
 const q=encodeURIComponent(contract);
 await htx(`https://api.hbdm.com/linear-swap-api/v1/swap_contract_info?contract_code=${q}`,contract+':META');
 await htx(`https://api.hbdm.com/linear-swap-ex/market/history/kline?contract_code=${q}&period=1min&size=1600`,contract+':MINUTES');
 await htx(`https://api.hbdm.com/linear-swap-ex/market/history/trade?contract_code=${q}&size=2000`,contract+':RAW_FILLS');
 const admit=extra=>{const usage=db.usageSnapshot();return{allowed:usage.unknown_ops===0&&usage.rows_read+extra.rows_read<=15000&&usage.rows_written+extra.rows_written<=100,status:'EXISTING_AUDIT_DB_HEADROOM'};};
 const now=Date.now(),receipt=await persistCapturedHtxSignedTape({db,contract,now,db_admit:admit});
 results.push({contract,observed_ts:now,receipt});save();assert.ok(receipt.persisted_minutes>0,contract+':NO_ACTUAL_PERSISTED_RAW_MINUTE');assert.equal(receipt.network_calls,0);assert.equal(receipt.status,'WARMING_OR_GAPPED_RAW_24H');assert.equal(receipt.evidence.length,0);
 const repeated=await persistCapturedHtxSignedTape({db,contract,now,db_admit:admit});results.at(-1).idempotent_readback=repeated;save();assert.equal(repeated.persisted_minutes,receipt.persisted_minutes);assert.equal(repeated.storage_bytes,receipt.storage_bytes);assert.equal(repeated.evidence.length,0);
}
const usage=db.usageSnapshot();assert.equal(usage.unknown_ops,0);assert.ok(usage.rows_read<=15000&&usage.rows_written<=100);assert.equal(raw.length,6);assert.equal(results.length,2);save();
console.log(JSON.stringify({status:'CLOSED_LIVE_RAW_MINUTE_WARMUP',contracts:results.map(r=>({contract:r.contract,persisted_minutes:r.receipt.persisted_minutes,status:r.receipt.status})),source_http:raw.length,database_usage:usage,raw_24h_live_accepted:false,deep_checks_started:0,telegram_calls:0,all_15_live_accepted:false}));
