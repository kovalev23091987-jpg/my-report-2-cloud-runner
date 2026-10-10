import test from 'node:test';
import assert from 'node:assert/strict';
import {auditCandidateBlocks,planCandidateEvidenceRoutes,buildHtxFuturesFlowPrimary} from '../files/src/candidate-evidence-v2-runtime.mjs';
import {auditCanonicalBlockDecisionUse} from '../files/src/block-decision-use-audit.mjs';
const evidence={evidence_id:'A',asset_id:'asset',htx_contract:'TEST-USDT',block_id:'N04',metric_family:'SUPPLY_TOTAL',provider_id:'REAL_RPC',upstream_id:'CHAIN',dependency_group:'SUPPLY_A',observed_ts:1000,source_ts:1000,first_known_ts:1000,coverage_status:'PARTIAL',coverage_fraction:.5,identity_status:'EXACT',finality_status:'FINAL',schema_version:'v1',validation_status:'VALID',expires_at:3000,directional_strength:1,risk_strength:null,reliability:1};
test('same-block source accounting distinguishes valid facts, actual assigned use and shared upstream',()=>{
 const other={...evidence,evidence_id:'B',provider_id:'INDEX',dependency_group:'SUPPLY_B'},rows=[evidence,other];
 const coverage=auditCandidateBlocks({evidence:rows,sources:{CHAIN_EVENTS:{status:'CLOSED',network_calls:1,evidence:[evidence]},BLOCKSCOUT_INDEX:{status:'CLOSED',evidence:[other]},COINMETRICS_SUPPLY:{status:'DAILY_CAP_OR_DUPLICATE',evidence:[]}},decision_ts:2000});
 const canonical={run_id:'RUN',snapshot_id:'SNAP',direction:'LONG',observed_ts:2000,metadata:{contract:'TEST-USDT',internal_market_context:{decision_ts:2000,evidence_v2:{evidence:rows,block_coverage:coverage}},supplemental_score_adjustment:{status:'CLOSED',base_score:70,final_score:70,receipts:[{source_id:'EVIDENCE_V2',provider_object_id:'A',score_contribution:.1,evidence_v2_receipts:[{evidence_id:'A',block_id:'N04',consumer:'TRANSFER_INVESTIGATION',reason:'CONSUMED'}]}]}}};
 const before=JSON.stringify(canonical),use=auditCanonicalBlockDecisionUse(canonical).blocks.N04.source_accounting;
 assert.equal(use.configured_route_count,2);assert.equal(use.routes_with_valid_facts,2);assert.equal(use.routes_with_actual_use,1);assert.equal(use.routes_with_nonzero_score,1);assert.equal(use.details.BLOCKSCOUT_INDEX.used_fact_count,0);assert.equal(use.details.CHAIN_EVENTS.used_fact_count,1);
 assert.equal(use.details.BLOCKSCOUT_INDEX.used_fact_count,0);
 assert.equal(use.independence_claimed,false);assert.deepEqual(use.details.BLOCKSCOUT_INDEX.declared_upstream_ids,['CHAIN']);assert.equal(JSON.stringify(canonical),before);
 canonical.metadata.internal_market_context.decision_ts=4000;
 assert.equal(auditCanonicalBlockDecisionUse(canonical).blocks.N04.source_accounting.routes_with_actual_use,0);
});
test('provider market discovery stays eligible without a chain route while chain supply remains excluded',()=>{
 const params={contract:'TEST-USDT',asset_identity:{chain:'ethereum',asset_kind:'TOKEN',contract_or_mint:'0x'+'1'.repeat(40)},asset_metadata:{coinpaprika_id:'test-token'}};
 assert.equal(planCandidateEvidenceRoutes(params).routes.some(r=>r.name==='SECTOR'),true);
 const withoutChain={...params,asset_identity:{...params.asset_identity,contract_or_mint:null}};
 assert.equal(planCandidateEvidenceRoutes(withoutChain).routes.some(r=>r.name==='SECTOR'),true);
 assert.equal(planCandidateEvidenceRoutes(withoutChain).routes.some(r=>r.name==='CHAIN_SUPPLY'),false);
 assert.equal(planCandidateEvidenceRoutes({...params,contract:'TEST-SPOT'}).routes.some(r=>r.name==='SECTOR'),false);
});
test('unclosed factual four-hour flow reports concrete failed guards without waiving any',()=>{
 const result=buildHtxFuturesFlowPrimary({contract:'TEST-USDT',trajectory:{},now:2000});
 assert.equal(result.status,'HTX_EXACT_FUTURES_FLOW_4H_NOT_CLOSED');assert.equal(result.evidence.length,0);assert.equal(result.network_calls,0);
 for(const check of ['FACTUAL_RECEIVED_240','RAW_INTEGRITY_COMPLETE','COUNTERS_EXACT'])assert.ok(result.blocking_checks.includes(check));
});
