import {createHash} from 'node:crypto';
import {installCommandQueue,enqueueCommand} from './durable-command-queue.mjs';

const digest=value=>createHash('sha256').update(value).digest('hex');
const contentHash=report=>digest(JSON.stringify(report));
const text=value=>String(value??'').trim();
function sameIntent(row,input){return row&&row.mode===input.mode&&(row.contract??null)===(input.contract??null)&&row.request_channel===input.request_channel&&row.generation===input.generation;}

// A retry keeps the original receipt/deadline; time and workflow attempt are
// execution metadata and cannot create a second request for the same nonce.
export async function enqueueIdempotentManualRequest(db,input){
 const nonce=text(input.request_nonce);
 if(!nonce||nonce.length>160||/[\r\n]/u.test(nonce))throw Error('MANUAL_REQUEST_NONCE_INVALID');
 const command_id=`CMD:${digest(JSON.stringify([input.request_channel,nonce]))}`;
 await installCommandQueue(db);
 const lookup=()=>db.prepare('SELECT * FROM report2_command_v2 WHERE command_id=?1').bind(command_id).first();
 const existing=await lookup();
 if(existing){if(!sameIntent(existing,input))throw Error('MANUAL_REQUEST_IMMUTABLE_CONFLICT');return existing;}
 try{return await enqueueCommand(db,{...input,command_id});}
 catch(error){
  if(error.message!=='COMMAND_ID_IMMUTABLE_CONFLICT')throw error;
  const winner=await lookup();
  if(!sameIntent(winner,input))throw Error('MANUAL_REQUEST_IMMUTABLE_CONFLICT');
  return winner;
 }
}

export function bindManualReport(report,{command,completion,workflow_run_id,commit_sha}={}){
 if(!command?.command_id||!['manual','manual_recovery','workflow_dispatch'].includes(report?.source))throw Error('MANUAL_RESULT_REQUEST_REQUIRED');
 const complete=completion?.completed===true&&completion?.status==='COMPLETED';
 const output_sha256=contentHash(report);
 if(complete&&completion.text_hash!==output_sha256)throw Error('MANUAL_RESULT_COMPLETION_HASH_MISMATCH');
 if(complete&&!report.run_id)throw Error('MANUAL_RESULT_RUN_ID_REQUIRED');
 return {...report,manual_request_binding:{schema:'report2-manual-result-binding-v1',
  command_id:command.command_id,request_channel:command.request_channel,
  received_at:command.received_at,deadline:command.deadline,generation:command.generation,
  mode:command.mode,contract:command.contract??null,state:complete?'COMPLETED':'RUNNING',
  result_run_id:complete?report.run_id:null,output_sha256:complete?output_sha256:null,
  workflow_run_id:text(workflow_run_id),commit_sha:text(commit_sha)}};
}

// Deliberately accepts one explicit report/run/command. There is no fallback
// to the newest report or to a successful scheduled run.
export function verifyBoundManualReport({command_id,generation,commit_sha,command,run,report}={}){
 const fail=status=>({ok:false,status});
 if(!command_id||!generation||!commit_sha)return fail('EXPECTED_REQUEST_IDENTITY_REQUIRED');
 if(!command||command.command_id!==command_id)return fail('COMMAND_NOT_FOUND_OR_MISMATCH');
 if(command.generation!==generation)return fail('COMMAND_GENERATION_MISMATCH');
 if(command.state!=='COMPLETED')return fail(`COMMAND_${command.state||'UNKNOWN'}`);
 if(run?.status!=='completed'||run?.conclusion!=='success')return fail('MANUAL_RUN_NOT_SUCCESSFUL');
 if(run.head_sha!==commit_sha||report?.head!==commit_sha)return fail('CURRENT_COMMIT_MISMATCH');
 if(!['manual','manual_recovery','workflow_dispatch'].includes(report.source))return fail('SCHEDULED_REPORT_NOT_MANUAL');
 const b=report.manual_request_binding;
 if(b?.schema!=='report2-manual-result-binding-v1'||b.state!=='COMPLETED')return fail('MANUAL_BINDING_NOT_COMPLETED');
 if(b.command_id!==command_id||b.generation!==generation||report.generation!==generation||b.commit_sha!==commit_sha)return fail('MANUAL_BINDING_IDENTITY_MISMATCH');
 if(b.workflow_run_id!==text(run.id)||b.result_run_id!==report.run_id||command.result_snapshot_id!==report.run_id)return fail('MANUAL_RUN_BINDING_MISMATCH');
 for(const key of ['request_channel','received_at','deadline','mode','contract'])if((b[key]??null)!==(command[key]??null))return fail('MANUAL_REQUEST_RECEIPT_MISMATCH');
 const {manual_request_binding,...body}=report;
 const hash=contentHash(body);
 if(b.output_sha256!==hash||command.rendered_text_hash!==hash)return fail('MANUAL_REPORT_CONTENT_MISMATCH');
 if(!Number.isFinite(Date.parse(report.generated_at))||Date.parse(report.generated_at)<Number(command.received_at))return fail('MANUAL_REPORT_PREDATES_REQUEST');
 if(!text(report.report_text))return fail('MANUAL_REPORT_TEXT_MISSING');
 return {ok:true,status:'BOUND_MANUAL_REPORT_VERIFIED',command_id,run_id:report.run_id,report_text:report.report_text};
}
