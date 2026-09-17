#!/usr/bin/env python3
"""Static capacity contract for the bounded Stage 3.9.1 cron path."""

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
worker = (ROOT / "src" / "worker.js").read_text(encoding="utf-8")
opportunity = (ROOT / "src" / "opportunity-intelligence-runtime.mjs").read_text(encoding="utf-8")
multi_wave = (ROOT / "src" / "multi-wave-campaign-runtime.mjs").read_text(encoding="utf-8")
fast_move = (ROOT / "src" / "fast-move-watch-engine.mjs").read_text(encoding="utf-8")


def constant(source, name):
    match = re.search(rf"\b{name}\s*=\s*(\d+)", source)
    assert match, f"missing capacity constant: {name}"
    return int(match.group(1))


official_limits = {
    "workers_free_external_subrequests": 50,
    "d1_free_queries_per_worker_invocation": 50,
    "d1_paid_queries_per_worker_invocation": 1000,
    "d1_bound_parameters_per_query": 100,
}

# Worst-case call-graph ledger for a normal cron that actually attempts one
# Deep Check. Batch entries count individually because D1 counts each query.
ledger = {
    "cron_started_and_terminal_journal": 2,
    "stage0_history_reads_and_compact_persistence": 6,
    "opportunity_journal_selection": 1,
    "fast_move_bounded_reads": 6,
    "fast_move_prepare_plus_finalize_writes": 8,
    "deep_check_scheduler_reserve_and_journal": 5,
    "deep_check_shadow_reads_and_writes": 17,
    "multi_wave_campaign_shadow": 3,
}
calculated_path = sum(ledger.values())
assert calculated_path == 48, calculated_path

conservative_budget = constant(worker, "CONSERVATIVE_DEEP_CHECK_D1_QUERY_BUDGET")
free_limit = constant(worker, "D1_FREE_QUERY_LIMIT")
legacy_sweep = constant(worker, "LEGACY_OUTCOME_SWEEP_MAX_D1_QUERIES")
assert conservative_budget == 48
assert free_limit == official_limits["d1_free_queries_per_worker_invocation"]
assert calculated_path <= conservative_budget <= free_limit
assert conservative_budget + legacy_sweep > free_limit

assert "deepCheckAttemptedForD1Budget" in worker
assert "DEFERRED_D1_FREE_QUERY_BUDGET" in worker
assert "MAX_HTX_LIQUIDATION_ROWS_PERSISTED = 500" in worker
assert "MAX_TRADE_CONTAINERS_SCANNED = 2500" in worker
assert "MAX_RAW_TRADES_FLATTENED = 10000" in worker
assert "source_truncated" in worker
assert "source_rows_dropped" in worker
assert "FROM json_each(?1)" in worker
assert "MAX_OPPORTUNITY_D1_STATEMENTS_PER_DEEP_CHECK = 4" in opportunity
assert "MAX_MULTI_WAVE_D1_QUERIES_PER_DEEP_CHECK = 3" in multi_wave
assert "MAX_MULTI_WAVE_D1_WRITE_STATEMENTS_PER_DEEP_CHECK = 2" in multi_wave
assert "MAX_OUTCOME_UPDATES_PER_DEEP_CHECK = 4" in opportunity
assert "MAX_ADMISSION_STATE_ROWS = 512" in opportunity
assert "ADMISSION_STATE_SCAN_TRUNCATED_FAIL_CLOSED" in opportunity
assert "FROM json_each(?1)" in opportunity
assert ").bind(json(payload, []))" in opportunity
assert "max_d1_writes_per_cycle: 8" in fast_move

external_stage0 = constant(worker, "STAGE0_EXTERNAL_REQUESTS")
external_deep_check = constant(worker, "DEEP_CHECK_EXTERNAL_REQUESTS")
external_smart_money = constant(worker, "SMART_MONEY_EXTERNAL_REQUESTS")
external_reserve = constant(worker, "EXTERNAL_REQUEST_RESERVE")
assert external_stage0 + external_deep_check + external_smart_money + external_reserve == 50
assert "DEEP_CHECK_EXTERNAL_REQUEST_CAP_EXCEEDED_FAIL_CLOSED" in worker
assert "uniqueExternalRequests >= requestCap" in worker

print(json.dumps({
    "ok": True,
    "suite": "stage391-capacity-budget",
    "official_limits": official_limits,
    "d1_query_ledger": ledger,
    "calculated_deep_check_path": calculated_path,
    "conservative_deep_check_budget": conservative_budget,
    "legacy_sweep_max_queries": legacy_sweep,
    "legacy_sweep_deferred_when_deep_check_attempted": True,
    "d1_free_reserve_queries": free_limit - conservative_budget,
    "external_request_budget": {
        "stage0": external_stage0,
        "deep_check": external_deep_check,
        "smart_money": external_smart_money,
        "reserve": external_reserve,
        "total": external_stage0 + external_deep_check + external_smart_money + external_reserve,
    },
    "source": "https://developers.cloudflare.com/d1/platform/limits/",
}, ensure_ascii=False, indent=2))
