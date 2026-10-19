import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
export const patchRoot=function rootPatch(src, changes){
 const spans={};let i=src.indexOf("{")+1;
 while(i<src.length){while(/[\s,]/.test(src[i]))i++;if(src[i]==="}")break;const st=i++;let esc=false;for(;i<src.length;i++){if(!esc&&src[i]==='"'){i++;break;}if(!esc&&src[i]==="\\")esc=true;else esc=false;}const key=JSON.parse(src.slice(st,i));while(/\s/.test(src[i]))i++;if(src[i++]!==":")throw Error("colon");while(/\s/.test(src[i]))i++;const a=i;let dep=0,quote=false,e=false;for(;i<src.length;i++){let ch=src[i];if(quote){if(!e&&ch==='"')quote=false;if(!e&&ch==="\\")e=true;else e=false;continue;}if(ch==='"'){quote=true;continue;}if(ch==="{"||ch==="["){dep++;continue;}if(ch==="}"||ch==="]"){if(dep===0)break;dep--;continue;}if(ch===","&&dep===0)break;}let b=i;while(/\s/.test(src[b-1]))b--;spans[key]=[a,b];}
 let out=src;const entries=Object.entries(changes).map(([k,v])=>{if(!spans[k])throw Error(k);return [...spans[k],JSON.stringify(v,null,2).replace(/\n/g,"\n  ")];}).sort((a,b)=>b[0]-a[0]);for(const[a,b,c]of entries)out=out.slice(0,a)+c+out.slice(b);if(Object.keys(JSON.parse(src)).join("|")!==Object.keys(JSON.parse(out)).join("|"))throw Error("keys");return out;
};

export const MIRROR_PATHS=Object.freeze(['checkpoints/CLOUD_PHASE_STATE_20261004.json','checkpoints/CURRENT_PROJECT_STATUS.json','checkpoints/OWNER_REVIEW_RESUME_POINT_20261010.json','checkpoints/FULL_OWNER_TASK_REGISTER_20261007.json']);
export const GUARD_PATHS=Object.freeze(['audit-fixes/source-optimization-20260930/execution-lock.json','REPORT2_CURRENT_GENERATION.json']);
const PATHS=[...MIRROR_PATHS,...GUARD_PATHS],oid=s=>createHash('sha1').update(Buffer.concat([Buffer.from('blob '+Buffer.byteLength(s)+'\0'),Buffer.from(s)])).digest('hex');
const deny=code=>{throw Object.assign(new Error(code),{code});},need=(ok,code)=>{if(!ok)deny(code);},sha=s=>/^[a-f0-9]{40}$/.test(s||'');
export function fullRawBasis(root='.'){return PATHS.map(p=>readFileSync(root+'/'+p,'utf8'));}
const meta=(node,raw)=>node?.__typename==='Blob'&&node.isBinary===false&&typeof raw==='string'&&node.oid===oid(raw)&&node.byteSize===Buffer.byteLength(raw);
const parse=context=>context.raws.map(s=>JSON.parse(s));
export function assertMirrorGuards(context){
 const [phase,status,resume,register,fence,generation]=parse(context),active=phase.active_working_state;
 need(!fence.active&&generation.latest_only===true&&phase.current_task==='ALL_ACTIVE105_SOURCE_EFFICIENCY_IN_PROGRESS','FOUR_MIRROR_CURRENT_GUARDS_REQUIRED');
 need(active&&[status,resume,register].every(x=>JSON.stringify(x.active_working_state)===JSON.stringify(active)),'FOUR_ACTIVE_MIRRORS_DIFFER');return{phase,active};
}
export function assertMirrorOwner(context,owner,now=Date.now(),scope_prefix=null){
 const {phase,active}=assertMirrorGuards(context),l=phase.lease;
 need(l&&l.owner===owner&&Number.isSafeInteger(now)&&Number.isSafeInteger(l.acquired_ts)&&Number.isSafeInteger(l.expires_ts)&&l.acquired_ts<=now&&l.expires_ts>now&&l.expires_ts>l.acquired_ts&&l.expires_ts-l.acquired_ts<=90*60000&&sha(l.expected_main)&&typeof l.scope==='string'&&l.scope.length>0&&l.owner==='CODEX:ACTIVE105_SOURCE_RELIABILITY:'+l.acquired_ts&&JSON.stringify(l)===JSON.stringify(phase.latest_own_bounded_continuation_lease)&&active.owned_lease===l.owner&&active.owned_lease_expires_ts===l.expires_ts&&active.lease_released===false&&(!scope_prefix||l.scope.startsWith(scope_prefix)),'FOUR_MIRROR_OWN_LIVE_LEASE_REQUIRED');return{phase,active,lease:l};
}
function pinnedQuery(repository,head,{readback=false,text=false}={}){
 const [owner,name]=repository.split('/'),fragment='__typename ... on Blob{oid byteSize isBinary'+(text?' text isTruncated':'')+'}',paths=readback?MIRROR_PATHS:PATHS;
 return 'query PinnedFourMirrors{repository(owner:'+JSON.stringify(owner)+',name:'+JSON.stringify(name)+'){id ref(qualifiedName:"refs/heads/main"){target{oid}} commit:object(oid:'+JSON.stringify(head)+'){__typename ... on Commit{oid tree{oid} parents(first:1){nodes{oid}}}} '+paths.map((p,i)=>'p'+i+':object(expression:'+JSON.stringify(head+':'+p)+'){'+fragment+'}').join(' ')+'}}';
}
function repo(reply){need(!reply?.errors?.length&&reply?.data?.repository,'FOUR_MIRROR_GRAPHQL_SNAPSHOT_NOT_CLOSED');return reply.data.repository;}
// Complete local/prepared bytes are bound by native immutable Git identity.
// A truncated GraphQL text is never used as a complete file.
export async function readMirrorContext(control,{expected_main,basis,maximum_blob_reads=0,now=Date.now()}={}){
 need(sha(expected_main)&&Number.isInteger(maximum_blob_reads)&&maximum_blob_reads>=0&&maximum_blob_reads<=3,'FOUR_MIRROR_EXACT_HEAD_AND_BOOTSTRAP_BOUND_REQUIRED');
 const prior=basis??control.mirror_context;
 if(prior)need(prior.head===expected_main,'FOUR_MIRROR_UPDATED_EXPECTED_HEAD_REQUIRED');
 let raws=prior?.raws??control.initial_raw_basis;
 if(!raws){try{raws=fullRawBasis();}catch{raws=[];}}
 const snapshot=repo(await control.graphql(pinnedQuery(control.repository,expected_main,{text:!prior&&maximum_blob_reads>0})));
 need(snapshot.ref?.target?.oid===expected_main,'FOUR_MIRROR_MAIN_MOVED');need(snapshot.id&&snapshot.commit?.oid===expected_main&&sha(snapshot.commit?.tree?.oid),'FOUR_MIRROR_PINNED_COMMIT_REQUIRED');
 need(PATHS.every((p,i)=>snapshot['p'+i]?.__typename==='Blob'&&snapshot['p'+i].isBinary===false&&sha(snapshot['p'+i].oid)&&Number.isSafeInteger(snapshot['p'+i].byteSize)&&snapshot['p'+i].byteSize>=0)&&PATHS.reduce((n,p,i)=>n+snapshot['p'+i].byteSize,0)<=6*1024*1024,'FOUR_MIRROR_BOUNDED_NATIVE_BLOB_METADATA_REQUIRED');
 raws=PATHS.map((p,i)=>meta(snapshot['p'+i],raws?.[i])?raws[i]:null);
 if(raws.some(x=>x===null)){
  need(!prior,'FOUR_MIRROR_RETAINED_CONTEXT_CHANGED');
  for(let i=0;i<PATHS.length;i++){const n=snapshot['p'+i];if(raws[i]===null&&n?.isTruncated===false&&meta(n,n.text))raws[i]=n.text;}
  const missing=raws.map((v,i)=>v===null?i:null).filter(i=>i!==null);need(missing.length<=maximum_blob_reads,'FOUR_MIRROR_FULL_RAW_BOOTSTRAP_HEADROOM_REQUIRED');
  // All bounds are checked before the first additional immutable blob GET.
  need(missing.every(i=>snapshot['p'+i]?.__typename==='Blob'&&snapshot['p'+i].isBinary===false&&sha(snapshot['p'+i].oid)&&snapshot['p'+i].byteSize<=6*1024*1024),'FOUR_MIRROR_NATIVE_BLOB_METADATA_REQUIRED');
  for(const i of missing){const n=snapshot['p'+i],b=await control.call('git/blobs/'+n.oid);need(b?.encoding==='base64'&&b.sha===n.oid,'FOUR_MIRROR_IMMUTABLE_BLOB_REQUIRED');const raw=Buffer.from(b.content,'base64').toString('utf8');need(meta(n,raw)&&b.size===Buffer.byteLength(raw),'FOUR_MIRROR_FULL_BLOB_BYTES_REQUIRED');raws[i]=raw;}
 }
 need(raws.every((s,i)=>meta(snapshot['p'+i],s))&&raws.reduce((n,s)=>n+Buffer.byteLength(s),0)<=6*1024*1024,'FOUR_MIRROR_COMPLETE_BOUNDED_BASIS_REQUIRED');
 const context={head:expected_main,repository_id:snapshot.id,tree:snapshot.commit.tree.oid,raws};assertMirrorGuards(context);control.mirror_context=context;return context;
}
// Called only after one pinned read. Together: snapshot/tree/commit/CAS/readback=5.
export async function publishMirrorContext(control,context,{active,phase_changes={},message,now=Date.now(),check_live=null}={}){
 need(context===control.mirror_context&&sha(context.head)&&message,'FOUR_MIRROR_PINNED_CONTEXT_REQUIRED');const {phase}=assertMirrorGuards(context);
 need(!Object.hasOwn(phase_changes,'active_working_state'),'FOUR_MIRROR_SINGLE_ACTIVE_VALUE_REQUIRED');
 const raws=context.raws.map((s,i)=>i===0?patchRoot(s,{...phase_changes,active_working_state:active}):i<4?patchRoot(s,{active_working_state:active}):s);
 need(raws.reduce((n,s)=>n+Buffer.byteLength(s),0)<=6*1024*1024,'FOUR_MIRROR_PREPARED_BODY_TOO_LARGE');const live=()=>{if(check_live)check_live(control.clock?.()??Date.now());};live();
 control.last_mirror_attempt={expected_head:context.head,prepared_raws:raws.slice(0,4),prepared_blobs:MIRROR_PATHS.map((path,i)=>({path,bytes:Buffer.byteLength(raws[i]),git_blob_oid:oid(raws[i])})),tree:null,candidate_commit:null};
 const tree=await control.call('git/trees','POST',{base_tree:context.tree,tree:MIRROR_PATHS.map((path,i)=>({path,mode:'100644',type:'blob',content:raws[i]}))});need(sha(tree?.sha),'FOUR_MIRROR_TREE_ACK_REQUIRED');control.last_mirror_attempt.tree=tree.sha;live();
 const commit=await control.call('git/commits','POST',{message,tree:tree.sha,parents:[context.head]});need(sha(commit?.sha)&&commit.tree?.sha===tree.sha&&commit.parents?.length===1&&commit.parents[0].sha===context.head,'FOUR_MIRROR_COMMIT_ACK_REQUIRED');control.last_mirror_attempt.candidate_commit=commit.sha;live();
 let cas_known=false;
 try{const a=await control.graphql('mutation ExactFourMirrorCAS($input:UpdateRefsInput!){updateRefs(input:$input){clientMutationId}}',{input:{repositoryId:context.repository_id,clientMutationId:commit.sha,refUpdates:[{name:'refs/heads/main',beforeOid:context.head,afterOid:commit.sha,force:false}]}});cas_known=!a.errors?.length&&a.data?.updateRefs?.clientMutationId===commit.sha;}catch{}
 // Generic errors and unknown ACKs get this already-reserved readback, never a retry.
 const back=repo(await control.graphql(pinnedQuery(control.repository,commit.sha,{readback:true})));
 need(back.id===context.repository_id&&back.ref?.target?.oid===commit.sha&&back.commit?.oid===commit.sha&&back.commit.tree?.oid===tree.sha&&back.commit.parents?.nodes?.length===1&&back.commit.parents.nodes[0].oid===context.head,'FOUR_MIRROR_CAS_NOT_PROVEN_NO_RETRY');
 need(MIRROR_PATHS.every((p,i)=>meta(back['p'+i],raws[i])),'FOUR_MIRROR_NATIVE_OBJECT_READBACK_REQUIRED');
 const result={head:commit.sha,repository_id:context.repository_id,tree:tree.sha,raws};control.mirror_context=result;
 return{context:result,head:result.head,positive_CAS_ACK_known:cas_known,ACK_resolved_by_exact_known_commit_readback:!cas_known,native_fulltext_readback:false,four_prepared_raw_Git_object_bindings_verified:true};
}
export async function updateMirrorActive(control,{expected_main,owner,update,scope_prefix=null,message,now=control.clock?.()??Date.now()}={}){
 const context=await readMirrorContext(control,{expected_main,maximum_blob_reads:0,now});const checked=assertMirrorOwner(context,owner,now,scope_prefix),active=update(checked.active,checked.phase);
 const result=await publishMirrorContext(control,context,{active,message,now,check_live:t=>assertMirrorOwner(context,owner,t,scope_prefix)});return{...result,SQL:0,sourceHTTP:0};
}
export async function persistSlidingMirrorCursor(control,{expected_main,owner,canonical,evidence,run_id,now=control.clock?.()??Date.now()}={}){
 need([canonical,evidence].every(x=>Number.isSafeInteger(x)&&x>=0)&&/^\d+$/.test(String(run_id))&&Number.isSafeInteger(now),'SLIDING_EXACT_CURSOR_REQUIRED');
 const state={canonical,evidence,run:run_id,updated_ts:now};
 return updateMirrorActive(control,{expected_main,owner,scope_prefix:'RETAINED_HISTORY.',now,message:'Record bounded four-mirror sliding history cursor '+run_id,update:active=>({...active,sliding_history_cursor:state})});
}
export function adoptCompactSourceCommit(context,{head,parent,changed_paths,acknowledged}={}){
 need(acknowledged===true&&sha(head)&&parent===context.head&&Array.isArray(changed_paths)&&changed_paths.length>0&&changed_paths.every(p=>p.startsWith('checkpoints/htx-compact-4h/')),'COMPACT_KNOWN_ACKED_SOURCE_ONLY_COMMIT_REQUIRED');
 return{...context,head};
}

