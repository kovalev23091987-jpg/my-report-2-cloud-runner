// Projection of already returned scheduler values. No claim, SQL, HTTP or clock.
const bool=v=>typeof v==='boolean'?v:null;
const integer=v=>Number.isSafeInteger(v)&&v>=0?v:null;
const token=v=>typeof v==='string'&&/^[A-Za-z0-9_:./-]{1,128}$/.test(v)?v:null;
function project(value,fields){
 if(value===null||value===undefined)return null;
 return Object.fromEntries(Object.entries(fields).map(([key,normalize])=>[key,normalize(value[key])]));
}
export function buildMaintenanceCadenceReceipt({source,unified_enabled,scheduled_minute_utc,low_priority_cadence_due,claim=null,completion=null}={}){
 return {
  schema:'LOW_PRIORITY_MAINTENANCE_CADENCE_RECEIPT_V1',
  source:token(source),unified_enabled:bool(unified_enabled),
  scheduled_minute_utc:Number.isSafeInteger(scheduled_minute_utc)&&scheduled_minute_utc>=0&&scheduled_minute_utc<60?scheduled_minute_utc:null,
  low_priority_cadence_due:bool(low_priority_cadence_due),
  claim:project(claim,{status:token,claimed:bool,due:bool,job_key:token,interval_ms:integer,last_success_ts:integer,next_due_ts:integer,lease_owner:token,lease_started_ts:integer,lease_expires_ts:integer}),
  completion:project(completion,{status:token,completed:bool,success_recorded:bool}),
  projection_SQL_added:0,projection_HTTP_added:0,
 };
}
