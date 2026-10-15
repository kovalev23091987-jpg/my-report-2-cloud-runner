import fs from 'node:fs/promises';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';import path from 'node:path';
import {makeGithubControl} from '../runner/github-bounded-phase-lease.mjs';
import {active105OfflineReviewOwner} from '../runner/offline-review-authority.mjs';
import {createVersionBoundWorkerReader} from '../runner/cloudflare-version-bound-readback.mjs';
import {rolloutDigest,workerSettingsFingerprint,collectorVersionMetadata,historyVersionMetadata,WEEKLY_ROLLOUT_POLICY as P} from '../runner/htx-coordinated-rollout.mjs';
import {freeArchiveBindingPlan} from '../runner/free-archive-bindings.mjs';
import {rolloutFreeArchiveReaders,requireArchiveWritersOff} from '../runner/free-archive-rollout.mjs';
import {patchWorker} from '../cloudflare/public-collector/patch-worker.mjs';
import {injectPrivatePriceRuntime} from '../cloudflare/public-collector/private-price-bundle.mjs';
import {createUnifiedHttpBudget} from '../current-generation/files/src/unified-budget.mjs';
const repository='kovalev23091987-jpg/my-report-2-cloud-runner',requestPath='checkpoints/FREE_ARCHIVE_READER_ROLLOUT_REQUEST_20261015.json',dir='audit-output/free-archive-reader-rollout',names=[P.collector,'my-report-2-liq-forecast-history'];
await fs.mkdir(dir,{recursive:true});const budget=createUnifiedHttpBudget(P.http);let github_HTTP=0,cloudflare_HTTP=0,proof;
const out={schema:'FREE_ARCHIVE_READER_ROLLOUT_CONTROL_V1',head:process.env.GITHUB_SHA,cloud_run:process.env.GITHUB_RUN_ID,sourceHTTP:0,D1:0,MAIN:0,Telegram:0,writer_enabled:false,automatic_rotation_enabled:false,secret_values_exported:false};
const admit=kind=>{const used=kind==='github'?github_HTTP:cloudflare_HTTP,max=kind==='github'?P.max_control_HTTP:P.max_cloudflare_HTTP,s=budget.summary();if(used>=max||s.remaining<=24)throw Error('FREE_ARCHIVE_READER_WHOLE_HTTP_BOUND');const lane=kind==='cloudflare'&&s.used.background<56?'background':'hot';if(!budget.reserve({logical_request_id:'FREE_READERS:'+kind+':'+used,lane,attempts:1}).allowed)throw Error('FREE_ARCHIVE_READER_WHOLE_HTTP_BOUND');if(kind==='github')github_HTTP++;else cloudflare_HTTP++;};
const control=makeGithubControl({repository,token:process.env.GITHUB_TOKEN,fetch_impl:(url,opt)=>{if(opt.method!=='GET')throw Error('FREE_READER_GITHUB_READ_ONLY');admit('github');return fetch(url,{...opt,redirect:'error'});}});
const save=async p=>{proof=p;await fs.writeFile(dir+'/proof.json',JSON.stringify({...out,...p,github_HTTP,cloudflare_HTTP,whole_HTTP:budget.summary(),manual_HTTP_reserved:24,secret_values_exported:false},null,2)+'\n');};
async function cf(name,suffix,{method='GET',body,raw=false}={}){
 if(!names.includes(name)||!/^\/(?:deployments|settings|schedules|versions(?:\?[^/]+|\/[a-f0-9-]+)?|content\/v2)$/.test(suffix)||!['GET','POST'].includes(method)||method==='POST'&&!/^\/(?:versions|deployments)/.test(suffix))throw Error('EXACT_FREE_READER_CLOUDFLARE_ROUTE_REQUIRED');
 admit('cloudflare');const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+P.account+'/workers/scripts/'+name+suffix,{method,headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,...(body&&!(body instanceof FormData)?{'content-type':'application/json'}:{})},...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('FREE_READER_CLOUDFLARE_HTTP_'+r.status);if(raw)return r;const j=await r.json();if(!j.success||!j.result)throw Error('FREE_READER_CLOUDFLARE_ACK_REQUIRED');return j.result;
}
try{
 const request=JSON.parse(await fs.readFile(requestPath,'utf8'));
 if(request.execute!==true)await save({status:'FREE_ARCHIVE_READER_ROLLOUT_NOT_REQUESTED'});
 else{
  if(process.env.GITHUB_REPOSITORY!==repository||!/^\d+$/.test(process.env.GITHUB_RUN_ID||'')||!process.env.CLOUDFLARE_API_TOKEN||request.writer_enabled!==false||request.native_schema_run!==38781244995)throw Error('EXACT_FREE_READER_AUTHORIZED_REQUEST_REQUIRED');
  const guard=async({min_headroom_ms=30000}={})=>{
   const main=(await control.call('git/ref/heads/main')).object.sha;if(main!==request.expected_main)throw Error('FREE_ARCHIVE_READER_MAIN_MOVED');
   const [phase,fence]=await Promise.all([control.read('checkpoints/CLOUD_PHASE_STATE_20261004.json',main),control.read('audit-fixes/source-optimization-20260930/execution-lock.json',main)]),l=phase.value.lease;
   if(fence.value.active||!active105OfflineReviewOwner(phase.value)||l.owner!==request.expected_owner||!l.scope.includes('FREE_ARCHIVE_BINDINGS_ROLLOUT')||l.expires_ts-Date.now()<min_headroom_ms)throw Error('EXACT_FREE_ARCHIVE_BINDINGS_LEASE_REQUIRED');
   // Variables REST requires a separate Variables permission which the
   // contents-read workflow token does not request. Use the authoritative
   // Actions vars context supplied at job start; an active own lease forbids
   // changing these flags during this bounded rollout.
   requireArchiveWritersOff({total_count:3,variables:[{name:'REPORT2_CANONICAL_ARCHIVE_POOL_ENABLED',value:process.env.REPORT2_ROLLOUT_POOL_FLAG},{name:'REPORT2_LOSSLESS_RETENTION_ENABLED',value:process.env.REPORT2_ROLLOUT_RETENTION_FLAG},{name:'REPORT2_CANONICAL_COMPACTION_ENABLED',value:process.env.REPORT2_ROLLOUT_COMPACTION_FLAG}]});out.repository_writer_and_rotation_flags_verified_off=true;out.repository_flags_basis='GITHUB_ACTIONS_VARS_CONTEXT_AT_JOB_START';
  };
  await guard({min_headroom_ms:600000});
  const run=await control.call('actions/runs/'+request.qualified_run);
  if(run.head_sha!==request.qualified_head||run.conclusion!=='success'||run.name!=='LIQ assembled spot and 105 admission offline')throw Error('EXACT_FREE_READER_CLOUD_QUALIFICATION_REQUIRED');
  if(process.env.GITHUB_SHA!==request.qualified_head){const c=await control.call('compare/'+request.qualified_head+'...'+process.env.GITHUB_SHA);if(c.status!=='ahead'||c.merge_base_commit?.sha!==request.qualified_head||!Array.isArray(c.files)||c.files.some(f=>f.filename!==requestPath))throw Error('FREE_READER_CODE_CHANGED_AFTER_QUALIFICATION');}
  // Compare exact Git blob hashes for all tracked executable runtime/runner/
  // consumer modules, including transitive imports, to the fresh main tree.
  const paths=execFileSync('git',['ls-files','-z','runner/*.mjs','current-generation/files/*.mjs','current-generation/files/*.js','cloudflare/*.mjs','cloudflare/*.js','tools/rollout-free-archive-readers-20261015.mjs','cloudflare/free-history/wrangler-liq.json'],{encoding:'utf8'}).split('\0').filter(Boolean);
  const tree=await control.call('git/trees/'+request.expected_main+'?recursive=1');if(tree.truncated||!Array.isArray(tree.tree)||!paths.length)throw Error('FREE_READER_COMPLETE_MAIN_CODE_TREE_REQUIRED');
  const blobs=new Map(tree.tree.filter(r=>r.type==='blob').map(r=>[r.path,r.sha])),manifest={};
  for(const p of paths){const b=await fs.readFile(p),sha=createHash('sha1').update(Buffer.concat([Buffer.from('blob '+b.length+'\0'),b])).digest('hex');if(blobs.get(p)!==sha)throw Error('FREE_READER_MAIN_EXECUTABLE_CODE_MISMATCH');manifest[p]=sha;}
  const schema_receipt=JSON.parse(await fs.readFile('checkpoints/free-storage-20261015/schema-38781244995.json','utf8'));
  if(schema_receipt.cloud_run!=='38781244995'||schema_receipt.D1?.unknown_ops!==0||schema_receipt.writer_enabled!==false||schema_receipt.existing_main_rows_modified!==0)throw Error('EXACT_FREE_READER_NATIVE_SCHEMA_RECEIPT_REQUIRED');
  const config=JSON.parse(await fs.readFile('cloudflare/free-history/wrangler-liq.json','utf8')),reader=createVersionBoundWorkerReader({call:cf}),settings=new Map(),runtimes=new Map();
  const specs=[{name:P.collector,crons:['*/5 * * * *','3-58/5 * * * *']},{name:names[1],crons:config.triggers.crons}],snapshot=async w=>{const s=await reader.read(w);if(!settings.has(w.name)){settings.set(w.name,reader.settings(w.name,s.version_id));runtimes.set(w.name,reader.version(w.name,s.version_id).resources.script_runtime);}return s;};
  const workers=[],bytes=new Map(),targetSettings=new Map();
  for(const spec of specs){
   const before=await snapshot(spec),originalSettings=settings.get(spec.name),binding=freeArchiveBindingPlan({settings:originalSettings,schema_receipt});
   if(binding.added_locations.length!==4)throw Error('FREE_READER_ALREADY_PARTIAL_OR_INSTALLED_REQUIRES_EXACT_RESUME');
   const desired={...originalSettings,bindings:binding.bindings};targetSettings.set(spec.name,desired);
   let module;
   if(spec.name===P.collector){const original=reader.module(spec.name,before.version_id).bytes.toString(),injected=injectPrivatePriceRuntime(await fs.readFile('cloudflare/public-collector/injected-worker-tail.js','utf8')).source.trim(),patched=patchWorker(original,injected),marker='var __REPORT2_PUBLIC_COLLECTOR_VERSION = ',at=original.indexOf(marker);if(!['UPDATED','ALREADY_PATCHED'].includes(patched.status)||at<0||patched.source.indexOf(marker)!==at||original.slice(0,at)!==patched.source.slice(0,at))throw Error('FREE_READER_EXACT_HUB_PREFIX_REQUIRED');module=Buffer.from(patched.source);out.hub_prefix_sha256=rolloutDigest(original.slice(0,at));}
   else module=await fs.readFile(dir+'/liq/'+path.basename(config.main).replace(/\.mjs$/,'.js'));
   bytes.set(spec.name,module);workers.push({...spec,required_before:before,module_sha256:rolloutDigest(module),target_settings_sha256:workerSettingsFingerprint(desired),added_archive_bindings:binding.added_locations});
  }
  const plan={head:request.qualified_head,expected_main:request.expected_main,native_schema_run:38781244995,writer_enabled:false,qualified:{head:request.qualified_head,run:run.id,status:'EXACT_CLOUD_AND_CURRENT_MAIN_CODE_VERIFIED',current_code_manifest_sha256:rolloutDigest(manifest),current_code_files:paths.length},workers};
  const adapter={snapshot,requireHeadroom:n=>{if(P.max_cloudflare_HTTP-cloudflare_HTTP<n||budget.summary().remaining-24<n)throw Error('FREE_READER_ROLLBACK_HTTP_HEADROOM_REQUIRED');},stage:async(w,before)=>{
   const latest=await cf(w.name,'/versions?per_page=1');if(latest.items?.[0]?.id!==before.version_id)throw Error('FREE_READER_LATEST_UPLOAD_IS_NOT_ACTIVE');
   const metadata=w.name===P.collector?collectorVersionMetadata({settings:targetSettings.get(w.name),runtime:runtimes.get(w.name),head:request.qualified_head,active_version:before.version_id,latest_uploaded_version:latest.items[0].id}):historyVersionMetadata({settings:targetSettings.get(w.name),runtime:runtimes.get(w.name),config,main_module:path.basename(config.main).replace(/\.mjs$/,'.js'),head:request.qualified_head});
   const moduleName=w.name===P.collector?'worker.js':path.basename(config.main).replace(/\.mjs$/,'.js'),form=new FormData();form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));form.set(moduleName,new Blob([bytes.get(w.name)],{type:'application/javascript+module'}),moduleName);
   const v=await cf(w.name,'/versions?bindings_inherit=strict',{method:'POST',body:form});return{version_id:v.id,activated:false};
  },activate:(w,id)=>cf(w.name,'/deployments',{method:'POST',body:{strategy:'percentage',versions:[{version_id:id,percentage:100}],annotations:{'workers/message':'Exact free archive readers '+request.qualified_head}}})};
  await rolloutFreeArchiveReaders({plan,adapter,guard,save,execute:true});
 }
}catch(error){if(!error.archive_rollout_receipt)await save({status:'FREE_ARCHIVE_READER_ROLLOUT_NOT_CLOSED',reason:/^[A-Z0-9_]+$/.test(error.message)?error.message:'FREE_ARCHIVE_READER_ROLLOUT_ERROR'});process.exitCode=1;}
console.log(JSON.stringify({status:proof?.status,reason:proof?.reason,github_HTTP,cloudflare_HTTP,whole_HTTP:budget.summary(),sourceHTTP:0,D1:0,writer_enabled:false}));
