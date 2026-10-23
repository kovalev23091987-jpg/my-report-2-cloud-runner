import {createHash} from 'node:crypto';
import {makeGithubControl} from '../github-bounded-phase-lease.mjs';
import {MIRROR_PATHS,GUARD_PATHS} from '../github-four-mirror-cas.mjs';
export const NOW=1792394000000,HEAD='a'.repeat(40),DB='057a2847-2cc4-4e52-8534-1be1596d21d5';
const paths=[...MIRROR_PATHS,...GUARD_PATHS],hash=s=>createHash('sha1').update(s).digest('hex'),oid=s=>hash(Buffer.concat([Buffer.from('blob '+Buffer.byteLength(s)+'\0'),Buffer.from(s)]));
export function gitFixture({owned=false,large=false,stale_basis=false,phase_changes={},active_changes={},fault=null,on_call=()=>{}}={}){
 const lease={owner:'CODEX:ACTIVE105_SOURCE_RELIABILITY:'+(NOW-1000),acquired_ts:NOW-1000,expires_ts:NOW+1200000,expected_main:HEAD,scope:'RETAINED_HISTORY. controlled original lease'};
 const active={owner_weekly_HTX_catalog_sync_authorized:true,owner_authorized_sequential_continuation:true,owned_lease:owned?lease.owner:null,owned_lease_expires_ts:owned?lease.expires_ts:null,lease_released:!owned,canonical_retention_cursor:{schema:'PROTECTED_CANONICAL_CURSOR_V1',database_id:DB,cursor:710},paid_sliding_history:{minimum_hours:48},protected:'исходные часыé☃',...active_changes};
 const phase={current_task:'ALL_ACTIVE105_SOURCE_EFFICIENCY_IN_PROGRESS',owner_all_active_blocks_source_budget_and_fallback:'checkpoints/OWNER_ALL_ACTIVE_BLOCKS_SOURCE_BUDGET_AND_FALLBACK_20261013.json',lease:owned?lease:null,latest_own_bounded_continuation_lease:owned?lease:{owner:'HISTORICAL',released:true},last_released_lease:{owner:'HISTORICAL',released:true},latest_htx_compact_4h_daily:{old:'protected'},active_working_state:active,...phase_changes};
 const objects=[phase,...Array.from({length:3},()=>({active_working_state:active,unchanged:'historical+42'})),{active:false},{latest_only:true}];
 if(large)for(const i of [0,1,3])objects[i].large_original='x'.repeat(512100);
 const raws=objects.map(x=>'{\n "history" : { "padding" : "preserve whitespace" },\n'+JSON.stringify(x,null,2).slice(2));
 const initialTree='e'.repeat(40),commits=new Map([[HEAD,{raws,tree:initialTree,parents:[]}]]),trees=new Map([[initialTree,raws]]),blobs=new Map(raws.map(s=>[oid(s),s]));let current=HEAD,clock=NOW,cas_seen=false,mode=fault;const calls=[];
 const fixture={phase,active,lease,raws,calls,commits,get head(){return current;},set head(v){current=v;},get now(){return clock;},set now(v){clock=v;},set fault(v){mode=v;},at(h=current){return commits.get(h).raws;},publishSourceOnly(){const parent=current,tree=hash('source-tree'+parent),head=hash('source-commit'+parent);trees.set(tree,commits.get(parent).raws);commits.set(head,{raws:commits.get(parent).raws,tree,parents:[parent]});current=head;return{head,parent,changed_paths:['checkpoints/htx-compact-4h/ALGO-USDT.raw.json.gz'],acknowledged:true};}};
 function node(raw,text){const n={__typename:'Blob',oid:oid(raw),byteSize:Buffer.byteLength(raw),isBinary:false};if(text){n.text=Buffer.from(raw).subarray(0,512000).toString('utf8');n.isTruncated=Buffer.byteLength(raw)>512000;}return n;}
 function snapshot(query){
  const h=/commit:object\(oid:"([a-f0-9]{40})"\)/.exec(query)?.[1],c=commits.get(h);if(!c)throw Error('UNKNOWN_PIN');const r={id:'R_controlled',ref:{target:{oid:current}},commit:{__typename:'Commit',oid:h,tree:{oid:c.tree},parents:{nodes:c.parents.map(oid=>({oid}))}}};
  for(const m of query.matchAll(/p(\d+):object\(expression:"[a-f0-9]{40}:([^"]+)"\)/g)){const i=paths.indexOf(m[2]);if(i<0)throw Error('UNEXPECTED_PATH');r['p'+m[1]]=node(c.raws[i],query.includes(' text isTruncated'));}
  if(mode==='bad_native_oid')r.p1.oid='f'.repeat(40);return{data:{repository:r}};
 }
 const fetch_impl=async(url,options)=>{
  const u=new URL(url),body=options.body?JSON.parse(options.body):null;calls.push({path:u.pathname,method:options.method,body});on_call(fixture,calls.at(-1));let reply;
  if(u.pathname==='/graphql'){
   if(body.query.startsWith('mutation')){
    cas_seen=true;const upd=body.variables.input.refUpdates[0];if(upd.name!=='refs/heads/main'||upd.force!==false)throw Error('UNSAFE_REF_WRITE');
    if(mode==='race')current='f'.repeat(40);
    if(upd.beforeOid!==current||mode==='error_before_apply')reply={errors:[{message:'generic execution error'}],data:{updateRefs:null}};
    else{current=upd.afterOid;if(mode==='throw_after_apply')throw Error('unknown transport');reply=mode==='error_after_apply'?{errors:[{message:'generic execution error'}]}:{data:{updateRefs:{clientMutationId:body.variables.input.clientMutationId}}};}
   }else{if(cas_seen&&mode==='readback_unknown')throw Error('unknown readback');reply=snapshot(body.query);}
  }else if(u.pathname.endsWith('/git/trees')){
   if(body.tree.length!==4||body.tree.some((x,i)=>x.path!==MIRROR_PATHS[i]||x.type!=='blob'||x.mode!=='100644'))throw Error('NOT_ATOMIC_FOUR_ROOTS');
   const base=trees.get(body.base_tree);if(!base)throw Error('UNKNOWN_TREE');const changed=[...base];body.tree.forEach((e,i)=>{changed[i]=e.content;blobs.set(oid(e.content),e.content);});const t=hash(JSON.stringify(body));trees.set(t,changed);reply={sha:t};
  }else if(u.pathname.endsWith('/git/commits')){
   if(body.parents.length!==1||!commits.has(body.parents[0])||!trees.has(body.tree))throw Error('UNBOUND_COMMIT');const h=hash(JSON.stringify(body));commits.set(h,{raws:trees.get(body.tree),tree:body.tree,parents:body.parents});reply={sha:h,tree:{sha:body.tree},parents:body.parents.map(sha=>({sha}))};
  }else if(u.pathname.includes('/git/blobs/')){const sha=u.pathname.split('/').at(-1),raw=blobs.get(sha);if(raw===undefined)throw Error('UNKNOWN_BLOB');reply={sha,encoding:'base64',size:Buffer.byteLength(raw),content:Buffer.from(raw).toString('base64')};}
  else throw Error('UNEXPECTED_NETWORK_ROUTE');return new Response(JSON.stringify(reply),{status:200});
 };
 fixture.control=makeGithubControl({repository:'kovalev23091987-jpg/my-report-2-cloud-runner',token:'controlled-secret',fetch_impl,initial_raw_basis:stale_basis?paths.map(()=>'{"stale":true}'):raws,clock:()=>clock});return fixture;
}
