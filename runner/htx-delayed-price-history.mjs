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
