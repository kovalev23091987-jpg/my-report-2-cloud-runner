import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {applyRuntimePolicyPatches} from '../runtime-policy-patches.mjs';

const original=`function buildEntryScenarioAnchor(campaign, config) {
  const phase = campaign?.current_phase;
  const direction = campaign?.direction;
  const entryPrice = finite(campaign?.entry_trigger_price);
  const baseLow = finite(campaign?.base_low);
  const baseHigh = finite(campaign?.base_high);
  const thresholdPct = phase === CAMPAIGN_PHASE.ENTRY_TRIGGER
    ? finite(config?.first_impulse_move_pct)
    : finite(config?.next_impulse_move_pct);
  if (thresholdPct === null || thresholdPct <= 0) return null;
  const targetPrice = direction === 'LONG'
    ? entryPrice * (1 + thresholdPct / 100)
    : entryPrice * (1 - thresholdPct / 100);
  return {
    target_basis: 'PRECOMMITTED_MULTI_WAVE_IMPULSE_THRESHOLD',
    targetPrice,
  };
}`;

test('runtime target uses measured structure and rejects sub-five-percent structure',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'report2-runtime-policy-test-'));
 try{
  const src=path.join(temp,'src');fs.mkdirSync(src,{recursive:true});
  const file=path.join(src,'multi-wave-campaign-engine.mjs');fs.writeFileSync(file,original);
  const result=applyRuntimePolicyPatches(temp);assert.equal(result.status,'CLOSED');
  const patched=fs.readFileSync(file,'utf8');
  assert.match(patched,/const thresholdPct = measuredBaseMovePct;/);
  assert.match(patched,/if \(thresholdPct < 5\) return null;/);
  assert.doesNotMatch(patched,/Math\.max\(configuredThresholdPct, measuredBaseMovePct\)/);
  assert.match(patched,/PRECOMMITTED_BASE_MEASURED_MOVE_AT_LEAST_5_PERCENT/);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
