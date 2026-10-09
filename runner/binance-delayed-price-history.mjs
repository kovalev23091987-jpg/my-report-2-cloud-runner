import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
const hash=b=>createHash('sha256').update(b).digest('hex');
const validHash=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
function loadArchive({manifest:m,payload},identity,asof){
 if(!m||m.schema!=='BINANCE_MONTHLY_COLD_PRICE_V1'||m.status!=='CLOSED_PRICE_HISTORY'||m.venue!=='BINANCE'||m.market!==identity.market||m.symbol!==identity.symbol||m.quote!=='USDT'||m.base!==identity.symbol.slice(0,-4)||m.interval_ms!==60000||m.history_role!=='HISTORICAL_PRICE_ONLY'||m.live_quote_eligible!==false||m.decision_replay_eligible!==false||m.htx_execution_price_eligible!==false||m.entry_authorized!==false||m.source_ts!==null||m.native_source_publication_ts!==null||m.score_contribution!==0||m.trade_content_qualified!==false||m.signed_flow_qualified!==false)throw Error('EXACT_COLD_VENUE_IDENTITY_AND_ROLE_REQUIRED');
 if(!Number.isSafeInteger(m.available_at)||!Number.isSafeInteger(m.qualified_at)||m.available_at>m.qualified_at||m.qualified_at>asof||!Array.isArray(m.event_interval)||m.event_interval.length!==2)throw Error('ORIGINAL_AVAILABILITY_REQUIRED');
 const [start,end]=m.event_interval;if(![start,end].every(Number.isSafeInteger)||start%60000||end%60000||end<=start||end>m.available_at||m.minute_count!==(end-start)/60000||m.minute_count<28*1440||m.minute_count>31*1440||!/^20\d{2}-\d{2}$/.test(m.month)||new Date(start).toISOString().slice(0,10)!==m.month+'-01'||new Date(end).getUTCDate()!==1)throw Error('EXACT_MONTH_GRID_REQUIRED');
 const expectedUnit=m.market==='spot'&&Number(m.month.slice(0,4))>=2025?'microseconds':'milliseconds';if(m.native_timestamp_unit!==expectedUnit||!validHash(m.archive_sha256)||!validHash(m.csv_sha256)||!validHash(m.checksum_sha256)||!validHash(m.qualified_price_payload_sha256)||!Buffer.isBuffer(payload)||payload.length>8*1024*1024||hash(payload)!==m.qualified_price_payload_sha256)throw Error('EXACT_NATIVE_UNIT_AND_PAYLOAD_HASH_REQUIRED');
 const root=m.market==='spot'?'spot':'futures/um',url=`https://data.binance.vision/data/${root}/monthly/klines/${m.symbol}/1m/${m.symbol}-1m-${m.month}.zip`;
 if(m.archive_url!==url||!Array.isArray(m.original_receipts)||m.original_receipts.length!==2||new Set(m.original_receipts.map(r=>r.url)).size!==2||m.original_receipts.some(r=>![url,url+'.CHECKSUM'].includes(r.url)||r.http_status!==200||r.sha256!==(r.url===url?m.archive_sha256:m.checksum_sha256)||!Number.isSafeInteger(r.bytes)||r.bytes<1||!Number.isSafeInteger(r.started_ts)||!Number.isSafeInteger(r.received_ts)||r.started_ts<end||r.received_ts<r.started_ts||r.received_ts>m.available_at)||Math.max(...m.original_receipts.map(r=>r.received_ts))!==m.available_at)throw Error('EXACT_ORIGINAL_SOURCE_RECEIPTS_REQUIRED');
 const rows=JSON.parse(gunzipSync(payload,{maxOutputLength:64*1024*1024}));if(!Array.isArray(rows)||rows.length!==m.minute_count)throw Error('FULL_PRICE_ROWS_REQUIRED');
 rows.forEach((r,i)=>{if(!Array.isArray(r)||r.length!==5||r[0]!==start+i*60000||!r.slice(1).every(v=>typeof v==='number'&&Number.isFinite(v)&&v>0)||r[2]<Math.max(r[1],r[4])||r[3]>Math.min(r[1],r[4])||r[2]<r[3])throw Error('QUALIFIED_OHLC_GRID_REQUIRED');});
 return {manifest:m,rows};
}

export function measureBinanceColdPricePath({archives,venue,market,symbol,start_ts,end_ts,as_of}={}){
 const refused=reason=>({status:'NOT_CLOSED',reason,live_quote_eligible:false,htx_execution_price_eligible:false,decision_replay_eligible:false,entry_authorized:false});
 try{
  if(venue!=='BINANCE'||!['spot','usd_m_futures'].includes(market)||!/^([A-Z0-9]{2,24})USDT$/.test(symbol||'')||![start_ts,end_ts,as_of].every(Number.isSafeInteger)||start_ts%60000||end_ts%60000||end_ts<=start_ts||end_ts-start_ts>90*86400000||!Array.isArray(archives)||archives.length<1||archives.length>4)throw Error('BOUNDED_EXACT_VENUE_INTERVAL_REQUIRED');
  const loaded=archives.map(a=>loadArchive(a,{market,symbol},as_of)).sort((a,b)=>a.manifest.event_interval[0]-b.manifest.event_interval[0]);
  for(let i=1;i<loaded.length;i++)if(loaded[i-1].manifest.event_interval[1]!==loaded[i].manifest.event_interval[0])throw Error('ADJACENT_NONOVERLAPPING_MONTHS_REQUIRED');
  const rows=loaded.flatMap(a=>a.rows).filter(r=>r[0]>=start_ts&&r[0]<end_ts);if(rows.length!==(end_ts-start_ts)/60000||rows[0]?.[0]!==start_ts||rows.at(-1)?.[0]!==end_ts-60000)throw Error('FULL_REQUESTED_PRICE_INTERVAL_REQUIRED');
  const first=rows[0][1],last=rows.at(-1)[4];let hi=first,lo=first;for(const r of rows){hi=Math.max(hi,r[2]);lo=Math.min(lo,r[3]);}
  return {schema:'BINANCE_COLD_PRICE_PATH_V1',status:'CLOSED_PRICE_PATH',venue,market,symbol,quote:'USDT',start_ts,end_ts,minute_count:rows.length,price_start:first,price_end:last,raw_return_pct:(last/first-1)*100,range_above_start_pct:(hi/first-1)*100,range_below_start_pct:(lo/first-1)*100,available_at:Math.max(...loaded.map(a=>a.manifest.available_at)),source_archives:loaded.map(a=>({month:a.manifest.month,archive_sha256:a.manifest.archive_sha256,qualified_price_payload_sha256:a.manifest.qualified_price_payload_sha256})),sourceHTTP:0,D1:0,live_quote_eligible:false,htx_execution_price_eligible:false,decision_replay_eligible:false,entry_authorized:false,cost_adjusted_return:null,directional_return:null,actual_ENTRY:false,all102_history_complete:false,project_complete:false};
 }catch(e){return refused(e instanceof Error?e.message:'COLD_PRICE_PATH_NOT_CLOSED');}
}

// Derived 3m/5m OHLC from complete, checksum-qualified native 1m candles.
// This is cold same-venue price history, never an official 3m/5m ZIP or a
// historical decision receipt. It does not qualify volume or signed trades.
export function readBinanceColdCandles({archives,venue,market,symbol,start_ts,end_ts,as_of,interval_ms}={}){
 const refused=reason=>({status:'NOT_CLOSED',reason,live_quote_eligible:false,htx_execution_price_eligible:false,decision_replay_eligible:false,entry_authorized:false});
 try{
  if(venue!=='BINANCE'||!['spot','usd_m_futures'].includes(market)||!/^([A-Z0-9]{2,24})USDT$/.test(symbol||'')||![start_ts,end_ts,as_of,interval_ms].every(Number.isSafeInteger)||![180000,300000].includes(interval_ms)||start_ts%interval_ms||end_ts%interval_ms||end_ts<=start_ts||end_ts-start_ts>90*86400000||!Array.isArray(archives)||archives.length<1||archives.length>4)throw Error('BOUNDED_EXACT_VENUE_CANDLE_INTERVAL_REQUIRED');
  const loaded=archives.map(a=>loadArchive(a,{market,symbol},as_of)).sort((a,b)=>a.manifest.event_interval[0]-b.manifest.event_interval[0]);
  for(let i=1;i<loaded.length;i++)if(loaded[i-1].manifest.event_interval[1]!==loaded[i].manifest.event_interval[0])throw Error('ADJACENT_NONOVERLAPPING_MONTHS_REQUIRED');
  const rows=loaded.flatMap(a=>a.rows).filter(r=>r[0]>=start_ts&&r[0]<end_ts);
  if(rows.length!==(end_ts-start_ts)/60000||rows[0]?.[0]!==start_ts||rows.at(-1)?.[0]!==end_ts-60000)throw Error('FULL_REQUESTED_PRICE_INTERVAL_REQUIRED');
  const width=interval_ms/60000,candles=[];
  for(let i=0;i<rows.length;i+=width){
   const group=rows.slice(i,i+width);if(group.length!==width)throw Error('CLOSED_COMPLETE_AGGREGATE_CANDLE_REQUIRED');
   candles.push([group[0][0],group[0][1],Math.max(...group.map(r=>r[2])),Math.min(...group.map(r=>r[3])),group.at(-1)[4]]);
  }
  return {schema:'BINANCE_DERIVED_COLD_OHLC_V1',status:'CLOSED_COLD_CANDLES',venue,market,symbol,quote:'USDT',start_ts,end_ts,interval_ms,native_source_interval_ms:60000,minute_count:rows.length,candle_count:candles.length,candles,aggregation_basis:'COMPLETE_NATIVE_1M_OHLC',official_native_3m_5m_archive_verified:false,source_ts:null,native_source_publication_ts:null,available_at:Math.max(...loaded.map(a=>a.manifest.available_at)),qualified_at:Math.max(...loaded.map(a=>a.manifest.qualified_at)),source_archives:loaded.map(a=>({month:a.manifest.month,archive_sha256:a.manifest.archive_sha256,qualified_price_payload_sha256:a.manifest.qualified_price_payload_sha256})),sourceHTTP:0,D1:0,history_role:'HISTORICAL_PRICE_ONLY',live_quote_eligible:false,htx_execution_price_eligible:false,decision_replay_eligible:false,entry_authorized:false,score_contribution:0,trade_content_qualified:false,signed_flow_qualified:false,actual_ENTRY:false,all102_history_complete:false,project_complete:false};
 }catch(e){return refused(e instanceof Error?e.message:'COLD_CANDLE_PATH_NOT_CLOSED');}
}
