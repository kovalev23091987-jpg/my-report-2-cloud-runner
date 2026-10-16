import fs from 'node:fs/promises';import {gzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
import {makeGithubControl} from '../runner/github-bounded-phase-lease.mjs';
import {active105OfflineReviewOwner} from '../runner/offline-review-authority.mjs';
import {createUnifiedHttpBudget} from '../current-generation/files/src/unified-budget.mjs';
import {BRIDGE_INSPECTION_POLICY as P,exactBridgeInspectionRelease,createReadOnlyBridgeControl,inspectInstalledBridgeModule} from '../runner/installed-bridge-module-inspection.mjs';
const repo='kovalev23091987-jpg/my-report-2-cloud-runner',dir='audit-output/installed-bridge-module',head=process.env.INSPECTION_HEAD,owner=process.env.BORROW_EXISTING_OWNER;
await fs.mkdir(dir,{recursive:true});let github_HTTP=0,proof={schema:'EXACT_INSTALLED_BRIDGE_READ_ONLY_MODULE_V1',status:'BRIDGE_MODULE_INSPECTION_NOT_STARTED',head,run:process.env.GITHUB_RUN_ID,sourceHTTP:0,D1:0,MAIN:0,Telegram:0,Worker_invocations:0,uploads:0,activations:0,settings_changes:0,tail_streams:0,secret_values_exported:false};
const budget=createUnifiedHttpBudget({whole_job:164,hot:96,background:56,statistics:12});
const reserve=kind=>{if(budget.summary().remaining<=P.manual_reserved)return{allowed:false};return budget.reserve({logical_request_id:'BRIDGE_INSPECT:'+kind+':'+(kind==='github'?github_HTTP:cf.used()),lane:kind==='github'?'hot':'background',attempts:1});};
let gh,cf;
const initialize=()=>{gh=makeGithubControl({repository:repo,token:process.env.GITHUB_TOKEN,fetch_impl:(url,opt)=>{if(opt.method!=='GET'||github_HTTP>=P.max_github_HTTP||reserve('github').allowed!==true)throw Error('BRIDGE_GITHUB_GET_ONLY_BOUND');github_HTTP++;return fetch(url,{...opt,redirect:'error'});}});
cf=createReadOnlyBridgeControl({token:process.env.CLOUDFLARE_API_TOKEN,admit:()=>reserve('cloudflare')});};
async function guard({min_headroom_ms=30000}={}){
 if((await gh.call('git/ref/heads/main')).object.sha!==head)throw Error('BRIDGE_INSPECTION_MAIN_MOVED');
 const [p,f]=await Promise.all([gh.read('checkpoints/CLOUD_PHASE_STATE_20261004.json',head),gh.read('audit-fixes/source-optimization-20260930/execution-lock.json',head)]);
 if(f.value.active||!active105OfflineReviewOwner(p.value)||p.value.lease.owner!==owner||!p.value.lease.scope.includes('read-only')||p.value.lease.expires_ts-Date.now()<min_headroom_ms)throw Error('BRIDGE_INSPECTION_OWN_SCOPED_LEASE_REQUIRED');
}
try{
 initialize();
 if(process.env.GITHUB_REPOSITORY!==repo||process.env.GITHUB_REF!=='refs/heads/main'||process.env.GITHUB_SHA!==head||process.env.READ_ONLY_BRIDGE_INSPECTION!=='true'||!/^\d+$/.test(process.env.CONNECTED_RUN||''))throw Error('EXACT_MAIN_READ_ONLY_BRIDGE_REQUEST_REQUIRED');
 await guard({min_headroom_ms:600000});
 const [status,resume,generation,run,workflow]=await Promise.all([gh.read('checkpoints/CURRENT_PROJECT_STATUS.json',head),gh.read('checkpoints/OWNER_REVIEW_RESUME_POINT_20261010.json',head),gh.read('REPORT2_CURRENT_GENERATION.json',head),gh.call('actions/runs/'+process.env.CONNECTED_RUN),gh.call('actions/workflows/liq-assembled-offline-20261012.yml')]);
 if(status.value.active_working_state?.owner_authorized_sequential_continuation!==true||resume.value.active_working_state?.owner_authorized_sequential_continuation!==true||generation.value.latest_only!==true||run.workflow_id!==workflow.id||run.head_sha!==head||run.status!=='completed'||run.conclusion!=='success')throw Error('EXACT_CURRENT_MAIN_BRIDGE_CLOUD_QUALIFICATION_REQUIRED');
 const expected=exactBridgeInspectionRelease(await fs.readFile(P.release_path,'utf8'));
 const result=await inspectInstalledBridgeModule({control:cf,expected,guard,secret_values:Object.entries(process.env).filter(([k])=>/TOKEN|SECRET|KEY/.test(k)).map(([,v])=>v)});
 const packed=gzipSync(result.source,{level:9});await fs.writeFile(dir+'/installed-hub-module.js.gz',packed);
 proof={...proof,...result.proof,head,run:process.env.GITHUB_RUN_ID,qualified_run:run.id,source_artifact:{path:'installed-hub-module.js.gz',raw_sha256:result.proof.module_sha256,raw_bytes:result.source.length,gzip_sha256:createHash('sha256').update(packed).digest('hex'),gzip_bytes:packed.length}};
}catch(e){proof={...proof,status:'BRIDGE_MODULE_INSPECTION_NOT_CLOSED',reason:/^[A-Z0-9_]+$/.test(e.message)?e.message:'BRIDGE_MODULE_INSPECTION_ERROR',error_fingerprint:createHash('sha256').update(String(e.message)).digest('hex')};process.exitCode=1;}
finally{await fs.writeFile(dir+'/proof.json',JSON.stringify({...proof,github_HTTP,cloudflare_HTTP:cf?.used()??0,whole_HTTP:budget.summary(),manual_HTTP_reserved:P.manual_reserved},null,2)+'\n');}
console.log(JSON.stringify({status:proof.status,reason:proof.reason,head,github_HTTP,cloudflare_HTTP:cf?.used()??0,sourceHTTP:0,D1:0,Worker_invocations:0,uploads:0,activations:0,settings_changes:0}));
