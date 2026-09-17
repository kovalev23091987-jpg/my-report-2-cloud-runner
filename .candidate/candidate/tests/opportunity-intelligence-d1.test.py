#!/usr/bin/env python3
import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MIGRATION = ROOT / "migrations" / "20260913_opportunity_intelligence_shadow.sql"
sql = MIGRATION.read_text(encoding="utf-8")
upper = sql.upper()
for forbidden in ("DROP TABLE", "ALTER TABLE", "UPDATE ", "DELETE FROM", "INSERT INTO"):
    assert forbidden not in upper, f"migration is not additive-only: {forbidden}"

db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys=ON")
db.executescript(sql)
db.executescript(sql)

tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
required_tables = {
    "opportunity_shadow_event",
    "opportunity_shadow_outcome",
    "opportunity_shadow_funnel",
}
assert required_tables <= tables, (required_tables, tables)

event = {
    "event_id": "OPP:test:LSK-USDT:1h:1800000000000",
    "contract_code": "LSK-USDT",
    "exchange": "HTX",
    "timeframe": "1h",
    "event_ts": 1_800_000_000_000,
    "event_close_ts": 1_800_003_600_000,
    "event_type": "ANOMALOUS_EFFORT_VS_RESULT",
    "open_price": 100,
    "high_price": 102,
    "low_price": 98,
    "close_price": 100.2,
    "event_volume": 1000,
    "funnel_stage": "EARLY_WATCH",
    "data_quality": "OK",
    "missing_fields_json": "[]",
    "event_json": '{"factual":true}',
    "observed_ts": 1_800_003_600_000,
    "persisted_ts": 1_800_003_600_000,
}
columns = ",".join(event)
marks = ",".join("?" for _ in event)
db.execute(
    f"INSERT INTO opportunity_shadow_event ({columns}) VALUES ({marks})",
    tuple(event.values()),
)
db.execute(
    "INSERT INTO opportunity_shadow_outcome(event_id,contract_code,horizon,target_ts) VALUES(?,?,?,?)",
    (event["event_id"], "LSK-USDT", "1h", 1_800_007_200_000),
)
db.execute(
    """
    INSERT INTO opportunity_shadow_funnel(
      funnel_id,run_id,contract_code,observed_ts,newest_stage,funnel_json
    ) VALUES(?,?,?,?,?,?)
    """,
    ("funnel-1", "run-1", "LSK-USDT", 1_800_003_600_000, "EARLY_WATCH", "{}"),
)
db.commit()

try:
    db.execute(
        "INSERT INTO opportunity_shadow_outcome(event_id,contract_code,horizon,target_ts) VALUES(?,?,?,?)",
        ("missing-event", "LSK-USDT", "1h", 1_800_007_200_000),
    )
    db.commit()
    orphan_outcome_blocked = False
except sqlite3.IntegrityError:
    db.rollback()
    orphan_outcome_blocked = True
assert orphan_outcome_blocked

blocked = {}
checks = [
    ("event_probability", "opportunity_shadow_event", "live_probability", 0.6, "event_id", event["event_id"]),
    ("event_signal", "opportunity_shadow_event", "live_signal", 1, "event_id", event["event_id"]),
    ("event_validation", "opportunity_shadow_event", "validated_signal", 1, "event_id", event["event_id"]),
    ("event_decision", "opportunity_shadow_event", "decision_layer_changed", 1, "event_id", event["event_id"]),
    ("event_weights", "opportunity_shadow_event", "strategy_weights_changed", 1, "event_id", event["event_id"]),
    ("event_telegram", "opportunity_shadow_event", "telegram_started", 1, "event_id", event["event_id"]),
    ("event_execution", "opportunity_shadow_event", "trading_execution", 1, "event_id", event["event_id"]),
    ("event_tuning", "opportunity_shadow_event", "automatic_weight_tuning", 1, "event_id", event["event_id"]),
    ("event_shadow", "opportunity_shadow_event", "shadow_only", 0, "event_id", event["event_id"]),
    ("event_probability_semantics", "opportunity_shadow_event", "classification_is_probability", 1, "event_id", event["event_id"]),
    ("outcome_signal", "opportunity_shadow_outcome", "live_signal", 1, "event_id", event["event_id"]),
    ("outcome_probability", "opportunity_shadow_outcome", "live_probability", 0.6, "event_id", event["event_id"]),
    ("outcome_validation", "opportunity_shadow_outcome", "validated_signal", 1, "event_id", event["event_id"]),
    ("outcome_decision", "opportunity_shadow_outcome", "decision_layer_changed", 1, "event_id", event["event_id"]),
    ("outcome_weights", "opportunity_shadow_outcome", "strategy_weights_changed", 1, "event_id", event["event_id"]),
    ("outcome_telegram", "opportunity_shadow_outcome", "telegram_started", 1, "event_id", event["event_id"]),
    ("outcome_execution", "opportunity_shadow_outcome", "trading_execution", 1, "event_id", event["event_id"]),
    ("outcome_tuning", "opportunity_shadow_outcome", "automatic_weight_tuning", 1, "event_id", event["event_id"]),
    ("outcome_shadow", "opportunity_shadow_outcome", "shadow_only", 0, "event_id", event["event_id"]),
    ("outcome_probability_semantics", "opportunity_shadow_outcome", "classification_is_probability", 1, "event_id", event["event_id"]),
    ("funnel_signal", "opportunity_shadow_funnel", "live_signal", 1, "funnel_id", "funnel-1"),
    ("funnel_probability", "opportunity_shadow_funnel", "live_probability", 0.6, "funnel_id", "funnel-1"),
    ("funnel_validation", "opportunity_shadow_funnel", "validated_signal", 1, "funnel_id", "funnel-1"),
    ("funnel_decision", "opportunity_shadow_funnel", "decision_layer_changed", 1, "funnel_id", "funnel-1"),
    ("funnel_weights", "opportunity_shadow_funnel", "strategy_weights_changed", 1, "funnel_id", "funnel-1"),
    ("funnel_telegram", "opportunity_shadow_funnel", "telegram_started", 1, "funnel_id", "funnel-1"),
    ("funnel_execution", "opportunity_shadow_funnel", "trading_execution", 1, "funnel_id", "funnel-1"),
    ("funnel_tuning", "opportunity_shadow_funnel", "automatic_weight_tuning", 1, "funnel_id", "funnel-1"),
    ("funnel_shadow", "opportunity_shadow_funnel", "shadow_only", 0, "funnel_id", "funnel-1"),
    ("funnel_probability_semantics", "opportunity_shadow_funnel", "classification_is_probability", 1, "funnel_id", "funnel-1"),
]
for name, table, column, value, key_column, key in checks:
    try:
        db.execute(f"UPDATE {table} SET {column}=? WHERE {key_column}=?", (value, key))
        db.commit()
        blocked[name] = False
    except sqlite3.IntegrityError:
        db.rollback()
        blocked[name] = True
assert all(blocked.values()), blocked

# Missing values remain SQL NULL; a missing historical result has an explicit
# non-directional status rather than a fabricated zero return.
row = db.execute(
    "SELECT status,price,return_pct,mfe_pct,mae_pct FROM opportunity_shadow_outcome WHERE event_id=? AND horizon='1h'",
    (event["event_id"],),
).fetchone()
assert row == ("PENDING", None, None, None, None), row
db.execute(
    """
    UPDATE opportunity_shadow_outcome
    SET status='NO_CONFIRMED_HISTORICAL_DATA',attempt_count=8,
        outcome_json='{"report_phrase_ru":"нет подтверждённых исторических данных"}'
    WHERE event_id=? AND horizon='1h'
    """,
    (event["event_id"],),
)
db.commit()

indexes = {row[1] for table in required_tables for row in db.execute(f"PRAGMA index_list('{table}')")}
required_indexes = {
    "idx_opportunity_event_contract_ts",
    "idx_opportunity_event_type_ts",
    "idx_opportunity_event_stage_ts",
    "idx_opportunity_outcome_due",
    "idx_opportunity_outcome_contract_horizon",
    "idx_opportunity_funnel_observed",
}
assert required_indexes <= indexes, (required_indexes, indexes)

print(json.dumps({
    "ok": True,
    "suite": "opportunity-intelligence-d1",
    "additive_only": True,
    "idempotent": True,
    "tables": sorted(required_tables),
    "missing_not_zero": True,
    "explicit_no_history_status": True,
    "orphan_outcome_blocked": orphan_outcome_blocked,
    "immutable_shadow_constraints": blocked,
    "indexes": sorted(required_indexes),
}, ensure_ascii=False, indent=2))
