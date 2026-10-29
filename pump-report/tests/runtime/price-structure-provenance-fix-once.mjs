import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const sha=value=>createHash('sha256').update(value).digest('hex');
const a=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const own=JSON.parse(fs.readFileSync('checkpoints/CLOUD_PHASE_STATE_20261004.json','utf8')).lease;
if(a.status!=='ADMITTED_ONE_PRICE_STRUCTURE_PROVENANCE_FIX_AND_BUILD'||a.max_cases!==1||a.max_builds!==1||Date.now()>=a.expires_ts||a.expires_ts>own.expires_ts||own.owner!==a.own_lease.owner||own.released)throw Error('FIX_ADMISSION');
for(const [path,digest] of Object.entries(a.frozen_files))assert.equal(sha(fs.readFileSync(path)),digest,'FROZEN:'+path);
fs.writeFileSync(a.output+'.attempt',JSON.stringify({authority_main:a.authority_main,started_ts:Date.now()}),{flag:'wx',mode:0o600});
globalThis.fetch=()=>{throw Error('OFFLINE_ONLY_NO_NETWORK');};
const {START_PROFILE}=await import('../../profile/start-v1.mjs');
const {analyzePump}=await import('../../analytics/index.mjs');
const {consumePriceStructure}=await import('../../analytics/price-structure.mjs');
const {createDayGrowthLoader}=await import('../../sources/day-growth.mjs');
const {createNativeRelativeCandleQualification}=await import('../../sources/native-relative-qualification.mjs');
const {prepareFeatureCapsule,readFeatureCapsule,capsuleDigest}=await import('../../analytics/feature-capsule.mjs');
const {buildArtifact}=await import('../../runtime/build.mjs');
const originalBytes=fs.readFileSync(a.original_packet),packet=JSON.parse(originalBytes);
const original=packet.requested_analyses.find(row=>row.instrument_id.endsWith(':Q-USDT')).original;
const input=structuredClone(original.input),day=input.facts.growth_24h,core=input.facts.candles.value;
const byTime=new Map(core.map(row=>[row.open_ts,row]));
// Reuse the first case's explicitly synthetic context only as fixture setup.
// This case checks new missing-ID and capsule provenance boundaries, not the
// accepted historical core, corrupted-history, delivery or controller cases.
const body={code:0,data:Array.from({length:1440},(_,index)=>{
  const time=day.value.start_ts+index*60000,row=byTime.get(time);
  if(row)return {time,open:row.open,high:row.high,low:row.low,close:row.close};
  const close=0.058+0.0001*Math.sin(index),open=index===0?day.value.open:0.058;
  return {time,open,high:index===500?0.08:Math.max(open,close)+0.00005,low:Math.min(open,close)-0.00005,close};
})};
let time=day.value.end_ts+100,sourceMocks=0;
const entry={instrument:structuredClone(input.instrument),qualifications:{candles:createNativeRelativeCandleQualification(input.instrument)}};
const loader=createDayGrowthLoader({clock:()=>time,resolveEntry:()=>entry,broker:{async request(){sourceMocks++;time=day.received_ts;return {ok:true,status:200,data:body,received_ts:day.received_ts,receipt_id:'SYNTHETIC_PRICE_STRUCTURE_PROVENANCE_FIX',cache_hit:true};}}});
const loaded=await loader.getDayGrowth({instrument:input.instrument});
input.facts.growth_24h=loaded.facts.growth_24h;input.facts.price_structure=loaded.facts.price_structure;
const invalid=structuredClone(input);delete invalid.facts.growth_24h.fact_id;delete invalid.facts.price_structure.derived_from.parent_fact_id;
const rejected=consumePriceStructure(invalid,core,original.analysis.next_wave.confirmed_pivots,START_PROFILE);
assert.equal(rejected.diagnostic.status,'IGNORED');assert.equal(rejected.diagnostic.reason,'PRICE_STRUCTURE_SHARED_REQUEST_UNBOUND');
assert.deepEqual(rejected.pivots,original.analysis.next_wave.confirmed_pivots,'MISSING_PARENT_IDS_MUST_NOT_ADD_HISTORY_LEVELS');
const analysis=analyzePump(input);assert.equal(analysis.ready,true,'SYNTHETIC_CAPSULE_FIXTURE_REQUIRES_HISTORY_PLAN');
assert.equal(analysis.price_structure_diagnostic.used_for_plan,true);

const predecessor=JSON.parse(fs.readFileSync(a.predecessor_case));
assert.equal(predecessor.status,'PASS');assert.equal(predecessor.case_count,1);assert.equal(predecessor.new_delta_controller_mock_FULL_PASS,true);
const base=JSON.parse(fs.readFileSync(a.base_artifact));assert.equal(base.manifest.implementation_pin.sha256,a.base_live_pin);
const modules={...base.modules};for(const [name,path] of Object.entries(a.proposed_sources))modules[name]=fs.readFileSync(path,'utf8');
const legacy=a.artifact_output+'.legacy';fs.writeFileSync(legacy,base.modules['legacy-worker.mjs'],{flag:'wx',mode:0o600});
assert(!fs.existsSync(a.artifact_output));const manifest=buildArtifact({legacy_path:legacy,output_path:a.artifact_output,module_overrides:modules});
const artifactBytes=fs.readFileSync(a.artifact_output),artifact=JSON.parse(artifactBytes);
const changed=Object.keys(artifact.modules).filter(name=>artifact.modules[name]!==base.modules[name]).sort();
assert.deepEqual(changed,predecessor.changed_modules.map(row=>row.name).sort());assert.equal(manifest.module_count,76);assert.deepEqual(artifact.metadata,base.metadata);
const previous=JSON.parse(fs.readFileSync(a.predecessor_artifact));
const delta=Object.keys(artifact.modules).filter(name=>artifact.modules[name]!==previous.modules[name]).sort();
assert.deepEqual(delta,['analytics/feature-capsule.mjs','analytics/price-structure.mjs','runtime/implementation-pin.mjs']);

const analysisKey='pump:analysis:'+await capsuleDigest(analysis),common={analysis,analysis_key:analysisKey,implementation_sha256:manifest.implementation_pin.sha256,recorded_ts:analysis.analysis_ts+1,evidence_class:'ARTIFICIAL'};
const good=await prepareFeatureCapsule({...common,input}),view=await readFeatureCapsule({capsule:good.capsule,sha256:good.sha256});
const minimum=view.features.find(row=>row.name==='plan_minimum_potential_pct'),history=input.facts.price_structure;
assert.equal(minimum.bound,true);assert.equal(minimum.value,analysis.plan.potential_pct.minimum);
const usedIds=[...new Set([...analysis.plan.entry_zones,analysis.plan.exit_zone].flatMap(area=>area.basis_fact_ids))];
for(const id of usedIds)assert(minimum.source_fact_ids.includes(id),'MISSING_USED_PLAN_FACT:'+id);
assert(minimum.source_fact_ids.includes(history.fact_id));assert(minimum.evidence_refs.includes(history.evidence_ref));
assert(good.capsule.source_facts.some(row=>row.fact_id===history.fact_id&&row.kind==='price_structure'&&row.unit===history.unit&&row.event_ts===history.event_ts));
for(const mutation of ['MISSING_HISTORY_FACT','MISSING_HISTORY_EVIDENCE']){
  const missing=structuredClone(input);if(mutation==='MISSING_HISTORY_FACT')delete missing.facts.price_structure;else missing.facts.price_structure.evidence_ref=null;
  const record=await prepareFeatureCapsule({...common,input:missing}),read=await readFeatureCapsule({capsule:record.capsule,sha256:record.sha256});
  const value=read.features.find(row=>row.name==='plan_minimum_potential_pct');assert.equal(value.bound,false,mutation);assert.equal(value.value,null,mutation);assert(value.absence_reason,mutation);
}
assert.equal(sha(fs.readFileSync(a.original_packet)),sha(originalBytes));assert.equal(sourceMocks,1);assert(Date.now()<a.expires_ts);
const proof={schema:'ROOT_PRICE_STRUCTURE_PROVENANCE_FIX_CASE_V2',status:'PASS',case_count:1,authority_main:a.authority_main,
  missing_parent_ID_counterexample_rejected:true,plan_feature_all_used_sources_bound:true,price_structure_header_preserved:true,
  missing_fact_or_evidence_feature_unknown_not_zero:true,capsule_readback_cases:3,source_mock_requests:sourceMocks,engine_calls:1,
  first_connected_case_not_repeated:true,controller_template_unchanged_predecessor_mock_PASS_reused:true,
  artifact_path:a.artifact_output,artifact_sha256:sha(artifactBytes),implementation_sha256:manifest.implementation_pin.sha256,module_count:76,
  changed_modules:changed.map(name=>({name,sha256:sha(artifact.modules[name])})),delta_from_predecessor:delta,unchanged_modules:76-changed.length,
  capsule_UTF8_bytes:Buffer.byteLength(JSON.stringify(good.capsule)),old_actual_originals_unchanged:true,builds:1,
  actual_native_SQL:0,actual_Cloudflare_HTTP:0,market_HTTP:0,Telegram:0,real_AUTO_delivery_proven:false,installed:false};
fs.writeFileSync(a.output,JSON.stringify(proof,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(proof));
