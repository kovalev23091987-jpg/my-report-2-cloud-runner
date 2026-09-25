import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeArchitectureShadowStats } from '../../validation/architecture-shadow-statistics.mjs';

const DAY=86_400_000;
const END=1_800_000_000_000;
const START=END-14*DAY;

test('shadow statistics exposes closed source contribution without ReferenceError',()=>{
  const out=summarizeArchitectureShadowStats({
    startTs:START,endTs:END,
    early:[{last_seen_ts:END-DAY,lifecycle_stage:'OBSERVE',direction_hint:'LONG'}],
    evidence:[{observed_ts:END-DAY,dq_status:'PARTIAL',evidence_compact_json:JSON.stringify([
      {source:'HTX',status:'CLOSED'},{source:'Bybit',status:'NOT_CLOSED'}
    ])}],
    contexts:[],outcomes:[],events:[],
  });
  assert.equal(out.status,'CLOSED_READ_ONLY_SUMMARY');
  assert.equal(out.source_contribution.HTX,1);
  assert.equal(out.source_contribution.Bybit,1);
  assert.equal(out.source_closed_contribution.HTX,1);
  assert.equal(out.source_closed_contribution.Bybit,undefined);
  assert.equal(out.safety.read_only,true);
  assert.equal(out.safety.thresholds_changed,false);
});
