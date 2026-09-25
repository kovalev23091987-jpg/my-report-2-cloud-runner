import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import fs from 'node:fs';import {pathToFileURL} from 'node:url';
const runtime=path.resolve(process.env.REPORT2_OUTPUT_RUNTIME_DIR||'runtime');const load=n=>import(pathToFileURL(path.join(runtime,'src',n)).href);
const [{buildRuntimeCanonicalBundle},{buildCanonicalAnalyticalResult},{formatTelegramCompact},{formatManualReport},{buildOutputSurfaceContract}]=await Promise.all([load('canonical-runtime-adapter.mjs'),load('canonical-analytical-result.mjs'),load('telegram-compact-formatter.mjs'),load('manual-report-formatter.mjs'),load('output-surface-contract.mjs')]);
const NOW=1_800_000_000_000;
const FREE_OK={version:'free-source-runtime-summary-v4',status:'CLOSED',owner:'source-registry.mjs',registry:{status:'CLOSED',entries:[]},entry_funnel:{status:'CLOSED',blockers:[],blocker_details:[],has_unknown_reason:false},continuous_collector_status:'PARTIAL_REALTIME_COVERAGE',hot_cycle_external_request_delta:0,d1_write_delta:0};

function bundle(state='WAIT_FOR_TRIGGER'){
 const entry=state.startsWith('ENTRY_NOW_')?{entry_area:'1.00–1.02 USDT',entry_area_min_price:1,entry_area_max_price:1.02,target_price:1.1,invalidation:'цена ниже 0.98'}:null;
 return buildRuntimeCanonicalBundle({
   contract:'AAA-USDT',run_id:'RUN-1',snapshot_id:'SNAP-1',observed_ts:NOW,
   discovery_row:{contract:'AAA-USDT',early_candidate_bridge:true,early_candidate_quality_0_100:82,early_candidate_operational_priority_0_100:88,early_candidate_wave_id:'W1',early_candidate_evidence_domains:['VOLUME_ACCELERATION','ORDERFLOW_ABSORPTION'],bridge_reason:'ранняя аномалия объёма и поглощение',rolling_24h_change_pct:5},
   publication_shadow:{entry_signal:{state,direction:'LONG',reason:state==='WAIT_FOR_TRIGGER'?'TRIGGER_NOT_CLOSED':null,trigger:state==='WAIT_FOR_TRIGGER'?{metric:'price',operator:'>=',value:1.05,timeframe:'5м',expires_ts:NOW+3600000,cancel_condition:'цена ниже 0.98',next_recheck_ts:NOW+300000}:null},score_interval:{score_lower_bound:78},scenario_plan:entry},
   opportunity:{newest_event:{minute_decomposition:{classification_allowed:true,one_minute_bars:5}}},
   free_source_summary:FREE_OK,
 });
}

test('R020 R022 R023 score labels and hard Telegram limits close',()=>{
 for(const state of ['WAIT_FOR_TRIGGER','ENTRY_NOW_ANALYTICAL']){
  const b=bundle(state);assert.equal(b.status,'CLOSED');assert.equal(b.surface_contract.status,'CLOSED');
  for(const label of ['Общая оценка:','Монета интересна:','Готовность ко входу:'])assert.match(b.telegram.message,new RegExp(label));
  assert.ok(b.telegram.length<=b.telegram.max_length);
  assert.equal(b.telegram.max_length,state==='WAIT_FOR_TRIGGER'?850:1100);
 }
});
test('R028 R029 R030 one canonical snapshot feeds distinct surfaces with same fingerprint/time',()=>{
 const b=bundle();const s=b.surface_contract;assert.equal(s.status,'CLOSED');assert.equal(s.checks.same_fingerprint,true);assert.equal(s.checks.different_formatters,true);assert.equal(s.checks.snapshot_time_in_telegram,true);assert.equal(s.checks.snapshot_time_in_manual,true);assert.notEqual(b.telegram.message,b.manual.text);
});
test('R036 manual always has early section and empty summary',()=>{
 const c=buildCanonicalAnalyticalResult({snapshot_id:'S2',run_id:'R2',observed_ts:NOW,state:'OBSERVE',candidates:[{contract:'BBB-USDT'}],free_sources:FREE_OK,early_candidate:{items:[]}});
 const m=formatManualReport(c);assert.equal(m.ok,true);assert.match(m.text,/РАННИЕ КАНДИДАТЫ ДО ДВИЖЕНИЯ/);assert.match(m.text,/Подтверждённых ранних кандидатов нет/);
});
test('R037 worthy early candidate reaches compact Telegram',()=>{
 const b=bundle();assert.match(b.telegram.message,/Ранний кандидат: AAA/);assert.match(b.telegram.message,/приоритет 88\/100/);assert.equal(b.surface_contract.checks.telegram_early_candidate,true);
});
test('R058 manual prints exact unavailable-source phrase',()=>{
 const free={...FREE_OK,entry_funnel:{status:'NOT_CLOSED',blockers:['SOURCE_TOOL_UNAVAILABLE'],blocker_details:[{code:'SOURCE_TOOL_UNAVAILABLE',full_ru:'Один из требуемых источников не был доступен в этом запуске.',short_ru:'источник недоступен в этом запуске',known:true}],has_unknown_reason:false}};
 const c=buildCanonicalAnalyticalResult({snapshot_id:'S3',run_id:'R3',observed_ts:NOW,state:'OBSERVE',candidates:[{contract:'CCC-USDT'}],free_sources:free,early_candidate:{items:[]}});
 const m=formatManualReport(c);assert.equal(m.ok,true);assert.match(m.text,/ИСТОЧНИК НЕДОСТУПЕН В ЭТОМ ЗАПУСКЕ/);
});
test('R019 simple Russian guard keeps unknown raw code out of both surfaces',()=>{
 const free={...FREE_OK,entry_funnel:{status:'NOT_CLOSED',blockers:['UNKNOWN_INTERNAL_REASON'],blocker_details:[{code:'UNKNOWN_INTERNAL_REASON',full_ru:'Есть дополнительная внутренняя причина, для которой ещё нет утверждённого пользовательского объяснения; вывод оставлен в безопасном режиме.',short_ru:'есть непереведённая внутренняя причина; вывод не готов',known:false}],has_unknown_reason:true}};
 const c=buildCanonicalAnalyticalResult({snapshot_id:'S4',run_id:'R4',observed_ts:NOW,state:'OBSERVE',candidates:[{contract:'DDD-USDT'}],reasons:['SOME_NEW_INTERNAL_CODE_X'],free_sources:free,early_candidate:{items:[]}});
 const tg=formatTelegramCompact(c),m=formatManualReport(c);assert.equal(tg.ok,true);assert.equal(m.ok,true);for(const out of [tg.message,m.text]){assert.doesNotMatch(out,/SOME_NEW_INTERNAL_CODE_X/);assert.doesNotMatch(out,/\b(?:LONG|SHORT|OI|Funding|Spot flow|Data Quality|Source receipts|hard gates)\b/i);}
});
test('worker runtime actually returns the canonical bundle containing both surfaces',()=>{
 const w=fs.readFileSync(path.join(runtime,'src/worker.js'),'utf8');assert.match(w,/buildRuntimeCanonicalBundle/);assert.match(w,/canonical_analytical_bundle:\s*canonicalAnalyticalBundle/);
});

test('R019 manual never exposes technical run_id even when it looks like an internal state code',()=>{
 const c=buildCanonicalAnalyticalResult({snapshot_id:'S5',run_id:'OUT:WAIT_FOR_TRIGGER',observed_ts:NOW,state:'OBSERVE',candidates:[{contract:'EEE-USDT'}],free_sources:FREE_OK,early_candidate:{items:[]}});
 const m=formatManualReport(c);assert.equal(m.ok,true);assert.doesNotMatch(m.text,/WAIT_FOR_TRIGGER/);assert.doesNotMatch(m.text,/Запуск:/);
});
