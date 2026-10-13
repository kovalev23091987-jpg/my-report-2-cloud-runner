import fs from 'node:fs/promises';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import * as guard from '../runner/d1-preaction-budget-guard.mjs';
import {collectCoingeckoSectorEvidence} from '../current-generation/files/src/coingecko-sector-evidence.mjs';
import {consumeSectorContext} from '../current-generation/files/src/sector-context.mjs';
const repo='kovalev23091987-jpg/my-report-2-cloud-runner',reservation={rows_read:8000,rows_written:200},maxHTTP=4;
for(const key of ['GITHUB_TOKEN','GITHUB_RUN_ID','GITHUB_SHA','REPORT2_EXPECTED_MAIN','REPORT2_EXPECTED_LEASE_OWNER','REPORT2_COINGECKO_DEMO_API_KEY','REPORT2_D1_BRIDGE_URL','REPORT2_D1_BRIDGE_TOKEN'])if(!process.env[key])throw Error(key+'_REQUIRED');
if(process.env.GITHUB_REPOSITORY!==repo)throw Error('EXACT_REPOSITORY_REQUIRED');
const api=async path=>{const r=await fetch('https://api.github.com/repos/'+repo+'/'+path,{headers:{authorization:'Bearer '+process.env.GITHUB_TOKEN,accept:'application/vnd.github+json'},signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('GITHUB_CONTROL_READ_'+r.status);return r.json();};
const main=(await api('git/ref/heads/main')).object.sha;if(main!==process.env.REPORT2_EXPECTED_MAIN||main!==process.env.GITHUB_SHA)throw Error('MAIN_MOVED');
const read=async path=>JSON.parse(Buffer.from((await api('contents/'+path+'?ref='+main)).content,'base64').toString());
const [phase,fence]=await Promise.all([read('checkpoints/CLOUD_PHASE_STATE_20261004.json'),read('audit-fixes/source-optimization-20260930/execution-lock.json')]);
if(phase.lease?.owner!==process.env.REPORT2_EXPECTED_LEASE_OWNER||phase.lease.expires_ts<=Date.now()||fence.active)throw Error('OWNER_OR_FENCE_BLOCKED');
const symbol=process.env.REPORT2_VALIDATION_SYMBOL||'UNI';if(!['UNI','QNT'].includes(symbol))throw Error('EXACT_VALIDATION_SYMBOL_REQUIRED');
const routes=await read('checkpoints/N05_104_EXACT_SOURCE_ROUTES_20261010.json'),row=routes.rows?.find(r=>r.symbol===symbol);
if(row?.contract!==symbol+'-USDT'||row.identity?.chain!=='ethereum'||!/^0x[a-f0-9]{40}$/i.test(row.identity.contract_or_mint))throw Error('ORIGINAL_EXACT_VALIDATION_IDENTITY_REQUIRED');
const now=Date.now(),id='COINGECKO_DEMO_SECTOR:'+process.env.GITHUB_RUN_ID+':'+process.env.GITHUB_RUN_ATTEMPT;
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),out={schema:'REPORT2_COINGECKO_DEMO_SECTOR_VALIDATION_V1',head:main,cloud_run:process.env.GITHUB_RUN_ID,run_id:id,contract:row.contract,identity:row.identity,source_identity_record:'checkpoints/N05_104_EXACT_SOURCE_ROUTES_20261010.json',missing_fact:symbol==='QNT'?'QNT_USEFUL_SECTOR_AFTER_ACTUAL_D1_SCHEMA_TRANSPORT_FAILURE':'UNI_CURRENT_FREE_DEMO_SECTOR_AFTER_CP_MEMBERSHIP_ABSENCE',status:'NOT_ADMITTED',maximum_source_HTTP:maxHTTP,D1_reservation:reservation,MAIN:0,Telegram:0,score:0,new_fresh_SENT:false,project_complete:false};
let admitted=false,usedHTTP=0;
await fs.mkdir('audit-output/coingecko-demo-sector',{recursive:true});
try{
 out.daily_admission=guard.evaluateDailyReservationBudget({daily:await guard.loadDailyUsageAggregate(db,now),nextReservation:reservation});if(!out.daily_admission.allowed)throw Error('D1_DAY_HEADROOM_DENIED');
 await guard.reserveRunBudget(db,{reservationId:id,now,reservation});admitted=true;
 const request_admit=()=>{if(usedHTTP>=maxHTTP||!guard.evaluateWithinRunReservation({reservation,currentUsage:db.usageSnapshot(),extraRowsRead:500,extraRowsWritten:40}).allowed)return{allowed:false,status:'VALIDATION_HTTP_OR_D1_BOUND'};usedHTTP++;return{allowed:true,status:'RESERVED'};};
 const result=await collectCoingeckoSectorEvidence({db,request_admit,contract:row.contract,run_id:id,asset_identity:row.identity,asset_metadata:{},now,strict_fresh_manual:true,coingecko_demo_api_key:process.env.REPORT2_COINGECKO_DEMO_API_KEY});
 const context=consumeSectorContext({evidence:result.evidence,contract:row.contract,asset_identity:row.identity,now:Date.now()});
 Object.assign(out,{status:result.status,auth_mode:result.auth_mode,actual_HTTP:result.network_calls,receipts:result.receipts,summary:result.summary,admission:result.admission,provider_backoff:result.provider_backoff,backoff_until:result.backoff_until??result.provider_backoff?.backoff_until??null,evidence:result.evidence,consumer_status:context.status,consumer_facts:context.facts,production_use_claim:false,monthly_source_bound:result.monthly_module_bound});
}catch(error){out.status='VALIDATION_NOT_CLOSED';out.reason=/^[A-Z0-9_]+$/.test(error.message)?error.message:error.name;}
finally{
 if(admitted)out.finalized_usage=await guard.finalizeRunUsage(db,{reservationId:id,sourceRunId:process.env.GITHUB_RUN_ID,usage:db.usageSnapshot()});out.D1=db.usageSnapshot();
 if(out.D1.unknown_ops||out.D1.rows_read>reservation.rows_read||out.D1.rows_written>reservation.rows_written)out.status='D1_ENVELOPE_NOT_CLOSED';
 out.completed_ts=Date.now();await fs.writeFile('audit-output/coingecko-demo-sector/validation.json',JSON.stringify(out,null,2)+'\n');
 console.log(JSON.stringify({status:out.status,auth_mode:out.auth_mode,actual_HTTP:out.actual_HTTP,consumer_status:out.consumer_status,D1:out.D1,reason:out.reason}));
}
