import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const runtime=resolve(process.argv[2]||'runtime');
const [{RemoteD1Database},{collectChainSupplyEvidence}]=await Promise.all([
 import(pathToFileURL(resolve(runtime,'report2-d1-adapter.mjs')).href),
 import(pathToFileURL(resolve(runtime,'src/chain-supply-evidence.mjs')).href),
]);
const bridgeUrl=String(process.env.REPORT2_D1_BRIDGE_URL||'').trim(),bridgeToken=String(process.env.REPORT2_D1_BRIDGE_TOKEN||'').trim();
if(!bridgeUrl||!bridgeToken)throw new Error('D1_BRIDGE_REQUIRED_FOR_EVIDENCE_SMOKE');
const db=new RemoteD1Database(bridgeUrl,bridgeToken,{fetchImpl:globalThis.fetch,timeoutMs:45_000});
let admitted=0;const request_admit=({attempts}={})=>{const count=Number(attempts);if(!Number.isSafeInteger(count)||count<1||count>3||admitted+count>3)return{allowed:false,status:'SMOKE_HTTP_CAP_EXHAUSTED'};admitted+=count;return{allowed:true,status:'RESERVED',attempts:count};};
const result=await collectChainSupplyEvidence({db,fetch_impl:globalThis.fetch,request_admit,contract:'LINK-USDT',asset_identity:{chain:'ethereum',contract_or_mint:'0x514910771af9ca656af840dff83e8264ecf986ca'},identity_method:'CONTROLLED_OFFICIAL_CONTRACT_SMOKE',run_id:`CHAIN_SUPPLY_SMOKE:${Date.now()}`,now:Date.now()});
const receipt={version:'t16-chain-supply-smoke-v1',contract:'LINK-USDT',status:result.status,network_calls:result.network_calls,cache_status:result.cache_status,whole_job_admission:result.whole_job_admission?.status||null,daily_admission:result.admission?.status||null,summary:result.summary||null,receipts:(result.receipts||[]).map(row=>({route:row.route,status:row.status,http_status:row.http_status??null,error:row.error??null})),directional_strengths:(result.evidence||[]).map(row=>row.directional_strength),risk_strengths:(result.evidence||[]).map(row=>row.risk_strength),telegram_network_calls:0};
console.log('T16_CHAIN_SUPPLY_LIVE_SMOKE',JSON.stringify(receipt));
if(result.status!=='CLOSED'||result.network_calls!==3||receipt.receipts.length!==3||receipt.receipts.some(row=>row.status!=='CLOSED'||row.http_status!==200))throw new Error(`CHAIN_SUPPLY_LIVE_SMOKE_NOT_CLOSED:${result.status}`);
