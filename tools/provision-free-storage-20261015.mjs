import fs from 'node:fs/promises';import {createHash} from 'node:crypto';
import {makeGithubControl} from '../runner/github-bounded-phase-lease.mjs';
import {freeStorageOfflineReviewOwner} from '../runner/offline-review-authority.mjs';
import {provisionFreeArchives} from '../runner/free-storage-provision.mjs';
const repository='kovalev23091987-jpg/my-report-2-cloud-runner',requestPath='checkpoints/FREE_STORAGE_EXPANSION_REQUEST_20261015.json',dir='audit-output/free-storage-provision';
await fs.mkdir(dir,{recursive:true});
const out={schema:'FREE_ARCHIVE_PROVISION_CONTROL_V1',head:process.env.GITHUB_SHA,cloud_run:process.env.GITHUB_RUN_ID,sourceHTTP:0,D1_SQL:0,MAIN:0,Telegram:0,existing_rows_modified:0,paid_activation:false};
let github_HTTP=0,metadata_GET=0,creation_POST=0;
try{
 const request=JSON.parse(await fs.readFile(requestPath,'utf8'));
 if(request.execute!==true){out.status='EXPLICIT_FREE_ARCHIVE_CREATION_NOT_REQUESTED';}
 else{
  if(process.env.GITHUB_REPOSITORY!==repository||!/^\d+$/.test(process.env.GITHUB_RUN_ID||'')||request.max_create!==4||request.SQL!==0||request.paid_activation!==false)throw Error('FREE_ARCHIVE_EXACT_OWNER_REQUEST_REQUIRED');
  const control=makeGithubControl({repository,token:process.env.GITHUB_TOKEN,fetch_impl:async(url,options)=>{
   if(++github_HTTP>32||options.method!=='GET')throw Error('FREE_ARCHIVE_GITHUB_READ_BOUND');return fetch(url,{...options,redirect:'error'});
  }});
  const inventoryRaw=await fs.readFile(request.inventory_path,'utf8');
  if(createHash('sha256').update(inventoryRaw).digest('hex')!==request.inventory_sha256)throw Error('FREE_ARCHIVE_IMMUTABLE_INVENTORY_REQUIRED');
  const inventory=JSON.parse(inventoryRaw);
  if(inventory.cloudflare_metadata_HTTP!==7||inventory.token_role!=='REPORT2_ISOLATED_D1_API_TOKEN'||inventory.complete!==true)throw Error('FREE_ARCHIVE_EXACT_ACCOUNT_INVENTORY_REQUIRED');
  const run=await control.call('actions/runs/'+request.qualified_run);
  if(run.head_sha!==request.qualified_head||run.conclusion!=='success'||run.name!=='LIQ assembled spot and 105 admission offline')throw Error('FREE_ARCHIVE_EXACT_CLOUD_READER_QUALIFICATION_REQUIRED');
  if(process.env.GITHUB_SHA!==request.qualified_head){
   const compare=await control.call('compare/'+request.qualified_head+'...'+process.env.GITHUB_SHA);
   if(compare.merge_base_commit?.sha!==request.qualified_head||compare.status!=='ahead'||!Array.isArray(compare.files)||compare.files.some(f=>f.filename!==requestPath))throw Error('FREE_ARCHIVE_EXECUTABLE_CHANGED_AFTER_QUALIFICATION');
  }
  const guard=async()=>{
   const main=(await control.call('git/ref/heads/main')).object.sha;
   if(main!==request.expected_main)throw Error('FREE_ARCHIVE_MAIN_MOVED');
   const [phase,fence]=await Promise.all([control.read('checkpoints/CLOUD_PHASE_STATE_20261004.json',main),control.read('audit-fixes/source-optimization-20260930/execution-lock.json',main)]);
   if(fence.value.active||!freeStorageOfflineReviewOwner(phase.value)||phase.value.lease.owner!==request.expected_owner)throw Error('FREE_ARCHIVE_CURRENT_OWNER_REQUIRED');
  };
  await guard();out.token_role='REPORT2_ISOLATED_D1_API_TOKEN';
  Object.assign(out,await provisionFreeArchives({inventory,token:process.env.REPORT2_ISOLATED_D1_API_TOKEN,readers_qualified:true,before_mutate:guard,before_request:({method})=>{
   if(method==='GET'){if(metadata_GET>=2||inventory.cloudflare_metadata_HTTP+metadata_GET>=11)return{allowed:false};metadata_GET++;}
   else{if(creation_POST>=4)return{allowed:false};creation_POST++;}
   return{allowed:github_HTTP+metadata_GET+creation_POST<=140};
  }}));
 }
}catch(error){if(error.provision_receipt)Object.assign(out,error.provision_receipt);out.status=out.status||'FREE_ARCHIVE_PROVISION_NOT_CLOSED';out.reason=/^[A-Z0-9_]+$/.test(error.message)?error.message:'FREE_ARCHIVE_PROVISION_ERROR';process.exitCode=1;}
finally{
 out.github_control_HTTP=github_HTTP;out.cloudflare_metadata_GET=metadata_GET;out.cloudflare_creation_POST=creation_POST;
 out.schemas_initialized=false;out.consumer_bindings_installed=false;out.used_for_reports=false;out.capacity_recovered=false;out.completed_ts=Date.now();
 await fs.writeFile(dir+'/provision.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({status:out.status,reason:out.reason,created:out.created?.length??0,metadata_GET,creation_POST,D1_SQL:0}));
}
