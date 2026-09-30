import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fingerprint} from '../files/src/liquidation-extension/core.mjs';
import {bindScopedProviderAcquisition} from '../files/src/liquidation-extension/scoped-provider-runtime-bridge.mjs';
import {createMultiLiquidationAcquisition} from '../files/src/liquidation-extension/gtrade-runtime-bridge.mjs';
import {attachNativeContext} from '../files/src/liquidation-extension/runtime-bridge.mjs';
import {validateNativeLiquidationContext} from '../files/src/native-liquidation-guard.mjs';
import {buildDynamicLiquidationPanel} from '../files/src/dynamic-liquidation-panel.mjs';
import {canonicalFingerprint,renderCanonicalManual,renderCanonicalTelegram} from '../files/src/canonical-publication.mjs';
import {classifyCanonicalRunCompletion,formatManualRunSummary} from '../files/src/manual-run-summary.mjs';

// Synthetic presentation control based on the preserved delivered snapshot;
// no source request, new market signal, trade or Telegram call is made.
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/tao-delivered-20260929.json',import.meta.url)));
function setup(){
 const c=structuredClone(fixture.canonical_subset),t=c.observed_ts;
 c.targets=[{price:280,basis:'PRECOMMITTED_MEASURED_STRUCTURE'}];
 c.metadata.technical_move_potential={status:'CLOSED',basis:'PRECOMMITTED_MEASURED_STRUCTURE',target_price:280};
 const zone={native_price:200,native_reference_price:300,side:'LONG',notional:1000,notional_unit:'USDC',distance_pct:-100/3,source_ts:null,source_clock_closed:false,entry_eligible:false,is_htx_price:false};
 const body={schema:'SCOPED_PROVIDER_LIQUIDATION_ACQUISITION_V1',mode:'SHADOW_ONLY',contract:'TAO-USDT',native_symbol:'TAO',run_id:c.run_id,acquisition_id:'SYNTHETIC:RECEIPT_ONLY',provider:'Lighter official',venue:'Lighter',price_quote:'USDC',collection_started_ts:t-1000,collection_completed_ts:t-100,source_ts:null,source_clock_closed:false,above:[],below:[zone]};
 const raw={...body,acquisition_fingerprint:fingerprint(body)};
 const identity={contract:'TAO-USDT',run_id:c.run_id,snapshot_id:c.snapshot_id,observed_ts:t,direction:c.direction};
 c.liquidations=attachNativeContext({},createMultiLiquidationAcquisition({contract:'TAO-USDT',run_id:c.run_id,scoped:[raw]}),identity);
 c.analytical_fingerprint=canonicalFingerprint(c);return {c,raw,identity};
}
test('receipt-only context passes both canonical renderers with an explicit unknown source clock and no score evidence',()=>{
 const {c}=setup(),context=c.liquidations.independent_extensions[0];
 assert.equal(context.status,'USABLE_RECEIPT_ONLY_CONTEXT');
 const prior=structuredClone(c),oldContext=prior.liquidations.independent_extensions[0];oldContext.status='USABLE_SCOPED_NATIVE_CONTEXT';const {fingerprint:oldFingerprint,...oldBody}=oldContext;oldContext.fingerprint=fingerprint(oldBody);
 assert.equal(validateNativeLiquidationContext(prior).status,'NATIVE_LIQUIDATION_SOURCE_TIME_INVALID');
 const guard=validateNativeLiquidationContext(c,{checked_ts:c.observed_ts+100,check_freshness:true});
 assert.equal(guard.ok,true);assert.equal(guard.freshness_checked,false);assert.equal(guard.receipt_only_contexts,1);
 const panel=buildDynamicLiquidationPanel({contexts:[context],reference_price:300,observed_ts:c.observed_ts});
 assert.equal(panel.zones_seen,0);assert.equal(panel.score_evidence,null);assert.deepEqual(panel.clusters,[]);
 const manual=renderCanonicalManual({canonical:c}),telegram=renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE'});
 assert.equal(manual.ok,true,manual.status);assert.equal(telegram.ok,true,telegram.status);
 assert.match(manual.text,/время исходного состояния неизвестно/u);
 // Compact Telegram intentionally omits the detailed foreign-venue sample.
 assert.doesNotMatch(telegram.text,/Lighter|200 USDC/u);
 assert.equal(manual.analytical_fingerprint,telegram.analytical_fingerprint);
});
test('a forged fresh clock, target eligibility or expired receipt is rejected',()=>{
 for(const mutate of [x=>x.source_ts=x.binding.observed_ts,x=>x.below[0].decision_target_eligible=true,x=>x.received_ts=x.binding.observed_ts-300001]){
  const {c}=setup(),x=c.liquidations.independent_extensions[0];mutate(x);const {fingerprint:f,...body}=x;x.fingerprint=fingerprint(body);c.analytical_fingerprint=canonicalFingerprint(c);
  assert.equal(validateNativeLiquidationContext(c).ok,false);
 }
});
test('scoped binding never upgrades an unknown clock and rejects future source times',()=>{
 const {raw,identity}=setup();const out=bindScopedProviderAcquisition(raw,identity);assert.equal(out.source_ts,null);assert.equal(out.source_age_ms,null);
 const bad=structuredClone(raw);bad.source_clock_closed=true;bad.source_ts=identity.observed_ts+1;const {acquisition_fingerprint:f,...body}=bad;bad.acquisition_fingerprint=fingerprint(body);
 assert.equal(bindScopedProviderAcquisition(bad,identity).reason,'SCOPED_PROVIDER_SOURCE_CLOCK_INVALID');
});
test('degraded or missing canonical output cannot masquerade as a healthy no-idea report',()=>{
 for(const cron of [{v3_pipeline_health_status:'DEGRADED_PIPELINE',v3_pipeline_health_reason:'DEEP_DATA_INSUFFICIENT'},{v3_pipeline_health_status:'HEALTHY',v3_live_deep_check_count:1}]){
  const result=classifyCanonicalRunCompletion({candidate_count:0,cron});assert.equal(result.status,'PARTIAL_DATA_UNAVAILABLE');
  const text=formatManualRunSummary({...result,candidates:[]});assert.match(text,/Проверка не завершена/u);assert.doesNotMatch(text,/Подтверждённых идей сейчас нет/u);
 }
 assert.equal(classifyCanonicalRunCompletion({candidate_count:0,cron:{v3_pipeline_health_status:'HEALTHY',v3_live_deep_check_count:0}}).status,'CLOSED_NO_CANONICAL_CANDIDATE');
});
