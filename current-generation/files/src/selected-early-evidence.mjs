import {compareOrdinaryDeepCandidates} from './deep-candidate-order.mjs';
export function rankedEarlyPersistenceContracts(prefilter){
 const rows=Array.isArray(prefilter?.shortlist)?prefilter.shortlist:[];
 return [...rows].sort(compareOrdinaryDeepCandidates).slice(0,2).map(row=>String(row?.contract||'').trim()).filter(Boolean);
}

import {applyEarlyCandidateBridge} from './early-candidate-bridge.mjs';

// Refresh only the actual scheduler choice, before handoff identity is built.
// The sidecar reuses this cycle's market calculation and keeps at most two
// attempted candidate writes (discovery + selected); no source requests here.
export async function bindSelectedEarlyEvidence({target,env,scan,run_id,now_ts=Date.now()}={}){
 const contract=String(target?.contract||'').trim();
 if(!contract||!Number.isFinite(scan?.timestamp)||typeof env?.REPORT2_CURRENT_CYCLE_EARLY_PERSIST!=='function')return {status:'NOT_CONFIGURED',candidate:null};
 try{
  const result=await env.REPORT2_CURRENT_CYCLE_EARLY_PERSIST({current_scan_ts:scan.timestamp,source_run_id:run_id,now_ts:scan.timestamp,preferred_contracts:[contract],selected_only:true});
  if(!['CLOSED','PARTIAL'].includes(result?.status))return {status:result?.status||'NOT_CLOSED',candidate:null};
  const row=await env.DATA_DB.prepare(`SELECT e.*,f.observed_ts AS feature_observed_ts,f.long_evidence_domain_count,f.short_evidence_domain_count,f.feature_json,f.evidence_json
    FROM v3_early_candidate_wave e JOIN v3_early_feature_snapshot f ON f.contract_code=e.contract_code AND f.ts_bucket=CAST(e.last_seen_ts/300000 AS INTEGER)*300000
    WHERE e.contract_code=?1 AND e.last_seen_ts=?2 AND f.observed_ts=?2 AND e.shadow_only=1 AND e.lifecycle_stage NOT IN ('EXIT','EDGE_SPENT','EXCLUDE')
    ORDER BY e.generation DESC LIMIT 1`).bind(contract,scan.timestamp).first();
  if(!row)return {status:'SELECTED_EARLY_NOT_PERSISTED',candidate:null};
  const original=target._v3_discovery_source||{contract};
  const bridged=applyEarlyCandidateBridge({discovery_prefilter:{shortlist:[original],contract_telemetry:[original],counts:{}},scan,deep_check_queue:{queue:[{contract}]},early_rows:[row],now:now_ts});
  const candidate=bridged.shortlist.find(r=>r.contract===contract&&r.early_candidate_bridge===true);
  return {status:candidate?'CLOSED':'SELECTED_EARLY_NOT_QUALIFIED',candidate:candidate||null};
 }catch(error){return {status:'SELECTED_EARLY_LOAD_FAILED',candidate:null,error:String(error?.message||error).slice(0,180)};}
}
