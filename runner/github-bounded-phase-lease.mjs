const patchRoot=function rootPatch(src, changes){
 const spans={};let i=src.indexOf("{")+1;
 while(i<src.length){while(/[\s,]/.test(src[i]))i++;if(src[i]==="}")break;const st=i++;let esc=false;for(;i<src.length;i++){if(!esc&&src[i]==='"'){i++;break;}if(!esc&&src[i]==="\\")esc=true;else esc=false;}const key=JSON.parse(src.slice(st,i));while(/\s/.test(src[i]))i++;if(src[i++]!==":")throw Error("colon");while(/\s/.test(src[i]))i++;const a=i;let dep=0,quote=false,e=false;for(;i<src.length;i++){let ch=src[i];if(quote){if(!e&&ch==='"')quote=false;if(!e&&ch==="\\")e=true;else e=false;continue;}if(ch==='"'){quote=true;continue;}if(ch==="{"||ch==="["){dep++;continue;}if(ch==="}"||ch==="]"){if(dep===0)break;dep--;continue;}if(ch===","&&dep===0)break;}let b=i;while(/\s/.test(src[b-1]))b--;spans[key]=[a,b];}
 let out=src;const entries=Object.entries(changes).map(([k,v])=>{if(!spans[k])throw Error(k);return [...spans[k],JSON.stringify(v,null,2).replace(/\n/g,"\n  ")];}).sort((a,b)=>b[0]-a[0]);for(const[a,b,c]of entries)out=out.slice(0,a)+c+out.slice(b);if(Object.keys(JSON.parse(src)).join("|")!==Object.keys(JSON.parse(out)).join("|"))throw Error("keys");return out;
};

const PHASE='checkpoints/CLOUD_PHASE_STATE_20261004.json',FENCE='audit-fixes/source-optimization-20260930/execution-lock.json';
export const patchPhaseRoot=patchRoot;
export function makeGithubControl({repository,token,fetch_impl=globalThis.fetch}={}){
 if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository||'')||!token)throw Error('GITHUB_CONTROL_ACCESS_REQUIRED');
 const call=async(path,method='GET',body)=>{const r=await fetch_impl('https://api.github.com/repos/'+repository+'/'+path,{method,headers:{accept:'application/vnd.github+json',authorization:'Bearer '+token,'x-github-api-version':'2022-11-28','content-type':'application/json'},signal:AbortSignal.timeout(15000),...(body?{body:JSON.stringify(body)}:{})});if(!r.ok)throw Error('GITHUB_CONTROL_HTTP_'+r.status);if(r.status===204)return null;return r.json();};
 const read=async(path,ref)=>{const j=await call('contents/'+path+'?ref='+ref),raw=Buffer.from(j.content,'base64').toString('utf8');return{sha:j.sha,raw,value:JSON.parse(raw)};};
 return{call,read};
}
export async function acquireWeeklyPhaseLease(control,{now=Date.now(),run_id,expected_main,scope}={}){
 const ref=await control.call('git/ref/heads/main'),head=ref.object.sha;
 if(expected_main&&head!==expected_main)return{allowed:false,status:'CHECKOUT_MAIN_MOVED',sourceHTTP:0};
 const [phase,fence,status,resume,generation]=await Promise.all([control.read(PHASE,head),control.read(FENCE,head),control.read('checkpoints/CURRENT_PROJECT_STATUS.json',head),control.read('checkpoints/OWNER_REVIEW_RESUME_POINT_20261010.json',head),control.read('REPORT2_CURRENT_GENERATION.json',head)]);
 if(status.value.active_working_state?.owner_weekly_HTX_catalog_sync_authorized!==true||resume.value.active_working_state?.owner_weekly_HTX_catalog_sync_authorized!==true||generation.value.latest_only!==true)return{allowed:false,status:'LATEST_WEEKLY_AUTHORITY_REQUIRED',sourceHTTP:0};
 if(phase.value.lease||fence.value.active)return{allowed:false,status:'OWNER_OR_FENCE_BUSY',head,sourceHTTP:0};
 const active105=phase.value.current_task==='ALL_ACTIVE105_SOURCE_EFFICIENCY_IN_PROGRESS'&&phase.value.owner_all_active_blocks_source_budget_and_fallback==='checkpoints/OWNER_ALL_ACTIVE_BLOCKS_SOURCE_BUDGET_AND_FALLBACK_20261013.json';
 if((phase.value.current_task!=='LIQ_MAXIMUM_USEFUL_COVERAGE_IN_PROGRESS'&&!active105)||!phase.value.active_working_state?.owner_weekly_HTX_catalog_sync_authorized)return{allowed:false,status:'WEEKLY_OWNER_AUTHORIZATION_REQUIRED',sourceHTTP:0};
 const owner=(active105?'CODEX:ACTIVE105_SOURCE_RELIABILITY:':'CODEX:ACTIVE_SOURCE_COVERAGE_AND_QUOTA:')+now,lease={owner,acquired_ts:now,expires_ts:now+20*60000,expected_main:head,scope:scope||'Owner authorized weekly official HTX universe/source reconciliation, unchanged source caps, pauses, score and report form; GitHub run '+run_id};
 const raw=patchRoot(phase.raw,{lease,latest_own_bounded_continuation_lease:lease,active_working_state:{...phase.value.active_working_state,owned_lease:owner,owned_lease_expires_ts:lease.expires_ts,lease_released:false}});
 const written=await control.call('contents/'+PHASE,'PUT',{message:'chore: bounded weekly HTX own lease '+run_id,sha:phase.sha,branch:'main',content:Buffer.from(raw).toString('base64')});
 const newHead=written.commit.sha,checked=await control.read(PHASE,newHead);if(checked.raw!==raw)throw Error('WEEKLY_LEASE_CAS_READBACK_REQUIRED');
 return{allowed:true,status:'OWN_WEEKLY_LEASE_CAS_VERIFIED',head:newHead,lease,run_id:run_id??null,sourceHTTP:0};
}
export async function releaseWeeklyPhaseLease(control,receipt,{now=Date.now()}={}){
 if(!receipt?.allowed)return{status:'NO_OWN_LEASE'};
 const head=(await control.call('git/ref/heads/main')).object.sha,phase=await control.read(PHASE,head);
 if(phase.value.lease?.owner!==receipt.lease.owner)return{status:'FOREIGN_OWNER_NOT_RELEASED'};
 const changes={lease:null,active_working_state:{...phase.value.active_working_state,owned_lease:null,owned_lease_expires_ts:null,lease_released:true,last_weekly_lease_release:{owner:receipt.lease.owner,run_id:receipt.run_id||null,released_ts:now}}};
 if(phase.value.latest_own_bounded_continuation_lease?.owner===receipt.lease.owner)changes.latest_own_bounded_continuation_lease={...phase.value.latest_own_bounded_continuation_lease,released:true,released_ts:now};
 const raw=patchRoot(phase.raw,changes);
 const written=await control.call('contents/'+PHASE,'PUT',{message:'chore: release own weekly HTX lease',sha:phase.sha,branch:'main',content:Buffer.from(raw).toString('base64')});
 const checked=await control.read(PHASE,written.commit.sha);if(checked.raw!==raw)throw Error('WEEKLY_OWN_RELEASE_READBACK_REQUIRED');return{status:'OWN_WEEKLY_LEASE_RELEASED',head:written.commit.sha};
}

