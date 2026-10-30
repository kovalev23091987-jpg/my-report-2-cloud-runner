import fs from 'node:fs/promises';import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import {reconcileNativeQueryCosts} from '../runner/native-query-cost-reconciliation.mjs';
import {finalizeRunUsage} from '../runner/d1-preaction-budget-guard.mjs';
import {createUnifiedHttpBudget} from '../current-generation/files/src/unified-budget.mjs';
import {makeGithubControl,acquireWeeklyPhaseLease,releaseWeeklyPhaseLease,borrowFourMirrorLease} from '../runner/github-bounded-phase-lease.mjs';
import {LOSSLESS_RECOVERY_POLICY,reserveLosslessRecoveryBudget,recoverLosslessFullEvidence} from '../runner/lossless-full-evidence-recovery.mjs';
import {compactProtectedCanonical} from '../runner/protected-canonical-compaction.mjs';
import {canonicalExecutionMode,canonicalArchivePoolQualification,canonicalSharedMutationQualification} from '../runner/canonical-native-qualification.mjs';
import {selectCanonicalRetentionCursor,persistCanonicalRetentionCursor} from '../runner/canonical-retention-cursor.mjs';
import {requireDatedRetentionQualification,verifyExactArchiveReaderBindings,parseCurrentArchiveReaderProof,CURRENT_ARCHIVE_READER_PROOF,DATED_RETENTION_QUALIFICATION} from '../runner/retention-self-qualification.mjs';
import {RETENTION_SQL_BRIDGE_PROOF,CORRELATED_RETENTION_SQL_BRIDGE_PROOF,createRetentionSQLBridgeCompatibility,retentionMutationControlPlan,requireRetentionControlReserve} from '../runner/retention-bridge-provenance.mjs';
import {boundedControlBody,SQL_BRIDGE_SCRIPT} from '../runner/installed-bridge-module-inspection.mjs';
import {createPrivateArchivePool} from '../runner/private-archive-pool.mjs';
import {PrivateArchiveD1API,combineMeasuredD1Usage} from '../runner/private-archive-d1-api.mjs';
const repository='kovalev23091987-jpg/my-report-2-cloud-runner',PHASE='checkpoints/CLOUD_PHASE_STATE_20261004.json',FENCE='audit-fixes/source-optimization-20260930/execution-lock.json',dir='audit-output/lossless-retained-history';
await fs.mkdir(dir,{recursive:true});
const kind=process.env.RETAINED_HISTORY_KIND||'full_evidence';
const owner_emergency_day=String(process.env.REPORT2_OWNER_STORAGE_EMERGENCY_DAY||'')||null;
const canonical_cursor_input=String(process.env.REPORT2_CANONICAL_SOURCE_CURSOR||'auto');
let cursor_selection,bridge_proof,bridge_control,bridge_postflight_pending=false,future_archive_controls=0;
const native_qualification_input=String(process.env.REPORT2_NATIVE_CANONICAL_QUALIFICATION||'false');
const self_day=String(process.env.REPORT2_SELF_NATIVE_QUALIFICATION_UTC_DAY||''),self_qualification=!!self_day;
const owner_slot_input=String(process.env.REPORT2_OWNER_STORAGE_EMERGENCY_SLOT||'3'),owner_emergency_slot=Number(owner_slot_input);
const emergency=owner_emergency_day==='2026-10-15'&&new Date().toISOString().slice(0,10)===owner_emergency_day;
const out={schema:'LOSSLESS_RETAINED_HISTORY_CONTROL_V1',kind,head:process.env.GITHUB_SHA,run:process.env.GITHUB_RUN_ID,sourceHTTP:0,MAIN:0,Telegram:0,execute:process.env.LOSSLESS_EXECUTE==='true',canonical_rows_modified:0,source_reservations_reset:false};
const whole=createUnifiedHttpBudget(LOSSLESS_RECOVERY_POLICY.http_limits);let control_HTTP=0,worker_control_HTTP=0,bridge_HTTP=0,private_HTTP=0,db,archive_db,archive_pool,lease,admitted=false,reservation_id,mode;
const nativeUsage=()=>archive_db?combineMeasuredD1Usage(db.usageSnapshot(),(archive_pool||archive_db).usageSnapshot()):db.usageSnapshot();
const control=makeGithubControl({repository,token:process.env.GITHUB_TOKEN,fetch_impl:async(url,options)=>{
 if(control_HTTP+worker_control_HTTP>=LOSSLESS_RECOVERY_POLICY.max_control_HTTP)throw Error('RETAINED_GITHUB_CONTROL_BOUND');
 const grant=whole.reserve({logical_request_id:'RETAINED_GITHUB_CONTROL:'+control_HTTP,lane:'hot',attempts:1});if(!grant.allowed)throw Error('RETAINED_GITHUB_CONTROL_BOUND');control_HTTP++;
 return fetch(url,{...options,redirect:'error'});
}});
let expected=process.env.EXPECTED_MAIN||process.env.GITHUB_SHA;
async function guard(){
 if((await control.call('git/ref/heads/main')).object.sha!==expected)throw Error('RETAINED_MAIN_MOVED');
 const [p,f]=await Promise.all([control.read(PHASE,expected),control.read(FENCE,expected)]),l=p.value.lease;
 if(f.value.active||!l||l.owner!==lease?.lease?.owner||l.expires_ts<=Date.now()||!l.scope?.startsWith('RETAINED_HISTORY.')||p.value.latest_own_bounded_continuation_lease?.owner!==l.owner||p.value.active_working_state?.owned_lease!==l.owner)throw Error('RETAINED_OWN_GUARD_REQUIRED');
 return p.value;
}
try{
 if(!/^\d+$/.test(String(out.run||''))||process.env.GITHUB_REPOSITORY!==repository)throw Error('EXACT_RETAINED_REPOSITORY_RUN_REQUIRED');
 selectCanonicalRetentionCursor(canonical_cursor_input);
 if(!['full_evidence','canonical'].includes(kind))throw Error('EXACT_RETAINED_HISTORY_KIND_REQUIRED');
 if(!['3','4'].includes(owner_slot_input)||(owner_emergency_slot===4&&!emergency))throw Error('EXACT_OWNER_EMERGENCY_SLOT_REQUIRED');
 if(owner_emergency_day!==null&&(!emergency||process.env.GITHUB_EVENT_NAME!=='workflow_dispatch'||!process.env.BORROW_EXISTING_OWNER||kind!=='canonical'||!out.execute||process.env.REPORT2_PRIVATE_PREFETCH_QUALIFICATION!=='true'))throw Error('EXACT_MANUAL_CANONICAL_EMERGENCY_REQUIRED');
 // Preparation may retain originals. Hot-body replacement needs its own
 // measured native qualification; a code merge never enables it implicitly.
 if(!['true','false'].includes(native_qualification_input))throw Error('EXACT_NATIVE_QUALIFICATION_INPUT_REQUIRED');
 if(self_qualification){
  out.dated_authority=requireDatedRetentionQualification({day:self_day,event:process.env.GITHUB_EVENT_NAME,workflow:process.env.GITHUB_WORKFLOW,kind,execute:out.execute,prefetch:process.env.REPORT2_PRIVATE_PREFETCH_QUALIFICATION==='true',native_qualification:native_qualification_input==='true'});
  if(process.env.BORROW_EXISTING_OWNER||emergency||process.env.REPORT2_CANONICAL_COMPACTION_ENABLED==='true'||process.env.REPORT2_LOSSLESS_RETENTION_ENABLED==='true')throw Error('DATED_QUALIFICATION_MUST_NOT_ENABLE_AUTOMATIC_ROTATION');
  const tested_head=process.env.REPORT2_NATIVE_QUALIFIED_HEAD,tested_run=process.env.REPORT2_NATIVE_QUALIFIED_RUN;
  if(!/^[a-f0-9]{40}$/.test(tested_head||'')||!/^\d+$/.test(tested_run||'')||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()!==tested_head)throw Error('EXACT_DATED_QUALIFIED_CHECKOUT_REQUIRED');
  const main=(await control.call('git/ref/heads/main')).object.sha,qualified=await control.call('actions/runs/'+tested_run),tree=await control.call('git/trees/'+main+'?recursive=1');
  if(qualified.head_sha!==tested_head||qualified.conclusion!=='success'||qualified.name!=='LIQ assembled spot and 105 admission offline'||tree.truncated||!Array.isArray(tree.tree))throw Error('EXACT_DATED_CLOUD_QUALIFICATION_REQUIRED');
  const files=execFileSync('git',['ls-files','-z','runner/*.mjs','current-generation/files/*.mjs','current-generation/files/*.js','cloudflare/*.mjs','cloudflare/*.js','tools/recover-lossless-retained-history-20261014.mjs','.github/workflows/retained-history-native-qualification-20261016.yml'],{encoding:'utf8'}).split('\0').filter(Boolean),blobs=new Map(tree.tree.filter(r=>r.type==='blob').map(r=>[r.path,r.sha]));
  for(const p of files){const b=await fs.readFile(p),hash=crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob '+b.length+'\0'),b])).digest('hex');if(blobs.get(p)!==hash)throw Error('DATED_QUALIFIED_CODE_DIFFERS_FROM_CURRENT_MAIN');}
  out.qualified={head:tested_head,run:Number(tested_run),exact_executable_files:files.length,current_main:main};expected=main;
 }
 mode=canonicalExecutionMode({kind,execute:out.execute,enabled:process.env.REPORT2_CANONICAL_COMPACTION_ENABLED==='true',emergency,event:process.env.GITHUB_EVENT_NAME,borrowed_owner:process.env.BORROW_EXISTING_OWNER,prefetch:process.env.REPORT2_PRIVATE_PREFETCH_QUALIFICATION==='true',native_qualification:native_qualification_input==='true',self_qualification});
 out.canonical_execution_mode=mode;
 const pool_qualification=canonicalArchivePoolQualification(process.env.REPORT2_CANONICAL_ARCHIVE_POOL_QUALIFICATION||'false',{mode,event:process.env.GITHUB_EVENT_NAME,borrowed_owner:process.env.BORROW_EXISTING_OWNER});
 if(process.env.BORROW_EXISTING_OWNER){
  lease=await borrowFourMirrorLease(control,{expected_main:expected,owner:process.env.BORROW_EXISTING_OWNER,scope_prefix:'RETAINED_HISTORY.',required_authority:'owner_authorized_sequential_continuation'});
 }else{
  if(process.env.REPORT2_LOSSLESS_RETENTION_ENABLED!=='true'&&!self_qualification)throw Error('LOSSLESS_AUTOMATIC_RETENTION_NOT_ACTIVATED');
  lease=await acquireWeeklyPhaseLease(control,{run_id:out.run,expected_main:expected,scope:'RETAINED_HISTORY. Owner authorized bounded lossless old full-evidence retention/recovery, source clocks and canonical references protected. Existing caps, paused roles and forms unchanged. GitHub run '+out.run});
  if(!lease.allowed)throw Error(lease.status);expected=lease.head;
 }
 const guarded=await guard();if(kind==='canonical'){cursor_selection=selectCanonicalRetentionCursor(canonical_cursor_input,guarded.active_working_state?.canonical_retention_cursor??null);out.cursor_selection=cursor_selection;}out.control={expected_main:expected,owner:lease.lease.owner,borrowed:lease.borrowed===true,lease_expires_ts:lease.lease.expires_ts};
 if(mode.native_qualification){
  // Preserve the expired dated qualification's original pin. A later ordinary
  // manual qualification uses the exact newer native code-repair receipt.
  const current=!self_qualification;
  const proof=current?parseCurrentArchiveReaderProof(await fs.readFile(CURRENT_ARCHIVE_READER_PROOF.path)):JSON.parse(await fs.readFile('checkpoints/free-storage-20261015/readers-38797445363.json','utf8'));
  const call=async(name,suffix)=>{
   if(!['my-report-2-hub','my-report-2-liq-forecast-history'].includes(name)||!/^\/(?:deployments|settings|schedules|versions\/[a-f0-9-]+)$/.test(suffix)||worker_control_HTTP>=8||control_HTTP+worker_control_HTTP>=LOSSLESS_RECOVERY_POLICY.max_control_HTTP)throw Error('DATED_READER_CONTROL_BOUND');
   const grant=whole.reserve({logical_request_id:'DATED_READER_CONTROL:'+worker_control_HTTP,lane:'hot',attempts:1});if(!grant.allowed)throw Error('DATED_READER_CONTROL_BOUND');worker_control_HTTP++;
   const r=await fetch('https://api.cloudflare.com/client/v4/accounts/70ee0af85191ea470e74c7383fdec772/workers/scripts/'+name+suffix,{headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN},redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('DATED_READER_HTTP_'+r.status);const j=await r.json();if(!j.success||!j.result)throw Error('DATED_READER_ACK_REQUIRED');return j.result;
  };
  out.current_readers=await verifyExactArchiveReaderBindings({proof,call,expected_reader_run:current?CURRENT_ARCHIVE_READER_PROOF.run:DATED_RETENTION_QUALIFICATION.native_readers_run});
  if(current){
   bridge_proof=createRetentionSQLBridgeCompatibility({old_release_bytes:await fs.readFile(RETENTION_SQL_BRIDGE_PROOF.path),staged_receipt_bytes:await fs.readFile(CORRELATED_RETENTION_SQL_BRIDGE_PROOF.path)});
   let bridge_metadata_HTTP=0;
   bridge_control=async(name,suffix)=>{
    if(name!==SQL_BRIDGE_SCRIPT||!/^\/(?:subdomain|deployments|settings|schedules|versions\/[a-f0-9-]{36})$/.test(suffix)||bridge_metadata_HTTP>=9||control_HTTP+worker_control_HTTP>=LOSSLESS_RECOVERY_POLICY.max_control_HTTP)throw Error('RETENTION_BRIDGE_CONTROL_BOUND');
    const grant=whole.reserve({logical_request_id:'RETENTION_BRIDGE_METADATA:'+bridge_metadata_HTTP,lane:'hot',attempts:1});if(!grant.allowed)throw Error('RETENTION_BRIDGE_CONTROL_BOUND');bridge_metadata_HTTP++;worker_control_HTTP++;
    const root='https://api.cloudflare.com/client/v4/accounts/70ee0af85191ea470e74c7383fdec772/workers',url=root+(suffix==='/subdomain'?'/subdomain':'/scripts/'+name+suffix);
    const r=await fetch(url,{method:'GET',headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN},redirect:'error',signal:AbortSignal.timeout(15000)});
    if(!r.ok){await r.body?.cancel();throw Error('RETENTION_BRIDGE_CONTROL_HTTP_'+r.status);}
    let j;try{j=JSON.parse((await boundedControlBody(r,262144)).toString('utf8'));}catch{throw Error('RETENTION_BRIDGE_CONTROL_BODY_REQUIRED');}
    if(j?.success!==true||!j.result)throw Error('RETENTION_BRIDGE_CONTROL_ACK_REQUIRED');return j.result;
   };
   out.SQL_bridge_before=await bridge_proof.observe({call:bridge_control,configured_bridge_url:process.env.REPORT2_D1_BRIDGE_URL,stage:'before_SQL'});
   bridge_postflight_pending=true;
  }
  if(control_HTTP+worker_control_HTTP+13+(bridge_postflight_pending?4:0)>LOSSLESS_RECOVERY_POLICY.max_control_HTTP)throw Error('DATED_QUALIFICATION_MUTATION_AND_RELEASE_RESERVE_REQUIRED');
 }
 future_archive_controls=kind==='full_evidence'?6:0;
 // The qualified ordinary borrowed native path admitted only three batches.
 // Cheaper GitHub acquisition does not expand that native scope.
 const admitted_batch_bound=kind==='canonical'&&mode.native_qualification&&!self_qualification?3:6;
 out.pre_SQL_control_plan=requireRetentionControlReserve({used:control_HTTP+worker_control_HTTP,borrowed:lease.borrowed===true,bridge_postflight_pending,future_archive_controls,admitted_batch_bound},out.execute?1:0);
 db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN,{nativeQueryReceipts:mode.native_qualification,beforeRequest:event=>{
  if(bridge_HTTP>=LOSSLESS_RECOVERY_POLICY.max_bridge_HTTP||event.wire_bytes>LOSSLESS_RECOVERY_POLICY.bridge_wire_bytes)throw Error('RETAINED_D1_TRANSPORT_BOUND');
  const grant=whole.reserve({logical_request_id:'RETAINED_D1_BRIDGE:'+bridge_HTTP,lane:'hot',attempts:1});if(grant.allowed)bridge_HTTP++;return grant;
 }});
 reservation_id='RETAINED_HISTORY:'+out.run+':'+Date.now();out.admission=await reserveLosslessRecoveryBudget(db,{reservation_id,owner_emergency_day,owner_emergency_slot});admitted=out.admission.allowed;if(!admitted)throw Error(out.admission.status);
 if(kind==='canonical'){
  const pool_enabled=process.env.REPORT2_CANONICAL_ARCHIVE_POOL_ENABLED==='true'||pool_qualification;
  out.pool_enabled_only_for_manual_qualification=pool_qualification;
  const shared_mutation=canonicalSharedMutationQualification({mode,pool_enabled});
  out.shared_mutation_only_for_manual_native_qualification=shared_mutation;
  const archive_options={token:process.env.REPORT2_CANONICAL_ARCHIVE_D1_API_TOKEN,nativeQueryReceipts:mode.native_qualification,beforeRequest:()=>{
   const grant=whole.reserve({logical_request_id:'RETAINED_PRIVATE_D1:'+private_HTTP,lane:'background',attempts:1});if(grant.allowed)private_HTTP++;return grant;
  }};
  archive_pool=pool_enabled?createPrivateArchivePool({enabled:true,...archive_options}):null;archive_db=archive_pool?.legacy_db??new PrivateArchiveD1API(archive_options);
  await archive_db.verifyDatabase();await archive_db.query('SELECT 1 AS size_marker');
  const control_plan=retentionMutationControlPlan({used:control_HTTP+worker_control_HTTP,borrowed:lease.borrowed===true,bridge_postflight_pending,admitted_batch_bound}),max_mutation_batches=control_plan.max_mutation_batches;out.control_plan=control_plan;out.control_limited_mutation_batches=max_mutation_batches;
  Object.assign(out,await compactProtectedCanonical({source_db:db,archive_db,archive_pool,shared_mutation,batch_private_copies:shared_mutation&&mode.native_qualification&&out.execute===true,source_cursor:cursor_selection.cursor,max_mutation_batches,discovery_headroom:({max_bridge_requests,reserved_bridge_requests})=>bridge_HTTP+max_bridge_requests+reserved_bridge_requests<=LOSSLESS_RECOVERY_POLICY.max_bridge_HTTP,archive_headroom:({max_copy_requests,reserved_native_readbacks})=>{
   const s=whole.summary();return s.limits.background-s.used.background>=max_copy_requests+reserved_native_readbacks&&s.remaining>=max_copy_requests+reserved_native_readbacks+5;
  },before_modify:async()=>{if(retentionMutationControlPlan({used:control_HTTP+worker_control_HTTP,borrowed:lease.borrowed===true,bridge_postflight_pending,admitted_batch_bound}).max_mutation_batches<1)throw Error('CANONICAL_CURSOR_AND_RELEASE_CONTROL_RESERVE_REQUIRED');await guard();},execute:out.execute,prefetch_private:process.env.REPORT2_PRIVATE_PREFETCH_QUALIFICATION==='true',require_native_preflight:mode.require_native_preflight}));
  out.canonical_rows_modified=out.compacted?.length||0;
 }else{
 const save_originals=async rows=>{
  const branch='report2-retained-history',parent=(await control.call('git/ref/heads/'+branch)).object.sha,treeBase=(await control.call('git/commits/'+parent)).tree.sha;
  const tree=await control.call('git/trees','POST',{base_tree:treeBase,tree:rows.map(s=>({path:s.path,mode:'100644',type:'blob',content:JSON.stringify(s.envelope)+'\n'}))});
  const written=await control.call('git/commits','POST',{message:'Preserve exact old full evidence before bounded recovery '+out.run,tree:tree.sha,parents:[parent]});
  if((await control.call('git/ref/heads/'+branch)).object.sha!==parent)throw Error('RETAINED_DURABLE_BRANCH_MOVED');
  await control.call('git/refs/heads/'+branch,'PATCH',{sha:written.sha,force:false});future_archive_controls=0;out.archive_commit=written.sha;return{commit:written.sha};
 };
 const secrets=Object.entries(process.env).filter(([k])=>/TOKEN|SECRET|KEY/.test(k)).map(([,v])=>v);
 Object.assign(out,await recoverLosslessFullEvidence({db,save_originals,fetch_archive:fetch,request_admit:e=>whole.reserve(e),before_modify:async()=>{requireRetentionControlReserve({used:control_HTTP+worker_control_HTTP,borrowed:lease.borrowed===true,bridge_postflight_pending,future_archive_controls},1);await guard();},execute:out.execute,secrets}));
 }
}catch(error){
 if(error.recovery_receipt)Object.assign(out,error.recovery_receipt);
 if(error.compaction_receipt)Object.assign(out,error.compaction_receipt);
 out.canonical_rows_modified=out.compacted?.length||0;
 out.status=error.recovery_receipt?.status||error.compaction_receipt?.status||'RETAINED_RECOVERY_NOT_ACTIVATED';out.reason=/^[A-Z0-9_]+$/.test(error.message)?error.message:'RETAINED_RECOVERY_ERROR';out.error_fingerprint=crypto.createHash('sha256').update(String(error.message)).digest('hex');
 if(admitted)process.exitCode=1;
}finally{
 if(admitted)try{out.finalized_usage=await finalizeRunUsage(db,{reservationId:reservation_id,sourceRunId:out.run,usage:nativeUsage()});}catch{out.native_finalization_not_acknowledged=true;process.exitCode=1;}
 if(bridge_postflight_pending&&db)try{
  if(lease.lease.expires_ts<=Date.now())throw Error('RETENTION_BRIDGE_POSTFLIGHT_OWN_LEASE_EXPIRED');
  out.SQL_bridge_after=await bridge_proof.observe({call:bridge_control,stage:'after_SQL'});bridge_postflight_pending=false;
 }catch(e){out.SQL_bridge_provenance_incomplete=true;out.SQL_bridge_postflight_reason=/^[A-Z0-9_]+$/.test(e.message)?e.message:'RETENTION_BRIDGE_POSTFLIGHT_ERROR';process.exitCode=1;}
 if(db){out.D1=nativeUsage();if(archive_db)out.private_D1=(archive_pool||archive_db).usageSnapshot();if(out.D1.unknown_ops||out.D1.rows_read>LOSSLESS_RECOVERY_POLICY.reservation.rows_read||out.D1.rows_written>LOSSLESS_RECOVERY_POLICY.reservation.rows_written){out.D1_envelope_not_closed=true;out.status='RETAINED_D1_ENVELOPE_NOT_CLOSED';process.exitCode=1;}}
 if(mode?.native_qualification&&db){
  out.native_query_costs={bridge:db.nativeQueryCostReceipts(),private:archive_pool?.nativeQueryCostReceipts?.()??(archive_db?{LEGACY:archive_db.nativeQueryCostReceipts()}:{}),additional_SQL:0,SQL_params_results_exported:false};
  const journals=[out.native_query_costs.bridge,...Object.values(out.native_query_costs.private)];
  out.native_query_cost_reconciliation=reconcileNativeQueryCosts({journals,usage:out.D1});
  if(out.SQL_bridge_provenance_incomplete||journals.some(j=>!j||j.overflow)||!out.native_query_cost_reconciliation.client_day_attribution_closed){out.native_query_cost_journal_incomplete=true;process.exitCode=1;}
 }
 if(admitted&&kind==='canonical'&&cursor_selection&&!out.native_finalization_not_acknowledged&&!out.SQL_bridge_provenance_incomplete)try{out.cursor_persistence=await persistCanonicalRetentionCursor(control,{expected_main:expected,owner:lease.lease.owner,selection:cursor_selection,outcome:out,run_id:out.run});if(out.cursor_persistence.head){expected=out.cursor_persistence.head;lease.head=expected;}}catch(e){out.cursor_persistence={status:'CANONICAL_CURSOR_NOT_SAVED',reason:/^[A-Z0-9_]+$/.test(e.message)?e.message:'CANONICAL_CURSOR_ERROR'};process.exitCode=1;}
 if(lease?.allowed&&!lease.borrowed)try{out.own_release=await releaseWeeklyPhaseLease(control,lease);if(out.own_release.status!=='OWN_WEEKLY_LEASE_RELEASED')process.exitCode=1;}catch{out.own_release_not_acknowledged=true;process.exitCode=1;}
 out.whole_HTTP=whole.summary();out.github_control_HTTP=control_HTTP;out.worker_control_HTTP=worker_control_HTTP;out.D1_bridge_HTTP=bridge_HTTP;out.private_D1_HTTP=private_HTTP;out.completed_ts=Date.now();out.history_discarded=false;out.project_complete=false;
 await fs.writeFile(dir+'/proof.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({status:out.status,reason:out.reason,selected:out.selected,moved:out.moved?.length,D1:out.D1,archive_commit:out.archive_commit,execute:out.execute,sourceHTTP:0}));
}
