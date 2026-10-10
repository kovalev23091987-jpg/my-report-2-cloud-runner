import fs from 'node:fs/promises';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import {loadDailyUsageAggregate,evaluateDailyReservationBudget,evaluateWithinRunReservation,reserveRunBudget,finalizeRunUsage} from '../runner/d1-preaction-budget-guard.mjs';
import {createUnifiedHttpBudget} from '../current-generation/files/src/unified-budget.mjs';
import {reserveEvidenceSourceAttempts,readEvidenceSourceCache,writeEvidenceSourceCache} from '../current-generation/files/src/evidence-source-store.mjs';
import {reserveProviderMinuteUnits} from '../current-generation/files/src/provider-minute-ledger.mjs';
// Runtime pagination tests must pass before provider attempts.
const stage='native',root='audit-output/n05-native',hash=b=>createHash('sha256').update(b).digest('hex');
const universe=JSON.parse(gunzipSync(await fs.readFile('checkpoints/htx-all-modes-crypto-futures-universe-20261004.json.gz')));if(universe.assets.length!==102)throw Error('EXACT_UNIVERSE_REQUIRED');
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),now=Date.now(),id=`N05_QUALIFICATION:${process.env.GITHUB_RUN_ID}:${stage}:${process.env.GITHUB_RUN_ATTEMPT}`,reservation={rows_read:16000,rows_written:500},budget=createUnifiedHttpBudget(),blocked=new Set();
const out={schema:'N05_ACTUAL_SPOT_FUTURES_QUALIFICATION_V1',stage,run:process.env.GITHUB_RUN_ID,head:process.env.GITHUB_SHA,started_ts:now,approved_assets:102,minimum_useful_assets:31,coverage_is_not_listing:true,sourceHTTP:0,sources:[],MAIN:0,Telegram:0,score_adjustment:0,production_enabled:false,new_fresh_SENT:false,project_complete:false};
await fs.mkdir(root,{recursive:true});let admitted=false;
async function get(name,venue,url,{method='GET',body=null,source=null,daily_cap=null}={}){
 const receipt={name,venue,url,method,received_ts:null,http_status:null,status:'NOT_ATTEMPTED',sourceHTTP:0,source_ts:null,retrieval_is_not_event_time:true};out.sources.push(receipt);
 if(['BITGET','GATE','BINANCE'].includes(venue)){const recent=out.sources.filter(r=>r.venue===venue&&r.sourceHTTP===1&&Date.now()-r.received_ts<60000);if(recent.length>=(venue==='GATE'?4:6)){const delay=Math.max(1,60050-(Date.now()-recent[0].received_ts));console.log(JSON.stringify({type:'PROVIDER_PACING',venue,delay_ms:delay}));await new Promise(r=>setTimeout(r,delay));}}
 const key=source||`N05_OFFICIAL_FLOW:${venue}`,cap=daily_cap??16;
 if(blocked.has(venue)){receipt.status='SHARED_VENUE_BACKOFF';return null;}
 try{
  if(!evaluateWithinRunReservation({reservation,currentUsage:db.usageSnapshot(),extraRowsRead:500,extraRowsWritten:22}).allowed)throw Error('D1_HEADROOM_DENIED');
  const old=await readEvidenceSourceCache(db,{source:`N05_PROVIDER_BACKOFF:${venue}`,asset_key:'SHARED',now:Date.now()});if(old){receipt.status='DURABLE_VENUE_BACKOFF';blocked.add(venue);return null;}
  const whole=budget.reserve({logical_request_id:id+':'+name,lane:'background',attempts:1});receipt.whole_admission=whole;if(!whole.allowed||whole.duplicate)throw Error('WHOLE_JOB_HTTP_DENIED');
  const daily=await reserveEvidenceSourceAttempts(db,{source:key,reservation_id:id+':'+name,attempts:1,daily_cap:cap,now:Date.now()});receipt.daily_admission=daily;if(!daily.allowed)throw Error('SOURCE_DAILY_CAP_DENIED');
  const minute=await reserveProviderMinuteUnits(db,{provider:venue,reservation_id:id+':'+name,units:1,cap:venue==='GATE'?4:6,now:Date.now()});receipt.minute_admission=minute;if(!minute.allowed)throw Error('PROVIDER_MINUTE_CAP_DENIED');
  out.sourceHTTP++;receipt.sourceHTTP=1;
  const r=await fetch(url,{method,body:body?JSON.stringify(body):undefined,headers:{accept:'application/json',...(body?{'content-type':'application/json'}:{})},redirect:'manual',signal:AbortSignal.timeout(15000)});
  receipt.http_status=r.status;receipt.retry_after=r.headers.get('retry-after');const chunks=[];let n=0;for await(const chunk of r.body){n+=chunk.length;if(n>8*1024*1024)throw Error('BODY_LIMIT');chunks.push(chunk);}const bytes=Buffer.concat(chunks),gz=gzipSync(bytes);receipt.received_ts=Date.now();receipt.body_sha256=hash(bytes);receipt.gzip_sha256=hash(gz);receipt.bytes=bytes.length;receipt.file=name+'.json.gz';await fs.writeFile(root+'/'+receipt.file,gz);
  if([401,403,429,451].includes(r.status)){blocked.add(venue);const seconds=/^\d+$/.test(receipt.retry_after||'')?Number(receipt.retry_after):0;await writeEvidenceSourceCache(db,{source:`N05_PROVIDER_BACKOFF:${venue}`,asset_key:'SHARED',observed_ts:receipt.received_ts,expires_ts:receipt.received_ts+Math.max(900000,seconds*1000),payload:{http_status:r.status,original_received_ts:receipt.received_ts}});}
  if(r.status!==200){receipt.status=`HTTP_${r.status}`;return null;}
  let p;try{p=JSON.parse(bytes);}catch{receipt.status='INVALID_JSON';return null;}
  receipt.status='RECEIVED_NOT_QUALIFIED';return p;
 }catch(e){receipt.status=/^[A-Z0-9_]+$/.test(e.message)?e.message:e.name;receipt.received_ts??=Date.now();return null;}
}


import {normalizeHtxAssetReferences} from '../current-generation/files/src/htx-asset-identity.mjs';
import {reconcileBitgetFlow} from '../current-generation/files/src/bitget-four-hour-flow.mjs';
const retained='checkpoints/n05-actual-qualification-38049404414';
const saved=async n=>JSON.parse(gunzipSync(await fs.readFile(retained+'/'+n+'.json.gz')));
const chainOf=c=>({ETH:'ethereum',ERC20:'ethereum',SOL:'solana',BSC:'bsc',BEP20:'bsc',ARBITRUM:'arbitrum',ARBITRUMONE:'arbitrum',BASE:'base',OP:'optimism',OPTIMISM:'optimism',MATIC:'polygon',POLYGON:'polygon',AVAX_C:'avalanche'})[c]||null;
try{
 out.daily_admission=evaluateDailyReservationBudget({daily:await loadDailyUsageAggregate(db,now),nextReservation:reservation,maxDailyReads:3500000,maxDailyWrites:70000});if(!out.daily_admission.allowed)throw Error('D1_DAILY_ADMISSION_DENIED');await reserveRunBudget(db,{reservationId:id,now,reservation});admitted=true;
 const htx=normalizeHtxAssetReferences(await saved('identity-HTX')),gateSpot=await saved('catalog-GATE-SPOT'),gateFuture=await saved('catalog-GATE-FUTURES');
 out.window_end_ts=Math.floor(Date.now()/60000)*60000;const end=out.window_end_ts,start=end-14400000;
 const catalog=await get('BINANCE-SMALL-CATALOG','BINANCE','https://data-api.binance.vision/api/v3/exchangeInfo?showPermissionSets=false&symbolStatus=TRADING&permissions=SPOT');
 out.binance_catalog_candidates=(catalog?.symbols||[]).filter(r=>r.status==='TRADING'&&r.quoteAsset==='USDT'&&universe.assets.some(a=>a.symbol===r.baseAsset)).map(r=>r.baseAsset);
 out.binance_native_market_windows=[];
 const natives=universe.assets.filter(a=>htx.entries[a.symbol]?.status==='CLOSED'&&htx.entries[a.symbol].identities[0]?.asset_kind==='NATIVE'&&out.binance_catalog_candidates.includes(a.symbol)).slice(0,3);
 for(const a of natives){
  const p=await get('BINANCE-'+a.symbol+'-NATIVE-240','BINANCE',`https://data-api.binance.vision/api/v3/klines?symbol=${a.symbol}USDT&interval=1m&startTime=${start}&endTime=${end-1}&limit=240`);
  const result={base:a.symbol,market:'SPOT',window_start_ts:start,window_end_ts:end,HTX_identity:htx.entries[a.symbol].identities[0],external_identity_scope:'MARKET_SYMBOL_ONLY_NOT_YET_ELIGIBLE',score_contribution:0};
  if(Array.isArray(p)&&p.length===240&&p.every((r,i)=>Array.isArray(r)&&r.length===12&&r[0]===start+i*60000&&r[6]===r[0]+59999&&Number.isInteger(r[8])&&r[8]>=0&&[5,7,9,10].every(j=>/^\d+(\.\d+)?$/.test(r[j]))&&Number(r[10])<=Number(r[7])&&Number(r[9])<=Number(r[5]))){result.native_240_minute_grid=true;result.status='COMPLETE_NATIVE_TAKER_CANDLES;ASSET_BINDING_OPEN';result.trade_count=p.reduce((n,r)=>n+r[8],0);result.buy_quote=p.reduce((n,r)=>n+Number(r[10]),0);result.sell_quote=p.reduce((n,r)=>n+Number(r[7])-Number(r[10]),0);result.imbalance=(result.buy_quote-result.sell_quote)/(result.buy_quote+result.sell_quote);result.large_individual_trades_not_available=true;}else{result.status='NOT_CLOSED';result.returned_rows=Array.isArray(p)?p.length:null;}
  out.binance_native_market_windows.push(result);
 }
 const currencies=await get('GATE-ALL-CURRENCY-IDENTITY','GATE','https://api.gateio.ws/api/v4/spot/currencies',{source:'GATE_ASSET_REFERENCE',daily_cap:8});
 out.gate_exact_token_bindings=[];
 if(Array.isArray(currencies))for(const a of universe.assets){const h=htx.entries[a.symbol],s=gateSpot.find(r=>r.base===a.symbol&&r.quote==='USDT'&&r.trade_status==='tradable'),f=gateFuture.find(r=>r.name===a.symbol+'_USDT'&&r.in_delisting===false);if(h?.status!=='CLOSED'||h.identities[0]?.asset_kind==='NATIVE'||!s||!f)continue;const identity=h.identities[0],rows=currencies.filter(r=>r.currency===a.symbol&&!r.delisted&&!r.trade_disabled);if(rows.length!==1)continue;const matches=(rows[0].chains||[]).filter(c=>chainOf(c.name)===identity.chain&&typeof c.addr==='string'&&(identity.chain==='solana'?c.addr===identity.contract_or_mint:c.addr.toLowerCase()===identity.contract_or_mint.toLowerCase()));if(matches.length===1)out.gate_exact_token_bindings.push({base:a.symbol,identity,spot:s.id,future:f.name});}
 const tickers=await get('GATE-SPOT-TURNOVER','GATE','https://api.gateio.ws/api/v4/spot/tickers');
 const selected=out.gate_exact_token_bindings.map(b=>({...b,turnover:tickers?.find(r=>r.currency_pair===b.spot)?.quote_volume})).filter(b=>Number(b.turnover)>0).sort((a,b)=>Number(a.turnover)-Number(b.turnover)).slice(0,2);out.gate_selected=selected;out.gate_windows=[];
 for(const e of selected){
  const url=`https://api.gateio.ws/api/v4/spot/`,query=`currency_pair=${e.spot}&from=${start/1000}&to=${end/1000-1}`;
  const c=await get('GATE-'+e.base+'-CANDLES','GATE',url+'candlesticks?'+query+'&interval=1m');
  const candles=Array.isArray(c)?{code:'00000',data:c.map(r=>[String(Number(r[0])*1000),r[5],r[3],r[4],r[2],r[6],r[1],r[1]])}:null,pages=[];
  let result={status:'NATIVE_CANDLES_NOT_RECEIVED',check_completed:false};
  for(let page=1;c&&page<=3;page++){
   const raw=await get('GATE-'+e.base+'-PAGE-'+page,'GATE',url+'trades?'+query+'&limit=1000&page='+page);if(!Array.isArray(raw))break;
   if(raw.some(r=>r.currency_pair!==e.spot||r.trade_quote&&r.trade_quote!=='USDT')){result={status:'FOREIGN_OR_UNIFIED_QUOTE_NOT_CLOSED',check_completed:false};break;}
   pages.push({code:'00000',data:raw.map(r=>({tradeId:String(r.id),ts:String(Math.floor(Number(r.create_time_ms))),symbol:e.base+'USDT',side:r.side,size:r.amount,price:r.price}))});
   result=reconcileBitgetFlow({contract:e.base+'-USDT',market:'SPOT',pages,candles,window_end_ts:end,observed_ts:Date.now()});if(result.check_completed||raw.length<1000)break;
  }
  out.gate_windows.push({...result,venue:'GATE',normalization:'GATE_SPOT_NATIVE_MINUTE_AND_PUBLIC_TRADES_TO_EXACT_DECIMAL_RECONCILER',identity:e.identity,exact_asset_binding:true,side_semantics_cross_channel_documented:true,REST_taker_semantics_requires_final_primary_contract_confirmation:true,production_eligible:false});
 }
 out.identity_bindings_are_not_complete_flow_coverage=true;out.native_aggregate_does_not_identify_large_individual_trades=true;out.status='BOUNDED_NATIVE_WINDOW_QUALIFICATION_RETAINED';
}catch(e){out.status='QUALIFICATION_NOT_CLOSED';out.reason=e.message;}
finally{
 out.http_budget=budget.summary();if(admitted)out.finalized_usage=await finalizeRunUsage(db,{reservationId:id,sourceRunId:process.env.GITHUB_RUN_ID,usage:db.usageSnapshot()});out.D1=db.usageSnapshot();if(out.D1.unknown_ops||out.D1.rows_read>reservation.rows_read||out.D1.rows_written>reservation.rows_written)out.status='D1_ENVELOPE_NOT_CLOSED';out.completed_ts=Date.now();await fs.writeFile(root+'/native-summary.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({status:out.status,sourceHTTP:out.sourceHTTP,D1:out.D1,binance_catalog_candidates:out.binance_catalog_candidates?.length,binance_native_market_windows:out.binance_native_market_windows,gate_exact_token_bindings:out.gate_exact_token_bindings?.length,gate_selected:out.gate_selected,gate_windows:out.gate_windows,sources:out.sources.map(r=>({name:r.name,status:r.status,http:r.http_status,bytes:r.bytes}))}));
}
