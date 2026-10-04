import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {isFreshManualMainAnalysis,deepRuntimeOptions} from '../files/src/two-candidate-policy.mjs';
import {compareOrdinaryDeepCandidates} from '../files/src/deep-candidate-order.mjs';

const worker=fs.readFileSync(new URL('../files/src/worker.js',import.meta.url),'utf8');

test('full manual report explicitly bypasses candidate cooldown',()=>{
  assert.match(worker,/const bypassCooldown\s*=\s*options\s*\?\.bypass_cooldown\s*===\s*true;/);
  assert.match(worker,/const cooldownActive\s*=\s*!bypassCooldown\s*&&\s*ageSec !== null/);
  assert.match(worker,/bypass_cooldown:\s*isFreshManualMainAnalysis\(env\?\.REPORT2_MANUAL_MODE\)/);
});

test('a recent full report cannot suppress a fresh exact-coin owner analysis',()=>{
 const body=worker.match(/function buildBoundedDeepCheckPlan\([\s\S]*?\n\}/u)?.[0];assert.ok(body);
 const plan=new Function('schedulerNumber','compareOrdinaryDeepCandidates',`const STAGE0_EXTERNAL_REQUESTS=4,DEEP_CHECK_EXTERNAL_REQUESTS=39,SMART_MONEY_EXTERNAL_REQUESTS=1,WORKERS_FREE_EXTERNAL_LIMIT=50,EXTERNAL_REQUEST_RESERVE=6;${body};return buildBoundedDeepCheckPlan;`)(v=>v==null?null:Number(v),compareOrdinaryDeepCandidates);
 const now=Date.now(),contract='BTW-USDT',prefilter={shortlist:[{contract,priority_rank:1}]};
 const states=[{contract_code:contract,last_completed_ts:now-60_000,last_started_ts:now-120_000,last_status:'COMPLETED'}];
 for(const mode of ['FULL_MANUAL','MANUAL_COIN','SCHEDULE','LIQUIDATION_ONLY']){
  const p=plan(prefilter,states,now,{...deepRuntimeOptions({actor:'GITHUB_ACTIONS',mode}),confirmed_scope_contracts:[contract],require_exact_contract:true,required_contract:contract,cooldown_sec:1800,bypass_cooldown:isFreshManualMainAnalysis(mode)});
  assert.equal(p.selected.length,['FULL_MANUAL','MANUAL_COIN'].includes(mode)?1:0,mode);
 }
 assert.match(worker,/strict_fresh_manual:isFreshManualMainAnalysis\(env\?\.REPORT2_MANUAL_MODE\)/);
 assert.match(worker,/force_fresh_manual:isFreshManualMainAnalysis\(env\?\.REPORT2_MANUAL_MODE\)/);
});
