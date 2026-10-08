import fs from 'node:fs';
import path from 'node:path';
import {RemoteD1Database} from '../../runner/report2-d1-adapter.mjs';
import {claimTriggerKick,proveTriggerKickBudget} from './trigger-analysis-kick.mjs';

const SLOT=5*60_000;
const ACTOR='HUB_PUBLIC_COLLECTOR';
const GENERATION='MY_REPORT_2_CURRENT_20260928_CANONICAL_RUNTIME_V12_CONTRACT_INTEGRITY_20M';
const required=name=>{const value=String(process.env[name]||'').trim();if(!value)throw new Error(`${name}_REQUIRED`);return value;};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export function loadExactCollector(source){
  return Function('worker_default',`${source}\nreturn __report2PublicCollectorScheduled;`)({});
}

export async function runBackupCollector({db,now=Date.now,sleep=wait,collector}={}){
  const bucket=Math.floor(now()/SLOT)*SLOT;
  // Do not label a later market observation as an earlier five-minute slot.
  if(now()-bucket>=4*60_000+30_000)return{status:'SLOT_TOO_LATE',bucket,external_requests:0};
  const due=bucket+3*60_000;
  if(now()<due)await sleep(due-now());
  const row=await db.prepare(`SELECT state,lease_until FROM report2_public_collector_usage_v1
    WHERE actor=?1 AND generation=?2 AND bucket=?3 LIMIT 1`).bind(ACTOR,GENERATION,bucket).first();
  if(row?.state==='CLOSED')return{status:'PRIMARY_CLOSED',bucket,external_requests:0};
  if(row?.state==='ERROR')return{status:'PRIMARY_ERROR_IMMUTABLE',bucket,external_requests:0};
  if(row?.state==='STARTED'&&Number(row.lease_until)>now()){
    if(Number(row.lease_until)>bucket+4*60_000+30_000)return{status:'PRIMARY_LEASE_UNSAFE',bucket,external_requests:0};
    await sleep(Number(row.lease_until)-now()+1000);
  }
  if(now()-bucket>=4*60_000+30_000)return{status:'SLOT_TOO_LATE',bucket,external_requests:0};
  await collector({scheduledTime:bucket},{DATA_DB:db,PRICE_RECHECK_ENABLED:'1',PUBLIC_COLLECTOR_ENABLED:'1',ANALYTICS_ENABLED:'0',DELIVERY_ENABLED:'0',CALIBRATION_APPLY_ENABLED:'0',REPORT2_CURRENT_GENERATION:GENERATION},{waitUntil(){}});
  return{status:'BACKUP_ATTEMPTED',bucket,external_requests:'COLLECTOR_BOUNDED_BY_EXISTING_CLAIM'};
}

async function main(){
  const db=new RemoteD1Database(required('REPORT2_D1_BRIDGE_URL'),required('REPORT2_D1_BRIDGE_TOKEN'),{timeoutMs:45_000});
  // The checked-in Worker tail is trusted source; this runs the exact same collector logic.
  const source=fs.readFileSync(new URL('./injected-worker-tail.js',import.meta.url),'utf8');
  const collector=loadExactCollector(source);
  const result=await runBackupCollector({db,collector});
  let kick={dispatch:false,status:'TRIGGER_KICK_DISABLED'};
  if(['1','true','yes','on'].includes(String(process.env.REPORT2_TRIGGER_KICK_ENABLED||'').toLowerCase())){
    try{kick=await claimTriggerKick(db);}catch{kick={dispatch:false,status:'KICK_NOT_CLOSED',source_http:0,entry_authorized:false};}
  }
  if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,`trigger_dispatch=${kick.dispatch===true}\ntrigger_task_id=${kick.dispatch?kick.task_id:''}\n`);
  const receipt={schema:'report2-public-collector-backup-v2-trigger-kick',...result,kick,kick_budget:proveTriggerKickBudget(),usage:db.usageSnapshot(),completed_at:new Date().toISOString(),telegram:false,analytical_decision:false};
  fs.writeFileSync('report2-collector-backup-proof.json',JSON.stringify(receipt,null,2)+'\n');
  console.log('REPORT2_PUBLIC_COLLECTOR_BACKUP',JSON.stringify(receipt));
}
if(process.argv[1]&&new URL(import.meta.url).pathname===path.resolve(process.argv[1]))main().catch(error=>{console.error('REPORT2_PUBLIC_COLLECTOR_BACKUP_ERROR',String(error?.message||error).slice(0,240));process.exitCode=1;});

