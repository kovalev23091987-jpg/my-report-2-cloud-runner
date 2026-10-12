const WORKFLOW='report2.yml';
const RECOVERY_TITLE='Report 2 scheduled recovery';
const GAP_MS=40*60_000;
const repositoryValid=value=>/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(String(value||''));

const headers=token=>({Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'});
const validTime=value=>{
  const time=Date.parse(String(value||''));
  return Number.isSafeInteger(time)?time:null;
};

export async function inspectScheduledReportGap({repository,token,now=Date.now(),local_last_accepted_ts=0,fetch_impl=fetch}={}){
  if(!repositoryValid(repository)||!token||!Number.isSafeInteger(now)||now<=0)return{allowed:false,status:'RECOVERY_CONTROL_REQUIRED'};
  if(local_last_accepted_ts>0&&now-local_last_accepted_ts<GAP_MS)return{allowed:false,status:'LOCAL_RECOVERY_ALREADY_ACCEPTED',last_attempt_ts:local_last_accepted_ts};
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
    const latest=[...scheduled,...recovery].map(run=>validTime(run?.created_at)).filter(Number.isSafeInteger).sort((a,b)=>b-a)[0]??null;
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
