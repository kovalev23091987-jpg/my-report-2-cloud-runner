const WORKFLOW='report2.yml';
const RECOVERY_TITLE='Report 2 scheduled recovery';
const GAP_MS=40*60_000;
const repositoryValid=value=>/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(String(value||''));

const headers=token=>({Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'});
const validTime=value=>{
  const time=Date.parse(String(value||''));
  return Number.isSafeInteger(time)?time:null;
};

// Reuse the cadence row already read by this collector cycle. A due time a
// few seconds after the five-minute poll must not add another five minutes.
// This is a timer only: the normal GitHub and durable runner gates still run.
export function scheduledRecoveryBoundary({cadence_last_success_ts,cadence_lease_expires_ts=null,local_last_accepted_ts=0,not_after_ts,now=Date.now()}={}){
  if(!Number.isSafeInteger(now)||!Number.isSafeInteger(cadence_last_success_ts)||cadence_last_success_ts<=0||cadence_last_success_ts>now||!Number.isSafeInteger(not_after_ts)||not_after_ts<=now)return null;
  if(cadence_lease_expires_ts!==null&&(!Number.isSafeInteger(cadence_lease_expires_ts)||cadence_lease_expires_ts>now))return null;
  if(!Number.isSafeInteger(local_last_accepted_ts)||local_last_accepted_ts<0||local_last_accepted_ts>now)return null;
  const due=Math.max(cadence_last_success_ts+GAP_MS,local_last_accepted_ts?local_last_accepted_ts+GAP_MS:0);
  return due>now&&due<not_after_ts&&due-now<=5*60_000?due:null;
}
export async function waitForScheduledRecoveryBoundary({cadence_last_success_ts,cadence_lease_expires_ts=null,local_last_accepted_ts=0,not_after_ts,now=Date.now,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),verify_code}={}){
  const started=now(),empty={allowed:true,status:'NO_IN_SLOT_RECOVERY_WAIT',wait_ms:0,source_http:0,D1:0};
  const due=scheduledRecoveryBoundary({cadence_last_success_ts,cadence_lease_expires_ts,local_last_accepted_ts,not_after_ts,now:started});
  if(due===null||typeof verify_code!=='function')return empty;
  let slept=0;
  while(now()<due){const delay=Math.min(60_000,due-now());if(slept+delay>5*60_000)return{...empty,allowed:false,status:'RECOVERY_WAIT_CLOCK_NOT_CLOSED',wait_ms:slept};await sleep(delay);slept+=delay;}
  if(now()>=not_after_ts)return{...empty,allowed:false,status:'RECOVERY_WAIT_WINDOW_CLOSED',wait_ms:now()-started,next_due_ts:due};
  const guard=await verify_code();
  if(now()>=not_after_ts)return{...empty,allowed:false,status:'RECOVERY_WAIT_WINDOW_CLOSED',wait_ms:now()-started,next_due_ts:due,source_guard:guard};
  return{...empty,allowed:guard?.allowed===true,status:guard?.allowed===true?'RECOVERY_DUE_WITHIN_ORIGINAL_COLLECTOR_SLOT':'RECOVERY_WAIT_CODE_NOT_CURRENT',wait_ms:now()-started,next_due_ts:due,source_guard:guard};
}

export async function inspectScheduledReportGap({repository,token,now=Date.now(),local_last_accepted_ts=0,cadence_last_success_ts=null,cadence_lease_expires_ts=null,fetch_impl=fetch}={}){
  if(!repositoryValid(repository)||!token||!Number.isSafeInteger(now)||now<=0)return{allowed:false,status:'RECOVERY_CONTROL_REQUIRED'};
  if(local_last_accepted_ts>0&&now-local_last_accepted_ts<GAP_MS)return{allowed:false,status:'LOCAL_RECOVERY_ALREADY_ACCEPTED',last_attempt_ts:local_last_accepted_ts};
  if(cadence_lease_expires_ts!==null&&(!Number.isSafeInteger(cadence_lease_expires_ts)||cadence_lease_expires_ts>now))return{allowed:false,status:'CADENCE_LEASE_ACTIVE_OR_INVALID'};
  const base=`https://api.github.com/repos/${repository}/actions/workflows/${WORKFLOW}/runs`;
  const read=async event=>{
    const perPage=event==='schedule'?1:100;
    const response=await fetch_impl(`${base}?branch=main&event=${event}&per_page=${perPage}`,{headers:headers(token),signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw Error('GITHUB_RUN_LIST_'+response.status);
    const body=await response.json();
    if(!Array.isArray(body?.workflow_runs))throw Error('GITHUB_RUN_LIST_INVALID');
    return body.workflow_runs;
  };
  try{
    const [scheduled,dispatched]=await Promise.all([read('schedule'),read('workflow_dispatch')]);
    const recovery=dispatched.filter(run=>run?.display_title===RECOVERY_TITLE&&run?.head_branch==='main');
    if(dispatched.length===100&&recovery.length===0)return{allowed:false,status:'RECOVERY_HISTORY_NOT_CLOSED'};
    const latestScheduled=scheduled[0]||null;
    const scheduledTime=latestScheduled?validTime(latestScheduled.created_at):null;
    if(latestScheduled&&latestScheduled.status!=='completed')return{allowed:false,status:'SCHEDULED_RUN_IN_PROGRESS',last_attempt_ts:scheduledTime};
    if(cadence_last_success_ts!==null&&(!Number.isSafeInteger(cadence_last_success_ts)||cadence_last_success_ts<0||cadence_last_success_ts>now))return{allowed:false,status:'CADENCE_TIME_INVALID'};
    // A GitHub schedule event can be admitted as NOT_DUE. Its creation time is
    // not a full report. Give a just-finished run time to settle the D1 cadence,
    // then use the actual charged full-cycle attempt as the recovery anchor.
    if(cadence_last_success_ts!==null&&scheduledTime!==null&&scheduledTime>cadence_last_success_ts&&now-scheduledTime<5*60_000)return{allowed:false,status:'SCHEDULED_RUN_SETTLEMENT_GRACE',last_attempt_ts:scheduledTime};
    const times=cadence_last_success_ts===null?[...scheduled,...recovery].map(run=>validTime(run?.created_at)):[cadence_last_success_ts,...recovery.map(run=>validTime(run?.created_at))];
    const latest=times.filter(Number.isSafeInteger).sort((a,b)=>b-a)[0]??null;
    if([...scheduled,...recovery].some(run=>validTime(run?.created_at)===null))return{allowed:false,status:'RECOVERY_RUN_TIME_INVALID'};
    if(latest!==null&&latest>now)return{allowed:false,status:'RECOVERY_RUN_TIME_FUTURE',last_attempt_ts:latest};
    if(latest!==null&&now-latest<GAP_MS)return{allowed:false,status:'SCHEDULED_REPORT_RECENT',last_attempt_ts:latest};
    return{allowed:true,status:'SCHEDULED_REPORT_GAP_CONFIRMED',last_attempt_ts:latest,gap_ms:latest===null?null:now-latest,github_metadata_http:2,source_http:0,D1:0};
  }catch(error){return{allowed:false,status:'RECOVERY_CONTROL_READ_FAILED',error:String(error?.message||error).slice(0,100),source_http:0,D1:0};}
}

export async function dispatchScheduledReportRecovery({gap,repository,token,fetch_impl=fetch}={}){
  if(gap?.allowed!==true||gap.status!=='SCHEDULED_REPORT_GAP_CONFIRMED'||!repositoryValid(repository)||!token)return{dispatched:false,status:'RECOVERY_NOT_ADMITTED'};
  try{
    const response=await fetch_impl(`https://api.github.com/repos/${repository}/actions/workflows/${WORKFLOW}/dispatches`,{
      method:'POST',headers:{...headers(token),'Content-Type':'application/json'},
      body:JSON.stringify({ref:'main',inputs:{reason:'SCHEDULED_CADENCE_RECOVERY',scheduled_recovery_run:true,manual_run_authorized:false}}),
      signal:AbortSignal.timeout(30000),
    });
    return{dispatched:response.status===204,status:response.status===204?'RECOVERY_DISPATCH_ACCEPTED':'RECOVERY_DISPATCH_FAILED',github_http_status:response.status,source_http:0,D1:0};
  }catch{return{dispatched:false,status:'RECOVERY_DISPATCH_FAILED',source_http:0,D1:0};}
}

export async function dispatchContinuousBackupRenewal({worker,repository,token,code_guard,fetch_impl=fetch}={}){
  if(worker?.status!=='WORKER_WINDOW_CLOSED'||!Number.isSafeInteger(worker.cycles)||worker.cycles<1||code_guard?.allowed!==true||code_guard.status!=='CURRENT_MAIN_CODE_VERIFIED'||!repositoryValid(repository)||!token)return{dispatched:false,status:'BACKUP_RENEWAL_NOT_ADMITTED',source_http:0,D1:0};
  try{
    const response=await fetch_impl(`https://api.github.com/repos/${repository}/actions/workflows/report2-public-collector-backup.yml/dispatches`,{
      method:'POST',headers:{...headers(token),'Content-Type':'application/json'},
      body:JSON.stringify({ref:'main',inputs:{reason:'CONTINUOUS_BACKUP_RENEWAL'}}),
      signal:AbortSignal.timeout(30000),
    });
    return{dispatched:response.status===204,status:response.status===204?'BACKUP_RENEWAL_DISPATCH_ACCEPTED':'BACKUP_RENEWAL_DISPATCH_FAILED',github_http_status:response.status,source_http:0,D1:0};
  }catch{return{dispatched:false,status:'BACKUP_RENEWAL_DISPATCH_FAILED',source_http:0,D1:0};}
}
