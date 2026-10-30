import {createHash} from 'node:crypto';
import {buildEvidenceV2,SOURCE_POLICIES} from './evidence-source-adapters.mjs';
import {installEvidenceSourceStore,reserveEvidenceSourceAttempts,evidenceSourceAttemptHeadroom,readEvidenceSourceCache,writeOptionalEvidenceSourceCache,nativeSourceUsageUnclosed} from './evidence-source-store.mjs';
import {parseHtxTradePayload} from './htx-trade-json.mjs';
import {reconcileN12HtxMarkets} from './n12-market-trades.mjs';
export {parseHtxTradePayload} from './htx-trade-json.mjs';
export const HTX_LARGE_TRADES_VERSION='htx-large-trades-v3-20260930';
const SOURCE='HTX_LARGE_TRADES',LIMIT=2000,WINDOW=5*60000,TTL=60000,MIN_QUOTE=100000,finite=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
const exactId=x=>typeof x==='string'&&/^\d{1,32}$/.test(x)?x:typeof x==='number'&&Number.isSafeInteger(x)&&x>0?String(x):null;
export function normalizeHtxLargeTrades(payload,{contract,observed_ts=Date.now(),min_quote_usdt=MIN_QUOTE}={}){
 if(!/^[^-\s]{1,32}-USDT$/.test(contract)||payload?.status!=='ok'||payload?.ch!==`market.${contract}.trade.detail`||!Array.isArray(payload?.data)||finite(payload.ts)===null||payload.ts>observed_ts||observed_ts-payload.ts>TTL)return{status:'EXACT_FRESH_HTX_TRADE_BATCH_REQUIRED',evidence:[],summary:null};
 if(min_quote_usdt!==MIN_QUOTE)return{status:'VERIFIED_SELECTION_THRESHOLD_REQUIRED',evidence:[],summary:null};
 const rows=payload.data.flatMap(r=>Array.isArray(r?.data)?r.data:[]),counts=new Map();for(const r of rows){const id=exactId(r?.id);if(id)counts.set(id,(counts.get(id)||0)+1);}
 const selected=[],accepted=[];let invalid=0,valid=0;for(const r of rows){const id=exactId(r?.id),price=finite(r?.price),contracts=finite(r?.amount),quantity=finite(r?.quantity),quote=finite(r?.trade_turnover),ts=finite(r?.ts);if(!id||counts.get(id)!==1||!(price>0&&contracts>0&&Number.isInteger(contracts)&&quantity>0&&quote>0)||!['buy','sell'].includes(r?.direction)||!(ts<=payload.ts&&ts<=observed_ts&&ts>=observed_ts-WINDOW)||Math.abs(price*quantity-quote)>Math.max(.000001,quote*.000001)){invalid++;continue;}valid++;accepted.push({trade_id:id,source_ts:ts,trade_turnover_usdt:quote,taker_side:r.direction});if(quote>=MIN_QUOTE)selected.push({trade_id:id,source_ts:ts,price_usdt:price,quantity_base:quantity,amount_contracts:contracts,trade_turnover_usdt:quote,taker_side:r.direction});}
 const chosen=selected.sort((a,b)=>b.trade_turnover_usdt-a.trade_turnover_usdt||a.trade_id.localeCompare(b.trade_id)).slice(0,10),buyQuote=accepted.filter(r=>r.taker_side==='buy').reduce((n,r)=>n+r.trade_turnover_usdt,0),sellQuote=accepted.filter(r=>r.taker_side==='sell').reduce((n,r)=>n+r.trade_turnover_usdt,0),totalQuote=buyQuote+sellQuote,span=accepted.length>1?Math.max(...accepted.map(r=>r.source_ts))-Math.min(...accepted.map(r=>r.source_ts)):0,saturated=payload.data.length>=LIMIT||rows.length>=LIMIT,sampleCoverage=accepted.length?Math.min(saturated?.1:.25,Math.max(saturated?.02:.05,(span/WINDOW)*(saturated?.1:1))):0,takerImbalance=totalQuote>0?(buyQuote-sellQuote)/totalQuote:0,summary={rows_returned:rows.length,valid_recent_rows:valid,rejected_rows:invalid,large_trades_in_bounded_sample:selected.length,selection_min_quote_usdt:MIN_QUOTE,sample_limit:LIMIT,sample_limit_unit:'OUTER_TRADE_BATCHES',returned_batches:payload.data.length,saturated,window_start:observed_ts-WINDOW,window_end:payload.ts,whole_window_coverage_proven:false,cvd_window_complete:false,quote:'USDT',direction_neutral:false,entry_eligible:false,is_htx_price:false,selected:chosen,observed_quote_turnover_usdt:totalQuote,buy_quote_turnover_usdt:buyQuote,sell_quote_turnover_usdt:sellQuote,taker_imbalance:takerImbalance,sample_coverage_fraction:sampleCoverage,largest_observed_trade_usdt:accepted.length?Math.max(...accepted.map(r=>r.trade_turnover_usdt)):null,transport_sample:rows.slice(0,2).map(r=>({id:exactId(r?.id),price:r?.price,amount:r?.amount,quantity:r?.quantity,trade_turnover:r?.trade_turnover,ts:r?.ts,direction:r?.direction}))};
 const evidence=chosen.map(r=>buildEvidenceV2({provider_id:SOURCE,upstream_id:'HTX_PUBLIC_FUTURES_TRADES',asset_id:`HTX:${contract}`,htx_contract:contract,block_id:'N12',metric_family:'ACTUAL_LARGE_TAKER_TRADE_CONTEXT',origin_event_id:`${contract}:${r.trade_id}`,dependency_group:`HTX_TRADE:${contract}:${r.trade_id}`,source_ts:r.source_ts,observed_ts,expires_at:Math.min(observed_ts+TTL,r.source_ts+WINDOW),coverage_status:'BOUNDED_TRADE_SAMPLE_CONTEXT',coverage_fraction:0,directional_strength:null,risk_strength:null,unit:'USDT',value:r.trade_turnover_usdt,extra:{...r,physical_root_key:`HTX_TRADE:${contract}:${r.trade_id}`,whole_window_coverage_proven:false,entry_eligible:false,is_htx_price:false,htx_execution_target_eligible:false}}));
 if(accepted.length){const last=accepted.reduce((a,b)=>a.source_ts>b.source_ts?a:b),sample=buildEvidenceV2({provider_id:SOURCE,upstream_id:'HTX_PUBLIC_FUTURES_TRADES',asset_id:`HTX:${contract}`,htx_contract:contract,block_id:'N12',metric_family:'ACTUAL_TAKER_TRADES_BOUNDED_IMBALANCE',origin_event_id:`${contract}:BOUNDED:${last.trade_id}`,dependency_group:`HTX_TRADE_SAMPLE:${contract}:${last.trade_id}`,source_ts:last.source_ts,observed_ts,expires_at:Math.min(observed_ts+TTL,last.source_ts+WINDOW),coverage_status:'BOUNDED_DIRECTIONAL_SAMPLE',coverage_fraction:sampleCoverage,directional_strength:takerImbalance,risk_strength:null,unit:'USDT',value:summary.observed_quote_turnover_usdt,extra:{valid_recent_rows:valid,large_trades_in_bounded_sample:selected.length,selection_min_quote_usdt:MIN_QUOTE,largest_observed_trade_usdt:summary.largest_observed_trade_usdt,buy_quote_turnover_usdt:buyQuote,sell_quote_turnover_usdt:sellQuote,whole_window_coverage_proven:false,cvd_window_complete:false,entry_eligible:false,is_htx_price:false,htx_execution_target_eligible:false,direction_policy:'TAKER_IMBALANCE_LOW_WEIGHT_BOUNDED_SAMPLE'}});evidence.push(sample);}
 return{status:valid?'CLOSED_BOUNDED_SAMPLE':rows.length?'TRADE_VALIDATION_NOT_CLOSED':'CLOSED_EMPTY_BOUNDED_SAMPLE',evidence,summary};
}
const requestURL=contract=>`https://api.hbdm.com/linear-swap-ex/market/history/trade?contract_code=${encodeURIComponent(contract)}&size=${LIMIT}`;
const resultDigest=r=>createHash('sha256').update(JSON.stringify({status:r.status,evidence:r.evidence,summary:r.summary})).digest('hex');
function validHtxPositiveFacts(cached,contract,now,{observed,batch}={}){
 const summary=cached.summary,rows=cached.evidence;
 if(!Number.isSafeInteger(observed)||observed>now||!Number.isSafeInteger(batch)||batch>observed||observed-batch>TTL||!summary||summary.quote!=='USDT'||summary.window_end!==batch||summary.window_start!==observed-WINDOW||!Number.isSafeInteger(summary.valid_recent_rows)||summary.valid_recent_rows<1||summary.whole_window_coverage_proven!==false||summary.cvd_window_complete!==false||!rows.length)return false;
 const sample=rows.filter(r=>r?.metric_family==='ACTUAL_TAKER_TRADES_BOUNDED_IMBALANCE'),large=rows.filter(r=>r?.metric_family==='ACTUAL_LARGE_TAKER_TRADE_CONTEXT');
 if(sample.length!==1||large.length+1!==rows.length||!Array.isArray(summary.selected)||summary.selected.length!==large.length||large.length>10)return false;
 for(const row of rows){
  if(!row||row.htx_contract!==contract||row.asset_id!==`HTX:${contract}`||row.provider_id!==SOURCE||row.upstream_id!=='HTX_PUBLIC_FUTURES_TRADES'||row.block_id!=='N12'||row.unit!=='USDT'||row.observed_ts!==observed||row.first_known_ts!==observed||!Number.isSafeInteger(row.source_ts)||row.source_ts>batch||row.source_ts<observed-WINDOW||row.expires_at!==Math.min(observed+TTL,row.source_ts+WINDOW)||row.expires_at<=now||row.validation_status!=='VALID'||row.identity_status!=='EXACT'||row.finality_status!=='FINAL'||row.whole_window_coverage_proven!==false||row.entry_eligible!==false||row.is_htx_price!==false||row.htx_execution_target_eligible!==false)return false;
  const id=buildEvidenceV2({provider_id:SOURCE,upstream_id:'HTX_PUBLIC_FUTURES_TRADES',asset_id:`HTX:${contract}`,htx_contract:contract,block_id:'N12',metric_family:row.metric_family,origin_event_id:row.origin_event_id,source_ts:row.source_ts}).evidence_id;
  if(row.evidence_id!==id)return false;
 }
 const r=sample[0],buy=r.buy_quote_turnover_usdt,sell=r.sell_quote_turnover_usdt,total=buy+sell,tradeId=String(r.origin_event_id||'').replace(`${contract}:BOUNDED:`,'');
 if(!exactId(tradeId)||r.origin_event_id!==`${contract}:BOUNDED:${tradeId}`||r.dependency_group!==`HTX_TRADE_SAMPLE:${contract}:${tradeId}`||![buy,sell,total].every(Number.isFinite)||buy<0||sell<0||total<=0||Math.abs(total-r.value)>Math.max(.000001,total*.000001)||r.value!==summary.observed_quote_turnover_usdt||buy!==summary.buy_quote_turnover_usdt||sell!==summary.sell_quote_turnover_usdt||r.valid_recent_rows!==summary.valid_recent_rows||r.directional_strength!==(buy-sell)/total||r.coverage_fraction!==summary.sample_coverage_fraction||r.risk_strength!==null||r.cvd_window_complete!==false)return false;
 return large.every((row,i)=>{const selected=summary.selected[i];return selected&&['trade_id','source_ts','price_usdt','quantity_base','amount_contracts','trade_turnover_usdt','taker_side'].every(k=>row[k]===selected[k])&&row.origin_event_id===`${contract}:${row.trade_id}`&&row.physical_root_key===`HTX_TRADE:${contract}:${row.trade_id}`&&row.dependency_group===row.physical_root_key&&row.value===row.trade_turnover_usdt&&row.value>=MIN_QUOTE&&row.coverage_fraction===0&&row.directional_strength===null&&row.risk_strength===null;});
}
function validHtxTradeCache(cached,contract,now){
 if(cached?.version!==HTX_LARGE_TRADES_VERSION||!Array.isArray(cached.evidence)||!Number.isSafeInteger(cached.cache_observed_ts)||cached.cache_observed_ts>now)return false;
 const s=cached.cache_scope,receipt=cached.receipts?.[0];
 if(!s){
  // Existing exact positive facts can be checked without a new source request.
  // A legacy source failure has no positive market fact; keep its quiet TTL.
  if(cached.status==='CLOSED_BOUNDED_SAMPLE')return receipt?.http_status===200&&receipt.source_status==='ok'&&receipt.channel===`market.${contract}.trade.detail`&&validHtxPositiveFacts(cached,contract,now,{observed:cached.evidence[0]?.observed_ts,batch:receipt.source_ts});
  if(cached.evidence.length)return false;
  if(/^SOURCE_NOT_CLOSED(?:_HTTP_\d{3})?$/.test(cached.status||''))return true;
  return cached.status==='CLOSED_EMPTY_BOUNDED_SAMPLE'&&cached.summary?.rows_returned===0&&cached.summary.valid_recent_rows===0&&receipt?.http_status===200&&receipt.source_status==='ok'&&receipt.channel===`market.${contract}.trade.detail`&&Number.isSafeInteger(receipt.source_ts)&&receipt.source_ts<=now&&now-receipt.source_ts<=TTL;
 }
 if(s.schema!=='HTX_N12_RESULT_CACHE_SCOPE_V1'||s.source!==SOURCE||s.contract!==contract||s.market!=='FUTURES'||s.quote!=='USDT'||s.request_url!==requestURL(contract)||s.observed_ts!==cached.cache_observed_ts||s.expires_at!==cached.cache_expires_ts||s.expires_at<=now||s.expires_at!==s.observed_ts+(String(cached.status).startsWith('CLOSED')?TTL:15*60000)||s.result_sha256!==resultDigest(cached))return false;
 if(cached.status==='CLOSED_BOUNDED_SAMPLE')return /^[a-f0-9]{64}$/.test(s.body_sha256||'')&&s.channel===`market.${contract}.trade.detail`&&s.source_status==='ok'&&validHtxPositiveFacts(cached,contract,now,{observed:s.observed_ts,batch:s.batch_ts});
 if(cached.status==='CLOSED_EMPTY_BOUNDED_SAMPLE')return cached.evidence.length===0&&cached.summary?.rows_returned===0&&cached.summary.valid_recent_rows===0&&s.channel===`market.${contract}.trade.detail`&&s.source_status==='ok'&&Number.isSafeInteger(s.batch_ts)&&s.batch_ts<=s.observed_ts&&s.observed_ts-s.batch_ts<=TTL;
 return cached.evidence.length===0&&!String(cached.status||'').startsWith('CLOSED');
}
export async function collectHtxLargeTradesEvidence({db,fetch_impl=globalThis.fetch,request_admit,source_health_admit,contract,run_id,now=Date.now(),same_run_htx_trades}={}){
 if(same_run_htx_trades&&typeof same_run_htx_trades==='object'){
  const future=same_run_htx_trades.futures?.contract===contract?same_run_htx_trades.futures.payload:null;
  const spot=same_run_htx_trades.spot?.contract===contract?same_run_htx_trades.spot.payload:null;
  const futures=future?normalizeHtxLargeTrades(future,{contract,observed_ts:now}):{status:'FUTURES_RESPONSE_UNAVAILABLE',evidence:[],summary:null};
  const current={version:HTX_LARGE_TRADES_VERSION,...reconcileN12HtxMarkets({contract,futures,spot_payload:spot,observed_ts:now})};
  // A real same-run check (including an empty fresh sample) owns this result.
  // A failed/empty envelope is not proof that an exact positive cache is absent.
  if(current.check_completed===true||current.evidence.length||Array.isArray(same_run_htx_trades))return current;
  let prototype;try{prototype=Object.getPrototypeOf(same_run_htx_trades);}catch{return current;}
  if(prototype!==Object.prototype&&prototype!==null)return current;
  const fallback=(status)=>({...current,cache_fallback:{schema:'HTX_EMPTY_SAME_RUN_CACHE_FALLBACK_V1',status,same_run_status:current.status,same_run_receipts:current.receipts,native_usage_unclosed:nativeSourceUsageUnclosed(db)}});
  if(!/^[^-\s]{1,32}-USDT$/.test(contract)||!Number.isSafeInteger(now)||now<1_000_000_000_000||!db?.prepare||nativeSourceUsageUnclosed(db)||typeof source_health_admit!=='function')return fallback('EXISTING_CACHE_READ_NOT_ADMITTED');
  let grant;try{grant=source_health_admit({rows_read:500,rows_written:0});}catch{return fallback('EXISTING_CACHE_READ_NOT_ADMITTED');}
  if(grant?.allowed!==true)return fallback('EXISTING_CACHE_READ_NOT_ADMITTED');
  try{
   const cached=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:contract,now,include_cache_clock:true});
   if(cached?.cache_scope?.schema==='HTX_N12_RESULT_CACHE_SCOPE_V1'&&cached.status==='CLOSED_BOUNDED_SAMPLE'&&validHtxTradeCache(cached,contract,now))return{...cached,check_completed:false,cache_fallback:{schema:'HTX_EMPTY_SAME_RUN_CACHE_FALLBACK_V1',status:'VALIDATED_EXISTING_POSITIVE_CACHE',same_run_status:current.status,same_run_receipts:current.receipts,native_usage_unclosed:nativeSourceUsageUnclosed(db)}};
   return fallback('NO_VALID_EXISTING_POSITIVE_CACHE');
  }catch{return fallback('EXISTING_CACHE_READ_FAILED');}
  // Cache miss/failure returns above: never fall through to legacy acquisition.
 }
 const no=(status,extra={})=>({version:HTX_LARGE_TRADES_VERSION,status,evidence:[],network_calls:0,...extra});
 const unclosed=()=>nativeSourceUsageUnclosed(db);
 if(!/^[^-\s]{1,32}-USDT$/.test(contract))return no('EXACT_HTX_CONTRACT_REQUIRED');
 if(unclosed())return no('ADMISSION_LEDGER_UNAVAILABLE_NATIVE_USAGE');
 try{await installEvidenceSourceStore(db);}catch{return no(unclosed()?'ADMISSION_LEDGER_UNAVAILABLE_NATIVE_USAGE':'CODE_OR_STORE_ERROR');}
 if(unclosed())return no('ADMISSION_LEDGER_UNAVAILABLE_NATIVE_USAGE');
 const cached=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:contract,now,include_cache_clock:true});
 if(validHtxTradeCache(cached,contract,now))return cached;
 if(unclosed())return no('ADMISSION_LEDGER_UNAVAILABLE_NATIVE_USAGE');
 const headroom=await evidenceSourceAttemptHeadroom(db,{source:SOURCE,attempts:1,daily_cap:SOURCE_POLICIES[SOURCE].daily_cap,now});
 if(unclosed())return no('ADMISSION_LEDGER_UNAVAILABLE_NATIVE_USAGE');
 if(!headroom.allowed)return no(headroom.status,{admission:headroom});
 const reservation_id=`EV2:${SOURCE}:${run_id}:${contract}`,whole_job_admission=request_admit?.({logical_request_id:reservation_id,lane:'background',attempts:1});
 if(!whole_job_admission?.allowed||whole_job_admission.duplicate)return no(whole_job_admission?.duplicate?'ALREADY_RESERVED_NO_REDISPATCH':whole_job_admission?.status||'ADMISSION_REQUIRED',{whole_job_admission});
 const admission=await reserveEvidenceSourceAttempts(db,{source:SOURCE,reservation_id,attempts:1,daily_cap:SOURCE_POLICIES[SOURCE].daily_cap,now});
 if(unclosed())return no('ADMISSION_LEDGER_UNAVAILABLE_NATIVE_USAGE',{admission,whole_job_admission});
 if(!admission.allowed)return no(admission.status,{admission});
 const c=new AbortController(),timer=setTimeout(()=>c.abort(),12000);let result,p,raw,observed;
 try{
  const response=await fetch_impl(requestURL(contract),{headers:{accept:'application/json'},signal:c.signal,redirect:'error'});raw=await response.text();observed=Date.now();
  if(raw.length<=2*1024*1024)try{p=parseHtxTradePayload(raw);}catch{}
  const normalized=response.ok&&p?normalizeHtxLargeTrades(p,{contract,observed_ts:observed}):{status:`SOURCE_NOT_CLOSED_HTTP_${response.status}`,evidence:[]};
  result={version:HTX_LARGE_TRADES_VERSION,...normalized,network_calls:1,admission,whole_job_admission,receipts:[{http_status:response.status,source_status:p?.status,channel:p?.ch,source_ts:p?.ts}],internal_only:true};
 }catch(error){observed=Date.now();result={version:HTX_LARGE_TRADES_VERSION,status:'SOURCE_NOT_CLOSED',reason:String(error.message).slice(0,100),evidence:[],network_calls:1,admission,whole_job_admission,receipts:[],internal_only:true};}
 finally{clearTimeout(timer);}
 const expires=observed+(result.status.startsWith('CLOSED')?TTL:15*60000);
 result.cache_scope={schema:'HTX_N12_RESULT_CACHE_SCOPE_V1',source:SOURCE,contract,market:'FUTURES',quote:'USDT',request_url:requestURL(contract),observed_ts:observed,expires_at:expires,source_status:p?.status??null,channel:p?.ch??null,batch_ts:p?.ts??null,body_sha256:typeof raw==='string'?createHash('sha256').update(raw).digest('hex'):null,result_sha256:resultDigest(result)};
 const cache_write_receipts=[await writeOptionalEvidenceSourceCache(db,{source:SOURCE,asset_key:contract,observed_ts:observed,expires_ts:expires,payload:result})];
 return{...result,cache_write_receipts};
}
