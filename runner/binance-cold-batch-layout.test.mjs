import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveBinanceColdBatchDirectories as resolve} from './binance-cold-batch-layout.mjs';
const btc={market:'spot',symbol:'BTCUSDT',month:'2026-06'},eth={...btc,symbol:'ETHUSDT'};
test('distinct symbols and markets cannot share modern archive paths',()=>{
 assert.deepEqual(resolve({storage_layout:'MARKET_SYMBOL_MONTH',archives:[btc,eth,{...btc,market:'usd_m_futures'}]}),['spot/BTCUSDT/2026-06','spot/ETHUSDT/2026-06','usd_m_futures/BTCUSDT/2026-06']);
});
test('legacy collision is refused before files are read or written',()=>{
 assert.throws(()=>resolve({archives:[btc,eth]}),/LEGACY_MULTI_SYMBOL_PATH_COLLISION/);
 assert.deepEqual(resolve({archives:[btc,{...btc,month:'2026-07'}]}),['spot/2026-06','spot/2026-07']);
});
test('duplicate identities, path injection, unknown layouts and excess batches refuse',()=>{
 for(const input of [{storage_layout:'MARKET_SYMBOL_MONTH',archives:[btc,btc]},{archives:[{...btc,symbol:'../BTCUSDT'}]},{archives:[{...btc,month:'2026-13'}]},{archives:[{...btc,market:'../spot'}]},{storage_layout:'OTHER',archives:[btc]},{archives:Array(613).fill(btc)}])assert.throws(()=>resolve(input));
});
