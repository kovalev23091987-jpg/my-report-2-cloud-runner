import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readSavedOutcomeObservation} from '../../operator/saved-outcome-observation.mjs';
const sha=text=>createHash('sha256').update(text).digest('hex');

test('ARTIFICIAL selected outcome remains bound to the original wave, not a later card or a different horizon',async()=>{
  const a={instrument:{instrument_id:'FIXTURE:测试币',asset_id:'FIXTURE_ASSET'},wave_id:'FIXTURE_WAVE',analysis_ts:1000,reference_price:2,rules_version:'FIXTURE_RULES'};
  const key='pump:analysis:'+sha(JSON.stringify(a)),signal_key='pump:signal:FIXTURE:测试币:FIXTURE_WAVE',journal_key='pump:journal:FIXTURE:测试币:FIXTURE_WAVE';
  const origin={instrument_id:a.instrument.instrument_id,asset_id:a.instrument.asset_id,wave_id:a.wave_id,signal_id:signal_key,
    t0:1000,reference_price:2,rules_version:a.rules_version,evidence_class:'OBSERVED',run_purpose:'PRODUCTION',ready:true,mode:'AUTO'};
  const journal={frozen_anchor:{analysis_id:key,analysis_sha256:sha(JSON.stringify(a)),immutable:true,origin}};
  const signal={...origin,origin,instrument:a.instrument,analysis_key:key,original_card_id:'FIXTURE_CARD',deadline_ts:14401000,map_mode:'WITHOUT_MAP'};
  const outcome={signal_id:signal_key,wave_id:a.wave_id,t0:1000,reference_price:2,rules_version:a.rules_version,mode:'AUTO',map_mode:'WITHOUT_MAP',deadline_ts:14401000,status:'UNKNOWN'};
  const rows=new Map([[journal_key,journal],[signal_key,signal],['pump:outcome:'+signal_key,outcome]]);let reads=0;
  const store={async get(k){reads++;return structuredClone(rows.get(k)??null);}};
  const observation={first_genuine_same_original_SENT_observed:true,checks:{same_original:true,receipt_bound:true},analysis_key:key,card_id:'FIXTURE_CARD',private_evidence:{original:{analysis:a}}};
  const read=()=>readSavedOutcomeObservation({store,observation});
  const good=await read();assert.equal(good.status,'BOUND_SAVED_OUTCOME_UNKNOWN');assert.equal(good.saved_outcome_bound,true);assert.equal(reads,3);
  assert.equal(good.underlying_market_history_independently_verified,false);assert.equal(good.strategy_recomputed,false);
  assert.equal(good.market_HTTP,0);assert.equal(good.Telegram,0);
  rows.set(signal_key,{...signal,original_card_id:'LATER_CARD'});reads=0;
  assert.equal((await read()).status,'SAVED_SIGNAL_ORIGINAL_BINDING_MISMATCH');assert.equal(reads,2);
  rows.set(signal_key,signal);rows.set('pump:outcome:'+signal_key,{...outcome,deadline_ts:14402000,status:'HIT'});
  assert.equal((await read()).saved_outcome_bound,false);
  rows.delete('pump:outcome:'+signal_key);assert.equal((await read()).status,'NO_SAVED_OUTCOME_YET');
  reads=0;assert.equal((await readSavedOutcomeObservation({store,observation:{...observation,first_genuine_same_original_SENT_observed:false}})).status,'DELIVERY_NOT_BOUND');assert.equal(reads,0);
});
