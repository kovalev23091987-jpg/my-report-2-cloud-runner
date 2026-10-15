// Capacity decisions use account-wide metadata. SQL costs and storage bytes are
// separate limits; adding a database never increases the shared query budget.
export const FREE_STORAGE_POLICY=Object.freeze({
 account_bytes:5_000_000_000, database_bytes:500_000_000, database_count:10,
 archive_soft_bytes:400_000_000, spare_database_slots:1,
 hot_target_bytes:350_000_000, hot_high_bytes:400_000_000,
 hot_critical_bytes:450_000_000, next_report_reserve_bytes:24_000_000,
 metadata_max_age_ms:30*60_000,
});
const integer=v=>Number.isSafeInteger(v)&&v>=0;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

export function freeStorageExpansionPlan({databases,complete,observed_ts,now=Date.now()}={}){
 const p=FREE_STORAGE_POLICY;
 const result={schema:'FREE_D1_EXPANSION_PLAN_V1',allowed:false,new_database_count:0,
  published_free_account_bytes:p.account_bytes,published_free_database_count:p.database_count,
  shared_query_limits_increased:false,paid_activation_allowed:false,sourceHTTP:0,SQL:0};
 if(!integer(now)||!integer(observed_ts)||observed_ts>now||now-observed_ts>p.metadata_max_age_ms||complete!==true||!Array.isArray(databases))return{...result,status:'FRESH_COMPLETE_ACCOUNT_INVENTORY_REQUIRED'};
 const ids=new Set();
 for(const d of databases){
  if(!UUID.test(d?.uuid||'')||ids.has(d.uuid)||typeof d.name!=='string'||!d.name||!integer(d.file_size))return{...result,status:'EXACT_ACCOUNT_DATABASE_SIZES_REQUIRED'};
  ids.add(d.uuid);
 }
 const used=databases.reduce((n,d)=>n+d.file_size,0);
 if(!integer(used))return{...result,status:'ACCOUNT_STORAGE_TOTAL_INVALID'};
 const spare=Math.max(0,p.database_count-databases.length-p.spare_database_slots);
 // Reserve the full 500 MB entitlement for each prospective database, even
 // though the archive writer stops at 400 MB. Include foreign project usage.
 const reservedExisting=databases.reduce((n,d)=>n+Math.max(d.file_size,p.database_bytes),0);
 const byBytes=Math.max(0,Math.floor((p.account_bytes-reservedExisting)/p.database_bytes));
 const count=Math.min(spare,byBytes);
 return{...result,status:count?'FREE_ARCHIVE_EXPANSION_HEADROOM_VERIFIED':'NO_VERIFIED_FREE_EXPANSION_HEADROOM',
  allowed:count>0,used_account_bytes:used,free_account_bytes:Math.max(0,p.account_bytes-used),
  existing_database_count:databases.length,reserved_spare_database_slots:p.spare_database_slots,
  existing_database_reserved_ceiling_bytes:reservedExisting,
  new_database_count:count,new_archive_operating_bytes:count*p.archive_soft_bytes,
  metadata_only_sizes:true,actual_provisioned_database_count:0,production_routes_changed:false};
}

export function rollingStorageDecision({used_bytes,projected_new_bytes_before_service,
 reclaimable_bytes,protected_bytes,maintenance_bytes_per_day,incoming_bytes_per_day,
 native_qualified,archive_readthrough_qualified,archive_has_headroom,day_admitted}={}){
 const p=FREE_STORAGE_POLICY;
 const out={schema:'ROLLING_STORAGE_DECISION_V1',maintenance_allowed:false,
  automatic_activation_allowed:false,capacity_sustainable:false,project_complete:false};
 if(![used_bytes,projected_new_bytes_before_service,reclaimable_bytes,protected_bytes,
  maintenance_bytes_per_day,incoming_bytes_per_day].every(integer)||protected_bytes>used_bytes||reclaimable_bytes>used_bytes-protected_bytes)
  return{...out,status:'MEASURED_STORAGE_AND_PROTECTED_DEPENDENCIES_REQUIRED'};
 const projected=used_bytes+projected_new_bytes_before_service+p.next_report_reserve_bytes;
 const sustainable=maintenance_bytes_per_day>incoming_bytes_per_day;
 const needed=Math.max(0,projected-p.hot_target_bytes);
 const due=projected>=p.hot_high_bytes;
 const qualified=native_qualified===true&&archive_readthrough_qualified===true&&archive_has_headroom===true;
 return{...out,status:!qualified?'STORAGE_PATH_QUALIFICATION_REQUIRED':!sustainable?'MAINTENANCE_THROUGHPUT_INSUFFICIENT':!due?'STORAGE_BELOW_HIGH_WATERMARK':day_admitted!==true?'STORAGE_MAINTENANCE_DAY_ADMISSION_REQUIRED':needed>reclaimable_bytes?'PROTECTED_DATA_PREVENTS_TARGET_RECOVERY':'BOUNDED_ROLLING_MAINTENANCE_DUE',
  projected_bytes_including_report_reserve:projected,required_reclaim_bytes:needed,
  capacity_sustainable:qualified&&sustainable,
  maintenance_allowed:qualified&&sustainable&&due&&day_admitted===true&&needed<=reclaimable_bytes,
  automatic_activation_allowed:qualified&&sustainable,
  critical:projected>=p.hot_critical_bytes,
  cleanup_cap_changes_authorized:false,protected_data_deletion_allowed:false,
  archive_headroom_verified:archive_has_headroom===true};
}
