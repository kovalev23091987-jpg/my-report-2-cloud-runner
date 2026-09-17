#!/usr/bin/env python3
"""Static guards for Stage 3.9.1 Opportunity Integrity hardening."""

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
shadow_decision = (ROOT / "src" / "shadow-decision-model.mjs").read_text(encoding="utf-8")
migration = (ROOT / "migrations" / "20260913_opportunity_integrity_hardening_shadow.sql").read_text(encoding="utf-8")
combined = worker + "\n" + engine + "\n" + runtime + "\n" + shadow_decision + "\n" + migration

checks = {
    "single_opportunity_runtime_import": len(re.findall(r'from "\./opportunity-intelligence-runtime\.mjs"', worker)) == 1,
    "single_opportunity_cycle_wiring": worker.count("await runOpportunityShadowCycle({") == 1,
    "single_engine_module": worker.count("opportunity-intelligence-engine.mjs") == 0,
    "stage391_version": '"3.9.1-opportunity-integrity-hardening-shadow"' in engine,
    "schema_version_separated": all(token in engine + runtime for token in (
        "OPPORTUNITY_SCHEMA_VERSION",
        '"3.9-opportunity-intelligence-shadow"',
        "OPPORTUNITY_INTEGRITY_RULES_VERSION",
    )),
    "native_15m_outcome_source": "period=15min&size=2000" in worker and "fifteen_minute" in worker,
    "cvd_exact_trade_count": all(token in worker for token in (
        "factualMinuteTradeCount",
        "cvdDeltaQuality",
        "trade_count_exact_match",
        "exact_1m_bars",
        "rawTradeRecordIntegrity",
        "record_integrity",
        "raw_delta_is_diagnostic_only",
    )),
    "engine_blocks_incomplete_cvd": all(token in engine for token in (
        'quality?.status === "COMPLETE"',
        "complete_perp_raw_trades_vs_factual_1m_trade_count",
        "cvd_delta_reliable",
    )),
    "shadow_model_requires_full_cvd_conjunction": (
      worker.count("function verifiedCvdQuality") == 1 and
      shadow_decision.count("function verifiedCvdQuality") == 1 and
      all(token in worker and token in shadow_decision for token in (
        "verifiedCvdQuality",
        'quality?.status === "COMPLETE"',
        "quality?.trade_count_exact_match === true",
        "quality?.raw_record_integrity_complete === true",
        "quality?.record_integrity?.complete === true",
      ))
    ),
    "control_isolation": all(token in engine + runtime + migration for token in (
        "CONTROL_REJECTED_SIGNAL_SCAN_TRUNCATED",
        "CONTROL_SELECTED_MATURE_ISOLATED",
        "control_exclusion_ms",
        "CONTAMINATED_BY_LATER_DISCOVERED_SIGNAL",
        "OPPORTUNITY_CONTROL_INTEGRITY_VIOLATION",
        "OPPORTUNITY_INVALIDATION_MUTATED_FACTUAL_EVENT",
    )),
    "episode_dedup": all(token in engine + runtime + migration for token in (
        "deduplicateMarketMoveEvents",
        "related_signal_count",
        "independence_start_ts",
        "OPPORTUNITY_INDEPENDENCE_OVERLAP",
    )),
    "directionless_fail_closed": all(token in engine + runtime + migration for token in (
        "NO_TIMELY_PRECOMMITTED_DIRECTION",
        "directional_evaluation_eligible",
        "DIRECTIONLESS_MOVE_UP_NO_SIDE_SELECTED",
        "DIRECTIONLESS_SOURCE_CANNOT_BE_RETROFITTED_FROM_OBSERVATION_CONTEXT",
        "OPPORTUNITY_DIRECTIONLESS_RETROSPECTIVE_SCORE_FORBIDDEN",
    )),
    "outcome_exact_trajectory": all(token in engine + runtime + migration for token in (
        "trajectory_complete",
        "expected_bars",
        "observed_bars",
        "trajectory_coverage_pct",
        "source_start_ts",
        "source_end_ts",
        "source_bar_duration_ms",
        "OPPORTUNITY_INCOMPLETE_OUTCOME_CANNOT_CLOSE",
        "source_retention_deadline_ts=e.event_close_ts",
    )),
    "all_horizons": all(f'"{horizon}"' in engine for horizon in ("1h", "4h", "12h", "24h", "3d", "7d")),
    "bounded_retry_queue": all(token in runtime for token in (
        "next_attempt_ts",
        "source_retention_deadline_ts",
        "RETRY_MAX_MS",
        "MAX_OUTCOME_UPDATES_PER_DEEP_CHECK = 4",
    )),
    "bounded_d1": "MAX_OPPORTUNITY_D1_STATEMENTS_PER_DEEP_CHECK = 4" in runtime,
    "bounded_liquidation_provider_parse": all(token in worker for token in (
        "MAX_PROVIDER_GRAPH_NODES_SCANNED = 5000",
        "MAX_PROJECTED_RAW_ROWS_SCANNED = 2000",
        "MAX_PROJECTED_CLUSTERS_RETURNED = 500",
        'projectedStatus = "SOURCE_PAYLOAD_TRUNCATED"',
    )),
    "bounded_liquidation_state_persistence": all(token in worker for token in (
        "MAX_LIFECYCLE_STATE_ROWS = 80",
        "FROM json_each(?1)",
        "d1_statement_cap: 5",
    )),
    "bounded_htx_liquidation_tape": all(token in worker for token in (
        "MAX_HTX_LIQUIDATION_ROWS_PER_SIDE = 250",
        "MAX_HTX_LIQUIDATION_ROWS_PERSISTED = 500",
        '"PARTIAL_BOUNDED"',
        '"partial_bounded"',
    )),
    "shared_request_cache": all(token in worker for token in (
        "createPerDeepCheckFetchCache",
        "shared_fetch_cache",
        "unique_external_requests",
        "const DEEP_CHECK_EXTERNAL_REQUESTS = 39",
        "const SMART_MONEY_EXTERNAL_REQUESTS = 1",
        "const EXTERNAL_REQUEST_RESERVE = 6",
    )),
    "new_migration_present": "ALTER TABLE opportunity_shadow_event ADD COLUMN" in migration,
    "migration_no_row_rewrite": not re.search(
        r"(?im)^\s*(DROP|DELETE\s+FROM|UPDATE\s+\w|INSERT\s+INTO|REPLACE\s+INTO)\b",
        migration,
    ),
    "legacy_rows_unassessed": migration.count("LEGACY_STAGE39_UNASSESSED") >= 2,
    "missing_json_fields_fail_closed": migration.count(
        "COALESCE(json_extract(NEW.outcome_json"
    ) >= 18,
    "runtime_no_network": "fetch(" not in runtime,
    "runtime_no_telegram": "sendTelegram" not in runtime and "api.telegram.org" not in runtime,
    "no_live_probability": "live_probability: null" in engine,
    "no_live_signal": "live_signal: false" in engine,
    "no_validated_signal": "validated_signal: false" in engine,
    "no_trading_execution": "trading_execution: false" in engine,
    "no_automatic_weight_tuning": "automatic_weight_tuning: false" in engine,
    "historical_funnel_no_lookahead": "HISTORICAL_BACKFILL_HAS_NO_PRECOMMITTED_FUNNEL_STATE" in engine,
}

baseline_sha = None
if len(sys.argv) > 1:
    baseline_path = Path(sys.argv[1])
    baseline = baseline_path.read_text(encoding="utf-8")
    baseline_sha = hashlib.sha256(baseline_path.read_bytes()).hexdigest()
    checks["stage39_baseline_sha_exact"] = (
        baseline_sha == "767d7f936d5a908f19afd547fbdcc480ae5e3dffc46dfa6ee49351c13a43bf48"
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
        checks[f"stage39_core_count_preserved:{token}"] = worker.count(token) == baseline.count(token)
    for token in (
        "CROSS_EXCHANGE_DERIVATIVES: 35",
        "MARKET_STRENGTH_SPOT: 30",
        "SMART_MONEY_ONCHAIN: 20",
        "SUPPORTING_RISK: 15",
    ):
        checks[f"weight_unchanged:{token}"] = worker.count(token) == baseline.count(token) and worker.count(token) > 0

failed = [name for name, passed in checks.items() if not passed]
assert not failed, failed

print(json.dumps({
    "ok": True,
    "suite": "stage391-integrity-static",
    "baseline_stage39_sha256": baseline_sha,
    "candidate_worker_sha256": hashlib.sha256(worker_path.read_bytes()).hexdigest(),
    "checks": checks,
}, ensure_ascii=False, indent=2))
