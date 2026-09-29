import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const API='https://api.cloudflare.com/client/v4';
const SCRIPT='my-report-2-hub';
const BASE_SHA='10da12a72dff2bbbdc18aba7273056c7cd894899c4949f2cbe67cfe38462f3af';
const VERSION='report2-public-collector-v5-backup-lease-20260929';
const PREVIOUS_VERSIONS=['report2-public-collector-v4-linear-pack-20260929','report2-public-collector-v3-contract-integrity-20260928','report2-public-collector-v2-20260928','report2-public-collector-v1-20260928'];
const here=path.dirname(new URL(import.meta.url).pathname);
const outDir=path.resolve(process.argv[2]||path.join(here,'dist'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const required=name=>{const value=String(process.env[name]||'').trim();if(!value)throw new Error(`${name}_REQUIRED`);return value;};

async function cf(token,pathname,accept='application/json'){
  const response=await fetch(`${API}${pathname}`,{headers:{Authorization:`Bearer ${token}`,Accept:accept},signal:AbortSignal.timeout(45_000)});
  const bytes=Buffer.from(await response.arrayBuffer());
  if(!response.ok)throw new Error(`CLOUDFLARE_HTTP_${response.status}`);
  return{bytes,content_type:response.headers.get('content-type')||''};
}
async function json(token,pathname){const response=await cf(token,pathname);const body=JSON.parse(response.bytes.toString('utf8'));if(body?.success===false)throw new Error('CLOUDFLARE_API_UNSUCCESSFUL');return body;}
export function moduleFromMultipart(bytes,contentType){
  const match=String(contentType).match(/boundary=(?:"([^"]+)"|([^;\s]+))/i);if(!match)return bytes.toString('utf8');
  const boundary=`--${match[1]||match[2]}`;
  for(const part of bytes.toString('utf8').split(boundary)){
    if(!/filename="worker\.js"/i.test(part))continue;
    const marker=part.includes('\r\n\r\n')?'\r\n\r\n':'\n\n';
    const at=part.indexOf(marker);if(at<0)continue;
    return part.slice(at+marker.length).replace(/\r?\n--\s*$/,'').replace(/\r?\n$/,'');
  }
  throw new Error('CLOUDFLARE_MAIN_MODULE_NOT_FOUND');
}
export function patchWorker(source,injected){
  if(source.includes(`var __REPORT2_PUBLIC_COLLECTOR_VERSION = "${VERSION}"`))return{source,status:'ALREADY_PATCHED'};
  const previousVersion=PREVIOUS_VERSIONS.find(version=>source.includes(`var __REPORT2_PUBLIC_COLLECTOR_VERSION = "${version}"`));
  const previousStart=previousVersion?source.indexOf(`var __REPORT2_PUBLIC_COLLECTOR_VERSION = "${previousVersion}"`):-1;
  if(previousStart>=0){
    const previousExport='export {\n  __REPORT2_PUBLIC_COLLECTOR_HANDLER as default\n};';
    const previousEnd=source.indexOf(previousExport,previousStart);
    if(previousEnd<0)throw new Error('CLOUDFLARE_PREVIOUS_COLLECTOR_EXPORT_MISSING');
    return{source:`${source.slice(0,previousStart)}${injected}\n${source.slice(previousEnd)}`,status:'UPGRADED'};
  }
  if(sha(source)!==BASE_SHA)throw new Error(`CLOUDFLARE_HUB_BASE_SHA_MISMATCH:${sha(source)}`);
  const marker='export {\n  worker_default as default\n};';
  if(!source.includes(marker))throw new Error('CLOUDFLARE_HUB_EXPORT_MARKER_MISSING');
  return{source:source.replace(marker,`${injected}\nexport {\n  __REPORT2_PUBLIC_COLLECTOR_HANDLER as default\n};`),status:'PATCHED'};
}

async function main(){
  const token=required('CLOUDFLARE_API_TOKEN');
  const verification=await json(token,'/user/tokens/verify');
  if(String(verification?.result?.status||'').toLowerCase()!=='active')throw new Error('CLOUDFLARE_TOKEN_NOT_ACTIVE');
  const accounts=await json(token,'/accounts?per_page=50');
  const matches=[];
  for(const account of accounts?.result||[]){const scripts=await json(token,`/accounts/${account.id}/workers/scripts`);if((scripts?.result||[]).some(row=>String(row?.id||row?.name||'')===SCRIPT))matches.push(account);}
  if(matches.length!==1)throw new Error(`CLOUDFLARE_HUB_MATCH_COUNT_${matches.length}`);
  const account=matches[0],base=`/accounts/${account.id}/workers/scripts/${SCRIPT}`;
  const [content,settings]=await Promise.all([cf(token,`${base}/content/v2`,'*/*'),json(token,`${base}/settings`)]);
  const original=moduleFromMultipart(content.bytes,content.content_type);
  const injected=fs.readFileSync(path.join(here,'injected-worker-tail.js'),'utf8').trim();
  const patched=patchWorker(original,injected);
  const bindings=Array.isArray(settings?.result?.bindings)?settings.result.bindings:[];
  const d1=bindings.find(row=>row?.name==='DATA_DB'&&row?.type==='d1');
  if(!d1?.id&&!d1?.database_id)throw new Error('CLOUDFLARE_DATA_DB_BINDING_MISSING');
  const secrets=bindings.filter(row=>row?.type==='secret_text').map(row=>String(row.name)).sort();
  fs.mkdirSync(outDir,{recursive:true});
  fs.writeFileSync(path.join(outDir,'worker.js'),patched.source);
  const config={
    name:SCRIPT,main:'worker.js',account_id:account.id,compatibility_date:settings?.result?.compatibility_date||'2026-09-11',keep_vars:true,no_bundle:true,
    vars:{PUBLIC_COLLECTOR_ENABLED:'1',ANALYTICS_ENABLED:'0',DELIVERY_ENABLED:'0',CALIBRATION_APPLY_ENABLED:'0',REPORT2_CURRENT_GENERATION:'MY_REPORT_2_CURRENT_20260928_CANONICAL_RUNTIME_V12_CONTRACT_INTEGRITY_20M'},
    d1_databases:[{binding:'DATA_DB',database_id:d1.id||d1.database_id}],
    triggers:{crons:['*/5 * * * *']},
  };
  fs.writeFileSync(path.join(outDir,'wrangler.json'),`${JSON.stringify(config,null,2)}\n`);
  fs.writeFileSync(path.join(outDir,'prepare-proof.json'),`${JSON.stringify({status:patched.status,script:SCRIPT,base_sha256:sha(original),output_sha256:sha(patched.source),collector_version:VERSION,binding_names:bindings.map(row=>String(row.name)).sort(),secret_values_exported:false},null,2)}\n`);
  console.log(JSON.stringify({status:patched.status,script:SCRIPT,base_sha256:sha(original),output_sha256:sha(patched.source),collector_version:VERSION,d1_binding:true,secret_values_exported:false}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)){
  main().catch(error=>{console.error(String(error?.stack||error));process.exit(1);});
}
