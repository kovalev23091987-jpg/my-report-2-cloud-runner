import crypto from 'node:crypto';
import {exactNativeSectorBinding} from './coingecko-sector-evidence.mjs';
import {normalizeOfficialEvent,buildEvidenceV2,SOURCE_POLICIES} from './evidence-source-adapters.mjs';
import {installEvidenceSourceStore,reserveEvidenceSourceAttempts,readEvidenceSourceCache,writeEvidenceSourceCache} from './evidence-source-store.mjs';

export const OFFICIAL_EVENTS_EVIDENCE_VERSION='official-events-evidence-v10-validated-bounded-feed-20261005';
const SOURCE='OFFICIAL_EVENTS',TTL=SOURCE_POLICIES[SOURCE].ttl_ms,DAILY_CAP=SOURCE_POLICIES[SOURCE].daily_cap,MAX_BYTES=512*1024;
const text=value=>String(value??'').trim(),digest=value=>crypto.createHash('sha256').update(String(value)).digest('hex');
const decode=value=>text(value).replace(/^<!\[CDATA\[|\]\]>$/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").trim();
const tag=(body,name)=>decode(body.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`,'i'))?.[1]||'');
const stamp=value=>{const n=Date.parse(text(value));return Number.isFinite(n)?n:null;};
const hostOf=value=>{try{const url=new URL(value);return url.protocol==='https:'?url.hostname.toLowerCase():null;}catch{return null;}};
const hostAllowed=(host,domains)=>Boolean(host&&domains.some(domain=>host===domain||host.endsWith(`.${domain}`)));
function authorizedPublisherSpec(url,metadata){
 const domains=metadata?.official_domains||[];
 return(metadata?.official_feed_specs||[]).find(spec=>spec?.url===url&&spec.format==='RSS'&&spec.parser_id==='FIXED_RSS_V1'&&/^[a-z0-9_-]{2,64}$/.test(spec.publisher_account||'')&&url===`https://medium.com/feed/@${spec.publisher_account}`&&hostAllowed(hostOf(spec.publisher_authorization_url),domains))||null;
}
const exactUrl=(value,domains)=>{try{const url=new URL(decode(value));return url.protocol==='https:'&&hostAllowed(url.hostname.toLowerCase(),domains)?url.href:null;}catch{return null;}};
const atomLink=body=>decode(body.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/i)?.[1]||'');
const unfoldIcs=body=>text(body).replace(/\r\n[ \t]/g,'').replace(/\n[ \t]/g,'');
const icsDate=value=>{const raw=text(value);if(/^\d{8}T\d{6}Z$/.test(raw))return Date.UTC(+raw.slice(0,4),+raw.slice(4,6)-1,+raw.slice(6,8),+raw.slice(9,11),+raw.slice(11,13),+raw.slice(13,15));if(/^\d{8}$/.test(raw))return Date.UTC(+raw.slice(0,4),+raw.slice(4,6)-1,+raw.slice(6,8));return stamp(raw);};
const flattenJson=value=>Array.isArray(value)?value.flatMap(flattenJson):value&&typeof value==='object'?[value,...Object.values(value).flatMap(flattenJson)]:[];
function chainlinkWebflowEvents(raw,domains,feed,now){
 let feedPath='';try{feedPath=new URL(feed).pathname;}catch{}
 if(!domains.includes('chain.link')||feedPath!=='/newsroom')return[];
 const events=[];
 const cards=raw.matchAll(/<a\b(?=[^>]*\bdata-wf-cms-context=["'][^"']+["'])(?=[^>]*\bclass=["'][^"']*(?:media-card-5|media-card)[^"']*["'])[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi);
 for(const match of cards){
  const url=exactUrl(match[1],domains),body=match[2],title=decode(body.match(/<h[1-6]\b(?=[^>]*\bfs-list-field=["']title["'])[^>]*>([\s\S]*?)<\/h[1-6]>/i)?.[1]||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim(),dateText=decode(body.match(/<div\b[^>]*class=["'][^"']*eyebrow[^"']*["'][^>]*>\s*((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},\s+\d{4})\s*<\/div>/i)?.[1]||''),published=stamp(dateText);
  if(!url||!title||published===null||published>now||published<now-7*24*60*60_000)continue;
  events.push({event_id:digest(`${url}|${published}|${title}`),title:title.slice(0,240),source_ts:published,effective_at:published,effective_to:null,official_url:url,format:'HTML'});
 }
 return events;
}
function htmlStructuredEvents(raw,domains,feed,now){
 const events=[];
 for(const match of raw.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
  let parsed;try{parsed=JSON.parse(decode(match[1]));}catch{continue;}
  for(const row of flattenJson(parsed)){
   const kind=text(row?.['@type']).toLowerCase();if(!['article','newsarticle','blogposting','pressrelease'].includes(kind))continue;
   const published=stamp(row.datePublished),url=exactUrl(typeof row.url==='string'?row.url:row.mainEntityOfPage?.['@id']||row.mainEntityOfPage,domains),title=text(row.headline||row.name).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
   if(published===null||published>now||published<now-7*24*60*60_000||!url||!title)continue;
   events.push({event_id:text(row.identifier?.value||row.identifier)||digest(`${url}|${published}|${title}`),title:title.slice(0,240),source_ts:published,effective_at:published,effective_to:null,official_url:url,format:'HTML'});
  }
 }
 events.push(...chainlinkWebflowEvents(raw,domains,feed,now));
 const unique=[...new Map(events.map(row=>[row.event_id,row])).values()].sort((a,b)=>b.effective_at-a.effective_at).slice(0,16);
 return{status:unique.length?'CLOSED':raw.includes('application/ld+json')||raw.includes('data-wf-cms-context')?'EMPTY_OR_STALE':'HTML_SCHEMA_NOT_CLOSED',events:unique,feed_url:feed};
}

export function parseOfficialFeed({body,content_type='',feed_url,official_domains=[],expected_format=null,publisher_account=null,now=Date.now()}={}){
 const domains=(official_domains||[]).map(x=>text(x).toLowerCase()).filter(Boolean),feed=exactUrl(feed_url,domains);if(!feed)return{status:'EXACT_OFFICIAL_FEED_REQUIRED',events:[]};
 const raw=text(body);if(!raw||Buffer.byteLength(raw)>MAX_BYTES)return{status:raw?'RESPONSE_TOO_LARGE':'EMPTY',events:[]};const events=[],detected=/text\/calendar|BEGIN:VCALENDAR/i.test(`${content_type}\n${raw.slice(0,200)}`)?'ICS':/<feed\b/i.test(raw.slice(0,1000))?'ATOM':/<rss\b|<item\b/i.test(raw.slice(0,1000))?'RSS':/text\/html|<!doctype html|<html\b/i.test(`${content_type}\n${raw.slice(0,1000)}`)?'HTML':'UNKNOWN',expected=text(expected_format).toUpperCase()||null;if(expected&&(!['RSS','ATOM','ICS','HTML'].includes(expected)||detected!==expected))return{status:'PARSER_FORMAT_MISMATCH',events:[],expected_format:expected,detected_format:detected};
 if(detected==='HTML')return htmlStructuredEvents(raw,domains,feed,now);
 if(detected==='UNKNOWN')return{status:'SOURCE_FEED_SCHEMA_NOT_CLOSED',events:[]};
 if(publisher_account){
  const account=String(publisher_account).toLowerCase(),channel=raw.split(/<item\b/i)[0],home=tag(channel,'link');let valid=false;
  try{const u=new URL(home);valid=detected==='RSS'&&u.protocol==='https:'&&u.hostname==='medium.com'&&u.pathname.toLowerCase()===`/@${account}`&&feed===`https://medium.com/feed/@${account}`;}catch{}
  if(!valid)return{status:'OFFICIAL_PUBLISHER_NOT_CLOSED',events:[]};
 }
 if(detected==='ICS'){
  for(const block of unfoldIcs(raw).match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/gi)||[]){const read=name=>decode(block.match(new RegExp(`(?:^|\\n)${name}(?:;[^:]*)?:([^\\n\\r]*)`,'i'))?.[1]||''),start=icsDate(read('DTSTART')),end=icsDate(read('DTEND')),updated=icsDate(read('LAST-MODIFIED'))??icsDate(read('DTSTAMP'))??(start!==null&&start<=now?start:null),url=exactUrl(read('URL'),domains)||feed,uid=read('UID')||digest(`${url}|${start}|${read('SUMMARY')}`);if(updated===null||updated>now||start===null||start<now-24*60*60_000||start>now+90*24*60*60_000)continue;events.push({event_id:uid,title:read('SUMMARY').slice(0,240),source_ts:updated,effective_at:start,effective_to:end,official_url:url,format:'ICS'});}
 }else{
  const rows=[...(raw.match(/<item\b[\s\S]*?<\/item>/gi)||[]),...(raw.match(/<entry\b[\s\S]*?<\/entry>/gi)||[])];
  for(const row of rows){const published=stamp(tag(row,'pubDate')||tag(row,'published')||tag(row,'updated')),url=exactUrl(tag(row,'link')||atomLink(row),domains),title=tag(row,'title').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();if(published===null||!url||published<now-7*24*60*60_000||published>now)continue;if(publisher_account&&!(new URL(url).pathname.toLowerCase().startsWith(`/@${publisher_account.toLowerCase()}/`)))continue;events.push({event_id:tag(row,'guid')||tag(row,'id')||digest(`${url}|${published}|${title}`),title:title.slice(0,240),source_ts:published,effective_at:published,effective_to:null,official_url:url,format:/<entry\b/i.test(row)?'ATOM':'RSS'});}
 }
 const unique=[...new Map(events.filter(row=>text(row.title)).map(row=>[row.event_id,row])).values()].sort((a,b)=>b.effective_at-a.effective_at).slice(0,16);
 const xmlRows=detected==='RSS'?(raw.match(/<item\b[\s\S]*?<\/item>/gi)||[]):detected==='ATOM'?(raw.match(/<entry\b[\s\S]*?<\/entry>/gi)||[]):[];
 const xmlContainer=detected==='RSS'?/<rss\b[\s\S]*<channel\b[\s\S]*<\/channel>\s*<\/rss>\s*$/i.test(raw):detected==='ATOM'?/<feed\b[\s\S]*<\/feed>\s*$/i.test(raw):false;
 const datedRowsClosed=xmlRows.every(row=>{const published=stamp(tag(row,'pubDate')||tag(row,'published')||tag(row,'updated')),url=exactUrl(tag(row,'link')||atomLink(row),domains);return published!==null&&published<=now&&Boolean(url)&&Boolean(tag(row,'title'))&&(!publisher_account||new URL(url).pathname.toLowerCase().startsWith(`/@${publisher_account.toLowerCase()}/`));});
 return{status:unique.length?'CLOSED':'EMPTY_OR_STALE',events:unique,feed_schema_checked:xmlContainer&&datedRowsClosed,checked_entry_count:xmlRows.length};
}

export function normalizeOfficialFeed({contract,asset_identity,asset_metadata,feed_url,body,content_type,expected_format=null,observed_ts=Date.now()}={}){
 const htxContract=text(contract).toUpperCase(),issuerDomains=Array.isArray(asset_metadata?.official_domains)?asset_metadata.official_domains.map(x=>text(x).toLowerCase()):[],publisher=authorizedPublisherSpec(feed_url,asset_metadata),domains=publisher?['medium.com']:issuerDomains,parsed=parseOfficialFeed({body,content_type,feed_url,official_domains:domains,expected_format,publisher_account:publisher?.publisher_account||null,now:observed_ts});if(['EXACT_OFFICIAL_FEED_REQUIRED','PARSER_FORMAT_MISMATCH'].includes(parsed.status))return{status:parsed.status,evidence:[],events:[],expected_format:parsed.expected_format||expected_format,detected_format:parsed.detected_format||null,internal_only:true};
 if(asset_identity?.asset_kind==='NATIVE'&&!exactNativeSectorBinding(asset_identity,htxContract))return{status:'EXACT_NATIVE_BINDING_REQUIRED',evidence:[],events:[],internal_only:true};
 const assetId=asset_identity?.asset_kind==='NATIVE'?`${asset_identity.chain}:native:mainnet`:asset_identity?.chain&&asset_identity?.contract_or_mint?`${text(asset_identity.chain).toLowerCase()}:${text(asset_identity.contract_or_mint)}`:`htx-futures:${htxContract}`,evidence=parsed.events.map(row=>{const event=normalizeOfficialEvent({asset_id:assetId,htx_contract:htxContract,event_id:row.event_id,event_type:'OFFICIAL_ANNOUNCEMENT',effective_at:row.effective_at,source_ts:row.source_ts,observed_ts,official_url:row.official_url,confirmed:true});Object.assign(event,{event_title:row.title,event_format:row.format,effective_to:row.effective_to,source_policy:'EXACT_MANUAL_OFFICIAL_FEED_ONLY',direction_policy:'CONTEXT_ONLY_NO_KEYWORD_SENTIMENT'});return event;});return{status:parsed.status,contract:htxContract,evidence,events:parsed.events,feed_schema_checked:parsed.feed_schema_checked===true,checked_entry_count:parsed.checked_entry_count??null,...(publisher?{source_scope:'OFFICIAL_ACCOUNT_RSS_ONLY',publisher_account:publisher.publisher_account,publisher_authorization_url:publisher.publisher_authorization_url,other_announcement_channels_checked:false}:{}),internal_only:true};
}

async function fetchText(fetchImpl,url){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);try{const response=await fetchImpl(url,{headers:{accept:'application/rss+xml, application/atom+xml, text/calendar, text/html, application/xml, text/xml;q=0.9','user-agent':'My-Report-2/official-events-v1'},signal:controller.signal,redirect:'error'}),body=await response.text().catch(()=>''),finalUrl=text(response.url)||url;return{ok:response.ok,http_status:response.status,body,content_type:text(response.headers?.get?.('content-type')),final_url:finalUrl,error:response.ok?null:`HTTP_${response.status}`};}catch(error){return{ok:false,http_status:null,body:'',content_type:'',final_url:url,error:String(error?.name==='AbortError'?'TIMEOUT':error?.message||error).slice(0,160)};}finally{clearTimeout(timer);}}

export async function collectOfficialEventsEvidence({db,fetch_impl=globalThis.fetch,request_admit,contract,run_id,asset_identity,asset_metadata,now=Date.now(),strict_fresh_manual=false}={}){
 if(!db)throw new Error('OFFICIAL_EVENTS_DB_REQUIRED');const htxContract=text(contract).toUpperCase(),domains=Array.isArray(asset_metadata?.official_domains)?asset_metadata.official_domains.map(x=>text(x).toLowerCase()):[],feeds=(Array.isArray(asset_metadata?.official_feeds)?asset_metadata.official_feeds:[]).filter(url=>exactUrl(url,domains)||authorizedPublisherSpec(url,asset_metadata)),specs=(Array.isArray(asset_metadata?.official_feed_specs)?asset_metadata.official_feed_specs:[]).filter(spec=>{const format=text(spec?.format).toUpperCase(),parser=text(spec?.parser_id);return feeds.includes(text(spec?.url))&&(['RSS','ATOM','ICS'].includes(format)&&parser===`FIXED_${format}_V1`||format==='HTML'&&['FIXED_HTML_JSONLD_V1','FIXED_HTML_CHAINLINK_NEWSROOM_V1'].includes(parser));}),registered=feeds.every(url=>specs.some(spec=>text(spec.url)===url)||/\.(?:xml|rss|atom|ics)(?:$|[?#])/i.test(new URL(url).pathname));if(!/^[^\s-]+-USDT$/u.test(htxContract)||!feeds.length||!registered)return{status:'EXACT_OFFICIAL_FEED_REQUIRED',evidence:[],network_calls:0,internal_only:true};
 await installEvidenceSourceStore(db);const selected=feeds[parseInt(digest(`${run_id}:${htxContract}`).slice(0,8),16)%feeds.length],selectedSpec=specs.find(spec=>text(spec.url)===selected)||null,assetKey=`FEED:${digest(`${OFFICIAL_EVENTS_EVIDENCE_VERSION}|${htxContract}|${asset_identity?.chain||''}:${asset_identity?.contract_or_mint||''}|${domains.slice().sort().join(',')}|${selected}|${selectedSpec?.parser_id||'LEGACY_FIXED_XML'}`)}`,cached=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:assetKey,now});if(asset_identity?.asset_kind==='NATIVE'&&!exactNativeSectorBinding(asset_identity,htxContract))return{status:'EXACT_NATIVE_BINDING_REQUIRED',evidence:[],network_calls:0,internal_only:true};if(!strict_fresh_manual&&cached?.version===OFFICIAL_EVENTS_EVIDENCE_VERSION)return cached;
 const cardanoFeed=selected==='https://cardano.org/news/rss.xml',feedTTL=cardanoFeed?6*60*60_000:TTL;if(cardanoFeed&&(!exactNativeSectorBinding(asset_identity,htxContract)||asset_identity?.chain!=='cardano'||htxContract!=='ADA-USDT'))return{status:'EXACT_NATIVE_BINDING_REQUIRED',evidence:[],network_calls:0,internal_only:true};
 const reservationId=`EV2:${SOURCE}:${run_id}:${assetKey}:${Math.floor(now/TTL)}`,wholeJobAdmission=typeof request_admit==='function'?request_admit({logical_request_id:reservationId,lane:'background',attempts:1}):{allowed:false,status:'WHOLE_JOB_HTTP_ADMISSION_REQUIRED'};if(!wholeJobAdmission.allowed)return{status:wholeJobAdmission.status,evidence:[],network_calls:0,whole_job_admission:wholeJobAdmission,internal_only:true};const admission=await reserveEvidenceSourceAttempts(db,{source:SOURCE,reservation_id:reservationId,attempts:1,daily_cap:DAILY_CAP,now});if(!admission.allowed)return{status:admission.status,evidence:[],network_calls:0,admission,internal_only:true};
 if(cardanoFeed){const perFeed=await reserveEvidenceSourceAttempts(db,{source:'OFFICIAL_CARDANO_RSS',reservation_id:`${reservationId}:ROUTE`,attempts:1,daily_cap:4,now});if(!perFeed.allowed)return{status:'OFFICIAL_FEED_DAILY_CAP',evidence:[],network_calls:0,admission:perFeed,internal_only:true};}
 const raw=await fetchText(fetch_impl,selected),redirectHost=hostOf(raw.final_url),publisher=authorizedPublisherSpec(selected,asset_metadata),redirectAllowed=publisher?raw.final_url===selected:hostAllowed(redirectHost,domains),normalized=raw.ok&&redirectAllowed?normalizeOfficialFeed({contract:htxContract,asset_identity,asset_metadata,feed_url:selected,body:raw.body,content_type:raw.content_type,expected_format:selectedSpec?.format||null,observed_ts:now}):{status:raw.ok?'OFFICIAL_DOMAIN_REDIRECT_MISMATCH':'SOURCE_ERROR',contract:htxContract,evidence:[],events:[],internal_only:true},parserClosed=['CLOSED','EMPTY_OR_STALE'].includes(normalized.status),result={version:OFFICIAL_EVENTS_EVIDENCE_VERSION,...normalized,...(normalized.status==='EMPTY_OR_STALE'&&normalized.feed_schema_checked===true?{status:'CLOSED_BOUNDED_OFFICIAL_FEED_CHECK',check_completed:true}:{}),network_calls:1,cache_status:'REFRESHED',whole_job_admission:wholeJobAdmission,admission,receipts:[{route:'EXACT_OFFICIAL_FEED',status:raw.ok&&redirectAllowed&&parserClosed?'CLOSED':'SOURCE_ERROR',http_status:raw.http_status,error:!redirectAllowed?'OFFICIAL_DOMAIN_REDIRECT_MISMATCH':parserClosed?raw.error:normalized.status}],internal_only:true};
 if(raw.ok&&redirectAllowed&&normalized.status==='EMPTY_OR_STALE'&&normalized.feed_schema_checked===true){
  const format=selectedSpec?.format||(/<rss\b|<item\b/i.test(raw.body)?'RSS':/<feed\b/i.test(raw.body)?'ATOM':/BEGIN:VCALENDAR/.test(raw.body)?'ICS':null);
  if(format)result.evidence.push(buildEvidenceV2({provider_id:SOURCE,upstream_id:'OFFICIAL_PRIMARY',asset_id:asset_identity?.asset_kind==='NATIVE'?`${asset_identity.chain}:native:mainnet`:asset_identity?.chain&&asset_identity?.contract_or_mint?`${asset_identity.chain}:${asset_identity.contract_or_mint}`:`htx-futures:${htxContract}`,htx_contract:htxContract,block_id:'N07',metric_family:'OFFICIAL_FEED_BOUNDED_ABSENCE',origin_event_id:`${selected}:FEED_CHECK:${now}`,dependency_group:`OFFICIAL_FEED_QUERY:${htxContract}:${selected}:${now}`,source_ts:now,observed_ts:now,expires_at:now+TTL,coverage_status:'BOUNDED_OFFICIAL_FEED_CHECK',coverage_fraction:0,directional_strength:null,risk_strength:null,extra:{official_url:selected,feed_format:format,feed_response_sha256:digest(raw.body),source_clock_policy:'OBSERVED_OFFICIAL_FEED_QUERY',recent_event_count:0,all_official_channels_checked:false,lookback_days:format==='ICS'?null:7,future_calendar_days:format==='ICS'?90:null}}));
 }
 if(cardanoFeed)for(const row of result.evidence)row.expires_at=now+feedTTL;
 await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:assetKey,observed_ts:now,expires_ts:now+(raw.ok&&redirectAllowed&&parserClosed?feedTTL:15*60000),payload:result});return result;
}

export default{parseOfficialFeed,normalizeOfficialFeed,collectOfficialEventsEvidence};
