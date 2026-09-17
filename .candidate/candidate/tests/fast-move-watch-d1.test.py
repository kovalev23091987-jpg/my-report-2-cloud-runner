#!/usr/bin/env python3
import json
import sqlite3
import sys
from pathlib import Path

MIGRATION = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent.parent / "migrations" / "20260913_fast_move_watch_shadow.sql"
sql = MIGRATION.read_text(encoding="utf-8")
for forbidden in ("DROP TABLE", "ALTER TABLE", "DELETE FROM", "UPDATE ", "INSERT INTO"):
    assert forbidden not in sql.upper(), f"destructive/non-additive token: {forbidden}"

db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys=ON")
db.executescript(sql)
db.executescript(sql)

expected_tables = {"fast_move_watch_state", "fast_move_watch_event", "fast_move_recheck_queue"}
actual_tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
assert expected_tables.issubset(actual_tables), (expected_tables, actual_tables)

state = dict(
    contract="龙虾-USDT", generation=1, engine_version="fast-move-watch-prep-v1",
    lifecycle_state="PRE_SQUEEZE", state_entered_ts=1800000000000,
    created_ts=1800000000000, updated_ts=1800000000000,
    next_recheck_ts=1800000900000, expiry_ts=1800086400000,
    last_evidence_ts=1799999999000, last_event_id="evt-1",
    last_reason_code="DISCOVERY_ANOMALY_CONFIRMED", cadence_class="ACTIVE",
    priority_class="ACTIVE", freshness_state="CURRENT",
    counters_json='{"squeeze_confirmed":0}', cluster_lifecycle="UNKNOWN",
    cluster_lifecycle_source="NONE", discovery_rank=1,
    discovery_flags_json='["5m:price_change_pct","5m:oi_change_pct"]',
)
cols = ",".join(state)
marks = ",".join("?" for _ in state)
db.execute(f"INSERT INTO fast_move_watch_state ({cols}) VALUES ({marks})", tuple(state.values()))
db.commit()

blocked = {}
for name, column, value in [
    ("shadow_only", "shadow_only", 0),
    ("priority_probability", "scheduler_priority_is_probability", 1),
    ("weights", "changes_strategy_weights", 1),
    ("new_weight", "new_percentage_weight", 1),
    ("probability", "live_probability", 0.51),
    ("signal", "live_signal", 1),
    ("validated", "validated_signal", 1),
    ("telegram", "telegram_started", 1),
    ("execution", "trading_execution", 1),
    ("auto_tune", "automatic_weight_tuning_enabled", 1),
    ("guaranteed_tp", "guaranteed_tp_generated", 1),
    ("synthetic_liq", "synthetic_liquidation_levels_generated", 1),
]:
    try:
        db.execute(f"UPDATE fast_move_watch_state SET {column}=? WHERE contract=?", (value, "龙虾-USDT"))
        db.commit()
        blocked[name] = False
    except sqlite3.IntegrityError:
        db.rollback()
        blocked[name] = True
assert all(blocked.values()), blocked

queue = ("龙虾-USDT", 1, 1800000900000, "ACTIVE", "龙虾-USDT:1", 1800000000000, 1800000000000)
db.execute("INSERT INTO fast_move_recheck_queue(contract,generation,due_ts,priority_class,dedupe_token,created_ts,updated_ts) VALUES(?,?,?,?,?,?,?)", queue)
db.commit()
try:
    db.execute("INSERT INTO fast_move_recheck_queue(contract,generation,due_ts,priority_class,dedupe_token,created_ts,updated_ts) VALUES(?,?,?,?,?,?,?)", queue)
    db.commit()
    duplicate_blocked = False
except sqlite3.IntegrityError:
    db.rollback()
    duplicate_blocked = True
assert duplicate_blocked

# Atomic claim semantics: only one owner can claim an unleased/expired row.
first = db.execute("UPDATE fast_move_recheck_queue SET status='LEASED',lease_owner=?,lease_expires_ts=?,updated_ts=? WHERE contract=? AND generation=? AND status='PENDING' AND (lease_expires_ts IS NULL OR lease_expires_ts<=?)", ("owner-a",1800000240000,1800000000001,"龙虾-USDT",1,1800000000001)).rowcount
second = db.execute("UPDATE fast_move_recheck_queue SET status='LEASED',lease_owner=?,lease_expires_ts=?,updated_ts=? WHERE contract=? AND generation=? AND status='PENDING' AND (lease_expires_ts IS NULL OR lease_expires_ts<=?)", ("owner-b",1800000240000,1800000000002,"龙虾-USDT",1,1800000000002)).rowcount
assert (first, second) == (1, 0), (first, second)

indexes = {r[1] for table in expected_tables for r in db.execute(f"PRAGMA index_list('{table}')")}
required_indexes = {
    "idx_fast_move_watch_next_due", "idx_fast_move_watch_expiry",
    "idx_fast_move_watch_event_contract_ts", "idx_fast_move_watch_event_retention",
    "idx_fast_move_queue_due", "idx_fast_move_queue_lease",
}
assert required_indexes.issubset(indexes), (required_indexes, indexes)

print(json.dumps({
    "ok": True,
    "suite": "fast-move-watch-d1",
    "additive_only": True,
    "idempotent_migration": True,
    "unicode_round_trip": db.execute("SELECT contract FROM fast_move_watch_state").fetchone()[0] == "龙虾-USDT",
    "forbidden_mutations_blocked": blocked,
    "duplicate_queue_blocked": duplicate_blocked,
    "atomic_claim": {"first": first, "second": second},
    "indexes": sorted(required_indexes),
}, ensure_ascii=False, indent=2))
db.close()
