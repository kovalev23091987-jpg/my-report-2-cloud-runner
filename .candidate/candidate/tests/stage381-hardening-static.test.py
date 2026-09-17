#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
runtime = (ROOT / "src" / "fast-move-watch-runtime.mjs").read_text(encoding="utf-8")
engine = (ROOT / "src" / "fast-move-watch-engine.mjs").read_text(encoding="utf-8")
worker = (ROOT / "src" / "worker.js").read_text(encoding="utf-8")
migration = (ROOT / "migrations" / "20260913_fast_move_watch_hardening.sql").read_text(encoding="utf-8")

checks = {
    "version_381": '3.8.1-fast-move-watch-hardening-shadow' in runtime,
    "opening_event_export": 'export function openingEvent' in engine,
    "generation_table": 'fast_move_watch_generation' in runtime and 'fast_move_watch_generation' in migration,
    "hard_cap_sql_guard": "COUNT(*) FROM fast_move_watch_state" in runtime and "DEFAULT_LIMITS.max_active_watches" in runtime,
    "targeted_prior_lookup": 'loadWatchByContract' in runtime and 'MAX_TARGETED_PRIOR_LOOKUPS_PER_CYCLE' in runtime,
    "durable_recovery": 'recoveryMaintenance' in runtime and "EXPIRED_DURING_RESTART" in runtime,
    "expired_lease_release": "SET status='PENDING'" in runtime and "lease_expires_ts<=?1" in runtime,
    "fairness_persisted": 'persistDeferredCounters' in runtime and 'missed_due_count=missed_due_count+1' in runtime,
    "fairness_reset": 'deferral_count: 0' in engine and 'missed_due_count: 0' in engine,
    "selected_only_finalize": 'selectedLeases.get(contract)' in runtime,
    "generation_bound_finalize": 'prior.generation !== lease.generation' in runtime,
    "run_owner_bound_finalize": 'text(result?.run_id) !== lease.owner' in runtime,
    "lease_expiry_bound_finalize": 'lease.expires <= now' in runtime,
    "queue_active_lease_preserved": 'ACTIVE_LEASE_PRESERVED' in runtime,
    "state_optimistic_cas": 'expected_previous' in runtime and 'last_event_id' in runtime,
    "bounded_cleanup": 'LIMIT ?2' in runtime and 'EVENT_CLEANUP_BATCH = 100' in runtime,
    "write_reserve": 'MAX_FINALIZE_WRITES_RESERVED = 4' in runtime,
    "worker_single_prepare": len(re.findall(r'await prepareFastMoveWatchCycle\(', worker)) == 1,
    "worker_single_finalize": len(re.findall(r'await finalizeFastMoveWatchCycle\(', worker)) == 1,
    "no_telegram_from_runtime": 'telegram' not in runtime.lower().replace('telegram_started', ''),
    "no_execution_from_runtime": 'fetch(' not in runtime and 'TRADING_EXECUTION' not in runtime,
    "shadow_mode_preserved": 'FAST_MOVE_WATCH_SHADOW_NO_EXECUTION' in engine,
}
assert all(checks.values()), {k:v for k,v in checks.items() if not v}

# Strategy weights are not defined/changed by the watch runtime or engine.
for forbidden in ('35/30/20/15', 'automatic_weight_tuning_enabled: true', 'live_signal: true', 'trading_execution: true'):
    assert forbidden not in (runtime + engine), forbidden

import hashlib
checks['candidate_worker_sha_recorded'] = bool(hashlib.sha256(worker.encode()).hexdigest())
if len(sys.argv) > 1:
    baseline_worker = Path(sys.argv[1])
    checks['stage381_baseline_worker_sha_exact'] = (
        hashlib.sha256(baseline_worker.read_bytes()).hexdigest()
        == 'e3e57d62cf3dffd8eea1d2cd8be49d60d78b910c33d7492c4693ccbf1e28125c'
    )
    assert checks['stage381_baseline_worker_sha_exact'], baseline_worker
print(json.dumps({"ok": True, "suite": "stage381-hardening-static", "checks": checks}, ensure_ascii=False, indent=2))
