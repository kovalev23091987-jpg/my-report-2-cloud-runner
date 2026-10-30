import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const sha=value=>createHash('sha256').update(value).digest('hex');
const a=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const own=JSON.parse(fs.readFileSync('checkpoints/CLOUD_PHASE_STATE_20261004.json','utf8')).lease;
assert.equal(a.status,'ADMITTED_ONE_PUBLICATION_CONTROL_MOCK');assert.equal(a.maximum_Node_processes,1);
assert(Date.now()>=a.issued_ts&&Date.now()<a.expires_ts&&a.expires_ts<=own.expires_ts);
assert.equal(own.owner,a.own_lease.owner);assert.notEqual(own.released,true);
for(const [name,hash] of Object.entries(a.frozen_files))assert.equal(sha(fs.readFileSync(name)),hash,name);
const baseBytes=fs.readFileSync(a.base_artifact),newBytes=fs.readFileSync(a.artifact);
assert.equal(sha(baseBytes),a.base_artifact_sha256);assert.equal(sha(newBytes),a.artifact_sha256);
const base=JSON.parse(baseBytes),next=JSON.parse(newBytes),hashes=modules=>Object.fromEntries(Object.entries(modules).map(([name,text])=>[name,sha(text)]));
const changed=Object.keys(next.modules).filter(name=>base.modules[name]!==next.modules[name]).sort();assert.equal(changed.length,9);
assert.equal(Object.keys(base.modules).length,78);assert.equal(Object.keys(next.modules).length,78);
const result={schema:'ROOT_PUBLICATION_RECOVERY_CONTROL_MOCK_V1',status:'ATTEMPTED_NO_AUTO_RETRY',evidence_class:'CONTROLLED_OFFLINE_NOT_NATIVE',affected_cases:1,Node_processes:1,builds:0,engine_calls:0,mock_CF_requests:0,controller_calls:0,negative_guards:0,market_HTTP:0,native_SQL:0,actual_Cloudflare:0,Telegram:0,production_modified:false,actual_rollback_authorized:false};
fs.writeFileSync(a.attempt_file,JSON.stringify({started_ts:Date.now(),authority_main:a.authority_main}),{flag:'wx',mode:0o600});
const realFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error('REAL_NETWORK_FORBIDDEN');};
try{
  const settings={bindings:[{name:'PUMP_REPORT_ENABLED',type:'plain_text',text:'1'},{name:'PUMP_REPORT_DELIVERY_ENABLED',type:'plain_text',text:'1'},
    {name:'DATA_DB',type:'d1',id:'057a2847-2cc4-4e52-8534-1be1596d21d5'},...Array.from({length:18},(_,i)=>({name:'MOCK_KEEP_'+i,type:'plain_text',text:'UNCHANGED'}))],compatibility_date:'2026-09-11',compatibility_flags:[]};
  const originalSettings=structuredClone(settings);let modules=structuredClone(base.modules),contentWrites=0,settingWrites=0;
  const boundary='----PUBLICATION_CONTROL_OFFLINE';
  const multipart=rows=>Object.entries(rows).map(([name,text])=>'--'+boundary+'\r\nContent-Disposition: form-data; name="'+name+'"; filename="'+name+'"\r\nContent-Type: application/javascript+module\r\n\r\n'+text+'\r\n').join('')+'--'+boundary+'--\r\n';
  const parts=body=>{const b=body.slice(0,body.indexOf('\r\n'));return Object.fromEntries(body.split(b).slice(1,-1).map(part=>{const cut=part.indexOf('\r\n\r\n'),name=part.slice(0,cut).match(/\bname="([^"]+)"/)[1];return [name,part.slice(cut+4,-2)];}));};
  const cloudflare={async request(req){
    result.mock_CF_requests++;assert(result.mock_CF_requests<=a.maximum_mock_CF_requests);
    if(req.method==='GET')return {status:200,success:true,result:req.path.endsWith('/settings')?structuredClone(settings):req.path.endsWith('/schedules')?{schedules:req.path.includes('/my-report-2-hub/')?[{cron:'*/5 7-16 * * *'}]:[]}:multipart(modules)};
    const parsed=parts(req.body);
    if(req.method==='PUT'){
      assert(req.path.endsWith('/my-report-2-hub/content'));assert.deepEqual(JSON.parse(parsed.metadata),{main_module:'worker-entry.mjs'});
      delete parsed.metadata;modules=parsed;contentWrites++;
    }else{
      assert.equal(req.method,'PATCH');assert(req.path.endsWith('/my-report-2-hub/settings'));
      const update=JSON.parse(parsed.settings);assert.equal(update.bindings.length,21);
      settings.bindings=update.bindings.map(binding=>binding.type==='inherit'?structuredClone(settings.bindings.find(old=>old.name===binding.name)):binding);settingWrites++;
    }
    return {status:200,success:true,result:{}};
  }};
  const config=(action,before,after,beforeHash,afterHash)=>({schema:'ROOT_PRODUCTION_CONTROL_PLANE_ADMISSION_V1',status:'ADMITTED_NOT_SPENT',maximum_attempts:1,action,authority_main:a.authority_main,
    issued_ts:Date.now(),expires_ts:a.expires_ts,own_lease:a.own_lease,admin_HTTP_max:action==='READ_ONLY'?5:11,
    before_modules_sha256:hashes(before.modules),after_modules_sha256:hashes(after.modules),before_pin:before.manifest.implementation_pin.sha256,after_pin:after.manifest.implementation_pin.sha256,
    before_artifact_sha256:beforeHash,after_artifact_sha256:afterHash,after_rules_version:'pump-analytics-v8-post-breach-20261029',main_module:'worker-entry.mjs',
    ...(action==='INSTALL'?{install_module_overrides:Object.fromEntries(changed.map(name=>[name,after.modules[name]])),quiescence:{state:'FINALIZED',observation_status:'QUIESCENT_CODE_UPDATE_ALLOWED',executor_owner:null,implementation_sha256:before.manifest.implementation_pin.sha256,observed_ts:Date.now()}}:{})});
  const invoke=async(template,configuration)=>{
    result.controller_calls++;
    const controller=Function('cloudflare','accountId','return ('+template.replace('__PUMP_CONFIG__',()=>JSON.stringify(configuration))+');')(cloudflare,'70ee0af85191ea470e74c7383fdec772');
    return controller();
  };
  for(const [templatePath,before,after,beforeHash,afterHash] of [[a.forward_template,base,next,sha(baseBytes),sha(newBytes)],[a.return_template,next,base,sha(newBytes),sha(baseBytes)]]){
    const template=fs.readFileSync(templatePath,'utf8');
    for(const configuration of [config('PAUSE_AUTO',before,before,beforeHash,beforeHash),config('INSTALL',before,after,beforeHash,afterHash),config('RESUME_AUTO',after,after,afterHash,afterHash),config('READ_ONLY',after,after,afterHash,afterHash)]){
      const proof=await invoke(template,configuration);assert.equal(proof.state,'CONFIRMED_FULL',proof.error);assert.equal(proof.FULL_exact_module_bytes,true);
    }
    assert.deepEqual(modules,after.modules);assert.deepEqual(settings,originalSettings);
    for(const mutate of [bad=>{bad.after_artifact_sha256='b'.repeat(64);},bad=>{bad.quiescence.executor_owner='MOCK_BUSY';},bad=>{bad.install_module_overrides['analytics/index.mjs']='UNQUALIFIED';}]){
      const bad=config('INSTALL',before,after,beforeHash,afterHash);mutate(bad);
      const calls=result.mock_CF_requests,proof=await invoke(template,bad);
      assert.equal(proof.state,'FAILED_OR_UNKNOWN_NO_RETRY');assert.equal(proof.read_only_and_mutation_admin_HTTP_attempted,0);assert.equal(result.mock_CF_requests,calls);result.negative_guards++;
    }
  }
  assert.deepEqual(modules,base.modules);assert.deepEqual(settings,originalSettings);
  assert.equal(result.mock_CF_requests,76);assert.equal(contentWrites,2);assert.equal(settingWrites,4);assert.equal(result.negative_guards,6);
  Object.assign(result,{status:'PASS',artifact_sha256:sha(newBytes),implementation_sha256:next.manifest.implementation_pin.sha256,module_count:78,changed_modules:changed,unchanged_modules:69,all21bindings_and3schedules_preserved:true,forward_exact_delta_qualified:true,return_exact_original_bytes_qualified:true,mutable_admission_cannot_change_frozen_artifact:true});
}catch(error){result.status='FAILED_PRESERVED_NO_AUTO_RETRY';result.error=String(error.stack??error).slice(0,2200);process.exitCode=1;}
finally{globalThis.fetch=realFetch;result.completed_ts=Date.now();fs.writeFileSync(a.output,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});}
console.log(JSON.stringify(result));
