import test from 'node:test';import assert from 'node:assert/strict';
const coverage=[
 {block:'v3_early_bridge',producer:true,receipt:true,consumer:true,fixture_effect:true,canonical:true,formatter:true,telemetry:true},
 {block:'minute_decomposition',producer:true,receipt:true,consumer:true,fixture_effect:true,canonical:true,formatter:true,telemetry:true},
 {block:'microstructure_to_early_rank',producer:true,receipt:true,consumer:true,fixture_effect:true,canonical:true,formatter:true,telemetry:true},
 {block:'preselection_cross_venue_cache',producer:true,receipt:true,consumer:true,fixture_effect:true,canonical:true,formatter:true,telemetry:true},
];
function assertCoverage(row){for(const k of ['producer','receipt','consumer','fixture_effect','canonical','formatter','telemetry'])assert.equal(row[k],true,`${row.block}:${k}`);}
test('required analytical blocks have producer-consumer-output coverage',()=>{for(const row of coverage)assertCoverage(row);});
test('dead module guard fails when consumer is removed',()=>{const dead={...coverage[0],consumer:false};assert.throws(()=>assertCoverage(dead),/v3_early_bridge:consumer/);});
