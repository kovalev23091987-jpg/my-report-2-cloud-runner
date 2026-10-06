import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
import {extractPublishedCalendarPage,derivePublishedCalendarContext,normalizePublishedCalendar,resolvePublishedCalendarReference,publishedCalendarCandidateEligible} from '../files/src/published-token-calendar.mjs';
import {consumeBlockResultContext} from '../files/src/block-result-context.mjs';
import {buildSupplementalScoreEvidence,applySupplementalScoreAdjustment} from '../files/src/supplemental-score-evidence.mjs';
import {validateEvidenceV2} from '../files/src/evidence-v2.mjs';
const raw=gunzipSync(fs.readFileSync(new URL('../../audit-fixes/published-token-calendar-20261006/actual-aptos-public-page.html.gz',import.meta.url))),body=raw.toString('utf8'),SHA='9c447ba6cb77275aca337c421d7cd40fa116ad1ed830580885ce8d8abf2b536c',T=Date.parse('2026-10-05T23:47:52.429Z');
const params={contract:'APT-USDT',asset_identity:{chain:'aptos',asset_kind:'NATIVE',native_asset_id:'aptos:mainnet',contract_or_mint:null},now:T};
test('actual received public page yields four distinct future cliff records at the original receipt time',async()=>{
 assert.equal(createHash('sha256').update(raw).digest('hex'),SHA);const reference=await resolvePublishedCalendarReference(params),page=extractPublishedCalendarPage(body),result=normalizePublishedCalendar({page,reference,observed_ts:T,document_sha256:SHA});
 assert.equal(result.status,'CLOSED');assert.equal(result.context.events.length,4);assert.ok(result.context.events.every(e=>e.effective_at===1791760464000));assert.deepEqual(result.context.events.map(e=>e.amount_tokens).sort((a,b)=>a-b),[1333333.3333333333,2807971.6715208334,3210144.664725,3958333.3333333335].sort((a,b)=>a-b));
 const row=result.evidence[0];assert.equal(validateEvidenceV2(row,{decision_ts:T}).usable,true);assert.equal(row.risk_strength,null);assert.equal(row.directional_strength,null);assert.equal(row.official_confirmation,false);assert.equal(row.actual_unlock_transfer_verified,false);assert.equal(row.effective_from,null);
 const facts=consumeBlockResultContext({evidence:[row],contract:'APT-USDT',now:T});assert.equal(facts.facts.length,1);assert.ok(facts.facts[0].value.includes('2026-10-11 23:14 UTC'));assert.ok(facts.facts[0].value.includes('календарь поставщика'));
 const supplied=buildSupplementalScoreEvidence({direction:'UNKNOWN',contract:'APT-USDT',observed_ts:T,internal_market_context:{decision_ts:T,evidence_v2:{evidence:[row]}}}),assessment=applySupplementalScoreAdjustment(null,supplied);assert.equal(assessment.status,'BASE_SCORE_MISSING');assert.ok(assessment.receipts.some(r=>r.provider_object_id===row.evidence_id&&r.score_contribution===0&&r.evidence_v2_receipts.some(e=>e.block_id==='N01'&&e.consumer==='SUPPORTING_RISK_RECHECK'&&e.reason==='CONSUMED')));
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
