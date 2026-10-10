import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const parseLine=(log,label)=>{
  const line=log.split(/\r?\n/).find(value=>value.startsWith(label+' '));
  if(!line)throw Error(label+'_RECEIPT_REQUIRED');
  return JSON.parse(line.slice(label.length+1));
};

export function buildNoWorkReceipt(log,{head,source_cloud_run}={}){
  if(typeof log!=='string'||!log)throw Error('RUNNER_LOG_REQUIRED');
  if(!/^[a-f0-9]{40}$/.test(head||''))throw Error('EXACT_SOURCE_HEAD_REQUIRED');
  if(!/^\d+$/.test(String(source_cloud_run||'')))throw Error('SOURCE_CLOUD_RUN_REQUIRED');
  const scheduled=parseLine(log,'SCHEDULED_TWO_CANDIDATE_ADMISSION');
  const trigger=parseLine(log,'TRIGGERED_ENTRY_RECHECK_ADMISSION');
  if(scheduled.status!=='NOT_DUE'||scheduled.claimed!==false||scheduled.due!==false||
     !Number.isSafeInteger(scheduled.last_success_ts)||!Number.isSafeInteger(scheduled.next_due_ts)||
     scheduled.next_due_ts<=scheduled.last_success_ts)throw Error('EXACT_NOT_DUE_ADMISSION_REQUIRED');
  if(trigger.status!=='NO_FRESH_EXACT_SENT_TRIGGER'||trigger.claimed!==false||
     trigger.entry_authorized!==false||trigger.source_http!==0)throw Error('EXACT_NO_FRESH_TRIGGER_REQUIRED');
  return {
    schema:'REPORT2_NO_WORK_RECEIPT_V1',
    head,
    source_cloud_run:String(source_cloud_run),
    status:'NO_WORK_NOT_DUE_NO_FRESH_TRIGGER',
    scheduled_admission:{
      status:scheduled.status,
      claimed:false,
      due:false,
      last_success_ts:scheduled.last_success_ts,
      next_due_ts:scheduled.next_due_ts
    },
    trigger_recheck:{
      status:trigger.status,
      claimed:false,
      entry_authorized:false,
      source_http:0
    },
    market_conditions_evaluated:false,
    full_analysis_completed:false,
    exact_SENT:0,
    actual_ENTRY:0,
    task_writes:0,
    source_clock_refreshed:false,
    audit_added:{sourceHTTP:0,D1:0,Telegram:0},
    project_complete:false
  };
}

export function auditNoWorkReceipt({receipt,expected_head,expected_cloud_run}={}){
  if(receipt?.schema!=='REPORT2_NO_WORK_RECEIPT_V1'||receipt.head!==expected_head||
     !/^[a-f0-9]{40}$/.test(expected_head||'')||
     receipt.source_cloud_run!==String(expected_cloud_run||'')||
     receipt.status!=='NO_WORK_NOT_DUE_NO_FRESH_TRIGGER')throw Error('NO_WORK_RECEIPT_BINDING_REQUIRED');
  const s=receipt.scheduled_admission,t=receipt.trigger_recheck,a=receipt.audit_added;
  if(s?.status!=='NOT_DUE'||s.claimed!==false||s.due!==false||
     !Number.isSafeInteger(s.last_success_ts)||!Number.isSafeInteger(s.next_due_ts)||
     s.next_due_ts<=s.last_success_ts||
     t?.status!=='NO_FRESH_EXACT_SENT_TRIGGER'||t.claimed!==false||
     t.entry_authorized!==false||t.source_http!==0||
     receipt.market_conditions_evaluated!==false||receipt.full_analysis_completed!==false||
     receipt.exact_SENT!==0||receipt.actual_ENTRY!==0||receipt.task_writes!==0||
     receipt.source_clock_refreshed!==false||
     a?.sourceHTTP!==0||a?.D1!==0||a?.Telegram!==0)throw Error('EXACT_NO_WORK_FACTS_REQUIRED');
  return {
    schema:'AUTOMATIC_DELIVERY_ARTIFACT_AUDIT_V1',
    head:receipt.head,
    run_id:null,
    status:'EXACT_NO_WORK_NOT_DUE_NO_FRESH_TRIGGER_VERIFIED',
    exact_SENT:0,
    actual_ENTRY:0,
    market_conditions_evaluated:false,
    full_analysis_completed:false,
    task_writes:0,
    source_clock_refreshed:false,
    sourceHTTP:0,
    D1:0,
    Telegram:0,
    project_complete:false
  };
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [logPath,outPath,head,cloudRun]=process.argv.slice(2);
  if(!logPath||!outPath)throw Error('LOG_AND_OUTPUT_PATH_REQUIRED');
  const canonical=path.join(path.dirname(outPath),'report2-run-result.json');
  if(!fs.existsSync(canonical)){
    const receipt=buildNoWorkReceipt(fs.readFileSync(logPath,'utf8'),{head,source_cloud_run:cloudRun});
    fs.writeFileSync(outPath,JSON.stringify(receipt,null,2)+'\n');
    console.log(JSON.stringify(receipt));
  }
}
