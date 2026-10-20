import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

// One new callable, never executed during packet preparation. All data below
// are CONTROLLED; the failed native proof body and its byte length are absent.
export async function runProofPreflightConnected({runtime_root,baseline_runtime_root,repo_root}) {
  const sha=x=>createHash('sha256').update(x).digest('hex');
  const read=p=>fs.readFileSync(p,'utf8');
  const clone=x=>JSON.parse(JSON.stringify(x));
  const root=runtime_root,base=baseline_runtime_root,repo=repo_root;
  const oldWorker=read(path.join(base,'src/worker.js')),newWorker=read(path.join(root,'src/worker.js'));
  assert.equal(sha(oldWorker),'9eb914a6ad0c8ad332346425a9c528bb3f9ee63c07e2d6eb9a90d89f9f4d34c4');
  assert.equal(sha(newWorker),'e80352300ea533ce25d8eeb934e7057d51da1600d021c3dda5702721a16d3e17');
  const now=1792499938000;
  function loadWriter(text) {
    const a=text.indexOf('function fullEvidenceJson(value, fallback) {');
    const b=text.indexOf('\nasync function runStage392FullEvidenceMaintenance(',a);
    assert.ok(a>0&&b>a);
    return vm.runInNewContext(text.slice(a,b)+'\npersistFullEvidenceShadowRecord',{TextEncoder,Date:{now:()=>now+1000}});
  }
  const beforeWriter=loadWriter(oldWorker),writer=loadWriter(newWorker);
  const {prepareFullEvidenceProofBundle,sealFullEvidenceProofBundleAfterAck}=await import(pathToFileURL(path.join(root,'src/stage392-proof-runtime.mjs')));
  assert.equal(sha(read(path.join(root,'src/stage392-proof-runtime.mjs'))),sha(read(path.join(base,'src/stage392-proof-runtime.mjs'))));
  const {RemoteD1Database}=await import(pathToFileURL(path.join(repo,'runner/report2-d1-adapter.mjs')));
  const {repairExactInstalledSQLBridge}=await import(pathToFileURL(path.join(repo,'runner/sql-bridge-counter-repair.mjs')));
  const bridgeText=repairExactInstalledSQLBridge(read(path.join(repo,'current-generation/tests/fixtures/actual-d1-bridge-20261008.mjs'))).source;
  assert.equal(sha(bridgeText),'06603b69686f7f14b62d1ab551af18555d4f506c4edd7cb7cee3ca58a1e904bf');
  const bridge=(await import('data:text/javascript;base64,'+Buffer.from(bridgeText).toString('base64'))).default;
  const captured=JSON.parse(read(path.join(repo,'audit-fixes/t00/fixtures/d1-schema.json')));
  const table=captured.rows.find(x=>x.name==='full_evidence_shadow_log').sql;
  assert.match(table,/length\(CAST\(stage392_proof_bundle_json AS BLOB\)\)<=262144/);
  const triggers=read(path.join(repo,'current-generation/migrations/011_stage392_post_decision_ack_guard.sql')).split('-- report2:statement-break').map(s=>s.trim()).filter(Boolean);
  function environment() {
    const raw=new DatabaseSync(':memory:');raw.exec(table);for(const sql of triggers)raw.exec(sql);
    const calls=[];let transports=0,prepares=0;
    const local={prepare(sql){let params=[];return {bind(...values){params=values;return this;},async run(){calls.push({sql,params});const r=raw.prepare(sql).run(...params);return {success:true,results:[],meta:{changes:Number(r.changes),rows_read:7,rows_written:Number(r.changes)}};}};},async batch(statements){return Promise.all(statements.map(s=>s.run()));}};
    const token='CONTROLLED_SQLITE_ONLY';
    const db=new RemoteD1Database('https://controlled.invalid/d1',token,{fetchImpl:async(url,options)=>{transports++;return bridge.fetch(new Request(url,options),{DATA_DB:local,REPORT2_CLOUD_BRIDGE_TOKEN:token});}});
    const prepare=db.prepare.bind(db);db.prepare=(...args)=>{prepares++;return prepare(...args);};
    return {raw,db,calls,counts:()=>({transports,prepares}),close:()=>raw.close()};
  }
  function record(id,padding='') {
    return {full_evidence_id:id,shadow_id:'CONTROLLED_SHADOW',contract:'BTW-USDT',observed_ts:now,rules_version:'CONTROLLED_EXISTING_SCHEMA',contract_version:'CONTROLLED',adapters_version:'CONTROLLED',mode:'FULL_EVIDENCE_SHADOW_NO_EXECUTION',strategy_weights_changed:false,fixed_decision_weights:{CROSS_EXCHANGE_DERIVATIVES:35,MARKET_STRENGTH_SPOT:30,SMART_MONEY_ONCHAIN:20,SUPPORTING_RISK:15},htx_execution_gate_closed:false,decision:{dc_long:null,dc_short:null,live_probability:null,full_decision_eligible:false,live_signal:false,validated:false,telegram_started:false,trading_execution:false,dq_status:'PARTIAL'},calibration_link:{automatic_weight_tuning_enabled:false},safety:{missing_data_coerced_to_zero:false,cross_venue_dispersion_called_conflict:false},data_quality:{status:'PARTIAL',usable_items:0,items_total:0,independent_evidence_groups:0,observed_weight_pct:null,uncertainty_flags:[]},missing_weighted_chains:[],chain_status:{},conflicts:[],alias_verification:{},evidence_compact:[],prior_htx_shadow:{},controlled_padding:padding};
  }
  const prepare=rec=>prepareFullEvidenceProofBundle({record:rec,contract_code:rec.contract,snapshot_id:'CONTROLLED_SNAPSHOT',observed_ts:now,shadow_decision:{},committed_ts:null});
  const size=prepared=>Buffer.byteLength(JSON.stringify(prepared.bundle),'utf8');
  function padded(id,target) {
    const empty=record(id),initial=prepare(empty),n=target-size(initial);assert.ok(n>=0);
    const rec=record(id,'a'.repeat(n)),prepared=prepare(rec);assert.equal(size(prepared),target);
    return {rec,prepared};
  }
  const controls=[];
  const big=padded('CONTROLLED_OVERSIZE',262145);
  const old=environment();
  try {
    const result=await beforeWriter({DATA_DB:old.db},big.rec,{stage392_prepared_proof_bundle:big.prepared});
    assert.equal(result.persisted,false);assert.equal(result.status,'PARTIAL');assert.match(result.error,/CHECK constraint failed: stage392_proof_bundle_json/);
    assert.deepEqual(old.counts(),{transports:1,prepares:1});assert.equal(old.db.usageSnapshot().unknown_ops,1);
    const saved=JSON.parse(read(path.join(repo,'checkpoints/telegram-native-failure-20261020/native-39423678954/members/report2-failure-accounting.json')));
    const nativeFailure=saved.usage_before.unmeasured_receipts.find(r=>r.target==='full_evidence_shadow_log');
    const controlledFailure=old.db.usageSnapshot().unmeasured_receipts.find(r=>r.target==='full_evidence_shadow_log');
    assert.ok(nativeFailure&&controlledFailure);
    for(const key of ['operation','target','sql_kind','sql_sha256','http_status','failure_class'])assert.equal(controlledFailure[key],nativeFailure[key]);
    assert.equal(sealFullEvidenceProofBundleAfterAck(big.prepared,result).status,'FAIL_CLOSED');
    controls.push({case:'actual_captured_SQLite_CHECK_saved_bridge_RemoteD1_baseline_failure',controlled_unknown_ops:1,failed_native_body_recovered:false});
  } finally {old.close();}
  const refused=environment();
  try {
    const snapshot=clone(refused.db.usageSnapshot());
    const result=await writer({DATA_DB:refused.db},big.rec,{stage392_prepared_proof_bundle:big.prepared});
    assert.equal(result.status,'REFUSED_PROOF_STORAGE_CONTRACT');assert.equal(result.proof_bundle_bytes,262145);assert.equal(result.hot_path_statements,0);assert.equal(result.persisted,false);
    assert.deepEqual(refused.counts(),{transports:0,prepares:0});assert.deepEqual(refused.db.usageSnapshot(),snapshot);
    assert.equal(sealFullEvidenceProofBundleAfterAck(big.prepared,result).status,'FAIL_CLOSED');
    controls.push({case:'same_controlled_oversize_refused_before_prepare_no_ACK',bytes:result.proof_bundle_bytes});
  } finally {refused.close();}
  for(const target of [null,262144]) {
    const sample=target===null?{rec:record('CONTROLLED_SMALL'),prepared:null}:padded('CONTROLLED_LIMIT',target);sample.prepared??=prepare(sample.rec);
    const a=environment(),b=environment();
    try {
      const oldResult=await beforeWriter({DATA_DB:a.db},sample.rec,{stage392_prepared_proof_bundle:sample.prepared});
      const newResult=await writer({DATA_DB:b.db},sample.rec,{stage392_prepared_proof_bundle:sample.prepared});
      assert.equal(newResult.status,'CLOSED');assert.deepEqual(clone(newResult),clone(oldResult));assert.deepEqual(b.calls,a.calls);
      const stored=b.raw.prepare('SELECT stage392_proof_bundle_json FROM full_evidence_shadow_log').get().stage392_proof_bundle_json;
      assert.equal(stored,JSON.stringify(sample.prepared.bundle));assert.deepEqual(b.db.usageSnapshot(),a.db.usageSnapshot());
      const sealed=sealFullEvidenceProofBundleAfterAck(sample.prepared,newResult);assert.equal(sealed.status,'CLOSED');assert.equal(sealed.bundle.execution_gate.status,'NOT_CLOSED');assert.equal(sealed.bundle.full_evidence.decision.telegram_started,false);
      const duplicate=await writer({DATA_DB:b.db},sample.rec,{stage392_prepared_proof_bundle:sample.prepared});assert.equal(duplicate.status,'DEDUPLICATED_NO_FACTUAL_ACK');assert.equal(sealFullEvidenceProofBundleAfterAck(sample.prepared,duplicate).status,'FAIL_CLOSED');
      controls.push({case:target===null?'valid_small_SQL_bindings_bytes_costs_unchanged':'exact_existing_262144_byte_boundary_accepted',bytes:Buffer.byteLength(stored),duplicate_does_not_mint_ACK:true});
    }finally{a.close();b.close();}
  }
  const legacy=environment();
  try {
    const rec=record('CONTROLLED_LEGACY');const result=await writer({DATA_DB:legacy.db},rec);
    assert.equal(result.status,'CLOSED');assert.equal(legacy.raw.prepare('SELECT stage392_proof_bundle_json FROM full_evidence_shadow_log').get().stage392_proof_bundle_json,null);
    assert.equal(sealFullEvidenceProofBundleAfterAck(null,result).status,'FAIL_CLOSED');controls.push({case:'legacy_absent_NULL_unchanged_not_prepared_proof'});
  }finally{legacy.close();}
  const circular={};circular.self=circular;
  for(const [name,bundle,error] of [['array',[],'NOT_OBJECT'],['scalar',false,'NOT_OBJECT'],['circular',circular,'NOT_SERIALIZABLE'],['bigint',{n:1n},'NOT_SERIALIZABLE'],['utf8',prepare(record('CONTROLLED_UTF8','я'.repeat(132000))).bundle,'EXCEEDS_EXISTING']]) {
    const e=environment();try {
      const result=await writer({DATA_DB:e.db},record('CONTROLLED_'+name),{stage392_prepared_proof_bundle:{bundle}});assert.equal(result.status,'REFUSED_PROOF_STORAGE_CONTRACT');assert.match(result.error,new RegExp(error));assert.deepEqual(e.counts(),{transports:0,prepares:0});assert.equal(result.persisted,false);
      if(name==='utf8')assert.ok(JSON.stringify(bundle).length<262144&&result.proof_bundle_bytes>262144);
      controls.push({case:name+'_refused_before_SQL',bytes:result.proof_bundle_bytes});
    } finally {e.close();}
  }
  const invalid=environment();try {
    const result=await writer({DATA_DB:invalid.db},record('CONTROLLED_INVALID_PROOF'),{stage392_prepared_proof_bundle:{bundle:{}}});
    assert.equal(result.status,'PARTIAL');assert.match(result.error,/stage392 full evidence proof contract invalid/);assert.equal(invalid.db.usageSnapshot().unknown_ops,1);assert.equal(result.persisted,false);
    controls.push({case:'existing_trigger_still_rejects_small_invalid_proof_no_guard_weakening'});
  } finally {invalid.close();}
  return {schema:'ONE_NEW_EXISTING_PROOF_STORAGE_PREFLIGHT_CONNECTED_RESULT_V1',status:'PASS',controls,controlled_only:true,SQLite_schema_sha256:sha(table),bridge_sha256:sha(bridgeText),native_failed_proof_bytes:null,native_failed_condition_subterm:null,native_failed_statement_cost:null,historical_unknown_operations_changed:false,SQL_schema_limits_forms_weights_gates_changed:false,new_nativeSQL:0,providerHTTP:0,MAIN:0,Telegram:0,valid_local_ACK_is_not_native_ACK:true};
}
