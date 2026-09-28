export const EARLY_WAVE_CONTINUITY_VERSION='early-wave-continuity-v1-20260928';

const text=value=>value===null||value===undefined?'':String(value).trim();
const contractOf=row=>text(row?.contract??row?.contract_code).toUpperCase();
const finite=value=>{if(value===null||value===undefined||value==='')return null;const n=Number(value);return Number.isFinite(n)?n:null;};
const direction=value=>{const d=text(value).toUpperCase().replace(/_(?:WATCH|CANDIDATE|BIAS)$/u,'');return ['LONG','SHORT'].includes(d)?d:null;};

const BRIDGE_FIELDS=Object.freeze([
 'early_candidate_wave_id',
 'early_candidate_quality_0_100',
 'early_candidate_operational_priority_0_100',
 'early_candidate_evidence_domains',
 'early_candidate_direction_hint',
 'bridge_reason',
 'microstructure_priority_confirmed',
 'microstructure_priority_domains',
 'preselection_cross_venue_confirmed',
 'preselection_cross_venue_conflict',
 'preselection_metric_router',
]);

function qualifiedBridge(row){
 if(row?.early_candidate_bridge!==true)return false;
 if(!contractOf(row)||!text(row?.early_candidate_wave_id))return false;
 const score=finite(row?.early_candidate_quality_0_100);
 return score!==null&&score>=70&&direction(row?.early_candidate_direction_hint)!==null;
}

function bridgeFields(row){
 const out={early_candidate_bridge:true};
 for(const key of BRIDGE_FIELDS)if(row?.[key]!==undefined)out[key]=row[key];
 if(text(row?.wave_id)&&!text(out.wave_id))out.wave_id=row.wave_id;
 return out;
}

/*
 * Fast-Move and task-lane planning may rebuild shortlist rows from compact
 * telemetry.  That is allowed to change scheduling metadata, but it must not
 * detach an already-qualified Early wave from the same contract.  Restore only
 * the exact bridge that the upstream bridge accepted; never create a direction,
 * score or wave from raw/unqualified observations.
 */
export function preserveQualifiedEarlyWaveContinuity(adaptive_prefilter,qualified_prefilter){
 const adaptive=adaptive_prefilter&&typeof adaptive_prefilter==='object'?adaptive_prefilter:{};
 const sourceRows=Array.isArray(qualified_prefilter?.shortlist)?qualified_prefilter.shortlist:[];
 const qualifiedByContract=new Map(sourceRows.filter(qualifiedBridge).map(row=>[contractOf(row),row]));
 const adaptiveRows=Array.isArray(adaptive?.shortlist)?adaptive.shortlist:[];
 let restored=0;
 const shortlist=adaptiveRows.map(row=>{
  const source=qualifiedByContract.get(contractOf(row));
  if(!source)return row;
  restored++;
  return {...row,...bridgeFields(source)};
 });
 return {
  ...adaptive,
  shortlist,
  early_wave_continuity:{
   version:EARLY_WAVE_CONTINUITY_VERSION,
   qualified_source_rows:qualifiedByContract.size,
   restored_rows:restored,
   invented_rows:0,
  },
 };
}

export default{EARLY_WAVE_CONTINUITY_VERSION,preserveQualifiedEarlyWaveContinuity};
