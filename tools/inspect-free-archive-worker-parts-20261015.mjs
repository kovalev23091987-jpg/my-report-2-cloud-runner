import fs from 'node:fs/promises';import {createHash} from 'node:crypto';
import {makeGithubControl} from '../runner/github-bounded-phase-lease.mjs';
const repository='kovalev23091987-jpg/my-report-2-cloud-runner',name='my-report-2-liq-forecast-history',root='https://api.cloudflare.com/client/v4/accounts/70ee0af85191ea470e74c7383fdec772/workers/scripts/'+name,dir='audit-output/free-archive-worker-parts';
await fs.mkdir(dir,{recursive:true});const out={schema:'FREE_ARCHIVE_CURRENT_MULTIPART_METADATA_V1',head:process.env.GITHUB_SHA,cloud_run:process.env.GITHUB_RUN_ID,Cloudflare_GET:0,github_GET:0,SQL:0,sourceHTTP:0,worker_mutations:0,secret_values_exported:false};
try{
 const req=JSON.parse(await fs.readFile('checkpoints/FREE_ARCHIVE_PARTS_INSPECTION_REQUEST_20261015.json','utf8'));
 if(req.execute!==true)out.status='PARTS_INSPECTION_NOT_REQUESTED';else{
  if(process.env.GITHUB_REPOSITORY!==repository)throw Error('EXACT_INSPECTION_REPOSITORY_REQUIRED');
  const control=makeGithubControl({repository,token:process.env.GITHUB_TOKEN,fetch_impl:(url,opt)=>{if(opt.method!=='GET'||++out.github_GET>3)throw Error('INSPECTION_READ_ONLY_GITHUB_BOUND');return fetch(url,{...opt,redirect:'error'});}});
  const main=(await control.call('git/ref/heads/main')).object.sha;if(main!==req.expected_main)throw Error('INSPECTION_MAIN_MOVED');
  const [p,f]=await Promise.all([control.read('checkpoints/CLOUD_PHASE_STATE_20261004.json',main),control.read('audit-fixes/source-optimization-20260930/execution-lock.json',main)]),l=p.value.lease;
  if(f.value.active||l?.owner!==req.expected_owner||l.expires_ts<=Date.now()||!l.scope.includes('FREE_ARCHIVE_BINDINGS_ROLLOUT')||p.value.latest_own_bounded_continuation_lease?.owner!==l.owner||p.value.active_working_state?.owned_lease!==l.owner)throw Error('INSPECTION_EXACT_OWN_LEASE_REQUIRED');
  const get=async suffix=>{if(++out.Cloudflare_GET>3||!['/versions?per_page=1','/content/v2'].includes(suffix))throw Error('INSPECTION_READ_ONLY_CLOUDFLARE_BOUND');const r=await fetch(root+suffix,{headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN},redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('INSPECTION_HTTP_'+r.status);return r;};
  const before=await(await get('/versions?per_page=1')).json();if(!before.success||!before.result.items?.[0]?.id)throw Error('INSPECTION_VERSION_REQUIRED');
  const r=await get('/content/v2');out.content_type=r.headers.get('content-type');out.parts=[];
  if(!out.content_type?.includes('multipart/'))throw Error('INSPECTION_MULTIPART_REQUIRED');
  for(const [field,value] of await r.formData()){
   const bytes=typeof value==='string'?Buffer.from(value):Buffer.from(await value.arrayBuffer());
   out.parts.push({field,value_kind:typeof value==='string'?'text':'file',filename:typeof value==='string'?null:value.name,type:typeof value==='string'?'text/plain':value.type,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
  }
  const after=await(await get('/versions?per_page=1')).json();if(!after.success||before.result.items[0].id!==after.result.items?.[0]?.id)throw Error('INSPECTION_LATEST_VERSION_MOVED');
  out.version_id=before.result.items[0].id;out.status='EXACT_CURRENT_WORKER_MULTIPART_NAMES_AND_HASHES_READ';
 }
}catch(e){out.status='PARTS_INSPECTION_NOT_CLOSED';out.reason=/^[A-Z0-9_]+$/.test(e.message)?e.message:'PARTS_INSPECTION_ERROR';process.exitCode=1;}
finally{out.completed_ts=Date.now();await fs.writeFile(dir+'/proof.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out));}
