import test from 'node:test';import assert from 'node:assert/strict';
import {summarizeIncrementalCoverage} from '../../maintenance/incremental-coverage-measurement.mjs';
test('Bitget/Coinbase incremental coverage is measured against active HTX futures without voting',()=>{
 const htx={data:[{contract_code:'ONG-USDT',contract_status:1,business_type:'swap'},{contract_code:'BTC-USDT',contract_status:1,business_type:'swap'},{contract_code:'OLD-USDT',contract_status:0,business_type:'swap'}]};
 const bf={data:[{symbol:'ONGUSDT'},{symbol:'ETHUSDT'}]},bs={data:[{symbol:'BTCUSDT'},{symbol:'ONGUSDT'}]};
 const cb=[{base_currency:'BTC',quote_currency:'USD',trading_disabled:false},{base_currency:'ONG',quote_currency:'EUR',trading_disabled:false}];
 const r=summarizeIncrementalCoverage({htxPayload:htx,bitgetFuturesPayload:bf,bitgetSpotPayload:bs,coinbasePayload:cb});
 assert.equal(r.htx_futures_active_count,2);assert.equal(r.bitget_futures_overlap_count,1);assert.equal(r.bitget_spot_overlap_count,2);assert.equal(r.coinbase_spot_overlap_count,1);assert.equal(r.no_automatic_voting,true);assert.equal(r.no_source_enablement,true);
});
