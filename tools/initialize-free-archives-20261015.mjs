import fs from 'node:fs/promises';
import {makeGithubControl} from '../runner/github-bounded-phase-lease.mjs';
import {active105OfflineReviewOwner} from '../runner/offline-review-authority.mjs';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import {createPrivateArchivePool} from '../runner/private-archive-pool.mjs';
import {combineMeasuredD1Usage} from '../runner/private-archive-d1-api.mjs';
import {initializeFreeArchiveSchemas,reserveFreeArchiveSchemaBudget,FREE_ARCHIVE_SCHEMA_POLICY as P} from '../runner/free-archive-schema.mjs';
import {finalizeRunUsage} from '../runner/d1-preaction-budget-guard.mjs';
import {createUnifiedHttpBudget} from '../current-generation/files/src/unified-budget.mjs';
const repository='kovalev23091987-jpg/my-report-2-cloud-runner',requestPath='checkpoints/FREE_ARCHIVE_SCHEMA_REQUEST_20261015.json',dir='audit-output/free-archive-schema';
await fs.mkdir(dir,{recursive:true});
const out={schema:'FREE_ARCHIVE_SCHEMA_CONTROL_V1',head:process.env.GITHUB_SHA,cloud_run:process.env.GITHUB_RUN_ID,sourceHTTP:0,MAIN:0,Telegram:0,existing_main_rows_modified:0,retained_history_slots_used:0,paid_activation:false,writer_enabled:false};
const whole=createUnifiedHttpBudget({whole_job:164,hot:96,background:56,statistics:12});
let control_HTTP=0,bridge_HTTP=0,private_HTTP=0,source,pool,admitted=false,id;
const usage=()=>pool?combineMeasuredD1Usage(source.usageSnapshot(),pool.usageSnapshot()):source.usageSnapshot();
try{
 const request=JSON.parse(await fs.readFile(requestPath,'utf8'));
 if(request.execute!==true)out.status='FREE_ARCHIVE_DDL_NOT_REQUESTED';
 else{
  if(process.env.GITHUB_REPOSITORY!==repository||!/^\d+$/.test(process.env.GITHUB_RUN_ID||'')||request.paid_activation!==false||request.existing_body_changes!==0||request.maximum_databases!==4)throw Error('FREE_ARCHIVE_SCHEMA_EXACT_REQUEST_REQUIRED');
  const control=makeGithubControl({repository,token:process.env.GITHUB_TOKEN,fetch_impl:(url,options)=>{
   if(options.method!=='GET'||control_HTTP>=32)throw Error('FREE_ARCHIVE_SCHEMA_GITHUB_BOUND');const g=whole.reserve({logical_request_id:'SCHEMA_CONTROL:'+control_HTTP,lane:'hot',attempts:1});if(!g.allowed)throw Error('FREE_ARCHIVE_SCHEMA_HTTP_DENIED');control_HTTP++;return fetch(url,{...options,redirect:'error'});
  }});
  const guard=async()=>{
   const main=(await control.call('git/ref/heads/main')).object.sha;if(main!==request.expected_main)throw Error('FREE_ARCHIVE_SCHEMA_MAIN_MOVED');
   const [phase,fence]=await Promise.all([control.read('checkpoints/CLOUD_PHASE_STATE_20261004.json',main),control.read('audit-fixes/source-optimization-20260930/execution-lock.json',main)]);
   const l=phase.value.lease;
   if(fence.value.active||!active105OfflineReviewOwner(phase.value)||l.owner!==request.expected_owner||!l.scope.includes('FREE_ARCHIVE_SCHEMA_INITIALIZATION')||l.scope.includes('No live D1 SQL')||l.expires_ts-Date.now()<60000)throw Error('FREE_ARCHIVE_SCHEMA_EXACT_SQL_LEASE_REQUIRED');
  };
  const cloud=await control.call('actions/runs/'+request.qualified_run);
  if(cloud.head_sha!==request.qualified_head||cloud.conclusion!=='success'||cloud.name!=='LIQ assembled spot and 105 admission offline')throw Error('FREE_ARCHIVE_SCHEMA_CLOUD_QUALIFICATION_REQUIRED');
  if(request.qualified_head!==process.env.GITHUB_SHA){const c=await control.call('compare/'+request.qualified_head+'...'+process.env.GITHUB_SHA);if(c.status!=='ahead'||c.merge_base_commit?.sha!==request.qualified_head||!Array.isArray(c.files)||c.files.some(f=>f.filename!==requestPath))throw Error('FREE_ARCHIVE_SCHEMA_CODE_MOVED_AFTER_QA');}
  await guard();
  source=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN,{beforeRequest:event=>{
   if(bridge_HTTP>=4||event.wire_bytes>1400000)throw Error('FREE_ARCHIVE_SCHEMA_BRIDGE_BOUND');const g=whole.reserve({logical_request_id:'SCHEMA_BRIDGE:'+bridge_HTTP,lane:'hot',attempts:1});if(g.allowed)bridge_HTTP++;return g;
  }});
  id='FREE_ARCHIVE_SCHEMA_INIT:'+process.env.GITHUB_RUN_ID+':'+process.env.GITHUB_RUN_ATTEMPT;
  out.admission=await reserveFreeArchiveSchemaBudget(source,{reservation_id:id});admitted=out.admission.allowed;
  if(!admitted)throw Error(out.admission.status);
  pool=createPrivateArchivePool({enabled:true,token:process.env.REPORT2_ISOLATED_D1_API_TOKEN,beforeRequest:()=>{
   if(private_HTTP>=P.max_private_HTTP)return{allowed:false};const g=whole.reserve({logical_request_id:'SCHEMA_PRIVATE:'+private_HTTP,lane:'background',attempts:1});if(g.allowed)private_HTTP++;return g;
  }});
  Object.assign(out,await initializeFreeArchiveSchemas({pool,source_usage:()=>source.usageSnapshot(),before_mutate:guard,execute:true}));
 }
}catch(error){if(error.schema_receipt)Object.assign(out,error.schema_receipt);out.status=error.schema_receipt?.status||'FREE_ARCHIVE_SCHEMA_NOT_CLOSED';out.reason=/^[A-Z0-9_]+$/.test(error.message)?error.message:'FREE_ARCHIVE_SCHEMA_ERROR';process.exitCode=1;}
finally{
 if(admitted)try{out.finalized_usage=await finalizeRunUsage(source,{reservationId:id,sourceRunId:process.env.GITHUB_RUN_ID,usage:usage()});}catch{out.native_finalization_not_acknowledged=true;process.exitCode=1;}
 if(source)out.D1=usage();if(out.D1&&(out.D1.unknown_ops||out.D1.rows_read>P.reservation.rows_read||out.D1.rows_written>P.reservation.rows_written)){out.native_envelope_not_closed=true;process.exitCode=1;}
 out.github_control_HTTP=control_HTTP;out.bridge_HTTP=bridge_HTTP;out.private_HTTP=private_HTTP;out.whole_HTTP=whole.summary();out.completed_ts=Date.now();out.capacity_recovered=false;out.automatic_rotation_enabled=false;
 await fs.writeFile(dir+'/proof.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({status:out.status,reason:out.reason,D1:out.D1,private_HTTP,bridge_HTTP,existing_main_rows_modified:0}));
}
