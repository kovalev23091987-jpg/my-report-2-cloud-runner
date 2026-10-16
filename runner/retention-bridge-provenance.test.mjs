import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {RETENTION_SQL_BRIDGE_PROOF as P,parseRetentionSQLBridgeProof,verifyRetentionSQLBridge as verifyPinnedBridge,observeRetentionSQLBridge,retentionMutationControlPlan} from './retention-bridge-provenance.mjs';
import {workerSettingsFingerprint,selectedVersionSettings} from './htx-coordinated-rollout.mjs';
const raw=fs.readFileSync(new URL('../'+P.path,import.meta.url));
function fixture(){
 const calls=[],settings={placement:{},tags:[],tail_consumers:[],logpush:false};
 const version={id:P.version_id,resources:{script:{etag:P.immutable_script_etag},script_runtime:{compatibility_date:'2026-09-15',usage_model:'standard'},bindings:[{name:'DATA_DB',type:'d1',id:'057a2847-2cc4-4e52-8534-1be1596d21d5'},{name:'REPORT2_CLOUD_BRIDGE_TOKEN',type:'secret_text'},{name:'REPORT2_DENO_BRIDGE_TOKEN',type:'secret_text'}]}};
 const deployments={deployments:[{id:'8cd9ba38-b819-49ce-9ff2-e1e7f3e8541b',strategy:'percentage',versions:[{version_id:P.version_id,percentage:100}]}]},schedules=[];
 const call=async(name,suffix)=>{calls.push({name,suffix});assert.equal(name,'my-report-2-d1-bridge');if(suffix==='/subdomain')return{subdomain:'controlled'};if(suffix==='/deployments')return deployments;if(suffix==='/settings')return settings;if(suffix==='/schedules')return schedules;if(suffix==='/versions/'+P.version_id)return version;throw Error('UNEXPECTED_ROUTE');};
 // Deliberately synthetic selected-version metadata; not native settings bytes.
 const expected={...P,settings_sha256:workerSettingsFingerprint(selectedVersionSettings(settings,version))};
 return{proof:expected,configured_bridge_url:'https://my-report-2-d1-bridge.controlled.workers.dev/d1',stage:'before_SQL',clock:()=>1234,call,calls,settings,version,deployments,schedules};
}
const verifyRetentionSQLBridge=({proof,...args})=>observeRetentionSQLBridge({...args,expected:proof});
test('future maintenance pins exact separately installed SQL bridge release bytes, distinct from Hub',()=>{
 assert.equal(parseRetentionSQLBridgeProof(raw),P);assert.equal(JSON.parse(raw).workers[0].name,'my-report-2-d1-bridge');assert.equal(JSON.parse(raw).workers[0].after.version_id,P.version_id);
 assert.throws(()=>parseRetentionSQLBridgeProof(Buffer.concat([raw,Buffer.from(' ')])),/RELEASE_BYTES/);
 assert.throws(()=>parseRetentionSQLBridgeProof(JSON.stringify({status:'BOTH_FREE_ARCHIVE_READERS_EXACT_MODULES_BINDINGS_AND_CRONS_VERIFIED'})),/RELEASE_BYTES/);
});
test('five preflight GETs bind configured target, immutable version/etag, every effective setting and empty schedules',async()=>{
 const f=fixture();assert.notEqual(f.proof.settings_sha256,P.settings_sha256); // no false native-byte claim
 const r=await verifyRetentionSQLBridge(f);assert.equal(f.calls.length,5);assert.equal(r.SQL,0);assert.equal(r.Cloudflare_GET,5);assert.equal(r.native_reply_accepted,false);assert.equal(r.whole_day_closed,false);assert.equal(r.transient_changes_excluded,false);assert.equal(r.release_run,'38934007309');assert(!JSON.stringify(r).includes('controlled.workers.dev'));assert(!JSON.stringify(r).includes('TOKEN'));
});
test('four postflight metadata GETs bind the final observation without a second module inspection or invocation',async()=>{
 const f=fixture();const r=await verifyRetentionSQLBridge({...f,stage:'after_SQL'});assert.equal(f.calls.length,4);assert.equal(r.Cloudflare_GET,4);assert.equal(r.stage,'after_SQL');assert(f.calls.every(c=>!c.suffix.includes('content')&&!c.suffix.includes('subdomain')));
});
test('configured Hub, foreign account host, path, query, fragment or credentials refuse before SQL bridge metadata',async()=>{
 for(const configured_bridge_url of ['https://my-report-2-hub.controlled.workers.dev/d1','https://my-report-2-d1-bridge.other.workers.dev/d1','http://my-report-2-d1-bridge.controlled.workers.dev/d1','https://my-report-2-d1-bridge.controlled.workers.dev/','https://my-report-2-d1-bridge.controlled.workers.dev/d1?x=1','https://my-report-2-d1-bridge.controlled.workers.dev/d1#x','https://user@my-report-2-d1-bridge.controlled.workers.dev/d1']){
  const f=fixture();await assert.rejects(verifyRetentionSQLBridge({...f,configured_bridge_url}),/CONFIGURED_SQL_BRIDGE/);assert.equal(f.calls.length,1);
 }
});
test('changed or split active deployment fails before selected-version read',async()=>{
 for(const split of [false,true]){const f=fixture();if(split)f.deployments.deployments[0].versions.push({version_id:P.version_id,percentage:0});else f.deployments.deployments[0].versions[0].version_id='00000000-0000-4000-8000-000000000000';await assert.rejects(verifyRetentionSQLBridge(f));assert.equal(f.calls.length,4);}
});
test('module etag, primary binding, inherited secret metadata, runtime, unknown setting or cron drift prevents acceptance',async()=>{
 for(const kind of ['etag','binding','secret','runtime','setting','cron','version-id','missing-schedules']){
  const f=fixture();if(kind==='etag')f.version.resources.script.etag='0'.repeat(64);if(kind==='binding')f.version.resources.bindings[0].id='different';if(kind==='secret')f.version.resources.bindings[1].type='plain_text';if(kind==='runtime')f.version.resources.script_runtime.compatibility_date='2026-09-16';if(kind==='setting')f.settings.unrecognized_future_setting=true;if(kind==='cron')f.schedules.push({cron:'* * * * *'});if(kind==='version-id')f.version.id='00000000-0000-4000-8000-000000000000';
  const call=kind==='missing-schedules'?async(n,s)=>s==='/schedules'?{}:f.call(n,s):f.call;
  await assert.rejects(verifyRetentionSQLBridge({...f,call}));
 }
});
test('unavailable postflight is unaccepted and cannot manufacture a zero native counter',async()=>{
 const f=fixture();await assert.rejects(verifyRetentionSQLBridge({...f,stage:'after_SQL',call:async()=>{throw Error('CONTROLLED_HTTP_FAILURE');}}),/CONTROLLED_HTTP_FAILURE/);
});
test('wrong proof, stage or nonmonotonic observation clocks cannot be presented as current provenance',async()=>{
 const f=fixture();await assert.rejects(verifyPinnedBridge({...f,proof:{...P}}),/PROVENANCE/);assert.equal(f.calls.length,0);
 await assert.rejects(verifyRetentionSQLBridge({...f,stage:'unknown'}),/PROVENANCE/);let n=2;await assert.rejects(verifyRetentionSQLBridge({...fixture(),clock:()=>n--}),/CLOCK/);
});
test('40-control plan reserves final four bridge GETs and five cursor requests before each of three mutations',()=>{
 // Existing borrowed authority6 + guard3 + archive readers8 + bridge5.
 let used=6+3+8+5;const plan=retentionMutationControlPlan({used,borrowed:true,bridge_postflight_pending:true});assert.equal(plan.max_mutation_batches,3);assert.equal(plan.reserved_HTTP,9);
 for(let i=0;i<3;i++){assert.equal(retentionMutationControlPlan({used,borrowed:true,bridge_postflight_pending:true}).max_mutation_batches,3-i);used+=3;}
 assert.equal(retentionMutationControlPlan({used,borrowed:true,bridge_postflight_pending:true}).max_mutation_batches,0);used+=4+5;assert.equal(used,40);
});
test('dated mode retains prior budget and nonborrowed cleanup, without granting additional calls or batches',()=>{
 assert.equal(retentionMutationControlPlan({used:17,borrowed:true}).max_mutation_batches,6);assert.equal(retentionMutationControlPlan({used:17,borrowed:false}).reserved_HTTP,10);assert.equal(retentionMutationControlPlan({used:40,borrowed:true,bridge_postflight_pending:true}).max_mutation_batches,0);
 for(const used of [-1,41,1.5,null])assert.throws(()=>retentionMutationControlPlan({used,borrowed:true}));
});
