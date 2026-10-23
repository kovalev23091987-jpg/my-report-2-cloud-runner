import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {RemoteD1Database} from '../../runner/report2-d1-adapter.mjs';
import {repairExactInstalledSQLBridge} from '../../runner/sql-bridge-counter-repair.mjs';

const root=path.resolve(process.env.REPORT2_RETURNED_COUNTERS_RUNTIME||'current-generation/files');
const sha=b=>createHash('sha256').update(b).digest('hex');
const current=await import(pathToFileURL(path.join(root,'src/v3-telegram-lifecycle-sidecar.mjs')));
const beforeSource=fs.readFileSync('current-generation/tests/fixtures/telegram-source-read-before-20261019/v3-telegram-lifecycle-sidecar.mjs','utf8');
const baselineSource=beforeSource.replace(/from '(\.\/[^']+)'/g,(_,name)=>`from '${pathToFileURL(path.join(root,'src',name)).href}'`);
const before=await import('data:text/javascript;base64,'+Buffer.from(baselineSource).toString('base64'));
const bridgeOriginal=fs.readFileSync('current-generation/tests/fixtures/actual-d1-bridge-20261008.mjs','utf8');
const bridgeSource=repairExactInstalledSQLBridge(bridgeOriginal).source;
assert.equal(sha(bridgeSource),'06603b69686f7f14b62d1ab551af18555d4f506c4edd7cb7cee3ca58a1e904bf');
const bridge=(await import('data:text/javascript;base64,'+Buffer.from(bridgeSource).toString('base64'))).default;

// The SQL really executes locally. Its reported D1 metadata below is explicitly
// CONTROLLED, not a reconstruction of the five unavailable historical costs.
const schema=`
CREATE TABLE v3_early_candidate_wave(wave_id TEXT,contract_code TEXT,generation TEXT,first_seen_ts INTEGER,lifecycle_stage TEXT,direction_hint TEXT,direction_state TEXT,early_detection_quality_0_100 REAL,last_seen_ts INTEGER);
CREATE TABLE shadow_decision_log(shadow_id TEXT,contract_code TEXT,observed_ts INTEGER,rules_version TEXT,direction_hint TEXT,eq_status TEXT,dq_status TEXT,stage TEXT,data_sufficiency TEXT,evidence_flags_json TEXT,created_ts INTEGER);
CREATE TABLE final_decision_integration_shadow(decision_id TEXT,contract_code TEXT,observation_ts INTEGER,direction TEXT,directional_quality TEXT,entry_action TEXT,entry_quality TEXT,data_quality TEXT,execution_quality TEXT,independence_state TEXT,timing_state TEXT,risk_state TEXT,position_state TEXT,management_action TEXT,hard_veto INTEGER,persisted_ts INTEGER);
CREATE TABLE final_decision_telegram_context_shadow(decision_id TEXT,score_lower_bound REAL,score_upper_bound REAL,valid_until_ts INTEGER,status TEXT);
CREATE TABLE v3_user_lifecycle_shadow(contract TEXT,direction TEXT,wave_id TEXT,rules_version TEXT,status TEXT,reason TEXT,observation_ts INTEGER,valid_until_ts INTEGER,updated_ts INTEGER);
CREATE TABLE canonical_publication_shadow(publication_id TEXT,contract_code TEXT,run_id TEXT,snapshot_id TEXT,wave_id TEXT,direction TEXT,canonical_state TEXT,analytical_fingerprint TEXT,observed_ts INTEGER,created_ts INTEGER,canonical_json TEXT);`;

async function sourceRead(module,{missing=false,failed=false}={}){
 const raw=new DatabaseSync(':memory:');raw.exec(schema);
 const calls=[],reported=[40,18,3,28,93];let bridgeCalls=0;
 const local={prepare(sql){let args=[];return{bind(...values){args=values;return this;},async all(){
  const index=calls.length;calls.push({sql,args});assert.match(sql,/^SELECT /);
  const results=raw.prepare(sql).all(...args),meta={rows_read:reported[index],rows_written:0};
  if(missing&&index===2)delete meta.rows_read;
  return{success:!(failed&&index===2),results,meta};
 }};},async batch(statements){return Promise.all(statements.map(s=>s.all()));}};
 const token='CONTROLLED_LOCAL_ONLY';
 const db=new RemoteD1Database('https://controlled.invalid/d1',token,{fetchImpl:async(u,options)=>{
  bridgeCalls++;return bridge.fetch(new Request(u,options),{DATA_DB:local,REPORT2_CLOUD_BRIDGE_TOKEN:token});
 }});
 const now=1792409790000,run='CONTROLLED_SAVED_SHAPE_RUN';
 try{
  const result=await module.runV3TelegramLifecycleSidecar(db,{source_run_id:run,now_ts:now,canonical_required:true,dispatch_enabled:true,
   completed_handoffs:{status:'CLOSED',source_run_id:run,handoffs:[{contract_code:'CONTROLLED_A-USDT',scan_ts:now-120000},{contract_code:'CONTROLLED_B-USDT',scan_ts:now-120000}]}});
  const usage=db.usageSnapshot();assert.equal(calls.length,5);assert.equal(bridgeCalls,1);assert.equal(usage.requests,5);assert.equal(usage.rows_written,0);assert.equal(result.transitions.length,0);
  return{result,usage,calls,bridgeCalls};
 }finally{raw.close();}
}

test('ONE NEW assembled returned-counter integration: existing provider cuts and exact source batch costs remain technical, without new IO or admission',async()=>{
 const oldFetch=globalThis.fetch;globalThis.fetch=()=>{throw Error('NO_REAL_SOURCE_OR_NATIVE_NETWORK');};
 try{
  assert.equal(current.V3_TELEGRAM_LIFECYCLE_SIDECAR_BUDGET.rows_read,160);
  assert.deepEqual(current.V3_TELEGRAM_LIFECYCLE_SIDECAR_BUDGET,before.V3_TELEGRAM_LIFECYCLE_SIDECAR_BUDGET);
  const old=await sourceRead(before),known=await sourceRead(current);
  assert.equal(old.result.status,'BUDGET_ENVELOPE_EXCEEDED_FAIL_CLOSED');assert.equal(known.result.status,old.result.status);
  assert.deepEqual(known.calls,old.calls);assert.deepEqual(known.usage,old.usage);
  const {source_read_costs:cost,...legacy}=known.result;assert.deepEqual(legacy,old.result);
  assert.equal(cost.status,'REPORTED_COUNTERS_COMPLETE');assert.equal(cost.total_rows_read,182);assert.equal(cost.total_rows_written,0);assert.equal(cost.queries.length,5);assert.deepEqual(cost.queries.map(x=>x.rows_read),[40,18,3,28,93]);assert.equal(cost.admission_authorized,false);assert.equal(cost.additional_SQL+cost.additional_source_HTTP,0);
  const unknown=await sourceRead(current,{missing:true});assert.equal(unknown.result.status,'BUDGET_ENVELOPE_EXCEEDED_FAIL_CLOSED');assert.equal(unknown.usage.unknown_ops,1);assert.equal(unknown.usage.rows_read,179);assert.equal(unknown.result.source_read_costs.queries[2].rows_read,null);assert.equal(unknown.result.source_read_costs.total_rows_read,null);assert.equal(unknown.result.source_read_costs.total_rows_written,0);assert.equal(unknown.result.source_read_costs.known_rows_read_subtotal,179);assert.equal(unknown.result.source_read_costs.admission_authorized,false);
  const partial=await sourceRead(current,{failed:true});assert.equal(partial.result.status,'PARTIAL');assert.equal(partial.usage.unknown_ops,1);assert.equal(partial.result.source_read_costs.queries[2].reply_success,false);assert.equal(partial.result.source_read_costs.total_rows_read,null);assert.equal(partial.result.source_read_costs.queries[2].rows_read,3);
  const providerPath=process.env.REPORT2_PROVIDER_COUNTERS_HARNESS;assert(providerPath,'EXACT_FROZEN_PROVIDER_HARNESS_REQUIRED');
  const provider=await import(pathToFileURL(path.resolve(providerPath)));assert.equal(typeof provider.runProviderCaptureConnected,'function');
  const providerWitness=await provider.runProviderCaptureConnected({runtime_root:root,runner_text:fs.readFileSync(path.join(root,'runner-main.mjs'),'utf8')});
  assert(providerWitness&&typeof providerWitness==='object','BOUNDED_PROVIDER_COMPONENT_WITNESS_REQUIRED');assert(Buffer.byteLength(JSON.stringify(providerWitness))<=16384,'PROVIDER_COMPONENT_WITNESS_BOUND');
  const info=JSON.parse(JSON.stringify({schema:'telegram-info-proof-v1',lifecycle:known.result}));assert.deepEqual(info.lifecycle.source_read_costs,cost);
  const witness={schema:'ONE_NEW_ASSEMBLED_RETURNED_COUNTERS_CONNECTED_WITNESS_V1',new_cases:1,PASS:1,FAIL:0,source_read:{actual_LocalSQLite_queries_per_path:5,CONTROLLED_reported_native_meta:[40,18,3,28,93],unchanged_stagecap:160,unchanged_failure_and_SQL:true,additional_SQL:0,missing_counter_kept_NULL:true,failed_reply_keeps_known_partial_counts:true,bridge:'Exact saved counter-repaired06603 source, local environment; not a new installed/native qualification',actual_historical_per_query_split:null,diagnostic_bytes:Buffer.byteLength(JSON.stringify(cost)),native_unknown_never_cleared:true},provider:providerWitness,old_source14_repaired2_37_or_typed1_14swap_cases_repeated:false,sourceHTTP_nativeSQL_MAIN_Telegram:0,ENTRY_followup_or_physical_storage_executed:false,limits:'Local SQLite and controlled D1 reply metadata. Original saved182 aggregate is not assigned to particular historical queries. This does not fix the underlying native overrun, raise160, grant provider/month/manual capacity, qualify new source data or create trading signals.'};
  const out=process.env.REPORT2_RETURNED_COUNTERS_WITNESS;assert(out);fs.writeFileSync(out,JSON.stringify(witness,null,2)+'\n');
 }finally{globalThis.fetch=oldFetch;}
});
