// Offline arithmetic and six saved catalog rows only. No network or database.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {TWO_CANDIDATE_PLAN,TWO_NODE_HTTP_LIMITS} from '../../current-generation/files/src/two-candidate-policy.mjs';
import {BYK_PLAN,HTTP_LIMITS} from '../../current-generation/files/src/unified-budget.mjs';
import {N05_N12_PUBLIC_BUDGET,N05_N12_PUBLIC_SOURCE_DAILY_CAP,PUBLIC_VENUE_MINUTE_CAPS,publicVenueDailyDemand} from '../../current-generation/files/src/public-venue-source-budget.mjs';
import {SOURCE_POLICIES} from '../../current-generation/files/src/evidence-source-adapters.mjs';
import {SCHEDULED_EVIDENCE_HTTP_CAP,SCHEDULED_EVIDENCE_ROLES,proveScheduledEvidenceAllocation} from '../../current-generation/files/src/scheduled-evidence-budget.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=p=>fs.readFileSync(path.join(root,p));
const plan=TWO_CANDIDATE_PLAN,days=plan.month_days;
const scheduled=plan.scheduled_cycles_per_day*plan.candidates_per_full_cycle;
const manual=plan.manual_full_commands_per_day*plan.candidates_per_full_cycle+plan.manual_coin_commands_per_day;
const deep=scheduled+manual+plan.burst_deep_checks_per_day;
const cg=SOURCE_POLICIES.COINGECKO_SECTOR,cp=SOURCE_POLICIES.COINPAPRIKA_SECTOR;
const workerText=read('current-generation/files/src/worker.js').toString();
const start=workerText.indexOf('function classifyHtxInstrumentScope(info) {');
const end=workerText.indexOf('\nfunction symbolFingerprint(info)',start);
if(start<0||end<0)throw Error('Classifier boundaries changed; review manually');
const classifierText=workerText.slice(start,end);
const classify=vm.runInNewContext(`(${classifierText})`);
const wanted=['BTR-USDT','DOS-USDT','GPS-USDT','PIPPIN-USDT','SKR-USDT','UB-USDT'];
const catalogs=['linear-default.json.gz','linear-all.json.gz'].map(name=>{
 const p=`checkpoints/htx-weekly-live-38612734728/${name}`,bytes=read(p),raw=zlib.gunzipSync(bytes),d=JSON.parse(raw);
 return{path:p,gzip_sha256:sha(bytes),raw_sha256:sha(raw),source_ts:d.ts,source_status:d.status,rows:wanted.map(contract=>{
  const rows=d.data.filter(r=>r.contract_code===contract);
  if(rows.length!==1)throw Error(`Expected one saved row for ${contract}`);
  const info=rows[0],scope=classify(info);
  return{contract,original_row:info,active_swap_predicate:Number(info.contract_status)===1&&String(info.business_type||'swap').toLowerCase()==='swap',classifier:scope};
 })};
});
const fileInputs=['current-generation/files/src/two-candidate-policy.mjs','current-generation/files/src/unified-budget.mjs','current-generation/files/src/public-venue-source-budget.mjs','current-generation/files/src/scheduled-evidence-budget.mjs','current-generation/files/src/evidence-source-adapters.mjs','current-generation/files/src/coinpaprika-sector-evidence.mjs','current-generation/files/src/candidate-evidence-v2-runtime.mjs','current-generation/files/src/liquidation-source-http-plan.mjs','current-generation/files/src/worker.js'];
const output={
 schema:'SOURCE_PACKET_DELTA_OFFLINE_CALCULATIONS_V1',
 scope:'Configured arithmetic and exactly six historical catalog rows; no current universe census or provider qualification.',
 inputs:Object.fromEntries(fileInputs.map(p=>[p,sha(read(p))])),
 classifier_function_sha256:sha(classifierText),
 units:{month_days:days,scheduled_full_invocations:plan.scheduled_cycles_per_day,scheduled_deep:scheduled,manual_full_commands:plan.manual_full_commands_per_day,manual_single_commands:plan.manual_coin_commands_per_day,manual_deep:manual,burst_deep:plan.burst_deep_checks_per_day,total_deep:deep},
 byk:{unit:'BYK_REQUEST_UNITS_NOT_HTTP',configured_month_cap:BYK_PLAN.project_month_cap,configured_scheduled_month_cap:BYK_PLAN.scheduled_month_cap,scheduled_plus_burst_month_units:(scheduled+plan.burst_deep_checks_per_day)*plan.units_per_deep*days,manual_month_units:manual*plan.units_per_deep*days,configured_manual_reserve:plan.manual_monthly_reserve,total_month_units:deep*plan.units_per_deep*days,planned_headroom:BYK_PLAN.project_month_cap-deep*plan.units_per_deep*days},
 shared_public:{unit:'HTTP_ATTEMPTS_PER_PROVIDER',configured_daily_cap:N05_N12_PUBLIC_SOURCE_DAILY_CAP,current_helper_inputs:N05_N12_PUBLIC_BUDGET,current_helper_daily:publicVenueDailyDemand(),normalized_deep_plan_daily:deep*5,normalized_month_at5_per_deep:deep*5*days,helper_month:publicVenueDailyDemand()*days,minute_caps:PUBLIC_VENUE_MINUTE_CAPS,kucoin_minute_unit:'WEIGHTED_UNITS_NOT_HTTP',actual_spend_or_reserve_release_proven:false},
 coingecko:{configured:cg,cold_http_per_deep:4,cold_day:4*deep,cold_month:4*deep*days,ordinary_deep:scheduled+plan.burst_deep_checks_per_day,ordinary_cold_day:4*(scheduled+plan.burst_deep_checks_per_day),manual_cold_day:4*manual,configured_keyless_month:cg.daily_cap*days,configured_demo_month:cg.demo_daily_cap*days,configured_protected_manual_month:cg.demo_protected_manual_attempts*days,provider_terms_or_key_access_reverified:false},
 coinpaprika:{configured:cp,registered_exact_identity_with_pinned_or_complete_directory_cold_http:3,market_discovery_with_pinned_or_complete_directory_cold_http:4,conditional_directory_plus_members_followup_cold_http:5,conditional_path_basis:'market catalog + exact metadata with declared functional tag + directory whose selected tag lacks exact membership + exact tag members + bulk quotes; static allowed path, not observed provider failure',registered_three_request_day:3*deep,market_discovery_four_request_day:4*deep,conditional_five_request_day:5*deep,conditional_five_request_month:5*deep*days,configured_month:cp.daily_cap*days,provider_terms_reverified:false},
 scheduled_evidence:{configured_cap:SCHEDULED_EVIDENCE_HTTP_CAP,configured_roles:SCHEDULED_EVIDENCE_ROLES,existing_proof:proveScheduledEvidenceAllocation(),complete_directory_cold_shape:{shared_N05_N12:5,finalized_N04:4,coingecko_N15:4,coinpaprika_N15_market_discovery:4,uncaptured_HTX_N12:1},complete_directory_shape_sum:18,conditional_membership_followup_shape_sum:19,hard_cap_changed:false,all_routes_eligible_or_successful_proven:false,priority_ticket_is_not_request_cost:true,conditional_extra_route_requires_existing_cache_saving_or_defer:true},
 http_lanes:{node:TWO_NODE_HTTP_LIMITS,worker_default:HTTP_LIMITS,do_not_mix_lane_allocations:true},
 historical_six:{contracts:wanted,catalogs,all12_saved_rows_active_swap_and_crypto:catalogs.every(c=>c.rows.every(r=>r.active_swap_predicate&&r.classifier.classification==='CRYPTO_CONFIRMED')),current_presence_or_cause_proven:false,current_original_body_retained:false,margin_mode_hypothesis_proven:false},
 effects:{new_provider_HTTP:0,native_SQL:0,deploy:0,MAIN:0,Telegram_send:0,runtime_edits:0,accepted_test_or_old_census_reruns:0}
};
process.stdout.write(JSON.stringify(output,null,2)+'\n');
