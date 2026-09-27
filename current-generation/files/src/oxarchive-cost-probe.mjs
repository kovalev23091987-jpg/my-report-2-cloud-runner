export const OXARCHIVE_COST_PROBE_VERSION='oxarchive-cost-probe-v1-20260927';
const BASE='https://api.0xarchive.io/v1/hyperliquid/liquidations';
const symbolOf=v=>{const s=String(v||'').trim().toUpperCase();return /^[A-Z0-9]{2,20}$/.test(s)?s:null;};
const headerObject=headers=>{const out={};if(headers?.forEach)headers.forEach((v,k)=>{const key=String(k).toLowerCase();if(key.includes('credit')||key.includes('rate')||key==='retry-after'||key==='x-request-id')out[key]=String(v).slice(0,200);});return out;};

export async function runOxArchiveCostProbe({db,fetch_impl=globalThis.fetch,api_key,symbol,now=Date.now()}={}){
 if(!db)throw new Error('OXARCHIVE_PROBE_DB_REQUIRED');
 const key=String(api_key||'').trim(),coin=symbolOf(symbol);
 if(!key)return{version:OXARCHIVE_COST_PROBE_VERSION,status:'NOT_RUN',reason:'API_KEY_REQUIRED',network_calls:0};
 if(!coin)return{version:OXARCHIVE_COST_PROBE_VERSION,status:'NOT_RUN',reason:'SYMBOL_INVALID',network_calls:0};
 await db.prepare(`CREATE TABLE IF NOT EXISTS report2_oxarchive_cost_probe (probe_key TEXT PRIMARY KEY, symbol TEXT NOT NULL, requested_ts INTEGER NOT NULL, http_status INTEGER, response_headers_json TEXT NOT NULL, request_id TEXT, success INTEGER NOT NULL, route_cost_closed INTEGER NOT NULL, error_text TEXT)`).run();
 const probeKey=`OXARCHIVE_LEVELS_COST_V1:${coin}`;
 const prior=await db.prepare(`SELECT probe_key,symbol,requested_ts,http_status,response_headers_json,request_id,success,route_cost_closed,error_text FROM report2_oxarchive_cost_probe WHERE probe_key=?1 LIMIT 1`).bind(probeKey).first();
 if(prior)return{version:OXARCHIVE_COST_PROBE_VERSION,status:'ALREADY_PROBED',network_calls:0,record:prior};
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);let response=null,payload=null,error=null;
 try{response=await fetch_impl(`${BASE}/${encodeURIComponent(coin)}/levels?range_pct=10&buckets=10`,{headers:{accept:'application/json','x-api-key':key,'user-agent':'My-Report-2/0xarchive-cost-probe-v1'},signal:controller.signal});payload=await response.json().catch(()=>null);}catch(e){error=String(e?.name==='AbortError'?'TIMEOUT':e?.message||e).slice(0,300);}finally{clearTimeout(timer);}
 const headers=headerObject(response?.headers),requestId=String(payload?.meta?.request_id||headers['x-request-id']||'').slice(0,120)||null;
 const costKeys=Object.keys(headers).filter(k=>k.includes('credit')&&(k.includes('used')||k.includes('cost')||k.includes('remaining')));
 const costClosed=costKeys.length>0;
 const success=response?.ok===true&&payload?.success===true;
 await db.prepare(`INSERT INTO report2_oxarchive_cost_probe(probe_key,symbol,requested_ts,http_status,response_headers_json,request_id,success,route_cost_closed,error_text) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)`).bind(probeKey,coin,now,response?.status??null,JSON.stringify(headers),requestId,success?1:0,costClosed?1:0,error||(!response?.ok?`HTTP_${response?.status??'UNKNOWN'}`:null)).run();
 return{version:OXARCHIVE_COST_PROBE_VERSION,status:success?(costClosed?'COST_CLOSED':'AUTH_AND_ROUTE_CLOSED_COST_HEADER_MISSING'):'PROBE_FAILED',network_calls:1,symbol:coin,http_status:response?.status??null,request_id:requestId,cost_headers:headers,route_cost_closed:costClosed,production_enable_allowed:success&&costClosed};
}

export default{runOxArchiveCostProbe};
