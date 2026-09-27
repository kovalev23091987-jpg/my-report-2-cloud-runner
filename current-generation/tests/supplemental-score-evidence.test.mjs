import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSupplementalScoreEvidence,applySupplementalScoreAdjustment,FIXED_DECISION_WEIGHTS} from '../files/src/supplemental-score-evidence.mjs';
test('verified useful sources change the score inside existing fixed blocks',()=>{
 const rows=buildSupplementalScoreEvidence({direction:'LONG',internal_market_context:{deribit:{status:'CLOSED',internal_only:true,market_regime:'RISK_OFF_ELEVATED'},coinlobster:{status:'CLOSED',internal_only:true,whale_radar:[{coin:'FIL',direction:'BUY',multiple:5}]}}});
 const out=applySupplementalScoreAdjustment(70,rows);
 assert.equal(out.status,'CLOSED');assert.notEqual(out.adjustment,0);assert.equal(out.final_score,71);assert.deepEqual(out.weights,FIXED_DECISION_WEIGHTS);assert.ok(out.receipts.some(x=>x.source_id==='DERIBIT'));assert.ok(out.receipts.some(x=>x.source_id==='COINLOBSTER'));
});
test('stale, unidentified and duplicate-family facts cannot distort the result',()=>{
 const out=applySupplementalScoreAdjustment(60,[
  {source_id:'A',responsibility_group:'ONE',decision_chain:'SMART_MONEY_ONCHAIN',signed_strength:1,quality:1,fresh:false,exact_identity:true},
  {source_id:'B',responsibility_group:'TWO',decision_chain:'SMART_MONEY_ONCHAIN',signed_strength:1,quality:1,fresh:true,exact_identity:false},
  {source_id:'C',responsibility_group:'THREE',decision_chain:'CROSS_EXCHANGE_DERIVATIVES',signed_strength:1,quality:1,fresh:true,exact_identity:true},
  {source_id:'D',responsibility_group:'THREE',decision_chain:'CROSS_EXCHANGE_DERIVATIVES',signed_strength:0.5,quality:1,fresh:true,exact_identity:true},
 ]);
 assert.equal(out.adjustment,3.5);assert.equal(out.receipts.length,1);assert.equal(out.final_score,64);
});
test('supplemental influence is always bounded to ten points',()=>{
 const rows=Object.entries(FIXED_DECISION_WEIGHTS).map(([chain],i)=>({source_id:String(i),responsibility_group:String(i),decision_chain:chain,signed_strength:1,quality:1,fresh:true,exact_identity:true}));
 assert.equal(applySupplementalScoreAdjustment(95,rows).final_score,100);
 assert.equal(applySupplementalScoreAdjustment(5,rows.map(x=>({...x,signed_strength:-1}))).final_score,0);
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
 assert.ok(out.receipts.length<=4,'one strongest fact per responsibility family');
});
