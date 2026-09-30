import fs from 'node:fs/promises';
const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
let result;
try{
 const r=await fetch('https://coinlobster.com/mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'liq_zones',arguments:{pair:'BTW/USD'}}}),signal:controller.signal});
 const body=await r.text();if(body.length>2000000)throw Error('PAYLOAD_TOO_LARGE');
 let p;try{p=JSON.parse(body);}catch{const data=body.split('\n').filter(s=>s.startsWith('data:')).map(s=>s.slice(5).trim());p=data.map(s=>{try{return JSON.parse(s);}catch{return null;}}).find(x=>x?.id===1);}
 result={schema:'coinlobster-future-map-probe-v1',contract:'BTW-USDT',received_ts:Date.now(),http_status:r.status,response:p,secrets_included:false,network_calls:1,telegram_messages:0};
}catch(e){result={status:'NOT_CLOSED',reason:e.name==='AbortError'?'TIMEOUT':e.message};}finally{clearTimeout(timer);}
await fs.mkdir('audit-output',{recursive:true});await fs.writeFile('audit-output/coinlobster-future-probe.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
