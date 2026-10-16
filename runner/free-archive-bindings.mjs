import {PRIVATE_CANONICAL_DATABASES} from './private-canonical-history.mjs';
// A current-main code repair may reuse only the already complete, exact pool.
// It cannot turn into a first installation or finish a partial foreign setup.
export function installedFreeArchiveRepairBindingPlan(args){
 const plan=freeArchiveBindingPlan(args);
 if(plan.added_locations.length!==0||JSON.stringify(plan.bindings)!==JSON.stringify(args.settings.bindings))throw Error('EXACT_ALREADY_INSTALLED_ARCHIVE_BINDINGS_REQUIRED');
 return plan;
}
export function freeArchiveBindingPlan({settings,schema_receipt}={}){
 const locations=Object.entries(PRIVATE_CANONICAL_DATABASES).filter(([s])=>s!=='LEGACY');
 if(schema_receipt?.status!=='EXACT_FOUR_FREE_ARCHIVE_SCHEMAS_VERIFIED'||schema_receipt.locations?.length!==4||locations.some(([location,d])=>schema_receipt.locations.filter(r=>r.location===location&&r.database_id===d.uuid&&r.initialized===true).length!==1))throw Error('EXACT_NATIVE_FOUR_SCHEMAS_REQUIRED_BEFORE_BINDING');
 if(!Array.isArray(settings?.bindings)||new Set(settings.bindings.map(b=>b.name)).size!==settings.bindings.length)throw Error('EXACT_ORIGINAL_WORKER_BINDINGS_REQUIRED');
 const legacy=settings.bindings.find(b=>b.name==='CANONICAL_ARCHIVE_DB');if(legacy?.type!=='d1'||(legacy.id??legacy.database_id)!==PRIVATE_CANONICAL_DATABASES.LEGACY.uuid)throw Error('EXACT_LEGACY_ARCHIVE_BINDING_REQUIRED');
 const bindings=structuredClone(settings.bindings),added=[];
 for(const [slot,d] of locations){const existing=bindings.find(b=>b.name===d.binding);if(existing){if(existing.type!=='d1'||(existing.id??existing.database_id)!==d.uuid||existing.id&&existing.database_id&&existing.id!==existing.database_id)throw Error('FOREIGN_ARCHIVE_BINDING_KEEP_ORIGINAL');}else{bindings.push({name:d.binding,type:'d1',id:d.uuid,database_id:d.uuid});added.push(slot);}}
 return{bindings,added_locations:added,original_bindings_preserved:true,activation_performed:false,sourceHTTP:0,D1_SQL:0};
}
