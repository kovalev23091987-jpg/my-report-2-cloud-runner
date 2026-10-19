import {buildRoleEvidenceView} from './source-role-consumer.mjs';
// Internal run artifact only. Recheck the original receipt facts at the original
// decision clock, so diagnosing a refusal never needs another provider/D1 read.
// This does not authorize publication or mutate the canonical result.
// Bounded original proof fields, never an admission or a new failure reason.
// Missing/invalid values stay null; do not infer them from another metric.
const proofBoolean=v=>typeof v==='boolean'?v:null;
const proofEnum=(v,values)=>typeof v==='string'&&values.includes(v)?v:null;
function retainedFactProof(r){
 return{
  decision_usable:proofBoolean(r.decision_usable),
  fact_contract_status:proofEnum(r.fact_contract_status,['CLOSED','NOT_CLOSED']),
  identity_status:proofEnum(r.identity_status,['CLOSED','NOT_CLOSED']),
  identity_object_status:proofEnum(r.identity?.status,['CLOSED','NOT_CLOSED']),
  source_compatible:proofBoolean(r.source_compatible),
  freshness_status:proofEnum(r.freshness_status,['CURRENT_AT_OBSERVATION','STALE','FUTURE_SOURCE_TIME','NOT_CLOSED','OBSERVED_NO_SLA']),
  normalization_status:proofEnum(r.normalization_status,['EXPLICIT_NORMALIZED_VALUE','LEGACY_VALUE_PASSTHROUGH']),
 };
}
export function auditObservationSourceRoles(c){
 const stored=c?.metadata?.source_role_view,contract=String(c?.metadata?.contract||c?.candidates?.[0]?.contract||c?.candidates?.[0]?.ticker||c?.universe?.[0]?.contract||'').trim();
 const view=buildRoleEvidenceView(stored?.classified,{contract,observed_ts:c?.observed_ts}),usable=view.classified.filter(r=>r.role_evidence_usable===true),origins=[...new Set(usable.map(r=>r.independence_group).filter(Boolean))].sort();
 const htx=usable.some(r=>r.source_key==='HTX_OFFICIAL'&&r.assigned_roles.includes('EXECUTION_TRUTH')),reasons=[];
 if(stored?.status!=='CLOSED')reasons.push('STORED_SOURCE_ROLE_VIEW_NOT_CLOSED');if(!htx)reasons.push('VERIFIED_HTX_EXECUTION_ROLE_MISSING');if(origins.length<2)reasons.push('FEWER_THAN_TWO_VERIFIED_DISTINCT_ORIGINS');
 const exclusions={};for(const r of view.classified)if(r.role_exclusion_reason)exclusions[r.role_exclusion_reason]=(exclusions[r.role_exclusion_reason]||0)+1;
 const number=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
 return{schema:'ORIGINAL_OBSERVATION_SOURCE_ROLE_AUDIT_V1',contract,run_id:c?.run_id??null,snapshot_id:c?.snapshot_id??null,observed_ts:c?.observed_ts??null,status:reasons.length?'NOT_CLOSED':'CLOSED',observation_source_gate_closed:reasons.length===0,reasons,verified_HTX_execution:htx,distinct_verified_origins:origins,classified_receipt_count:view.classified.length,usable_role_receipt_count:usable.length,exclusion_reason_counts:exclusions,receipts:view.classified.slice(0,64).map(r=>({source_key:r.source_key,metric:/^[A-Z0-9_]{1,100}$/.test(String(r.metric||'').toUpperCase())?String(r.metric).toUpperCase():null,assigned_roles:r.assigned_roles,usable:r.role_evidence_usable===true,exclusion_reason:r.role_exclusion_reason,retained_fact_proof:retainedFactProof(r),independence_group:r.independence_group,event_ts:number(r.event_ts),received_ts:number(r.received_ts),max_age_sec:number(r.max_age_sec),normalized_value:r.role_evidence_usable?number(r.normalized_value):null})),omitted_receipt_details:Math.max(0,view.classified.length-64),revalidated_at_original_observation:true,not_a_current_source_refresh:true,decisions_changed:false,sourceHTTP:0,D1:0,internal_only:true};
}

// Technical projection only. These helpers never qualify a source or invent a
// refusal. A captured code is the existing function return, not provider raw.
const gateDiagnosticBytes=value=>new TextEncoder().encode(JSON.stringify(value)).length;
const gateDiagnosticFail=status=>{throw Error(status);};
const gateDiagnosticString=(value,pattern=/^[\p{L}\p{N}_:%. -]+$/u)=>{
 if(value===null||value===undefined)return null;
 if(typeof value!=='string')return gateDiagnosticFail('UNKNOWN');
 if(new TextEncoder().encode(value).length>128)return gateDiagnosticFail('OVERFLOW');
 if(!pattern.test(value)||/^0x[0-9a-f]{40}$/i.test(value))return gateDiagnosticFail('UNKNOWN');
 return value;
};
const gateDiagnosticCode=value=>gateDiagnosticString(value,/^[A-Z][A-Z0-9_]*$/);
const gateDiagnosticBoolean=value=>value===null||value===undefined?null:typeof value==='boolean'?value:gateDiagnosticFail('UNKNOWN');
const gateDiagnosticNumber=value=>value===null||value===undefined?null:typeof value==='number'&&Number.isFinite(value)?value:gateDiagnosticFail('UNKNOWN');
const gateDiagnosticContract=value=>gateDiagnosticString(value,/^[\p{L}\p{N}][\p{L}\p{N}_-]{0,31}-USDT$/u);
const gateBindingSchema='GATE_RETURNED_BINDING_DIAGNOSTIC_V1';
const gateBindingEmpty=(contract,carrier_status='UNKNOWN')=>({schema:gateBindingSchema,contract,carrier_status,status:null,reason:null});

export function captureGateBindingDiagnostic(result,{contract}={}){
 let exact=null;
 try{
  exact=gateDiagnosticContract(contract);if(!exact||!result||result.public_evidence?.contract_code!==exact||(result.binding&&result.binding.contract!==exact))return gateBindingEmpty(exact);
  if(!['CLOSED','NOT_CLOSED'].includes(result.status))return gateBindingEmpty(exact);
  const reason=gateDiagnosticCode(result.reason);
  const output={schema:gateBindingSchema,contract:exact,carrier_status:result.status==='NOT_CLOSED'&&reason===null?'UNKNOWN':'CAPTURED',status:result.status,reason};
  return gateDiagnosticBytes(output)<=512?output:gateBindingEmpty(exact,'OVERFLOW');
 }catch(error){return gateBindingEmpty(exact,error.message==='OVERFLOW'?'OVERFLOW':'UNKNOWN');}
}
function existingGateBindingDiagnostic(record,contract){
 const empty=status=>gateBindingEmpty(contract,status);
 if(!record)return empty('UNKNOWN');
 try{
  if(record.schema!==gateBindingSchema||record.contract!==contract||Object.keys(record).some(k=>!['schema','contract','carrier_status','status','reason'].includes(k)))return empty('UNKNOWN');
  if(!['CAPTURED','UNKNOWN','OVERFLOW'].includes(record.carrier_status))return empty('UNKNOWN');
  const status=record.status===null?null:['CLOSED','NOT_CLOSED'].includes(record.status)?record.status:gateDiagnosticFail('UNKNOWN');
  const output={schema:gateBindingSchema,contract,carrier_status:record.carrier_status,status,reason:gateDiagnosticCode(record.reason)};
  if(record.carrier_status==='CAPTURED'&&(!status||(status==='NOT_CLOSED'&&output.reason===null)))return empty('UNKNOWN');
  return gateDiagnosticBytes(output)<=512?output:empty('OVERFLOW');
 }catch(error){return empty(error.message==='OVERFLOW'?'OVERFLOW':'UNKNOWN');}
}
export function projectGateSourceDiagnostic(c,{binding_receipt=null}={}){
 let contract=null,output;
 try{
  contract=gateDiagnosticContract(c?.metadata?.contract);
  const canonical_tuple={contract,run_id:gateDiagnosticString(c?.run_id),snapshot_id:gateDiagnosticString(c?.snapshot_id),observed_ts:gateDiagnosticNumber(c?.observed_ts),analytical_fingerprint:gateDiagnosticString(c?.analytical_fingerprint,/^[a-f0-9]{64}$/)};
  output={schema:'GATE_STORED_NORMALIZED_DIAGNOSTIC_V1',contract,canonical_tuple,normalized_rows_status:'UNKNOWN',first_binding:existingGateBindingDiagnostic(typeof binding_receipt==='function'?binding_receipt(c):null,contract),rows:[],proof_scope:'STORED_NORMALIZED_AND_RETURNED_CODES_NOT_RAW_API_OR_ADMISSION'};
  if(!contract||!Array.isArray(c?.metadata?.source_role_view?.classified))return output;
  const metrics=['FUNDING_RATE','OI_CHANGE_1H','PRICE_CHANGE_4H','TAKER_BALANCE_1H_RAW'];
  const rows=c.metadata.source_role_view.classified.filter(r=>r?.source_key==='GATE_OFFICIAL'&&metrics.includes(String(r.metric||'').toUpperCase()));
  if(rows.length>4)return{...output,normalized_rows_status:'OVERFLOW'};
  if(!rows.length)return output;
  if(new Set(rows.map(r=>String(r.metric).toUpperCase())).size!==rows.length)return output;
  const projected=rows.map(r=>{
   if(r.contract_code!==contract||r.venue!=='GATE'||r.identity?.contract_code!==contract)return gateDiagnosticFail('UNKNOWN');
   const row={};
   for(const k of ['source_key','venue','status','legacy_status','fact_contract_status','identity_status','freshness_status','normalization_status','quality_status','reason_code'])row[k]=gateDiagnosticCode(r[k]);
   // Preserve the original spelling; selecting a metric does not rename it.
   row.metric=gateDiagnosticString(r.metric,/^[a-zA-Z0-9_]+$/);
   row.contract_code=contract;row.unit=gateDiagnosticString(r.unit,/^[a-zA-Z0-9_%./-]+$/);row.interval=gateDiagnosticString(r.interval,/^[a-zA-Z0-9_./-]+$/);
   for(const k of ['decision_usable','source_compatible'])row[k]=gateDiagnosticBoolean(r[k]);
   for(const k of ['event_ts','received_ts','max_age_sec','coverage_pct'])row[k]=gateDiagnosticNumber(r[k]);
   row.identity={};
   for(const k of ['status','base_asset','quote_asset','market_type','market_type_raw','multiplier_status','asset_identity_verification_method'])row.identity[k]=gateDiagnosticString(r.identity[k]);
   row.identity.contract_code=contract;
   row.identity.instrument_id=gateDiagnosticString(r.identity.instrument_id,/^[\p{L}\p{N}_-]+[_-]USDT$/u);
   row.identity.primary_market_id=gateDiagnosticString(r.identity.primary_market_id,/^[\p{L}\p{N}_-]+:[A-Z0-9_]+:[A-Z0-9_]+$/u);
   for(const k of ['multiplier_required_for_metric','symbol_verified','asset_identity_verified'])row.identity[k]=gateDiagnosticBoolean(r.identity[k]);
   return row;
  });
  const complete={...output,normalized_rows_status:'CAPTURED',rows:projected};
  return gateDiagnosticBytes(complete)<=8192?complete:{...output,normalized_rows_status:'OVERFLOW'};
 }catch(error){return{...(output||{schema:'GATE_STORED_NORMALIZED_DIAGNOSTIC_V1',contract,first_binding:gateBindingEmpty(contract),proof_scope:'STORED_NORMALIZED_AND_RETURNED_CODES_NOT_RAW_API_OR_ADMISSION'}),normalized_rows_status:error.message==='OVERFLOW'?'OVERFLOW':'UNKNOWN',rows:[]};}
}
