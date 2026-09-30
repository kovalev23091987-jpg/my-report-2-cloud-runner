import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const runtime=path.resolve(process.argv[2]||'runtime'),out=path.resolve(process.argv[3]||'audit-output');
const {LIQUIDATION_INTELLIGENCE_API:api}=await import(pathToFileURL(path.join(runtime,'src/worker.js')).href);
let calls=0;
const sourceFetch=async(url,init={})=>{
 if(++calls>6)throw Error('BYK_FUTURE_PROBE_HTTP_CAP');
 const target=new URL(String(url));if(target.hostname!=='bykaranteli.com')throw Error('EXPECTED_BYK_PROVIDER');
 const timer=AbortSignal.timeout(12000);
 return fetch(process.env.REPORT2_SOURCE_PROXY_URL,{method:'POST',headers:{'content-type':'application/json',accept:'application/json',authorization:`Bearer ${process.env.REPORT2_SOURCE_PROXY_TOKEN}`},body:JSON.stringify({url:target.toString()}),signal:timer});
};
const record=await api.collectCrossVenueLiquidationIntelligence({contract_code:'BTW-USDT',fetch_impl:sourceFetch,api_key:'PROTECTED_PROXY_CONFIGURED',now_ts:Date.now(),future_only:true});
const receipt={contract:'BTW-USDT',future_only:true,network_calls:calls,projected_map_status:record.projected_map_status,provider:record.provider,projected_cluster_count:record.projected_clusters?.length??0,projected_clusters:record.projected_clusters,source_health:record.source_health,errors:record.errors,identity_status:record.asset_identity_verified,history_requested:false,secrets_included:false};
await fs.writeFile(path.join(out,'live-btw-future-map.json'),JSON.stringify(receipt,null,2));
console.log('LIVE_BTW_FUTURE_MAP',JSON.stringify(receipt));

const control=await api.collectCrossVenueLiquidationIntelligence({contract_code:'HYPE-USDT',fetch_impl:sourceFetch,api_key:'PROTECTED_PROXY_CONFIGURED',now_ts:Date.now(),future_only:true});
const controlReceipt={contract:'HYPE-USDT',future_only:true,network_calls_total:calls,projected_map_status:control.projected_map_status,projected_cluster_count:control.projected_clusters?.length??0,sample_clusters:control.projected_clusters?.slice(0,3),source_health:control.source_health,errors:control.errors,history_requested:false,secrets_included:false};
await fs.writeFile(path.join(out,'live-future-map-control.json'),JSON.stringify(controlReceipt,null,2));
console.log('LIVE_FUTURE_MAP_CONTROL',JSON.stringify(controlReceipt));
