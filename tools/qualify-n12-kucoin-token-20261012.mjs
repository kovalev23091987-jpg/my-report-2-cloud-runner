import fs from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import {loadDailyUsageAggregate,evaluateDailyReservationBudget,evaluateWithinRunReservation,reserveRunBudget,finalizeRunUsage} from '../runner/d1-preaction-budget-guard.mjs';
import {createUnifiedHttpBudget} from '../current-generation/files/src/unified-budget.mjs';
import {reserveEvidenceSourceAttempts,readEvidenceSourceCache,writeEvidenceSourceCache} from '../current-generation/files/src/evidence-source-store.mjs';
import {reserveProviderMinuteUnits} from '../current-generation/files/src/provider-minute-ledger.mjs';
import {n05SourceHasHeadroom} from '../current-generation/files/src/n05-source-headroom.mjs';
import {parseN12PublicTradeJson} from '../current-generation/files/src/n12-native-public-trade-sample.mjs';

const root='audit-output/n12-kucoin-token',source='N12_OFFICIAL_TRADES:KUCOIN',venue='KUCOIN',base='PEPE',contract='PEPE-USDT',expectedChain='eth',expectedAddress='0x6982508145454ce325ddbe47a25d4ec3d2311933',limit=16;
const hash=x=>createHash('sha256').update(x).digest('hex'),db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),reservation={rows_read:7000,rows_written:100},id=`N12_KUCOIN_TOKEN:${process.env.GITHUB_RUN_ID}:${process.env.GITHUB_RUN_ATTEMPT}`,budget=createUnifiedHttpBudget(),started=Date.now();
const out={schema:'N12_KUCOIN_PEPE_TOKEN_SAVED_ACTUAL_20261012_V1',run:process.env.GITHUB_RUN_ID,head:process.env.GITHUB_SHA,contract,started_ts:started,status:'NOT_STARTED',sourceHTTP:0,D1:null,Telegram:0,MAIN:0,score:0,entry_authorized:false,source_catalog_only_is_not_coverage:true,receipts:[]};
await fs.mkdir(root,{recursive:true});let admitted=false;
async function get(name,url,units){
 const receipt={name,url,status:'NOT_ATTEMPTED',actual_http:0};out.receipts.push(receipt);
 try{
  if(!evaluateWithinRunReservation({reservation,currentUsage:db.usageSnapshot(),extraRowsRead:500,extraRowsWritten:22}).allowed)throw Error('D1_HEADROOM_DENIED');
  if(await readEvidenceSourceCache(db,{source:'N12_PROVIDER_BACKOFF:KUCOIN',asset_key:'SHARED',now:Date.now()}))throw Error('DURABLE_PROVIDER_BACKOFF');
  if(!await n05SourceHasHeadroom(db,source,limit,Date.now()))throw Error('SOURCE_DAILY_CAP_DENIED');
  if(out.sourceHTTP>=5)throw Error('FIVE_REQUEST_PROBE_CAP');
  const requestId=id+':'+name,grant=budget.reserve({logical_request_id:requestId,lane:'background',attempts:1});if(!grant.allowed||grant.duplicate)throw Error('WHOLE_JOB_HTTP_DENIED');
  const daily=await reserveEvidenceSourceAttempts(db,{source,reservation_id:requestId,attempts:1,daily_cap:limit,now:Date.now()});if(!daily.allowed)throw Error('SOURCE_DAILY_CAP_DENIED');
  const minute=await reserveProviderMinuteUnits(db,{provider:venue,reservation_id:requestId,units,cap:20,now:Date.now()});if(!minute.allowed)throw Error('PROVIDER_MINUTE_CAP_DENIED');
  receipt.actual_http=1;out.sourceHTTP++;
  const response=await fetch(url,{headers:{accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(12000)});receipt.http_status=response.status;receipt.retry_after=response.headers.get('retry-after');const chunks=[];let size=0;
  for await(const chunk of response.body){size+=chunk.length;if(size>8*1024*1024)throw Error('BODY_LIMIT');chunks.push(chunk);}
  const bytes=Buffer.concat(chunks);receipt.received_ts=Date.now();receipt.body_sha256=hash(bytes);receipt.bytes=bytes.length;receipt.file=name+'.json.gz';await fs.writeFile(root+'/'+receipt.file,gzipSync(bytes));
  if([401,403,429,451].includes(response.status)){const wait=/^\d+$/.test(receipt.retry_after||'')?Number(receipt.retry_after):0;await writeEvidenceSourceCache(db,{source:'N12_PROVIDER_BACKOFF:KUCOIN',asset_key:'SHARED',observed_ts:receipt.received_ts,expires_ts:receipt.received_ts+Math.max(900000,wait*1000),payload:{http_status:response.status,source_ts:receipt.received_ts}});}
  if(response.status!==200){receipt.status='HTTP_'+response.status;return null;}
  const payload=parseN12PublicTradeJson(bytes.toString('utf8'),{venue});if(payload?.code!=='200000'||!Array.isArray(payload.data)){receipt.status='INVALID_PROVIDER_SCHEMA';return null;}receipt.status='RECEIVED';return payload;
 }catch(error){receipt.status=/^[A-Z0-9_]+$/.test(error.message)?error.message:error.name;return null;}
}
const exactRows=(payload,key,value)=>payload?.data?.filter(row=>row?.[key]===value)||[];
const closeSample=(market,payload,multiplier,windowEnd,observed)=>{
 const rows=payload?.data||[],seen=new Set(),accepted=[];let rejected=0;
 for(const row of rows){const raw=market==='SPOT'?row.time:row.ts,id=String(row.tradeId??row.sequence??''),ts=typeof raw==='string'&&/^\d{19}$/.test(raw)?Number(BigInt(raw)/1000000n):null,price=Number(row.price),size=Number(row.size),quote=price*size*multiplier;
  if(!/^\d{1,32}$/.test(id)||seen.has(id)||!Number.isSafeInteger(ts)||ts<windowEnd-300000||ts>=windowEnd||ts>observed||!['buy','sell'].includes(row.side)||!(price>0&&size>0&&quote>0&&Number.isFinite(quote))){rejected++;continue;}seen.add(id);accepted.push({id,ts,side:row.side,quote});}
 const buy=accepted.filter(x=>x.side==='buy').reduce((v,x)=>v+x.quote,0),sell=accepted.filter(x=>x.side==='sell').reduce((v,x)=>v+x.quote,0);
 return{market,returned_rows:rows.length,valid_closed_five_minute_rows:accepted.length,rejected_rows:rejected,original_latest_trade_ts:accepted.length?Math.max(...accepted.map(x=>x.ts)):null,buy_quote_usdt:buy,sell_quote_usdt:sell,imbalance:buy+sell?(buy-sell)/(buy+sell):null,contract_multiplier:multiplier,window_end_ts:windowEnd,whole_window_coverage_proven:false,score:0};
};
try{
 const day=await loadDailyUsageAggregate(db,started),headroom=evaluateDailyReservationBudget({daily:day,nextReservation:reservation,maxDailyReads:3500000,maxDailyWrites:70000});out.daily_admission=headroom;if(!headroom.allowed)throw Error('D1_DAILY_ADMISSION_DENIED');await reserveRunBudget(db,{reservationId:id,now:started,reservation});admitted=true;
 const currency=await get('KUCOIN-CURRENCIES','https://api.kucoin.com/api/v3/currencies',3);if(!currency)throw Error('CURRENCIES_NOT_RECEIVED');const row=exactRows(currency,'currency',base);if(row.length!==1)throw Error('UNIQUE_CURRENCY_NOT_CLOSED');const chain=row[0].chains?.filter(x=>x.chainId===expectedChain&&String(x.contractAddress||'').toLowerCase()===expectedAddress);if(chain?.length!==1)throw Error('EXACT_CHAIN_ADDRESS_NOT_CLOSED');out.exact_token_binding=true;
 const spot=await get('KUCOIN-SPOT-CATALOG','https://api.kucoin.com/api/v2/symbols',4);if(!spot)throw Error('SPOT_CATALOG_NOT_RECEIVED');const spotRows=exactRows(spot,'symbol',contract);if(spotRows.length!==1||spotRows[0].baseCurrency!==base||spotRows[0].quoteCurrency!=='USDT'||spotRows[0].enableTrading!==true)throw Error('EXACT_SPOT_MARKET_NOT_OPEN');
 const future=await get('KUCOIN-FUTURES-CATALOG','https://api-futures.kucoin.com/api/v1/contracts/active',3);if(!future)throw Error('FUTURES_CATALOG_NOT_RECEIVED');const futureRows=exactRows(future,'symbol',base+'USDTM'),inst=futureRows[0],multiplier=Number(inst?.multiplier);if(futureRows.length!==1||inst.baseCurrency!==base||inst.quoteCurrency!=='USDT'||inst.settleCurrency!=='USDT'||inst.status!=='Open'||inst.marketStage!=='NORMAL'||!(multiplier>0))throw Error('EXACT_FUTURES_MARKET_NOT_OPEN');
 const spotTrades=await get('KUCOIN-SPOT-PEPE','https://api.kucoin.com/api/v1/market/histories?symbol=PEPE-USDT',3),spotObserved=out.receipts.at(-1)?.received_ts;if(!spotTrades)throw Error('SPOT_TRADES_NOT_RECEIVED');
 const futureTrades=await get('KUCOIN-FUTURES-PEPE','https://api-futures.kucoin.com/api/v1/trade/history?symbol=PEPEUSDTM',5),futureObserved=out.receipts.at(-1)?.received_ts;if(!futureTrades)throw Error('FUTURES_TRADES_NOT_RECEIVED');
 out.samples=[closeSample('SPOT',spotTrades,1,Math.floor(spotObserved/60000)*60000,spotObserved),closeSample('FUTURES',futureTrades,multiplier,Math.floor(futureObserved/60000)*60000,futureObserved)];out.status=out.samples.some(x=>x.valid_closed_five_minute_rows>0)?'EXACT_ORIGINAL_TOKEN_TRADE_DATA_USEFUL':'EXACT_TOKEN_TRADE_PAGES_NO_CLOSED_RECENT_SAMPLE';
}catch(error){out.status='NOT_CLOSED';out.reason=error.message;}
finally{out.http_budget=budget.summary();if(admitted)out.finalized_usage=await finalizeRunUsage(db,{reservationId:id,sourceRunId:process.env.GITHUB_RUN_ID,usage:db.usageSnapshot()});out.D1=db.usageSnapshot();out.completed_ts=Date.now();if(out.D1.unknown_ops||out.D1.rows_read>reservation.rows_read||out.D1.rows_written>reservation.rows_written)out.status='D1_ENVELOPE_NOT_CLOSED';await fs.writeFile(root+'/summary.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({status:out.status,reason:out.reason,sourceHTTP:out.sourceHTTP,samples:out.samples,D1:out.D1,receipts:out.receipts.map(({name,status,http_status,body_sha256,received_ts})=>({name,status,http_status,body_sha256,received_ts}))}));}
