import {KNOWN_HISTORY_MANIFESTS,HISTORY_TARGETS} from './hourly-archive.mjs';

const HOUR=3_600_000;
const encoder=new TextEncoder();
const digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(text))),b=>b.toString(16).padStart(2,'0')).join('');

// An explicit bounded read for future N15 analysis. No report or Telegram side effect.
export async function readHourlyHistory({archive_db,contract,market,venue='HTX',from_hour,to_hour}={}) {
  if(!archive_db||!HISTORY_TARGETS.includes(contract)||!['SPOT','FUTURES'].includes(market)||venue!=='HTX'||!Number.isSafeInteger(from_hour)||!Number.isSafeInteger(to_hour)||from_hour%HOUR||to_hour%HOUR||to_hour<from_hour||to_hour-from_hour>7*24*HOUR) throw Error('HISTORY_READ_ARGUMENTS_INVALID');
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
      const generationValid=KNOWN_HISTORY_MANIFESTS.some(m=>row.manifest_sha256===m.sha256&&row.target_count===m.target_count);
      if(payload.schema!=='report2-hourly-market-archive-v1'||!generationValid||payload.source_bucket!==row.source_bucket||payload.source_market_ts!==row.source_market_ts) throw Error('HISTORY_READ_FUTURES_PROVENANCE_INVALID');
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

// Read the two HTX ticker batches captured by the same Worker invocation.
// Legacy :25 futures samples stay in readHourlyHistory. They may be compared
// only as bounded-lag context with their original ten-minute clock gap shown.
export async function readAlignedHourlyPair({archive_db,contract,from_hour,to_hour}={}){
  if(!archive_db||!HISTORY_TARGETS.includes(contract)||!Number.isSafeInteger(from_hour)||!Number.isSafeInteger(to_hour)||from_hour%HOUR||to_hour%HOUR||to_hour<from_hour||to_hour-from_hour>7*24*HOUR)throw Error('PAIR_HISTORY_ARGUMENTS_INVALID');
  const fetched=await archive_db.prepare('SELECT * FROM report2_hourly_spot_archive_v1 WHERE venue=?1 AND hour_bucket BETWEEN ?2 AND ?3 ORDER BY hour_bucket').bind('HTX',from_hour,to_hour).all();
  if(!Array.isArray(fetched?.results)||fetched.results.length>169)throw Error('PAIR_HISTORY_ROW_BOUND_INVALID');
  const byHour=new Map();
  for(const row of fetched.results){
    const h=Number(row.hour_bucket);
    if(!Number.isSafeInteger(h)||h<from_hour||h>to_hour||h%HOUR||byHour.has(h))throw Error('PAIR_HISTORY_HOUR_INVALID');
    if(await digest(row.payload_json)!==row.payload_sha256)throw Error('PAIR_HISTORY_HASH_INVALID');
    const payload=JSON.parse(row.payload_json),paired=payload.paired_futures;
    if(payload.schema!=='report2-hourly-spot-archive-v1'||payload.venue!=='HTX'||payload.source_ts!==row.source_ts||payload.source_url!==row.source_url||payload.identity_scope!==row.identity_scope)throw Error('PAIR_HISTORY_SPOT_PROVENANCE_INVALID');
    const spot=payload.samples?.filter(s=>s.contract===contract),futures=paired?.samples?.filter(s=>s.contract===contract);
    if(!Array.isArray(spot)||spot.length>1||futures&&!Array.isArray(futures)||futures?.length>1)throw Error('PAIR_HISTORY_SAMPLE_DUPLICATE');
    const s=spot[0],f=futures?.[0],spotValid=s?.market==='SPOT'&&s.source_status==='BOUNDED_TICKER'&&Number.isSafeInteger(s.source_ts)&&s.source_ts===payload.source_ts&&Number.isFinite(s.price)&&s.price>0;
    const futureValid=f?.market==='HTX_LINEAR_PERPETUAL'&&f.source_status==='BOUNDED_TICKER'&&Number.isSafeInteger(f.source_ts)&&Number.isFinite(f.price)&&f.price>0;
    const skew=spotValid&&futureValid?Math.abs(s.source_ts-f.source_ts):null;
    const pairedSource=paired?.source_url==='https://api.hbdm.com/linear-swap-ex/market/detail/batch_merged'&&['PAIRED_WITHIN_30S','PAIRED_WITHIN_10M'].includes(paired?.status);
    const bounded=spotValid&&futureValid&&pairedSource&&skew<=630_000;
    const aligned=bounded&&skew<=30_000;
    byHour.set(h,{hour_bucket:h,status:aligned?'ALIGNED_PAIR':bounded?'BOUNDED_LAG_PAIR':spotValid&&futureValid?'BOTH_ASYNC':spotValid?'SPOT_ONLY':futureValid?'FUTURES_ONLY':'NO_QUALIFIED_PAIR',spot:spotValid?s:null,futures:futureValid?f:null,source_skew_ms:skew,comparison_usable:!!bounded,decision_usable:false});
  }
  const previousFutures=await readHourlyHistory({archive_db,contract,market:'FUTURES',from_hour,to_hour});
  const priorByHour=new Map(previousFutures.samples.map(s=>[s.hour_bucket,s]));
  const hours=[];
  for(let h=from_hour;h<=to_hour;h+=HOUR){
    const pairedRow=byHour.get(h),old=priorByHour.get(h),fallback=old?{...old,source_ts:old.observed_ts,price_basis:'COLLECTOR_MARKET_SNAPSHOT',historical_asynchronous:true}:null;
    if(!pairedRow){hours.push({hour_bucket:h,status:fallback?'FUTURES_ONLY':'GAP',spot:null,futures:fallback,source_skew_ms:null,comparison_usable:false,decision_usable:false});continue;}
    if(pairedRow.futures||!fallback){hours.push(pairedRow);continue;}
    const skew=pairedRow.spot?Math.abs(pairedRow.spot.source_ts-fallback.source_ts):null;
    const bounded=pairedRow.spot&&skew<=630_000;
    hours.push({...pairedRow,status:pairedRow.spot?(bounded?'BOUNDED_LAG_PAIR':'BOTH_ASYNC'):'FUTURES_ONLY',futures:fallback,source_skew_ms:skew,comparison_usable:!!bounded});
  }
  return{status:hours.every(r=>r.comparison_usable)?'CLOSED':'PARTIAL',contract,venue:'HTX',market_pair:'SPOT_AND_LINEAR_PERPETUAL',near_sync_target_ms:30_000,max_source_skew_ms:630_000,decision_usable:false,hours};
}
