// One release-verification request. No production DB, scheduler, Telegram or history writes.
import fs from 'node:fs';
import {compileOfficialSourceRegistry} from '../../current-generation/files/src/official-source-registry.mjs';
import {normalizeNansenFlows,consumeSpecialistContext} from '../../current-generation/files/src/specialist-candidate-context.mjs';
const key=process.env.NANSEN_API_KEY||'';
const official=compileOfficialSourceRegistry(JSON.parse(fs.readFileSync(new URL('../../current-generation/files/official-event-sources.json',import.meta.url),'utf8')));
const identity=official.registry.JUP,base='JUP',now=Date.now(),end=Math.floor(now/3600000)*3600000;
if(!key||identity?.chain!=='solana'||!identity?.contract_or_mint)throw Error('EXISTING_KEY_AND_APPROVED_JUP_IDENTITY_REQUIRED');
const request={chain:identity.chain,token_address:identity.contract_or_mint,label:'exchange',date:{from:new Date(end-7200000).toISOString(),to:new Date(end).toISOString()},pagination:{page:1,per_page:10},order_by:[{field:'date',direction:'ASC'}]};
let result;
try{
 const response=await fetch('https://api.nansen.ai/api/v1/tgm/flows',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify(request),redirect:'error',signal:AbortSignal.timeout(20000)});
 const payload=await response.json();
 const normalized=response.ok?normalizeNansenFlows(payload,{base,now:Date.now(),identity,window_end:end}):null;
 const consumed=normalized?consumeSpecialistContext({sources:{NANSEN_FLOWS:normalized},contract:'JUP-USDT',now:Date.now(),asset_identity:identity}):null;
 result={status:normalized?.status||'SOURCE_UNAVAILABLE',http_status:response.status,reason:normalized?.reason||null,provider_code:typeof payload?.code==='string'?payload.code:null,credits_quoted:response.headers.get('X-Nansen-Credits-Cost'),credits_used:response.headers.get('X-Nansen-Credits-Used'),contract:'JUP-USDT',chain:identity.chain,request_window:request.date,response_rows:Array.isArray(payload?.data)?payload.data.length:null,pagination:payload?.pagination?{is_last_page:payload.pagination.is_last_page,page:payload.pagination.page}:null,buckets:(Array.isArray(payload?.data)?payload.data:[]).slice(0,4).map(r=>({date:r.date,bucket_end:r.bucket_end,is_complete:r.is_complete,total_inflows_cex:r.total_inflows_cex,total_outflows_cex:r.total_outflows_cex})),net_cex_tokens:normalized?.net_cex_tokens??null,consumer_status:consumed?.blocks?.exchange_flows?.status||null,visible_fact:consumed?.facts?.[0]||null};
}catch{result={status:'TRANSPORT_OR_JSON_ERROR'};}
console.log(JSON.stringify({...result,verification_only:true,actual_http:1,new_statistics_campaign:false,production_database_writes:0,telegram_calls:0,trades:0,source_commit:'429f201fc27db88a7e0315205f2ad8e744c4311a'},null,2));
