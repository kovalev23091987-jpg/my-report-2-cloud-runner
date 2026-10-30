// Offline documentation-bound arithmetic only. No market/SQL/runtime imports.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const dir='checkpoints/source-worker-mexc-phemex-fact-plan-20261018/';
const read=p=>fs.readFileSync(p),json=p=>JSON.parse(read(p));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const spec=json(dir+'spec.json'),docsPath=spec.prior_evidence.documentation.file,docs=json(docsPath);
assert.equal(spec.state,'DOC_CONTRACT_GAPS_NOT_EXECUTION_READY');
assert.equal(spec.cost_contract.execution_allowed,false);
assert.equal(spec.cost_contract.complete_first_packet_HTTP_upper_bound,null);
assert.equal(spec.cost_contract.SQL_upper_bound,null);
assert.equal(spec.cost_contract.identity_cost_actually_bounded,false);
assert.equal(spec.prior_evidence.accepted_tests_and_censuses_repeated,false);
assert.ok(Object.values(spec.effects).every(v=>v===0));
const [mexc,phemex]=spec.providers;
assert.equal(mexc.native_bars.query_time_unit,'UNIX_SECONDS_EXPLICIT');
assert.equal(mexc.native_bars.limit_parameter_documented,false);
assert.equal(mexc.native_bars.native_3m,false);
assert.equal(phemex.native_bars.allowed_limits.includes(24),false);
assert.equal(phemex.native_bars.allowed_limits.includes(40),false);
assert.equal(phemex.native_bars.allowed_limits.includes(phemex.native_bars.query.limit),true);
assert.equal(phemex.native_bars.allowed_limits.includes(phemex.minute.limit),true);
assert.equal(phemex.rate.new_v2_last_or_list_weight,null);
assert.ok(spec.providers.every(p=>p.identity.route===null&&p.trades.individual_trade_ID_documented===false));
const references=[...new Set(spec.providers.flatMap(p=>p.docs))].map(id=>{const d=docs.documents.find(d=>d.id===id);assert.ok(d,id);assert.match(d.content_sha256,/^[a-f0-9]{64}$/);assert.match(d.source_url,/^https:\/\//);return{id,url:d.source_url,body_sha256:d.content_sha256,cached_at:d.cached_at,source_status:'REUSED_FROZEN456_NOT_RESCRAPED'};});
const frameCosts=spec.requested_native_minutes.map(minutes=>{
 const rows=spec.baseline_rows+spec.event_rows,totalMinutes=minutes*rows;
 assert.equal(rows,21);assert.ok(rows<mexc.native_bars.maximum_points);
 const oneMinuteRequestsIgnoringAllOtherGaps=Math.ceil(totalMinutes/mexc.native_bars.maximum_points);
 return{native_frame_minutes:minutes,required_closed_native_rows:rows,covered_minutes:totalMinutes,covered_days:totalMinutes/1440,native_request_count:1,theoretical_MEXC_1m_requests_for_equal_horizon:oneMinuteRequestsIgnoringAllOtherGaps,one_minute_backfill_enabled:false,actual_availability:false};
});
const offsetCoverage=Array.from({length:15},(_,offset)=>({offset_minutes:offset,unique_rows_two_15m_windows:15+offset,padded_with_existing_5min_deadline_and_two_edges:15+offset+7}));
assert.ok(offsetCoverage.every(x=>x.padded_with_existing_5min_deadline_and_two_edges<=phemex.minute.limit));
const scales=spec.requested_native_minutes.length,nativePlusMinute=scales+1;
assert.equal(nativePlusMinute,spec.cost_contract.all_six_native_plus_minute_requests);
const scenarios=[{D:2,R:4},{D:10,R:20},{D:100,R:200}].map(({D,R})=>{
 const n=D+R;
 return{D_new_fact_bundles:D,R_justified_deep_rechecks:R,metadata_M:null,identity_I:null,narrow_two_candle_requests_each_venue_HTTP_day:4*n,narrow_two_venues_31day_HTTP:4*n*31,both_six_native_plus_one_minute_each_HTTP_day:2*nativePlusMinute*n,both_six_native_plus_minute_31day_HTTP:2*nativePlusMinute*n*31,optional_two_trade_requests_each_bundle_HTTP_day:2*n,actual_daily_limits_qualified:false,native_cost:null};
});
// Hypotheses show why HTTP count cannot establish the weighted minute grant.
// Neither hypothetical weight is accepted as the actual new v2 route weight.
const weightScenarios=[1,10].map(weight=>({hypothetical_only:true,actual_weight_qualified:false,kline_weight_hypothesis:weight,narrow_candle_weight:2*weight,six_native_plus_minute_weight:nativePlusMinute*weight,ordinary_Others_capacity_per_minute:100,other_consumers_and_metadata_identity_not_included:true}));
const result={schema:'REPORT2_MEXC_PHEMEX_OFFLINE_PREFLIGHT_RESULT_V1',spec_sha256:sha(read(dir+'spec.json')),documentation_receipts_sha256:sha(read(docsPath)),prior_459_evidence_replayed:false,source_documents:references,providers:spec.providers.map(p=>({provider:p.provider,listing:null,exact_identity_closed:false,numeric_facts:0,complete_first_HTTP_bound:null,native_SQL_R_W_bound:null,execution_ready:false})),frameCosts,offsetCoverage,scenarios,weightScenarios,
 conclusions:['CoinEx TIA remains the better documented first candidate from frozen459; this is no additional acquisition authorization.','MEXC futures time is seconds, spot milliseconds. Do not send a fictitious limit40 or Min3 to this futures endpoint.','Phemex last kline uses documented limit50 for both21native and up to29distinct1m targets, never24/40.','Phemex new-v2 route weight remains null; legacy weight10 is not a proven bound for this path.','Nanosecond Phemex trade timestamp must not pass through an unsafe Number or become a fillID.','Both bounded trade routes lack individual fillIDs in the read schemas; no exact4h raw CVD/count is qualified.','Day/month arithmetic excludes actual M/I, other consumers and native CPU/SQL. It is not a free remaining quota.'],
 corrections_to_frozen456_proposed_to_coordinator:[{card:'MEXC',field:'documented_capabilities.limits',reason:'Current frozen ContractInfo/Ticker bodies do not state10/2s; preserve older discovery only as unqualified legacy reference, not current endpoint grant.'},{card:'MEXC',field:'potential_block_roles.N12',reason:'T is documented as trade side, not explicitly taker. Keep limited raw-side sample until aggressor semantics qualify.'}],effects:spec.effects,execution_ready:false,remaining:spec.remaining};
fs.writeFileSync(process.argv[2]||dir+'result.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({documentation_refs:references.length,frames:scales,native_weekly_horizon_days:frameCosts.at(-1).covered_days,minimum_theoretical_weekly_1m_HTTP:frameCosts.at(-1).theoretical_MEXC_1m_requests_for_equal_horizon,all_actual_numeric_facts:0,execution_ready:false}));
