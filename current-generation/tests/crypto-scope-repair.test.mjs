import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {buildHtxCryptoUniverse,mergeHtxLinearCatalogModes,HTX_LINEAR_MARGIN_CATALOG_URLS} from '../files/src/htx-crypto-universe.mjs';
import {isExactHtxUsdtSwapKey} from '../files/src/htx-contract-key.mjs';
import {compileOfficialSourceRegistry} from '../files/src/official-source-registry.mjs';
import {collectReadyHtxVolumeProfile} from '../files/src/htx-volume-profile-collector.mjs';
import {clearVolumeProfileSnapshots} from '../files/src/htx-volume-profile.mjs';
import {buildApprovedFeeSchedule} from '../files/src/user-approved-publication-policy.mjs';

const root=new URL('../../audit-fixes/crypto-scope-repair-20261004/fixtures/',import.meta.url),proof=JSON.parse(fs.readFileSync(new URL('provenance.json',root)));
const catalogs=Object.fromEntries(proof.responses.map(r=>{const body=gunzipSync(fs.readFileSync(new URL(r.family+'.json.gz',root)));assert.equal(crypto.createHash('sha256').update(body).digest('hex'),r.body_sha256);assert.equal(r.synthetic,false);return[r.family,JSON.parse(body)];}));
const now=Math.max(...Object.values(catalogs).map(r=>r.ts))+1000;
const worker=fs.readFileSync(new URL('../files/src/worker.js',import.meta.url),'utf8'),start=worker.indexOf('function classifyHtxInstrumentScope('),end=worker.indexOf('function symbolFingerprint('),classify=vm.runInNewContext(worker.slice(start,end)+';classifyHtxInstrumentScope',{});

test('primary three-family catalog retains all crypto tokens and their exact settlement contracts',()=>{
 const u=buildHtxCryptoUniverse({catalogs,classify_linear:classify,observed_ts:now});
 assert.equal(u.status,'CLOSED');assert.deepEqual(u.counts,{crypto_contracts:119,crypto_assets:102,excluded_contracts:268,by_family:{linear:106,coin_swap:5,coin_delivery:8}});
 for(const symbol of ['PAXG','XAUT','牛来','哈基米','币安人生','龙虾'])assert.ok(u.assets.some(r=>r.symbol===symbol),symbol);
 assert.ok(u.contracts.some(r=>r.contract_code==='BTC-USDT-261009'&&r.market_kind==='LINEAR_DELIVERY'));
 assert.ok(u.contracts.some(r=>r.contract_code==='DOGE-USD'&&r.settlement_asset==='DOGE'&&r.price_quote==='USD'));
 assert.equal(u.all_market_adapters_complete,false);assert.equal(u.contracts.filter(r=>r.production_market_adapter_supported).length,102);
 for(const symbol of ['EURUSD','GBPUSD','USDJPY','USDBRL','AAPL'])assert.equal(u.assets.some(r=>r.symbol===symbol),false);
});
test('issuer-proven crypto exception cannot override an explicit stock or wrong exact underlying',()=>{
 const row=catalogs.linear.data.find(r=>r.contract_code==='PAXG-USDT');assert.equal(classify(row).eligible_for_crypto_discovery,true);
 for(const patch of [{symbol:'OTHER'},{labels:['stock']},{tradfi_labels:['Stocks']},{contract_code:'PAXG2-USDT'}])assert.equal(classify({...row,...patch}).eligible_for_crypto_discovery,false);
 const bnc=catalogs.linear.data.find(r=>r.contract_code==='BNC-USDT');assert.equal(classify(bnc).eligible_for_crypto_discovery,false);
});
test('missing catalog or duplicate contract cannot claim the full universe complete',()=>{
 const partial=buildHtxCryptoUniverse({catalogs:{linear:catalogs.linear},classify_linear:classify,observed_ts:now});assert.equal(partial.status,'PARTIAL');assert.equal(partial.failures.length,2);
 const duplicate=structuredClone(catalogs);duplicate.coin_swap.data.push(duplicate.coin_swap.data[0]);assert.equal(buildHtxCryptoUniverse({catalogs:duplicate,classify_linear:classify,observed_ts:now}).status,'PARTIAL');
 const future=structuredClone(catalogs);future.coin_swap.ts=now+1;assert.equal(buildHtxCryptoUniverse({catalogs:future,classify_linear:classify,observed_ts:now}).status,'PARTIAL');
});
test('opaque exact Unicode and numeric keys are accepted and malformed keys remain blocked',()=>{
 for(const contract of ['牛来-USDT','哈基米-USDT','币安人生-USDT','龙虾-USDT','1000SHIB-USDT','0G-USDT','🐱-USDT'])assert.equal(isExactHtxUsdtSwapKey(contract),true);
 for(const contract of ['A B-USDT','A/USDT','A-USDT?x=1','A\u0000-USDT','A-USDT-261009','-USDT'])assert.equal(isExactHtxUsdtSwapKey(contract),false);
});
test('official project metadata accepts CJK identities without guessing their token address',()=>{
 const source=JSON.parse(fs.readFileSync(new URL('../files/official-event-sources.json',import.meta.url)));source.entries=[{...source.entries[0],contract_code:'哈基米-USDT'}];const out=compileOfficialSourceRegistry(source);assert.ok(out.registry['哈基米']);assert.equal(out.records[0].contract_code,'哈基米-USDT');
});
test('Unicode fee receipt keeps the same approved rates and exact HTX contract',()=>{
 const receipt=buildApprovedFeeSchedule({decision_summary:{contract_code:'币安人生-USDT'},observed_ts:now});
 assert.equal(receipt.status,'CLOSED');assert.equal(receipt.contract_code,'币安人生-USDT');assert.equal(receipt.entry_rate,0.001);assert.equal(receipt.exit_rate,0.001);
});
test('Unicode HTX profiles reach the exact encoded primary routes within unchanged admission budget',async()=>{
 clearVolumeProfileSnapshots();const calls=[];const r=await collectReadyHtxVolumeProfile({contract:'哈基米-USDT',run_id:'CONTROLLED_UNICODE_ROUTE',clock:()=>now,request_admit:p=>{assert.equal(p.attempts,3);return{allowed:true};},fetch_impl:async url=>{calls.push(new URL(url));return new Response(JSON.stringify({status:'error',err_msg:'controlled unavailable response'}));}});
 assert.equal(r.network_calls,3);assert.equal(calls.length,3);assert.ok(calls.every(u=>u.searchParams.get('contract_code')==='哈基米-USDT'));assert.notEqual(r.status,'CLOSED');
});

test('all margin modes are unioned and neither conflicts nor unidentified assets can claim complete enumeration',()=>{
 assert.equal(new URL(HTX_LINEAR_MARGIN_CATALOG_URLS.isolated).searchParams.get('business_type'),'swap');
 const base=catalogs.linear,unique={...base.data[0],symbol:'123CRYPTO',contract_code:'123CRYPTO-USDT',pair:'123CRYPTO-USDT',labels:[],tradfi_labels:[]},modes={all:base,cross:{...base,data:[unique]},isolated:{...base,data:[]}};
 const merged=mergeHtxLinearCatalogModes({base,modes,observed_ts:now});assert.equal(merged.status,'CLOSED');assert.deepEqual(merged.new_contracts_vs_default,['123CRYPTO-USDT']);assert.ok(buildHtxCryptoUniverse({catalogs:{...catalogs,linear:merged.payload},classify_linear:classify,observed_ts:now}).assets.some(r=>r.symbol==='123CRYPTO'));
 assert.equal(mergeHtxLinearCatalogModes({base,modes:{all:base},observed_ts:now}).status,'PARTIAL');
 assert.equal(mergeHtxLinearCatalogModes({base,modes:{...modes,cross:{...base,data:[{...base.data[0],contract_size:999}]}},observed_ts:now}).status,'PARTIAL');
 const unknown=structuredClone(catalogs);delete unknown.linear.data[0].labels;assert.equal(buildHtxCryptoUniverse({catalogs:unknown,classify_linear:classify,observed_ts:now}).status,'PARTIAL');
});
