import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createPumpSources} from '../../sources/index.mjs';
import {parseCandles,parseOrderbook} from '../../sources/bingx.mjs';

const cwd=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const expiry=1792934923655;
assert(Date.now()<expiry,'own bounded lease expired');
globalThis.fetch=()=>{throw Error('NO_NETWORK_IN_NATIVE_EVIDENCE_OFFLINE_QUALIFICATION');};
const sha=b=>createHash('sha256').update(b).digest('hex');
const read=p=>fs.readFile(path.join(cwd,p));
const codeHashes={
  'pump-report/sources/index.mjs':'c880977a5be6c1b39bc5a7447d9726f0c6f19c3d96d147f274553dbf825bc622',
  'pump-report/sources/bingx.mjs':'bb7dfe0ed7f28756876831d7a2cdabcc35614c850f2a514f41b825222f528492',
  'pump-report/sources/liquidations.mjs':'7fd1e6cca4eb6037ecbe5d6e9296c681aaa19dfb6248ef38da8bf0e5c2de744e'
};
for(const [p,h] of Object.entries(codeHashes))assert.equal(sha(await read(p)),h,p);
assert.equal(sha(await read('pump-report/handoffs/sources/index-before-delivery-purpose.mjs')),'eb45f0762ed090d29d9a853bfa7f121203cd1148f67c385bec13355e9ea5c5b3');
const expectedPrivate={
  'catalog-corrected':'7b683509fea9d5b3aa1d2612ddb8ad259680a3bc33cc4df5cc97f23b4555e9f5',
  candles:'0147e292d099f5f13ba395ca3fbaebd22571453c87928752e8a4b89d7644f555',
  orderbook:'c0ca264546c756405c97ebb69a1467fc54739e4346978e00d0457a08b85c55d7'
};
const capture={};
for(const [kind,h] of Object.entries(expectedPrivate)){
  const raw=await fs.readFile('/private/tmp/pump-report-native-'+kind+'.json');assert.equal(sha(raw),h,'private capture changed:'+kind);
  const j=JSON.parse(raw);assert.equal(j.http_status,200);assert.equal(j.body.response.status,200);assert.equal(j.body.response.data.code,0);capture[kind]=j.body.response;
}
const base=JSON.parse(await read('pump-report/sources/registry-core8-retained-v1.json'));
const delta=JSON.parse(await read('pump-report/sources/registry-next5-retained-v1.json'));
const registry={instruments:[...base.instruments,...delta.instruments]};
assert.equal(new Set(registry.instruments.map(e=>e.native_contract_id)).size,13);
for(const e of registry.instruments){assert.deepEqual(e.qualifications.candles,{});assert.deepEqual(e.liquidations.routes,[]);}
let nativeCatalogSimulated=0;
const nativeCatalogSource=createPumpSources({identityRegistry:registry,clock:()=>capture['catalog-corrected'].received_ts,broker:{async request(r){
  nativeCatalogSimulated++;assert.equal(r.purpose,'CORE');assert.equal(r.family,'USDT_M');assert.equal(new URL(r.url).pathname,'/openApi/swap/v2/quote/contracts');
  return structuredClone(capture['catalog-corrected']);
}}});
const cat=await nativeCatalogSource.getCatalog();
assert.equal(nativeCatalogSimulated,1);assert.equal(cat.coverage.total,1278);assert.equal(cat.coverage.qualified,13);assert.equal(cat.coverage.unqualified,1265);
assert.deepEqual(cat.coverage.registry_rejected,[]);
const census=JSON.parse(await read('pump-report/sources/current-native-catalog-classification-v1.json'));
assert.equal(census.records.length,1278);assert.equal(census.coverage.active_USDT_at_capture,934);assert.equal(census.coverage.unknown_active_USDT,919);
assert.equal(census.coverage.current_qualified_global_crypto_N,null);
assert.equal(census.records.find(r=>r.native_contract_id==='104206').status_at_capture,25);
for(const row of census.records)if(row.classification==='CRYPTO_UNDERLYING_VERIFIED_TUPLE_MATCHED_AT_CAPTURE')assert(registry.instruments.some(e=>e.native_contract_id===row.native_contract_id&&e.instrument.native_symbol===row.native_symbol&&e.native_base===row.native_asset));

const rawCandles=capture.candles.data.data;
assert.equal(rawCandles.length,125);
const times=rawCandles.map(r=>r.time).sort((a,b)=>a-b);
const parsed=parseCandles(capture.candles.data,{start:times[0],end:times.at(-1)+60000,interval_ms:60000,received_ts:capture.candles.received_ts,windows_ms:[300000,900000,3600000],qualification:{}});
assert.equal(parsed.value.length,125);assert.equal(parsed.qualified,false);assert.equal(parsed.reason,'CANDLE_OPEN_TIME_UNQUALIFIED');
for(const c of parsed.value){
  assert.equal(c.open_ts,null);assert.equal(c.close_ts,null);assert.equal(c.closed,false);assert.equal(c.volume_base,null);
  const raw=rawCandles.find(r=>r.time===c.native_time);assert.equal(c.native_volume_decimal,String(raw.volume));
}
const btc=registry.instruments.find(e=>e.instrument.base==='BTC');
const book=parseOrderbook(capture.orderbook.data,btc.qualifications.orderbook);
assert.equal(book.qualified,true);assert.equal(book.event_ts,capture.orderbook.data.data.T);assert.equal(book.value.bids.length,20);assert.equal(book.value.asks.length,20);assert.equal(book.coverage.complete_book,null);
assert(book.event_ts<=capture.orderbook.received_ts);assert(Date.now()>book.event_ts+15000,'capture is historical now');
const ccxt=JSON.parse(await read('pump-report/handoffs/sources/CCXT_PINNED_NATIVE_CANDLE_REVIEW_V1.json'));
assert.equal(ccxt.ccxt_commit,'d3159f7036f93db086cd0414642132fba5401710');
assert.equal(ccxt.volume_result.status,'BASE_UNIT_NOT_PROVEN_BY_CCXT_MANUAL');assert.equal(ccxt.volume_result.qualification_applied,false);
assert.equal(ccxt.volume_result.manual_short_literal,'usually in terms of the base currency');

// New delivery-purpose seam with synthetic values only. Native values stay
// private and are never substituted into an alleged current trading scenario.
const T=Date.now(),requests=[];
const purposeSource=createPumpSources({identityRegistry:[btc],clock:()=>T,broker:{async request(r){
  requests.push(structuredClone(r));
  const route=new URL(r.url).pathname;
  const data=route.endsWith('/price')?{code:0,data:[{symbol:'BTC-USDT',price:'100',time:T-1000}]}:
    {code:0,data:{T:T-500,bidsCoin:[['99','2']],asksCoin:[['101','3']]}};
  return {ok:true,status:200,data,received_ts:T-200,cache_hit:false,receipt_id:route.endsWith('/price')?'PURPOSE_FIXTURE_PRICE':'PURPOSE_FIXTURE_BOOK'};
}}});
const core=await purposeSource.getCore({instrument:btc.instrument,force_refresh:true,only_facts:['price','orderbook']});
assert.equal(requests.length,2);
const delivered=await purposeSource.getCore({instrument:btc.instrument,purpose:'DELIVERY',force_refresh:true,only_facts:['price','orderbook']});
assert.equal(requests.length,4);
assert.deepEqual(core.facts,delivered.facts);
for(let i=0;i<2;i++){
  assert.equal(requests[i].purpose,'CORE');assert.equal(requests[i+2].purpose,'DELIVERY');
  for(const key of ['provider','family','url','cache_key','method','ttl_ms','candidate_id'])assert.equal(requests[i][key],requests[i+2][key],key);
  assert.equal(requests[i+2].provider,'BINGX');assert.equal(requests[i+2].family,'USDT_M');assert.equal(requests[i+2].ttl_ms,0);
  assert(!requests[i+2].cache_key.includes('DELIVERY'));
}
assert.equal(delivered.facts.price.event_ts,T-1000);assert.equal(delivered.facts.orderbook.event_ts,T-500);assert.equal(delivered.facts.price.received_ts,T-200);
assert.equal(delivered.facts.price.venue,'BINGX');assert.equal(delivered.facts.price.primary_provider,'BINGX');
assert.equal(delivered.facts.price.unit,'USDT_PER_BASE');assert.equal(delivered.facts.orderbook.unit,'USDT_PRICE_BASE_QUANTITY');
await assert.rejects(()=>purposeSource.getCore({instrument:btc.instrument,purpose:'NOT_A_PURPOSE',force_refresh:true,only_facts:['price','orderbook']}),e=>e.code==='INVALID_CORE_REQUEST_PURPOSE');
assert.equal(requests.length,4,'invalid purpose must fail before broker IO');
const files=['pump-report/sources/index.mjs','pump-report/handoffs/sources/index-before-delivery-purpose.mjs','pump-report/handoffs/sources/index-delivery-purpose.diff',
  'pump-report/handoffs/sources/NATIVE_BINGX_20261025_METADATA_V1.json','pump-report/sources/current-native-catalog-classification-v1.json',
  'pump-report/handoffs/sources/CCXT_PINNED_NATIVE_CANDLE_REVIEW_V1.json','pump-report/handoffs/sources/NATIVE_CANDLES_CATALOG_PURPOSE_RU.md',
  'pump-report/handoffs/sources/qualify-native-catalog-purpose.mjs'];
const hashes=[];for(const p of files){const b=await read(p);hashes.push({path:p,bytes:b.length,sha256:sha(b)});}
const result={schema:'PUMP_NATIVE_CATALOG_PURPOSE_OFFLINE_QUALIFICATION_V1',status:'PASS',strict_candle_core_ready:false,
  actual_check_ts:Date.now(),authority_base:'737bfc57be088a3e6662dba39a23084e3103658c',own_scope_amend_commit:'ea805f5a45b3acab1f38ad6c570c33d4c0be9f94',own_lease_expires_ts:expiry,
  private_file_hashes:expectedPrivate,private_raw_or_normalized_market_values_exported:false,
  current_catalog_at_capture:{rows:1278,active_USDT:934,known_exact_crypto_bindings:13,unknown_active_USDT:919,owner_excluded:2,not_online:295,outside_currency:49,qualified_global_N:null,simulated_broker_calls:1},
  native_candles:{rows:125,actual_shape_valid:true,source_clocks_preserved:true,open_time_not_promoted:true,base_volume_not_promoted:true,qualified:false},
  native_book:{bids:20,asks:20,COIN_quantity_parser_qualified:true,clock_preserved:true,current_status:'STALE_HISTORICAL_CAPTURE',complete_book:null,thousand_level_coverage_proven:false},
  purpose_seam:{default_CORE:true,explicit_DELIVERY:true,invalid_rejected_before_IO:true,provider_market_family_identity_units_cache_clocks_unchanged:true,forced_selected_calls_each:2,synthetic_fixture_not_native_proof:true},
  source_code_SHA256:codeHashes,source_changed_files:['pump-report/sources/index.mjs'],files:hashes,
  A33_or_old_audit_reexecuted:0,actual_SOURCE_market_provider_HTTP:0,actual_SOURCE_SQL:0,actual_SOURCE_TG:0,actual_SOURCE_deploy:0,documentation_connector_cost:null};
assert(Date.now()<expiry,'own lease expired before save');
const output=path.join(cwd,'pump-report/handoffs/sources/NATIVE_CATALOG_PURPOSE_OFFLINE_QUALIFICATION.json');
await fs.writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
process.stdout.write(JSON.stringify({status:'PASS',purpose:'PASS',native_rows_checked:125,known_current_capture_bindings:13,strict_candles_ready:false,output,sha256:sha(await fs.readFile(output))})+'\n');
