import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const url='https://node.liqflow.app/openapi.json';
await fs.mkdir('source-schema',{recursive:true});
const started=Date.now();let receipt={url,started_ts:started,request_cap:1,kind:'OFFICIAL_DOCUMENTATION_SCHEMA_ONLY',market_requests:0,Telegram:0,MAIN:0};
try{
 const r=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)});
 const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length>2000000)throw Error('DOCUMENTATION_BODY_OVER_BOUND');
 receipt={...receipt,http_status:r.status,received_ts:Date.now(),bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
 await fs.writeFile('source-schema/liqflow-openapi.raw',bytes);
 if(r.ok){const d=JSON.parse(bytes);await fs.writeFile('source-schema/routes.json',JSON.stringify({info:d.info,servers:d.servers,paths:d.paths,schemas:d.components?.schemas},null,2));}
}catch(e){receipt.error=String(e.message).slice(0,200);receipt.received_ts=Date.now();}
await fs.writeFile('source-schema/receipt.json',JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt));
