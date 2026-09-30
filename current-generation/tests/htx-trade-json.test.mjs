import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseHtxTradePayload,parseHtxMarketJson,exactTradeIdentity} from '../files/src/htx-trade-json.mjs';

const url='https://api.hbdm.com/linear-swap-ex/market/history/trade?contract_code=SOL-USDT&size=2000';
test('N12 wire IDs do not collapse before the actual identity consumer',()=>{
  const raw='{"data":[{"id":123456789012345678901},{"id":123456789012345678902}],"ts":1790761200000,"price":1.25,"amount":1e-4}';
  assert.equal(new Set(JSON.parse(raw).data.map(r=>String(r.id))).size,1);
  const parsed=parseHtxTradePayload(raw);
  assert.deepEqual(parsed.data.map(exactTradeIdentity),['123456789012345678901','123456789012345678902']);
  assert.equal(parsed.ts,1790761200000);assert.equal(parsed.price,1.25);assert.equal(parsed.amount,0.0001);
  assert.equal(exactTradeIdentity(JSON.parse(raw).data[0]),null);
});
test('quoted content and escaped keys retain JSON semantics',()=>{
  const raw=String.raw`{"message":"quoted \\\"id\\\": 123456789012345678901","i\u0064":123456789012345678903,"trade-id":123456789012345678904,"trade_id":"wire-5"}`;
  const parsed=parseHtxTradePayload(raw);
  assert.equal(parsed.message,JSON.parse(raw).message);
  assert.equal(parsed.id,'123456789012345678903');
  assert.equal(parsed['trade-id'],'123456789012345678904');
  assert.equal(parsed.trade_id,'wire-5');
  for(const bad of ['{"id":01}','{"id":1,}','{"id":"unterminated}','{"id":1e}'])assert.throws(()=>parseHtxTradePayload(bad));
});
test('unsafe numeric IDs, objects and absent primary IDs never regain accuracy by string conversion',()=>{
  for(const id of [Number.MAX_SAFE_INTEGER+1,0,-1,1.5,{},true,null,undefined,'   '])assert.equal(exactTradeIdentity({id}),null);
  assert.equal(exactTradeIdentity({'trade-id':Number.MAX_SAFE_INTEGER+1,id:'valid-fallback'}),null);
  assert.equal(exactTradeIdentity({'trade-id':'known-1',id:4}),'known-1');
  assert.equal(exactTradeIdentity({id:12}),'12');
});
test('only exact requested HTX trade channels use lossless IDs',()=>{
  const raw='{"status":"ok","ch":"market.SOL-USDT.trade.detail","data":[{"id":123456789012345678901}]}';
  assert.equal(parseHtxMarketJson(raw,url).data[0].id,'123456789012345678901');
  assert.throws(()=>parseHtxMarketJson(raw,url.replace('SOL-USDT','LINK-USDT')),/CHANNEL_MISMATCH/);
  assert.equal(typeof parseHtxMarketJson('{"id":60}',url.replace('/history/trade','/history/kline')).id,'number');
  assert.equal(typeof parseHtxMarketJson('{"id":60}',url.replace('api.hbdm.com','other.example')).id,'number');
  assert.equal(parseHtxMarketJson('{"status":"error","err-msg":"bad-symbol"}',url)['err-msg'],'bad-symbol');
  assert.equal(parseHtxMarketJson('{"status":"ok","ch":"market.solusdt.trade.detail","data":[{"trade-id":123456789012345678901}]}','https://api.htx.com/market/history/trade?symbol=solusdt').data[0]['trade-id'],'123456789012345678901');
});
test('worker uses the same parser and preserves missing-component diagnostics',()=>{
  const source=fs.readFileSync(new URL('../files/src/worker.js',import.meta.url),'utf8');
  assert.match(source,/data = parseHtxMarketJson\(text, url\)/);
  assert.match(source,/return exactTradeIdentity\(trade\)/);
  assert.match(source,/data_sufficiency_gaps:\s*deep\?\.data_sufficiency\?\.gaps \?\? \[\]/);
  assert.match(source,/gaps:insufficientDeepResult.data_sufficiency_gaps\?\?/);
  assert.match(source,/htx_futures_order_flow: "not_closed"/);
});
