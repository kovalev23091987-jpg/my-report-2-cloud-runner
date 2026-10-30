import fs from 'node:fs/promises';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,mkdirSync,renameSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const PREFIX='checkpoints/source-worker-unchanged-code-native-qualification-20261023';
const sha=b=>createHash('sha256').update(b).digest('hex');
const need=(v,code)=>{if(!v)throw Error(code);};
export async function runUnchangedCodeNativeQualificationConnected({repo_root}={}){
 const result={schema:'UNCHANGED_CODE_NATIVE_QUALIFICATION_CONNECTED_V1',status:'RUNNING',new_CONTROLLED_groups:[],old_accepted_components_replayed:0,Node_SPEC_tests_claimed:false,private_assembly:0,SQLite:0,CF:0,SQL:0,provider:0,MAIN:0,Telegram:0,fetch_attempts:0};
 const oldFetch=globalThis.fetch;let temp=null,error=null,output=null;
 globalThis.fetch=async()=>{result.fetch_attempts++;throw Error('NEW_GATE_CASE_NETWORK_FORBIDDEN');};
 try{
 need(typeof repo_root==='string'&&path.isAbsolute(repo_root),'EXACT_REPO_ROOT_REQUIRED');
 const root=await fs.realpath(repo_root),packet=path.join(root,PREFIX);
 const manifest=JSON.parse(await fs.readFile(path.join(packet,'manifest.json'),'utf8'));
 for(const [name,pin]of Object.entries(manifest.payloads)){
  need(!name.includes('..')&&!path.isAbsolute(name),'EXACT_PACKET_PATH_REQUIRED');
  const b=await fs.readFile(path.join(packet,name));need(b.length===pin.bytes&&sha(b)===pin.sha256,'EXACT_PACKET_BYTES_REQUIRED');
 }
 const pins=JSON.parse(await fs.readFile(path.join(packet,'target-bindings.json'),'utf8'));
 for(const [name,pin]of Object.entries(pins.targets)){
  const b=await fs.readFile(path.join(root,name));need(b.length===pin.after_bytes&&sha(b)===pin.after_sha256,'EXACT_PROPOSED_GATE_TARGET_REQUIRED');
 }
 for(const [name,pin]of Object.entries(pins.unchanged_dependencies)){
  const b=await fs.readFile(path.join(root,name));need(b.length===pin.bytes&&sha(b)===pin.sha256,'EXACT_GATE_DEPENDENCY_REQUIRED');
 }
 const CLI='tools/rollout-correlated-sql-bridge-20261022.mjs',source=await fs.readFile(path.join(root,CLI),'utf8');
 const native=source.slice(source.indexOf('export function createExistingActivationNativeControl('),source.indexOf('\nexport async function runExistingCorrelatedBridgeActivation()'));
 need(sha(Buffer.from(native.slice(native.indexOf(' function check('),native.indexOf(' async function freshGuard('))))===pins.preserved_native_check_body_sha256,'FRESH_CURRENT_OWNER_HEAD_GUARD_CHANGED');
 need(sha(Buffer.from(native.slice(native.indexOf(' async function cf('),native.indexOf('\n return{initialize'))))===pins.preserved_native_CF_body_sha256,'PER_CF_GUARD_OR_NATIVE_TRANSPORT_CHANGED');
 need(native.includes("gh.call('actions/runs/'+automatic_main_run)")&&!native.includes("gh.call('actions/runs?head_sha='+head")&&native.includes('verifyUnchangedNativeExecutionSnapshot({repo_root,current_head:head,qualified_head:accepted.head})'),'ACTUAL_INITIALIZE_BINDING_REQUIRED');
 const nativeWF=await fs.readFile(path.join(root,'.github/workflows/current-bridge-module-inspection-20261016.yml'),'utf8');
 need(nativeWF.includes('fetch-depth: '+'$'+'{{ inputs.execute_correlated_existing_activation && 8 || 1 }}')&&nativeWF.includes('AUTOMATIC_MAIN_RUN: '+'$'+'{{ inputs.automatic_main_run }}'),'BOUNDED_NATIVE_CHECKOUT_BINDING_REQUIRED');
 const ciPath='.github/workflows/liq-assembled-offline-20261012.yml',ci=await fs.readFile(path.join(root,ciPath),'utf8'),line="      - 'tools/rollout-correlated-sql-bridge-20261022.mjs'\n";
 need(ci.split(line).length===2&&sha(Buffer.from(ci.replace(line,'')))===pins.targets[ciPath].before_sha256,'ONLY_ONE_CI_PUSH_PATH_DELTA_REQUIRED');
  const app=await import(pathToFileURL(path.join(root,CLI)).href+'?gate='+pins.targets[CLI].after_sha256);
  const mirrors=await import(pathToFileURL(path.join(root,'runner/github-four-mirror-cas.mjs')).href);
  need(typeof app.verifyUnchangedNativeExecutionSnapshot==='function'&&typeof app.requireQualifiedAutomaticMain==='function','ACTUAL_NEW_GATE_EXPORTS_REQUIRED');
  temp=mkdtempSync(path.join(tmpdir(),'report2-new-native-gate-'));
  const env={...process.env,GIT_NO_LAZY_FETCH:'1',GIT_NO_REPLACE_OBJECTS:'1',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_AUTHOR_NAME:'Controlled gate fixture',GIT_AUTHOR_EMAIL:'fixture@example.invalid',GIT_COMMITTER_NAME:'Controlled gate fixture',GIT_COMMITTER_EMAIL:'fixture@example.invalid'};
  const git=(args,input)=>execFileSync('git',['--no-replace-objects','-c','core.commitGraph=false','-C',temp,...args],{input,timeout:2000,maxBuffer:4*1024*1024,env,stdio:['pipe','pipe','pipe']}).toString('utf8').trim();
  const put=(name,bytes)=>{mkdirSync(path.dirname(path.join(temp,name)),{recursive:true});writeFileSync(path.join(temp,name),bytes);};
  const mirrorPaths=['checkpoints/CLOUD_PHASE_STATE_20261004.json','checkpoints/CURRENT_PROJECT_STATUS.json','checkpoints/OWNER_REVIEW_RESUME_POINT_20261010.json','checkpoints/FULL_OWNER_TASK_REGISTER_20261007.json'];
  const proof='checkpoints/free-storage-20261016/sql-bridge-counter-release-38934007309.json';
  for(const name of pins.native_FS_paths){
   if(mirrorPaths.includes(name)||name.startsWith('checkpoints/native-qualification-gate-connected-20261023/qualification-'))put(name,Buffer.from('{"CONTROLLED_GIT_FIXTURE_CARRIER":true}\n'));
   else put(name,await fs.readFile(path.join(root,name)));
  }
  put('AGENTS.md',Buffer.from('CONTROLLED authority metadata\n'));
  for(const name of ['runtime-build/opaque.bundle.enc','runtime-build/recipe.json','runtime-build/overlay.mjs'])put(name,Buffer.from('CONTROLLED public marker, no private runtime\n'));
  git(['init','--initial-branch=main']);git(['add','--all']);git(['commit','-m','Controlled qualified snapshot']);const Q=git(['rev-parse','HEAD']);
  const verify=C=>app.verifyUnchangedNativeExecutionSnapshot({repo_root:temp,current_head:C,qualified_head:Q});
  const reset=C=>git(['reset','--hard',C]);
  const commit=()=>{git(['add','--all']);git(['commit','-m','Controlled new gate vector']);return git(['rev-parse','HEAD']);};
  const reject=async(fn,prefix)=>{let code=null;try{await fn();}catch(e){code=e.message;}need(typeof code==='string'&&code.startsWith(prefix),'EXPECTED_GATE_REFUSAL_'+prefix);return code;};
  const group=(name,variants,details)=>{need(result.fetch_attempts===0,'NETWORK_ATTEMPT_OBSERVED');result.new_CONTROLLED_groups.push({name,variants,completed:true,...details});};
  const wf={id:382366072,path:ciPath};
  const valid={id:12345678901,workflow_id:wf.id,path:ciPath,event:'push',head_branch:'main',run_attempt:1,status:'completed',conclusion:'success',head_sha:Q};
  const accepted=app.requireQualifiedAutomaticMain({automatic:valid,workflow:wf,requested_run:valid.id});need(accepted.head===Q,'EXACT_AUTOMATIC_RUN_NOT_BOUND');
  const invalids=[{id:valid.id+1},{workflow_id:1},{path:'.github/workflows/report2.yml'},{event:'workflow_dispatch'},{head_branch:'foreign'},{run_attempt:2},{status:'in_progress'},{conclusion:'failure'},{head_sha:'not-a-head'}];
  for(const delta of invalids)await reject(()=>app.requireQualifiedAutomaticMain({automatic:{...valid,...delta},workflow:wf,requested_run:valid.id}),'EXISTING_ACTIVATION_EXACT_AUTOMATIC_MAIN_REQUIRED');
  group('EXACT_AUTOMATIC_RUN_METADATA',10,{qualified_head:Q,untrusted_selector_is_not_admission:true});
  const same=await verify(Q);need(same.current_head===Q&&same.qualified_head===Q&&same.all_other_Git_paths_modes_and_blobs_equal===true,'IDENTICAL_HEAD_NOT_VERIFIED');
  const now=Date.now(),lease={owner:'CODEX:ACTIVE105_SOURCE_RELIABILITY:'+now,acquired_ts:now,expires_ts:now+80*60000,expected_main:'a'.repeat(40),scope:'OWNER_FIVE_ACTIVE_DIRECTIONS.CORRELATED_BRIDGE_EXISTING_VERSION_ACTIVATION_20261022. NO_RETRY_UNKNOWN_DEPLOY'};
  const active={owned_lease:lease.owner,owned_lease_expires_ts:lease.expires_ts,lease_released:false},phase={current_task:'ALL_ACTIVE105_SOURCE_EFFICIENCY_IN_PROGRESS',lease,latest_own_bounded_continuation_lease:lease,active_working_state:active};
  put(mirrorPaths[0],Buffer.from(JSON.stringify(phase)));for(const name of mirrorPaths.slice(1))put(name,Buffer.from(JSON.stringify({active_working_state:active})));
  put('AGENTS.md',Buffer.from('CONTROLLED approved metadata update\n'));const C=commit();
  const changed=await verify(C);need(Q!==C&&changed.authority_changed_paths.length===5&&lease.expected_main!==C,'AUTHORITY_ONLY_NEW_HEAD_NOT_VERIFIED');
  const context={head:C,raws:[...mirrorPaths.map(p=>readFileSync(path.join(temp,p),'utf8')),JSON.stringify({active:false}),JSON.stringify({latest_only:true})]};
  mirrors.assertMirrorOwner(context,lease.owner,now,lease.scope.split(' ')[0]);
  for(const altered of [
   {owner:'CODEX:ACTIVE105_SOURCE_RELIABILITY:1',time:now,raws:context.raws},
   {owner:lease.owner,time:lease.expires_ts,raws:context.raws},
   {owner:lease.owner,time:now,raws:[...context.raws.slice(0,4),JSON.stringify({active:true}),context.raws[5]]}
  ])await reject(()=>mirrors.assertMirrorOwner({...context,raws:altered.raws},altered.owner,altered.time,lease.scope.split(' ')[0]),'FOUR_');
  group('CURRENT_AUTHORITY_HEAD_AND_FRESH_OWNER',5,{same_head:true,metadata_only_head:true,qualified_head:Q,current_head:C,acquire_base_is_not_current_head:true,three_foreign_expired_fence_refusals:true});
  const helper='runner/github-bounded-phase-lease.mjs';
  put(helper,Buffer.concat([readFileSync(path.join(temp,helper)),Buffer.from('\n// CONTROLLED changed helper\n')]));const foreign=commit();await reject(()=>verify(foreign),'EXISTING_ACTIVATION_QUALIFIED_GIT_CODE_OR_PROOF_CHANGED');reset(C);
  put(helper,Buffer.concat([readFileSync(path.join(temp,helper)),Buffer.from('\n// CONTROLLED uncommitted helper\n')]));await reject(()=>verify(C),'EXISTING_ACTIVATION_NATIVE_EXECUTION_FILESYSTEM_CHANGED');reset(C);
  group('FOREIGN_HELPER_OUTSIDE_FIVE_TARGETS',2,{committed_and_uncommitted_actual_import_refused:true});
  for(const name of ['runtime-build/opaque.bundle.enc','runtime-build/recipe.json','runtime-build/overlay.mjs',proof,ciPath]){
   put(name,Buffer.concat([readFileSync(path.join(temp,name)),Buffer.from('\nCONTROLLED changed\n')]));const h=commit();await reject(()=>verify(h),'EXISTING_ACTIVATION_QUALIFIED_GIT_CODE_OR_PROOF_CHANGED');reset(C);
  }
  group('FROZEN_BUILD_INPUTS_PROOFS_AND_WORKFLOW',5,{no_private_decode_or_runtime_assembly:true});
  await reject(()=>app.verifyUnchangedNativeExecutionSnapshot({repo_root:temp,current_head:C,qualified_head:'1'.repeat(40)}),'EXISTING_ACTIVATION_FULL_LOCAL_GIT_OBJECT_REQUIRED');
  const tree=git(['rev-parse',Q+'^{tree}']),object=path.join(temp,'.git','objects',tree.slice(0,2),tree.slice(2)),hold=object+'.controlled-hold';
  renameSync(object,hold);try{await reject(()=>verify(C),'EXISTING_ACTIVATION_FULL_LOCAL_GIT_OBJECT_REQUIRED');}finally{renameSync(hold,object);}
  group('MISSING_COMPLETE_LOCAL_GIT_OBJECT',2,{no_network_fallback:true});
  put('checkpoints/foreign-proof.json',Buffer.from('{"CONTROLLED":true}\n'));const added=commit();await reject(()=>verify(added),'EXISTING_ACTIVATION_QUALIFIED_GIT_CODE_OR_PROOF_CHANGED');reset(C);
  git(['rm','AGENTS.md']);const removed=commit();await reject(()=>verify(removed),'EXISTING_ACTIVATION_QUALIFIED_GIT_CODE_OR_PROOF_CHANGED');reset(C);
  git(['update-index','--chmod=+x','AGENTS.md']);git(['commit','-m','Controlled forbidden authority mode']);const executable=git(['rev-parse','HEAD']);await reject(()=>verify(executable),'EXISTING_ACTIVATION_QUALIFIED_GIT_CODE_OR_PROOF_CHANGED');reset(C);
  group('INDIVIDUAL_AUTHORITY_ALLOWLIST',3,{directory_exemption_absent:true,deletion_and_mode_changes_refused:true});
  await reject(()=>app.verifyUnchangedNativeExecutionSnapshot({repo_root:temp,current_head:Q,qualified_head:Q}),'EXISTING_ACTIVATION_CURRENT_CHECKOUT_HEAD_REQUIRED');
  const consumer='tools/run-paid-sliding-history-20261018.mjs',backup=readFileSync(path.join(temp,consumer));rmSync(path.join(temp,consumer));symlinkSync(path.join(root,consumer),path.join(temp,consumer));
  await reject(()=>verify(C),'EXISTING_ACTIVATION_NATIVE_EXECUTION_REAL_FILE_REQUIRED');rmSync(path.join(temp,consumer));put(consumer,backup);
  put(proof,Buffer.concat([readFileSync(path.join(temp,proof)),Buffer.from('\nCONTROLLED uncommitted proof\n')]));await reject(()=>verify(C),'EXISTING_ACTIVATION_NATIVE_EXECUTION_FILESYSTEM_CHANGED');reset(C);
  rmSync(path.join(temp,proof));await reject(()=>verify(C),'EXISTING_ACTIVATION_NATIVE_EXECUTION_REAL_FILE_REQUIRED');reset(C);
  group('EXACT_CURRENT_CHECKOUT_AND_REAL_PROOF_FILES',4,{loaded_closure_actual_FS_verified:true,symlink_not_accepted:true,missing_actual_proof_refused:true});

  // ROOT connected caller control: same new helpers reached through ACTUAL initializer.
  const commonId=15001,automaticId=15002,executionId=15003,commonHead='c'.repeat(40),initClock=()=>now+10000;
  const nativePinPaths=['current-generation/files/runner-main.mjs','runner/report2-d1-adapter.mjs','runner/native-query-cost-journal.mjs','runner/sql-bridge-counter-repair.mjs','runner/cloudflare-version-bound-readback.mjs','runner/retention-bridge-provenance.mjs','tools/run-paid-sliding-history-20261018.mjs','tools/recover-lossless-retained-history-20261014.mjs','tools/rollout-correlated-sql-bridge-20261022.mjs','.github/workflows/current-bridge-module-inspection-20261016.yml'];
  const fixturePins=Object.fromEntries(nativePinPaths.map(p=>[p,sha(readFileSync(path.join(temp,p)))]));
  put('checkpoints/native-qualification-gate-connected-20261023/qualification-receipt.json',Buffer.from(JSON.stringify({run_id:commonId,head:commonHead,actual_SPEC_pass:1,actual_SPEC_fail:0,CONTROLLED_fixture_only:true})));
  put('checkpoints/native-qualification-gate-connected-20261023/qualification-scope.json',Buffer.from(JSON.stringify({files:fixturePins,CONTROLLED_fixture_only:true})));
  const initQ=commit();put('AGENTS.md',Buffer.from('CONTROLLED initializer metadata-only current head\n'));const initC=commit();
  const rawPaths=[...mirrorPaths,'audit-fixes/source-optimization-20260930/execution-lock.json','REPORT2_CURRENT_GENERATION.json'];
  const gitBlob=b=>createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex');
  let callerGH=0,callerCF=0;
  const fakeFetch=async(url,options={})=>{
   const u=new URL(url);if(u.origin!=='https://api.github.com'){callerCF++;throw Error('ROOT_CALLER_NATIVE_NETWORK_FORBIDDEN');}callerGH++;
   let reply;
   if(u.pathname==='/graphql'){
    const repo={id:'R_CONTROLLED_NEW_INITIALIZER',ref:{target:{oid:initC}},commit:{__typename:'Commit',oid:initC,tree:{oid:git(['rev-parse',initC+'^{tree}'])},parents:{nodes:[{oid:initQ}]}}};
    rawPaths.forEach((p,i)=>{const b=readFileSync(path.join(temp,p));repo['p'+i]={__typename:'Blob',oid:gitBlob(b),byteSize:b.length,isBinary:false};});reply={data:{repository:repo}};
   }else{
    const suffix=u.pathname.replace('/repos/kovalev23091987-jpg/my-report-2-cloud-runner/','');
    if(suffix==='actions/runs/'+commonId)reply={id:commonId,head_sha:commonHead,workflow_id:wf.id,status:'completed',conclusion:'success'};
    else if(suffix==='actions/workflows/liq-assembled-offline-20261012.yml')reply=wf;
    else if(suffix==='actions/runs/'+automaticId)reply={...valid,id:automaticId,head_sha:initQ};
    else if(suffix==='actions/runs/'+executionId)reply={id:executionId,head_sha:initC,head_branch:'main',path:'.github/workflows/current-bridge-module-inspection-20261016.yml',event:'workflow_dispatch',run_attempt:1,status:'in_progress',run_started_at:new Date(initClock()-1000).toISOString()};
    else throw Error('ROOT_CALLER_UNEXPECTED_GITHUB_ROUTE');
   }
   return new Response(JSON.stringify(reply),{status:200,headers:{'content-type':'application/json'}});
  };
  const caller=app.createExistingActivationNativeControl({repo_root:temp,head:initC,owner:lease.owner,github_token:'CONTROLLED_GITHUB_TOKEN',cloudflare_token:'CONTROLLED_CF_TOKEN',fetch_impl:fakeFetch,clock:initClock});
  const got=await caller.initialize({connected_run:String(commonId),execution_run:String(executionId),automatic_main_run:String(automaticId)}),cm=caller.metrics();
  need(got.owner===lease.owner&&cm.code_qualification?.qualified_head===initQ&&cm.code_qualification?.current_head===initC&&callerGH===5&&callerCF===0&&cm.github_HTTP===5&&cm.cloudflare_HTTP===0,'ROOT_ACTUAL_INITIALIZER_FLOW_NOT_BOUND');
  group('ROOT_ACTUAL_INITIALIZER_METADATA_ONLY_FLOW',1,{CONTROLLED_metadata_only:true,actual_public_initializer_called:true,actual_Git_snapshot:true,actual_source_FS_and_pins:true,current_head:initC,qualified_head:initQ,GH_controlled_calls:callerGH,CF_calls:callerCF,not_native_admission:true});

  need(result.new_CONTROLLED_groups.length===8,'EXACT_NEW_GATE_GROUP_COUNT_REQUIRED');
  result.status='QUALIFIED_NEW_CONTROLLED_GATE_ONLY';result.actual_new_CONTROLLED_groups=8;result.actual_new_CONTROLLED_variants=result.new_CONTROLLED_groups.reduce((n,x)=>n+x.variants,0);result.no_old_component_replay=true;result.qualification_is_not_native_admission=true;output=result;
 }catch(e){error=e;}
 finally{
  try{if(temp)rmSync(temp,{recursive:true,force:true});}catch(e){if(!error)error=e;}
  finally{globalThis.fetch=oldFetch;}
 }
 if(error){error.partial_result={...result,status:'PARTIAL_NEW_CONTROLLED_GATE',actual_completed_new_gate_groups:result.new_CONTROLLED_groups.length,actual_completed_new_gate_variants:result.new_CONTROLLED_groups.reduce((n,x)=>n+x.variants,0),cleanup_attempted:true,global_fetch_restored:globalThis.fetch===oldFetch};throw error;}
 output.cleanup_removed=true;output.global_fetch_restored=globalThis.fetch===oldFetch;return output;
}
