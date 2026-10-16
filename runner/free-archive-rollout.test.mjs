import test from 'node:test';import assert from 'node:assert/strict';import {rolloutFreeArchiveReaders,resumeFreeArchiveReaders,requireArchiveWritersOff,currentMainReaderRepairRequest} from './free-archive-rollout.mjs';
const id=n=>`${String(n).padStart(8,'0')}-0000-4000-8000-000000000000`,h='a'.repeat(40),names=['my-report-2-hub','my-report-2-liq-forecast-history'];
test('current-main repair reuses the exact reader qualification, keeps writers off and requires explicit false-or-true execution',()=>{
 assert.equal(currentMainReaderRepairRequest({}),null);const env={REPORT2_CURRENT_READER_REPAIR:'true',GITHUB_REPOSITORY:'kovalev23091987-jpg/my-report-2-cloud-runner',GITHUB_REF:'refs/heads/main',GITHUB_SHA:h,EXPECTED_MAIN:h,CONNECTED_RUN:'123',BORROW_EXISTING_OWNER:'OWN',EXECUTE_READER_REPAIR:'false'},request=currentMainReaderRepairRequest(env);assert.equal(request.execute,false);assert.equal(request.writer_enabled,false);assert.equal(request.qualified_head,h);assert.equal(request.expected_main,h);assert.equal(request.native_schema_run,38781244995);
 assert.equal(currentMainReaderRepairRequest({...env,EXECUTE_READER_REPAIR:'true'}).execute,true);
 for(const [key,value] of [['GITHUB_REF','refs/heads/foreign'],['GITHUB_SHA','b'.repeat(40)],['GITHUB_REPOSITORY','foreign'],['EXPECTED_MAIN','bad'],['CONNECTED_RUN',''],['BORROW_EXISTING_OWNER',''],['EXECUTE_READER_REPAIR','1']])assert.throws(()=>currentMainReaderRepairRequest({...env,[key]:value}));
});
test('actual repository writer/rotation flags must be completely read and off before each deployment guard',()=>{
 assert(requireArchiveWritersOff({total_count:0,variables:[]}));assert(requireArchiveWritersOff({total_count:1,variables:[{name:'REPORT2_CANONICAL_ARCHIVE_POOL_ENABLED',value:'false'}]}));
 for(const r of [{total_count:1,variables:[]},{total_count:1,variables:[{name:'REPORT2_CANONICAL_ARCHIVE_POOL_ENABLED',value:'true'}]},{total_count:1,variables:[{name:'REPORT2_CANONICAL_COMPACTION_ENABLED',value:'true'}]},{total_count:1,variables:[{name:'REPORT2_CANONICAL_ARCHIVE_POOL_ENABLED'}]}])assert.throws(()=>requireArchiveWritersOff(r));
});
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
function resumeFixture(){
 const f=fixture(),prior={schema:'EXACT_FREE_ARCHIVE_READER_ROLLOUT_V1',cloud_run:'38792404641',head:h,status:'FREE_ARCHIVE_PARTIAL_STATE_REQUIRES_EXACT_RESUME',writer_enabled:false,automatic_rotation_enabled:false,sourceHTTP:0,D1:0,MAIN:0,Telegram:0,whole_HTTP:{total:68},workers:f.plan.workers.map((w,i)=>({name:w.name,before:f.original[i],staged:{version_id:id(i+21),activated:false},expected_module_sha256:w.module_sha256}))};
 f.states[0]={...f.states[0],version_id:id(21),deployment_id:id(31),module_sha256:f.plan.workers[0].module_sha256,settings_sha256:f.plan.workers[0].target_settings_sha256};
 f.adapter.verifyStaged=async()=>{};const run=()=>resumeFreeArchiveReaders({plan:f.plan,prior,adapter:f.adapter,guard:async()=>{},save:async r=>f.receipts.push(r)});return{...f,prior,run};
}
test('own partial resume reuses both uploads and switches only the remaining reader',async()=>{
 const f=resumeFixture(),r=await f.run();assert.equal(r.status,'BOTH_FREE_ARCHIVE_READERS_EXACT_MODULES_BINDINGS_AND_CRONS_VERIFIED');assert.deepEqual(f.events,['activate:'+names[1]+':'+id(22)]);assert.equal(r.prior_whole_HTTP,68);assert(r.workers[0].already_active);assert.equal(r.sourceHTTP,0);assert.equal(r.D1,0);
});
test('foreign active state, missing staged bytes, wrong source receipt and changed module cannot resume',async()=>{
 for(const kind of ['FOREIGN','STAGED','RECEIPT','MODULE','BINDINGS']){
  const f=resumeFixture();if(kind==='FOREIGN')f.states[0].version_id=id(99);if(kind==='STAGED')f.adapter.verifyStaged=async()=>{throw Error('NO_EXACT_STAGE');};if(kind==='RECEIPT')f.prior.cloud_run='other';if(kind==='MODULE')f.prior.workers[0].expected_module_sha256='f'.repeat(64);if(kind==='BINDINGS')f.states[0].settings_sha256='f'.repeat(64);
  await assert.rejects(f.run);assert.equal(f.events.length,0);
 }
});
test('partial resume loses activation reply only after restoring exact originals, without new uploads',async()=>{
 const f=resumeFixture(),activate=f.adapter.activate;let first=true;f.adapter.activate=async(w,v)=>{await activate(w,v);if(first){first=false;throw Error('REPLY_LOST');}};
 await assert.rejects(f.run,e=>{assert.equal(e.archive_rollout_receipt.rollback.length,2);assert(e.archive_rollout_receipt.rollback.every(r=>r.status==='ORIGINAL_MODULE_AND_BINDINGS_RESTORED'));return true;});assert(f.states.every((s,i)=>s.module_sha256===f.original[i].module_sha256));assert(!f.events.some(e=>e.startsWith('stage:')));
});
test('a new foreign version during partial resume is never overwritten by rollback',async()=>{
 const f=resumeFixture(),activate=f.adapter.activate;f.adapter.activate=async(w,v)=>{await activate(w,v);f.states[1].version_id=id(99);throw Error('FOREIGN_CHANGE');};await assert.rejects(f.run,e=>{assert(e.archive_rollout_receipt.rollback.some(r=>r.name===names[1]&&r.reason==='FOREIGN_ARCHIVE_READER_STATE_KEEP_CURRENT'));return true;});assert.equal(f.states[1].version_id,id(99));
});
