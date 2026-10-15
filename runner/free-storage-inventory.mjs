import {freeStorageExpansionPlan,FREE_STORAGE_POLICY} from './free-storage-capacity.mjs';
const ACCOUNT='70ee0af85191ea470e74c7383fdec772';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

// Read-only control-plane inventory. No SQL/query/export, subscription changes,
// database creation, provider calls, or credential text in the receipt.
export async function inventoryFreeStorage({token,fetch_impl=fetch,before_request,clock=Date.now,max_requests=11}={}){
 if(!String(token||'').trim()||typeof before_request!=='function')throw Error('FREE_STORAGE_METADATA_ACCESS_REQUIRED');
 if(!Number.isSafeInteger(max_requests)||max_requests<1||max_requests>11)throw Error('FREE_STORAGE_METADATA_HTTP_BOUND');
 let calls=0;
 const get=async suffix=>{
  if(calls>=max_requests)throw Error('FREE_STORAGE_METADATA_HTTP_BOUND');
  if((await before_request({method:'GET',suffix,SQL:0}))?.allowed!==true)throw Error('FREE_STORAGE_METADATA_ADMISSION_DENIED');
  calls++;
  const r=await fetch_impl('https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+suffix,{headers:{authorization:'Bearer '+String(token).trim()},redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('FREE_STORAGE_METADATA_HTTP_'+r.status);
  const j=await r.json();if(j.success!==true)throw Error('FREE_STORAGE_METADATA_RESPONSE_INVALID');return j;
 };
 const started=clock();
 const list=await get('/d1/database?per_page=10&page=1');
 const rows=list.result,info=list.result_info;
 if(!Array.isArray(rows)||rows.length>10||!info||info.page!==1||info.count!==rows.length||info.total_count!==rows.length)throw Error('FREE_STORAGE_COMPLETE_ACCOUNT_LIST_REQUIRED');
 if(rows.length+1>max_requests)throw Error('FREE_STORAGE_COMPLETE_DESCRIPTORS_HTTP_HEADROOM_REQUIRED');
 const seen=new Set(),databases=[];
 // Refuse an incomplete/foreign/malformed descriptor before using its bytes.
 for(const row of rows){
  if(!UUID.test(row?.uuid||'')||seen.has(row.uuid)||typeof row.name!=='string'||!row.name)throw Error('FREE_STORAGE_DATABASE_IDENTITY_REQUIRED');
  seen.add(row.uuid);
 }
 for(const row of rows){
  const {result:d}=await get('/d1/database/'+row.uuid);
  if(d?.uuid!==row.uuid||d.name!==row.name||!Number.isSafeInteger(d.file_size)||d.file_size<0)throw Error('FREE_STORAGE_EXACT_DATABASE_DESCRIPTOR_REQUIRED');
  databases.push({uuid:d.uuid,name:d.name,file_size:d.file_size,version:d.version??null});
 }
 const observed_ts=clock();
 if(observed_ts<started||observed_ts-started>FREE_STORAGE_POLICY.metadata_max_age_ms)throw Error('FREE_STORAGE_INVENTORY_DURATION_BOUND');
 return{schema:'FREE_STORAGE_ACCOUNT_INVENTORY_V1',status:'COMPLETE_METADATA_ONLY_ACCOUNT_INVENTORY',account_id:ACCOUNT,
  observed_ts,complete:true,databases,expansion:freeStorageExpansionPlan({databases,complete:true,observed_ts,now:observed_ts}),
  cloudflare_metadata_HTTP:calls,sourceHTTP:0,D1_SQL:0,MAIN:0,Telegram:0,databases_created:0,rows_modified:0};
}
