import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateHtxFuturesTurnoverGate } from '../src/htx-turnover-gate.mjs';

function row(turnover,{stale=false,spot=false}={}){
  return {
    contract_code:'TEST-USDT',
    turnover_24h_usdt:turnover,
    symbol_fingerprint:{resolution_status:'RESOLVED_HTX_EXACT'},
    instrument_scope:{classification:'CRYPTO_CONFIRMED'},
    quality:{market_present:true, htx_spot_present:spot},
    freshness:{stale,market_age_sec:20},
  };
}

test('99,999 fails, 100,000 and 100,001 pass inclusive',()=>{
  assert.equal(evaluateHtxFuturesTurnoverGate(row(99999)).allowed,false);
  assert.equal(evaluateHtxFuturesTurnoverGate(row(99999)).reason,'HTX_FUTURES_24H_TURNOVER_BELOW_100K');
  assert.equal(evaluateHtxFuturesTurnoverGate(row(100000)).allowed,true);
  assert.equal(evaluateHtxFuturesTurnoverGate(row(100001)).allowed,true);
});

test('missing/stale are not coerced to zero and HTX Spot is not required',()=>{
  const missing=evaluateHtxFuturesTurnoverGate(row(null));
  assert.equal(missing.allowed,false); assert.equal(missing.turnover_usd_equivalent,null); assert.match(missing.reason,/MISSING/);
  const stale=evaluateHtxFuturesTurnoverGate(row(500000,{stale:true}));
  assert.equal(stale.allowed,false); assert.match(stale.reason,/STALE/);
  const noSpot=evaluateHtxFuturesTurnoverGate(row(500000,{spot:false}));
  assert.equal(noSpot.allowed,true); assert.equal(noSpot.htx_spot_required,false);
});
