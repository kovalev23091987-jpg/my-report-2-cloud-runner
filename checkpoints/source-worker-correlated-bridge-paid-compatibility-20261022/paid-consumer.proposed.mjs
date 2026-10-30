import fs from 'node:fs/promises';
import {makeGithubControl,acquireWeeklyPhaseLease,releaseWeeklyPhaseLease,borrowFourMirrorLease} from '../runner/github-bounded-phase-lease.mjs';
import {persistSlidingMirrorCursor} from '../runner/github-four-mirror-cas.mjs';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import {finalizeRunUsage} from '../runner/d1-preaction-budget-guard.mjs';
import {SLIDING_HISTORY_POLICY as P,slidingCapacityDecision,reserveCapacityExpiryBudget,expireOldDetails} from '../runner/sliding-history-capacity.mjs';
import {RETENTION_SQL_BRIDGE_PROOF,CORRELATED_RETENTION_SQL_BRIDGE_PROOF,createRetentionSQLBridgeCompatibility,requireRetentionControlReserve} from '../runner/retention-bridge-provenance.mjs';
import {reconcileNativeQueryCosts} from '../runner/native-query-cost-reconciliation.mjs';
const repository='kovalev23091987-jpg/my-report-2-cloud-runner',PHASE='checkpoints/CLOUD_PHASE_STATE_20261004.json',FENCE='audit-fixes/source-optimization-20260930/execution-lock.json';
const dir='audit-output/paid-sliding-history';await fs.mkdir(dir,{recursive:true});
const out={schema:'PAID_SLIDING_HISTORY_RUN_V1',head:process.env.GITHUB_SHA,run:process.env.GITHUB_RUN_ID,sourceHTTP:0,MAIN:0,Telegram:0,paid_plan_modified:false,quotas_reset:false,history_details_expired:false};
let controlHTTP=0,bridgeHTTP=0,lease,db,reservation,expected=process.env.GITHUB_SHA;
let bridgeCompatibility;
const cfToken=process.env.CLOUDFLARE_API_TOKEN;
const control=makeGithubControl({repository,token:process.env.GITHUB_TOKEN,fetch_impl:async(url,options)=>{if(++controlHTTP>40)throw Error('SLIDING_CONTROL_HTTP_CAP');return fetch(url,{...options,redirect:'error'});}});
async function cf(path){if(++controlHTTP>40)throw Error('SLIDING_CONTROL_HTTP_CAP');const token=path.startsWith('/d1/')?process.env.REPORT2_CANONICAL_ARCHIVE_D1_API_TOKEN:cfToken;const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+P.account_id+path,{headers:{authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('SLIDING_METADATA_HTTP_'+r.status);const j=await r.json();if(j.success!==true)throw Error('SLIDING_METADATA_ACK_REQUIRED');return j;}
async function guard(){
 const head=(await control.call('git/ref/heads/main')).object.sha;if(head!==expected)throw Error('SLIDING_MAIN_MOVED');
 const [p,f]=await Promise.all([control.read(PHASE,head),control.read(FENCE,head)]),l=p.value.lease;
 if(f.value.active||p.value.current_task!=='ALL_ACTIVE105_SOURCE_EFFICIENCY_IN_PROGRESS'||l?.owner!==lease?.lease.owner||l.expires_ts<=Date.now()||!l.scope?.startsWith('RETAINED_HISTORY.')||JSON.stringify(l)!==JSON.stringify(p.value.latest_own_bounded_continuation_lease)||p.value.active_working_state?.owned_lease!==l.owner)throw Error('SLIDING_EXACT_OWN_OWNER_REQUIRED');
 return p;
}
async function observe(stage){
 if(!bridgeCompatibility){
  if(stage!=='before_SQL')throw Error('RETENTION_COMPATIBILITY_BEFORE_REQUIRED');
  const [old_release_bytes,staged_receipt_bytes]=await Promise.all([fs.readFile(RETENTION_SQL_BRIDGE_PROOF.path),fs.readFile(CORRELATED_RETENTION_SQL_BRIDGE_PROOF.path)]);
  bridgeCompatibility=createRetentionSQLBridgeCompatibility({old_release_bytes,staged_receipt_bytes});
 }
 return bridgeCompatibility.observe({configured_bridge_url:process.env.REPORT2_D1_BRIDGE_URL,stage,call:async(name,suffix)=>(await cf(suffix==='/subdomain'?'/workers/subdomain':'/workers/scripts/'+name+suffix)).result});
}
try{
 if(process.env.GITHUB_REPOSITORY!==repository||!/^\d+$/.test(out.run||'')||!/^[a-f0-9]{40}$/.test(expected||''))throw Error('SLIDING_EXACT_REPOSITORY_RUN_REQUIRED');
 const policy=JSON.parse(await fs.readFile('checkpoints/OWNER_PAID_SLIDING_HISTORY_20261018.json','utf8'));
 if(policy.schema!==P.schema||policy.account_id!==P.account_id||policy.enabled!==true||policy.paid_UI_confirmed!==true||policy.owner_authorized_detail_expiry!==true||policy.account_ceiling_bytes!==P.account_ceiling_bytes)throw Error('EXACT_OWNER_SLIDING_POLICY_REQUIRED');
 if(process.env.BORROW_EXISTING_OWNER){
  lease=await borrowFourMirrorLease(control,{expected_main:expected,owner:process.env.BORROW_EXISTING_OWNER,scope_prefix:'RETAINED_HISTORY.'});
 }else{
  lease=await acquireWeeklyPhaseLease(control,{expected_main:expected,run_id:out.run,scope:'RETAINED_HISTORY. Owner18Oct paid Workers Paid and authorized volume-bounded expiry of oldest unreferenced rejected details; preserve current signals/latest per-asset originals/statistics/source clocks. Same two RETAINED_HISTORY slots/day and total3500000R70000W/164HTTP. New expiry operation<=48canonical+48proof bodies/20000R400W, archive48/5000R400W unchanged. Never clear unknown or refund quotas. Run '+out.run});
  if(!lease.allowed)throw Error(lease.status);expected=lease.head;
 }
 const phase=await guard();out.control={main:expected,owner:lease.lease.owner,lease_expires_ts:lease.lease.expires_ts,borrowed:lease.borrowed===true};
 const [settings,list]=await Promise.all([cf('/workers/account-settings'),cf('/d1/database?per_page=10&page=1')]);
 if(settings.result?.default_usage_model!=='standard')throw Error('OWNER_PAID_STANDARD_WORKERS_REQUIRED');
 const info=list.result_info;if(!Array.isArray(list.result)||!info||info.page!==1||info.count!==list.result.length||info.total_count!==list.result.length)throw Error('COMPLETE_STORAGE_ACCOUNT_LIST_REQUIRED');
 out.metadata={observed_ts:Date.now(),complete:true,databases:list.result.map(d=>({uuid:d.uuid,name:d.name,file_size:d.file_size})),default_usage_model:settings.result.default_usage_model,paid_basis:'OWNER_PAID_UI_CURRENT_PLAN_RETAINED_POLICY;SETTINGS_ALONE_NOT_BILLING_PROOF'};
 out.capacity=slidingCapacityDecision({...out.metadata,now:Date.now(),enabled:true,paid_confirmed:true});
 if(!out.capacity.allowed)throw Error(out.capacity.status);
 if(!out.capacity.due){out.status=out.capacity.status;out.D1_SQL=0;out.reservation_consumed=false;}
 else{
  out.bridge_before=await observe('before_SQL');
  // Both existing mutation guards, postflight and cleanup are held BEFORE SQL.
  out.pre_SQL_control_plan=requireRetentionControlReserve({used:controlHTTP,borrowed:lease.borrowed===true,bridge_postflight_pending:true},2);
  db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN,{nativeQueryReceipts:true,beforeRequest:event=>{if(bridgeHTTP>=16||event.wire_bytes>1400000||lease.lease.expires_ts<=Date.now())return{allowed:false};bridgeHTTP++;return{allowed:true};}});
  const reservation_id='RETAINED_HISTORY:'+out.run+':'+Date.now();out.admission=await reserveCapacityExpiryBudget(db,{reservation_id});
  if(!out.admission.allowed){out.status=out.admission.status;out.reservation_consumed=false;}
  else{
   reservation=reservation_id;out.reservation_consumed=true;
   const cursor=phase.value.active_working_state?.sliding_history_cursor??{canonical:0,evidence:0};
   out.expiry=await expireOldDetails({db,now:Date.now(),decision:out.capacity,source_cursor:cursor.canonical,evidence_cursor:cursor.evidence,before_modify:guard});
   out.history_details_expired=out.expiry.canonical_expired.length+out.expiry.full_evidence_expired.length>0;out.status=out.expiry.status;
  }
 }
}catch(error){out.status='SLIDING_HISTORY_NOT_CLOSED';out.reason=/^[A-Z0-9_:.]+$/.test(error.message)?error.message:'SLIDING_TRANSPORT_OR_RESPONSE_FAILURE';if(error.expiry_receipt){out.partial_expiry=error.expiry_receipt;out.history_details_expired=error.expiry_receipt.canonical_expired.length+error.expiry_receipt.full_evidence_expired.length>0;}process.exitCode=1;}
finally{
 if(db){
  if(reservation)try{out.finalized_usage=await finalizeRunUsage(db,{reservationId:reservation,sourceRunId:out.run,usage:db.usageSnapshot()});}catch{out.finalization_not_closed=true;process.exitCode=1;}
  out.D1=db.usageSnapshot();out.native_query_costs=db.nativeQueryCostReceipts();out.native_query_cost_reconciliation=reconcileNativeQueryCosts({journals:[out.native_query_costs],usage:out.D1});
  try{out.bridge_after=await observe('after_SQL');}catch{out.bridge_after_not_closed=true;process.exitCode=1;}
  // Cursor promotion requires exact known costs and the same installed bridge;
  // cursor710 for the lossless archive is never read or overwritten here.
  if(out.expiry&&out.finalized_usage?.unknown_ops===0&&out.D1.unknown_ops===0&&out.native_query_cost_reconciliation.statement_costs_closed&&!out.bridge_after_not_closed&&out.D1.rows_read<=P.reservation.rows_read&&out.D1.rows_written<=P.reservation.rows_written){
   try{const r=await persistSlidingMirrorCursor(control,{expected_main:expected,owner:lease.lease.owner,canonical:out.expiry.next_source_cursor,evidence:out.expiry.next_evidence_cursor,run_id:out.run});
    expected=r.head;lease.head=r.head;out.cursor_saved=true;
   }catch{out.cursor_not_closed=true;process.exitCode=1;}
  }
 }
 if(lease?.allowed&&!lease.borrowed)try{out.release=await releaseWeeklyPhaseLease(control,lease);}catch{out.release={status:'OWN_RELEASE_NOT_CLOSED'};process.exitCode=1;}
 out.completed_ts=Date.now();out.github_and_cloudflare_control_HTTP=controlHTTP;out.D1_bridge_HTTP=bridgeHTTP;out.whole_HTTP=controlHTTP+bridgeHTTP;
 out.full_report_restored=false;out.same_run_telegram_accepted=false;out.sustainable_capacity_accepted=false;
 await fs.writeFile(dir+'/result.json',JSON.stringify(out,null,2)+'\n');
 console.log(JSON.stringify({status:out.status,reason:out.reason,account_bytes:out.capacity?.account_bytes,details_expired:out.history_details_expired,whole_HTTP:out.whole_HTTP,D1:out.D1??null,reservation_consumed:out.reservation_consumed??false,own_release:out.release?.status}));
}
