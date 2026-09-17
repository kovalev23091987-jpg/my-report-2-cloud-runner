import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prepareHtxExecutionFacts, verifyExecutionFacts, checkExecutionHandoff} from '../src/tz101-execution-facts.mjs';
import {buildSafetyGateSnapshot,prepareFullEvidenceProofBundle,sealFullEvidenceProofBundleAfterAck} from '../src/stage392-proof-runtime.mjs';
import {digest} from '../src/upstream-proof-utils.mjs';
import {completeInput,fullEvidence,NOW,CONTRACT,SNAPSHOT} from './final-decision-integration-fixtures.mjs';
import {buildFinalDecisionIntegrationShadow} from '../src/final-decision-integration-engine.mjs';
const rawSource=fs.readFileSync(new URL('../src/worker.js',import.meta.url),'utf8')
  .replace(/from "(\.\/[^"\n]+\.mjs)"/g,(_,p)=>`from ${JSON.stringify(new URL('../src/'+p.slice(2),import.meta.url).href)}`);
const api=await import('data:text/javascript;base64,'+Buffer.from(rawSource+'\nexport {futuresSnapshot};').toString('base64'));
function input(){return {contract_code:CONTRACT,requested_notional_usdt:1000,received_ts:NOW,
  info_response:{ok:true,data:{status:'ok',ts:NOW-2000,data:[{contract_code:CONTRACT,contract_size:1,price_tick:1,contract_status:1}]}},
  depth_response:{ok:true,data:{status:'ok',ch:`market.${CONTRACT}.depth.step0`,ts:NOW-600,tick:{ts:NOW-1000,bids:[[100,20],[99,30]],asks:[[101,20],[102,30]]}}}};}
function safety(p,ts=NOW){return buildSafetyGateSnapshot({contract_code:CONTRACT,snapshot_id:SNAPSHOT,observed_ts:ts,committed_ts:ts,
  full_evidence_record:{htx_execution_gate_closed:true},shadow_decision:{eq:{status:'SHADOW_MEASURABLE'}},execution_snapshot:p});}
function checkBad(f){const p=prepareHtxExecutionFacts(f);assert.notEqual(p.status,'PREPARED_UNACKNOWLEDGED');assert.ok(p.reasons.length);assert.notEqual(p.check,'CONFIRMED');return p;}
test('whole-contract entry/exit sizes differ by direction but match within round trip',()=>{
 const p=prepareHtxExecutionFacts(input());assert.equal(p.status,'PREPARED_UNACKNOWLEDGED');
 assert.equal(p.plans.LONG.measured_contracts,9);assert.equal(p.plans.SHORT.measured_contracts,10);
 for(const d of ['LONG','SHORT']) {const q=p.plans[d];assert.equal(q.entry.requested_contracts,q.exit.requested_contracts);assert.equal(q.entry.base_quantity,q.exit.base_quantity);assert.equal(q.check,'CONFIRMED');}
 assert.equal(p.plans.LONG.entry.filled_notional_usdt,909);assert.equal(p.plans.LONG.exit.filled_notional_usdt,900);
 assert.equal(p.plans.SHORT.entry.filled_notional_usdt,1000);assert.equal(p.plans.SHORT.exit.filled_notional_usdt,1010);
 assert.equal(p.position_assumed,false);assert.equal(p.execution_authorized,false);
 assert.deepEqual(verifyExecutionFacts(p,{contract_code:CONTRACT,observed_ts:NOW}),p);
});
test('one insufficient direction does not invalidate the other measured opportunity',()=>{
 const f=input();f.depth_response.data.tick.bids=[[100,9]];f.depth_response.data.tick.asks=[[101,10]];
 const p=prepareHtxExecutionFacts(f),s=safety(p);
 assert.equal(p.plans.LONG.status,'CLOSED');assert.equal(p.plans.SHORT.check,'REFUTED');
 assert.equal(s.execution_gate.status,'CLOSED');assert.equal(s.execution_gate.entry_sides.LONG.status,'CLOSED');assert.equal(s.execution_gate.entry_sides.SHORT.status,'NOT_CLOSED');
 assert.equal(checkExecutionHandoff(s.execution_gate,{contract_code:CONTRACT,checked_ts:NOW+1}).ok,true);
});
test('source clock and exact expiry are retained at receipt and handoff',()=>{
 const p=prepareHtxExecutionFacts(input()),s=safety(p);
 assert.equal(s.execution_gate.source_ts,NOW-1000);assert.equal(s.execution_gate.entry_sides.LONG.source_ts,NOW-1000);
 assert.equal(s.execution_gate.valid_until_ts,NOW+14000);
 assert.equal(checkExecutionHandoff(s.execution_gate,{contract_code:CONTRACT,checked_ts:NOW+14000}).ok,true);
 assert.equal(checkExecutionHandoff(s.execution_gate,{contract_code:CONTRACT,checked_ts:NOW+14001}).ok,false);
 assert.equal(safety(p,NOW+14001).execution_gate.status,'NOT_CLOSED');
});
test('common CLOSED flag without factual book no longer manufactures four measurable sides',()=>{
 const s=safety(null);assert.equal(s.execution_gate.status,'NOT_CLOSED');assert.equal(s.execution_gate.authoritative,false);
 for(const family of ['entry_sides','close_sides']) for(const d of ['LONG','SHORT']) assert.equal(s.execution_gate[family][d].measurable,false);
 assert.equal(s.execution_gate.source_ts,null);assert.equal(s.execution_gate.factual_basis.check,'UNKNOWN');
});
test('reference market size does not become the user position or known-position exit size',()=>{
 const s=safety(prepareHtxExecutionFacts(input()));
 for(const d of ['LONG','SHORT']) {assert.equal(s.execution_gate.entry_sides[d].measurable,true);assert.equal(s.execution_gate.close_sides[d].measurable,false);}
 assert.equal(s.execution_gate.costs_checked,false);assert.equal(s.hard_veto.status,'UNKNOWN');assert.equal(s.hard_veto.authoritative,false);
 assert.equal(s.hard_veto.partial_execution_assessment.full_hard_veto_assessment_complete,false);
});
test('safety receipt includes raw bounded facts and fails closed if data mutate',()=>{
 const s=safety(prepareHtxExecutionFacts(input()));
 assert.equal(s.receipt.content_digest,digest({hard_veto:s.hard_veto,execution_gate:s.execution_gate}));
 const before=s.receipt.content_digest;s.execution_gate.factual_basis.plans.LONG.entry.vwap=1;
 assert.notEqual(before,digest({hard_veto:s.hard_veto,execution_gate:s.execution_gate}));
 assert.equal(checkExecutionHandoff(s.execution_gate,{contract_code:CONTRACT,checked_ts:NOW}).ok,false);
});
const invalid={
 'missing exact instrument':f=>f.info_response.data.data[0].contract_code='OTHER-USDT',
 'duplicate exact instrument':f=>f.info_response.data.data.push(structuredClone(f.info_response.data.data[0])),
 'instrument request failure':f=>f.info_response.ok=false,
 'depth request failure':f=>f.depth_response.ok=false,
 'instrument maintenance':f=>f.info_response.data.status='maintain',
 'wrong instrument channel':f=>f.depth_response.data.ch='market.OTHER-USDT.depth.step0',
 'no instrument channel':f=>delete f.depth_response.data.ch,
 'merged rather than raw step0':f=>f.depth_response.data.ch=`market.${CONTRACT}.depth.step5`,
 'source milliseconds required':f=>f.depth_response.data.tick.ts=Math.floor(NOW/1000),
 'missing book source clock':f=>delete f.depth_response.data.tick.ts,
 'fresh response cannot refresh old book':f=>{f.depth_response.data.tick.ts=NOW-15001;f.depth_response.data.ts=NOW;},
 'future book':f=>f.depth_response.data.tick.ts=NOW+1,
 'future response':f=>f.depth_response.data.ts=NOW+1,
 'response precedes book':f=>f.depth_response.data.ts=NOW-2000,
 'unknown instrument clock':f=>delete f.info_response.data.ts,
 'future instrument clock':f=>f.info_response.data.ts=NOW+1,
 'stale instrument':f=>f.info_response.data.ts=NOW-60001,
 'null multiplier':f=>f.info_response.data.data[0].contract_size=null,
 'inferred multiplier from trades is not accepted':f=>{delete f.info_response.data.data[0].contract_size;f.tradeList=[{amount:1,quantity:1}];},
 'boolean multiplier':f=>f.info_response.data.data[0].contract_size=true,
 'missing price tick':f=>delete f.info_response.data.data[0].price_tick,
 'paused instrument':f=>f.info_response.data.data[0].contract_status=3,
 'unknown instrument state':f=>delete f.info_response.data.data[0].contract_status,
 'boolean instrument state':f=>f.info_response.data.data[0].contract_status=true,
 'unknown quantity':f=>f.depth_response.data.tick.asks[0][1]=null,
 'zero quantity cannot silently be skipped':f=>f.depth_response.data.tick.asks[0][1]=0,
 'negative quantity':f=>f.depth_response.data.tick.asks[0][1]=-1,
 'fractional contracts not whole lots':f=>f.depth_response.data.tick.asks[0][1]=1.5,
 'negative price':f=>f.depth_response.data.tick.asks[0][0]=-1,
 'boolean price':f=>f.depth_response.data.tick.asks[0][0]=true,
 'infinite price':f=>f.depth_response.data.tick.asks[0][0]=Infinity,
 'off tick price':f=>f.depth_response.data.tick.asks[0][0]=101.5,
 'unsorted asks':f=>f.depth_response.data.tick.asks.reverse(),
 'unsorted bids':f=>f.depth_response.data.tick.bids.reverse(),
 'duplicate price':f=>f.depth_response.data.tick.asks.push([102,20]),
 'crossed book':f=>f.depth_response.data.tick.bids=[[103,20]],
 'locked book':f=>f.depth_response.data.tick.bids=[[101,20]],
 'oversized book':f=>f.depth_response.data.tick.asks=Array.from({length:201},(_,i)=>[101+i,1]),
 'unknown book side':f=>delete f.depth_response.data.tick.asks,
 'empty both sides':f=>{f.depth_response.data.tick.bids=[];f.depth_response.data.tick.asks=[];},
 'below whole contract size':f=>f.requested_notional_usdt=1,
 'null notional':f=>f.requested_notional_usdt=null,
 'boolean notional':f=>f.requested_notional_usdt=true,
 'string notional':f=>f.requested_notional_usdt='1000',
 'infinite notional':f=>f.requested_notional_usdt=Infinity,
 'malformed response array':f=>f.info_response.data.data=null,
};
for(const [name,edit] of Object.entries(invalid)) test(name,()=>{const f=input();edit(f);checkBad(f);});
test('legal decimal strings from API normalize without accepting missing or boolean values',()=>{
 const f=input();for(const row of f.info_response.data.data) {row.contract_size='1';row.price_tick='1';row.contract_status='1';}
 f.depth_response.data.tick.asks=f.depth_response.data.tick.asks.map(r=>r.map(String));
 assert.deepEqual(prepareHtxExecutionFacts(f),prepareHtxExecutionFacts(input()));
});
test('measured slippage is against own book, round-trip excludes fees and funding',()=>{
 const f=input();f.depth_response.data.tick.asks=[[101,1],[102,20]];f.depth_response.data.tick.bids=[[100,1],[99,20]];
 const p=prepareHtxExecutionFacts(f),q=p.plans.LONG;
 assert.ok(q.entry.slippage_vs_same_book_top_bps>0);assert.ok(q.exit.slippage_vs_same_book_top_bps>0);
 assert.equal(q.round_trip_quote_loss_ex_fees_funding,q.entry.filled_notional_usdt-q.exit.filled_notional_usdt);
 assert.equal(p.facts.fees_included,false);assert.equal(p.facts.funding_included,false);
});
test('content equality is independent of JSON object key order',()=>{
 const p=prepareHtxExecutionFacts(input());const reordered=Object.fromEntries(Object.entries(p).reverse());
 assert.deepEqual(verifyExecutionFacts(reordered,{contract_code:CONTRACT,observed_ts:NOW}),p);
});
for(const [name,edit] of Object.entries({
 'plan vwap':p=>p.plans.LONG.entry.vwap=100000,
 'quantity':p=>p.plans.LONG.exit.requested_contracts=8,
 'renewed expiry':p=>p.facts.valid_until_ts+=60000,
 'source identity':p=>p.facts.contract_code='OTHER-USDT',
 'missing facts':p=>p.facts=null,
 'pretend cost closure':p=>p.facts.fees_included=true,
 'future receipt of response':p=>p.facts.received_ts=NOW+1,
 'unknown source quantity':p=>p.facts.asks[0][1]=null,
})) test('corrupted quote rejected: '+name,()=>{const p=prepareHtxExecutionFacts(input());edit(p);assert.equal(verifyExecutionFacts(p,{contract_code:CONTRACT,observed_ts:NOW}).status,'NOT_CLOSED');assert.equal(safety(p).execution_gate.status,'NOT_CLOSED');});
test('funding sign, OI, scores and portfolio metadata cannot manufacture capacity or veto clearance',()=>{
 const f=input(),expected=prepareHtxExecutionFacts(f);
 for(const v of [-1,0,1,null]) {f.funding=v;f.portfolio={state:'FLAT'};f.oi=1e99;f.score=99;assert.deepEqual(prepareHtxExecutionFacts(f),expected);}
});
test('actual futuresSnapshot sources the quote from its six existing requests, never mismatched BBO',async()=>{
 const clock=Date.now;Date.now=()=>NOW;
 try {const f=input(),calls=[];
 const snap=await api.futuresSnapshot({contract:CONTRACT,notional_usdt:1000,trades:1,_fetch_json:async url=>{
 calls.push(url);
 if(url.includes('swap_contract_info')) return f.info_response;
 if(url.includes('/market/depth')) return f.depth_response;
 if(url.includes('/market/bbo')) return {ok:true,data:{status:'ok',ticks:[{contract_code:'OTHER-USDT',bid:[900,1],ask:[901,1]}]}};
 if(url.includes('swap_open_interest')) return {ok:true,data:{data:[{contract_code:CONTRACT,volume:10,value:1000}]}};
 if(url.includes('swap_funding_rate')) return {ok:true,data:{data:{contract_code:CONTRACT,funding_rate:0.01}}};
 return {ok:true,data:{data:[{data:[{amount:1,quantity:1,price:100,ts:NOW-1000,direction:'buy'}]}]}};
 }});
 assert.equal(calls.length,6);assert.equal(new Set(calls).size,6);
 assert.equal(snap._tz101_execution_quote.plans.LONG.entry.reference_price,101);
 assert.equal(snap._tz101_execution_quote.plans.SHORT.entry.reference_price,100);
 assert.equal(safety(snap._tz101_execution_quote).execution_gate.status,'CLOSED');
 assert.ok(!JSON.stringify(snap).includes('_tz101_execution_quote'),'raw facts not duplicated in public response');
 } finally {Date.now=clock;}
});
test('proof bundle may clear only producer-owned safety veto; other entry gates still block authorization',()=>{
 const prepared=prepareFullEvidenceProofBundle({record:fullEvidence(),contract_code:CONTRACT,snapshot_id:SNAPSHOT,
 observed_ts:NOW,committed_ts:NOW,execution_snapshot:prepareHtxExecutionFacts(input())});
 for(const ack of [{status:'CLOSED',persisted:true,changes:0},{status:'CLOSED',persisted:true,changes:2},{status:'CLOSED',persisted:false,changes:1}]) assert.equal(sealFullEvidenceProofBundleAfterAck(prepared,ack).status,'FAIL_CLOSED');
 const s=sealFullEvidenceProofBundleAfterAck(prepared,{status:'CLOSED',persisted:true,changes:1});assert.equal(s.status,'CLOSED');
 assert.equal(s.bundle.execution_gate.status,'CLOSED');assert.equal(s.bundle.hard_veto.status,'CLEAR');
 assert.equal(s.bundle.hard_veto.authoritative,true);assert.equal(s.bundle.hard_veto.producer_owned_status,'CLEAR');
 assert.equal(s.bundle.hard_veto.partial_execution_assessment.full_hard_veto_assessment_complete,false);
 assert.ok(s.bundle.hard_veto.non_owned_entry_gates.includes('REALISTIC_TARGET_RISK_ALL_COSTS'));
 const f=completeInput();f.hard_veto=s.bundle.hard_veto;f.execution_gate=s.bundle.execution_gate;f.safety_gate_receipt=s.bundle.safety_gate_receipt;
 const out=buildFinalDecisionIntegrationShadow(f);assert.notEqual(out.entry_action,'SHADOW_ENTRY_ELIGIBLE');
 assert.equal(out.execution_authorized,false);assert.equal(out.telegram_eligible,false);assert.equal(out.live_probability,null);
});
test('slow database handoff is an explicit skip, not a timestamp renewal',()=>{
 assert.match(rawSource,/checkExecutionHandoff\(sealedFullEvidenceProof\?\.bundle\?\.execution_gate/);
 assert.match(rawSource,/sealedFullEvidenceProof\?\.bundle && executionHandoff\.ok/);
 assert.match(rawSource,/finalDecisionShadowPersistence\.reason = executionHandoff\.reason/);
});
for(const value of [true,false,null,undefined,'1',[],[1],{},NaN,Infinity]) test(`ACK count type rejected: ${String(value)}`,()=>{
 const p=prepareFullEvidenceProofBundle({record:fullEvidence(),contract_code:CONTRACT,snapshot_id:SNAPSHOT,observed_ts:NOW,committed_ts:NOW});
 assert.equal(sealFullEvidenceProofBundleAfterAck(p,{status:'CLOSED',persisted:true,changes:value}).status,'FAIL_CLOSED');
});
test('conflicting ACK counts cannot confirm persistence',()=>{
 const p=prepareFullEvidenceProofBundle({record:fullEvidence(),contract_code:CONTRACT,snapshot_id:SNAPSHOT,observed_ts:NOW,committed_ts:NOW});
 assert.equal(sealFullEvidenceProofBundleAfterAck(p,{status:'CLOSED',persisted:true,changes:1,insert_changes:0}).status,'FAIL_CLOSED');
 assert.equal(sealFullEvidenceProofBundleAfterAck(p,{status:'CLOSED',persisted:true,changes:null,insert_changes:1}).status,'FAIL_CLOSED');
 assert.equal(sealFullEvidenceProofBundleAfterAck(p,{status:'CLOSED',persisted:true,insert_changes:1}).status,'CLOSED');
});

for (const [name, ack] of Object.entries({null:null,array:[],boolean:true,string:"CLOSED",number:1})) {
 test('invalid ACK envelope fails closed without throwing: '+name,()=>{
  const prepared={status:'PREPARED_UNACKNOWLEDGED',bundle:{test_only:true}};
  const result=sealFullEvidenceProofBundleAfterAck(prepared,ack);
  assert.equal(result.status,'FAIL_CLOSED');assert.equal(result.bundle,null);
 });
}
