import fs from 'node:fs';
const account=process.env.CLOUDFLARE_ACCOUNT_ID||'',token=process.env.CLOUDFLARE_API_TOKEN||'';
const out={schema:'report2-existing-cloud-storage-readonly-v1',read_at:Date.now(),sourceHTTP:0,MAIN:0,Telegram:0,storage_write:0,databases_created:0,paid_plan_enabled:false};
if(!/^[a-f0-9]{32}$/.test(account)||!token)out.status='EXISTING_CLOUD_READ_CREDENTIAL_NOT_AVAILABLE';
else{
 const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database?per_page=100`,{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30000)});
 const d=await r.json();out.http_status=r.status;
 if(!r.ok||d.success!==true)out.status='EXISTING_CLOUD_D1_CATALOG_READ_NOT_AUTHORIZED';
 else{out.status='EXISTING_CLOUD_DATABASES_READ';out.databases=(d.result||[]).map(x=>({uuid:x.uuid,name:x.name,created_at:x.created_at,num_tables:x.num_tables,file_size:x.file_size,version:x.version}));out.free_database_limit=10;}
}
fs.writeFileSync('audit-output/cloud-storage-metadata.json',JSON.stringify(out,null,2));console.log(JSON.stringify({status:out.status,databases:out.databases?.length??null,sourceHTTP:0,MAIN:0,storage_write:0,secrets_logged:false}));
