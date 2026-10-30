// Read committed originals and calculate a reviewable plan only.
// No fetch, SQL, production module import or runnable acquisition executor.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const dir='checkpoints/source-worker-coinex-bingx-fact-plan-20261018/',M=60000,Q=15*M;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=p=>fs.readFileSync(p),json=p=>JSON.parse(read(p));
const spec=json(dir+'plan-spec.json'),newDoc=json(dir+'new-document-receipt.json');
assert.equal(spec.state,'OFFLINE_PLAN_NOT_EXECUTION_READY');assert.equal(spec.effects.provider_market_HTTP,0);assert.equal(spec.effects.native_SQL,0);
assert.equal(spec.clock_and_window_contract.never_merge_different_window_claims,true);
assert.equal(spec.admission_and_cost.native_SQL_bound,null);assert.equal(spec.admission_and_cost.execution_allowed_until_native_bounds_qualified,false);
assert.equal(spec.admission_and_cost.core_max_HTTP_first_asset,Object.values(spec.admission_and_cost.core_attempts_first_asset).reduce((s,v)=>s+v,0));
assert.equal(spec.admission_and_cost.retries,0);assert.equal(spec.admission_and_cost.automatic_pagination,0);
assert.ok(spec.provider_specs.every(p=>p.optional_spot.nonblocking===true&&p.native_symbol_status==='LOOKUP_CANDIDATE_ONLY_NOT_VERIFIED_MARKET'));
assert.ok(spec.consumer_proposals.every(c=>(c.score??0)===0&&(c.direction??null)===null&&(c.entry??false)===false));
const generation=json('REPORT2_CURRENT_GENERATION.json');
const manifestPath=generation.current_crypto_futures_universe.manifest,manifestBytes=read(manifestPath);
assert.equal(sha(manifestBytes),generation.current_crypto_futures_universe.manifest_sha256);
const manifest=JSON.parse(gunzipSync(manifestBytes));
const archive='checkpoints/natural-full-recovery-and-statistics-20261018/native-39125232536-12135613441.zip';
assert.equal(sha(read(archive)),'3d265dbd713df7aee042393dad6126925e1b50fcb0e26f78a84b5c98eaf5ea79');
const member=execFileSync('unzip',['-p',archive,'report2-run-result.json'],{maxBuffer:16*1024*1024}),report=JSON.parse(member);
assert.equal(report.run_id,'1792324604859-1792324615501');
const expected={
 'TIA-USDT':{project_asset_id:'celestia:native:mainnet',E1:1792324680000,root:'celestia:native:mainnet|'},
 'APR-USDT':{project_asset_id:'ethereum:0x5a9610919f5e81183823a2be4bd1beb2b4da2a20',E1:1792324620000,root:'ethereum:0x5a9610919f5e81183823a2be4bd1beb2b4da2a20|'},
};
const assets=spec.priority_assets.map(target=>{
 const contract=target.htx_contract,base=contract.slice(0,-5),a=manifest.assets.find(r=>r.symbol===base),canonical=report.candidates.find(r=>r.contract===contract),ex=expected[contract];
 assert.equal(a.asset_analysis_contract,contract);
 const htx=manifest.contracts.find(r=>r.contract_code===contract&&r.family==='linear');
 assert.equal(htx.scope.eligible_for_crypto_discovery,true);assert.equal(htx.production_market_adapter_supported,true);
 const receipts=canonical.block_rendered_results.context_receipts;
 const identity=receipts.find(r=>r.block_id==='N15'&&r.physical_root_key.startsWith(ex.root));
 const path=receipts.find(r=>r.block_id==='N10'&&r.physical_root_key===`htx-futures:${contract}|${contract}:15m:${ex.E1}`);
 assert.ok(identity);assert.ok(path);assert.equal(path.source_ts,ex.E1);
 const E1=ex.E1,E15=Math.floor(E1/Q)*Q,pathStart=E1-Q,eventStart=E15-Q,baselineStart=E15-21*Q;
 assert.equal(E1%M,0);assert.equal(E15%Q,0);assert.notEqual(E1,E15);
 const nativeBars=Array.from({length:21},(_,i)=>({open_ts:baselineStart+i*Q,close_ts:baselineStart+(i+1)*Q,role:i===20?'EVENT':'PRECEDING_BASELINE'}));
 const event1m=Array.from({length:15},(_,i)=>eventStart+i*M),path1m=Array.from({length:15},(_,i)=>pathStart+i*M);
 const uniqueMinuteStarts=[...new Set([...event1m,...path1m])].sort((a,b)=>a-b);
 assert.equal(nativeBars.at(-1).close_ts,E15);assert.ok(uniqueMinuteStarts.length<=30);
 // Existing collection deadline5min + possible open/edge bars; this does not
 // qualify actual provider latency or change the existing deadline.
 const paddedNeed=uniqueMinuteStarts.length+5+2;assert.ok(paddedNeed<=40);
 return{contract,selection:target,approved_membership:{manifest:manifestPath,manifest_sha256:sha(manifestBytes),asset_analysis_contract:a.asset_analysis_contract,htx_family:htx.family,market_kind:htx.market_kind,quote:htx.price_quote,HTX_contract_size_provenance_only:htx.contract_size,new_venue_size:null,original_catalog_source_ts:htx.source_ts,original_catalog_observed_ts:htx.observed_ts,approved105_census_reexecuted:false},
  original_project_identity_witness:{project_asset_id:ex.project_asset_id,evidence_id:identity.evidence_id,physical_root_key:identity.physical_root_key,source_ts:identity.source_ts,observed_ts:identity.observed_ts,kind:'SAVED_VALIDATED_SOURCE_CONSUMER_RECEIPT_NOT_NEW_VENUE_BINDING'},
  original_snapshot:{head:report.head,run_id:canonical.run_id,snapshot_id:canonical.snapshot_id,publication_id:canonical.publication_id,observed_ts:canonical.observed_ts,canonical_state:canonical.canonical_state,original_N10_evidence_id:path.evidence_id},
  historical_window_example:{not_current:true,not_exante_source_detection_proof:true,E1_sliding_end:E1,sliding_path_start:pathStart,E15_native_end:E15,native_event_start:eventStart,native_baseline_start:baselineStart,sliding_end_differs_from_native_close:true,distinct_minute_starts_required:uniqueMinuteStarts,minimum_rows_for_both_windows:uniqueMinuteStarts.length,padded_rows_with_deadline_and_edges:paddedNeed,request_minute_limit:40,request_native15m_limit:24,retain_native_baseline_rows:20,retain_native_event_rows:1,native_21_bar_boundaries:nativeBars,retain_event_1m_rows:15,derived_event3m_rows:5,derived_event5m_rows:3,acquisition_or_source_clocks_refreshed:false},
  new_venue_bindings:spec.provider_specs.map(p=>({provider:p.provider,native_symbol_lookup_candidate:p.native_symbol_candidates[base],listing_status:null,exact_asset_identity_closed:false,market_type_confirmed:false,contract_size:null,source_clock:null,numeric_fact_count:0,consumer_use:false})),
  current_new_fact_qualification:false};
});
const prices=spec.provider_specs.map(p=>({provider:p.provider,independence_group:p.independence_group,first_TIA_futures_core_HTTP_ceiling:5,second_APR_increment_if_shared_metadata_exact_and_fresh:4,two_asset_futures_core_HTTP_ceiling:1+2*4,optional_timed_OI_HTTP_per_asset:p.provider==='BINGX'?1:0,optional_spot_first_asset_HTTP_ceiling:1+4,optional_spot_second_asset_increment:4,optional_spot_two_asset_HTTP_ceiling:1+2*4,identity_lookup_included_but_NOT_ready:true,actual_HTTP_executed:0,native_SQL_reservation:null,execution_authorized:false}));
assert.equal(prices.reduce((s,p)=>s+p.two_asset_futures_core_HTTP_ceiling,0),18);
const scenarios=[{D:2,R:4},{D:10,R:20},{D:100,R:200}].map(({D,R})=>{
 const n=D+R,coinex=3*n,bingx=3*n,bingxOI=4*n,wide=16*n;
 return{new_events_D:D,deep_rechecks_R:R,kind:'Conditional arithmetic, not measured rarity or accepted limits',metadata_M:null,additional_identity_I:null,one_CoinEx_narrow_data_HTTP_day:coinex,one_BingX_narrow_data_HTTP_day_without_OI:bingx,one_BingX_narrow_data_HTTP_day_with_OI:bingxOI,both_narrow_data_HTTP_day_without_OI:coinex+bingx,both_narrow_data_HTTP_day_with_BingX_OI:coinex+bingxOI,both_narrow_31day_HTTP_with_BingX_OI:(coinex+bingxOI)*31,both_six_scale_plus_minute_trade_HTTP_day:wide,both_six_scale_plus_minute_trade_31day_HTTP:wide*31,complete_native_or_provider_daily_cost_qualified:false};
});
const docsPath='checkpoints/source-worker-global-source-docs-20261018/documentation-receipts.json',docs=json(docsPath);
const need=['coinexFutures','coinexSpot','coinexTrades','coinexTicker','coinexRate','bingxSwapSkill','bingxSpotSkill','bingxSharedRate'];
const docRefs=need.map(id=>{const d=docs.documents.find(r=>r.id===id);assert.ok(d);return{...d,source:'FrozenPR456 documentation, not re-scraped for this plan'};});
assert.ok(newDoc.documents.length>=6);for(const d of newDoc.documents)assert.match(d.body_sha256,/^[a-f0-9]{64}$/);
assert.equal(spec.clock_and_window_contract.historical_CoinEx_query_time_unit_documented,true);
assert.equal(spec.identity_stage.provider_routes.find(p=>p.provider==='BINGX').current_key_admission,false);
assert.equal(spec.provider_specs[0].futures_native_baseline.start_end_query_time_unit,'MILLISECONDS_EXPLICIT_GLOBAL_INTEGRATION_GUIDE');
const plan={schema:'REPORT2_COINEX_BINGX_EXACT_FACT_PLAN_V1',working_base:spec.working_base,status:'OFFLINE_REVIEWABLE_PLAN_NOT_EXECUTION_READY',execution_ready:false,reason:'New venue identities/listings and applicable HTTP/native SQL admission/cost bounds are not yet qualified. No executable acquisition code is included.',
 original_inputs:[{file:manifestPath,sha256:sha(manifestBytes),scope:'Only TIA/APR membership extracted; no accepted105census repeated'},{file:archive,sha256:sha(read(archive)),member:'report2-run-result.json',member_sha256:sha(member)},{file:docsPath,sha256:sha(read(docsPath)),source_head:'14f9a82ccfb70b25c5ff28bb5c774299d165beef'},{file:dir+'plan-spec.json',sha256:sha(read(dir+'plan-spec.json'))}],
 assets,first_packet_price:prices,maximum_all_optional_two_assets_two_providers_HTTP:18+2+18,default_first_packet_max_HTTP:5,default_BingX_with_separately_admitted_timed_OI_max_HTTP:6,full_first_packet_native_SQL_R_W:null,
 required_fact_numbers:['Each new provider:21closed native15mOHLC bars, with20prior+1event; retain raw volume/value separately and qualify exact base/quote scaling before volume facts.','One1mreply may serve two distinct15bar windows: source-native event endingE15 and main-style sliding path endingE1. Keep separate keys/claims; never two independent votes.','At most one1000trade page; actual sampled count/side/timestamps/ID integrity recorded, whole-window completeness remains false unless separately proved.','BingX optional OI must retain its actual time and units. Untimed CoinEx OI remains untimed.'],
 clock_rules:spec.clock_and_window_contract,identity_stage:spec.identity_stage,numeric_acceptance:spec.numeric_acceptance,consumer_proposals:spec.consumer_proposals,excluded_first_packet_roles:spec.excluded_first_packet_roles,
 first_negative_or_failure_behavior:['Metadata negative or exact asset/units unresolved: stop target before candle/trade requests; catalog is not useful market coverage.','Actual HTTP/body/API/schema errors remain exact statuses; budget/manual denial is not provider corruption.','Previously validated immutable facts can be retained after later failure without refreshing clocks or claiming full packet.','New native usage unknown halts ALL further acquisitions and fallback, without clearing old15unknown or refunding reservations.','No retry/pagination/provider/spot escalation without a separately admitted explicit remaining packet; absence ofspot does not block a sufficient futures fact.'],
 permanent_formula:{narrow_both_providers_with_BingX_OI:'M + I + 7*(D+R), metadata/identity actual not assumed zero',narrow_without_OI:'M + I + 6*(D+R)',six_scale_each_venue_plus_minute_trade:'M + I + 16*(D+R), no OI included',rows_and_CPU_SQL:'Unknown until chosen actor/state/cache/persistence/journal path is qualified; existing common snapshot HTTP reuse does not mean free SQL/CPU.'},scenarios,
 interpretation:['Scenario is not a new source/day/month cap. Actualsource/provider/IP/account/common/main/manual headroom required before first call.','Existing5HTTP N05/N12 and18supplement/full164/D1limits stay. A default5HTTP experiment does not grant a new ordinary runtime route or fund two providers inside one5HTTP slot.','Sparse native daily/weekly history is different from a month of minute tape. CoinEx query milliseconds are documented; actual historical availability remains untested.','BingX exact identity route requires a signed read-key, currently not admitted. Its5HTTP figure is conditional on an approved usable identity stage, not a keyless execution plan.','Month-scale watch/history/replay/outcomes are owned by third worker, not implemented here.','Later fetched historical rows cannot be declared first-known at saved canonical time or credited as earlier prediction; current coverage/consumer/delivery remain unqualified.'],
 source_documentation:docRefs,new_documentation:newDoc,ownership:spec.ownership,effects:spec.effects};
const output=process.argv[2]||dir+'plan.json';fs.writeFileSync(output,JSON.stringify(plan,null,2)+'\n');console.log(JSON.stringify({assets:assets.map(a=>a.contract),providers:prices.map(p=>p.provider),default_first_packet_max_HTTP:5,BingX_optional_OI_max_HTTP:6,sliding_and_native_windows_separated:true,execution_ready:false,new_provider_market_HTTP:0,native_SQL:0,output}));
