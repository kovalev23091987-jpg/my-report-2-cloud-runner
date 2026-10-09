import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {APPROVED_HTX_SCOPE as scope,APPROVED_HTX_ANALYSIS_CONTRACTS as base,bindApprovedHtxAnalysisScope as bind} from '../files/src/approved-htx-analysis-scope.mjs';
const row=x=>({...x,symbol:x.asset_symbol,instrument_scope:{classification:'CRYPTO_CONFIRMED'},price:12,source_ts:123});
test('approved membership matches every exact retained primary contract and all restricted families',()=>{
 const bytes=fs.readFileSync(new URL('../../checkpoints/htx-all-modes-crypto-futures-universe-20261004.json.gz',import.meta.url)),original=JSON.parse(gunzipSync(bytes));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),scope.manifest_sha256);assert.equal(original.contracts.length,119);assert.equal(original.assets.length,102);assert.equal(new Set(original.contracts.map(x=>x.family)).size,3);
 assert.deepEqual(base,original.assets.map(x=>({contract_code:x.asset_analysis_contract,asset_symbol:x.symbol})));assert.equal(original.contracts.filter(x=>!x.production_market_adapter_supported).length,17);
});
test('adding new native crypto cannot enlarge approved scope or contaminate accepted facts',()=>{
 const input=[...base.map(row),row({contract_code:'CT-USDT',asset_symbol:'CT'}),row({contract_code:'NEW-USDT',asset_symbol:'NEW'})],snapshot=structuredClone(input),result=bind(input,{observed_ts:999});
 assert.equal(result.audit.status,'CLOSED');assert.equal(result.contracts.length,102);assert.deepEqual(result.contracts, input.slice(0,102));assert.deepEqual(input,snapshot);assert.deepEqual(result.audit.outside_approved_crypto_contracts.map(x=>x.contract),['CT-USDT','NEW-USDT']);assert.equal(result.audit.source_clocks_refreshed,false);
});
test('missing, aliased, mismatched and duplicated approved identities fail completeness without filling prices',()=>{
 for(const input of [base.slice(1).map(row),base.map((x,i)=>row(i?x:{...x,contract_code:x.contract_code.toLowerCase()})),base.map((x,i)=>({...row(x),symbol:i?x.asset_symbol:'WRONG'})),[...base.map(row),row(base[0])]]){
 const result=bind(input,{observed_ts:999});assert.equal(result.audit.status,'NOT_CLOSED');assert.equal(result.audit.expected_analysis_contracts,102);assert.ok(result.audit.missing_approved_analysis_contracts.includes(base[0].contract_code));assert.ok(result.contracts.length<102);assert.ok(result.contracts.every(x=>input.includes(x)));
 }
});
test('structural membership cannot override primary noncrypto or missing classification',()=>{
 const input=base.map((x,i)=>({...row(x),instrument_scope:{classification:i>1?'CRYPTO_CONFIRMED':i?'UNKNOWN_FAIL_CLOSED':'NON_CRYPTO_HTX_CLASSIFIED'}}));const result=bind(input,{observed_ts:999});assert.equal(result.contracts.length,100);assert.equal(result.audit.status,'NOT_CLOSED');assert.deepEqual(result.audit.missing_approved_analysis_contracts,base.slice(0,2).map(x=>x.contract_code));
});
