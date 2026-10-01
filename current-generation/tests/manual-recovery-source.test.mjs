import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const runner=fs.readFileSync(new URL('../files/runner-main.mjs',import.meta.url),'utf8');
const start=runner.indexOf("if(requestedSource==='schedule'&&manualCommandClaim.claimed)");
const end=runner.indexOf('const recoveredMode=',start);
assert.ok(start>=0&&end>start);
const route=runner.slice(start,end);

test('claimed scheduled BTW command reaches the analyzer as the exact recovered manual coin',()=>{
 const context={requestedSource:'schedule',source:'schedule',env:{REPORT2_RUN_SOURCE:'schedule'},manualCommandId:'',manualCommandClaim:{claimed:true,row:{command_id:'CMD:BTW',mode:'MANUAL_COIN',contract:'BTW-USDT'}}};
 vm.runInNewContext(route,context);
 assert.equal(context.source,'manual_recovery');
 assert.equal(context.env.REPORT2_RUN_SOURCE,'manual_recovery');
 assert.equal(context.env.REPORT2_MANUAL_COIN_CONTRACT,'BTW-USDT');
 assert.equal(context.manualCommandId,'CMD:BTW');
 assert.equal(context.env.REPORT2_RUN_SOURCE!=='schedule'?context.env.REPORT2_MANUAL_COIN_CONTRACT:'','BTW-USDT');
});

test('an unclaimed scheduled scan remains scheduled and gains no manual coin',()=>{
 const context={requestedSource:'schedule',source:'schedule',env:{REPORT2_RUN_SOURCE:'schedule'},manualCommandId:'',manualCommandClaim:{claimed:false}};
 vm.runInNewContext(route,context);
 assert.equal(context.env.REPORT2_RUN_SOURCE,'schedule');
 assert.equal(context.env.REPORT2_MANUAL_COIN_CONTRACT,undefined);
});
