import test from 'node:test';
import assert from 'node:assert/strict';
import {auditRetainedHtxHistoryCoverage as audit} from '../runner/retained102-history-gap-census.mjs';
const DAY=86400000,start=1791419400000,hash='a'.repeat(64);
const assets=Array.from({length:102},(_,i)=>i===0?'NEAR-USDT':'COIN'+i+'-USDT');
const universe={status:'CLOSED',observed_ts:1791136124778,contracts:Array.from({length:119},()=>({})),catalog_families:['linear','coin_swap','coin_delivery'],assets:assets.map(asset_analysis_contract=>({asset_analysis_contract}))};
const sampled={status:'ALL102_APPROVED_ANALYSIS_CONTRACTS_ORIGINAL24H_READER_CLOSED',contracts:102,total_points:29376,original_rows:1734,original_start_ts:start,original_end_ts:start+DAY,source_cloud_run:37865298193,approved_universe:{original_observed_ts:universe.observed_ts},results:assets.map(contract=>({contract,status:'CLOSED',points:288,points_sha256:hash,first_ts:start+1000,last_ts:start+DAY-300000}))};
const native={status:'EXACT_ORIGINAL_NATIVE_MINUTE_PRICE_AND_CURRENT_HORIZON_CONSUMERS_VERIFIED',prices:{contract:'NEAR-USDT',all1440_unique_minutes_exact_OHLC_native_API_match:true,event_interval:[start-DAY,start],archive_sha256:hash,source_ts:start+DAY,qualified_at:start+2*DAY}};
const binance={status:'EXACT_ORIGINAL_TWO_VENUE_92DAY_PRICES_AND_CURRENT_CONSUMERS_VERIFIED',actual_symbol:'BTCUSDT',all102_30_90day_event_trade_history_complete:false};
const run=patch=>audit({universe,sampled,native,binance,...patch});
test('102 sampled price paths do not imply exact 30/90-day HTX history',()=>{
 const r=run();assert.equal(r.status,'PARTIAL_VERIFIED_RETAINED_EVIDENCE_ONLY');assert.equal(r.rows.length,102);assert.equal(r.sampled_24h.points,29376);
 assert.equal(r.verified_30d_complete_assets,0);assert.equal(r.verified_90d_complete_assets,0);assert.equal(r.separate_binance.counted_as_htx_native_minutes,0);
 assert.equal(r.rows.find(x=>x.contract==='NEAR-USDT').native_htx_1m.qualified_minutes_in_retained_proofs,1440);
 assert.equal(r.rows.find(x=>x.contract==='COIN1-USDT').native_htx_1m.qualified_minutes_in_retained_proofs,0);
 assert.equal(r.project_complete,false);
});
test('duplicate, missing, inconsistent and foreign original sample fail closed',()=>{
 const duplicate=structuredClone(sampled);duplicate.results[1].contract=duplicate.results[0].contract;assert.equal(run({sampled:duplicate}).status,'NOT_CLOSED');
 const missing=structuredClone(sampled);missing.results.pop();assert.equal(run({sampled:missing}).status,'NOT_CLOSED');
 const identity=structuredClone(sampled);identity.approved_universe.original_observed_ts++;assert.equal(run({sampled:identity}).status,'NOT_CLOSED');
 const count=structuredClone(sampled);count.results[0].points=287;assert.equal(run({sampled:count}).status,'NOT_CLOSED');
});
test('foreign native archive and Binance cross-venue relabel are refused',()=>{
 const foreign=structuredClone(native);foreign.prices.contract='BTC-USDT';assert.equal(run({native:foreign}).status,'NOT_CLOSED');
 assert.equal(run({binance:{...binance,actual_symbol:'ETHUSDT'}}).status,'NOT_CLOSED');
});
