import fs from 'node:fs/promises';import path from 'node:path';import vm from 'node:vm';import {pathToFileURL} from 'node:url';
import {createVersionBoundWorkerReader} from '../runner/cloudflare-version-bound-readback.mjs';
import {makeGithubControl} from '../runner/github-bounded-phase-lease.mjs';
import {verifyWeeklyOriginalProposal} from './verify-weekly-htx-proposal.mjs';
import {createUnifiedHttpBudget} from '../current-generation/files/src/unified-budget.mjs';
import {rolloutDigest,coordinateWeeklyRollout,singleActiveVersion,workerSettingsFingerprint,historyVersionMetadata,readSingleWorkerModule as moduleBytes,verifySupersetHistory,WEEKLY_ROLLOUT_POLICY as P} from '../runner/htx-coordinated-rollout.mjs';
import {injectPrivatePriceRuntime} from '../cloudflare/public-collector/private-price-bundle.mjs';
import {patchWorker} from '../cloudflare/public-collector/patch-worker.mjs';
const PHASE='checkpoints/CLOUD_PHASE_STATE_20261004.json',FENCE='audit-fixes/source-optimization-20260930/execution-lock.json',repository='kovalev23091987-jpg/my-report-2-cloud-runner',dir='audit-output/weekly-coordinated-rollout';
await fs.mkdir(dir,{recursive:true});const budget=createUnifiedHttpBudget(P.http);let control_HTTP=0,cloudflare_HTTP=0,proof;
const admit=(kind)=>{
 const cap=kind==='github'?P.max_control_HTTP:P.max_cloudflare_HTTP,count=kind==='github'?control_HTTP:cloudflare_HTTP,s=budget.summary();
 if(count>=cap||s.remaining<=P.manual_HTTP_reserved)throw Error('WEEKLY_RELEASE_HTTP_BOUND');
 const lane=kind==='cloudflare'&&s.used.background<P.http.background?'background':'hot';
 if(!budget.reserve({logical_request_id:'WEEKLY_RELEASE:'+kind+':'+count,lane,attempts:1}).allowed)throw Error('WEEKLY_RELEASE_HTTP_BOUND');
 if(kind==='github')control_HTTP++;else cloudflare_HTTP++;
};
const control=makeGithubControl({repository,token:process.env.GITHUB_TOKEN,fetch_impl:(url,options)=>{admit('github');return fetch(url,{...options,redirect:'error'});}});
const cfBase='/accounts/'+P.account+'/workers/scripts/';
async function cf(script,suffix,{method='GET',body,raw=false}={}){
 admit('cloudflare');const response=await fetch('https://api.cloudflare.com/client/v4'+cfBase+script+suffix,{method,headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,...(body&&!(body instanceof FormData)?{'content-type':'application/json'}:{})},...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('CLOUDFLARE_HTTP_'+response.status);
 if(raw)return response;const j=await response.json();if(j.success!==true||!j.result)throw Error('CLOUDFLARE_ACK_REQUIRED');return j.result;
}
const originalSettings=new Map(),runtimeByVersion=new Map(),reader=createVersionBoundWorkerReader({call:cf});
async function snapshot(worker){
 const state=await reader.read(worker),settings=reader.settings(worker.name,state.version_id),runtime=reader.version(worker.name,state.version_id).resources.script_runtime;
 if(!originalSettings.has(worker.name)){originalSettings.set(worker.name,settings);runtimeByVersion.set(worker.name+':'+state.version_id,runtime);}
 if(worker.name!==P.collector)historyVersionMetadata({settings,runtime,config:worker.config,main_module:worker.main_module,head:process.env.WEEKLY_HEAD});
 return state;
}
const expected_main=process.env.EXPECTED_MAIN,head=process.env.WEEKLY_HEAD,owner=process.env.BORROW_EXISTING_OWNER;
async function guard({min_headroom_ms=30000}={}){
 if((await control.call('git/ref/heads/main')).object.sha!==expected_main)throw Error('WEEKLY_ROLLOUT_MAIN_MOVED');
 const [p,f]=await Promise.all([control.read(PHASE,expected_main),control.read(FENCE,expected_main)]),l=p.value.lease;
 if(!owner||l?.owner!==owner||f.value.active||l.expires_ts-Date.now()<min_headroom_ms||p.value.latest_own_bounded_continuation_lease?.owner!==owner||p.value.active_working_state?.owned_lease!==owner||p.value.active_working_state?.owner_weekly_HTX_catalog_sync_authorized!==true)throw Error('WEEKLY_ROLLOUT_OWN_AUTHORITY_REQUIRED');
}
const save=async p=>{proof=p;await fs.writeFile(dir+'/proof.json',JSON.stringify({...p,whole_HTTP:budget.summary(),github_control_HTTP:control_HTTP,cloudflare_HTTP,manual_HTTP_reserved:P.manual_HTTP_reserved,sourceHTTP:0,D1:0},null,2)+'\n');};
try{
 if(process.env.GITHUB_REPOSITORY!==repository||!process.env.CLOUDFLARE_API_TOKEN||!/^\d+$/.test(process.env.CONNECTED_RUN||''))throw Error('EXACT_WEEKLY_RELEASE_ACCESS_REQUIRED');
 if(process.env.WEEKLY_PREFLIGHT_HTTP!=='8')throw Error('EXACT_WORKFLOW_PREFLIGHT_HTTP_RESERVATION_REQUIRED');
 // The preceding data-only preflight uses six GitHub requests. Reserve eight
 // conservatively in this same whole-job envelope before any live CF read.
 for(let i=0;i<8;i++)admit('github');
 await guard({min_headroom_ms:P.min_lease_headroom_ms});
 const checked=await verifyWeeklyOriginalProposal({control,head,expected_main,branch:process.env.WEEKLY_BRANCH,source_run:process.env.WEEKLY_SOURCE_RUN});
 const run=await control.call('actions/runs/'+process.env.CONNECTED_RUN),workflow=await control.call('actions/workflows/liq-assembled-offline-20261012.yml');
 if(run.head_sha!==head||run.head_branch!==process.env.WEEKLY_BRANCH||run.workflow_id!==workflow.id||run.event!=='workflow_dispatch'||run.status!=='completed'||run.conclusion!=='success')throw Error('EXACT_CONNECTED_WEEKLY_RUN_REQUIRED');
 // The full proof reconstructed all six original catalogs and four outputs.
 // Bind this workspace again to the immutable proposal before using bundles.
 const binding=checked.proof;
 if(binding.head!==head||binding.expected_main!==expected_main||binding.status!=='ORIGINAL_SIX_CATALOGS_PLAN_ALL_CONSUMERS_EXACTLY_BOUND')throw Error('EXACT_ORIGINAL_PROPOSAL_PROOF_REQUIRED');
 const mod=await import(pathToFileURL(path.resolve('cloudflare/free-history/hourly-archive.mjs'))),old=await control.call('contents/cloudflare/free-history/hourly-archive.mjs?ref='+checked.receipt.proposal_base_sha),previousSource=Buffer.from(old.content,'base64').toString();
 const previous=JSON.parse(JSON.stringify(vm.runInNewContext(previousSource.replaceAll('export ', '')+';({TARGETS,HISTORY_TARGETS,KNOWN_HISTORY_MANIFESTS})',{TextEncoder},{timeout:1000})));
 const scope=verifySupersetHistory({previous_targets:previous.TARGETS,targets:mod.TARGETS,previous_manifests:previous.KNOWN_HISTORY_MANIFESTS,manifests:mod.KNOWN_HISTORY_MANIFESTS,manifest_sha256:mod.MANIFEST_SHA256});
 if(mod.MANIFEST_SHA256!==binding.manifest_sha256)throw Error('EXACT_NODE_HISTORY_MANIFEST_REQUIRED');
 const workers=[];
 for(const [configPath,subdir] of [['cloudflare/free-history/wrangler.json','htx'],['cloudflare/free-history/wrangler-liq.json','liq']]){
  const config=JSON.parse(await fs.readFile(configPath)),main_module=path.basename(config.main).replace(/\.mjs$/,'.js'),bundlePath=dir+'/'+subdir+'/'+main_module,bytes=await fs.readFile(bundlePath);
  if(config.account_id!==P.account||!bytes.includes(Buffer.from(mod.MANIFEST_SHA256))||checked.receipt.plan.added.some(a=>!bytes.includes(Buffer.from(a.contract_code))))throw Error('EXACT_COMPILED_HISTORY_TARGETS_REQUIRED');
  workers.push({name:config.name,crons:config.triggers.crons,config,main_module,bundlePath,module_sha256:rolloutDigest(bytes)});
 }
 const injected=injectPrivatePriceRuntime(await fs.readFile('cloudflare/public-collector/injected-worker-tail.js','utf8')).source.trim();
 const adapter={
  requireHeadroom:n=>{if(P.max_cloudflare_HTTP-cloudflare_HTTP<n||budget.summary().remaining-P.manual_HTTP_reserved<n)throw Error('WEEKLY_ROLLBACK_HTTP_HEADROOM_REQUIRED');},snapshot,
  readCollector:async()=>{
   const worker={name:P.collector,crons:['*/5 * * * *','3-58/5 * * * *']},state=await snapshot(worker),bytes=reader.module(P.collector,state.version_id)?.bytes;
   if(!bytes)throw Error('EXACT_ACTIVE_COLLECTOR_BYTES_REQUIRED');
   if(rolloutDigest(bytes)!==state.module_sha256||patchWorker(bytes.toString(),injected).status!=='ALREADY_PATCHED'||/APPROVED_HTX_SCOPE|export const TARGETS/.test(injected)||!injected.includes('for (var [contract, info] of catalogMap)'))throw Error('UNIVERSE_NEUTRAL_COLLECTOR_EXACT_TAIL_REQUIRED');
   const settings=originalSettings.get(P.collector),byName=new Map(settings.bindings.map(b=>[b.name,b]));
   for(const [name,id] of [['DATA_DB','057a2847-2cc4-4e52-8534-1be1596d21d5'],['CANONICAL_ARCHIVE_DB','f66e7081-0e67-49a2-8f69-68af00cdaf92']])if(byName.get(name)?.type!=='d1'||(byName.get(name).id??byName.get(name).database_id)!==id)throw Error('COLLECTOR_EXACT_D1_BINDINGS_REQUIRED');
   for(const name of ['ALERT_DISPATCH_KEY','BYKARANTELI_API_KEY','REPORT2_CLOUD_SOURCE_PROXY_TOKEN','TELEGRAM_BOT_TOKEN','TELEGRAM_CHAT_ID','TELEGRAM_TEST_KEY','PUBLIC_COLLECTOR_ENABLED','PRICE_RECHECK_ENABLED','ANALYTICS_ENABLED','DELIVERY_ENABLED','CALIBRATION_APPLY_ENABLED','REPORT2_CURRENT_GENERATION'])if(!byName.has(name))throw Error('COLLECTOR_REQUIRED_BINDING_MISSING');
   return{...state,status:'EXACT_CURRENT_UNIVERSE_NEUTRAL_COLLECTOR',deployment_reused:true,secret_values_exported:false,original_source_clocks_preserved:true};
  },
  stage:async(w,before)=>{
   const metadata=historyVersionMetadata({settings:originalSettings.get(w.name),runtime:runtimeByVersion.get(w.name+':'+before.version_id),config:w.config,main_module:w.main_module,head});
   const bytes=await fs.readFile(w.bundlePath);if(rolloutDigest(bytes)!==w.module_sha256)throw Error('COMPILED_HISTORY_BUNDLE_MOVED');
   const form=new FormData();form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));form.set(w.main_module,new Blob([bytes],{type:'application/javascript+module'}),w.main_module);
   const version=await cf(w.name,'/versions?bindings_inherit=strict',{method:'POST',body:form});
   if(!version.id||version.annotations?.['workers/commit_sha']&&version.annotations['workers/commit_sha']!==head)throw Error('STAGED_HISTORY_VERSION_REQUIRED');
   // Upload and activation are separate Cloudflare operations; immutable module
   // bytes are checked once the exact uploaded version is actually selected.
   return{version_id:version.id,module_sha256:w.module_sha256,activated:false};
  },
  activate:(w,version_id)=>cf(w.name,'/deployments',{method:'POST',body:{strategy:'percentage',versions:[{version_id,percentage:100}],annotations:{'workers/message':'Coordinated exact weekly scope '+head}}}),
 };
 const plan={head,expected_main,connected:{status:'EXACT_WEEKLY_CONNECTED_CHECK_SUCCESS',head,run:run.id,url:run.html_url},scope,workers};
 await coordinateWeeklyRollout({plan,adapter,guard,save,execute:process.env.EXECUTE_WEEKLY_ROLLOUT==='true'});
}catch(e){if(!e.rollout_receipt)await save({...proof,schema:'HTX_COORDINATED_WEEKLY_ROLLOUT_V1',status:'WEEKLY_NOT_ACTIVATED',reason:/^[A-Z0-9_]+$/.test(e.message)?e.message:'WEEKLY_RELEASE_ERROR',head,expected_main,sourceHTTP:0,D1:0,MAIN:0,Telegram:0,production_scope_changed:false});process.exitCode=1;}
console.log(JSON.stringify({status:proof?.status,reason:proof?.reason,head,whole_HTTP:budget.summary(),cloudflare_HTTP,github_control_HTTP:control_HTTP,sourceHTTP:0,D1:0,production_scope_changed:false}));
