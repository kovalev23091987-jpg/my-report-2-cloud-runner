import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {BLOCKS,validateEvidenceV2,consumeEvidenceV2,buildHotlist,nextSourceQuality} from '../files/src/evidence-v2.mjs';

const templates=JSON.parse(fs.readFileSync(new URL('./fixtures/evidence-v2/n01-n17.json',import.meta.url),'utf8'));
const make=(row,i=0)=>({...row,evidence_id:`E-${row.block_id}-${i}`,asset_id:'asset:sol',htx_contract:'SOL-USDT',provider_id:'P',upstream_id:'U',origin_event_id:`O-${row.block_id}`,dependency_group:`D-${row.block_id}`,observed_ts:1000,first_known_ts:1000,coverage_status:'COMPLETE',coverage_fraction:1,identity_status:'EXACT',finality_status:'FINAL',schema_version:'v1',validation_status:'VALID',expires_at:2000,reliability:.8});

test('K16: every N01-N17 fixture validates and reaches a concrete existing consumer',()=>{
  assert.equal(templates.length,17);for(const [i,row] of templates.entries()){const evidence=make(row,i);assert.equal(validateEvidenceV2(evidence,{decision_ts:1500}).usable,true);const result=consumeEvidenceV2([evidence],{base_interest:70,decision_ts:1500});assert.equal(result.receipts[0].consumer,BLOCKS[row.block_id].consumer);}
});

test('K16: stale, wrong asset, error and empty fixtures never contribute',()=>{
  const base=make(templates[0]);for(const row of [{...base,expires_at:1400},{...base,identity_status:'TICKER_ONLY'},{...base,validation_status:'ERROR'}]){const result=consumeEvidenceV2([row],{base_interest:70,decision_ts:1500});assert.equal(result.adjustment,0);}
  assert.equal(consumeEvidenceV2([],{base_interest:70,decision_ts:1500}).adjustment,0);
});

test('K16: one event through multiple transports owns one score family',()=>{
  const base=make(templates.find(x=>x.block_id==='N05'));
  const result=consumeEvidenceV2([base,{...base,evidence_id:'OTHER',provider_id:'AGGREGATOR'}],{base_interest:70,decision_ts:1500});
  assert.equal(result.receipts.filter(x=>x.reason==='CONSUMED').length,1);assert.equal(result.receipts.filter(x=>x.reason==='DUPLICATE_UPSTREAM_EVENT').length,1);
});

test('K16: news and social retain separate 0.2 caps and missing families are not redistributed',()=>{
  const social=make({...templates.find(x=>x.block_id==='N06'),directional_strength:1}),news=make({...templates.find(x=>x.block_id==='N07'),directional_strength:1});
  const result=consumeEvidenceV2([social,news],{base_interest:70,decision_ts:1500});assert.ok(result.adjustment<=.4);assert.equal(result.threshold_unchanged,70);
});

test('K16: risk strength can only reduce suitability and never becomes a bullish direction',()=>{
  const risk={...make(templates.find(row=>row.block_id==='N01')),directional_strength:null,risk_strength:.8};
  const result=consumeEvidenceV2([risk],{base_interest:70,decision_ts:1500});assert.ok(result.adjustment<0);assert.ok(result.final_interest<70);
});

test('K16: hotlist is bounded to 12 and quality does not punish an unattempted source',()=>{
  const hot=buildHotlist({active_publications:[{contract:'A-USDT',last_checked_ts:5}],manual_contract:'M-USDT',pending:Array.from({length:20},(_,i)=>({contract:`P${i}-USDT`,last_checked_ts:i}))});assert.equal(hot.length,12);assert.equal(hot[0].contract,'A-USDT');
  assert.deepEqual(nextSourceQuality({current:.8,attempted:false,response_usable:false}),{quality:.8,quarantined:false,invalid_streak:0,probe_success_streak:0});
});
