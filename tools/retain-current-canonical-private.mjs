import fs from 'node:fs/promises';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import {PrivateArchiveD1API,combineMeasuredD1Usage} from '../runner/private-archive-d1-api.mjs';
import {CANONICAL_COPY_POLICY,canonicalCopyCandidates,reserveCanonicalCopyBudget,copyCanonicalReport,canonicalProducerInMainHistory} from '../runner/canonical-cold-copy.mjs';
import {finalizeRunUsage} from '../runner/d1-preaction-budget-guard.mjs';
const path='runtime/private-canonical-archive-receipt.json';
const out={schema:'REPORT2_PRIVATE_CANONICAL_AUTOMATIC_COPY_V1',head:process.env.GITHUB_SHA,cloud_run:process.env.GITHUB_RUN_ID,status:'NO_EXACT_CLOSED_REPORT',sourceHTTP:0,MAIN:0,Telegram:0,main_rows_modified:0,private_payload_exported:false,report_effect:false};
let admitted=false,source,archive,id;
try{
 const report=JSON.parse(await fs.readFile('runtime/report2-run-result.json','utf8')),selection=canonicalCopyCandidates(report,process.env.GITHUB_SHA);out.source_run_id=report.run_id;out.selection_status=selection.status;
 if(!selection.candidates.length)out.status=selection.status;
 else if(process.env.REPORT2_CANONICAL_PRIVATE_COPY_ENABLED!=='1')out.status='AUTOMATIC_COPY_NOT_ACTIVATED';
 else{
  if(process.env.GITHUB_REPOSITORY!=='kovalev23091987-jpg/my-report-2-cloud-runner'||!process.env.GITHUB_TOKEN||!process.env.REPORT2_D1_BRIDGE_URL||!process.env.REPORT2_D1_BRIDGE_TOKEN)throw Error('ARCHIVE_AUTHORIZED_RUNTIME_REQUIRED');
  const api=async suffix=>{const r=await fetch('https://api.github.com/repos/'+process.env.GITHUB_REPOSITORY+'/'+suffix,{headers:{authorization:'Bearer '+process.env.GITHUB_TOKEN,accept:'application/vnd.github+json'},redirect:'error',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('ARCHIVE_CONTROL_READ_REQUIRED');return r.json();};
  const main=(await api('git/ref/heads/main')).object.sha;
  const comparison=main===process.env.GITHUB_SHA?null:await api('compare/'+process.env.GITHUB_SHA+'...'+main);
  if(!canonicalProducerInMainHistory({producer_head:process.env.GITHUB_SHA,main_head:main,comparison}))throw Error('ARCHIVE_MAIN_MOVED_KEEP_SOURCE');
  const control=async p=>JSON.parse(Buffer.from((await api('contents/'+p+'?ref='+main)).content,'base64').toString());
  const [phase,fence]=await Promise.all([control('checkpoints/CLOUD_PHASE_STATE_20261004.json'),control('audit-fixes/source-optimization-20260930/execution-lock.json')]);
  if(fence.active||phase.current_phase!=='OWNER_SEQUENTIAL_BLOCK_REQUIREMENTS_REVIEW')throw Error('ARCHIVE_PHASE_OR_FENCE_BLOCKED');
  out.control={main,producer_head:process.env.GITHUB_SHA,producer_in_current_main_history:true,phase:phase.current_phase,fence_active:false};
  source=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN);archive=new PrivateArchiveD1API({token:process.env.REPORT2_CANONICAL_ARCHIVE_D1_API_TOKEN});
  out.private_database=await archive.verifyDatabase();
  id='CANONICAL_COLD_COPY:'+process.env.GITHUB_RUN_ID+':'+process.env.GITHUB_RUN_ATTEMPT;
  out.admission=await reserveCanonicalCopyBudget(source,{reservation_id:id});admitted=out.admission.allowed;
  if(admitted)Object.assign(out,await copyCanonicalReport({source_db:source,archive_db:archive,candidates:selection.candidates}));else out.status=out.admission.status;
 }
}catch(e){out.status='PRIVATE_ARCHIVE_COPY_NOT_CLOSED';out.reason=/^[A-Z0-9_]+$/.test(e.message)?e.message:e.name;}
finally{
 if(source&&archive){const usage=()=>combineMeasuredD1Usage(source.usageSnapshot(),archive.usageSnapshot());if(admitted)try{out.finalized_usage=await finalizeRunUsage(source,{reservationId:id,sourceRunId:process.env.GITHUB_RUN_ID,usage:usage()});}catch{out.status='PRIVATE_ARCHIVE_USAGE_FINALIZE_NOT_CLOSED';}out.D1=usage();if(out.D1.unknown_ops||out.D1.rows_read>CANONICAL_COPY_POLICY.reservation.rows_read||out.D1.rows_written>CANONICAL_COPY_POLICY.reservation.rows_written)out.status='PRIVATE_ARCHIVE_D1_ENVELOPE_NOT_CLOSED';}
 out.completed_ts=Date.now();await fs.mkdir('runtime',{recursive:true});await fs.writeFile(path,JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({status:out.status,records:out.records?.length??0,D1:out.D1,reason:out.reason}));
}
