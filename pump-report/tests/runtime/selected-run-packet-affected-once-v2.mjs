import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,openSync,closeSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {readCurrentSelectedRunAnalysisPacket} from '../../operator/current-analysis-selected-run-packet.mjs';

const hash=b=>createHash('sha256').update(b).digest('hex');
const [admissionPath,attemptPath,resultPath]=process.argv.slice(2);
const admission=JSON.parse(readFileSync(admissionPath,'utf8'));
assert.equal(admission.status,'ADMITTED_NOT_SPENT');
assert.ok(Date.now()<admission.expires_ts&&Date.now()<admission.own_lease.expires_ts);
assert.equal(admission.Node,1);assert.equal(admission.maximum_attempts,1);
assert.equal(hash(readFileSync(new URL(import.meta.url))),admission.case_sha256);
const bytes=readFileSync(admission.private_packet_path);
assert.equal(hash(bytes),admission.private_packet_sha256);
assert.equal(hash(readFileSync(new URL('../../operator/current-analysis-selected-run-packet.mjs',import.meta.url))),admission.helper_sha256);
const attempt=openSync(attemptPath,'wx',0o600);closeSync(attempt);
writeFileSync(attemptPath,JSON.stringify({state:'STARTED',maximum_attempts:1,no_auto_retry:true}));
const packet=JSON.parse(bytes),at=packet.observation.observed_ts,cutoff=packet.selector.after_install_ts;
const fixed=packet.latest_candidates.map(c=>({key:c.analysis_key,original:c.private_evidence.original}));
const clone=x=>JSON.parse(JSON.stringify(x));
const checks=[];
async function scenario(name,mutate,expected){
  const f=clone(fixed),calls=[];
  const context={originals:f,run_status:'COMPLETE',run_override:null,run_null:false};
  mutate(context);
  const queue={},indexes={},originals={};
  for(const row of f){
    row.key='pump:analysis:'+hash(JSON.stringify(row.original.analysis));
    const a=row.original.analysis,id=a.instrument.instrument_id;
    queue[id]={instrument_id:id,last_checked_ts:a.analysis_ts};
    indexes['pump:latest-analysis:'+id]={analysis_key:row.key,analysis:a};originals[row.key]=row.original;
  }
  const newest=f.slice().sort((a,b)=>b.original.analysis.analysis_ts-a.original.analysis.analysis_ts)[0];
  const id=newest.original.analysis.run_id;
  const run=context.run_null?null:context.run_override??{run_id:id,status:context.run_status,checked:f.filter(r=>r.original.analysis.run_id===id).map(r=>({analysis_key:r.key,analysis:r.original.analysis}))};
  const store={get:async key=>{calls.push(key);if(key==='pump:executor')return packet.executor;if(key==='pump:resources')return {};if(key==='pump:candidate-queue')return queue;if(key.startsWith('pump:run:'))return run;return indexes[key]??originals[key]??null;},scanPrefix:async()=>[]};
  const out=await readCurrentSelectedRunAnalysisPacket({store,admission:{after_install_ts:cutoff,implementation_sha256:packet.implementation_sha256,expected_recipient_sha256:'a'.repeat(64)},clock:()=>at});
  assert.equal(out.selected_run_binding.status,expected.status,name);
  assert.equal(out.selected_run_binding.completed_saved_result_bound,expected.bound,name);
  const runReads=calls.filter(k=>k.startsWith('pump:run:'));
  assert.equal(runReads.length,expected.reads??1,name);
  if(runReads.length)assert.equal(runReads[0],'pump:run:'+out.selected_run_binding.selected_run_id,name);
  assert.deepEqual(out.executor,packet.executor,name);
  assert.equal(out.observation.first_genuine_same_original_SENT_observed,false,name);
  assert.equal(out.scope.maximum_business_queries,11,name);
  if(expected.mixed)assert.equal(out.selected_run_binding.all_selected_originals_same_run,false,name);
  checks.push({name,status:'PASS',selected_run_status:out.selected_run_binding.status,run_PK_reads:runReads.length,real_IO:0});
}
try{
  await scenario('busy_other_executor_does_not_displace_saved_original_run',()=>{},{status:'BOUND_SELECTED_SAVED_RUN_COMPLETE',bound:true});
  await scenario('saved_INCOMPLETE_remains_INCOMPLETE',c=>{c.run_status='INCOMPLETE';},{status:'BOUND_SELECTED_SAVED_RUN_INCOMPLETE',bound:true});
  await scenario('not_yet_saved_run_is_unknown',c=>{c.run_null=true;},{status:'SELECTED_RUN_RESULT_NOT_SAVED',bound:false});
  await scenario('different_run_identity_refused',c=>{c.run_override={run_id:'00000000-0000-0000-0000-000000000000',status:'COMPLETE',checked:[]};},{status:'SELECTED_RUN_REFERENCE_MISMATCH',bound:false});
  await scenario('unbound_checked_original_refused',c=>{c.run_override={run_id:c.originals[0].original.analysis.run_id,status:'COMPLETE',checked:[]};},{status:'SELECTED_RUN_REFERENCE_MISMATCH',bound:false});
  await scenario('nonfinal_run_status_is_unknown',c=>{c.run_status='RUNNING';},{status:'SELECTED_RUN_FINAL_STATUS_UNCONFIRMED',bound:false});
  await scenario('wrong_pin_does_not_fallback_to_current_executor',c=>{for(const r of c.originals)r.original.implementation_sha256='a'.repeat(64);},{status:'NO_BOUND_CURRENT_ORIGINAL',bound:false,reads:0});
  await scenario('different_original_runs_only_one_is_read',c=>{const r=c.originals[1];r.original.analysis.run_id=r.original.input.run_id='11111111-1111-1111-1111-111111111111';},{status:'BOUND_SELECTED_SAVED_RUN_COMPLETE',bound:true,mixed:true});
  await scenario('invalid_selected_run_id_causes_no_PK_read',c=>{for(const r of c.originals)r.original.analysis.run_id=r.original.input.run_id='not-a-run-id';},{status:'SELECTED_RUN_ID_INVALID',bound:false,reads:0});
  const result={schema:'ROOT_SELECTED_RUN_PACKET_AFFECTED_CASE_V1',status:'PASS',evidence_class:'CONTROLLED_STORE_MODEL_NOT_NATIVE',checks,Node:1,helper_calls:checks.length,build:0,analytics_engine:0,native_SQL:0,Cloudflare_HTTP:0,market_HTTP:0,Telegram:0,existing_packet_read_only:true,real_saved_run_retrieved:false,first_genuine_AUTO_SENT:false};
  writeFileSync(resultPath,JSON.stringify(result,null,2)+'\n');writeFileSync(attemptPath,JSON.stringify({state:'COMPLETED',status:'PASS',result_sha256:hash(readFileSync(resultPath)),no_auto_retry:true}));
  process.stdout.write(JSON.stringify({status:'PASS',cases:checks.length,Node:1,analytics_engine:0,real_IO:0,result_sha256:hash(readFileSync(resultPath))}));
}catch(error){writeFileSync(attemptPath,JSON.stringify({state:'FAILED_NO_RETRY',reason:error.message,no_auto_retry:true}));throw error;}
