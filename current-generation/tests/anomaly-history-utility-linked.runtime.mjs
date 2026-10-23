import test from 'node:test';
import assert from 'node:assert/strict';
import {cp,readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,relative,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

test('linked detection-basis integrity, retained HTX descriptive research and bounded source utility',async()=>{
 const repo=resolve(process.env.GITHUB_WORKSPACE||'.');
 const output=resolve(process.env.REPORT2_LINKED_RESULT_DIR||'audit-output/anomaly-history-utility-linked');
 const prefix='checkpoints/anomaly-history-utility-linked-20261020';
 const sha=b=>createHash('sha256').update(b).digest('hex');
 const save=async(name,result)=>writeFile(join(output,name),JSON.stringify(result,null,2)+'\n');
 const load=p=>import(pathToFileURL(resolve(repo,p)).href);
 await mkdir(output,{recursive:true});
 const plan=JSON.parse(await readFile(resolve(repo,prefix,'qualification-plan.json'),'utf8'));
 const completed=[];let baseline=null,stage='BASELINE_COPY',returnedComponentArtifact=null;
 try{
  // A complete checkout copy outside the artifact preserves all relative
  // imports and retained files. Only the exact original durability file differs.
  baseline=await mkdtemp(join(tmpdir(),'report2-linked-575577578-'));
  await cp(repo,baseline,{recursive:true,filter:p=>!['.git','audit-output'].includes(relative(repo,p).split('/')[0])});
  const original=await readFile(resolve(repo,prefix,'identity-retention-grid.before.mjs'));
  assert.equal(sha(original),plan.baseline_target_sha256);
  await writeFile(resolve(baseline,plan.changed_target),original);
  const equivalence={};
  for(const p of plan.same_module_and_input_paths){
   const before=await readFile(resolve(baseline,p)),after=await readFile(resolve(repo,p));
   assert.equal(sha(before),sha(after),`Baseline/candidate input differs: ${p}`);equivalence[p]=sha(after);
  }
  await save('baseline-binding.json',{status:'ACTUAL_FULL_CHECKOUT_COPY_WITH_ONE_ORIGINAL_TARGET',baseline_target_sha256:sha(original),candidate_target_sha256:sha(await readFile(resolve(repo,plan.changed_target))),same_module_and_input_sha256:equivalence,artifact_contains_baseline_tree:false});

  stage='DETECTION_BASIS';
  const revision=await (await load('anomaly-research/detection-basis-revision-20261020/connected.mjs')).runDetectionBasisRevisionConnected({baseline_root:baseline,candidate_root:repo,repo_root:repo});
  await save('detection-basis-result.json',revision);returnedComponentArtifact='detection-basis-result.json';
  assert.equal(revision.controls.length,6);assert.equal(revision.native_ingress_or_grid_or_commit_ACK,false);assert.equal(revision.production_watch_hook_installed,false);assert.equal(revision.source_HTTP,0);assert.equal(revision.native_SQL,0);assert.equal(revision.Telegram,0);
  completed.push({component:stage,artifact:'detection-basis-result.json',controls:revision.controls.length});

  stage='RETAINED_HTX_DESCRIPTIVE_STUDY';returnedComponentArtifact=null;
  const study=await (await load('anomaly-research/htx-multiscale-study-20261020/study.mjs')).runHtxMultiscaleStudy({repo_root:repo});
  await save('htx-descriptive-result.json',study);returnedComponentArtifact='htx-descriptive-result.json';
  assert.equal(study.status,'DESCRIPTIVE_RESEARCH_COMPLETED');assert.equal(study.contracts.length,37);assert.equal(study.streams.length,111);assert.equal(study.panels.length,3);
  assert.equal(study.source.upstream_count,1);assert.equal(study.source.current105_or_synchronous_panel,false);assert.equal(study.source.raw_native_body_completion_ts,null);assert.equal(study.study_clocks.original_native_first_detection_ts,null);
  assert.ok(study.study_clocks.research_first_known_ts>=study.study_clocks.DTO_complete_read_hash_parse_known_by_ts);assert.equal(study.detectClosed_calls,0);assert.equal(study.actual_card_memory_watch_outbox_admitted,false);assert.equal(study.activation_allowed,false);assert.equal(study.native_instrument_identity_or_commit_ACK_qualified,false);
  assert.equal(study.prior37qualification_or_aggregation_recomputed,false);assert.equal(study.prior_BTC_study_replayed,false);assert.equal(study.provider_HTTP,0);assert.equal(study.native_SQL,0);assert.equal(study.Telegram,0);assert.equal(study.prospective_precision,null);assert.equal(study.recall,null);
  assert.ok(study.findings.every(f=>f.direction==='UNASSIGNED'&&f.native_card_created===false&&f.volume_semantics==='BOTH_SIDES_AGGREGATE_NOT_SIGNED_TAKER'));
  completed.push({component:stage,artifact:'htx-descriptive-result.json',contracts:37,streams:111,research_findings:study.research_finding_count});

  stage='SOURCE_UTILITY';returnedComponentArtifact=null;
  const utility=await (await load('anomaly-research/source-utility-facts-20261020/connected.mjs')).runSourceUtilityConnected({repo_root:repo,legacy_root:baseline});
  await save('source-utility-result.json',utility);returnedComponentArtifact='source-utility-result.json';
  assert.equal(utility.status,'CONTROLLED_COMPONENT_COMPLETED');assert.equal(utility.control_count,17);assert.equal(utility.current_sourceUtility_unchanged,true);assert.equal(utility.actual_provider_or_source_cost_qualified,false);assert.equal(utility.actual_native_identity_or_commit_ACK,false);assert.equal(utility.activation_allowed,false);assert.equal(utility.prior_accepted_case_replayed,false);assert.equal(utility.provider_HTTP,0);assert.equal(utility.native_SQL,0);assert.equal(utility.Telegram,0);
  completed.push({component:stage,artifact:'source-utility-result.json',controls:utility.control_count});
  await save('result.json',{status:'PASS',one_new_common_case:true,completed_components:completed,controlled_groups:23,descriptive_retained_contracts:37,descriptive_streams:111,descriptive_windows_are_not_independent_events:true,native_ingress_identity_body_completion_ACK_or_cost_admission_qualified:false,actual_Telegram_sent:false,production_activation:false,old_accepted_semantic_cases_replayed:0});
 }catch(error){
  await save('component-failure.json',{status:'FAIL',failed_component:stage,returned_component_artifact:returnedComponentArtifact,completed_components:completed,error:String(error.stack||error),completed_original_results_must_not_be_replayed:true});throw error;
 }finally{
  if(baseline)await rm(baseline,{recursive:true,force:true});
  await save('baseline-cleanup.json',{outside_artifact_baseline_removed:true,retained_original_baseline_file:prefix+'/identity-retention-grid.before.mjs'});
 }
});
