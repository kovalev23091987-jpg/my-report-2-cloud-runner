import {createHash} from 'node:crypto';
import {buildEvidenceV2,SOURCE_POLICIES} from './evidence-source-adapters.mjs';
import {isExactHtxUsdtSwapKey} from './htx-contract-key.mjs';
import {installEvidenceSourceStore,readEvidenceSourceCache,writeEvidenceSourceCache,reserveEvidenceSourceAttempts} from './evidence-source-store.mjs';

export const BINANCE_OPTION_INTEREST_VERSION='binance-bnb-option-interest-v1-20261012';
export const BINANCE_VERIFIED_INTEREST_BASES=Object.freeze(['BNB']);
const SOURCE='BINANCE_OPTION_INTEREST',TTL=SOURCE_POLICIES[SOURCE].ttl_ms,CATALOG_TTL=6*60*60_000,DAY=86400000;
const hash=value=>createHash('sha256').update(value).digest('hex');
const num=value=>value===null||value===undefined||value===''||typeof value==='boolean'?null:Number.isFinite(Number(value))?Number(value):null;
const exactSymbol=(base,expiry)=>new RegExp(`^${base}-${expiry}-([0-9]+(?:\\.[0-9]+)?)-([CP])$`);
const dateCode=ts=>new Date(ts).toISOString().slice(2,10).replaceAll('-','');
function selectedExpiry(symbols,price,now){
 const eligible=symbols.filter(x=>x.underlying==='BNBUSDT'&&x.quoteAsset==='USDT'&&x.contractType==='CRYPTO_OPTIONS'&&x.status==='TRADING'&&Number.isSafeInteger(x.expiryDate)&&x.expiryDate>now+DAY&&x.expiryDate<=now+45*DAY&&num(x.strikePrice)>0&&Math.abs(num(x.strikePrice)/price-1)<=.1&&exactSymbol('BNB',dateCode(x.expiryDate)).test(x.symbol));
 const expiries=[...new Set(eligible.map(x=>x.expiryDate))].sort((a,b)=>a-b);
 return{eligible,expiry:expiries.find(ts=>new Date(ts).getUTCDay()===5&&ts>=now+2*DAY)??expiries[0]};
}

export function deriveBinanceOptionInterest({samples=[],base_currency,index_price,index_ts,source_ts,observed_ts,expiration_timestamp}={}){
 if(base_currency!=='BNB'||!(index_price>0)||!Number.isSafeInteger(index_ts)||!Number.isSafeInteger(source_ts)||!Number.isSafeInteger(observed_ts)||!Number.isSafeInteger(expiration_timestamp)||source_ts>observed_ts||observed_ts-source_ts>TTL||Math.abs(index_ts-source_ts)>5*60_000||expiration_timestamp<source_ts+DAY||expiration_timestamp>source_ts+45*DAY||samples.length<4||samples.length>24||new Set(samples.map(x=>x.symbol)).size!==samples.length)return null;
 const expiry=dateCode(expiration_timestamp),pattern=exactSymbol(base_currency,expiry);
 let call=0,put=0,totalUsd=0;
 for(const row of samples){
  const m=pattern.exec(row?.symbol||'');
  if(!m||row.option_type!==m[2]||row.strike!==num(m[1])||Math.abs(row.strike/index_price-1)>.1||!(row.open_interest>0&&row.open_interest_usd>0)||!Number.isSafeInteger(row.source_ts)||Math.abs(row.source_ts-index_ts)>5*60_000||row.source_ts>observed_ts||observed_ts-row.source_ts>TTL)return null;
  if(m[2]==='C')call++;else put++;
  totalUsd+=row.open_interest_usd;
 }
 if(call<2||put<2||!Number.isFinite(totalUsd)||totalUsd<=0)return null;
 return{status:'CLOSED_SCOPED_OPEN_INTEREST_ONLY',base_currency,settlement_currency:'USDT',sample_count:samples.length,call_count:call,put_count:put,expiration_timestamp,index_price,open_interest_usd:totalUsd,source_ts,index_ts,source_clock_policy:'PROVIDER_INDEX_AND_OPEN_INTEREST_TIMESTAMPS',iv_available:false,quote_available:false,directional_vote:false,entry_authorized:false};
}

export function normalizeBinanceOptionInterest({contract,catalog,index,interest,observed_ts}={}){
 if(!isExactHtxUsdtSwapKey(contract)||contract!=='BNB-USDT')return{status:'EXACT_HTX_CONTRACT_REQUIRED',evidence:[]};
 const sourceTs=num(catalog?.serverTime),indexTs=num(index?.time),price=num(index?.indexPrice),symbols=catalog?.optionSymbols;
 if(!Number.isSafeInteger(sourceTs)||!Number.isSafeInteger(indexTs)||!Number.isSafeInteger(observed_ts)||sourceTs>observed_ts||observed_ts-sourceTs>CATALOG_TTL||indexTs>observed_ts||observed_ts-indexTs>TTL||!(price>0)||!Array.isArray(symbols)||symbols.length>1000||!Array.isArray(interest)||interest.length>500)return{status:'SOURCE_NOT_CLOSED',evidence:[]};
 const {eligible,expiry}=selectedExpiry(symbols,price,observed_ts);
 if(!expiry)return{status:'NO_VERIFIED_NEAR_ATM_CATALOG',evidence:[]};
 const catalogMap=new Map(eligible.filter(x=>x.expiryDate===expiry).map(x=>[x.symbol,x]));
 const samples=[];
 for(const row of interest){
  if(!catalogMap.has(row?.symbol))continue;
  const item=catalogMap.get(row.symbol),oi=num(row.sumOpenInterest),usd=num(row.sumOpenInterestUsd),ts=num(row.timestamp);
  if(!(oi>0&&usd>0)||!Number.isSafeInteger(ts)||ts>observed_ts||observed_ts-ts>TTL||Math.abs(ts-indexTs)>5*60_000)continue;
  samples.push({symbol:row.symbol,option_type:item.side==='CALL'?'C':item.side==='PUT'?'P':null,strike:num(item.strikePrice),open_interest:oi,open_interest_usd:usd,source_ts:ts});
 }
 samples.sort((a,b)=>Math.abs(a.strike/price-1)-Math.abs(b.strike/price-1)||a.symbol.localeCompare(b.symbol));
 const chosen=['C','P'].flatMap(type=>samples.filter(x=>x.option_type===type).slice(0,12));
 const source_ts=Math.min(indexTs,...chosen.map(x=>x.source_ts)),risk=deriveBinanceOptionInterest({samples:chosen,base_currency:'BNB',index_price:price,index_ts:indexTs,source_ts,observed_ts,expiration_timestamp:expiry});
 if(!risk)return{status:'NO_VERIFIED_SCOPED_OPEN_INTEREST',evidence:[],check_completed:false,internal_only:true};
 const evidence=buildEvidenceV2({provider_id:SOURCE,upstream_id:'BINANCE_PUBLIC_OPTIONS',asset_id:'htx-futures:BNB-USDT',htx_contract:contract,block_id:'N14',metric_family:'BINANCE_SCOPED_OPTION_OPEN_INTEREST',origin_event_id:`BNB:${source_ts}:${expiry}`,dependency_group:`BINANCE_OPTIONS:BNB:${source_ts}`,source_ts,observed_ts,expires_at:source_ts+TTL,coverage_status:'EXACT_PROVIDER_OPEN_INTEREST_BASKET_ONLY',coverage_fraction:.2,directional_strength:null,risk_strength:null,extra:{base_currency:'BNB',option_risk_context:{...risk,samples:chosen},source_clock_policy:risk.source_clock_policy,source_is_htx_execution_price:false,option_quotes_available:false,direction_policy:'CONTEXT_ONLY_NO_DIRECTIONAL_BONUS'}});
 return{status:'CLOSED',evidence:[evidence],summary:risk,internal_only:true};
}

export async function collectBinanceOptionInterestEvidence({db,fetch_impl=globalThis.fetch,request_admit,contract,run_id,now=Date.now(),strict_fresh_manual=false,clock=Date.now}={}){
 if(contract!=='BNB-USDT')return{status:'NOT_IN_VERIFIED_BINANCE_INTEREST_CAPABILITY',evidence:[],network_calls:0,internal_only:true};
 await installEvidenceSourceStore(db);
 const backoff=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:'ACCESS_BACKOFF',now});
 if(backoff?.until_ts>now)return{status:backoff.status,evidence:[],network_calls:0,backoff_until:backoff.until_ts};
 const cached=strict_fresh_manual?null:await readEvidenceSourceCache(db,{source:SOURCE,asset_key:'BNB_RESULT',now});
 if(cached?.version===BINANCE_OPTION_INTEREST_VERSION&&cached?.catalog&&cached?.index&&cached?.interest){const result=normalizeBinanceOptionInterest({...cached,contract,observed_ts:now});if(result.status==='CLOSED')return{...result,network_calls:0,cache_status:'VALID_PROVIDER_CLOCK_CACHE',receipts:[{cache_hit:true,actual_http:0}]};}
 let catalog=strict_fresh_manual?null:await readEvidenceSourceCache(db,{source:SOURCE,asset_key:'BNB_CATALOG',now});
 if(catalog?.version!==BINANCE_OPTION_INTEREST_VERSION||!Array.isArray(catalog?.optionSymbols)||!Number.isSafeInteger(catalog?.serverTime)||now-catalog.serverTime>CATALOG_TTL)catalog=null;
 const attempts=catalog?2:3,id=`${SOURCE}:${run_id}:${contract}`,grant=request_admit?.({logical_request_id:id,lane:'background',attempts});
 if(grant?.allowed!==true||grant.duplicate)return{status:grant?.status||'WHOLE_JOB_ADMISSION_REQUIRED',evidence:[],network_calls:0,whole_job_admission:grant};
 const reservation=await reserveEvidenceSourceAttempts(db,{source:SOURCE,reservation_id:id,attempts,daily_cap:strict_fresh_manual?96:80,now:clock()});
 if(!reservation.allowed)return{status:reservation.status,evidence:[],network_calls:0,admission:reservation};
 const receipts=[];let calls=0;
 const get=async url=>{calls++;const response=await fetch_impl(url,{headers:{accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(12000)}),body=await response.text(),received_ts=clock();receipts.push({url,actual_http:1,http_status:response.status,received_ts,body_sha256:hash(body)});
  if([403,429,451].includes(response.status)){const status=response.status===429?'PROVIDER_RATE_LIMITED':'SOURCE_ACCESS_BLOCKED',until_ts=received_ts+15*60_000;await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:'ACCESS_BACKOFF',observed_ts:received_ts,expires_ts:until_ts,payload:{status,until_ts}});throw Error(status);}
  if(!response.ok||Buffer.byteLength(body)>2_000_000)throw Error('SOURCE_RESPONSE_NOT_CLOSED');return JSON.parse(body);};
 try{
  if(!catalog){const full=await get('https://eapi.binance.com/eapi/v1/exchangeInfo');if(!Number.isSafeInteger(full?.serverTime)||full.serverTime>clock()||!Array.isArray(full?.optionSymbols)||full.optionSymbols.length>5000)throw Error('INVALID_OPTION_CATALOG');catalog={version:BINANCE_OPTION_INTEREST_VERSION,serverTime:full.serverTime,optionSymbols:full.optionSymbols.filter(x=>x?.underlying==='BNBUSDT').map(x=>({symbol:x.symbol,side:x.side,strikePrice:x.strikePrice,underlying:x.underlying,quoteAsset:x.quoteAsset,status:x.status,expiryDate:x.expiryDate,contractType:x.contractType}))};await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:'BNB_CATALOG',observed_ts:clock(),expires_ts:full.serverTime+CATALOG_TTL,payload:catalog});}
  const index=await get('https://eapi.binance.com/eapi/v1/index?underlying=BNBUSDT'),price=num(index?.indexPrice);if(!(price>0)||!Number.isSafeInteger(index?.time)||clock()-index.time>TTL)throw Error('INVALID_BNB_INDEX');
  const {expiry}=selectedExpiry(catalog.optionSymbols,price,clock());
  if(!expiry)return{status:'NO_VERIFIED_NEAR_ATM_CATALOG',evidence:[],network_calls:calls,receipts,admission:reservation,whole_job_admission:grant};
  const interest=await get(`https://eapi.binance.com/eapi/v1/openInterest?underlyingAsset=BNB&expiration=${dateCode(expiry)}`),result=normalizeBinanceOptionInterest({contract,catalog,index,interest,observed_ts:clock()});
  if(result.status==='CLOSED'){await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:'BNB_RESULT',observed_ts:clock(),expires_ts:result.evidence[0].expires_at,payload:{version:BINANCE_OPTION_INTEREST_VERSION,catalog,index,interest}});}
  return{version:BINANCE_OPTION_INTEREST_VERSION,...result,network_calls:calls,receipts,admission:reservation,whole_job_admission:grant};
 }catch(error){return{status:['PROVIDER_RATE_LIMITED','SOURCE_ACCESS_BLOCKED'].includes(error.message)?error.message:'SOURCE_ERROR',evidence:[],network_calls:calls,receipts,error:String(error?.message||error).slice(0,120),admission:reservation,whole_job_admission:grant};}
}
