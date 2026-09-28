import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const runtime=resolve(process.argv[2]||'runtime');
const [{RemoteD1Database},{collectSnapshotGovernanceEvidence},{collectOfficialEventsEvidence},{collectGdeltOfficialDiscovery}]=await Promise.all([
 import(pathToFileURL(resolve(runtime,'report2-d1-adapter.mjs')).href),
 import(pathToFileURL(resolve(runtime,'src/snapshot-governance-evidence.mjs')).href),
 import(pathToFileURL(resolve(runtime,'src/official-events-evidence.mjs')).href),
 import(pathToFileURL(resolve(runtime,'src/gdelt-official-discovery.mjs')).href),
]);
const bridgeUrl=String(process.env.REPORT2_D1_BRIDGE_URL||'').trim(),bridgeToken=String(process.env.REPORT2_D1_BRIDGE_TOKEN||'').trim();if(!bridgeUrl||!bridgeToken)throw new Error('D1_BRIDGE_REQUIRED_FOR_EVIDENCE_SMOKE');
const db=new RemoteD1Database(bridgeUrl,bridgeToken,{fetchImpl:globalThis.fetch,timeoutMs:45_000});let admitted=0;const request_admit=({attempts}={})=>{const count=Number(attempts);if(count!==1||admitted+count>3)return{allowed:false,status:'SMOKE_HTTP_CAP_EXHAUSTED'};admitted+=count;return{allowed:true,status:'RESERVED',attempts:count};},now=Date.now(),run=`METADATA_SOURCES_SMOKE:${now}`;
const snapshot=await collectSnapshotGovernanceEvidence({db,fetch_impl:globalThis.fetch,request_admit,contract:'YAM-USDT',run_id:`${run}:SNAPSHOT`,asset_metadata:{snapshot_space:'yam.eth'},now});
const official=await collectOfficialEventsEvidence({db,fetch_impl:globalThis.fetch,request_admit,contract:'GLOBAL-USDT',run_id:`${run}:OFFICIAL`,asset_metadata:{official_domains:['bls.gov'],official_feeds:['https://www.bls.gov/schedule/news_release/bls.ics']},now});
const gdelt=await collectGdeltOfficialDiscovery({db,fetch_impl:globalThis.fetch,request_admit,contract:'LINK-USDT',run_id:`${run}:GDELT`,asset_metadata:{official_name:'Chainlink',official_domains:['chain.link']},now});
const compact=result=>({status:result.status,network_calls:result.network_calls,cache_status:result.cache_status,whole_job_admission:result.whole_job_admission?.status||null,daily_admission:result.admission?.status||null,evidence_count:(result.evidence||[]).length,discovery_count:(result.discoveries||[]).length,receipts:(result.receipts||[]).map(row=>({route:row.route,status:row.status,http_status:row.http_status??null,error:row.error??null}))}),receipt={version:'t16-metadata-sources-smoke-v1',snapshot:compact(snapshot),official:compact(official),gdelt:compact(gdelt),total_network_calls:Number(snapshot.network_calls||0)+Number(official.network_calls||0)+Number(gdelt.network_calls||0),telegram_network_calls:0};console.log('T16_METADATA_SOURCES_LIVE_SMOKE',JSON.stringify(receipt));
for(const [name,result,allowed] of [['SNAPSHOT',snapshot,new Set(['CLOSED','EMPTY','STALE_SOURCE'])],['OFFICIAL',official,new Set(['CLOSED','EMPTY_OR_STALE'])],['GDELT',gdelt,new Set(['CLOSED','EMPTY'])]]){const row=result.receipts?.[0];if(!allowed.has(result.status)||![0,1].includes(result.network_calls)||row?.status!=='CLOSED'||row?.http_status!==200)throw new Error(`${name}_LIVE_SMOKE_NOT_CLOSED:${result.status}:${row?.error||'NO_RECEIPT'}`);}
