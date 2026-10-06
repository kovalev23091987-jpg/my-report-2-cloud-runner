import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {bindSupplementalSupportingReceipts,attachSupplementalSupportingUse} from '../files/src/supplemental-supporting-bridge.mjs';
const rt=path.resolve(process.env.REPORT2_TEST_RUNTIME||'runtime');
const {consumeExistingSourceReceipts}=await import(pathToFileURL(path.join(rt,'src/existing-source-consumer.mjs')));
const {buildRuntimeCanonicalBundle}=await import(pathToFileURL(path.join(rt,'src/canonical-runtime-adapter.mjs')));
const {formatManualReport}=await import(pathToFileURL(path.join(rt,'src/manual-report-formatter.mjs')));
const gz=fs.readFileSync(new URL('./fixtures/exact-current-37395903856.json.gz',import.meta.url));
assert.equal(createHash('sha256').update(gz).digest('hex'),'d3e6ac9394f57739a1ea7ffe89a4aade9ff52a52fd271f5612fdf17f575dc50f');
const fixture=JSON.parse(gunzipSync(gz)),row=fixture.rows.find(x=>x.contract_code==='LSK-USDT'),c=row.canonical;
const args=()=>({context:structuredClone(c.metadata.internal_market_context.candidate_context),contract:row.contract_code,run_id:c.run_id,snapshot_id:c.snapshot_id,decision_ts:c.observed_ts});
test('same saved LSK exact responses reach assigned supporting consumers with original clocks and no double-counting',()=>{
 const bridge=bindSupplementalSupportingReceipts(args()),consumed=consumeExistingSourceReceipts(bridge.receipts),use=attachSupplementalSupportingUse({consumed,bridge});
 assert.equal(use.status,'CLOSED');assert.equal(use.network_calls,0);assert.equal(use.core_block_participation_added,0);
 const pool=use.facts.find(f=>f.pool_key==='ethereum|0x6af632b8235f1a9d95a816f7a4090736346b763a8ab4e8327017aaae72d0d1d2');
 assert.equal(pool.value,550072.7802);assert.equal(pool.provider_observation_count,2);assert.equal(pool.independent_confirmation_count,1);
 assert.deepEqual(pool.provider_observations.map(x=>x.liquidity_usd),[506507.99,550072.7802]);
 assert.equal(pool.observed_ts,1791246916291);assert.equal(pool.supplemental_supporting_receipt.run_id,c.run_id);
 const funding=use.facts.find(f=>f.decision_block==='BITGET_CONTEXT');
 assert.equal(funding.value,0.00005);assert.equal(funding.unit,'доля');
 assert.ok(!use.facts.some(f=>f.label==='Открытый интерес Bitget'));
 assert.ok(use.facts.every(f=>f.score_contribution===0&&f.entry_authorized===false&&f.block_id===undefined));
 const replay=structuredClone(c);replay.metadata.supporting_context.facts=[...use.facts,...replay.metadata.supporting_context.facts];
 const rendered=formatManualReport(replay);assert.equal(rendered.ok,true);assert.match(rendered.text,/DEX-пул подтверждён: 550072.7802 USD/);
 assert.match(rendered.text,/Ставка финансирования Bitget: 0.00005 доля/);
 assert.deepEqual(replay.scores,c.scores);assert.equal(replay.state,c.state);
});
test('actual source clock, exact context and unknown units fail closed without converting to zeros',()=>{
 for(const mutate of [
 a=>a.contract='OTHER-USDT',
 a=>a.context.contract='OTHER-USDT',
 a=>a.context.sources.BITGET.symbol='OTHERUSDT',
 a=>a.context.sources.BITGET.observed_ts=a.decision_ts+1,
 a=>a.context.sources.BITGET.observed_ts=a.decision_ts-300001,
 a=>a.context.sources.BITGET.funding_rate=null,
 a=>a.context.sources.BITGET.context_version='OTHER',
 ]){
  const a=args();mutate(a);const out=bindSupplementalSupportingReceipts(a);
  assert.ok(!out.bindings.some(b=>b.assigned_consumer==='BITGET_CONTEXT'));assert.equal(out.network_calls,0);
 }
 for(const mutate of [a=>a.context.identity_status='CANDIDATE_ONLY',a=>a.context.asset_identity_candidate=a.context.asset_identity,a=>{for(const k of ['DEX_SCREENER','GECKOTERMINAL'])a.context.sources[k].observed_ts=a.decision_ts+1;}]){
  const a=args();mutate(a);assert.ok(!bindSupplementalSupportingReceipts(a).bindings.some(b=>b.assigned_consumer==='DEX_CONTEXT'));
 }
});
test('already assigned closed legacy facts retain precedence and are not duplicated',()=>{
 const a=args();a.existing={bitget:{status:'CLOSED',funding_rate:0.001},dex:[{status:'CLOSED',provider:'Existing',pool_key:a.context.sources.DEX_SCREENER.pools[0].pool_key,liquidity_usd:7}]};
 const out=bindSupplementalSupportingReceipts(a);assert.equal(out.receipts.bitget.funding_rate,0.001);
 assert.ok(!out.bindings.some(x=>x.pool_key===a.existing.dex[0].pool_key||x.assigned_consumer==='BITGET_CONTEXT'));
});
test('assembled canonical adapter wires the same original context to approved rendering without new network calls',()=>{
 const prior=globalThis.fetch;let calls=0;globalThis.fetch=()=>{calls++;throw Error('NO_SOURCE_CALL_ALLOWED');};
 try{
  const bundle=buildRuntimeCanonicalBundle({contract:row.contract_code,run_id:c.run_id,snapshot_id:c.snapshot_id,observed_ts:c.observed_ts,internal_market_context:structuredClone(c.metadata.internal_market_context)});
  const canonical=bundle.canonical||bundle.canonical_result||bundle.result;
  assert.ok(canonical,'actual assembled canonical bundle');
  const use=canonical.metadata.supporting_context.supplemental_supporting_use;assert.equal(use.status,'CLOSED');
  const rendered=formatManualReport(canonical);assert.equal(rendered.ok,true);assert.match(rendered.text,/Ставка финансирования Bitget: 0.00005 доля/);
  assert.match(rendered.text,/DEX-пул подтверждён: 550072.7802 USD/);
  assert.equal(calls,0);assert.equal(use.core_block_participation_added,0);
 }finally{globalThis.fetch=prior;}
});
