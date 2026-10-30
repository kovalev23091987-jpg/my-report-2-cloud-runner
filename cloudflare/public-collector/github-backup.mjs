import fs from 'node:fs';
import path from 'node:path';
import {RemoteD1Database} from '../../runner/report2-d1-adapter.mjs';
import {claimTriggerKick,proveTriggerKickBudget} from './trigger-analysis-kick.mjs';
import {codeManifest,verifyCurrentMainCode,dispatchExactTriggerKick,runContinuousBackup,createCollectorJobBudget} from './continuous-backup-worker.mjs';
import {inspectScheduledReportGap,dispatchScheduledReportRecovery,dispatchContinuousBackupRenewal,waitForScheduledRecoveryBoundary,scheduledRecoveryBoundary} from './scheduled-report-recovery.mjs';
import {createPrivateArchivePool} from '../../runner/private-archive-pool.mjs';
import {PRIVATE_CANONICAL_DATABASES,privateCanonicalBindings} from '../../runner/private-canonical-history.mjs';
import {runPrivatePriceRechecks} from './private-price-consumer.mjs';
import {observeCollectorD1} from './native-cost-observer.mjs';
import {readCollectorPriorRows} from './prior-snapshot-read.mjs';
import {loadVerifiedNativeDayReconciliation} from '../../runner/verified-native-day-reconciliation.mjs';

const SLOT=5*60_000;
const ACTOR='HUB_PUBLIC_COLLECTOR';
const GENERATION='MY_REPORT_2_CURRENT_20260928_CANONICAL_RUNTIME_V12_CONTRACT_INTEGRITY_20M';
const required=name=>{const value=String(process.env[name]||'').trim();if(!value)throw new Error(`${name}_REQUIRED`);return value;};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export function loadExactCollector(source,fetch_impl=(...args)=>globalThis.fetch(...args),private_price_runtime=null){
  return Function('worker_default','fetch','__report2InjectedPrivatePriceRuntime',`${source}\nreturn __report2PublicCollectorScheduled;`)({},fetch_impl,private_price_runtime);
}

export async function runBackupCollector({db,archive_db,archive_dbs={},now=Date.now,sleep=wait,collector}={}){
  const bucket=Math.floor(now()/SLOT)*SLOT;
  // Do not label a later market observation as an earlier five-minute slot.
  if(now()-bucket>=4*60_000+30_000)return{status:'SLOT_TOO_LATE',bucket,external_requests:0};
  const due=bucket+3*60_000;
  const read=()=>db.prepare(`SELECT state,lease_until FROM report2_public_collector_usage_v1
    WHERE actor=?1 AND generation=?2 AND bucket=?3 LIMIT 1`).bind(ACTOR,GENERATION,bucket).first();
  let row=await read();
  if(row?.state==='CLOSED')return{status:'PRIMARY_CLOSED',bucket,external_requests:0};
  if(row?.state==='ERROR')return{status:'PRIMARY_ERROR_IMMUTABLE',bucket,external_requests:0};
  if(now()<due){await sleep(due-now());row=await read();}
  if(row?.state==='CLOSED')return{status:'PRIMARY_CLOSED',bucket,external_requests:0};
  if(row?.state==='ERROR')return{status:'PRIMARY_ERROR_IMMUTABLE',bucket,external_requests:0};
  if(row?.state==='STARTED'&&Number(row.lease_until)>now()){
    if(Number(row.lease_until)>bucket+4*60_000+30_000)return{status:'PRIMARY_LEASE_UNSAFE',bucket,external_requests:0};
    await sleep(Number(row.lease_until)-now()+1000);
  }
  if(now()-bucket>=4*60_000+30_000)return{status:'SLOT_TOO_LATE',bucket,external_requests:0};
  const archiveBindings=Object.fromEntries(Object.entries(archive_dbs).map(([slot,value])=>[PRIVATE_CANONICAL_DATABASES[slot]?.binding,value]));
  if(Object.hasOwn(archiveBindings,'undefined'))throw Error('EXACT_BACKUP_ARCHIVE_LOCATION_REQUIRED');
  await collector({scheduledTime:bucket},{DATA_DB:db,CANONICAL_ARCHIVE_DB:archive_db,...archiveBindings,PRICE_RECHECK_ENABLED:'1',PUBLIC_COLLECTOR_ENABLED:'1',ANALYTICS_ENABLED:'0',DELIVERY_ENABLED:'0',CALIBRATION_APPLY_ENABLED:'0',REPORT2_CURRENT_GENERATION:GENERATION},{waitUntil(){}});
  return{status:'BACKUP_ATTEMPTED',bucket,external_requests:'COLLECTOR_BOUNDED_BY_EXISTING_CLAIM'};
}

async function main(){
  const db=new RemoteD1Database(required('REPORT2_D1_BRIDGE_URL'),required('REPORT2_D1_BRIDGE_TOKEN'),{timeoutMs:45_000});
  // The checked-in Worker tail is trusted source; this runs the exact same collector logic.
  const source=fs.readFileSync(new URL('./injected-worker-tail.js',import.meta.url),'utf8');
  const budgetFile='report2-collector-backup-source-budget.json',cloudRun=required('GITHUB_RUN_ID');
  const previousBudget=fs.existsSync(budgetFile)?JSON.parse(fs.readFileSync(budgetFile,'utf8')):null;
  if(previousBudget&&(previousBudget.schema!=='COLLECTOR_JOB_SOURCE_HTTP_BUDGET_V1'||previousBudget.cloud_run!==cloudRun))throw Error('COLLECTOR_JOB_SOURCE_BUDGET_IDENTITY_REQUIRED');
  const sourceBudget=createCollectorJobBudget({used:previousBudget?.attempted_source_http||0,on_charge:used=>fs.writeFileSync(budgetFile,JSON.stringify({schema:'COLLECTOR_JOB_SOURCE_HTTP_BUDGET_V1',cloud_run:cloudRun,attempted_source_http:used,maximum_source_http:164}))});
  const archiveToken=String(process.env.REPORT2_CANONICAL_ARCHIVE_D1_API_TOKEN||'').trim();
  const archive=archiveToken?createPrivateArchivePool({enabled:true,token:archiveToken}):null;
  const nativeCostReconciliation=loadVerifiedNativeDayReconciliation({root:process.cwd(),generation:'MY_REPORT_2_CURRENT_20260929_CURRENT_CYCLE_V13_20M',now_ts:Date.now()});
  const collector=loadExactCollector(source,sourceBudget.fetch,{runPrivatePriceRechecks,privateCanonicalBindings,observeCollectorD1,readCollectorPriorRows,native_cost_reconciliation:nativeCostReconciliation});
  const token=required('GITHUB_TOKEN'),repository=required('GITHUB_REPOSITORY'),manifest=codeManifest(),receipts=[];
  const durationMinutes=Number(process.env.REPORT2_BACKUP_WORKER_MINUTES||0);
  const recoveryEnabled=['1','true','yes','on'].includes(String(process.env.REPORT2_SCHEDULED_RECOVERY_ENABLED||'').toLowerCase());
  let lastAcceptedRecoveryTs=0;
  const verifyCode=()=>verifyCurrentMainCode({repository,token,manifest});
  const worker=await runContinuousBackup({duration_minutes:durationMinutes,should_continue:()=>sourceBudget.can_collect,source_guard:verifyCode,cycle:async({next_slot_ts,worker_deadline_ts})=>{
    let recovery={dispatched:false,status:'RECOVERY_DISABLED_OR_BOOTSTRAP',source_http:0,D1:0};
    let cadence=null;
    if(recoveryEnabled&&durationMinutes>0){
      try{cadence=await db.prepare(`SELECT last_success_ts,lease_expires_ts FROM v3_maintenance_cadence_shadow
        WHERE job_key=?1 LIMIT 1`).bind('TWO_CANDIDATE_ANALYTICS_40M').first();}
      catch{recovery={dispatched:false,status:'RECOVERY_CADENCE_READ_FAILED',source_http:0,D1:0};}
    }
    const recoveryEnabledHere=recoveryEnabled&&durationMinutes>0&&recovery.status!=='RECOVERY_CADENCE_READ_FAILED';
    const boundaryParams={cadence_last_success_ts:cadence?.last_success_ts??null,cadence_lease_expires_ts:cadence?.lease_expires_ts??null,local_last_accepted_ts:lastAcceptedRecoveryTs,not_after_ts:Math.min(next_slot_ts,worker_deadline_ts)};
    const recoveryDueLater=recoveryEnabledHere&&scheduledRecoveryBoundary(boundaryParams)!==null;
    const recover=async()=>{
      const boundary=await waitForScheduledRecoveryBoundary({...boundaryParams,verify_code:verifyCode});
      const now=Date.now();
      const gap=boundary.allowed?await inspectScheduledReportGap({repository,token,now,local_last_accepted_ts:lastAcceptedRecoveryTs,
        cadence_last_success_ts:cadence?.last_success_ts??null,cadence_lease_expires_ts:cadence?.lease_expires_ts??null}):boundary;
      recovery={...(gap.allowed?await dispatchScheduledReportRecovery({gap,repository,token}):gap),boundary_wait:boundary};
      if(recovery.dispatched)lastAcceptedRecoveryTs=now;
    };
    // Already-due reports keep their original early dispatch. A future due
    // boundary waits only after the existing collector and trigger work.
    if(recoveryEnabledHere&&!recoveryDueLater)await recover();
    const result=await runBackupCollector({db,...(archive?archive.readerOptions():{}),collector});let kick={dispatch:false,status:'TRIGGER_KICK_DISABLED'};
    if(['1','true','yes','on'].includes(String(process.env.REPORT2_TRIGGER_KICK_ENABLED||'').toLowerCase())){
      try{kick=await claimTriggerKick(db);}catch{kick={dispatch:false,status:'KICK_NOT_CLOSED',source_http:0,entry_authorized:false};}
    }
    if(kick.dispatch){const dispatched=await dispatchExactTriggerKick({kick,repository,token});kick={...kick,dispatch_status:dispatched.status,github_dispatch_http_status:dispatched.http_status};}
    if(recoveryDueLater)await recover();
    return {schema:'report2-public-collector-backup-v4-scheduled-recovery',source_code_head:process.env.GITHUB_SHA||null,cloud_run:process.env.GITHUB_RUN_ID||null,...result,recovery,kick,kick_budget:proveTriggerKickBudget(),usage:db.usageSnapshot(),completed_at:new Date().toISOString(),telegram:false,analytical_decision:false};
  },on_receipt:async receipt=>{
    receipt.source_job_budget=sourceBudget.snapshot;
    receipts.push(receipt);if(receipts.length>64)receipts.shift();
    fs.writeFileSync('report2-collector-backup-proof.json',JSON.stringify({...receipt,receipts},null,2)+'\n');
    console.log('REPORT2_PUBLIC_COLLECTOR_BACKUP',JSON.stringify(receipt));
  }});
  if(recoveryEnabled&&durationMinutes>0&&worker.status==='WORKER_WINDOW_CLOSED'){
    const codeGuard=await verifyCurrentMainCode({repository,token,manifest});
    const renewal=await dispatchContinuousBackupRenewal({worker,repository,token,code_guard:codeGuard});
    const final={...receipts.at(-1),worker_status:worker.status,worker_result:worker,renewal,source_guard:codeGuard,source_job_budget:sourceBudget.snapshot,receipts};
    fs.writeFileSync('report2-collector-backup-proof.json',JSON.stringify(final,null,2)+'\n');
    console.log('REPORT2_PUBLIC_COLLECTOR_BACKUP_RENEWAL',JSON.stringify({worker,renewal}));
  }
}
if(process.argv[1]&&new URL(import.meta.url).pathname===path.resolve(process.argv[1]))main().catch(error=>{console.error('REPORT2_PUBLIC_COLLECTOR_BACKUP_ERROR',String(error?.message||error).slice(0,240));process.exitCode=1;});

