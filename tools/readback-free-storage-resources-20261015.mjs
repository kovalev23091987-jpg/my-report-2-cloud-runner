import fs from 'node:fs/promises';import {createHash} from 'node:crypto';
import {makeGithubControl} from '../runner/github-bounded-phase-lease.mjs';
import {freeStorageOfflineReviewOwner} from '../runner/offline-review-authority.mjs';
import {verifyFreeArchiveIdentities} from '../runner/free-storage-resource-readback.mjs';
const repository='kovalev23091987-jpg/my-report-2-cloud-runner',dir='audit-output/free-storage-readback';await fs.mkdir(dir,{recursive:true});
const out={head:process.env.GITHUB_SHA,cloud_run:process.env.GITHUB_RUN_ID,sourceHTTP:0,D1_SQL:0,MAIN:0,Telegram:0,databases_created:0};let github_HTTP=0,metadata_GET=0;
try{
 if(process.env.GITHUB_REPOSITORY!==repository)throw Error('FREE_READBACK_REPOSITORY_REQUIRED');
 const request=JSON.parse(await fs.readFile('checkpoints/FREE_STORAGE_RESOURCE_READBACK_REQUEST_20261015.json','utf8'));
 const control=makeGithubControl({repository,token:process.env.GITHUB_TOKEN,fetch_impl:async(url,options)=>{if(++github_HTTP>5||options.method!=='GET')throw Error('FREE_READBACK_GITHUB_GET_ONLY');return fetch(url,{...options,redirect:'error'});}});
 const main=(await control.call('git/ref/heads/main')).object.sha;if(main!==request.expected_main)throw Error('FREE_READBACK_MAIN_MOVED');
 const [phase,fence]=await Promise.all([control.read('checkpoints/CLOUD_PHASE_STATE_20261004.json',main),control.read('audit-fixes/source-optimization-20260930/execution-lock.json',main)]);
 if(fence.value.active||!freeStorageOfflineReviewOwner(phase.value)||phase.value.lease.owner!==request.expected_owner||request.prior_metadata_GET!==9)throw Error('FREE_READBACK_EXACT_OWNER_REQUIRED');
 const readProof=async(path,sha)=>{const raw=await fs.readFile(path);if(createHash('sha256').update(raw).digest('hex')!==sha)throw Error('FREE_READBACK_EXACT_PROOF_REQUIRED');return JSON.parse(raw);};
 const inventory=await readProof(request.inventory_path,request.inventory_sha256),receipt=await readProof(request.creation_path,request.creation_sha256);
 if(receipt.created?.length!==4||receipt.cloudflare_creation_POST!==4||receipt.D1_SQL!==0)throw Error('FREE_READBACK_CREATION_RECEIPT_REQUIRED');
 if(!process.env.REPORT2_ISOLATED_D1_API_TOKEN)throw Error('FREE_READBACK_D1_METADATA_ACCESS_REQUIRED');
 metadata_GET++;
 const r=await fetch('https://api.cloudflare.com/client/v4/accounts/70ee0af85191ea470e74c7383fdec772/d1/database?per_page=20&page=1',{headers:{authorization:'Bearer '+process.env.REPORT2_ISOLATED_D1_API_TOKEN,'cache-control':'no-cache'},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('FREE_READBACK_METADATA_HTTP_'+r.status);
 Object.assign(out,verifyFreeArchiveIdentities(await r.json(),{existing:inventory.databases,created:receipt.created}));
 if(!out.verified)process.exitCode=1;
}catch(error){out.status=out.status||'FREE_ARCHIVE_READBACK_NOT_CLOSED';out.reason=/^[A-Z0-9_]+$/.test(error.message)?error.message:'FREE_READBACK_ERROR';process.exitCode=1;}
finally{out.github_control_HTTP=github_HTTP;out.cloudflare_metadata_GET=metadata_GET;out.total_metadata_GET_including_prior=9+metadata_GET;out.completed_ts=Date.now();await fs.writeFile(dir+'/readback.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({status:out.status,verified:out.verified,reason:out.reason,result_info:out.result_info,metadata_GET}));}
