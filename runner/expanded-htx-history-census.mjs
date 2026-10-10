const DAY=86400000,MIN=60000,hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const fail=reason=>({status:'NOT_CLOSED',reason,project_complete:false});
function gaps(start,end,intervals){
 const xs=intervals.map(([a,b])=>[Math.max(start,a),Math.min(end,b)]).filter(([a,b])=>a<b).sort((a,b)=>a[0]-b[0]);
 let cursor=start;const missing=[];
 for(const [a,b] of xs){if(a>cursor)missing.push([cursor,a]);cursor=Math.max(cursor,b);}
 if(cursor<end)missing.push([cursor,end]);
 return missing;
}
// Source archive labels are local-day filenames. Coverage uses actual minute
// clocks, including the retained UTC+8 boundary, never an invented UTC day.
export function expandHtxHistoryCensus({base,archiveBatch,compact=[],anchor_end_ts}={}){
 if(base?.status!=='PARTIAL_VERIFIED_RETAINED_EVIDENCE_ONLY'||base.rows?.length!==102||!Number.isSafeInteger(anchor_end_ts)||anchor_end_ts%DAY!==0)return fail('EXACT_BASE_AND_ANCHOR_REQUIRED');
 const contracts=new Set(base.rows.map(x=>x.contract));if(contracts.size!==102)return fail('EXACT_UNIQUE_UNIVERSE_REQUIRED');
 if(archiveBatch?.status!=='BOUNDED_ACTUAL_SOURCE_ATTEMPTS_COMPLETED')return fail('RETAINED_ARCHIVE_BATCH_REQUIRED');
 const archives=archiveBatch.archives;
 if(!Array.isArray(archives)||archives.length!==3||archiveBatch.cloud_run!==38038404724||archiveBatch.source!=='HTX_DELAYED_KLINE_ARCHIVE_QUALIFICATION')return fail('EXACT_RETAINED_ARCHIVE_SOURCE_REQUIRED');
 const seen=new Set(),byContract=new Map();
 for(const a of archives){
  const s=a.structural,key=a.contract+'|'+a.archive_day;
  if(!contracts.has(a.contract)||seen.has(key)||a.verified_archive_bytes!==true||!hash(a.archive_sha256)||s?.contract!==a.contract||s.archive_day!==a.archive_day||s.minute_count!==1440||!Number.isSafeInteger(s.first_open_ts)||s.first_open_ts%MIN!==0||s.last_open_ts-s.first_open_ts!==DAY-MIN||s.native_API_OHLC_crosschecked!==false||a.price_qualified!==false||s.decision_replay_eligible!==false||s.entry_authorized!==false)return fail('ARCHIVE_IDENTITY_GRID_OR_ROLE_NOT_CLOSED');
  if(a.receipts?.length!==2||a.receipts.some(r=>r.status!==200||!hash(r.sha256)||!Number.isSafeInteger(r.received_at)||r.requested_at>r.received_at)||!a.receipts.some(r=>r.sha256===a.archive_sha256))return fail('ARCHIVE_ORIGINAL_RECEIPTS_REQUIRED');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(a.archive_day)||!Number.isInteger(s.archive_day_offset_minutes)||s.archive_day_offset_minutes<0||s.archive_day_offset_minutes>=1440||s.first_open_ts!==Date.parse(a.archive_day+'T00:00:00Z')-s.archive_day_offset_minutes*MIN)return fail('ARCHIVE_ORIGINAL_LOCAL_DAY_CLOCK_REQUIRED');
  seen.add(key);const rows=byContract.get(a.contract)||[];
  rows.push({archive_day_label:a.archive_day,event_interval:[s.first_open_ts,s.last_open_ts+MIN],archive_day_offset_minutes:s.archive_day_offset_minutes,minutes:1440,archive_sha256:a.archive_sha256,csv_sha256:s.csv_sha256,source_run:archiveBatch.cloud_run,price_API_crosschecked:false});byContract.set(a.contract,rows);
 }
 const coarse=new Map();
 for(const x of compact){
  if(!contracts.has(x?.contract)||coarse.has(x.contract)||x.venue!=='HTX_USDT_LINEAR_SWAP'||x.period!=='4hour'||x.anchor_end_ts!==anchor_end_ts||!hash(x.raw_sha256)||!hash(x.normalized_sha256)||!Number.isInteger(x.observed_bars)||x.observed_bars<0||x.observed_bars>540||x.missing_bars!==540-x.observed_bars||x.native_1m_complete!==false||x.entry_authorized!==false||x.complete_90d_4h_price_only!==(x.observed_bars===540))return fail('REQUALIFIED_COMPACT_PRICE_RECEIPT_REQUIRED');
  coarse.set(x.contract,x);
 }
 const rows=base.rows.map(r=>{
  const interval=r.native_htx_1m.qualified_day,native=interval?[interval]:[],s=byContract.get(r.contract)||[],c=coarse.get(r.contract);
  const windows=Object.fromEntries([30,90].map(days=>{const start=anchor_end_ts-days*DAY,missing=gaps(start,anchor_end_ts,native);return [days+'d',{start_ts:start,end_ts:anchor_end_ts,required_minutes:days*1440,verified_native_minutes:days*1440-missing.reduce((n,[a,b])=>n+(b-a)/MIN,0),not_proven_intervals:missing,complete:missing.length===0}];}));
  return {...r,native_windows:windows,structural_archives:s,structural_minutes_API_crosscheck_pending:s.length*1440,compact_4h:c?{status:c.status,observed_bars:c.observed_bars,missing_bars:c.missing_bars,gaps:c.gaps,raw_sha256:c.raw_sha256,complete_30d:c.complete_30d_4h_price_only,complete_90d:c.complete_90d_4h_price_only,role:'COARSE_PRICE_ONLY_NOT_NATIVE_MINUTES_OR_REPLAY'}:{status:'NO_ACTUAL_QUALIFIED_SOURCE_RECEIPT',complete_30d:false,complete_90d:false}};
 });
 return {schema:'HTX_EXPANDED_102_ACTUAL_SOURCE_COVERAGE_V1_20261010',status:'PARTIAL_ACTUAL_SOURCE_COVERAGE_AND_EXPLICIT_NOT_PROVEN_INTERVALS',anchor_end_ts,assets:102,rows,verified_native_minutes:base.native_htx_1m.qualified_minutes,structural_minutes_API_crosscheck_pending:4320,structural_assets:3,compact_qualified_assets:coarse.size,complete_30d_native_assets:rows.filter(r=>r.native_windows['30d'].complete).length,complete_90d_native_assets:rows.filter(r=>r.native_windows['90d'].complete).length,complete_90d_coarse_price_assets:rows.filter(r=>r.compact_4h.complete_90d).length,not_proven_does_not_mean_provider_absence:true,sourceHTTP:0,D1:0,Telegram:0,actual_ENTRY:false,project_complete:false};
}
