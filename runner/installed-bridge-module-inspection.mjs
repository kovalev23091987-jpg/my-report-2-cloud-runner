import {createHash} from 'node:crypto';
import {createVersionBoundWorkerReader} from './cloudflare-version-bound-readback.mjs';
export const BRIDGE_INSPECTION_POLICY=Object.freeze({account:'70ee0af85191ea470e74c7383fdec772',script:'my-report-2-hub',max_cloudflare_HTTP:20,max_github_HTTP:40,whole_HTTP:164,manual_reserved:24,max_module_bytes:4_000_000,max_content_wire_bytes:6_500_000,max_metadata_bytes:262_144,release_path:'checkpoints/free-storage-20261016/counter-release-38901929896.json',release_raw_sha256:'c65eedc0ead4d7ad64bcdd1958a44745a0788def3d438c5ef96cf316631b91c5',release_run:38901929896});
export const SQL_BRIDGE_SCRIPT='my-report-2-d1-bridge';
const P=BRIDGE_INSPECTION_POLICY,hash=v=>createHash('sha256').update(v).digest('hex'),uuid=v=>/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v||'');
export function exactBridgeInspectionRelease(raw){
 if(typeof raw!=='string'||hash(raw)!==P.release_raw_sha256)throw Error('EXACT_BRIDGE_RELEASE_BYTES_REQUIRED');
 const j=JSON.parse(raw),w=j.workers?.find(w=>w.name===P.script);
 if(j.cloud_run!==String(P.release_run)&&j.cloud_run!==P.release_run||j.status!=='BOTH_FREE_ARCHIVE_READERS_EXACT_MODULES_BINDINGS_AND_CRONS_VERIFIED'||!w?.after||!uuid(w.after.version_id)||!w.after.module_sha256||!j.hub_prefix_sha256)throw Error('EXACT_BRIDGE_RELEASE_REQUIRED');
 return{...w.after,hub_prefix_sha256:j.hub_prefix_sha256,release_raw_sha256:P.release_raw_sha256,release_run:P.release_run};
}
export async function boundedControlBody(response,max){
 const declared=response.headers.get('content-length');if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>max)){await response.body?.cancel();throw Error('BRIDGE_CONTROL_WIRE_BOUND');}
 const reader=response.body?.getReader();if(!reader)throw Error('BRIDGE_CONTROL_BODY_REQUIRED');let total=0;const parts=[];
 try{for(;;){const r=await reader.read();if(r.done)break;total+=r.value.byteLength;if(total>max)throw Error('BRIDGE_CONTROL_WIRE_BOUND');parts.push(Buffer.from(r.value));}}finally{await reader.cancel().catch(()=>{});}
 return Buffer.concat(parts,total);
}
export function createReadOnlyBridgeControl({token,fetch_impl=globalThis.fetch,admit,script=P.script}={}){
 if(![P.script,SQL_BRIDGE_SCRIPT].includes(script)||typeof token!=='string'||!token.trim()||typeof fetch_impl!=='function'||typeof admit!=='function')throw Error('BRIDGE_CONTROL_ACCESS_REQUIRED');let calls=0;
 const call=async(name,suffix,options={})=>{
  if(name!==script||!/^\/(?:deployments|settings|schedules|subdomain|versions\?per_page=1|versions\/[a-f0-9-]{36}|content\/v2)$/.test(suffix)||options.method!==undefined&&options.method!=='GET'||Object.hasOwn(options,'body'))throw Error('BRIDGE_INSPECTION_GET_ONLY');
  if(calls>=P.max_cloudflare_HTTP||admit()?.allowed!==true)throw Error('BRIDGE_INSPECTION_HTTP_BOUND');calls++;
  const response=await fetch_impl(`https://api.cloudflare.com/client/v4/accounts/${P.account}/workers${suffix==='/subdomain'?'/subdomain':'/scripts/'+script+suffix}`,{method:'GET',headers:{authorization:'Bearer '+token.trim()},redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!response.ok){await response.body?.cancel();throw Error('BRIDGE_CONTROL_HTTP_'+response.status);}
  const raw=await boundedControlBody(response,options.raw===true?P.max_content_wire_bytes:P.max_metadata_bytes);
  if(options.raw===true)return new Response(raw,{headers:{'content-type':response.headers.get('content-type')||'application/octet-stream'}});
  let j;try{j=JSON.parse(raw.toString('utf8'));}catch{throw Error('BRIDGE_CONTROL_INVALID_JSON');}
  if(j?.success!==true||!j.result)throw Error('BRIDGE_CONTROL_NATIVE_ACK_REQUIRED');return j.result;
 };
 return{call,used:()=>calls};
}
const same=(a,b)=>['version_id','deployment_id','module_sha256','settings_sha256','crons_sha256'].every(k=>a[k]===b[k]);
export async function inspectInstalledBridgeModule({control,expected,guard,clock=Date.now,secret_values=[]}={}){
 if(typeof control?.call!=='function'||typeof guard!=='function'||!uuid(expected?.version_id)||!uuid(expected?.deployment_id)||!Array.isArray(expected.crons)||typeof clock!=='function')throw Error('EXACT_READ_ONLY_BRIDGE_INSPECTION_REQUIRED');
 const started_ts=clock();await guard({min_headroom_ms:600000});
 const reader=createVersionBoundWorkerReader({call:control.call}),worker={name:P.script,crons:expected.crons},before=await reader.read(worker);
 if(!same(before,expected))throw Error('INSTALLED_BRIDGE_DIFFERS_FROM_EXACT_RELEASE');
 const source=reader.module(P.script,before.version_id)?.bytes;
 if(!Buffer.isBuffer(source)||!source.length||source.length>P.max_module_bytes||Buffer.from(source.toString('utf8')).compare(source)!==0)throw Error('EXACT_BRIDGE_MODULE_UTF8_BOUND');
 const marker=Buffer.from('var __REPORT2_PUBLIC_COLLECTOR_VERSION = '),at=source.indexOf(marker);
 if(at<=0||source.indexOf(marker,at+marker.length)!==-1||hash(source.subarray(0,at))!==expected.hub_prefix_sha256)throw Error('EXACT_INSTALLED_BRIDGE_PREFIX_REQUIRED');
 if(secret_values.some(v=>typeof v==='string'&&v.length>=12&&source.includes(Buffer.from(v))))throw Error('BRIDGE_MODULE_SECRET_EXPORT_DENIED');
 await guard({min_headroom_ms:30000});const after=await reader.read(worker),latest=await control.call(P.script,'/versions?per_page=1');
 if(!same(before,after)||latest.items?.[0]?.id!==after.version_id)throw Error('BRIDGE_MOVED_DURING_READ_ONLY_INSPECTION');
 await guard({min_headroom_ms:30000});
 const completed_ts=clock();if(!Number.isSafeInteger(started_ts)||!Number.isSafeInteger(completed_ts)||started_ts>completed_ts)throw Error('BRIDGE_INSPECTION_CLOCK_NOT_CLOSED');
 return{source,proof:{schema:'EXACT_INSTALLED_BRIDGE_READ_ONLY_MODULE_V1',status:'EXACT_INSTALLED_BRIDGE_MODULE_READ_ONLY_RETAINED',started_ts,completed_ts,before,after,module_bytes:source.length,module_sha256:hash(source),hub_prefix_bytes:at,hub_prefix_sha256:hash(source.subarray(0,at)),release_raw_sha256:expected.release_raw_sha256,release_run:expected.release_run,cloudflare_HTTP:control.used?.()??null,sourceHTTP:0,D1:0,MAIN:0,Telegram:0,Worker_invocations:0,uploads:0,activations:0,settings_changes:0,tail_streams:0,secret_values_exported:false,native_counter_reply_observed:false,bridge_counter_contract_qualified:false,whole_day_closed:false,physical_bytes_freed:0}};
}

export function exactConfiguredSQLBridgeURL(raw,subdomain){
 let u;try{u=new URL(raw);}catch{throw Error('EXACT_CONFIGURED_SQL_BRIDGE_REQUIRED');}
 if(typeof subdomain!=='string'||!/^[-a-z0-9]+$/.test(subdomain)||u.protocol!=='https:'||u.hostname!==SQL_BRIDGE_SCRIPT+'.'+subdomain+'.workers.dev'||u.port||u.username||u.password||u.search||u.hash||u.pathname!=='/d1')throw Error('EXACT_CONFIGURED_SQL_BRIDGE_REQUIRED');
 return{script:SQL_BRIDGE_SCRIPT,configured_bridge_matches_account_script:true,configured_url_exported:false};
}
export async function inspectInstalledSQLBridgeModule({control,configured_bridge_url,guard,clock=Date.now,secret_values=[]}={}){
 if(typeof control?.call!=='function'||typeof guard!=='function'||typeof clock!=='function')throw Error('EXACT_READ_ONLY_SQL_BRIDGE_INSPECTION_REQUIRED');
 const started_ts=clock();await guard({min_headroom_ms:600000});
 const subdomain=await control.call(SQL_BRIDGE_SCRIPT,'/subdomain'),binding=exactConfiguredSQLBridgeURL(configured_bridge_url,subdomain.subdomain);
 const reader=createVersionBoundWorkerReader({call:control.call}),worker={name:SQL_BRIDGE_SCRIPT,crons:[]},before=await reader.read(worker),settings=reader.settings(SQL_BRIDGE_SCRIPT,before.version_id);
 const db=settings.bindings.filter(b=>b.name==='DATA_DB');if(db.length!==1||db[0].type!=='d1'||(db[0].id??db[0].database_id)!=='057a2847-2cc4-4e52-8534-1be1596d21d5')throw Error('EXACT_SQL_BRIDGE_DATA_DB_REQUIRED');
 const source=reader.module(SQL_BRIDGE_SCRIPT,before.version_id)?.bytes;
 if(!Buffer.isBuffer(source)||!source.length||source.length>P.max_module_bytes||Buffer.from(source.toString('utf8')).compare(source)!==0)throw Error('EXACT_BRIDGE_MODULE_UTF8_BOUND');
 if(secret_values.some(v=>typeof v==='string'&&v.length>=12&&source.includes(Buffer.from(v))))throw Error('BRIDGE_MODULE_SECRET_EXPORT_DENIED');
 await guard({min_headroom_ms:30000});const after=await reader.read(worker),latest=await control.call(SQL_BRIDGE_SCRIPT,'/versions?per_page=1');
 if(!same(before,after)||latest.items?.[0]?.id!==after.version_id)throw Error('BRIDGE_MOVED_DURING_READ_ONLY_INSPECTION');
 await guard({min_headroom_ms:30000});const completed_ts=clock();if(!Number.isSafeInteger(started_ts)||!Number.isSafeInteger(completed_ts)||started_ts>completed_ts)throw Error('BRIDGE_INSPECTION_CLOCK_NOT_CLOSED');
 return{source,proof:{schema:'EXACT_INSTALLED_SQL_BRIDGE_READ_ONLY_MODULE_V1',status:'EXACT_INSTALLED_SQL_BRIDGE_MODULE_READ_ONLY_RETAINED',...binding,started_ts,completed_ts,before,after,module_bytes:source.length,module_sha256:hash(source),cloudflare_HTTP:control.used?.()??null,sourceHTTP:0,D1:0,MAIN:0,Telegram:0,Worker_invocations:0,uploads:0,activations:0,settings_changes:0,tail_streams:0,secret_values_exported:false,native_counter_reply_observed:false,bridge_counter_contract_qualified:false,whole_day_closed:false,physical_bytes_freed:0}};
}
