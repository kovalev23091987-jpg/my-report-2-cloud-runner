// ONE NEW affected callable. Author UNEXECUTED: no native IO or old cases.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
export async function runCaptureProposalFinalizerCase({repo_root}={}){
  const results=[],pins={},partial={schema:'CAPTURE_PROPOSAL_FINALIZER_PARTIAL_V1',new_groups:0,new_variants:0,results,SQL:0,provider_HTTP:0,native:0,MAIN:0,Telegram:0};
  let temporary=null;
  try{
    const root=resolve(repo_root),prefix=join(root,'anomaly-research/pending-journal-continuation-20261023'),binding=JSON.parse(await fs.readFile(join(prefix,'target-bindings.json'),'utf8'));
    for(const [path,pin]of Object.entries({[binding.target]:binding.after,...binding.dependencies})){
      const bytes=await fs.readFile(join(root,path));assert.equal(bytes.length,pin.bytes,path);assert.equal(hash(bytes),pin.sha256,path);pins[path]=hash(bytes);
    }
    const source=await fs.readFile(join(root,binding.target),'utf8'),start=source.indexOf('async function persistRunnerAnomalyReceipts('),stop=source.indexOf('// Same runner filesystem seam;',start),body=source.slice(start,stop);
    assert.equal(hash(body),binding.function_after.sha256);assert.equal(Buffer.byteLength(body),binding.function_after.bytes);
    const a=source.indexOf('  try {\n    await worker.scheduled('),b=source.indexOf('  const leaseAfterWorker=',a),finalizer=source.slice(a,b);
    assert.equal(hash(finalizer),binding.finalizer_after.sha256);assert.equal(Buffer.byteLength(finalizer),binding.finalizer_after.bytes);
    const {canonical}=await import(pathToFileURL(join(root,'current-generation/files/src/anomaly-native-domain.mjs')).href);
    temporary=await fs.mkdtemp(join(tmpdir(),'report2-capture-finalizer-'));
    const roster='a'.repeat(64),before=canonical({schema:'INDEPENDENT_ANOMALY_CAPTURE_CURSOR_V1',roster_sha256:roster,next_index:104}),next=canonical({schema:'INDEPENDENT_ANOMALY_CAPTURE_CURSOR_V1',roster_sha256:roster,next_index:0});
    const snapshot={schema:'ANOMALY_PARENT_BOUNDED_RECEIPTS_V1',records:[{status:'CONTROLLED_PRIOR_RECEIPT',operation_id:'CONTROLLED_NOT_NATIVE_ACK',unknown_ops:1}],native_admission_qualified:false,SENT_claimed:false};
    const checkpoint={schema:'RUNNER_ANOMALY_PENDING_CHECKPOINT_V1',file_sha256:'b'.repeat(64),identity_sha256:'c'.repeat(64),sequence:3,records:1,native_ACK_qualified:false,filesystem_durability_qualified:false};
    const base={schema:'INDEPENDENT_COMPLETED_CAPTURE_INGRESS_V1',status:'INDEPENDENT_CAPTURE_CLOSED_NO_EVENT_IN_LAST_15M',registry_assets:105,registry_native_contracts:122,cursor_before:before,next_cursor_proposed:next,selected_registry_index:104,selected_contract:'CONTROLLED-USDT',source_HTTP_attempts:2,actual_IO_handler_calls:2,useful_closed_windows:1,registry_assets_not_selected_this_invocation:104,continuous105_coverage_qualified:false,cursor_advanced_durably:false};
    for(const [name,delta,expected]of [
      ['quiet slice survives later Worker failure',{},{status:'CAPTURE_CURSOR_PROPOSAL_RECORDED',next}],
      ['unknown parent keeps proposed cursor unchanged',{status:'INDEPENDENT_CAPTURE_OBSERVER_RETURNED',next_cursor_proposed:before,parent_status:'UNKNOWN_COMMIT_ACK',uncertain_parent_requires_existing_reconciliation:true},{status:'CAPTURE_CURSOR_PROPOSAL_RECORDED',next:before}],
      ['unknown parent cannot export an advancing cursor',{status:'INDEPENDENT_CAPTURE_OBSERVER_RETURNED',parent_status:'UNKNOWN_COMMIT_ACK',uncertain_parent_requires_existing_reconciliation:true},{status:'CAPTURE_PROPOSAL_NOT_CLOSED',reason:'CAPTURE_UNKNOWN_CURSOR_ADVANCE_REFUSED'}],
    ]){
      const dir=join(temporary,String(results.length));await fs.mkdir(dir);
      const backend={writeFile:(name,...args)=>fs.writeFile(join(dir,name),...args),rename:(a,b)=>fs.rename(join(dir,a),join(dir,b)),readFile:(name,...args)=>fs.readFile(join(dir,name),...args)};
      const processBinding={env:{GITHUB_SHA:'1'.repeat(40),GITHUB_RUN_ID:'900000000001'}};
      const persist=new Function('fs','crypto','Buffer','Date','process','canonicalAnomalyJSON',body+'\nreturn persistRunnerAnomalyReceipts;')(backend,crypto,Buffer,Date,processBinding,canonical);
      const receipt=structuredClone({...base,...delta}),frozenInput=JSON.stringify(receipt),env={REPORT2_ANOMALY_CAPTURE_CURSOR:before};let closed=0,saved=null,workerCalls=0;
      const worker={scheduled:async()=>{workerCalls++;env.REPORT2_ANOMALY_INDEPENDENT_CAPTURE_RECEIPT=receipt;throw Error('CONTROLLED_FAILURE_AFTER_CAPTURE');}};
      const capability={installed:true,close:async()=>{closed++;},receipts:()=>structuredClone(snapshot)};
      const localConsole={error:()=>{throw Error('UNEXPECTED_ARTIFACT_FAILURE_LOG');}};
      const invoke=new Function('worker','started','source','env','ctx','anomalyParentCapability','persistRunnerAnomalyReceipts','anomalyPendingJournal','console','return(async()=>{'+finalizer+'})();');
      let failure;try{await invoke(worker,1792767600000,'schedule',env,{},capability,async(...args)=>{saved=await persist(...args);return saved;},{checkpoint:()=>structuredClone(checkpoint)},localConsole);}catch(e){failure=e;}
      const text=await fs.readFile(join(dir,'report2-anomaly-domain-receipts.json'),'utf8'),artifact=JSON.parse(text),projection=artifact.independent_capture;
      const observed={name,status:projection?.status,reason:projection?.reason??null,bytes:Buffer.byteLength(text),sha256:hash(text),closed,workerCalls,failure:failure?.message??null,projection_readback:saved?.capture_projection_readback===true};partial.current=observed;
      assert.equal(failure?.message,'CONTROLLED_FAILURE_AFTER_CAPTURE');assert.equal(closed,1);assert.equal(workerCalls,1);assert.deepEqual(artifact.receipts,snapshot);assert.deepEqual(artifact.pending_checkpoint,checkpoint);
      assert.equal(artifact.head,processBinding.env.GITHUB_SHA);assert.equal(artifact.cloud_run_id,processBinding.env.GITHUB_RUN_ID);assert.equal(projection.status,expected.status);assert.equal(projection.cursor_adopted,false);assert.equal(projection.cursor_advanced_durably,false);assert.equal(projection.native_ACK_qualified,false);assert.equal(artifact.filesystem_durability_qualified,false);assert.equal(saved.capture_projection_recorded,true);assert.equal(saved.capture_projection_readback,true);assert.ok(Buffer.byteLength(text)<=20480);assert.equal(env.REPORT2_ANOMALY_CAPTURE_CURSOR,before);assert.equal(JSON.stringify(receipt),frozenInput);
      if(expected.next){assert.equal(projection.cursor_before,before);assert.equal(projection.next_cursor_proposed,expected.next);assert.equal(projection.continuous105_coverage_qualified,false);assert.equal(projection.full_roster_sweep_completed,false);assert.equal(projection.registry_assets_not_selected_this_invocation,104);}else{assert.equal(projection.reason,expected.reason);assert.equal(Object.hasOwn(projection,'next_cursor_proposed'),false);}
      results.push(observed);partial.new_variants=results.length;delete partial.current;
    }
    for(const [path,pin]of Object.entries({[binding.target]:binding.after,...binding.dependencies}))assert.equal(hash(await fs.readFile(join(root,path))),pin.sha256,path);
    partial.new_groups=1;
    return{schema:'CAPTURE_PROPOSAL_FINALIZER_CONTROLLED_RESULT_V1',new_groups:1,new_variants:results.length,results,pins_before_after_equal:true,pins,scope:'ACTUAL_EXISTING_PERSIST_AND_FINALIZER_BODIES_WITH_CONTROLLED_WORKER_ERROR_AND_REAL_LOCAL_FILES',main_entry_invoked:false,detector_or_pending_journal_cases_replayed:0,SQL:0,provider_HTTP:0,native:0,MAIN:0,Telegram:0,durable_cursor_qualified:false,continuous105_coverage_qualified:false,cross_job_durability_qualified:false,author_execution:'UNEXECUTED'};
  }catch(error){error.partial_result=structuredClone(partial);throw error;}
  finally{if(temporary)await fs.rm(temporary,{recursive:true,force:true});}
}
