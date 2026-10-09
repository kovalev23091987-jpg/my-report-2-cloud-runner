import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
// Cold price inspection only. Never an executable anchor, directional flow,
// live source vote, or proof that an ENTRY was emitted or delivered.
export function inspectArchivePriceWindow({manifest,payload,contract,start_ts,end_ts,as_of_ts}={}){
 const base={source:'HTX_OFFICIAL_DELAYED_ARCHIVE_AND_EXACT_NATIVE_BAR',history_role:'HISTORICAL_PRICE_ONLY',entry_authorized:false,decision_replay_eligible:false,live_quote_eligible:false};
 const no=reason=>({...base,status:'CENSORED_MISSING_HISTORY',reason,candles:[]});
 if(manifest?.schema!=='HTX_DELAYED_ARCHIVE_PRICE_QUALIFICATION_V1'||!['PARTIAL_PRICE_HISTORY','CLOSED_PRICE_HISTORY'].includes(manifest.status)||manifest.contract!==contract||manifest.entry_authorized!==false||manifest.live_quote_eligible!==false||manifest.decision_replay_eligible!==false)return no('EXACT_DELAYED_PRICE_MANIFEST_REQUIRED');
 if(!Buffer.isBuffer(payload)||payload.length>8*1024*1024||createHash('sha256').update(payload).digest('hex')!==manifest.qualified_price_payload_sha256)return no('EXACT_BOUNDED_PAYLOAD_DIGEST_REQUIRED');
 if(![start_ts,end_ts,as_of_ts,manifest.source_ts].every(Number.isSafeInteger)||start_ts%60000||end_ts%60000||end_ts<=start_ts||end_ts-start_ts>86400000||start_ts<manifest.event_interval?.[0]||end_ts>manifest.event_interval?.[1]||manifest.source_ts>as_of_ts||end_ts>as_of_ts)return no('EXACT_MATURE_BOUNDED_WINDOW_REQUIRED');
 let input;try{input=JSON.parse(gunzipSync(payload,{maxOutputLength:8*1024*1024}));}catch{return no('HISTORICAL_PAYLOAD_INVALID');}
 if(!Array.isArray(input)||input.length>1440)return no('BOUNDED_MINUTE_ROWS_REQUIRED');
 const times=new Set();
 for(const c of input){
  if(c?.contract!==contract||c.source_ts!==manifest.source_ts||c.closed!==true||c.live_quote_eligible!==false||c.history_role!=='HISTORICAL_PRICE_ONLY'||!Number.isSafeInteger(c.open_ts)||c.open_ts%60000||c.close_ts!==c.open_ts+59999||times.has(c.open_ts)||!['open','high','low','close'].every(k=>typeof c[k]==='number'&&Number.isFinite(c[k])&&c[k]>0)||c.high<Math.max(c.open,c.close)||c.low>Math.min(c.open,c.close)||c.low>c.high)return no('EXACT_UNAMBIGUOUS_MINUTE_ROW_REQUIRED');
  times.add(c.open_ts);
 }
 const rows=input.filter(c=>c.open_ts>=start_ts&&c.open_ts<end_ts).sort((a,b)=>a.open_ts-b.open_ts);
 if(rows.length!==(end_ts-start_ts)/60000||rows.some((c,i)=>c.open_ts!==start_ts+i*60000))return no('DISPUTED_OR_MISSING_MINUTE');
 return {...base,status:'CLOSED_HISTORICAL_PRICE_WINDOW',source_ts:manifest.source_ts,archive_sha256:manifest.archive_sha256,candles:rows};
}
