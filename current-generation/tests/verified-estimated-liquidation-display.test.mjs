import {resolveGTradeCryptoMarket} from '../files/src/liquidation-extension/gtrade.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeLiquidationDisplayZones,displayFutureLiquidations} from '../files/src/canonical-display.mjs';
import {runtimeLiquidationCollectionAdmission,createFuturesCoverageDatabase,applyFuturesCoverageCheck,summarizeFuturesCoverage} from '../files/src/liquidation-futures-coverage.mjs';
import {createScopedProviderAcquisition,bindScopedProviderAcquisition} from '../files/src/liquidation-extension/scoped-provider-runtime-bridge.mjs';
import {createGTradeAcquisition,bindGTradeAcquisition} from '../files/src/liquidation-extension/gtrade-runtime-bridge.mjs';
import {seal} from '../files/src/liquidation-extension/core.mjs';
import {capturedNativeFutureMaps} from '../files/src/future-liquidation-map-source.mjs';
import {nativeLiquidationLines,validateNativeLiquidationContext} from '../files/src/native-liquidation-guard.mjs';
const T=1800000000000;
const row=(price,extra={})=>({price,side:price>100?'ABOVE':'BELOW',distance_pct:price-100,price_quote:'USD',distance_reference_basis:'ORIGINAL_SOURCE_REFERENCE_SAME_QUOTE',native_symbol:'SOL',source:'one',notional:100,notional_unit:'USD',source_ts:T,...extra});
test('5% relative-price merge shows original farthest price, distance and amount without mutating raw map',()=>{
 const raw=[row(110,{notional:10000,source:'HL'}),row(115.5,{notional:5,source:'GT',estimated:true})],before=JSON.stringify(raw);
 const result=mergeLiquidationDisplayZones(raw,'ABOVE');assert.equal(result.length,1);assert.equal(result[0].price,115.5);assert.equal(result[0].distance_pct,15.5);assert.equal(result[0].notional,5);assert.equal(result[0].source_ts,T);assert.equal(result[0].display_components.length,2);assert.equal(JSON.stringify(raw),before);
 const out=displayFutureLiquidations({all_zones:raw},{compact:false}).join(' ');assert.match(out,/расчётный уровень ≈115,5 USD/);assert.doesNotMatch(out,/110–|112,75/);assert.match(out,/показан дальний/);
});
test('merge below selects lower original price; no transitive chaining, side, quote, asset or source-age mixing',()=>{
 assert.equal(mergeLiquidationDisplayZones([row(90),row(86)],'BELOW')[0].price,86);
 assert.equal(mergeLiquidationDisplayZones([row(108),row(104),row(100.01)],'ABOVE').length,2);
 assert.equal(mergeLiquidationDisplayZones([row(110),row(115.50001)],'ABOVE').length,2);
 for(const extra of [{price_quote:'USDC'},{native_symbol:'OTHER'},{source_clock_closed:false},{distance_reference_basis:'HTX_CURRENT_SAME_QUOTE'},{distance_pct:null}])assert.equal(mergeLiquidationDisplayZones([row(110),row(111,extra)],'ABOVE').length,2);
 assert.equal(mergeLiquidationDisplayZones([row(110),row(90)],'ABOVE').length,1);
});
test('additional source collection admission does not inflate accepted coverage or independent votes',()=>{
 const universe={status:'CLOSED',observed_ts:T-1,contracts:[{family:'linear_swap',contract_code:'SOL-USDT',asset_symbol:'SOL'}],assets:[{symbol:'SOL',asset_analysis_contract:'SOL-USDT',contracts:[{family:'linear_swap',contract_code:'SOL-USDT'}]}]};
 let db=createFuturesCoverageDatabase({universe,universe_sha256:'a'.repeat(64),now:T});
 db=applyFuturesCoverageCheck(db,{contract:'SOL-USDT',source_id:'GTRADE_NATIVE',status:'NO_REAL_NUMERIC_LEVELS',source_proof_sha256:'b'.repeat(64),now:T});
 const a=runtimeLiquidationCollectionAdmission(db,{contract:'SOL-USDT',now:T});assert.equal(a.eligible,true);assert.deepEqual(a.source_ids,['GTRADE_NATIVE']);assert.deepEqual(a.proven_level_source_ids,[]);assert.deepEqual(a.independent_upstreams,[]);assert.equal(a.fresh_live_levels_confirmed,false);assert.equal(summarizeFuturesCoverage(db,{now:T}).covered_assets,0);
 assert.equal(runtimeLiquidationCollectionAdmission(db,{contract:'STOCK-USDT',now:T}).eligible,false);
 assert.equal(runtimeLiquidationCollectionAdmission(db,{contract:'SOL-USDT',now:T+7*86400000}).eligible,false);
});
const estimate=()=>seal({provider:'gTrade official SDK',venue:'gTrade-Arbitrum',native_symbol:'SOL',run_id:'R',snapshot_id:'A',source_ts:T,source_clock_closed:false,usable_for_context:true,evidence_class:'NATIVE_POSITION_FEE_AWARE_ESTIMATES',sdk_version:'1.8.10',coverage:'BACKEND_OPEN_MARKET_TRADES_NON_ATOMIC',upstream_groups:['GTRADE_ARBITRUM'],zones:[{native_price:110,native_reference_price:100,distance_pct:10,notional:100,notional_unit:'USD',liquidated_side:'SHORT',source_ts:T,price_semantics:'OFFICIAL_SDK_ESTIMATE_INDEX_TRIGGER'}]});
test('gTrade variable clock cannot become position snapshot clock; receipt-only estimate is labelled and never scored as a fresh map',()=>{
 const receipt=estimate(),acq=createGTradeAcquisition({contract:'SOL-USDT',native_symbol:'SOL',run_id:'R',acquisition_id:'A',collection_started_ts:T,collection_completed_ts:T,normalized_receipt:receipt,transport_receipts:[1,2,3].map(n=>({http_status:200,received_ts:T,sha256:String(n).repeat(64)}))});
 assert.equal(acq.schema,'SCOPED_PROVIDER_LIQUIDATION_ACQUISITION_V1');
 const context=bindGTradeAcquisition(acq,{contract:'SOL-USDT',run_id:'R',snapshot_id:'S',observed_ts:T,direction:null});
 assert.equal(context.status,'USABLE_RECEIPT_ONLY_CONTEXT');assert.equal(context.source_ts,null);assert.equal(context.above[0].source_ts,null);assert.equal(context.entry_eligible,false);assert.equal(context.sdk_version,'1.8.10');
 const map=capturedNativeFutureMaps({contract:'SOL-USDT',run_id:'R'}).find(m=>m.provider==='gTrade official SDK');assert.equal(map.source_ts,null);assert.equal(map.zones[0].source_ts,null);
 const liq={independent_extensions:[context]};assert.match(nativeLiquidationLines(liq).join(' '),/время исходного состояния неизвестно/);assert.match(nativeLiquidationLines(liq).join(' '),/расчётный уровень ≈110 USD/);
 assert.equal(validateNativeLiquidationContext({run_id:'R',snapshot_id:'S',observed_ts:T,direction:null,metadata:{contract:'SOL-USDT'},liquidations:liq}).ok,true);
 assert.equal(bindScopedProviderAcquisition({...acq,source_ts:T},{contract:'SOL-USDT',run_id:'R',snapshot_id:'S',observed_ts:T}).status,'NOT_CLOSED');
});

test('gTrade exact crypto routing rejects ticker collisions with stocks and ambiguous native markets',()=>{
 const groups=[{name:'stocks-1'},{name:'crypto'},{name:'altcoins'}];
 const pairs=[{from:'SOL',to:'USD',groupIndex:'0'},{from:'SOL',to:'USD',groupIndex:'1'}];
 assert.equal(resolveGTradeCryptoMarket({groups,pairs},'SOL').pair_index,1);
 assert.equal(resolveGTradeCryptoMarket({groups,pairs:pairs.slice(0,1)},'SOL').supported,false);
 assert.equal(resolveGTradeCryptoMarket({groups,pairs:[...pairs,{from:'SOL',to:'USD',groupIndex:'2'}]},'SOL').supported,false);
 assert.equal(resolveGTradeCryptoMarket({groups,pairs},'TEST').status,'GTRADE_SYMBOL_UNSUPPORTED');
});
