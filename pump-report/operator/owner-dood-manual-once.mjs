import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const hash=b=>createHash('sha256').update(b).digest('hex');
const URL='https://my-report-2-hub.kovalev23091987.workers.dev/pump/manual';
const exclusive=async(file,value)=>{const h=await fs.open(file,'wx',0o600);try{await h.writeFile(JSON.stringify(value));await h.sync();}finally{await h.close();}};

export async function ownerOrdinaryManualOnce({admission_file,artifact_file,readback_file,control_key_file,attempt_file,output_file,execute=false,fetch_impl=globalThis.fetch,clock=Date.now}){
  const admissionBytes=await fs.readFile(admission_file),a=JSON.parse(admissionBytes),artifactBytes=await fs.readFile(artifact_file),artifact=JSON.parse(artifactBytes);
  if(a.schema!=='PUMP_OWNER_ORDINARY_MANUAL_ADMISSION_V1'||a.status!=='ADMITTED_NOT_SPENT'||a.operation?.endpoint!==URL||a.operation?.native_family!=='MANUAL'||typeof a.operation?.body?.publish!=='boolean'||a.operation?.body?.symbol!=='DOOD'||Object.hasOwn(a.operation.body,'capture_id')||!/^pump-owner-DOOD-20261026-[A-Za-z0-9-]+$/.test(a.operation?.body?.request_id??'')||Object.keys(a.operation.body).some(k=>!['symbol','publish','request_id'].includes(k))||a.operation?.provider_attempts_max!==13||a.operation?.Telegram_attempts!==(a.operation.body.publish?1:0)||a.operation?.new_CONTROL_operations!==0||!Number.isSafeInteger(a.expires_ts)||a.expires_ts<=clock()||a.expires_ts>a.own_lease?.expires_ts||!/^[a-f0-9]{40}$/.test(a.authority_main??'')||!/^[a-f0-9]{64}$/.test(a.direct_authority_sha256??''))throw Error('EXACT_PRODUCTION_MANUAL_ADMISSION_REQUIRED');
  if(hash(artifactBytes)!==a.artifact_sha256||artifact.manifest?.implementation_pin?.sha256!==a.implementation_sha256||!artifact.modules?.['runtime/provider-policy.mjs']?.includes("PROVIDER_STAGE = 'PRODUCTION_QUALIFIED'"))throw Error('EXACT_PRODUCTION_ARTIFACT_REQUIRED');
  const plan=artifact.modules?.['runtime/production-policy.mjs']??'';if(plan.includes(a.operation.body.request_id))throw Error('OLD_FIXED_CAPTURE_ID_FORBIDDEN');
  if(!execute)return {status:'ADMITTED_PREFLIGHT_ONLY',network_attempts:0};
  const readback=JSON.parse(await fs.readFile(readback_file));
  const expected=a.expected_flags??{automatic_enabled:false,delivery_enabled:false};
  if(a.operation.body.publish&&expected.delivery_enabled!==true)throw Error('PRODUCTION_DELIVERY_FLAG_ADMISSION_REQUIRED');
  if(readback.schema!=='ROOT_PRODUCTION_EXACT_DEPLOYMENT_READBACK_V1'||readback.artifact_sha256!==a.artifact_sha256||readback.implementation_sha256!==a.implementation_sha256||readback.FULL_exact_module_bytes!==true||readback.health?.automatic_enabled!==expected.automatic_enabled||readback.health?.delivery_enabled!==expected.delivery_enabled||readback.health?.provider_stage!=='PRODUCTION_QUALIFIED'||readback.readback_ts>a.expires_ts||clock()-readback.readback_ts>300000)throw Error('FRESH_EXACT_DEPLOYMENT_FLAGS_READBACK_REQUIRED');
  for(const f of [attempt_file,output_file]){try{await fs.access(f);throw Error('PRODUCTION_FIXED_OPERATION_ALREADY_ATTEMPTED');}catch(e){if(e.code!=='ENOENT')throw e;}}
  const st=await fs.lstat(control_key_file);if(!st.isFile()||(st.mode&0o077)!==0)throw Error('PRIVATE_CONTROL_KEY_REQUIRED');
  const key=(await fs.readFile(control_key_file,'utf8')).trim();if(!key||key.length>512||/[\r\n]/.test(key))throw Error('PRIVATE_CONTROL_KEY_INVALID');
  const started_ts=clock();await exclusive(attempt_file,{schema:'PUMP_PRODUCTION_FIXED_MANUAL_ATTEMPT_V1',state:'ATTEMPTED_NON_REFUNDABLE',request_id:a.operation.body.request_id,started_ts,admission_sha256:hash(admissionBytes)});
  try{
    const response=await fetch_impl(URL,{method:'POST',headers:{'content-type':'application/json','x-pump-control-key':key},body:JSON.stringify(a.operation.body),redirect:'manual',signal:AbortSignal.timeout(150000)});
    const reader=response.body?.getReader();if(!reader)throw Error('PRIVATE_BODY_REQUIRED');const parts=[];let size=0;
    try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>12000000)throw Error('PRIVATE_BODY_LIMIT');parts.push(value);}}finally{await reader.cancel().catch(()=>{});}
    const raw=Buffer.concat(parts),body=JSON.parse(raw.toString('utf8'));
    await exclusive(output_file,{schema:'PUMP_PRIVATE_PRODUCTION_MANUAL_REPLY_V1',request:{url:URL,method:'POST',body:a.operation.body,started_ts},http_status:response.status,received_ts:clock(),body,body_sha256:hash(raw),body_bytes:size});
    const saved=await fs.readFile(output_file);return {status:'REPLY_SAVED_NO_RETRY',http_status:response.status,output_file,bytes:saved.length,sha256:hash(saved),network_attempts:1};
  }catch{await exclusive(attempt_file+'.unknown.json',{state:'ACK_UNKNOWN_STOP_NO_RETRY',request_id:a.operation.body.request_id,recorded_ts:clock()});throw Error('PRODUCTION_ACK_UNKNOWN_STOP_NO_RETRY');}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),get=k=>{const n=args.indexOf(k);return n<0?undefined:args[n+1];};
  try{console.log(JSON.stringify(await ownerOrdinaryManualOnce({admission_file:get('--admission'),artifact_file:get('--artifact'),readback_file:get('--readback'),control_key_file:get('--control-key'),attempt_file:get('--attempt'),output_file:get('--output'),execute:args.includes('--execute')})));}catch(e){console.error(JSON.stringify({status:'STOP_NO_RETRY',error:/^[A-Z_]{1,120}$/.test(e.message)?e.message:'PRODUCTION_CLIENT_ERROR'}));process.exitCode=1;}
}
