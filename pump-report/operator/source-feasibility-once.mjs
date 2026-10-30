import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const SOURCE_CONTROL_URL='https://my-report-2-hub.kovalev23091987.workers.dev/pump/source-feasibility';
const ID='pump-f550-source-feasibility-20261025-one',hash=b=>createHash('sha256').update(b).digest('hex');
async function exclusiveJSON(file,value){const handle=await fs.open(file,'wx',0o600);try{await handle.writeFile(JSON.stringify(value,null,2)+'\n');await handle.sync();}finally{await handle.close();}}

export async function sourceFeasibilityOnce({admission_file,artifact_file,control_key_file,attempt_file,output_file,execute=false,fetch_impl=globalThis.fetch,clock=Date.now}){
  const admissionBytes=await fs.readFile(admission_file),admission=JSON.parse(admissionBytes),now=clock();
  if(admission.status!=='ADMITTED_NOT_SPENT'){
    if(execute)throw Error('POSITIVE_SOURCE_OPERATION_ADMISSION_REQUIRED');
    return {status:'PROPOSAL_NOT_ADMITTED',network_attempts:0,execute:false};
  }
  if(admission.schema!=='PUMP_F550_SOURCE_SINGLE_ADMISSION_V1'||admission.run_id!==ID||admission.endpoint!==SOURCE_CONTROL_URL||admission.provider_attempts_max!==3||admission.additional_CONTROL_operations!==1||!Number.isSafeInteger(admission.expires_ts)||admission.expires_ts<=now||!Number.isSafeInteger(admission.own_lease?.expires_ts)||admission.expires_ts>admission.own_lease.expires_ts||!/^CODEX:ACTIVE105_SOURCE_RELIABILITY:[0-9]+$/.test(admission.own_lease.owner??'')||!/^[a-f0-9]{64}$/.test(admission.owner_permission_sha256??'')||!/^[a-f0-9]{40}$/.test(admission.authority_main??''))throw Error('EXACT_SOURCE_OPERATION_ADMISSION_REQUIRED');
  const artifactBytes=await fs.readFile(artifact_file),artifact=JSON.parse(artifactBytes);
  if(hash(artifactBytes)!==admission.artifact_sha256||artifact.manifest?.implementation_pin?.sha256!==admission.implementation_sha256||!artifact.modules?.['runtime/provider-policy.mjs']?.includes("PROVIDER_STAGE = 'SOURCE_FEASIBILITY_SINGLE'"))throw Error('EXACT_ADMITTED_ARTIFACT_REQUIRED');
  if(!execute)return {status:'ADMITTED_PREFLIGHT_ONLY',network_attempts:0,execute:false,artifact_sha256:admission.artifact_sha256};
  const keyStat=await fs.lstat(control_key_file);if(!keyStat.isFile()||(keyStat.mode&0o077)!==0)throw Error('PRIVATE_CONTROL_KEY_FILE_REQUIRED');
  const key=(await fs.readFile(control_key_file,'utf8')).trim();if(!key||key.length>512||/[\r\n]/.test(key))throw Error('PRIVATE_CONTROL_KEY_INVALID');
  for(const file of [attempt_file,output_file]){try{await fs.access(file);throw Error('FIXED_OPERATION_ALREADY_ATTEMPTED_OR_OUTPUT_EXISTS');}catch(error){if(error.code!=='ENOENT')throw error;}}
  const started_ts=clock(),request={url:SOURCE_CONTROL_URL,method:'POST',body:{grant_id:ID},started_ts};
  // Durable before IO. An unknown response never makes this operation retryable.
  await exclusiveJSON(attempt_file,{schema:'PUMP_FIXED_SOURCE_CLIENT_ATTEMPT_V1',run_id:ID,state:'ATTEMPTED_NON_REFUNDABLE',started_ts,admission_sha256:hash(admissionBytes),artifact_sha256:admission.artifact_sha256});
  let response;
  try{
    response=await fetch_impl(SOURCE_CONTROL_URL,{method:'POST',headers:{'content-type':'application/json','x-pump-control-key':key},body:JSON.stringify(request.body),redirect:'manual',signal:AbortSignal.timeout(150000)});
    const reader=response.body.getReader(),parts=[];let bytes=0;
    try{for(;;){const item=await reader.read();if(item.done)break;bytes+=item.value.byteLength;if(bytes>8000000)throw Error('PRIVATE_CONTROL_REPLY_BOUND_EXCEEDED');parts.push(item.value);}}finally{await reader.cancel().catch(()=>{});}
    const raw=Buffer.concat(parts),received_ts=clock();let body=null;try{body=JSON.parse(raw.toString('utf8'));}catch{}
    await exclusiveJSON(output_file,{schema:'PUMP_PRIVATE_SOURCE_CONTROL_REPLY_V1',request,http_status:response.status,received_ts,body,body_sha256:hash(raw),body_bytes:raw.length,body_bytes_basis:'FETCH_RESPONSE_BODY_BYTES',reply_json_valid:body!==null});
    const saved=await fs.readFile(output_file);
    return {status:'REPLY_SAVED_NO_RETRY',http_status:response.status,output_file,sha256:hash(saved),bytes:saved.length,network_attempts:1,Telegram:0};
  }catch(error){
    await fs.writeFile(attempt_file,JSON.stringify({schema:'PUMP_FIXED_SOURCE_CLIENT_ATTEMPT_V1',run_id:ID,state:'ACK_UNKNOWN_STOP_NO_RETRY',started_ts,error:'CONTROL_RESPONSE_UNCONFIRMED',http_status:response?.status??null},null,2)+'\n',{mode:0o600});
    throw Error('SOURCE_CONTROL_ACK_UNKNOWN_STOP_NO_RETRY');
  }
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),get=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
  try{const result=await sourceFeasibilityOnce({admission_file:get('--admission'),artifact_file:get('--artifact'),control_key_file:get('--control-key'),attempt_file:get('--attempt'),output_file:get('--output'),execute:args.includes('--execute')});console.log(JSON.stringify(result));}
  catch(error){console.error(/^[A-Z0-9_]{1,160}$/.test(error.message)?error.message:'SOURCE_CONTROL_CLIENT_FAILED');process.exitCode=1;}
}
