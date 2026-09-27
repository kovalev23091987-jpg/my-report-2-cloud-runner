import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const runtime=process.env.REPORT2_TEST_RUNTIME?new URL('file://'+process.env.REPORT2_TEST_RUNTIME.replace(/\/$/,'')+'/'):new URL('../../../repository/runtime/',import.meta.url);
const {evaluateWithinRunReservation}=await import(new URL('d1-preaction-budget-guard.mjs',runtime));
const {V3_EARLY_SIDECAR_BUDGET}=await import(new URL('src/v3-early-sidecar.mjs',runtime));
const {V3_REALIZED_LIQUIDATION_SIDECAR_BUDGET}=await import(new URL('src/v3-realized-liquidation-sidecar.mjs',runtime));
const {V3_LIQUIDATION_SIDECAR_BUDGET}=await import(new URL('src/v3-liquidation-sidecar.mjs',runtime));
const {V3_TELEGRAM_LIFECYCLE_SIDECAR_BUDGET}=await import(new URL('src/v3-telegram-lifecycle-sidecar.mjs',runtime));
const {BOUND_TELEGRAM_DELIVERY_BUDGET}=await import(new URL('src/bound-telegram-delivery-sidecar.mjs',runtime));
const names={postV7UnifiedEnabled:true,R88_DOWNSTREAM_RESERVE:{rows_read:4500,rows_written:50},V3_EARLY_SIDECAR_BUDGET,V3_REALIZED_LIQUIDATION_SIDECAR_BUDGET,V3_LIQUIDATION_SIDECAR_BUDGET,V3_TELEGRAM_LIFECYCLE_SIDECAR_BUDGET,BOUND_TELEGRAM_DELIVERY_BUDGET};
const runner=fs.readFileSync(new URL('../files/runner-main.mjs',import.meta.url),'utf8');
const expression=runner.match(/const postV7CriticalLaneReserve = ([\s\S]*?);\n/)[1];
const reserve=Function(...Object.keys(names),'return '+expression)(...Object.values(names));
const reservation={ok:true,rows_read:28000,rows_written:560};
function gate(used,envelope=reserve){return evaluateWithinRunReservation({reservation,currentUsage:{rows_read:used,rows_written:200,requests:100,unknown_ops:0},extraRowsRead:envelope.rows_read,extraRowsWritten:envelope.rows_written});}
test('R049: optional aggregation cannot block lifecycle and delivery that fit the original cap',()=>{
 assert.equal(gate(18000).allowed,true,'must reserve the mandatory tail, not every optional worst case together');
 assert.equal(gate(18000,{rows_read:reserve.rows_read+V3_EARLY_SIDECAR_BUDGET.rows_read,rows_written:reserve.rows_written+V3_EARLY_SIDECAR_BUDGET.rows_written}).allowed,true);
 assert.equal(gate(22000,{rows_read:reserve.rows_read+V3_LIQUIDATION_SIDECAR_BUDGET.rows_read,rows_written:reserve.rows_written+V3_LIQUIDATION_SIDECAR_BUDGET.rows_written}).allowed,false);
 assert.equal(gate(22000).allowed,true,'projected aggregation defers while mandatory tail still fits');
});
test('R049: no cap is raised and insufficient final delivery capacity remains blocked',()=>{
 assert.deepEqual(reservation,{ok:true,rows_read:28000,rows_written:560});assert.equal(gate(27900,BOUND_TELEGRAM_DELIVERY_BUDGET).allowed,false);
});
