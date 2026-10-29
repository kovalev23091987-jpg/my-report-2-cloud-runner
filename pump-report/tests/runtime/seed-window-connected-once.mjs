import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const a=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const own=JSON.parse(fs.readFileSync('checkpoints/CLOUD_PHASE_STATE_20261004.json','utf8')).lease;
assert.equal(a.status,'ADMITTED_ONE_SEED_WINDOW_CONNECTED_CASE_AND_BUILD');
assert(a.max_cases===1&&a.max_builds===1&&Date.now()<a.expires_ts&&a.expires_ts<=own.expires_ts&&a.own_lease.owner===own.owner&&!own.released);
for(const [p,h]of Object.entries(a.frozen_files))assert.equal(sha(fs.readFileSync(p)),h,p);
fs.writeFileSync(a.output+'.attempt',JSON.stringify({started_ts:Date.now(),real_IO:0}),{flag:'wx',mode:0o600});
globalThis.fetch=()=>{throw Error('OFFLINE_ONLY');};
const {START_PROFILE:baseline}=await import('../../profile/start-v1.mjs');
const {START_PROFILE:proposed}=await import('../../.private/seed-window-20261029/profile-proposed.mjs');
const {createPumpSources}=await import('../../sources/index.mjs');
const {createReviewedNativeScopeRegistry}=await import('../../registry/native-reviewed550.mjs');
const {BINGX_IDENTITY_REGISTRY}=await import('../../registry/index.mjs');
const {analyzePump}=await import('../../analytics/index.mjs');
const {createFact,INPUT_SCHEMA,emptyMap}=await import('../../contracts/index.mjs');
const registry=createReviewedNativeScopeRegistry(BINGX_IDENTITY_REGISTRY),entry=registry.resolve({native_symbol:'Q-USDT'}),instrument=entry.instrument;
assert.deepEqual(Object.keys(proposed).filter(k=>JSON.stringify(proposed[k])!==JSON.stringify(baseline[k])).sort(),['version','wave_search_ms']);
assert.equal(proposed.wave_search_ms,proposed.wave_max_age_ms);
// An explicitly artificial path: the volume impulse is older than one hour,
// followed by a slow pullback on smaller volume. It is no market reconstruction.
const T=1800000000000,M=60000,wire=[];let previous=100;
for(let i=0;i<305;i++){
 let close=i<140?100+0.1*Math.sin(i*Math.PI/3):i<145?100+(i-139)*6:i<151?130+(i-144)*2:142-(i-150)*30/154;
 if(i===304)close=112;
 wire.push({time:T-(305-i)*M,open:String(previous),close:String(close),high:String(Math.max(previous,close)+0.6),
  low:String(i===140?90:Math.min(previous,close)-0.6),volume:String(i>=140&&i<145?5000:i>=145?100:1000)});previous=close;
}
let mockRequests=0;
async function load(profile){
 const requests=[];
 const sources=createPumpSources({clock:()=>T,identityRegistry:registry,profile,broker:{async request(request){
  mockRequests++;requests.push(request);const url=new URL(request.url);let data;
  if(url.pathname.endsWith('/price'))data={code:0,data:{symbol:instrument.native_symbol,price:'112',time:T}};
  else if(url.pathname.endsWith('/klines')){const count=Number(url.searchParams.get('limit'));data={code:0,data:wire.slice(-count)};assert.equal(Number(url.searchParams.get('startTime')),T-count*M);}
  else if(url.pathname.endsWith('/depth'))data={code:0,data:{T,bidsCoin:[['111.9','10000']],asksCoin:[['112.1','10000']],bids:[['111.9','10000']],asks:[['112.1','10000']]}};
  else throw Error('UNEXPECTED_MOCK_ROUTE');
  return {ok:true,status:200,data,received_ts:T,receipt_id:'ARTIFICIAL_SEED_WINDOW_'+mockRequests,cache_hit:false};
 }}});
 const core=await sources.getCore({instrument,run_id:'ARTIFICIAL_SEED_WINDOW',mode:'AUTO'});
 const ticker=createFact({fact_id:'ARTIFICIAL_24H_PRICE',instrument_id:instrument.instrument_id,kind:'ticker_24h',value:{open:90,last:112},unit:'USDT_PER_BASE',
  event_ts:T,received_ts:T,expires_ts:T+30000,source:'ARTIFICIAL_ONLY',primary_provider:'ARTIFICIAL_ONLY',venue:'BINGX',status:'USABLE',origin:'OBSERVED',evidence_ref:'ARTIFICIAL_ONLY'});
 const input={schema_version:INPUT_SCHEMA,run_id:'ARTIFICIAL_SEED_WINDOW',run_purpose:'PRODUCTION',mode:'AUTO',analysis_ts:T,instrument,facts:{...core.facts,ticker_24h:ticker},previous_wave:null,liquidations:emptyMap('ABSENT','ARTIFICIAL_NO_MAP')};
 return {input,core,requests,analysis:analyzePump(input,profile)};
}
const old=await load(baseline),next=await load(proposed);
assert.equal(old.requests.length,3);assert.equal(next.requests.length,3);
assert.equal(old.input.facts.candles.value.length,125);assert.equal(next.input.facts.candles.value.length,305);
assert.equal(next.input.facts.candles.coverage.complete,true);
assert.equal(next.input.facts.candles.coverage.absolute_base_amount_qualified,false);
assert.equal(next.input.facts.candles.coverage.absolute_USD_amount_qualified,false);
assert.deepEqual(old.analysis.reasons,['CURRENT_ACTIVITY_NOT_CONFIRMED']);
assert(next.analysis.next_wave?.impulse,'OLDER_QUALIFIED_SEED_VISIBLE');
assert(next.analysis.next_wave.impulse.end_ts<T-3600000);assert.equal(next.analysis.next_wave.impulse.baseline_status,'FULL');
assert(next.analysis.next_wave.impulse.ratio>=2);
assert.equal(next.analysis.ready,true,JSON.stringify({reasons:next.analysis.reasons,diagnostic:next.analysis.plan_diagnostic,state:next.analysis.wave_state}));
assert(next.analysis.plan.potential_pct.minimum>=10);assert.equal(next.analysis.automatic_eligible,true);
assert.equal(next.analysis.next_wave.expires_ts-next.analysis.next_wave.created_ts,baseline.wave_max_age_ms);
const terminalInput=structuredClone(next.input);terminalInput.previous_wave={...structuredClone(next.analysis.next_wave),created_ts:T-1200000,expires_ts:T-1200000+baseline.wave_max_age_ms,state:'CANCELLED',cancelled_ts:T-600000};
const terminal=analyzePump(terminalInput,proposed);assert.equal(terminal.ready,false);assert.deepEqual(terminal.reasons,['PLAN_INVALIDATED']);
assert.equal(terminal.next_wave.wave_id,terminalInput.previous_wave.wave_id);assert.equal(terminal.next_wave.expires_ts,terminalInput.previous_wave.expires_ts);
assert.equal(mockRequests,6);
const {buildArtifact}=await import('../../runtime/build.mjs');
const base=JSON.parse(fs.readFileSync(a.base_artifact)),modules={...base.modules};for(const [n,p]of Object.entries(a.proposed_sources))modules[n]=fs.readFileSync(p,'utf8');
const legacy=a.artifact_output+'.legacy';fs.writeFileSync(legacy,base.modules['legacy-worker.mjs'],{flag:'wx',mode:0o600});
assert(!fs.existsSync(a.artifact_output));const manifest=buildArtifact({legacy_path:legacy,output_path:a.artifact_output,module_overrides:modules});
const artifactBytes=fs.readFileSync(a.artifact_output),artifact=JSON.parse(artifactBytes),changed=Object.keys(artifact.modules).filter(n=>artifact.modules[n]!==base.modules[n]).sort();
assert.deepEqual(changed,['profile/start-v1.mjs','runtime/implementation-pin.mjs','sources/index.mjs']);assert.equal(manifest.module_count,76);assert.deepEqual(artifact.metadata,base.metadata);
// Exact-delta controller mock follows; no live settings or credentials.

const template=fs.readFileSync(a.controller_template,'utf8'),accountId='70ee0af85191ea470e74c7383fdec772';
let mockModules=structuredClone(base.modules),mockControlCalls=0,mockMutations=0;
const settings={bindings:[{name:'PUMP_REPORT_ENABLED',type:'plain_text',text:'0'},{name:'PUMP_REPORT_DELIVERY_ENABLED',type:'plain_text',text:'1'},
  {name:'DATA_DB',type:'d1',id:'057a2847-2cc4-4e52-8534-1be1596d21d5'},...Array.from({length:18},(_,i)=>({name:'MOCK_KEEP_'+i,type:'plain_text',text:'UNCHANGED'}))],compatibility_date:'2026-09-11',compatibility_flags:[]};
const settingsBefore=structuredClone(settings),boundary='----SEED_WINDOW_OFFLINE';
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

const proof={schema:'ROOT_SEED_WINDOW_CONNECTED_CASE_V1',status:'PASS',case_count:1,authority_main:a.authority_main,
 engineering_profile_only_changes:['version','wave_search_ms'],baseline_search_minutes:60,proposed_search_minutes:240,
 source_core_rows:[125,305],same_source_HTTP_mock_count_per_core:[3,3],all_source_mock_requests:mockRequests,
 exact_closed_grid_relative_counter_unknown_absolute_units:true,synthetic_older_seed_detected:true,synthetic_ready_plan_minimum_pct:next.analysis.plan.potential_pct.minimum,
 volume_ratio2_growth20or10_minplan10_and_retained_lifetime_unchanged:true,cancelled_original_not_revived_or_extended:true,
 actual_VEIL_IDOL_or_other_market_readiness_claimed:false,source_history_305_native_receipt_not_proven:true,
 first_classification_expiry_rule:'Existing created-at-first-analysis plus4h unchanged; cold structural path retains seed-end plus4h. Wider search is not a claim a wave is fresh simply because it is within range.',
 artifact_path:a.artifact_output,artifact_sha256:sha(artifactBytes),implementation_sha256:manifest.implementation_pin.sha256,module_count:76,
 changed_modules:changed.map(name=>({name,sha256:sha(artifact.modules[name])})),unchanged_modules:73,
 controller_exact3_override_mock_FULL_PASS:true,mock_control_calls:mockControlCalls,mock_control_mutations:mockMutations,
 actual_native_SQL:0,actual_Cloudflare_HTTP:0,market_HTTP:0,Telegram:0,real_AUTO_delivery_proven:false,engine_calls:3,builds:1,installed:false};
fs.writeFileSync(a.output,JSON.stringify(proof,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(proof));
