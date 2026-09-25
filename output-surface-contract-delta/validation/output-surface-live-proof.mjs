import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
const runtime=path.resolve(process.env.REPORT2_OUTPUT_RUNTIME_DIR||'runtime'),load=n=>import(pathToFileURL(path.join(runtime,'src',n)).href);
const [{buildRuntimeCanonicalBundle},{buildCanonicalAnalyticalResult},{formatTelegramCompact},{formatManualReport}]=await Promise.all([load('canonical-runtime-adapter.mjs'),load('canonical-analytical-result.mjs'),load('telegram-compact-formatter.mjs'),load('manual-report-formatter.mjs')]);
const NOW=Date.now();const FREE={version:'free-source-runtime-summary-v4',status:'CLOSED',owner:'source-registry.mjs',registry:{status:'CLOSED',entries:[]},entry_funnel:{status:'CLOSED',blockers:[],blocker_details:[],has_unknown_reason:false},continuous_collector_status:'PARTIAL_REALTIME_COVERAGE',hot_cycle_external_request_delta:0,d1_write_delta:0};
function bundle(state){
 const scenario=state.startsWith('ENTRY_NOW_')?{entry_area:'1.00–1.02 USDT',entry_area_min_price:1,entry_area_max_price:1.02,target_price:1.1,invalidation:'цена ниже 0.98'}:null;
 return buildRuntimeCanonicalBundle({contract:'AAA-USDT',run_id:`OUT:${state}`,snapshot_id:`OUT:${state}:${NOW}`,observed_ts:NOW,discovery_row:{contract:'AAA-USDT',early_candidate_bridge:true,early_candidate_quality_0_100:82,early_candidate_operational_priority_0_100:88,early_candidate_wave_id:'W1',bridge_reason:'ранняя аномалия объёма и поглощение',rolling_24h_change_pct:4},publication_shadow:{entry_signal:{state,direction:'LONG',reason:state==='WAIT_FOR_TRIGGER'?'TRIGGER_NOT_CLOSED':null,trigger:state==='WAIT_FOR_TRIGGER'?{operator:'>=',value:1.05,timeframe:'5м',expires_ts:NOW+3600000,cancel_condition:'цена ниже 0.98',next_recheck_ts:NOW+300000}:null},score_interval:{score_lower_bound:78},scenario_plan:scenario},opportunity:{newest_event:{minute_decomposition:{classification_allowed:true,one_minute_bars:5}}},free_source_summary:FREE});
}
const wait=bundle('WAIT_FOR_TRIGGER'),entry=bundle('ENTRY_NOW_ANALYTICAL'),observe=bundle('OBSERVE');
const unavailable={...FREE,entry_funnel:{status:'NOT_CLOSED',blockers:['SOURCE_TOOL_UNAVAILABLE'],blocker_details:[{code:'SOURCE_TOOL_UNAVAILABLE',full_ru:'Один из требуемых источников не был доступен в этом запуске.',short_ru:'источник недоступен в этом запуске',known:true}],has_unknown_reason:false}};
const c=buildCanonicalAnalyticalResult({snapshot_id:'UNAV',run_id:'UNAV',observed_ts:NOW,state:'OBSERVE',candidates:[{contract:'ZZZ-USDT'}],free_sources:unavailable,early_candidate:{items:[]}});
const unavailableManual=formatManualReport(c);
const worker=fs.readFileSync(path.join(runtime,'src/worker.js'),'utf8');
const checks={
 r019_simple_russian:[wait,entry,observe].every(b=>b.surface_contract?.checks?.telegram_no_internal_terms&&b.surface_contract?.checks?.manual_no_internal_terms),
 r020_score_labels:[wait,entry].every(b=>b.surface_contract?.checks?.score_labels_telegram&&b.surface_contract?.checks?.score_labels_manual),
 r022_entry_1100:entry.telegram?.ok===true&&entry.telegram.length<=1100&&entry.telegram.max_length===1100,
 r023_wait_850:wait.telegram?.ok===true&&wait.telegram.length<=850&&wait.telegram.max_length===850,
 r028_one_canonical_two_surfaces:[wait,entry,observe].every(b=>b.surface_contract?.checks?.same_fingerprint),
 r029_distinct_formatters:[wait,entry,observe].every(b=>b.surface_contract?.checks?.different_formatters),
 r030_snapshot_time:[wait,entry,observe].every(b=>b.surface_contract?.checks?.snapshot_time_in_telegram&&b.surface_contract?.checks?.snapshot_time_in_manual),
 r036_manual_early_section:observe.manual?.text?.includes('РАННИЕ КАНДИДАТЫ ДО ДВИЖЕНИЯ')===true,
 r037_telegram_early_candidate:wait.telegram?.message?.includes('Ранний кандидат:')===true,
 r058_manual_source_unavailable:unavailableManual?.text?.includes('ИСТОЧНИК НЕДОСТУПЕН В ЭТОМ ЗАПУСКЕ')===true,
 worker_bundle_consumer:/canonical_analytical_bundle:\s*canonicalAnalyticalBundle/.test(worker),
};
const failed=Object.entries(checks).filter(([,v])=>v!==true).map(([k])=>k);
const out={version:'output-surface-live-proof-v1-20260925',status:failed.length?'NOT_CLOSED':'CLOSED_OUTPUT_SURFACES',checks,failed,lengths:{wait:wait.telegram?.length,entry:entry.telegram?.length,observe:observe.telegram?.length},fingerprints:{wait:wait.parity_fingerprint,entry:entry.parity_fingerprint,observe:observe.parity_fingerprint},production_writes:false,d1_writes:false,telegram_send:false,trading:false,thresholds_changed:false,strategy_weights_changed:false,probability_enabled:false,new_sources_added:false};
fs.writeFileSync(process.env.REPORT2_OUTPUT_PROOF||'output-surface-live-proof.json',JSON.stringify(out,null,2)+'\n');console.log('OUTPUT_SURFACE_LIVE_PROOF',JSON.stringify(out));if(out.status!=='CLOSED_OUTPUT_SURFACES')process.exit(2);
