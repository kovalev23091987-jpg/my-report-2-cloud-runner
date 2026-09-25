import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import {pathToFileURL} from 'node:url';
const runtime=path.resolve(process.env.REPORT2_PRESELECTION_RUNTIME_DIR||'runtime');
const load=n=>import(pathToFileURL(path.join(runtime,'src',n)).href);
const [{rankPreselectionMetricSources},{buildPreselectionMetricRouter},{applyEarlyCandidateBridge},{buildRuntimeCanonicalBundle}]=await Promise.all([
  load('capability-registry.mjs'),load('preselection-metric-router.mjs'),load('early-candidate-bridge.mjs'),load('canonical-runtime-adapter.mjs')
]);
const NOW=1790346000000;
function ev({metric,source,venue,value,coverage=100,history=100,age=60_000,max_age_sec=600,health='CLOSED',authority_rank=null,market_type='PERP',unit='pct',window='1h'}){
 return{contract_code:'AAA-USDT',metric,source,provider:source,venue,value,status:'CLOSED',source_ts:NOW-age,observed_ts:NOW,max_age_sec,coverage_pct:coverage,history_coverage_pct:history,health,authority_rank,market_type,unit,window,source_compatible:true,primary_market_id:`AAA-USDT:${venue}:${market_type}`,symbol_verified:true,asset_identity_verified:true};
}
const evidence=[
 ev({metric:'funding_rate',source:'Bybit Public V5',venue:'BYBIT',value:-0.001,coverage:90,authority_rank:1}),
 ev({metric:'funding_rate',source:'OKX Public V5',venue:'OKX',value:-0.0011,coverage:100,health:'RATE_LIMITED',authority_rank:2}),
 ev({metric:'oi_change_1h_pct',source:'Bybit Public V5',venue:'BYBIT',value:8,coverage:90,age:300_000,authority_rank:1}),
 ev({metric:'oi_change_1h_pct',source:'OKX Public V5',venue:'OKX',value:7,coverage:100,age:30_000,authority_rank:2}),
 ev({metric:'rs_vs_btc_1h',source:'OKX Spot Public V5',venue:'OKX',value:3,coverage:100,market_type:'SPOT',unit:'percentage_points'}),
 ev({metric:'rs_vs_eth_1h',source:'OKX Spot Public V5',venue:'OKX',value:2,coverage:100,market_type:'SPOT',unit:'percentage_points'}),
 ev({metric:'spot_flow_1h_delta_pct',source:'Binance Spot Public',venue:'BINANCE',value:12,coverage:95,market_type:'SPOT',unit:'pct_taker_buy_minus_sell_of_volume'}),
];

test('R009 dynamic primary rejects unhealthy source and ranks factual source',()=>{
 const ranked=rankPreselectionMetricSources({metric:'funding',rows:evidence.filter(x=>x.metric==='funding_rate'),now:NOW});
 assert.equal(ranked[0].source,'Bybit');
 assert.equal(ranked[0].usable,true);
 assert.equal(ranked.find(x=>x.source==='OKX').usable,false);
});

test('R010 metadata receipt retains required source selection fields',()=>{
 const ranked=rankPreselectionMetricSources({metric:'oi',rows:evidence.filter(x=>x.metric==='oi_change_1h_pct'),now:NOW});
 const selected=ranked[0];
 assert.equal(selected.source,'OKX');
 for(const key of ['provider','venue','mapping','market_type','unit','interval','history_coverage_pct','freshness_status','coverage_pct','health','authority_rank','last_success_ts'])assert.ok(Object.prototype.hasOwnProperty.call(selected,key),key);
 assert.equal(selected.freshness_status,'CURRENT');
 assert.equal(selected.source_selection_not_strategy_weight,true);
});

test('R056 general metric router covers multiple metric families before selection',()=>{
 const router=buildPreselectionMetricRouter({contract:'AAA-USDT',evidence,now:NOW});
 assert.equal(router.status,'CLOSED');
 assert.ok(router.selected_metric_count>=5);
 assert.ok(router.selected_family_count>=4);
 assert.equal(router.metadata_complete_count,router.selected_metric_count);
 assert.equal(router.htx_execution_only_mandatory,true);
 assert.equal(router.external_execution_substitution,false);
});

function stage0(turnover){
 return{contract_code:'AAA-USDT',turnover_24h_usdt:turnover,symbol_fingerprint:{resolution_status:'RESOLVED_HTX_EXACT'},quality:{market_present:true},instrument_scope:{classification:'CRYPTO_CONFIRMED'},freshness:{stale:false,market_age_sec:20},transitions:{'24h':{price_change_pct:5}}};
}
const earlyRow={contract_code:'AAA-USDT',wave_id:'W1',last_seen_ts:NOW,observed_ts:NOW,lifecycle_stage:'FORMING',early_detection_quality_0_100:80,long_evidence_domain_count:2,short_evidence_domain_count:0,direction_hint:'LONG',direction_state:'FORMING_LONG',shadow_only:1,feature_json:JSON.stringify({feature_fusion:{status:'CLOSED'}}),evidence_json:JSON.stringify([{status:'CLOSED',domain:'VOLUME_ACCELERATION'},{status:'CLOSED',domain:'ORDERFLOW_ABSORPTION'}]),evidence_refs_json:'[]'};
const fullRow={contract_code:'AAA-USDT',observed_ts:NOW,dq_status:'PARTIAL',conflicts_json:'[]',evidence_compact_json:JSON.stringify(evidence)};

test('general router is consumed before shortlist sorting and preserves HTX execution gate',()=>{
 const bridge=applyEarlyCandidateBridge({discovery_prefilter:{shortlist:[],counts:{},parameters:{max_shortlist:24}},scan:{contracts:[stage0(150000)]},deep_check_queue:{queue:[{contract:'AAA-USDT'}]},early_rows:[earlyRow],full_evidence_rows:[fullRow],now:NOW});
 assert.equal(bridge.early_bridge.accepted.length,1);
 const row=bridge.shortlist[0];
 assert.equal(row.preselection_metric_router.status,'CLOSED');
 assert.ok(row.preselection_routed_metric_count>=5);
 assert.equal(row.preselection_htx_execution_only_mandatory,true);
 assert.equal(row.preselection_external_execution_substitution,false);
 assert.equal(row.preselection_cross_venue_confirmed,true);
 assert.ok(row.early_candidate_operational_priority_0_100>80);
});

test('external evidence cannot substitute sub-100k HTX Futures turnover',()=>{
 const bridge=applyEarlyCandidateBridge({discovery_prefilter:{shortlist:[],counts:{},parameters:{max_shortlist:24}},scan:{contracts:[stage0(80000)]},deep_check_queue:{queue:[{contract:'AAA-USDT'}]},early_rows:[earlyRow],full_evidence_rows:[fullRow],now:NOW});
 assert.equal(bridge.early_bridge.accepted.length,0);
 assert.equal(bridge.early_bridge.rejected[0].reason,'HTX_FUTURES_24H_TURNOVER_BELOW_100K');
});

test('preselection router fact reaches one canonical object and both outputs',()=>{
 const bridge=applyEarlyCandidateBridge({discovery_prefilter:{shortlist:[],counts:{},parameters:{max_shortlist:24}},scan:{contracts:[stage0(150000)]},deep_check_queue:{queue:[{contract:'AAA-USDT'}]},early_rows:[earlyRow],full_evidence_rows:[fullRow],now:NOW});
 const discovery=bridge.shortlist[0];
 const free={version:'free-source-runtime-summary-v4-lifecycle-owner-20260925',status:'CLOSED',owner:'source-registry.mjs',registry:{status:'CLOSED',entries:[]},entry_funnel:{status:'CLOSED',blockers:[],blocker_details:[],has_unknown_reason:false},continuous_collector_status:'PARTIAL_REALTIME_COVERAGE',hot_cycle_external_request_delta:0,d1_write_delta:0};
 const bundle=buildRuntimeCanonicalBundle({contract:'AAA-USDT',run_id:'PRESEL:1',snapshot_id:'PRESEL:1',observed_ts:NOW,discovery_row:discovery,publication_shadow:{entry_signal:{state:'OBSERVE',direction:null,reason:'TRIGGER_NOT_CLOSED'},score_interval:{score_lower_bound:50}},free_source_summary:free});
 assert.equal(bundle.status,'CLOSED');
 assert.equal(bundle.manual.ok,true);assert.equal(bundle.telegram.ok,true);
 assert.equal(bundle.manual.analytical_fingerprint,bundle.telegram.analytical_fingerprint);
 assert.match(bundle.manual.text,/Предвыбор источников/);
 assert.match(bundle.telegram.message,/Предвыбор источников/);
});
