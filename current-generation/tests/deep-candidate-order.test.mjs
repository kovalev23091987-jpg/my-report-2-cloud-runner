import test from 'node:test';
import assert from 'node:assert/strict';
import {compareOrdinaryDeepCandidates} from '../files/src/deep-candidate-order.mjs';

test('current rank 1 wins over never-checked rank 24 in ordinary discovery',()=>{
 const rows=[{contract:'OLD-USDT',priority_rank:24,last_check_ts:null},{contract:'BEST-USDT',priority_rank:1,last_check_ts:1000}];
 rows.sort(compareOrdinaryDeepCandidates);assert.equal(rows[0].contract,'BEST-USDT');
});
test('directional context precedes neutral context, then rank wait age and contract are deterministic',()=>{
 const rows=[
  {contract:'N-USDT',priority_rank:1,last_check_ts:null,_v3_discovery_source:{discovery_direction_hint:'NEUTRAL_ANOMALY'}},
  {contract:'B-USDT',priority_rank:3,last_check_ts:20,_v3_discovery_source:{discovery_direction_hint:'LONG_WATCH'}},
  {contract:'A-USDT',priority_rank:3,last_check_ts:10,_v3_discovery_source:{discovery_direction_hint:'SHORT'}},
 ];
 rows.sort(compareOrdinaryDeepCandidates);assert.deepEqual(rows.map(x=>x.contract),['A-USDT','B-USDT','N-USDT']);
});
