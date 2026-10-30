import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const dir=dirname(fileURLToPath(import.meta.url)),root=resolve(dir,'../..');
const read=p=>readFileSync(resolve(root,p)),json=p=>JSON.parse(read(p));
const sha=b=>createHash('sha256').update(b).digest('hex');
const plan=JSON.parse(readFileSync(resolve(dir,'plan.json'))),docs=JSON.parse(readFileSync(resolve(dir,'documentation.json')));
const binding=p=>({path:p,bytes:read(p).length,sha256:sha(read(p))});
const codeRead=p=>execFileSync('git',['show',plan.working_base+':'+p],{cwd:root,maxBuffer:2*1024*1024});
const codeBinding=p=>{const b=codeRead(p);return{path:p,commit:plan.working_base,bytes:b.length,sha256:sha(b)};};

// New question: which fields actually exist for all105? This is not a repeat
// of the accepted historical funding qualification or four-candidate replay.
const bulk=json(plan.saved_inputs.bulk105),columns=bulk.row_columns,rows=bulk.pages.flat();
assert.equal(rows.length,105);assert.equal(new Set(rows.map(r=>r[0])).size,105);
assert.deepEqual(columns,['contract','price','funding_rate','funding_interval_hours','observed_ts','source_status']);
assert.ok(rows.every(r=>r.length===columns.length));
const OHLCV=['open','high','low','close','volume_contracts','volume_base','turnover_quote','native_bar_start','native_bar_end'];
assert.ok(OHLCV.every(k=>!columns.includes(k)));
const clocks=JSON.parse(bulk.source_clocks);assert.equal(bulk.source_bucket,1791964500000);
const scalarSource={...binding(plan.saved_inputs.bulk105),source_head:bulk.source_head,source_bucket:bulk.source_bucket,source_clocks:clocks,original_field_columns:columns,
 original_rows:rows.length,original_unique_contracts:105,all105_OHLCV_available:false,missing_candle_fields:OHLCV,
 exact_asset_sample:rows.filter(r=>['HBAR-USDT','CT-USDT','BR-USDT'].includes(r[0])),
 scope:'Exact historical scalar native projection; not original provider candle payload and not current105 coverage.'};
const partial=json(plan.saved_inputs.bulk_partial_export_not_full_input[0]);
assert.equal(partial.rows.length,51);assert.ok(partial.rows.some(r=>String(r.source_timestamps_json).includes('TRUNCATED')));

const source=Object.fromEntries(plan.source_code.map(p=>[p,codeRead(p).toString()]));
const collector=source[plan.source_code[0]],hourly=source[plan.source_code[1]],spot=source[plan.source_code[2]],history=source[plan.source_code[3]],worker=source[plan.source_code[4]],two=source[plan.source_code[5]];
const collectorBlock=collector.slice(collector.indexOf('rows.push({',collector.indexOf('var endpoints =')),collector.indexOf('var sourceTimestamps ='));
for(const field of ['price','turnover_24h_usdt','oi_contracts','oi_value_usdt','funding_rate','funding_interval_hours','observed_ts'])assert.ok(new RegExp('\\b'+field+'\\b').test(collectorBlock));
assert.ok(!/\b(?:open|high|low|volume_base|volume_contracts|native_bar_start)\s*[:,]/.test(collectorBlock));
assert.ok(collector.includes('var allowedSubrequests = catalogResult ? 4 : 3'));
assert.ok(hourly.includes('bucket < hour_bucket+5*60_000 || bucket > hour_bucket+25*60_000'));
const hourlyProjection=hourly.match(/samples\.push\(\{contract,market:[\s\S]*?\}\);/)?.[0];assert.ok(hourlyProjection);
assert.ok(!/\b(?:open|high|low|close|volume_contracts|volume_base)\s*:/.test(hourlyProjection));
assert.ok(spot.includes('LAST_TICKER_NOT_CANDLE'));assert.ok(spot.includes('quote_volume_24h'));
assert.ok(history.includes('SCAN_RUNS_COMPACT_V2'));assert.ok(history.includes('actual_cadence_minutes:20'));
assert.ok(history.includes('REPORT2_MARKET_SNAPSHOT_BATCH_V1'));

const start=worker.indexOf('async function futuresTrajectory(params)'),finish=worker.indexOf('return response;',start);
assert.ok(start>0&&finish>start);const trajectory=worker.slice(start,finish);
for(const period of ['1min','15min','60min','1day'])assert.ok(trajectory.includes('period='+period+'&size='));
assert.ok(!trajectory.includes('period=1week'));assert.ok(!trajectory.includes('period=4hour'));assert.ok(!trajectory.includes('period=30min'));
for(const name of ['one_minute','fifteen_minute','one_hour','one_day'])assert.ok(trajectory.includes(name+':'));
assert.ok(trajectory.includes('enumerable: false'));assert.ok(trajectory.includes('_opportunity_shadow_inputs'));
for(const mapping of ['volume_contracts: num(k?.vol)','volume_base: num(k?.amount)','turnover_usdt: num(k?.trade_turnover)'])assert.ok(worker.includes(mapping));
assert.ok(two.includes('candidates_per_full_cycle:2'));
assert.ok(worker.includes('(k.volume_contracts || 0)'));

const prior=json(plan.saved_inputs.prior_four_candidate_audit);
assert.equal(prior.input_population.full_saved_canonicals,2);assert.equal(prior.input_population.current_universe_coverage_inferred,false);
const reusedDeep=prior.rows.filter(r=>['CT-USDT','BR-USDT'].includes(r.contract)).map(r=>({contract:r.contract,binding:r.binding,
 prior_retained_event:r.event,normalized_futures_event_1m:r.futures_event_1m,
 accepted_prior_replay_repeated:false,scope:'Reused447 receipt, not re-executed grid/aggregation/score/delivery tests.'}));
assert.equal(reusedDeep.length,2);

const eventRate=(n,minutes)=>({assets:n,timeframes_minutes:minutes,
 average_closures_per_day:n*minutes.reduce((sum,m)=>sum+1440/m,0),
 max_closures_on_day_with_weekly_boundary:n*minutes.reduce((sum,m)=>sum+Math.ceil(1440/m),0),
 average_closures_per_40min:n*minutes.reduce((sum,m)=>sum+40/m,0),
 model_month_average:n*minutes.reduce((sum,m)=>sum+31*1440/m,0),
 phase_dependent_max_per31days:n*minutes.reduce((sum,m)=>sum+Math.ceil(31*1440/m),0),
 meaning:'Logical source candle closures, not actual subscriptions, API requests, SQL or native charged writes.'});
const n=plan.budget_model.universe,four=eventRate(n,plan.budget_model.timeframes_minutes_4),six=eventRate(n,plan.budget_model.timeframes_minutes_6);
assert.equal(four.average_closures_per_day,12720);assert.equal(six.average_closures_per_day,18390);
assert.equal(six.max_closures_on_day_with_weekly_boundary,18480);
assert.equal(six.phase_dependent_max_per31days,570150);
const updates=plan.budget_model.doc_rate_scenarios_only.map(r=>({...r,assets:n,topics_per_asset:6,conditional_update_frames_per_second:n*6*1000/r.update_ms,conditional_frames_per_day:n*6*86400000/r.update_ms,meaning:'Conditional simultaneous on-change/update-rate scenario; not observed throughput or a guaranteed provider bound. Not HTTP and not committed rows.'}));
const nativeBounds={SQL:null,rows_read:null,rows_written:null,pool_day_month_allowance:null,one_bar_per_base_row_conditional_writes:{native6_average:six.average_closures_per_day,one_minute_base:n*1440},
 reason:'Packing/indexes/ACK/journals/retention/admission/reconnect and existing common main/manual costs remain unqualified; logical count is not a native bound.'};
assert.equal(nativeBounds.rows_written,null);
const budget={source_candle_closures:{four,six},
 watch_demand:{active_event_slots:128,universe_unique_instruments_max:105,
  source_key:'venue+market+nativeinstrument+epoch+timeframe',
  one_native_timeframe_per_event_unique_keys_max:Math.min(128,n*6),
  same_source_key_reused_across_event_revisions:true,
  actual_feed_key_set:null,
  warning:'128 watch events are not128assets or128x6 independent subscriptions. Deduplicate shared exact source keys; do not charge every event a fresh provider request.'},
 cold_direct_four_scale_HTTP:n*4,
 cold_direct_model_requires_four_valid_routes:true,
 cold_direct_model_is_not_a_complete_provider_bound:'Four separate native requests is one conditional design, not a universal lower bound. Weekly REST support/identity/confirmation cost unqualified; aggregation can use a different plan only with proven full base history/grid.',
 one_request_per_native_closure_polling:{four_HTTP_day_average:four.average_closures_per_day,six_HTTP_day_average:six.average_closures_per_day,four_HTTP_per40min_average:four.average_closures_per_40min,six_HTTP_per40min_average:six.average_closures_per_40min,not_admitted:true},
 all105_only15m_poll_HTTP_per40min_average:n*40/15,whole_HTTP_cap:164,
 rare_event_selection:{q_assets:'Only independently admitted actual headroom determines q',cold_HTTP:'4*q plus catalog/identity/confirmation, before retries',all105_closed_event_detection:false,source_selection_bias_and_unobserved_denominator_retained:true},
 hierarchical_reuse:{base15m_closed_rows_day:n*96,base1m_closed_rows_day:n*1440,
  minutes_in2000_1m_bars:2000,twenty_one_weekly_bars_in15m_units:21*7*24*4,
  derives:['30m','1h','4h only if exact complete grid/units/native alignment'],
  bootstrap:'A2000-bar15m page cannot provide21weeks. A2000-bar1m page covers33h20m, not20daily/weekly baseline.',
  no_saving_claim_without_qualified_complete_base:true},
 websocket:{topics_all105_four_scales:n*4,topics_all105_six_scales:n*6,
  HTX_max_public_topics_per_connection:null,HTX_max_public_connections:null,HTX_max_data_frame_rate:null,
  HTX_min_subscription_one_second_slots_for420_at_documented40ps:Math.ceil(n*4/40),
  upgrades:'Count actual connection/HTTP upgrades; no assumed single connection for420/630topics.',
  control:'Subscriptions/unsubscriptions/req history/ping/pong count separately; obey source/public/IP pools and common admission.',
  reconnect:'Backoff+jitter/capped attempts/gap range/durable lastclosed cursor/reconciliation required. No reconnect or automatic recovery authorized by this package.',
  runtime:'Persistent owner-approved host/process and its uptime/cost remain unqualified. A chat heartbeat or short scheduled job is not a persistent feed.',
  conditional_update_scenarios:updates},native_bounds:nativeBounds,caps:plan.budget_model.caps_preserved,
 required_priority:['Existing main and manual source pools plus reserve','Fresh exact closed data actually missing','Optional source/spot/reconnect only on actual admitted spare'],
 whole_day_closed:false,source_or_SQL_quota_reset:false};
assert.ok(budget.cold_direct_four_scale_HTTP>164);assert.ok(budget.all105_only15m_poll_HTTP_per40min_average>164);
assert.ok(budget.hierarchical_reuse.twenty_one_weekly_bars_in15m_units>2000);
const rarePrior=json(plan.rare_event_budget.reused_contract),rareProof=binding(plan.rare_event_budget.reused_contract);
const oldNormal=rarePrior.scenarios.find(r=>r.new_events_D===2&&r.deep_rechecks_R===4),oldPeak=rarePrior.scenarios.find(r=>r.new_events_D===10&&r.deep_rechecks_R===20);
assert.equal(oldNormal.one_CoinEx_narrow_data_HTTP_day,plan.rare_event_budget.normal.accepted459_data_DplusR_HTTP);
assert.equal(oldPeak.one_CoinEx_narrow_data_HTTP_day,plan.rare_event_budget.peak.accepted459_data_DplusR_HTTP);
assert.equal(rarePrior.default_first_packet_max_HTTP,5);
for(const s of [plan.rare_event_budget.normal,plan.rare_event_budget.peak]){
 assert.equal(s.default_repeated_deep_R,0);assert.equal(s.default_data_HTTP,3*s.new_deep_events_D);assert.equal(s.default_31day_data_HTTP,31*s.default_data_HTTP);
}
assert.equal(plan.two_stage_owner_path.stage1.role,'HINT_ONLY');assert.equal(plan.two_stage_owner_path.stage1.additional_provider_HTTP,0);
assert.equal(plan.two_stage_owner_path.stage3.additional_provider_HTTP_default,0);
assert.equal(plan.minimal_qualification.conditional_HTTP_upper_bound_without_retry.total,5);
assert.equal(Object.entries(plan.minimal_qualification.conditional_HTTP_upper_bound_without_retry).filter(([k])=>k!=='total').reduce((sum,[,v])=>sum+v,0),5);
assert.equal(plan.minimal_qualification.actual_admission,false);assert.equal(plan.minimal_qualification.SQL_R_W_bound,null);

const neededDocs=['htx','binance-market','bitunix-kline','coinex-state','mexc-ws-kline'];
for(const id of neededDocs){const r=docs.new_documents.find(d=>d.key===id);assert.ok(r&&r.http_status===200&&/^[a-f0-9]{64}$/.test(r.content_sha256));assert.equal(r.market_call,false);assert.equal(r.actual_asset_fact_qualified,false);}
assert.ok(docs.new_documents.find(d=>d.key==='binance-legacy-kline').scope.startsWith('Rejected'));
for(const p of docs.reused_not_refetched)read(p);
const output={schema:'ANOMALY_FEED_SAVED_FACT_GAP_AND_BUDGET_ANALYSIS_V1',working_base:plan.working_base,scalar_source:scalarSource,
 excluded_partial_exports:{paths:plan.saved_inputs.bulk_partial_export_not_full_input,scalar_partial_rows:partial.rows.length,reason:'Truncated exported text is not a full wire body or complete105 payload; no imputed candles.'},
 code_binding:plan.source_code.map(codeBinding),actual_code_projection:{collector_fields:plan.actual_field_roles[0].fields,hourly_sample_projection:hourlyProjection,
  bulk_and_hourly_all105_closed_OHLCV:false,spot_is_ticker_not_candle:true,history_reader_is_point_series:true,legacy_scan_fallback_cadence_minutes:20,
  rich_bars:{private_field:'_opportunity_shadow_inputs',non_enumerable:true,native_timeframes:['1m','15m','1h','1d'],not_persisted_automatically_by_JSON:true,
   direct_30m_4h_1w_route_in_this_function:false,full_cycle_deep_policy:2,shortlist24_candle_coverage:'NOT_PROVEN_BY_SHORTLIST_SIZE'},
  public_volume_summary_risk:'Existing trajectory summaries use missing-value ||0 sums; never use these summaries as proof of a complete non-missing source volume series. This is a feed-qualification boundary, not a newly proven bad native event.'},
 prior_receipt:{...binding(plan.saved_inputs.prior_four_candidate_audit),reused_deep_examples:reusedDeep,prior_replay_repeated:false},
 feed_gap:{all105_closed_OHLCV:['15m','30m','1h','4h','1d','1w'],all105_OHLCV_not_required_by_two_stage_owner_path:true,existing_reuse:'Qualified original selected deep bars may be reused with original identity/window/clocks/volume dimensions. Existing healthy5m quotes may serve sampled watch with separate gap and anchor rules.',
  not_from_existing_points:['closed intrabar highs/lows/volume','unusual volume against20same-scale prior bars','full unselected105 multi-scale event denominator','native weekly grid or firstknown from a later hourly point'],
  minimum_change_proposal:'Owner two-stage design: existing105 snapshot is HINT_ONLY; precise independent-source closed bars and20prior same-scale baseline only for admitted rare candidates, sampled watch reuses existing snapshots. Full105 OHLCV is not required. No new framework added.'},
 primary_owner_path:plan.two_stage_owner_path,rare_event_budget:{...plan.rare_event_budget,reused_exact_proof:rareProof,old_calculator_repeated:false},
 provider_decisions:plan.provider_decisions,budget,minimal_qualification:plan.minimal_qualification,optional_WS_validation_comparison_deferred:plan.optional_WS_validation_comparison_deferred,
 third_worker_requirements:plan.required_candle_contract,
 acceptance:{actual_new_candle_acquisition:false,all105_candle_feed_closed:false,prospective_first_detection:false,native_SQL_bounds_closed:false,persistent_WS_qualified:false,anomaly_activation:false,one_asset_qualification_admitted:false,existing_LIQ_strategy_forms_pauses_caps_changed:false},
 effects:plan.effects};
writeFileSync(process.argv[2]||resolve(dir,'analysis.json'),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({status:'PASS',historical_scalar_rows:105,all105_existing_OHLCV:false,cold_four_scale_HTTP:420,six_scale_average_closed_bars_day:18390,six_scale_peak_weekly_day:18480,pilot_HTTP_upper_bound:5,native_SQL_R_W:null,market_calls:0,WS_connections:0,accepted_tests_repeated:0}));
