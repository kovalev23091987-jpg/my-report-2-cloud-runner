import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const runtime=path.resolve(process.env.REPORT2_TEST_RUNTIME||'runtime');
const imp=p=>import(pathToFileURL(path.join(runtime,'src',p)).href);
const before=await imp('plan-before-diagnostic.mjs'),after=await imp('canonical-runtime-adapter.mjs');
const bytes=gunzipSync(fs.readFileSync(new URL('../../checkpoints/actual-scheduled-source-result-37418312423.json.gz',import.meta.url)));
assert.equal(createHash('sha256').update(bytes).digest('hex'),'cc671355463770bd49cfa8aadeaaf47b004c68abff767bcc7c3f46177673b93e');
const original=JSON.parse(bytes).candidates.find(c=>c.contract==='BR-USDT').canonical;
const ts=original.observed_ts,contract='BR-USDT',wave=original.early_candidate.items[0].wave_id;
const qualify=(direction='SHORT',direction_state='SHORT_WATCH')=>({contract,current_price:original.current_price,early_candidate_bridge:true,wave_id:wave,early_candidate_wave_id:wave,early_candidate_quality_0_100:91,early_candidate_direction_hint:direction,early_candidate_receipt:{status:'CLOSED',contract,wave_id:wave,source_ts:ts-1000,available_at:ts-1000,direction_hint:direction,direction_state,evidence:[{status:'CLOSED',side:direction}]}});
const input=(overrides={})=>({contract,run_id:'retained-price-candle-diagnostic-not-full-live-replay',snapshot_id:'diagnostic-regression',observed_ts:ts,discovery_row:qualify(),publication_shadow:{entry_signal:{state:'REJECTED',direction:'SHORT'}},opportunity:{observed_ts:ts-1000,newest_event:{event_id:original.opportunity.event_id,event_close_ts:original.opportunity.event_close_ts,candle:original.opportunity.candle,minute_decomposition:original.opportunity.minute_decomposition}},...overrides});
function compare(x){
 const b=before.buildRuntimeCanonicalBundle(x),a=after.buildRuntimeCanonicalBundle(x);
 const clean=c=>{const y=structuredClone(c);delete y.analytical_fingerprint;delete y.metadata.scenario_plan_transfer.fallback_receipt;return y;};
 assert.deepEqual(clean(a.canonical),clean(b.canonical),'all analytical fields except new diagnostic must be identical');
 for(const k of ['manual','telegram']){assert.equal(a[k].status,b[k].status);assert.equal(a[k].text,b[k].text,'approved forms must be unchanged');}
 return a.canonical;
}
const receipt=c=>c.metadata.scenario_plan_transfer.fallback_receipt;
test('actual retained BR price/candle bounds retain rejection; diagnostic is not a full original producer replay',()=>{
 const c=compare(input());assert.equal(c.state,'REJECTED');assert.equal(c.direction,'SHORT');assert.equal(c.trigger,null);
 const r=receipt(c);assert.equal(r.reason,'NO_FORWARD_FACTUAL_PRICE_TRIGGER');assert.equal(r.current_price,.39239);assert.equal(r.event_low,.44361);assert.equal(r.event_high,.46278);assert.equal(r.event_close_ts,1791247500000);assert.equal(r.decision_ts,ts);assert.equal(r.score_contribution,0);assert.equal(r.entry_authorized_by_receipt,false);
});
test('controlled missing direction and unclosed candle remain rejected with distinct receipts',()=>{
 const c=compare(input({discovery_row:qualify('SHORT','BIDIRECTIONAL_REQUIRES_DEEP_RESOLUTION')}));assert.equal(c.direction,null);assert.equal(receipt(c).reason,'DIRECTION_NOT_CLOSED');
 const missing=compare(input({opportunity:{observed_ts:ts-1000,newest_event:{candle:{high:.4,low:.39}}}}));assert.equal(receipt(missing).reason,'CLOSED_ANOMALY_CANDLE_REQUIRED');assert.equal(missing.entry,null);
});
test('controlled valid watch and already true cancellation retain identical entry/publication behavior',()=>{
 const opportunity={observed_ts:ts-1000,newest_event:{event_id:'controlled-source-boundary',event_close_ts:ts-60000,candle:{high:.4,low:.39},minute_decomposition:{classification_allowed:true}}};
 const c=compare(input({opportunity}));assert.equal(c.state,'OBSERVE');assert.equal(c.trigger.value,.39);assert.equal(c.invalidation.price,.4);assert.equal(receipt(c).status,'CLOSED');
 const discovery_row={...qualify(),current_price:.41};const canceled=compare(input({discovery_row,opportunity}));assert.equal(canceled.state,'REJECTED');assert.equal(receipt(canceled).reason,'CANCELLATION_ALREADY_TRUE_AT_SNAPSHOT');
});
test('partial pre-existing area suppresses fallback unchanged and is now explicit',()=>{
 const c=compare(input({publication_shadow:{entry_signal:{state:'REJECTED',direction:'SHORT'},scenario_plan:{entry_area_min_price:.39,entry_area_max_price:.39}}}));
 assert.equal(c.metadata.scenario_plan_transfer.fallback_plan_closed,false);assert.equal(receipt(c).reason,'EXISTING_ENTRY_AREA_SUPPRESSES_FALLBACK');
});
