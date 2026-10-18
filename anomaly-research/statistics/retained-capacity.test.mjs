import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateCapacity} from './capacity.mjs';
const scenario=options=>estimateCapacity({new_events_day:10,deep_rechecks_day:20,card_bytes:4755,...options});
test('ordinary storage retains all796 inactive card proofs instead of replacing them with compact rows',()=>{
 const x=scenario(),s=x.storage;
 assert.equal(x.expected_active_events,104);assert.equal(x.stored_cards_before_archival,900);assert.equal(s.protected_retained_cards,900);assert.equal(s.protected_active_serialized_bytes,7363512);assert.equal(s.protected_inactive_card_watch_proof_serialized_bytes,56359188);assert.equal(s.closed_compact_serialized_bytes,407552);assert.equal(s.total_serialized_estimate,64130252);assert.equal(s.retention_expiry_assumed,false);assert.equal(x.card_cap_deficit,388);
});
test('peak protected storage is a declared one-body-per-card scenario, never native free memory or activation',()=>{
 const x=scenario({new_events_day:100,deep_rechecks_day:200}),s=x.storage;
 assert.equal(s.protected_retained_cards,9000);assert.equal(s.total_serialized_estimate,641302520);assert.equal(s.one_raw_body_per_card_assumed,true);assert.equal(s.additional_proof_revisions_storage_bytes,null);assert.equal(s.physical_database_bytes,null);assert.equal(x.actual_remaining_budget,null);assert.equal(x.total_native_R_W_HTTP_CPU_day,null);assert.equal(x.activation_allowed,false);assert.equal(x.card_cap_deficit,8488);
});
test('year-long active episodes cannot disappear at the90day projection window or understate the card deficit',()=>{
 const x=scenario({residence_mix:[{timeframe:'1w',share:1,days:365}]});
 assert.equal(x.expected_active_events,3650);assert.equal(x.stored_cards_before_archival,3650);assert.equal(x.card_cap_deficit,3138);assert.equal(x.active_cap_deficit,3522);assert.equal(x.storage.protected_retained_cards,3650);assert.equal(x.storage.protected_inactive_card_watch_proof_serialized_bytes,0);assert.equal(x.storage.retention_expiry_assumed,false);assert.equal(x.activation_allowed,false);
});
test('a short summary window cannot discard a longer declared hot window and its raw is counted only once',()=>{
 const x=scenario({summary_days:1,closed_hot_days:4,residence_mix:[{timeframe:'15m',share:1,days:1}]}),s=x.storage;
 assert.equal(x.expected_active_events,10);assert.equal(x.stored_cards_before_archival,40);assert.equal(s.closed_hot_conservative_serialized_bytes,2621440);assert.equal(s.closed_hot_raw_not_added_twice,true);assert.equal(s.total_serialized_estimate,2847480);assert.equal(s.protected_retained_cards,40);
});
test('protecting retained inactive proofs does not change source traffic, queue visits, caps or native flags',()=>{
 const x=scenario();assert.equal(x.source_HTTP.mandatory_futures_floor_day,61);assert.equal(x.source_HTTP.optional_spot_floor_day,60);assert.equal(x.source_HTTP.total_floor_day,121);assert.equal(x.watch.event_visits_day,29952);assert.equal(x.watch.checkpoint_shards_proposal.logical_rows_written_day,1332);assert.equal(x.watch.checkpoint_shards_proposal.native_qualified,false);assert.equal(x.assumptions.max_active,128);assert.equal(x.assumptions.max_cards,512);assert.equal(x.activation_allowed,false);
});
