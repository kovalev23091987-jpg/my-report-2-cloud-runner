import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
// Cold price inspection only. Never an executable anchor, directional flow,
// live source vote, or proof that an ENTRY was emitted or delivered.
export function inspectArchivePriceWindow({manifest,payload,contract,start_ts,end_ts,as_of_ts}={}){
 const nativeKline=manifest?.schema==='HTX_NATIVE_KLINE_PRICE_QUALIFICATION_V1';
 const base={source:nativeKline?'HTX_NATIVE_KLINE_ARCHIVE_AND_EXACT_NATIVE_BAR':'HTX_OFFICIAL_DELAYED_ARCHIVE_AND_EXACT_NATIVE_BAR',history_role:'HISTORICAL_PRICE_ONLY',entry_authorized:false,decision_replay_eligible:false,live_quote_eligible:false};
 const no=reason=>({...base,status:'CENSORED_MISSING_HISTORY',reason,candles:[]});
 if(!['HTX_DELAYED_ARCHIVE_PRICE_QUALIFICATION_V1','HTX_NATIVE_KLINE_PRICE_QUALIFICATION_V1'].includes(manifest?.schema)||!['PARTIAL_PRICE_HISTORY','CLOSED_PRICE_HISTORY'].includes(manifest.status)||manifest.contract!==contract||manifest.entry_authorized!==false||manifest.live_quote_eligible!==false||manifest.decision_replay_eligible!==false)return no('EXACT_DELAYED_PRICE_MANIFEST_REQUIRED');
 if(!Number.isSafeInteger(manifest.qualified_at)||manifest.qualified_at<manifest.source_ts||manifest.qualified_at>as_of_ts||nativeKline&&(!Number.isSafeInteger(manifest.available_at)||manifest.available_at>manifest.qualified_at||manifest.available_at>as_of_ts))return no('ORIGINAL_QUALIFICATION_AND_AVAILABILITY_REQUIRED');
 if(!Buffer.isBuffer(payload)||payload.length>8*1024*1024||createHash('sha256').update(payload).digest('hex')!==manifest.qualified_price_payload_sha256)return no('EXACT_BOUNDED_PAYLOAD_DIGEST_REQUIRED');
 if(!Array.isArray(manifest.event_interval)||manifest.event_interval.length!==2||!manifest.event_interval.every(Number.isSafeInteger)||manifest.event_interval[0]%60000||manifest.event_interval[1]-manifest.event_interval[0]!==86400000)return no('EXACT_ARCHIVE_DAY_INTERVAL_REQUIRED');
 if(![start_ts,end_ts,as_of_ts,manifest.source_ts].every(Number.isSafeInteger)||start_ts%60000||end_ts%60000||end_ts<=start_ts||end_ts-start_ts>86400000||start_ts<manifest.event_interval?.[0]||end_ts>manifest.event_interval?.[1]||manifest.source_ts>as_of_ts||end_ts>as_of_ts)return no('EXACT_MATURE_BOUNDED_WINDOW_REQUIRED');
 let input;try{input=JSON.parse(gunzipSync(payload,{maxOutputLength:8*1024*1024}));}catch{return no('HISTORICAL_PAYLOAD_INVALID');}
 if(!Array.isArray(input)||input.length>1440)return no('BOUNDED_MINUTE_ROWS_REQUIRED');
 const times=new Set();
 for(const c of input){
  if(c?.contract!==contract||c.source_ts!==manifest.source_ts||c.closed!==true||c.live_quote_eligible!==false||c.history_role!=='HISTORICAL_PRICE_ONLY'||nativeKline&&c.source!==base.source||!Number.isSafeInteger(c.open_ts)||c.open_ts%60000||c.open_ts<manifest.event_interval[0]||c.open_ts>=manifest.event_interval[1]||c.close_ts>manifest.source_ts||c.close_ts!==c.open_ts+59999||times.has(c.open_ts)||!['open','high','low','close'].every(k=>typeof c[k]==='number'&&Number.isFinite(c[k])&&c[k]>0)||c.high<Math.max(c.open,c.close)||c.low>Math.min(c.open,c.close)||c.low>c.high)return no('EXACT_UNAMBIGUOUS_MINUTE_ROW_REQUIRED');
  times.add(c.open_ts);
 }
 const rows=input.filter(c=>c.open_ts>=start_ts&&c.open_ts<end_ts).sort((a,b)=>a.open_ts-b.open_ts);
 if(rows.length!==(end_ts-start_ts)/60000||rows.some((c,i)=>c.open_ts!==start_ts+i*60000))return no('DISPUTED_OR_MISSING_MINUTE');
 return {...base,status:'CLOSED_HISTORICAL_PRICE_WINDOW',source_ts:manifest.source_ts,archive_sha256:manifest.archive_sha256,candles:rows};
}

// Combine exact already-qualified HTX days. Each day keeps its own provenance
// and original clocks. This is retrospective price inspection, not a signal
// replay, a fill, a live source vote or a new ENTRY sample.
export function inspectArchivePriceSeries({archives,contract,start_ts,end_ts,as_of_ts}={}){
 const base={schema:'HTX_RETAINED_MULTI_DAY_PRICE_SERIES_V1',source:'HTX_QUALIFIED_RETAINED_DAILY_PRICE_ARCHIVES',contract,history_role:'HISTORICAL_PRICE_ONLY',entry_authorized:false,decision_replay_eligible:false,live_quote_eligible:false,actual_fill_price_known:false,score_contribution:0,sourceHTTP:0,D1:0,entry_samples_created:0,actual_ENTRY:false,all102_history_complete:false,project_complete:false};
 const no=(reason,details={})=>({...base,status:'CENSORED_MISSING_HISTORY',reason,...details,candles:[]});
 if(typeof contract!=='string'||!contract.endsWith('-USDT')||contract.length<=5||contract.length>96||![start_ts,end_ts,as_of_ts].every(Number.isSafeInteger)||start_ts%60000||end_ts%60000||end_ts<=start_ts||end_ts-start_ts>90*86400000||end_ts>as_of_ts||!Array.isArray(archives)||archives.length<1||archives.length>91)return no('BOUNDED_EXACT_MATURE_MULTI_DAY_WINDOW_REQUIRED');
 const selected=[];
 for(const a of archives){
  const m=a?.manifest,interval=m?.event_interval;
  if(!m||m.contract!==contract||!Array.isArray(interval)||interval.length!==2||!interval.every(Number.isSafeInteger)||interval[0]%60000||interval[1]-interval[0]!==86400000)return no('EXACT_SINGLE_ASSET_DAILY_ARCHIVE_SET_REQUIRED');
  if(interval[1]<=start_ts||interval[0]>=end_ts)return no('UNRELATED_ARCHIVE_OUTSIDE_REQUESTED_WINDOW');
  selected.push(a);
 }
 selected.sort((a,b)=>a.manifest.event_interval[0]-b.manifest.event_interval[0]);
 for(let i=1;i<selected.length;i++){
  const previous=selected[i-1].manifest.event_interval[1],current=selected[i].manifest.event_interval[0];
  if(current<previous)return no('DUPLICATE_OR_OVERLAPPING_DAILY_ARCHIVE');
  if(current>previous)return no('MISSING_ADJACENT_DAILY_ARCHIVE');
 }
 if(selected[0].manifest.event_interval[0]>start_ts||selected.at(-1).manifest.event_interval[1]<end_ts)return no('FULL_REQUESTED_DAYS_NOT_COVERED');
 const candles=[],provenance=[];
 for(const a of selected){
  const m=a.manifest,from=Math.max(start_ts,m.event_interval[0]),to=Math.min(end_ts,m.event_interval[1]);
  const window=inspectArchivePriceWindow({...a,contract,start_ts:from,end_ts:to,as_of_ts});
  if(window.status!=='CLOSED_HISTORICAL_PRICE_WINDOW')return no('DAILY_PRICE_WINDOW_NOT_CLOSED',{daily_reason:window.reason,failed_event_interval:m.event_interval});
  candles.push(...window.candles);
  provenance.push({event_interval:m.event_interval,used_interval:[from,to],source:window.source,source_ts:m.source_ts,available_at:Number.isSafeInteger(m.available_at)?m.available_at:null,qualified_at:m.qualified_at,archive_sha256:m.archive_sha256,qualified_price_payload_sha256:m.qualified_price_payload_sha256});
 }
 if(candles.length!==(end_ts-start_ts)/60000||candles.some((c,i)=>c.open_ts!==start_ts+i*60000))return no('COMPLETE_UNIQUE_MINUTE_SERIES_REQUIRED');
 return {...base,status:'CLOSED_HISTORICAL_PRICE_SERIES',start_ts,end_ts,minute_count:candles.length,archive_count:selected.length,qualification_available_at:Math.max(...selected.map(a=>a.manifest.qualified_at)),source_ts:null,source_clocks_preserved_per_archive:true,source_archives:provenance,candles};
}

// Preserve independently verified partial days and enumerate every missing
// interval. This never relaxes inspectArchivePriceSeries: consumers requiring
// a complete grid must continue to use that function. Exact duplicate files
// are collapsed; conflicting files for the same day fail closed.
export function inspectArchivePriceCoverage({archives,contract,start_ts,end_ts,as_of_ts}={}){
 const base={schema:'HTX_RETAINED_PARTIAL_PRICE_COVERAGE_V1',source:'HTX_QUALIFIED_RETAINED_DAILY_PRICE_ARCHIVES',contract,history_role:'HISTORICAL_PRICE_ONLY',entry_authorized:false,decision_replay_eligible:false,live_quote_eligible:false,actual_fill_price_known:false,score_contribution:0,sourceHTTP:0,D1:0,entry_samples_created:0,actual_ENTRY:false,all102_history_complete:false,project_complete:false};
 const refused=(reason,details={})=>({...base,status:'CENSORED_MISSING_HISTORY',reason,start_ts,end_ts,minute_count:0,archive_count:0,deduplicated_archives:0,coverage_ratio:0,complete_30d_native:false,complete_90d_native:false,segments:[],gaps:Number.isSafeInteger(start_ts)&&Number.isSafeInteger(end_ts)&&end_ts>start_ts?[{start_ts,end_ts,reason}]:[],source_archives:[],candles:[],...details});
 if(typeof contract!=='string'||!contract.endsWith('-USDT')||contract.length<=5||contract.length>96||![start_ts,end_ts,as_of_ts].every(Number.isSafeInteger)||start_ts%60000||end_ts%60000||end_ts<=start_ts||end_ts-start_ts>90*86400000||end_ts>as_of_ts||!Array.isArray(archives)||archives.length>182)return refused('BOUNDED_EXACT_MATURE_PARTIAL_WINDOW_REQUIRED');
 const relevant=archives.filter(a=>Array.isArray(a?.manifest?.event_interval)&&a.manifest.event_interval[1]>start_ts&&a.manifest.event_interval[0]<end_ts);
 const days=new Map();let deduplicated_archives=0;
 for(const a of relevant){
  const m=a?.manifest,interval=m?.event_interval;
  if(m?.contract!==contract||!Array.isArray(interval)||interval.length!==2||!interval.every(Number.isSafeInteger)||interval[0]%60000||interval[1]-interval[0]!==86400000)return refused('EXACT_SINGLE_ASSET_DAILY_ARCHIVE_SET_REQUIRED');
  const key=String(interval[0]),identity=[m.schema,m.status,m.contract,m.archive_sha256,m.qualified_price_payload_sha256,m.source_ts,m.available_at??null,m.qualified_at].join('|');
  if(days.has(key)){
   if(days.get(key).identity!==identity||!Buffer.isBuffer(a.payload)||!Buffer.isBuffer(days.get(key).archive.payload)||!a.payload.equals(days.get(key).archive.payload))return refused('CONFLICTING_ARCHIVES_FOR_SAME_DAY',{conflict_interval:interval});
   deduplicated_archives++;continue;
  }
  days.set(key,{identity,archive:a});
 }
 const ordered=[...days.values()].sort((a,b)=>a.archive.manifest.event_interval[0]-b.archive.manifest.event_interval[0]);
 for(let i=1;i<ordered.length;i++)if(ordered[i].archive.manifest.event_interval[0]<ordered[i-1].archive.manifest.event_interval[1])return refused('CONFLICTING_OVERLAPPING_ARCHIVE_DAYS',{conflict_intervals:[ordered[i-1].archive.manifest.event_interval,ordered[i].archive.manifest.event_interval]});
 const candles=[],source_archives=[],segments=[],gaps=[];let cursor=start_ts,segment=null;
 while(cursor<end_ts){
  const record=ordered.find(x=>x.archive.manifest.event_interval[0]<=cursor&&x.archive.manifest.event_interval[1]>cursor),next=ordered.find(x=>x.archive.manifest.event_interval[0]>cursor),from=cursor,to=Math.min(end_ts,record?record.archive.manifest.event_interval[1]:next?.archive.manifest.event_interval[0]??end_ts);
  let window,reason='ARCHIVE_DAY_NOT_RETAINED';
  if(record){window=inspectArchivePriceWindow({...record.archive,contract,start_ts:from,end_ts:to,as_of_ts});if(window.status!=='CLOSED_HISTORICAL_PRICE_WINDOW')reason=window.reason;}
  if(window?.status==='CLOSED_HISTORICAL_PRICE_WINDOW'){
   const offset=candles.length;candles.push(...window.candles);
   const m=record.archive.manifest,proof={event_interval:m.event_interval,used_interval:[from,to],source:window.source,source_ts:m.source_ts,available_at:Number.isSafeInteger(m.available_at)?m.available_at:null,qualified_at:m.qualified_at,archive_sha256:m.archive_sha256,qualified_price_payload_sha256:m.qualified_price_payload_sha256};source_archives.push(proof);
   if(segment&&segment.end_ts===from){segment.end_ts=to;segment.minute_count+=window.candles.length;segment.archive_count++;segment.candle_end_offset=candles.length;}else{segment={start_ts:from,end_ts:to,minute_count:window.candles.length,archive_count:1,candle_start_offset:offset,candle_end_offset:candles.length};segments.push(segment);}
  }else{
   segment=null;const previous=gaps.at(-1);if(previous&&previous.end_ts===from&&previous.reason===reason)previous.end_ts=to;else gaps.push({start_ts:from,end_ts:to,reason});
  }
  cursor=to;
 }
 const requested_minutes=(end_ts-start_ts)/60000,minute_count=candles.length,coverage_ratio=minute_count/requested_minutes,requested_days=(end_ts-start_ts)/86400000,complete=minute_count===requested_minutes&&gaps.length===0;
 return {...base,status:complete?'CLOSED_HISTORICAL_PRICE_COVERAGE':minute_count?'PARTIAL_HISTORICAL_PRICE_COVERAGE':'CENSORED_MISSING_HISTORY',reason:complete?null:minute_count?'FACTUAL_GAPS_PRESERVED':'NO_VERIFIED_ARCHIVE_MINUTES',start_ts,end_ts,requested_minutes,requested_days,minute_count,archive_count:source_archives.length,deduplicated_archives,coverage_ratio,complete_30d_native:complete&&requested_days>=30,complete_90d_native:complete&&requested_days>=90,source_ts:null,source_clocks_preserved_per_archive:true,segments,gaps,source_archives,candles};
}
