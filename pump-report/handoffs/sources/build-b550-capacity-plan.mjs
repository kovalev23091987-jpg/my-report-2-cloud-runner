// One local arithmetic/source-integrity qualification. No broker, fetch or SQL.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {START_PROFILE as P} from '../../profile/start-v1.mjs';
import {RESOURCE_LIMITS as L} from '../../runtime/budget.mjs';
import {NATIVE_POLICY as N} from '../../runtime/native-budget.mjs';
import {PROVIDER_POLICIES as PP, PROTECTED_HTTP as R, QUALIFICATION_EXPIRES_TS, PROVIDER_STAGE} from '../../runtime/provider-policy.mjs';
import {DISCOVERY_PLAN} from '../../runtime/discovery-reserve.mjs';
import {SOURCE_HTTP_PLAN} from '../../sources/index.mjs';

const here=fileURLToPath(new URL('.',import.meta.url));
const root=fileURLToPath(new URL('../../../',import.meta.url));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const write=(name,value)=>fs.writeFileSync(here+name,JSON.stringify(value,null,2)+'\n');
const pins={
 'pump-report/handoffs/sources/B550_T3_SOURCE_INDEX_BEFORE125.mjs.snapshot':'21595a8d412f6074e6375af0f1200e1a189de255837a72aba0286db2fadd6b81',
 'pump-report/sources/bingx.mjs':'4b835db4ba9e8514c5bef26ab287aed99b982d409976ebff540fdf8403052308',
 'pump-report/sources/recent-trades.mjs':'2894ddd3e9874e2676af1b7093bd41c75e78736c35edc7b843c72f597246079c',
 'pump-report/handoffs/sources/PACKAGE_T3_RECENT_TRADES_PRODUCER_FINAL_V1.json':'9710f5869b8f5f38060d78b81c6e972b64a290a0b644d2109d8b0e454791db97',
 'pump-report/handoffs/sources/PACKAGE_U3_FULL934_SCOPE_SELECTION_FINAL_V1.json':'1d45208baa190c83728957ae1372118de3cdbb80eda12ab76ebfad74300ebfeb'
};
for(const [path,digest] of Object.entries(pins))assert.equal(sha(fs.readFileSync(root+path)),digest,path);
const tzPath=fileURLToPath(new URL('../../../../PUMP_REPORT_DESIGN_HANDOFF_20261025/PUMP_REPORT_TZ_FOR_TRANSFER_RU.md',import.meta.url));
const tz=fs.readFileSync(tzPath);
assert.equal(sha(tz),'0674adf8bef087f63ddac8214b8e650ae14410f33970ed4f869c5ab2564975cc');
assert.equal(tz.toString().split('\n').filter(l=>l.includes('80%')).length,1);
assert.ok(tz.toString().includes('Плановая загрузка до 80% доступного бюджета после обязательных резервов'));
assert.equal(L.http_per_run,164); assert.deepEqual(L.lanes,{hot:96,background:56,statistics:12});
assert.equal(L.project_http_day,900);assert.equal(P.optional_http_upper_bound,2);assert.equal(SOURCE_HTTP_PLAN.optional_total_max,2);

const inputFiles=['pump-report/profile/start-v1.mjs','pump-report/runtime/budget.mjs','pump-report/runtime/native-budget.mjs',
 'pump-report/runtime/provider-policy.mjs','pump-report/runtime/discovery-reserve.mjs','pump-report/runtime/runner.mjs',
 'pump-report/runtime/worker.mjs','pump-report/analytics/movement.mjs',...Object.keys(pins)];
const inputs=inputFiles.map(path=>({path,sha256:sha(fs.readFileSync(root+path))}));
const currentCoreCount=Math.ceil((P.volume_baseline_ms+Math.max(...P.automatic_growth.short_windows_ms))/P.candle_interval_ms)+1;
const requiredMs=Math.max(Math.max(...P.automatic_growth.short_windows_ms),P.wave_search_ms+P.impulse_window_ms+P.volume_baseline_ms);
const proposedCount=Math.ceil(requiredMs/P.candle_interval_ms);
assert.equal(currentCoreCount,121);assert.equal(proposedCount,125);
const oldestImpulseEnd=-P.wave_search_ms, oldestImpulseStart=oldestImpulseEnd-P.impulse_window_ms;
const oldestBaselineStart=oldestImpulseStart-P.volume_baseline_ms;
const possibleClosedRows=Array.from({length:125},(_,i)=>({open:(i-125)*60000,close:(i-124)*60000}));
const fullBaseline=possibleClosedRows.filter(r=>r.open>=oldestBaselineStart&&r.close<=oldestImpulseStart);
const croppedBaseline=possibleClosedRows.slice(-121).filter(r=>r.open>=oldestBaselineStart&&r.close<=oldestImpulseStart);
assert.equal(fullBaseline.length,60);assert.equal(croppedBaseline.length,56);
write('B550_CANDLE_WINDOW_DERIVATION_V1.json',{
 schema:'SOURCE_B550_CANDLE_WINDOW_DERIVATION_V1',status:'PROPOSAL_ONLY_ACTIVE_T3_SOURCE_BYTES_UNCHANGED',
 profile:{wave_search_ms:P.wave_search_ms,impulse_window_ms:P.impulse_window_ms,volume_baseline_ms:P.volume_baseline_ms,
  candle_interval_ms:P.candle_interval_ms,growth_windows_ms:P.automatic_growth.short_windows_ms},
 current_requested_rows:currentCoreCount,required_closed_minutes:proposedCount,
 formula:'max(max(short growth windows), wave_search + impulse_window + volume_baseline) / interval = max(60,60+5+60)=125',
 relative_boundary_proof:{observation_end_ms:0,oldest_candidate_end_ms:oldestImpulseEnd,impulse_start_ms:oldestImpulseStart,
  baseline_start_ms:oldestBaselineStart,required_baseline_rows:60,rows_available_from121:56,missing_rows:4},
 actual_open_bar_boundary:'Current endTime=end is inclusive-risk; if a newest-open row fills limit121, at most120 closed rows remain. Not re-proven natively here.',
 proposed_request:{startTime:'end - 125*60000',endTime:'end - 1',limit:125,interval:'1m',end:'floor(now/60000)*60000'},
 proof_scope:'Existing consumer searches candidate close >= end-wave_search and compares60 minutes before its5minute impulse. No strategy/window/threshold changed.',
 existing_day_loader_uses_closed_endTime_end_minus1:true,HTTP_before_after:[1,1],payload_closed_rows_delta:4,
 native_SQL_rows_delta:null,patch_applied:false,reason_not_applied:'ROOT explicitly freezes T3 source bytes during connected snapshot; later separate affected patch.'});

const manualRoute={catalog:1,overview:1,day_1440_closed_window:1,core_candles_and_book:2,
 core_price_primary_and_ticker_fallback_max:2,optional_total:2,map_slot_upper:1,delivery_price_book_recheck:2,telegram_send:1};
const manualImmediate=Object.values(manualRoute).reduce((a,b)=>a+b,0);
const manualBingx=manualImmediate-manualRoute.map_slot_upper-manualRoute.telegram_send;
assert.equal(manualImmediate,13);assert.equal(manualBingx,11);
const reserves={manual_http_by_provider:R.http_by_provider,manual_total:Object.values(R.http_by_provider).reduce((a,b)=>a+b,0),
 delivery:R.delivery_http,outcomes:R.outcomes_http};
const held=reserves.manual_total+reserves.delivery+reserves.outcomes;
assert.equal(held,156);
const knownObserved={provider_attempts:22,old_unknown_attempts_included:2,native_requests:395,rows_read:817,rows_written:249,native_unknown_ops:0};
const sqlFixed={reads:N.bootstrap_or_external_floor.rows_read+N.outcomes_protected.rows_read+N.delivery_protected.rows_read+N.next_full.rows_read,
 writes:N.bootstrap_or_external_floor.rows_written+N.outcomes_protected.rows_written+N.delivery_protected.rows_written+N.next_full.rows_written};
assert.deepEqual(sqlFixed,{reads:140000,writes:10440});
const scenarios=[0,22].map(assumedPrior=>({
 prior_HTTP_floor_assumption:assumedPrior,not_full_ledger_or_unknown_zero_claim:true,held_reserves:held,
 automatic_and_future_work_planning_ceiling_80pct:Math.floor(.8*(L.project_http_day-held-assumedPrior)),
 cadences:[2,3,5].map(min=>{
  const scans=600/min, discovery=2*scans, manuals=6*manualImmediate, outcomes=24;
  const remaining=Math.floor(.8*(L.project_http_day-held-assumedPrior))-discovery-manuals-outcomes;
  const sqlR=scans*N.rows_read+6*N.rows_read+sqlFixed.reads;
  const sqlW=scans*N.rows_written+6*N.rows_written+sqlFixed.writes;
  return {minutes:min,scans,overview_HTTP:scans,catalog_HTTP:scans,discovery_HTTP:discovery,
   six_cold_ready_manual_HTTP:manuals,all_outcome_HTTP_slots:outcomes,remaining_for_auto_service_unknown_HTTP:remaining,
   max_full_auto12_HTTP_candidates_if_extra_service_unknown_zero:Math.max(0,Math.floor(remaining/12)),
   SQL_envelope_reads_before_prior_usage:sqlR,SQL_envelope_writes_before_prior_usage:sqlW,
   exceeds70000W_before_prior_usage:Math.max(0,sqlW-L.d1_writes_day)};
 })}));
assert.deepEqual(scenarios[1].cadences.map(x=>x.discovery_HTTP),[600,400,240]);
assert.deepEqual(scenarios[1].cadences.map(x=>x.max_full_auto12_HTTP_candidates_if_extra_service_unknown_zero),[0,6,19]);
const plan={minutes:5,scan_runs:120,auto_ready_capacity_slots:12,manual_checks:6,outcome_HTTP_slots:24,
 source_market_HTTP_upper:{BINGX:240+120+66+24,TELEGRAM:12+6,SWOLECHARTS_potential_slots_not_admitted:12+6},
 HTTP_upper:240+12*12+6*13+24,SQL_envelopes:{auto_runs:120,manual_runs:6,
  reads:126*N.rows_read+sqlFixed.reads+knownObserved.rows_read,
  writes:126*N.rows_written+sqlFixed.writes+knownObserved.rows_written},
 current_HTTP_reserve156_never_released_or_reallocated:true,
 status:'COUNT_AND_ENVELOPE_PLAN_ONLY_NOT_EXECUTABLE_UNDER_CURRENT_ACCEPTANCE_GRANTS',
 all550_operationally_verified_assumed:false,optional_map_absence_nonblocking:true};
assert.equal(plan.HTTP_upper,486);assert.equal(plan.source_market_HTTP_upper.BINGX,450);
assert.equal(plan.SQL_envelopes.writes,48489);
const ceilingKnownFloor=scenarios[1].automatic_and_future_work_planning_ceiling_80pct;
assert.equal(ceilingKnownFloor,577);assert.equal(ceilingKnownFloor-plan.HTTP_upper,91);
const minSqlRemainingW=L.d1_writes_day-knownObserved.rows_written-sqlFixed.writes-6*N.rows_written;
const maxAuto80=Math.floor(.8*minSqlRemainingW/N.rows_written);
assert.equal(maxAuto80,153);

const timeline=[];
for(let m=0;m<600;m++){
 const scan=m%5===0?2:0, candidate=(m>=1&&(m-1)%50===0)?12:0;
 const manualA=(m>=12&&(m-12)%100===0)?2:0,manualB=(m>=13&&(m-13)%100===0)?11:0;
 const outcome=(m>=20&&(m-20)%25===0)?1:0;
 const h=10+Math.floor(m/60),mm=m%60;
 timeline.push({minute:m,moscow:`${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')}`,
  catalog_overview_HTTP:scan,auto_candidate_HTTP_capacity:candidate,manual_phaseA_HTTP:manualA,manual_phaseB_HTTP:manualB,
  outcome_HTTP_capacity:outcome,total_HTTP_capacity:scan+candidate+manualA+manualB+outcome,
  root_staging_required:candidate>0||manualB>0,
  note:candidate?'Previous5minute AUTO invocation: staged cold candidate phase; not another catalog/overview run.':
   manualA?'Manual capacity placeholder, requests can arrive any time and preempt AUTO.':manualB?'Continuation same manual invocation after rolling-minute headroom, not a second manual run.':outcome?'At existing AUTO tick; only due eligible outcomes, no new statistics invocation.':''});
}
assert.equal(timeline.reduce((n,r)=>n+r.total_HTTP_capacity,0),486);
assert.equal(timeline.filter(r=>r.auto_candidate_HTTP_capacity).length,12);
assert.equal(timeline.filter(r=>r.manual_phaseA_HTTP).length,6);
const keys=Object.keys(timeline[0]);
fs.writeFileSync(here+'B550_MINUTE_CAPACITY_PLAN_V1.csv',keys.join(',')+'\n'+timeline.map(r=>keys.map(k=>JSON.stringify(r[k])).join(',')).join('\n')+'\n');
write('B550_BUDGET_COVERAGE_CADENCE_V1.json',{
 schema:'SOURCE_B550_BUDGET_COVERAGE_CADENCE_V1',scope:550,status:plan.status,inputs,
 timezone:'Europe/Moscow',automatic_window:'10:00 inclusive–20:00 exclusive Moscow =07:00–17:00UTC',
 TZ80_semantics:'80% is proposed resource loading after mandatory reserves; no80% asset coverage threshold occurs inTZ.',
 coverage:{economic_target:550,curated_registry:13,owner_delivery_excluded_in_curated_registry:2,operational_identity_delivery_eligible:11,
  operational_identity_delivery_eligible_share_of550:11/550,market_coverage_minimum_from_TZ:null,
  hypothetical80pct_only:440,full550_onepass_min_candle_book_HTTP:1102,
  hypothetical440_onepass_min_candle_book_HTTP:882,
  actual_runner_day_plus_candle_book_min_440_HTTP:1322,actual_runner_day_plus_candle_book_min550_HTTP:1652,
  bulk_snapshot_can_check550_prices_only_when_identity_freshness_valid:true,deep_checks_use_distinct_denominator:true,
  current_fresh_coverage:'NOT_MEASURED_NO_NEW_IO',quality_signal_count_not_coverage:true},
 preserved_limits:L,preserved_profile_optional_upper:P.optional_http_upper_bound,
 known_observed_totals_not_full_current_ledger:knownObserved,unquantified_legacy_spend_reserves_unknowns:'RETAINED_SYMBOLIC_NOT_ZERO_NOT_REFUNDED',
 future_discovery_current_code:DISCOVERY_PLAN,protected_HTTP:reserves,fixed_HTTP_protection:held,
 cold_ready_manual:{route:manualRoute,total_immediate:manualImmediate,BINGX:manualBingx,six_immediate:78,
  six_plus_one_outcome_each:84,current_no_eligible_map_route_six_immediate_upper:72,
  actual_attempts_and_SQL_cost:'NOT_MEASURED_NATIVE0',manual24_is_run_headroom_not_six_day_reports:true,
  protected_BINGX102_not_reduced_to66:true},
 scenarios,proposed_conditional_day_plan:plan,HTTP_plan_headroom_below80pct_known_floor:91,
 SQL:{fixed_protection:sqlFixed,envelope_per_invocation:{reads:N.rows_read,writes:N.rows_written},
  six_manual:{reads:6*N.rows_read,writes:6*N.rows_written},max_auto_runs_at80pct_after_known_floor_and_protection:maxAuto80,
  cadence_choice_by_current_envelopes:'Only5minute among2/3/5 fits full-day envelope +6manual+fixed reserves; current production/admissions stillOFF.',
  measured_new_cost:null,overview550_JSON_positions_not550_D1_rows:true,
  speculative24_extra_statistics_invocations_add:{reads:24*N.rows_read,writes:24*N.rows_written},
  no_extra_statistics_invocations_assumed:'Outcomes share existing AUTO invocations. Separate runner STATISTICS would add catalog1/SQL envelope; not free.'},
 per_run:{total:164,hot:96,background:56,statistics:12,AUTO_hot_after_manual24:72,
  scan_plus_one_cold_ready:14,source_map_per_candidate_upper:1,map_chain8_native4_inside8:true,
  deep_per_candidate50_is_HTTP_bound_not50_distinct_assets:true,
  background_lane_not_used_by_current_broker_default:true,unused_lanes_not_free_daily_budget:true},
 cache:{catalog_TTL:0,overview_price_TTL:30000,book_TTL:15000,candles_TTL:90000,trades_TTL:30000,OI_TTL:120000,funding_TTL:300000,
  overview_shared_bulk_reuse_same_URL:true,exact_candle_day_windows_change_each_minute:true,
  cache_key_includes_full_URL:true,cache_does_not_renew_event_clock:true,delivery_price_book_ttl0_forced:true,
  source_retry_count:0,negative_backoff_cache_not_reinterpreted_as_asset_classification:true,SQL_cache_read_write_cost_nonzero_unmeasured:true},
 provider_blockers:{stage:PROVIDER_STAGE,qualification_expires_ts:QUALIFICATION_EXPIRES_TS,
  BINGX_policy:PP.BINGX,TELEGRAM_policy:PP.TELEGRAM,SWOLECHARTS_policy:PP.SWOLECHARTS,
  BINGX_acceptance_spent12_of24_preserved:true,metadata2_of2_SPENT_preserved:true,
  future_BINGX450_exceeds_remaining12:true,six_ready_sent_manual_TG6_exceeds_current_daily2:true,
  current_qualified_map_route_BTC_owner_excluded:true,current_allowed_providers_empty_at_summary_stage:true,
  rolling_minute_BINGX10_vs_cold_manual11:'Worst cold manual needs >60s of rolling-provider capacity or ROOT staging before fresh core; current broker paces only per-second and refuses minute overflow.',
  same_tick_scan2_plus_cold_auto_BINGX10_exceeds10:true,
  ROOT_dependency:'Positive precise production/provider/whole/native admissions retaining old caps/SPENT/unknowns; minute/deadline staging or capacity-aware deferral; actual fresh full manual chain, CPU/bytes/native costs. No auto capraise or stage/version reset.'},
 minute_plan_status:'600minute capacity timetable proposal only; candidate/manual phases need ROOT controlled staging within same invocation. No scheduler/runtime change bySOURCE. Manual placeholders are capacity, not restriction on owner request times.',
 due_outcomes:'24 slots upper; run only genuinely due within10–20, late-day4h deadlines defer to next allowed/manual check with honest gap, no hidden night collector.',
 source_code_changes_in_arithmetic_stage:0,T3_frozen_bytes_preserved_in_snapshot:pins,
 H125_followup:'PACKAGE_H125_CORE_HISTORY_FIX_FINAL_V1.json; separately allowed after ROOT snapshot; targeted1PASS, not T3 six-case replay',
 new_market_HTTP_SQL_TG_deploy:0,
 old9pauses2OWNERdeferrals_preserved:true});

const original=fs.readFileSync(here+'B550_T3_SOURCE_INDEX_BEFORE125.mjs.snapshot','utf8');
const oldCount='const count = Math.ceil((profile.volume_baseline_ms + Math.max(...profile.automatic_growth.short_windows_ms)) / step) + 1;';
assert.ok(original.includes(oldCount));
fs.writeFileSync(here+'B550_HISTORY_125_PROPOSAL_V1.patch',
 'PROPOSAL ONLY — NOT APPLIED; ROOT requested frozen T3 integration snapshot first.\n'+
 '--- pump-report/sources/index.mjs (T3 frozen21595a8d)\n+++ pump-report/sources/index.mjs (proposed later affected patch)\n@@\n-'+oldCount+'\n'+
 '+const lookback = Math.max(Math.max(...profile.automatic_growth.short_windows_ms),\n'+
 '+  profile.wave_search_ms + profile.impulse_window_ms + profile.volume_baseline_ms);\n'+
 '+const count = Math.ceil(lookback / step);\n@@\n-'+
 'params: {interval: \'1m\', startTime: start, endTime: end, limit: count}\n'+
 '+params: {interval: \'1m\', startTime: start, endTime: end - 1, limit: count}\n'+
 'Later verification must exercise125actual normalized closed rows, earliest searched5m impulse/full60m baseline, no open bar, unchanged one HTTP and shared profile. No such code test was run here.\n');
write('B550_ARITHMETIC_SOURCE_INTEGRITY_CHECK_V1.json',{
 schema:'SOURCE_B550_ARITHMETIC_SOURCE_INTEGRITY_CHECK_V1',result:'PASS_LOCAL_ARITHMETIC_AND_PINNED_SOURCE_INTEGRITY_ONLY',
 checks:{T3_frozen_source_and_manifest_exact:true,U3_manifest_exact:true,TZ80_resource_only:true,profile121_vs_required125:true,
  baseline_rows125_vs121:[60,56],preserved_HTTP164_lanes96_56_12:true,project900_unchanged:true,manual_cold13_plus_outcome1:true,
  fixed_protectedHTTP156:true,conditional5min_dayHTTP486:true,conditional_SQLW48489:true,three_min_SQLW72240_before_prior_usage:true,
  minutely_capacity_rows600:true,minutely_HTTPsum486:true,no_active_source_patch:true,no_T3_six_tests_replayed:true,new_market_HTTP_SQL_TG_deploy:0},
 not_tested:['Native market/API/SQL/Telegram','Actual rolling-minute latency/CPU/bytes','125source codepatch because not applied','Physical storage capacity or old ENTRY deferrals']});
console.log(JSON.stringify({result:'PASS_LOCAL_ARITHMETIC_AND_PINNED_SOURCE_INTEGRITY_ONLY',cadence_minutes:5,HTTP_plan_upper:486,
 SQL_R_envelopes_plus_known_floor:plan.SQL_envelopes.reads,SQL_W_envelopes_plus_known_floor:plan.SQL_envelopes.writes,
 plan_is_native_admitted:false,T3_source_changes:0,new_market_HTTP_SQL_TG_deploy:0}));
