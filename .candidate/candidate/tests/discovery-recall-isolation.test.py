#!/usr/bin/env python3
from __future__ import annotations
import difflib, hashlib, json, re
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
BASE=ROOT/'src'/'worker.BACKUP-stage392-authoritative-before-discovery-recall.js'
CUR=ROOT/'src'/'worker.js'
EXPECTED='a9d362141ad51481c809fbe4f0f10b8e5ecdd2700c7099fd7cedf564335d5852'
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(BASE)==EXPECTED,(sha(BASE),EXPECTED)
base=BASE.read_text(); cur=CUR.read_text(); assert cur!=base
allowed=[
 (1000,1100,'htx_snapshot_execution_closure'),
 (3600,4050,'stage0_history_compact_telemetry'),
 (4950,5050,'stage0_prepersist_discovery_telemetry'),
 (5200,5820,'discovery_prefilter_recall'),
 (10650,11050,'shadow_decision_execution_contract'),
 (11240,11310,'public_evidence_alias_status_fix'),
 (11630,11880,'public_evidence_asset_identity_closure'),
 (12180,12380,'full_evidence_execution_chain2_contract'),
 (16280,16360,'cron_discovery_options'),
]
changes=[]
for tag,i1,i2,j1,j2 in difflib.SequenceMatcher(a=base.splitlines(),b=cur.splitlines(),autojunk=False).get_opcodes():
    if tag=='equal': continue
    lo,hi=i1+1,max(i2,i1+1)
    names=[name for a,b,name in allowed if lo>=a and hi<=b]
    assert names, f'unauthorized Discovery Recall worker diff {tag} base[{lo}:{hi}] new[{j1+1}:{j2}]'
    changes.append({'tag':tag,'base':[lo,hi],'new':[j1+1,j2],'surface':names[0]})

# Hard safety: network and D1 call sites must not increase.
assert cur.count('fetchJson(')==base.count('fetchJson('), (cur.count('fetchJson('),base.count('fetchJson('))
assert cur.count('.prepare(')==base.count('.prepare('), (cur.count('.prepare('),base.count('.prepare('))
assert cur.count('DATA_DB.batch(')==base.count('DATA_DB.batch(')

# Existing execution budget/caps must remain byte-value equivalent.
for literal in [
 'const STAGE0_EXTERNAL_REQUESTS = 4;',
 'const DEEP_CHECK_EXTERNAL_REQUESTS = 39;',
 'const WORKERS_FREE_EXTERNAL_LIMIT = 50;',
 'max_per_run:\n              1,',
 'live_probability: null',
 'live_signal: false',
 'validated_signal: false',
 'trading_execution: false',
 'automatic_weight_tuning: false',
 'strategy_weights_changed: false',
 '3.9.2-final-decision-shadow-lifecycle-hardening',
]:
    assert literal in cur, f'missing/changed safety literal: {literal}'

# Telegram implementation remains byte-identical.
def block(text,start,end):
    a=text.index(start); b=text.index(end,a); return text[a:b]
start='async function sendTelegramMessage'
end='/* MY_REPORT_2_SHADOW_DECISION_MODEL_INLINE_V1'
assert block(base,start,end)==block(cur,start,end),'Telegram block changed'

# Final Decision engine files are not embedded/rewritten by this patch.
for forbidden in [
 'validated: true',
 'wrangler deploy',
 'executeTrade(',
 'placeOrder(',
]:
    # validated:true exists elsewhere in historical source; only ensure it was not newly added.
    assert cur.count(forbidden) <= base.count(forbidden), f'new forbidden behavior: {forbidden}'

# Explicit shadow semantics must be present.
for required in [
 'MULTI_ENGINE_RECALL_SHADOW_V1',
 'DISCOVERY_ONLY_NOT_PROBABILITY_NOT_TRADE_SIGNAL',
 'FALSE_NEGATIVE_CANDIDATE',
 'stage0-compact-v2',
 'negative_funding_hourly_tail_threshold_pct',
 'positive_funding_hourly_tail_threshold_pct',
]:
    assert required in cur, f'missing recall marker: {required}'

# Execution closure may use factual depth BBO when dedicated BBO is rate-limited,
# but exact-window CVD remains separate and fail-closed.
for required in [
 'htx_futures_order_flow_sample',
 'htx_futures_order_flow: "not_closed"',
 'exact_window_cvd_closed',
 'buy_fill_ratio_pct',
 'sell_fill_ratio_pct',
 'execution closure does not synthesize missing CVD',
 'promoteCorroboratedAssetIdentity',
 'const identityBlocked = Boolean(aliasRequired && !aliasVerified);',
 'eligible_for_chain_closure: !identityBlocked && status === "CLOSED" && !aliasRequired,',
 'HTX is the primary execution venue and counts as one factual venue in cross-exchange funding verification.',
 'HTX funding or factual settlement interval is missing; not eligible for cross-venue funding closure.',
]:
    assert required in cur, f'missing execution-closure safety marker: {required}'

print(json.dumps({
 'ok':True,
 'suite':'discovery-recall-isolation',
 'authoritative_stage392_sha256':sha(BASE),
 'candidate_worker_sha256':sha(CUR),
 'authorized_surfaces':sorted({x['surface'] for x in changes}),
 'diff_opcode_count':len(changes),
 'fetch_json_call_sites_unchanged':cur.count('fetchJson('),
 'd1_prepare_call_sites_unchanged':cur.count('.prepare('),
 'd1_batch_call_sites_unchanged':cur.count('DATA_DB.batch('),
 'max_deep_check_per_cycle':1,
 'telegram_changed':False,
 'live_probability':False,
 'live_signal':False,
 'validated_signal':False,
 'trading_execution':False,
 'automatic_weight_tuning':False,
 'strategy_weights_changed':False,
 'production_deploy_performed':False,
},indent=2))
