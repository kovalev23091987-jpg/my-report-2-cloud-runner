import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {summarizeAssignedSourceUse} from '../files/src/block-decision-use-audit.mjs';
const gz=readFileSync(new URL('./fixtures/actual-cache-source-use-20261006.json.gz',import.meta.url));
assert.equal(createHash('sha256').update(gz).digest('hex'),'73e1dff346a7d21bdfca742869ffe1b9a9f3a32c4d5434871b4d880a3dc67c1e');
const fixture=JSON.parse(gunzipSync(gz));
test('retained same-run HIT statuses count valid original-clock facts without changing assigned use',()=>{
 const expected=[1,1,1,0,0,0];
 assert.equal(fixture.proofs_combined_as_one_live_acceptance,false);
 for(const [i,row] of fixture.rows.entries()){
  const original=row.retained_source_accounting,before=JSON.stringify(original),actual=summarizeAssignedSourceUse(original.details);
  assert.equal(actual.validated_cache_route_count,expected[i],row.contract+':'+row.block);
  const {validated_cache_route_count:unused,...unchanged}=actual;
  const {validated_cache_route_count:old,...retained}=original;
  assert.deepEqual(unchanged,retained);
  assert.equal(JSON.stringify(original),before);
 }
});
test('valid cached absence verifies availability without becoming useful options or independent votes',()=>{
 const row=fixture.rows.find(r=>r.contract==='QNT-USDT'&&r.block==='N14'),a=summarizeAssignedSourceUse(row.retained_source_accounting.details);
 assert.equal(a.validated_cache_route_count,1);assert.equal(a.routes_with_meaningful_facts,0);assert.equal(a.routes_with_actual_use,0);
 assert.equal(a.used_provider_count,0);assert.equal(a.routes_with_nonzero_score,0);assert.equal(a.independence_claimed,false);
});
test('expired shared HIT and primary zero-HTTP snapshot are not validated cache',()=>{
 for(const row of fixture.rows.filter(r=>r.contract==='BR-USDT')){
  const a=summarizeAssignedSourceUse(row.retained_source_accounting.details);assert.equal(a.validated_cache_route_count,0);
 }
});
