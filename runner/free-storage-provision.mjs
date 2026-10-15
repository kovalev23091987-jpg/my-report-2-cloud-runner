import {freeStorageExpansionPlan,FREE_STORAGE_POLICY} from './free-storage-capacity.mjs';
const BASE='https://api.cloudflare.com/client/v4/accounts/70ee0af85191ea470e74c7383fdec772/d1/database';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const identity=rows=>rows.map(r=>r.uuid+':'+r.name).sort();
export async function provisionFreeArchives({inventory,token,readers_qualified=false,before_mutate,before_request,fetch_impl=fetch,clock=Date.now}={}){
 const plan=freeStorageExpansionPlan({...inventory,now:clock()});
 if(!plan.allowed||readers_qualified!==true||!String(token||'').trim()||typeof before_mutate!=='function'||typeof before_request!=='function')throw Error('FREE_ARCHIVE_VERIFIED_CAPACITY_READERS_AND_OWNER_REQUIRED');
 const count=Math.min(4,plan.new_database_count),created=[];
 const out={schema:'FREE_ARCHIVE_EMPTY_PROVISION_V1',created,sourceHTTP:0,D1_SQL:0,MAIN:0,Telegram:0,
  existing_rows_modified:0,paid_activation:false,schemas_initialized:false,consumer_bindings_installed:false,
  used_for_reports:false,capacity_recovered:false,free_archive_operating_bytes:0};
 let GET=0,POST=0;
 const request=async(method,body)=>{
  if(method==='GET'?GET>=2:POST>=4)throw Error('FREE_ARCHIVE_CONTROL_HTTP_BOUND');
  if((await before_request({method,SQL:0}))?.allowed!==true)throw Error('FREE_ARCHIVE_CONTROL_ADMISSION_DENIED');
  method==='GET'?GET++:POST++;
  const r=await fetch_impl(BASE+(method==='GET'?'?per_page=10&page=1':''),{method,headers:{authorization:'Bearer '+String(token).trim(),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('FREE_ARCHIVE_CONTROL_HTTP_'+r.status);
  const j=await r.json();if(j.success!==true)throw Error('FREE_ARCHIVE_CONTROL_RESPONSE_INVALID');return j;
 };
 const listed=j=>{if(!Array.isArray(j.result)||j.result_info?.page!==1||j.result_info?.count!==j.result.length||j.result_info?.total_count!==j.result.length||j.result.length>10||j.result.some(d=>!UUID.test(d?.uuid||'')||typeof d.name!=='string'))throw Error('FREE_ARCHIVE_COMPLETE_ACCOUNT_LIST_REQUIRED');return j.result;};
 try{
  const before=listed(await request('GET'));
  if(JSON.stringify(identity(before))!==JSON.stringify(identity(inventory.databases)))throw Error('FREE_ARCHIVE_ACCOUNT_CHANGED_KEEP_EXISTING');
  const names=Array.from({length:count},(_,i)=>'report2-free-canonical-history-a'+(i+1));
  if(names.some(name=>before.some(d=>d.name===name)))throw Error('FREE_ARCHIVE_NAME_ALREADY_EXISTS_NO_RETRY');
  for(const [i,name] of names.entries()){
   // No blind retry: a lost creation reply may already have allocated a DB.
   await before_mutate();
   if(!freeStorageExpansionPlan({...inventory,now:clock()}).allowed)throw Error('FREE_ARCHIVE_CAPACITY_EVIDENCE_EXPIRED');
   out.last_creation_intent={name,slot:'A'+(i+1)};
   const {result:d}=await request('POST',{name});
   if(d?.name!==name||!UUID.test(d.uuid||'')||before.some(r=>r.uuid===d.uuid)||created.some(r=>r.uuid===d.uuid))throw Error('FREE_ARCHIVE_CREATION_IDENTITY_REQUIRED');
   created.push({slot:'A'+(i+1),name,uuid:d.uuid,operating_limit_bytes:FREE_STORAGE_POLICY.archive_soft_bytes,empty_creation_acknowledged:true});
   delete out.last_creation_intent;
  }
  const after=listed(await request('GET'));
  if(JSON.stringify(identity(after))!==JSON.stringify(identity([...inventory.databases,...created])))throw Error('FREE_ARCHIVE_EXACT_INDEPENDENT_READBACK_REQUIRED');
  out.status='EMPTY_FREE_ARCHIVE_RESOURCES_CREATED_AND_IDENTITIES_VERIFIED';out.independent_identity_readback=true;
  out.free_archive_operating_bytes=created.length*FREE_STORAGE_POLICY.archive_soft_bytes;
  out.remaining_database_slots=10-after.length;
 }catch(error){out.status='FREE_ARCHIVE_PROVISION_PARTIAL_OR_NOT_CLOSED';out.reason=/^[A-Z0-9_]+$/.test(error.message)?error.message:'FREE_ARCHIVE_TRANSPORT_OUTCOME_UNKNOWN';error.provision_receipt=out;throw error;}
 finally{out.cloudflare_metadata_GET=GET;out.cloudflare_creation_POST=POST;out.no_automatic_retry=true;}
 return out;
}
