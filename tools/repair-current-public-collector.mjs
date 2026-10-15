// Repair only the exact current source overlay. Existing Hub prefix, bindings,
// crons, database schema, source clocks, quotas and105 scope remain untouched.
import fs from 'node:fs/promises';
import {makeGithubControl} from '../runner/github-bounded-phase-lease.mjs';
import {createUnifiedHttpBudget} from '../current-generation/files/src/unified-budget.mjs';
import {coordinateWeeklyRollout,rolloutDigest,singleActiveVersion,workerSettingsFingerprint,collectorVersionMetadata,readSingleWorkerModule,WEEKLY_ROLLOUT_POLICY as P} from '../runner/htx-coordinated-rollout.mjs';
import {patchWorker} from '../cloudflare/public-collector/patch-worker.mjs';
import {injectPrivatePriceRuntime} from '../cloudflare/public-collector/private-price-bundle.mjs';
const repository='kovalev23091987-jpg/my-report-2-cloud-runner',dir='audit-output/current-collector-repair',head=process.env.EXPECTED_MAIN,owner=process.env.BORROW_EXISTING_OWNER;
await fs.mkdir(dir,{recursive:true});const budget=createUnifiedHttpBudget(P.http);let github_HTTP=0,cloudflare_HTTP=0,proof,originalSettings,originalRuntime;const bytesByVersion=new Map();
const admit=kind=>{const used=kind==='github'?github_HTTP:cloudflare_HTTP,max=kind==='github'?P.max_control_HTTP:P.max_cloudflare_HTTP,s=budget.summary();if(used>=max||s.remaining<=P.manual_HTTP_reserved)throw Error('COLLECTOR_REPAIR_HTTP_BOUND');const lane=kind==='cloudflare'&&s.used.background<56?'background':'hot';if(!budget.reserve({logical_request_id:'COLLECTOR_CURRENT:'+kind+':'+used,lane,attempts:1}).allowed)throw Error('COLLECTOR_REPAIR_HTTP_BOUND');if(kind==='github')github_HTTP++;else cloudflare_HTTP++;};
const control=makeGithubControl({repository,token:process.env.GITHUB_TOKEN,fetch_impl:(url,opt)=>{admit('github');return fetch(url,{...opt,redirect:'error'});}});
async function cf(suffix,{method='GET',body,raw=false}={}){
 admit('cloudflare');const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+P.account+'/workers/scripts/'+P.collector+suffix,{method,headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,...(body&&!(body instanceof FormData)?{'content-type':'application/json'}:{})},...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000),redirect:'error'});
 if(!r.ok){let codes=[];try{codes=(await r.json()).errors?.map(e=>e.code)||[];}catch{}throw Error('CLOUDFLARE_HTTP_'+r.status+(codes.length?'_CODES_'+codes.join('_'):''));}if(raw)return r;const j=await r.json();if(j.success!==true||!j.result)throw Error('CLOUDFLARE_ACK_REQUIRED');return j.result;
}
async function guard({min_headroom_ms=30000}={}){
 if((await control.call('git/ref/heads/main')).object.sha!==head)throw Error('COLLECTOR_REPAIR_MAIN_MOVED');
 const [p,f]=await Promise.all([control.read('checkpoints/CLOUD_PHASE_STATE_20261004.json',head),control.read('audit-fixes/source-optimization-20260930/execution-lock.json',head)]),l=p.value.lease;
 if(!owner||l?.owner!==owner||l.expires_ts-Date.now()<min_headroom_ms||f.value.active||p.value.latest_own_bounded_continuation_lease?.owner!==owner||p.value.active_working_state?.owned_lease!==owner)throw Error('COLLECTOR_REPAIR_OWN_GUARD_REQUIRED');
}
async function snapshot(){
 const [deployments,settings,schedules]=await Promise.all([cf('/deployments'),cf('/settings'),cf('/schedules')]),active=singleActiveVersion(deployments),crons=(Array.isArray(schedules)?schedules:schedules.schedules)?.map(r=>r.cron).sort();
 if(JSON.stringify(crons)!==JSON.stringify(['*/5 * * * *','3-58/5 * * * *'].sort()))throw Error('COLLECTOR_EXACT_CRONS_REQUIRED');
 let bytes=bytesByVersion.get(active.version_id);
 if(!bytes){bytes=await readSingleWorkerModule(await cf('/content/v2',{raw:true}));const check=singleActiveVersion(await cf('/deployments'));if(check.deployment_id!==active.deployment_id||check.version_id!==active.version_id)throw Error('COLLECTOR_MOVED_DURING_READBACK');bytesByVersion.set(active.version_id,bytes);}
 if(!originalSettings){const v=await cf('/versions/'+active.version_id);if(v.id!==active.version_id)throw Error('COLLECTOR_ORIGINAL_VERSION_REQUIRED');originalSettings=settings;originalRuntime=v.resources?.script_runtime;}
 return{...active,module_sha256:rolloutDigest(bytes),settings_sha256:workerSettingsFingerprint(settings),crons_sha256:rolloutDigest(crons),crons,binding_names:settings.bindings.map(b=>b.name).sort()};
}
const save=async p=>{proof=p;await fs.writeFile(dir+'/proof.json',JSON.stringify({...p,github_HTTP,cloudflare_HTTP,whole_HTTP:budget.summary(),manual_HTTP_reserved:24,sourceHTTP:0,D1:0,MAIN:0,Telegram:0,secret_values_exported:false},null,2)+'\n');};
try{
 if(process.env.GITHUB_REPOSITORY!==repository||process.env.GITHUB_SHA!==head||process.env.GITHUB_REF!=='refs/heads/main'||!process.env.CLOUDFLARE_API_TOKEN||!/^\d+$/.test(process.env.CONNECTED_RUN||''))throw Error('EXACT_CURRENT_COLLECTOR_REPAIR_ACCESS_REQUIRED');
 await guard({min_headroom_ms:600000});
 const [s,r,g,run,workflow]=await Promise.all([control.read('checkpoints/CURRENT_PROJECT_STATUS.json',head),control.read('checkpoints/OWNER_REVIEW_RESUME_POINT_20261010.json',head),control.read('REPORT2_CURRENT_GENERATION.json',head),control.call('actions/runs/'+process.env.CONNECTED_RUN),control.call('actions/workflows/liq-assembled-offline-20261012.yml')]);
 if(!s.value.active_working_state?.owner_authorized_sequential_continuation||!r.value.active_working_state?.owner_authorized_sequential_continuation||g.value.latest_only!==true||run.head_sha!==head||run.workflow_id!==workflow.id||run.status!=='completed'||run.conclusion!=='success')throw Error('EXACT_CURRENT_MAIN_COLLECTOR_CHECK_REQUIRED');
 const before=await snapshot(),original=bytesByVersion.get(before.version_id).toString(),injected=injectPrivatePriceRuntime(await fs.readFile('cloudflare/public-collector/injected-worker-tail.js','utf8')),patched=patchWorker(original,injected.source.trim());
 if(patched.status==='ALREADY_PATCHED'){await save({schema:'CURRENT_PUBLIC_COLLECTOR_MODULE_REPAIR_V1',status:'CURRENT_COLLECTOR_ALREADY_EXACT',head,before,production_scope_changed:false});}
 else{
  const marker='var __REPORT2_PUBLIC_COLLECTOR_VERSION = ',at=original.indexOf(marker),newAt=patched.source.indexOf(marker);
  if(patched.status!=='UPDATED'||at<0||newAt!==at||original.slice(0,at)!==patched.source.slice(0,newAt))throw Error('EXACT_CURRENT_HUB_PREFIX_PATCH_REQUIRED');
  const expected=Buffer.from(patched.source),worker={name:P.collector,module_sha256:rolloutDigest(expected),required_before:before};
  const adapter={snapshot,requireHeadroom:n=>{if(P.max_cloudflare_HTTP-cloudflare_HTTP<n||budget.summary().remaining-24<n)throw Error('COLLECTOR_ROLLBACK_HTTP_HEADROOM_REQUIRED');},stage:async(w,before)=>{
   const latest=await cf('/versions?per_page=1');const metadata=collectorVersionMetadata({settings:originalSettings,runtime:originalRuntime,head,active_version:before.version_id,latest_uploaded_version:latest.items?.[0]?.id});
   const form=new FormData();form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));form.set('worker.js',new Blob([expected],{type:'application/javascript+module'}),'worker.js');const v=await cf('/versions?bindings_inherit=strict',{method:'POST',body:form});return{version_id:v.id,activated:false};
  },activate:(w,id)=>cf('/deployments',{method:'POST',body:{strategy:'percentage',versions:[{version_id:id,percentage:100}],annotations:{'workers/message':'Restore exact current source overlay '+head}}})};
  const plan={kind:'collector_patch',head,expected_main:head,connected:{status:'EXACT_MAIN_CURRENT_COLLECTOR_SOURCE_QUALIFIED',head,run:run.id,url:run.html_url},scope:{status:'EXACT_HUB_PREFIX_PRESERVED_CURRENT_TAIL_PATCH',hub_prefix_sha256:rolloutDigest(original.slice(0,at)),original_module_sha256:before.module_sha256,patched_module_sha256:worker.module_sha256,private_runtime_manifest:injected.manifest,approved_universe_changed:false},workers:[worker]};
  await coordinateWeeklyRollout({plan,adapter,guard,save,execute:process.env.EXECUTE_COLLECTOR_REPAIR==='true'});
 }
}catch(e){if(!e.rollout_receipt)await save({schema:'CURRENT_PUBLIC_COLLECTOR_MODULE_REPAIR_V1',status:'CURRENT_COLLECTOR_REPAIR_NOT_ACTIVATED',head,reason:/^[A-Z0-9_]+$/.test(e.message)?e.message:'COLLECTOR_REPAIR_ERROR',production_scope_changed:false});process.exitCode=1;}
console.log(JSON.stringify({status:proof?.status,reason:proof?.reason,head,github_HTTP,cloudflare_HTTP,whole_HTTP:budget.summary(),sourceHTTP:0,D1:0,MAIN:0,Telegram:0}));
