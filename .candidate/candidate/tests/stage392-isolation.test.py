#!/usr/bin/env python3
"""Stage 3.9.2 SHADOW isolation audit against the authoritative deployed Worker."""
from __future__ import annotations
import difflib, hashlib, json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE = ROOT / "audit_baseline" / "worker-stage391-multi-wave-authoritative.js"
CUR = ROOT / "src" / "worker.js"
EXPECTED_BASE_SHA = "4afeda8be571fbe18aba47c0c41c623cc02eb88388f3287f3025a7ba9f441a49"

def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(BASE) == EXPECTED_BASE_SHA, (sha(BASE), EXPECTED_BASE_SHA)
base = BASE.read_text(encoding="utf-8")
cur = CUR.read_text(encoding="utf-8")
assert cur != base

# Only five pre-authorized Stage 3.9.2 Worker surfaces may differ. Ranges are
# baseline line coordinates and deliberately broad enough for the complete
# function / integration blocks while excluding unrelated strategy/Telegram code.
allowed = [
    (1, 40, "imports"),
    (12520, 12690, "full_evidence_persistence"),
    (14430, 14540, "deep_check_shadow_sidecar"),
    (15380, 15410, "health_stage392_version_marker"),
    (16600, 16675, "bounded_idle_maintenance"),
]
sm = difflib.SequenceMatcher(a=base.splitlines(), b=cur.splitlines(), autojunk=False)
changed=[]
for tag,i1,i2,j1,j2 in sm.get_opcodes():
    if tag == "equal": continue
    # insert opcodes have i1==i2; pin them to the insertion coordinate.
    lo, hi = i1+1, max(i2, i1+1)
    names=[name for a,b,name in allowed if lo >= a and hi <= b]
    assert names, f"unauthorized Worker diff {tag} base[{lo}:{hi}] current[{j1+1}:{j2}]"
    changed.append({"tag":tag,"base":[lo,hi],"current":[j1+1,j2],"surface":names[0]})


assert '3.9.2-final-decision-shadow-lifecycle-hardening' in cur, 'missing exact Stage392 health version marker'

# Historical public decision remains deliberately inert. Final Decision is not
# allowed to replace the externally visible decision contract in Stage 3.9.2.
assert re.search(r"decision\s*:\s*\{\s*validated\s*:\s*false\s*,\s*probability\s*:\s*null\s*,\s*direction\s*:\s*null\s*,\s*status\s*:\s*\"NOT_EVALUATED\"", cur, re.S)

# Safety-sensitive production mechanisms must remain byte-identical by named
# blocks outside the allowed diff surfaces. Extract the Telegram dispatch block
# and key strategy constants from both versions and compare exact text/value.
def block(text, start_marker, end_marker):
    a=text.index(start_marker); b=text.index(end_marker,a)
    return text[a:b]
for start,end in [
    ("async function sendTelegramMessage", "/* MY_REPORT_2_SHADOW_DECISION_MODEL_INLINE_V1"),
]:
    # Only compare when markers exist in this release; fail loud if one vanishes.
    assert start in base and end in base and start in cur and end in cur
    assert block(base,start,end) == block(cur,start,end), f"production-sensitive block changed: {start}"

for literal in [
    "SHADOW_ONLY_NO_EXECUTION",
    "live_probability: null",
    "live_signal: false",
    "validated_signal: false",
    "telegram_started: false",
    "trading_execution: false",
    "automatic_weight_tuning: false",
    "strategy_weights_changed: false",
]:
    assert literal in cur, f"missing Stage392 safety fuse: {literal}"

# Sidecar must not call Telegram or execution helpers inside its bounded region.
sidecar_start = cur.index("// Stage 3.9.2 SHADOW proof wiring")
sidecar_end = cur.index("return {", sidecar_start)
sidecar = cur[sidecar_start:sidecar_end]
for forbidden in ["sendTelegram", "dispatchTelegram", "executeTrade", "placeOrder", "validated: true", "live_probability:"]:
    assert forbidden not in sidecar, f"forbidden sidecar behavior: {forbidden}"

# No deploy command is embedded in Worker source.
assert "wrangler deploy" not in cur

print(json.dumps({
    "ok": True,
    "suite": "stage392-isolation",
    "authoritative_base_sha256": sha(BASE),
    "candidate_worker_sha256": sha(CUR),
    "authorized_worker_diff_surfaces": sorted({x['surface'] for x in changed}),
    "diff_opcode_count": len(changed),
    "legacy_public_decision": "NOT_EVALUATED",
    "telegram_changed": False,
    "live_probability": False,
    "live_signal": False,
    "validated_signal": False,
    "trading_execution": False,
    "automatic_weight_tuning": False,
    "production_deploy_performed": False,
}, indent=2))
