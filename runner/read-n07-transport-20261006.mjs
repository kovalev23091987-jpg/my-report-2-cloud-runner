import fs from 'node:fs/promises';
import {RemoteD1Database} from './report2-d1-adapter.mjs';
import {loadDailyUsageAggregate,evaluateDailyReservationBudget,reserveRunBudget,finalizeRunUsage} from './d1-preaction-budget-guard.mjs';
import {collectHtxOfficialAnnouncements,boundedTransportErrorCodes} from '../runtime/src/htx-official-announcements-evidence.mjs';
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN);
const now=Date.now(),id='N07_TRANSPORT:'+process.env.GITHUB_RUN_ID+':'+process.env.GITHUB_RUN_ATTEMPT;
const out={schema:'report2-bounded-n07-transport-proof-v1',head:process.env.GITHUB_SHA,observed_ts:now,MAIN:0,Telegram:0,Nansen:0,maximum_sourceHTTP:1,sourceHTTP:0,transport:[]};
const check=()=>{const u=db.usageSnapshot();if(u.unknown_ops!==0||u.rows_read>2300||u.rows_written>50||u.requests>30)throw Error('BOUNDED_D1_USAGE_EXCEEDED');};
out.admission=evaluateDailyReservationBudget({daily:await loadDailyUsageAggregate(db,now),nextReservation:{rows_read:2500,rows_written:64},maxDailyReads:3500000,maxDailyWrites:70000});
if(out.admission.allowed){
 await reserveRunBudget(db,{reservationId:id,now,reservation:{rows_read:2500,rows_written:64}});
 try{
  out.result=await collectHtxOfficialAnnouncements({db,contract:'NEAR-USDT',run_id:id,now,
   request_admit:({attempts})=>{check();return attempts===1&&out.sourceHTTP===0?{allowed:true,status:'BOUNDED_SOURCE_EVALUATION_1_OF_164',lane:'background',attempts:1}:{allowed:false,status:'PROBE_HTTP_LIMIT'};},
   fetch_impl:async(url,init)=>{check();if(out.sourceHTTP>=1)throw Error('PROBE_HTTP_LIMIT');out.sourceHTTP++;
    try{
     const response=await fetch(url,init);
     const location=response.headers.get('location');let official_redirect=null;
     if(location){try{const next=new URL(location,url);official_redirect={https:next.protocol==='https:',official_host:next.hostname==='www.htx.com'||next.hostname==='htx.com',path:next.pathname.slice(0,160)};}catch{}}
     out.transport.push({response_received:true,status:response.status,official_redirect});return response;
    }catch(error){
     const causes=[];let e=error;
     for(let i=0;e&&i<4;i++,e=e.cause){
      const m=String(e.message||'').toLowerCase();
      causes.push({code:/^[A-Z][A-Z0-9_]{1,79}$/.test(String(e.code||''))?e.code:null,
       normalized_reason:m.includes('unexpected redirect')?'UNEXPECTED_REDIRECT':m.includes('redirect count')?'REDIRECT_LIMIT':m.includes('timeout')?'TIMEOUT':m.includes('getaddrinfo')?'DNS':m.includes('certificate')?'TLS_CERTIFICATE':m.includes('fetch failed')?'FETCH_FAILED':'OTHER_UNSPECIFIED'});
     }
     out.transport.push({response_received:false,codes:boundedTransportErrorCodes(error),causes});throw error;
    }
   }});
  check();out.status='BOUNDED_SOURCE_READ_COMPLETED';
 }catch(error){out.status='SOURCE_READ_OR_BUDGET_FAILED';out.error=String(error.message).slice(0,160);}
 finally{out.finalized_usage=await finalizeRunUsage(db,{reservationId:id,sourceRunId:process.env.GITHUB_RUN_ID,usage:db.usageSnapshot()});}
}else out.status='D1_ADMISSION_BLOCKED';
out.d1_usage=db.usageSnapshot();
await fs.mkdir('audit-output',{recursive:true});await fs.writeFile('audit-output/n07-transport-proof.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({...out,result:out.result?{status:out.result.status,network_calls:out.result.network_calls,cache_status:out.result.cache_status,check_completed:out.result.check_completed,source_admission:out.result.admission,receipts:out.result.receipts}:null}));
if(out.status==='SOURCE_READ_OR_BUDGET_FAILED')process.exitCode=1;
