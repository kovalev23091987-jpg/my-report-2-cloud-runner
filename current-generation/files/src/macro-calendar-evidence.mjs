import crypto from 'node:crypto';
import {normalizeCalendarEvent,SOURCE_POLICIES} from './evidence-source-adapters.mjs';
import {installEvidenceSourceStore,reserveEvidenceSourceAttempts,readEvidenceSourceCache,writeEvidenceSourceCache} from './evidence-source-store.mjs';

export const MACRO_CALENDAR_EVIDENCE_VERSION='macro-calendar-evidence-v1-20260928';
const SOURCE='MACRO_CALENDAR',TTL=SOURCE_POLICIES[SOURCE].ttl_ms,DAILY_CAP=SOURCE_POLICIES[SOURCE].daily_cap;
const URLS=Object.freeze({BLS:'https://www.bls.gov/schedule/news_release/bls.ics',FED:'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm'});
const text=value=>String(value??'').trim();
const hash=value=>crypto.createHash('sha256').update(String(value)).digest('hex').slice(0,24);

function unfoldIcs(raw){return text(raw).replace(/\r\n[ \t]/g,'').replace(/\r/g,'').split('\n');}
function parseIcsDate(value){
 const raw=text(value).split(':').at(-1);const m=raw.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?Z?)?$/);
 if(!m)return null;return Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3]),Number(m[4]||0),Number(m[5]||0),Number(m[6]||0));
}
const BLS_TYPES=Object.freeze([
 ['Consumer Price Index','CPI'],['Employment Situation','EMPLOYMENT_SITUATION'],['Producer Price Index','PPI'],
]);
function boundedEvents(events,observedTs){
 const from=observedTs-24*60*60_000,to=observedTs+90*24*60*60_000,seen=new Set();
 return events.filter(row=>Number(row.effective_at)>=from&&Number(row.effective_at)<=to).sort((a,b)=>a.effective_at-b.effective_at).filter(row=>{const key=`${row.provider_id}:${row.event_id}:${row.effective_at}`;if(seen.has(key))return false;seen.add(key);return true;}).slice(0,16);
}
export function parseBlsCalendar(raw,{observed_ts=Date.now()}={}){
 const events=[];let current=null;
 for(const line of unfoldIcs(raw)){
  if(line==='BEGIN:VEVENT')current={};
  else if(line==='END:VEVENT'&&current){
   const mapped=BLS_TYPES.find(([label])=>text(current.summary).toLowerCase().includes(label.toLowerCase()));
   const effectiveAt=parseIcsDate(current.dtstart);
   if(mapped&&effectiveAt!==null)events.push({provider_id:'BLS_CALENDAR',event_id:text(current.uid)||`BLS:${mapped[1]}:${effectiveAt}`,event_type:mapped[1],effective_at:effectiveAt,source_ts:observed_ts,observed_ts,time_precision:/T\d{6}/.test(text(current.dtstart))?'EXACT':'DATE_ONLY'});
   current=null;
  }else if(current){const at=line.indexOf(':');if(at>0){const key=line.slice(0,at).split(';')[0].toLowerCase();current[key]=line.slice(at+1);}}
 }
 return events;
}

export function parseFedCalendar(raw,{observed_ts=Date.now()}={}){
 const plain=text(raw).replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ');
 const events=[];const yearMatches=[...plain.matchAll(/\b(20\d{2})\b/g)];
 for(const match of yearMatches){
  const year=Number(match[1]);if(year<2020||year>2100)continue;
  const window=plain.slice(match.index,match.index+2200);
  for(const date of window.matchAll(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?/gi)){
   const month=['january','february','march','april','may','june','july','august','september','october','november','december'].indexOf(date[1].toLowerCase());
   const day=Number(date[3]||date[2]),effectiveAt=Date.UTC(year,month,day,0,0,0);
   if(!events.some(row=>row.effective_at===effectiveAt))events.push({provider_id:'FED_CALENDAR',event_id:`FOMC:${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`,event_type:'FOMC',effective_at:effectiveAt,source_ts:observed_ts,observed_ts,time_precision:'DATE_ONLY'});
  }
 }
 return events.slice(0,32);
}

async function getText(fetchImpl,url){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
 try{const response=await fetchImpl(url,{headers:{accept:'text/calendar,text/html;q=0.9','user-agent':'My-Report-2/macro-calendar-v1'},signal:controller.signal});const body=await response.text().catch(()=>'');return{ok:response.ok,http_status:response.status,body,error:response.ok?null:`HTTP_${response.status}`};}
 catch(error){return{ok:false,http_status:null,body:'',error:String(error?.name==='AbortError'?'TIMEOUT':error?.message||error).slice(0,160)};}
 finally{clearTimeout(timer);}
}

export function normalizeMacroCalendar({contract,bls_raw='',fed_raw='',observed_ts=Date.now()}={}){
 const htxContract=text(contract).toUpperCase(),events=boundedEvents([...parseBlsCalendar(bls_raw,{observed_ts}),...parseFedCalendar(fed_raw,{observed_ts})],observed_ts);
 const evidence=events.map(event=>normalizeCalendarEvent({...event,asset_id:'GLOBAL_MACRO',htx_contract:htxContract}));
 return{status:evidence.length?'CLOSED':'PARTIAL',contract:htxContract,evidence,summary:{events:evidence.length,next_effective_at:evidence.filter(row=>Number(row.effective_from)>=observed_ts).sort((a,b)=>a.effective_from-b.effective_from)[0]?.effective_from??null,raw_fingerprint:hash(`${bls_raw}\n${fed_raw}`)},internal_only:true};
}

export async function collectMacroCalendarEvidence({db,fetch_impl=globalThis.fetch,request_admit,contract,run_id,now=Date.now(),strict_fresh_manual=false}={}){
 if(!db)throw new Error('MACRO_CALENDAR_DB_REQUIRED');const htxContract=text(contract).toUpperCase();
 if(!/^[^\s-]+-USDT$/u.test(htxContract))return{status:'EXACT_HTX_CONTRACT_REQUIRED',evidence:[],network_calls:0,internal_only:true};
 await installEvidenceSourceStore(db);const cached=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:'GLOBAL',now});if(!strict_fresh_manual&&cached){
  const events=boundedEvents((cached.evidence||[]).map(row=>({provider_id:row.provider_id,event_id:row.origin_event_id,event_type:row.event_type||row.metric_family,effective_at:row.effective_at??row.effective_from,source_ts:row.source_ts,observed_ts:row.observed_ts,time_precision:row.time_precision||'DATE_ONLY'})),now);
  const evidence=events.map(row=>normalizeCalendarEvent({...row,asset_id:'GLOBAL_MACRO',htx_contract:htxContract}));
  return{...cached,contract:htxContract,evidence};
 }
 const reservationId=`EV2:${SOURCE}:${run_id}:${Math.floor(now/TTL)}`,wholeJobAdmission=typeof request_admit==='function'?request_admit({logical_request_id:reservationId,lane:'background',attempts:2}):{allowed:false,status:'WHOLE_JOB_HTTP_ADMISSION_REQUIRED'};
 if(!wholeJobAdmission.allowed)return{status:wholeJobAdmission.status,evidence:[],network_calls:0,whole_job_admission:wholeJobAdmission,internal_only:true};
 const admission=await reserveEvidenceSourceAttempts(db,{source:SOURCE,reservation_id:reservationId,attempts:2,daily_cap:DAILY_CAP,now});
 if(!admission.allowed)return{status:admission.status,evidence:[],network_calls:0,admission,internal_only:true};
 const [bls,fed]=await Promise.all([getText(fetch_impl,URLS.BLS),getText(fetch_impl,URLS.FED)]),normalized=normalizeMacroCalendar({contract:htxContract,bls_raw:bls.ok?bls.body:'',fed_raw:fed.ok?fed.body:'',observed_ts:now});
 const result={version:MACRO_CALENDAR_EVIDENCE_VERSION,...normalized,network_calls:2,cache_status:'REFRESHED',whole_job_admission:wholeJobAdmission,admission,receipts:[bls,fed].map((row,index)=>({route:index?'FED':'BLS',status:row.ok?'CLOSED':'SOURCE_ERROR',http_status:row.http_status,error:row.error})),internal_only:true};
 await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:'GLOBAL',observed_ts:now,expires_ts:now+TTL,payload:result});return result;
}

export default{parseBlsCalendar,parseFedCalendar,normalizeMacroCalendar,collectMacroCalendarEvidence};
