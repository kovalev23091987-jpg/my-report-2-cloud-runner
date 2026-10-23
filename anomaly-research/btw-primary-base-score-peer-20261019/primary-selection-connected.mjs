// ONE callable new carrier/projection case. UNEXECUTED by this worker.
// No test registration, runner import, provider transport, native SQL or writes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex');
const clone=x=>JSON.parse(JSON.stringify(x));
const bytes=x=>Buffer.byteLength(JSON.stringify(x),'utf8');

export async function runPrimarySelectionDiagnosticConnected({runner_text,retained_report_text}={}){
 const proposal=JSON.parse(await fs.readFile(new URL('./proposal.json',import.meta.url),'utf8'));
 const before=await fs.readFile(new URL('./loader.before.txt',import.meta.url),'utf8');
 assert.equal(hash(runner_text),proposal.after_sha256,'exact proposed assembled runner');
 assert.equal(hash(before),proposal.loader_before_sha256);
 assert.equal(hash(retained_report_text),proposal.source_report_sha256);
 const report=JSON.parse(retained_report_text),candidate=report.candidates.find(x=>x.contract==='BTW-USDT');
 assert(candidate);assert.equal(candidate.direction,null);
 const start=runner_text.indexOf('async function loadCanonicalRunOutput(');
 const end=runner_text.indexOf('\nfunction finite(',start);
 assert(start>=0&&end>start);
 const after=runner_text.slice(start,end).trimEnd()+'\n';
 assert.equal(hash(after),proposal.loader_after_sha256);
 const callsites=runner_text.split('\n').filter(l=>l.includes('await loadCanonicalRunOutput(env.DATA_DB,{'));
 assert.deepEqual(callsites,proposal.production_optin_callsites_after);
 assert.equal(callsites.length,2);assert(callsites.every(l=>l.includes('include_primary_selection_diagnostic:true')));
 assert(after.includes('include_primary_selection_diagnostic=false'));
 const fixedNow=candidate.observed_ts+1000;
 class FixedDate extends Date{constructor(...args){super(...(args.length?args:[fixedNow]));}static now(){return fixedNow;}}
 // Controlled dependency adapters isolate the new copy boundary. They do not
 // qualify the real scoring, rendering, persistence or delivery dependencies.
 const deps={
  auditCanonicalCandidateSet:({rows,run_id})=>({status:'CLOSED',present_candidate_count:rows.length,run_id}),
  classifyCanonicalRunCompletion:()=>({status:'CLOSED',reason:'CONTROLLED_ONLY_LOADER_COPY'}),
  sourceCollectionPriorityProof:()=>null,auditObservationSourceRoles:()=>null,
  projectGateSourceDiagnostic:()=>null,auditCanonicalBlockDecisionUse:()=>null,
  auditRenderedBlockResults:input=>({manual:input.manual,telegram:input.telegram}),
  loadExecutionReportSource:async()=>null,enforceManualBlockCoverage:output=>output,
  formatManualRunSummary:output=>output.candidates.map(c=>c.manual_text||'').join('\n'),
  auditExecutionReportRendering:()=>null,
 };
 const make=text=>new Function(...Object.keys(deps),'Date','return ('+text+');')(...Object.values(deps),FixedDate);
 const oldLoader=make(before),newLoader=make(after);
 const run=async(loader,metadata={},options={},mutate=null)=>{
  // Derived public projection fixture, NOT the missing full private canonical.
  const canonical={...clone(candidate.canonical),metadata:{contract:candidate.contract,...clone(metadata)}};
  if(mutate)mutate(canonical);
  const row={publication_id:candidate.publication_id,contract_code:candidate.contract,direction:candidate.direction,
   run_id:candidate.run_id,snapshot_id:candidate.snapshot_id,wave_id:candidate.wave_id,
   observed_ts:candidate.observed_ts,valid_until_ts:candidate.valid_until_ts,lifecycle_event:candidate.lifecycle_event,
   canonical_state:candidate.canonical_state,canonical_json:JSON.stringify(canonical),
   presentation_inputs_json:JSON.stringify({manual_text:candidate.manual_text}),manual_text:candidate.manual_text,
   telegram_text:null,actionability_status:candidate.actionability_status,actionability_reason:candidate.actionability_reason};
  const original=JSON.stringify(row),calls=[];
  const db={prepare:sql=>({bind:(...args)=>({all:async()=>{calls.push({sql,args});return{results:[clone(row)]};}})})};
  const output=await loader(db,{runId:candidate.run_id,source:'CONTROLLED_ONLY',generation:report.generation,
   head:report.head,cron:null,candidateContracts:[candidate.contract],...options});
  assert.equal(JSON.stringify(row),original,'no change to source row/canonical JSON/manual/TG');
  assert.equal(output.candidates.length,1);assert.equal(calls.length,1,'only existing canonical SELECT through fake DB');
  return{output,calls};
 };
 const strip=output=>{const value=clone(output);for(const c of value.candidates)delete c.primary_selection_diagnostic;return value;};
 const controls=[];
 const model={direction_resolution:{status:'UNKNOWN',direction:null,candidate_direction:'UNKNOWN',facts:[],
  early_receipt:{closed:false,direction:null,source_ts:candidate.observed_ts-12000,available_at:candidate.observed_ts-10000,
   same_contract:true,same_wave:true,fresh:true,directed:false,direction_state_closed:false,
   reason:'CONTROLLED_ONLY_UNASSIGNED_DIRECTION',predicate_receipt:{schema:'CONTROLLED_ONLY_PREDICATES',
    decision_ts:candidate.observed_ts,checks:[{predicate:'CONTROLLED_ONLY_ASSIGNED',passed:false},{predicate:'CONTROLLED_ONLY_TRANSPORT',passed:true}],
    failed_predicates:['CONTROLLED_ONLY_ASSIGNED']}}},
  score_basis:{selected:'CONTROLLED_ONLY_NO_BASE',qualified_early_detection_0_100:73,deep_canonical_interest_0_100:null,routed_overall_0_100:null}};
 const old=await run(oldLoader,model),defaultNew=await run(newLoader,model);
 assert.deepEqual(defaultNew,old,'default remains exact even when metadata exists');controls.push('defaultfalse with metadata exact legacy output/SQL/bindings');
 const explicitFalse=await run(newLoader,model,{include_primary_selection_diagnostic:false});assert.deepEqual(explicitFalse,old);
 const on=await run(newLoader,model,{include_primary_selection_diagnostic:true});
 assert.deepEqual(strip(on.output),old.output);assert.deepEqual(on.calls,old.calls);
 const diagnostic=on.output.candidates[0].primary_selection_diagnostic;
 assert.equal(diagnostic.status,'COPIED_EXISTING_FIELDS');assert.deepEqual(diagnostic.direction_resolution,model.direction_resolution);
 assert.deepEqual(diagnostic.score_basis,model.score_basis);
 assert.equal(diagnostic.binding.contract,candidate.contract);assert.equal(diagnostic.binding.run_id,candidate.run_id);
 assert.equal(diagnostic.binding.snapshot_id,candidate.snapshot_id);assert.equal(diagnostic.binding.observed_ts,candidate.observed_ts);
 assert.equal(diagnostic.binding.analytical_fingerprint,candidate.canonical.analytical_fingerprint);
 assert.equal(on.output.candidates[0].canonical.direction,null);assert.deepEqual(on.output.candidates[0].canonical.scores,candidate.canonical.scores);
 assert.equal(on.output.candidates[0].manual_text,candidate.manual_text);
 assert(bytes(diagnostic)<=4096);controls.push('optin copies existing NULL/false/reason/clocks and keeps other output/FP/manual/TG inputs');
 const absentOld=await run(oldLoader),absentOn=await run(newLoader,{}, {include_primary_selection_diagnostic:true});
 assert.deepEqual(absentOn,absentOld);controls.push('legacy without fields has no new key even with optin');
 const nulls=await run(newLoader,{direction_resolution:null,score_basis:null},{include_primary_selection_diagnostic:true});
 assert.equal(nulls.output.candidates[0].primary_selection_diagnostic.direction_resolution,null);
 assert.equal(nulls.output.candidates[0].primary_selection_diagnostic.score_basis,null);controls.push('explicit root NULL is preserved, not replaced by false closure');
 const partial=await run(newLoader,{score_basis:{selected:null,deep_canonical_interest_0_100:null}},{include_primary_selection_diagnostic:true});
 assert(!Object.hasOwn(partial.output.candidates[0].primary_selection_diagnostic,'direction_resolution'));
 assert.deepEqual(partial.output.candidates[0].primary_selection_diagnostic.score_basis,{selected:null,deep_canonical_interest_0_100:null});
 controls.push('missing vs NULL fields remain distinct');
 for(const mutate of [c=>{c.run_id='CONTROLLED_OTHER';},c=>{c.snapshot_id='CONTROLLED_OTHER';},c=>{c.metadata.contract='CONTROLLED-USDT';},c=>{c.observed_ts++;}]){
  const bound=await run(newLoader,model,{include_primary_selection_diagnostic:true},mutate);
  const unbound=bound.output.candidates[0].primary_selection_diagnostic;
  assert.equal(unbound.status,'OMITTED');assert.equal(unbound.reason,'SOURCE_IDENTITY_NOT_BOUND');assert.equal(unbound.binding,null);
 }
 controls.push('four exact tuple mismatches are omitted, never presented as bound metadata');
 const huge=clone(model);huge.direction_resolution.facts=Array.from({length:16},()=>({direction:'LONG',evidence_id:'x'.repeat(160),origin:'x'.repeat(160)}));
 const limited=await run(newLoader,huge,{include_primary_selection_diagnostic:true});
 assert.equal(limited.output.candidates[0].primary_selection_diagnostic.status,'OMITTED');
 assert.equal(limited.output.candidates[0].primary_selection_diagnostic.reason,'DIAGNOSTIC_BYTE_LIMIT_EXCEEDED');
 assert(bytes(limited.output.candidates[0].primary_selection_diagnostic)<=4096);controls.push('oversize returns bounded explicit omission without partial source claims');
 const bad=await run(newLoader,{score_basis:{selected:{raw:'CONTROLLED_PRIVATE'}}},{include_primary_selection_diagnostic:true});
 assert.equal(bad.output.candidates[0].primary_selection_diagnostic.status,'OMITTED');
 assert.equal(bad.output.candidates[0].primary_selection_diagnostic.reason,'SOURCE_FIELDS_UNSUPPORTED');
 const privateExtra=clone(model);privateExtra.direction_resolution.private_payload='CONTROLLED_PRIVATE';
 const sanitized=await run(newLoader,privateExtra,{include_primary_selection_diagnostic:true});
 assert(!JSON.stringify(sanitized.output.candidates[0].primary_selection_diagnostic).includes('CONTROLLED_PRIVATE'));
 controls.push('unsupported values omitted and unknown/private metadata keys not copied');
 const witness={schema:'NEW_PRIMARY_SELECTION_PROJECTION_CONTROLLED_CARRIER_WITNESS_V1',
  source_report_sha256:proposal.source_report_sha256,assembled_runner_sha256:proposal.after_sha256,
  source_fixture:'DERIVED_PUBLIC_BTW_PROJECTION_NOT_FULL_PRIVATE_CANONICAL',
  modeled_metadata:'CONTROLLED_ONLY_NOT_RECONSTRUCTED_392557_PREDICATES',original392557_predicates_recovered:0,
  default_with_existing_metadata_legacy_equal:true,production_optin_callsites:2,projected_diagnostic_bytes:bytes(diagnostic),
  existing_SELECT_and_bindings_equal:true,canonical_direction_scores_FP_manual_TG_inputs_unchanged:true,
  dependency_adapters:'CONTROLLED_ONLY; real scorer/renderer/persistence/delivery modules NOT qualified by this component',
  controls,provider_HTTP:0,native_SQL:0,MAIN:0,Telegram:0,production_activation:false};
 assert(bytes(witness)<=8192);return witness;
}
