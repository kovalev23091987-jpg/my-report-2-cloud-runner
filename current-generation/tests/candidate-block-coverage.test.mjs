import assert from 'node:assert/strict';
import {test} from 'node:test';
import {auditCandidateBlocks} from '../files/src/candidate-evidence-v2-runtime.mjs';

test('every N01–N17 block is accounted for without equating a closed transport to a useful fact',()=>{
 const now=1_800_000_000_000;
 const evidence=[{evidence_id:'supply',asset_id:'ethereum:0x1',htx_contract:'ABC-USDT',block_id:'N02',metric_family:'TOTAL_SUPPLY_OBSERVATION',provider_id:'CHAIN_RPC',upstream_id:'PUBLICNODE_RPC',dependency_group:'supply',observed_ts:now,source_ts:now,first_known_ts:now,expires_at:now+60_000,coverage_status:'CONTEXT_ONLY',coverage_fraction:0,schema_version:'v2',validation_status:'VALID',identity_status:'EXACT',finality_status:'FINAL'}];
 const result=auditCandidateBlocks({evidence,sources:{CHAIN_RPC:{status:'CLOSED'},BLUESKY_PUBLIC:{status:'ACCESS_BLOCKED_403'}},decision_ts:now});
 assert.equal(result.coverage_count,17);
 assert.equal(result.blocks.N02.status,'FACTS_PRESENT_NOT_DECISION_ADMISSIBLE');
 assert.equal(result.blocks.N02.source_statuses.CHAIN_RPC,'CLOSED');
 assert.equal(result.blocks.N06.status,'NO_FACTUAL_EVIDENCE');
 assert.equal(result.blocks.N06.source_statuses.BLUESKY_PUBLIC,'ACCESS_BLOCKED_403');
 assert.equal(result.blocks.N10.status,'NOT_IMPLEMENTED_IN_THIS_COLLECTOR');
 assert.equal(result.blocks.N13.source_statuses.SNAPSHOT_GOVERNANCE,'NOT_EVALUATED');
 assert.equal(result.all_blocks_have_useful_data,false);
});
