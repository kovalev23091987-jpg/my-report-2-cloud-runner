import fs from 'node:fs/promises';import crypto from 'node:crypto';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import {finalizeRunUsage} from '../runner/d1-preaction-budget-guard.mjs';
import {createUnifiedHttpBudget} from '../current-generation/files/src/unified-budget.mjs';
import {makeGithubControl,acquireWeeklyPhaseLease,releaseWeeklyPhaseLease} from '../runner/github-bounded-phase-lease.mjs';
import {LOSSLESS_RECOVERY_POLICY,reserveLosslessRecoveryBudget,recoverLosslessFullEvidence} from '../runner/lossless-full-evidence-recovery.mjs';
import {compactProtectedCanonical} from '../runner/protected-canonical-compaction.mjs';
import {PrivateArchiveD1API,combineMeasuredD1Usage} from '../runner/private-archive-d1-api.mjs';
const repository='kovalev23091987-jpg/my-report-2-cloud-runner',PHASE='checkpoints/CLOUD_PHASE_STATE_20261004.json',FENCE='audit-fixes/source-optimization-20260930/execution-lock.json',dir='audit-output/lossless-retained-history';
await fs.mkdir(dir,{recursive:true});
const kind=process.env.RETAINED_HISTORY_KIND||'full_evidence';
const out={schema:'LOSSLESS_RETAINED_HISTORY_CONTROL_V1',kind,head:process.env.GITHUB_SHA,run:process.env.GITHUB_RUN_ID,sourceHTTP:0,MAIN:0,Telegram:0,execute:process.env.LOSSLESS_EXECUTE==='true',canonical_rows_modified:0,source_reservations_reset:false};
const whole=createUnifiedHttpBudget(LOSSLESS_RECOVERY_POLICY.http_limits);let control_HTTP=0,bridge_HTTP=0,private_HTTP=0,db,archive_db,lease,admitted=false,reservation_id;
const nativeUsage=()=>archive_db?combineMeasuredD1Usage(db.usageSnapshot(),archive_db.usageSnapshot()):db.usageSnapshot();
const control=makeGithubControl({repository,token:process.env.GITHUB_TOKEN,fetch_impl:async(url,options)=>{
 if(control_HTTP>=LOSSLESS_RECOVERY_POLICY.max_control_HTTP)throw Error('RETAINED_GITHUB_CONTROL_BOUND');
 const grant=whole.reserve({logical_request_id:'RETAINED_GITHUB_CONTROL:'+control_HTTP,lane:'hot',attempts:1});if(!grant.allowed)throw Error('RETAINED_GITHUB_CONTROL_BOUND');control_HTTP++;
 return fetch(url,{...options,redirect:'error'});
}});
let expected=process.env.EXPECTED_MAIN||process.env.GITHUB_SHA;
async function guard(){
 if((await control.call('git/ref/heads/main')).object.sha!==expected)throw Error('RETAINED_MAIN_MOVED');
 const [p,f]=await Promise.all([control.read(PHASE,expected),control.read(FENCE,expected)]),l=p.value.lease;
 if(f.value.active||!l||l.owner!==lease?.lease?.owner||l.expires_ts<=Date.now()||p.value.latest_own_bounded_continuation_lease?.owner!==l.owner||p.value.active_working_state?.owned_lease!==l.owner)throw Error('RETAINED_OWN_GUARD_REQUIRED');
}
try{
 if(!/^\d+$/.test(String(out.run||''))||process.env.GITHUB_REPOSITORY!==repository)throw Error('EXACT_RETAINED_REPOSITORY_RUN_REQUIRED');
 if(!['full_evidence','canonical'].includes(kind))throw Error('EXACT_RETAINED_HISTORY_KIND_REQUIRED');
 // Preparation may retain originals. Hot-body replacement needs its own
 // measured native qualification; a code merge never enables it implicitly.
 if(kind==='canonical'&&out.execute&&process.env.REPORT2_CANONICAL_COMPACTION_ENABLED!=='true')throw Error('CANONICAL_COMPACTION_NATIVE_QUALIFICATION_NOT_ACTIVATED');
 if(process.env.BORROW_EXISTING_OWNER){
  const main=(await control.call('git/ref/heads/main')).object.sha;if(main!==expected)throw Error('RETAINED_MAIN_MOVED');
  const [p,f,s,r,g]=await Promise.all([control.read(PHASE,main),control.read(FENCE,main),control.read('checkpoints/CURRENT_PROJECT_STATUS.json',main),control.read('checkpoints/OWNER_REVIEW_RESUME_POINT_20261010.json',main),control.read('REPORT2_CURRENT_GENERATION.json',main)]);
  if(p.value.lease?.owner!==process.env.BORROW_EXISTING_OWNER||f.value.active||g.value.latest_only!==true||s.value.active_working_state?.owner_authorized_sequential_continuation!==true||r.value.active_working_state?.owner_authorized_sequential_continuation!==true)throw Error('EXACT_OWNER_AND_LATEST_AUTHORITY_REQUIRED');
  lease={borrowed:true,allowed:true,lease:p.value.lease,head:main};
 }else{
  if(process.env.REPORT2_LOSSLESS_RETENTION_ENABLED!=='true')throw Error('LOSSLESS_AUTOMATIC_RETENTION_NOT_ACTIVATED');
  lease=await acquireWeeklyPhaseLease(control,{run_id:out.run,expected_main:expected,scope:'Owner authorized bounded lossless old full-evidence retention/recovery, source clocks and canonical references protected. Existing caps, paused roles and forms unchanged. GitHub run '+out.run});
  if(!lease.allowed)throw Error(lease.status);expected=lease.head;
 }
 await guard();out.control={expected_main:expected,owner:lease.lease.owner,borrowed:lease.borrowed===true,lease_expires_ts:lease.lease.expires_ts};
 db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN,{beforeRequest:event=>{
  if(bridge_HTTP>=LOSSLESS_RECOVERY_POLICY.max_bridge_HTTP||event.wire_bytes>LOSSLESS_RECOVERY_POLICY.bridge_wire_bytes)throw Error('RETAINED_D1_TRANSPORT_BOUND');
  const grant=whole.reserve({logical_request_id:'RETAINED_D1_BRIDGE:'+bridge_HTTP,lane:'hot',attempts:1});if(grant.allowed)bridge_HTTP++;return grant;
 }});
 reservation_id='RETAINED_HISTORY:'+out.run+':'+Date.now();out.admission=await reserveLosslessRecoveryBudget(db,{reservation_id});admitted=out.admission.allowed;if(!admitted)throw Error(out.admission.status);
 if(kind==='canonical'){
  archive_db=new PrivateArchiveD1API({token:process.env.REPORT2_CANONICAL_ARCHIVE_D1_API_TOKEN,beforeRequest:()=>{
   const grant=whole.reserve({logical_request_id:'RETAINED_PRIVATE_D1:'+private_HTTP,lane:'background',attempts:1});if(grant.allowed)private_HTTP++;return grant;
  }});
  await archive_db.verifyDatabase();await archive_db.query('SELECT 1 AS size_marker');
  Object.assign(out,await compactProtectedCanonical({source_db:db,archive_db,archive_headroom:({max_copy_requests,reserved_native_readbacks})=>{
   const s=whole.summary();return s.limits.background-s.used.background>=max_copy_requests+reserved_native_readbacks&&s.remaining>=max_copy_requests+reserved_native_readbacks+5;
  },before_modify:guard,execute:out.execute,prefetch_private:process.env.REPORT2_PRIVATE_PREFETCH_QUALIFICATION==='true'}));
  out.canonical_rows_modified=out.compacted?.length||0;
 }else{
 const save_originals=async rows=>{
  const branch='report2-retained-history',parent=(await control.call('git/ref/heads/'+branch)).object.sha,treeBase=(await control.call('git/commits/'+parent)).tree.sha;
  const tree=await control.call('git/trees','POST',{base_tree:treeBase,tree:rows.map(s=>({path:s.path,mode:'100644',type:'blob',content:JSON.stringify(s.envelope)+'\n'}))});
  const written=await control.call('git/commits','POST',{message:'Preserve exact old full evidence before bounded recovery '+out.run,tree:tree.sha,parents:[parent]});
  if((await control.call('git/ref/heads/'+branch)).object.sha!==parent)throw Error('RETAINED_DURABLE_BRANCH_MOVED');
  await control.call('git/refs/heads/'+branch,'PATCH',{sha:written.sha,force:false});out.archive_commit=written.sha;return{commit:written.sha};
 };
 const secrets=Object.entries(process.env).filter(([k])=>/TOKEN|SECRET|KEY/.test(k)).map(([,v])=>v);
 Object.assign(out,await recoverLosslessFullEvidence({db,save_originals,fetch_archive:fetch,request_admit:e=>whole.reserve(e),before_modify:guard,execute:out.execute,secrets}));
 }
}catch(error){
 if(error.recovery_receipt)Object.assign(out,error.recovery_receipt);
 if(error.compaction_receipt)Object.assign(out,error.compaction_receipt);
 out.canonical_rows_modified=out.compacted?.length||0;
 out.status=error.recovery_receipt?.status||error.compaction_receipt?.status||'RETAINED_RECOVERY_NOT_ACTIVATED';out.reason=/^[A-Z0-9_]+$/.test(error.message)?error.message:'RETAINED_RECOVERY_ERROR';out.error_fingerprint=crypto.createHash('sha256').update(String(error.message)).digest('hex');
 if(admitted)process.exitCode=1;
}finally{
 if(admitted)try{out.finalized_usage=await finalizeRunUsage(db,{reservationId:reservation_id,sourceRunId:out.run,usage:nativeUsage()});}catch{out.native_finalization_not_acknowledged=true;process.exitCode=1;}
 if(db){out.D1=nativeUsage();if(archive_db)out.private_D1=archive_db.usageSnapshot();if(out.D1.unknown_ops||out.D1.rows_read>LOSSLESS_RECOVERY_POLICY.reservation.rows_read||out.D1.rows_written>LOSSLESS_RECOVERY_POLICY.reservation.rows_written){out.D1_envelope_not_closed=true;out.status='RETAINED_D1_ENVELOPE_NOT_CLOSED';process.exitCode=1;}}
 if(lease?.allowed&&!lease.borrowed)try{out.own_release=await releaseWeeklyPhaseLease(control,lease);if(out.own_release.status!=='OWN_WEEKLY_LEASE_RELEASED')process.exitCode=1;}catch{out.own_release_not_acknowledged=true;process.exitCode=1;}
 out.whole_HTTP=whole.summary();out.github_control_HTTP=control_HTTP;out.D1_bridge_HTTP=bridge_HTTP;out.private_D1_HTTP=private_HTTP;out.completed_ts=Date.now();out.history_discarded=false;out.project_complete=false;
 await fs.writeFile(dir+'/proof.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({status:out.status,reason:out.reason,selected:out.selected,moved:out.moved?.length,D1:out.D1,archive_commit:out.archive_commit,execute:out.execute,sourceHTTP:0}));
}
