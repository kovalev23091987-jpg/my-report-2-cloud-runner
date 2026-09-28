import test from 'node:test';
import assert from 'node:assert/strict';
import {preserveQualifiedEarlyWaveContinuity} from '../files/src/early-wave-continuity.mjs';

const qualified={contract:'FIL-USDT',priority_rank:3,early_candidate_bridge:true,early_candidate_wave_id:'EDW:FIL:1',early_candidate_quality_0_100:82,early_candidate_direction_hint:'SHORT',early_candidate_evidence_domains:['OI','VOLUME'],microstructure_priority_confirmed:true};

test('restores one exact qualified early wave after adaptive planning compacts the row',()=>{
 const source={shortlist:[qualified]};
 const adaptive={shortlist:[{contract:'FIL-USDT',priority_rank:9,fast_move_retry:true}]};
 const out=preserveQualifiedEarlyWaveContinuity(adaptive,source);
 assert.equal(out.shortlist[0].priority_rank,9);
 assert.equal(out.shortlist[0].fast_move_retry,true);
 assert.equal(out.shortlist[0].early_candidate_bridge,true);
 assert.equal(out.shortlist[0].early_candidate_wave_id,'EDW:FIL:1');
 assert.equal(out.shortlist[0].early_candidate_quality_0_100,82);
 assert.equal(out.shortlist[0].early_candidate_direction_hint,'SHORT');
 assert.deepEqual(out.early_wave_continuity,{version:'early-wave-continuity-v1-20260928',qualified_source_rows:1,restored_rows:1,invented_rows:0});
});

test('never invents a wave from raw, below-threshold or directionless rows',()=>{
 const source={shortlist:[
  {...qualified,contract:'LOW-USDT',early_candidate_quality_0_100:69},
  {...qualified,contract:'RAW-USDT',early_candidate_bridge:false},
  {...qualified,contract:'NONE-USDT',early_candidate_direction_hint:'BIDIRECTIONAL_REQUIRES_DEEP_RESOLUTION'},
 ]};
 const adaptive={shortlist:source.shortlist.map(({contract})=>({contract}))};
 const out=preserveQualifiedEarlyWaveContinuity(adaptive,source);
 assert.equal(out.shortlist.some(row=>row.early_candidate_bridge===true),false);
 assert.equal(out.early_wave_continuity.restored_rows,0);
 assert.equal(out.early_wave_continuity.invented_rows,0);
});

test('never copies a qualified wave to a different contract',()=>{
 const out=preserveQualifiedEarlyWaveContinuity({shortlist:[{contract:'QNT-USDT'}]},{shortlist:[qualified]});
 assert.deepEqual(out.shortlist,[{contract:'QNT-USDT'}]);
 assert.equal(out.early_wave_continuity.restored_rows,0);
});
