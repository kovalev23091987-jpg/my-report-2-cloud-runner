// Explicit Git object identity qualification after the saved native fulltext truncation.
// Full prepared local raw bytes are retained; native fulltext readback is NOT claimed.
import {createHash} from 'node:crypto';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export const ROOTS=Object.freeze(['checkpoints/CLOUD_PHASE_STATE_20261004.json','checkpoints/CURRENT_PROJECT_STATUS.json','checkpoints/OWNER_REVIEW_RESUME_POINT_20261010.json','checkpoints/FULL_OWNER_TASK_REGISTER_20261007.json']);
const AUX=['audit-fixes/source-optimization-20260930/execution-lock.json','REPORT2_CURRENT_GENERATION.json'];
const REPO='kovalev23091987-jpg/my-report-2-cloud-runner',BRANCH='refs/heads/work/github-four-mirror-oid-qualification-20261018';
const sha=(s,a='sha256')=>createHash(a).update(s).digest('hex'),oid=s=>sha(Buffer.concat([Buffer.from('blob '+Buffer.byteLength(s)+'\0'),Buffer.from(s)]),'sha1');
const fail=code=>{const e=new Error(code);e.code=code;throw e;},need=(v,c)=>{if(!v)fail(c);};
export const blobWitness=text=>({__typename:'Blob',text,byteSize:Buffer.byteLength(text),oid:oid(text),isTruncated:false,isBinary:false});
function blob(n,raw){need(n?.__typename==='Blob'&&n.isBinary===false&&typeof raw==='string','FULL_PREPARED_RAW_AND_NATIVE_BLOB_METADATA_REQUIRED');need(n.byteSize===Buffer.byteLength(raw)&&n.oid===oid(raw),'PREPARED_RAW_NATIVE_GIT_OBJECT_MISMATCH');return raw;}
export function createControl({token,fetch_impl=globalThis.fetch,journal=[],on_response=()=>{},max_response_bytes=12*1024*1024,max_request_bytes=8*1024*1024,max_calls=12}={}){
 need(typeof token==='string'&&token.length>0,'GITHUB_TOKEN_REQUIRED');
 return{journal,async call(kind,body){
  need(['graphql','ref','tree','commit'].includes(kind),'CONTROL_ROUTE_NOT_ALLOWED');need(journal.length<max_calls,'CONTROL_HTTP_CAP');
  const data=JSON.stringify(body),bytes=Buffer.byteLength(data);need(bytes<=max_request_bytes,'CONTROL_REQUEST_TOO_LARGE');
  const path=kind==='graphql'?'/graphql':'/repos/'+REPO+'/git/'+({ref:'refs',tree:'trees',commit:'commits'}[kind]);
  const row={attempt:journal.length+1,kind,method:'POST',path,request_bytes:bytes,request_sha256:sha(data),response_status:null,response_bytes:null,response_sha256:null,reply_known:false};journal.push(row);
  try{
   const res=await fetch_impl('https://api.github.com'+path,{method:'POST',headers:{accept:'application/vnd.github+json',authorization:'Bearer '+token,'content-type':'application/json','x-github-api-version':'2022-11-28'},body:data,redirect:'error',signal:AbortSignal.timeout(20000)});row.response_status=res.status;
   let size=0;const parts=[];for await(const chunk of res.body){size+=chunk.byteLength;need(size<=max_response_bytes,'CONTROL_RESPONSE_TOO_LARGE');parts.push(Buffer.from(chunk));}
   const raw=Buffer.concat(parts);row.response_bytes=raw.length;row.response_sha256=sha(raw);row.rate_limit_remaining=res.headers.get('x-ratelimit-remaining');on_response(row.attempt,raw);
   const out=JSON.parse(raw.toString('utf8'));row.reply_known=true;need(res.ok,'GITHUB_HTTP_'+res.status);return out;
  }catch(e){row.failure_code=e.code||'CONTROL_REPLY_UNKNOWN';throw e;}
 }};
}
const fragment='__typename ... on Blob{oid byteSize isBinary}';
function query(label,head,paths,branch){return 'query '+label+'{repository(owner:"kovalev23091987-jpg",name:"my-report-2-cloud-runner"){id main:ref(qualifiedName:"refs/heads/main"){target{oid}} probe:ref(qualifiedName:'+JSON.stringify(branch)+'){target{oid}} commit:object(oid:'+JSON.stringify(head)+'){__typename ... on Commit{oid tree{oid} parents(first:1){nodes{oid}}}} '+paths.map((p,i)=>'p'+i+':object(expression:'+JSON.stringify(head+':'+p)+'){'+fragment+'}').join(' ')+'}}';}
function repository(reply){need(!reply.errors?.length&&reply.data?.repository,'GITHUB_GRAPHQL_NOT_CLOSED');return reply.data.repository;}
export function validateSnapshot(repo,scope,now,raw_basis){
 need(repo.main?.target?.oid===scope.expected_main,'MAIN_MOVED');need(repo.probe===null,'ISOLATED_BRANCH_ALREADY_EXISTS');need(typeof repo.id==='string'&&repo.commit?.oid===scope.expected_main&&/^[a-f0-9]{40}$/.test(repo.commit?.tree?.oid||''),'PINNED_COMMIT_TREE_REQUIRED');
 const raws=[...ROOTS,...AUX].map((p,i)=>blob(repo['p'+i],raw_basis[i])),values=raws.map(s=>JSON.parse(s));need(raws.reduce((n,s)=>n+Buffer.byteLength(s),0)<=6*1024*1024,'SNAPSHOT_TOO_LARGE');
 const [p,s,r,g,f,gen]=values,l=p.lease;need(!f.active&&gen.latest_only===true&&p.current_task==='ALL_ACTIVE105_SOURCE_EFFICIENCY_IN_PROGRESS','FRESH_PROJECT_GUARDS_REQUIRED');
 need(l&&l.owner===scope.expected_owner&&l.expected_main===scope.expected_lease_base&&l.expires_ts===scope.expires_ts&&l.acquired_ts<=now&&l.expires_ts>now&&l.expires_ts>l.acquired_ts&&l.expires_ts-l.acquired_ts<=90*60000&&l.owner==='CODEX:ACTIVE105_SOURCE_RELIABILITY:'+l.acquired_ts&&l.scope.startsWith('GITHUB_FOUR_MIRROR.QUALIFICATION '),'OWN_QUALIFICATION_LEASE_REQUIRED');
 need(JSON.stringify(l)===JSON.stringify(p.latest_own_bounded_continuation_lease),'EXACT_LATEST_LEASE_REQUIRED');const active=p.active_working_state;
 need(active&&active.owned_lease===l.owner&&active.owned_lease_expires_ts===l.expires_ts&&active.lease_released===false,'ACTIVE_OWNER_REQUIRED');need([s,r,g].every(x=>JSON.stringify(x.active_working_state)===JSON.stringify(active)),'FOUR_ACTIVE_MIRRORS_DIFFER');return raws.slice(0,4);
}
export async function qualify(control,scope,{run_id,attempt='1',code_ref=BRANCH,now=Date.now,raw_basis}={}){
 need(scope?.repository===REPO&&scope.workflow_branch===BRANCH&&code_ref===BRANCH&&/^[a-f0-9]{40}$/.test(scope.expected_main||'')&&/^[1-9][0-9]*$/.test(String(run_id))&&String(attempt)==='1'&&scope.control_HTTP_cap===12&&scope.actual_jobs_authorized===1&&scope.production_main_writes===false&&scope.isolated_branch_only===true&&scope.production_writer_activated===false,'EXACT_ONE_OFF_SCOPE_REQUIRED');
 need(scope.read_contract==='FULL_PREPARED_RAW_BOUND_TO_NATIVE_GIT_BLOB_IDENTITY'&&Array.isArray(raw_basis)&&raw_basis.length===6&&raw_basis.every(x=>typeof x==='string'),'EXACT_PREPARED_RAW_BASIS_REQUIRED');
 const branch='refs/heads/qualification/report2-four-mirror-'+run_id+'-'+attempt;
 const snap=repository(await control.call('graphql',{query:query('Snapshot',scope.expected_main,[...ROOTS,...AUX],branch)}));
 const raws=validateSnapshot(snap,scope,now(),raw_basis),paths=ROOTS.map(p=>'checkpoints/github-four-mirror-qualification-20261018/copies/'+run_id+'/'+p.split('/').at(-1));
 const result={schema:'GITHUB_FOUR_MIRROR_GIT_OBJECT_QUALIFICATION_V1',status:'NOT_CLOSED',read_contract:scope.read_contract,native_fulltext_readback:false,raw_basis_files:[...ROOTS,...AUX].map((path,i)=>({path,bytes:Buffer.byteLength(raw_basis[i]),git_blob_oid:oid(raw_basis[i]),sha256:sha(raw_basis[i])})),expected_main:scope.expected_main,owner:scope.expected_owner,branch,repository_id:snap.id,source_files:ROOTS.map((p,i)=>({path:p,bytes:Buffer.byteLength(raws[i]),git_blob_oid:oid(raws[i]),sha256:sha(raws[i])})),production_main_writes:false,source_HTTP:0,native_SQL:0,MAIN:0,Telegram:0,production_writer_activated:false};
 control.partial=result;
 const live=()=>need(now()<scope.expires_ts,'OWN_LEASE_EXPIRED');live();const created=await control.call('ref',{ref:branch,sha:scope.expected_main});need(created.ref===branch&&created.object?.sha===scope.expected_main,'ISOLATED_REF_ACK_REQUIRED');
 live();const tree=await control.call('tree',{base_tree:snap.commit.tree.oid,tree:paths.map((path,i)=>({path,mode:'100644',type:'blob',content:raws[i]}))});need(/^[a-f0-9]{40}$/.test(tree.sha||''),'TREE_ACK_REQUIRED');result.tree=tree.sha;
 const commit=async(parent,message)=>{live();const c=await control.call('commit',{message,tree:tree.sha,parents:[parent]});need(/^[a-f0-9]{40}$/.test(c.sha||'')&&c.tree?.sha===tree.sha&&c.parents?.length===1&&c.parents[0].sha===parent,'EXACT_COMMIT_PARENT_TREE_ACK_REQUIRED');return c.sha;};
 const current=await commit(scope.expected_main,'qualification: exact four UTF8 mirror copies '+run_id);result.expected_published_commit=current;
 const update=async(before,after,label)=>{live();return control.call('graphql',{query:'mutation CAS($input:UpdateRefsInput!){updateRefs(input:$input){clientMutationId}}',variables:{input:{repositoryId:snap.id,clientMutationId:label,refUpdates:[{name:branch,beforeOid:before,afterOid:after,force:false}]}}});};
 const positive=await update(scope.expected_main,current,'positive-'+run_id);need(!positive.errors?.length&&positive.data?.updateRefs,'EXACT_CAS_ACK_REQUIRED');
 // A descendant makes the stale-CAS negative control independent of non-FF rejection.
 const descendant=await commit(current,'qualification: negative CAS descendant '+run_id);result.unpublished_descendant=descendant;
 const negative=await update(scope.expected_main,descendant,'stale-'+run_id);
 need(negative.errors?.length&&!negative.data?.updateRefs,'STALE_CAS_DID_NOT_REFUSE');const errors=negative.errors;
 result.stale_CAS_errors=errors.map(e=>({type:e.type??null,message:String(e.message||'').slice(0,2048)}));
 need(errors.some(e=>String(e.message||'').includes(scope.expected_main)&&String(e.message||'').includes(current)&&/expect|match|before|current|is at/i.test(e.message||'')),'STALE_CAS_REASON_UNQUALIFIED');
 result.stale_CAS_error={types:errors.map(e=>e.type??null),sha256:sha(JSON.stringify(errors)),expected_old_oid_bound:true,actual_oid_bound:true};
 live();const back=repository(await control.call('graphql',{query:query('Readback',current,paths,branch)}));need(back.id===snap.id&&back.main?.target?.oid===scope.expected_main&&back.probe?.target?.oid===current&&back.commit?.oid===current&&back.commit.tree?.oid===tree.sha&&back.commit.parents?.nodes?.length===1&&back.commit.parents.nodes[0].oid===scope.expected_main,'EXACT_IMMUTABLE_REF_COMMIT_READBACK_REQUIRED');
 paths.forEach((p,i)=>need(blob(back['p'+i],raws[i])===raws[i],'FOUR_FILE_BYTE_READBACK_REQUIRED'));live();
 Object.assign(result,{status:'QUALIFIED_ISOLATED_TOKEN_INLINE_BODY_CAS_GIT_OBJECT_BINDING_POINT',four_prepared_files_native_Git_object_identity_verified:true,production_five_HTTP_conditional_on_retained_complete_raw_basis:true,stale_CAS_ref_unchanged:true,control_HTTP:control.journal.length,production_operation_HTTP_known_head:5,without_known_head_HTTP:6,observed_REST_tree_request_bytes:control.journal.find(x=>x.kind==='tree').request_bytes,unknown_native_reply_observed:false,main_branch_rules_qualified:false,production_four_writer_correctness_qualified:false});return result;
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
 const out='audit-output/github-four-mirror-oid-qualification';mkdirSync(out,{recursive:true});const journal=[];let control,result;
 try{const scope=JSON.parse(readFileSync('checkpoints/github-four-mirror-oid-qualification-20261018/scope.json','utf8'));const raw_basis=[...ROOTS,...AUX].map((p,i)=>{const raw=readFileSync(p,'utf8');writeFileSync(out+'/full-prepared-basis-'+String(i+1).padStart(2,'0')+'.json',raw);return raw;});control=createControl({token:process.env.GITHUB_TOKEN,journal,on_response:(n,raw)=>writeFileSync(out+'/response-'+String(n).padStart(2,'0')+'.json',raw)});result=await qualify(control,scope,{run_id:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT,code_ref:process.env.GITHUB_REF,raw_basis});}
 catch(e){result={...(control?.partial||{}),schema:'GITHUB_FOUR_MIRROR_GIT_OBJECT_QUALIFICATION_V1',status:'NOT_CLOSED',native_fulltext_readback:false,failure_code:e.code||'QUALIFICATION_NOT_CLOSED',production_main_writes:false,production_writer_activated:false,source_HTTP:0,native_SQL:0,MAIN:0,Telegram:0};process.exitCode=1;}
 writeFileSync(out+'/qualification.json',JSON.stringify({...result,journal},null,2)+'\n');console.log(JSON.stringify({status:result.status,failure_code:result.failure_code??null,control_HTTP:journal.length,branch:result.branch??null,source_HTTP:0,native_SQL:0,MAIN:0,Telegram:0}));
}
