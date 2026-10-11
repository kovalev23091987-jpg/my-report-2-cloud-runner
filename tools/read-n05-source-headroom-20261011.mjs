import fs from 'node:fs/promises';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import * as guard from '../runner/d1-preaction-budget-guard.mjs';
const repo='kovalev23091987-jpg/my-report-2-cloud-runner',reservation={rows_read:1000,rows_written:20},root='audit-output/n05-source-headroom';
if(process.argv.includes('--plan')){console.log(JSON.stringify({schema:'N05_READ_ONLY_SOURCE_HEADROOM_PLAN_V1',provider_HTTP:0,D1_reservation:reservation}));process.exit(0);}
for(const name of ['GITHUB_RUN_ID','GITHUB_TOKEN','REPORT2_D1_BRIDGE_URL','REPORT2_D1_BRIDGE_TOKEN','REPORT2_EXPECTED_MAIN','REPORT2_EXPECTED_LEASE_OWNER'])if(!process.env[name])throw Error(name+'_REQUIRED');
if(process.env.GITHUB_REPOSITORY!==repo)throw Error('EXACT_REPOSITORY_REQUIRED');
const api=async path=>{const r=await fetch('https://api.github.com/repos/'+repo+'/'+path,{headers:{authorization:'Bearer '+process.env.GITHUB_TOKEN,accept:'application/vnd.github+json'},signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('GITHUB_CONTROL_READ_'+r.status);return r.json();};
const main=(await api('git/ref/heads/main')).object.sha;if(main!==process.env.REPORT2_EXPECTED_MAIN)throw Error('MAIN_MOVED');
const read=async path=>JSON.parse(Buffer.from((await api('contents/'+path+'?ref='+main)).content,'base64').toString());
const phase=await read('checkpoints/CLOUD_PHASE_STATE_20261004.json'),fence=await read('audit-fixes/source-optimization-20260930/execution-lock.json');
if(phase.lease?.owner!==process.env.REPORT2_EXPECTED_LEASE_OWNER||phase.lease.expires_ts<=Date.now()||fence.active)throw Error('OWNER_OR_FENCE_BLOCKED');
const now=Date.now(),run=process.env.GITHUB_RUN_ID,id='N05_SOURCE_HEADROOM:'+run+':'+process.env.GITHUB_RUN_ATTEMPT,db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN);
const out={schema:'N05_SOURCE_HEADROOM_ACTUAL_V1',run,main,lease_owner:phase.lease.owner,day_utc:new Date(now).toISOString().slice(0,10),provider_HTTP:0,MAIN:0,Telegram:0,status:'NOT_ADMITTED'};await fs.mkdir(root,{recursive:true});let admitted=false;
try{
 out.daily_admission=guard.evaluateDailyReservationBudget({daily:await guard.loadDailyUsageAggregate(db,now),nextReservation:reservation,maxDailyReads:3500000,maxDailyWrites:70000});if(!out.daily_admission.allowed)throw Error('D1_DAILY_ADMISSION_DENIED');
 await guard.reserveRunBudget(db,{reservationId:id,now,reservation});admitted=true;
 const p=await db.prepare('SELECT source, attempts FROM report2_evidence_source_daily WHERE day_utc=?1 ORDER BY source').bind(out.day_utc).all();
 out.rows=(p.results||[]).filter(r=>/^N05_OFFICIAL_FLOW:|^GATE_ASSET_REFERENCE$|^HTX_ASSET_REFERENCE$/.test(r.source)).map(r=>({source:r.source,attempts:Number(r.attempts),remaining_to_existing16:Math.max(0,16-Number(r.attempts))}));out.status='READ_ONLY_DAILY_HEADROOM_RETAINED';
}catch(e){out.status='READ_NOT_CLOSED';out.reason=e.message;}
finally{if(admitted)out.finalized_usage=await guard.finalizeRunUsage(db,{reservationId:id,sourceRunId:run,usage:db.usageSnapshot()});out.D1=db.usageSnapshot();out.completed_ts=Date.now();await fs.writeFile(root+'/headroom.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({status:out.status,rows:out.rows?.length,reason:out.reason,D1:out.D1}));}
