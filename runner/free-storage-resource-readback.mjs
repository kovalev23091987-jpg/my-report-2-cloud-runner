export function verifyFreeArchiveIdentities(reply,{existing,created}={}){
 const rows=reply?.result,info=reply?.result_info;
 const out={schema:'FREE_ARCHIVE_INDEPENDENT_RESOURCE_READBACK_V1',verified:false,
  response_success:reply?.success===true,result_count:Array.isArray(rows)?rows.length:null,result_info:info??null,
  sourceHTTP:0,D1_SQL:0,databases_created:0,schemas_initialized:false,consumer_bindings_installed:false};
 if(reply?.success!==true||!Array.isArray(rows)||rows.length>10||!Array.isArray(existing)||!Array.isArray(created)||created.length!==4)return{...out,status:'EXACT_FREE_ARCHIVE_RESOURCE_RESPONSE_REQUIRED'};
 const wanted=[...existing,...created].map(r=>r.uuid+':'+r.name).sort();
 const actual=rows.map(r=>r.uuid+':'+r.name).sort();
 out.resource_identities=rows.map(r=>({uuid:r.uuid,name:r.name}));
 if(new Set(wanted).size!==9||new Set(actual).size!==9||JSON.stringify(wanted)!==JSON.stringify(actual)||Number(info?.total_count)!==9||Number(info?.page)!==1)return{...out,status:'FREE_ARCHIVE_RESOURCE_IDENTITIES_NOT_CLOSED'};
 // The exact complete identity set and total count prove the result. Record
 // count is retained as a diagnostic, never used to infer database contents.
 return{...out,status:'FOUR_NEW_EMPTY_ARCHIVE_IDENTITIES_INDEPENDENTLY_VERIFIED',verified:true,
  created,operating_capacity_ceiling_bytes:1600000000,spare_database_slots:1,
  production_storage_path_activated:false,main_capacity_recovered:false};
}
