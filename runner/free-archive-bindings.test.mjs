import test from 'node:test';import assert from 'node:assert/strict';
import {freeArchiveBindingPlan} from './free-archive-bindings.mjs';
import {PRIVATE_CANONICAL_DATABASES as D} from './private-canonical-history.mjs';
import {historyVersionMetadata} from './htx-coordinated-rollout.mjs';
const schema_receipt={status:'EXACT_FOUR_FREE_ARCHIVE_SCHEMAS_VERIFIED',locations:Object.entries(D).filter(([s])=>s!=='LEGACY').map(([location,d])=>({location,database_id:d.uuid,initialized:true}))};
test('pool binding plan requires native schema proof and preserves all original secret and unknown settings bindings',()=>{
 const settings={bindings:[{name:'CANONICAL_ARCHIVE_DB',type:'d1',id:D.LEGACY.uuid},{name:'secret',type:'secret_text',text:'fixture-only'}]},before=structuredClone(settings),r=freeArchiveBindingPlan({settings,schema_receipt});assert.deepEqual(settings,before);assert.deepEqual(r.bindings.slice(0,2),settings.bindings);assert.equal(r.added_locations.length,4);assert.equal(r.activation_performed,false);assert.equal(freeArchiveBindingPlan({settings:{bindings:r.bindings},schema_receipt}).added_locations.length,0);
 assert.throws(()=>freeArchiveBindingPlan({settings,schema_receipt:{...schema_receipt,status:'CODE_ONLY'}}));assert.throws(()=>freeArchiveBindingPlan({settings:{bindings:[...settings.bindings,{name:D.A2.binding,type:'d1',id:D.A1.uuid}]},schema_receipt}),/FOREIGN_ARCHIVE/);
});
test('later weekly rollout preserves exactly pinned installed archive aliases and still rejects foreign bindings',()=>{
 const config={compatibility_date:'2026-10-12',d1_databases:[{binding:'CANONICAL_ARCHIVE_DB',database_id:D.LEGACY.uuid}]},settings={compatibility_date:config.compatibility_date,bindings:[{name:D.LEGACY.binding,type:'d1',id:D.LEGACY.uuid},{name:D.A1.binding,type:'d1',id:D.A1.uuid}]},runtime={compatibility_date:config.compatibility_date,usage_model:'standard'},args={settings,config,runtime,main_module:'worker.js',head:'a'.repeat(40)};
 assert.deepEqual(historyVersionMetadata(args).bindings,settings.bindings);const bad=structuredClone(settings);bad.bindings[1].id=D.A2.uuid;assert.throws(()=>historyVersionMetadata({...args,settings:bad}),/EXACT_HISTORY_D1/);
});
test('new archive aliases match the exact native dual-id shape; conflicting ids are never normalized away',()=>{
 const settings={bindings:[{name:D.LEGACY.binding,type:'d1',id:D.LEGACY.uuid}]},r=freeArchiveBindingPlan({settings,schema_receipt});
 for(const b of r.bindings.slice(1)){assert.equal(b.id,b.database_id);assert.deepEqual(Object.keys(b).sort(),['database_id','id','name','type']);}
 const bad=structuredClone(r.bindings);bad[1].database_id=D.A2.uuid;assert.throws(()=>freeArchiveBindingPlan({settings:{bindings:bad},schema_receipt}),/FOREIGN_ARCHIVE_BINDING/);
});
