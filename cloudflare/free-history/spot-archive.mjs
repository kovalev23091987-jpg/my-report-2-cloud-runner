import {MANIFEST_SHA256,TARGETS} from './hourly-archive.mjs';

const HOUR=3_600_000,DAY=24*HOUR,RETAIN=270*DAY;
const MAX_DB_BYTES=400_000_000,MAX_RESPONSE_BYTES=2_000_000,MAX_PAYLOAD_BYTES=100_000;
const DAILY_HTTP_CAP=60;
const encoder=new TextEncoder();
const finite=value=>value===null||value===undefined||value===''?null:Number.isFinite(Number(value))?Number(value):null;
const validPrice=value=>{const x=finite(value);return x!==null&&x>0?x:null;};
const sha=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
export const SPOT_SOURCES=Object.freeze({
  HTX:Object.freeze({url:'https://api.huobi.pro/market/tickers',identity_scope:'HTX_EXACT_PAIR_ONLY',target_contracts:TARGETS}),
  GATE:Object.freeze({url:'https://api.gateio.ws/api/v4/spot/tickers',identity_scope:'GATE_PAIR_CANDIDATE_UNBOUND',target_contracts:TARGETS}),
  KUCOIN:Object.freeze({url:'https://api.kucoin.com/api/v1/market/stats?symbol=RAVE-USDT',identity_scope:'KUCOIN_RAVE_PAIR_CANDIDATE_UNBOUND',target_contracts:Object.freeze(['RAVE-USDT'])})
});

const symbolFor=(venue,contract)=>{
  const base=contract.slice(0,-5);
  return venue==='HTX'?`${base.toLowerCase()}usdt`:venue==='KUCOIN'?`${base}-USDT`:`${base}_USDT`;
};

export async function buildSpotRecord({venue,hour_bucket,body,received_ts}) {
  const config=SPOT_SOURCES[venue];
  if (!config||!Number.isSafeInteger(hour_bucket)||hour_bucket%HOUR!==0||!Number.isSafeInteger(received_ts)||received_ts<hour_bucket||received_ts>hour_bucket+45*60_000) throw Error('SPOT_ARCHIVE_ARGUMENTS_INVALID');
  if (venue==='HTX'&&body?.status!=='ok') throw Error('HTX_SPOT_STATUS_INVALID');
  if (venue==='KUCOIN'&&body?.code!=='200000') throw Error('KUCOIN_SPOT_STATUS_INVALID');
  const rows=venue==='HTX'?body?.data:venue==='KUCOIN'?[body?.data]:body;
  if (!Array.isArray(rows)||rows.length<1||rows.length>10_000) throw Error('SPOT_ARCHIVE_ROWS_INVALID');
  const source_ts=venue==='HTX'?Number(body?.ts):venue==='KUCOIN'?Number(body?.data?.time):null;
  if (venue!=='GATE'&&(!Number.isSafeInteger(source_ts)||source_ts>received_ts||received_ts-source_ts>60_000)) throw Error('SPOT_SOURCE_CLOCK_INVALID');
  const bySymbol=new Map();
  for (const row of rows) {
    const symbol=String(venue==='GATE'?row?.currency_pair:row?.symbol??'');
    if (!symbol) continue;
    if (bySymbol.has(symbol)) throw Error('SPOT_ARCHIVE_DUPLICATE_SYMBOL');
    bySymbol.set(symbol,row);
  }
  let checked=0;
  const samples=[];
  for (const contract of config.target_contracts) {
    const symbol=symbolFor(venue,contract),row=bySymbol.get(symbol);
    if (!row) continue;
    const price=validPrice(venue==='HTX'?row.close:row.last);
    const bid=validPrice(venue==='HTX'?row.bid:venue==='GATE'?row.highest_bid:row.buy);
    const ask=validPrice(venue==='HTX'?row.ask:venue==='GATE'?row.lowest_ask:row.sell);
    const quoteVolume=validPrice(venue==='HTX'?row.vol:venue==='GATE'?row.quote_volume:row.volValue);
    const ticker_ts=venue==='KUCOIN'?Number(row.time):null;
    const clockGood=venue!=='KUCOIN'||Number.isSafeInteger(ticker_ts)&&ticker_ts<=source_ts&&source_ts-ticker_ts<=60_000;
    const priceConflict=venue==='GATE'&&contract==='RAVE-USDT';
    const bounded=!priceConflict&&clockGood&&price!==null&&bid!==null&&ask!==null&&bid<=ask&&(ask-bid)/((ask+bid)/2)<=0.05&&quoteVolume!==null;
    if (bounded) checked++;
    samples.push({contract,pair:symbol,venue,market:'SPOT',price:price,price_basis:'LAST_TICKER_NOT_CANDLE',bid,ask,quote_volume_24h:quoteVolume,source_status:priceConflict?'CROSS_VENUE_PRICE_CONFLICT':bounded?'BOUNDED_TICKER':'QUOTE_NOT_QUALIFIED',source_ts:ticker_ts??source_ts,individual_trade_clock_verified:false,asset_identity_status:venue==='HTX'?'EXACT_HTX_SPOT_PAIR':priceConflict?'EXTERNAL_PAIR_PRICE_CONFLICT':'EXTERNAL_PAIR_IDENTITY_UNVERIFIED'});
  }
  if (!samples.length) throw Error('SPOT_ARCHIVE_NO_TARGET_PAIRS');
  const payload=JSON.stringify({schema:'report2-hourly-spot-archive-v1',venue,source_url:config.url,source_ts,received_ts,source_clock_policy:venue==='HTX'?'BATCH_RESPONSE_ONLY':venue==='KUCOIN'?'MARKET_STATS_EXCHANGE_TIME':'RECEIPT_ONLY_NO_EXCHANGE_CLOCK',identity_scope:config.identity_scope,samples});
  if (encoder.encode(payload).length>MAX_PAYLOAD_BYTES) throw Error('SPOT_ARCHIVE_PAYLOAD_TOO_LARGE');
  return {hour_bucket,venue,source_url:config.url,source_ts,received_ts,identity_scope:config.identity_scope,target_count:config.target_contracts.length,present_count:samples.length,quote_checked_count:checked,payload_sha256:await sha(payload),payload_json:payload};
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
    const response=await fetch_impl(config.url,{headers:{accept:'application/json','user-agent':'My-Report-2-Free-History/1.0'},signal:AbortSignal.timeout(20_000)});
    if (!response.ok) throw Error(`SPOT_ARCHIVE_HTTP_${response.status}`);
    const raw=await response.arrayBuffer();
    if (raw.byteLength>MAX_RESPONSE_BYTES) throw Error('SPOT_ARCHIVE_RESPONSE_TOO_LARGE');
    const received_ts=clock();
    const body=JSON.parse(new TextDecoder().decode(raw));
    const record=await buildSpotRecord({venue,hour_bucket,body,received_ts});
    const inserted=await archive_db.prepare('INSERT INTO report2_hourly_spot_archive_v1(hour_bucket,venue,source_url,source_ts,received_ts,identity_scope,target_count,present_count,quote_checked_count,payload_sha256,payload_json,created_ts) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12) ON CONFLICT(hour_bucket,venue) DO NOTHING').bind(record.hour_bucket,record.venue,record.source_url,record.source_ts,record.received_ts,record.identity_scope,record.target_count,record.present_count,record.quote_checked_count,record.payload_sha256,record.payload_json,clock()).run();
    const stored=await archive_db.prepare('SELECT payload_sha256 FROM report2_hourly_spot_archive_v1 WHERE hour_bucket=?1 AND venue=?2').bind(hour_bucket,venue).first();
    if (stored?.payload_sha256!==record.payload_sha256) throw Error('SPOT_ARCHIVE_IMMUTABLE_READBACK_FAILED');
    await archive_db.prepare("UPDATE report2_spot_archive_attempt_v1 SET status='CLOSED' WHERE hour_bucket=?1 AND venue=?2").bind(hour_bucket,venue).run();
    return {status:'ARCHIVED',venue,hour_bucket,present_count:record.present_count,quote_checked_count:record.quote_checked_count,source_http:1,db_bytes:Number(inserted?.meta?.size_after??dbBytes),identity_scope:record.identity_scope};
  } catch(error) {
    await archive_db.prepare("UPDATE report2_spot_archive_attempt_v1 SET status='ERROR' WHERE hour_bucket=?1 AND venue=?2").bind(hour_bucket,venue).run();
    throw error;
  }
}
