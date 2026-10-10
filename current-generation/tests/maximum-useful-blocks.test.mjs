import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildCanonicalExecutionEvidence,consumeCanonicalExecutionContext} from '../files/src/execution-report-context.mjs';
import {auditCandidateBlocks,finalizeCandidateBlockCoverage,capabilityCheckedNoExactRoute} from '../files/src/candidate-evidence-v2-runtime.mjs';
import {buildSupplementalScoreEvidence,applySupplementalScoreAdjustment} from '../files/src/supplemental-score-evidence.mjs';
import {auditCanonicalBlockDecisionUse} from '../files/src/block-decision-use-audit.mjs';
import {auditRenderedBlockResults} from '../files/src/block-result-context.mjs';
import {enforceManualBlockCoverage,formatManualRunSummary} from '../files/src/manual-run-summary.mjs';
import {buildEvidenceV2} from '../files/src/evidence-source-adapters.mjs';
import {observeHtxTechnicalSnapshot,clearHtxTechnicalSnapshots,readHtxTechnicalStructure} from '../files/src/htx-technical-structure.mjs';
const fixture=JSON.parse(fs.readFileSync(new URL('../../checkpoints/execution-context-source-20261004.json',import.meta.url)));
const src=fixture.rows[0];
function identity(){return {contract:src.contract_code,run_id:fixture.origin_run_id,snapshot_id:src.bundle.snapshot_id,observed_ts:src.observed_ts,execution_context_source:structuredClone(src)};}
test('real immutable execution facts are assessed and rendered in the same snapshot, without changing score or granting entry',()=>{
 const id=identity(),context=consumeCanonicalExecutionContext(id),evidence=buildCanonicalExecutionEvidence(id);assert.deepEqual(evidence.map(r=>r.block_id),['N11','N16']);
 const sources={PRIMARY_EXECUTION_STRESS:{status:'CLOSED',check_completed:true},PRIMARY_EXECUTION_COST:{status:'CLOSED',check_completed:true}};
 const market={internal_only:true,decision_ts:id.observed_ts,evidence_v2:{evidence,sources,block_coverage:auditCandidateBlocks({evidence,sources,decision_ts:id.observed_ts})}};
 const score=applySupplementalScoreAdjustment(70,buildSupplementalScoreEvidence({direction:'LONG',internal_market_context:market}));
 assert.equal(score.adjustment,0);assert.equal(score.final_score,70);assert.equal(score.receipts.length,2);assert.ok(score.receipts.every(r=>r.score_contribution===0));
 const canonical={...id,direction:'LONG',metadata:{contract:id.contract,supporting_context:{facts:context.facts},execution_context_source:id.execution_context_source,internal_market_context:market,supplemental_score_adjustment:score}};
 const manual={ok:true,text:context.facts.map(f=>`- ${f.label}: ${f.value}`).join('\n')};
 const audit=auditCanonicalBlockDecisionUse(canonical,{manual});assert.deepEqual(audit.participating_block_ids,['N11','N16']);assert.equal(audit.score_applied_block_count,0);assert.equal(audit.all_blocks_have_proven_decision_effect,false);
 assert.equal(auditCanonicalBlockDecisionUse(canonical).participating_block_count,0,'stored context is not rendering proof');
 const row={...id,canonical:{...id,status:'CLOSED',state:'REJECTED',data_quality:{sufficient:false}},block_rendered_results:auditRenderedBlockResults({canonical,manual}),manual_text:manual.text};
 const text=formatManualRunSummary({status:'PARTIAL_DATA_UNAVAILABLE',run_id:id.run_id,candidates:[row]});
 assert.equal((text.match(/Измеренная глубина стакана/g)||[]).length,1);assert.equal((text.match(/Издержки входа и выхода/g)||[]).length,2);assert.match(text,/не входить/);
 for(const mutate of [x=>x.snapshot_id='foreign',x=>x.execution_context_source.bundle.execution_gate.factual_basis.facts.valid_until_ts=x.observed_ts-1,x=>x.execution_context_source.bundle.execution_gate.factual_basis.plans.LONG.round_trip_quote_loss_ex_fees_funding=0]){const changed=identity();mutate(changed);assert.deepEqual(buildCanonicalExecutionEvidence(changed),[]);}
});
test('technical response retains first acquisition time and is audited at the final decision clock',()=>{
 const now=Date.parse('2026-10-05T12:00:00Z'),duration=3600000,end=Math.floor(now/duration)*duration;
 const payload={status:'ok',ch:'market.BR-USDT.kline.60min',ts:now,data:Array.from({length:20},(_,i)=>({id:(end-20*duration+i*duration)/1000,open:1,high:2,low:1,close:1.5}))};
 clearHtxTechnicalSnapshots();observeHtxTechnicalSnapshot(payload,'https://api.hbdm.com/linear-swap-ex/market/history/kline?contract_code=BR-USDT&period=60min',now+100);
 const evidence=readHtxTechnicalStructure({contract:'BR-USDT',now:now+200});assert.equal(evidence[0].first_known_ts,now+100);
 const prior=finalizeCandidateBlockCoverage({evidence_result:{decision_ts:now-100,evidence:[]},primary_sources:{PRIMARY_TECHNICAL_CONTEXT:{status:'CLOSED',check_completed:true,evidence}},decision_ts:now+200});
 assert.equal(prior.decision_ts,now+200);assert.equal(prior.block_coverage.blocks.N10.valid_context_facts,1);assert.deepEqual(prior.block_coverage.blocks.N10.evidence_rejection_reasons,{ZERO_DECISION_COVERAGE:1});
 assert.equal(readHtxTechnicalStructure({contract:'BR-USDT',now:now+180001}).length,0);clearHtxTechnicalSnapshots();
});
test('maximum-useful report accepts honestly accounted optional gaps and never turns them into checked blocks',()=>{
 const now=src.observed_ts,source=capabilityCheckedNoExactRoute({contract:'ZEC-USDT',identity_method:'HTX_OFFICIAL_NATIVE_CURRENCY_NETWORK',asset_identity:{chain:'zcash',asset_kind:'NATIVE',native_asset_id:'zcash:mainnet',contract_or_mint:null},now},'CHAIN_SUPPLY','NO_NATIVE_ADAPTER');
 const coverage=auditCandidateBlocks({sources:{CHAIN_SUPPLY:source},decision_ts:now});assert.equal(coverage.blocks.N02.checked,false);assert.equal(coverage.blocks.N02.included_in_active_coverage,false);
 const result=enforceManualBlockCoverage({status:'CLOSED',source:'manual',candidates:[{block_coverage:coverage,canonical:{state:'REJECTED',data_quality:{sufficient:false}}}]});assert.equal(result.status,'CLOSED');assert.equal(result.block_audit.minimum_checked_block_count,0);assert.equal(result.block_audit.all_candidates_data_sufficient,false);assert.equal(result.block_audit.full_15_per_candidate_required,false);
 assert.match(formatManualRunSummary(result),/0 из 13/);assert.match(formatManualRunSummary(result),/не входить/);
});
test('real neutral execution facts retain consumer review without base score or direction; no invented score or entry',()=>{
 const id=identity(),context=consumeCanonicalExecutionContext(id),evidence=buildCanonicalExecutionEvidence(id);
 const market={decision_ts:id.observed_ts,evidence_v2:{evidence}};
 const inputs=buildSupplementalScoreEvidence({direction:null,internal_market_context:market});
 const review=applySupplementalScoreAdjustment(null,inputs);
 assert.equal(review.status,'BASE_SCORE_MISSING');assert.equal(review.base_score,null);assert.equal(review.final_score,null);assert.equal(review.adjustment,0);assert.equal(review.receipts.length,2);
 const canonical={...id,direction:null,metadata:{contract:id.contract,supporting_context:{facts:context.facts},execution_context_source:id.execution_context_source,internal_market_context:market,supplemental_score_adjustment:review}};
 const manual={ok:true,text:context.facts.map(f=>`- ${f.label}: ${f.value}`).join('\n')};
 const audit=auditCanonicalBlockDecisionUse(canonical,{manual});assert.deepEqual(audit.participating_block_ids,['N11','N16']);assert.equal(audit.score_applied_block_count,0);assert.equal(audit.direction_closed,false);assert.equal(audit.all_blocks_have_proven_decision_effect,false);
 evidence[0].risk_strength=.5;assert.equal(buildSupplementalScoreEvidence({direction:null,internal_market_context:market}).length,1,'risk scoring is not silently neutralized');
 market.decision_ts=id.observed_ts+600000;assert.equal(buildSupplementalScoreEvidence({direction:null,internal_market_context:market}).length,0,'expired facts are never revived');
});
