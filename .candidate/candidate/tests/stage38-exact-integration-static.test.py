#!/usr/bin/env python3
import hashlib
import json
import re
import sys
from pathlib import Path

candidate = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent.parent / "src" / "worker.js"
baseline = Path(sys.argv[2]) if len(sys.argv) > 2 else None
s = candidate.read_text(encoding="utf-8")

checks = {
    "single_runtime_import": len(re.findall(r'from "\./fast-move-watch-runtime\.mjs"', s)) == 1,
    "single_prepare_wiring": s.count("await prepareFastMoveWatchCycle({") == 1,
    "single_finalize_wiring": s.count("await finalizeFastMoveWatchCycle({") == 1,
    "single_deep_observation_wiring": s.count("buildFastMoveDeepObservation({") == 1,
    "single_dataplane_summary_wiring": s.count("await fastMoveWatchDataPlaneSummary(env, now)") == 1,
    "stage38_version_constant_used": s.count("version:\n      FAST_MOVE_WATCH_VERSION") >= 2,
    "old_version_removed": "3.7.1-cross-venue-liquidation-shadow" not in s,
    "health_module": "fast_move_watch: true" in s,
    "adaptive_prefilter_reuses_existing_scheduler": "runBoundedDeepCheckScheduler(\n          adaptiveDiscoveryPrefilter" in s,
    "deep_check_cap_unchanged": "max_per_run:\n              1" in s,
    "shadow_safety": all(token in s for token in (
        "fast_move_watch_shadow_only = true",
        "fast_move_watch_live_probability_generated = false",
        "fast_move_watch_live_signal_generated = false",
        "fast_move_watch_validated_signal_generated = false",
        "fast_move_watch_telegram_dispatch_allowed = false",
        "fast_move_watch_trading_execution_allowed = false",
        "fast_move_watch_automatic_weight_tuning = false",
    )),
}

if baseline:
    b = baseline.read_text(encoding="utf-8")
    checks["baseline_worker_sha_exact"] = hashlib.sha256(baseline.read_bytes()).hexdigest() == "009744f88447bc42ac58f60140cf561f23b34eb75031d640d05e63178418d46a"
    for token in (
        "const SHADOW_DECISION_MODEL_API",
        "const SHADOW_OUTCOME_MODEL_API",
        "const FULL_EVIDENCE_CONTRACT_API",
        "const FULL_EVIDENCE_SHADOW_MODEL_API",
        "const LIQUIDATION_INTELLIGENCE_API",
        "async function sendTelegramMessage",
        "function validateAlertDispatch",
    ):
        checks[f"core_count_preserved:{token}"] = s.count(token) == b.count(token)

assert all(checks.values()), {k: v for k, v in checks.items() if not v}
print(json.dumps({"ok": True, "suite": "stage38-exact-integration-static", "checks": checks}, ensure_ascii=False, indent=2))

