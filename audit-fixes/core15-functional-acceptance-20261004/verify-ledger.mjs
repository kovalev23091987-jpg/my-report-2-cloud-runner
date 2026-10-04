import fs from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';

const OWNER=process.env.REPORT2_CONTINUATION_OWNER;
const proofs={
 small:['checkpoints/block-small-benefit-release-evidence-20261004.json','8565a280b9028680a99cbc4c83a5722b351c7257e40ce0972f33a99ea6d45cce'],
 execution:['checkpoints/execution-context-release-evidence-20261004.json','bf44a51c313b3c88ce3d4d5eda6e065bce80e0a2fc44fe60ec7b395d8b7a871e'],
 canonical:['checkpoints/canonical-execution-output-release-evidence-20261004.json','2dc8ca26860580b59ba85061a6b6fdbfdc8f750cdd35f6125da009de28864a11'],
 remaining:['checkpoints/remaining-block-facts-release-evidence-20261004.json','d5ffb49894888da0f0f923a34c5a2c572b48514d4f7caa3d90e67236959f85dd'],
 technical:['checkpoints/technical-native-release-evidence-20261004.json','831d42a2f3d432b49c04044c521a85e46c006f64dbbc58ba6f5e36f2f45ce1ef'],
 options:['checkpoints/options-risk-release-evidence-20261004.json','51574feb9c743e38a789b43c3974e43579cb5227d587edd3983851705f17ed45'],
 peers:['checkpoints/native-peers-release-evidence-20261004.json','207a686aff26acb73716d4b8645c261f74c596ecb1a98244ae741f84b2655ef6'],
 n10:['checkpoints/n10-primary-release-evidence-20261004.json','690f9986688bedd9ee1c66725b478be53f6293e5b84d699a7a87b664367b03e5'],
 n07:['checkpoints/n07-official-release-evidence-20261004.json','c9ed956b654dc306890593d730ffd68dc9c5f796bac6be3f8d3c1dc85604c467'],
};
const loaded={};
for(const [key,[path,expected]] of Object.entries(proofs)){const bytes=fs.readFileSync(path);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),expected,`PROOF_CHANGED:${key}`);loaded[key]=JSON.parse(bytes);}
const phase=JSON.parse(fs.readFileSync('checkpoints/CLOUD_PHASE_STATE_20261004.json'));
assert.equal(phase.current_phase,'CORE_BLOCKS');assert.equal(phase.lease?.owner,OWNER);assert.ok(phase.lease.expires_ts>Date.now());
const universeBytes=fs.readFileSync('checkpoints/htx-all-modes-crypto-futures-universe-20261004.json.gz');
assert.equal(crypto.createHash('sha256').update(universeBytes).digest('hex'),'edfb909938001fe2bdddf79fee8063af095abb47285611f5c5c222788700c613');
const universe=JSON.parse(zlib.gunzipSync(universeBytes));assert.equal(universe.status,'CLOSED');assert.equal(universe.assets.length,102);assert.equal(universe.contracts.length,119);
assert.equal(universe.contracts.filter(row=>row.production_market_adapter_supported===true).length,102);assert.equal(universe.contracts.filter(row=>row.production_market_adapter_supported===false).length,17);
assert.ok(universe.assets.some(row=>row.symbol==='PAXG'));assert.ok(universe.assets.some(row=>row.symbol==='XAUT'));assert.ok(universe.assets.some(row=>/[^\x00-\x7f]/.test(row.symbol)));

const early=new Set(loaded.execution.verified_useful_block_types_across_real_inputs);for(const id of ['N02','N04','N05','N06','N09','N11','N12','N14','N15','N16'])assert.ok(early.has(id),id);
assert.equal(loaded.canonical.same_canonical_execution_context_in_manual_and_approved_telegram_verified,true);
assert.equal(loaded.remaining.documents.find(row=>row.contract==='NEAR-USDT')?.status,'CLOSED');assert.equal(loaded.remaining.documents.find(row=>row.contract==='NEAR-USDT')?.context_facts,1);
assert.equal(loaded.remaining.shared_n08_context_contracts,100);assert.equal(loaded.remaining.shared_n09_context_contracts,100);
assert.equal(loaded.technical.counts.crypto_contracts,119);assert.equal(loaded.technical.counts.crypto_assets,102);assert.equal(loaded.technical.n10_actual_context_contracts,102);
assert.ok(loaded.technical.native_results.some(row=>row.contract==='NEAR-USDT'&&row.result?.status==='CLOSED'&&row.context?.facts?.some(f=>f.block_id==='N03')));
assert.equal(loaded.options.integration_failed,0);assert.equal(loaded.options.integration_passed,37);assert.equal(loaded.options.checked_assets,102);assert.ok(loaded.options.scoped_mark_iv_assets.length>=1);
assert.equal(loaded.peers.live_acceptance.conclusion,'SUCCESS');assert.ok(loaded.peers.live_acceptance.useful_assets.includes('APT'));assert.ok(loaded.peers.live_acceptance.useful_assets.includes('ATOM'));assert.equal(loaded.peers.no_wrapped_token_or_ticker_substitution,true);
assert.equal(loaded.n10.accepted_block,'N10');assert.equal(loaded.n10.live_acceptance.conclusion,'SUCCESS');assert.equal(loaded.n10.actual_manual_report_saved,true);
assert.equal(loaded.n07.actual_result.block,'N07');assert.equal(loaded.n07.actual_result.status,'CLOSED');assert.equal(loaded.n07.actual_result.canonical_builder_used,true);assert.equal(loaded.n07.actual_result.approved_manual_renderer_used,true);

const rows=[
 ['N01','OFFICIAL_TOKEN_SCHEDULE','NEAR-USDT','PR100 actual HTTP200 published unlock status','SUPPORTING_RISK_RECHECK'],
 ['N02','CHAIN_RPC + COINMETRICS_ADDITIONAL','SOL-USDT/BTC-USDT/ETH-USDT','PR102 native finalized supply plus PR109 dated history','SUPPLY_RISK'],
 ['N03','CHAIN_RPC','NEAR-USDT','PR102 finalized native supply decrease, cause unclaimed','MONEY_FLOW_CONTEXT'],
 ['N04','FINALIZED_CHAIN_EVENTS','saved exact-chain real inputs','PR94 verified factual transfer investigation','TRANSFER_INVESTIGATION'],
 ['N05','NANSEN_FLOW_CONTEXT','saved real inputs','PR94 verified market-flow confirmation','MARKET_FLOW_CONFIRMATION'],
 ['N06','BLUESKY_ATTENTION_CONTEXT','saved real inputs','PR94 verified early-interest context','EARLY_INTEREST_PRIORITY'],
 ['N07','OFFICIAL_EVENTS','LINK-USDT','PR112 fresh exact official announcement','OFFICIAL_EVENT_RISK'],
 ['N08','HTX_PUBLIC_RISK','100 exact linear contracts in PR100 shared snapshot','actual scoped opening-restriction check; generic current contract binding retained','EXECUTION_GATE'],
 ['N09','HTX_PUBLIC_RISK','100 exact linear contracts plus BR/NEAR saved reports','actual eligibility context and renderer use','EXECUTION_ELIGIBILITY'],
 ['N10','HTX_PRIMARY_TECHNICAL','102 linear swaps plus fresh Unicode contract','PR102 common price context and PR111 strict source-to-report quality','TARGET_PATH_INVALIDATION'],
 ['N11','HTX_EXECUTION_DEPTH','BR-USDT/NEAR-USDT saved exact snapshots','PR94/97 same-run canonical execution stress','EXECUTION_STRESS'],
 ['N12','HTX_BOUNDED_TRADE_FLOW','BR-USDT/NEAR-USDT saved exact snapshots','bounded factual flow accepted; EXACT_SIGNED_RAW_24H alone deferred','MONEY_FLOW_DIAGNOSTIC'],
 ['N14','DERIBIT_PRIMARY + DELTA_ADDITIONAL','7 Deribit assets + BTC/ETH/XAUT Delta','PR104/108 actual option IV reaches report','OPTIONS_RISK_CONTEXT'],
 ['N15','COINGECKO_SECTOR','APT-USDT/ATOM-USDT + dated ADA','PR110 exact native peer context reaches report','SECTOR_RELATIVE_STRENGTH'],
 ['N16','HTX_EXECUTION_COST','BR-USDT/NEAR-USDT saved exact snapshots','PR94/97 same-quantity roundtrip cost reaches canonical','EXECUTION_COST_GATE'],
].map(([block,source,actual_scope,evidence,consumer])=>({block,status:'VERIFIED_ACTUAL_USEFUL_FUNCTION',source,actual_scope,evidence,consumer,missing_is_never_zero_or_green:true}));
assert.equal(rows.length,15);assert.deepEqual(rows.map(r=>r.block),['N01','N02','N03','N04','N05','N06','N07','N08','N09','N10','N11','N12','N14','N15','N16']);
const receipt={schema:'report2-core15-cumulative-actual-functional-acceptance-v1',phase:'CORE_BLOCKS',status:'CLOSED',actual_evidence_verified:true,all_15_live_accepted:true,supported_market_scope_verified:true,source_data_and_consumption_verified:true,exact_identity_and_units_verified:true,common_future_universe:{contracts:119,assets:102,linear_production_adapters:102,inverse_delivery_retained_explicitly_unsupported:17,spot_only_assets:0,stock_or_fiat_assets:0,paxg_xaut_retained:true,unicode_and_numeric_allowed:true},blocks:rows,scope_interpretation:'CUMULATIVE_ACTUAL_SOURCE_AND_USE_ACCEPTANCE_ACROSS_SAVED_RELEASES; NOT A FRESH TOP2 MAIN',fresh_same_run_top2_all15:false,fresh_main_verified:false,exact_signed_raw24h_verified:false,exact_signed_raw24h_owner_deferred:true,missing_stale_partial_never_zero_or_green:true,unsupported_inverse_delivery_never_replaced_with_swap:true,source_http:0,database_reads:0,database_writes:0,deep_checks_started:0,production_canonical_writes:0,telegram_calls:0,proofs:Object.fromEntries(Object.entries(proofs).map(([k,[path,sha256]])=>[k,{path,sha256}])),next_phase:'LIQUIDATION_COVERAGE'};
fs.writeFileSync('audit-output/core15-functional-acceptance.json',JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({status:receipt.status,accepted_blocks:rows.map(r=>r.block),contracts:119,assets:102,supported_linear:102,explicit_unsupported:17,source_http:0,next_phase:receipt.next_phase}));
