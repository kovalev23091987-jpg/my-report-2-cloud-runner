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
 const ics=`BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:gov-1\r\nSUMMARY:Governance call\r\nDTSTART:20260929T120000Z\r\nDTEND:20260929T130000Z\r\nURL:https://abc.example/events/gov-1\r\nEND:VEVENT\r\nEND:VCALENDAR`,parsed=parseOfficialFeed({body:ics,content_type:'text/calendar',feed_url:'https://abc.example/calendar.ics',official_domains:['abc.example'],now:NOW});assert.equal(parsed.events.length,1);assert.equal(parsed.events[0].format,'ICS');assert.equal(parseOfficialFeed({body:rss,feed_url:'https://wrong.example/feed',official_domains:['abc.example'],now:NOW}).status,'EXACT_OFFICIAL_FEED_REQUIRED');
});
test('K16 official events uses one admitted request, caches it and blocks redirect to another host',async()=>{
 const db=new DB(),fetch_impl=async()=>({ok:true,status:200,url:'https://abc.example/feed.xml',headers:{get:()=> 'application/rss+xml'},text:async()=>rss}),base={db,fetch_impl,request_admit:()=>({allowed:true,status:'RESERVED'}),contract:'ABC-USDT',run_id:'R',asset_metadata:META,now:NOW};const first=await collectOfficialEventsEvidence(base),second=await collectOfficialEventsEvidence({...base,run_id:'R2',now:NOW+1});assert.equal(first.status,'CLOSED');assert.equal(first.network_calls,1);assert.equal(second.network_calls,0);
 const blocked=await collectOfficialEventsEvidence({...base,db:new DB(),run_id:'R3',fetch_impl:async()=>({ok:true,status:200,url:'https://evil.example/feed.xml',headers:{get:()=> 'application/rss+xml'},text:async()=>rss})});assert.equal(blocked.status,'OFFICIAL_DOMAIN_REDIRECT_MISMATCH');assert.equal(blocked.evidence.length,0);
});
test('K16 official events performs no request without exact registry metadata or admission',async()=>{
 let calls=0;const out=await collectOfficialEventsEvidence({db:new DB(),fetch_impl:async()=>{calls++;throw Error('no');},contract:'ABC-USDT',run_id:'R',asset_metadata:META,now:NOW});assert.equal(out.status,'WHOLE_JOB_HTTP_ADMISSION_REQUIRED');assert.equal(calls,0);const missing=await collectOfficialEventsEvidence({db:new DB(),contract:'ABC-USDT',run_id:'R',asset_metadata:{official_feeds:META.official_feeds},now:NOW});assert.equal(missing.status,'EXACT_OFFICIAL_FEED_REQUIRED');
});
