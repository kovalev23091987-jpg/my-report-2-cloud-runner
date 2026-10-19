import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {RemoteD1Database} from '../../runner/report2-d1-adapter.mjs';
import {repairExactInstalledSQLBridge} from '../../runner/sql-bridge-counter-repair.mjs';
import {retainedSchemaSql} from '../../runner/retained-history.mjs';

const root=path.resolve(process.env.REPORT2_COMPACT_COST_RUNTIME||'runtime');
const sha=b=>createHash('sha256').update(b).digest('hex');
const target='src/v3-telegram-lifecycle-sidecar.mjs';
const beforeText=fs.readFileSync('checkpoints/source-read-all-exits-20261019/sidecar.before.mjs','utf8');
const currentText=fs.readFileSync(path.join(root,target),'utf8');
assert.equal(sha(beforeText),'d7a35968052d52279d1cda5704b64dae8b5450d87b1243aa5b91e0671c5d2d7a');
assert.equal(sha(currentText),'1c3ad1e6f3aef86703aef4663773d729ba11e6060a51708012f98df5e25c1dde');
const helperImport="import {prepareLifecycleTransition} from './v3-telegram-runtime.mjs';";
async function loadSidecar(source,{lateFailure=false}={}){
  let text=source;
  if(lateFailure){
    assert.equal(text.split(helperImport).length-1,1);
    // An explicit controlled downstream failure exercises the late return.
    // Persistence, dispatch, ENTRY and their tests are not executed here.
    text=text.replace(helperImport,'const prepareLifecycleTransition=(...args)=>globalThis.__report2ControlledLateFailure(...args);');
  }
  text=text.replace(/from '(\.\/[^']+)'/g,(_,name)=>`from '${pathToFileURL(path.join(root,'src',name)).href}'`);
  return import('data:text/javascript;base64,'+Buffer.from(text).toString('base64'));
}
const bridgeText=repairExactInstalledSQLBridge(fs.readFileSync('current-generation/tests/fixtures/actual-d1-bridge-20261008.mjs','utf8')).source;
assert.equal(sha(bridgeText),'06603b69686f7f14b62d1ab551af18555d4f506c4edd7cb7cee3ca58a1e904bf');
const bridge=(await import('data:text/javascript;base64,'+Buffer.from(bridgeText).toString('base64'))).default;
const schema=`
CREATE TABLE v3_early_candidate_wave(wave_id TEXT,contract_code TEXT,generation TEXT,first_seen_ts INTEGER,lifecycle_stage TEXT,direction_hint TEXT,direction_state TEXT,early_detection_quality_0_100 REAL,last_seen_ts INTEGER);
CREATE TABLE shadow_decision_log(shadow_id TEXT,contract_code TEXT,observed_ts INTEGER,rules_version TEXT,direction_hint TEXT,eq_status TEXT,dq_status TEXT,stage TEXT,data_sufficiency TEXT,evidence_flags_json TEXT,created_ts INTEGER);
CREATE TABLE final_decision_integration_shadow(decision_id TEXT,contract_code TEXT,observation_ts INTEGER,direction TEXT,directional_quality TEXT,entry_action TEXT,entry_quality TEXT,data_quality TEXT,execution_quality TEXT,independence_state TEXT,timing_state TEXT,risk_state TEXT,position_state TEXT,management_action TEXT,hard_veto INTEGER,persisted_ts INTEGER);
CREATE TABLE final_decision_telegram_context_shadow(decision_id TEXT,score_lower_bound REAL,score_upper_bound REAL,valid_until_ts INTEGER,status TEXT);
CREATE TABLE v3_user_lifecycle_shadow(contract TEXT,direction TEXT,wave_id TEXT,rules_version TEXT,status TEXT,reason TEXT,observation_ts INTEGER,valid_until_ts INTEGER,updated_ts INTEGER);
CREATE TABLE canonical_publication_shadow(publication_id TEXT PRIMARY KEY,contract_code TEXT,run_id TEXT,snapshot_id TEXT,wave_id TEXT,direction TEXT,canonical_state TEXT,analytical_fingerprint TEXT,observed_ts INTEGER,created_ts INTEGER,canonical_json TEXT);`;

async function executeSidecar(module,{lateFailure=false}={}){
  const raw=new DatabaseSync(':memory:');raw.exec(schema);
  raw.exec(retainedSchemaSql('canonical_publication_shadow',raw.prepare('PRAGMA table_info(canonical_publication_shadow)').all()).join(';'));
  const now=1792414680000,run='CONTROLLED_INITIAL_SOURCE_COST_EXITS';
  const handoffs=['CONTROLLED_A-USDT','CONTROLLED_B-USDT'].map((contract_code,i)=>({contract_code,source_run_id:run,wave_id:'CONTROLLED_WAVE_'+i,scan_ts:now-120000,deep_started_ts:now-110000,deep_completed_ts:now-1000,state:'COMPLETED',execution_status:'COMPLETED',handoff_direction:lateFailure?'LONG':null,data_sufficiency:'PARTIAL'}));
  for(const h of handoffs){
    raw.prepare('INSERT INTO v3_early_candidate_wave VALUES(?,?,?,?,?,?,?,?,?)').run(h.wave_id,h.contract_code,'CONTROLLED',now-120001,'DISCOVERY',lateFailure?'LONG':null,'CONTROLLED',75,now-2000);
    if(lateFailure)raw.prepare('INSERT INTO shadow_decision_log VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('CONTROLLED_SHADOW_'+h.contract_code,h.contract_code,now-2000,'CONTROLLED','LONG','SHADOW_MEASURABLE','PARTIAL','SHADOW_OBSERVE_LONG_BIAS','PARTIAL','{}',now-1500);
  }
  const calls=[],reported=lateFailure?[30,20,2,20]:[30,20,2,20,60];let transports=0,lateCalls=0;
  const local={prepare(sql){let args=[];return{bind(...v){args=v;return this;},async all(){
    const index=calls.length;assert(index<reported.length,'NO_NEW_SQL');calls.push({sql,args});
    return {success:true,results:raw.prepare(sql).all(...args),meta:{rows_read:reported[index],rows_written:0}};
  }};},async batch(statements){return Promise.all(statements.map(s=>s.all()));}};
  const token='CONTROLLED_LOCAL_ONLY';
  const db=new RemoteD1Database('https://controlled.invalid/d1',token,{fetchImpl:async(u,options)=>{transports++;return bridge.fetch(new Request(u,options),{DATA_DB:local,REPORT2_CLOUD_BRIDGE_TOKEN:token});}});
  // Match the existing ordinary retained-reader route; archived locator fetches
  // remain forbidden, and no new native schema/query qualification is claimed.
  db.enableRetainedHistory({fetch_impl:()=>{throw Error('NO_ARCHIVE_HTTP');},request_admit:()=>{throw Error('NO_ARCHIVE_GRANT');}});
  globalThis.__report2ControlledLateFailure=async (_db,ctx)=>{lateCalls++;assert.equal(ctx.dispatch_enabled,false);return{status:'PARTIAL',reason:'CONTROLLED_DOWNSTREAM_PERSISTENCE_HELPER_FAILURE'};};
  try{
    const result=await module.runV3TelegramLifecycleSidecar(db,{source_run_id:run,now_ts:now,canonical_required:!lateFailure,dispatch_enabled:false,completed_handoffs:{status:'CLOSED',source_run_id:run,handoffs}});
    const usage=db.usageSnapshot();assert.equal(calls.length,reported.length);assert.equal(transports,1);assert.equal(usage.requests,reported.length);assert.equal(usage.rows_written,0);assert.equal(usage.unknown_ops,0);
    if(!lateFailure)assert.match(calls[4].sql,/FROM report2_canonical_retained_v1/);
    return{result,usage,calls,transports,lateCalls,reported};
  }finally{delete globalThis.__report2ControlledLateFailure;raw.close();}
}

test('ONE NEW assembled case: compact provider cuts and successful/late sidecar cost projections keep decisions, SQL and existing bounds',async()=>{
  const oldFetch=globalThis.fetch;globalThis.fetch=()=>{throw Error('NO_REAL_SOURCE_OR_NATIVE_NETWORK');};
  try{
    const repairOnly=process.env.REPORT2_COMPACT_COST_REPAIR_ONLY==='1';
    const normalBefore=repairOnly?null:await loadSidecar(beforeText),normalCurrent=repairOnly?null:await loadSidecar(currentText);
    const lateBefore=await loadSidecar(beforeText,{lateFailure:true}),lateCurrent=await loadSidecar(currentText,{lateFailure:true});
    assert.deepEqual(lateCurrent.V3_TELEGRAM_LIFECYCLE_SIDECAR_BUDGET,lateBefore.V3_TELEGRAM_LIFECYCLE_SIDECAR_BUDGET);
    assert.equal(lateCurrent.V3_TELEGRAM_LIFECYCLE_SIDECAR_BUDGET.rows_read,160);
    const paths=[];
    for(const lateFailure of (repairOnly?[true]:[false,true])){
      const old=await executeSidecar(lateFailure?lateBefore:normalBefore,{lateFailure});
      const next=await executeSidecar(lateFailure?lateCurrent:normalCurrent,{lateFailure});
      assert.equal(next.result.status,lateFailure?'PERSISTENCE_NOT_CLOSED':'CLOSED');
      assert.equal(old.result.source_read_costs,undefined);
      const {source_read_costs:cost,...same}=next.result;assert.deepEqual(same,old.result);
      assert.deepEqual(next.calls,old.calls);assert.deepEqual(next.usage,old.usage);assert.equal(next.transports,old.transports);assert.equal(next.lateCalls,lateFailure?1:0);
      assert.equal(cost.status,'REPORTED_COUNTERS_COMPLETE');assert.equal(cost.total_rows_read,lateFailure?72:132);assert.equal(cost.total_rows_written,0);
      assert.deepEqual(cost.queries.map(x=>x.rows_read),next.reported);assert.equal(cost.expected_queries,lateFailure?4:5);assert.equal(cost.admission_authorized,false);assert.equal(cost.additional_SQL+cost.additional_source_HTTP,0);
      assert.equal(cost.caller_evaluation_ts,1792414680000);assert.equal(cost.basis,'ALREADY_RETURNED_BATCH_REPLY_META_NOT_WHOLE_DAY_OR_PROVIDER_HEADROOM');assert.equal(cost.scope,'BATCH_STATEMENT_META_ONLY_NOT_ADAPTER_OR_RESTORER_EXTRA_WORK');
      assert(!JSON.stringify(cost).includes('SELECT '));assert(!JSON.stringify(cost).includes('CONTROLLED_A-USDT'));
      const serialized=JSON.parse(JSON.stringify({schema:'telegram-info-proof-v1',lifecycle:next.result}));assert.deepEqual(serialized.lifecycle.source_read_costs,cost);
      paths.push({status:next.result.status,CONTROLLED_reported_metadata:next.reported,actual_local_SQL_queries:next.calls.length,local_bridge_transports:next.transports,late_persistence_helper_injected:lateFailure,projection_bytes:Buffer.byteLength(JSON.stringify(cost)),decisions_SQL_and_usage_unchanged:true});
    }
    const component=await import(pathToFileURL(path.resolve(process.env.REPORT2_COMPACT_PROVIDER_HARNESS)));
    assert.equal(typeof component.runProviderCaptureCompactConnected,'function');
    const provider=await component.runProviderCaptureCompactConnected({runtime_root:root,runner_text:fs.readFileSync(path.join(root,'runner-main.mjs'),'utf8'),native_original_root:path.resolve('checkpoints/natural-39255752857')});
    assert(Buffer.byteLength(JSON.stringify(provider))<=16384);
    const witness={schema:'ONE_NEW_COMPACT_PROVIDER_AND_SOURCE_EXIT_CONNECTED_WITNESS_V1',new_cases:1,PASS:1,FAIL:0,source_exit_paths:paths,provider,bridge_source_sha256:sha(bridgeText),retained_view_route_exercised:true,original_native132_per_query_split:null,native182_overrun_fixed:false,sourceHTTP_nativeSQL_MAIN_Telegram:0,ENTRY_followup_or_physicalstorage_performed:false,old_accepted_tests_repeated:false,previous_normal_assertions_reused:repairOnly?{run:39261526101,head:'7344acc4d3eaa05af3c1b38917bd2027720f7e5e',artifact:12190147880,digest:'sha256:80693a31697c0ec978ccc380ee127f7bfe9490b85b7ca3d94995bcacab964944',basis:'Normal loop completed before the first late-helper call failed on fixture signature; original failed-case log and source preserved. Previous normal result object was not written and is not reconstructed.',normal_case_reexecuted:false}:null,limits:'Actual local SQLite + exact saved06603 bridge + real RemoteD1 adapter/retained query rewrite. Per-statement counters are CONTROLLED, not a reconstruction of native132/182. Normal canonical rows are absent in the controlled fixture; the late failure uses an explicitly injected persistence helper. No native/ENTRY/dispatch/persistence/whole-day/provider admission qualification.'};
    assert(process.env.REPORT2_COMPACT_COST_WITNESS);fs.writeFileSync(process.env.REPORT2_COMPACT_COST_WITNESS,JSON.stringify(witness,null,2)+'\n');
  }finally{globalThis.fetch=oldFetch;}
});
