// ONE NEW callable, author UNEXECUTED. No registration/autorun/old case exports.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const PREFIX='checkpoints/correlated-bridge-existing-version-activation-connected-20261022/activation-case',NOW=1792689000000,HEAD='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',OP='11111111-1111-4111-8111-111111111111',OWN='22222222-2222-4222-8222-222222222222',RESTORED='33333333-3333-4333-8333-333333333333',FOREIGN='44444444-4444-4444-8444-444444444444';
const sha=b=>createHash('sha256').update(b).digest('hex'),json=p=>JSON.parse(fs.readFileSync(p,'utf8'));
async function load({repo_root}){
 const repo=fs.realpathSync(repo_root),pkg=path.join(repo,PREFIX),pins=json(path.join(pkg,'target-pins.json')),deps=json(path.join(pkg,'dependencies.json')),binding=json(path.join(pkg,'source-binding.json'));
 for(const x of json(path.join(pkg,'manifest.json')).payloads){const b=fs.readFileSync(path.join(pkg,x.path));assert.equal(b.length,x.bytes);assert.equal(sha(b),x.sha256);}
 for(const [p,h]of Object.entries(deps.repo_pins))assert.equal(sha(fs.readFileSync(path.join(repo,p))),h);
 for(const [p,x]of Object.entries(pins.targets)){const b=fs.readFileSync(path.join(repo,p));assert.equal(b.length,x.after_bytes);assert.equal(sha(b),x.after_sha256);assert.deepEqual(b,fs.readFileSync(path.join(pkg,x.proposed)));}
 assert.equal(sha(fs.readFileSync(path.join(repo,binding.module_path))),binding.module_sha256);for(const [p,h]of Object.entries(binding.consumer_sha256))assert.equal(sha(fs.readFileSync(path.join(repo,p))),h);
 const tool=fs.readFileSync(path.join(repo,pins.tool_path));assert.equal(sha(tool.subarray(0,pins.old_body_prefix_bytes)),pins.old_body_prefix_sha256);
 for(const p of pins.append_order)assert.equal(tool.toString().split(fs.readFileSync(path.join(pkg,p),'utf8').trimEnd()).length,2,'EXACT_NEW_BODY_ONCE_IN_ACTUAL_TOOL');
 // All pins precede imports. Maintenance scripts and full runtime are never imported.
 const cli=await import(pathToFileURL(path.join(repo,pins.tool_path)).href),paid=await import(pathToFileURL(path.join(repo,binding.module_path)).href),rollout=await import(pathToFileURL(path.join(repo,'runner/htx-coordinated-rollout.mjs')).href),reader=await import(pathToFileURL(path.join(repo,'runner/cloudflare-version-bound-readback.mjs')).href),inspect=await import(pathToFileURL(path.join(repo,'runner/installed-bridge-module-inspection.mjs')).href),repair=await import(pathToFileURL(path.join(repo,'runner/sql-bridge-counter-repair.mjs')).href);
 for(const n of ['activateExistingCorrelatedBridge','createExistingCorrelatedActivationNativeAdapter','createExistingActivationNativeControl','existingActivationDeadlineResponse'])assert.equal(typeof cli[n],'function');
 const text=fs.readFileSync(path.join(pkg,'activation-control.mjs.txt'),'utf8'),core=text.slice(text.indexOf('export async function activateExistingCorrelatedBridge('),text.indexOf('\n\nexport function createExistingCorrelatedActivationNativeAdapter(')),adapter=text.slice(text.indexOf('export function createExistingCorrelatedActivationNativeAdapter('));
 assert.equal(sha(core),pins.core_function_sha256);assert.equal(sha(adapter),pins.adapter_function_sha256);
 const literal=text.slice(text.indexOf('const EXISTING_ACTIVATION_IDENTITIES='),text.indexOf('\nexport async function activateExistingCorrelatedBridge(')),I=Function(literal+';return EXISTING_ACTIVATION_IDENTITIES;')();
 const original=repair.repairExactInstalledSQLBridge(fs.readFileSync(path.join(repo,'current-generation/tests/fixtures/actual-d1-bridge-20261008.mjs'),'utf8')).source,next=repair.addExactSQLBridgeCostCorrelation(original).source;assert.equal(sha(next),I.new_module);
 return{repo,pkg,pins,deps,binding,cli,paid,rollout,reader,inspect,I,next,core,adapter};
}
export async function runExistingBridgeActivationLateRepairConnected(args){
 const previousFetch=globalThis.fetch,groups=[],outputs=[],temporary=[];let api,uncontrolled=0;globalThis.fetch=async()=>{uncontrolled++;throw Error('UNCONTROLLED_NATIVE_NETWORK_DENIED');};
 const add=(name,variants=1)=>groups.push({name,variants,status:'NEW_EXISTING_ACTIVATION_CONTROLLED_ASSERTIONS_COMPLETED'});
 const remember=(name,f,r)=>{const m=f.control.metrics();outputs.push({name,status:r?.status??'INITIALIZATION_REFUSED',reason:r?.reason??null,CF:m.cloudflare_HTTP,GH:m.github_HTTP,whole_used:m.whole_HTTP.used,forward_POST:m.forward_attempts,rollback_POST:m.rollback_attempts,known_forward_ACK:r?.known_activation_ACK??false,activation_ownership_verified:r?.activation_ownership_verified??false,rollback_status:r?.rollback?.status??null,rollback_ownership_verified:r?.rollback?.ownership_verified??false,proof_sha256:r?sha(JSON.stringify(r)):null,saved_statuses:f.saved.map(x=>x.status),transport_intents:f.intents.length});};
 try{
  api=await load(args);const digest=api.rollout.rolloutDigest;
  async function fixture(mode={}){
   const root=fs.mkdtempSync(path.join(os.tmpdir(),'report2-existing-activation-'));temporary.push(root);
   const copyPaths=new Set([...Object.keys(api.deps.repo_pins),...Object.keys(api.pins.targets),api.binding.module_path,...Object.keys(api.binding.consumer_sha256),api.paid.RETENTION_SQL_BRIDGE_PROOF.path,api.paid.CORRELATED_RETENTION_SQL_BRIDGE_PROOF.path]);
   for(const p of copyPaths){fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.copyFileSync(path.join(api.repo,p),path.join(root,p));}
   let now=NOW;const acquired=NOW-1000,owner='CODEX:ACTIVE105_SOURCE_RELIABILITY:'+acquired,scope='OWNER_FIVE_ACTIVE_DIRECTIONS.CORRELATED_BRIDGE_EXISTING_VERSION_ACTIVATION_20261022. NO_RETRY_UNKNOWN_DEPLOY CONTROLLED_ONLY',lease={owner,acquired_ts:acquired,expires_ts:NOW+3600000,expected_main:api.pins.base_main,scope};assert.notEqual(lease.expected_main,HEAD,'ACQUIRE_BASE_IS_NOT_LATER_QUALIFIED_CODE_HEAD');
   if(mode.foreignOwner){lease.acquired_ts=NOW-2000;lease.owner='CODEX:ACTIVE105_SOURCE_RELIABILITY:'+lease.acquired_ts;}
   const activeState={owned_lease:lease.owner,owned_lease_expires_ts:lease.expires_ts,lease_released:false};
   const paths=['checkpoints/CLOUD_PHASE_STATE_20261004.json','checkpoints/CURRENT_PROJECT_STATUS.json','checkpoints/OWNER_REVIEW_RESUME_POINT_20261010.json','checkpoints/FULL_OWNER_TASK_REGISTER_20261007.json','audit-fixes/source-optimization-20260930/execution-lock.json','REPORT2_CURRENT_GENERATION.json'];
   const raw=[{current_task:'ALL_ACTIVE105_SOURCE_EFFICIENCY_IN_PROGRESS',lease,latest_own_bounded_continuation_lease:lease,active_working_state:activeState},...Array.from({length:3},()=>({active_working_state:activeState})),{active:false},{latest_only:true}].map(x=>JSON.stringify(x));
   paths.forEach((p,i)=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),raw[i]);});
   const qualification='checkpoints/correlated-bridge-existing-version-activation-connected-20261022';fs.mkdirSync(path.join(root,qualification),{recursive:true});
   fs.writeFileSync(path.join(root,qualification,'qualification-receipt.json'),JSON.stringify({run_id:1001,head:HEAD,actual_SPEC_pass:1,actual_SPEC_fail:0}));
   const qPaths=['current-generation/files/runner-main.mjs','runner/report2-d1-adapter.mjs','runner/native-query-cost-journal.mjs','runner/sql-bridge-counter-repair.mjs','runner/cloudflare-version-bound-readback.mjs','runner/retention-bridge-provenance.mjs','tools/run-paid-sliding-history-20261018.mjs','tools/recover-lossless-retained-history-20261014.mjs',api.pins.tool_path,api.pins.workflow_path];
   fs.writeFileSync(path.join(root,qualification,'qualification-scope.json'),JSON.stringify({files:Object.fromEntries(qPaths.map(p=>[p,sha(fs.readFileSync(path.join(root,p)))]))}));
   const runtime={compatibility_date:'2026-10-22',compatibility_flags:[],usage_model:'standard',limits:{}},bindings=[{name:'DATA_DB',type:'d1',id:'057a2847-2cc4-4e52-8534-1be1596d21d5'},{name:'REPORT2_CLOUD_BRIDGE_TOKEN',type:'secret_text'},{name:'REPORT2_DENO_BRIDGE_TOKEN',type:'secret_text'}];
   let settings={bindings,observability:{enabled:false},CONTROLLED_ONLY:'NOT_NATIVE_PRIVATE_SETTINGS'},active=api.I.old_version,deployment=api.I.old_deployment,latest=api.I.new_version,postRead=0,cfCalls=0,ghCalls=0,forward=0,rollback=0,cancelled=0;
   const version=id=>({id,resources:{bindings,script_runtime:runtime,script:{etag:id===api.I.old_version?api.I.old_etag:id===api.I.new_version?api.I.new_etag:'f'.repeat(64)}}});
   const controlledI={...api.I,settings:api.rollout.workerSettingsFingerprint(api.rollout.selectedVersionSettings(settings,version(active))),runtime:digest(runtime)},controlledOld={...api.paid.RETENTION_SQL_BRIDGE_PROOF,settings_sha256:controlledI.settings};
   // EXACT actual new core/factory BODY. Only expected settings/runtime fingerprints
   // differ in these fixture dependencies. Real Source FS attestation is retained.
   const runCore=Function('fs','activationPath','attestRetentionSQLBridgeCompatibility','EXISTING_ACTIVATION_IDENTITIES','EXISTING_ACTIVATION_SOURCE_BINDING','rolloutDigest',api.core.replace('export async function','async function')+'\nreturn activateExistingCorrelatedBridge;')(fsp,path,api.paid.attestRetentionSQLBridgeCompatibility,controlledI,{module_path:api.binding.module_path,module_sha256:api.binding.module_sha256,consumer_sha256:api.binding.consumer_sha256},digest);
   const makeAdapter=Function('EXISTING_ACTIVATION_IDENTITIES','createVersionBoundWorkerReader','SQL_BRIDGE_SCRIPT','observeRetentionSQLBridge','RETENTION_SQL_BRIDGE_PROOF','singleActiveVersion','selectedVersionSettings','workerSettingsFingerprint','rolloutDigest','correlatedLogsIntent',api.adapter.replace('export function','function')+'\nreturn createExistingCorrelatedActivationNativeAdapter;')(controlledI,api.reader.createVersionBoundWorkerReader,api.inspect.SQL_BRIDGE_SCRIPT,api.paid.observeRetentionSQLBridge,controlledOld,api.rollout.singleActiveVersion,api.rollout.selectedVersionSettings,api.rollout.workerSettingsFingerprint,digest,api.cli.correlatedLogsIntent);
   const effective=api.rollout.selectedVersionSettings(settings,version(active)),expectedProjection=api.rollout.workerSettingsFingerprint({...effective,observability:{enabled:true,head_sampling_rate:1,logs:{enabled:true,head_sampling_rate:1,invocation_logs:false,persist:true,destinations:['cloudflare']}}});
   const requests=[],saved=[],intents=[];
   const ok=x=>new Response(JSON.stringify(x),{headers:{'content-type':'application/json'}});
   const nativeResult=x=>ok({success:true,result:x});
   const snapshot=()=>({data:{repository:{id:'CONTROLLED_REPO',ref:{target:{oid:mode.currentHeadMoved?'c'.repeat(40):HEAD}},commit:{__typename:'Commit',oid:HEAD,tree:{oid:'b'.repeat(40)}},...Object.fromEntries(raw.map((s,i)=>['p'+i,{__typename:'Blob',isBinary:false,byteSize:Buffer.byteLength(s),oid:createHash('sha1').update(Buffer.concat([Buffer.from('blob '+Buffer.byteLength(s)+'\0'),Buffer.from(s)])).digest('hex')}]))}}});
   let control;
   async function fetchImpl(url,opt={}){
    const u=new URL(url);
    if(u.hostname==='api.github.com'){
     ghCalls++;if(url==='https://api.github.com/graphql'){assert.equal(opt.method,'POST');assert.ok(!opt.body.includes('mutation'));requests.push({kind:'GH_SNAPSHOT'});return ok(snapshot());}
     requests.push({kind:'GH_METADATA',path:u.pathname});assert.equal(opt.method,'GET');
     if(u.pathname.endsWith('/actions/runs/1001'))return ok({id:1001,head_sha:HEAD,workflow_id:77,status:'completed',conclusion:'success'});
     if(u.pathname.endsWith('/actions/workflows/liq-assembled-offline-20261012.yml'))return ok({id:77});
     if(u.pathname.endsWith('/actions/runs')&&u.search.includes('head_sha='))return ok({workflow_runs:[{workflow_id:77,event:'push',head_sha:HEAD,status:'completed',conclusion:'success'}]});
     if(u.pathname.endsWith('/actions/runs/2002')){
      if(mode.bodyTimeout)return new Response(new ReadableStream({start(c){c.enqueue(Buffer.from('{'));},cancel(){cancelled++;}}),{headers:{'content-type':'application/json'}});
      return ok({id:2002,head_sha:mode.runHeadWrong?'c'.repeat(40):HEAD,head_branch:'main',path:'.github/workflows/current-bridge-module-inspection-20261016.yml',event:'workflow_dispatch',run_attempt:1,status:'in_progress',...(mode.runStartMissing?{}:{run_started_at:new Date(NOW-(mode.jobTailLow?210000:10000)).toISOString()})});
     }
     throw Error('CONTROLLED_UNEXPECTED_GITHUB_ROUTE');
    }
    assert.equal(u.hostname,'api.cloudflare.com');assert.ok(requests.filter(x=>x.kind==='GH_SNAPSHOT').length>=cfCalls+2,'DISTINCT_INITIAL_PLUS_PER_CF_SNAPSHOT_ATTEMPTS_ALLOW_PARALLEL_METADATA_INTERLEAVING');
    cfCalls++;const route=u.pathname.endsWith('/workers/subdomain')?'/subdomain':u.pathname.split('/scripts/'+api.inspect.SQL_BRIDGE_SCRIPT)[1]+u.search,method=opt.method??'GET';requests.push({kind:'CF',method,route});
    if(method==='POST'){
     assert.equal(route,'/deployments');const b=JSON.parse(opt.body),target=b.versions[0].version_id;assert.equal(b.strategy,'percentage');assert.equal(b.versions.length,1);assert.equal(b.versions[0].percentage,100);assert.equal(intents.length,forward+rollback+1);assert.equal(intents.at(-1).request_JSON_sha256,digest(b));
     if(target===api.I.new_version){forward++;assert.equal(forward,1);assert.equal(saved.at(-1).intent.target_version,api.I.new_version);assert.equal(saved.at(-1).activation_attempts,0);if(mode.unknownBefore)throw Error('CONTROLLED_PRIVATE_TRANSPORT_ERROR');active=target;deployment=OWN;if(mode.unknownAfter)throw Error('CONTROLLED_PRIVATE_TRANSPORT_ERROR');}
     else{assert.equal(target,api.I.old_version);rollback++;assert.equal(rollback,1);assert.equal(saved.at(-1).rollback.intent.only_own_deployment,OWN);assert.equal(deployment,OWN);if(mode.rollbackUnknownBefore)throw Error('CONTROLLED_PRIVATE_TRANSPORT_ERROR');active=target;deployment=RESTORED;if(mode.rollbackUnknownAfter)throw Error('CONTROLLED_PRIVATE_TRANSPORT_ERROR');}
     return nativeResult({id:deployment,strategy:'percentage',versions:[{version_id:active,percentage:100}]});
    }
    assert.equal(method,'GET');
    if(route==='/subdomain')return nativeResult({subdomain:'controlled'});
    if(route==='/deployments'){
     if(forward&&!rollback){postRead++;if(mode.foreignPost){active=FOREIGN;deployment=FOREIGN;}if(mode.latestPost)latest=FOREIGN;if(mode.settingsPost)settings={...settings,observability:{enabled:true}};}
     return nativeResult({deployments:[{id:deployment,strategy:'percentage',versions:[{version_id:active,percentage:100}]}]});
    }
    if(route==='/settings')return nativeResult(settings);
    if(route==='/schedules')return nativeResult([]);
    if(route.startsWith('/versions/')&&route!=='/versions?per_page=1')return nativeResult(version(route.slice('/versions/'.length)));
    if(route==='/versions?per_page=1'){
     if(forward&&!rollback&&postRead===1&&(mode.postLastReadLost||mode.rollbackUnknownBefore||mode.rollbackUnknownAfter))throw Error('CONTROLLED_PRIVATE_POSTFLIGHT_ERROR');
     if(mode.expireBeforePOST&&cfCalls===16)now=NOW+3590000;
     return nativeResult({items:[{id:mode.foreignStaged&&!forward?FOREIGN:latest}]});
    }
    if(route==='/content/v2')return new Response(Buffer.from(mode.wrongModule?'CONTROLLED_WRONG_NATIVE_CODE':api.next),{headers:{'content-type':'application/javascript'}});
    throw Error('CONTROLLED_UNEXPECTED_CF_ROUTE');
   }
   control=api.cli.createExistingActivationNativeControl({repo_root:root,head:HEAD,owner,github_token:'CONTROLLED_GITHUB_TOKEN',cloudflare_token:'CONTROLLED_CF_TOKEN',fetch_impl:fetchImpl,clock:()=>now});
   async function initialize(){return control.initialize({connected_run:1001,execution_run:2002});}
   async function run(production=false){
    const l=await initialize();if(mode.consumerTamper)fs.appendFileSync(path.join(root,Object.keys(api.binding.consumer_sha256)[0]),'\n// CONTROLLED_TAMPER\n');if(mode.moduleTamper)fs.appendFileSync(path.join(root,api.binding.module_path),'\n// CONTROLLED_TAMPER\n');
    const options={cf:control.cf,configured_bridge_url:'https://my-report-2-d1-bridge.controlled.workers.dev/d1',saveTransportIntent:async x=>{intents.push(structuredClone(x));}},adapter=production?api.cli.createExistingCorrelatedActivationNativeAdapter(options):makeAdapter(options);
    return (production?api.cli.activateExistingCorrelatedBridge:runCore)({plan:{head:HEAD,owner,operation_id:OP,lease_expires_ts:l.expires_ts},repo_root:root,adapter,guard:control.guard,save:async x=>{saved.push(structuredClone(x));if(mode.intentSaveFails&&x.status==='EXISTING_ACTIVATION_DEPLOY_INTENT')throw Error('CONTROLLED_PRIVATE_SAVE_ERROR');},clock:()=>now});
   }
   return{control,initialize,run,requests,saved,intents,stats:()=>({cfCalls,ghCalls,forward,rollback,cancelled}),root,expectedProjection,lease};
  }
  const safe=(f,r)=>{const m=f.control.metrics();assert.ok(f.requests.filter(x=>x.kind==='GH_SNAPSHOT').length>=f.stats().cfCalls+1,'ONE_INITIAL_PLUS_DISTINCT_PER_CF_GUARD_ATTEMPTS');assert.equal(m.cloudflare_HTTP,f.stats().cfCalls);assert.equal(m.github_HTTP,f.stats().ghCalls);assert.ok(m.cloudflare_HTTP<=33&&m.github_HTTP<=40);assert.ok(m.whole_HTTP.remaining>=24);assert.ok(Buffer.byteLength(JSON.stringify(r))<=24576);assert.equal(JSON.stringify(r).includes('CONTROLLED_PRIVATE'),false);for(const k of ['upload_attempts','settings_mutations','delete_attempts','native_SQL','Worker_invocations','sourceHTTP','MAIN','Telegram'])assert.equal(r[k],0);assert.equal(r.old_unknown_recovered,false);assert.equal(r.logging_settings_changed,false);assert.ok(f.requests.filter(x=>x.kind==='CF').every(x=>x.method==='GET'||x.method==='POST'&&x.route==='/deployments'));};
  let f;
  f=await fixture({bodyTimeout:true});const keepAlive=setTimeout(()=>{},4000);try{await assert.rejects(f.initialize(),{message:'GITHUB_CONTROL_REPLY_UNKNOWN'});}finally{clearTimeout(keepAlive);}remember('GH_stream_body_deadline',f,null);assert.equal(f.stats().cfCalls,0);assert.equal(f.stats().cancelled,1);assert.equal(f.control.metrics().github_HTTP,5);
  const earlier=new AbortController();earlier.abort();let earlierFetch=0;await assert.rejects(api.cli.existingActivationDeadlineResponse(async()=>{earlierFetch++;return new Response('{}');},'https://example.invalid',{signal:earlier.signal}));assert.equal(earlierFetch,0);add('ACTUAL_2S_BODY_TIMEOUT_CANCELS_STREAM_AND_PRESERVES_EARLIER_ABORT',2);
  const w=fs.readFileSync(path.join(api.repo,api.pins.workflow_path),'utf8'),tool=fs.readFileSync(path.join(api.repo,api.pins.tool_path),'utf8');assert.ok(w.includes('execute_correlated_existing_activation: {type: boolean, default: false}'));assert.ok(w.includes('timeout-minutes: 5'));assert.ok(w.includes('Refuse mixed existing-version activation and other bridge modes'));assert.ok(w.includes('path: audit-output/bridge-existing-version-activation/'));assert.ok(tool.includes('execution_run:process.env.GITHUB_RUN_ID'));assert.ok(tool.includes('activateExistingCorrelatedBridge({plan:'));assert.equal(uncontrolled,0);add('NATIVE_ENTRY_CALLS_EXACT_NEW_CONTROL_FACTORY_DEFAULTFALSE_EXCLUSIVE_WORKFLOW_TEXT_ONLY');
  assert.equal(groups.length,2);
  return{schema:'EXISTING_CORRELATED_BRIDGE_ACTIVATION_FAILED_TAIL_REPAIR_V1',status:'FAILED_TAIL_REPAIR_CONTROLLED_COMPLETED',controlled_groups:groups.length,nested_variants:groups.reduce((n,x)=>n+x.variants,0),groups,outputs,binding:{all_actual_target_and_dependency_pins_before_imports:true,actual_real_SOURCE_filesystem_attestation:true,actual_bounded_native_control_factory_export:true,actual_native_adapter_and_core_BODY_sha_bound:true,whole_entry_initial1_qualification3_execution1_everyCF_final1_included:true,old_qualified_CLI_body_bytes:api.pins.old_body_prefix_bytes,old_body_unchanged:true},actual_production_export_negative_distinct_from_CONTROLLED_BODY_positive:true,CONTROLLED_expected_settings_and_runtime_NOT_native_Paid_preimage:true,no_production_expected_override:true,no_response_result_shim:true,workflow_and_native_environment_mode_checked_as_text_not_dispatched:true,native_CF:0,native_SQL:0,provider_HTTP:0,MAIN:0,Telegram:0,old_components_replayed:0,native_activation_or_logging_or_SAVING_or_report_or_SENT_qualified:false,platform_jobkill_or_global_crash_durable_once_qualified:false,author_semantics:0};
 }catch(error){error.completed_new_existing_activation_groups=groups;error.completed_new_existing_activation_outputs=outputs;throw error;}
 finally{try{for(const p of temporary)fs.rmSync(p,{recursive:true,force:true});}finally{globalThis.fetch=previousFetch;}}
}
