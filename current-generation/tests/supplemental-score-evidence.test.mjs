import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildSupplementalScoreEvidence,applySupplementalScoreAdjustment,FIXED_DECISION_WEIGHTS} from '../files/src/supplemental-score-evidence.mjs';
test('verified useful sources change the score inside existing fixed blocks',()=>{
 const rows=buildSupplementalScoreEvidence({direction:'LONG',internal_market_context:{deribit:{status:'CLOSED',internal_only:true,market_regime:'RISK_OFF_ELEVATED'},coinlobster:{status:'CLOSED',internal_only:true,whale_radar:[{coin:'FIL',direction:'BUY',multiple:5}]}}});
 const out=applySupplementalScoreAdjustment(70,rows);
 assert.equal(out.status,'CLOSED');assert.notEqual(out.adjustment,0);assert.equal(out.final_score,71);assert.deepEqual(out.weights,FIXED_DECISION_WEIGHTS);assert.ok(out.receipts.some(x=>x.source_id==='DERIBIT'));assert.ok(out.receipts.some(x=>x.source_id==='COINLOBSTER'));
 assert.equal(out.source_weighting,'T16_5_FAIL_CLOSED_FACTOR_ONE_UNLESS_ACTIVE');assert.equal(out.core_weights_automatically_changed,false);assert.ok(out.receipts.every(x=>Number.isFinite(x.effective_max_score_points)));
});
test('stale, unidentified and duplicate-family facts cannot distort the result',()=>{
 const out=applySupplementalScoreAdjustment(60,[
  {source_id:'A',responsibility_group:'ONE',decision_chain:'SMART_MONEY_ONCHAIN',signed_strength:1,quality:1,fresh:false,exact_identity:true},
  {source_id:'B',responsibility_group:'TWO',decision_chain:'SMART_MONEY_ONCHAIN',signed_strength:1,quality:1,fresh:true,exact_identity:false},
  {source_id:'C',responsibility_group:'THREE',decision_chain:'CROSS_EXCHANGE_DERIVATIVES',signed_strength:1,quality:1,fresh:true,exact_identity:true},
  {source_id:'D',responsibility_group:'THREE',decision_chain:'CROSS_EXCHANGE_DERIVATIVES',signed_strength:0.5,quality:1,fresh:true,exact_identity:true},
 ]);
 assert.equal(out.adjustment,3.2);assert.equal(out.receipts.length,1);assert.equal(out.final_score,63);
});
test('supplemental influence is always bounded to ten points',()=>{
 const rows=Object.entries(FIXED_DECISION_WEIGHTS).map(([chain],i)=>({source_id:String(i),responsibility_group:String(i),decision_chain:chain,signed_strength:1,quality:1,fresh:true,exact_identity:true}));
 assert.equal(applySupplementalScoreAdjustment(95,rows).final_score,100);
 assert.equal(applySupplementalScoreAdjustment(5,rows.map(x=>({...x,signed_strength:-1}))).final_score,0);
});
test('verified dynamic liquidation panel participates in the fixed derivatives block',()=>{
 const rows=buildSupplementalScoreEvidence({direction:'LONG',liquidation_panel:{score_evidence:{source_id:'DYNAMIC_LIQUIDATION_PANEL',responsibility_group:'PROJECTED_LIQUIDATIONS',decision_chain:'CROSS_EXCHANGE_DERIVATIVES',bullish_strength:0.6,quality:0.7,fresh:true,exact_identity:true}}});
 const out=applySupplementalScoreAdjustment(50,rows);
 assert.equal(out.receipts.length,1);assert.ok(out.adjustment>0);assert.ok(out.adjustment<=3.5);
});
test('every candidate-context provider has an explicit useful evidence path',()=>{
 const rows=buildSupplementalScoreEvidence({direction:'LONG',internal_market_context:{candidate_sources:{
  GOPLUS:{status:'CLOSED',exact_identity:true,flags:{is_honeypot:true}},
  DEX_SCREENER:{pools:[{pool_key:'eth|one',buys_24h:80,sells_24h:20}]},
  GECKOTERMINAL:{pools:[{pool_key:'eth|two',buys_24h:70,sells_24h:30}]},
  DEFILLAMA:{status:'CLOSED',exact_identity:true,protocol_slug:'example',tvl_change_7d_pct:12},
  SOLANA_RPC:{status:'CLOSED',exact_identity:true,mint:'Mint',recent_signature_count_1h:40,prior_signature_count_1h:10,sample_capped:false},
  BITGET:{status:'CLOSED',exact_identity:true,symbol:'FILUSDT',price_difference_vs_htx_pct:0.2},
  COINBASE:{status:'CLOSED',exact_identity:true,product:'FIL-USD',price_difference_vs_htx_pct:0.3},
 }}});
 const ids=new Set(rows.map(x=>x.source_id));
 for(const id of ['GOPLUS','DEX_SCREENER','GECKOTERMINAL','DEFILLAMA','SOLANA_RPC','BITGET','COINBASE'])assert.ok(ids.has(id),id);
 const out=applySupplementalScoreAdjustment(50,rows);
 assert.equal(out.status,'CLOSED');
 assert.ok(Math.abs(out.adjustment)<=10);
 assert.ok(out.receipts.filter(row=>row.score_contribution!==0).length<=4,'one strongest directional fact per responsibility family');
 assert.ok(out.receipts.filter(row=>row.direction_neutral_context).every(row=>row.score_contribution===0),'context-only providers cannot invent direction');
});
test('cross-exchange depth, live liquidations and history enter bounded evidence families',()=>{
 const rows=buildSupplementalScoreEvidence({direction:'LONG',internal_market_context:{cross_exchange_risk:{sources:{
  CROSS_EXCHANGE_DEPTH:{status:'CLOSED',venue_count:3,aggregate_depth_imbalance_2pct:0.4},
  CROSS_EXCHANGE_REALIZED:{status:'CLOSED',long_liquidated_usd:9000,short_liquidated_usd:1000},
  COINALYZE:{status:'CLOSED',long_liquidated_recent:8000,short_liquidated_recent:2000},
 }}}});
 const ids=new Set(rows.map(x=>x.source_id));for(const id of ['CROSS_EXCHANGE_DEPTH','CROSS_EXCHANGE_REALIZED','COINALYZE'])assert.ok(ids.has(id));
 const out=applySupplementalScoreAdjustment(50,rows);assert.ok(out.adjustment<=10);assert.ok(out.receipts.length<=3);
});
test('cross-exchange quality stays factor one until explicit T16.5 activation',()=>{
 const risk={sources:{CROSS_EXCHANGE_DEPTH:{status:'CLOSED',venue_count:3,aggregate_depth_imbalance_2pct:0.4}}};
 const early=buildSupplementalScoreEvidence({direction:'LONG',internal_market_context:{cross_exchange_risk:risk,predictive_source_health:{sources:[{source_id:'CROSS_EXCHANGE_DEPTH',observations:19,eligible:0,predictive_weight_factor:1.25}]}}});
 assert.equal(early[0].quality,0.6);assert.equal(early[0].predictive_weight_status,'SHADOW_FACTOR_ONE');
 const stillShadow=buildSupplementalScoreEvidence({direction:'LONG',internal_market_context:{cross_exchange_risk:risk,predictive_source_health:{sources:[{source_id:'CROSS_EXCHANGE_DEPTH',observations:200,eligible:1,predictive_weight_factor:1.25}]}}});
 assert.equal(stillShadow[0].quality,0.6);assert.equal(stillShadow[0].predictive_weight_status,'SHADOW_FACTOR_ONE');
 const proven=buildSupplementalScoreEvidence({direction:'LONG',internal_market_context:{cross_exchange_risk:risk,predictive_source_health:{sources:[{source_id:'CROSS_EXCHANGE_DEPTH',observations:200,eligible:1,predictive_weight_factor:1.25,activation_state:'ACTIVE',eligibility_protocol:'T16_5'}]}}});
 assert.equal(proven[0].base_quality,0.6);assert.equal(proven[0].quality,0.75);assert.equal(proven[0].predictive_weight_status,'ACTIVE_T16_5');
});
test('authoritative worker uses the same 32/30/20/18 supplemental budget',()=>{
 const source=fs.readFileSync(new URL('../files/src/worker.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/fixed_weights_35_30_20_15|Fixed 35\/30\/20\/15|CROSS_EXCHANGE_DERIVATIVES:\s*35|SUPPORTING_RISK:\s*15/);
 assert.match(source,/CROSS_EXCHANGE_DERIVATIVES:\s*32/);assert.match(source,/SUPPORTING_RISK:\s*18/);
});
test('EvidenceV2 reaches the same bounded manual and Telegram score path without a second scorer',()=>{
 const evidence={evidence_id:'E1',asset_id:'asset:sol',htx_contract:'SOL-USDT',block_id:'N01',metric_family:'unlock',provider_id:'OFFICIAL_EVENTS',upstream_id:'OFFICIAL',dependency_group:'EVENT',observed_ts:1000,first_known_ts:1000,coverage_status:'COMPLETE',coverage_fraction:1,identity_status:'EXACT',finality_status:'FINAL',schema_version:'v1',validation_status:'VALID',expires_at:3000,directional_strength:null,risk_strength:1,reliability:1};
 const rows=buildSupplementalScoreEvidence({direction:'LONG',internal_market_context:{decision_ts:2000,evidence_v2:{evidence:[evidence]}}});
 const receipt=applySupplementalScoreAdjustment(70,rows);assert.ok(receipt.adjustment<0);assert.ok(receipt.adjustment>=-1.8);assert.ok(rows.some(row=>row.source_id==='EVIDENCE_V2'));
});
