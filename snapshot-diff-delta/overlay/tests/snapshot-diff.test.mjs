import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import fs from 'node:fs';import {pathToFileURL} from 'node:url';
const runtime=path.resolve(process.env.REPORT2_SNAPSHOT_RUNTIME_DIR||'runtime'),load=n=>import(pathToFileURL(path.join(runtime,'src',n)).href);
const [{buildSnapshotChanges},{buildRuntimeCanonicalBundle}]=await Promise.all([load('snapshot-diff.mjs'),load('canonical-runtime-adapter.mjs')]);
const PREV_TS=1_800_000_000_000,CUR_TS=PREV_TS+300000;
const prevEvidence=[
 {metric:'htx_funding_pct',source:'HTX_OFFICIAL_VIA_REPORT2_HUB',venue:'HTX',status:'CLOSED',source_compatible:true,value:-0.02,unit:'pct'},
 {metric:'oi_change_1h_pct',source:'Bybit Public V5',venue:'BYBIT',status:'CLOSED',source_compatible:true,value:3,unit:'pct'},
];
const curEvidence=[
 {metric:'htx_funding_pct',source:'HTX_OFFICIAL_VIA_REPORT2_HUB',venue:'HTX',status:'CLOSED',source_compatible:true,value:-0.03,unit:'pct'},
 {metric:'oi_change_1h_pct',source:'Bybit Public V5',venue:'BYBIT',status:'CLOSED',source_compatible:true,value:5,unit:'pct'},
 {metric:'rs_vs_btc_1h',source:'OKX Spot Public V5',venue:'OKX',status:'CLOSED',source_compatible:true,value:2,unit:'percentage_points'},
];
const previous={status:'CLOSED',row:{contract_code:'AAA-USDT',observed_ts:PREV_TS,dq_status:'PARTIAL',evidence_compact_json:JSON.stringify(prevEvidence),conflicts_json:'[]'}};

test('R060 diff lines always bind both previous and current timestamps',()=>{
 const d=buildSnapshotChanges({previous_snapshot_context:previous,current_public_evidence:{contract_code:'AAA-USDT',observed_ts:CUR_TS,dq_status:'PARTIAL',evidence:curEvidence,conflicts:[]},observed_ts:CUR_TS});
 assert.equal(d.status,'CLOSED');assert.ok(d.lines.length>=2);
 for(const line of d.lines){assert.match(line,new RegExp(new Date(PREV_TS).toISOString()));assert.match(line,new RegExp(new Date(CUR_TS).toISOString()));}
 assert.ok(d.changed_fact_count>0);assert.equal(d.decision_effect,false);
});

test('no previous snapshot stays explicit and invents no changes',()=>{
 const d=buildSnapshotChanges({previous_snapshot_context:{status:'NO_PREVIOUS_SNAPSHOT',row:null},current_public_evidence:{observed_ts:CUR_TS,evidence:curEvidence},observed_ts:CUR_TS});
 assert.equal(d.status,'NO_PREVIOUS_SNAPSHOT');assert.deepEqual(d.lines,[]);
});

test('canonical runtime sends same timestamped diff to manual and Telegram',()=>{
 const free={version:'x',status:'CLOSED',owner:'source-registry.mjs',registry:{status:'CLOSED',entries:[]},entry_funnel:{status:'CLOSED',blockers:[],blocker_details:[],has_unknown_reason:false},continuous_collector_status:'PARTIAL_REALTIME_COVERAGE',hot_cycle_external_request_delta:0,d1_write_delta:0};
 const b=buildRuntimeCanonicalBundle({contract:'AAA-USDT',run_id:'RUN',snapshot_id:'SNAP',observed_ts:CUR_TS,publication_shadow:{entry_signal:{state:'OBSERVE',direction:null,reason:null},score_interval:{score_lower_bound:60}},public_evidence:{contract_code:'AAA-USDT',observed_ts:CUR_TS,dq_status:'PARTIAL',evidence:curEvidence,conflicts:[]},free_source_summary:free,previous_snapshot_context:previous});
 assert.equal(b.status,'CLOSED');assert.equal(b.canonical.metadata.snapshot_comparison.status,'CLOSED');assert.ok(b.canonical.changes_from_previous.length>0);
 assert.match(b.manual.text,/ИЗМЕНЕНИЯ С ПРЕДЫДУЩЕГО ЗАПУСКА/);assert.match(b.telegram.message,/Изменилось:/);
 assert.equal(b.manual.analytical_fingerprint,b.telegram.analytical_fingerprint);
});

test('worker contains one bounded previous-snapshot read and passes it into canonical bundle',()=>{
 const w=fs.readFileSync(path.join(runtime,'src/worker.js'),'utf8');
 assert.match(w,/loadPreviousEvidenceSnapshot/);
 assert.match(w,/previous_snapshot_context:\s*previousSnapshotContext/);
 const mod=fs.readFileSync(path.join(runtime,'src/snapshot-diff.mjs'),'utf8');
 assert.match(mod,/ORDER BY observed_ts DESC\s+LIMIT 1/);
 assert.doesNotMatch(mod,/\bINSERT\b|\bUPDATE\b|\bDELETE\b|\.run\s*\(|\.exec\s*\(/i);
});
