import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createFuturesCoverageDatabase,qualifyNumericFutureReceipt,applyFuturesCoverageChecks,resetFuturesCoverageForWeeklyRefresh,summarizeFuturesCoverage,NON_QUALIFYING_FUTURE_SOURCE_POLICIES,WEEK} from '../files/src/liquidation-futures-coverage.mjs';
import {seal} from '../files/src/liquidation-extension/core.mjs';
const T=Date.parse('2026-10-04T22:00:00Z'),universe={status:'CLOSED',observed_ts:T-1000,contracts:[{family:'linear_swap',contract_code:'SOL-USDT',asset_symbol:'SOL'}],assets:[{symbol:'SOL',asset_analysis_contract:'SOL-USDT',contracts:[{family:'linear_swap',contract_code:'SOL-USDT'}]}]},digest=createHash('sha256').update('u').digest('hex');
const native=extra=>seal({provider:'Hyperliquid official',native_symbol:'SOL',run_id:'R',source_ts:T-1000,source_clock_closed:true,usable_for_context:true,evidence_class:'NATIVE_ACCOUNT_LIQUIDATION_PRICES',coverage:'EXPLICIT_PUBLIC_ACCOUNT_SAMPLE',zones:[{native_price:90,liquidated_side:'LONG',source_ts:T-1000,price_quote:'USDC',price_semantics:'EXCHANGE_ACCOUNT_LIQUIDATION_PRICE'}],...extra});
test('only genuine provider levels qualify; projected buckets and SDK estimates never do',()=>{
 assert.ok(qualifyNumericFutureReceipt({source_id:'HYPERLIQUID_NATIVE',receipt:native(),contract:'SOL-USDT',now:T}));
 assert.equal(qualifyNumericFutureReceipt({source_id:'OXARCHIVE_HL_BUCKETS',receipt:seal({...native(),provider:'0xArchive',evidence_class:'POSITION_DERIVED_PROJECTED_BUCKETS'}),contract:'SOL-USDT',now:T}),null);
 assert.equal(qualifyNumericFutureReceipt({source_id:'GTRADE_NATIVE',receipt:seal({...native(),provider:'gTrade official SDK',zones:[{native_price:90,liquidated_side:'LONG',source_ts:T-1000,price_semantics:'OFFICIAL_SDK_ESTIMATE_INDEX_TRIGGER'}]}),contract:'SOL-USDT',now:T}),null);
 assert.equal(Object.keys(NON_QUALIFYING_FUTURE_SOURCE_POLICIES).length,6);
});
test('batch checks, summary and weekly reset preserve the exact common universe',()=>{
 let db=createFuturesCoverageDatabase({universe,universe_sha256:digest,now:T});
 const proof=createHash('sha256').update('p').digest('hex');
 db=applyFuturesCoverageChecks(db,[{contract:'SOL-USDT',source_id:'HYPERLIQUID_NATIVE',status:'REAL_NUMERIC_LEVELS',receipt:native(),now:T+1},...Object.keys(NON_QUALIFYING_FUTURE_SOURCE_POLICIES).map((source_id,i)=>({contract:'SOL-USDT',source_id,status:'NO_REAL_NUMERIC_LEVELS',source_proof_sha256:proof,now:T+2+i}))]);
 db=applyFuturesCoverageChecks(db,[{contract:'SOL-USDT',source_id:'BYK_TRACKED_HL_BANDS',status:'EXACT_SOURCE_MARKET_UNSUPPORTED',source_proof_sha256:proof,now:T+20}]);
 assert.deepEqual(summarizeFuturesCoverage(db,{now:T+21}),{status:'CLOSED',assets:1,cells:8,checked_cells:8,covered_assets:1,uncovered_assets:0,complete:true,weekly_refresh_due_ts:T+WEEK});
 const before=resetFuturesCoverageForWeeklyRefresh(db,{now:T+WEEK-1});assert.equal(before.reset,false);
 const after=resetFuturesCoverageForWeeklyRefresh(db,{now:T+WEEK});assert.equal(after.reset,true);assert.equal(after.database.source_checks_complete,false);assert.equal(after.database.assets[0].source_checks.HYPERLIQUID_NATIVE.status,'UNVERIFIED');
});
