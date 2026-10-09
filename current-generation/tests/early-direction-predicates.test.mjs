import test from 'node:test';
import assert from 'node:assert/strict';
import {qualifyEarlyDirectionReceipt as qualify} from '../files/src/early-direction-receipt.mjs';
const T=1791552702776;
const input=()=>({contract:'BR-USDT',early_candidate_bridge:true,early_candidate_wave_id:'W',early_candidate_receipt:{status:'CLOSED',contract:'BR-USDT',wave_id:'W',source_ts:T-1000,available_at:T-1000,direction_hint:'LONG',direction_state:'LONG_WATCH',evidence:[{status:'CLOSED',side:'LONG',domain:'RELATIVE_STRENGTH'}]}});
const failed=x=>qualify(x,T).predicate_receipt.failed_predicates;
test('all simultaneous failures are saved rather than attributed to a single guessed cause',()=>{
 const x=input(),r=x.early_candidate_receipt;r.contract='BTR-USDT';r.wave_id='OTHER';r.source_ts=T-900001;r.available_at=T+1;r.direction_state='DIRECTION_NOT_CLOSED';
 const q=qualify(x,T);assert.equal(q.closed,false);assert.equal(q.reason,'EARLY_DIRECTION_STATE_NOT_CLOSED');
 assert.deepEqual(q.predicate_receipt.failed_predicates,['EXACT_CONTRACT','EXACT_WAVE','AVAILABLE_AT_DECISION','SOURCE_WITHIN_15_MINUTES','DIRECTION_STATE_CLOSED']);
 assert.equal(q.predicate_receipt.changes_direction_or_entry_rules,false);
});
test('transport, source time, availability and future source clock remain separately identifiable',()=>{
 const x=input();x.early_candidate_receipt.status='NOT_CLOSED';x.early_candidate_receipt.source_ts=T+1;assert.deepEqual(failed(x),['EARLY_TRANSPORT_CLOSED','SOURCE_NOT_AFTER_DECISION']);
 delete x.early_candidate_receipt.source_ts;delete x.early_candidate_receipt.available_at;
 assert.deepEqual(failed(x),['EARLY_TRANSPORT_CLOSED','SOURCE_CLOCK_PRESENT','SOURCE_NOT_AFTER_DECISION','AVAILABILITY_CLOCK_PRESENT','AVAILABLE_AT_DECISION','SOURCE_WITHIN_15_MINUTES']);
});
test('duplicate, opposite, neutral and unclosed evidence cannot inflate distinct directional domains',()=>{
 const x=input();x.early_candidate_receipt.evidence.push({status:'CLOSED',side:'LONG',domain:'RELATIVE_STRENGTH'},{status:'CLOSED',side:'SHORT',domain:'PRICE_STATE_TRANSITION'},{status:'CLOSED',side:'BOTH',domain:'NEUTRAL'},{status:'NOT_CLOSED',side:'LONG',domain:'UNPROVEN'});
 const q=qualify(x,T),s=q.predicate_receipt.evidence_summary;
 assert.equal(q.closed,true);assert.deepEqual(s.long_domains,['RELATIVE_STRENGTH']);assert.deepEqual(s.short_domains,['PRICE_STATE_TRANSITION']);assert.equal(s.raw_rows,5);assert.equal(s.independent_provider_count,null);assert.equal(s.producer_domain_counts_verified,false);
});
test('the diagnostic preserves the existing closed and rejected decisions without authorizing ENTRY',()=>{
 for(const side of ['LONG','SHORT']){const x=input();x.early_candidate_receipt.direction_hint=side;x.early_candidate_receipt.direction_state=side+'_WATCH';x.early_candidate_receipt.evidence[0].side=side;const q=qualify(x,T);assert.equal(q.closed,true);assert.equal(q.direction,side);assert.deepEqual(q.predicate_receipt.failed_predicates,[]);assert.equal(q.predicate_receipt.diagnostic_only,true);}
 const x=input();x.early_candidate_receipt.evidence=[{status:'CLOSED',side:'BOTH',domain:'VOLUME_ACCELERATION_PROXY'}];assert.deepEqual(failed(x),['ASSIGNED_DIRECTIONAL_FACT']);assert.equal(qualify(x,T).closed,false);
});
