import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {BINGX_IDENTITY_REGISTRY} from '../../registry/index.mjs';
import {createReviewedNativeScopeRegistry} from '../../registry/native-reviewed550.mjs';
import {ownerInstrumentExcluded,candleNativeComparisonKey} from '../../contracts/index.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');

test('ROOT saved550 tuples preserve original13 and exclude380, with execution-unit reviews kept separate from membership',()=>{
  const bytes=fs.readFileSync('/private/tmp/pump-report-native-catalog-corrected.json');assert.equal(hash(bytes),'7b683509fea9d5b3aa1d2612ddb8ad259680a3bc33cc4df5cc97f23b4555e9f5');
  const native=JSON.parse(bytes).body.response.data.data,scopeBytes=fs.readFileSync('pump-report/handoffs/sources/U3_SELECTED_550_SYMBOLS_V1.txt');assert.equal(hash(scopeBytes),'5e5610a579142fd19d2448b4d1834fe75498b8b4263ea41435ebd71b52b31920');
  const symbols=scopeBytes.toString().trimEnd().split('\n'),before=JSON.stringify(BINGX_IDENTITY_REGISTRY),registry=createReviewedNativeScopeRegistry(BINGX_IDENTITY_REGISTRY),oldIds=new Set(BINGX_IDENTITY_REGISTRY.map(e=>e.instrument.instrument_id));let added=0;
  for(const symbol of symbols){
    const row=native.find(n=>n.symbol===symbol),entry=registry.resolve({native_symbol:symbol,native_contract_id:String(row.contractId),venue:'BINGX',market_type:'PERPETUAL',quote:'USDT',settle:'USDT'});assert.ok(entry,symbol);assert.equal(entry.instrument.base,row.asset);assert.equal(entry.instrument.native_symbol,symbol);assert.equal(ownerInstrumentExcluded(entry.instrument),false);assert.equal(registry.resolve({native_symbol:symbol,native_contract_id:'99999999999999999999'}),null);assert.equal(registry.resolveCatalogDecision(row),null);
    if(!oldIds.has(entry.instrument.instrument_id)){added++;assert.ok(entry.qualifications.candles);assert.equal(entry.qualifications.candles.volume.comparison_key,candleNativeComparisonKey(entry.instrument));assert.equal(entry.qualifications.candles.volume.native_quantity_unit,'UNKNOWN');assert.equal(entry.instrument.contract_multiplier,null);assert.equal(entry.instrument.price_tick,null);assert.equal(entry.instrument.quantity_step,null);assert.match(entry.instrument.identity_evidence_ref,/^ROOT_F552_NATIVE_SCOPE_REVIEW:sha256:/);assert.equal(entry.binding_review.decision,'ROOT_REVIEWED_NATIVE_SCOPE_PRICE_RELATIVE_ONLY');}
  }
  assert.equal(symbols.length,550);assert.equal(added,539);assert.equal(JSON.stringify(BINGX_IDENTITY_REGISTRY),before);
  for(const original of BINGX_IDENTITY_REGISTRY)assert.deepEqual(registry.resolve({instrument_id:original.instrument.instrument_id}),original);
  const negatives=native.filter(row=>registry.resolveCatalogDecision(row));assert.equal(negatives.length,380);
  for(const row of negatives){assert.equal(registry.resolve({native_symbol:row.symbol}),null);for(const k of ['contractId','symbol','asset','currency','status'])assert.equal(registry.resolveCatalogDecision({...row,[k]:k==='status'?2:String(row[k])+'_CHANGED'}),null);}
  const scaled=registry.resolve({native_symbol:'1000PEPE-USDT'});assert.ok(scaled);assert.equal(scaled.instrument.base,'1000PEPE');assert.equal(scaled.instrument.contract_multiplier,null);assert.equal(scaled.qualifications.orderbook,undefined);assert.equal(registry.resolve({native_symbol:'ARTIFICIAL_NEW_UNKNOWN-USDT'}),null);
  assert.deepEqual(registry.summary(),{retained_entries:13,explicit_reviewed_added:539,saved_native_identities:552,owner_selected_scope:550,known_saved_nontargets:434,original_saved_nontargets:380,reactivated_saved_nontargets:53,usdkrw_saved_nontarget:1,current_membership_proven:false,new_execution_units_qualified:false,scoped_new_execution_unit_reviews:530,selected_native_coin_unit_semantics_qualified:541,selected_native_coin_unit_unknown:9,full_CORE550_qualified:false,review_ref:'checkpoints/pump-report-20261025/ROOT_F552_PER_TUPLE_NATIVE_REVIEW.json'});
});
