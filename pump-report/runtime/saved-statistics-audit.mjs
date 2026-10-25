import {auditSavedCapsules,SAVED_CAPSULE_AUDIT_BOUNDS} from '../analytics/saved-capsule-audit.mjs';
import {createSummaryRecordIndex} from './summary-index.mjs';
import {textHash} from './text-hash.mjs';
import {validTime} from '../contracts/index.mjs';

const PLAN_SCHEMA='PUMP_PRECOMMITTED_COHORT_SPLIT_PLAN_V1',PLAN_PREFIX='pump:cohort-split-plan:v1:';
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
const fail=code=>{throw Object.assign(Error(code),{code});};

// A prospective operator preparation seam. A caller still needs its own actual
// native admission; the saved timestamp is the server clock, never user input.
export async function saveProspectiveAuditPlan({store,split_ts,clock=Date.now}){
  const declared_ts=clock();if(!validTime(split_ts)||split_ts<=declared_ts)fail('AUDIT_PROSPECTIVE_SPLIT_REQUIRED');
  const body={schema:PLAN_SCHEMA,split_ts,declared_ts},plan_id=await textHash(JSON.stringify(body));
  const plan={...body,plan_id},key=PLAN_PREFIX+plan_id;
  await store.atomic(key,current=>{if(current&&JSON.stringify(current)!==JSON.stringify(plan))fail('IMMUTABLE_AUDIT_PLAN_CONFLICT');return {state:current??plan,result:true};});
  if(JSON.stringify(await store.get(key))!==JSON.stringify(plan))fail('AUDIT_PLAN_READBACK_MISMATCH');
  return plan;
}

export async function readAuditPoint({store,key,max_bytes}){
  if(typeof key!=='string'||key.length>512||!Number.isSafeInteger(max_bytes)||max_bytes<1||max_bytes>524288)fail('BOUNDED_AUDIT_POINT_REQUIRED');
  if(typeof store.query==='function'){
    // Limit the returned JSON in SQL, before parsing or hydrating large originals.
    const r=await store.query('SELECT length(CAST(value_json AS BLOB)) AS bytes,CASE WHEN length(CAST(value_json AS BLOB))<=?2 THEN value_json ELSE NULL END AS value_json FROM pump_report_state_v1 WHERE state_key=?1 LIMIT 1',[key,max_bytes]);
    const row=r.results?.[0];if(!row)return null;
    if(!Number.isSafeInteger(row.bytes)||row.bytes>max_bytes||typeof row.value_json!=='string')fail('AUDIT_POINT_BYTES_EXCEEDED');
    return JSON.parse(row.value_json);
  }
  const value=await store.get(key);if(bytes(value)>max_bytes)fail('AUDIT_POINT_BYTES_EXCEEDED');return value;
}

export function createSavedStatisticsAudit({store,clock=Date.now}){
  const index=createSummaryRecordIndex({store});
  return async function audit({after=0,limit=10,plan_id}={}){
    if(!Number.isSafeInteger(after)||after<0||!Number.isSafeInteger(limit)||limit<1||limit>10||!digest(plan_id))fail('SAVED_AUDIT_BOUND_AND_PLAN_REQUIRED');
    const as_of_ts=clock(),plan=await readAuditPoint({store,key:PLAN_PREFIX+plan_id,max_bytes:4096});
    if(!plan||plan.schema!==PLAN_SCHEMA||plan.plan_id!==plan_id||!validTime(plan.declared_ts)||!validTime(plan.split_ts)||plan.declared_ts>=plan.split_ts||plan.declared_ts>as_of_ts||await textHash(JSON.stringify({schema:plan.schema,split_ts:plan.split_ts,declared_ts:plan.declared_ts}))!==plan_id)fail('SAVED_AUDIT_PRECOMMITTED_PLAN_REQUIRED');
    const page=await index.readPage({after,limit});
    if(!page.migration_ready)return {status:'SUMMARY_INDEX_NOT_READY',records_audited:0,source_cursor:after,source_records_at_boundary:page.total,probability_pct:null,publication_allowed:false,source_history_complete:false};
    const records=[];let recordBytes=2;
    for(const item of page.items){
      const row=await readAuditPoint({store,key:item.id,max_bytes:SAVED_CAPSULE_AUDIT_BOUNDS.records_bytes});
      if(!row||row.record_id!==item.id||item.id!=='pump:summary-record:'+await textHash(JSON.stringify({origin:row.origin,publication:row.publication,outcome:row.outcome})))fail('SAVED_AUDIT_SOURCE_RECORD_HASH_MISMATCH');
      recordBytes+=bytes(row)+1;if(recordBytes>SAVED_CAPSULE_AUDIT_BOUNDS.records_bytes)fail('SAVED_AUDIT_SOURCE_PAGE_BYTES_EXCEEDED');records.push(row);
    }
    const audit=await auditSavedCapsules({records,read:key=>readAuditPoint({store,key,max_bytes:SAVED_CAPSULE_AUDIT_BOUNDS.read_value_bytes}),as_of_ts,split_plan:{split_ts:plan.split_ts,declared_ts:plan.declared_ts,plan_ref:PLAN_PREFIX+plan_id}});
    const boundary=await index.boundary(),cursor=page.items.at(-1)?.seq??after;
    return {status:'SAVED_PAGE_AUDITED_NOT_CALIBRATED',as_of_ts,plan_id,source_cursor:cursor,source_records_at_boundary:page.total,has_more:cursor<page.total,source_boundary_changed:boundary.count!==page.total||boundary.pending||!boundary.ready,records_audited:records.length,source_history_complete:false,whole_history_complete:false,probability_pct:null,publication_allowed:false,audit};
  };
}
