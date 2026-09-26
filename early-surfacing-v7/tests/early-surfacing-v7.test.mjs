
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

test('same coarse early base produces different user interest scores when factual strength differs',async()=>{
  const {renderTzCompliantLifecycleMessage}=await import('../../runtime/src/v3-telegram-tz-formatter.mjs');
  const mk=(dc,pp)=>renderTzCompliantLifecycleMessage({
    now:100000,status:'OBSERVE',ticker:'TEST-USDT',direction:'LONG',
    lifecycle:{status:'OBSERVE',observation_ts:99500,valid_until_ts:110000},
    early:{early_detection_quality_0_100:64,lifecycle_stage:'DISCOVERY'},
    shadow:{direction_hint:'LONG',dc_long:dc,dq_status:'PARTIAL',evidence_flags_json:'{}'},
    feature:{evidence_json:JSON.stringify([{domain:'RELATIVE_STRENGTH',side:'LONG',
      btc_1h_pct_points:pp,eth_1h_pct_points:pp,btc_4h_pct_points:pp,eth_4h_pct_points:pp}])},
    opportunity:{event_json:'{}'},campaign:{},liquidation:{}
  });
  const a=mk(25,0.5),b=mk(75,4.0);
  assert.equal(a.ok,true);assert.equal(b.ok,true);
  const get=x=>Number(x.message.match(/Монета интересна: (\d+) из 100/)[1]);
  assert.notEqual(get(a),get(b));
  assert.ok(get(b)>get(a));
});
