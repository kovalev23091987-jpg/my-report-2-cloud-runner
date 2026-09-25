import fs from 'node:fs';
export const INCREMENTAL_COVERAGE_MEASUREMENT_VERSION='incremental-coverage-measurement-v1-20260925';
const TIMEOUT_MS=10_000;const MAX_CALLS=4;let calls=0;
const clean=v=>String(v??'').trim();
async function getJson(url){
  if(calls>=MAX_CALLS)return {status:'BUDGET_EXHAUSTED',url,data:null};calls++;
  const c=new AbortController();const t=setTimeout(()=>c.abort(),TIMEOUT_MS);const started=Date.now();
  try{const r=await fetch(url,{headers:{'user-agent':'my-report-2-incremental-coverage-candidate/1.0','accept':'application/json'},signal:c.signal});const txt=await r.text();let data=null;try{data=JSON.parse(txt);}catch{}return {status:r.ok?'CLOSED':r.status===429?'RATE_LIMITED':r.status===401||r.status===403?'NOT_CONFIGURED':'HTTP_ERROR',http_status:r.status,latency_ms:Date.now()-started,bytes:txt.length,data};}
  catch(e){return {status:e?.name==='AbortError'?'TIMEOUT':'FETCH_ERROR',url,http_status:null,error:clean(e?.message||e),data:null};}finally{clearTimeout(t);}
}
const baseFromHtx=code=>{const m=clean(code).toUpperCase().match(/^([A-Z0-9]+)-USDT(?:-|$)/);return m?.[1]||null;};
const baseFromBitget=s=>{const x=clean(s).toUpperCase();return x.endsWith('USDT')?x.slice(0,-4):null;};
const quoteAllowed=new Set(['USD','USDT','USDC']);
const set=a=>new Set(a.filter(Boolean));
const intersect=(a,b)=>[...a].filter(x=>b.has(x)).sort();
export function summarizeIncrementalCoverage({htxPayload,bitgetFuturesPayload,bitgetSpotPayload,coinbasePayload}={}){
  const htx=set((Array.isArray(htxPayload?.data)?htxPayload.data:[]).filter(x=>Number(x?.contract_status)===1&&['swap',''].includes(clean(x?.business_type).toLowerCase())).map(x=>baseFromHtx(x?.contract_code)));
  const bgF=set((Array.isArray(bitgetFuturesPayload?.data)?bitgetFuturesPayload.data:[]).map(x=>baseFromBitget(x?.symbol)));
  const bgS=set((Array.isArray(bitgetSpotPayload?.data)?bitgetSpotPayload.data:[]).map(x=>baseFromBitget(x?.symbol)));
  const cb=set((Array.isArray(coinbasePayload)?coinbasePayload:[]).filter(x=>quoteAllowed.has(clean(x?.quote_currency).toUpperCase())&&x?.trading_disabled!==true).map(x=>clean(x?.base_currency).toUpperCase()));
  const bfi=intersect(htx,bgF),bsi=intersect(htx,bgS),cbi=intersect(htx,cb);
  const n=htx.size;const pct=x=>n?Number((x.length/n*100).toFixed(2)):null;
  return {version:INCREMENTAL_COVERAGE_MEASUREMENT_VERSION,status:n?'CLOSED':'NOT_CLOSED',htx_futures_active_count:n,bitget_futures_overlap_count:bfi.length,bitget_futures_overlap_pct:pct(bfi),bitget_spot_overlap_count:bsi.length,bitget_spot_overlap_pct:pct(bsi),coinbase_spot_overlap_count:cbi.length,coinbase_spot_overlap_pct:pct(cbi),sample:{bitget_futures:bfi.slice(0,30),bitget_spot:bsi.slice(0,30),coinbase_spot:cbi.slice(0,30)},no_automatic_voting:true,no_source_enablement:true,production_changed:false};
}
export async function run(){
  const htx=await getJson('https://api.hbdm.com/linear-swap-api/v1/swap_contract_info?business_type=swap');
  const bgF=await getJson('https://api.bitget.com/api/v3/market/instruments?category=USDT-FUTURES');
  const bgS=await getJson('https://api.bitget.com/api/v3/market/instruments?category=SPOT');
  const cb=await getJson('https://api.exchange.coinbase.com/products');
  const summary=summarizeIncrementalCoverage({htxPayload:htx.data,bitgetFuturesPayload:bgF.data,bitgetSpotPayload:bgS.data,coinbasePayload:cb.data});
  const result={...summary,observed_ts:Date.now(),calls_used:calls,max_calls:MAX_CALLS,probe_status:{htx:htx.status,bitget_futures:bgF.status,bitget_spot:bgS.status,coinbase:cb.status},production_writes:false,d1_writes:false,telegram_send:false,trading:false,auto_payment:false};
  if(Object.values(result.probe_status).some(x=>x!=='CLOSED'))result.status='PARTIAL_MEASUREMENT_SOURCE_GAPS';
  const out=process.env.REPORT2_INCREMENTAL_COVERAGE_OUTPUT||'free-sources-incremental-coverage.json';fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');return result;
}
async function main(){const r=await run();console.log('FREE_SOURCES_INCREMENTAL_COVERAGE',JSON.stringify(r));}
if(process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1])main().catch(e=>{console.error('FREE_SOURCES_INCREMENTAL_COVERAGE_FATAL',String(e?.stack||e));process.exit(1);});
