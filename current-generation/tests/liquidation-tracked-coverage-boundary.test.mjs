import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const root=process.env.REPORT2_COVERAGE_MODULE_ROOT||fileURLToPath(new URL('../files/src/',import.meta.url));
const mod=relative=>import(pathToFileURL(path.resolve(root,relative)).href);
const {normalizeTrackedBands}=await mod('byk-tracked-future-map.mjs');
const {qualifyNumericFutureReceipt}=await mod('liquidation-futures-coverage.mjs');
const {seal}=await mod('liquidation-extension/core.mjs');
// Explicit synthetic controls for the adapter boundary; never live coverage.
const now=1791143585050;
function receipt(){
 return normalizeTrackedBands({coin:'SOL',mark:100,coverage:{scanned:2,universe:1000,scanned_at:new Date(now-1000).toISOString()},bucket_pct:1,long:[{price:90,notional_usd:20000,positions:1}],short:[{price:110,notional_usd:30000,positions:1}]},{contract:'SOL-USDT',run_id:'BOUNDARY_CONTROL_ONLY',observed_ts:now}).maps[0];
}
function check(r=receipt(),overrides={}){return qualifyNumericFutureReceipt({source_id:'BYK_TRACKED_HL_BANDS',receipt:r,contract:'SOL-USDT',now,...overrides});}
function changed(fields){const {fingerprint,...body}=receipt();return seal({...body,...fields});}
test('actual tracked-band adapter output reaches the capability qualifier',()=>{
 const r=receipt(),result=check(r);assert.equal(r.provider,'ByKaranteli Hyperliquid');assert.equal(result?.status,'REAL_NUMERIC_LEVELS');assert.equal(result.real_numeric_level_count,2);assert.equal(result.upstream_id,'HYPERLIQUID');assert.equal(result.live_signal_generated,false);
});
test('exact legacy label remains supported and extended provider labels fail closed',()=>{
 assert.equal(check(changed({provider:'Bykaranteli tracked Hyperliquid'}))?.real_numeric_level_count,2);
 for(const provider of ['ByKaranteli Hyperliquid fake','Bykaranteli tracked Hyperliquid unknown','OtherProvider'])assert.equal(check(changed({provider})),null);
});
test('label repair retains asset, source, digest and freshness boundaries',()=>{
 assert.equal(check(receipt(),{contract:'NEAR-USDT'}),null);assert.equal(check(receipt(),{source_id:'LIGHTER_NATIVE'}),null);assert.equal(check({...receipt(),provider:'Bykaranteli tracked Hyperliquid'}),null);assert.equal(check(changed({source_ts:now-300001})),null);assert.equal(check(changed({source_ts:now+1})),null);
});
test('calculations and past events cannot qualify through the repaired provider name',()=>{
 for(const evidence_class of ['SOURCE_BACKED_CALCULATED_MODEL','REALIZED_LIQUIDATIONS','LEVERAGE_STRESS_MODEL'])assert.equal(check(changed({evidence_class})),null);
});
