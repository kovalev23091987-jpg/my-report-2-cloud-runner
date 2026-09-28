import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createLiquidationCandidateQueue} from '../files/src/liquidation-candidate-queue.mjs';
import {createLiquidationOutcomeCalibration} from '../files/src/liquidation-outcome-calibration.mjs';

function memoryD1(){
 const sqlite=new DatabaseSync(':memory:');
 const prepare=query=>{
  const statement=sqlite.prepare(query);let values=[];
  return{bind(...next){values=next;return this;},run(){const out=statement.run(...values);return{meta:{changes:Number(out.changes)}};},first(){return statement.get(...values)??null;},all(){return{results:statement.all(...values)}}};
 };
 return{prepare,async batch(statements){const out=[];for(const statement of statements)out.push(await statement.run());return out;},close(){sqlite.close();}};
}

test('candidate queue carries remaining coins forward and fails closed after three unusable attempts',async()=>{
 const db=memoryD1(),queue=createLiquidationCandidateQueue({db,ttl_ms:10_000,claim_timeout_ms:100,max_attempts:3});
 const enqueued=await queue.enqueue([{contract:'AAA-USDT',priority_rank:1},{contract:'BBB-USDT',priority_rank:2},{contract:'龙虾-USDT',priority_rank:3},{contract:'BTC-USDT',priority_rank:0}],{now:1000});
 assert.equal(enqueued.enqueued,3);
 for(let attempt=1;attempt<=3;attempt++){
  const claim=await queue.claim({run_id:`r${attempt}`,preferred_contract:'AAA-USDT',now:1000+attempt});
  assert.equal(claim.claimed,true);assert.equal(claim.attempts,attempt);
  const completed=await queue.complete({contract:'AAA-USDT',run_id:`r${attempt}`,usable:false,now:1010+attempt});
  assert.equal(completed.status,attempt===3?'FAILED':'PENDING');
 }
 const next=await queue.claim({run_id:'good',now:1100});assert.equal(next.contract,'BBB-USDT');
 const done=await queue.complete({contract:'BBB-USDT',run_id:'good',usable:true,now:1110});assert.equal(done.status,'DONE');
 const summary=await queue.summary({now:1200});assert.equal(summary.counts.FAILED,1);assert.equal(summary.counts.DONE,1);db.close();
});

test('legacy one-hour outcomes remain shadow diagnostics and never activate predictive weighting',async()=>{
 const db=memoryD1(),fetch_impl=async()=>({ok:true,json:async()=>({ticks:[{contract_code:'AAA-USDT',close:10.1}]})}),calibration=createLiquidationOutcomeCalibration({db,fetch_impl,horizon_ms:1000,min_move_pct:0.5});
 for(let i=0;i<20;i++){
  const record=await calibration.record({contract:'AAA-USDT',observed_ts:1000+i,panel:{status:'CLOSED',reference_price:10,clusters:[{distance_pct:5,center_price:10.5,liquidated_side:'SHORT',providers:['Lighter']}],score_evidence:{quality:0.8}}});
  assert.equal(record.rows,1);
 }
 const settled=await calibration.settle({now:3000});assert.equal(settled.settled,20);
 const summary=await calibration.summary(),lighter=summary.sources.find(row=>row.source_id==='LIGHTER');
 assert.equal(lighter.observations,20);assert.equal(lighter.hits,20);assert.equal(lighter.eligible,0);assert.equal(lighter.predictive_weight_factor,1);assert.equal(summary.activation_disabled,true);db.close();
});

test('cross-exchange depth, Coinalyze and live liquidations enter the same factual outcome loop',async()=>{
 const db=memoryD1(),calibration=createLiquidationOutcomeCalibration({db,horizon_ms:1000});
 const record=await calibration.record({contract:'SOL-USDT',reference_price:150,observed_ts:1000,cross_exchange_risk:{sources:{
  CROSS_EXCHANGE_DEPTH:{status:'CLOSED',venue_count:3,aggregate_depth_imbalance_2pct:0.4},
  COINALYZE:{status:'CLOSED',long_liquidated_recent:9000,short_liquidated_recent:1000},
  CROSS_EXCHANGE_REALIZED:{status:'CLOSED',long_liquidated_usd:8000,short_liquidated_usd:2000},
 }}});
 assert.equal(record.rows,3);assert.equal(record.panel_rows,0);assert.equal(record.cross_exchange_rows,3);
 const pending=await db.prepare(`SELECT source_id,expected_direction FROM report2_liquidation_signal_outcomes ORDER BY source_id`).all();
 assert.deepEqual(pending.results.map(row=>row.source_id),['COINALYZE','CROSS_EXCHANGE_DEPTH','CROSS_EXCHANGE_REALIZED']);
 assert.ok(pending.results.every(row=>row.expected_direction==='UP'));db.close();
});
