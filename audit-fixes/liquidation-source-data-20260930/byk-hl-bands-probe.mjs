import fs from 'node:fs/promises';
import {RemoteD1Database} from '../../runner/report2-d1-adapter.mjs';
import {makeBykReserve} from '../../current-generation/files/byk-quota-budget.mjs';
import {readJson} from '../../current-generation/files/src/liquidation-extension/io.mjs';
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN);
const results=[];
const sanitize=x=>Array.isArray(x)?x.map(sanitize):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).filter(([k])=>!/^account$|^address$|^wallet$|secret|credential|authorization|api.?key/i.test(k)).map(([k,v])=>[k,sanitize(v)])):x;
for(const coin of ['BTW','SOL']){
 const run_id=`BYK_HL_BANDS_ACCEPTANCE:${process.env.GITHUB_RUN_ID}:${coin}`,contract=coin+'-USDT';
 const grant=await makeBykReserve(db,{source:'manual'})({contract,run_id,units:1});
 const row={coin,quota_status:grant.status,actual_http:0};
 if(grant.allowed){
  const proxy=async(url,init={})=>{row.actual_http++;return fetch(process.env.REPORT2_SOURCE_PROXY_URL,{method:'POST',headers:{'content-type':'application/json',accept:'application/json',authorization:`Bearer ${process.env.REPORT2_SOURCE_PROXY_TOKEN}`},body:JSON.stringify({url:String(url)}),signal:init.signal});};
  const r=await readJson(`https://bykaranteli.com/api/public/hyperliquid-positions?coin=${coin}`,{fetch_impl:proxy,max_bytes:8000000,timeout_ms:12000});
  row.transport={ok:r.ok,status:r.receipt?.http_status,sha256:r.receipt?.sha256,reason:r.reason,provider_error:r.provider_error};
  if(r.ok)row.payload=sanitize(r.payload);
 }
 results.push(row);console.log(JSON.stringify({...row,payload:row.payload?{keys:Object.keys(row.payload),coin:row.payload.coin,mark:row.payload.mark,as_of:row.payload.as_of,coverage:row.payload.coverage,long_count:row.payload.long?.length,short_count:row.payload.short?.length,long_sample:row.payload.long?.slice(0,2),short_sample:row.payload.short?.slice(0,2)}:null}));
}
await fs.mkdir('audit-output',{recursive:true});await fs.writeFile('audit-output/byk-hl-bands-probe.json',JSON.stringify({schema:'report2-byk-tracked-future-bands-probe-v1',results,secrets_included:false,telegram_messages:0},null,2));
