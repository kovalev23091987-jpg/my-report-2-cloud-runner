import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {analyzePump,RULES_VERSION} from '../../../analytics/index.mjs';
import {analyzeMovement} from '../../../analytics/movement.mjs';
import {closedCandles,windowRows} from '../../../analytics/math.mjs';
import {explainManualAnalysis} from '../../../analytics/manual-text.mjs';
import {START_PROFILE} from '../../../profile/start-v1.mjs';
import {INPUT_SCHEMA,factUsable,candleNativeComparisonKey} from '../../../contracts/index.mjs';

const PRIVATE='/private/tmp/pump-f550-source-control-actual.json',output=new URL('./',import.meta.url);
const hash=x=>createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
const need=(v,code)=>{if(!v)throw Error(code);};
const save=async(name,value)=>writeFile(new URL(name,output),JSON.stringify(value,null,2)+'\n');
const factSummary=(kind,f)=>f?{kind,fact_id:f.fact_id,instrument_id:f.instrument_id,unit:f.unit,status:f.status,origin:f.origin,source:f.source,venue:f.venue,
  event_ts:f.event_ts,received_ts:f.received_ts,expires_ts:f.expires_ts,reason:f.reason??null,rows:Array.isArray(f.value)?f.value.length:null,sha256:hash(f)}:{kind,present:false};
async function main(){
  const current_ts=Date.now(),bytes=await readFile(PRIVATE);need(bytes.length===1186568&&hash(bytes)==='0170bba73bc1fd2d56796d2c448258f6192a8c8fb612ab438d4f3d017de60e07','PRIVATE_ORIGINAL_HASH_OR_BYTES_CHANGED');
  const capture=JSON.parse(bytes),body=capture.body;need(capture.http_status===200&&body?.run_purpose==='ACCEPTANCE_TEST','ACTUAL_CAPTURE_CONTEXT_REQUIRED');
  const instrument=body.instrument,observations=body.overview?.observations??[],matches=observations.filter(x=>x.instrument?.instrument_id===instrument?.instrument_id);
  need(matches.length===1,'EXACT_TARGET_OVERVIEW_MATCH_REQUIRED');
  const observation=matches[0],candles=body.history?.facts?.candles;
  const sameIdentity=['instrument_id','asset_id','venue','native_symbol','market_type','base','quote','settle','classification_status'].every(k=>observation.instrument[k]===instrument[k]);
  need(sameIdentity,'EXACT_TARGET_INSTRUMENT_IDENTITY_REQUIRED');
  need(candles?.value?.length===125&&candles.instrument_id===instrument.instrument_id,'ACTUAL_125_TARGET_CANDLES_REQUIRED');
  const facts={...observation.facts,...body.history.facts,...body.optional.facts};
  need(!Object.hasOwn(facts,'orderbook')&&!Object.hasOwn(facts,'growth_24h'),'UNEXPECTED_MANDATORY_OR_DAY_SUBSTITUTION');
  const factFingerprint=hash(facts),instrumentFingerprint=hash(instrument),received_ts=capture.received_ts;
  need(current_ts>received_ts&&factUsable(facts.price,received_ts)&&factUsable(candles,received_ts),'ORIGINAL_USABLE_PRICE_CANDLE_FRAME_REQUIRED');
  const base={schema_version:INPUT_SCHEMA,run_id:body.run_id+':AA_OFFLINE_SAVED_REPLAY',mode:'MANUAL',run_purpose:'ACCEPTANCE_TEST',instrument,previous_wave:null,facts};
  const normalized=closedCandles(candles.value,received_ts,START_PROFILE.candle_interval_ms,{native_comparison_key:candleNativeComparisonKey(instrument)});
  need(normalized.reason===null&&normalized.rows.length===125,'ACTUAL_NORMALIZED_125_ROWS_REQUIRED');
  const rows=normalized.rows,end=rows.at(-1).close_ts,interval=START_PROFILE.candle_interval_ms,impulse=START_PROFILE.impulse_window_ms,baseline=START_PROFILE.volume_baseline_ms;
  need(rows.every((r,i)=>r.closed===true&&r.close_ts<=received_ts&&r.close_ts-r.open_ts===interval&&(i===0||r.open_ts===rows[i-1].close_ts)),'ACTUAL_CLOSED_CONTIGUOUS_WINDOW_REQUIRED');
  const endpoints=rows.filter(r=>r.close_ts>=end-START_PROFILE.wave_search_ms).map(r=>r.close_ts),baselineCounts=[];
  for(const endpoint of endpoints){
    need(windowRows(rows,endpoint,impulse,interval)!==null,'ACTUAL_IMPULSE_WINDOW_MISSING');let count=0;
    for(let e=endpoint-impulse;e>=endpoint-impulse-baseline+impulse;e-=impulse)if(windowRows(rows,e,impulse,interval))count++;
    baselineCounts.push(count);
  }
  need(endpoints.length===61&&baselineCounts.every(n=>n===12),'FULL_SEARCH_125_BASELINE_COVERAGE_FAILED');
  const inputOriginal={...base,analysis_ts:received_ts},original=analyzePump(inputOriginal);
  const movement=analyzeMovement(inputOriginal,rows,facts.price.value,null,START_PROFILE,null);
  const manual=explainManualAnalysis(original);
  need(manual===original.manual_text,'ACTUAL_MANUAL_CONSUMER_DISAGREED');
  const inputStale={...base,analysis_ts:current_ts},stale=analyzePump(inputStale);
  for(const result of [original,stale]){
    need(result.ready===false&&result.card_text===null&&result.plan===null&&result.probability?.value_pct===null&&result.notification_eligibility?.eligible===false,'INCOMPLETE_FRAME_UNEXPECTED_SIGNAL_OR_PLAN');
    need(typeof result.manual_text==='string'&&result.manual_text.includes('Готовой идеи пока нет.'),'HONEST_MANUAL_REFUSAL_REQUIRED');
  }
  need(original.reasons.includes('MANDATORY_ORDERBOOK_NOT_USABLE'),'MISSING_BOOK_NOT_REPORTED');
  need(!factUsable(facts.price,current_ts)&&!factUsable(candles,current_ts)&&stale.reasons.includes('MANDATORY_PRICE_NOT_USABLE')&&stale.reasons.includes('MANDATORY_CANDLES_NOT_USABLE'),'CURRENT_STALE_NOT_REFUSED');
  need(hash(facts)===factFingerprint&&hash(instrument)===instrumentFingerprint&&hash(await readFile(PRIVATE))===hash(bytes),'ACTUAL_FACT_OR_ORIGINAL_MUTATED');
  const sanitize=(result,at)=>({analysis_ts:at,analysis_sha256:hash(result),status:result.status,ready:result.ready,reasons:result.reasons,
    mandatory_data_complete:false,signal_eligible:false,plan_present:result.plan!==null,card_present:result.card_text!==null,probability_value_present:result.probability.value_pct!==null,
    wave_state:result.wave_state??null,movement_reached:Array.isArray(result.growth_windows),day_growth_diagnostic:result.day_growth_diagnostic??null,
    growth_windows:(result.growth_windows??[]).map(w=>({window_ms:w.window_ms,value_known:typeof w.return_pct==='number'&&Number.isFinite(w.return_pct),passed:w.passed,reason:w.reason??null})),
    manual_text_sha256:hash(result.manual_text),manual_text_utf16:result.manual_text.length,manual_has_no_ready_idea:result.manual_text.includes('Готовой идеи пока нет.'),manual_mentions_mandatory_data:result.manual_text.includes('Нет пригодных обязательных данных'),
    source_freshness:{price_usable:factUsable(facts.price,at),candles_usable:factUsable(candles,at),price_age_ms:at-facts.price.event_ts,candle_age_ms:at-candles.event_ts,price_TTL_ms:START_PROFILE.freshness_ms.price,candle_TTL_ms:START_PROFILE.freshness_ms.candles}});
  const trace={schema:'ANALYTICS_AA_ACTUAL_F550_SANITIZED_TRACE_V1',purpose:'ACCEPTANCE_TEST_OFFLINE_ONLY',source_original:{path:PRIVATE,sha256:hash(bytes),bytes:bytes.length,worker_body_semantic_sha256:hash(body),outer_received_ts:received_ts},
    source_run_id:body.run_id,instrument_id:instrument.instrument_id,native_symbol:instrument.native_symbol,instrument_sha256:instrumentFingerprint,
    overview_observations:observations.length,exact_target_observations:matches.length,overview_target_instrument_identity_fields_match:sameIdentity,
    fact_assembly:'EXACT_SAME_INSTRUMENT_OVERVIEW_PRICE_TICKER_PLUS_HISTORY_CANDLES_PLUS_OPTIONAL_FACTS_NO_VALUE_OR_CLOCK_EDITS',facts_sha256:factFingerprint,facts:Object.entries(facts).map(([kind,f])=>factSummary(kind,f)),
    missing_inputs:['orderbook','growth_24h','liquidation_map','previous_wave'],day_ticker_status:facts.ticker_24h?.status??null,day_ticker_reason:facts.ticker_24h?.reason??null,
    source_units_scope:'NATIVE_QUANTITY_RELATIVE_ONLY_NO_BASE_USDT_VOLUME_OR_EXECUTION_MULTIPLIER_PROMOTION',rules_version:RULES_VERSION,profile_version:START_PROFILE.version,
    original_receive:sanitize(original,received_ts),current_stale:sanitize(stale,current_ts),
    original_direct_movement:{sha256:hash(movement),active:movement.active,state:movement.state,reasons:movement.reasons,current_threshold_passed:movement.current_threshold_passed,automatic_eligible:movement.automatic_eligible,
      impulse_present:Boolean(movement.impulse),baseline_status:movement.impulse?.baseline_status??movement.volume_diagnostics?.baseline_status??null,baseline_windows:movement.impulse?.baseline_windows??movement.volume_diagnostics?.baseline_windows??null,
      returned_growth_windows:movement.windows.map(w=>({window_ms:w.window_ms,value_known:typeof w.return_pct==='number'&&Number.isFinite(w.return_pct),passed:w.passed,reason:w.reason??null}))},
    current_direct_movement:'NOT_ADMITTED_FRESHNESS_PRECONDITION_FALSE_FULL_ANALYZE_PUMP_REFUSED_BEFORE_MOVEMENT',
    history125:{normalized_rows:rows.length,normalized_rows_sha256:hash(rows),all_closed:true,contiguous:true,first_open_ts:rows[0].open_ts,last_close_ts:end,span_ms:end-rows[0].open_ts,
      search_endpoints:endpoints.length,baseline_windows_min:Math.min(...baselineCounts),baseline_windows_max:Math.max(...baselineCounts),all_full_60m_baselines:true,
      short_windows_available:[300000,900000,3600000].map(window_ms=>({window_ms,available:windowRows(rows,end,window_ms,interval)!==null})),exact_24h_available:windowRows(rows,end,86400000,interval)!==null},
    limits:{no_current_book_or_day_replacement:true,no_plan_or_publication_created:true,no_saved_previous_wave_supplied:true,native_IO:0,new_provider_calls:0,SQL:0,Telegram:0,production_mutated:false,private_prices_or_full_text_exported:false,old_test_replays:0}};
  await save('sanitized-trace.json',trace);
  await save('integrity.json',{schema:'ANALYTICS_AA_ONE_RUN_INTEGRITY_V1',result:'PASS_ACTUAL_F550_ORIGINAL_AND_CURRENT_STALE',runs:1,full_analyze_scenarios:2,direct_movement_original_only:1,actual125_full_baseline_endpoints:61,all_facts_instrument_original_bytes_unchanged:true,producer_facts_sha256:factFingerprint,
    original_ready:false,current_ready:false,plans_or_cards_created:0,production_core_changed:false,source_error_kept:true,raw_private_output:false,native_HTTP_SQL_TG:0});
  process.stdout.write(JSON.stringify({result:'PASS_ACTUAL_F550_OFFLINE',full_analyze_scenarios:2,normalized_rows:125,full_baseline_endpoints:61,original_status:original.status,current_status:stale.status,original_reasons:original.reasons,current_reasons:stale.reasons,no_signal_or_plan:true,source_and_facts_unchanged:true,private_prices_exported:false})+'\n');
}
main().catch(e=>{const code=/^[A-Z0-9_]{1,100}$/.test(e?.message??'')?e.message:'SANITIZED_REPLAY_ERROR';process.stdout.write(JSON.stringify({result:'AA_REPLAY_FAILED_SANITIZED_NO_PRIVATE_ERROR_EXPORTED',code})+'\n');process.exitCode=1;});
