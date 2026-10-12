import {MANIFEST_SHA256,TARGETS} from './hourly-archive.mjs';

const HOUR=3_600_000,DAY=24*HOUR,RETAIN=270*DAY,MAX_PAIR_SKEW_MS=10*60_000+30_000;
const MAX_DB_BYTES=400_000_000,MAX_RESPONSE_BYTES=2_000_000,MAX_PAYLOAD_BYTES=100_000;
const DAILY_HTTP_CAP=24;
export const FUTURES_QUOTE_URL='https://api.hbdm.com/linear-swap-ex/market/detail/batch_merged';
const encoder=new TextEncoder();
const finite=value=>value===null||value===undefined||value===''?null:Number.isFinite(Number(value))?Number(value):null;
const validPrice=value=>{const x=finite(value);return x!==null&&x>0?x:null;};
const sha=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
export const SPOT_SOURCES=Object.freeze({
  HTX:Object.freeze({url:'https://api.huobi.pro/market/tickers',identity_scope:'HTX_EXACT_PAIR_ONLY',target_contracts:TARGETS})
});

const symbolFor=contract=>`${contract.slice(0,-5).toLowerCase()}usdt`;

export function buildPairedFuturesQuotes({body,received_ts,spot_source_ts}){
  if(body?.status!=='ok'||!Array.isArray(body?.ticks)||body.ticks.length<1||body.ticks.length>1_000)throw Error('FUTURES_PAIR_RESPONSE_INVALID');
  const source_ts=Number(body.ts);
  if(!Number.isSafeInteger(source_ts)||source_ts>received_ts||received_ts-source_ts>60_000)throw Error('FUTURES_PAIR_CLOCK_INVALID');
  const wanted=new Set(TARGETS),seen=new Set(),samples=[];
  for(const row of body.ticks){
    const contract=String(row?.contract_code??'');
    if(!wanted.has(contract)||row.business_type!=='swap')continue;
    if(seen.has(contract))throw Error('FUTURES_PAIR_DUPLICATE_CONTRACT');
    seen.add(contract);
    const tick_ts=Number(row.ts),price=validPrice(row.close),bid=validPrice(row.bid?.[0]),ask=validPrice(row.ask?.[0]);
    const bounded=Number.isSafeInteger(tick_ts)&&tick_ts<=received_ts&&received_ts-tick_ts<=60_000&&Math.abs(tick_ts-spot_source_ts)<=MAX_PAIR_SKEW_MS&&price!==null&&bid!==null&&ask!==null&&bid<=ask&&(ask-bid)/((ask+bid)/2)<=.05;
    samples.push({contract,market:'HTX_LINEAR_PERPETUAL',price:bounded?price:null,bid:bounded?bid:null,ask:bounded?ask:null,source_ts:Number.isSafeInteger(tick_ts)?tick_ts:null,source_status:bounded?'BOUNDED_TICKER':'QUOTE_NOT_QUALIFIED',price_basis:'LAST_TICKER_NOT_CANDLE'});
  }
  if(!samples.length)throw Error('FUTURES_PAIR_NO_TARGET_CONTRACTS');
  const skew=Math.abs(source_ts-spot_source_ts);
  return{status:skew<=MAX_PAIR_SKEW_MS?'PAIRED_WITHIN_10M':'SOURCE_CLOCKS_NOT_ALIGNED',near_sync:skew<=30_000,source_url:FUTURES_QUOTE_URL,source_ts,received_ts,spot_futures_source_skew_ms:skew,target_count:TARGETS.length,present_count:samples.length,quote_checked_count:samples.filter(row=>row.source_status==='BOUNDED_TICKER').length,samples};
}

export async function buildSpotRecord({venue,hour_bucket,body,received_ts,futures_body=null,futures_received_ts=null,futures_error=null}) {
  const config=SPOT_SOURCES[venue];
  if (!config||!Number.isSafeInteger(hour_bucket)||hour_bucket%HOUR!==0||!Number.isSafeInteger(received_ts)||received_ts<hour_bucket||received_ts>hour_bucket+45*60_000) throw Error('SPOT_ARCHIVE_ARGUMENTS_INVALID');
  if (body?.status!=='ok') throw Error('HTX_SPOT_STATUS_INVALID');
  const rows=body?.data;
  if (!Array.isArray(rows)||rows.length<1||rows.length>10_000) throw Error('SPOT_ARCHIVE_ROWS_INVALID');
  const source_ts=Number(body?.ts);
  if (!Number.isSafeInteger(source_ts)||source_ts>received_ts||received_ts-source_ts>60_000) throw Error('SPOT_SOURCE_CLOCK_INVALID');
  const bySymbol=new Map();
  for (const row of rows) {
    const symbol=String(row?.symbol??'');
    if (!symbol) continue;
    if (bySymbol.has(symbol)) throw Error('SPOT_ARCHIVE_DUPLICATE_SYMBOL');
    bySymbol.set(symbol,row);
  }
  let checked=0;
  const samples=[];
  for (const contract of config.target_contracts) {
    const symbol=symbolFor(contract),row=bySymbol.get(symbol);
    if (!row) continue;
    const price=validPrice(row.close);
    const bid=validPrice(row.bid);
    const ask=validPrice(row.ask);
    const quoteVolume=validPrice(row.vol);
    const bounded=price!==null&&bid!==null&&ask!==null&&bid<=ask&&(ask-bid)/((ask+bid)/2)<=0.05&&quoteVolume!==null;
    if (bounded) checked++;
    samples.push({contract,pair:symbol,venue,market:'SPOT',price,price_basis:'LAST_TICKER_NOT_CANDLE',bid,ask,quote_volume_24h:quoteVolume,source_status:bounded?'BOUNDED_TICKER':'QUOTE_NOT_QUALIFIED',source_ts,individual_trade_clock_verified:false,asset_identity_status:'EXACT_HTX_SPOT_PAIR'});
  }
  if (!samples.length) throw Error('SPOT_ARCHIVE_NO_TARGET_PAIRS');
  let paired_futures=null,pair_status='FUTURES_PAIR_UNAVAILABLE';
  if(futures_body){try{paired_futures=buildPairedFuturesQuotes({body:futures_body,received_ts:futures_received_ts,spot_source_ts:source_ts});pair_status=paired_futures.status;}catch(error){pair_status=String(error?.message??error).slice(0,80);}}
  else if(futures_error)pair_status=String(futures_error).slice(0,80);
  const payload=JSON.stringify({schema:'report2-hourly-spot-archive-v1',venue,source_url:config.url,source_ts,received_ts,source_clock_policy:'BATCH_RESPONSE_ONLY',identity_scope:config.identity_scope,samples,paired_futures,pair_status});
  if (encoder.encode(payload).length>MAX_PAYLOAD_BYTES) throw Error('SPOT_ARCHIVE_PAYLOAD_TOO_LARGE');
  return {hour_bucket,venue,source_url:config.url,source_ts,received_ts,identity_scope:config.identity_scope,target_count:config.target_contracts.length,present_count:samples.length,quote_checked_count:checked,paired_futures_count:paired_futures?.quote_checked_count??0,pair_status,payload_sha256:await sha(payload),payload_json:payload};
}

export async function archiveSpot({venue,archive_db,scheduled_ts=Date.now(),fetch_impl=globalThis.fetch,clock=Date.now}) {
  const config=SPOT_SOURCES[venue];
  if (!config||!archive_db||typeof fetch_impl!=='function') throw Error('SPOT_ARCHIVE_BINDINGS_REQUIRED');
  const hour_bucket=Math.floor(scheduled_ts/HOUR)*HOUR;
  const existing=await archive_db.prepare('SELECT payload_sha256 FROM report2_hourly_spot_archive_v1 WHERE hour_bucket=?1 AND venue=?2').bind(hour_bucket,venue).first();
  if (existing) return {status:'ALREADY_ARCHIVED',hour_bucket,venue,source_http:0};
  await archive_db.prepare('DELETE FROM report2_spot_archive_attempt_v1 WHERE rowid IN (SELECT rowid FROM report2_spot_archive_attempt_v1 WHERE hour_bucket<?1 ORDER BY hour_bucket LIMIT 8)').bind(hour_bucket-RETAIN).run();
  await archive_db.prepare('DELETE FROM report2_hourly_spot_archive_v1 WHERE rowid IN (SELECT rowid FROM report2_hourly_spot_archive_v1 WHERE hour_bucket<?1 ORDER BY hour_bucket LIMIT 8)').bind(hour_bucket-RETAIN).run();
  const size=await archive_db.prepare('SELECT 1 AS probe').all();
  const dbBytes=Number(size?.meta?.size_after);
  if (!Number.isSafeInteger(dbBytes)||dbBytes<0||dbBytes+MAX_PAYLOAD_BYTES*2>MAX_DB_BYTES) return {status:'FREE_STORAGE_GUARD',hour_bucket,venue,source_http:0,db_bytes:Number.isFinite(dbBytes)?dbBytes:null};
  const day=Math.floor(hour_bucket/DAY)*DAY;
  const daily=await archive_db.prepare('SELECT COUNT(*) AS attempts FROM report2_spot_archive_attempt_v1 WHERE hour_bucket>=?1 AND hour_bucket<?2').bind(day,day+DAY).first();
  if (Number(daily?.attempts??0)>=DAILY_HTTP_CAP) return {status:'SOURCE_DAILY_CAP',hour_bucket,venue,source_http:0};
  const claim=await archive_db.prepare("INSERT INTO report2_spot_archive_attempt_v1(hour_bucket,venue,claimed_ts,status) VALUES(?1,?2,?3,'CLAIMED') ON CONFLICT(hour_bucket,venue) DO NOTHING").bind(hour_bucket,venue,clock()).run();
  if (Number(claim?.meta?.changes??0)!==1) return {status:'ALREADY_ATTEMPTED',hour_bucket,venue,source_http:0};
  try {
    const request=async(url)=>{const response=await fetch_impl(url,{headers:{accept:'application/json','user-agent':'My-Report-2-Free-History/1.0'},signal:AbortSignal.timeout(20_000)});if(!response.ok)throw Error(`ARCHIVE_HTTP_${response.status}`);const raw=await response.arrayBuffer();if(raw.byteLength>MAX_RESPONSE_BYTES)throw Error('ARCHIVE_RESPONSE_TOO_LARGE');return{body:JSON.parse(new TextDecoder().decode(raw)),received_ts:clock()};};
    const [spotResult,futuresResult]=await Promise.allSettled([request(config.url),request(FUTURES_QUOTE_URL)]);
    if(spotResult.status!=='fulfilled')throw spotResult.reason;
    const record=await buildSpotRecord({venue,hour_bucket,body:spotResult.value.body,received_ts:spotResult.value.received_ts,futures_body:futuresResult.status==='fulfilled'?futuresResult.value.body:null,futures_received_ts:futuresResult.status==='fulfilled'?futuresResult.value.received_ts:null,futures_error:futuresResult.status==='rejected'?futuresResult.reason?.message??'FUTURES_FETCH_FAILED':null});
    const inserted=await archive_db.prepare('INSERT INTO report2_hourly_spot_archive_v1(hour_bucket,venue,source_url,source_ts,received_ts,identity_scope,target_count,present_count,quote_checked_count,payload_sha256,payload_json,created_ts) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12) ON CONFLICT(hour_bucket,venue) DO NOTHING').bind(record.hour_bucket,record.venue,record.source_url,record.source_ts,record.received_ts,record.identity_scope,record.target_count,record.present_count,record.quote_checked_count,record.payload_sha256,record.payload_json,clock()).run();
    const stored=await archive_db.prepare('SELECT payload_sha256 FROM report2_hourly_spot_archive_v1 WHERE hour_bucket=?1 AND venue=?2').bind(hour_bucket,venue).first();
    if (stored?.payload_sha256!==record.payload_sha256) throw Error('SPOT_ARCHIVE_IMMUTABLE_READBACK_FAILED');
    await archive_db.prepare("UPDATE report2_spot_archive_attempt_v1 SET status='CLOSED' WHERE hour_bucket=?1 AND venue=?2").bind(hour_bucket,venue).run();
    return {status:record.pair_status==='PAIRED_WITHIN_10M'?'ARCHIVED':'PAIR_PARTIAL',venue,hour_bucket,present_count:record.present_count,quote_checked_count:record.quote_checked_count,paired_futures_count:record.paired_futures_count,pair_status:record.pair_status,source_http:2,db_bytes:Number(inserted?.meta?.size_after??dbBytes),identity_scope:record.identity_scope};
  } catch(error) {
    await archive_db.prepare("UPDATE report2_spot_archive_attempt_v1 SET status='ERROR' WHERE hour_bucket=?1 AND venue=?2").bind(hour_bucket,venue).run();
    throw error;
  }
}
