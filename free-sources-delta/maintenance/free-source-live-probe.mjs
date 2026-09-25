import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {buildBinanceArchiveUrl,parseChecksumText} from '../overlay/src/binance-public-data-history.mjs';

export const FREE_SOURCE_LIVE_PROBE_VERSION='free-source-live-probe-v2-20260925';
const TIMEOUT=8000;const MAX_CALLS=12;let calls=0;
async function request(name,url,{method='GET',body=null,headers={}}={}){
  if(calls>=MAX_CALLS)return {source:name,status:'BUDGET_EXHAUSTED',http_status:null};calls++;
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),TIMEOUT);const started=Date.now();
  try{
    const response=await fetch(url,{method,headers:{'user-agent':'my-report-2-free-source-candidate/2.0',...headers},body:body?JSON.stringify(body):undefined,signal:controller.signal});
    const text=await response.text();return {source:name,status:response.ok?'CLOSED':response.status===429?'RATE_LIMITED':response.status===401||response.status===403?'NOT_CONFIGURED':'HTTP_ERROR',http_status:response.status,latency_ms:Date.now()-started,bytes:text.length,body_preview:text.slice(0,600)};
  }catch(error){return {source:name,status:error?.name==='AbortError'?'TIMEOUT':'FETCH_ERROR',http_status:null,latency_ms:Date.now()-started,error:String(error?.message||error).slice(0,240)};}finally{clearTimeout(timer);}
}
async function requestBinary(name,url){
  if(calls>=MAX_CALLS)return {source:name,status:'BUDGET_EXHAUSTED',http_status:null};calls++;
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),TIMEOUT);const started=Date.now();
  try{
    const response=await fetch(url,{headers:{'user-agent':'my-report-2-free-source-candidate/2.0'},signal:controller.signal});
    const bytes=Buffer.from(await response.arrayBuffer());
    return {source:name,status:response.ok?'CLOSED':response.status===429?'RATE_LIMITED':response.status===401||response.status===403?'NOT_CONFIGURED':'HTTP_ERROR',http_status:response.status,latency_ms:Date.now()-started,bytes:bytes.length,sha256:response.ok?createHash('sha256').update(bytes).digest('hex'):null};
  }catch(error){return {source:name,status:error?.name==='AbortError'?'TIMEOUT':'FETCH_ERROR',http_status:null,latency_ms:Date.now()-started,error:String(error?.message||error).slice(0,240),sha256:null};}finally{clearTimeout(timer);}
}
function archiveDay(offset=2){const d=new Date(Date.now()-offset*86400000);return new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));}
async function main(){
  const probes=[];const d=archiveDay(2);
  for(const market of ['spot','usd_m_futures']){
    const plan=buildBinanceArchiveUrl({market,frequency:'daily',data_type:'klines',symbol:'BTCUSDT',interval:'1m',date:d});
    const p=await request(`Binance Public Data Archive ${market}`,plan.checksum_url);
    if(p.status==='CLOSED'){
      const c=parseChecksumText(p.body_preview);p.checksum_status=c.status;p.checksum_sha256=c.sha256??null;p.archive_url=plan.url;
      if(market==='spot'&&c.status==='CLOSED'){
        const zip=await requestBinary('Binance Public Data Archive spot ZIP',plan.url);
        p.archive_download_status=zip.status;p.archive_bytes=zip.bytes??null;p.archive_sha256=zip.sha256??null;
        p.archive_checksum_match=zip.status==='CLOSED'&&zip.sha256===c.sha256;
      }
    }
    probes.push(p);
  }
  probes.push(await request('GoPlus','https://api.gopluslabs.io/api/v1/token_security/1?contract_addresses=0xdAC17F958D2ee523a2206206994597C13D831ec7'));
  probes.push(await request('Solana Public RPC','https://api.mainnet-beta.solana.com',{method:'POST',headers:{'content-type':'application/json'},body:{jsonrpc:'2.0',id:1,method:'getSignaturesForAddress',params:['So11111111111111111111111111111111111111112',{limit:1}]}}));
  probes.push(await request('DEX Screener','https://api.dexscreener.com/latest/dex/tokens/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'));
  probes.push(await request('GeckoTerminal','https://api.geckoterminal.com/api/v2/networks/eth/tokens/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/pools?page=1'));
  probes.push(await request('DefiLlama','https://api.llama.fi/tvl/aave'));
  probes.push(await request('Hyperliquid','https://api.hyperliquid.xyz/info',{method:'POST',headers:{'content-type':'application/json'},body:{type:'metaAndAssetCtxs'}}));
  probes.push(await request('Bitget','https://api.bitget.com/api/v2/mix/market/contracts?productType=USDT-FUTURES'));
  probes.push(await request('Coinbase Exchange','https://api.exchange.coinbase.com/products/BTC-USD'));
  probes.push(await request('Deribit','https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=BTC&kind=option'));
  const normalized=probes.map(p=>({source:p.source,status:p.status,http_status:p.http_status,latency_ms:p.latency_ms??null,bytes:p.bytes??null,checksum_status:p.checksum_status??null,archive_download_status:p.archive_download_status??null,archive_checksum_match:p.archive_checksum_match??null,error:p.error??null}));
  const result={version:FREE_SOURCE_LIVE_PROBE_VERSION,status:'CLOSED_OBSERVATION_ONLY',observed_ts:Date.now(),calls_used:calls,max_calls:MAX_CALLS,production_writes:false,d1_writes:false,telegram_send:false,trading:false,auto_payment:false,probes:normalized};
  const out=process.env.REPORT2_FREE_SOURCE_PROBE_OUTPUT||'free-source-live-probe.json';fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log('FREE_SOURCE_LIVE_PROBE',JSON.stringify(result));
}
main().catch(e=>{console.error('FREE_SOURCE_LIVE_PROBE_FATAL',String(e?.stack||e));process.exit(1);});
