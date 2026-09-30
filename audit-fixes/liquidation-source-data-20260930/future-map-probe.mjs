import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {RemoteD1Database} from '../../runner/report2-d1-adapter.mjs';
const root=resolve(process.argv[2]||'current-generation/files'),out=resolve(process.argv[3]||'audit-output');
const {makeBykReserve}=await import(pathToFileURL(resolve(root,'byk-quota-budget.mjs')));
const {fetchByk}=await import(pathToFileURL(resolve(root,'src/liquidation-extension/io.mjs')));
const {normalizeBykStructured}=await import(pathToFileURL(resolve(root,'src/liquidation-extension/providers.mjs')));
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN);
const symbol=process.env.REPORT2_FUTURE_PROBE_SYMBOL||'BTW',contract=symbol+'-USDT',run_id=`FUTURE_MAP_ACCEPTANCE:${process.env.GITHUB_RUN_ID}:${symbol}`;
const grant=await makeBykReserve(db,{source:'manual'})({contract,run_id,units:1});
const result={schema:'report2-future-map-live-probe-v1',contract,run_id,quota_status:grant.status,max_http:1,actual_http:0,telegram_messages:0,production_code_changed:false,secrets_included:false};
if(grant.allowed){
 const proxy=async(input,init={})=>{result.actual_http++;return fetch(process.env.REPORT2_SOURCE_PROXY_URL,{method:'POST',headers:{'content-type':'application/json',accept:'application/json',authorization:`Bearer ${process.env.REPORT2_SOURCE_PROXY_TOKEN}`},body:JSON.stringify({url:String(input)}),signal:init.signal});};
 const r=await fetchByk(symbol,{protected_fetch_impl:proxy});
 result.transport={ok:r.ok,reason:r.reason||null,status:r.receipt?.http_status,bytes:r.receipt?.bytes,sha256:r.receipt?.sha256,provider_error:r.provider_error||null};
 if(r.ok){
  const p=r.payload,now=Date.now();
  result.top_keys=Object.keys(p||{});result.model_keys=Object.keys(p?.real_levels||{});result.normalized=normalizeBykStructured(p,{symbol,as_of_ms:now,received_at_ms:r.receipt.received_ts,max_age_ms:300000,snapshot_id:run_id,run_id});
  result.payload={symbol:p?.symbol,as_of:p?.as_of,error:p?.error?true:null,real_levels:p?.real_levels?{model_version:p.real_levels.model_version,reference_price:p.real_levels.reference_price,sources:p.real_levels.sources,band_half_range_pct:p.real_levels.band_half_range_pct,excluded_tiers:p.real_levels.excluded_tiers,levels:(p.real_levels.levels||[]).slice(0,10000).map(z=>({price:z.price,notional_usd:z.notional_usd,side:z.side})),totals:p.real_levels.totals}:null};
 }
}
await fs.mkdir(out,{recursive:true});await fs.writeFile(resolve(out,'future-map-probe.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({contract,quota_status:result.quota_status,actual_http:result.actual_http,transport:result.transport,top_keys:result.top_keys,model_keys:result.model_keys,normalization_status:result.normalized?.status,zone_count:result.normalized?.zones?.length,source_ts:result.normalized?.source_ts,source_age_ms:result.normalized?.source_age_ms,upstreams:result.normalized?.upstream_groups,visible_range:result.normalized?.visible_half_range_pct}));
