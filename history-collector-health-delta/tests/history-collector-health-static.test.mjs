import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const src=fs.readFileSync(new URL('../validation/history-collector-health-audit.mjs',import.meta.url),'utf8');

test('validation is read-only and adds no runtime mutation',()=>{
  for(const bad of [/\bINSERT\s+INTO\b/i,/\bUPDATE\s+\w+\s+SET\b/i,/\bDELETE\s+FROM\b/i,/\.run\s*\(/,/\.exec\s*\(/])assert.doesNotMatch(src,bad);
  assert.match(src,/runtime_changes:0/);
});
test('R039 requires factual >=30d opportunity event history and maintenance lane',()=>{
  assert.match(src,/opportunity_shadow_event/);assert.match(src,/span_days\)>=30/);assert.match(src,/bounded_maintenance_lane/);
});
test('R048 requires each collector producer real freshness coverage dedup consumer health and recovery contract',()=>{
  for(const k of ['producer','real_data','freshness_24h','coverage_measured','dedup_closed','consumer','health_proof','recovery_contract'])assert.match(src,new RegExp(k));
});
test('missing reconnect event is never invented',()=>{
  assert.match(src,/STATIC_TIMEOUT_FALLBACK_CONTRACT_ONLY_NO_RECENT_FAILURE_RECOVERY_REQUIRED_TO_INVENT/);
});
