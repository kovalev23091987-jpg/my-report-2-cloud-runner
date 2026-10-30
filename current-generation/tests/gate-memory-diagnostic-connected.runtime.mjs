import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

const root=path.resolve(process.env.REPORT2_GATE_DIAG_RUNTIME||'current-generation/files');
const load=name=>import(pathToFileURL(path.join(root,'src',name)));
const [audit,pub,binding,facts,roles,summary,blocks,rendered,priorities]=await Promise.all([
 load('observation-source-role-audit.mjs'),load('canonical-publication.mjs'),
 load('gate-official-asset-binding.mjs'),load('inherited-fact-contract.mjs'),
 load('source-role-consumer.mjs'),load('manual-run-summary.mjs'),
 load('block-decision-use-audit.mjs'),load('block-result-context.mjs'),
 load('candidate-evidence-v2-runtime.mjs')]);
const runner=fs.readFileSync(path.join(root,'runner-main.mjs'),'utf8');
const worker=fs.readFileSync(path.join(root,'src/worker.js'),'utf8');
const beforeRunner=fs.readFileSync('current-generation/tests/fixtures/gate-memory-before-20261019/runner-main.mjs','utf8');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const between=(s,a,b)=>{const i=s.indexOf(a),j=s.indexOf(b,i);assert(i>=0&&j>i);return s.slice(i,j);};
const loaderSource=s=>between(s,'async function loadCanonicalRunOutput(','\nfunction finite(');
const closure=between(runner,'  // Invocation-local, six entries at most','  const liquidationRiskByContract=');
const hook=between(worker,"  if(typeof env?.REPORT2_GATE_BINDING_DIAGNOSTIC_BIND==='function')",'\n');
const sha=b=>createHash('sha256').update(b).digest('hex');
const inputPath='checkpoints/actual-zec-sent150-original-input-20261007.json.gz';

test('new assembled SQLite output path preserves sealed canonical and legacy output while carrying a real binder refusal in invocation memory',async()=>{
 const originalFetch=globalThis.fetch;globalThis.fetch=()=>{throw Error('NO_SOURCE_NETWORK_IN_OFFLINE_QUALIFICATION');};
 const sql=new DatabaseSync(':memory:');
 try{
  const input=fs.readFileSync(inputPath),raw=JSON.parse(gunzipSync(input));
  const original=raw.rows.find(r=>r.contract_code==='ZEC-USDT').canonical;
  const c=structuredClone(original),contract=c.metadata.contract,observed_ts=c.observed_ts,run_id=c.run_id;
  // Deliberate controlled normalized rows, not reconstructed historical API data.
  const metrics=['funding_rate','oi_change_1h','price_change_4h','taker_balance_1h_raw'];
  const controlled=metrics.map(metric=>facts.normalizeInheritedFact({contract_code:contract,metric,
   source:'Gate Public Futures',venue:'GATE',market_type:'USDT_PERP',value:null,
   unit:metric==='funding_rate'?'rate_per_settlement':'pct',observed_ts,source_ts:observed_ts-30000,
   max_age_sec:7200,status:'CLOSED',coverage_pct:100,quality_status:'OK',alias_required:true,
   symbol_verified:true,asset_identity_verified:false,source_compatible:true,
   primary_market_id:'ZEC_USDT:GATE:USDT_PERP',window:metric==='price_change_4h'?'4h':'1h'}));
  c.metadata.source_role_view=roles.buildRoleEvidenceView(controlled,{contract,observed_ts});
  c.analytical_fingerprint=pub.canonicalFingerprint(c);
  const sealed=JSON.stringify(c),fp=c.analytical_fingerprint;
  const manual=pub.renderCanonicalManual({canonical:c});
  const manualText=manual.text||'CONTROLLED unchanged saved manual projection';
  sql.exec(`CREATE TABLE canonical_publication_shadow(publication_id TEXT PRIMARY KEY,contract_code TEXT,
   direction TEXT,run_id TEXT,snapshot_id TEXT,wave_id TEXT,observed_ts INTEGER,valid_until_ts INTEGER,
   lifecycle_event TEXT,canonical_state TEXT,canonical_json TEXT,presentation_inputs_json TEXT,
   manual_text TEXT,telegram_text TEXT,actionability_status TEXT,actionability_reason TEXT,
   created_ts INTEGER,bound_ts INTEGER)`);
  sql.prepare('INSERT INTO canonical_publication_shadow VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
   'PUB:CONTROLLED_GATE_DIAGNOSTIC',contract,c.direction,run_id,c.snapshot_id,'CONTROLLED_SOURCE_WAVE',
   observed_ts,c.trigger.expires_ts,'OBSERVE',c.state,sealed,'{}',manualText,null,
   'UNASSESSED',null,observed_ts,null);
  const calls=[];
  const db={prepare(q){let args=[];return{bind(...a){args=a;return this;},async all(){
   calls.push({sql:q,args});return{success:true,results:sql.prepare(q).all(...args)};}};},
   usageSnapshot:()=>({requests:0,rows_read:0,rows_written:0,unknown_ops:0})};
  let producerCalls=0;
  const realBinder=async params=>{producerCalls++;return binding.bindGateOfficialAssetIdentity(params);};
  const env={DATA_DB:db};
  const memory=await new AsyncFunction('env','captureGateBindingDiagnostic','bindGateOfficialAssetIdentity',
   'unifiedHttpBudget','evaluateWithinRunReservation','d1RunReservation',closure+'\nreturn {gateDiagnosticFor};')(
   env,audit.captureGateBindingDiagnostic,realBinder,{reserve:()=>{throw Error('NO_PROVIDER_ADMISSION');}},
   ()=>({allowed:false}),{rows_read:1,rows_written:1});
  const params={contract,run_id,public_evidence:{contract_code:contract,evidence:[]},supplemental_context:null,now:observed_ts};
  const returned=await env.REPORT2_PUBLIC_ASSET_BINDING(params);
  assert.equal(returned.reason,'OFFICIAL_HTX_EXACT_TOKEN_REFERENCE_REQUIRED');
  assert.equal(returned.status,'NOT_CLOSED');assert.equal(returned.network_calls,0);
  assert.equal(memory.gateDiagnosticFor(c),null);
  new Function('env','contract','canonicalRunId','stage392SnapshotId','now','canonicalAnalyticalBundle',hook)(
   env,contract,run_id,c.snapshot_id,observed_ts,{canonical:c});
  const makeLoader=source=>new Function('auditCanonicalCandidateSet','classifyCanonicalRunCompletion',
   'sourceCollectionPriorityProof','auditObservationSourceRoles','projectGateSourceDiagnostic',
   'auditCanonicalBlockDecisionUse','auditRenderedBlockResults','loadExecutionReportSource',
   'enforceManualBlockCoverage','formatManualRunSummary','auditExecutionReportRendering',
   loaderSource(source)+'\nreturn loadCanonicalRunOutput;')(
   summary.auditCanonicalCandidateSet,summary.classifyCanonicalRunCompletion,
   priorities.sourceCollectionPriorityProof,audit.auditObservationSourceRoles,audit.projectGateSourceDiagnostic,
   blocks.auditCanonicalBlockDecisionUse,rendered.auditRenderedBlockResults,
   async()=>null,summary.enforceManualBlockCoverage,summary.formatManualRunSummary,()=>({status:'CONTROLLED_UNCHANGED_UNRELATED_RENDER_AUDIT'}));
  const options={runId:run_id,source:'CONTROLLED_SQLITE',generation:'CONTROLLED',head:'CONTROLLED',cron:null,candidateContracts:[contract]};
  const baseline=await makeLoader(beforeRunner)(db,options),current=await makeLoader(runner)(db,{...options,gate_diagnostic_for:memory.gateDiagnosticFor});
  assert.equal(current.candidates.length,1);assert.equal(baseline.candidates.length,1);
  const diagnostic=current.candidates[0].gate_source_diagnostic;
  assert.equal(diagnostic.first_binding.carrier_status,'CAPTURED');
  assert.equal(diagnostic.first_binding.reason,returned.reason);
  assert.equal(diagnostic.normalized_rows_status,'CAPTURED');assert.equal(diagnostic.rows.length,4);
  assert(diagnostic.rows.every(r=>r.decision_usable===false&&r.identity.asset_identity_verified===false));
  const scrub=o=>{const x=structuredClone(o);delete x.generated_at;for(const r of x.candidates)delete r.gate_source_diagnostic;return x;};
  assert.deepEqual(scrub(current),scrub(baseline));assert.deepEqual(calls[0],calls[1]);
  assert.equal(calls.length,2);assert.equal(producerCalls,1);
  assert.equal(sql.prepare('SELECT canonical_json FROM canonical_publication_shadow').get().canonical_json,sealed);
  assert.equal(JSON.stringify(c),sealed);assert.equal(pub.canonicalFingerprint(c),fp);
  assert.deepEqual(pub.renderCanonicalManual({canonical:c}),manual);
  assert.equal(current.candidates[0].canonical.analytical_fingerprint,fp);
  // A new invocation cannot infer the discarded/historical first refusal.
  const historical=await makeLoader(runner)(db,options);
  assert.equal(historical.candidates[0].gate_source_diagnostic.first_binding.carrier_status,'UNKNOWN');
  assert.equal(historical.candidates[0].gate_source_diagnostic.first_binding.reason,null);
  assert.deepEqual(scrub(historical),scrub(baseline));assert.deepEqual(calls[2],calls[0]);
  const witness={schema:'NEW_ASSEMBLED_GATE_SQLITE_CARRIER_ACCEPTANCE_V1',PASS:1,FAIL:0,
   fixture_basis:'Saved typed ZEC canonical plus explicitly CONTROLLED normalized Gate identity rows; real existing binder refuses missing HTX reference without network. Not original historical refusal.',
   saved_input_sha256:sha(input),assembled_source530_code:true,actual_native_delivery_or_admission:false,
   real_existing_binder_calls:producerCalls,binder_network_calls:returned.network_calls,
   real_local_SQLite_loader_reads:calls.length,additional_SQL_per_loader:0,
   original_canonical_bytes_unchanged:true,analytical_fingerprint_unchanged:true,manual_text_and_legacy_output_unchanged:true,
   historical_or_missing_invocation_reason:'UNKNOWN',diagnostic_bytes:Buffer.byteLength(JSON.stringify(diagnostic)),
   source1case_31vectors_or_old_suites_repeated:false,deferred_ENTRY_and_physical_storage_executed:false,
   sourceHTTP_nativeSQL_MAIN_Telegram:0,
   limits:'Unchanged unrelated execution/render audits use local stubs; actual assembled helpers, real binder early return, Worker callback, runner memory closure, candidate loader and local SQLite are executed. No whole Worker/native cost/CPU/heap/wire/durableACK qualification.'};
  const witnessPath=process.env.REPORT2_GATE_DIAG_WITNESS||'audit-output/gate-memory-connected/connected-witness.json';
  fs.mkdirSync(path.dirname(witnessPath),{recursive:true});
  fs.writeFileSync(witnessPath,JSON.stringify(witness,null,2)+'\n');
 }finally{sql.close();globalThis.fetch=originalFetch;}
});
