import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const API='https://api.cloudflare.com/client/v4',SCRIPT='my-report-2-hub',here=path.dirname(new URL(import.meta.url).pathname),outDir=path.resolve(process.argv[2]||path.join(here,'dist'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();if(!token)throw Error('CLOUDFLARE_API_TOKEN_REQUIRED');
const request=async(pathname,accept='application/json')=>{const response=await fetch(`${API}${pathname}`,{headers:{Authorization:`Bearer ${token}`,Accept:accept},signal:AbortSignal.timeout(45_000)}),bytes=Buffer.from(await response.arrayBuffer());if(!response.ok)throw Error(`CLOUDFLARE_HTTP_${response.status}`);return{bytes,type:response.headers.get('content-type')||''};};
const asJson=async pathname=>JSON.parse((await request(pathname)).bytes.toString('utf8'));
const accounts=(await asJson('/accounts?per_page=50')).result||[];let account=null;
for(const row of accounts){const scripts=(await asJson(`/accounts/${row.id}/workers/scripts`)).result||[];if(scripts.some(item=>String(item?.id||item?.name||'')===SCRIPT)){if(account)throw Error('CLOUDFLARE_HUB_MATCH_COUNT_GT_ONE');account=row;}}
if(!account)throw Error('CLOUDFLARE_HUB_NOT_FOUND');
const base=`/accounts/${account.id}/workers/scripts/${SCRIPT}`,content=await request(`${base}/content/v2`,'*/*'),expected=fs.readFileSync(path.join(outDir,'worker.js'),'utf8');
const text=content.bytes.toString('utf8');if(!text.includes('report2-public-collector-v1-20260928'))throw Error('PUBLIC_COLLECTOR_MARKER_NOT_DEPLOYED');
const schedules=(await asJson(`${base}/schedules`)).result||[];if(schedules.length!==1||String(schedules[0]?.cron)!=='*/5 * * * *')throw Error('PUBLIC_COLLECTOR_CRON_NOT_EXACT');
const settings=(await asJson(`${base}/settings`)).result||{},names=new Set((settings.bindings||[]).map(row=>String(row.name)));
for(const name of ['DATA_DB','ALERT_DISPATCH_KEY','BYKARANTELI_API_KEY','REPORT2_CLOUD_SOURCE_PROXY_TOKEN','TELEGRAM_BOT_TOKEN','TELEGRAM_CHAT_ID','TELEGRAM_TEST_KEY','PUBLIC_COLLECTOR_ENABLED','ANALYTICS_ENABLED','DELIVERY_ENABLED','CALIBRATION_APPLY_ENABLED','REPORT2_CURRENT_GENERATION'])if(!names.has(name))throw Error(`CLOUDFLARE_BINDING_LOST:${name}`);
const proof={status:'DEPLOYED_VERIFIED',script:SCRIPT,expected_module_sha256:sha(expected),response_sha256:sha(content.bytes),collector_marker:true,cron:'*/5 * * * *',binding_names:[...names].sort(),secret_values_exported:false,verified_at:new Date().toISOString()};
fs.writeFileSync(path.join(outDir,'deployment-proof.json'),`${JSON.stringify(proof,null,2)}\n`);console.log(JSON.stringify(proof));
