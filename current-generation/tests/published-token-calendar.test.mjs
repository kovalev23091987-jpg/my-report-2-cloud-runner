import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
import {extractPublishedCalendarPage,derivePublishedCalendarContext,normalizePublishedCalendar,resolvePublishedCalendarReference,publishedCalendarCandidateEligible,collectPublishedTokenCalendar} from '../files/src/published-token-calendar.mjs';
import {DatabaseSync} from 'node:sqlite';
import {consumeBlockResultContext} from '../files/src/block-result-context.mjs';
import {buildSupplementalScoreEvidence,applySupplementalScoreAdjustment} from '../files/src/supplemental-score-evidence.mjs';
import {validateEvidenceV2,consumeEvidenceV2} from '../files/src/evidence-v2.mjs';
const raw=gunzipSync(fs.readFileSync(new URL('../../audit-fixes/published-token-calendar-20261006/actual-aptos-public-page.html.gz',import.meta.url))),body=raw.toString('utf8'),SHA='9c447ba6cb77275aca337c421d7cd40fa116ad1ed830580885ce8d8abf2b536c',T=Date.parse('2026-10-05T23:47:52.429Z');
const params={contract:'APT-USDT',asset_identity:{chain:'aptos',asset_kind:'NATIVE',native_asset_id:'aptos:mainnet',contract_or_mint:null},now:T};
function database(){const sqlite=new DatabaseSync(':memory:');return{prepare(sql){const stmt=sqlite.prepare(sql);let values=[];return{bind(...v){values=v;return this;},async first(){return stmt.get(...values)||null;},async all(){return{results:stmt.all(...values)};},async run(){const ack=stmt.run(...values);return{meta:{changes:Number(ack.changes)}};}};},async batch(rows){return Promise.all(rows.map(r=>r.run()));}};}
test('actual received public page yields four distinct future cliff records at the original receipt time',async()=>{
 assert.equal(createHash('sha256').update(raw).digest('hex'),SHA);const reference=await resolvePublishedCalendarReference(params),page=extractPublishedCalendarPage(body),result=normalizePublishedCalendar({page,reference,observed_ts:T,document_sha256:SHA});
 assert.equal(result.status,'CLOSED');assert.equal(result.context.events.length,4);assert.ok(result.context.events.every(e=>e.effective_at===1791760464000));assert.deepEqual(result.context.events.map(e=>e.amount_tokens).sort((a,b)=>a-b),[1333333.3333333333,2807971.6715208334,3210144.664725,3958333.3333333335].sort((a,b)=>a-b));
 const row=result.evidence[0];assert.equal(validateEvidenceV2(row,{decision_ts:T}).usable,true);assert.equal(row.risk_strength,null);assert.equal(row.directional_strength,null);assert.equal(row.official_confirmation,false);assert.equal(row.actual_unlock_transfer_verified,false);assert.equal(row.effective_from,null);
 const facts=consumeBlockResultContext({evidence:[row],contract:'APT-USDT',now:T});assert.equal(facts.facts.length,0); // A single provider is retained, not published as consensus.
 const supplied=buildSupplementalScoreEvidence({direction:'UNKNOWN',contract:'APT-USDT',observed_ts:T,internal_market_context:{decision_ts:T,evidence_v2:{evidence:[row]}}}),assessment=applySupplementalScoreAdjustment(null,supplied);assert.equal(assessment.status,'BASE_SCORE_MISSING');assert.equal(supplied.length,0);assert.equal(consumeEvidenceV2([row],{base_interest:70,decision_ts:T}).receipts[0].reason,'BLOCK_PAUSED_BY_OWNER');
});
test('provider id, chain identity, original clocks and event uniqueness are mandatory',async()=>{
 const reference=await resolvePublishedCalendarReference(params),page=extractPublishedCalendarPage(body);
 const reject=mutate=>{const p=structuredClone(page),r=structuredClone(reference);mutate(p,r);assert.equal(derivePublishedCalendarContext({page:p,reference:r,observed_ts:T}),null);};
 reject(p=>p.emissions.geckoId='wrong-asset');reject((p,r)=>r.identity.native_asset_id='ethereum:mainnet');reject(p=>p.generatedAtSec=Math.floor(T/1000)+1);reject(p=>p.generatedAtSec=Math.floor(T/1000)-86401);reject(p=>p.emissions.upcomingEvent.push(structuredClone(p.emissions.upcomingEvent[0])));
 const c=derivePublishedCalendarContext({page,reference,observed_ts:T,now:1791760464001});assert.equal(c,null);assert.equal(publishedCalendarCandidateEligible({...params,asset_identity:{chain:'aptos',contract_or_mint:null}}),false);
});
test('modelled linear rates never become cliff token amounts, and no future record does not prove no unlocks',async()=>{
 const reference=await resolvePublishedCalendarReference(params),page=extractPublishedCalendarPage(body);page.emissions.upcomingEvent=page.emissions.upcomingEvent.map(e=>({...e,unlockType:'linear',noOfTokens:[0,e.noOfTokens[0]]}));const result=normalizePublishedCalendar({page,reference,observed_ts:T,document_sha256:SHA});assert.equal(result.check_completed,false);assert.equal(result.evidence.length,0);assert.equal(result.status,'EXACT_USABLE_PUBLISHED_CALENDAR_NOT_CONFIRMED');
});
test('full collector applies admission and caches actual response without moving original clocks',async()=>{
 const db=database();let calls=0,admissions=0;const fetch_impl=async url=>{calls++;assert.equal(url,'https://defillama.com/unlocks/aptos');return new Response(raw,{status:200});};
 const denied=await collectPublishedTokenCalendar({...params,db,run_id:'DENIED',clock:()=>T,fetch_impl,request_admit:()=>({allowed:false,status:'TEST_SOURCE_BUDGET_DENIED'})});assert.equal(denied.network_calls,0);assert.equal(calls,0);
 const first=await collectPublishedTokenCalendar({...params,db,run_id:'ORIGINAL',clock:()=>T,fetch_impl,request_admit:()=>{admissions++;return{allowed:true};}});assert.equal(first.status,'CLOSED');assert.equal(first.network_calls,1);assert.equal(first.evidence[0].observed_ts,T);assert.equal(first.receipts[0].body_sha256,SHA);
 const cached=await collectPublishedTokenCalendar({...params,now:T+1000,db,run_id:'LATER',clock:()=>T+1000,fetch_impl,request_admit:()=>{throw Error('CACHE_MUST_NOT_RESERVE_NEW_SOURCE_HTTP');}});assert.equal(cached.status,'CLOSED');assert.equal(cached.network_calls,0);assert.equal(cached.evidence[0].first_known_ts,T);assert.equal(cached.evidence[0].source_ts,first.evidence[0].source_ts);assert.equal(calls,1);assert.equal(admissions,1);
});
test('a missing provider page is cached as an unavailable route, never as zero future events',async()=>{
 const db=database();let calls=0;const query={...params,db,run_id:'NO-PAGE',clock:()=>T,fetch_impl:async()=>{calls++;return new Response('not found',{status:404});},request_admit:()=>({allowed:true})};
 const first=await collectPublishedTokenCalendar(query),cached=await collectPublishedTokenCalendar({...query,run_id:'NEXT'});assert.equal(first.status,'PUBLISHED_CALENDAR_PROVIDER_ROUTE_NOT_FOUND');assert.equal(first.check_completed,false);assert.equal(first.evidence.length,0);assert.equal(cached.network_calls,0);assert.equal(calls,1);
});
