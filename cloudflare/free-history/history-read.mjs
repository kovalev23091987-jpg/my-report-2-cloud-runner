import {MANIFEST_SHA256,TARGETS} from './hourly-archive.mjs';

const HOUR=3_600_000;
const encoder=new TextEncoder();
const digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(text))),b=>b.toString(16).padStart(2,'0')).join('');

// An explicit bounded read for future N15 analysis. No report or Telegram side effect.
export async function readHourlyHistory({archive_db,contract,market,venue='HTX',from_hour,to_hour}={}) {
  if(!archive_db||!TARGETS.includes(contract)||!['SPOT','FUTURES'].includes(market)||venue!=='HTX'||!Number.isSafeInteger(from_hour)||!Number.isSafeInteger(to_hour)||from_hour%HOUR||to_hour%HOUR||to_hour<from_hour||to_hour-from_hour>7*24*HOUR) throw Error('HISTORY_READ_ARGUMENTS_INVALID');
  const futures=market==='FUTURES';
  const sql=futures?'SELECT * FROM report2_hourly_market_archive_v1 WHERE hour_bucket BETWEEN ?1 AND ?2 ORDER BY hour_bucket':'SELECT * FROM report2_hourly_spot_archive_v1 WHERE venue=?1 AND hour_bucket BETWEEN ?2 AND ?3 ORDER BY hour_bucket';
  const query=archive_db.prepare(sql);
  const fetched=await (futures?query.bind(from_hour,to_hour):query.bind(venue,from_hour,to_hour)).all();
  const rows=fetched?.results;
  if(!Array.isArray(rows)||rows.length>169) throw Error('HISTORY_READ_ROW_BOUND_INVALID');
  const byHour=new Map();
  for(const row of rows){
    const h=Number(row.hour_bucket);
    if(!Number.isSafeInteger(h)||h<from_hour||h>to_hour||h%HOUR||byHour.has(h)) throw Error('HISTORY_READ_HOUR_INVALID');
    if(await digest(row.payload_json)!==row.payload_sha256) throw Error('HISTORY_READ_HASH_INVALID');
    const payload=JSON.parse(row.payload_json);
    if(futures){
      if(payload.schema!=='report2-hourly-market-archive-v1'||row.manifest_sha256!==MANIFEST_SHA256||row.target_count!==104||payload.source_bucket!==row.source_bucket||payload.source_market_ts!==row.source_market_ts) throw Error('HISTORY_READ_FUTURES_PROVENANCE_INVALID');
    }else{
      if(payload.schema!=='report2-hourly-spot-archive-v1'||row.venue!==venue||payload.venue!==venue||payload.source_url!==row.source_url||payload.source_ts!==row.source_ts||payload.identity_scope!==row.identity_scope) throw Error('HISTORY_READ_SPOT_PROVENANCE_INVALID');
    }
    const matches=payload.samples?.filter(sample=>sample.contract===contract);
    if(!Array.isArray(matches)||matches.length>1) throw Error('HISTORY_READ_SAMPLE_DUPLICATE');
    const sample=matches[0];
    if(sample&&sample.market!==(futures?'HTX_LINEAR_PERPETUAL':'SPOT')) throw Error('HISTORY_READ_MARKET_MISMATCH');
    byHour.set(h,sample?{hour_bucket:h,...sample}:null);
  }
  const samples=[],gaps=[];
  for(let h=from_hour;h<=to_hour;h+=HOUR){
    const s=byHour.get(h);
    if(!s||typeof s.price!=='number'||!Number.isFinite(s.price)||s.price<=0||futures&&s.source_status!=='CLOSED'||!futures&&s.source_status!=='BOUNDED_TICKER') {gaps.push(h);continue;}
    samples.push(s);
  }
  return {status:gaps.length?'PARTIAL':'CLOSED',contract,market,venue,source_venue:venue,identity_scope:futures?'HTX_LINEAR_PERPETUAL':'HTX_EXACT_PAIR_ONLY',price_basis:futures?'COLLECTOR_MARKET_SNAPSHOT':'LAST_TICKER_NOT_CANDLE',decision_usable:false,samples,gaps};
}
