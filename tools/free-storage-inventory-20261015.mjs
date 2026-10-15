import fs from 'node:fs/promises';
import {makeGithubControl} from '../runner/github-bounded-phase-lease.mjs';
import {inventoryFreeStorage} from '../runner/free-storage-inventory.mjs';
const repository='kovalev23091987-jpg/my-report-2-cloud-runner';
const dir='audit-output/free-storage',requestPath='checkpoints/FREE_STORAGE_INVENTORY_REQUEST_20261015.json';
await fs.mkdir(dir,{recursive:true});
const out={schema:'FREE_STORAGE_ACCOUNT_INVENTORY_CONTROL_V1',head:process.env.GITHUB_SHA,
 cloud_run:process.env.GITHUB_RUN_ID,sourceHTTP:0,D1_SQL:0,MAIN:0,Telegram:0,
 rows_modified:0,databases_created:0,paid_activation:false};
let github_HTTP=0,cloudflare_metadata_HTTP=0;
try{
 if(process.env.GITHUB_REPOSITORY!==repository||!/^\d+$/.test(process.env.GITHUB_RUN_ID||''))throw Error('FREE_STORAGE_EXACT_REPOSITORY_RUN_REQUIRED');
 const request=JSON.parse(await fs.readFile(requestPath,'utf8'));
 if(request?.schema!=='FREE_STORAGE_METADATA_REQUEST_V1'||request.max_cloudflare_metadata_HTTP!==11||request.SQL!==0||request.create_databases!==false||!/^CODEX:ACTIVE105_FREE_STORAGE_ROLLING:\d+$/.test(request.expected_owner||'')||!/^[a-f0-9]{40}$/.test(request.expected_main||''))throw Error('FREE_STORAGE_EXACT_READ_ONLY_REQUEST_REQUIRED');
 const prior=request.prior_cloudflare_metadata_HTTP??0;
 if(!Number.isSafeInteger(prior)||prior<0||prior>=11)throw Error('FREE_STORAGE_PRIOR_HTTP_REQUIRED');
 cloudflare_metadata_HTTP=prior;out.prior_cloudflare_metadata_HTTP=prior;
 const control=makeGithubControl({repository,token:process.env.GITHUB_TOKEN,fetch_impl:async(url,options)=>{
  if(++github_HTTP>8||options.method!=='GET')throw Error('FREE_STORAGE_CONTROL_GET_ONLY');
  return fetch(url,{...options,redirect:'error'});
 }});
 const main=(await control.call('git/ref/heads/main')).object.sha;
 if(main!==request.expected_main)throw Error('FREE_STORAGE_EXPECTED_MAIN_MOVED');
 const [phase,fence,status,resume,generation]=await Promise.all([
  control.read('checkpoints/CLOUD_PHASE_STATE_20261004.json',main),control.read('audit-fixes/source-optimization-20260930/execution-lock.json',main),
  control.read('checkpoints/CURRENT_PROJECT_STATUS.json',main),control.read('checkpoints/OWNER_REVIEW_RESUME_POINT_20261010.json',main),control.read('REPORT2_CURRENT_GENERATION.json',main)
 ]);
 const lease=phase.value.lease;
 if(fence.value.active||lease?.owner!==request.expected_owner||lease.expires_ts<=Date.now()||phase.value.latest_own_bounded_continuation_lease?.owner!==lease.owner||phase.value.active_working_state?.owned_lease!==lease.owner||!lease.scope.includes('at most11 Cloudflare metadata inventory requests')||status.value.active_working_state?.owner_authorized_sequential_continuation!==true||resume.value.active_working_state?.owner_authorized_sequential_continuation!==true||generation.value.latest_only!==true)throw Error('FREE_STORAGE_CURRENT_BOUNDED_OWNER_REQUIRED');
 out.control={main,owner:lease.owner,expires_ts:lease.expires_ts};
 out.token_role=process.env.REPORT2_FREE_STORAGE_TOKEN_ROLE;
 const inventory=await inventoryFreeStorage({token:process.env.CLOUDFLARE_D1_READ_TOKEN,max_requests:11-prior,before_request:()=>{
  if(lease.expires_ts<=Date.now()||cloudflare_metadata_HTTP>=11||github_HTTP+cloudflare_metadata_HTTP>=164)return{allowed:false};
  cloudflare_metadata_HTTP++;return{allowed:true};
 }});
 Object.assign(out,inventory);
}catch(error){
 out.status='FREE_STORAGE_INVENTORY_NOT_CLOSED';
 out.reason=/^[A-Z0-9_]+$/.test(error.message)?error.message:'FREE_STORAGE_METADATA_TRANSPORT_OR_RESPONSE_ERROR';
 process.exitCode=1;
}finally{
 out.github_control_HTTP=github_HTTP;out.cloudflare_metadata_HTTP=cloudflare_metadata_HTTP;
 out.completed_ts=Date.now();out.capacity_recovered=false;out.automatic_retention_activated=false;
 await fs.writeFile(dir+'/inventory.json',JSON.stringify(out,null,2)+'\n');
 console.log(JSON.stringify({status:out.status,reason:out.reason,databases:out.databases?.length,free_expansion_slots:out.expansion?.new_database_count,github_HTTP,cloudflare_metadata_HTTP,D1_SQL:0,databases_created:0}));
}
