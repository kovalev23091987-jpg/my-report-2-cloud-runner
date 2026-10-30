import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import pathModule from 'node:path';
import {createHash} from 'node:crypto';
import {buildArtifact} from '../../runtime/build.mjs';
import {MemoryStore} from '../../runtime/store.mjs';
import {createRetainedCapsuleWriter} from '../../runtime/retained-capsules.mjs';
import {createDelivery,textHash} from '../../runtime/delivery.mjs';
import {createPumpRunner} from '../../runtime/runner.mjs';
import {analyzePump,evaluateOutcome} from '../../analytics/index.mjs';
import {START_PROFILE} from '../../profile/start-v1.mjs';
import {input,T,path} from '../analytics/fixtures.mjs';

// Controlled local originals and acknowledgements, never native production.
const directory=fs.mkdtempSync(pathModule.join(os.tmpdir(),'pump-capsule-controlled-'));
after(()=>fs.rmSync(directory,{recursive:true,force:true}));
const legacy=pathModule.join(directory,'legacy.mjs'),artifactPath=pathModule.join(directory,'artifact.json');fs.writeFileSync(legacy,'export default {};\n');
const hash=x=>createHash('sha256').update(x).digest('hex');
let artifact;
function built(){if(!artifact){buildArtifact({legacy_path:legacy,output_path:artifactPath});artifact=JSON.parse(fs.readFileSync(artifactPath,'utf8'));}return artifact;}
function budget(){return {setMode(){},summary(){return {total:0,lanes:{statistics:0},limits:{http_per_run:164,lanes:{statistics:12}}};}};}
function fixture({unknown=false,productionBranch=false,store=new MemoryStore()}={}){
  const raw=input();for(const row of raw.facts.candles.value.slice(-5))row.volume_base=3000;
  let now=T,historyCalls=0;const calls=[];
  const writer=()=>createRetainedCapsuleWriter({store,implementation_sha256:built().manifest.implementation_pin.sha256,evidence_class:productionBranch?'OBSERVED':'ARTIFICIAL'});
  const sources={getCore:async()=>({facts:raw.facts,coverage:{status:'USABLE'}}),getOverview:async()=>({observations:[{instrument:raw.instrument,facts:{price:raw.facts.price}}]}),getOptional:async()=>({facts:{}}),getLiquidations:async()=>raw.liquidations,getOutcomeHistory:async()=>{historyCalls++;return {facts:{candles:{value:path({high:127})}},coverage:{complete:true}};}};
  const delivery=createDelivery({store,clock:()=>now,recipient:'123',revalidate:async()=>({valid:true}),send:async payload=>{calls.push(payload);if(unknown)throw Error('CONTROLLED_UNKNOWN_SEND');return {ok:true,status:200,body:{ok:true,result:{message_id:765,chat:{id:123},date:Math.floor(T/1000)}}};}});
  const runner=()=>createPumpRunner({store,sources,delivery,analyzePump,evaluateOutcome,clock:()=>now,budget:budget(),evidence_class:productionBranch?'OBSERVED':'ARTIFICIAL',run_purpose:productionBranch?'PRODUCTION':'ACCEPTANCE_TEST',retained_features:writer()});
  return {raw,store,writer,runner,sources,calls,setTime(value){now=value;},get historyCalls(){return historyCalls;}};
}
test('build pins every bundled module except its own pin and preserves exact artifact module digests',()=>{
  const a=built(),p=a.manifest.implementation_pin,mod='runtime/implementation-pin.mjs';assert.equal(p.excluded_self_module,mod);assert.equal(Object.hasOwn(p.modules,mod),false);
  for(const [name,source]of Object.entries(a.modules)){assert.equal(a.manifest.modules[name].sha256,hash(source));if(name!==mod)assert.equal(p.modules[name],hash(source));}
  assert.equal(p.sha256,hash(JSON.stringify(p.modules)));assert.deepEqual(JSON.parse(a.modules[mod].match(/^export const IMPLEMENTATION_PIN=(.*);\n$/s)[1]),p);
  const changedPath=pathModule.join(directory,'changed.json');buildArtifact({legacy_path:legacy,output_path:changedPath,module_overrides:{'runtime/text-hash.mjs':a.modules['runtime/text-hash.mjs']+'\n'}});const b=JSON.parse(fs.readFileSync(changedPath,'utf8'));assert.notEqual(b.manifest.implementation_pin.sha256,p.sha256);assert.deepEqual(a.metadata.keep_bindings,['secret_text','plain_text','d1']);assert.deepEqual(a.manifest.schedules,[]);
});
test('connected UNKNOWN saves immutable original features, revision link and actual card protection without changing knowledge on retry',async()=>{
  const f=fixture({unknown:true}),result=await f.runner().checkInstrument(f.raw.instrument,{run_id:'CONTROLLED_CAPSULE',mode:'MANUAL'});assert.equal(result.analysis.ready,true);assert.equal(result.delivery.state,'UNKNOWN');
  const original=await f.store.get(result.analysis_key),before=JSON.stringify(original),key='pump:feature-capsule:v2:'+result.analysis_key.slice(-64),feature=await f.store.get(key);
  assert.equal(original.implementation_sha256,built().manifest.implementation_pin.sha256);assert.equal(feature.capsule.features.length,34);assert.equal(feature.capsule.origin.t0,T);assert.equal(feature.capsule.origin.reference_price,result.analysis.reference_price);assert.equal(feature.capsule.probability.value_pct,null);assert.equal(feature.capsule.retention.originals_required,true);
  const record=[...f.store.rows.entries()].find(([k])=>k.startsWith('pump:summary-record:'))[1],link=await f.store.get('pump:summary-capsule-link:v2:'+record.record_id.slice(-64)),revision=await f.store.get(link.outcome_key),refs=await f.store.get(link.protected_refs.key);
  assert.equal(link.feature_key,key);assert.equal(revision.capsule.label.status,'UNKNOWN');assert.equal(revision.capsule.publication.state,'UNKNOWN');assert.equal(refs.projection.delete_allowed,false);assert.ok(refs.projection.reasons.includes('UNSETTLED_OR_POSSIBLE_SEND'));assert.ok(refs.projection.edges.some(e=>e.to==='pump:card:'+result.delivery.card_id));
  f.setTime(T+20000);await f.writer().remember(result.analysis_key);assert.deepEqual(await f.store.get(key),feature);assert.equal(JSON.stringify(await f.store.get(result.analysis_key)),before);assert.equal(f.calls.length,1);
  const altered=structuredClone(original);altered.input.run_id='DIFFERENT_INPUT';await f.store.set(result.analysis_key,altered);await assert.rejects(f.writer().remember(result.analysis_key),/CAPSULE_ANALYSIS_INPUT_BINDING_MISMATCH/);assert.deepEqual(await f.store.get(key),feature);
});
test('outcome capsule ACK interruption repairs the same revision, numerical drawdown and link from saved HIT without repeating history',async()=>{
  class StopOutcome extends MemoryStore{async atomic(key,change){const result=await super.atomic(key,change);if(this.stop&&key.startsWith('pump:outcome-capsule:v2:')){this.stop=false;throw Error('CONTROLLED_STOP_AFTER_OUTCOME_CAPSULE_ACK');}return result;}}
  const store=new StopOutcome(),f=fixture({store,productionBranch:true}),result=await f.runner().checkInstrument(f.raw.instrument,{run_id:'CONTROLLED_OBSERVED_BRANCH',mode:'MANUAL'});assert.equal(result.delivery.state,'SENT');
  f.setTime(T+START_PROFILE.horizon_ms+1);store.stop=true;await assert.rejects(f.runner().checkOutcomes({run_id:'CONTROLLED_LABEL'}),/CONTROLLED_STOP_AFTER_OUTCOME_CAPSULE_ACK/);assert.equal(f.historyCalls,1);
  const signal=[...store.rows.entries()].find(([k])=>k.startsWith('pump:signal:'))[1],outcome=await store.get('pump:outcome:'+signal.signal_id),savedRevisionCount=[...store.rows.keys()].filter(k=>k.startsWith('pump:outcome-capsule:v2:')).length;assert.equal(outcome.status,'HIT');assert.ok(Number.isFinite(outcome.drawdown_total_pct));
  f.setTime(T+START_PROFILE.horizon_ms+30000);f.sources.getOutcomeHistory=async()=>{throw Error('FORBIDDEN_REPEATED_HISTORY');};await f.runner().checkOutcomes({run_id:'CONTROLLED_LABEL_REPAIR'});assert.equal([...store.rows.keys()].filter(k=>k.startsWith('pump:outcome-capsule:v2:')).length,savedRevisionCount);
  const row=[...store.rows.entries()].filter(([k])=>k.startsWith('pump:summary-record:')).map(([,v])=>v).find(r=>r.outcome?.status==='HIT'),link=await store.get('pump:summary-capsule-link:v2:'+row.record_id.slice(-64)),capsule=(await store.get(link.outcome_key)).capsule;
  assert.equal(capsule.label.drawdown_total_pct,outcome.drawdown_total_pct);assert.equal(capsule.label.drawdown_before_hit_pct,outcome.drawdown_before_hit_pct);assert.equal(capsule.original_outcome_sha256,await textHash(JSON.stringify(outcome)));assert.equal(capsule.recorded_ts,row.recorded_ts);assert.equal(capsule.origin.t0,T);assert.equal(capsule.publication.message_id,'765');assert.ok(await store.get(result.analysis_key));assert.deepEqual(await store.get('pump:outcome:'+signal.signal_id),outcome);
});
test('historical unpinned originals remain raw and are not assigned the current code or evidence retrospectively',async()=>{
  const f=fixture(),i={...f.raw,mode:'MANUAL',analysis_ts:T,run_purpose:'ACCEPTANCE_TEST'},a=analyzePump(i),key='pump:analysis:'+await textHash(JSON.stringify(a)),old={analysis:a,input:i,saved_ts:T};await f.store.set(key,old);
  const r=await f.writer().remember(key);assert.equal(r.status,'ORIGINAL_IMPLEMENTATION_PIN_UNBOUND');assert.deepEqual(await f.store.get(key),old);assert.equal([...f.store.rows.keys()].filter(k=>k.startsWith('pump:feature-capsule:')).length,0);
});
