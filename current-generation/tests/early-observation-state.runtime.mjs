import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const runtime=path.resolve(process.argv[2]||'runtime');
const {selectCanonicalPublicationState,selectCanonicalInterestBasis,buildRuntimeCanonicalBundle}=await import(pathToFileURL(path.join(runtime,'src/canonical-runtime-adapter.mjs')).href);

assert.equal(selectCanonicalPublicationState({route_state:'REJECTED',early_candidate:true,early_quality:82,direction:'LONG'}),'OBSERVE');
assert.equal(selectCanonicalPublicationState({route_state:'REJECTED',early_candidate:true,early_quality:82,direction:'SHORT'}),'OBSERVE');
assert.equal(selectCanonicalPublicationState({route_state:'REJECTED',route_hard_veto:true,early_candidate:true,early_quality:82,direction:'LONG'}),'REJECTED');
assert.equal(selectCanonicalPublicationState({route_state:'REJECTED',early_candidate:true,early_quality:69,direction:'LONG'}),'REJECTED');
assert.equal(selectCanonicalPublicationState({route_state:'REJECTED',early_candidate:true,early_quality:82,direction:null}),'REJECTED');
assert.equal(selectCanonicalPublicationState({route_state:'ENTRY_NOW_VALIDATED',route_hard_veto:false,early_candidate:true,early_quality:82,direction:'LONG'}),'ENTRY_NOW_VALIDATED');
assert.equal(selectCanonicalPublicationState({route_state:'UNKNOWN',route_hard_veto:false,early_candidate:true,early_quality:82,direction:'LONG'}),'OBSERVE');

assert.deepEqual(selectCanonicalInterestBasis({state:'OBSERVE',early_quality:82,deep_interest:48}),{score:82,basis:'QUALIFIED_EARLY_DETECTION_SCORE'});
assert.deepEqual(selectCanonicalInterestBasis({state:'OBSERVE',early_quality:69,deep_interest:74}),{score:74,basis:'DEEP_CANONICAL_INTEREST_SCORE'});
assert.deepEqual(selectCanonicalInterestBasis({state:'WAIT_FOR_TRIGGER',early_quality:82,deep_interest:74}),{score:74,basis:'DEEP_CANONICAL_INTEREST_SCORE'});

// Factual QNT prices: the cancellation condition was already true at 248.225.
const ts=1790692600000,contract='QNT-USDT';
const discovery={contract,early_candidate_bridge:true,early_candidate_wave_id:'W',wave_id:'W',early_candidate_quality_0_100:75,early_candidate_direction_hint:'SHORT',early_candidate_receipt:{status:'CLOSED',contract,wave_id:'W',source_ts:ts-1000,available_at:ts-1000,direction_hint:'SHORT',direction_state:'SHORT_WATCH',evidence:[{status:'CLOSED',side:'SHORT'}]}};
const minute_candles=Array.from({length:100},(_,i)=>({ts:Math.floor(ts/60000)*60000-(101-i)*60000,open:240,close:240,high:i>=85?247.85:251,low:i===40?213.9:i>=85?228.38:220}));
const assess=price=>buildRuntimeCanonicalBundle({contract,run_id:'risk-check',snapshot_id:'risk-check',observed_ts:ts,discovery_row:{...discovery,current_price:price},publication_shadow:{entry_signal:{state:'REJECTED',direction:'SHORT'}},minute_candles,opportunity:{newest_event:{candle:{high:300,low:280},minute_decomposition:{classification_allowed:true}}}}).canonical;
const invalidated=assess(248.225),valid=assess(240);
assert.equal(invalidated.state,'REJECTED');
assert.equal(invalidated.entry,null);
assert.equal(invalidated.scores.coin_interest_0_100,75);
assert.equal(valid.state,'OBSERVE');
assert.equal(valid.entry.min_price,228.38);
assert.ok(valid.targets[0].potential_move_pct>=5);

console.log(JSON.stringify({status:'EARLY_OBSERVATION_STATE_POLICY_PASS'}));
