#!/usr/bin/env python3
from pathlib import Path
import difflib, hashlib, json
ROOT=Path(__file__).resolve().parent.parent
BASE=ROOT/'worker_stage3931_original.js'
CUR=ROOT/'src/worker.js'
EXPECTED='14658f8fbcbb29b060fd1db4f68cb3c0142186a07c0c5c7a44274a22d2b6e0fc'
sha=lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(BASE)==EXPECTED,(sha(BASE),EXPECTED)
base=BASE.read_text(); cur=CUR.read_text(); assert base!=cur
allowed=[
 (1000,1110,'htx_snapshot_execution_closure'),
 (3600,4070,'stage0_history_compact_telemetry'),
 (4950,5225,'stage0_prepersist_discovery_telemetry'),
 (5200,5820,'discovery_prefilter_recall'),
 (10650,11080,'shadow_decision_execution_contract'),
 (11240,11320,'public_evidence_alias_status_fix'),
 (11630,11920,'public_evidence_asset_identity_closure'),
 (12180,12390,'full_evidence_execution_chain2_contract'),
 (16440,16540,'cron_discovery_options'),
]
changes=[]
for tag,i1,i2,j1,j2 in difflib.SequenceMatcher(a=base.splitlines(),b=cur.splitlines(),autojunk=False).get_opcodes():
    if tag=='equal': continue
    lo,hi=i1+1,max(i2,i1+1)
    names=[name for a,b,name in allowed if lo>=a and hi<=b]
    assert names,f'unauthorized 3.9.3.1 recall diff {tag} base[{lo}:{hi}] current[{j1+1}:{j2}]'
    changes.append({'tag':tag,'base':[lo,hi],'current':[j1+1,j2],'surface':names[0]})
# Network / D1 call sites are unchanged from 3.9.3.1.
assert cur.count('fetchJson(')==base.count('fetchJson(')
assert cur.count('.prepare(')==base.count('.prepare(')
assert cur.count('DATA_DB.batch(')==base.count('DATA_DB.batch(')
# Preserve Telegram 3.9.3.1 byte-exact blocks.
def block(text,a,b):
    i=text.index(a); j=text.index(b,i); return text[i:j]
for a,b,name in [
 ('async function sendTelegramMessage(env, text) {','/* MY_REPORT_2_SHADOW_DECISION_MODEL_INLINE_V1','telegram_sender'),
 ('function telegramShadowAuthOk','function validateAlertDispatch(params) {','telegram_shadow_bridge'),
 ('      if (url.pathname === "/telegram-shadow-preview") {','      if (url.pathname === "/alert-dispatch") {','telegram_shadow_routes'),
 ('      if (url.pathname === "/alert-dispatch") {','      if (url.pathname === "/telegram-test") {','live_alert_route'),
]:
    assert block(base,a,b)==block(cur,a,b),name
for required in [
 '3.9.3.1-telegram-shadow-bodyfix',
 'telegram_shadow_auto_dispatch: false',
 'MULTI_ENGINE_RECALL_SHADOW_V1',
 'FALSE_NEGATIVE_CANDIDATE',
 'const identityBlocked = Boolean(aliasRequired && !aliasVerified);',
 'HTX is the primary execution venue and counts as one factual venue in cross-exchange funding verification.',
]: assert required in cur,required
for forbidden in ['validated_signal: true','live_signal: true','trading_execution: true','automatic_weight_tuning: true']:
    assert cur.count(forbidden)<=base.count(forbidden),forbidden
print(json.dumps({
 'ok':True,'suite':'stage3931-recall-preservation-isolation',
 'base_stage3931_sha256':sha(BASE),'candidate_sha256':sha(CUR),
 'authorized_surfaces':sorted({x['surface'] for x in changes}),
 'fetch_json_call_sites':cur.count('fetchJson('),'d1_prepare_call_sites':cur.count('.prepare('),'d1_batch_call_sites':cur.count('DATA_DB.batch('),
 'telegram_3931_byte_exact':True,'production_deploy_performed':False,
},indent=2))
