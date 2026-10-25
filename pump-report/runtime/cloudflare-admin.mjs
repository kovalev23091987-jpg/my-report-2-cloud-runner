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
if(command==='inspect'){
  const r=await call('GET',base+'/settings');save(output??arg,r.parsed);
  const code=await call('GET',base),bodyStart=code.text.indexOf('\r\n\r\n')+4,marker=code.text.slice(0,code.text.indexOf('\r\n')),bodyEnd=code.text.lastIndexOf('\r\n'+marker+'--');
  const retained_legacy_sha256=bodyStart>=4&&bodyEnd>bodyStart?digest(code.text.slice(bodyStart,bodyEnd)):null;
  const schedules=[];for(const name of [script,'my-report-2-free-history','my-report-2-liq-forecast-history']){const s=await call('GET','/accounts/'+account+'/workers/scripts/'+name+'/schedules');schedules.push({script:name,schedules:s.parsed.result});}
  console.log(JSON.stringify({success:true,account_id:account,worker:script,retained_legacy_sha256,compatibility_date:r.parsed.result.compatibility_date,compatibility_flags:r.parsed.result.compatibility_flags,bindings:r.parsed.result.bindings.map(b=>({name:b.name,type:b.type,...(b.type==='d1'?{database_id:b.id}:{} )})),schedules}));
}else if(command==='legacy-check'){
  const r=await call('GET',base),start=r.text.indexOf('\r\n\r\n')+4,marker=r.text.slice(0,r.text.indexOf('\r\n')),end=r.text.lastIndexOf('\r\n'+marker+'--');
  if(start<4||end<start)throw Error('LEGACY_MULTIPART_REQUIRED');
  const result={success:true,sha256:digest(r.text.slice(start,end)),bytes:Buffer.byteLength(r.text.slice(start,end))};save(output??arg,result);console.log(JSON.stringify(result));
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
  const result={success:results.every(r=>r.exact),worker:script,module_count:results.length,results};save(output,result);console.log(JSON.stringify(result));if(!result.success)process.exitCode=1;
}else throw Error('ONLY_INSPECT_CONTROL_SECRET_DEPLOY_READBACK_SUPPORTED');
