import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {normalizeGoPlusTokenSecurity} from '../overlay/src/goplus-security-adapter.mjs';
import {normalizeSolanaSignatures} from '../overlay/src/solana-rpc-adapter.mjs';
import {normalizeDexPoolObservation,dedupeDexPoolConfirmations} from '../overlay/src/dex-pool-bridge.mjs';
import {normalizeDefiLlamaContext} from '../overlay/src/provider-context-normalizers.mjs';

export const EXISTING_SOURCE_LIVE_CONSUMER_PROOF_VERSION='existing-source-live-consumer-proof-v1-20260925';
const TIMEOUT=8000;const MAX_CALLS=5;let calls=0;
async function requestJson(source,url,{method='GET',body=null,headers={}}={}){
  if(calls>=MAX_CALLS)return {source,status:'BUDGET_EXHAUSTED',payload:null};calls++;
  const c=new AbortController(),t=setTimeout(()=>c.abort(),TIMEOUT);const started=Date.now();
  try{const r=await fetch(url,{method,headers:{'user-agent':'my-report-2-existing-source-consumer/1.0',...headers},body:body?JSON.stringify(body):undefined,signal:c.signal});const text=await r.text();let payload=null;try{payload=JSON.parse(text);}catch{payload=text;}return{source,status:r.ok?'CLOSED':r.status===429?'RATE_LIMITED':r.status===401||r.status===403?'NOT_CONFIGURED':'HTTP_ERROR',http_status:r.status,latency_ms:Date.now()-started,bytes:text.length,payload};}catch(e){return{source,status:e?.name==='AbortError'?'TIMEOUT':'FETCH_ERROR',payload:null,error:String(e?.message||e).slice(0,200)};}finally{clearTimeout(t);}
}
function genericReceipt(source,normalized,now){return {source,status:normalized?.status==='CLOSED'?'CLOSED':normalized?.status||'NOT_CLOSED',source_ts:now,observed_ts:now,max_age_sec:600,source_compatible:true};}
function pairFromDex(payload){const p=Array.isArray(payload?.pairs)?payload.pairs[0]:null;if(!p)return null;return normalizeDexPoolObservation({provider:'DEX Screener',chain:p.chainId||'ethereum',pool_address:p.pairAddress,token_contract_or_mint:p.baseToken?.address,liquidity_usd:p.liquidity?.usd,volume_usd:p.volume?.h24,buys:p.txns?.h24?.buys,sells:p.txns?.h24?.sells,observed_ts:Date.now(),promoted:Boolean(p.boosts?.active)});}
function poolFromGecko(payload){const d=Array.isArray(payload?.data)?payload.data[0]:null,a=d?.attributes||{};if(!d)return null;const pool=a.address||String(d.id||'').split('_').slice(1).join('_');const base=a.base_token_address||a.base_token?.address||'0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';return normalizeDexPoolObservation({provider:'GeckoTerminal',chain:'ethereum',pool_address:pool,token_contract_or_mint:base,liquidity_usd:a.reserve_in_usd,volume_usd:a.volume_usd?.h24,buys:a.transactions?.h24?.buys,sells:a.transactions?.h24?.sells,observed_ts:Date.now()});}
function canonicalProof({contract,receipt,existing,buildFreeSourceRuntimeSummary,buildRuntimeCanonicalBundle}){const now=Date.now();const summary=buildFreeSourceRuntimeSummary({extra_receipts:[receipt],now});return buildRuntimeCanonicalBundle({contract,run_id:`LIVE:${contract}`,snapshot_id:`LIVE:${contract}:${now}`,observed_ts:now,discovery_row:{contract,rolling_24h_change_pct:0},publication_shadow:{entry_signal:{state:'OBSERVE',direction:null,reason:'TRIGGER_NOT_CLOSED'},score_interval:{score_lower_bound:50}},free_source_summary:summary,existing_source_receipts:existing});}
async function main(){
 const runtimeDir=path.resolve(process.env.REPORT2_EXISTING_SOURCE_RUNTIME_DIR||'runtime');
 const load=n=>import(pathToFileURL(path.join(runtimeDir,'src',n)).href);
 const [{consumeExistingSourceReceipts},{buildFreeSourceRuntimeSummary},{buildRuntimeCanonicalBundle}]=await Promise.all([load('existing-source-consumer.mjs'),load('source-registry.mjs'),load('canonical-runtime-adapter.mjs')]);
 const raw={};
 raw.goplus=await requestJson('GoPlus','https://api.gopluslabs.io/api/v1/token_security/1?contract_addresses=0xdAC17F958D2ee523a2206206994597C13D831ec7');
 raw.solana=await requestJson('Solana Public RPC','https://api.mainnet-beta.solana.com',{method:'POST',headers:{'content-type':'application/json'},body:{jsonrpc:'2.0',id:1,method:'getSignaturesForAddress',params:['So11111111111111111111111111111111111111112',{limit:1}]}});
 raw.dex=await requestJson('DEX Screener','https://api.dexscreener.com/latest/dex/tokens/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2');
 raw.gecko=await requestJson('GeckoTerminal','https://api.geckoterminal.com/api/v2/networks/eth/tokens/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/pools?page=1');
 raw.defillama=await requestJson('DefiLlama','https://api.llama.fi/tvl/aave');
 const now=Date.now();
 const normalized={
  goplus:raw.goplus.status==='CLOSED'?normalizeGoPlusTokenSecurity(raw.goplus.payload,{chain:'1',contract_or_mint:'0xdAC17F958D2ee523a2206206994597C13D831ec7',observed_ts:now}):{status:raw.goplus.status},
  solana:raw.solana.status==='CLOSED'?normalizeSolanaSignatures(raw.solana.payload,{mint:'So11111111111111111111111111111111111111112'}):{status:raw.solana.status,rows:[]},
  dex:raw.dex.status==='CLOSED'?pairFromDex(raw.dex.payload):null,
  gecko:raw.gecko.status==='CLOSED'?poolFromGecko(raw.gecko.payload):null,
  defillama:raw.defillama.status==='CLOSED'?normalizeDefiLlamaContext({protocol:'aave',chain:'ethereum',tvl_usd:Number(raw.defillama.payload),observed_ts:now}):{status:raw.defillama.status},
 };
 const receipts={
  goplus:genericReceipt('GoPlus',normalized.goplus,now),solana:genericReceipt('Solana Public RPC',normalized.solana,now),
  dex:genericReceipt('DEX Screener',normalized.dex||{status:'NOT_CLOSED'},now),gecko:genericReceipt('GeckoTerminal',normalized.gecko||{status:'NOT_CLOSED'},now),defillama:genericReceipt('DefiLlama',normalized.defillama,now),
 };
 const dexRows=[normalized.dex,normalized.gecko].filter(Boolean);
 const consumer=consumeExistingSourceReceipts({goplus:normalized.goplus,solana:normalized.solana,dex:dexRows,defillama:normalized.defillama});
 const proofFns={buildFreeSourceRuntimeSummary,buildRuntimeCanonicalBundle};
 const proofs={
  goplus:canonicalProof({contract:'USDT-USDT',receipt:receipts.goplus,existing:{goplus:normalized.goplus},...proofFns}),
  solana:canonicalProof({contract:'SOL-USDT',receipt:receipts.solana,existing:{solana:normalized.solana},...proofFns}),
  dex:canonicalProof({contract:'WETH-USDT',receipt:receipts.dex,existing:{dex:dexRows},...proofFns}),
  defillama:canonicalProof({contract:'AAVE-USDT',receipt:receipts.defillama,existing:{defillama:normalized.defillama},...proofFns}),
 };
 const checks=Object.fromEntries(Object.entries(proofs).map(([k,p])=>[k,{canonical_closed:p.status==='CLOSED',manual_ok:p.manual?.ok===true,telegram_ok:p.telegram?.ok===true,fingerprint_equal:p.manual?.analytical_fingerprint===p.telegram?.analytical_fingerprint,manual_has_context:/ДОПОЛНИТЕЛЬНЫЙ ПОДТВЕРЖДЁННЫЙ КОНТЕКСТ/.test(p.manual?.text||''),telegram_has_context:/Доп\. контекст:/.test(p.telegram?.message||'')} ]));
 const result={version:EXISTING_SOURCE_LIVE_CONSUMER_PROOF_VERSION,status:'CLOSED_OBSERVATION_ONLY',observed_ts:now,calls_used:calls,max_calls:MAX_CALLS,production_writes:false,d1_writes:false,telegram_send:false,trading:false,auto_payment:false,raw_status:Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,{source:v.source,status:v.status,http_status:v.http_status??null,bytes:v.bytes??null}])),normalized_status:Object.fromEntries(Object.entries(normalized).map(([k,v])=>[k,v?.status??'NOT_CLOSED'])),receipts,consumer:{status:consumer.status,blocks:consumer.blocks,facts:consumer.facts},dex_dedupe:dedupeDexPoolConfirmations(dexRows),checks};
 const out=process.env.REPORT2_EXISTING_SOURCE_CONSUMER_PROOF_OUTPUT||'existing-source-live-consumer-proof.json';fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log('EXISTING_SOURCE_LIVE_CONSUMER_PROOF',JSON.stringify({status:result.status,calls_used:calls,raw_status:result.raw_status,normalized_status:result.normalized_status,checks:result.checks,production_writes:false,d1_writes:false,telegram_send:false,trading:false}));
}
main().catch(e=>{console.error('EXISTING_SOURCE_LIVE_CONSUMER_PROOF_FATAL',String(e?.stack||e));process.exit(1);});
