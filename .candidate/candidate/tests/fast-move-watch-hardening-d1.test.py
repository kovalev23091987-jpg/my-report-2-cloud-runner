#!/usr/bin/env python3
import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE = ROOT / "migrations" / "20260913_fast_move_watch_shadow.sql"
HARD = ROOT / "migrations" / "20260913_fast_move_watch_hardening.sql"
base_sql = BASE.read_text(encoding="utf-8")
hard_sql = HARD.read_text(encoding="utf-8")
upper = hard_sql.upper()
for forbidden in ("DROP TABLE", "ALTER TABLE", "DELETE FROM", "UPDATE FAST_MOVE_WATCH_STATE", "UPDATE FAST_MOVE_RECHECK_QUEUE"):
    assert forbidden not in upper, f"hardening migration must be additive-only: {forbidden}"

db = sqlite3.connect(":memory:")
db.executescript(base_sql)

common = dict(
    engine_version="fast-move-watch-prep-v1", lifecycle_state="PRE_SQUEEZE",
    state_entered_ts=1800000000000, created_ts=1800000000000,
    updated_ts=1800000001000, next_recheck_ts=1800000900000,
    expiry_ts=1800086400000, last_evidence_ts=1800000000000,
    last_reason_code="DISCOVERY_ANOMALY_CONFIRMED", cadence_class="ACTIVE",
    priority_class="ACTIVE", freshness_state="CURRENT", counters_json="{}",
    cluster_lifecycle="UNKNOWN", cluster_lifecycle_source="NONE",
    discovery_flags_json="[]",
)
for contract, generation, state, updated in [
    ("龙虾-USDT", 2, "PRE_SQUEEZE", 1800000001000),
    ("OLD-USDT", 4, "EXPIRED", 1800003600000),
]:
    row = dict(common)
    row.update(contract=contract, generation=generation, lifecycle_state=state,
               updated_ts=updated, last_event_id=f"evt:{contract}:{generation}",
               closure_reason="TEST_EXPIRED" if state == "EXPIRED" else None)
    cols = ",".join(row)
    marks = ",".join("?" for _ in row)
    db.execute(f"INSERT INTO fast_move_watch_state ({cols}) VALUES ({marks})", tuple(row.values()))
db.commit()

# Apply twice to prove idempotence and backfill stability.
db.executescript(hard_sql)
db.executescript(hard_sql)

rows = db.execute("SELECT contract,generation,opened_ts,opening_event_id,opening_reason,closed_ts,final_state,closure_reason,shadow_only,live_signal,trading_execution FROM fast_move_watch_generation ORDER BY contract").fetchall()
assert len(rows) == 2, rows
by_contract = {r[0]: r for r in rows}
assert by_contract["龙虾-USDT"][1] == 2
assert by_contract["龙虾-USDT"][4] == "BACKFILL_STAGE38_CURRENT_STATE"
assert by_contract["龙虾-USDT"][5] is None
assert by_contract["OLD-USDT"][1] == 4
assert by_contract["OLD-USDT"][5] == 1800003600000
assert by_contract["OLD-USDT"][6] == "EXPIRED"
assert by_contract["OLD-USDT"][7] == "TEST_EXPIRED"

blocked = {}
for name, column, value in [
    ("shadow_only", "shadow_only", 0),
    ("live_signal", "live_signal", 1),
    ("trading_execution", "trading_execution", 1),
]:
    try:
        db.execute(f"UPDATE fast_move_watch_generation SET {column}=? WHERE contract='龙虾-USDT'", (value,))
        db.commit()
        blocked[name] = False
    except sqlite3.IntegrityError:
        db.rollback()
        blocked[name] = True
assert all(blocked.values()), blocked

try:
    db.execute("INSERT INTO fast_move_watch_generation(contract,generation,engine_version,opened_ts,opening_event_id,opening_reason) VALUES(?,?,?,?,?,?)",
               ("DUP-USDT",1,"x",1800000000000,"BACKFILL:龙虾-USDT:2","DUP"))
    db.commit()
    unique_opening_event = False
except sqlite3.IntegrityError:
    db.rollback()
    unique_opening_event = True
assert unique_opening_event

indexes = {r[1] for r in db.execute("PRAGMA index_list('fast_move_watch_generation')")}
required = {"idx_fast_move_watch_generation_opened", "idx_fast_move_watch_generation_contract_closed"}
assert required.issubset(indexes), (required, indexes)

print(json.dumps({
    "ok": True,
    "suite": "fast-move-watch-hardening-d1",
    "migration_additive": True,
    "idempotent": True,
    "backfilled_generations": len(rows),
    "safety_constraints_blocked": blocked,
    "opening_event_unique": unique_opening_event,
    "indexes": sorted(required),
}, ensure_ascii=False, indent=2))
