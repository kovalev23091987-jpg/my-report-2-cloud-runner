import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.resolve(process.env.REPORT2_TEST_RUNTIME||'runtime'),load=n=>import(pathToFileURL(path.join(root,'src',n)));
const [{qualifyEarlyDirectionReceipt:qualify},{resolveCanonicalDirection:resolve,buildRuntimeCanonicalBundle:build}]=await Promise.all([load('early-direction-receipt.mjs'),load('canonical-runtime-adapter.mjs')]);
const read=(zip,file)=>JSON.parse(execFileSync('unzip',['-p',zip,file],{maxBuffer:16*1024*1024}).toString());
const native=read('checkpoints/original-direction-inputs-37945843469.zip','original-direction-inputs.json'),saved=read('checkpoints/post259-original-refusals-37939704771.zip','post259-original-refusals.json'),natural=read('checkpoints/post259-natural-37937215275.zip','report2-run-result.json');
const out={schema:'EARLY_DIRECTION_PREDICATES_RETAINED_COMPONENT_REVIEW_V1',head:process.env.GITHUB_SHA,cloud_run:Number(process.env.GITHUB_RUN_ID),scope:'RETAINED_FIELDS_COMPONENT_RECONSTRUCTION_NOT_COMPLETE_ORIGINAL_ANALYSIS',original_read_complete:false,sourceHTTP:0,D1:0,MAIN:0,Telegram:0,source_clocks_refreshed:false,actual_ENTRY:false,project_complete:false,candidates:[]};
test('original BR and BTR component reconstruction preserves every previous predicate and exposes only the actual failed state',()=>{
 assert.equal(native.status,'READ_NOT_CLOSED');assert.equal(saved.status,'EXACT_REFUSALS_AND_FAIR_QUEUE_READ_CLOSED');
 for(const f of native.features){
  const record=saved.exact_candidates.find(x=>x.contract===f.contract),c=JSON.parse(record.canonical.canonical_json),prior=c.metadata.direction_resolution.early_receipt;
  const d={contract:f.contract,early_candidate_bridge:true,early_candidate_wave_id:c.wave_id,early_candidate_receipt:{status:'CLOSED',contract:f.contract,wave_id:c.wave_id,source_ts:prior.source_ts,available_at:prior.available_at,direction_hint:prior.candidate.direction_raw,direction_state:f.feature.direction_state,evidence:JSON.parse(f.feature.evidence_json),evidence_ids:prior.unassigned_evidence_ids}};
  const q=qualify(d,c.observed_ts),without=structuredClone(q);delete without.predicate_receipt;assert.deepEqual(without,prior);
  assert.deepEqual(q.predicate_receipt.failed_predicates,['DIRECTION_STATE_CLOSED']);
  assert.equal(q.predicate_receipt.evidence_summary.long_domains.length,f.feature.long_evidence_domain_count);assert.equal(q.predicate_receipt.evidence_summary.short_domains.length,f.feature.short_evidence_domain_count);
  assert.equal(resolve({discovery:d,decision_ts:c.observed_ts}).status,'UNKNOWN');
  const reviewed=build({contract:f.contract,run_id:c.run_id,snapshot_id:c.snapshot_id,observed_ts:c.observed_ts,discovery_row:d}).canonical;
  assert.equal(reviewed.state,'REJECTED');assert.equal(reviewed.direction,null);assert.deepEqual(reviewed.metadata.direction_resolution.early_receipt.predicate_receipt,q.predicate_receipt);
  const original=natural.candidates.find(x=>x.publication_id===record.publication_id);assert.equal(original.canonical.state,'REJECTED');assert.ok(JSON.parse(record.shadow.evidence_flags_json).dq_failure_receipt.mandatory_checks.every(x=>x.closed));
  out.candidates.push({contract:f.contract,publication_id:record.publication_id,run_id:c.run_id,snapshot_id:c.snapshot_id,observed_ts:c.observed_ts,predicate_receipt:q.predicate_receipt,old_qualification_fields_exact:true,original_canonical_rewritten:false,reviewed_state:reviewed.state,original_full_analysis_recreated:false,ENTRY_authorized:false});
 }
});
test('assembled canonical stores simultaneous failures while keeping routed direction authority separate',()=>{
 const T=1791552702776,d={contract:'BR-USDT',early_candidate_bridge:true,early_candidate_wave_id:'W',early_candidate_receipt:{status:'NOT_CLOSED',contract:'BTR-USDT',wave_id:'OTHER',source_ts:T-900001,available_at:T+1,direction_hint:'LONG',direction_state:'DIRECTION_NOT_CLOSED',evidence:[{status:'CLOSED',side:'LONG',domain:'RELATIVE_STRENGTH'}]}};
 const c=build({contract:'BR-USDT',run_id:'CONTROLLED_REFUSAL_REVIEW',snapshot_id:'CONTROLLED_REFUSAL_REVIEW',observed_ts:T,discovery_row:d}).canonical;
 assert.equal(c.state,'REJECTED');assert.equal(c.direction,null);assert.deepEqual(c.metadata.direction_resolution.early_receipt.predicate_receipt.failed_predicates,['EARLY_TRANSPORT_CLOSED','EXACT_CONTRACT','EXACT_WAVE','AVAILABLE_AT_DECISION','SOURCE_WITHIN_15_MINUTES','DIRECTION_STATE_CLOSED']);
 const resolved=resolve({route:{state:'OBSERVE',direction:'SHORT'},discovery:d,decision_ts:T});assert.equal(resolved.direction,'SHORT');assert.equal(resolved.authorized_entry_direction,'UNKNOWN');
});
test.after(()=>{fs.mkdirSync('audit-output',{recursive:true});fs.writeFileSync('audit-output/early-direction-predicates-consumer-proof.json',JSON.stringify(out,null,2)+'\n');});
