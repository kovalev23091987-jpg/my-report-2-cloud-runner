import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createNativeRelativeCandleQualification} from '../../sources/native-relative-qualification.mjs';
const root = new URL('../../../', import.meta.url);
const raw = p => fs.readFile(new URL(p,root));
const read = async p => JSON.parse(await raw(p));
const sha = b => createHash('sha256').update(b).digest('hex');
const p = await read('pump-report/handoffs/sources/STATIC_WHOLE_REQUEST_PLAN_V2.json');
assert(Date.now() < p.authority.own_lease_expiry);
globalThis.fetch = () => {throw Error('FINITE_OFFLINE_PLAN_CHECK_NO_NETWORK');};
const registry = await read('pump-report/sources/registry-curated13-native-relative-v1.json');
assert.equal(registry.instruments.length,13);
assert.equal(new Set(registry.instruments.map(e=>e.instrument.instrument_id)).size,13);
for(const e of registry.instruments){
  assert.deepEqual(e.qualifications.candles,createNativeRelativeCandleQualification(e.instrument,60000));
  assert.equal(e.qualifications.ticker_24h,undefined);
  assert.equal(e.qualifications.open_interest,undefined); assert.equal(e.qualifications.funding,undefined);
  assert.deepEqual(e.liquidations.routes,[]);
}
const frozen=await read(p.source_manifest);
for(const file of frozen.files.filter(f=>f.path.startsWith('pump-report/sources/')))
  assert.equal(sha(await raw(file.path)),file.sha256,file.path+' frozen code/registry changed');
for(const s of p.scenarios){assert.equal(s.whole_HTTP,s.BINGX+s.SWOLECHARTS+s.TELEGRAM);
  assert.equal(s.provider_weights,null);assert.equal(s.SQL_requests,null);assert.equal(s.SQL_rows_read,null);assert.equal(s.SQL_rows_written,null);}
const full=p.scenarios.find(s=>s.name==='ONE_MANUAL_READY_FULL_OPTIONAL_MAP_COLD_MAX');
assert.equal(full.BINGX,1+1+4+2+2); assert.equal(full.whole_HTTP,12);
assert.equal(p.six_manuals.independent_cold_full.whole_HTTP,6*full.whole_HTTP);
assert.equal(p.six_manuals.plus_six_one_attempt_due_histories.whole_HTTP,6*12+6);
assert.equal(p.six_manuals.same_executor_six_pending_full_upper.whole_HTTP,6*12-5);
const d=p.daylight_feasibility, tickMinutes=[];
for(let m=10*60;m<20*60;m+=5)tickMinutes.push(m);
assert.equal(tickMinutes.length,120);assert.equal(tickMinutes.at(-1),19*60+55);
assert.equal(d.ticks,tickMinutes.length);assert.equal(d.discovery_only_HTTP,120*2);
assert.equal(d.existing_protected_global_HTTP,102+6+24+24);
assert.equal(d.after_existing_reserves_and_discovery_before_actual_spent,900-156-240);
assert.equal(d.full13_mandatory_best_case_day,120*(1+1+13*(1+1)));
assert(d.full13_mandatory_best_case_day>900);
assert.equal(d.full13_cold_mandatory_with_extra_bulk_per_check_day,120*(2+13*5));
assert.equal(d.full13_full_READY_worst_day,120*(2+13*11));
assert.equal(d.one_full_READY_candidate_per_tick_upper_day,120*(2+11));
assert.equal(d.one_current13_READY_candidate_per_tick_fresh_bulk_day,840);
assert.equal(d.one_current13_READY_candidate_per_tick_fresh_bulk_plus_reserves,996);
assert.equal(d.one_current13_READY_candidate_per_tick_cold_max_day,1200);
assert.equal(d.max_current13_READY_cold_candidate_checks_same_assumptions,63);
assert.equal(d.max_full_READY_checks_if_six_full_manual72_already_spent_no_other_S,39);
assert(d.one_full_READY_candidate_per_tick_upper_day+156>900);
assert.equal(d.fits_full13_every5min,false);assert.equal(d.production_launch_authorized,false);
assert.equal(d.max_full_READY_candidate_checks_day_after_existing_reserves_assuming_S0_no_other_demand,45);
assert(240+156+45*11<=900);assert(240+156+46*11>900);
assert.equal(d.max_full_READY_checks_with24h_remediation,42);
assert.equal(d.max_full_READY_checks_with_Swole_reserve_and24h_request,41);
assert.equal(p.outcomes_and_pagination.possible_5min_day_history_HTTP_if_unbounded_due_backlog,12*120);
assert.equal(p.outcomes_and_pagination.expected_rows_unaligned_max,Math.ceil(14400000/60000)+1);
assert.equal(p.outcomes_and_pagination.request_limit_max,242);
assert.equal(p.observations_not_forecasts.native_D1_snapshot.requests,83);
assert.equal(p.observations_not_forecasts.current_daily_spent_from_live_ledger,null);
assert.equal(p.observations_not_forecasts.measured_provider_weights,null);
assert.equal(p.observations_not_forecasts.full_day_SQL,null);
const review=await read('pump-report/handoffs/sources/TICKER_24H_SAVED_EVIDENCE_REVIEW_V1.json');
assert.equal(sha(await raw(review.official_literal.path)),review.official_literal.sha256);
assert.equal(review.current_runtime_effect.automatic_day_growth_20pct,'UNCONFIRMED');
assert.equal(review.current_runtime_effect.day_covered_by_core,false);
assert.equal(review.bounded_alternative_without_strategy_change.expected_closed_rows,1440);
assert.deepEqual(review.source_files_changed,[]);
assert.deepEqual(p.taxonomy.new_positive_official_crypto_leads,[]);
assert.equal(p.runtime_profile_policy_changed,false);assert.equal(p.market_IO,0);assert.equal(p.SQL_IO,0);
assert.equal(p.nine_pauses_preserved,true);assert.equal(p.two_OWNER_deferrals_preserved,true);
assert(Date.now()<p.authority.own_lease_expiry);
const paths=['pump-report/handoffs/sources/STATIC_WHOLE_REQUEST_PLAN_V2.json','pump-report/handoffs/sources/WHOLE_REQUEST_PLAN_V2_AUTHORITY.json',
  'pump-report/handoffs/sources/TICKER_24H_SAVED_EVIDENCE_REVIEW_V1.json','pump-report/handoffs/sources/build-whole-request-plan-v2.mjs',
  'pump-report/handoffs/sources/qualify-whole-request-plan-v2.mjs'];
const hashes=[];for(const path of paths){const b=await raw(path);hashes.push({path,bytes:b.length,sha256:sha(b)});}
const result={schema:'PUMP_WHOLE_REQUEST_PLAN_V2_OFFLINE_QUALIFICATION',status:'PASS',checked_at:new Date().toISOString(),authority:p.authority,
  checks:['Frozen current13 matches accepted native-relative factory; source code unchanged','One/six maximal full manual accounting and separate queues',
    '120 daylight slots, mandatory reserve156, bulk240, lower bound3360 and45/42/41 bounded candidate arithmetic',
    'Outcome/history bounds and unbounded UNKNOWN retry demand remain explicit',
    '83 is observed D1 requests, not marketHTTP; forecast SQL/weights/current spent null',
    '24h exact window stays unqualified; no ticker patch or general taxonomy search'],
  native_capacity_proven:false,schedule_or_policy_changed:false,source_market_HTTP:0,source_SQL:0,source_Telegram:0,old_source_tests_or_audits_reexecuted:0,files:hashes};
await fs.writeFile(new URL('pump-report/handoffs/sources/WHOLE_REQUEST_PLAN_V2_OFFLINE_QUALIFICATION.json',root),JSON.stringify(result,null,2)+'\n');
process.stdout.write(JSON.stringify({status:'PASS',curated13:13,ticks:120,reserve:156,discovery:240,full13_minimum:3360,max_full_checks_before24h_remedy:45,native_capacity_proven:false,market_IO:0})+'\n');
