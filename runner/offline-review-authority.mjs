import {checkWeeklyGithubProposal} from './htx-weekly-proposal-check.mjs';
const PHASE='checkpoints/CLOUD_PHASE_STATE_20261004.json',FENCE='audit-fixes/source-optimization-20260930/execution-lock.json',SHA=/^[a-f0-9]{40}$/;
// This current owner family may run offline validation only while every live
// lease mirror identifies the same bounded all-active105 continuation.
function boundedActive105Owner(phase,now,ownerPattern){
 const l=phase?.lease,m=phase?.latest_own_bounded_continuation_lease,a=phase?.active_working_state;
 return phase?.current_task==='ALL_ACTIVE105_SOURCE_EFFICIENCY_IN_PROGRESS'&&
  phase.owner_all_active_blocks_source_budget_and_fallback==='checkpoints/OWNER_ALL_ACTIVE_BLOCKS_SOURCE_BUDGET_AND_FALLBACK_20261013.json'&&
  ownerPattern.test(l?.owner||'')&&l.owner.endsWith(':'+l.acquired_ts)&&
  Number.isSafeInteger(now)&&Number.isSafeInteger(l.acquired_ts)&&Number.isSafeInteger(l.expires_ts)&&
  l.acquired_ts<=now&&now<l.expires_ts&&l.expires_ts-l.acquired_ts<=90*60_000&&SHA.test(l.expected_main||'')&&
  typeof l.scope==='string'&&l.scope.length>0&&m?.owner===l.owner&&m.acquired_ts===l.acquired_ts&&m.expires_ts===l.expires_ts&&
  a?.owned_lease===l.owner&&a.owned_lease_expires_ts===l.expires_ts&&a.lease_released===false;
}
export function active105OfflineReviewOwner(phase,now=Date.now()){
 return boundedActive105Owner(phase,now,/^CODEX:ACTIVE105_SOURCE_RELIABILITY:\d+$/);
}
export function freeStorageOfflineReviewOwner(phase,now=Date.now()){
 return boundedActive105Owner(phase,now,/^CODEX:ACTIVE105_FREE_STORAGE_ROLLING:\d+$/)&&
  phase.lease.scope.includes('Owner-authorized permanent free storage')&&phase.lease.scope.includes('no paid plan');
}
// A code proposal must not carry/release a newer live lease. A phase-only
// advance of main can be retained by the merge without copying that lease
// into every candidate branch. Any intervening non-phase file fails closed.
export function offlineLeaseAuthority(p){return{lease:p?.lease??null,latest_own_bounded_continuation_lease:p?.latest_own_bounded_continuation_lease??null,last_released_lease:p?.last_released_lease??null,latest_lease_release:p?.latest_lease_release??null,active:Object.fromEntries(['owned_lease','owned_lease_expires_ts','lease_released','last_owned_lease_released'].map(k=>[k,p?.active_working_state?.[k]??null]))};}
export async function verifyOfflineReviewAuthority(control,{head,base,branch,now=Date.now()}={}){
 if(!SHA.test(head||'')||!SHA.test(base||'')||typeof branch!=='string'||!Number.isSafeInteger(now))throw Error('EXACT_OFFLINE_REVIEW_REQUIRED');
 const main=(await control.call('git/ref/heads/main')).object.sha;
 const [p,f,h]=await Promise.all([control.read(PHASE,main),control.read(FENCE,main),control.read(PHASE,head)]),l=p.value.lease;
 if(!/^CODEX:/.test(l?.owner||'')||!Number.isSafeInteger(l?.acquired_ts)||!Number.isSafeInteger(l?.expires_ts)||l.acquired_ts>now||l.expires_ts<=now||f.value.active||p.value.latest_own_bounded_continuation_lease?.owner!==l.owner||p.value.active_working_state?.owned_lease!==l.owner)throw Error('OWNER_OR_FENCE_BLOCKED');
 let status;
 if(/^maintenance\/htx-weekly-\d{4}-\d{2}-\d{2}-\d+$/.test(branch)){
  const receipt=await control.read('checkpoints/HTX_WEEKLY_SCOPE_PROPOSAL.json',head);
  await checkWeeklyGithubProposal(control,{head,expected_main:main,source_run:receipt.value.source_run,branch,now});status='EXACT_DATA_ONLY_WEEKLY_LIVE_OWNER';
 }else if(main===base&&JSON.stringify(offlineLeaseAuthority(h.value))===JSON.stringify(offlineLeaseAuthority(p.value))){status='EXACT_MATCHING_LIVE_BRANCH_LEASE';}
 else{
  const comparison=await control.call('compare/'+main+'...'+head),ancestor=comparison?.merge_base_commit?.sha;
  if(!SHA.test(ancestor||''))throw Error('OFFLINE_EXACT_MERGE_BASE_REQUIRED');
  const [old,advance]=await Promise.all([control.read(PHASE,ancestor),control.call('compare/'+ancestor+'...'+main)]);
  if(!['ahead','identical'].includes(advance.status)||advance.merge_base_commit?.sha!==ancestor||!Array.isArray(advance.files)||advance.files.some(v=>v.filename!==PHASE||v.status==='removed'||v.status==='renamed')||JSON.stringify(offlineLeaseAuthority(old.value))!==JSON.stringify(offlineLeaseAuthority(h.value)))throw Error('OFFLINE_CODE_OR_AUTHORITY_MOVED');
  status='PHASE_ONLY_MAIN_ADVANCE_CANDIDATE_AUTHORITY_UNCHANGED';
 }
 if((await control.call('git/ref/heads/main')).object.sha!==main)throw Error('MAIN_MOVED_DURING_OFFLINE_REVIEW');
 return{status,main,head,live_owner:l.owner,lease_expires_ts:l.expires_ts,sourceHTTP:0,D1:0,production_activation_allowed:false};
}
