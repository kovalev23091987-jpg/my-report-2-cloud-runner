import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import fs from 'node:fs/promises';

const runtime=resolve(process.argv[2]||'runtime');
const [{RemoteD1Database},{collectSnapshotGovernanceEvidence},{compileOfficialSourceRegistry}]=await Promise.all([
 import(pathToFileURL(resolve(runtime,'report2-d1-adapter.mjs')).href),
 import(pathToFileURL(resolve(runtime,'src/snapshot-governance-evidence.mjs')).href),
 import(pathToFileURL(resolve(runtime,'src/official-source-registry.mjs')).href),
]);
const bridgeUrl=String(process.env.REPORT2_D1_BRIDGE_URL||'').trim(),bridgeToken=String(process.env.REPORT2_D1_BRIDGE_TOKEN||'').trim();
if(!bridgeUrl||!bridgeToken)throw new Error('D1_BRIDGE_REQUIRED_FOR_LIDO_SNAPSHOT_SMOKE');
const entry=compileOfficialSourceRegistry(JSON.parse(await fs.readFile(resolve(runtime,'official-event-sources.json'),'utf8'))).registry.LDO;
if(entry?.snapshot_space!=='lido-snapshot.eth')throw new Error('LIDO_SNAPSHOT_SPACE_NOT_REGISTERED');
const db=new RemoteD1Database(bridgeUrl,bridgeToken,{fetchImpl:globalThis.fetch,timeoutMs:45_000});let admitted=0;
const request_admit=({attempts}={})=>{const count=Number(attempts);if(count!==1||admitted+count>1)return{allowed:false,status:'SMOKE_HTTP_CAP_EXHAUSTED'};admitted+=count;return{allowed:true,status:'RESERVED',attempts:count};};
const now=Date.now(),result=await collectSnapshotGovernanceEvidence({db,fetch_impl:globalThis.fetch,request_admit,contract:'LDO-USDT',run_id:`LIDO_SNAPSHOT_SMOKE:${now}`,asset_identity:{chain:entry.chain,contract_or_mint:entry.contract_or_mint},asset_metadata:{snapshot_space:entry.snapshot_space},now});
const receipt={version:'t16-lido-snapshot-smoke-v1',contract:'LDO-USDT',snapshot_space:entry.snapshot_space,status:result.status,network_calls:result.network_calls,cache_status:result.cache_status,evidence_count:(result.evidence||[]).length,whole_job_admission:result.whole_job_admission?.status||null,daily_admission:result.admission?.status||null,receipts:(result.receipts||[]).map(row=>({route:row.route,status:row.status,http_status:row.http_status??null,error:row.error??null})),telegram_network_calls:0};
console.log('T16_LIDO_SNAPSHOT_LIVE_SMOKE',JSON.stringify(receipt));
const row=result.receipts?.[0];
if(!new Set(['CLOSED','EMPTY','STALE_SOURCE']).has(result.status)||![0,1].includes(result.network_calls)||row?.status!=='CLOSED'||row?.http_status!==200)throw new Error(`LIDO_SNAPSHOT_LIVE_SMOKE_NOT_CLOSED:${result.status}:${row?.error||'NO_RECEIPT'}`);
