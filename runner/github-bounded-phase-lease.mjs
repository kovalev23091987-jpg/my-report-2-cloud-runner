import {createHash} from 'node:crypto';
import {patchRoot,readMirrorContext,assertMirrorGuards,assertMirrorOwner,publishMirrorContext} from './github-four-mirror-cas.mjs';
export {readMirrorContext,updateMirrorActive} from './github-four-mirror-cas.mjs';
export const patchPhaseRoot=patchRoot;
const sha=s=>createHash('sha256').update(s).digest('hex');
export function makeGithubControl({repository,token,fetch_impl=globalThis.fetch,initial_raw_basis,clock=Date.now,on_response=()=>{},maximum_calls=Infinity}={}){
 if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository||'')||!token)throw Error('GITHUB_CONTROL_ACCESS_REQUIRED');
 const metrics=[];
 const request=async(url,method='GET',body)=>{
  if(metrics.length>=maximum_calls)throw Error('GITHUB_CONTROL_HTTP_CAP');
  const data=body===undefined?undefined:JSON.stringify(body);if(data&&Buffer.byteLength(data)>8*1024*1024)throw Error('GITHUB_CONTROL_REQUEST_TOO_LARGE');
  const row={attempt:metrics.length+1,method,request_bytes:data?Buffer.byteLength(data):0,request_sha256:data?sha(data):null,reply_known:false};metrics.push(row);
  try{
   const r=await fetch_impl(url,{method,headers:{accept:'application/vnd.github+json',authorization:'Bearer '+token,'x-github-api-version':'2022-11-28','content-type':'application/json'},redirect:'error',signal:AbortSignal.timeout(15000),...(data!==undefined?{body:data}:{})});row.status=r.status;
   if(r.status===204){row.reply_known=true;return null;}
   let n=0;const chunks=[];for await(const b of r.body){n+=b.byteLength;if(n>12*1024*1024)throw Error('GITHUB_CONTROL_RESPONSE_TOO_LARGE');chunks.push(Buffer.from(b));}
   const raw=Buffer.concat(chunks);row.response_bytes=raw.length;row.response_sha256=sha(raw);const j=JSON.parse(raw.toString('utf8'));row.reply_known=true;on_response(row,raw);if(!r.ok)throw Error('GITHUB_CONTROL_HTTP_'+r.status);return j;
  }catch(e){const code=/^GITHUB_CONTROL_[A-Z0-9_]+$/.test(e?.message||'')?e.message:'GITHUB_CONTROL_REPLY_UNKNOWN';row.failure_code=code;throw Error(code);}
 };
 const call=(path,method='GET',body)=>request('https://api.github.com/repos/'+repository+'/'+path,method,body);
 const read=async(path,ref)=>{const j=await call('contents/'+path+'?ref='+ref);if(j?.encoding!=='base64'||typeof j.content!=='string')throw Error('GITHUB_CONTENT_BASE64_REQUIRED');const raw=Buffer.from(j.content,'base64').toString('utf8');let value;try{value=JSON.parse(raw);}catch{throw Error('GITHUB_CONTENT_JSON_REQUIRED');}return{sha:j.sha,raw,value};};
 const control={repository,call,read,graphql:(query,variables)=>request('https://api.github.com/graphql','POST',{query,...(variables?{variables}:{})}),clock};
 Object.defineProperties(control,{mirror_context:{value:null,writable:true},last_mirror_attempt:{value:null,writable:true},initial_raw_basis:{value:initial_raw_basis},metrics:{value:metrics}});return control;
}
export async function acquireWeeklyPhaseLease(control,{now=control.clock?.()??Date.now(),run_id,expected_main,scope,lease_ms=20*60000,maximum_blob_reads=3}={}){
 if(!/^[a-f0-9]{40}$/.test(expected_main||''))return{allowed:false,status:'EXACT_KNOWN_CHECKOUT_REQUIRED',sourceHTTP:0};
 let context;try{context=await readMirrorContext(control,{expected_main,maximum_blob_reads,now});}catch(e){return{allowed:false,status:e.code==='FOUR_MIRROR_MAIN_MOVED'?'CHECKOUT_MAIN_MOVED':e.code||'GITHUB_SNAPSHOT_NOT_CLOSED',sourceHTTP:0};}
 const {phase,active}=assertMirrorGuards(context),values=context.raws.map(s=>JSON.parse(s));
 if(phase.lease?.owner||active.owned_lease)return{allowed:false,status:'OWNER_OR_FENCE_BUSY',head:context.head,sourceHTTP:0};
 const freeLease=phase.lease==null||(phase.lease.owner===null&&phase.lease.acquired_ts===null&&phase.lease.expires_ts===null),latest=phase.latest_own_bounded_continuation_lease;
 if(!freeLease||active.owned_lease!==null||active.owned_lease_expires_ts!==null||active.lease_released!==true||(latest!=null&&latest.released!==true))return{allowed:false,status:'UNRECONCILED_FREE_AUTHORITY',head:context.head,sourceHTTP:0};
 if(phase.owner_all_active_blocks_source_budget_and_fallback!=='checkpoints/OWNER_ALL_ACTIVE_BLOCKS_SOURCE_BUDGET_AND_FALLBACK_20261013.json'||[active,values[1].active_working_state,values[2].active_working_state].some(a=>a.owner_weekly_HTX_catalog_sync_authorized!==true))return{allowed:false,status:'LATEST_WEEKLY_AUTHORITY_REQUIRED',sourceHTTP:0};
 if(!Number.isSafeInteger(now)||!Number.isSafeInteger(lease_ms)||lease_ms<1||lease_ms>90*60000)throw Error('BOUNDED_FOUR_MIRROR_LEASE_REQUIRED');
 const lease={owner:'CODEX:ACTIVE105_SOURCE_RELIABILITY:'+now,acquired_ts:now,expires_ts:now+lease_ms,expected_main:context.head,scope:scope||'Owner authorized weekly official HTX universe/source reconciliation, unchanged caps, pauses, score and form; GitHub run '+run_id};
 const result=await publishMirrorContext(control,context,{active:{...active,owned_lease:lease.owner,owned_lease_expires_ts:lease.expires_ts,lease_released:false},phase_changes:{lease,latest_own_bounded_continuation_lease:lease},message:'chore: acquire exact four-mirror own lease '+run_id,check_live:t=>{if(t<lease.acquired_ts||t>=lease.expires_ts)throw Error('FOUR_MIRROR_OWN_LEASE_EXPIRED');}});
 return{allowed:true,status:'OWN_WEEKLY_LEASE_CAS_VERIFIED',head:result.head,lease,run_id:run_id??null,sourceHTTP:0,native_fulltext_readback:false,four_prepared_raw_Git_object_bindings_verified:true};
}
export async function borrowFourMirrorLease(control,{expected_main,owner,now=control.clock?.()??Date.now(),scope_prefix=null,required_authority=null}={}){
 const context=await readMirrorContext(control,{expected_main,maximum_blob_reads:0,now}),checked=assertMirrorOwner(context,owner,now,scope_prefix);
 if(required_authority&&checked.active[required_authority]!==true)throw Error('EXACT_BORROWED_OWNER_AUTHORITY_REQUIRED');
 return{borrowed:true,allowed:true,head:context.head,lease:checked.lease};
}
export async function releaseWeeklyPhaseLease(control,receipt,{now=control.clock?.()??Date.now(),phase_changes={},release_key='last_weekly_lease_release'}={}){
 if(!receipt?.allowed)return{status:'NO_OWN_LEASE'};
 if(!['last_weekly_lease_release','last_htx_compact_4h_lease_release'].includes(release_key)||Object.keys(phase_changes).some(k=>k!=='latest_htx_compact_4h_daily'))throw Error('EXACT_RELEASE_TECHNICAL_FIELDS_REQUIRED');
 const context=await readMirrorContext(control,{expected_main:receipt.head,maximum_blob_reads:0,now});
 const {phase}=assertMirrorGuards(context);if(phase.lease?.owner!==receipt.lease.owner)return{status:'FOREIGN_OWNER_NOT_RELEASED'};
 const {active,lease}=assertMirrorOwner(context,receipt.lease.owner,now),released={...lease,released:true,released_ts:now};
 const result=await publishMirrorContext(control,context,{active:{...active,owned_lease:null,owned_lease_expires_ts:null,lease_released:true,[release_key]:{owner:lease.owner,run_id:receipt.run_id||null,released_ts:now}},phase_changes:{...phase_changes,lease:null,latest_own_bounded_continuation_lease:released,...(Object.hasOwn(phase,'last_released_lease')?{last_released_lease:released}:{})},message:'chore: release exact four-mirror own lease',check_live:t=>assertMirrorOwner(context,lease.owner,t)});
 receipt.head=result.head;return{status:'OWN_WEEKLY_LEASE_RELEASED',head:result.head,native_fulltext_readback:false,four_prepared_raw_Git_object_bindings_verified:true};
}
