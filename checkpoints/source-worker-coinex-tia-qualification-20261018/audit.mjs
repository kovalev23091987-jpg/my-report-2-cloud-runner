import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const dir=dirname(fileURLToPath(import.meta.url)),root=resolve(dir,'../..');
const plan=JSON.parse(readFileSync(resolve(dir,'qualification-request.json'))),doc=JSON.parse(readFileSync(resolve(dir,'native-denom-document.json')));
const sha=b=>createHash('sha256').update(b).digest('hex');
const read=p=>readFileSync(resolve(root,p));
const source=p=>execFileSync('git',['show',plan.working_base+':'+p],{cwd:root,maxBuffer:2*1024*1024});
const bind=p=>({path:p,bytes:read(p).length,sha256:sha(read(p))});
const gzip=p=>{const compressed=read(p),raw=gunzipSync(compressed);return{binding:{...bind(p),decoded_sha256:sha(raw)},value:JSON.parse(raw)};};

const assets=gzip(plan.reused_proofs.source_assets),summary=JSON.parse(read(plan.reused_proofs.source_summary));
assert.equal(assets.binding.sha256,'253b57dc7405555ac91580c89031d93e5e53518fa4d8698a155c78d87a373cbc');
assert.equal(assets.binding.decoded_sha256,'3179b70a3f6ad960e028b66f2f6f3365648633e9b5bbed109b83df59ebfa5604');
const receipt=summary.sources.find(r=>r.name==='COINEX-EXACT-ASSETS');assert.equal(receipt.body_sha256,assets.binding.decoded_sha256);assert.equal(receipt.received_ts,1791650973347);
assert.equal(assets.value.code,0);assert.ok(Array.isArray(assets.value.data));
const exactRows=assets.value.data.filter(r=>r.short_name==='TIA');assert.equal(exactRows.length,1);const row=exactRows[0];
assert.equal(row.full_name,'Celestia');assert.equal(new URL(row.website_url).origin,'https://celestia.org');
const native=row.chain_info.filter(r=>r.chain_name==='CELESTIA'&&r.identity==='utia');assert.equal(native.length,1);
assert.equal(native[0].explorer_url,'');assert.ok(!/^0x[0-9a-f]{40}$/i.test(native[0].identity));
assert.equal(doc.exact_primary_claim.native_staking_denom,'utia');assert.equal(doc.exact_primary_claim.native_TIA_per_utia_denominator,1000000);
assert.equal(doc.source_url,'https://docs.celestia.org/learn/TIA/overview/');assert.equal(doc.content_sha256,'9b63cb5c6b5558fce0c787284fe78ea78a04b684cdd33562316ce801b315cffc');

const htx=gzip(plan.reused_proofs.source_HTX_native);assert.equal(htx.binding.sha256,'f662bdb1562bce5c19a3b7df96978b2fe27264ff271121d12d0f44b5ee94497c');
const htxRows=htx.value.data.filter(r=>r.currency==='tia');assert.equal(htxRows.length,1);
const htxNative=htxRows[0].chains.filter(r=>r.chain==='tia'&&r.chainType===0&&!r.contractAddress);assert.equal(htxNative.length,1);
const nativePolicyPath='current-generation/files/src/coingecko-sector-evidence.mjs',nativePolicy=source(nativePolicyPath).toString();
assert.ok(nativePolicy.includes("TIA:{chain:'celestia',platform:null,coin_id:'celestia',provider_homepages:['celestia.org']}"));
const spot=gzip(plan.reused_proofs.source_spot_market),spotRow=spot.value.data.filter(r=>r.market==='TIAUSDT');assert.equal(spotRow.length,1);
assert.equal(spotRow[0].base_ccy,'TIA');assert.equal(spotRow[0].quote_ccy,'USDT');
const spotReceipt=summary.sources.find(r=>r.name==='COINEX-SPOT-MARKETS');assert.equal(spotReceipt.body_sha256,spot.binding.decoded_sha256);

const codePaths=['current-generation/files/src/evidence-source-adapters.mjs','current-generation/files/src/external-n05-flow-collector.mjs','tools/read-active-source-budgets-20261014.mjs'];
const registry=codePaths.map(path=>({path,commit:plan.working_base,sha256:sha(source(path)),CoinEx_literal_present:/coinex/i.test(source(path).toString())}));
assert.ok(registry.every(r=>r.CoinEx_literal_present===false));
const readerSource=source(codePaths[2]).toString();
assert.ok(readerSource.includes('SELECT source,attempts,updated_at FROM report2_evidence_source_daily WHERE day_utc=?1 ORDER BY source LIMIT 128'));
assert.ok(readerSource.includes('SOURCE_POLICIES[r.source]?.daily_cap??null'));
assert.equal(plan.gate0.source_pool_id,null);assert.equal(plan.gate0.native_R_bound,null);assert.equal(plan.gate0.native_W_bound,null);assert.equal(plan.gate0.actual_admission,false);
const priorSpec=JSON.parse(read(plan.reused_proofs.prior459_spec)),priorPlan=JSON.parse(read(plan.reused_proofs.prior459_calculated_plan));
assert.equal(priorPlan.default_first_packet_max_HTTP,5);
const priorCoinex=priorSpec.provider_specs.find(r=>r.provider==='COINEX');assert.equal(priorCoinex.futures_native_baseline.params_template.price_type,'latest_price');assert.equal(priorCoinex.futures_native_baseline.required_closed_bars,21);
// Request construction only. No fetch, database, dispatch, credentials or
// source-policy import is executed by this offline audit.
const E1=Math.floor(plan.planning_example.cutoff_ts/60000)*60000,E15=Math.floor(E1/900000)*900000;
const numeric=[...plan.sequential_requests].map(r=>({...r,params:{...r.params}}));
Object.assign(numeric[2].params,{start_time:E15-21*900000,end_time:E15-1});
Object.assign(numeric[3].params,{start_time:Math.min(E1-900000,E15-900000),end_time:E1-1});
for(const r of numeric){const url=new URL(r.url);for(const[k,v]of Object.entries(r.params))url.searchParams.set(k,String(v));r.controlled_example_url=url.href;r.example_is_not_a_current_source_call=true;assert.equal(r.HTTP_cap,1);}
assert.equal(numeric.reduce((n,r)=>n+r.HTTP_cap,0),5);assert.equal(numeric[2].params.end_time+1-numeric[2].params.start_time,21*900000);
const minutes=(numeric[3].params.end_time+1-numeric[3].params.start_time)/60000;assert.ok(minutes>=15&&minutes<=29);assert.ok(minutes<40);
assert.equal(numeric[4].params.last_id,undefined);assert.equal(plan.cost.retry,0);assert.equal(plan.cost.pagination,0);assert.equal(plan.cost.spot,0);assert.equal(plan.cost.OI,0);assert.equal(plan.cost.WS_upgrades_or_connections,0);
assert.equal(plan.effects.market_HTTP,0);assert.equal(plan.effects.native_SQL,0);

const output={schema:'COINEX_TIA_NATIVE_REFERENCE_AND_EXACT_REQUEST_BOUNDARY_AUDIT_V1',working_base:plan.working_base,source_of_truth_main:plan.source_of_truth_main_at_acquisition,
 original_assets:{...assets.binding,cloud_run:summary.run,head:summary.head,raw_receipt:receipt,selected_row:row,selected_row_sha256:sha(Buffer.from(JSON.stringify(row))),
  original_transport_received_ts:receipt.received_ts,provider_event_ts:null,current_market_first_known_ts:null,
  classification:'HISTORICAL_DECLARED_NATIVE_NAMESPACE_COMPATIBLE_WITH_APPROVED_TIA_REFERENCE',
  proof_basis:['Exact providerasset TIA+Celestia+officialdomain','Explicit native CELESTIA:utia declaration','Matching HTX nativeTIA policy/reference','Primary native denomination authority'],
  not_claimed:['Currentcache/futureslisting/price','Nativechain RPC/finality/genesis attestation','Derivativecontract quantity/epoch/multiplier','Actualsourceconnection or earlydetection'],
  old_transport_clock_not_relabelled_as_current_qualification:true},
 native_denomination:{reference:doc,identity_kind:'NATIVE_BANK_DENOMINATION',micro_unit_denominator:1000000,token_contract_address:null,
  trading_API_volume_scale:null,derivative_multiplier:null,reason:'A bank denomination identifies an asset namespace; no automatic conversion of exchange contract/amount/volume/value fields follows.'},
 HTX_reference:{...htx.binding,currency:htxRows[0].currency,native_chain:htxNative[0],original_transport_received_ts:null,
  current_policy:{path:nativePolicyPath,commit:plan.working_base,sha256:sha(source(nativePolicyPath)),chain:'celestia',provider_homepages:['celestia.org']},
  no_replay_of_accepted_HTX_cache_suite:true},
 spot_reference:{...spot.binding,raw_receipt:spotReceipt,selected_row:spotRow[0],scope:'Historical spot row; does not qualify future market availability/type/epoch.'},
 current_registry_audit:{explicit_code_mentions_only:registry,not_a_deployed_or_DB_registry_inventory:true,
  budget_reader_daily_query_scope:'ALL_CURRENT_UTC_DAY_ROWS_LIMIT128',CoinEx_daily_row_can_be_returned_without_literal_policy:true,unrecognized_source_policy_cap_remains_null:true,
  actual_new_source_pool_id:null,current_source_balance:null,legacy_source_id:plan.gate0.historical_source_id,
  absent_registry_or_row_is_not_zero_usage:true,coordinator_budget_reader_repair_is_not_live_source_admission:true,no_new_pool_alias_created:true},
 reused_plan:{spec:bind(plan.reused_proofs.prior459_spec),plan:bind(plan.reused_proofs.prior459_calculated_plan),accepted459_calculator_rerun:false,
  accepted489_analysis:plan.reused_proofs.accepted489_analysis_sha256,accepted489_commit:plan.reused_proofs.accepted489_commit},
 controlled_request_example:{kind:plan.planning_example.clock_kind,E1,E15,minute_union_rows:minutes,source_or_transport_timestamp:false,requests:numeric},
 staged_admission:{first_metadata_and_identity_HTTP_cap:2,remaining_numeric_HTTP_cap:3,conditional_total_HTTP_cap:5,actual_admission:false,
  identity_pending_after_market_metadata_not_automatic_denial:true,
  exact_instrument_or_identity_failure_stops_before_numeric:true,
  source_sql_r_w_and_partial_finalizer_bound:null,coordinator_must_resolve_before_calls:plan.gate0.requires,
  bounded_raw_qualification_not_automatic_volume_fact:true},
 internal_structure_boundaries:{native_price_structure:'21closed15m including20prior and chosen event, plus exact1min grid for event/sliding windows, when actually received/qualified.',
  raw_volume_strings:'Retain volume/value; unit/scale/contract conversion remainUNKNOWN until exact source evidence.',
  trade_scope:'One latest<=1000 page without historical pagination; no full historicalcandle taker side/CVD/absorption/manipulation.',
  maker_or_taker_side_semantics:'Source side literal retained; no unqualified intent/maker/taker inference.',
  no_fabricated_candle_or_zero_missing_volume:true},
 prospective_and_watch:plan.finality_and_consumers,remaining:plan.precise_remaining_gaps,
 effects:plan.effects,acceptance:{new_native_reference_field_understanding:true,exact_request_shape_prepared:true,current_CoinEx_market_coverage:false,
  current21closedbars_qualified:false,complete_historical_taker_window:false,native_cost_bound:false,source_admission:false,source_connected:false,production_change:false}};
writeFileSync(process.argv[2]||resolve(dir,'analysis.json'),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({status:'PASS',exact_saved_TIA_rows:1,native_reference:'CELESTIA:utia',trading_volume_scale:null,first_stage_HTTP_cap:2,conditional_all_HTTP_cap:5,minute_union_rows:minutes,actual_source_calls:0,current_futures_or_taker_coverage:false,native_R_W_bound:null,accepted_suites_rerun:0}));
