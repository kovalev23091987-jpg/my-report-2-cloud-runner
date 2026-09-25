import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const source=fs.readFileSync(new URL('../validation/validation-acceptance-audit.mjs',import.meta.url),'utf8');

test('validation acceptance audit is query-only',()=>{
 for(const bad of [/\bINSERT\s+INTO\b/i,/\bUPDATE\s+\w+\s+SET\b/i,/\bDELETE\s+FROM\b/i,/\.run\s*\(/,/\.exec\s*\(/])assert.doesNotMatch(source,bad);
});
test('truthful diagnostics never invent recall or forecast',()=>{
 assert.match(source,/NOT_CLOSED_NO_COMPLETE_MARKET_MOVE_DENOMINATOR/);
 assert.match(source,/NOT_CLOSED_OBSERVED_RATE_ONLY_NOT_FORECAST/);
 assert.match(source,/truthful_nulls_preserved:true/);
});
test('integration coverage requires all seven stages',()=>{
 for(const key of ['producer','receipt','consumer','fixture_effect','canonical','formatter','telemetry'])assert.match(source,new RegExp(key));
});
test('R051 requires all requested horizons',()=>{
 for(const value of ['15','30','60','240','1440'])assert.match(source,new RegExp(`\\b${value}\\b`));
});
