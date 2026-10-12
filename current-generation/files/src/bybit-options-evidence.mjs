import {createHash} from 'node:crypto';
import {buildEvidenceV2,SOURCE_POLICIES} from './evidence-source-adapters.mjs';
import {isExactHtxUsdtSwapKey} from './htx-contract-key.mjs';
import {installEvidenceSourceStore,readEvidenceSourceCache,writeEvidenceSourceCache,reserveEvidenceSourceAttempts} from './evidence-source-store.mjs';

export const BYBIT_OPTIONS_VERSION='bybit-public-scoped-options-v1-20261012';
// Each base below has an original 12 Oct 2026 quote/OI/volume basket receipt.
export const BYBIT_VERIFIED_OPTION_BASES=Object.freeze(['BTC','DOGE','ETH','HYPE','SOL','XAUT','XRP']);
const SOURCE='BYBIT_OPTIONS',TTL=SOURCE_POLICIES[SOURCE].ttl_ms,DAY=86400000;
const sha=x=>createHash('sha256').update(x).digest('hex');
const number=x=>x===null||x===undefined||x===''||typeof x==='boolean'?null:Number.isFinite(Number(x))?Number(x):null;
const median=xs=>{const a=[...xs].sort((x,y)=>x-y),i=Math.floor(a.length/2);return a.length%2?a[i]:(a[i-1]+a[i])/2;};
const mon={JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11};
function expiryOf(s){const m=/^(\d{1,2})([A-Z]{3})(\d{2})$/.exec(s);if(!m||mon[m[2]]===undefined)return null;const ts=Date.UTC(2000+Number(m[3]),mon[m[2]],Number(m[1]),8);return new Date(ts).getUTCDate()===Number(m[1])?ts:null;}

export function deriveBybitOptionRisk({samples=[],base_currency,source_ts,observed_ts}={}){
 if(!BYBIT_VERIFIED_OPTION_BASES.includes(base_currency)||!Number.isSafeInteger(source_ts)||!Number.isSafeInteger(observed_ts)||source_ts>observed_ts||observed_ts-source_ts>TTL||samples.length<4||samples.length>16||new Set(samples.map(s=>s.symbol)).size!==samples.length)return null;
 const expiry=samples[0]?.expiration_timestamp;
 if(!Number.isSafeInteger(expiry)||expiry<source_ts+DAY||expiry>source_ts+45*DAY)return null;
 for(const s of samples){
  const m=new RegExp(`^${base_currency}-(\\d{1,2}[A-Z]{3}\\d{2})-([\\d.]+)-([CP])-USDT$`).exec(s.symbol||'');
  if(!m||s.base_currency!==base_currency||s.settlement_currency!=='USDT'||s.expiration_timestamp!==expiry||expiryOf(m[1])!==expiry||number(m[2])!==s.strike||m[3]!==s.option_type||!(s.strike>0&&s.underlying_price>0&&Math.abs(s.strike/s.underlying_price-1)<=.1)||!(s.mark_iv_fraction>0&&s.mark_iv_fraction<=10)||!(s.bid_price>0&&s.ask_price>=s.bid_price)||!(s.bid_size>0&&s.ask_size>0)||!(s.open_interest>=0&&s.volume_24h>=0&&s.open_interest+s.volume_24h>0))return null;
  const spread=(s.ask_price-s.bid_price)/((s.ask_price+s.bid_price)/2);
  if(spread>.5||!Number.isFinite(spread))return null;
 }
 const calls=samples.filter(s=>s.option_type==='C'),puts=samples.filter(s=>s.option_type==='P');if(calls.length<2||puts.length<2)return null;
 return{status:'CLOSED_SCOPED_MARK_IV_CONTEXT',base_currency,settlement_currency:'USDT',sample_count:samples.length,call_count:calls.length,put_count:puts.length,expiration_timestamp:expiry,mark_iv_median_pct:median(samples.map(s=>s.mark_iv_fraction*100)),mark_iv_min_pct:Math.min(...samples.map(s=>s.mark_iv_fraction*100)),mark_iv_max_pct:Math.max(...samples.map(s=>s.mark_iv_fraction*100)),spread_median_pct:median(samples.map(s=>(s.ask_price-s.bid_price)/((s.ask_price+s.bid_price)/2)*100)),active_quote_count:samples.length,source_ts,source_clock_policy:'PROVIDER_RESPONSE_TIME_ROW_AGE_UNKNOWN',iv_unit:'FRACTION_CONVERTED_TO_PERCENT_EXACTLY_ONCE',directional_vote:false,entry_authorized:false};
}

export function normalizeBybitOptions({contract,payload,observed_ts}={}){
 if(!isExactHtxUsdtSwapKey(contract))return{status:'EXACT_HTX_CONTRACT_REQUIRED',evidence:[]};
 const base=contract.slice(0,-5),source_ts=number(payload?.time),rows=payload?.result?.list;
 if(!BYBIT_VERIFIED_OPTION_BASES.includes(base)||payload?.retCode!==0||payload?.result?.category!=='option'||!Array.isArray(rows)||rows.length>1000||!Number.isSafeInteger(source_ts)||!Number.isSafeInteger(observed_ts)||source_ts>observed_ts||observed_ts-source_ts>TTL)return{status:'SOURCE_NOT_CLOSED',contract,evidence:[]};
 const groups=new Map();
 for(const row of rows){
  const m=new RegExp(`^${base}-(\\d{1,2}[A-Z]{3}\\d{2})-([\\d.]+)-([CP])-USDT$`).exec(row?.symbol||'');if(!m)continue;
  const expiry=expiryOf(m[1]),strike=number(m[2]),underlying=number(row.underlyingPrice),bid=number(row.bid1Price),ask=number(row.ask1Price),iv=number(row.markIv),oi=number(row.openInterest),volume=number(row.volume24h),bidSize=number(row.bid1Size),askSize=number(row.ask1Size);
  if(!expiry||expiry<source_ts+DAY||expiry>source_ts+45*DAY||!(strike>0&&underlying>0&&Math.abs(strike/underlying-1)<=.1&&bid>0&&ask>=bid&&iv>0&&iv<=10&&oi>=0&&volume>=0&&oi+volume>0&&bidSize>0&&askSize>0))continue;
  const spread=(ask-bid)/((ask+bid)/2);if(spread>.5)continue;
  const sample={symbol:row.symbol,base_currency:base,settlement_currency:'USDT',option_type:m[3],strike,expiration_timestamp:expiry,underlying_price:underlying,mark_iv_fraction:iv,bid_price:bid,ask_price:ask,bid_size:bidSize,ask_size:askSize,open_interest:oi,volume_24h:volume};
  if(!groups.has(expiry))groups.set(expiry,[]);groups.get(expiry).push(sample);
 }
 const candidates=[];
 for(const [expiry,all] of groups){const ordered=[...all].sort((a,b)=>Math.abs(a.strike/a.underlying_price-1)-Math.abs(b.strike/b.underlying_price-1)||a.symbol.localeCompare(b.symbol));const samples=['C','P'].flatMap(type=>ordered.filter(s=>s.option_type===type).slice(0,8)),risk=deriveBybitOptionRisk({samples,base_currency:base,source_ts,observed_ts});if(risk)candidates.push({expiry,samples,risk});}
 candidates.sort((a,b)=>b.samples.length-a.samples.length||a.expiry-b.expiry);
 const chosen=candidates[0];if(!chosen)return{status:'NO_VERIFIED_SCOPED_OPTION_QUOTES',contract,evidence:[],check_completed:false,internal_only:true};
 const risk=chosen.risk,evidence=buildEvidenceV2({provider_id:SOURCE,upstream_id:'BYBIT_PUBLIC_CRYPTO_OPTIONS',asset_id:`htx-futures:${contract}`,htx_contract:contract,block_id:'N14',metric_family:'BYBIT_SCOPED_OPTION_IV',origin_event_id:`${base}:${source_ts}:${risk.expiration_timestamp}`,dependency_group:`BYBIT_OPTIONS:${base}:${source_ts}`,source_ts,observed_ts,expires_at:source_ts+TTL,coverage_status:'EXACT_PROVIDER_OPTION_SNAPSHOT_BASKET_ONLY',coverage_fraction:.25,directional_strength:null,risk_strength:null,extra:{base_currency:base,option_risk_context:{...risk,samples:chosen.samples},source_clock_policy:risk.source_clock_policy,source_is_htx_execution_price:false,quote_row_age_known:false,direction_policy:'CONTEXT_ONLY_NO_DIRECTIONAL_BONUS'}});
 return{status:'CLOSED',contract,evidence:[evidence],summary:risk,internal_only:true};
}

export async function collectBybitOptionsEvidence({db,fetch_impl=globalThis.fetch,request_admit,contract,run_id,now=Date.now(),strict_fresh_manual=false,clock=Date.now}={}){
 if(!isExactHtxUsdtSwapKey(contract)||!BYBIT_VERIFIED_OPTION_BASES.includes(contract.slice(0,-5)))return{status:'NOT_IN_VERIFIED_BYBIT_OPTION_CAPABILITY',evidence:[],network_calls:0,internal_only:true};
 await installEvidenceSourceStore(db);const base=contract.slice(0,-5),key=`TICKERS:${base}`,receipts=[];
 const backoff=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:'ACCESS_BACKOFF',now});
 if(backoff?.until_ts>now)return{status:backoff.status,evidence:[],network_calls:0,admission:{allowed:false,status:backoff.status},backoff_until:backoff.until_ts,receipts};
 const cached=strict_fresh_manual?null:await readEvidenceSourceCache(db,{source:SOURCE,asset_key:key,now});
 if(cached?.version===BYBIT_OPTIONS_VERSION&&cached?.body_sha256&&cached?.payload?.time===cached.source_ts&&cached.source_ts<=now&&now-cached.source_ts<TTL&&sha(JSON.stringify(cached.payload))===cached.payload_sha256){return{version:BYBIT_OPTIONS_VERSION,...normalizeBybitOptions({contract,payload:cached.payload,observed_ts:now}),network_calls:0,cache_status:'VALID_PROVIDER_CLOCK_CACHE',receipts:[{cache_hit:true,actual_http:0,body_sha256:cached.body_sha256}]};}
 const id=`BYBIT_OPTIONS:${run_id}:${contract}`,grant=request_admit?.({logical_request_id:id,lane:'background',attempts:1});if(grant?.allowed!==true||grant.duplicate)return{status:grant?.status||'WHOLE_JOB_ADMISSION_REQUIRED',evidence:[],network_calls:0,whole_job_admission:grant,receipts};
 const reservation=await reserveEvidenceSourceAttempts(db,{source:SOURCE,reservation_id:id,attempts:1,daily_cap:strict_fresh_manual?64:48,now:clock()});if(!reservation.allowed)return{status:reservation.status,evidence:[],network_calls:0,admission:reservation,receipts};
 const url=`https://api.bybit.com/v5/market/tickers?category=option&baseCoin=${base}`;let body='',response,received_ts;
 try{response=await fetch_impl(url,{headers:{accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(12000)});body=await response.text();received_ts=clock();receipts.push({url,actual_http:1,http_status:response.status,received_ts,body_sha256:sha(body)});
  if([403,429,451].includes(response.status)){const status=response.status===429?'PROVIDER_RATE_LIMITED':'SOURCE_ACCESS_BLOCKED',until_ts=received_ts+15*60_000;await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:'ACCESS_BACKOFF',observed_ts:received_ts,expires_ts:until_ts,payload:{status,until_ts}});return{status,evidence:[],network_calls:1,receipts,admission:reservation};}
  if(!response.ok||Buffer.byteLength(body)>2000000)return{status:'SOURCE_RESPONSE_NOT_CLOSED',evidence:[],network_calls:1,receipts};
  const payload=JSON.parse(body),result=normalizeBybitOptions({contract,payload,observed_ts:received_ts});
  if(payload?.retCode===0&&Array.isArray(payload?.result?.list)&&payload.result.list.length<=1000&&Number.isSafeInteger(payload.time)&&payload.time<=received_ts&&received_ts-payload.time<TTL){const cache={version:BYBIT_OPTIONS_VERSION,source_ts:payload.time,body_sha256:sha(body),payload,payload_sha256:sha(JSON.stringify(payload))};if(Buffer.byteLength(JSON.stringify(cache))<1500000)await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:key,observed_ts:received_ts,expires_ts:payload.time+TTL,payload:cache});}
  return{version:BYBIT_OPTIONS_VERSION,...result,network_calls:1,receipts,admission:reservation,whole_job_admission:grant};
 }catch(error){return{status:'SOURCE_ERROR',evidence:[],network_calls:1,receipts,error:String(error?.message||error).slice(0,120),admission:reservation};}
}
