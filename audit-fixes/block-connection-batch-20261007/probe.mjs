import fs from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {RemoteD1Database} from '../../runner/report2-d1-adapter.mjs';
import {loadDailyUsageAggregate,evaluateDailyReservationBudget,reserveRunBudget,finalizeRunUsage} from '../../runner/d1-preaction-budget-guard.mjs';
import {installEvidenceSourceStore,reserveEvidenceSourceAttempts} from '../../current-generation/files/src/evidence-source-store.mjs';

const MAX_HTTP=8,MAX_BODY=512*1024,db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),now=Date.now(),id=`BLOCK_CONNECTION_RESEARCH:${process.env.GITHUB_RUN_ID}:${process.env.GITHUB_RUN_ATTEMPT}`;
const out={schema:'BLOCK_CONNECTION_BATCH_ACTUAL_RESEARCH_20261007_V1',head:process.env.GITHUB_SHA,observed_ts:now,sourceHTTP:0,maximum_sourceHTTP:MAX_HTTP,MAIN:0,Telegram:0,trading:0,provider_enabled:false,source_to_consumer_accepted:false,responses:[],admissions:{},status:'NOT_STARTED'};
const hash=b=>createHash('sha256').update(b).digest('hex');
const check=()=>{const u=db.usageSnapshot();if(u.unknown_ops!==0||u.rows_read>1400||u.rows_written>220||u.requests>36)throw Error('BOUNDED_RESEARCH_D1_USAGE_EXCEEDED');};
async function request(source,url,body=null){
 if(out.sourceHTTP>=MAX_HTTP)throw Error('HTTP_CAP');check();
 out.sourceHTTP++;
 const started=Date.now(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
 const rec={source,url,method:body?'POST':'GET',request_body:body,requested_ts:started,receive_ts:null,http_status:null,status:'NOT_CLOSED',request_ordinal:out.sourceHTTP,body_sha256:null,payload:null};
 try{
  const response=await fetch(url,{method:rec.method,headers:{accept:'application/json','user-agent':'My-Report-2/bounded-source-research-contact-repository-kovalev23091987-jpg',...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:controller.signal});
  rec.receive_ts=Date.now();rec.http_status=response.status;rec.rate_limit={limit:response.headers.get('x-ratelimit-limit'),remaining:response.headers.get('x-ratelimit-remaining'),reset:response.headers.get('x-ratelimit-reset'),retry_after:response.headers.get('retry-after')};
  const data=await response.text();rec.body_bytes=Buffer.byteLength(data);rec.body_sha256=hash(data);
  if(rec.body_bytes>MAX_BODY){rec.status='RESPONSE_TOO_LARGE';}
  else{try{rec.payload=JSON.parse(data);}catch{rec.status='NON_JSON_RESPONSE';}if(rec.payload)rec.status=response.ok&&!rec.payload.error&&!rec.payload.result?.error?'TRANSPORT_SCHEMA_RECEIVED':response.status===429?'RATE_LIMITED':'HTTP_OR_RPC_ERROR';}
 }catch(e){rec.receive_ts=Date.now();rec.status=e?.name==='AbortError'?'TIMEOUT':'FETCH_ERROR';rec.error=String(e?.message||e).slice(0,180);}
 finally{clearTimeout(timer);out.responses.push(rec);}
 return rec;
}
out.admission=evaluateDailyReservationBudget({daily:await loadDailyUsageAggregate(db,now),nextReservation:{rows_read:1600,rows_written:240},maxDailyReads:3500000,maxDailyWrites:70000});
if(out.admission.allowed){
 await reserveRunBudget(db,{reservationId:id,now,reservation:{rows_read:1600,rows_written:240}});
 try{
  await installEvidenceSourceStore(db);check();
  for(const [source,count,cap] of [['GITHUB_OFFICIAL_RELEASES',3,12],['XRPL_NATIVE_SUPPLY',3,24],['STELLAR_NATIVE_SUPPLY',2,24]]){
   out.admissions[source]=await reserveEvidenceSourceAttempts(db,{source,reservation_id:`${id}:${source}`,attempts:count,daily_cap:cap,now});check();
  }
  if(out.admissions.GITHUB_OFFICIAL_RELEASES.allowed){
   for(const repo of ['aptos-labs/aptos-core','XRPLF/rippled','stellar/stellar-core'])await request('GITHUB_OFFICIAL_RELEASES',`https://api.github.com/repos/${repo}/releases?per_page=10`);
  }
  if(out.admissions.XRPL_NATIVE_SUPPLY.allowed){
   await request('XRPL_NATIVE_SUPPLY','https://s2.ripple.com:51234/',{method:'server_info',params:[{}]});
   const cur=await request('XRPL_NATIVE_SUPPLY','https://s2.ripple.com:51234/',{method:'ledger',params:[{ledger_index:'validated',transactions:false,expand:false,api_version:2}]});
   const parent=cur.payload?.result?.ledger?.parent_hash;
   if(cur.payload?.result?.validated===true&&/^[a-f0-9]{64}$/i.test(parent||''))await request('XRPL_NATIVE_SUPPLY','https://s2.ripple.com:51234/',{method:'ledger',params:[{ledger_hash:parent,transactions:false,expand:false,api_version:2}]});
  }
  if(out.admissions.STELLAR_NATIVE_SUPPLY.allowed){
   await request('STELLAR_NATIVE_SUPPLY','https://horizon.stellar.org/');
   await request('STELLAR_NATIVE_SUPPLY','https://horizon.stellar.org/ledgers?order=desc&limit=2');
  }
  check();out.status='BOUNDED_ACTUAL_RESEARCH_COMPLETE_NOT_INTEGRATION_ACCEPTANCE';
 }catch(e){out.status='RESEARCH_FAILED';out.error=String(e?.message||e).slice(0,200);}
 finally{out.finalized_usage=await finalizeRunUsage(db,{reservationId:id,sourceRunId:process.env.GITHUB_RUN_ID,usage:db.usageSnapshot()});}
}else out.status='D1_ADMISSION_BLOCKED';
out.d1_usage=db.usageSnapshot();
await fs.mkdir('audit-output',{recursive:true});const bytes=Buffer.from(JSON.stringify(out)),gz=gzipSync(bytes,{mtime:0});
await fs.writeFile('audit-output/actual-source-responses.json.gz',gz);
const summary={...out,responses:out.responses.map(r=>({...r,payload:undefined,shape:Array.isArray(r.payload)?'ARRAY:'+r.payload.length:Object.keys(r.payload||{})})),json_sha256:hash(bytes),gzip_sha256:hash(gz)};
await fs.writeFile('audit-output/connection-research-summary.json',JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary));
if(out.status==='RESEARCH_FAILED')process.exitCode=1;
