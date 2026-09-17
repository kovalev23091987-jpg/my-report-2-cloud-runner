#!/usr/bin/env python3
"""Integrity and safety checks for the captured read-only HTX audit."""

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
EVIDENCE = ROOT / "evidence" / "HTX_LSK_STEEM_FACTUAL_AUDIT_20260913.json"
report = json.loads(EVIDENCE.read_text(encoding="utf-8"))

assert report["report_version"] == "htx-lsk-steem-factual-audit-v1"
assert "Official HTX public REST only" in report["source_policy"]
assert "No deploy" in report["mutation_policy"]

symbols = {row["symbol"]: row for row in report["symbols"]}
assert set(symbols) == {"LSK-USDT", "STEEM-USDT"}

for symbol, row in symbols.items():
    assert row["observed_ts"] > 0
    assert row["observed_utc"].endswith("Z")
    assert set(row["detected_events"]) == {"15m", "1h", "4h", "1d"}
    for source in row["source"].values():
        assert source["url"].startswith("https://api.hbdm.com/")
        if source["ok"]:
            assert source["http_status"] == 200
            assert re.fullmatch(r"[0-9a-f]{64}", source["response_sha256"])
            assert source["error"] is None
    integrated = row["integrated_shadow_summary"]
    assert integrated["raw_input_arrays_serialized"] is False
    safety = integrated["safety"]
    assert safety["shadow_only"] is True
    assert safety["live_probability"] is None
    assert safety["live_signal"] is False
    assert safety["validated_signal"] is False
    assert safety["decision_layer_changed"] is False
    assert safety["strategy_weights_changed"] is False
    assert safety["telegram_started"] is False
    assert safety["trading_execution"] is False
    assert safety["automatic_weight_tuning"] is False

lsk_cases = symbols["LSK-USDT"]["control_cases"]
assert lsk_cases["august_daily_anomaly"]["status"] == "NO_CONFIRMED_HISTORICAL_DATA"
assert lsk_cases["september_4h_anomaly"]["status"] == "NO_CONFIRMED_HISTORICAL_DATA"
assert all(
    value["report_phrase_ru"] == "нет подтверждённых исторических данных"
    for value in lsk_cases.values()
)

steem_case = symbols["STEEM-USDT"]["control_cases"]["full_steem_sequence"]
assert steem_case["status"] == "NO_CONFIRMED_HISTORICAL_DATA"
assert steem_case["report_phrase_ru"] == "нет подтверждённых исторических данных"

print(json.dumps({
    "ok": True,
    "suite": "htx-lsk-steem-evidence",
    "symbols": sorted(symbols),
    "read_only_sources": True,
    "current_price_substitution": False,
    "unsupported_claims_blocked": True,
}, ensure_ascii=False, indent=2))
