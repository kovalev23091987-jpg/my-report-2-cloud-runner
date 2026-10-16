import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {exactSavedTailReceipts,reconcileSavedNativePointCosts,qualifyExistingFamilyInventory} from './disjoint-native-day-accounting.mjs';
import {auditSavedNativeDayCosts,SAVED_NATIVE_DAY_INPUTS} from '../tools/audit-native-day-costs-20261016.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex'),root=new URL('../',import.meta.url),inputs=()=>SAVED_NATIVE_DAY_INPUTS.map(v=>({...v,text:fs.readFileSync(new URL(v.path,root),'utf8')}));
function changed(input,mutate){const j=JSON.parse(input.text);mutate(j);const text=JSON.stringify(j);return{...input,text,sha256:hash(text)};}
function changeMessage(root,mutate){const r=root.receipts[0],raw=JSON.parse(r.original_native_message);mutate(raw);r.original_native_message=JSON.stringify(raw);r.receipt_sha256=hash(JSON.stringify(raw));}
test('all three exact saved native invocations reconcile disjoint components without extrapolation or duplicate PRIVATE_PRICE',()=>{
 const out=reconcileSavedNativePointCosts(inputs().flatMap(exactSavedTailReceipts)),d=out.observed_days['2026-10-16'];assert.equal(d.unique_observed_invocations,3);assert.deepEqual(d.known_point_subtotal,{requests:39,rows_read:482,rows_written:41,unknown_ops:0});assert.deepEqual(d.inside_PRIVATE_PRICE_source_component,{requests:4,rows_read:147,rows_written:4,unknown_ops:0});assert.deepEqual(d.outside_known_family_point_subtotal,{requests:35,rows_read:335,rows_written:37,unknown_ops:0});assert.equal(out.daily_total,null);assert.equal(out.daily_upper_bound,null);assert.equal(out.admission_authorized,false);
});
test('duplicate transport of one final receipt is counted once and conflicts retain both candidates unresolved',()=>{
 const obs=inputs().flatMap(exactSavedTailReceipts),out=reconcileSavedNativePointCosts([...obs,...obs]);assert.equal(out.duplicate_receipts_not_added,3);assert.equal(out.observed_days['2026-10-16'].unique_observed_invocations,3);
 const second=inputs()[0],mutated=changed(second,j=>changeMessage(j,r=>{r.native_D1.rows_read++;r.collector_excluding_private_price_source_D1.rows_read++;})),conflict=reconcileSavedNativePointCosts([...exactSavedTailReceipts(second),...exactSavedTailReceipts(mutated)]);assert.equal(conflict.conflicting_invocations.length,1);assert.equal(conflict.conflicting_known_receipts.length,2);assert.equal(conflict.observed_days['2026-10-16'].unique_observed_invocations,1);assert.equal(conflict.whole_day_closed,false);
});
test('hash, immutable version, native clocks and cleanup must bind before a saved point is reused',()=>{
 const one=inputs()[0];assert.throws(()=>exactSavedTailReceipts({...one,sha256:'0'.repeat(64)}),/SAVED_NATIVE_ORIGINAL/);
 for(const mutate of [j=>j.tail_deleted=false,j=>j.after.version_id='foreign',j=>j.receipts[0].receipt_sha256='0'.repeat(64),j=>j.receipts[0].worker='foreign',j=>j.receipts[0].event_ts=j.completed_ts+1,j=>j.SQL=1])assert.throws(()=>exactSavedTailReceipts(changed(one,mutate)));
});
test('unknown native costs preserve known component subtotals and never become a closed day',()=>{
 const one=inputs()[0],modified=changed(one,j=>changeMessage(j,r=>{r.native_D1.unknown_ops=2;r.collector_excluding_private_price_source_D1.unknown_ops=2;r.native_totals_closed=false;}));
 const out=reconcileSavedNativePointCosts(exactSavedTailReceipts(modified)),d=out.observed_days['2026-10-16'];assert.equal(d.unknown_receipts,1);assert.equal(d.known_point_subtotal.rows_read,449);assert.equal(d.known_point_subtotal.unknown_ops,2);assert.equal(out.whole_day_closed,false);assert.equal(out.daily_total,null);
});
test('unbalanced overlap and midnight-spanning clocks keep native point costs unallocated rather than guessing a billing day',()=>{
 const one=inputs()[0],unbalanced=changed(one,j=>changeMessage(j,r=>r.private_price_source_D1.rows_read++)),out=reconcileSavedNativePointCosts(exactSavedTailReceipts(unbalanced));assert.equal(out.unallocated_receipts.length,1);assert.equal(out.unallocated_receipts[0].receipt.native_D1.rows_read,130);
 const midnightInput=changed(one,j=>{const t=Date.UTC(2026,9,15,23,59,59),r=j.receipts[0];j.opened_ts=t-100;r.event_ts=t;r.log_ts=t+2100;r.received_ts=t+2200;changeMessage(j,r=>{r.started_ts=t;r.completed_ts=t+2000;});});
 const midnight=reconcileSavedNativePointCosts(exactSavedTailReceipts(midnightInput));assert.equal(midnight.unallocated_receipts.length,1);assert.equal(midnight.observed_days['2026-10-16'].unique_observed_invocations,1);assert.equal(midnight.daily_total,null);
});
test('nine planned family envelopes remain distinct from observed spend and inconsistent arithmetic is rejected',()=>{
 const i=JSON.parse(fs.readFileSync(new URL('checkpoints/ACTIVE105_D1_FAMILY_INVENTORY_20261015.json',root),'utf8'));assert.deepEqual(qualifyExistingFamilyInventory(i).known_nine_family_envelopes,{reads:3266708,writes:58920});i.families[0].day.reads--;assert.throws(()=>qualifyExistingFamilyInventory(i),/ENVELOPE_ARITHMETIC/);
});
test('the reusable saved-only audit preserves deficits and missing proof without activating limits or SQL',()=>{
 const out=auditSavedNativeDayCosts({root:fileURLToPath(root)});assert.equal(out.observed_native_points.observed_days['2026-10-16'].known_point_subtotal.rows_read,482);assert.equal(out.nominal_storage_plan.proposal_enabled,false);assert.equal(out.nominal_storage_plan.scheduled_nominal_deficit,48);assert.equal(out.bridge_contract_limit.either_counter_can_mark_fixture_measured,true);assert.equal(out.bridge_contract_limit.current_installed_bridge_requalified,false);assert.equal(out.runtime_or_admission_changed,false);assert.equal(out.daily_upper_bound,null);assert.equal(out.sourceHTTP,0);assert.equal(out.SQL,0);
});
