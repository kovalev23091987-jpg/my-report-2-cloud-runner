import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex'),a=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
assert.equal(a.status,'ADMITTED_ONE_POSTLAUNCH_OPERATOR_MOCK_CASE');assert(Date.now()<a.expires_ts&&a.expires_ts<=a.own_lease.expires_ts);
assert.equal(sha(fs.readFileSync(process.argv[1])),a.script_sha256);
const phase=JSON.parse(fs.readFileSync('checkpoints/CLOUD_PHASE_STATE_20261004.json','utf8'));assert.equal(phase.lease.owner,a.own_lease.owner);assert.notEqual(phase.lease.released,true);
for(const [p,h]of Object.entries(a.frozen_files))assert.equal(sha(fs.readFileSync(p)),h,p);
const beforeBytes=fs.readFileSync(a.base_artifact),bytes=fs.readFileSync(a.artifact);assert.equal(sha(beforeBytes),a.base_artifact_sha256);assert.equal(sha(bytes),a.artifact_sha256);
const base=JSON.parse(beforeBytes),artifact=JSON.parse(bytes),pin=artifact.manifest.implementation_pin.sha256,RULES_VERSION='pump-analytics-v8-post-breach-20261029';
const changed=Object.keys(artifact.modules).filter(n=>base.modules[n]!==artifact.modules[n]).sort();assert.equal(changed.length,5);assert.equal(Object.keys(base.modules).length,78);assert.equal(Object.keys(artifact.modules).length,78);
const generated={files:Object.entries(a.frozen_files).map(([path,sha256])=>({path,sha256}))};
const fd=fs.openSync(a.attempt_file,'wx',0o600),r={schema:'ROOT_POSTLAUNCH_INSTALL_OPERATOR_MOCK_CASE_V1',status:'ATTEMPTED_NO_AUTO_RETRY',evidence_class:'ARTIFICIAL_OFFLINE_ACCEPTANCE_TEST',Node:1,build:0,engine_calls:0,operator_syntax_checks:0,named_gate_constructor_calls:0,named_sql_transform_calls:0,mock_CF_requests:0,market_HTTP:0,native_SQL:0,Cloudflare:0,Telegram:0,installed:false,direct_owner17_approved:false};
const save=()=>{fs.ftruncateSync(fd,0);fs.writeSync(fd,JSON.stringify(r,null,2)+'\n',0,'utf8');fs.fsyncSync(fd);};save();
const realFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error('REAL_HTTP_FORBIDDEN');};
try{
 for(const f of generated.files)if(f.path.endsWith('.mjs')){assert(r.operator_syntax_checks<a.max_operator_syntax_checks);r.operator_syntax_checks++;new vm.SourceTextModule(fs.readFileSync(f.path,'utf8'));}
 const {createPostlaunchNamedSqlException,POSTLAUNCH_LOOKUP_IDS}=await import(pathToFileURL(path.resolve('pump-report/operator/postlaunch-owner17-sql-exception.mjs')).href);
 const now=Date.now(),gateCases=[],gate=(ad)=>{assert(r.named_gate_constructor_calls<a.max_named_gate_constructor_calls);r.named_gate_constructor_calls++;return createPostlaunchNamedSqlException(ad,now);};
 for(const n of[17]){
  const ad={mode:'LOOKUP',run_id:POSTLAUNCH_LOOKUP_IDS[n],implementation_sha256:base.manifest.implementation_pin.sha256,native_query_cap:16,expires_ts:now+120000,
   lookup_single_exception:{schema:'OWNER_POSTLAUNCH_OUTCOME_INSTALL17_V1',status:'APPROVED_BY_DIRECT_OWNER',extra_number:n,approval_message_sha256:'a'.repeat(64),
    owner_thread_id:'01a171f7-596e-7dc0-a82f-3e92f57f4ef6',day_utc:'2026-10-29',approved_run_ids:[POSTLAUNCH_LOOKUP_IDS[17]],maximum_new_runs:1,
    exact_run_id:POSTLAUNCH_LOOKUP_IDS[n],target_artifact_sha256:sha(bytes),previous_run_count:n-1,additional_runs:1,maximum_count_after:n,
    rows_read:500,rows_written:30,max_queries:16,approved_ts:now-1,expires_ts:now+60000}};
  const params=Array(17).fill(0);Object.assign(params,{0:'PUMP:LOOKUP:'+ad.run_id,1:'2026-10-29',2:500,3:30,15:1,16:10});
  const sql='INSERT OR IGNORE INTO report2_runner_budget_ledger_shadow(...) AND (?16=0 OR lookup_count<?17)',f=gate(ad);r.named_sql_transform_calls++;const bound=f(sql,params);
  assert.equal(bound.params[16],n);assert(bound.sql.includes('AND lookup_count='+(n-1)+' '));r.named_sql_transform_calls++;assert.throws(()=>f(sql,params));
  for(const mutate of [x=>{x.lookup_single_exception.target_artifact_sha256='b'.repeat(64);},x=>{x.lookup_single_exception.previous_run_count--;},x=>{x.lookup_single_exception.status='NOT_APPROVED';},x=>{x.lookup_single_exception.expires_ts=now-1;}]){
   const bad=structuredClone(ad);mutate(bad);assert.throws(()=>gate(bad));}
  gateCases.push({extra:n,mock_only:true,replay_wrongartifact_wrongcount_unapproved_expired_refused:true});
 }
 const template=fs.readFileSync('pump-report/operator/cloudflare-postlaunch-control.template.js','utf8'),accountId='70ee0af85191ea470e74c7383fdec772';
 let mockModules=structuredClone(base.modules),mutations=0;
 const settings={bindings:[{name:'PUMP_REPORT_ENABLED',type:'plain_text',text:'0'},{name:'PUMP_REPORT_DELIVERY_ENABLED',type:'plain_text',text:'1'},
  {name:'DATA_DB',type:'d1',id:'057a2847-2cc4-4e52-8534-1be1596d21d5'},...Array.from({length:18},(_,i)=>({name:'MOCK_KEEP_'+i,type:'plain_text',text:'UNCHANGED'}))],compatibility_date:'2026-09-11',compatibility_flags:[]};
 const beforeSettings=structuredClone(settings),boundary='----POST_BREACH_OFFLINE_ONLY';
 const multipart=m=>Object.entries(m).map(([n,s])=>'--'+boundary+'\r\nContent-Disposition: form-data; name="'+n+'"; filename="'+n+'"\r\nContent-Type: application/javascript+module\r\n\r\n'+s+'\r\n').join('')+'--'+boundary+'--\r\n';
 const cloudflare={async request(req){r.mock_CF_requests++;assert(r.mock_CF_requests<=a.max_mock_CF_requests);
  if(req.method==='GET')return{status:200,success:true,result:req.path.endsWith('/settings')?structuredClone(settings):req.path.endsWith('/schedules')?{schedules:req.path.includes('/my-report-2-hub/')?[{cron:'*/5 7-16 * * *'}]:[]}:multipart(mockModules)};
  assert.equal(req.method,'PUT');assert(req.path.endsWith('/my-report-2-hub/content'));mutations++;
  const b=req.body.slice(0,req.body.indexOf('\r\n')),parts={};for(const part of req.body.split(b).slice(1,-1)){const cut=part.indexOf('\r\n\r\n'),n=part.slice(0,cut).match(/\bname="([^"]+)"/)[1];parts[n]=part.slice(cut+4,-2);}
  assert.deepEqual(JSON.parse(parts.metadata),{main_module:'worker-entry.mjs'});delete parts.metadata;mockModules=parts;return{status:200,success:true,result:{}};}};
 const hashes=m=>Object.fromEntries(Object.entries(m).map(([n,s])=>[n,sha(s)]));
 const config={schema:'ROOT_PRODUCTION_CONTROL_PLANE_ADMISSION_V1',status:'ADMITTED_NOT_SPENT',maximum_attempts:1,action:'INSTALL',authority_main:a.authority_main,
  issued_ts:Date.now(),expires_ts:a.expires_ts,own_lease:a.own_lease,admin_HTTP_max:11,before_modules_sha256:hashes(base.modules),after_modules_sha256:hashes(artifact.modules),
  before_pin:base.manifest.implementation_pin.sha256,after_pin:pin,before_artifact_sha256:sha(fs.readFileSync(a.base_artifact)),after_artifact_sha256:sha(bytes),
  after_rules_version:RULES_VERSION,main_module:'worker-entry.mjs',install_module_overrides:Object.fromEntries(changed.map(n=>[n,artifact.modules[n]])),
  quiescence:{state:'FINALIZED',observation_status:'QUIESCENT_CODE_UPDATE_ALLOWED',executor_owner:null,implementation_sha256:base.manifest.implementation_pin.sha256,observed_ts:Date.now()}};
 const ctl=Function('cloudflare','accountId','return ('+template.replace('__PUMP_CONFIG__',()=>JSON.stringify(config))+');')(cloudflare,accountId),proof=await ctl();
 assert.equal(proof.state,'CONFIRMED_FULL',proof.error);assert.equal(r.mock_CF_requests,11);assert.equal(mutations,1);assert.deepEqual(mockModules,artifact.modules);assert.deepEqual(settings,beforeSettings);

 Object.assign(r,{status:'PASS',artifact_sha256:sha(bytes),implementation_sha256:pin,module_count:78,changed_modules:changed,unchanged_modules:73,all21bindings_and3schedules_preserved:true,one_only_exact_named17_SQL_exception:true,wrong_artifact_count_unapproved_expired_and_replay_refused:true,real_SQL_or_deployment_not_admitted:true});
 assert.equal(r.operator_syntax_checks,2);assert.equal(r.named_gate_constructor_calls,5);assert.equal(r.named_sql_transform_calls,2);assert.equal(r.mock_CF_requests,11);
}catch(error){r.status='FAILED_PRESERVED_NO_AUTO_RETRY';r.error=String(error.stack??error).slice(0,2500);process.exitCode=1;}
finally{r.finished_ts=Date.now();save();fs.writeFileSync(a.output,JSON.stringify(r,null,2)+'\n',{flag:'wx',mode:0o600});fs.closeSync(fd);globalThis.fetch=realFetch;}
console.log(JSON.stringify(r));
