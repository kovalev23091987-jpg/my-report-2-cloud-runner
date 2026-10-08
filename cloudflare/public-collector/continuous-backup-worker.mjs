import fs from 'node:fs';
import crypto from 'node:crypto';
import {HTTP_LIMITS} from '../../current-generation/files/src/unified-budget.mjs';

export const CONTINUOUS_WORKER_PLAN=Object.freeze({maximum_minutes:300,slot_ms:300000,offset_ms:60000,source_guard_http_per_cycle:2,runner:'ubuntu-latest',provider_http_added:0});
export function createCollectorJobBudget({used=0,on_charge=()=>{},fetch_impl=(...args)=>globalThis.fetch(...args)}={}){
 const maximum=HTTP_LIMITS.whole_job;
 if(!Number.isSafeInteger(used)||used<0||used>maximum)throw Error('COLLECTOR_JOB_SOURCE_BUDGET_INVALID');
 return {get used(){return used;},get can_collect(){return used+4<=maximum;},get snapshot(){return {attempted_source_http:used,maximum_source_http:maximum,failed_attempts_not_refunded:true};},fetch:async(...args)=>{if(used>=maximum)throw Error('COLLECTOR_JOB_SOURCE_HTTP_CAP');used++;await on_charge(used);return fetch_impl(...args);}};
}
const ROOT=new URL('../../',import.meta.url);
export const GUARDED_CODE_PATHS=Object.freeze([
 'cloudflare/public-collector/github-backup.mjs','cloudflare/public-collector/continuous-backup-worker.mjs','cloudflare/public-collector/trigger-analysis-kick.mjs','cloudflare/public-collector/injected-worker-tail.js',
 'runner/report2-d1-adapter.mjs','runner/retained-history.mjs','current-generation/files/src/triggered-entry-recheck.mjs','current-generation/files/src/two-candidate-policy.mjs','current-generation/files/src/unified-budget.mjs',
 'current-generation/files/runner-main.mjs','current-generation/files/src/worker.js','.github/workflows/report2.yml','.github/workflows/report2-public-collector-backup.yml',
]);
export function codeManifest(){return Object.fromEntries(GUARDED_CODE_PATHS.map(p=>{const b=fs.readFileSync(new URL(p,ROOT));return [p,crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob '+b.length+'\0'),b])).digest('hex')];}));}
const repositoryValid=r=>/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(String(r));
export async function verifyCurrentMainCode({repository,token,manifest,fetch_impl=fetch}={}){
 if(!repositoryValid(repository)||!token||!manifest||Object.keys(manifest).length!==GUARDED_CODE_PATHS.length)return {allowed:false,status:'CURRENT_MAIN_CODE_GUARD_REQUIRED'};
 const request=async path=>{const r=await fetch_impl('https://api.github.com/repos/'+repository+path,{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('GITHUB_SOURCE_GUARD_NOT_CLOSED');return r.json();};
 try{
  const ref=await request('/git/ref/heads/main'),head=ref?.object?.sha;
  if(!/^[a-f0-9]{40}$/.test(String(head)))return {allowed:false,status:'CURRENT_MAIN_REF_INVALID'};
  const tree=await request('/git/trees/'+head+'?recursive=1');
  if(tree.truncated||!Array.isArray(tree.tree))return {allowed:false,status:'CURRENT_MAIN_TREE_NOT_CLOSED'};
  const map=new Map(tree.tree.filter(x=>x.type==='blob').map(x=>[x.path,x.sha]));
  const changed=GUARDED_CODE_PATHS.filter(p=>map.get(p)!==manifest[p]);
  return {allowed:changed.length===0,status:changed.length?'CURRENT_MAIN_CODE_CHANGED':'CURRENT_MAIN_CODE_VERIFIED',current_main:head,changed_paths:changed,source_http:0,github_metadata_http:2};
 }catch{return {allowed:false,status:'CURRENT_MAIN_CODE_GUARD_NOT_CLOSED',source_http:0};}
}
export async function dispatchExactTriggerKick({kick,repository,token,fetch_impl=fetch,now=Date.now()}={}){
 if(kick?.dispatch!==true)return {dispatched:false,status:'NO_EXACT_KICK'};
 if(!repositoryValid(repository)||!token||kick.schema!=='EXACT_TRIGGER_ANALYSIS_KICK_V1'||kick.entry_authorized!==false||!/^RCHK:[a-f0-9]{40}$/.test(String(kick.task_id))||!Number.isSafeInteger(kick.expires_ts)||kick.expires_ts<=now||!Number.isSafeInteger(kick.kick_ts)||kick.kick_ts>now)return {dispatched:false,status:'EXACT_KICK_EXPIRED_OR_CHANGED',failed_dispatch_consumes_kick:true};
 try{
  const r=await fetch_impl('https://api.github.com/repos/'+repository+'/actions/workflows/report2.yml/dispatches',{method:'POST',headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},body:JSON.stringify({ref:'main',inputs:{reason:'EXACT_SENT_PRICE_TRIGGER_WAKE_UP',trigger_only_run:true,trigger_task_id:kick.task_id,manual_run_authorized:false}}),signal:AbortSignal.timeout(30000)});
  return {dispatched:r.status===204,status:r.status===204?'GITHUB_ACCEPTED_WORKFLOW_DISPATCH':'DISPATCH_FAILED_SLOT_CONSUMED',http_status:r.status,failed_dispatch_consumes_kick:true,entry_authorized:false};
 }catch{return {dispatched:false,status:'DISPATCH_FAILED_SLOT_CONSUMED',failed_dispatch_consumes_kick:true,entry_authorized:false};}
}
export async function runContinuousBackup({cycle,source_guard,should_continue=()=>true,on_receipt=()=>{},now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms)),duration_minutes=0}={}){
 if(typeof cycle!=='function'||typeof source_guard!=='function'||!Number.isFinite(duration_minutes)||duration_minutes<0||duration_minutes>300)throw Error('CONTINUOUS_BACKUP_PLAN_INVALID');
 const started=now(),deadline=started+duration_minutes*60000;let cycles=0,failures=0,status='WORKER_WINDOW_CLOSED';
 do{
  if(!should_continue()){status='ORIGINAL_SOURCE_JOB_HTTP_CAP_REACHED';await on_receipt({worker_status:status,worker_started_ts:started,worker_deadline_ts:deadline,cycles,failures});break;}
  const guard=await source_guard();
  if(guard.allowed!==true){status=guard.status||'CURRENT_MAIN_CODE_NOT_VERIFIED';await on_receipt({worker_status:status,source_guard:guard,worker_started_ts:started,worker_deadline_ts:deadline,cycles,failures});break;}
  let receipt;try{receipt=await cycle();}catch{failures++;receipt={status:'CONTINUOUS_BACKUP_CYCLE_NOT_CLOSED',telegram:false,analytical_decision:false};}
  cycles++;await on_receipt({...receipt,source_guard:guard,worker_status:'CONTINUOUS_CYCLE_COMPLETED',worker_started_ts:started,worker_deadline_ts:deadline,cycles,failures});
  if(duration_minutes===0||now()>=deadline)break;
  const next=Math.floor(now()/300000)*300000+360000;
  while(now()<Math.min(next,deadline))await sleep(Math.min(60000,Math.min(next,deadline)-now()));
 }while(now()<deadline);
 return {status,started_ts:started,deadline_ts:deadline,cycles,failures,provider_http_added:0,entry_authorized:false};
}
