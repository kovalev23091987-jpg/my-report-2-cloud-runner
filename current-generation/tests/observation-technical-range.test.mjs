import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {verifiedObservationRange} from '../files/src/observation-technical-range.mjs';
const source=JSON.parse(fs.readFileSync(new URL('./fixtures/actual-1425-range-boundaries.json',import.meta.url)));
const actual=source.rows.find(r=>r.contract==='ADA-USDT');
const args={evidence:actual.technical_evidence,contract:actual.contract,direction:actual.direction,price:actual.price,decision_ts:actual.observed_ts};
test('exact retained 1425 ADA has forward N10 boundaries even though its old anomaly boundary was passed',()=>{
 assert.equal(source.source_cloud_run,37456049325);assert.equal(actual.prior_refusal,'NO_FORWARD_FACTUAL_PRICE_TRIGGER');
 const r=verifiedObservationRange(args);assert.equal(r.level,.285132);assert.equal(r.cancel,.261865);assert.equal(r.evidence_id,actual.technical_evidence[0].evidence_id);assert.equal(r.entry_authorized,false);assert.equal(r.score_contribution,0);
});
test('same measured boundaries support a SHORT watch with reversed confirmation/cancellation and no new directional vote',()=>{
 const r=verifiedObservationRange({...args,direction:'SHORT'});assert.equal(r.level,.261865);assert.equal(r.cancel,.285132);
 assert.equal(verifiedObservationRange({...args,direction:null}),null);
});
test('unknown identity, stale/future clocks, unclosed candles, incorrect range/count/window and already crossed boundaries are refused',()=>{
 const row=actual.technical_evidence[0];
 for(const patch of [{htx_contract:'OTHER-USDT'},{upstream_id:'OTHER'},{metric_family:'ROLLING_24H_PRICE_RANGE_CONTEXT'},{identity_status:'UNKNOWN'},{finality_status:'PROVISIONAL'},{all_candles_closed:false},{candle_count:19},{source_ts:actual.observed_ts+1},{first_known_ts:actual.observed_ts+1},{expires_at:actual.observed_ts},{observed_ts:row.source_ts-1},{window_end:row.window_end+1},{range_low:row.range_high},{last_closed_price:row.range_high+1}])assert.equal(verifiedObservationRange({...args,evidence:[{...row,...patch}]}),null,JSON.stringify(patch));
 assert.equal(verifiedObservationRange({...args,decision_ts:row.source_ts+180001}),null);
 for(const price of [row.range_high,row.range_low,row.range_high+1,0])assert.equal(verifiedObservationRange({...args,price}),null);
});
test('boundaries cannot change the direction or qualification of the retained NIL rejection',()=>{
 const nil=source.rows.find(r=>r.contract==='NIL-USDT');assert.equal(nil.direction,null);assert.equal(verifiedObservationRange({evidence:nil.technical_evidence,contract:nil.contract,direction:nil.direction,price:nil.price,decision_ts:nil.observed_ts}),null);
});
