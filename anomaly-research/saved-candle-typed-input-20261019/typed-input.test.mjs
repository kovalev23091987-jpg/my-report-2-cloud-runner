import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {features} from '../observer/observer.mjs';
import {sha256,verifyReadJson,buildResearchInput,annotateLaterArchivedBar} from './typed-input.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const raw=(h,p)=>execFileSync('git',['show',`${h}:${p}`],{cwd:root,maxBuffer:2_000_000});
const encode=x=>Buffer.from(JSON.stringify(x)),clone=structuredClone;
const signed=r=>({receipt:r,receipt_sha256:sha256(JSON.stringify(r))});

test('ONE NEW actual BTC/HTX typed research bridge: verified input clocks and unit limits preserve features; card/watch stay blocked',()=>{
 const fixture=JSON.parse(fs.readFileSync(path.join(here,'sample-inputs.json')));
 const before=JSON.stringify(fixture),markers={},results=[],controls=[];
 const fetchBefore=globalThis.fetch;globalThis.fetch=()=>{throw Error('NO_MARKET_OR_PROVIDER_HTTP');};
 const receiptRef=id=>`anomaly-research/saved-candle-typed-input-20261019/witness.json#/markers/${id}`;
 try{
  const policies={};
  for(const [id,spec] of Object.entries({BTC:fixture.source536,HTX:fixture.source533_units})){
   policies[id]=verifyReadJson({body:raw(spec.head,spec.path),expected_sha256:spec.sha256,raw_ref:`${spec.head}:${spec.path}`,scope:'DOCUMENTARY_JSON_LOCAL_READ',receipt_ref:receiptRef('policy'+id)});markers['policy'+id]=policies[id].marker;
  }
  const contract=raw(fixture.source533_clock_followup.head,fixture.source533_clock_followup.path);
  assert.equal(sha256(contract),fixture.source533_clock_followup.sha256);
  let firstArgs=null;
  for(const sample of fixture.inputs){
   const btc=sample.kind==='BTC_RESEARCH_CARD_EXCERPT';let input;
   if(btc){
    const body=encode(sample.current);input=verifyReadJson({body,expected_sha256:sha256(body),raw_ref:`${sample.parent.head}:${sample.parent.path}#${sample.current.event_id}`,scope:'BTC_DERIVED_RESEARCH_SAMPLE_LOCAL_READ',receipt_ref:receiptRef(sample.id)});
   }else{
    const compressed=fs.readFileSync(path.join(root,sample.raw_source.path));assert.equal(sha256(compressed),sample.raw_source.gzip_sha256);
    const body=gunzipSync(compressed);input=verifyReadJson({body,expected_sha256:sample.raw_source.body_sha256,raw_ref:sample.raw_source.path+'#uncompressed',scope:'HTX_ORIGINAL_JSON_BODY_LOCAL_READ',receipt_ref:receiptRef(sample.id)});
   }
   markers[sample.id]=input.marker;
   const policy=policies[btc?'BTC':'HTX'];const args={sample,input_marker:input.marker,input_value:input.value,policy_marker:policy.marker,policy:policy.value,policy_sha256:btc?fixture.source536.sha256:fixture.source533_units.sha256};
   firstArgs??=args;
   const view=buildResearchInput(args),f=features(view.candle,view.prior),later=annotateLaterArchivedBar(view,sample.later);
   assert.equal(view.identity.identity_verified,false);assert.equal(view.identity.native_contract_size,null);assert.equal(view.identity.quote_numeric_conversion_factor,1);
   assert.equal(view.admission.observer_detectClosed,false);assert.equal(view.admission.event_card_created,false);assert.equal(view.admission.memory_admitted,false);assert.equal(view.admission.watch_scheduled,false);assert.equal(view.admission.notification,false);
   assert.equal(view.clocks.original_provider_body_completion_ts,null);assert.equal(view.clocks.source_ts,sample.original_source_ts);assert.equal(view.clocks.original_recorded_receipt_ts,sample.original_recorded_receipt_ts);
   assert(view.clocks.usable_research_known_by_ts>sample.original_recorded_receipt_ts);
   assert.equal(view.clocks.original_immutable_card_first_known_ts,sample.original_immutable_card_first_known_ts??null);
   assert.equal(later.temporal_status,'ARCHIVED_POSTEVENT_BAR_BEFORE_CONSERVATIVE_KNOWLEDGE');assert.equal(later.actual_watch_confirmation,null);assert.equal(later.memory_transition,false);assert.equal(later.notification,false);
   if(btc){
    const old=sample.current.features;
    assert.equal(f.volume_ratio,old.relative_raw_column7);assert.equal(f.volume_median,old.raw_column7_median_float);assert.equal(f.volume_mad,old.raw_column7_mad_float);assert.equal(f.volume_robust_z,old.raw_column7_robust_z);
    for(const k of Object.keys(f).filter(k=>!k.startsWith('volume_')))assert.equal(f[k],old[k],k);
   }else assert.equal(f.background_count,20);
   assert.equal(view.quantity.basis,'QUOTE_ASSET');
   if(sample.market==='usd_m_futures'){assert.equal(view.quantity.concrete_unit,null);assert.equal(view.quantity.declared_quote,'USDT');assert(view.blockers.includes('CONCRETE_QUOTE_ASSET_NOT_INDEPENDENTLY_CLOSED'));}
   else assert.equal(view.quantity.concrete_unit,'USDT');
   results.push({sample_id:sample.id,kind:sample.kind,current_event_start:sample.current.candle.start_ts,typed_view:view,pure_features:f,actual_later_archived_bar:later,immutable_source_unchanged:true});
  }
  const a=firstArgs;
  assert.throws(()=>buildResearchInput({...a,input_marker:null}),/VERIFIED_READ_MARKER_REQUIRED/);controls.push('missing verified read refuses');
  assert.throws(()=>verifyReadJson({body:Buffer.from('{}'),expected_sha256:'0'.repeat(64),raw_ref:'CONTROLLED',scope:'BTC_DERIVED_RESEARCH_SAMPLE_LOCAL_READ',receipt_ref:receiptRef('CONTROLLED')}),/HASH_MISMATCH/);controls.push('wrong exact bytes refuses before parse');
  const badJSON=Buffer.from('{');assert.throws(()=>verifyReadJson({body:badJSON,expected_sha256:sha256(badJSON),raw_ref:'CONTROLLED',scope:'BTC_DERIVED_RESEARCH_SAMPLE_LOCAL_READ',receipt_ref:receiptRef('CONTROLLED')}));controls.push('incomplete JSON cannot create marker');
  const early=clone(a.input_marker.receipt);early.read_started_ts=early.verified_at_ts=a.sample.original_recorded_receipt_ts;assert.throws(()=>buildResearchInput({...a,input_marker:signed(early)}),/KNOWLEDGE_CLOCK/);controls.push('original prebody receipt cannot become new knownby');
  const partial=clone(a.input_marker.receipt);partial.parse_complete=false;assert.throws(()=>buildResearchInput({...a,input_marker:signed(partial)}),/VERIFIED_READ_MARKER/);controls.push('self-consistent digest without parse completion still refuses');
  const wrongRef=clone(a.input_marker.receipt);wrongRef.raw_ref='CONTROLLED:foreign';assert.throws(()=>buildResearchInput({...a,input_marker:signed(wrongRef)}),/EXACT_RESEARCH_SAMPLE_MARKER/);controls.push('foreign receipt scope refuses');
  const changed=clone(a.input_value);changed.candle.close='1';assert.throws(()=>buildResearchInput({...a,input_value:changed}),/PARSED_INPUT_CHANGED/);controls.push('parsed payload cannot change after verification');
  const policyChanged=clone(a.policy);policyChanged.market_specific_mapping.usd_m_futures.column_7_concrete_unit_independently_closed='USDT';assert.throws(()=>buildResearchInput({...a,policy:policyChanged}),/PARSED_INPUT_CHANGED/);controls.push('unproved futures unit cannot replace pinned documentary null');
  const forged=clone(a.input_marker.receipt);forged.native_ACK=true;assert.throws(()=>buildResearchInput({...a,input_marker:signed(forged)}),/VERIFIED_READ_MARKER/);controls.push('local receipt cannot claim native ACK');
  const claimed=clone(a.sample);claimed.identity_verified=true;claimed.native_contract_size=1;const stillBlocked=buildResearchInput({...a,sample:claimed});assert.equal(stillBlocked.identity.identity_verified,false);assert.equal(stillBlocked.identity.native_contract_size,null);controls.push('unproved identity and size claims do not admit card');
  const future={...a.sample.later,start_ts:results[0].typed_view.clocks.usable_research_known_by_ts+60000,end_ts:results[0].typed_view.clocks.usable_research_known_by_ts+960000};const futureAnnotation=annotateLaterArchivedBar(results[0].typed_view,future);assert.equal(futureAnnotation.temporal_status,'POST_KNOWLEDGE_INPUT_STILL_UNQUALIFIED');assert.equal(futureAnnotation.memory_transition,false);controls.push('CONTROLLED future timestamp alone never creates watch confirmation');
  assert.equal(JSON.stringify(fixture),before);assert.equal(results.length,3);assert.equal(controls.length,11);
  const witness={schema:'SAVED_CANDLE_TYPED_RESEARCH_CONNECTED_WITNESS_V1',source_heads:{BTC534:fixture.inputs[0].parent.head,HTX533:fixture.inputs[2].parent.head,BINANCE536:fixture.source536.head,CLOCK539:fixture.source533_clock_followup.head},markers,results,controlled_rejection_or_no_bypass_controls:controls,new_connected_cases:1,fail:0,actual_input_windows:3,actual_pure_features_calls:3,old1556_findings_or264960_CSV_rows_recomputed:0,source31_18_52_suites_rerun:0,old450455_suites_rerun:0,production_imports:0,provider_HTTP:0,native_SQL:0,observer_detectClosed_calls:0,new_production_event_cards:0,memory_writes:0,watch_transitions:0,Telegram:0,original_provider_body_completion_ACK:false,scope:'Measured current HTX original stored body hash+JSONparse; BTC current derived-card excerpt hash+JSONparse is explicitly NOT native original provider body completion. Schema knowledge recorded separately. Native identity/epoch/contractsize remain unresolved.',actual_chain_status:'BLOCKED_BEFORE_CARD_MEMORY_WATCH; purefeatures and archived temporal annotations qualified only'};
  fs.writeFileSync(path.join(here,'witness.json'),JSON.stringify(witness,null,2)+'\n');
 }finally{globalThis.fetch=fetchBefore;}
});
