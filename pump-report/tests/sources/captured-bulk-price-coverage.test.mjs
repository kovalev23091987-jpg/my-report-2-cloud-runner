import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {analyzeCapturedBulkPrices,stableCapturedJSON} from '../../sources/captured-bulk-price-coverage.mjs';
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');

test('captured bulk reader/CLI preserve Unicode and original clocks, reject ambiguities, distinguish missing/invalid and never infer identity or wire bytes',()=>{
  const at=1792956600000,scope=['SOL-USDT','币-USDT','幣-USDT','DUP-USDT','OLD-USDT','FUT-USDT','BAD-USDT','MISSING-USDT','TYPE-USDT'];
  const quote=(symbol,changes={})=>({symbol,lastPrice:'1234.56789',closeTime:at-1000,...changes});
  const entry={request:{url:'https://open-api.bingx.com/openApi/swap/v2/quote/ticker'},response:{ok:true,status:200,semantic_status:'SUCCESS',receipt_id:'SYNTHETIC_F551',received_ts:at-500,cache_hit:true,
    data:{code:0,data:[quote('SOL-USDT'),quote('币-USDT'),quote('DUP-USDT'),quote('DUP-USDT'),quote('DUP-USDT',{lastPrice:'2'}),
      quote('OLD-USDT',{closeTime:at-40000}),quote('FUT-USDT',{closeTime:at+1}),quote('BAD-USDT',{lastPrice:'0'}),quote('TYPE-USDT',{lastPrice:true}),
      quote('sol-USDT'),null,{symbol:42}]}}};
  const capture={body:{result:{raw_responses:[{request:{url:'https://open-api.bingx.com/openApi/swap/v2/quote/trades?symbol=SOL-USDT'}},entry]}}};
  const analyze=(c=capture,as_of_ts=at)=>analyzeCapturedBulkPrices({capture:c,expected_symbols:scope,as_of_ts,sha256:hash});
  const r=analyze(),by=Object.fromEntries(r.rows.map(x=>[x.native_symbol,x]));
  assert.deepEqual([r.totals.fresh_price,r.totals.stale_price,r.totals.missing,r.totals.ambiguous,r.totals.invalid],[2,1,2,1,3]);
  assert.equal(by['币-USDT'].status,'FRESH_PRICE');assert.equal(by['幣-USDT'].status,'MISSING');
  assert.equal(by['DUP-USDT'].matched_rows,3);assert.equal(by['DUP-USDT'].positive_price_valid,null);
  assert.equal(r.outside_saved_scope[0].native_symbol,'sol-USDT');assert.equal(r.totals.invalid_wire_rows,2);
  assert.equal(by['SOL-USDT'].event_ts,at-1000);assert.equal(by['SOL-USDT'].received_ts,at-500);
  assert.equal(by['SOL-USDT'].expires_ts,at-1000+30000);assert.equal(r.cache_hit,true);
  assert.equal(r.payload_evidence.wire_body_bytes,null);assert.equal(r.payload_evidence.provided_latency_ms,null);
  assert.equal(r.payload_evidence.elapsed_request_start_to_received_ms,null);
  assert.equal(r.payload_evidence.response_data_canonical_sha256,hash(stableCapturedJSON(entry.response.data)));
  assert.equal(JSON.stringify(r).includes('1234.56789'),false);
  assert.equal(r.current_membership.count,null);assert.equal(r.strict_asset_identity.verified_count,null);assert.equal(r.full_CORE.verified_count,null);
  assert.equal(r.all550_operationally_verified,false);assert.equal(by['SOL-USDT'].execution_multiplier,null);
  const aged=analyze(capture,at+60000);assert.equal(aged.totals.fresh_price,0);
  assert.equal(aged.rows[0].fresh_at_original_receive,true);assert.equal(aged.rows[0].event_ts,at-1000);
  const two=structuredClone(capture);two.body.result.raw_responses.push(structuredClone(entry));
  const ambiguous=analyze(two);assert.equal(ambiguous.totals.not_checked_source,scope.length);assert.equal(ambiguous.totals.missing,0);
  for(const mutate of [e=>e.response.received_ts=at+1,e=>e.response.receipt_id=null,e=>e.response.data.code='0',e=>e.response.semantic_status='TEMPORARY']){
    const c=structuredClone(capture);mutate(c.body.result.raw_responses[1]);assert.equal(analyze(c).totals.not_checked_source,scope.length);
  }
  const seconds=structuredClone(capture);seconds.body.result.raw_responses[1].response.data.data[0].closeTime=Math.floor(at/1000);
  assert.equal(analyze(seconds).rows[0].status,'INVALID');
  const measured=structuredClone(capture),e=measured.body.result.raw_responses[1];
  e.response.wire_bytes=77;assert.equal(analyze(measured).payload_evidence.wire_body_bytes,null);
  e.response.wire_bytes_basis='MEASURED_WIRE_BODY_BYTES';e.request.started_ts=at-600;e.response.latency_ms=70;
  assert.equal(analyze(measured).payload_evidence.wire_body_bytes,77);assert.equal(analyze(measured).payload_evidence.elapsed_request_start_to_received_ms,100);
  assert.equal(analyze(measured).payload_evidence.provided_latency_ms,70);
  assert.throws(()=>analyzeCapturedBulkPrices({capture,expected_symbols:['X','X'],as_of_ts:at}),/UNIQUE_EXPECTED_SCOPE/);
  assert.throws(()=>analyzeCapturedBulkPrices({capture:{},expected_symbols:scope,as_of_ts:at}),/RAW_RESPONSES/);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'f551-controlled-'));
  const input=path.join(dir,'SYNTHETIC_CAPTURE.json'),output=path.join(dir,'coverage.json');
  const bytes=JSON.stringify(capture);fs.writeFileSync(input,bytes);
  const cli=fileURLToPath(new URL('../../handoffs/sources/analyze-f551-captured-bulk.mjs',import.meta.url));
  const stdout=execFileSync(process.execPath,[cli,'--input',input,'--sha256',hash(bytes),'--output',output,'--as-of',String(at)],{encoding:'utf8'});
  const actual=JSON.parse(fs.readFileSync(output,'utf8'));
  assert.equal(actual.rows.length,550);assert.equal(actual.captured_file_evidence.capture_file_sha256,hash(bytes));
  assert.equal(actual.captured_file_evidence.scope_file_sha256,'5e5610a579142fd19d2448b4d1834fe75498b8b4263ea41435ebd71b52b31920');
  assert.equal(actual.captured_file_evidence.capture_file_bytes,Buffer.byteLength(bytes));
  assert.equal(JSON.parse(stdout).new_HTTP_SQL_TG,0);
  assert.throws(()=>execFileSync(process.execPath,[cli,'--input',input,'--sha256','0'.repeat(64),'--output',path.join(dir,'bad.json')],{stdio:'pipe'}));
  assert.equal(fs.existsSync(path.join(dir,'bad.json')),false);
  const malformed=path.join(dir,'malformed.json'),secret='SYNTHETIC_PRIVATE_BODY_MUST_NOT_LEAK';
  fs.writeFileSync(malformed,'{'+secret);
  try{execFileSync(process.execPath,[cli,'--input',malformed,'--sha256',hash(fs.readFileSync(malformed)),'--output',path.join(dir,'invalid.json')],{stdio:'pipe'});assert.fail('Malformed capture accepted');}
  catch(error){assert.ok(String(error.stderr).includes('CAPTURE_JSON_INVALID_NO_BODY_EXPORTED'));assert.equal(String(error.stderr).includes(secret),false);}
  assert.equal(fs.existsSync(path.join(dir,'invalid.json')),false);
});
