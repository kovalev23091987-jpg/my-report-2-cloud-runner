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
test('K16 official events parses the fixed Chainlink newsroom Webflow cards',()=>{
 const body='<!doctype html><html><a data-wf-cms-context="item" href="https://chain.link/press-releases/swift-ledger" class="media-card-5 w-inline-block"><h3 fs-list-field="title" class="h6">Chainlink connects institutions to Swift</h3><div class="eyebrow u-color-tertiary">Sep 28, 2026</div></a></html>';
 const parsed=parseOfficialFeed({body,content_type:'text/html',feed_url:'https://chain.link/newsroom',official_domains:['chain.link'],expected_format:'HTML',now:Date.parse('2026-10-01T11:00:00Z')});assert.equal(parsed.status,'CLOSED');assert.equal(parsed.events.length,1);assert.equal(parsed.events[0].official_url,'https://chain.link/press-releases/swift-ledger');
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
 const ics='BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:F\nSUMMARY:Governance call\nDTSTART:20260929T120000Z\nDTSTAMP:20260929T010000Z\nURL:https://abc.example/e\nEND:VEVENT\nEND:VCALENDAR';
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
test('verified hosted RSS checks the exact publisher without trusting all Medium accounts',async()=>{
 const metadata={official_domains:['bitway.com'],official_feeds:['https://medium.com/feed/@bitwayofficial'],official_feed_specs:[{url:'https://medium.com/feed/@bitwayofficial',format:'RSS',parser_id:'FIXED_RSS_V1',publisher_account:'bitwayofficial',publisher_authorization_url:'https://docs.bitway.com/resources/official-links'}]};
 const body='<rss><channel><link>https://medium.com/@bitwayofficial?source=rss</link><item><guid>B1</guid><title>Protocol update</title><link>https://medium.com/@bitwayofficial/update</link><pubDate>Mon, 28 Sep 2026 02:30:00 GMT</pubDate></item></channel></rss>';
 const p={contract:'BTW-USDT',asset_identity:{chain:'bsc',contract_or_mint:'0x444045b0ee1ee319a660a5e3d604ca0ffa35acaa'},asset_metadata:metadata,feed_url:metadata.official_feeds[0],expected_format:'RSS',content_type:'application/rss+xml',observed_ts:NOW};
 const good=normalizeOfficialFeed({...p,body});assert.equal(good.status,'CLOSED');assert.equal(good.evidence.length,1);assert.equal(good.other_announcement_channels_checked,false);
 assert.equal(normalizeOfficialFeed({...p,body:body.replaceAll('@bitwayofficial','@unrelated')}).status,'OFFICIAL_PUBLISHER_NOT_CLOSED');
 assert.equal(normalizeOfficialFeed({...p,body:body.replace('@bitwayofficial/update','@unrelated/update')}).evidence.length,0);
 assert.equal(normalizeOfficialFeed({...p,body,asset_metadata:{...metadata,official_feed_specs:[]}}).status,'EXACT_OFFICIAL_FEED_REQUIRED');
 const empty=body.replace(/<item>[\s\S]*<\/item>/,'');assert.equal(normalizeOfficialFeed({...p,body:empty}).status,'EMPTY_OR_STALE');
 let calls=0;const out=await collectOfficialEventsEvidence({db:new DB(),contract:p.contract,asset_identity:p.asset_identity,asset_metadata:metadata,run_id:'HOSTED',now:NOW,request_admit:()=>({allowed:true}),fetch_impl:async url=>{calls++;assert.equal(url,p.feed_url);return new Response(body,{headers:{'content-type':'application/rss+xml'}});}});
 assert.equal(calls,1);assert.equal(out.status,'CLOSED');assert.equal(out.source_scope,'OFFICIAL_ACCOUNT_RSS_ONLY');
 assert.equal(parseOfficialFeed({body:'not a feed',feed_url:META.official_feeds[0],official_domains:META.official_domains,now:NOW}).status,'SOURCE_FEED_SCHEMA_NOT_CLOSED');
});

test('a bounded official feed absence requires intact dated publisher rows; malformed or future rows do not prove absence',()=>{
 const old=rss.replace(/<item><guid>bad<\/guid>[\s\S]*?<\/item>/,'').replaceAll('2026','2025');
 const good=parseOfficialFeed({body:old,feed_url:META.official_feeds[0],official_domains:META.official_domains,now:NOW});assert.equal(good.events.length,0);assert.equal(good.feed_schema_checked,true);
 for(const body of [old.replaceAll('2025','invalid-year'),old.replace('</rss>',''),old.replaceAll('abc.example','foreign.example'),rss.replaceAll('02:30:00','04:30:00'),old.replace('</item>',''),old.replace('</channel>','<item><title>Truncated</title></channel>'),old.replace('</channel>','<entry></entry></channel>')])assert.notEqual(parseOfficialFeed({body,feed_url:META.official_feeds[0],official_domains:META.official_domains,now:NOW}).feed_schema_checked,true);
 const modified=`<html><script type="application/ld+json">${JSON.stringify({'@type':'NewsArticle',headline:'Old article',datePublished:'2025-01-01',dateModified:new Date(NOW).toISOString(),url:'https://abc.example/old'})}</script></html>`;
 assert.equal(parseOfficialFeed({body:modified,content_type:'text/html',feed_url:'https://abc.example/news',official_domains:META.official_domains,now:NOW}).events.length,0);
});
