from pathlib import Path
import re, hashlib
root=Path(__file__).resolve().parents[1]
new=(root/'worker_stage3931_original.js').read_text()
old=(root/'worker_stage392_original.js').read_text()

def between(s,a,b):
    i=s.index(a); j=s.index(b,i); return s[i:j]
# Existing transport and real alert dispatch must stay byte-exact.
for a,b,name in [
    ('async function sendTelegramMessage(env, text) {','/* MY_REPORT_2_SHADOW_DECISION_MODEL_INLINE_V1','sender'),
    ('      if (url.pathname === "/alert-dispatch") {','      if (url.pathname === "/telegram-test") {','alert_dispatch'),
    ('function validateAlertDispatch(params) {','function alertDispatchFingerprint(params, gate) {','alert_gate'),
]:
    assert between(new,a,b)==between(old,a,b), name
assert '3.9.3-telegram-shadow-bridge' in new
assert 'telegram_shadow_auto_dispatch: false' in new
assert '/telegram-shadow-preview' in new and '/telegram-shadow-test' in new
block=between(new,'async function loadStage392TelegramShadowDecision','function validateAlertDispatch(params) {')
assert 'SELECT decision_id' in block
for forbidden in ['INSERT ','UPDATE ','DELETE ','.run()']:
    assert forbidden not in block, forbidden
# New test route may call sender only after explicit confirmation.
route=between(new,'      if (url.pathname === "/telegram-shadow-test") {','      if (url.pathname === "/alert-dispatch") {')
assert 'SEND_SHADOW_TEST' in route
assert 'sendTelegramMessage(env, preview.message)' in route
assert 'automatic_dispatch: false' in route
# No changes to strategy/live/trading constants are introduced by the delta.
delta='\n'.join(__import__('difflib').unified_diff(old.splitlines(),new.splitlines()))
for forbidden in ['validated_signal: true','live_signal: true','trading_execution: true','automatic_weight_tuning: true']:
    assert forbidden not in delta, forbidden
print('TELEGRAM_STAGE392_STATIC=PASS')
