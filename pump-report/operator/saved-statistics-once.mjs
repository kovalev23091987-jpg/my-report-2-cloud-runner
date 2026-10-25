import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const hash=b=>createHash('sha256').update(b).digest('hex');
const ID='pump-saved-statistics-audit-20261025-one',URL='https://my-report-2-hub.kovalev23091987.workers.dev/pump/statistics-audit';
const exclusive=async(file,value)=>{const h=await fs.open(file,'wx',0o600);try{await h.writeFile(JSON.stringify(value));await h.sync();}finally{await h.close();}};
export async function savedStatisticsOnce({admission_file,artifact_file,control_key_file,attempt_file,output_file,execute=false,fetch_impl=globalThis.fetch,clock=Date.now}){
  const aBytes=await fs.readFile(admission_file),a=JSON.parse(aBytes),artifactBytes=await fs.readFile(artifact_file),artifact=JSON.parse(artifactBytes);
  if(a.schema!=='PUMP_SAVED_STATISTICS_SINGLE_ADMISSION_V1'||a.status!=='ADMITTED_NOT_SPENT'||a.run_id!==ID||a.endpoint!==URL||a.native_family!=='LOOKUP'||a.max_LOOKUP_runs_day!==10||a.provider_attempts_max!==0||a.Telegram_attempts!==0||!Number.isSafeInteger(a.expires_ts)||a.expires_ts<=clock()||a.expires_ts>a.own_lease?.expires_ts||!/^CODEX:ACTIVE105_SOURCE_RELIABILITY:[0-9]+$/.test(a.own_lease?.owner??'')||!/^[a-f0-9]{40}$/.test(a.authority_main??'')||!/^[a-f0-9]{64}$/.test(a.direct_full_implementation_authority_sha256??''))throw Error('EXACT_SAVED_STATISTICS_ADMISSION_REQUIRED');
  if(hash(artifactBytes)!==a.artifact_sha256||artifact.manifest?.implementation_pin?.sha256!==a.implementation_sha256||!artifact.modules?.['runtime/provider-policy.mjs']?.includes("PROVIDER_STAGE = 'SAVED_STATISTICS_AUDIT_SINGLE'"))throw Error('EXACT_SAVED_STATISTICS_ARTIFACT_REQUIRED');
  if(!execute)return {status:'ADMITTED_PREFLIGHT_ONLY',network_attempts:0};
  if(!attempt_file||!output_file||!control_key_file)throw Error('PRIVATE_PATHS_REQUIRED');
  for(const file of [attempt_file,output_file]){try{await fs.access(file);throw Error('FIXED_ATTEMPT_OR_OUTPUT_ALREADY_EXISTS');}catch(e){if(e.code!=='ENOENT')throw e;}}
  const stat=await fs.stat(control_key_file);if((stat.mode&0o077)!==0)throw Error('PRIVATE_CONTROL_KEY_PERMISSIONS_REQUIRED');
  const controlKey=(await fs.readFile(control_key_file,'utf8')).trim();if(!controlKey||controlKey.length>512)throw Error('PRIVATE_CONTROL_KEY_REQUIRED');
  const started_ts=clock();await exclusive(attempt_file,{schema:'PUMP_SAVED_STATISTICS_CLIENT_FIXED_ATTEMPT_V1',state:'ATTEMPTED_NON_REFUNDABLE',run_id:ID,started_ts,admission_sha256:hash(aBytes)});
  let attempted=true;
  try{
    const response=await fetch_impl(URL,{method:'POST',headers:{'content-type':'application/json','x-pump-control-key':controlKey},body:JSON.stringify({grant_id:ID}),redirect:'manual',signal:AbortSignal.timeout(90000)});
    const reader=response.body?.getReader(),parts=[];let size=0;
    if(!reader)throw Error('CONTROL_RESPONSE_BODY_MISSING');
    try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2000000)throw Error('CONTROL_RESPONSE_BODY_LIMIT');parts.push(value);}}finally{await reader.cancel().catch(()=>{});}
    const data=Buffer.concat(parts.map(p=>Buffer.from(p))),body=JSON.parse(data.toString('utf8'));
    const result={schema:'PUMP_SAVED_STATISTICS_CONTROL_CAPTURE_V1',request:{method:'POST',url:URL,grant_id:ID,started_ts},http_status:response.status,received_ts:clock(),body,body_sha256:hash(data),body_bytes:size};
    await exclusive(output_file,result);const saved=await fs.readFile(output_file);return {status:'REPLY_SAVED_NO_RETRY',http_status:response.status,output_file,sha256:hash(saved),bytes:saved.length,network_attempts:1,provider_HTTP:0,Telegram:0};
  }catch(error){await exclusive(attempt_file+'.ack-unknown.json',{state:'ACK_UNKNOWN_STOP_NO_RETRY',run_id:ID,recorded_ts:clock()});throw Error('SAVED_STATISTICS_ACK_UNKNOWN_STOP_NO_RETRY');}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),get=n=>{const i=args.indexOf(n);return i<0?undefined:args[i+1];};
  try{console.log(JSON.stringify(await savedStatisticsOnce({admission_file:get('--admission'),artifact_file:get('--artifact'),control_key_file:get('--control-key'),attempt_file:get('--attempt'),output_file:get('--output'),execute:args.includes('--execute')})));}catch(e){console.error(JSON.stringify({status:'STOP_NO_RETRY',error:e.message}));process.exitCode=1;}
}
