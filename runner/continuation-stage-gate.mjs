import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
export const PHASES=['CORE_BLOCKS','LIQUIDATION_COVERAGE','JOINT_REPORT','TELEGRAM'];
export const REQUIREMENTS={
 CORE_BLOCKS:['all_15_live_accepted','supported_market_scope_verified','source_data_and_consumption_verified','exact_identity_and_units_verified'],
 LIQUIDATION_COVERAGE:['all_future_assets_checked','all_eight_sources_checked','real_future_levels_only','same_core_universe','durable_database_verified','weekly_refresh_verified','manual_and_standalone_gate_verified'],
 JOINT_REPORT:['fresh_main_verified','actual_top_two_verified','core_and_liquidation_verified','raw_24h_flow_verified','canonical_binding_verified'],
 TELEGRAM:['actual_delivery_verified','same_run_canonical_verified','approved_format_verified','dedup_verified'],
};
export function checkState(state){
 if(state?.schema!=='report2-continuation-phase-state-v1'||!Array.isArray(state.phases)||state.phases.length!==4)throw Error('INVALID_PHASE_STATE');
 let unfinished=false;
 for(let i=0;i<PHASES.length;i++){
  const row=state.phases[i];if(row.id!==PHASES[i]||!['PENDING','IN_PROGRESS','VERIFIED'].includes(row.status))throw Error('INVALID_PHASE_ORDER_OR_STATUS');
  if(unfinished&&row.status!=='PENDING')throw Error('PREDECESSOR_NOT_VERIFIED');
  if(row.status!=='VERIFIED')unfinished=true;
  else if(!row.completion_receipt?.path||!/^[a-f0-9]{64}$/.test(row.completion_receipt.sha256||''))throw Error('VERIFIED_PHASE_REQUIRES_SAVED_PROOF');
 }
 const next=state.phases.find(p=>p.status!=='VERIFIED');if(state.current_phase!==(next?.id||'COMPLETE'))throw Error('CURRENT_PHASE_MISMATCH');
 return next;
}
export function acquireIteration(state,{owner,now,ttl_ms=7200000}={}){
 checkState(state);if(!/^HTX:[A-Za-z0-9:_-]{1,120}$/.test(owner||'')||!Number.isSafeInteger(now)||!Number.isSafeInteger(ttl_ms)||ttl_ms<60000||ttl_ms>7200000)throw Error('EXACT_ITERATION_OWNER_AND_CLOCK_REQUIRED');
 if(state.lease?.expires_ts>now&&state.lease.owner!==owner)throw Error('ANOTHER_ITERATION_ACTIVE');
 const result=structuredClone(state);result.lease={owner,acquired_ts:state.lease?.owner===owner?state.lease.acquired_ts:now,expires_ts:now+ttl_ms};result.updated_ts=now;return result;
}
export function finishPhase(state,{owner,now,proof,receipt}={}){
 const current=checkState(state);if(!current)throw Error('ALL_PHASES_ALREADY_VERIFIED');
 if(state.lease?.owner!==owner||!(state.lease.expires_ts>now))throw Error('ACTIVE_OWNED_ITERATION_REQUIRED');
 const amendment=state.owner_scope_amendment;
 const authorizedDeferral=current.id==='JOINT_REPORT'&&amendment?.id==='OWNER_RAW24H_DEFERRAL_20261004'&&amendment.deferred_metric==='EXACT_SIGNED_RAW_24H'&&amendment.joint_report_without_metric_authorized===true&&amendment.other_entry_rules_unchanged===true&&amendment.path==='checkpoints/OWNER_RAW24H_DEFERRAL_20261004.md'&&/^[a-f0-9]{64}$/.test(amendment.sha256||'');
 const requirements=REQUIREMENTS[current.id].filter(key=>!authorizedDeferral||key!=='raw_24h_flow_verified');
 if(proof?.phase!==current.id||proof?.status!=='CLOSED'||proof?.actual_evidence_verified!==true||!requirements.every(key=>proof[key]===true))throw Error('ACTUAL_PHASE_ACCEPTANCE_REQUIRED');
 if(authorizedDeferral&&proof.raw_24h_flow_verified!==true&&(proof.raw_24h_explicitly_excluded!==true||proof.raw_24h_included!==false||proof.owner_amendment_sha256!==amendment.sha256))throw Error('EXPLICIT_OWNER_RAW24H_OMISSION_PROOF_REQUIRED');
 if(!receipt?.path||!/^[a-f0-9]{64}$/.test(receipt.sha256||''))throw Error('EXACT_SAVED_COMPLETION_RECEIPT_REQUIRED');
 const result=structuredClone(state),index=PHASES.indexOf(current.id);result.phases[index]={...result.phases[index],status:'VERIFIED',completion_receipt:receipt,completed_ts:now};
 if(index+1<PHASES.length){result.phases[index+1].status='IN_PROGRESS';result.current_phase=PHASES[index+1];}else result.current_phase='COMPLETE';
 result.updated_ts=now;checkState(result);return result;
}
export function releaseIteration(state,{owner,now}={}){
 checkState(state);if(state.lease?.owner!==owner)throw Error('ONLY_CURRENT_OWNER_MAY_RELEASE');const result=structuredClone(state);result.lease=null;result.updated_ts=now;return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),filename=path.join(root,'checkpoints/CLOUD_PHASE_STATE_20261004.json'),state=JSON.parse(fs.readFileSync(filename,'utf8'));
 const command=process.argv[2]||'status',owner=process.argv[3],now=Date.now();let result=state;
 // Advancing requires a local saved proof, whose exact bytes are recorded.
 if(command==='acquire')result=acquireIteration(state,{owner,now});
 else if(command==='release')result=releaseIteration(state,{owner,now});
 else if(command==='advance'){
  const proofPath=path.resolve(root,process.argv[4]||'');if(!proofPath.startsWith(root+path.sep))throw Error('PROJECT_COMPLETION_PROOF_REQUIRED');
  const bytes=fs.readFileSync(proofPath),proof=JSON.parse(bytes);result=finishPhase(state,{owner,now,proof,receipt:{path:path.relative(root,proofPath),sha256:crypto.createHash('sha256').update(bytes).digest('hex')}});
 }else if(command!=='status')throw Error('UNKNOWN_PHASE_GATE_COMMAND');
 checkState(result);
 if(command!=='status')fs.writeFileSync(filename,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({current_phase:result.current_phase,phases:result.phases.map(r=>({id:r.id,status:r.status})),lease:result.lease,next_action:result.next_action,iteration_may_advance_automatically:false}));
}
