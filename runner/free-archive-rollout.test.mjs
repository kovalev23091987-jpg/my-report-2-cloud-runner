import test from 'node:test';import assert from 'node:assert/strict';import {rolloutFreeArchiveReaders} from './free-archive-rollout.mjs';
const id=n=>`${String(n).padStart(8,'0')}-0000-4000-8000-000000000000`,h='a'.repeat(40),names=['my-report-2-hub','my-report-2-liq-forecast-history'];
function fixture(){
 const states=names.map((name,i)=>({version_id:id(i+1),deployment_id:id(i+11),module_sha256:String(i+1).repeat(64),settings_sha256:String(i+3).repeat(64),crons_sha256:String(i+5).repeat(64)})),original=structuredClone(states),events=[],receipts=[];
 const workers=names.map((name,i)=>({name,module_sha256:String(i+7).repeat(64),target_settings_sha256:String(i+8).repeat(64),required_before:original[i]}));
 const plan={head:h,expected_main:'b'.repeat(40),qualified:{head:h,run:123,status:'EXACT_CLOUD_AND_CURRENT_MAIN_CODE_VERIFIED'},native_schema_run:38781244995,writer_enabled:false,workers};
 const adapter={snapshot:async w=>structuredClone(states[names.indexOf(w.name)]),requireHeadroom(){},stage:async(w,before)=>{events.push('stage:'+w.name);return{version_id:id(names.indexOf(w.name)+21),activated:false};},activate:async(w,v)=>{const i=names.indexOf(w.name);events.push('activate:'+w.name+':'+v);states[i]=v===original[i].version_id?{...original[i],deployment_id:id(i+41)}:{version_id:v,deployment_id:id(i+31),module_sha256:w.module_sha256,settings_sha256:w.target_settings_sha256,crons_sha256:original[i].crons_sha256};}};
 const run=options=>rolloutFreeArchiveReaders({plan,adapter,guard:async()=>{},save:async r=>receipts.push(r),execute:true,...options});return{plan,adapter,states,original,events,receipts,run};
}
test('both readers stage first and final activation proves target bindings, exact code and unchanged source clocks/schedule',async()=>{
 const f=fixture(),r=await f.run();assert.equal(r.status,'BOTH_FREE_ARCHIVE_READERS_EXACT_MODULES_BINDINGS_AND_CRONS_VERIFIED');assert(f.events[0].startsWith('stage:'));assert(f.events[1].startsWith('stage:'));assert.equal(r.writer_enabled,false);assert.equal(r.D1,0);assert.equal(r.existing_rows_modified,0);assert(f.receipts.some(r=>r.workers[0].activation_intent&&!r.workers[0].after));
});
test('preparation, expired authority, missing rollback reserve and changed preparation cannot activate a reader',async()=>{
 for(const kind of ['PREPARE','LEASE','HTTP','MOVED']){const f=fixture();if(kind==='HTTP')f.adapter.requireHeadroom=()=>{throw Error('HTTP_BOUND');};if(kind==='MOVED')f.states[0].settings_sha256='f'.repeat(64);const run=()=>f.run({execute:kind!=='PREPARE',guard:async()=>{if(kind==='LEASE')throw Error('LEASE_EXPIRED');}});if(kind==='PREPARE')assert.equal((await run()).status,'FREE_ARCHIVE_READER_PLAN_AND_ROLLBACK_ORIGINALS_VERIFIED');else await assert.rejects(run);assert.equal(f.events.filter(e=>e.startsWith('activate:')).length,0);}
});
test('wrong target settings after second activation roll back both original modules and their original bindings',async()=>{
 const f=fixture(),activate=f.adapter.activate;f.adapter.activate=async(w,v)=>{await activate(w,v);if(w.name===names[1]&&v===id(22))f.states[1].module_sha256='0'.repeat(64);};
 await assert.rejects(f.run(),e=>{assert.equal(e.archive_rollout_receipt.rollback.length,2);assert(e.archive_rollout_receipt.rollback.every(r=>r.status==='ORIGINAL_MODULE_AND_BINDINGS_RESTORED'));return true;});
 for(let i=0;i<2;i++){assert.equal(f.states[i].version_id,f.original[i].version_id);assert.equal(f.states[i].settings_sha256,f.original[i].settings_sha256);}
});
test('an ambiguous successful activation is independently read back and restored, never blindly retried',async()=>{
 const f=fixture(),activate=f.adapter.activate;let lost=true;f.adapter.activate=async(w,v)=>{await activate(w,v);if(lost){lost=false;throw Error('REPLY_LOST');}};
 await assert.rejects(f.run(),e=>{assert.equal(e.archive_rollout_receipt.rollback[0].status,'ORIGINAL_MODULE_AND_BINDINGS_RESTORED');return true;});assert.equal(f.events.filter(e=>e.startsWith('stage:')).length,2);assert.equal(f.states[0].version_id,f.original[0].version_id);
});
test('foreign deployment or unknown settings keep current state and save an exact resume receipt',async()=>{
 const f=fixture(),activate=f.adapter.activate;f.adapter.activate=async(w,v)=>{await activate(w,v);f.states[0].version_id=id(99);throw Error('FOREIGN_DEPLOYMENT');};await assert.rejects(f.run(),e=>{assert.equal(e.archive_rollout_receipt.status,'FREE_ARCHIVE_PARTIAL_STATE_REQUIRES_EXACT_RESUME');assert.equal(e.archive_rollout_receipt.rollback[0].reason,'FOREIGN_ARCHIVE_READER_STATE_KEEP_CURRENT');return true;});assert.equal(f.states[0].version_id,id(99));
});
test('writers, unqualified schemas, wrong worker order and another tested head are rejected before transport',async()=>{
 for(const change of [p=>p.writer_enabled=true,p=>p.native_schema_run=1,p=>p.workers.reverse(),p=>p.qualified.head='c'.repeat(40)]){const f=fixture();change(f.plan);await assert.rejects(f.run(),/EXACT_FREE_ARCHIVE_READER_PLAN/);assert.equal(f.events.length,0);}
});
