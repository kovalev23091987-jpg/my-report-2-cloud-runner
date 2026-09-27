import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('only actionable approved entries enter factual 1 4 12 24 hour statistics',()=>{
 const sidecar=fs.readFileSync(new URL('../../runner/r8-20-prospective-validation-sidecar.mjs',import.meta.url),'utf8');
 assert.match(sidecar,/p\.lifecycle_event='ENTRY' AND p\.actionability_status='ACTIONABLE'/);
 assert.match(sidecar,/\['ENTRY_NOW_ANALYTICAL','ENTRY_NOW_VALIDATED'\]/);
 assert.match(sidecar,/remaining<5-1e-7/);
 assert.match(sidecar,/const HORIZONS = Object\.freeze\(\[1, 4, 12, 24\]\)/);
 assert.match(sidecar,/target_touched/);
 assert.match(sidecar,/invalidation_touched/);
 assert.match(sidecar,/performance_dimensions:\['BASIS','SOURCE'\]/);
 assert.match(sidecar,/canonical\?\.source_receipts/);
});

test('WAIT and OBSERVE share the same internal technical move proof fallback',()=>{
 const adapter=fs.readFileSync(new URL('../files/src/canonical-runtime-adapter.mjs',import.meta.url),'utf8');
 assert.match(adapter,/\['OBSERVE','WAIT_FOR_TRIGGER'\]\.includes\(state\)/);
 assert.match(adapter,/needsTechnicalFallback&&!observation\?'REJECTED':state/);
 assert.match(adapter,/route\?\.trigger\?\?fallbackTrigger/);
});
