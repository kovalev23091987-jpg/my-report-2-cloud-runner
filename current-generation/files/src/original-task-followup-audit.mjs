// Technical projection of an already selected, bound task before terminal writes.
// No database/source action or trading authority is created by this serializer.
const text=v=>typeof v==='string'&&v.length>0&&v.length<=256?v:null;
const stamp=v=>Number.isSafeInteger(v)&&v>=0?v:null;
const count=v=>Number.isSafeInteger(v)&&v>=0?v:null;
const positive=v=>typeof v==='number'&&Number.isFinite(v)&&v>0?v:null;
const summary=r=>r&&typeof r==='object'&&!Array.isArray(r)?{
 schema:text(r.schema),status:text(r.status),reason:text(r.reason),
 checked_ts:stamp(r.checked_ts),completed_ts:stamp(r.completed_ts),
 publication_id:text(r.publication_id)
}:null;

export function originalTaskFollowupAudit({task,canonical,now_ts}={}){
 const out={schema:'EXISTING_ORIGINAL_TASK_FOLLOWUP_AUDIT_V1',
  basis:'EXISTING_BOUND_TERMINAL_SELECTION_REPLY_BEFORE_REMOVAL_WRITES',
  status:'UNKNOWN',task:null,last_result_state:'UNKNOWN',last_result:null,
  retained_light_checks:[],light_history_scope:'RETAINED_INPUT_ONLY_NOT_ALL_EXECUTED_CHECKS',
  retained_light_history_complete:false,discarded_light_checks:null,full_analysis:null,
  source_HTTP_added:0,SQL_added:0,entry_authorized:false,actual_ENTRY:null};
 const t=task,c=canonical,now=stamp(now_ts),message=String(t?.telegram_message_id??'');
 if(!t||!c||now===null||!text(t.task_id)||!text(t.publication_id)||
  c.metadata?.contract!==t.contract_code||c.direction!==t.direction||
  c.run_id!==t.run_id||c.snapshot_id!==t.snapshot_id||
  c.trigger?.next_recheck_ts!==t.due_ts||c.trigger?.expires_ts!==t.expires_ts||
  !text(c.analytical_fingerprint)||!/^([1-9][0-9]*)$/.test(message)||
  !Number.isSafeInteger(Number(message)))return out;
 out.status='PRODUCER_BOUND_EXISTING_TASK_INPUT';
 out.task={task_id:text(t.task_id),publication_id:text(t.publication_id),
  contract:text(t.contract_code),direction:text(t.direction),wave_id:text(t.wave_id),
  run_id:text(t.run_id),snapshot_id:text(t.snapshot_id),state:text(t.state),
  due_ts:stamp(t.due_ts),expires_ts:stamp(t.expires_ts),updated_ts:stamp(t.updated_ts),
  attempt_count:count(t.attempt_count),original_message_id:text(String(t.telegram_message_id)),
  projected_at_ts:now};
 // Bound parsing work; this is not a claim about native wire/body limits.
 if(t.last_result===null||t.last_result===undefined||t.last_result===''){
  out.last_result_state='MISSING_RETAINED_RESULT';return out;
 }
 if(typeof t.last_result!=='string'||t.last_result.length>16384){
  out.last_result_state='RESULT_NOT_PROJECTED_TYPE_OR_16384_CODE_UNIT_BOUND';return out;
 }
 let r;try{r=JSON.parse(t.last_result);}catch{
  out.last_result_state='INVALID_RETAINED_JSON';return out;
 }
 if(!r||typeof r!=='object'||Array.isArray(r)){
  out.last_result_state='INVALID_RETAINED_OBJECT';return out;
 }
 out.last_result_state='PARSED_RETAINED_OBJECT';out.last_result=summary(r);
 const parent=r.schema==='LIGHT_PRICE_RECHECK_V1'?r:r.original_light_price_receipt;
 const expected={task_id:t.task_id,publication_id:t.publication_id,run_id:t.run_id,
  snapshot_id:t.snapshot_id,analytical_fingerprint:c.analytical_fingerprint,
  telegram_message_id:String(t.telegram_message_id)};
 const bound=p=>p&&Object.entries(expected).every(([k,v])=>p[k]===v);
 if(parent?.schema==='LIGHT_PRICE_RECHECK_V1'&&bound(parent)){
  const prior=Array.isArray(parent.prior_checks)?parent.prior_checks:[];
  const rows=[...prior.slice(-6),...(parent.first_trigger_receipt?[parent.first_trigger_receipt]:[]),parent];
  const seen=new Set();let discarded=Math.max(0,prior.length-6);
  for(const p of rows){
   const checked=stamp(p?.checked_ts),source=stamp(p?.source_ts),observed=stamp(p?.observed_ts),price=positive(p?.price);
   const wrongIdentity=Object.entries(expected).some(([k,v])=>p?.[k]!==undefined&&p[k]!==v);
   const priced=['TRIGGER_PRICE_REACHED_FULL_ANALYSIS_REQUIRED','WAITING_FOR_PRICE','CANCELLED'].includes(p?.status);
   if(p?.schema!=='LIGHT_PRICE_RECHECK_V1'||wrongIdentity||
    p.entry_authorized!==false||p.full_analysis_completed!==false||
    checked===null||checked>now||!text(p.status)||p.settlement_confirmed===true||
    (priced&&price===null)||(p.price!==undefined&&price===null)||
    (price!==null&&(p.source!=='HTX_OFFICIAL_COLLECTOR'||source===null||observed===null||
     source<c.observed_ts||source>observed||observed>checked||checked-source>180000))){discarded++;continue;}
   const row={...summary(p),price,source:text(p.source),source_ts:source,observed_ts:observed,
    identity_binding:p===parent?'BOUND_PARENT_RECEIPT':'RETAINED_WITHIN_BOUND_PARENT_RECEIPT',
    settlement_confirmed:p.settlement_confirmed===true?true:p.settlement_confirmed===false?false:null,
    entry_authorized:false,full_analysis_completed:false};
   const key=JSON.stringify([checked,p.status,p.reason??null,price,source,observed]);
   if(!seen.has(key)){seen.add(key);out.retained_light_checks.push(row);}
  }
  out.discarded_light_checks=discarded;
 }else if(parent!==null&&parent!==undefined){
  out.light_binding_status='RETAINED_PARENT_IDENTITY_NOT_CONFIRMED';
 }
 const f=r.full_analysis_receipt;
 if(f&&f.task_id===t.task_id&&f.publication_id===t.publication_id&&
  f.original_run_id===t.run_id&&f.original_snapshot_id===t.snapshot_id&&
  f.original_fingerprint===c.analytical_fingerprint&&f.direction===t.direction&&
  f.original_expires_ts===t.expires_ts&&stamp(f.checked_ts)!==null&&f.checked_ts<=now){
  out.full_analysis={...summary(f),identity_binding:'BOUND_RETAINED_FULL_ANALYSIS_RECEIPT',
   settlement_confirmed:typeof f.settlement_confirmed==='boolean'?f.settlement_confirmed:null};
 }
 return out;
}
