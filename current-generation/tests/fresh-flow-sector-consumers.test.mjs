import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {signedTapeFourHourFlow} from '../files/src/htx-signed-tape.mjs';
import {reviewSectorRelativeStrength,verifySectorRelativeStrengthReviews} from '../files/src/sector-relative-strength-review.mjs';
import {auditCanonicalBlockDecisionUse} from '../files/src/block-decision-use-audit.mjs';
import {consumeBlockResultContext} from '../files/src/block-result-context.mjs';
import {finalizeCandidateBlockCoverage} from '../files/src/candidate-evidence-v2-runtime.mjs';
import {validateEvidenceV2} from '../files/src/evidence-v2.mjs';
const gz=fs.readFileSync(new URL('./fixtures/exact-current-37395903856.json.gz',import.meta.url));
assert.equal(createHash('sha256').update(gz).digest('hex'),'d3e6ac9394f57739a1ea7ffe89a4aade9ff52a52fd271f5612fdf17f575dc50f');
const bytes=gunzipSync(gz);assert.equal(createHash('sha256').update(bytes).digest('hex'),'43449786afe1e42c67c129ac1cf82b5f2e2c5efba8da2a0ad3d89edb952c3388');
const fixture=JSON.parse(bytes),lsk=fixture.rows.find(r=>r.contract_code==='LSK-USDT');
const args=c=>({evidence:c.metadata.internal_market_context.evidence_v2.evidence,contract:c.metadata.contract,run_id:c.run_id,snapshot_id:c.snapshot_id,decision_ts:c.observed_ts});
test('actual 03:35 exact saved LSK and NEAR 240-minute raw flow closes at original cutoff without hourly OI alignment',()=>{
 for(const row of fixture.rows){
  const c=row.canonical,result=signedTapeFourHourFlow({ring:row.tape.ring,contract:row.contract_code,now:c.observed_ts});
  assert.equal(result.status,'CLOSED_EXACT_FUTURES_FLOW_4H');assert.equal(result.network_calls,0);
  const e=result.evidence[0];assert.equal(e.verified_minutes,240);assert.equal(e.raw_trade_count,row.contract_code==='LSK-USDT'?731:1025);
  assert.equal(e.publication_freshness_ms,300000);assert.ok(c.observed_ts-e.window_end_ts<=300000);
  assert.equal(e.window_end_ts-e.window_start_ts,14400000);assert.equal(e.directional_strength,null);assert.equal(e.risk_strength,null);
  assert.equal(validateEvidenceV2(e,{decision_ts:c.observed_ts}).usable,true);
  const final=finalizeCandidateBlockCoverage({evidence_result:{evidence:[],decision_ts:c.observed_ts},decision_ts:c.observed_ts,primary_sources:{PRIMARY_HTX_FUTURES_FLOW:result}});
  assert.equal(final.block_coverage.blocks.N05.usable_facts,1);
  const context=consumeBlockResultContext({evidence:result.evidence,contract:row.contract_code,now:c.observed_ts});assert.ok(context.facts.some(f=>f.block_id==='N05'));
  assert.equal(e.score_contribution,0);assert.equal(e.entry_authorized,false);
 }
});
test('actual raw flow refuses gaps, corruption, wrong contract, future observation and stale windows',()=>{
 for(const mutate of [r=>r.minutes.pop(),r=>r.minutes[0].raw_sha256='0'.repeat(64),r=>r.contract='OTHER-USDT']){
  const ring=structuredClone(lsk.tape.ring);mutate(ring);
  // Hash mutation must affect the selected four-hour interval.
  if(ring.minutes[0]?.raw_sha256==='0'.repeat(64))ring.minutes.at(-1).raw_sha256='0'.repeat(64);
  const result=signedTapeFourHourFlow({ring,contract:'LSK-USDT',now:lsk.canonical.observed_ts});
  if(ring.minutes.length===lsk.tape.ring.minutes.length-1){
   // A different still complete fresh window is permitted; a genuine internal gap is not.
   ring.minutes.splice(ring.minutes.length-120,1);
   assert.equal(signedTapeFourHourFlow({ring,contract:'LSK-USDT',now:lsk.canonical.observed_ts}).check_completed,false);
  }else assert.equal(result.check_completed,false);
 }
 assert.equal(signedTapeFourHourFlow({ring:lsk.tape.ring,contract:'LSK-USDT',now:lsk.tape.ring.observed_ts-1}).check_completed,false);
 const end=lsk.tape.ring.minutes.at(-1).start_ts+60000;
 assert.equal(signedTapeFourHourFlow({ring:lsk.tape.ring,contract:'LSK-USDT',now:end+300001}).check_completed,false);
});
test('actual 19-peer LSK sector basket gets a bound unscored assigned review, not a fake direction or score',()=>{
 const c=structuredClone(lsk.canonical),before=auditCanonicalBlockDecisionUse(c,{manual:lsk.actual_report_manual_text});
 assert.equal(before.participating_block_count,7);assert.equal(before.blocks.N15.participating,false);
 const review=reviewSectorRelativeStrength(args(c));assert.equal(review.receipts.length,1);
 assert.equal(review.receipts[0].eligible_peers,19);assert.equal(review.receipts[0].sector_relationship,'BELOW_PEER_MEDIAN');
 assert.equal(review.receipts[0].score_contribution,0);assert.equal(review.receipts[0].control_effect,false);
 c.metadata.sector_relative_strength_review=review;
 const after=auditCanonicalBlockDecisionUse(c,{manual:lsk.actual_report_manual_text});
 assert.equal(after.participating_block_count,8);assert.equal(after.blocks.N15.participation_status,'UNSCORED_DIAGNOSTIC_AND_RENDERING_PROVEN');
 assert.equal(after.blocks.N15.source_accounting.used_provider_count,1);assert.equal(after.score_applied_block_count,0);
 assert.equal(c.direction,null);assert.equal(c.state,'REJECTED');assert.equal(c.metadata.supplemental_score_adjustment.status,'BASE_SCORE_MISSING');
 // This is component replay at the immutable original time, never a new live 8-block receipt.
 const hidden=auditCanonicalBlockDecisionUse(c,{manual:''});assert.equal(hidden.blocks.N15.participating,false);
});
test('sector review rejects arithmetic, peer identity/time, provider, snapshot and receipt substitution',()=>{
 const c=lsk.canonical,base=args(c),sector=base.evidence.find(r=>r.block_id==='N15');
 for(const mutate of [r=>r.relative_strength_pct_points=4,r=>r.peers[0].change_24h_pct=900,r=>r.peers[0].id=r.peers[1].id,r=>r.peers[0].source_ts=base.decision_ts+1,r=>r.eligible_peers=18,r=>r.provider_id='UNVERIFIED_PROVIDER']){
  const row=structuredClone(sector);mutate(row);assert.equal(reviewSectorRelativeStrength({...base,evidence:[row]}).receipts.length,0);
 }
 const good=reviewSectorRelativeStrength(base),bad=structuredClone(good);bad.receipts[0].eligible_peers=20;
 assert.equal(verifySectorRelativeStrengthReviews(bad,base).length,0);
 assert.equal(verifySectorRelativeStrengthReviews(good,{...base,run_id:'OTHER_RUN'}).length,0);
 assert.equal(reviewSectorRelativeStrength({...base,snapshot_id:'OTHER'}).receipts.length,0);
});
