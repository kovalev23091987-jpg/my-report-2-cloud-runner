import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const sha=value=>createHash('sha256').update(value).digest('hex');
const admission=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const own=JSON.parse(fs.readFileSync('checkpoints/CLOUD_PHASE_STATE_20261004.json','utf8')).lease;
if(admission.status!=='ADMITTED_ONE_PRICE_STRUCTURE_CONNECTED_CASE_AND_BUILD'||admission.max_cases!==1||admission.max_builds!==1||Date.now()>=admission.expires_ts||admission.expires_ts>own.expires_ts||own.owner!==admission.own_lease.owner||own.released)throw Error('CASE_ADMISSION');
for(const [path,digest] of Object.entries(admission.frozen_files))assert.equal(sha(fs.readFileSync(path)),digest,'FROZEN:'+path);
fs.writeFileSync(admission.output+'.attempt',JSON.stringify({authority_main:admission.authority_main,started_ts:Date.now()}),{flag:'wx',mode:0o600});
globalThis.fetch=()=>{throw Error('OFFLINE_ONLY_NO_MARKET_OR_NATIVE_OR_TELEGRAM');};
const {analyzePump}=await import('../../analytics/index.mjs');
const {createDayGrowthLoader}=await import('../../sources/day-growth.mjs');
const {createNativeRelativeCandleQualification}=await import('../../sources/native-relative-qualification.mjs');
const {MemoryStore}=await import('../../runtime/store.mjs');
const {createDelivery,textHash}=await import('../../runtime/delivery.mjs');
const {PRICE_STRUCTURE_BOUNDS}=await import('../../contracts/index.mjs');
const originalBytes=fs.readFileSync(admission.original_packet),packet=JSON.parse(originalBytes);
const q=packet.requested_analyses.find(x=>x.instrument_id.endsWith(':Q-USDT')).original;
const ain=packet.requested_analyses.find(x=>x.instrument_id.endsWith(':AIN-USDT')).original;
let engineCalls=0,sourceMockCalls=0,senderMockCalls=0;
const analyze=input=>{engineCalls++;return analyzePump(structuredClone(input));};
const stable=a=>({ready:a.ready,status:a.status,reasons:a.reasons,automatic_eligible:a.automatic_eligible,current_threshold_passed:a.current_threshold_passed,
  growth_windows:a.growth_windows,activity:a.activity,next_wave:a.next_wave,plan:a.plan,liquidity:a.liquidity});
const qb=analyze(q.input),ab=analyze(ain.input);
assert.deepEqual(stable(qb),stable(q.analysis),'ACTUAL_Q_CORE_ONLY_DECISION_UNCHANGED');
assert.deepEqual(stable(ab),stable(ain.analysis),'ACTUAL_AIN_CORE_ONLY_DECISION_UNCHANGED');

// These earlier rows are deliberately synthetic, never a reconstruction of Q.
// The observed CORE tail is copied without modifying its OHLC or volume.
const originalDay=q.input.facts.growth_24h,day=originalDay.value,step=60000;
const coreByTime=new Map(q.input.facts.candles.value.map(row=>[row.open_ts,row]));
const body={code:0,data:Array.from({length:1440},(_,index)=>{
  const time=day.start_ts+index*step,core=coreByTime.get(time);
  if(core)return {time,open:core.open,high:core.high,low:core.low,close:core.close,volume:'IGNORED_UNKNOWN_QUANTITY'};
  const close=0.058+0.0001*Math.sin(index),open=index===0?day.open:0.058;
  return {time,open,high:index===500?0.08:Math.max(open,close)+0.00005,low:Math.min(open,close)-0.00005,close,volume:'NOT_A_UNIT'};
})};
const entry={instrument:structuredClone(q.input.instrument),qualifications:{candles:createNativeRelativeCandleQualification(q.input.instrument)}};
const load=async wire=>{
  let clockAt=day.end_ts+100;
  const loader=createDayGrowthLoader({clock:()=>clockAt,resolveEntry:()=>structuredClone(entry),broker:{async request(request){
    sourceMockCalls++;assert.equal(request.estimated_cost.http,1);assert.equal(new URL(request.url).searchParams.get('limit'),'1440');
    clockAt=originalDay.received_ts;
    return {ok:true,status:200,data:structuredClone(wire),received_ts:originalDay.received_ts,receipt_id:'SYNTHETIC_OHLC_CONTEXT_NOT_REAL_Q',cache_hit:true};
  }}});
  return loader.getDayGrowth({instrument:entry.instrument});
};
const loaded=await load(body),history=loaded.facts.price_structure;
assert.deepEqual(loaded.facts.growth_24h.value,day,'OLD_DAY_SCALAR_SEMANTICS_UNCHANGED');
assert.equal(history.status,'USABLE');assert.equal(history.value.length,1440);
assert.equal(history.event_ts,originalDay.event_ts);assert.equal(history.received_ts,originalDay.received_ts);assert.equal(history.expires_ts,originalDay.expires_ts);
assert.equal(history.cache_hit,true);assert.equal(history.evidence_ref,'SYNTHETIC_OHLC_CONTEXT_NOT_REAL_Q');
assert(history.value.every(row=>row.length===5),'PRICE_ONLY_NO_QUANTITY');
const historyBytes=Buffer.byteLength(JSON.stringify(history.value));assert(historyBytes<=PRICE_STRUCTURE_BOUNDS.bytes);
const enriched=structuredClone(q.input);enriched.facts.price_structure=history;
const ready=analyze(enriched);
assert.equal(ready.ready,true,'SYNTHETIC_ADDITIONAL_CONFIRMED_PRICE_TARGET_SUPPORTS_PLAN');
assert.equal(ready.automatic_eligible,qb.automatic_eligible);assert.equal(ready.wave_state,qb.wave_state);
assert.deepEqual(ready.next_wave,qb.next_wave,'HISTORY_CANNOT_REANCHOR_OR_EXTEND_WAVE');
assert.deepEqual(ready.activity,qb.activity,'HISTORY_CANNOT_CHANGE_VOLUME');
assert.deepEqual(ready.growth_windows,qb.growth_windows);assert.deepEqual(ready.liquidity,qb.liquidity);
assert(ready.plan.potential_pct.minimum>=10);assert(ready.plan.exit_zone.basis_fact_ids.includes(history.fact_id));
assert(/Карта|карт[аы]/u.test(ready.card_text),'NO_MAP_MUST_REMAIN_EXPLICIT');

const corruptions={
  CROSS_ID:f=>{f.instrument_id+=':OTHER';},
  STALE:f=>{f.expires_ts=q.input.analysis_ts-1;},
  FUTURE:f=>{f.event_ts=q.input.analysis_ts+1;},
  WRONG_UNIT:f=>{f.unit='UNKNOWN';},
  GRID_GAP:f=>{f.value.splice(500,1);},
  OVERLAP_CONFLICT:f=>{const r=f.value.find(x=>coreByTime.has(x[0]));r[2]*=2;},
  INVALID_OHLC:f=>{f.value[500][3]=f.value[500][2]+1;},
  UNBOUND_RECEIPT:f=>{f.evidence_ref=null;}
};
for(const [name,mutate] of Object.entries(corruptions)){
  const input=structuredClone(enriched);mutate(input.facts.price_structure);const rejected=analyze(input);
  assert.deepEqual(stable(rejected),stable(qb),name+':OPTIONAL_REJECTION_MUST_FALL_BACK_TO_IDENTICAL_CORE_DECISION');
}
const cancelled=structuredClone(ain.input);cancelled.facts.price_structure=history;
assert.deepEqual(stable(analyze(cancelled)),stable(ab),'HISTORY_CANNOT_REVIVE_CANCELLED_AIN');
const missing=structuredClone(body);missing.data.splice(500,1);const incomplete=await load(missing);
assert.equal(incomplete.facts.growth_24h.value,null);assert.notEqual(incomplete.facts.price_structure?.status,'USABLE');

const store=new MemoryStore(),sourceKey='pump:analysis:'+await textHash(JSON.stringify(ready));
await store.set(sourceKey,{analysis:ready,input:enriched,immutable:true});
const analysis={...ready,source_input_key:sourceKey},recipient='12345';
const delivery=createDelivery({store,recipient,clock:()=>q.input.analysis_ts,revalidate:async()=>({valid:true}),send:async({text,recipient:to,text_hash})=>{
  senderMockCalls++;assert.equal(to,recipient);assert.equal(text,ready.card_text);assert.equal(text_hash,await textHash(ready.card_text));
  return {ok:true,status:200,body:{ok:true,result:{message_id:1,chat:{id:Number(recipient)},text}}};
}});
const card=await delivery.enqueue(analysis,{mode:'AUTO',expires_ts:Math.min(...['price','candles','orderbook'].map(k=>q.input.facts[k].expires_ts))});
const sent=await delivery.dispatch(card.card_id),saved=await store.get('pump:card:'+card.card_id);
assert.equal(sent.state,'SENT');assert.equal(senderMockCalls,1);assert.equal(saved.text,ready.card_text);assert.equal(saved.analysis.source_input_key,sourceKey);assert.equal(saved.receipt.text_hash,await textHash(saved.text));
assert.equal(sha(fs.readFileSync(admission.original_packet)),sha(originalBytes),'ACTUAL_ORIGINAL_PACKET_UNMODIFIED');

// One artifact build follows the behavioral checks. All untouched modules
// come from the exact live75 artifact, including the retained legacy worker.
const {buildArtifact}=await import('../../runtime/build.mjs');
const base=JSON.parse(fs.readFileSync(admission.base_artifact));
assert.equal(base.manifest.module_count,75);assert.equal(base.manifest.implementation_pin.sha256,admission.base_live_pin);
const modules={...base.modules};for(const [name,path] of Object.entries(admission.proposed_sources))modules[name]=fs.readFileSync(path,'utf8');
const legacy=admission.artifact_output+'.legacy';fs.writeFileSync(legacy,base.modules['legacy-worker.mjs'],{flag:'wx',mode:0o600});
assert(!fs.existsSync(admission.artifact_output),'ARTIFACT_MUST_BE_NEW');
const manifest=buildArtifact({legacy_path:legacy,output_path:admission.artifact_output,module_overrides:modules});
const artifactBytes=fs.readFileSync(admission.artifact_output),artifact=JSON.parse(artifactBytes);
const changed=Object.keys(artifact.modules).filter(n=>artifact.modules[n]!==base.modules[n]).sort();
assert.deepEqual(changed,[...Object.keys(admission.proposed_sources),'runtime/implementation-pin.mjs'].sort(),'ONLY_APPROVED_MODULE_DELTAS');
assert.deepEqual(artifact.metadata,base.metadata);assert.equal(manifest.module_count,admission.expected_modules);

// Exercise only this new qualified module-delta installation against a fake
// control plane. No connector, credential, live setting or network is used.
const template=fs.readFileSync(admission.controller_template,'utf8'),accountId='70ee0af85191ea470e74c7383fdec772';
let mockModules=structuredClone(base.modules),mockControlCalls=0,mockMutations=0;
const settings={bindings:[{name:'PUMP_REPORT_ENABLED',type:'plain_text',text:'0'},{name:'PUMP_REPORT_DELIVERY_ENABLED',type:'plain_text',text:'1'},
  {name:'DATA_DB',type:'d1',id:'057a2847-2cc4-4e52-8534-1be1596d21d5'},...Array.from({length:18},(_,i)=>({name:'MOCK_KEEP_'+i,type:'plain_text',text:'UNCHANGED'}))],compatibility_date:'2026-09-11',compatibility_flags:[]};
const settingsBefore=structuredClone(settings),boundary='----PRICE_STRUCTURE_OFFLINE';
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
const controlConfig={action:'INSTALL',authority_main:admission.authority_main,issued_ts:Date.now(),expires_ts:admission.expires_ts,own_lease:admission.own_lease,admin_HTTP_max:11,
  before_modules_sha256:hashes(base.modules),after_modules_sha256:hashes(artifact.modules),before_pin:admission.base_live_pin,after_pin:manifest.implementation_pin.sha256,
  after_artifact_sha256:sha(artifactBytes),main_module:artifact.metadata.main_module,install_module_overrides:Object.fromEntries(changed.map(name=>[name,artifact.modules[name]])),
  quiescence:{state:'FINALIZED',observation_status:'QUIESCENT_CODE_UPDATE_ALLOWED',executor_owner:null,implementation_sha256:admission.base_live_pin,observed_ts:Date.now()}};
const controller=Function('cloudflare','accountId','return ('+template.replace('__PUMP_CONFIG__',()=>JSON.stringify(controlConfig))+');')(cloudflare,accountId);
const controlProof=await controller();assert.equal(controlProof.state,'CONFIRMED_FULL',controlProof.error);
assert.deepEqual(mockModules,artifact.modules);assert.deepEqual(settings,settingsBefore);assert.equal(mockMutations,1);assert.equal(mockControlCalls,11);
assert(Date.now()<admission.expires_ts);assert(engineCalls<=admission.max_engine_calls);
const proof={schema:'ROOT_PRICE_STRUCTURE_CONNECTED_CASE_V1',status:'PASS',case_count:1,authority_main:admission.authority_main,
  old_actual_originals_unchanged:true,old_Q_AIN_core_decisions_unchanged:true,synthetic_history_is_not_actual_Q:true,
  positive_synthetic_history_ready:true,corrupt_history_fallback_arms:Object.keys(corruptions),cancelled_wave_not_revived:true,
  wave_growth_volume_liquidity_gates_unchanged:true,source_mock_requests:sourceMockCalls,engine_calls:engineCalls,history_rows:1440,history_UTF8_bytes:historyBytes,
  synthetic_delivery_exact_saved_text_ACK_readback:true,sender_mock_calls:senderMockCalls,
  artifact_path:admission.artifact_output,artifact_sha256:sha(artifactBytes),implementation_sha256:manifest.implementation_pin.sha256,module_count:manifest.module_count,
  changed_modules:changed.map(name=>({name,sha256:sha(artifact.modules[name])})),unchanged_modules:manifest.module_count-changed.length,
  new_delta_controller_mock_FULL_PASS:true,mock_control_calls:mockControlCalls,mock_control_mutations:mockMutations,
  actual_native_SQL:0,actual_Cloudflare_HTTP:0,market_HTTP:0,Telegram:0,real_AUTO_delivery_proven:false,builds:1,installed:false};
fs.writeFileSync(admission.output,JSON.stringify(proof,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(proof));
