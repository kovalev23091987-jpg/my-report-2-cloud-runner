import assert from 'node:assert/strict';
import {test} from 'node:test';
import {auditCandidateBlocks,sourceWasActuallyChecked,sourceWasAttempted} from '../files/src/candidate-evidence-v2-runtime.mjs';
const SOURCE_NAMES=['CHAIN_SUPPLY','CHAIN_EVENTS','NANSEN_FLOWS','PRIMARY_TECHNICAL_CONTEXT','PRIMARY_EXECUTION_STRESS','PRIMARY_EXECUTION_COST','BLOCKSCOUT_INDEX','BLUESKY_PUBLIC','OFFICIAL_EVENTS','OFFICIAL_TOKEN_SCHEDULE','GDELT_NEWS_DISCOVERY','HTX_PUBLIC_RISK','HTX_LARGE_TRADES','DERIBIT_ALT_OPTIONS','COINPAPRIKA_SECTOR','COINGECKO_SECTOR','SOURCIFY_ABI'];
const completeSources=()=>Object.fromEntries(SOURCE_NAMES.map(source=>[source,{status:'VALID_RESPONSE_NO_EVENT',network_calls:1}]));

test('all 15 configured additional blocks are checked without equating a check to a score',()=>{
 const now=1_800_000_000_000;
 const evidence=[{evidence_id:'supply',asset_id:'ethereum:0x1',htx_contract:'ABC-USDT',block_id:'N02',metric_family:'TOTAL_SUPPLY_OBSERVATION',provider_id:'CHAIN_RPC',upstream_id:'PUBLICNODE_RPC',dependency_group:'supply',observed_ts:now,source_ts:now,first_known_ts:now,expires_at:now+60_000,coverage_status:'CONTEXT_ONLY',coverage_fraction:0,schema_version:'v2',validation_status:'VALID',identity_status:'EXACT',finality_status:'FINAL'}];
 const sources=completeSources();
 sources.CHAIN_SUPPLY={status:'CLOSED',network_calls:1};sources.BLUESKY_PUBLIC={status:'CLOSED',network_calls:1};
 const result=auditCandidateBlocks({evidence,sources,decision_ts:now});
 assert.equal(result.coverage_count,15);
 assert.equal(result.checked_block_count,15);
 assert.equal(result.all_blocks_checked,true);
 assert.equal(result.blocks.N02.status,'CHECKED_NEUTRAL_CONTEXT');
 assert.equal(result.blocks.N02.decision_path,'ADMITTED_NEUTRAL_CONTEXT');
 assert.deepEqual(result.blocks.N02.evidence_rejection_reasons,{ZERO_DECISION_COVERAGE:1});
 assert.equal(result.all_blocks_have_assigned_consumer,true);assert.equal(result.all_blocks_decision_accounted,false);
 assert.equal(result.blocks.N02.source_statuses.CHAIN_SUPPLY,'CLOSED');
 assert.deepEqual(result.blocks.N02.source_checks.CHAIN_SUPPLY,{status:'CLOSED',attempted:true,checked:true,capability_resolved_without_route:false,network_calls:1,cache_status:null,receipt_count:0,admission_status:null,receipts:[]});
 assert.equal(result.blocks.N06.status,'CHECKED_NO_USABLE_FACTS');
 assert.equal(result.blocks.N06.source_statuses.BLUESKY_PUBLIC,'CLOSED');
 assert.equal(result.blocks.N10.status,'CHECKED_NO_USABLE_FACTS');
 assert.deepEqual(result.blocks.N10.missing_required,[]);
 assert.equal(result.blocks.N10.decision_path,'ADMITTED_CONTROL_CONTEXT');
 assert.equal(result.blocks.N13,undefined);
 assert.equal(result.blocks.N17,undefined);
 assert.equal(result.all_blocks_have_useful_data,false);
});

test('missing identity, missing key and deferred routes are not counted as checked blocks',()=>{
 const sources={
  CHAIN_SUPPLY:{status:'EXACT_ASSET_IDENTITY_REQUIRED',network_calls:0},
  CHAIN_EVENTS:{status:'EXACT_ASSET_IDENTITY_REQUIRED',network_calls:0},
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
 assert.equal(result.status,'PARTIAL_BLOCK_CHECK');
});

test('a supplemental route cannot close a missing primary block owner',()=>{
 const sources={
  GDELT_NEWS_DISCOVERY:{status:'CLOSED',network_calls:1},
  BLOCKSCOUT_INDEX:{status:'CLOSED',network_calls:1},
  SOURCIFY_ABI:{status:'CLOSED',network_calls:1},
 };
 const result=auditCandidateBlocks({sources,decision_ts:1_800_000_000_000});
 assert.equal(result.blocks.N01.checked,false);
 assert.equal(result.blocks.N01.missing_required[0],'OFFICIAL_TOKEN_SCHEDULE');
 assert.equal(result.blocks.N02.checked,false);
 assert.equal(result.blocks.N03.checked,false);
 assert.equal(result.blocks.N07.checked,false);
 assert.equal(result.blocks.N13,undefined);
 assert.equal(result.blocks.N17,undefined);
});
test('an attempted provider error is recorded but cannot close its block',()=>{
 const sources=completeSources();sources.BLUESKY_PUBLIC={status:'ACCESS_BLOCKED_403',network_calls:1,receipts:[{http_status:403,status:'SOURCE_ERROR'}]};
 const result=auditCandidateBlocks({sources,evidence:[],decision_ts:Date.now()});
 assert.equal(result.blocks.N06.source_checks.BLUESKY_PUBLIC.attempted,true);
 assert.equal(result.blocks.N06.source_checks.BLUESKY_PUBLIC.checked,false);
 assert.equal(result.blocks.N06.checked,false);
 assert.deepEqual(result.blocks.N06.missing_required,['BLUESKY_PUBLIC']);
});

test('zero-fact primary blocks require explicit completed receipts',()=>{
 const absent=auditCandidateBlocks({sources:{},decision_ts:1_800_000_000_000});
 for(const block of ['N10','N11','N16'])assert.equal(absent.blocks[block].checked,false);
 const sources=Object.fromEntries(['PRIMARY_TECHNICAL_CONTEXT','PRIMARY_EXECUTION_STRESS','PRIMARY_EXECUTION_COST'].map(name=>[name,{status:'CHECKED_NO_EVENT',check_completed:true,network_calls:0}]));
 const present=auditCandidateBlocks({sources,decision_ts:1_800_000_000_000});
 for(const block of ['N10','N11','N16'])assert.equal(present.blocks[block].checked,true);
});

test('strict fresh manual audit rejects cache-only external owners but accepts fresh internal checks',()=>{
 const sources=completeSources();
 sources.OFFICIAL_EVENTS={status:'CLOSED',network_calls:0,cache_status:'HIT'};
 sources.OFFICIAL_TOKEN_SCHEDULE={status:'CLOSED',network_calls:0,cache_status:'HIT'};
 sources.PRIMARY_TECHNICAL_CONTEXT={status:'CHECKED_PRIMARY_TECHNICAL_CONTEXT',check_completed:true,network_calls:0};
 const result=auditCandidateBlocks({sources,decision_ts:1_800_000_000_000,strict_fresh:true});
 assert.equal(result.strict_fresh_required,true);
 assert.equal(result.blocks.N01.checked,false);
 assert.deepEqual(result.blocks.N01.missing_required,['OFFICIAL_TOKEN_SCHEDULE']);
 assert.equal(result.blocks.N10.checked,true);
 assert.equal(result.all_blocks_checked,false);
});

test('saturated or incomplete event samples remain attempted without closing neutral blocks',()=>{
 for(const status of ['LOG_SAMPLE_SATURATED','SOURCE_SAMPLE_TRUNCATED','SOURCE_SAMPLE_INCOMPLETE']){
  const sources=completeSources();sources.CHAIN_EVENTS={status,network_calls:2,receipts:[{http_status:200}]};
  const result=auditCandidateBlocks({sources,strict_fresh:true});
  for(const block of ['N03','N04']){
   assert.equal(result.blocks[block].source_checks.CHAIN_EVENTS.attempted,true);
   assert.equal(result.blocks[block].checked,false);
   assert.equal(result.blocks[block].decision_path,'BLOCKED_REQUIRED_SOURCE_NOT_CHECKED');
   assert.deepEqual(result.blocks[block].missing_required,block==='N03'?['ANY:CHAIN_EVENTS|CHAIN_SUPPLY_COMPARISON']:['CHAIN_EVENTS']);
  }
 }
 assert.equal(sourceWasActuallyChecked({status:'CLOSED_EMPTY_BOUNDED_SAMPLE',network_calls:1,receipts:[{http_status:200}]}),true);
});

test('missing HTTP status is not a transport receipt',()=>{
 for(const http_status of [null,undefined,0,'',99,600]){
  const source={status:'TRANSPORT_RESULT_UNKNOWN',network_calls:0,receipts:[{http_status}]};
  assert.equal(sourceWasActuallyChecked(source),false);
  assert.equal(sourceWasAttempted(source),false);
 }
 assert.equal(sourceWasAttempted({status:'SOURCE_ERROR',network_calls:1,receipts:[{http_status:null}]}),true);
});
