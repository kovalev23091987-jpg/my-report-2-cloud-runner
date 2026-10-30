// Narrow deployment fallback using the user's existing official Wrangler login.
// Credential values stay inside this process and are never printed or copied.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const account='70ee0af85191ea470e74c7383fdec772',script='my-report-2-hub';
const base='/accounts/'+account+'/workers/scripts/'+script;
const credentialPath='/Users/mac/Library/Preferences/.wrangler/config/default.toml';
const credential=fs.readFileSync(credentialPath,'utf8'),match=credential.match(/^oauth_token\s*=\s*("[^"\n]+")/m);
if(!match)throw Error('OFFICIAL_WRANGLER_LOGIN_REQUIRED');
const token=JSON.parse(match[1]);
const [command,arg,output]=process.argv.slice(2);
const digest=s=>createHash('sha256').update(s).digest('hex');
async function call(method,path,{body,raw=false}={}){
  const headers={authorization:'Bearer '+token};if(body&&!raw)headers['content-type']='application/json';
  const response=await fetch('https://api.cloudflare.com/client/v4'+path,{method,headers,body:body?raw?body:JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(45000)});
  const text=await response.text();let parsed=null;try{parsed=JSON.parse(text);}catch{}
  if(!response.ok||parsed?.success===false)throw Error('CLOUDFLARE_'+response.status+':'+(parsed?.errors??[]).map(e=>e.code).join(','));
  return {status:response.status,parsed,text,content_type:response.headers.get('content-type')};
}
const save=(p,value)=>{if(p)fs.writeFileSync(p,JSON.stringify(value),{mode:0o600});};
if(command==='subscription-metadata'){
  const r=await call('GET','/accounts/'+account+'/subscriptions');save(output??arg,r.parsed);
  console.log(JSON.stringify({success:true,control_plane_GETs:1,SQL_queries:0,subscriptions:(r.parsed.result??[]).map(s=>({state:s.state??null,rate_plan_id:s.rate_plan?.id??null,rate_plan_name:s.rate_plan?.public_name??null,component_names:s.component_values?.map(c=>c.name)??null})),plan_changed:false}));
}else if(command==='platform-metadata'){
  const settings=await call('GET',base+'/settings');
  const database=await call('GET','/accounts/'+account+'/d1/database/057a2847-2cc4-4e52-8534-1be1596d21d5');
  save(output??arg,{settings:settings.parsed,database:database.parsed});
  const s=settings.parsed.result,d=database.parsed.result;
  console.log(JSON.stringify({success:true,control_plane_GETs:2,SQL_queries:0,worker:{usage_model:s.usage_model??null,limits:s.limits??null,compatibility_date:s.compatibility_date,bindings_count:s.bindings?.length,settings_keys:Object.keys(s)},database:{name:d.name,file_size:d.file_size??null,num_tables:d.num_tables??null,version:d.version??null,metadata_keys:Object.keys(d)},storage_stress_test:false}));
}else if(command==='inspect'){
  const r=await call('GET',base+'/settings');save(output??arg,r.parsed);
  const code=await call('GET',base),bodyStart=code.text.indexOf('\r\n\r\n')+4,marker=code.text.slice(0,code.text.indexOf('\r\n')),bodyEnd=code.text.lastIndexOf('\r\n'+marker+'--');
  const retained_legacy_sha256=bodyStart>=4&&bodyEnd>bodyStart?digest(code.text.slice(bodyStart,bodyEnd)):null;
  const schedules=[];for(const name of [script,'my-report-2-free-history','my-report-2-liq-forecast-history']){const s=await call('GET','/accounts/'+account+'/workers/scripts/'+name+'/schedules');schedules.push({script:name,schedules:s.parsed.result});}
  console.log(JSON.stringify({success:true,account_id:account,worker:script,retained_legacy_sha256,compatibility_date:r.parsed.result.compatibility_date,compatibility_flags:r.parsed.result.compatibility_flags,bindings:r.parsed.result.bindings.map(b=>({name:b.name,type:b.type,...(b.type==='d1'?{database_id:b.id}:{} )})),schedules}));
}else if(command==='legacy-check'){
  const r=await call('GET',base),start=r.text.indexOf('\r\n\r\n')+4,marker=r.text.slice(0,r.text.indexOf('\r\n')),end=r.text.lastIndexOf('\r\n'+marker+'--');
  if(start<4||end<start)throw Error('LEGACY_MULTIPART_REQUIRED');
  const result={success:true,sha256:digest(r.text.slice(start,end)),bytes:Buffer.byteLength(r.text.slice(start,end))};save(output??arg,result);console.log(JSON.stringify(result));
}else if(command==='qualification-resources'){
  const admission=JSON.parse(fs.readFileSync(arg,'utf8'));if(admission.expires_ts<=Date.now()||admission.native?.failure_inspection?.max_requests!==1)throw Error('BOUNDED_FAILURE_INSPECTION_ADMISSION_REQUIRED');
  const r=await call('POST','/accounts/'+account+'/d1/database/057a2847-2cc4-4e52-8534-1be1596d21d5/query',{body:{sql:'SELECT value_json FROM pump_report_state_v1 WHERE state_key=?1 LIMIT 1',params:['pump:resources']}});
  save(output,r.parsed);const result=r.parsed.result[0],state=JSON.parse(result.results[0]?.value_json??'null');
  console.log(JSON.stringify({success:true,meta:result.meta,provider:state?.providers?.BINGX??null,outstanding:state?Object.keys(state.outstanding):null,unknown:state?Object.keys(state.unknown):null,days:state?.days??null}));
}else if(command==='control-secret'){
  const key=fs.readFileSync(arg,'utf8').trim();if(!/^[a-f0-9]{64}$/.test(key))throw Error('CONTROL_KEY_FORMAT');
  const r=await call('PUT',base+'/secrets',{body:{name:'PUMP_CONTROL_KEY',type:'secret_text',text:key}});save(output,r.parsed);console.log(JSON.stringify({success:true,status:r.status,name:r.parsed.result.name,type:r.parsed.result.type}));
}else if(command==='deploy'){
  const a=JSON.parse(fs.readFileSync(arg,'utf8'));for(const [name,text] of Object.entries(a.modules))if(digest(text)!==a.manifest.modules[name]?.sha256)throw Error('ARTIFACT_HASH_MISMATCH:'+name);
  if(a.metadata.main_module!=='worker-entry.mjs'||JSON.stringify(a.metadata.keep_bindings)!==JSON.stringify(['secret_text','plain_text','d1']))throw Error('BINDING_PRESERVATION_REQUIRED');
  const form=new FormData();form.append('metadata',new Blob([JSON.stringify(a.metadata)],{type:'application/json'}));
  for(const [name,text] of Object.entries(a.modules))form.append(name,new Blob([text],{type:'application/javascript+module'}),name);
  const r=await call('PUT',base,{body:form,raw:true});save(output,r.parsed);console.log(JSON.stringify({success:true,status:r.status,id:r.parsed.result.id,etag:r.parsed.result.etag,modified_on:r.parsed.result.modified_on,deployment_id:r.parsed.result.deployment_id}));
}else if(command==='readback'){
  const a=JSON.parse(fs.readFileSync(arg,'utf8')),r=await call('GET',base),boundary=r.content_type.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i),modules={};
  if(!boundary)throw Error('MULTIPART_READBACK_REQUIRED');
  for(const part of r.text.split('--'+(boundary[1]??boundary[2])).slice(1)){if(part.startsWith('--'))break;const split=part.indexOf('\r\n\r\n');if(split<0)continue;const header=part.slice(0,split),name=header.match(/(?:^|;\s*)name="([^"]+)"/m)?.[1];let value=part.slice(split+4);if(value.endsWith('\r\n'))value=value.slice(0,-2);if(name)modules[name]=value;}
  const results=Object.entries(a.manifest.modules).map(([name,m])=>({name,expected:m.sha256,actual:modules[name]===undefined?null:digest(modules[name]),exact:modules[name]===a.modules[name]}));
  const result={success:results.every(r=>r.exact),worker:script,module_count:results.length,results};save(output,result);console.log(JSON.stringify({success:result.success,worker:script,module_count:results.length,exact_modules:results.filter(r=>r.exact).length,failed:results.filter(r=>!r.exact),full_receipt_path:output??null}));if(!result.success)process.exitCode=1;
}else throw Error('ONLY_INSPECT_CONTROL_SECRET_DEPLOY_READBACK_SUPPORTED');
