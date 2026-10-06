import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {verifiedRoleView} from './source-role-fixtures.mjs';
const root=path.resolve(process.env.REPORT2_TEST_RUNTIME||'runtime');
const modulePath=path.join(root,'src/canonical-runtime-adapter.mjs');
const source=fs.readFileSync(modulePath,'utf8'),anchor='allow_range_observation:early&&';assert.equal(source.split(anchor).length,2);
const baselinePath=path.join(root,'src/technical-range-baseline.mjs');fs.writeFileSync(baselinePath,source.replace(anchor,'allow_range_observation:false&&'));
const before=await import(pathToFileURL(baselinePath));fs.unlinkSync(baselinePath);
const after=await import(pathToFileURL(modulePath));
const {assessActionability,renderCanonicalTelegram}=await import(pathToFileURL(path.join(root,'src/canonical-publication.mjs')));
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/actual-1425-range-boundaries.json',import.meta.url))),actual=fixture.rows.find(r=>r.contract==='ADA-USDT');
const ts=actual.observed_ts,wave=actual.early.items[0].wave_id;
function input(){
 // Boundary values and clocks are retained real data. The qualification envelope
 // is reconstructed as a controlled component case, not the original full producer.
 const er=actual.direction_receipt;
 return{contract:actual.contract,run_id:'CONTROLLED-COMPONENT-OF-1425',snapshot_id:`S392:${actual.contract}:${ts}`,observed_ts:ts,discovery_row:{contract:actual.contract,current_price:actual.price,early_candidate_bridge:true,early_candidate_wave_id:wave,wave_id:wave,early_candidate_quality_0_100:actual.early.items[0].early_detection_quality_0_100,early_candidate_receipt:{status:'CLOSED',contract:actual.contract,wave_id:wave,source_ts:er.source_ts,available_at:er.available_at,direction_hint:er.candidate.direction,direction_state:er.candidate.confirmation_state,evidence:[{status:'CLOSED',side:actual.direction}]}},publication_shadow:{entry_signal:{state:'REJECTED'}},opportunity:{observed_ts:actual.anomaly.producer_observed_ts,newest_event:{event_id:actual.anomaly.event_id,event_close_ts:actual.anomaly.event_close_ts,candle:{high:actual.anomaly.event_high,low:actual.anomaly.event_low},minute_decomposition:{classification_allowed:actual.anomaly.anomaly_candle_closed}}},internal_market_context:{internal_only:true,evidence_v2:{evidence:actual.technical_evidence}}};
}
test('retained actual forward range closes an early observation where old anomaly alone has no forward trigger',()=>{
 const x=input(),old=before.buildRuntimeCanonicalBundle(x).canonical,c=after.buildRuntimeCanonicalBundle(x).canonical;
 assert.equal(old.state,'REJECTED');assert.equal(old.metadata.scenario_plan_transfer.fallback_receipt.reason,'NO_FORWARD_FACTUAL_PRICE_TRIGGER');
 assert.equal(c.state,'OBSERVE');assert.equal(c.direction,'LONG');assert.deepEqual(c.scores,old.scores);assert.equal(c.scores.coin_interest_0_100,82);
 assert.equal(c.trigger.value,.285132);assert.equal(c.invalidation.price,.261865);assert.equal(c.metadata.direction_resolution.authorized_entry_direction,'UNKNOWN');assert.deepEqual(c.targets,[]);
 assert.equal(c.metadata.scenario_plan_transfer.fallback_receipt.technical_range_receipt.evidence_id,actual.technical_evidence[0].evidence_id);
 // Controlled source-role gate verifies approved delivery after the component:
 c.metadata.source_role_view=verifiedRoleView(actual.contract,ts);
 assert.equal(assessActionability({canonical:c,lifecycle_event:'OBSERVE'}).deliver,true);
 const r=renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE'});assert.equal(r.ok,true);assert.match(r.text,/РАННЕЕ НАБЛЮДЕНИЕ/);assert.match(r.text,/пока не подтверждена/);
});
test('missing direction, low interest, hard veto, stale or missing range cannot become a new observation',()=>{
 for(const change of [x=>{x.discovery_row.early_candidate_receipt.direction_state='DIRECTION_NOT_CLOSED';},x=>{x.discovery_row.early_candidate_quality_0_100=69;},x=>{x.publication_shadow.entry_signal.hard_veto=true;},x=>{x.internal_market_context.evidence_v2.evidence=[];},x=>{x.internal_market_context.evidence_v2.evidence=structuredClone(actual.technical_evidence);x.internal_market_context.evidence_v2.evidence[0].expires_at=ts;}]){const x=input();change(x);assert.equal(after.buildRuntimeCanonicalBundle(x).canonical.state,'REJECTED');}
});
test('WAIT/ENTRY rules and an existing routed plan do not consume the new range fallback',()=>{
 for(const state of ['WAIT_FOR_TRIGGER','ENTRY_NOW_ANALYTICAL','ENTRY_NOW_VALIDATED']){const x=input();x.publication_shadow.entry_signal={state,direction:'LONG'};const a=after.buildRuntimeCanonicalBundle(x).canonical,b=before.buildRuntimeCanonicalBundle(x).canonical;assert.deepEqual(a,b);}
 const x=input();x.publication_shadow.scenario_plan={entry_area_min_price:.285132,entry_area_max_price:.285132};assert.equal(after.buildRuntimeCanonicalBundle(x).canonical.metadata.scenario_plan_transfer.fallback_receipt.reason,'EXISTING_ENTRY_AREA_SUPPRESSES_FALLBACK');
});
test('existing valid anomaly-based observation retains its original trigger and canonical fields',()=>{
 const x=input();x.opportunity.newest_event.candle={high:.29,low:.27};assert.deepEqual(after.buildRuntimeCanonicalBundle(x).canonical,before.buildRuntimeCanonicalBundle(x).canonical);
});
