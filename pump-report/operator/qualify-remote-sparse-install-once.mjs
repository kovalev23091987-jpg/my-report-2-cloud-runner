import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const sha=s=>createHash('sha256').update(s).digest('hex');
const a=JSON.parse(fs.readFileSync(process.argv[2])),now=Date.now();
assert.equal(a.status,'ADMITTED_ONE_CONNECTED_REMOTE_CONTROL_QUALIFICATION');
assert(now<a.expires_ts&&a.expires_ts<=a.own_lease.expires_ts);
const own=JSON.parse(fs.readFileSync('checkpoints/CLOUD_PHASE_STATE_20261004.json')).lease;
assert.equal(own.owner,a.own_lease.owner);assert(!own.released);
const template=fs.readFileSync(a.template_path,'utf8');assert.equal(sha(template),a.template_sha256);
assert.equal(sha(fs.readFileSync(a.before_artifact)),a.before_artifact_sha256);
assert.equal(sha(fs.readFileSync(a.after_artifact)),a.after_artifact_sha256);
const before=JSON.parse(fs.readFileSync(a.before_artifact)),after=JSON.parse(fs.readFileSync(a.after_artifact));
assert.equal(before.metadata.main_module,'worker-entry.mjs');assert.equal(after.metadata.main_module,'worker-entry.mjs');
fs.writeFileSync(a.private_attempt,JSON.stringify({started_ts:now,state:'ATTEMPTED_NO_RETRY'}),{flag:'wx',mode:0o600});
const config=v=>({before_modules_sha256:Object.fromEntries(Object.entries(v.modules).map(([n,s])=>[n,sha(s)])),before_pin:v.manifest.implementation_pin.sha256});
const baseConfig={authority_main:a.authority_main,issued_ts:now,expires_ts:a.expires_ts,own_lease:a.own_lease,admin_HTTP_max:11};
let currentModules=structuredClone(before.modules),mockCalls=0,writes=0;
const binding=n=>({name:n,type:'plain_text',text:'ARTIFICIAL_VALUE'});
const bindings=[...['PUMP_REPORT_ENABLED','PUMP_REPORT_DELIVERY_ENABLED'].map(n=>({name:n,type:'plain_text',text:n==='PUMP_REPORT_ENABLED'?'0':'1'})),{name:'DATA_DB',type:'d1',id:'057a2847-2cc4-4e52-8534-1be1596d21d5'},...Array.from({length:18},(_,i)=>binding('ARTIFICIAL_PRESERVED_'+i))];
let settings={bindings,compatibility_date:'2026-09-11',compatibility_flags:[],annotations:{'workers/message':'ARTIFICIAL_PRESERVED'}};
const originalSettings=structuredClone(settings),boundary='----ARTIFICIAL_BOUNDARY_20261027',accountId='70ee0af85191ea470e74c7383fdec772';
const multipart=modules=>Object.entries(modules).map(([n,s])=>'--'+boundary+'\r\nContent-Disposition: form-data; name="'+n+'"; filename="'+n+'"\r\nContent-Type: application/javascript+module\r\n\r\n'+s+'\r\n').join('')+'--'+boundary+'--\r\n';
const parseMultipart=body=>{
  const b=body.slice(0,body.indexOf('\r\n'));const out={};
  for(const part of body.split(b).slice(1,-1)){const split=part.indexOf('\r\n\r\n'),n=part.slice(0,split).match(/\bname="([^"]+)"/)[1];out[n]=part.slice(split+4,-2);}return out;
};
const cloudflare={async request(r){mockCalls++;
  const path='/accounts/'+accountId+'/workers/scripts/';assert(r.path.startsWith(path));
  if(r.method==='GET'){
    let result;
    if(r.path.endsWith('/schedules'))result={schedules:r.path.includes('/my-report-2-hub/')?[{cron:'*/5 7-16 * * *'}]:[]};
    else if(r.path.endsWith('/settings'))result=structuredClone(settings);
    else result=multipart(currentModules);
    return {status:200,success:true,result};
  }
  writes++;assert(r.rawBody===true);assert(r.contentType.startsWith('multipart/form-data; boundary='));
  const parts=parseMultipart(r.body);
  if(r.method==='PATCH'){
    assert(r.path.endsWith('/settings'));const incoming=JSON.parse(parts.settings),old=Object.fromEntries(settings.bindings.map(b=>[b.name,b]));
    settings={...settings,bindings:incoming.bindings.map(b=>b.type==='inherit'?old[b.name]:b)};
    if(incoming.annotations)settings.annotations=incoming.annotations;
  }else{
    assert.equal(r.method,'PUT');assert(r.path.endsWith('/content'));
    assert.deepEqual(JSON.parse(parts.metadata),{main_module:'worker-entry.mjs'});delete parts.metadata;currentModules=parts;
  }
  return {status:200,success:true,result:{}};
}};
const run=async c=>{
  const code=template.replace('__PUMP_CONFIG__',()=>JSON.stringify(c));
  const fn=Function('cloudflare','accountId','return ('+code+');')(cloudflare,accountId);
  const proof=await fn();assert.equal(proof.state,'CONFIRMED_FULL',proof.error);assert.equal(proof.read_only_and_mutation_admin_HTTP_attempted,11);return proof;
};
const result={schema:'ROOT_REMOTE_MAINTENANCE_CONNECTED_QUALIFICATION_V1',status:'RUNNING',fixture_class:'ARTIFICIAL_CONTROL_PLANE_WITH_GENUINE_CODE_ARTIFACTS',actual_Cloudflare_HTTP:0,native_SQL:0,market_HTTP:0,Telegram:0,controller_calls:0,engine_calls:0};
try{
  const installed=await run({...baseConfig,...config(before),action:'INSTALL',after_modules_sha256:config(after).before_modules_sha256,after_pin:after.manifest.implementation_pin.sha256,after_artifact_sha256:a.after_artifact_sha256,main_module:after.metadata.main_module,install_module_overrides:Object.fromEntries(Object.entries(after.modules).filter(([n,source])=>source!==before.modules[n])),quiescence:{state:'FINALIZED',observation_status:'QUIESCENT_CODE_UPDATE_ALLOWED',executor_owner:null,implementation_sha256:before.manifest.implementation_pin.sha256,observed_ts:Date.now()}});result.controller_calls++;
  assert.deepEqual(currentModules,after.modules);assert.equal(installed.module_count,73);assert.equal(installed.control_plane.automatic_enabled,false);
  assert.deepEqual(settings,originalSettings);assert.equal(writes,1);
  result.status='PASS';result.mock_API_calls=mockCalls;result.mock_mutations=writes;result.entrypoint_preserved=true;result.all21_settings_and_crons_preserved=true;result.only_qualified_changed_modules_supplied=true;result.unchanged_legacy_reused_from_actual_mock_read=true;
}catch(error){result.status='FAIL';result.error=String(error.message).slice(0,300);process.exitCode=1;}
finally{result.completed_ts=Date.now();fs.writeFileSync(a.proof_path,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(result));}
