import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import assert from 'node:assert/strict';
const dir=dirname(fileURLToPath(import.meta.url)),root=resolve(dir,'../..');
const sha=b=>createHash('sha256').update(b).digest('hex');
const binding=JSON.parse(readFileSync(resolve(dir,'original-binding.json')));
const archive=resolve(dir,binding.archive);assert.equal(sha(readFileSync(archive)),binding.archive_sha256);assert.equal(binding.artifact_digest,'sha256:'+binding.archive_sha256);
const members=JSON.parse(execFileSync('python3',['-c',`import zipfile,sys,json,hashlib
with zipfile.ZipFile(sys.argv[1]) as z:
 out={n:{'sha256':hashlib.sha256(z.read(n)).hexdigest(),'value':json.loads(z.read(n))} for n in z.namelist() if n.endswith('.json')}
 print(json.dumps(out))`,archive],{maxBuffer:3*1024*1024}).toString());
for(const [name,value] of Object.entries(members))assert.equal(value.sha256,binding.member_sha256[name]);
const get=name=>{const found=Object.entries(members).filter(([n])=>n.split('/').at(-1)===name);assert.equal(found.length,1);return found[0][1].value;};
const output=get('report2-run-result.json'),completion=get('report2-completion-accounting.json'),deliveryProof=get('same-run-delivery-proof.json'),deliveryAudit=get('automatic-delivery-audit.json');
assert.equal(output.head,binding.workflow.head_sha);assert.equal(output.head,'911a1d9dbbca4c9c7416700843ae353127c24926');
assert.equal(output.source,'schedule');assert.equal(output.status,'CLOSED');assert.equal(completion.head,output.head);assert.equal(completion.run_id,output.run_id);
assert.deepEqual(output.candidates.map(c=>c.contract),['CT-USDT','BR-USDT']);
const metrics=['checked','observed_fact_count','valid_fact_count','directional_eligible_fact_count','score_application_receipt_count','score_contribution','score_application_status','decision_assessment_receipt_count','unscored_diagnostic_receipt_count','rendered_useful_context_receipt_count','participating','participation_status'];
const select=(x,keys)=>Object.fromEntries(keys.map(k=>[k,x[k]??null]));
const snapshots=output.candidates.map(c=>{
 const all=c.block_rendered_results.context_receipts,manual=all.filter(r=>['N05','N12'].includes(r.block_id));
 const telegram=c.block_rendered_results.telegram_context_receipts.filter(r=>['N05','N12'].includes(r.block_id));
 assert.equal(c.block_rendered_results.run_id,c.run_id);assert.equal(c.block_rendered_results.snapshot_id,c.snapshot_id);
 assert.equal(telegram.length,0);
 const n05=manual.filter(r=>r.block_id==='N05'),n12=manual.filter(r=>r.block_id==='N12');assert.equal(n05.length,1);assert.equal(n12.length,c.contract==='CT-USDT'?2:1);
 for(const row of manual){assert.ok(c.manual_text.includes(`- ${row.label}: ${row.value}`));assert.equal(row.score_contribution,0);assert.ok(row.source_ts<=row.observed_ts&&row.observed_ts<=c.observed_ts);}
 const origins=n12.flatMap(r=>r.component_origins);
 for(const origin of origins){
  assert.equal(origin.htx_contract,c.contract);assert.equal(origin.origin_status,'EXACT_SELECTED_EVIDENCE');assert.match(origin.raw_hash,/^[a-f0-9]{64}$/);
  assert.ok(origin.source_ts<=origin.observed_ts&&origin.observed_ts<=c.observed_ts&&origin.first_known_ts<=c.observed_ts&&origin.expires_at>c.observed_ts);
  assert.equal(origin.first_known_ts,origin.observed_ts); // retained adapter field, not early-detection proof
  if(origin.window_start_ts!==null){assert.ok(origin.window_start_ts<origin.window_end_ts&&origin.window_end_ts<=origin.observed_ts);assert.equal(origin.window_status,'EXPLICIT_EVIDENCE_FIELDS');}
  else{assert.equal(origin.window_end_ts,null);assert.equal(origin.window_status,'NOT_RETAINED_IN_EVIDENCE');}
  for(const component of origin.market_components){if(component.contract!==null)assert.equal(component.contract,c.contract);}
 }
 const currentProviderIds=[...new Set(origins.filter(o=>o.block_id==='N12').map(o=>o.provider_id))].sort();
 const n12Accounting=c.block_decision_use.blocks.N12.source_accounting;
 assert.deepEqual([...n12Accounting.used_provider_ids].sort(),currentProviderIds);
 const flow=n05[0],flowOrigin=origins.find(o=>o.evidence_id===flow.evidence_id);assert.ok(flowOrigin);assert.equal(flowOrigin.window_end_ts-flowOrigin.window_start_ts,14400000);assert.equal(flowOrigin.source_ts,flowOrigin.window_end_ts);
 assert.ok(flowOrigin.market_components.every(x=>x.venue==='HTX'&&x.market==='FUTURES'&&x.quote==='USDT'&&x.contract===c.contract));
 const coverage=Object.fromEntries(['N05','N12'].map(block=>{const row=c.block_coverage.blocks[block];return[block,select(row,['status','checked','observed_facts','valid_context_facts','usable_facts','decision_path','evidence_rejection_reasons'])];}));
 const decisions=Object.fromEntries(['N05','N12'].map(block=>{const row=c.block_decision_use.blocks[block],acc=row.source_accounting;return[block,{...select(row,metrics),source_accounting:select(acc,['valid_provider_ids','used_provider_ids','rendered_provider_ids','neutral_assessed_provider_ids','unscored_diagnostic_provider_ids','used_physical_root_keys','provider_or_upstream_count_is_not_independent_vote_count','http_per_route_is_not_additive_across_blocks'])}];}));
 assert.equal(decisions.N05.participating,false);assert.equal(decisions.N05.decision_assessment_receipt_count,0);assert.equal(decisions.N05.participation_status,'USE_NOT_PROVEN');
 assert.equal(decisions.N12.participating,true);assert.equal(decisions.N12.score_application_receipt_count,0);
 const checks=Object.fromEntries(['N05','N12'].map(block=>[block,Object.fromEntries(Object.entries(c.block_coverage.blocks[block].source_checks).filter(([source])=>['AVAILABLE_N05_FLOW_CONTEXT','HTX_LARGE_TRADES','EXTERNAL_N05_FLOW'].includes(source)).map(([source,row])=>[source,select(row,['status','network_calls','receipt_count','valid_evidence_ids','provider_ids','declared_upstream_ids','physical_root_keys'])]))]));
 const shared=c.block_coverage.shared_n05_n12_http_attribution;assert.equal(shared.total_http,c.contract==='CT-USDT'?5:0);assert.equal(shared.n05_http+shared.n12_http,shared.total_http);
 return{...select(c,['contract','publication_id','direction','run_id','snapshot_id','wave_id','observed_ts','canonical_state']),coverage,decisions,source_checks:checks,
  confirmed_manual_receipts:manual,manual_fact_count:manual.length,telegram_context_receipts:telegram,telegram_fact_display_proven:false,telegram_payload_status:c.block_rendered_results.telegram_payload_status,
  shared_HTTP:shared,external_route_status:c.block_coverage.blocks.N05.source_checks.EXTERNAL_N05_FLOW.status,
  original_raw_EvidenceV2_present:false,raw_provider_identity_body_present:false,first_known_equals_observed_is_not_prospective_detection_proof:true,
  declared_current_upstreams:[...new Set(origins.filter(o=>o.block_id==='N12').map(o=>o.upstream_id))],same_HTX_markets_and_N05_context_not_independent_votes:true};
});
const ct=snapshots[0],br=snapshots[1];
assert.equal(ct.decisions.N12.decision_assessment_receipt_count,2);assert.equal(ct.decisions.N12.participation_status,'NEUTRAL_ASSESSMENT_AND_RENDERING_PROVEN');
assert.equal(br.decisions.N12.unscored_diagnostic_receipt_count,1);assert.equal(br.decisions.N12.participation_status,'UNSCORED_DIAGNOSTIC_AND_RENDERING_PROVEN');
const gate=ct.confirmed_manual_receipts.find(r=>r.component_origins?.some(o=>o.provider_id==='GATE_SPOT_TRADES'));assert.ok(gate);
const gateOrigin=gate.component_origins[0];assert.equal(gateOrigin.market,'SPOT');assert.equal(gateOrigin.window_end_ts-gateOrigin.window_start_ts,300000);assert.ok(gateOrigin.source_ts>=gateOrigin.window_start_ts&&gateOrigin.source_ts<gateOrigin.window_end_ts);
const ctHTX=ct.confirmed_manual_receipts.find(r=>r.component_origins?.some(o=>o.provider_id==='HTX_SPOT_FUTURES_TRADES')).component_origins[0];
assert.equal(ctHTX.market_components.length,2);assert.equal(ctHTX.source_ts,Math.min(...ctHTX.market_components.map(x=>x.source_ts)));assert.equal(ctHTX.market_components[0].observed_ts,null);
const sent=completion.delivery.lifecycle.find(r=>r.publication_id===ct.publication_id),bound=sent.bound_receipt;assert.equal(sent.message_id,'220');assert.equal(sent.status,'SENT');assert.equal(sent.sent,true);
for(const key of ['publication_id','contract','direction','wave_id','run_id','snapshot_id','observed_ts'])assert.equal(bound[key],ct[key]);
assert.equal(bound.source_run_id,output.run_id);assert.equal(bound.network_result,'CONFIRMED_SENT');assert.equal(bound.dispatch_state,'SENT');assert.equal(bound.dispatch_finalized,true);
assert.equal(bound.analytical_fingerprint,output.candidates[0].canonical.analytical_fingerprint);
const caseProof=deliveryProof.cases.find(r=>r.publication_id===ct.publication_id);assert.equal(caseProof.exact_SENT,true);assert.equal(caseProof.telegram_message_id,'220');assert.equal(deliveryAudit.exact_SENT,1);assert.equal(deliveryAudit.actual_ENTRY,0);
const code=['current-generation/files/src/block-result-context.mjs','current-generation/files/src/block-decision-use-audit.mjs','current-generation/files/src/candidate-evidence-v2-runtime.mjs','current-generation/files/src/gate-n12-bounded-trade-sample.mjs'];
const result={schema:'POST470_SAVED_NATURAL_N05_N12_ACTUAL_CONSUMER_V1',working_base:output.head,original:binding,original_run_id:output.run_id,
 source_code_sha256:Object.fromEntries(code.map(p=>[p,sha(readFileSync(resolve(root,p)))])),snapshots,
 acceptance:{actual_new_post470_manual_component_origins:true,actual_N12_Gate_neutral_assessment_and_manual_use:true,actual_BR_unscored_HTX_diagnostic_use:true,N05_decision_use_not_proven:true,detailed_N05_N12_Telegram_fact_display:false,CT_exact_same_run_OBSERVE_SENT:'220',actual_ENTRY:false,whole105_fresh_deep_coverage:false,provider_raw_response_replayed:false,full_canonical_reconstructed:false},
 new_actual_source_limits:['CT shared5HTTP reached; optional Gatefutures/KuCoin0 denied by caller cap; do not add another five for N12.', 'BR external exact asset identity not closed:0externalHTTP; HTXfutures facts remain useful without invented external/spot agreement.', 'Raw/fullEvidenceV2/tokenbinding bodies are not in the compact original; copied componentorigin identity/root/hash/clocks confirm retained trace, not replay of provider payload.', 'Bounded HTXsamples do not retain explicit samplewindow and permarketknowledge clocks; NULL retained, no fabricated completeperiod.', 'Detailed manual facts are not detailed Telegram publication: both assets telegram_context_receipts empty. Exact220 proves only its actual payload and identity.', 'CT external receipts13→8 still omitdetail; existing471proposal not rerun or changed.'],
 completion_usage:{...select(completion.usage_after_analytics_lease_release,['requests','rows_read','rows_written','unknown_ops']),scope:completion.scope,whole_day_closed:completion.whole_day_closed,statement_journals_recorded:completion.statement_journals_recorded},
 unrelated_old_UNI_failure:completion.delivery.lifecycle.filter(r=>r.key.startsWith('UNI-USDT|')).map(r=>({...r,not_this_CT_BR_source_case:true})),
 worker_effect:{provider_HTTP:0,native_SQL:0,MAIN_deploy_Telegram:0,production_shared_changes:false,accepted_tests_repeated:0,strategy_score_weights_forms_pauses_caps_changed:false}};
const target=process.argv[2]||resolve(dir,'analysis.json');writeFileSync(target,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:'PASS',original_run:binding.cloud_run,contracts:snapshots.map(c=>c.contract),manual_facts:snapshots.reduce((n,c)=>n+c.manual_fact_count,0),N12_origin_instances:snapshots.flatMap(c=>c.confirmed_manual_receipts.filter(r=>r.block_id==='N12')).reduce((n,r)=>n+r.component_origins.length,0),same_run_OBSERVE_SENT:'220',detailed_TG_N05_N12:false,output:target}));
