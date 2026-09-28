import test from 'node:test';
import assert from 'node:assert/strict';
import {extractHyperliquidMarketContext} from '../files/src/liquidation-extension/hyperliquid-market-context.mjs';

const T=1_800_000_000_000,receipt={http_status:200,received_ts:T-1000,sha256:'a'.repeat(64)};
const payload=[{universe:[{name:'FIL',isDelisted:false},{name:'ABC',isDelisted:false}]},[{openInterest:'10',funding:'0.0001',markPx:'3',oraclePx:'3.01',dayNtlVlm:'1000'},{openInterest:'4',funding:'-0.0002',markPx:'2',oraclePx:'2.01',dayNtlVlm:'500'}]];

test('K28 Hyperliquid reuses the exact catalog response as shadow market context',()=>{const out=extractHyperliquidMarketContext({payload,receipt,native_symbol:'FIL',observed_ts:T});assert.equal(out.status,'CLOSED');assert.equal(out.open_interest_native,10);assert.equal(out.source_ts,null);assert.equal(out.timestamp_basis,'HTTP_RECEIPT_ONLY_NO_METRIC_EVENT_TIME');assert.equal(out.entry_eligible,false);});
test('K28 Hyperliquid rejects length mismatch, aliases, delisted, invalid funding and receipt clocks',()=>{
 assert.equal(extractHyperliquidMarketContext({payload:[payload[0],[payload[1][0]]],receipt,native_symbol:'FIL',observed_ts:T}).reason,'HL_UNIVERSE_CONTEXT_LENGTH_MISMATCH');
 assert.equal(extractHyperliquidMarketContext({payload,receipt,native_symbol:'dex:FIL',observed_ts:T}).reason,'HL_EXACT_ASSET_IDENTITY_REQUIRED');
 const delisted=[{universe:[{name:'FIL',isDelisted:true}]},[payload[1][0]]];assert.equal(extractHyperliquidMarketContext({payload:delisted,receipt,native_symbol:'FIL',observed_ts:T}).reason,'HL_MARKET_DELISTED');
 const emptyFunding=[{universe:[{name:'FIL'}]},[{...payload[1][0],funding:''}]];assert.equal(extractHyperliquidMarketContext({payload:emptyFunding,receipt,native_symbol:'FIL',observed_ts:T}).reason,'HL_MARKET_CONTEXT_NUMERIC_FIELD_INVALID');
 assert.equal(extractHyperliquidMarketContext({payload,receipt:{...receipt,received_ts:T+1},native_symbol:'FIL',observed_ts:T}).reason,'HL_RECEIPT_FUTURE_OR_MISSING');
 assert.equal(extractHyperliquidMarketContext({payload,receipt:{...receipt,received_ts:T-200000},native_symbol:'FIL',observed_ts:T}).reason,'HL_RECEIPT_STALE');
});
