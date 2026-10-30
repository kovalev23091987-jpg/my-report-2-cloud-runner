import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
export async function runWorkerIndependentDefaultOff({repo_root,runtime_root,baseline_runtime_root}){
 const groups=[],cases=[];try{
  const P=path.join(repo_root,'checkpoints/independent-capture-and-origin-connected-20261023'),d=JSON.parse(fs.readFileSync(path.join(P,'root-default-off-correction.json'))),text=fs.readFileSync(path.join(runtime_root,'src/worker.js'),'utf8');assert.equal(Buffer.byteLength(text),d.actual_worker_bytes);assert.equal(createHash('sha256').update(text).digest('hex'),d.actual_worker_sha256);assert.equal(text.split(d.guarded_insertion).length,2);assert(!fs.readFileSync(path.join(baseline_runtime_root,'src/worker.js'),'utf8').includes('runIndependentCapturedAnomalyIngress'));
  const mod=await import(pathToFileURL(path.join(runtime_root,'src/anomaly-native-ingress.mjs')));const run=new Function('env','runId','runIndependentCapturedAnomalyIngress','fetchJson','classifyHtxInstrumentScope','return(async()=>{'+d.guarded_insertion+'})()');
  for(const [name,flag]of [['missing',undefined],['off','0'],['enabled_without_admission','1']]){
   const env=flag===undefined?{}:{REPORT2_ANOMALY_INDEPENDENT_CAPTURE_ENABLED:flag};let calls=0,fetches=0,classifies=0;
   await run(env,'CONTROLLED_DEFAULT_OFF',async arg=>{calls++;return mod.runIndependentCapturedAnomalyIngress(arg)},async()=>{fetches++;throw Error('UNAUTHORIZED_FETCH')},()=>{classifies++;throw Error('UNAUTHORIZED_CLASSIFY')});
   assert.equal(fetches,0);assert.equal(classifies,0);
   if(flag!=='1'){assert.equal(calls,0);assert(!Object.hasOwn(env,'REPORT2_ANOMALY_INDEPENDENT_CAPTURE_RECEIPT'));}
   else{assert.equal(calls,1);assert.equal(env.REPORT2_ANOMALY_INDEPENDENT_CAPTURE_RECEIPT.status,'INDEPENDENT_CAPTURE_ACTUAL_CALLBACKS_REQUIRED');assert.equal(env.REPORT2_ANOMALY_INDEPENDENT_CAPTURE_RECEIPT.native_admission_qualified,false);}
   cases.push(name);
  }
  groups.push('ACTUAL_NEW_WORKER_GUARD_DEFAULT_OFF_NO_HOOK_OR_RECEIPT');return{schema:'ROOT_ACTUAL_NEW_WORKER_DEFAULT_OFF_CONTROLLED_V1',status:'COMPLETE',group_count:1,case_count:3,groups,cases,actual_caller_snippet:true,full_Worker_module_invoked:false,native_SQL:0,provider_HTTP:0,MAIN:0,Telegram:0};
 }catch(error){error.partial_result={groups,cases,group_count:groups.length,case_count:cases.length};throw error;}
}
