import fs from 'node:fs';
import path from 'node:path';

function replaceOnce(source,before,after,label){
 const first=source.indexOf(before);if(first<0){const applied=source.indexOf(after);if(applied>=0&&source.indexOf(after,applied+after.length)<0)return source;throw new Error(`CURRENT_GENERATION_POLICY_PATCH_MISSING:${label}`);}
 if(source.indexOf(before,first+before.length)>=0)throw new Error(`CURRENT_GENERATION_POLICY_PATCH_AMBIGUOUS:${label}`);
 return source.slice(0,first)+after+source.slice(first+before.length);
}

export function applyRuntimePolicyPatches(runtime){
 const file=path.join(runtime,'src/multi-wave-campaign-engine.mjs');
 let source=fs.readFileSync(file,'utf8');
 source=replaceOnce(source,`  const thresholdPct = phase === CAMPAIGN_PHASE.ENTRY_TRIGGER
    ? finite(config?.first_impulse_move_pct)
    : finite(config?.next_impulse_move_pct);
  if (thresholdPct === null || thresholdPct <= 0) return null;
  const targetPrice = direction === 'LONG'
    ? entryPrice * (1 + thresholdPct / 100)
    : entryPrice * (1 - thresholdPct / 100);`,`  const configuredThresholdPct = phase === CAMPAIGN_PHASE.ENTRY_TRIGGER
    ? finite(config?.first_impulse_move_pct)
    : finite(config?.next_impulse_move_pct);
  const measuredBaseMovePct = (baseHigh - baseLow) / entryPrice * 100;
  if (configuredThresholdPct === null || configuredThresholdPct <= 0 || !Number.isFinite(measuredBaseMovePct)) return null;
  // Five percent is a reportability filter, never a fabricated target. The
  // target exists only when the prospectively measured base itself supports it.
  // The configured impulse threshold still controls phase transitions, but it
  // cannot stretch the displayed target beyond measured market structure.
  const thresholdPct = measuredBaseMovePct;
  if (thresholdPct < 5) return null;
  const targetPrice = direction === 'LONG'
    ? entryPrice * (1 + thresholdPct / 100)
    : entryPrice * (1 - thresholdPct / 100);`,'MEASURED_BASE_TARGET');
 source=replaceOnce(source,`    target_basis: 'PRECOMMITTED_MULTI_WAVE_IMPULSE_THRESHOLD',`,`    target_basis: 'PRECOMMITTED_BASE_MEASURED_MOVE_AT_LEAST_5_PERCENT',`,'MEASURED_BASE_TARGET_BASIS');
 fs.writeFileSync(file,source);
 return {status:'CLOSED',patched:['src/multi-wave-campaign-engine.mjs'],minimum_reportable_move_pct:5,target_basis:'PRECOMMITTED_MEASURED_BASE'};
}

export default{applyRuntimePolicyPatches};
