#!/usr/bin/env python3
from pathlib import Path
import difflib, hashlib, json, re
ROOT=Path(__file__).resolve().parent.parent
BASE=ROOT/'worker_stage392_original.js'
CUR=ROOT/'worker_stage3931_original.js'
EXPECTED='a9d362141ad51481c809fbe4f0f10b8e5ecdd2700c7099fd7cedf564335d5852'
sha=lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(BASE)==EXPECTED,(sha(BASE),EXPECTED)
base=BASE.read_text(); cur=CUR.read_text(); assert base!=cur
# Sensitive old blocks must remain byte exact.
def block(text,a,b):
    i=text.index(a); j=text.index(b,i); return text[i:j]
for a,b,name in [
 ('async function sendTelegramMessage(env, text) {','/* MY_REPORT_2_SHADOW_DECISION_MODEL_INLINE_V1','telegram_sender'),
 ('function validateAlertDispatch(params) {','function alertDispatchFingerprint(params, gate) {','live_alert_gate'),
 ('      if (url.pathname === "/alert-dispatch") {','      if (url.pathname === "/telegram-test") {','live_alert_route'),
 ('      if (url.pathname === "/telegram-test") {','      const mode =','telegram_test_route'),
]:
    assert block(base,a,b)==block(cur,a,b),name
# New delta is only version marker, helper/read-only bridge, health marker and two manual routes.
sm=difflib.SequenceMatcher(a=base.splitlines(),b=cur.splitlines(),autojunk=False)
ops=[]
for tag,i1,i2,j1,j2 in sm.get_opcodes():
    if tag=='equal': continue
    chunk='\n'.join(cur.splitlines()[j1:j2])
    ops.append({'tag':tag,'base':[i1+1,max(i2,i1+1)],'current':[j1+1,j2]})
    allowed=any(x in chunk for x in [
      'TELEGRAM_SHADOW_BRIDGE_VERSION','TELEGRAM_SHADOW_BODYFIX_VERSION','telegramShadowAuthOk','loadStage392TelegramShadowDecision',
      'telegram_shadow_bridge_version','telegram_shadow_bodyfix_version','telegram_shadow_preview','/telegram-shadow-preview','/telegram-shadow-test'
    ])
    assert allowed,(tag,i1,i2,j1,j2,chunk[:300])
# Fail-closed safety.
for literal in ['telegram_shadow_auto_dispatch: false','live_probability: false','live_signal: false','validated_signal: false','trading_execution: false','automatic_dispatch: false']:
    assert literal in cur,literal
new_region=block(cur,'function telegramShadowAuthOk','function validateAlertDispatch(params) {')
assert 'INSERT ' not in new_region and 'UPDATE ' not in new_region and 'DELETE ' not in new_region and '.run(' not in new_region
# Existing live route still requires validated=true and >=70 and is not called by new bridge.
assert 'if (!validated)' in block(cur,'function validateAlertDispatch','function alertDispatchFingerprint')
assert 'probability < 70' in block(cur,'function validateAlertDispatch','function alertDispatchFingerprint')
assert 'wrangler deploy' not in cur
print(json.dumps({'ok':True,'suite':'stage393-telegram-shadow-isolation','base_stage392_sha256':sha(BASE),'candidate_sha256':sha(CUR),'diff_opcode_count':len(ops),'old_telegram_sender_byte_exact':True,'old_live_alert_route_byte_exact':True,'automatic_dispatch':False,'remote_d1_write_added':False},indent=2))
