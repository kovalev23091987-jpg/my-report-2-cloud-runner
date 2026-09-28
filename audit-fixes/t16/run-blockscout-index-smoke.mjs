import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const runtime=resolve(process.argv[2]||'runtime');
const [{RemoteD1Database},{collectBlockscoutIndexEvidence}]=await Promise.all([
 import(pathToFileURL(resolve(runtime,'report2-d1-adapter.mjs')).href),
 import(pathToFileURL(resolve(runtime,'src/blockscout-index-evidence.mjs')).href),
]);
const bridgeUrl=String(process.env.REPORT2_D1_BRIDGE_URL||'').trim(),bridgeToken=String(process.env.REPORT2_D1_BRIDGE_TOKEN||'').trim(),apiKey=String(process.env.BLOCKSCOUT_PRO_API_KEY||'').trim();
if(!bridgeUrl||!bridgeToken)throw new Error('D1_BRIDGE_REQUIRED_FOR_BLOCKSCOUT_SMOKE');
if(!apiKey.startsWith('proapi_'))throw new Error('BLOCKSCOUT_PRO_API_KEY_REQUIRED');
const db=new RemoteD1Database(bridgeUrl,bridgeToken,{fetchImpl:globalThis.fetch,timeoutMs:45_000});
let admitted=0;const request_admit=({attempts}={})=>{const count=Number(attempts);if(count!==1||admitted+count>1)return{allowed:false,status:'SMOKE_HTTP_CAP_EXHAUSTED'};admitted+=count;return{allowed:true,status:'RESERVED',attempts:count};};
const now=Date.now(),result=await collectBlockscoutIndexEvidence({db,fetch_impl:globalThis.fetch,request_admit,contract:'LINK-USDT',asset_identity:{chain:'ethereum',contract_or_mint:'0x514910771af9ca656af840dff83e8264ecf986ca'},blockscout_api_key:apiKey,run_id:`BLOCKSCOUT_INDEX_SMOKE:${now}`,now});
const receipt={version:'t16-blockscout-index-smoke-v1',contract:'LINK-USDT',status:result.status,network_calls:result.network_calls,cache_status:result.cache_status,whole_job_admission:result.whole_job_admission?.status||null,daily_admission:result.admission?.status||null,credit_admission:result.credit_admission?.status||null,route_credit_cost:result.route_credit_cost??null,credits_remaining:Number.isFinite(Number(result.credits_remaining))?Number(result.credits_remaining):null,transfer_count:(result.transfers||[]).length,evidence_count:(result.evidence||[]).length,receipts:(result.receipts||[]).map(row=>({route:row.route,status:row.status,http_status:row.http_status??null,error:row.error??null,credits:row.credits??null})),directional_strengths:(result.evidence||[]).map(row=>row.directional_strength),risk_strengths:(result.evidence||[]).map(row=>row.risk_strength),telegram_network_calls:0};
console.log('T16_BLOCKSCOUT_INDEX_LIVE_SMOKE',JSON.stringify(receipt));
const row=receipt.receipts[0];if(!new Set(['CLOSED','EMPTY']).has(result.status)||result.network_calls!==1||result.route_credit_cost!==30||receipt.credits_remaining===null||row?.status!=='CLOSED'||row?.http_status!==200||receipt.directional_strengths.some(value=>value!==null)||receipt.risk_strengths.some(value=>value!==null))throw new Error(`BLOCKSCOUT_INDEX_LIVE_SMOKE_NOT_CLOSED:${result.status}:${row?.error||'NO_RECEIPT'}`);
