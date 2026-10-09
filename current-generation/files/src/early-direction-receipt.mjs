import {normalizeDirectionCandidate} from './market-contracts.mjs';
const text=v=>v===null||v===undefined?'':String(v).trim(),arr=v=>Array.isArray(v)?v:[];
const finite=v=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null;
// A transport CLOSED receipt is not a closed directional assessment.
export function qualifyEarlyDirectionReceipt(discovery,decisionTs){
 const receipt=discovery?.early_candidate_receipt;
 const state=text(receipt?.direction_state).toUpperCase();
 const candidate=normalizeDirectionCandidate(receipt?.direction_hint??discovery?.early_candidate_direction_hint,{origin:'EARLY_CYCLE',source_ts:receipt?.source_ts??discovery?.early_candidate_source_ts,confirmation_state:state||'UNCONFIRMED'});
 const sourceTs=finite(receipt?.source_ts??receipt?.feature_observed_ts??discovery?.early_candidate_source_ts),availableAt=finite(receipt?.available_at??discovery?.early_candidate_available_at??sourceTs);
 const sameContract=text(receipt?.contract)!==''&&text(receipt?.contract)===text(discovery?.contract),sameWave=text(receipt?.wave_id)!==''&&text(receipt?.wave_id)===text(discovery?.early_candidate_wave_id??discovery?.wave_id);
 const fresh=sourceTs!==null&&availableAt!==null&&sourceTs<=decisionTs&&availableAt<=decisionTs&&decisionTs-sourceTs<=15*60_000;
 const evidence=arr(receipt?.evidence),matching=evidence.filter(row=>row?.status==='CLOSED'&&text(row?.side).toUpperCase()===candidate.direction),directed=matching.length>0;
 const directionStateClosed=['CLOSED','CONFIRMED','DIRECTION_CLOSED',`${candidate.direction}_WATCH`,`${candidate.direction}_CONFIRMED`].includes(state)&&['LONG','SHORT'].includes(candidate.direction);
 const closed=discovery?.early_candidate_bridge===true&&receipt?.status==='CLOSED'&&sameContract&&sameWave&&fresh&&directed&&directionStateClosed;
 const declared=arr(receipt?.evidence_ids).map(text),assigned=matching.map(row=>text(row?.evidence_id??row?.id)).filter(id=>id&&declared.includes(id));
 // An unbound list containing opposite or neutral facts cannot be relabelled as directional confirmation.
 const ids=assigned.length?assigned:matching.length===1&&evidence.length===1&&declared.length===1?declared:[];
 // Preserve every actually evaluated predicate, including simultaneous failures.
 // These diagnostics do not recalculate the producer's direction or alter a gate.
 const checks=[
  {predicate:'EARLY_BRIDGE_PRESENT',passed:discovery?.early_candidate_bridge===true},
  {predicate:'EARLY_TRANSPORT_CLOSED',passed:receipt?.status==='CLOSED'},
  {predicate:'EXACT_CONTRACT',passed:sameContract},
  {predicate:'EXACT_WAVE',passed:sameWave},
  {predicate:'SOURCE_CLOCK_PRESENT',passed:sourceTs!==null},
  {predicate:'SOURCE_NOT_AFTER_DECISION',passed:sourceTs!==null&&sourceTs<=decisionTs},
  {predicate:'AVAILABILITY_CLOCK_PRESENT',passed:availableAt!==null},
  {predicate:'AVAILABLE_AT_DECISION',passed:availableAt!==null&&availableAt<=decisionTs},
  {predicate:'SOURCE_WITHIN_15_MINUTES',passed:sourceTs!==null&&decisionTs-sourceTs<=15*60_000},
  {predicate:'ASSIGNED_DIRECTIONAL_FACT',passed:directed},
  {predicate:'DIRECTION_STATE_CLOSED',passed:directionStateClosed},
 ];
 const domains=side=>[...new Set(evidence.filter(row=>row?.status==='CLOSED'&&text(row?.side).toUpperCase()===side&&text(row?.domain)).map(row=>text(row.domain)))];
 const evidenceSummary={scope:'RETAINED_BRIDGE_EVIDENCE_ONLY',long_domains:domains('LONG'),short_domains:domains('SHORT'),raw_rows:evidence.length,producer_domain_counts_verified:false,independent_provider_count:null};
 return {closed,direction:closed?candidate.direction:null,candidate,source_ts:sourceTs,available_at:availableAt,same_contract:sameContract,same_wave:sameWave,fresh,directed,direction_state_closed:directionStateClosed,evidence_ids:[...new Set(ids)],unassigned_evidence_ids:declared.filter(id=>!ids.includes(id)),reason:closed?'CLOSED_ASSIGNED_DIRECTION_RECEIPT':!directionStateClosed?'EARLY_DIRECTION_STATE_NOT_CLOSED':!directed?'ASSIGNED_DIRECTIONAL_FACT_REQUIRED':'EARLY_IDENTITY_TIME_OR_STATUS_NOT_CLOSED',predicate_receipt:{schema:'EARLY_DIRECTION_PREDICATES_V1',decision_ts:finite(decisionTs),checks,failed_predicates:checks.filter(row=>!row.passed).map(row=>row.predicate),evidence_summary:evidenceSummary,diagnostic_only:true,changes_direction_or_entry_rules:false}};
}
