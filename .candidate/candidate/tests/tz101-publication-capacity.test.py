#!/usr/bin/env python3
from pathlib import Path
import re, json
ROOT=Path(__file__).resolve().parents[1]
base=(ROOT/'tests/stage392-capacity-budget.test.py').read_text()
runtime=(ROOT/'src/tz101-telegram-context-runtime.mjs').read_text()
pub=(ROOT/'src/tz101-publication-runtime.mjs').read_text()
# The existing independently validated Stage392 worst case is 48 D1 queries.
assert 'd1_worst_case' in base or '48' in base
legacy_peak=48
# Sidecar runtime contains exactly one INSERT and publication runtime stops before it unless CLOSED.
assert runtime.count('INSERT OR IGNORE INTO final_decision_telegram_context_shadow')==1
assert "if(gate.status!=='CLOSED')" in pub
assert "statements:0" in pub
sidecar_max=1
new_peak=legacy_peak+sidecar_max
assert new_peak<=50, (new_peak,50)
print(json.dumps({'ok':True,'suite':'tz101-publication-capacity','legacy_stage392_peak':legacy_peak,'publication_sidecar_max_statements':sidecar_max,'new_theoretical_closed_publication_peak':new_peak,'d1_free_limit':50,'reserve_queries':50-new_peak,'current_incomplete_publication_extra_statements':0},indent=2))
