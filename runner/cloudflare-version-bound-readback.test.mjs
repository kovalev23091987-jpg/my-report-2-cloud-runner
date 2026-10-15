import test from 'node:test';import assert from 'node:assert/strict';
import {createVersionBoundWorkerReader} from './cloudflare-version-bound-readback.mjs';
import {rolloutDigest,selectedVersionSettings,bindWorkerModule} from './htx-coordinated-rollout.mjs';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),script='my-report-2-hub',worker={name:script,crons:['*/5 * * * *']},runtime={compatibility_date:'2026-09-11',usage_model:'standard'};
function fixture(){let active=id(1),latest=id(2);const calls=[],bytes=new Map([[id(1),Buffer.from('old active module\n')],[id(2),Buffer.from('new dormant module\n')]]),versions=new Map([...bytes.keys()].map((v,i)=>[v,{id:v,resources:{bindings:[{name:'FLAG',type:'plain_text',text:String(i)}],script_runtime:runtime,script:{etag:'etag'+i}}}]));
 const call=async(name,suffix)=>{calls.push(suffix);if(name!==script)throw Error('wrong worker');if(suffix==='/deployments')return{deployments:[{id:id(3),strategy:'percentage',versions:[{version_id:active,percentage:100}]}]};if(suffix==='/settings')return{bindings:versions.get(latest).resources.bindings,...runtime,annotations:{'workers/commit_sha':latest},placement:{}};if(suffix==='/schedules')return[{cron:worker.crons[0]}];if(suffix==='/versions?per_page=1')return{items:[{id:latest}]};if(suffix==='/content/v2')return new Response(bytes.get(latest),{headers:{'content-type':'application/javascript'}});if(suffix.startsWith('/versions/'))return versions.get(suffix.slice('/versions/'.length));throw Error('unexpected '+suffix);};
 return{call,calls,bytes,versions,setActive:v=>active=v,setLatest:v=>latest=v};
}
test('latest dormant bytes cannot qualify the old active version, even when /deployments is unchanged',async()=>{
 const h=fixture(),r=createVersionBoundWorkerReader({call:h.call});await assert.rejects(r.read(worker),/EXACT_LATEST_UPLOAD_REQUIRED/);assert.equal(h.calls.includes('/content/v2'),false);assert.throws(()=>bindWorkerModule({active_version:id(1),latest_uploaded_version:id(2),live_sha256:rolloutDigest(h.bytes.get(id(2)))}),/LATEST_UPLOAD_IS_NOT_ACTIVE_MODULE_PROOF/);
});
test('an exact prior native version digest remains bound to its version and current settings come from that selected version',async()=>{
 const h=fixture(),r=createVersionBoundWorkerReader({call:h.call});r.seed(script,{version_id:id(1),module_sha256:rolloutDigest(h.bytes.get(id(1)))});const a=await r.read(worker);assert.equal(a.module_sha256,rolloutDigest(h.bytes.get(id(1))));assert.equal(a.module_readback_basis,'EXACT_IMMUTABLE_VERSION_PRIOR_NATIVE_DIGEST');assert.equal(r.settings(script,id(1)).bindings[0].text,'0');assert.equal(h.calls.includes('/content/v2'),false);
 h.setActive(id(2));const b=await r.read(worker);assert.equal(b.module_sha256,rolloutDigest(h.bytes.get(id(2))));assert.equal(b.module_readback_basis,'ACTIVE_EQUALS_LATEST_UPLOAD_EXACT_BYTES');assert.equal(r.settings(script,id(2)).bindings[0].text,'1');assert.notEqual(a.settings_sha256,b.settings_sha256);
 h.setActive(id(1));const restored=await r.read(worker);assert.equal(restored.module_sha256,a.module_sha256);assert.equal(restored.settings_sha256,a.settings_sha256);
});
test('operational settings retain unknown non-versioned fields and binding values while provenance follows the version ID',()=>{
 const h=fixture(),v=h.versions.get(id(1)),a=selectedVersionSettings({bindings:[],annotations:{message:'latest'},placement:{},future_guard:'KEEP'},v);assert.equal(a.future_guard,'KEEP');assert.equal(a.bindings[0].text,'0');assert.equal(Object.hasOwn(a,'annotations'),false);assert.throws(()=>selectedVersionSettings({}, {id:id(1),resources:{bindings:{},script_runtime:runtime}}));
});
