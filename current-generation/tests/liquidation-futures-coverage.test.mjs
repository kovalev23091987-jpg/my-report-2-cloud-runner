import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
const root=process.env.REPORT2_COVERAGE_MODULE_ROOT,load=rel=>import(root?pathToFileURL(root+'/'+rel):new URL('../files/src/'+rel,import.meta.url));
const {createFuturesCoverageDatabase,validateFuturesCoverageDatabase,qualifyNumericFutureReceipt,applyFuturesCoverageCheck,futuresLiquidationAdmission,runtimeLiquidationCollectionAdmission,saveFuturesCoverageDatabase,loadFuturesCoverageDatabase,saveFuturesCoverageRefreshDatabase,loadFuturesCoverageRefreshDatabase,resetFuturesCoverageForWeeklyRefresh,alignFuturesCoverageToApprovedScope,WEEK}=await load('liquidation-futures-coverage.mjs');
const {APPROVED_HTX_SCOPE,APPROVED_HTX_ANALYSIS_CONTRACTS}=await load('approved-htx-analysis-scope.mjs');
const {seal}=await load('liquidation-extension/core.mjs');
const bytes=fs.readFileSync(new URL('../../checkpoints/htx-all-modes-crypto-futures-universe-20261004.json.gz',import.meta.url)),universe=JSON.parse(zlib.gunzipSync(bytes)),T=universe.observed_ts+1000;
const matrix=()=>createFuturesCoverageDatabase({universe,universe_sha256:createHash('sha256').update(bytes).digest('hex'),now:T});
const receipt=(provider='Hyperliquid official',extra={})=>seal({provider,native_symbol:'NEAR',usable_for_context:true,source_ts:T,evidence_class:'NATIVE_ACCOUNT_LIQUIDATION_PRICES',zones:[{native_price:2,liquidated_side:'SHORT',price_quote:'USDC',source_ts:T,price_semantics:'EXCHANGE_ACCOUNT_LIQUIDATION_PRICE'}],...extra});
test('retained 102-asset LIQ matrix aligns to exact approved 104 without refreshing proof or inventing CT/RLC coverage',()=>{
 const old=applyFuturesCoverageCheck(matrix(),{contract:'NEAR-USDT',source_id:'HYPERLIQUID_NATIVE',status:'REAL_NUMERIC_LEVELS',receipt:receipt(),now:T});
 const now=APPROVED_HTX_SCOPE.catalog_observed_ts+1000;
 const args={approved_analysis_contracts:APPROVED_HTX_ANALYSIS_CONTRACTS,universe_sha256:APPROVED_HTX_SCOPE.manifest_sha256,universe_observed_ts:APPROVED_HTX_SCOPE.catalog_observed_ts,now};
 const aligned=alignFuturesCoverageToApprovedScope(old,args);
 assert.equal(validateFuturesCoverageDatabase(aligned),true);
 assert.equal(aligned.crypto_future_assets,104);assert.equal(aligned.crypto_future_contracts,121);
 assert.equal(aligned.source_checks_complete,false);assert.deepEqual(aligned.alignment.added_assets,['CT','RLC']);
 assert.equal(aligned.assets.find(a=>a.symbol==='NEAR').source_checks.HYPERLIQUID_NATIVE.checked_ts,T);
 for(const symbol of ['CT','RLC'])assert.equal(futuresLiquidationAdmission(aligned,{contract:`${symbol}-USDT`,now}).status,'SOURCE_CHECKS_NOT_COMPLETE');
 assert.equal(old.crypto_future_assets,102);assert.equal(alignFuturesCoverageToApprovedScope(old,{...args,approved_analysis_contracts:APPROVED_HTX_ANALYSIS_CONTRACTS.slice(1)}),null);
 const discover=runtimeLiquidationCollectionAdmission(aligned,{contract:'CT-USDT',now});
 assert.equal(discover.eligible,true);assert.deepEqual(discover.source_ids,['HYPERLIQUID_NATIVE']);
 assert.deepEqual(discover.proven_level_source_ids,[]);assert.deepEqual(discover.structural_market_source_ids,[]);
 assert.equal(discover.fresh_live_levels_confirmed,false);
 const stale=runtimeLiquidationCollectionAdmission(aligned,{contract:'NEAR-USDT',now:T+WEEK+1});
 assert.equal(futuresLiquidationAdmission(aligned,{contract:'NEAR-USDT',now:T+WEEK+1}).eligible,false);
 assert.equal(stale.eligible,true);assert.deepEqual(stale.proven_level_source_ids,[]);assert.deepEqual(stale.source_ids,['HYPERLIQUID_NATIVE']);
});
test('all common crypto futures and all eight source cells are retained, including unsupported/unverified assets',()=>{
 const d=matrix();assert.equal(d.crypto_future_assets,102);assert.equal(d.crypto_future_contracts,119);assert.equal(d.assets.reduce((n,a)=>n+Object.keys(a.source_checks).length,0),816);assert.equal(validateFuturesCoverageDatabase(d),true);assert.equal(d.source_checks_complete,false);
 for(const c of ['NEAR-USDT','BTC-USDT','ETH-USDT','PAXG-USDT','XAUT-USDT'])assert.equal(futuresLiquidationAdmission(d,{contract:c,now:T}).status,'SOURCE_CHECKS_NOT_COMPLETE');
 assert.equal(futuresLiquidationAdmission(d,{contract:'NOT_A_FUTURE-USDT',now:T}).eligible,false);
 assert.throws(()=>createFuturesCoverageDatabase({universe:{...universe,status:'PARTIAL'},universe_sha256:'a'.repeat(64),now:T}),/COMPLETE_CRYPTO/);
});
test('one genuine numeric source admits that same coin only, keeps all sources and deduplicates the shared upstream',()=>{
 let d=applyFuturesCoverageCheck(matrix(),{contract:'NEAR-USDT',source_id:'HYPERLIQUID_NATIVE',status:'REAL_NUMERIC_LEVELS',receipt:receipt(),now:T});
 d=applyFuturesCoverageCheck(d,{contract:'NEAR-USDT',source_id:'BYK_TRACKED_HL_BANDS',status:'REAL_NUMERIC_LEVELS',receipt:receipt('Bykaranteli tracked Hyperliquid positions'),now:T});
 const yes=futuresLiquidationAdmission(d,{contract:'NEAR-USDT',now:T});assert.equal(yes.eligible,true);assert.equal(yes.source_ids.length,2);assert.deepEqual(yes.independent_upstreams,['HYPERLIQUID']);assert.equal(yes.leaders_may_be_replaced,false);assert.equal(futuresLiquidationAdmission(d,{contract:'SOL-USDT',now:T}).eligible,false);assert.equal(futuresLiquidationAdmission(d,{contract:'NEAR-USDT',now:T+WEEK}).eligible,false);
});
test('catalog existence, projected headline, model/SDK estimates, wrong source identity, stale or tampered bytes cannot prove real levels',()=>{
 for(const r of [receipt('OTHER'),receipt('Hyperliquid official',{native_symbol:'SOL'}),receipt('Hyperliquid official',{evidence_class:'SOURCE_BACKED_CALCULATED_MODEL'}),receipt('Hyperliquid official',{evidence_class:'NATIVE_POSITION_FEE_AWARE_ESTIMATES'}),receipt('Hyperliquid official',{source_ts:T-300001}),receipt('Hyperliquid official',{zones:[]})])assert.equal(qualifyNumericFutureReceipt({source_id:'HYPERLIQUID_NATIVE',contract:'NEAR-USDT',receipt:r,now:T}),null);
 const r=receipt();r.zones[0].native_price=999;assert.equal(qualifyNumericFutureReceipt({source_id:'HYPERLIQUID_NATIVE',contract:'NEAR-USDT',receipt:r,now:T}),null);assert.throws(()=>applyFuturesCoverageCheck(matrix(),{contract:'NEAR-USDT',source_id:'HYPERLIQUID_NATIVE',status:'REAL_NUMERIC_LEVELS',receipt:r,now:T}),/GENUINE_NUMERIC/);
 const bad=matrix();delete bad.assets[0].source_checks.LIGHTER_NATIVE;assert.equal(validateFuturesCoverageDatabase(bad),false);assert.equal(futuresLiquidationAdmission(bad,{contract:'NEAR-USDT',now:T}).eligible,false);
});
class DB{constructor(){this.sql=new DatabaseSync(':memory:');}prepare(sql){const db=this;return{args:[],bind(...args){this.args=args;return this;},async run(){return db.sql.prepare(sql).run(...this.args);},async first(){return db.sql.prepare(sql).get(...this.args)||null;}};}async batch(rows){return Promise.all(rows.map(r=>r.run()));}}
test('durable same-universe matrix uses existing admitted cache and exact readback without network calls',async()=>{
 const db=new DB(),database=matrix();assert.equal((await saveFuturesCoverageDatabase({db,database,now:T,db_admit:()=>({allowed:false})})).saved,false);
 const out=await saveFuturesCoverageDatabase({db,database,now:T,db_admit:()=>({allowed:true})});assert.equal(out.asset_source_cells,816);assert.equal(out.network_calls,0);const saved=await loadFuturesCoverageDatabase({db,now:T});assert.equal(validateFuturesCoverageDatabase(saved),true);assert.deepEqual(saved.assets,database.assets);
});
test('weekly refresh staging is durable and cannot replace the active matrix before completion',async()=>{
 const db=new DB(),active=matrix(),admit=()=>({allowed:true});await saveFuturesCoverageDatabase({db,database:active,now:T,db_admit:admit});
 const reset=resetFuturesCoverageForWeeklyRefresh(active,{now:T+WEEK});assert.equal(reset.reset,true);assert.equal(reset.database.refresh_from_updated_ts,active.updated_ts);
 const staged=await saveFuturesCoverageRefreshDatabase({db,database:reset.database,now:T+WEEK,db_admit:admit});assert.equal(staged.status,'DURABLE_WEEKLY_REFRESH_STAGING_SAVED');
 const activeRead=await loadFuturesCoverageDatabase({db,now:T+WEEK}),pending=await loadFuturesCoverageRefreshDatabase({db,now:T+WEEK});
 assert.equal(activeRead.source_checks_complete,false);assert.equal(activeRead.assets[0].source_checks.HYPERLIQUID_NATIVE.status,'UNVERIFIED');
 assert.equal(pending.refresh_from_updated_ts,active.updated_ts);assert.deepEqual(activeRead.assets,active.assets);
});
