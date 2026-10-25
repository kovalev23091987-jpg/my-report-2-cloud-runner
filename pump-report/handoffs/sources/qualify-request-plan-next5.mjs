import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createPumpSources} from '../../sources/index.mjs';

const cwd=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const expiry=1792933883223;
assert(Date.now()<expiry, 'own offline lease expired');
globalThis.fetch=()=>{throw Error('OFFLINE_QUALIFICATION_NETWORK_FORBIDDEN');};
const read=p=>fs.readFile(path.join(cwd,p));
const sha=b=>createHash('sha256').update(b).digest('hex');
const frozen={
  'pump-report/sources/index.mjs':'eb45f0762ed090d29d9a853bfa7f121203cd1148f67c385bec13355e9ea5c5b3',
  'pump-report/sources/bingx.mjs':'bb7dfe0ed7f28756876831d7a2cdabcc35614c850f2a514f41b825222f528492',
  'pump-report/sources/liquidations.mjs':'7fd1e6cca4eb6037ecbe5d6e9296c681aaa19dfb6248ef38da8bf0e5c2de744e'
};
for(const [p,h] of Object.entries(frozen))assert.equal(sha(await read(p)),h,p);
const plan=JSON.parse(await read('pump-report/handoffs/sources/STATIC_WHOLE_REQUEST_PLAN_V1.json'));
assert.equal(plan.status,'STATIC_NOT_MEASURED_NOT_AN_ADMISSION');
for(const s of plan.scenarios){
  assert.equal(s.source_HTTP,s.bingx+s.swole,s.name);
  assert.equal(s.source_HTTP,s.ttl_network+s.zero_ttl_network,s.name);
  assert.equal(s.whole_budget_HTTP,s.source_HTTP+s.telegram,s.name);
  assert.equal(s.SQL_broker_and_telegram_statements_nominal,s.cache_hits+6*s.ttl_network+4*s.zero_ttl_network+4*s.telegram,s.name);
  assert.equal(s.SQL_broker_and_telegram_statements_one_finalize_CAS5_upper,s.cache_hits+22*s.ttl_network+20*s.zero_ttl_network+20*s.telegram,s.name);
  assert.equal(s.SQL_broker_and_telegram_statements_upper,s.cache_hits+31*s.ttl_network+30*s.zero_ttl_network+30*s.telegram,s.name);
  assert.equal(s.source_response_bytes_cap,2000000*s.source_HTTP,s.name);
  assert.equal(s.whole_response_bytes_cap,null);
  assert.equal(s.whole_wall_time_bound_ms,null);
}
const worst=plan.scenarios.find(x=>x.name==='COLD_THIN_LAST_FALLBACK_FULL_PUBLISH');
assert.equal(worst.whole_budget_HTTP*6,72);
assert.equal(worst.SQL_broker_and_telegram_statements_nominal*6,384);
assert.equal(worst.SQL_broker_and_telegram_statements_upper*6,2208);
assert.equal(plan.six_manuals.independent_cold_full_plus_outcomes.whole_budget_HTTP,72+6);
assert.equal(plan.six_manuals.same_executor_six_pending_upper.whole_budget_HTTP,72-5);
assert.equal(plan.six_manuals.manual24_proves_six_checks,false);
assert.equal(plan.SQL.whole_SQL_statements_for_6,null);
assert.equal(plan.SQL.whole_rows_read_for_6,null);
assert.equal(plan.SQL.whole_rows_written_for_6,null);

const baseBytes=await read('pump-report/sources/registry-core8-retained-v1.json');
assert.equal(sha(baseBytes),'d53dd25ad347a7fc9049cc1a48f1bb6af6c0b42c24a61c7d5297c761b72c27b5');
const base=JSON.parse(baseBytes);
const regBytes=await read('pump-report/sources/registry-next5-retained-v1.json'),registry=JSON.parse(regBytes);
const evBytes=await read('pump-report/handoffs/sources/evidence/NEXT5_CRYPTO_PRIMARY_IDENTITY_V1.json'),ev=JSON.parse(evBytes);
assert.equal(sha(regBytes),'b30f795497a67dacc6719581e6ff7bae26843a6af9ed34a3add396cf62fe7db1');
assert.equal(sha(evBytes),registry.identity_evidence_sha256);
assert.equal(registry.instruments.length,5);
assert.equal(registry.current_membership_verified,false);
assert.equal(registry.global_current_qualified_crypto_N,null);
const expected=new Map([['AVAX','100009'],['LINK','103'],['LTC','100006'],['DOT','100008'],['TRX','100039']]);
const savedBytes=await read('../SAVED_REPORT2_PAUSED_20261024/PRIVATE_EVIDENCE/report2-bingx-catalog-bootstrap-connected-20261024/bingx-public-original-2.bin');
assert.equal(sha(savedBytes),'17e283eabf3c6bda448052b3925a8df4b52533990f698e92a1fca9138a0806ff');
const saved=JSON.parse(savedBytes);
for(const e of registry.instruments){
  assert.equal(e.native_contract_id,expected.get(e.instrument.base));
  assert(!base.instruments.some(b=>b.instrument.instrument_id===e.instrument.instrument_id||b.instrument.native_symbol===e.instrument.native_symbol));
  const rows=saved.data.filter(r=>String(r.contractId)===e.native_contract_id||r.symbol===e.instrument.native_symbol);
  assert.equal(rows.length,1);assert.equal(rows[0].asset,e.instrument.base);assert.equal(rows[0].currency,'USDT');assert.equal(rows[0].status,1);
  assert.deepEqual(e.qualifications.candles,{});assert.deepEqual(e.liquidations.routes,[]);
  assert.equal(e.instrument.canonical_cross_venue_identity_qualified,false);
  assert(e.instrument.identity_evidence_ref.endsWith(':sha256:'+sha(evBytes)));
  const proof=ev.records.find(p=>p.base===e.instrument.base);assert.equal(proof.native_contract_id,e.native_contract_id);
  for(const doc of [proof.venue_underlying_document,proof.independent_crypto_document])assert(doc.short_literal.trim().split(/\s+/).length<=25);
}
const ltc=ev.records.find(p=>p.base==='LTC');
assert.equal(ltc.spot_document.status,'PAIR_AND_NAME_RENDERED_EMPTY');
assert.equal(ltc.spot_document.not_used_as_positive_identity_proof,true);
let catalogSimulated=0;
const historical=1792862359941;
const deltaSource=createPumpSources({identityRegistry:registry,clock:()=>historical,broker:{async request(r){
  assert.equal(new URL(r.url).pathname,'/openApi/swap/v2/quote/contracts');catalogSimulated++;
  return {ok:true,status:200,data:structuredClone(saved),received_ts:historical,receipt_id:'OFFLINE_RETAINED_DELTA5_'+catalogSimulated};
}}});
const catalog=await deltaSource.getCatalog();
assert.equal(catalogSimulated,1);assert.equal(catalog.coverage.qualified,5);assert.equal(catalog.coverage.unqualified,1273);
assert.deepEqual(new Set(catalog.instruments.map(i=>i.base)),new Set(expected.keys()));
assert.deepEqual(catalog.coverage.registry_rejected,[]);

// New thin-bulk -> direct-LAST seam case; synthetic shape, no native proof.
const now=Date.now(),oldClose=now-120000,calls=[];
const btc=base.instruments.find(e=>e.instrument.base==='BTC');
const thin=createPumpSources({identityRegistry:[btc],clock:()=>now,broker:{async request(r){
  const u=new URL(r.url);calls.push(u.pathname);
  if(u.pathname==='/openApi/swap/v2/quote/ticker')return {ok:true,status:200,received_ts:now,receipt_id:'SYNTHETIC_THIN_BULK',cache_hit:false,
    data:{code:0,data:[{symbol:'BTC-USDT',lastPrice:'100',openPrice:'80',priceChangePercent:'25',quoteVolume:'1000',closeTime:oldClose}]}};
  assert.equal(u.pathname,'/openApi/swap/v1/ticker/price');
  return {ok:true,status:200,received_ts:now,receipt_id:'SYNTHETIC_DIRECT_LAST',cache_hit:false,data:{code:0,data:[{symbol:'BTC-USDT',price:'100',time:now-1000}]}};
}}});
const overview=await thin.getOverview({instruments:[btc.instrument]}),stale=overview.observations[0].facts.price;
assert.equal(stale.status,'STALE');assert.equal(stale.event_ts,oldClose);assert.equal(stale.received_ts,now);assert.equal(stale.expires_ts,oldClose+30000);
assert.equal(thin.getCoverage().totals.overview_price_usable,0);
const before=JSON.stringify(stale);
const core=await thin.getCore({instrument:btc.instrument,existing_facts:overview.observations[0].facts,only_facts:['price']});
assert.equal(core.facts.price.status,'USABLE');assert.equal(core.facts.price.event_ts,now-1000);assert.equal(core.facts.price.evidence_ref,'SYNTHETIC_DIRECT_LAST');
assert.equal(core.facts.price.reused_from_existing_facts,undefined);assert.equal(JSON.stringify(stale),before);
assert.deepEqual(calls,['/openApi/swap/v2/quote/ticker','/openApi/swap/v1/ticker/price']);
const backup=JSON.parse(await read('pump-report/handoffs/sources/BULK_LAST_EQUIVALENT_BACKUP_REVIEW_V1.json'));
assert.equal(backup.equivalent_backup.status,'NO_QUALIFIED_FREE_EQUIVALENT_RESERVE_IN_CHECKED_EVIDENCE');
assert.equal(backup.equivalent_backup.general_docs_search_repeated,false);
const files=['pump-report/handoffs/sources/STATIC_WHOLE_REQUEST_PLAN_V1.json','pump-report/handoffs/sources/BULK_LAST_EQUIVALENT_BACKUP_REVIEW_V1.json',
  'pump-report/sources/registry-next5-retained-v1.json','pump-report/handoffs/sources/evidence/NEXT5_CRYPTO_PRIMARY_IDENTITY_V1.json',
  'pump-report/handoffs/sources/REQUEST_PLAN_FRESHNESS_NEXT5_RU.md','pump-report/handoffs/sources/qualify-request-plan-next5.mjs'];
const hashes=[];for(const p of files){const b=await read(p);hashes.push({path:p,bytes:b.length,sha256:sha(b)});}
const result={schema:'PUMP_REQUEST_PLAN_NEXT5_OFFLINE_QUALIFICATION_V1',status:'PASS',scope:'ONE_NEW_CONNECTED_PACKET_QUALIFICATION_STATIC_ARITHMETIC_DELTA5_AND_THIN_BULK_SOURCE_SEAM',
  actual_check_ts:Date.now(),authority_main:'108a5dbdfc670d9a48fbf953811f5aa1b7bc2864',own_lease_acquire_commit:'fdee1fa4aa73d7f250c967b87ec7472e145c5996',own_lease_expires_ts:expiry,
  static_plan_not_measured:true,static_six_cold_full_HTTP:72,static_six_cold_full_plus_outcome_HTTP:78,SQL_whole_rows_unknown:true,
  delta5_retained_binding_check:{new_bindings:5,original_rows:1278,adapter_unqualified:1273,simulated_catalog_calls:1,base8_requalified:false,combined_disjoint_count:13,current_verified:0},
  thin_bulk_case:{fixture_kind:'SYNTHETIC_WIRE_SHAPE_NOT_NATIVE_PROOF',stale_bulk_closeTime_preserved:true,stale_not_reused:true,direct_LAST_used:true,simulated_broker_calls:2},
  A33_reexecuted:0,old_audit_repeated:false,source_adapter_edits:0,source_frozen_SHA256:frozen,files:hashes,
  actual_market_provider_HTTP:0,SQL:0,TG:0,CF_deploy:0,documentation_connector_cost:null};
assert(Date.now()<expiry,'own lease expired before save');
const output=path.join(cwd,'pump-report/handoffs/sources/REQUEST_PLAN_NEXT5_OFFLINE_QUALIFICATION.json');
await fs.writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
process.stdout.write(JSON.stringify({status:'PASS',new_connected_packet_qualifications:1,delta5_bindings:5,thin_bulk_seam:'PASS',output,sha256:sha(await fs.readFile(output))})+'\n');
