import fs from 'node:fs/promises';
import {makeGithubControl} from '../runner/github-bounded-phase-lease.mjs';
import {rolloutDigest,singleActiveVersion} from '../runner/htx-coordinated-rollout.mjs';
const repository='kovalev23091987-jpg/my-report-2-cloud-runner',name='my-report-2-hub',dir='audit-output/free-archive-bindings';
await fs.mkdir(dir,{recursive:true});const out={schema:'EXACT_OWN_ARCHIVE_BINDING_DIAGNOSIS_V1',cloud_run:process.env.GITHUB_RUN_ID,head:process.env.GITHUB_SHA,Cloudflare_GET:0,github_GET:0,SQL:0,sourceHTTP:0,worker_mutations:0,secret_values_exported:false};
try{
 const req=JSON.parse(await fs.readFile('checkpoints/FREE_ARCHIVE_BINDING_DIAGNOSIS_REQUEST_20261015.json','utf8'));
 if(!req.execute)out.status='NOT_REQUESTED';else{
  const control=makeGithubControl({repository,token:process.env.GITHUB_TOKEN,fetch_impl:(url,opt)=>{if(opt.method!=='GET'||++out.github_GET>3)throw Error('DIAGNOSIS_GITHUB_BOUND');return fetch(url,{...opt,redirect:'error'});}});
  const main=(await control.call('git/ref/heads/main')).object.sha;if(main!==req.expected_main)throw Error('DIAGNOSIS_MAIN_MOVED');
  const [p,f]=await Promise.all([control.read('checkpoints/CLOUD_PHASE_STATE_20261004.json',main),control.read('audit-fixes/source-optimization-20260930/execution-lock.json',main)]),l=p.value.lease;
  if(f.value.active||l?.owner!==req.expected_owner||l.expires_ts<=Date.now()||!l.scope.includes('FREE_ARCHIVE_BINDINGS_DIAGNOSIS'))throw Error('DIAGNOSIS_LEASE_REQUIRED');
  const prior=JSON.parse(await fs.readFile('checkpoints/free-storage-20261015/reader-partial-38792404641.json','utf8')),w=prior.workers[0];
  const get=async suffix=>{if(++out.Cloudflare_GET>4)throw Error('DIAGNOSIS_CF_BOUND');const r=await fetch('https://api.cloudflare.com/client/v4/accounts/70ee0af85191ea470e74c7383fdec772/workers/scripts/'+name+suffix,{headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN},redirect:'error',signal:AbortSignal.timeout(15000)});const j=await r.json();if(!r.ok||!j.success)throw Error('DIAGNOSIS_CF_ACK_REQUIRED');return j.result;};
  const before=singleActiveVersion(await get('/deployments'));if(before.version_id!==w.staged.version_id)throw Error('DIAGNOSIS_FOREIGN_ACTIVE_VERSION');
  const original=await get('/versions/'+w.before.version_id),staged=await get('/versions/'+w.staged.version_id);
  const summarize=b=>({name:b.name,type:b.type,keys:Object.keys(b).sort(),field_sha256:Object.fromEntries(Object.entries(b).map(([k,v])=>[k,rolloutDigest(v)])),...(b.type==='d1'?{id:b.id,database_id:b.database_id}: {})});
  out.original_bindings=original.resources.bindings.map(summarize);out.staged_bindings=staged.resources.bindings.map(summarize);out.runtime_equal=rolloutDigest(original.resources.script_runtime)===rolloutDigest(staged.resources.script_runtime);
  const after=singleActiveVersion(await get('/deployments'));if(JSON.stringify(before)!==JSON.stringify(after))throw Error('DIAGNOSIS_DEPLOYMENT_MOVED');
  out.active=after;out.original_version=original.id;out.staged_version=staged.id;out.status='EXACT_OWN_IMMUTABLE_BINDING_SHAPES_READ';
 }
}catch(e){out.status='DIAGNOSIS_NOT_CLOSED';out.reason=/^[A-Z0-9_]+$/.test(e.message)?e.message:'DIAGNOSIS_ERROR';process.exitCode=1;}
finally{out.completed_ts=Date.now();await fs.writeFile(dir+'/proof.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({status:out.status,reason:out.reason,Cloudflare_GET:out.Cloudflare_GET,github_GET:out.github_GET}));}
