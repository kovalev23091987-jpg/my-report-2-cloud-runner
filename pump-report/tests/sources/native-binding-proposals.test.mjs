import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {generateSavedNativeBindingProposals,createProposalAwareIdentityResolver,proposeReviewedRelativeCandlePatch} from '../../sources/native-binding-proposals.mjs';
import {createPumpSources} from '../../sources/index.mjs';
import {createNativeRelativeCandleQualification} from '../../sources/native-relative-qualification.mjs';
const sha256=x=>crypto.createHash('sha256').update(x).digest('hex');

test('native proposal/review seam binds exact tuples and preserves13 without default crypto/execution promotion, including Unicode and1000',async()=>{
  const old=JSON.parse(fs.readFileSync(new URL('../../sources/registry-curated13-native-relative-v1.json',import.meta.url),'utf8')).instruments;
  const oldBytes=JSON.stringify(old),sol=old.find(e=>e.instrument.base==='SOL');
  const native=[{contractId:100028,symbol:'SOL-USDT',asset:'SOL',currency:'USDT',status:1,size:'1'},
    {contractId:500001,symbol:'币-USDT',asset:'币',currency:'USDT',status:1,size:'1000'},
    {contractId:500002,symbol:'1000PEPE-USDT',asset:'1000PEPE',currency:'USDT',status:1,size:'999'}];
  const scope=native.map((r,i)=>({contract_id:String(r.contractId),symbol:r.symbol,native_asset:r.asset,
    metadata_coin_name:r.asset,metadata_coin_id:i+1,metadata_display_name:i===1?'幣別名':r.asset,
    selected_for_report_scope:true,scope_reason:'INCLUDE_CRYPTO_SCOPE',crypto_economic_scope_before_owner_exclusion:true,
    classification_basis:'CONTROLLED_ECONOMIC_SCOPE_INFERENCE_NOT_NATIVE_ENUM'}));
  const evidence={catalog_file_sha256:'1'.repeat(64),economic_scope_file_sha256:'2'.repeat(64),selected_symbols_file_sha256:'3'.repeat(64),contract_semantics_evidence_ref:'CONTROLLED_PRIMARY_CURRENCY_AND_PERPETUAL'};
  const generate=(nr=native,sr=scope)=>generateSavedNativeBindingProposals({native_rows:nr,scope_rows:sr,expected_symbols:native.map(r=>r.symbol),evidence,sha256});
  const bundle=generate();assert.equal(bundle.proposed,3);assert.equal(bundle.auto_VERIFIED_CRYPTO,0);
  const [pSol,pUnicode,pWrapped]=bundle.proposals;
  assert.equal(pUnicode.tuple.native_symbol,'币-USDT');assert.equal(pUnicode.display_name,'幣別名');
  assert.equal(pUnicode.proof.coinId_numeric_equality_required,false);assert.notEqual(pUnicode.native_contract_id,String(pUnicode.proof.metadata_coin_id));
  assert.equal(pWrapped.tuple.base,'1000PEPE');assert.equal(pWrapped.tuple.asset_id,'BINGX_UNDERLYING:1000PEPE');
  for(const p of bundle.proposals){assert.equal(p.proposed_instrument.classification_status,'PROPOSED_ECONOMIC_SCOPE');assert.equal(p.execution_units.contract_multiplier,null);assert.equal(p.execution_units.base_quantity,null);assert.equal(p.full_CORE_qualified,false);}
  const overlay=createProposalAwareIdentityResolver({existing_entries:old,proposal_bundle:bundle});
  assert.deepEqual(overlay.resolve({native_symbol:'SOL-USDT'}),sol);assert.equal(JSON.stringify(old),oldBytes);
  assert.equal(overlay.resolve({native_symbol:'币-USDT'}),null);assert.equal(overlay.resolveProposal({native_symbol:'币-USDT'}).proposal_id,pUnicode.proposal_id);
  assert.equal(overlay.resolveProposal({native_symbol:'幣-USDT'}),null);assert.equal(overlay.resolve({native_symbol:'SOL-USDT',native_contract_id:'999'}),null);
  assert.equal(overlay.resolve({native_symbol:'SOL-USDT',base:'WRONG'}),null);
  assert.equal(overlay.summary().existing_entries,13);assert.equal(overlay.summary().explicit_reviewed_added,0);
  const source=createPumpSources({identityRegistry:overlay,clock:()=>1792957600000,broker:{async request(){return {ok:true,status:200,received_ts:1792957600000,receipt_id:'CONTROLLED_F552_CATALOG',data:{code:0,data:native}};}}});
  const catalog=await source.getCatalog();assert.deepEqual(catalog.instruments.map(i=>i.native_symbol),['SOL-USDT']);
  assert.equal(catalog.unqualified.length,2);
  assert.throws(()=>proposeReviewedRelativeCandlePatch({proposal:pUnicode,reviewed_instrument:pUnicode.proposed_instrument}),/VERIFIED_BINGX/);
  const reviewedInstrument={...pUnicode.proposed_instrument,classification_status:'VERIFIED_CRYPTO',identity_evidence_ref:'CONTROLLED_ROOT_CLASSIFICATION_DECISION_UNICODE'};
  const patch=proposeReviewedRelativeCandlePatch({proposal:pUnicode,reviewed_instrument:reviewedInstrument});
  assert.deepEqual(patch.candles,createNativeRelativeCandleQualification(reviewedInstrument));
  assert.equal(patch.candles.volume.native_quantity_unit,'UNKNOWN');assert.equal(patch.candles.volume.absolute_amounts_qualified,false);
  assert.ok(patch.candles.volume.comparison_key.includes('500001:币-USDT'));assert.notEqual(patch.candles.volume.comparison_key,sol.qualifications.candles.volume.comparison_key);
  const entry={instrument:reviewedInstrument,binding_review:{proposal_id:pUnicode.proposal_id,decision:'ROOT_REVIEWED_NATIVE_SCOPE_PRICE_RELATIVE_ONLY',decision_ref:'CONTROLLED_ROOT_TUPLE_REVIEW',classification_evidence_ref:reviewedInstrument.identity_evidence_ref,catalog_file_sha256:evidence.catalog_file_sha256,economic_scope_file_sha256:evidence.economic_scope_file_sha256}};
  const approved=createProposalAwareIdentityResolver({existing_entries:old,proposal_bundle:bundle,reviewed_entries:[entry]});
  const accepted=approved.resolve({native_symbol:'币-USDT',native_contract_id:'500001'});
  assert.equal(accepted.instrument.classification_status,reviewedInstrument.classification_status);assert.deepEqual(Object.keys(accepted.qualifications),['candles']);
  assert.equal(accepted.instrument.contract_multiplier,null);assert.equal(accepted.qualifications.orderbook,undefined);assert.deepEqual(accepted.liquidations.routes,[]);
  assert.deepEqual(approved.resolve({native_symbol:'SOL-USDT'}),sol);assert.equal(JSON.stringify(old),oldBytes);
  assert.throws(()=>createProposalAwareIdentityResolver({existing_entries:old,proposal_bundle:bundle,reviewed_entries:[{instrument:reviewedInstrument,binding_review:true}]}),/ROOT_REVIEW/);
  assert.throws(()=>createProposalAwareIdentityResolver({existing_entries:old,proposal_bundle:bundle,reviewed_entries:[{...entry,qualifications:{orderbook:sol.qualifications.orderbook}}]}),/NOT_IN_REVIEW_SCOPE/);
  assert.throws(()=>proposeReviewedRelativeCandlePatch({proposal:pUnicode,reviewed_instrument:{...reviewedInstrument,contract_multiplier:1000}}),/OUTSIDE_THIS_REVIEW_SCOPE/);
  const duplicate=generate([...native,{...native[1],contractId:999999}]);assert.equal(duplicate.proposals[1].status,'BLOCKED_SAVED_BINDING');
  assert.equal(createProposalAwareIdentityResolver({existing_entries:old,proposal_bundle:duplicate}).resolveProposal({native_symbol:'币-USDT'}).status,'BLOCKED_SAVED_BINDING');
  const wrong=structuredClone(scope);wrong[2].native_asset='PEPE';assert.equal(generate(native,wrong).proposals[2].status,'BLOCKED_SAVED_BINDING');
  const off=native.map(r=>({...r,status:25}));assert.equal(generate(off).blocked,3);
  const hidden=structuredClone(scope);hidden[1].selected_for_report_scope=false;assert.equal(generate(native,hidden).proposals[1].status,'BLOCKED_SAVED_BINDING');
  assert.equal(pSol.tuple.instrument_id,sol.instrument.instrument_id);
});
