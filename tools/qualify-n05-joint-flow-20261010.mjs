import fs from 'node:fs/promises';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import {loadDailyUsageAggregate,evaluateDailyReservationBudget,evaluateWithinRunReservation,reserveRunBudget,finalizeRunUsage} from '../runner/d1-preaction-budget-guard.mjs';
import {createUnifiedHttpBudget} from '../current-generation/files/src/unified-budget.mjs';
import {reserveEvidenceSourceAttempts,readEvidenceSourceCache,writeEvidenceSourceCache} from '../current-generation/files/src/evidence-source-store.mjs';
import {reserveProviderMinuteUnits} from '../current-generation/files/src/provider-minute-ledger.mjs';
const stage=process.argv[2]||'catalog',root='audit-output/n05-qualification',hash=b=>createHash('sha256').update(b).digest('hex');
const universe=JSON.parse(gunzipSync(await fs.readFile('checkpoints/htx-all-modes-crypto-futures-universe-20261004.json.gz')));if(universe.assets.length!==102)throw Error('EXACT_UNIVERSE_REQUIRED');
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),now=Date.now(),id=`N05_QUALIFICATION:${process.env.GITHUB_RUN_ID}:${stage}:${process.env.GITHUB_RUN_ATTEMPT}`,reservation={rows_read:16000,rows_written:500},budget=createUnifiedHttpBudget(),blocked=new Set();
const out={schema:'N05_ACTUAL_SPOT_FUTURES_QUALIFICATION_V1',stage,run:process.env.GITHUB_RUN_ID,head:process.env.GITHUB_SHA,started_ts:now,approved_assets:102,minimum_useful_assets:31,coverage_is_not_listing:true,sourceHTTP:0,sources:[],MAIN:0,Telegram:0,score_adjustment:0,production_enabled:false,new_fresh_SENT:false,project_complete:false};
await fs.mkdir(root,{recursive:true});let admitted=false;
async function get(name,venue,url,{method='GET',body=null,source=null,daily_cap=null}={}){
 const receipt={name,venue,url,method,received_ts:null,http_status:null,status:'NOT_ATTEMPTED',sourceHTTP:0,source_ts:null,retrieval_is_not_event_time:true};out.sources.push(receipt);
 const key=source||`N05_OFFICIAL_FLOW:${venue}`,cap=daily_cap??16;
 if(blocked.has(venue)){receipt.status='SHARED_VENUE_BACKOFF';return null;}
 try{
  if(!evaluateWithinRunReservation({reservation,currentUsage:db.usageSnapshot(),extraRowsRead:500,extraRowsWritten:22}).allowed)throw Error('D1_HEADROOM_DENIED');
  const old=await readEvidenceSourceCache(db,{source:`N05_PROVIDER_BACKOFF:${venue}`,asset_key:'SHARED',now:Date.now()});if(old){receipt.status='DURABLE_VENUE_BACKOFF';blocked.add(venue);return null;}
  const whole=budget.reserve({logical_request_id:id+':'+name,lane:'background',attempts:1});receipt.whole_admission=whole;if(!whole.allowed||whole.duplicate)throw Error('WHOLE_JOB_HTTP_DENIED');
  const daily=await reserveEvidenceSourceAttempts(db,{source:key,reservation_id:id+':'+name,attempts:1,daily_cap:cap,now:Date.now()});receipt.daily_admission=daily;if(!daily.allowed)throw Error('SOURCE_DAILY_CAP_DENIED');
  const minute=await reserveProviderMinuteUnits(db,{provider:venue,reservation_id:id+':'+name,units:1,cap:6,now:Date.now()});receipt.minute_admission=minute;if(!minute.allowed)throw Error('PROVIDER_MINUTE_CAP_DENIED');
  out.sourceHTTP++;receipt.sourceHTTP=1;
  const r=await fetch(url,{method,body:body?JSON.stringify(body):undefined,headers:{accept:'application/json',...(body?{'content-type':'application/json'}:{})},redirect:'manual',signal:AbortSignal.timeout(15000)});
  receipt.http_status=r.status;receipt.retry_after=r.headers.get('retry-after');const chunks=[];let n=0;for await(const chunk of r.body){n+=chunk.length;if(n>8*1024*1024)throw Error('BODY_LIMIT');chunks.push(chunk);}const bytes=Buffer.concat(chunks),gz=gzipSync(bytes);receipt.received_ts=Date.now();receipt.body_sha256=hash(bytes);receipt.gzip_sha256=hash(gz);receipt.bytes=bytes.length;receipt.file=name+'.json.gz';await fs.writeFile(root+'/'+receipt.file,gz);
  if([401,403,429,451].includes(r.status)){blocked.add(venue);const seconds=/^\d+$/.test(receipt.retry_after||'')?Number(receipt.retry_after):0;await writeEvidenceSourceCache(db,{source:`N05_PROVIDER_BACKOFF:${venue}`,asset_key:'SHARED',observed_ts:receipt.received_ts,expires_ts:receipt.received_ts+Math.max(900000,seconds*1000),payload:{http_status:r.status,original_received_ts:receipt.received_ts}});}
  if(r.status!==200){receipt.status=`HTTP_${r.status}`;return null;}
  let p;try{p=JSON.parse(bytes);}catch{receipt.status='INVALID_JSON';return null;}
  receipt.status='RECEIVED_NOT_QUALIFIED';return p;
 }catch(e){receipt.status=/^[A-Z0-9_]+$/.test(e.message)?e.message:e.name;receipt.received_ts??=Date.now();return null;}
}
const specs=[
 ['HTX','SPOT','https://api.huobi.pro/v1/common/symbols'],
 ['BINANCE','SPOT','https://data-api.binance.vision/api/v3/exchangeInfo'],['BINANCE','FUTURES','https://fapi.binance.com/fapi/v1/exchangeInfo'],
 ['BYBIT','SPOT','https://api.bybit.com/v5/market/instruments-info?category=spot&limit=1000'],['BYBIT','FUTURES','https://api.bybit.com/v5/market/instruments-info?category=linear&limit=1000'],
 ['GATE','SPOT','https://api.gateio.ws/api/v4/spot/currency_pairs'],['GATE','FUTURES','https://api.gateio.ws/api/v4/futures/usdt/contracts'],
 ['OKX','SPOT','https://www.okx.com/api/v5/public/instruments?instType=SPOT'],['OKX','FUTURES','https://www.okx.com/api/v5/public/instruments?instType=SWAP'],
 ['BITGET','SPOT','https://api.bitget.com/api/v2/spot/public/symbols'],['BITGET','FUTURES','https://api.bitget.com/api/v2/mix/market/contracts?productType=USDT-FUTURES'],
 ['KUCOIN','SPOT','https://api.kucoin.com/api/v2/symbols'],['KUCOIN','FUTURES','https://api-futures.kucoin.com/api/v1/contracts/active'],
 ['MEXC','SPOT','https://api.mexc.com/api/v3/exchangeInfo'],['MEXC','FUTURES','https://contract.mexc.com/api/v1/contract/detail'],
 ['HYPERLIQUID','FUTURES','https://api.hyperliquid.xyz/info',{method:'POST',body:{type:'meta'}}],['HYPERLIQUID','SPOT','https://api.hyperliquid.xyz/info',{method:'POST',body:{type:'spotMeta'}}],
 ['LIGHTER','FUTURES','https://mainnet.zklighter.elliot.ai/api/v1/orderBooks'],['DYDX','FUTURES','https://indexer.dydx.trade/v4/perpetualMarkets'],
 ];
function catalog(venue,market,p){
 const rows=venue==='HTX'?p?.data:venue==='BINANCE'||venue==='MEXC'&&market==='SPOT'?p?.symbols:venue==='BYBIT'?p?.result?.list:venue==='GATE'?p:venue==='OKX'||venue==='BITGET'||venue==='KUCOIN'||venue==='MEXC'?p?.data:venue==='HYPERLIQUID'?p?.universe:venue==='LIGHTER'?p?.order_books:venue==='DYDX'?Object.values(p?.markets||{}):null;
 if(!Array.isArray(rows))return{status:'SCHEMA_NOT_CLOSED',candidates:[]};
 const entries=[];
 for(const r of rows){let base,quote,instrument,active;
  if(venue==='HTX'){base=r['base-currency'];quote=r['quote-currency'];instrument=r.symbol;active=r.state==='online';}
  if(venue==='BINANCE'||venue==='MEXC'&&market==='SPOT'){base=r.baseAsset;quote=r.quoteAsset;instrument=r.symbol;active=['TRADING','1','ENABLED'].includes(String(r.status))&&(market==='SPOT'||r.contractType==='PERPETUAL');}
  if(venue==='BYBIT'){base=r.baseCoin;quote=r.quoteCoin;instrument=r.symbol;active=r.status==='Trading'&&(market==='SPOT'||r.contractType==='LinearPerpetual');}
  if(venue==='GATE'){base=market==='SPOT'?r.base:r.name?.replace(/_USDT$/,'');quote=market==='SPOT'?r.quote:'USDT';instrument=r.id||r.name;active=market==='SPOT'?r.trade_status==='tradable':!r.in_delisting&&(!r.status||r.status==='trading')&&r.type==='direct';}
  if(venue==='OKX'){base=market==='SPOT'?r.baseCcy:r.ctValCcy;quote=market==='SPOT'?r.quoteCcy:r.settleCcy;instrument=r.instId;active=r.state==='live'&&(market==='SPOT'||r.ctType==='linear');}
  if(venue==='BITGET'){base=r.baseCoin;quote=r.quoteCoin;instrument=r.symbol;active=['online','normal'].includes(r.status||r.symbolStatus);}
  if(venue==='KUCOIN'){base=r.baseCurrency;quote=r.quoteCurrency;instrument=r.symbol;active=market==='SPOT'?r.enableTrading===true:r.status==='Open'&&r.isInverse===false;}
  if(venue==='MEXC'&&market==='FUTURES'){base=r.baseCoin;quote=r.quoteCoin;instrument=r.symbol;active=Number(r.state)===0;}
  if(venue==='HYPERLIQUID'&&market==='FUTURES'){base=r.name;quote='USDC';instrument=r.name;active=r.isDelisted!==true;}
  if(venue==='HYPERLIQUID'&&market==='SPOT'){base=p.tokens?.[r.tokens?.[0]]?.name;quote=p.tokens?.[r.tokens?.[1]]?.name;instrument=r.name;active=true;}
  if(venue==='LIGHTER'){base=r.symbol?.replace('/USDC','');quote='USDC';instrument=String(r.market_id);active=r.status==='active';}
  if(venue==='DYDX'){base=r.ticker?.replace(/-USD$/,'');quote='USD';instrument=r.ticker;active=r.status==='ACTIVE';}
  base=String(base||'').toUpperCase();if(active&&['USDT','USDC','USD'].includes(quote)&&universe.assets.some(a=>a.symbol===base))entries.push({base,quote,instrument,raw:r,asset_identity_verified:false});
 }
 return{status:'MARKET_CATALOG_CANDIDATES_ONLY',row_count:rows.length,candidates:entries,unique_candidate_assets:[...new Set(entries.map(x=>x.base))],pagination_complete:venue!=='BYBIT'||!p?.result?.nextPageCursor,listing_not_useful_flow:true};
}
function flowURL(venue,market,e,end){const symbol=encodeURIComponent(e.instrument),start=end-14400000;
 if(venue==='HTX'&&market==='SPOT')return`https://api.huobi.pro/market/history/trade?symbol=${symbol}&size=2000`;
 if(venue==='BINANCE')return market==='SPOT'?`https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=1m&startTime=${start}&endTime=${end-1}&limit=240`:`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=1m&startTime=${start}&endTime=${end-1}&limit=240`;
 if(venue==='BYBIT')return`https://api.bybit.com/v5/market/recent-trade?category=${market==='SPOT'?'spot':'linear'}&symbol=${symbol}&limit=${market==='SPOT'?60:1000}`;
 if(venue==='GATE')return market==='SPOT'?`https://api.gateio.ws/api/v4/spot/trades?currency_pair=${symbol}&from=${start/1000}&to=${end/1000-1}&limit=1000`:`https://api.gateio.ws/api/v4/futures/usdt/trades?contract=${symbol}&from=${start/1000}&to=${end/1000-1}&limit=1000`;
 if(venue==='OKX')return`https://www.okx.com/api/v5/market/history-trades?instId=${symbol}&limit=100`;
 if(venue==='BITGET')return market==='SPOT'?`https://api.bitget.com/api/v2/spot/market/fills-history?symbol=${symbol}&startTime=${start}&endTime=${end-1}&limit=1000`:`https://api.bitget.com/api/v2/mix/market/fills-history?symbol=${symbol}&productType=USDT-FUTURES&startTime=${start}&endTime=${end-1}&limit=1000`;
 if(venue==='KUCOIN')return market==='SPOT'?`https://api.kucoin.com/api/v1/market/histories?symbol=${symbol}`:`https://api-futures.kucoin.com/api/v1/trade/history?symbol=${symbol}`;
 if(venue==='MEXC')return market==='SPOT'?`https://api.mexc.com/api/v3/aggTrades?symbol=${symbol}&startTime=${start}&endTime=${end-1}&limit=1000`:`https://contract.mexc.com/api/v1/contract/deals/${symbol}?limit=1000`;
 if(venue==='LIGHTER')return`https://mainnet.zklighter.elliot.ai/api/v1/recentTrades?market_id=${symbol}&limit=100`;
 if(venue==='DYDX')return`https://indexer.dydx.trade/v4/trades/perpetualMarket/${symbol}?limit=100`;
 return null;
}
try{
 out.daily_admission=evaluateDailyReservationBudget({daily:await loadDailyUsageAggregate(db,now),nextReservation:reservation,maxDailyReads:3500000,maxDailyWrites:70000});if(!out.daily_admission.allowed)throw Error('D1_DAILY_ADMISSION_DENIED');await reserveRunBudget(db,{reservationId:id,now,reservation});admitted=true;
 if(stage==='catalog'){
  out.catalogs=[];for(const [venue,market,url,options]of specs){const name=`catalog-${venue}-${market}`,p=await get(name,venue,url,options);out.catalogs.push({venue,market,name,...catalog(venue,market,p)});}
  await get('identity-HTX','HTX','https://api.huobi.pro/v2/reference/currencies',{source:'HTX_ASSET_REFERENCE',daily_cap:8});
  await get('identity-BITGET','BITGET','https://api.bitget.com/api/v2/spot/public/coins');
 }else{
  const saved=JSON.parse(await fs.readFile(root+'/catalog-summary.json'));out.catalog_run=saved.run;out.window_end_ts=Math.floor(now/60000)*60000;out.window_start_ts=out.window_end_ts-14400000;
  for(const c of saved.catalogs){const e=c.candidates?.find(e=>e.quote==='USDT')||c.candidates?.[0];if(!e){out.sources.push({venue:c.venue,market:c.market,status:'NO_CATALOG_CANDIDATE;NOT_ZERO_FLOW',sourceHTTP:0});continue;}
   const name=`flow-${c.venue}-${c.market}-${e.base}`,url=flowURL(c.venue,c.market,e,out.window_end_ts);const p=url?await get(name,c.venue,url):c.venue==='HYPERLIQUID'?await get(name,c.venue,'https://api.hyperliquid.xyz/info',{method:'POST',body:{type:'recentTrades',coin:e.instrument}}):null;
   const receipt=out.sources.at(-1);if(!receipt)continue;receipt.market=c.market;receipt.candidate=e.base;receipt.instrument=e.instrument;receipt.quote=e.quote;receipt.exact_asset_identity_verified=false;
   const rows=Array.isArray(p)?p:Array.isArray(p?.data)?p.data:p?.result?.list||p?.data?.trades||p?.trades||[];receipt.returned_rows=Array.isArray(rows)?rows.length:0;receipt.sample=Array.isArray(rows)?rows.slice(0,2):[];
   if(c.venue==='BINANCE'&&Array.isArray(p)){let buy=0,total=0,count=0,valid=p.length===240;for(let i=0;i<p.length;i++){const r=p[i];valid&&=Array.isArray(r)&&r[0]===out.window_start_ts+i*60000&&r[6]===r[0]+59999&&Number.isFinite(Number(r[7]))&&Number(r[7])>=0&&Number.isFinite(Number(r[10]))&&Number(r[10])>=0&&Number(r[10])<=Number(r[7])&&Number.isSafeInteger(r[8])&&r[8]>=0;total+=Number(r[7]);buy+=Number(r[10]);count+=r[8];}receipt.signed_full_window_valid=valid&&total>0;receipt.flow=valid?{window_start_ts:out.window_start_ts,window_end_ts:out.window_end_ts,buy_quote:buy,sell_quote:total-buy,trade_count:count,imbalance:total>0?(2*buy-total)/total:null}:null;}
   else{receipt.signed_full_window_valid=false;receipt.incomplete_reason='BOUNDED_TRADE_PAGE_WITHOUT_FULL_WINDOW_COUNTER_RECONCILIATION';}
  }
  out.Nansen={sourceHTTP:0,status:'DEFERRED_EXISTING_CAP_ZERO',metric:'ONCHAIN_EXCHANGE_DEPOSITS_WITHDRAWALS_NOT_TAKER_FLOW'};
  out.additional_specialists={status:'DECLARED_ROLES_NOT_ACCEPTED_AS_FLOW',sources:['DEPTH_RADAR','VYX','BYKARANTELI','COINLOBSTER','COINFUTY','TRADER_PRO'],reason:'No verified independent full-window signed-flow route from retained role declaration; no blind private/paid endpoint probe'};
 }
 out.status='ACTUAL_RESPONSES_RETAINED;ASSET_BINDING_AND_FULL_USEFUL_COVERAGE_OPEN';
}catch(e){out.status='QUALIFICATION_NOT_CLOSED';out.reason=/^[A-Z0-9_]+$/.test(e.message)?e.message:e.name;}
finally{
 out.http_budget=budget.summary();if(admitted)out.finalized_usage=await finalizeRunUsage(db,{reservationId:id,sourceRunId:process.env.GITHUB_RUN_ID,usage:db.usageSnapshot()});out.D1=db.usageSnapshot();if(out.D1.unknown_ops||out.D1.rows_read>reservation.rows_read||out.D1.rows_written>reservation.rows_written)out.status='D1_ENVELOPE_NOT_CLOSED';out.completed_ts=Date.now();await fs.writeFile(`${root}/${stage}-summary.json`,JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({status:out.status,stage,sourceHTTP:out.sourceHTTP,D1:out.D1,catalogs:out.catalogs?.map(c=>({venue:c.venue,market:c.market,status:c.status,candidates:c.unique_candidate_assets?.length,complete:c.pagination_complete})),sources:out.sources.map(r=>({name:r.name,status:r.status,http:r.http_status,bytes:r.bytes,rows:r.returned_rows,full_window:r.signed_full_window_valid}))}));
}
