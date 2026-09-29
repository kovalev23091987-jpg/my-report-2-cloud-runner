import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {collectCandidateEvidenceV2} from '../files/src/candidate-evidence-v2-runtime.mjs';
import {installEvidenceSourceStore,writeEvidenceSourceCache} from '../files/src/evidence-source-store.mjs';
import {consumeEvidenceV2} from '../files/src/evidence-v2.mjs';
import {HTX_PUBLIC_RISK_EVIDENCE_VERSION} from '../files/src/htx-public-risk-evidence.mjs';

class Statement {
 constructor(db,sql,args=[]){this.db=db;this.sql=sql;this.args=args;}
 bind(...args){return new Statement(this.db,this.sql,args);}
 async run(){return this.db.sqlite.prepare(this.sql).run(...this.args);}
 async first(){return this.db.sqlite.prepare(this.sql).get(...this.args)||null;}
}
class DB {
 constructor(){this.sqlite=new DatabaseSync(':memory:');}
 prepare(sql){return new Statement(this,sql);}
 async batch(rows){this.sqlite.exec('BEGIN');try{const result=[];for(const row of rows)result.push(await row.run());this.sqlite.exec('COMMIT');return result;}catch(error){this.sqlite.exec('ROLLBACK');throw error;}}
}
const NOW=Date.parse('2026-09-29T22:00:00Z');
const rss='<rss><channel><item><guid>update-1</guid><title>Protocol update</title><link>https://abc.example/news/update</link><pubDate>Tue, 29 Sep 2026 21:30:00 GMT</pubDate></item></channel></rss>';
async function cachedCore(db){
 await installEvidenceSourceStore(db);
 for(const [source,asset_key] of [['HTX_PUBLIC_RISK','ABC-USDT'],['MACRO_CALENDAR','GLOBAL']])await writeEvidenceSourceCache(db,{source,asset_key,observed_ts:NOW,expires_ts:NOW+60000,payload:{version:HTX_PUBLIC_RISK_EVIDENCE_VERSION,status:'CLOSED',evidence:[],network_calls:0}});
}

test('provider quota denial cannot hide the next useful official block',async()=>{
 const db=new DB();await cachedCore(db);
 await db.prepare("INSERT INTO report2_evidence_source_daily(source,day_utc,attempts,updated_at) VALUES('DERIBIT_ALT_OPTIONS','2026-09-29',168,?1)").bind(NOW).run();
 const calls=[];
 const out=await collectCandidateEvidenceV2({db,contract:'ABC-USDT',run_id:'R',now:NOW,request_admit:()=>({allowed:true}),fetch_impl:async url=>{calls.push(url);assert.equal(url,'https://abc.example/feed.xml');return new Response(rss,{headers:{'content-type':'application/rss+xml'}});},asset_metadata:{official_domains:['abc.example'],official_feeds:['https://abc.example/feed.xml']}});
 assert.equal(out.sources.DERIBIT_ALT_OPTIONS.status,'DAILY_CAP_OR_DUPLICATE');
 assert.equal(out.sources.OFFICIAL_EVENTS.status,'CLOSED');assert.equal(out.block_coverage.blocks.N07.observed_facts,1);
 assert.equal(out.network_calls,1);assert.equal(calls.length,1);assert.ok(out.shared_http_envelope.reserved_attempts<=5);
 assert.equal(consumeEvidenceV2(out.evidence,{base_interest:70,decision_ts:NOW}).adjustment,0);
});

test('cold HTX and macro refresh share five calls, no supplementary overrun',async()=>{
 const db=new DB();let calls=0;
 const out=await collectCandidateEvidenceV2({db,contract:'ABC-USDT',run_id:'R',now:NOW,clock:()=>NOW,pause_impl:async()=>{},request_admit:()=>({allowed:true}),fetch_impl:async url=>{calls++;return String(url).includes('hbdm.com')?new Response(JSON.stringify({status:'ok',ts:NOW,data:[{contract_code:'ABC-USDT',open:1}]})):new Response('');}});
 assert.equal(calls,5);assert.equal(out.network_calls,5);assert.equal(out.shared_http_envelope.reserved_attempts,5);
 assert.equal(out.sources.DERIBIT_ALT_OPTIONS.status,'DEFERRED_SHARED_REQUEST_ENVELOPE');
});
