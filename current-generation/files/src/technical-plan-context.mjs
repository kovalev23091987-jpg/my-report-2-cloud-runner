import {buildEvidenceV2} from './evidence-source-adapters.mjs';

// Copy only the existing producer's closed, precommitted plan. This adapter
// does not choose a target, close an incomplete plan, or authorize an entry.
export function precommittedTechnicalPlanEvidence({scenario,contract,snapshot_id,observed_ts}={}){
 const finite=v=>typeof v==='number'&&Number.isFinite(v)&&v>0;
 if(scenario?.status!=='CLOSED'||scenario.scenario_identity_status!=='CLOSED'||scenario.required_evidence_status!=='CLOSED'||scenario.contract_code!==contract||scenario.snapshot_id!==snapshot_id||scenario.safety?.liquidation_as_target!==false||scenario.safety?.retroactive_scenario_selection!==false||!scenario.scenario_receipt_id||!['LONG','SHORT'].includes(scenario.direction)||![scenario.entry_trigger_price,scenario.target_price,scenario.invalidation_price].every(finite)||!Number.isSafeInteger(observed_ts)||!Number.isSafeInteger(scenario.valid_until_ts)||scenario.valid_until_ts<observed_ts)return[];
 const ordered=scenario.direction==='LONG'?scenario.invalidation_price<scenario.entry_trigger_price&&scenario.target_price>scenario.entry_trigger_price:scenario.invalidation_price>scenario.entry_trigger_price&&scenario.target_price<scenario.entry_trigger_price;
 if(!ordered)return[];
 return[buildEvidenceV2({provider_id:'PRIMARY_TECHNICAL_CONTEXT',upstream_id:'IMMUTABLE_HTX_CAMPAIGN_SCENARIO',asset_id:`htx-futures:${contract}`,htx_contract:contract,block_id:'N10',metric_family:'PRECOMMITTED_TECHNICAL_PLAN',origin_event_id:`${snapshot_id}:${scenario.scenario_receipt_id}`,dependency_group:`TECHNICAL_PLAN:${contract}:${snapshot_id}`,source_ts:observed_ts,observed_ts,expires_at:scenario.valid_until_ts,coverage_status:'PRECOMMITTED_SCENARIO_CONTEXT',coverage_fraction:0,directional_strength:null,risk_strength:null,extra:{snapshot_id,plan_status:'CLOSED',plan_direction:scenario.direction,entry_price:scenario.entry_trigger_price,target_price:scenario.target_price,invalidation_price:scenario.invalidation_price,scenario_receipt_id:scenario.scenario_receipt_id,liquidation_as_target:false,source_clock_policy:'ALREADY_VERIFIED_PLAN_AT_CANONICAL_DECISION',entry_authorized_by_context:false}})];
}
