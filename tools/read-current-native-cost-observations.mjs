import fs from 'node:fs/promises';
import {makeGithubControl} from '../runner/github-bounded-phase-lease.mjs';
import {readNativeCostObservations} from '../runner/native-cost-observations.mjs';
import {captureCollectorNativeTail} from '../runner/bounded-native-tail.mjs';
const repository='kovalev23091987-jpg/my-report-2-cloud-runner',account='70ee0af85191ea470e74c7383fdec772',head=process.env.OBSERVER_HEAD,owner=process.env.BORROW_EXISTING_OWNER,dir='audit-output/hourly-native-observer';
let github_HTTP=0,cloudflare_HTTP=0;await fs.mkdir(dir,{recursive:true});
const tailMode=process.env.TAIL_NATIVE_COLLECTOR==='true';let ownTailId=null;
const save=p=>fs.writeFile(dir+'/native-observations.json',JSON.stringify({...p,head,github_HTTP,cloudflare_HTTP,max_control_HTTP:40,manual_HTTP_reserved:24,sourceHTTP:0,SQL:0,MAIN:0,Telegram:0,Worker_invocations:0,settings_changed:false,secret_values_exported:false},null,2)+'\n');
const admit=kind=>{if(kind==='github'){if(github_HTTP>=28)throw Error('NATIVE_OBSERVATION_HTTP_BOUND');github_HTTP++;}else{if(cloudflare_HTTP>=12)throw Error('NATIVE_OBSERVATION_HTTP_BOUND');cloudflare_HTTP++;}};
let control;
async function guard(){
 if((await control.call('git/ref/heads/main')).object.sha!==head)throw Error('NATIVE_OBSERVATION_MAIN_MOVED');
 const [p,f]=await Promise.all([control.read('checkpoints/CLOUD_PHASE_STATE_20261004.json',head),control.read('audit-fixes/source-optimization-20260930/execution-lock.json',head)]),l=p.value.lease;
 if(!owner||l?.owner!==owner||l.expires_ts-Date.now()<(tailMode?600000:60000)||f.value.active||p.value.latest_own_bounded_continuation_lease?.owner!==owner||p.value.active_working_state?.owned_lease!==owner)throw Error('NATIVE_OBSERVATION_OWN_GUARD_REQUIRED');
}
async function cf(path,{method='GET',body}={}){
 const read=method==='GET'&&/^\/workers\/scripts\/(my-report-2-free-history|my-report-2-hub)\/(deployments|script-settings)$/.test(path),query=method==='POST'&&path==='/workers/observability/telemetry/query'&&body?.dry===true&&body?.view==='events'&&body?.limit===64;
 const tailCreate=tailMode&&method==='POST'&&path==='/workers/scripts/my-report-2-hub/tails',tailDelete=tailMode&&method==='DELETE'&&ownTailId&&path==='/workers/scripts/my-report-2-hub/tails/'+ownTailId;
 if(!read&&!query&&!tailCreate&&!tailDelete)throw Error('READ_ONLY_NATIVE_OBSERVATION_ROUTE_REQUIRED');admit('cloudflare');
 const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+path,{method,headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error('NATIVE_OBSERVATION_HTTP_'+r.status);let bytes=0,text='';const decoder=new TextDecoder();for await(const chunk of r.body){bytes+=chunk.byteLength;if(bytes>1024*1024)throw Error('NATIVE_OBSERVATION_WIRE_BOUND');text+=decoder.decode(chunk,{stream:true});}text+=decoder.decode();const j=JSON.parse(text);if(j.success!==true||method!=='DELETE'&&!j.result)throw Error('NATIVE_OBSERVATION_ACK_REQUIRED');if(tailCreate&&typeof j.result?.id==='string')ownTailId=j.result.id;return j.result;
}
try{
 if(process.env.GITHUB_REPOSITORY!==repository||process.env.GITHUB_REF!=='refs/heads/main'||process.env.GITHUB_SHA!==head||!process.env.GITHUB_TOKEN||!process.env.CLOUDFLARE_API_TOKEN||process.env.INSPECT_NATIVE_OBSERVERS!=='true'||!/^\d+$/.test(process.env.CONNECTED_RUN||''))throw Error('EXACT_READ_ONLY_NATIVE_OBSERVATION_ACCESS_REQUIRED');
 control=makeGithubControl({repository,token:process.env.GITHUB_TOKEN,fetch_impl:(url,opt)=>{admit('github');return fetch(url,{...opt,redirect:'error'});}});
 await guard();const [s,r,g,run,workflow]=await Promise.all([control.read('checkpoints/CURRENT_PROJECT_STATUS.json',head),control.read('checkpoints/OWNER_REVIEW_RESUME_POINT_20261010.json',head),control.read('REPORT2_CURRENT_GENERATION.json',head),control.call('actions/runs/'+process.env.CONNECTED_RUN),control.call('actions/workflows/liq-assembled-offline-20261012.yml')]);
 if(!s.value.active_working_state?.owner_authorized_sequential_continuation||!r.value.active_working_state?.owner_authorized_sequential_continuation||g.value.latest_only!==true||run.head_sha!==head||run.workflow_id!==workflow.id||run.status!=='completed'||run.conclusion!=='success')throw Error('EXACT_MAIN_NATIVE_OBSERVATION_CHECK_REQUIRED');
 if(tailMode)await captureCollectorNativeTail({call:cf,guard,save,open:(url,protocol)=>{admit('cloudflare');return new WebSocket(url,protocol);}});
 else await save(await readNativeCostObservations({call:cf,guard}));
}catch(error){await save({schema:'BOUNDED_NATIVE_COST_OBSERVATIONS_V1',status:'NATIVE_OBSERVATION_NOT_QUALIFIED',reason:/^[A-Z0-9_]+$/.test(error.message)?error.message:'NATIVE_OBSERVATION_ERROR',whole_day_closed:false,daily_total:null});process.exitCode=1;}
console.log(JSON.stringify({github_HTTP,cloudflare_HTTP,sourceHTTP:0,SQL:0,MAIN:0,Telegram:0,Worker_invocations:0,settings_changed:false}));
