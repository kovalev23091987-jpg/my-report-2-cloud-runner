import test from 'node:test';
import assert from 'node:assert/strict';
import {createReviewedNativeScopeRegistry} from '../../registry/native-reviewed550.mjs';
import {reviewedNativeExecution,EXECUTION_REVIEW_REF} from '../../registry/native-execution-qualifications.mjs';
import {BINGX_IDENTITY_REGISTRY} from '../../registry/index.mjs';
import {createPumpSources} from '../../sources/index.mjs';

test('exact APT primary unit binding reaches actual source Coin parser while changed, scaled and missing Coin fields remain unqualified',async()=>{
  const registry=createReviewedNativeScopeRegistry(BINGX_IDENTITY_REGISTRY),entry=registry.resolve({native_symbol:'APT-USDT'}),original=JSON.stringify(BINGX_IDENTITY_REGISTRY);
  assert.equal(entry.native_contract_id,'100164');assert.equal(entry.qualifications.orderbook.native_base_unit,'APT');assert.equal(entry.qualifications.orderbook.evidence_ref,EXECUTION_REVIEW_REF);
  assert.equal(entry.instrument.contract_multiplier,null);assert.equal(entry.instrument.canonical_cross_venue_identity_qualified,false);
  for(const symbol of ['1000SHIB-USDT','1000PEPE-USDT'])assert.equal(registry.resolve({native_symbol:symbol}).qualifications.orderbook,undefined);
  assert.equal(registry.resolve({native_symbol:'APR-USDT'}).qualifications.orderbook.native_base_unit,'APR');
  const changed=structuredClone(entry);delete changed.qualifications.orderbook;changed.instrument.asset_id='ARTIFICIAL_CHANGED_ASSET';assert.equal(reviewedNativeExecution(changed).qualifications.orderbook,undefined);
  const T=1800100000000,calls=[];let data={code:0,data:{T,bidsCoin:[['5.00','10']],asksCoin:[['5.01','20']],bids:[['5.00','999']],asks:[['5.01','999']]}};
  const source=createPumpSources({identityRegistry:registry,clock:()=>T,broker:{request:async args=>{calls.push(args);return {ok:true,status:200,data:structuredClone(data),received_ts:T,receipt_id:'ARTIFICIAL_F559_NOT_NATIVE_'+calls.length};}}});
  const core=await source.getCore({instrument:entry.instrument,only_facts:['orderbook']});assert.equal(core.facts.orderbook.status,'USABLE');assert.equal(core.facts.orderbook.unit,'USDT_PRICE_BASE_QUANTITY');assert.deepEqual(core.facts.orderbook.value,{bids:[[5,10]],asks:[[5.01,20]]});assert.equal(core.facts.orderbook.coverage.complete_book,null);assert.match(calls[0].url,/limit=1000.*symbol=APT-USDT/);
  data={code:0,data:{T,bids:[['5.00','10']],asks:[['5.01','20']]}};const missing=await source.getCore({instrument:entry.instrument,only_facts:['orderbook'],force_refresh:true});assert.equal(missing.facts.orderbook.status,'ERROR');assert.equal(missing.facts.orderbook.reason,'BINGX_DEPTH_PAIRS_REQUIRED');
  assert.equal(JSON.stringify(BINGX_IDENTITY_REGISTRY),original);assert.equal(calls.length,2);
});
