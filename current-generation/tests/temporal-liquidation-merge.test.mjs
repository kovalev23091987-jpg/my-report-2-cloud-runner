import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import crypto from 'node:crypto';
import {mergeLiquidationDisplayZones} from '../files/src/canonical-display.mjs';
import {normalizeLighter} from '../files/src/liquidation-extension/round2-providers.mjs';
import {createScopedProviderAcquisition,bindScopedProviderAcquisition} from '../files/src/liquidation-extension/scoped-provider-runtime-bridge.mjs';
import {nativeLiquidationLines,validateNativeLiquidationContext} from '../files/src/native-liquidation-guard.mjs';
const T=1790491162272;
const row=(price,extra={})=>({price,side:'ABOVE',distance_pct:price-100,price_quote:'USD',notional_unit:'USD',native_symbol:'ASSET',native_reference_price:100,distance_reference_basis:'ORIGINAL_SOURCE_REFERENCE_SAME_QUOTE',source_ts:T,price_semantics:'OFFICIAL_SDK_ESTIMATE_INDEX_TRIGGER',sdk_version:'1.8.10',estimated:true,...extra});
test('close prices cannot merge different clocks, references, units or calculation methods',()=>{
 const a=row(110);
 for(const extra of [{source_ts:T+1},{native_reference_price:101},{notional_unit:'USDC'},{price_semantics:'PROVIDER_FEE_AWARE_LIQUIDATION_PRICE'},{sdk_version:'2.0'},{model_version:'other'},{native_reference_price:null}])assert.equal(mergeLiquidationDisplayZones([a,row(111,extra)],'ABOVE').length,2);
 assert.equal(mergeLiquidationDisplayZones([a,row(114)],'ABOVE').length,1);
 assert.equal(mergeLiquidationDisplayZones([row(110,{source_ts:null,source_clock_closed:false}),row(111,{source_ts:null,source_clock_closed:false})],'ABOVE').length,2);
 const same={source_ts:null,source_clock_closed:false,display_source_state_id:'same-verified-response-original-receipt'};
 assert.equal(mergeLiquidationDisplayZones([row(110,same),row(114,same)],'ABOVE')[0].price,114);
 assert.equal(mergeLiquidationDisplayZones([row(110,same),row(111,{...same,display_source_state_id:'different-response'})],'ABOVE').length,2);
});
test('actual saved Lighter close ZEC thresholds from different account responses remain two honest untimed positions',()=>{
 const contexts=[];
 for(const id of [30323,366058]){
  const raw=new URL(`../../post-v7-consolidated/liquidation/liquidation-extension/evidence/round2/lighter_account_${id}.raw`,import.meta.url),bytes=fs.readFileSync(raw),receipt=JSON.parse(fs.readFileSync(new URL(raw.href.replace('.raw','.receipt.json')))),payload=JSON.parse(bytes);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),receipt.sha256);
  const p=payload.accounts[0].positions.find(p=>p.symbol==='ZEC');assert.ok(p);
  const normalized=normalizeLighter({payload,receipt,account_index:String(id),market_id:p.market_id},{symbol:'ZEC',route_symbol:'ZEC',run_id:'ORIGINAL_RECEIPT_REPLAY',snapshot_id:String(id),as_of_ms:T,received_at_ms:receipt.received_ts,max_age_ms:300000});
  const acquisition=createScopedProviderAcquisition({contract:'ZEC-USDT',native_symbol:'ZEC',run_id:'ORIGINAL_RECEIPT_REPLAY',acquisition_id:String(id),provider:'Lighter official',venue:'Lighter',price_quote:'USDC',collection_started_ts:receipt.started_ts,collection_completed_ts:receipt.received_ts,normalized_receipts:[normalized],transport_receipts:[receipt]});
  contexts.push(bindScopedProviderAcquisition(acquisition,{contract:'ZEC-USDT',run_id:'ORIGINAL_RECEIPT_REPLAY',snapshot_id:'ORIGINAL_CUTOFF_COMPONENT_REPLAY',observed_ts:T,direction:null}));
 }
 const c={metadata:{contract:'ZEC-USDT'},run_id:'ORIGINAL_RECEIPT_REPLAY',snapshot_id:'ORIGINAL_CUTOFF_COMPONENT_REPLAY',observed_ts:T,direction:null,liquidations:{independent_extensions:contexts}};
 assert.ok(contexts.every(x=>x.status==='USABLE_RECEIPT_ONLY_CONTEXT'&&x.source_ts===null&&x.entry_eligible===false));
 assert.equal(validateNativeLiquidationContext(c,{checked_ts:T,check_freshness:true}).ok,true);
 const before=JSON.stringify(c),text=nativeLiquidationLines(c.liquidations,{manual:true}).join(' ');
 assert.match(text,/14619,85484/);assert.match(text,/14649,05773/);assert.doesNotMatch(text,/объединено/);assert.match(text,/время исходного состояния неизвестно/);assert.equal(JSON.stringify(c),before);
});
