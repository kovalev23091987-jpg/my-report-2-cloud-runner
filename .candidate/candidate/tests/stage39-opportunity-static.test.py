#!/usr/bin/env python3
"""Static integration guard for the local Stage 3.9 shadow candidate."""

import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
worker_path = ROOT / "src" / "worker.js"
worker = worker_path.read_text(encoding="utf-8")
engine = (ROOT / "src" / "opportunity-intelligence-engine.mjs").read_text(encoding="utf-8")
runtime = (ROOT / "src" / "opportunity-intelligence-runtime.mjs").read_text(encoding="utf-8")
migration = (ROOT / "migrations" / "20260913_opportunity_intelligence_shadow.sql").read_text(encoding="utf-8")
combined = engine + "\n" + runtime

checks = {
    "single_opportunity_runtime_import": len(re.findall(r'from "\./opportunity-intelligence-runtime\.mjs"', worker)) == 1,
    "single_opportunity_cycle_wiring": worker.count("await runOpportunityShadowCycle({") == 1,
    "single_opportunity_dataplane_wiring": worker.count("await opportunityDataPlaneSummary(") == 1,
    "health_exposes_candidate": "candidate_version:\n            OPPORTUNITY_VERSION" in worker,
    "health_exposes_module": "opportunity_intelligence_shadow: true" in worker,
    "deep_check_returns_shadow_module": "opportunity_intelligence_shadow:\n      opportunityIntelligence" in worker,
    "internal_raw_series_not_api_payload": all(token in worker for token in (
        '"_opportunity_shadow_inputs"',
        "enumerable: false",
        '"_opportunity_hourly_candles"',
    )),
    "htx_native_1h_candles": worker.count("period=60min&size=2000") == 1,
    "htx_native_1d_candles": worker.count("period=1day&size=200") == 1,
    "htx_daily_session_alignment": all(token in engine for token in (
        "HTX_DAILY_ALIGNMENT_OFFSET_MS = 16 * 60 * 60 * 1000",
        "alignment_offset_ms: HTX_DAILY_ALIGNMENT_OFFSET_MS",
    )),
    "bounded_timeframe_fairness": all(token in engine for token in (
        "selectBoundedFairEvents",
        '["1d", "4h", "1h", "15m"]',
    )),
    "honest_deep_request_budget": all(token in worker for token in (
        "const STAGE0_EXTERNAL_REQUESTS = 4",
        "const DEEP_CHECK_EXTERNAL_REQUESTS = 41",
        "const WORKERS_FREE_EXTERNAL_LIMIT = 50",
        "const EXTERNAL_REQUEST_RESERVE = 5",
        "resource_max_per_run",
    )),
    "exact_bounded_contract_required": all(token in worker for token in (
        "require_exact_contract:\n              true",
        "journalMaintenanceSelected",
        "?.selected_contract",
        "?.selected_leases?.[0]",
        "run_id:\n          runId",
    )),
    "bounded_long_horizon_journal": all(token in worker + runtime for token in (
        "selectOpportunityJournalCandidate",
        "buildOpportunityJournalPrefilter",
        "OPPORTUNITY_JOURNAL_SLOT_MODULUS = 4",
        "maximum_share_of_regular_cron_slots",
    )),
    "anomaly_timeframes": all(f'"{tf}"' in engine for tf in ("1m", "5m", "15m", "1h", "4h", "1d")),
    "post_event_horizons": all(f'"{tf}"' in engine for tf in ("1h", "4h", "12h", "24h", "3d", "7d")),
    "four_competing_hypotheses": all(token in engine for token in (
        "ABSORPTION_ACCUMULATION",
        "DISTRIBUTION",
        "TWO_WAY_TRANSFER",
        "DERIVATIVE_LIQUIDATION_NOISE",
    )),
    "liquidity_and_oi_detectors": all(token in engine for token in (
        "detectStopPools",
        "detectLiquiditySweep",
        "classifyPriceOiMatrix",
        "detectOiFlushRebuild",
        "POST_FLUSH_REBUILD_RECLAIM_SETUP_SHADOW",
    )),
    "quality_states": all(f'"{status}"' in engine for status in ("OK", "PARTIAL", "STALE", "MISSING", "CONFLICTING")),
    "outcome_missing_phrase": "нет подтверждённых исторических данных" in runtime,
    "bounded_outcomes": "MAX_OUTCOME_UPDATES_PER_DEEP_CHECK = 4" in runtime,
    "bounded_d1_statements": "MAX_OPPORTUNITY_D1_STATEMENTS_PER_DEEP_CHECK = 4" in runtime,
    "migration_additive": all(token in migration for token in (
        "CREATE TABLE IF NOT EXISTS opportunity_shadow_event",
        "CREATE TABLE IF NOT EXISTS opportunity_shadow_outcome",
        "CREATE TABLE IF NOT EXISTS opportunity_shadow_funnel",
    )),
    "runtime_has_no_network": "fetch(" not in runtime,
    "runtime_has_no_telegram_sender": "sendTelegram" not in runtime and "api.telegram.org" not in runtime,
    "runtime_has_no_order_execution": "placeOrder" not in combined and "trading_execution: true" not in combined,
    "immutable_shadow_safety": all(token in engine for token in (
        "live_probability: null",
        "live_signal: false",
        "validated_signal: false",
        "decision_layer_changed: false",
        "strategy_weights_changed: false",
        "fixed_weights_35_30_20_15_unchanged: true",
        "telegram_started: false",
        "trading_execution: false",
        "automatic_weight_tuning: false",
    )),
    "factual_lsk_steem_audit_tool_present": (
        ROOT / "tools" / "audit_htx_lsk_steem_history.mjs"
    ).is_file(),
}

if len(sys.argv) > 1:
    baseline_path = Path(sys.argv[1])
    baseline = baseline_path.read_text(encoding="utf-8")
    checks["stage381_baseline_sha_exact"] = (
        hashlib.sha256(baseline_path.read_bytes()).hexdigest()
        == "e3e57d62cf3dffd8eea1d2cd8be49d60d78b910c33d7492c4693ccbf1e28125c"
    )
    for token in (
        "const SHADOW_DECISION_MODEL_API",
        "const SHADOW_OUTCOME_MODEL_API",
        "const FULL_EVIDENCE_CONTRACT_API",
        "const FULL_EVIDENCE_SHADOW_MODEL_API",
        "const LIQUIDATION_INTELLIGENCE_API",
        "async function sendTelegramMessage",
        "function validateAlertDispatch",
    ):
        checks[f"baseline_core_count_preserved:{token}"] = worker.count(token) == baseline.count(token)
    for token in (
        "CROSS_EXCHANGE_DERIVATIVES: 35",
        "MARKET_STRENGTH_SPOT: 30",
        "SMART_MONEY_ONCHAIN: 20",
        "SUPPORTING_RISK: 15",
    ):
        checks[f"weight_unchanged:{token}"] = worker.count(token) == baseline.count(token) and worker.count(token) > 0

failed = {key: value for key, value in checks.items() if not value}
assert not failed, failed

print(json.dumps({
    "ok": True,
    "suite": "stage39-opportunity-static",
    "candidate_worker_sha256": hashlib.sha256(worker_path.read_bytes()).hexdigest(),
    "checks": checks,
}, ensure_ascii=False, indent=2))
