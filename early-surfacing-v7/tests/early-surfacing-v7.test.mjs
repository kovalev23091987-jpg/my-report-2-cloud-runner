
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('V7 overlay proof preserves external Telegram layout and safety',()=>{
  const p=JSON.parse(fs.readFileSync('runtime/early-surfacing-v7-overlay-proof.json','utf8'));
  assert.equal(p.safety.telegram_template_layout_changed,false);
  assert.equal(p.safety.strategy_35_30_20_15_changed,false);
  assert.equal(p.safety.hard_gates_changed,false);
  assert.equal(p.safety.live_probability,false);
  assert.equal(p.safety.validated_signal,false);
  assert.equal(p.safety.automatic_execution,false);
  assert.ok(p.changed.some(x=>x.path==='src/v3-telegram-runtime.mjs'));
  assert.ok(p.changed.some(x=>x.path==='src/v3-telegram-tz-formatter.mjs'));
});

test('runtime contains unsent rearm and material refresh',()=>{
  const s=fs.readFileSync('runtime/src/v3-telegram-runtime.mjs','utf8');
  assert.match(s,/UNSENT_OBSERVATION_REARM/);
  assert.match(s,/MATERIAL_OBSERVATION_REFRESH/);
  assert.match(s,/PRE_ACTIVATION_BACKLOG_SUPPRESSED/);
});

test('formatter no longer exposes coarse early score directly as interest score',()=>{
  const s=fs.readFileSync('runtime/src/v3-telegram-tz-formatter.mjs','utf8');
  assert.match(s,/function evidenceStrengthScore/);
  assert.doesNotMatch(s,/const interest=fmtScore\(early\?\.early_detection_quality_0_100\)/);
  assert.match(s,/Общая оценка:/);
  assert.match(s,/Монета интересна:/);
  assert.match(s,/Готовность ко входу:/);
});
