import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
export const PHASE='checkpoints/CLOUD_PHASE_STATE_20261004.json';
export const FENCE='audit-fixes/source-optimization-20260930/execution-lock.json';
export async function acquire({api,expectedHead,owner,now=Date.now(),borrowOwner=null}){
 const head=(await api('GET','git/ref/heads/main')).object.sha;
 if(head!==expectedHead)return {allowed:false,reason:'MAIN_MOVED'};
 const read=async path=>JSON.parse(Buffer.from((await api('GET',`contents/${path}?ref=${head}`)).content,'base64').toString());
 const [phase,fence]=await Promise.all([read(PHASE),read(FENCE)]);
 if(fence.active)return {allowed:false,reason:'ACTIVE_EXECUTION_FENCE'};
 if(phase.lease?.owner&&Number(phase.lease.expires_ts)>now){
  if(borrowOwner&&phase.lease.owner===borrowOwner)return {allowed:true,borrowed:true,owner:borrowOwner,head};
  return {allowed:false,reason:'ACTIVE_FOREIGN_OWNER'};
 }
 const parent=await api('GET',`git/commits/${head}`);
 phase.lease={owner,acquired_ts:now,expires_ts:now+8*60_000};phase.updated_ts=now;
 const tree=await api('POST','git/trees',{base_tree:parent.tree.sha,tree:[{path:PHASE,type:'blob',mode:'100644',content:JSON.stringify(phase,null,2)+'\n'}]});
 const commit=await api('POST','git/commits',{message:'Acquire bounded retained-history maintenance lease',tree:tree.sha,parents:[head]});
 await api('PATCH','git/refs/heads/main',{sha:commit.sha,force:false});
 return {allowed:true,borrowed:false,owner,head:commit.sha,expires_ts:phase.lease.expires_ts};
}
export async function release({api,lease,now=Date.now()}){
 if(!lease?.allowed||lease.borrowed)return {released:false,reason:'NO_OWN_LEASE'};
 for(let attempt=0;attempt<3;attempt++){
  const head=(await api('GET','git/ref/heads/main')).object.sha;
  const phase=JSON.parse(Buffer.from((await api('GET',`contents/${PHASE}?ref=${head}`)).content,'base64').toString());
  if(phase.lease?.owner!==lease.owner)return {released:false,reason:'OWNER_CHANGED'};
  phase.last_released_lease={...phase.lease,released_ts:now,reason:'Bounded retained-history maintenance finished'};phase.lease={owner:null,acquired_ts:null,expires_ts:null};phase.updated_ts=now;
  const parent=await api('GET',`git/commits/${head}`),tree=await api('POST','git/trees',{base_tree:parent.tree.sha,tree:[{path:PHASE,type:'blob',mode:'100644',content:JSON.stringify(phase,null,2)+'\n'}]}),commit=await api('POST','git/commits',{message:'Release retained-history maintenance lease',tree:tree.sha,parents:[head]});
  try{await api('PATCH','git/refs/heads/main',{sha:commit.sha,force:false});return {released:true,head:commit.sha};}catch(e){if(attempt===2)throw e;}
 }
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href){
 const repo='kovalev23091987-jpg/my-report-2-cloud-runner';
 const api=async(method,path,body)=>{const r=await fetch(`https://api.github.com/repos/${repo}/${path}`,{method,headers:{authorization:`Bearer ${process.env.GITHUB_TOKEN}`,accept:'application/vnd.github+json','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});if(!r.ok)throw Error(`MAINTENANCE_LEASE_HTTP_${r.status}`);return r.json();};
 if(process.argv[2]==='release'){const lease=JSON.parse(fs.readFileSync('audit-output/maintenance-lease.json'));console.log(JSON.stringify(await release({api,lease})));}
 else{const lease=await acquire({api,expectedHead:process.env.EXPECTED_MAIN||process.env.GITHUB_SHA,owner:`HTX:HISTORY:${process.env.GITHUB_RUN_ID}`,borrowOwner:process.env.BORROW_EXISTING_OWNER||null});fs.mkdirSync('audit-output',{recursive:true});fs.writeFileSync('audit-output/maintenance-lease.json',JSON.stringify(lease,null,2));fs.appendFileSync(process.env.GITHUB_OUTPUT,`allowed=${lease.allowed}\n`);console.log(JSON.stringify(lease));}
}
