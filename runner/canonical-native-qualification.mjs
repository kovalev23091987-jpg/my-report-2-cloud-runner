// A manual qualification is not automatic activation and never grants a new
// D1/source reservation. The caller must still acquire/read back the exact
// borrowed owner, pass the shared ordinary admission and verify private bytes.
export function canonicalExecutionMode({kind,execute,enabled,emergency,event,borrowed_owner,prefetch,native_qualification=false,self_qualification=false}={}){
 if(self_qualification&&!native_qualification)throw Error('EXACT_DATED_NATIVE_RETENTION_QUALIFICATION_REQUIRED');
 if(native_qualification&&(kind!=='canonical'||execute!==true||event!=='workflow_dispatch'||!self_qualification&&(typeof borrowed_owner!=='string'||!borrowed_owner.trim())||prefetch!==true||emergency!==false))throw Error('EXACT_MANUAL_NATIVE_CANONICAL_QUALIFICATION_REQUIRED');
 if(kind==='canonical'&&execute===true&&enabled!==true&&emergency!==true&&native_qualification!==true)throw Error('CANONICAL_COMPACTION_NATIVE_QUALIFICATION_NOT_ACTIVATED');
 return{native_qualification:native_qualification===true,require_native_preflight:kind==='canonical'&&execute===true&&(emergency===true||native_qualification===true),automatic_activation:false,extra_retention_slot_granted:false};
}
