import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const a=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const own=JSON.parse(fs.readFileSync('checkpoints/CLOUD_PHASE_STATE_20261004.json','utf8')).lease;
assert.equal(a.status,'ADMITTED_ONE_QUEUE_WAVE_CONNECTED_CASE_AND_BUILD');
assert(a.max_cases===1&&a.max_builds===1&&Date.now()<a.expires_ts&&a.expires_ts<=own.expires_ts&&a.own_lease.owner===own.owner&&!own.released);
for(const [p,h]of Object.entries(a.frozen_files))assert.equal(sha(fs.readFileSync(p)),h,p);
fs.writeFileSync(a.output+'.attempt',JSON.stringify({started_ts:Date.now(),market_HTTP:0,native_SQL:0,Telegram:0}),{flag:'wx',mode:0o600});
globalThis.fetch=()=>{throw Error('OFFLINE_CASE_NO_NETWORK');};
const {createPumpRunner}=await import('../../runtime/runner.mjs');
const {createPumpRunner:baselineRunner}=await import('../../.private/queue-wave-20261029/baseline/runtime/runner.mjs');
const {queueWaveMetadata,queueWaveState,queueWatchActive,candidatePriority}=await import('../../runtime/candidate-priority.mjs');
const {MemoryStore}=await import('../../runtime/store.mjs');
const {START_PROFILE:profile}=await import('../../profile/start-v1.mjs');
const {createReviewedNativeScopeRegistry}=await import('../../registry/native-reviewed550.mjs');
const {BINGX_IDENTITY_REGISTRY}=await import('../../registry/index.mjs');
const packet=JSON.parse(fs.readFileSync(a.actual_packet)),onPacket=JSON.parse(fs.readFileSync(a.actual_on_packet));
const qid='BINGX:USDT_M:101574:Q-USDT',oid='BINGX:USDT_M:101825:ON-USDT',T=packet.known_run.candidate_selection[0].as_of_ts;
const actualQueue=packet.requested_candidate_queue[qid],original=onPacket.known_candidates[0].private_evidence.original;
assert(actualQueue.active_wave&&actualQueue.reported_day_growth<0);
assert.deepEqual(original.analysis.reasons,['WAVE_LIFETIME_EXPIRED']);
const registry=createReviewedNativeScopeRegistry(BINGX_IDENTITY_REGISTRY);
const instruments=[qid,oid].map(id=>registry.resolve({native_symbol:id.split(':').at(-1)}).instrument);
// Exact Q queue observations are reused. The retained Q wave below is an
// explicit fixture, not a claim that an earlier analysis is the current DB PK.
const expired={...structuredClone(original.analysis.previous_wave),instrument_id:qid,wave_id:'ARTIFICIAL_Q_EXPIRED'};
const live={...structuredClone(expired),wave_id:'ARTIFICIAL_Q_NEW_PARTIAL_WRITE',state:'CALM_PULLBACK',created_ts:T-3600000,expires_ts:T-3600000+profile.wave_max_age_ms};
const meta=queueWaveMetadata(live,qid,T,profile);
assert.equal(queueWaveState(meta,T),'LIVE');assert(queueWatchActive({...meta,active_wave:false},T));
assert.equal(queueWaveState(meta,live.expires_ts),'EXPIRED');assert(!queueWatchActive({...meta,active_wave:true},live.expires_ts));
assert.equal(candidatePriority({...meta,price_expires_ts:live.expires_ts+1,entry_distance_pct:0},live.expires_ts).entry_proximity,0);
assert.equal(queueWaveMetadata({...live,instrument_id:oid},qid,T),null);
assert.equal(queueWaveState({...meta,wave_expires_ts:T+86400000},T),'UNKNOWN');

async function run(make,kind){
 let now=T,admissions=0,sourceCalls=[],waveReads=0,pairWrites=0,engineCalls=0;
 const store=new MemoryStore(),get=store.get.bind(store),pair=store.atomicPair.bind(store),atomic=store.atomic.bind(store);
 store.get=async key=>{if(key.startsWith('pump:wave:'))waveReads++;return get(key);};
 store.atomicPair=async(keys,change)=>{const result=await pair(keys,change);if(keys[0]==='pump:wave:'+qid||keys[0]==='pump:wave:'+oid)pairWrites++;return result;};
 const q={...structuredClone(actualQueue),entry_zones:[{lower:99,upper:101}],entry_distance_pct:0};
 if(kind==='EXPLICIT_EXPIRED')Object.assign(q,queueWaveMetadata(expired,qid,T));
 const rows={[qid]:q,[oid]:{instrument_id:oid,first_seen:T-60000,last_checked_ts:T-60000,next_check_ts:0,active_wave:false,entry_zones:[]}};
 await store.set('pump:candidate-queue',rows);await store.set('pump:active-instruments',[qid]);
 await store.set('pump:wave:'+qid,['LIVE_PARTIAL','PAIR_INTERRUPT'].includes(kind)?live:kind==='UNKNOWN'?{unbound:true}:expired);
 const oldSlot=Math.floor(T/60000)*60000-60000;
 await store.set('pump:overview-index',[oldSlot]);
 await store.set('pump:overview:'+oldSlot,[{id:qid,last:100/(1+actualQueue.preliminary_growth/100)},{id:oid,last:100}]);
 if(kind==='PAIR_INTERRUPT')store.atomic=async(key,change)=>{if(key==='pump:active-instruments')throw Error('ARTIFICIAL_DERIVED_HINT_WRITE_FAILURE');return atomic(key,change);};
 const sources={getCatalog:async()=>({instruments,unqualified:[],coverage:{status:'CHECKED'}}),
  getOverview:async({instruments:list})=>({coverage:{status:'CHECKED'},observations:list.map(i=>({instrument:i,reported_change_pct:i.instrument_id===qid?(kind==='NEW_GROWTH'?25:actualQueue.reported_day_growth):25,
   facts:{price:{status:'USABLE',instrument_id:i.instrument_id,value:100,unit:'USDT_PER_BASE',event_ts:now,received_ts:now,expires_ts:now+30000}}}))}),
  getCore:async({instrument})=>{sourceCalls.push(instrument.instrument_id);return {facts:{},coverage:{status:'ARTIFICIAL_NOT_MARKET'}};}};
 const budget={setMode:()=>{},admitCandidate:async()=>++admissions===1?{allowed:true}:{allowed:false,reason:'PROTECTED_DAY_RESERVE',detail:'ARTIFICIAL_ONE_CHECK_BOUND'},summary:()=>({total:0,lanes:{hot:0},limits:{manual_http_run_reserve:0,http_per_run:164,lanes:{hot:164}}})};
 const delivery={pending:async()=>[],drain:async()=>[],enqueue:()=>assert.fail('NO_READY_FIXTURE'),dispatch:()=>assert.fail('NO_SEND')};
 const runner=make({store,sources,budget,delivery,profile,clock:()=>now,analyzePump:input=>{engineCalls++;return {...structuredClone(original.analysis),instrument:input.instrument,analysis_ts:now,ready:false,automatic_eligible:false,next_wave:input.previous_wave,previous_wave:input.previous_wave,wave_state:input.previous_wave?.state??null,plan:null};},evaluateOutcome:()=>assert.fail('NO_OUTCOME')});
 const result=await runner.execute({mode:'AUTO',run_id:'ARTIFICIAL_QUEUE_WAVE_'+kind,publish:false});
 const saved=await get('pump:candidate-queue'),wave=await get('pump:wave:'+qid);
 if(kind==='PAIR_INTERRUPT'){
  assert(pairWrites>0);assert.equal(saved[qid].wave_id,wave.wave_id);assert.equal(saved[qid].wave_expires_ts,wave.expires_ts);
 }
 assert.deepEqual(wave,['LIVE_PARTIAL','PAIR_INTERRUPT'].includes(kind)?live:kind==='UNKNOWN'?{unbound:true}:expired,'WAVE_HISTORY_NOT_REWRITTEN');
 return {sourceCalls,waveReads,pairWrites,engineCalls,result,saved};
}
const baseline=await run(baselineRunner,'EXPIRED'),fixed=await run(createPumpRunner,'EXPIRED');
assert.equal(baseline.sourceCalls[0],qid);assert.equal(fixed.sourceCalls[0],oid);
assert.equal(fixed.saved[qid].active_wave,false);assert.equal(fixed.saved[qid].entry_distance_pct,null);
for(const kind of ['LIVE_PARTIAL','UNKNOWN','NEW_GROWTH','PAIR_INTERRUPT']){
 const result=await run(createPumpRunner,kind);assert.equal(result.sourceCalls[0],qid,kind);
 assert(result.waveReads<=6,'MAX4_LEGACY_PK_PLUS_CORE_AND_PAIR_READS');
}
const explicit=await run(createPumpRunner,'EXPLICIT_EXPIRED');assert.equal(explicit.sourceCalls[0],oid);
assert.equal(explicit.waveReads,2,'ONLY_CORE_AND_MEMORY_ATOMIC_PAIR_READ_NO_LEGACY_WAVE_READ');
assert.equal(sha(fs.readFileSync(a.actual_packet)),a.frozen_files[a.actual_packet]);
assert.equal(sha(fs.readFileSync(a.actual_on_packet)),a.frozen_files[a.actual_on_packet]);

const {buildArtifact}=await import('../../runtime/build.mjs');
const base=JSON.parse(fs.readFileSync(a.base_artifact)),modules={...base.modules};
for(const [name,path]of Object.entries(a.proposed_sources))modules[name]=fs.readFileSync(path,'utf8');
const legacy=a.artifact_output+'.legacy';fs.writeFileSync(legacy,base.modules['legacy-worker.mjs'],{flag:'wx',mode:0o600});
assert(!fs.existsSync(a.artifact_output));const manifest=buildArtifact({legacy_path:legacy,output_path:a.artifact_output,module_overrides:modules});
const artifactBytes=fs.readFileSync(a.artifact_output),artifact=JSON.parse(artifactBytes);
const changed=Object.keys(artifact.modules).filter(n=>artifact.modules[n]!==base.modules[n]).sort();
assert.deepEqual(changed,['runtime/candidate-priority.mjs','runtime/implementation-pin.mjs','runtime/runner.mjs']);
assert.equal(manifest.module_count,76);assert.deepEqual(artifact.metadata,base.metadata);
// Controller mock appended below; no credential or real Cloudflare access.

const template=fs.readFileSync(a.controller_template,'utf8'),accountId='70ee0af85191ea470e74c7383fdec772';
let mockModules=structuredClone(base.modules),mockControlCalls=0,mockMutations=0;
const settings={bindings:[{name:'PUMP_REPORT_ENABLED',type:'plain_text',text:'0'},{name:'PUMP_REPORT_DELIVERY_ENABLED',type:'plain_text',text:'1'},
  {name:'DATA_DB',type:'d1',id:'057a2847-2cc4-4e52-8534-1be1596d21d5'},...Array.from({length:18},(_,i)=>({name:'MOCK_KEEP_'+i,type:'plain_text',text:'UNCHANGED'}))],compatibility_date:'2026-09-11',compatibility_flags:[]};
const settingsBefore=structuredClone(settings),boundary='----QUEUE_WAVE_OFFLINE';
const multipart=value=>Object.entries(value).map(([name,text])=>'--'+boundary+'\r\nContent-Disposition: form-data; name="'+name+'"; filename="'+name+'"\r\nContent-Type: application/javascript+module\r\n\r\n'+text+'\r\n').join('')+'--'+boundary+'--\r\n';
const cloudflare={async request(request){
  mockControlCalls++;
  if(request.method==='GET')return {status:200,success:true,result:request.path.endsWith('/settings')?structuredClone(settings):request.path.endsWith('/schedules')?{schedules:request.path.includes('/my-report-2-hub/')?[{cron:'*/5 7-16 * * *'}]:[]}:multipart(mockModules)};
  assert.equal(request.method,'PUT');assert(request.path.endsWith('/my-report-2-hub/content'));assert.equal(request.rawBody,true);mockMutations++;
  const b=request.body.slice(0,request.body.indexOf('\r\n')),parts={};
  for(const part of request.body.split(b).slice(1,-1)){const split=part.indexOf('\r\n\r\n'),name=part.slice(0,split).match(/\bname="([^"]+)"/)[1];parts[name]=part.slice(split+4,-2);}
  assert.deepEqual(JSON.parse(parts.metadata),{main_module:'worker-entry.mjs'});delete parts.metadata;mockModules=parts;
  return {status:200,success:true,result:{}};
}};
const hashes=value=>Object.fromEntries(Object.entries(value).map(([name,text])=>[name,sha(text)]));
const controlConfig={action:'INSTALL',authority_main:a.authority_main,issued_ts:Date.now(),expires_ts:a.expires_ts,own_lease:a.own_lease,admin_HTTP_max:11,
  before_modules_sha256:hashes(base.modules),after_modules_sha256:hashes(artifact.modules),before_pin:a.base_live_pin,after_pin:manifest.implementation_pin.sha256,
  after_artifact_sha256:sha(artifactBytes),main_module:artifact.metadata.main_module,install_module_overrides:Object.fromEntries(changed.map(name=>[name,artifact.modules[name]])),
  quiescence:{state:'FINALIZED',observation_status:'QUIESCENT_CODE_UPDATE_ALLOWED',executor_owner:null,implementation_sha256:a.base_live_pin,observed_ts:Date.now()}};
const controller=Function('cloudflare','accountId','return ('+template.replace('__PUMP_CONFIG__',()=>JSON.stringify(controlConfig))+');')(cloudflare,accountId);
const controlProof=await controller();assert.equal(controlProof.state,'CONFIRMED_FULL',controlProof.error);
assert.deepEqual(mockModules,artifact.modules);assert.deepEqual(settings,settingsBefore);assert.equal(mockMutations,1);assert.equal(mockControlCalls,11);

assert(Date.now()<a.expires_ts);
const proof={schema:'ROOT_QUEUE_WAVE_CONNECTED_CASE_V1',status:'PASS',case_count:1,authority_main:a.authority_main,
 actual_Q_queue_reused:true,actual_ON_refusal_preserved:true,retained_Q_waves_are_explicit_fixtures_not_current_DB_proof:true,
 baseline_selected:baseline.sourceCalls[0],proposed_selected:fixed.sourceCalls[0],live_pullback_and_partial_write_recovery_PASS:true,
 unknown_not_dropped:true,expiry_equality_and_selector_clock_cross_PASS:true,new_growth_not_excluded:true,
 wave_queue_atomic_pair_and_derived_hint_failure_PASS:true,old_actual_originals_and_waves_unchanged:true,
 legacy_wave_PK_max_per_AUTO:4,extra_queue_PK_per_AUTO:1,no_extra_market_or_native_caps:true,
 artifact_path:a.artifact_output,artifact_sha256:sha(artifactBytes),implementation_sha256:manifest.implementation_pin.sha256,module_count:76,
 changed_modules:changed.map(name=>({name,sha256:sha(artifact.modules[name])})),unchanged_modules:73,
 controller_exact3_override_mock_FULL_PASS:true,mock_control_calls:mockControlCalls,mock_control_mutations:mockMutations,
 actual_native_SQL:0,actual_Cloudflare_HTTP:0,market_HTTP:0,Telegram:0,real_AUTO_delivery_proven:false,builds:1,installed:false};
fs.writeFileSync(a.output,JSON.stringify(proof,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(proof));
