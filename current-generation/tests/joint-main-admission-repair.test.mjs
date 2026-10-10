import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {auditCandidateBlocks,capabilityCheckedNoExactRoute,sourceWasActuallyChecked} from '../files/src/candidate-evidence-v2-runtime.mjs';

const runtimeRoot=process.env.REPORT2_JOINT_REPAIR_RUNTIME_ROOT?path.resolve(process.env.REPORT2_JOINT_REPAIR_RUNTIME_ROOT):null;
const runtimeImport=file=>import(pathToFileURL(path.join(runtimeRoot,'src',file)).href);
const runtime=runtimeRoot?await runtimeImport('canonical-runtime-adapter.mjs'):null;
const futureMaps=runtimeRoot?await runtimeImport('future-liquidation-map-source.mjs'):null;
const core=runtimeRoot?await runtimeImport('liquidation-extension/core.mjs'):null;

const T=Date.parse('2026-10-04T23:30:00Z'),contract='DOGE-USDT';
const identity={contract,asset_identity:{chain:'dogecoin',asset_kind:'NATIVE',native_asset_id:'dogecoin:mainnet',contract_or_mint:null},identity_method:'HTX_OFFICIAL_NATIVE_CURRENCY_NETWORK',now:T};
const noRoute=(source,reason='NO_CONFIGURED_EXACT_ROUTE')=>capabilityCheckedNoExactRoute(identity,source,reason);

test('exact HTX native identity can close a capability check without inventing a fact, zero or green result',()=>{
 const checked=noRoute('CHAIN_SUPPLY');
 assert.equal(sourceWasActuallyChecked(checked),false);
 assert.equal(checked.network_calls,0);assert.deepEqual(checked.evidence,[]);
 assert.equal(checked.decision_effect,'MISSING_FACT_NO_ZERO_NO_GREEN');
 assert.equal(sourceWasActuallyChecked({...checked,exact_identity:null}),false);
 assert.equal(sourceWasActuallyChecked({...checked,capability_registry_complete:false}),false);
});

test('versioned exact token binding can close missing routes while preserving missing-fact semantics',()=>{
 const token={contract:'QNT-USDT',asset_identity:{chain:'ethereum',contract_or_mint:'0x4a220e6096b25eadb88358cb44068a3248254675'},identity_method:'VERSIONED_EXPLORER_EXACT_TOKEN_BINDING',now:T};
 const checked=capabilityCheckedNoExactRoute(token,'OFFICIAL_TOKEN_SCHEDULE','NO_EXACT_STRUCTURED_TOKEN_SCHEDULE_ROUTE_IN_REGISTRY');
 assert.equal(sourceWasActuallyChecked(checked),false);assert.equal(checked.exact_identity.contract,'QNT-USDT');
 assert.equal(checked.decision_effect,'MISSING_FACT_NO_ZERO_NO_GREEN');assert.deepEqual(checked.evidence,[]);
});

test('an unattempted exact token primary cannot masquerade as a completed Nansen capability absence',()=>{
 const source=fs.readFileSync(new URL('../files/src/candidate-evidence-v2-runtime.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/NO_EXACT_TOKEN_FLOW_ROUTE_IN_CONFIGURED_PROVIDER_CAPABILITY/);
 assert.match(source,/resolveNansenFlowPrimary\(supplementalSources\.NANSEN_FLOWS,params\)/);
});

test('native assets account for unavailable exact routes while all useful market blocks remain independently required',()=>{
 const sources={
  OFFICIAL_TOKEN_SCHEDULE:noRoute('OFFICIAL_TOKEN_SCHEDULE'),CHAIN_SUPPLY:noRoute('CHAIN_SUPPLY'),CHAIN_EVENTS:noRoute('CHAIN_EVENTS'),NANSEN_FLOWS:noRoute('NANSEN_FLOWS'),BLUESKY_PUBLIC:noRoute('BLUESKY_PUBLIC'),OFFICIAL_EVENTS:noRoute('OFFICIAL_EVENTS'),
  HTX_PUBLIC_RISK:{status:'CLOSED',network_calls:1},HTX_LARGE_TRADES:{status:'CLOSED_BOUNDED_SAMPLE',network_calls:1},
  PRIMARY_TECHNICAL_CONTEXT:{status:'CHECKED_PRIMARY_TECHNICAL_CONTEXT',check_completed:true},PRIMARY_EXECUTION_STRESS:{status:'CHECKED_HTX_ORDERBOOK_STRESS',check_completed:true},PRIMARY_EXECUTION_COST:{status:'CHECKED_HTX_EXECUTION_COST',check_completed:true},
  DERIBIT_ALT_OPTIONS:{status:'NOT_APPLICABLE',network_calls:1},COINGECKO_SECTOR:noRoute('COINGECKO_SECTOR'),
 };
 const result=auditCandidateBlocks({sources,strict_fresh:true,decision_ts:T});
 assert.equal(result.status,'PARTIAL_BLOCK_CHECK');assert.equal(result.checked_block_count,7);
 for(const block of ['N03','N04','N05','N06','N07','N15']){
  assert.equal(result.blocks[block].status,'NOT_CHECKED');
  assert.equal(result.blocks[block].usable_facts,0);
 }
});

function bundle({admission,run_id='R'}={}){
 return runtime.buildRuntimeCanonicalBundle({contract,run_id,snapshot_id:'S',observed_ts:T,discovery_row:{contract,current_price:100,rolling_24h_change_pct:2,source_ts:T},publication_shadow:{entry_signal:{state:'REJECTED',direction:null}},liquidation_intelligence:{provider:'Bykaranteli',provider_current_price:100,projected_map_status:'CLOSED_SHADOW',projected_clusters:[{level_price:110,source:'Bykaranteli',provider:'Bykaranteli',source_ts:T,native_reference_price:100,side:'SHORT',notional_usd:1_000_000,status:'CLOSED'}],realized:{provider:[]}},internal_market_context:{liquidation_coverage_admission:admission,cross_exchange_risk:{future_provider_models:{status:'CLOSED',source:'CoinLobster',source_ts:T,reference_price:100,levels:[{price:90,side:'LONG',notional_usd:10,source_ts:T}]}}}}).canonical.liquidations;
}

test('canonical future levels obey the durable per-asset source allowlist',{skip:!runtimeRoot},()=>{
 const uncovered=bundle({admission:{status:'NO_VERIFIED_REAL_LEVEL_SOURCE',eligible:false,source_ids:[]}});
 assert.equal(uncovered.provider_zone_count,0);assert.equal(uncovered.calculated_zone_count,0);
 assert.equal(uncovered.future_source_status.coverage_admission.status,'NO_VERIFIED_REAL_LEVEL_SOURCE');
 const onlyHyper=bundle({admission:{status:'COVERED_REAL_NUMERIC_FUTURE_LEVELS',eligible:true,contract,source_ids:['HYPERLIQUID_NATIVE']}});
 assert.equal(onlyHyper.provider_zone_count,0);assert.equal(onlyHyper.calculated_zone_count,0);
 assert.equal(onlyHyper.all_zones.some(row=>row.estimated||/Bykaranteli|CoinLobster/i.test(row.source)),false);
});

test('an admitted native source can pass real prices while provider estimates remain excluded',{skip:!runtimeRoot},()=>{
 const receipt=core.seal({provider:'Hyperliquid official',venue:'Hyperliquid',native_symbol:'DOGE',run_id:'NATIVE',snapshot_id:'S',source_ts:T,status:'CLOSED',usable_for_context:true,evidence_class:'NATIVE_ACCOUNT_LIQUIDATION_PRICES',source_clock_closed:true,coverage:'RETURNED_NATIVE_POSITIONS_ONLY',zones:[{native_price:110,liquidated_side:'SHORT',notional:1000,notional_unit:'USDC',source_ts:T,native_reference_price:100,price_quote:'USDC',price_semantics:'EXCHANGE_ACCOUNT_LIQUIDATION_PRICE'}]});
 assert.equal(futureMaps.captureNativeFutureMap(receipt,{contract,run_id:'NATIVE',price_quote:'USDC'}),true);
 const result=bundle({run_id:'NATIVE',admission:{status:'COVERED_REAL_NUMERIC_FUTURE_LEVELS',eligible:true,contract,source_ids:['HYPERLIQUID_NATIVE']}});
 assert.equal(result.provider_zone_count,1);assert.equal(result.above[0].kind,'NATIVE_FUTURE_LEVEL');assert.equal(result.above[0].estimated,false);assert.equal(result.calculated_zone_count,0);
});

test('stage0 persists only classified crypto futures and retains exclusions and unknowns in an explicit audit',()=>{
 const source=fs.readFileSync(new URL('../files/src/worker.js',import.meta.url),'utf8');
 assert.match(source,/const contracts = allContracts\.filter/);
 assert.match(source,/classification === "CRYPTO_CONFIRMED"/);
 assert.match(source,/excluded_non_crypto_contracts:\s*\n\s*excludedNonCryptoContracts/);
 assert.match(source,/unknown_fail_closed_contracts:\s*\n\s*unknownScopeContracts/);
 assert.match(source,/lost_contracts:/);
 assert.match(source,/contractsR\.ok &&\s*\n\s*instrumentScopeUnknown === 0 &&\s*\n\s*universeTotal > 0/);
});
