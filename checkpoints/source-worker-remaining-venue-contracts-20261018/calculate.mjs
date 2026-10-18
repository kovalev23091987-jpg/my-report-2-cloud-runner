// Offline preflight arithmetic and documentation references only.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const dir='checkpoints/source-worker-remaining-venue-contracts-20261018/';
const read=p=>fs.readFileSync(p),json=p=>JSON.parse(read(p)),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const spec=json(dir+'spec.json'),previous=json(spec.prior_evidence.documentation),newDocs=json(dir+'new-documentation.json');
assert.equal(spec.providers.length,4);assert.equal(spec.cost.execution_allowed,false);
assert.equal(spec.cost.full_actual_HTTP_upper_bound,null);assert.equal(spec.cost.SQL,null);
assert.equal(spec.prior_evidence.accepted_original_reader_runtime_census_or_replay_repeated,false);
assert.ok(Object.values(spec.effects).every(v=>v===0||v===false));
const [bm,bu,wb,bs]=spec.providers;
assert.equal(bm.identity.max_explicit_currencies,20);assert.equal(bm.optional_trades.individual_fill_ID,false);
assert.equal(bm.native.limit_parameter_documented,false);assert.equal(bu.native.query_unit,'MILLISECONDS_EXPLICIT');
assert.equal(bu.native.params.type,'LAST_PRICE');assert.equal(bu.native.params.startTime,'REQUEST_PADDED24BAR_START_MS');
assert.equal(wb.native.method,'GET');assert.deepEqual(wb.native.response_order,['time_seconds','open','close','high','low','volume_stock','volume_money']);
assert.equal(wb.optional_trades.standard_base_quantity,'quote_volume');assert.equal(wb.optional_trades.standard_quote_quantity,'base_volume');
assert.equal(wb.optional_trades.limit_parameter,false);assert.equal(bs.native.params.exclude_current_candle,true);
assert.equal(bs.native.native_weekly,false);assert.equal(bs.weekly_alternative.enabled_in_first_packet,false);
const oldRefs=[...new Set(spec.providers.flatMap(p=>p.documentation_ids))].map(id=>{const d=previous.documents.find(x=>x.id===id);assert.ok(d,id);assert.match(d.content_sha256,/^[a-f0-9]{64}$/);return{id,url:d.source_url,body_sha256:d.content_sha256,cached_at:d.cached_at,kind:'REUSED_FROZEN456_NOT_RESCRAPED'};});
const newRefs=spec.providers.flatMap(p=>p.new_documentation_ids||[]).map(id=>{const d=newDocs.docs.find(x=>x.id===id);assert.ok(d,id);assert.match(d.body_sha256,/^[a-f0-9]{64}$/);return{id,url:d.source_url,body_sha256:d.body_sha256,kind:'NEW_STATIC_SCHEMA_NOT_ACTUAL_MARKET'};});
const minuteOffsets=Array.from({length:15},(_,offset)=>({native_to_sliding_offset_minutes:offset,exact_union_rows:15+offset,range_rows_with_two_start_padding:15+offset+2,latest_reply_rows_with_5min_deadline_and_two_edges:15+offset+7}));
assert.ok(minuteOffsets.every(r=>r.range_rows_with_two_start_padding<=40&&r.latest_reply_rows_with_5min_deadline_and_two_edges<=40));
const weeklyDailyOffsets=Array.from({length:7},(_,offset)=>({closed_daily_boundary_after_research_week_days:offset,days_for_21weekly_aggregates:147,days_to_include_current_daily_baseline:147+offset,padded_daily_request_limit:154}));
assert.ok(weeklyDailyOffsets.every(x=>x.days_to_include_current_daily_baseline<=154));assert.ok(154<=bs.native.row_limit);
const providerCosts=spec.providers.map(p=>({provider:p.id,minimal_N10_HTTP_if_one_exact_identity_request_exists:4,first_core_plus_optional_trade_HTTP_hypothesis:p.optional_trades||p.trades?.documented_route_in_read_material?5:null,identity_route_ready:p.id==='BITMART'?'DOCUMENTED_ROUTE_ACTUAL_BINDING_UNVERIFIED':false,complete_HTTP_upper_bound:null,native_SQL_R_W:null,all_six_frame_plus_minute_HTTP:p.id==='BITSTAMP'?6:7,wide_Bitstamp_note:p.id==='BITSTAMP'?'Five nativeframes+minute; replace21daily fetch with154daily only in separately admitted derivedUTCweekly research, never claim nativeweekly.':null,execution_ready:false}));
const allWide=providerCosts.reduce((s,p)=>s+p.all_six_frame_plus_minute_HTTP,0);assert.equal(allWide,27);
const scenarios=[{D:2,R:4},{D:10,R:20},{D:100,R:200}].map(({D,R})=>{const n=D+R;return{D_new_bundles:D,R_justified_rechecks:R,metadata_M:null,identity_I:null,four_providers_two_candle_narrow_HTTP_day:8*n,four_providers_two_candle_narrow_HTTP_31days:8*n*31,wide_separately_admitted_six_frame_HTTP_day:allWide*n,wide_HTTP_31days:allWide*n*31,optional_four_trade_HTTP_day:4*n,actual_native_or_daily_capacity_proven:false};});
const result={schema:'REPORT2_REMAINING_VENUE_PLAN_RESULT_V1',spec_sha256:sha(read(dir+'spec.json')),new_docs_receipts_sha256:sha(read(dir+'new-documentation.json')),prior_docs_receipts_sha256:sha(read(spec.prior_evidence.documentation)),old_document_refs:oldRefs,new_document_refs:newRefs,prior_asset_window_and_runtime_replays_repeated:false,minuteOffsets,weeklyDailyOffsets,providerCosts,scenarios,
 strongest_next_documented_identity_candidate_after_CoinEx:'BitMart/account/v1/currencies explicit batch20/network/contract_address/IP2per2s. Actual unsigned access/listings/project bindings are still untested.',
 corrections_to_frozen_preflight_proposed_to_coordinator:[{PR:459,also_applies_to:463,kind:'PROSPECTIVE_RANGE_BOUNDARY_PADDING_NOT_ACTUAL_LIVE_DEFECT',proposal:'For explicit start/end routes request native startE15-24x15m, minute start2m before earliest target; retain original21native and15+15minute targets. Existinglimit24/40 andHTTP unchanged. Avoid unqualified inclusive-start assumption.'},{providers:['WHITEBIT','BITSTAMP'],proposal:'Use documented end+limit instead of assuming start also wins. WhiteBIT derives start fromlimit; Bitstamp usesend whenbothstart/end given.'}],
 consumer_proposals:spec.consumer,remaining:['Every new venue exact current asset/market identity and actual source payload/units/clocks/consumer use.','BitMart response time unit/turnover unit, unsigned identity availability and native exact binding.','Bitunix exact nativeidentity and resolution of contradictory volume example; no inventedtaker/OI.','WhiteBIT exact cryptofutures metadata-name/identity; UCID/networks alone not presumed contractproof.','Bitstamp exactcrypto/quote/market availability, derivative units and separateexplicitderivedweekly; no USDT or nativeweekly guess.','All provider/IP/account/source/common/day/month/manual and complete nativeSQL/R/W/cold-start/queue costs before any call.'],effects:spec.effects,execution_ready:false};
fs.writeFileSync(process.argv[2]||dir+'result.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({providers:spec.providers.map(p=>p.id),old_doc_refs:oldRefs.length,new_schema_refs:newRefs.length,range_padding_targets_unchanged:true,weekly_derived_daily_request:154,wide_HTTP_hypothesis:27,execution_ready:false,actual_new_numeric_facts:0}));
