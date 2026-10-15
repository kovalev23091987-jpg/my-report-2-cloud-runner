// Capacity is not throughput. This calculation never changes a quota or turns
// on maintenance; observed native admission and useful eligible bytes remain
// mandatory even when an arithmetic row envelope is large enough.
export function storageThroughputPlan({full_runs_day=36,manual_full_runs_day=11,finalists=2,body_kinds=['canonical','full_evidence'],slots_day=2,rows_slot=48,observed_rows_slot=null,unknown_families=[],known_day=null}={}){
 const ints=[full_runs_day,manual_full_runs_day,finalists,slots_day,rows_slot];
 if(ints.some(n=>!Number.isSafeInteger(n)||n<0)||finalists!==2||full_runs_day!==36||rows_slot!==48||!Array.isArray(body_kinds)||body_kinds.length!==2||new Set(body_kinds).size!==2||body_kinds.some(k=>!['canonical','full_evidence'].includes(k))||observed_rows_slot!==null&&(!Number.isSafeInteger(observed_rows_slot)||observed_rows_slot<0||observed_rows_slot>rows_slot))throw Error('EXACT_STORAGE_THROUGHPUT_INPUT_REQUIRED');
 const scheduled=full_runs_day*finalists*body_kinds.length,incoming=(full_runs_day+manual_full_runs_day)*finalists*body_kinds.length,capacity=slots_day*rows_slot;
 const minimum_catchup_slots=Math.floor(incoming/rows_slot)+1;
 const actual_capacity=observed_rows_slot===null?null:slots_day*observed_rows_slot;
 return{schema:'FREE_HISTORY_THROUGHPUT_PLAN_V1',scheduled_rows_day:scheduled,planned_rows_day_with_manual:incoming,
  each_body_kind_rows_day:(full_runs_day+manual_full_runs_day)*finalists,existing_max_rows_day:capacity,
  arithmetic_backlog_rows_day:Math.max(0,incoming-capacity),existing_row_envelope_sufficient:capacity>incoming,
  observed_max_rows_day:actual_capacity,minimum_catchup_slots_at_full48:minimum_catchup_slots,
  proposal_only:{slots_day:minimum_catchup_slots,rows_read:minimum_catchup_slots*5000,rows_written:minimum_catchup_slots*400,owner_approval_required:minimum_catchup_slots>slots_day},
  known_day_is_complete:unknown_families.length===0&&known_day?.native_complete===true,
  unknown_families:[...unknown_families],byte_growth_qualified:false,protected_rows_eligible:false,
  native_maintenance_throughput_qualified:observed_rows_slot!==null&&actual_capacity>incoming,
  sustainability_proved:false,automatic_activation:false,limits_changed:false,sourceHTTP:0,D1_SQL:0};
}
