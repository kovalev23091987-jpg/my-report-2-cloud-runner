import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {parseHtxAnnouncementCatalog,normalizeHtxAnnouncements,collectHtxOfficialAnnouncements,HTX_OFFICIAL_ANNOUNCEMENTS_URL} from '../files/src/htx-official-announcements-evidence.mjs';
import {consumeBlockResultContext} from '../files/src/block-result-context.mjs';
import {auditCandidateBlocks,planCandidateEvidenceRoutes} from '../files/src/candidate-evidence-v2-runtime.mjs';
import {consumeEvidenceV2} from '../files/src/evidence-v2.mjs';

class Statement{constructor(db,sql,args=[]){this.db=db;this.sql=sql;this.args=args;}bind(...args){return new Statement(this.db,this.sql,args);}async run(){return this.db.sqlite.prepare(this.sql).run(...this.args);}async first(){return this.db.sqlite.prepare(this.sql).get(...this.args)||null;}}
class DB{constructor(){this.sqlite=new DatabaseSync(':memory:');}prepare(sql){return new Statement(this,sql);}async batch(rows){return Promise.all(rows.map(row=>row.run()));}}
const NOW=Date.parse('2026-10-05T12:00:00Z');
const cards=Array.from({length:12},(_,i)=>`<a href="/support/${1000+i}"><h3>${i===0?'HTX adjusts ZEC/USDT perpetual futures limits':`HTX launches ASSET${i}/USDT perpetual futures`}</h3><time>${i===0?'10/05 10:00:00':'09/20 08:00:00'} (UTC)</time></a>`).join('');
const HTML=`<!doctype html><html><body>${cards}</body></html>`;
const facts=(evidence,contract)=>consumeBlockResultContext({evidence,contract,now:NOW}).facts;

test('shared official HTX catalog gives exact-contract N07 context without a score',()=>{
 const catalog=parseHtxAnnouncementCatalog({body:HTML,observed_ts:NOW}),out=normalizeHtxAnnouncements({contract:'ZEC-USDT',catalog,observed_ts:NOW,response_sha256:'a'.repeat(64)});
 assert.equal(catalog.status,'CLOSED');assert.equal(out.status,'CLOSED');assert.equal(out.evidence.length,1);assert.equal(facts(out.evidence,'ZEC-USDT').length,1);assert.equal(consumeEvidenceV2(out.evidence,{base_interest:70,decision_ts:NOW}).adjustment,0);assert.equal(out.evidence[0].common_upstream_not_independent_vote,true);
});
test('a closed catalog can state only its own bounded absence, never all-channel absence',()=>{
 const catalog=parseHtxAnnouncementCatalog({body:HTML,observed_ts:NOW}),out=normalizeHtxAnnouncements({contract:'ETC-USDT',catalog,observed_ts:NOW,response_sha256:'b'.repeat(64)}),fact=facts(out.evidence,'ETC-USDT')[0];
 assert.equal(out.status,'CLOSED_BOUNDED_HTX_ANNOUNCEMENT_CHECK');assert.equal(out.evidence[0].all_htx_announcement_channels_checked,false);assert.match(fact.value,/только эта лента/);
 const audit=auditCandidateBlocks({sources:{HTX_OFFICIAL_ANNOUNCEMENTS:out},evidence:out.evidence,decision_ts:NOW});assert.equal(audit.blocks.N07.checked,true);assert.equal(audit.blocks.N07.observed_facts,1);assert.equal(audit.blocks.N07.usable_facts,0);assert.equal(audit.blocks.N07.decision_path,'ADMITTED_NEUTRAL_CONTEXT');
});
test('truncated, sparse, redirected and wrong-market catalogs never close N07',async()=>{
 for(const body of [HTML.slice(0,-7),'<html><a href="/support/1">one</a></html>',HTML.replaceAll('/support/','https://evil.example/support/')])assert.notEqual(parseHtxAnnouncementCatalog({body,observed_ts:NOW}).status,'CLOSED');
 assert.equal(normalizeHtxAnnouncements({contract:'A-USDT',catalog:{status:'CLOSED',schema_checked:true,entries:Array(10).fill({title:'B/USDT',url:'https://www.htx.com/support/1',source_ts:NOW})},observed_ts:NOW,response_sha256:'c'.repeat(64)}).events.length,0);
 let calls=0;const result=await collectHtxOfficialAnnouncements({db:new DB(),contract:'ZEC-USDT',run_id:'R',now:NOW,request_admit:()=>({allowed:true}),fetch_impl:async()=>{calls++;return{ok:true,status:200,url:'https://www.htx.com/redirect',text:async()=>HTML};}});assert.equal(result.status,'SOURCE_ERROR');assert.equal(result.evidence.length,0);assert.equal(calls,1);
});
test('one admitted six-hour catalog request is shared by every exact futures contract',async()=>{
 const db=new DB();let calls=0,admissions=0;const base={db,now:NOW,run_id:'JOINT',request_admit:()=>{admissions++;return{allowed:true};},fetch_impl:async()=>{calls++;return{ok:true,status:200,url:HTX_OFFICIAL_ANNOUNCEMENTS_URL,text:async()=>HTML};}};
 const first=await collectHtxOfficialAnnouncements({...base,contract:'ZEC-USDT'}),second=await collectHtxOfficialAnnouncements({...base,contract:'ETC-USDT'});assert.equal(first.network_calls,1);assert.equal(second.network_calls,0);assert.equal(second.cache_status,'CURRENT_RUN_SHARED_HIT');assert.equal(calls,1);assert.equal(admissions,1);
 assert.equal(planCandidateEvidenceRoutes({contract:'任意-USDT'}).routes.some(row=>row.name==='HTX_ANNOUNCEMENTS'),true);
});
