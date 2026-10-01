import assert from 'node:assert/strict';
import {test} from 'node:test';
import {auditCandidateBlocks} from '../files/src/candidate-evidence-v2-runtime.mjs';

test('every N01–N17 block is checked without equating a checked source to a useful fact',()=>{
 const now=1_800_000_000_000;
 const evidence=[{evidence_id:'supply',asset_id:'ethereum:0x1',htx_contract:'ABC-USDT',block_id:'N02',metric_family:'TOTAL_SUPPLY_OBSERVATION',provider_id:'CHAIN_RPC',upstream_id:'PUBLICNODE_RPC',dependency_group:'supply',observed_ts:now,source_ts:now,first_known_ts:now,expires_at:now+60_000,coverage_status:'CONTEXT_ONLY',coverage_fraction:0,schema_version:'v2',validation_status:'VALID',identity_status:'EXACT',finality_status:'FINAL'}];
 const sources={};
 for(const source of ['CHAIN_RPC','BLOCKSCOUT_INDEX','BLUESKY_PUBLIC','OFFICIAL_EVENTS','GDELT_NEWS_DISCOVERY','HTX_PUBLIC_RISK','HTX_LARGE_TRADES','MACRO_CALENDAR','SNAPSHOT_GOVERNANCE','DERIBIT_ALT_OPTIONS','COINPAPRIKA_SECTOR','COINGECKO_SECTOR','SOURCIFY_ABI'])sources[source]={status:'VALID_RESPONSE_NO_EVENT',network_calls:1};
 sources.CHAIN_RPC={status:'CLOSED',network_calls:1};sources.BLUESKY_PUBLIC={status:'ACCESS_BLOCKED_403',network_calls:1};
 const primary_checks={
  N01:{checked:true,status:'CHECKED_PRIMARY_RISK_CONTEXT',facts:0,decision_usable:false},
  N05:{checked:true,status:'CHECKED_PRIMARY_MARKET_FLOW',facts:0,decision_usable:false},
  N10:{checked:true,status:'CHECKED_PRIMARY_TECHNICAL_CONTEXT',facts:1,decision_usable:true},
  N11:{checked:true,status:'CHECKED_PRIMARY_EXECUTION_STRESS',facts:0,decision_usable:false},
  N16:{checked:true,status:'CHECKED_PRIMARY_EXECUTION_COST',facts:0,decision_usable:false},
 };
 const result=auditCandidateBlocks({evidence,sources,primary_checks,decision_ts:now});
 assert.equal(result.coverage_count,17);
 assert.equal(result.checked_block_count,17);
 assert.equal(result.all_blocks_checked,true);
 assert.equal(result.blocks.N02.status,'FACTS_PRESENT_NOT_DECISION_ADMISSIBLE');
 assert.equal(result.blocks.N02.source_statuses.CHAIN_RPC,'CLOSED');
 assert.equal(result.blocks.N06.status,'CHECKED_NO_USABLE_FACTS');
 assert.equal(result.blocks.N06.source_statuses.BLUESKY_PUBLIC,'ACCESS_BLOCKED_403');
 assert.equal(result.blocks.N10.status,'CHECKED_NO_USABLE_FACTS');
 assert.equal(result.blocks.N10.primary_pipeline.decision_usable,true);
 assert.equal(result.blocks.N13.source_statuses.SNAPSHOT_GOVERNANCE,'VALID_RESPONSE_NO_EVENT');
 assert.equal(result.all_blocks_have_useful_data,false);
});

test('missing identity, missing key and deferred routes are not counted as checked blocks',()=>{
 const sources={
  CHAIN_RPC:{status:'EXACT_ASSET_IDENTITY_REQUIRED',network_calls:0},
  BLOCKSCOUT_INDEX:{status:'WAITING_FREE_KEY',network_calls:0},
  BLUESKY_PUBLIC:{status:'EXACT_ASSET_IDENTITY_REQUIRED',network_calls:0},
  SOURCIFY_ABI:{status:'EXACT_EVM_IDENTITY_REQUIRED',network_calls:0},
  DERIBIT_ALT_OPTIONS:{status:'DEFERRED_SHARED_REQUEST_ENVELOPE',network_calls:0},
 };
 const result=auditCandidateBlocks({sources,decision_ts:1_800_000_000_000});
 assert.equal(result.all_blocks_checked,false);
 assert.equal(result.blocks.N02.checked,false);
 assert.equal(result.blocks.N04.checked,false);
 assert.equal(result.blocks.N06.checked,false);
 assert.equal(result.blocks.N14.checked,false);
 assert.equal(result.blocks.N17.checked,false);
 assert.equal(result.status,'PARTIAL_BLOCK_CHECK');
});
