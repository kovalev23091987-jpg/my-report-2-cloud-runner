import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const API_ROOT='https://api.cloudflare.com/client/v4';
const SCRIPT_NAME='my-report-2-hub';

const required=name=>{
  const value=String(process.env[name]||'').trim();
  if(!value)throw new Error(`${name}_REQUIRED`);
  return value;
};

const cfFetch=async(token,pathname,accept='application/json',operation='REQUEST')=>{
  const response=await fetch(`${API_ROOT}${pathname}`,{
    headers:{Authorization:`Bearer ${token}`,Accept:accept},
    signal:AbortSignal.timeout(45_000),
  });
  const bytes=Buffer.from(await response.arrayBuffer());
  if(!response.ok){
    let detail=`HTTP_${response.status}`;
    try{
      const body=JSON.parse(bytes.toString('utf8'));
      detail=String(body?.errors?.[0]?.message||detail).slice(0,240);
    }catch{}
    throw new Error(`CLOUDFLARE_API_${operation}_${detail}`);
  }
  return {bytes,contentType:response.headers.get('content-type')||'application/octet-stream'};
};

const cfJson=async(token,pathname,operation)=>{
  const {bytes}=await cfFetch(token,pathname,'application/json',operation);
  const body=JSON.parse(bytes.toString('utf8'));
  if(body?.success===false)throw new Error('CLOUDFLARE_API_UNSUCCESSFUL');
  return body;
};

export const sanitizeBindings=bindings=>(Array.isArray(bindings)?bindings:[]).map(binding=>({
  name:String(binding?.name||''),
  type:String(binding?.type||'unknown'),
})).filter(binding=>binding.name).sort((a,b)=>a.name.localeCompare(b.name));

export const sanitizeSchedules=schedules=>(Array.isArray(schedules)?schedules:[]).map(schedule=>({
  cron:String(schedule?.cron||''),
  created_on:schedule?.created_on||null,
  modified_on:schedule?.modified_on||null,
})).filter(schedule=>schedule.cron).sort((a,b)=>a.cron.localeCompare(b.cron));

const main=async()=>{
  const token=required('CLOUDFLARE_API_TOKEN');
  const outputDir=path.resolve(process.argv[2]||'cloudflare-hub-audit');
  fs.mkdirSync(outputDir,{recursive:true});

  const verification=await cfJson(token,'/user/tokens/verify','VERIFY_TOKEN');
  if(String(verification?.result?.status||'').toLowerCase()!=='active')throw new Error('CLOUDFLARE_TOKEN_NOT_ACTIVE');

  const accounts=await cfJson(token,'/accounts?per_page=50','LIST_ACCOUNTS');
  const matches=[];
  for(const account of accounts?.result||[]){
    const scripts=await cfJson(token,`/accounts/${encodeURIComponent(account.id)}/workers/scripts`,'LIST_SCRIPTS');
    for(const script of scripts?.result||[]){
      const name=String(script?.id||script?.name||'');
      if(name===SCRIPT_NAME)matches.push({account,script});
    }
  }
  if(matches.length!==1)throw new Error(`CLOUDFLARE_HUB_MATCH_COUNT_${matches.length}`);

  const [{account,script}]=matches;
  const base=`/accounts/${encodeURIComponent(account.id)}/workers/scripts/${encodeURIComponent(SCRIPT_NAME)}`;
  const [content,settings,schedules]=await Promise.all([
    cfFetch(token,`${base}/content/v2`,'*/*','READ_CONTENT'),
    cfJson(token,`${base}/settings`,'READ_SETTINGS'),
    cfJson(token,`${base}/schedules`,'READ_SCHEDULES'),
  ]);

  const rawSettings={
    schema:'my-report-2-cloudflare-hub-settings-v1',
    captured_at:new Date().toISOString(),
    account_id:account.id,
    account_name:account.name,
    script_name:SCRIPT_NAME,
    settings,
    schedules,
  };
  const bindings=sanitizeBindings(settings?.result?.bindings);
  const cronTriggers=sanitizeSchedules(schedules?.result);
  const summary={
    schema:'my-report-2-cloudflare-hub-read-only-audit-v1',
    captured_at:rawSettings.captured_at,
    operation:'READ_ONLY',
    changed_cloudflare:false,
    script_name:SCRIPT_NAME,
    script_created_on:script?.created_on||null,
    script_modified_on:script?.modified_on||null,
    bundle_sha256:crypto.createHash('sha256').update(content.bytes).digest('hex'),
    bundle_bytes:content.bytes.length,
    bundle_content_type:content.contentType,
    compatibility_date:settings?.result?.compatibility_date||null,
    compatibility_flags:Array.isArray(settings?.result?.compatibility_flags)?settings.result.compatibility_flags:[],
    binding_count:bindings.length,
    bindings,
    cron_trigger_count:cronTriggers.length,
    cron_triggers:cronTriggers,
    secret_values_exported:false,
    raw_material_encrypted_by_workflow:true,
  };

  fs.writeFileSync(path.join(outputDir,'cloudflare-hub-bundle.bin'),content.bytes);
  fs.writeFileSync(path.join(outputDir,'cloudflare-hub-settings.json'),`${JSON.stringify(rawSettings,null,2)}\n`,'utf8');
  fs.writeFileSync(path.join(outputDir,'cloudflare-hub-audit-summary.json'),`${JSON.stringify(summary,null,2)}\n`,'utf8');
  console.log(JSON.stringify({status:'CLOSED_READ_ONLY',script_name:SCRIPT_NAME,bundle_sha256:summary.bundle_sha256,bundle_bytes:summary.bundle_bytes,binding_count:summary.binding_count,cron_trigger_count:summary.cron_trigger_count,changed_cloudflare:false}));
};

if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)){
  main().catch(error=>{console.error(String(error?.message||error));process.exitCode=1;});
}
