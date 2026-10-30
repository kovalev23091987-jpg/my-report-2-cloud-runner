import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeCapturedBulkPrices} from '../../sources/captured-bulk-price-coverage.mjs';

test('actualF550 exactschema direct envelope keeps brokerbody/receive clocks separate from outerSQL completion and compressedwireunknown',()=>{
  const received=1792958221604,event=received-10;
  const capture={received_ts:received+5000,body:{schema:'PUMP_SOURCE_FEASIBILITY_ACTUAL_V1',run_id:'CONTROLLED_F551_DIRECT',raw_responses:[
    {request:{url:'https://open-api.bingx.com/openApi/swap/v2/quote/trades?limit=100&symbol=SOL-USDT'}},
    {request:{url:'https://open-api.bingx.com/openApi/swap/v2/quote/ticker',method:'GET',started_ts:received-23},response:{ok:true,status:200,semantic_status:'SUCCESS',received_ts:received,receipt_id:'CONTROLLED_ACTUAL_ENVELOPE',cache_hit:false,latency_ms:23,body_bytes:89,body_bytes_basis:'FETCH_RESPONSE_BODY_BYTES_NOT_COMPRESSED_NETWORK_WIRE',wire_bytes:null,data:{code:0,data:[{symbol:'SOL-USDT',lastPrice:'10',closeTime:event}]}}}]}};
  const r=analyzeCapturedBulkPrices({capture,expected_symbols:['SOL-USDT'],as_of_ts:received+6000});
  assert.equal(r.capture_layout,'ACTUAL_V1_BODY_RAW_RESPONSES');assert.equal(r.original_received_ts,received);assert.equal(r.rows[0].event_ts,event);
  assert.equal(r.totals.fresh_at_original_receive,1);assert.equal(r.payload_evidence.provided_latency_ms,23);
  assert.equal(r.payload_evidence.elapsed_request_start_to_received_ms,23);assert.equal(r.payload_evidence.fetch_response_body_bytes,89);
  assert.equal(r.payload_evidence.wire_body_bytes,null);assert.equal(r.current_membership.count,null);assert.equal(r.strict_asset_identity.verified_count,null);
  const invalid=structuredClone(capture);invalid.body.schema='SOME_OTHER_SCHEMA';
  assert.throws(()=>analyzeCapturedBulkPrices({capture:invalid,expected_symbols:['SOL-USDT'],as_of_ts:received+6000}),/SUPPORTED_BOUNDED_RAW_RESPONSES/);
  const ambiguous=structuredClone(capture);ambiguous.body.result={raw_responses:[]};
  assert.throws(()=>analyzeCapturedBulkPrices({capture:ambiguous,expected_symbols:['SOL-USDT'],as_of_ts:received+6000}),/AMBIGUOUS_CAPTURE_ENVELOPE/);
});
