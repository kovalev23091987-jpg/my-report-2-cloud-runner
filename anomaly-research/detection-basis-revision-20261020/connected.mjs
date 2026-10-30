// NEXT package only. No invocation, test registration or native capability.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export async function runDetectionBasisRevisionConnected({baseline_root,candidate_root,repo_root}={}){
 const sha=x=>createHash('sha256').update(x).digest('hex');
 const load=(root,p)=>import(pathToFileURL(resolve(root,p)).href);
 const prefix='anomaly-research/detection-basis-revision-20261020';
 const manifest=JSON.parse(await readFile(resolve(repo_root,prefix,'manifest.json'),'utf8'));
 const target='anomaly-research/durability/identity-retention-grid.mjs';
 assert.equal(sha(await readFile(resolve(baseline_root,target))),manifest.target.before_sha256);
 assert.equal(sha(await readFile(resolve(candidate_root,target))),manifest.target.after_sha256);
 assert.equal(sha(await readFile(resolve(repo_root,prefix,'registry.after.mjs'))),manifest.target.after_sha256);
 const observerPath='anomaly-research/observer/observer.mjs';
 assert.equal(sha(await readFile(resolve(baseline_root,observerPath))),sha(await readFile(resolve(candidate_root,observerPath))),'Full roots differ only at proposed durability target');
 const B=await load(baseline_root,target),C=await load(candidate_root,target),O=await load(candidate_root,observerPath);
 const inputs={};
 for(const item of manifest.retained_inputs){const b=await readFile(resolve(repo_root,item.path));assert.equal(sha(b),item.sha256);inputs[item.id]=JSON.parse(b);}
 const sample=inputs.samples.inputs.find(x=>x.id==='BTC_usd_m_futures'),saved=inputs.witness.results.find(x=>x.sample_id===sample.id);
 assert.equal(saved.typed_view.admission.native_ingress,false);assert.equal(saved.typed_view.admission.observer_detectClosed,false);assert.equal(saved.typed_view.identity.native_instrument_epoch_verified,false);
 const T=1792512000000,M=60000,controls=[];
 const record=(label,details={})=>controls.push({label,classification:'CONTROLLED_REPRESENTATION_NOT_NATIVE_PROVIDER_CORRECTION',...details});
 const i={asset_id:'CONTROLLED:BTC',venue:'CONTROLLED:BINANCE',upstream:'CONTROLLED:SAVED_NUMERIC_GEOMETRY',contract:'BTCUSDT',market:'FUTURES',quote:'CONTROLLED_UNKNOWN',price_unit:'CONTROLLED_NUMERIC',volume_unit:'CONTROLLED_RELATIVE_QUANTITY',multiplier:1,binding_ref:'CONTROLLED:NOT_NATIVE_ACK',binding_kind:'VERIFIED_NATIVE',identity_verified:true};
 const bars=[...sample.current.background,sample.current.candle].map(b=>({start_ts:b.start_ts,end_ts:b.end_ts,open:Number(b.open),high:Number(b.high),low:Number(b.low),close:Number(b.close),volume:Number(b.raw_column7_sum)}));
 const proof=O.hash({controlled_canonical_bars:bars});
 function makeCard({factor=1,known=T,suffix='canonical',sameDeclaredProof=false}={}){
  const xs=structuredClone(bars);for(let n=0;n<20;n++)xs[n].volume*=factor;
  const p={raw_ref:sameDeclaredProof?'CONTROLLED:canonical':'CONTROLLED:'+suffix,raw_sha256:sameDeclaredProof?proof:O.hash({controlled_bars:xs,suffix}),source_as_of_ts:bars.at(-1).end_ts,received_ts:T,evidence_class:'CONTROLLED'};
  const c=O.detectClosed({instrument:i,timeframe:'15m',alignment_offset_ms:0,bars:xs,provenance:p,known_ts:known,mode:'REPLAY',rules:{confirmation_timeframe:'1m'}}).events[0];assert.ok(c);return c;
 }
 // Model metadata never promotes the real typed boundary. Only these explicit
 // CONTROLLED cards enter registry/watch; no original detection time is claimed.
 const canonical=makeCard({sameDeclaredProof:true});
 const corrected=makeCard({factor:.9,known:T+1000,suffix:'new-declared-proof'});
 const inconsistent=makeCard({factor:.9,known:T+1000,sameDeclaredProof:true});
 assert.deepEqual(canonical.candle,corrected.candle);assert.notDeepEqual(canonical.background,corrected.background);
 assert.equal(canonical.rules_hash,corrected.rules_hash);assert.ok(corrected.features.volume_ratio>canonical.features.volume_ratio);
 assert.equal(canonical.evidence_class,'CONTROLLED');assert.equal(canonical.discovery,'BACKFILLED');
 const native={venue:i.venue,market:i.market,native_instrument_id:'CONTROLLED:BTCUSDT',instrument_epoch:'CONTROLLED:EPOCH',contract_code:i.contract,qualification_ref:'CONTROLLED:QUALIFICATION_REFERENCE',qualified:true};
 const b0=B.registerRevision(B.newRegistry(),canonical,native),c0=C.registerRevision(C.newRegistry(),canonical,native),id=c0.logical_event_id;
 assert.equal(b0.logical_event_id,id);assert.equal(c0.state.events[id].native_identity_externally_qualified_here,false);
 const before=B.registerRevision(b0.state,corrected,native),after=C.registerRevision(c0.state,corrected,native);
 assert.equal(before.status,'PROVENANCE_REVISION');assert.equal(before.state.events[id].conflicting_native_facts,false);
 assert.equal(after.status,'CONFLICTING_NATIVE_FACTS');assert.equal(after.state.events[id].conflicting_native_facts,true);
 assert.equal(after.independent_new_event,false);assert.equal(after.state.events[id].first_known_ts,T);assert.equal(after.state.events[id].canonical_card.card_hash,canonical.card_hash);
 assert.equal(after.state.events[id].canonical_fact_hash,c0.state.events[id].canonical_fact_hash);
 assert.equal(after.state.events[id].revisions.length,2);assert.equal(after.state.events[id].revisions[1].revision_key_version,'PROOF_REFERENCE_V3_DETECTION_BASIS');
 record('changed background in a newly declared proof is material conflict, not only provenance',{baseline:before.status,candidate:after.status});
 const sameProofBefore=B.registerRevision(b0.state,inconsistent,native),sameProofAfter=C.registerRevision(b0.state,inconsistent,native);
 assert.equal(sameProofBefore.status,'DUPLICATE_REVISION');assert.equal(sameProofAfter.status,'CONFLICTING_NATIVE_FACTS');
 assert.equal(sameProofAfter.state.events[id].revisions.length,2);assert.equal(sameProofAfter.state.events[id].revisions[0].revision_key,b0.state.events[id].revisions[0].revision_key);
 record('CONTROLLED inconsistent representation of same declared proof cannot disappear behind legacy dedup; not a claim one native hash changed body');
 const snapHash=O.hash('CONTROLLED:POST_KNOWN_CLOSE');
 const snapshot={instrument:i,snapshot_id:'CONTROLLED:NEW_CLOSE',raw_sha256:snapHash,source_ts:T+2*M+1000,received_ts:T+2*M+2000,price:canonical.candle.high*1.1,closed_candle:{timeframe:'1m',start_ts:T+M,end_ts:T+2*M,open:canonical.anchor.price,high:canonical.candle.high*1.2,low:canonical.candle.low*.9,close:canonical.candle.high*1.1,volume:1,raw_sha256:snapHash}};
 const args={event:canonical,native,snapshot,snapshot_native:native,grid:{qualified:true,native_grid_ref:'CONTROLLED:GRID',timeframe:'1m',market_key:C.nativeMarketKey(i,native),alignment_offset_ms:0},now_ts:snapshot.received_ts};
 const restarted=JSON.parse(JSON.stringify(after.state)),event=restarted.events[id];
 assert.equal(B.confirmationVerdict({...args,logical_event:event}).status,'CLOSED_ABOVE');
 assert.throws(()=>C.confirmationVerdict({...args,logical_event:event}),/LOGICAL_EVENT_FACTS_NOT_RECONCILED/);
 assert.deepEqual(C.confirmationVerdict(args),B.confirmationVerdict(args),'Legacy omitted registry argument is unchanged and remains not native proof');
 const admitted=O.capture(O.newMemory(),canonical,{watch_mode:'HISTORICAL_REVIEW'}).state;
 const unguarded=O.observe(admitted,{event_id:canonical.event_id,snapshot,now_ts:snapshot.received_ts});assert.equal(unguarded.new_transitions,2);
 const priceOnly=structuredClone(snapshot);delete priceOnly.closed_candle;
 const guarded=O.observe(admitted,{event_id:canonical.event_id,snapshot:priceOnly,now_ts:priceOnly.received_ts});
 assert.equal(guarded.new_transitions,0);assert.equal(Object.keys(guarded.state.outbox).length,0);assert.equal(guarded.state.watch[canonical.event_id].last_source_ts,snapshot.source_ts);
 assert.equal(guarded.state.watch[canonical.event_id].hypotheses.LONG,'WAITING');assert.equal(guarded.state.cards[canonical.event_id].first_known_ts,T);
 assert.deepEqual(event.revisions.map(r=>r.raw_ref),['CONTROLLED:canonical','CONTROLLED:new-declared-proof']);
 record('bound conflict survives JSON restart; logical guard pauses hypothesis/outbox while fresh price observation and canonical first-known persist');
 const capBefore=B.registerRevision(B.registerRevision(B.newRegistry({max_revisions:1}),canonical,native).state,corrected,native);
 const cap=C.registerRevision(C.registerRevision(C.newRegistry({max_revisions:1}),canonical,native).state,corrected,native);
 assert.equal(capBefore.state.events[id].conflicting_native_facts,false);assert.equal(cap.status,'DEFERRED_REGISTRY_CAPACITY');assert.equal(cap.conflict_latched,true);
 assert.equal(cap.state.events[id].conflicting_native_facts,true);assert.equal(cap.state.events[id].revisions.length,1);assert.equal(cap.revision_retained_by_model,false);assert.equal(cap.durable_ingress_required,true);assert.equal(cap.native_ingress_qualified,false);
 assert.equal(cap.caller_owned_card.card_hash,corrected.card_hash);assert.deepEqual(cap.caller_owned_qualification,native);
 assert.throws(()=>C.confirmationVerdict({...args,logical_event:cap.state.events[id]}),/LOGICAL_EVENT_FACTS_NOT_RECONCILED/);
 const capRetry=C.registerRevision(JSON.parse(JSON.stringify(cap.state)),corrected,native);assert.equal(capRetry.state.events[id].revisions.length,1);assert.equal(capRetry.state.events[id].first_known_ts,T);
 record('full revision pool latches existing conflict flag and returns caller-owned details without eviction/cap increase/native ACK');
 const alias=makeCard({known:T+2000,suffix:'alias-same-material'});
 const legacy=B.registerRevision(b0.state,alias,native).state;
 assert.equal(legacy.events[id].revisions[1].detection_basis_hash,undefined);
 assert.throws(()=>C.confirmationVerdict({...args,logical_event:legacy.events[id]}),/LEGACY_REVISION_BASIS_UNRESOLVED/);
 const wrongKnown=makeCard({known:T+3000,suffix:'alias-same-material'}),notRecovered=C.registerRevision(legacy,wrongKnown,native);
 assert.notEqual(notRecovered.status,'LEGACY_BASIS_RETAINED');
 assert.throws(()=>C.confirmationVerdict({...args,logical_event:notRecovered.state.events[id]}),/LEGACY_REVISION_BASIS_UNRESOLVED/);
 const recovered=C.registerRevision(JSON.parse(JSON.stringify(legacy)),alias,native);
 assert.equal(recovered.status,'LEGACY_BASIS_RETAINED');assert.equal(recovered.native_basis_qualified,false);assert.equal(recovered.state.events[id].revisions.length,2);
 assert.equal(recovered.state.events[id].revisions[1].revision_key,legacy.events[id].revisions[1].revision_key);
 assert.equal(recovered.state.events[id].revisions[1].detection_basis_source,'EXACT_RETAINED_CARD_HASH');assert.equal(recovered.state.events[id].first_known_ts,T);
 const checked=C.confirmationVerdict({...args,logical_event:recovered.state.events[id]});assert.equal(checked.status,'CLOSED_ABOVE');assert.equal(checked.logical_event_state_checked,true);assert.equal(checked.registry_state_is_not_native_ACK,true);assert.equal(checked.external_grid_proof_qualified_by_this_function,false);
 record('noncanonical legacy basis requires exact full retained card hash, not a changed first-known or partial tuple; local check is never native ACK');
 const exactLegacy=C.registerRevision(b0.state,canonical,native);assert.equal(exactLegacy.status,'DUPLICATE_REVISION');assert.deepEqual(exactLegacy.state,b0.state);
 assert.throws(()=>C.confirmationVerdict({...args,native:{...native,instrument_epoch:'CONTROLLED:FOREIGN_EPOCH'},logical_event:recovered.state.events[id]}),/LOGICAL_EVENT_FACTS_NOT_RECONCILED/);
 assert.throws(()=>C.confirmationVerdict({...args,event:alias,logical_event:recovered.state.events[id]}),/LOGICAL_EVENT_FACTS_NOT_RECONCILED/);
 assert.equal(C.registerRevision(recovered.state,alias,native).status,'DUPLICATE_REVISION');
 record('exact canonical legacy replay unchanged; borrowed epoch or revision-card first-known cannot replace the canonical event');
 return{schema:'DETECTION_BASIS_REVISION_NEXT_CONNECTED_CONTROLLED_V1',controls,actual_saved_input:{sample:sample.id,unchanged:true,native_identity_qualified:false,actual_card_admitted:false,actual_body_or_first_known_ACK:null},model_canonical:{event_id:canonical.event_id,logical_event_id:id,first_known_ts:T,discovery:canonical.discovery,evidence_class:canonical.evidence_class},actual_mutated_provider_body:false,native_ingress_or_grid_or_commit_ACK:false,production_watch_hook_installed:false,logical_guard_is_optional_caller_contract:true,source_HTTP:0,native_SQL:0,local_SQL:0,Telegram:0,main_score_effect:0,empirical_predictive_accuracy:null};
}
