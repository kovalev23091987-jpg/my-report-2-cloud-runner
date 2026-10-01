import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {parseOfficialFeed,normalizeOfficialFeed,collectOfficialEventsEvidence} from '../files/src/official-events-evidence.mjs';
import {consumeEvidenceV2} from '../files/src/evidence-v2.mjs';

class Statement{constructor(db,sql,args=[]){this.db=db;this.sql=sql;this.args=args;}bind(...args){return new Statement(this.db,this.sql,args);}async run(){return this.db.sqlite.prepare(this.sql).run(...this.args);}async first(){return this.db.sqlite.prepare(this.sql).get(...this.args)||null;}}
class DB{constructor(){this.sqlite=new DatabaseSync(':memory:');}prepare(sql){return new Statement(this,sql);}async batch(rows){this.sqlite.exec('BEGIN');try{const out=[];for(const row of rows)out.push(await row.run());this.sqlite.exec('COMMIT');return out;}catch(error){this.sqlite.exec('ROLLBACK');throw error;}}}
const NOW=Date.parse('2026-09-28T03:00:00Z'),META={official_domains:['abc.example'],official_feeds:['https://abc.example/feed.xml']};
const rss=`<rss><channel><item><guid>event-1</guid><title>Protocol update</title><link>https://abc.example/news/update</link><pubDate>Sun, 28 Sep 2026 02:30:00 GMT</pubDate></item><item><guid>bad</guid><title>Wrong host</title><link>https://attacker.example/news</link><pubDate>Sun, 28 Sep 2026 02:30:00 GMT</pubDate></item></channel></rss>`;

test('K16 official events accepts only exact-domain dated feed entries and adds no direction',()=>{
 const parsed=parseOfficialFeed({body:rss,content_type:'application/rss+xml',feed_url:META.official_feeds[0],official_domains:META.official_domains,now:NOW});assert.equal(parsed.status,'CLOSED');assert.equal(parsed.events.length,1);assert.equal(parsed.events[0].event_id,'event-1');
 const out=normalizeOfficialFeed({contract:'ABC-USDT',asset_metadata:META,feed_url:META.official_feeds[0],body:rss,content_type:'application/rss+xml',observed_ts:NOW});assert.equal(out.evidence[0].block_id,'N07');assert.equal(out.evidence[0].directional_strength,null);assert.equal(out.evidence[0].risk_strength,null);assert.equal(consumeEvidenceV2(out.evidence,{base_interest:70,decision_ts:NOW}).adjustment,0);
});
test('K16 official events parses bounded future ICS and rejects stale or nonofficial feeds',()=>{
 const ics=`BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:gov-1\r\nDTSTAMP:20260928T010000Z\r\nSUMMARY:Governance call\r\nDTSTART:20260929T120000Z\r\nDTEND:20260929T130000Z\r\nURL:https://abc.example/events/gov-1\r\nEND:VEVENT\r\nEND:VCALENDAR`,parsed=parseOfficialFeed({body:ics,content_type:'text/calendar',feed_url:'https://abc.example/calendar.ics',official_domains:['abc.example'],now:NOW});assert.equal(parsed.events.length,1);assert.equal(parsed.events[0].format,'ICS');assert.equal(parseOfficialFeed({body:rss,feed_url:'https://wrong.example/feed',official_domains:['abc.example'],now:NOW}).status,'EXACT_OFFICIAL_FEED_REQUIRED');
});
test('K16 official events enforces the registered fixed parser format',()=>{
 assert.equal(parseOfficialFeed({body:rss,content_type:'application/rss+xml',feed_url:META.official_feeds[0],official_domains:META.official_domains,expected_format:'ATOM',now:NOW}).status,'PARSER_FORMAT_MISMATCH');
 assert.equal(parseOfficialFeed({body:rss,content_type:'application/rss+xml',feed_url:META.official_feeds[0],official_domains:META.official_domains,expected_format:'RSS',now:NOW}).status,'CLOSED');
});
test('K16 official events parses only exact-domain recent JSON-LD articles from fixed HTML',()=>{
 const body=`<!doctype html><html><script type="application/ld+json">{"@context":"https://schema.org","@type":"NewsArticle","headline":"Protocol update","datePublished":"2026-09-28T02:30:00Z","url":"https://abc.example/news/update"}</script></html>`;
 const parsed=parseOfficialFeed({body,content_type:'text/html',feed_url:'https://abc.example/newsroom',official_domains:['abc.example'],expected_format:'HTML',now:NOW});assert.equal(parsed.status,'CLOSED');assert.equal(parsed.events.length,1);assert.equal(parsed.events[0].format,'HTML');
});
test('K16 official events uses one admitted request, caches it and blocks redirect to another host',async()=>{
 const db=new DB(),fetch_impl=async()=>({ok:true,status:200,url:'https://abc.example/feed.xml',headers:{get:()=> 'application/rss+xml'},text:async()=>rss}),base={db,fetch_impl,request_admit:()=>({allowed:true,status:'RESERVED'}),contract:'ABC-USDT',run_id:'R',asset_metadata:META,now:NOW};const first=await collectOfficialEventsEvidence(base),second=await collectOfficialEventsEvidence({...base,run_id:'R2',now:NOW+1});assert.equal(first.status,'CLOSED');assert.equal(first.network_calls,1);assert.equal(second.network_calls,0);
 const blocked=await collectOfficialEventsEvidence({...base,db:new DB(),run_id:'R3',fetch_impl:async()=>({ok:true,status:200,url:'https://evil.example/feed.xml',headers:{get:()=> 'application/rss+xml'},text:async()=>rss})});assert.equal(blocked.status,'OFFICIAL_DOMAIN_REDIRECT_MISMATCH');assert.equal(blocked.evidence.length,0);
});
test('K16 official events performs no request without exact registry metadata or admission',async()=>{
 let calls=0;const out=await collectOfficialEventsEvidence({db:new DB(),fetch_impl:async()=>{calls++;throw Error('no');},contract:'ABC-USDT',run_id:'R',asset_metadata:META,now:NOW});assert.equal(out.status,'WHOLE_JOB_HTTP_ADMISSION_REQUIRED');assert.equal(calls,0);const missing=await collectOfficialEventsEvidence({db:new DB(),contract:'ABC-USDT',run_id:'R',asset_metadata:{official_feeds:META.official_feeds},now:NOW});assert.equal(missing.status,'EXACT_OFFICIAL_FEED_REQUIRED');
});
test('future publication dates are not clipped into current factual evidence',()=>{
 const future=rss.replaceAll('02:30:00','04:30:00');assert.equal(parseOfficialFeed({body:future,feed_url:META.official_feeds[0],official_domains:META.official_domains,now:NOW}).events.length,0);
 const ics='BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:F\nDTSTART:20260929T120000Z\nDTSTAMP:20260929T010000Z\nURL:https://abc.example/e\nEND:VEVENT\nEND:VCALENDAR';
 for(const body of [ics,ics.replace('DTSTAMP:20260929T010000Z\n','')])assert.equal(parseOfficialFeed({body,feed_url:META.official_feeds[0],official_domains:META.official_domains,now:NOW}).events.length,0);
 const good=parseOfficialFeed({body:ics.replace('20260929T010000Z','20260928T010000Z'),feed_url:META.official_feeds[0],official_domains:META.official_domains,now:NOW});assert.equal(good.events[0].source_ts,Date.parse('2026-09-28T01:00:00Z'));assert.ok(good.events[0].effective_at>NOW);
});
test('same feed cannot carry one asset identity into another asset cache',async()=>{
 const db=new DB();let calls=0;const p={db,fetch_impl:async()=>{calls++;return new Response(rss,{headers:{'content-type':'application/rss+xml'}});},request_admit:()=>({allowed:true}),asset_metadata:META,now:NOW};
 for(const [contract,address] of [['ABC-USDT','0x'+'1'.repeat(40)],['DEF-USDT','0x'+'2'.repeat(40)]]){const r=await collectOfficialEventsEvidence({...p,contract,run_id:contract,asset_identity:{chain:'ethereum',contract_or_mint:address}});assert.equal(r.evidence[0].htx_contract,contract);assert.equal(r.evidence[0].asset_id,'ethereum:'+address);}
 assert.equal(calls,2);
});
test('failed feed requests respect backoff without repeated network calls',async()=>{
 const p={db:new DB(),contract:'ABC-USDT',run_id:'A',asset_metadata:META,now:NOW,request_admit:()=>({allowed:true})};let calls=0;p.fetch_impl=async()=>{calls++;return new Response('limited',{status:429});};
 const a=await collectOfficialEventsEvidence(p),b=await collectOfficialEventsEvidence({...p,run_id:'B',now:NOW+1000});assert.equal(a.status,'SOURCE_ERROR');assert.equal(b.status,'SOURCE_ERROR');assert.equal(b.network_calls,0);assert.equal(calls,1);
});
