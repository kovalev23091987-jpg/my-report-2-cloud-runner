import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {fixtureDb,NOW} from './early-evidence-repair/fixture-db.mjs';
import {runV3EarlyPersistenceSidecar} from '../../runtime/src/v3-early-sidecar.mjs';
import {bindSelectedEarlyEvidence} from '../../runtime/src/selected-early-evidence.mjs';
import {buildRuntimeCanonicalBundle} from '../../runtime/src/canonical-runtime-adapter.mjs';
import * as basis from '../../runtime/src/idea-basis-facts.mjs';
import * as pub from '../../runtime/src/canonical-publication.mjs';
const exact=JSON.parse(gunzipSync(fs.readFileSync('checkpoints/actual-current-approved-brief-37557085058.json.gz')));
const ake=exact.rows.find(r=>r.contract_code==='AKE-USDT');
assert.equal(ake.canonical.snapshot_id,'S392:AKE-USDT:1791336461166');
const proof={schema:'SUBSTANTIAL_USED_IDEA_BASIS_VALIDATION_V1',sourceHTTP:0,production_D1:0,MAIN:0,Telegram:0,new_fresh_SENT:false,cases:[],original_AKE:{run_id:ake.run_id,snapshot_id:ake.snapshot_id,presentation_hash:ake.presentation_hash}};
globalThis.fetch=async()=>{throw Error('LIVE_NETWORK_FORBIDDEN');};
async function actualEarly(contract){
 const db=fixtureDb(),cycle_context={};
 const env={DATA_DB:db,REPORT2_CURRENT_CYCLE_EARLY_PERSIST:args=>runV3EarlyPersistenceSidecar(db,{...args,cycle_context})};
 const current=JSON.parse(fs.readFileSync('current-generation/tests/early-evidence-repair/real_scans.json')).find(r=>r.ts===NOW);
 // Only market observations are actual retained input. The envelope and
 // forward plan below are explicitly controlled, not a new production signal.
 const scan={timestamp:NOW,contracts:current.contracts.map(r=>({contract_code:r[0],price:r[1],turnover_24h_usdt:r[2],symbol_fingerprint:{resolution_status:'RESOLVED_HTX_EXACT'},quality:{market_present:true},instrument_scope:{classification:'CRYPTO_CONFIRMED'},freshness:{stale:false,market_age_sec:r[7]}}))};
 await runV3EarlyPersistenceSidecar(db,{current_scan_ts:NOW,now_ts:NOW,source_run_id:'BASIS_REPLAY',cycle_context});
 const b=await bindSelectedEarlyEvidence({target:{contract},env,scan,run_id:'BASIS_REPLAY',now_ts:NOW+2000});
 assert.equal(b.status,'CLOSED');
 const c=buildRuntimeCanonicalBundle({contract,run_id:'BASIS_REPLAY',snapshot_id:`S392:${contract}:${NOW+2000}`,observed_ts:NOW+2000,discovery_row:b.candidate}).canonical;
 db.sql.close();return {c,discovery:b.candidate};
}
test('retained real QNT primary score factors explain82 without promoting sparse flow or inventing future liquidations',async()=>{
 const {c}=await actualEarly('QNT-USDT');
 assert.equal(c.scores.coin_interest_0_100,82);
 const before=JSON.stringify(c),facts=basis.usedIdeaBasisFacts(c),label=basis.factualIdeaBasis(c);
 assert.ok(facts.some(f=>f.domain==='RELATIVE_STRENGTH'),label);
 assert.ok(facts.some(f=>f.domain==='OI_ACCELERATION'),label);
 assert.ok(facts.some(f=>f.domain==='PRICE_STATE_TRANSITION'),label);
 assert.doesNotMatch(label,/ликвидационн|накоплен|покупки составили/);
 const tg=pub.renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE'});
 assert.ok(tg.ok,JSON.stringify(tg));assert.ok(tg.text.includes(label));assert.ok(tg.length<1800);
 assert.doesNotMatch(tg.text,/Выборка маленькая|открытые позиции —|\bUSD(?:T|C)?\b|Снимок рынка:/i);
 assert.equal(JSON.stringify(c),before);
 assert.match(pub.renderCanonicalManual({canonical:c}).text,new RegExp('Основа идеи:'));
 proof.real_market_replay={contract:c.metadata.contract,score:82,source_clock:NOW,scope:'ACTUAL_RETAINED_MARKET_OBSERVATIONS_WITH_REBUILT_FIXTURE_ENVELOPE_NO_NEW_SIGNAL',facts,preview:tg.text};
 proof.cases.push('REAL_QNT_PRIMARY_SCORE_FACTS');
});
test('different real selected contract has its own receipt; values and coin cannot be borrowed',async()=>{
 const {c:a}=await actualEarly('QNT-USDT'),{c:b}=await actualEarly('ADA-USDT');
 assert.notEqual(a.metadata.idea_basis_receipt.contract,b.metadata.idea_basis_receipt.contract);
 const x=structuredClone(b);x.metadata.idea_basis_receipt=a.metadata.idea_basis_receipt;
 assert.deepEqual(basis.usedIdeaBasisFacts(x),[]);
 proof.cases.push('EXACT_CONTRACT_NO_BORROWED_FACTS');
});
test('closed labels without numeric producer facts, stale input, wrong wave and unsupported direction cannot explain a score',async()=>{
 const {c}=await actualEarly('QNT-USDT');
 for(const mutate of [x=>x.metadata.idea_basis_receipt.snapshot_id='other',x=>x.metadata.idea_basis_receipt.early.early_candidate_receipt.contract='OTHER-USDT',x=>x.metadata.idea_basis_receipt.early.early_candidate_receipt.wave_id='OTHER_WAVE',x=>x.metadata.idea_basis_receipt.early.early_candidate_receipt.source_ts=NOW-16*60000,x=>x.metadata.idea_basis_receipt.early.early_candidate_receipt.direction_state='DIRECTION_NOT_CLOSED',x=>x.metadata.score_basis.selected='DEEP_CANONICAL_INTEREST_SCORE']){
  const x=structuredClone(c);mutate(x);assert.deepEqual(basis.usedIdeaBasisFacts(x),[]);
 }
 const x=structuredClone(c);x.metadata.idea_basis_receipt.early.early_candidate_receipt.evidence=x.metadata.idea_basis_receipt.early.early_candidate_receipt.evidence.map(r=>({domain:r.domain,side:r.side,status:r.status}));
 assert.deepEqual(basis.usedIdeaBasisFacts(x),[]);
 proof.cases.push('REJECTED_LABELS_CLOCKS_IDENTITY_AND_UNUSED_SCORE_BASE');
});
test('actual AKE has no future zones and tiny negativeN12; neither is a major cause',()=>{
 const c=ake.canonical,before=JSON.stringify(c),tg=pub.renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE'});
 assert.ok(tg.ok);assert.doesNotMatch(tg.text,/Основа идеи: ликвидационные|покупки составили|продажи —|Выборка маленькая/);
 assert.match(tg.text,/существенные факторы оценки не раскрыты/);
 assert.equal(JSON.stringify(c),before);assert.equal(c.scores.coin_interest_0_100,82);
 proof.old_AKE_preview=tg.text;proof.old_AKE_missing_numeric_producer_receipt=true;proof.cases.push('ACTUAL_AKE_FALSE_BASIS_AND_TRIVIAL_SAMPLE_REMOVED');
});
test('already sent AKE historical brief bytes/hash remain valid and are never resent',()=>{
 const c=ake.canonical,tg=pub.renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE',context_policy:'ORIGINAL_BRIEF_20261007'});
 assert.equal(tg.text,ake.telegram_text);
 assert.equal(pub.validatePresentation({canonical:c,manual_text:ake.manual_text,telegram_text:ake.telegram_text,direction:c.direction,lifecycle_event:'OBSERVE'}).presentation_hash,ake.presentation_hash);
 const x=structuredClone(c);x.observed_ts=basis.IDEA_BASIS_CUTOVER+1;x.analytical_fingerprint=pub.canonicalFingerprint(x);
 const old=pub.renderCanonicalTelegram({canonical:x,lifecycle_event:'OBSERVE',context_policy:'ORIGINAL_BRIEF_20261007'});
 assert.equal(pub.validatePresentation({canonical:x,manual_text:pub.renderCanonicalManual({canonical:x}).text,telegram_text:old.text,direction:x.direction,lifecycle_event:'OBSERVE'}).status,'NOT_CLOSED');
 proof.cases.push('IMMUTABLE_SENT152_AND_NEW_CUTOVER_ENFORCEMENT');
});
test.after(()=>{fs.writeFileSync('audit-output/idea-basis-proof.json',JSON.stringify(proof,null,2)+'\n');});
