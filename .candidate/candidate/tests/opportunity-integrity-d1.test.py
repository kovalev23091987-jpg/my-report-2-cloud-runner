#!/usr/bin/env python3
"""D1/SQLite integrity guards for the additive Stage 3.9.1 migration."""

import json
import re
import sqlite3
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
BASE = ROOT / "migrations" / "20260913_opportunity_intelligence_shadow.sql"
HARDENING = ROOT / "migrations" / "20260913_opportunity_integrity_hardening_shadow.sql"
base_sql = BASE.read_text(encoding="utf-8")
hardening_sql = HARDENING.read_text(encoding="utf-8")

assert not re.search(
    r"(?im)^\s*(DROP|DELETE\s+FROM|UPDATE\s+\w|INSERT\s+INTO|REPLACE\s+INTO)\b",
    hardening_sql,
), "hardening migration must not rewrite or remove existing rows"

db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys=ON")
db.executescript(base_sql)

START = 1_800_000_000_000
HOUR = 3_600_000
DAY = 24 * HOUR


def base_event(event_id, event_ts, event_type="ANOMALOUS_EFFORT_VS_RESULT", control=False):
    return {
        "event_id": event_id,
        "contract_code": "LSK-USDT",
        "exchange": "HTX",
        "timeframe": "1h",
        "event_ts": event_ts,
        "event_close_ts": event_ts + HOUR,
        "event_type": event_type,
        "open_price": 100,
        "high_price": 102,
        "low_price": 98,
        "close_price": 100.2,
        "event_volume": 1000,
        "control_group": 1 if control else 0,
        "control_population": "TEST" if control else None,
        "funnel_stage": "CONTROL" if control else "ANOMALOUS_EVENT",
        "data_quality": "OK",
        "missing_fields_json": "[]",
        "event_json": "{}",
        "observed_ts": event_ts + HOUR,
        "persisted_ts": event_ts + HOUR,
    }


def insert(table, values):
    columns = ",".join(values)
    marks = ",".join("?" for _ in values)
    db.execute(f"INSERT INTO {table} ({columns}) VALUES ({marks})", tuple(values.values()))


# Existing Stage 3.9 rows must remain present and be explicitly excluded from
# independent statistics until a new factual episode supersedes them.
legacy = base_event("legacy-stage39", START)
insert("opportunity_shadow_event", legacy)
db.commit()
db.executescript(hardening_sql)
legacy_after = db.execute(
    "SELECT integrity_version,integrity_rules_version,independent_sample,control_eligible "
    "FROM opportunity_shadow_event WHERE event_id='legacy-stage39'"
).fetchone()
assert legacy_after == (
    "LEGACY_STAGE39_UNASSESSED",
    "LEGACY_STAGE39_UNASSESSED",
    0,
    0,
), legacy_after


def integrity_event(event_id, event_ts, *, control=False, direction="NONE", lock_ts=None):
    row = base_event(
        event_id,
        event_ts,
        "CONTROL_NON_ANOMALOUS" if control else "ANOMALOUS_EFFORT_VS_RESULT",
        control,
    )
    padding = DAY if control else HOUR
    row.update({
        "integrity_version": "3.9.1-opportunity-integrity-hardening-shadow",
        "integrity_rules_version": "opportunity-integrity-v2",
        "episode_id": f"episode:{event_id}",
        "episode_start_ts": event_ts,
        "episode_end_ts": event_ts + HOUR,
        "independence_start_ts": event_ts - padding,
        "independence_end_ts": event_ts + HOUR + padding,
        "independent_sample": 1,
        "related_signal_count": 0 if control else 1,
        "related_timeframes_json": "[]" if control else '["1h"]',
        "direction_at_event": direction,
        "direction_source": "CONTROL_IS_DIRECTIONLESS" if control else "TEST_PRECOMMITMENT",
        "direction_locked_ts": lock_ts,
        "directional_evaluation_eligible": 1 if direction in ("LONG", "SHORT") else 0,
        "control_eligible": 1 if control else 0,
        "control_maturity_ts": event_ts + HOUR + 7 * DAY if control else None,
        "contamination_status": (
            "ISOLATED_FROM_KNOWN_SIGNAL_EPISODES" if control else "SIGNAL_EPISODE_NOT_CONTROL"
        ),
        "cvd_delta_quality": "COMPLETE",
    })
    refresh_event_json(row)
    return row


def refresh_event_json(row):
    row["event_json"] = json.dumps({
        "event_id": row["event_id"],
        "contract": row["contract_code"],
        "exchange": row["exchange"],
        "timeframe": row["timeframe"],
        "timestamp": row["event_ts"],
        "event_close_ts": row["event_close_ts"],
        "event_type": row["event_type"],
        "candle": {
            "open": row["open_price"],
            "high": row["high_price"],
            "low": row["low_price"],
            "close": row["close_price"],
            "volume": row["event_volume"],
        },
        "episode_id": row["episode_id"],
        "episode_start_ts": row["episode_start_ts"],
        "episode_end_ts": row["episode_end_ts"],
        "independence_start_ts": row["independence_start_ts"],
        "independence_end_ts": row["independence_end_ts"],
        "independent_sample": bool(row["independent_sample"]),
        "related_signal_count": row["related_signal_count"],
        "related_timeframes": json.loads(row["related_timeframes_json"]),
        "control_group": bool(row["control_group"]),
        "control_eligible": bool(row["control_eligible"]),
        "control_maturity_ts": row["control_maturity_ts"],
        "contamination_status": row["contamination_status"],
        "direction_at_event": row["direction_at_event"],
        "direction_source": row["direction_source"],
        "direction_rules_version": row.get("direction_rules_version"),
        "direction_locked_ts": row["direction_locked_ts"],
        "directional_evaluation_eligible": bool(row["directional_evaluation_eligible"]),
        "market_flow": {"cvd_delta_quality": row["cvd_delta_quality"]},
    })


signal = integrity_event("signal-one", START + 3 * DAY)
insert("opportunity_shadow_event", signal)
db.commit()

blocked = {}


def expect_integrity_error(name, action):
    try:
        action()
        db.commit()
        blocked[name] = False
    except sqlite3.IntegrityError:
        db.rollback()
        blocked[name] = True


overlap = integrity_event("signal-overlap", START + 3 * DAY + 30 * 60_000)
overlap["exchange"] = "BYBIT"
refresh_event_json(overlap)
expect_integrity_error("related_episode_overlap", lambda: insert("opportunity_shadow_event", overlap))

bad_control = integrity_event("bad-control", START + 8 * DAY, control=True)
bad_control["control_eligible"] = 0
expect_integrity_error("ineligible_control_claim", lambda: insert("opportunity_shadow_event", bad_control))

premature_control = integrity_event("premature-control", START + 9 * DAY, control=True)
premature_control["control_maturity_ts"] = premature_control["event_close_ts"] + HOUR
premature_control["observed_ts"] = premature_control["control_maturity_ts"]
premature_control["persisted_ts"] = premature_control["control_maturity_ts"]
refresh_event_json(premature_control)
expect_integrity_error("premature_control_maturity", lambda: insert("opportunity_shadow_event", premature_control))

role_confusion = integrity_event("role-confusion", START + 11 * DAY)
role_confusion["event_type"] = "CONTROL_NON_ANOMALOUS"
refresh_event_json(role_confusion)
expect_integrity_error("signal_control_role_confusion", lambda: insert("opportunity_shadow_event", role_confusion))

late_direction = integrity_event(
    "late-direction", START + 10 * DAY, direction="LONG", lock_ts=START + 10 * DAY + HOUR + 600_001
)
late_direction["observed_ts"] = late_direction["direction_locked_ts"]
late_direction["persisted_ts"] = late_direction["direction_locked_ts"]
expect_integrity_error("retrospective_direction", lambda: insert("opportunity_shadow_event", late_direction))

control = integrity_event("control-isolated", START + 20 * DAY, control=True)
control["observed_ts"] = control["control_maturity_ts"]
control["persisted_ts"] = control["control_maturity_ts"]
insert("opportunity_shadow_event", control)
db.commit()

expect_integrity_error(
    "independent_event_json_immutable",
    lambda: db.execute(
        "UPDATE opportunity_shadow_event SET event_json=? WHERE event_id=?",
        (json.dumps({"tampered": True}), signal["event_id"]),
    ),
)

expect_integrity_error(
    "control_invalidation_cannot_mutate_factual_json",
    lambda: db.execute(
        "UPDATE opportunity_shadow_event SET independent_sample=0,control_eligible=0,"
        "contamination_status='CONTAMINATED_BY_LATER_DISCOVERED_SIGNAL',event_json=? "
        "WHERE event_id=?",
        (json.dumps({"tampered": True}), control["event_id"]),
    ),
)

insert("opportunity_shadow_outcome", {
    "event_id": signal["event_id"],
    "contract_code": "LSK-USDT",
    "horizon": "1h",
    "target_ts": signal["event_close_ts"] + HOUR,
    "next_attempt_ts": signal["event_close_ts"] + HOUR,
    "source_retention_deadline_ts": signal["event_close_ts"] + 80 * DAY,
    "direction_at_event": "NONE",
    "directional_evaluation_eligible": 0,
})
db.commit()

expect_integrity_error(
    "retention_deadline_extension",
    lambda: db.execute(
        "UPDATE opportunity_shadow_outcome SET source_retention_deadline_ts="
        "source_retention_deadline_ts+86400000 WHERE event_id=? AND horizon='1h'",
        (signal["event_id"],),
    ),
)

expect_integrity_error(
    "incomplete_trajectory_closed",
    lambda: db.execute(
        "UPDATE opportunity_shadow_outcome SET status='CLOSED_FACTUAL',"
        "next_attempt_ts=NULL,closed_ts=target_ts "
        "WHERE event_id=? AND horizon='1h'",
        (signal["event_id"],),
    ),
)

expect_integrity_error(
    "directionless_winner_selected",
    lambda: db.execute(
        "UPDATE opportunity_shadow_outcome SET status='CLOSED_FACTUAL',"
        "next_attempt_ts=NULL,closed_ts=target_ts,price=105,"
        "trajectory_complete=1,source_timeframe='1m',expected_bars=60,observed_bars=60,"
        "trajectory_coverage_pct=100,source_start_ts=?,source_end_ts=target_ts,"
        "source_bar_duration_ms=60000,mfe_pct=5,missed_opportunity_detected=1,"
        "outcome_json=? "
        "WHERE event_id=? AND horizon='1h'",
        (
            signal["event_close_ts"],
            json.dumps({
                "trajectory_complete": True,
                "target_ts": signal["event_close_ts"] + HOUR,
                "source_timeframe": "1m",
                "source_start_ts": signal["event_close_ts"],
                "source_end_ts": signal["event_close_ts"] + HOUR,
                "source_bar_duration_ms": 60_000,
                "expected_bars": 60,
                "observed_bars": 60,
                "mfe_pct": 5,
                "missed_opportunity_detected": True,
            }),
            signal["event_id"],
        ),
    ),
)

valid_outcome_json = json.dumps({
    "trajectory_complete": True,
    "target_ts": signal["event_close_ts"] + HOUR,
    "source_timeframe": "1m",
    "source_start_ts": signal["event_close_ts"],
    "source_end_ts": signal["event_close_ts"] + HOUR,
    "source_bar_duration_ms": 60_000,
    "expected_bars": 60,
    "observed_bars": 60,
})
db.execute(
    "UPDATE opportunity_shadow_outcome SET status='CLOSED_FACTUAL',"
    "next_attempt_ts=NULL,closed_ts=target_ts,price=105,"
    "trajectory_complete=1,source_timeframe='1m',expected_bars=60,observed_bars=60,"
    "trajectory_coverage_pct=100,source_start_ts=?,source_end_ts=target_ts,"
    "source_bar_duration_ms=60000,max_up_excursion_pct=5,max_down_excursion_pct=-2,"
    "outcome_json=? "
    "WHERE event_id=? AND horizon='1h'",
    (signal["event_close_ts"], valid_outcome_json, signal["event_id"]),
)
db.commit()
closed = db.execute(
    "SELECT status,trajectory_complete,mfe_pct,mae_pct,missed_opportunity_detected,"
    "max_up_excursion_pct,max_down_excursion_pct FROM opportunity_shadow_outcome "
    "WHERE event_id=? AND horizon='1h'",
    (signal["event_id"],),
).fetchone()
assert closed == ("CLOSED_FACTUAL", 1, None, None, None, 5.0, -2.0), closed

expect_integrity_error(
    "closed_price_cannot_be_erased",
    lambda: db.execute(
        "UPDATE opportunity_shadow_outcome SET price=NULL WHERE event_id=? AND horizon='1h'",
        (signal["event_id"],),
    ),
)

tampered_json = dict(json.loads(valid_outcome_json))
del tampered_json["source_start_ts"]
expect_integrity_error(
    "closed_json_missing_required_geometry",
    lambda: db.execute(
        "UPDATE opportunity_shadow_outcome SET outcome_json=? "
        "WHERE event_id=? AND horizon='1h'",
        (json.dumps(tampered_json), signal["event_id"]),
    ),
)

insert("opportunity_shadow_outcome", {
    "event_id": signal["event_id"],
    "contract_code": "LSK-USDT",
    "horizon": "7d",
    "target_ts": signal["event_close_ts"] + 7 * DAY,
    "next_attempt_ts": signal["event_close_ts"] + 7 * DAY,
    "source_retention_deadline_ts": signal["event_close_ts"] + 80 * DAY,
    "direction_at_event": "NONE",
    "directional_evaluation_eligible": 0,
})
db.commit()
false_horizon_json = json.dumps({
    "trajectory_complete": True,
    "target_ts": signal["event_close_ts"] + 7 * DAY,
    "source_timeframe": "1m",
    "source_start_ts": signal["event_close_ts"],
    "source_end_ts": signal["event_close_ts"] + 7 * DAY,
    "source_bar_duration_ms": 60_000,
    "expected_bars": 1,
    "observed_bars": 1,
})
expect_integrity_error(
    "false_7d_single_bar_closure",
    lambda: db.execute(
        "UPDATE opportunity_shadow_outcome SET status='CLOSED_FACTUAL',"
        "next_attempt_ts=NULL,closed_ts=target_ts,price=105,trajectory_complete=1,"
        "source_timeframe='1m',expected_bars=1,observed_bars=1,"
        "trajectory_coverage_pct=100,source_start_ts=?,source_end_ts=target_ts,"
        "source_bar_duration_ms=60000,outcome_json=? "
        "WHERE event_id=? AND horizon='7d'",
        (signal["event_close_ts"], false_horizon_json, signal["event_id"]),
    ),
)

insert("opportunity_shadow_outcome", {
    "event_id": signal["event_id"],
    "contract_code": "LSK-USDT",
    "horizon": "4h",
    "target_ts": signal["event_close_ts"] + 4 * HOUR,
    "next_attempt_ts": signal["event_close_ts"] + 4 * HOUR,
    "source_retention_deadline_ts": signal["event_close_ts"] + 80 * DAY,
    "direction_at_event": "NONE",
    "directional_evaluation_eligible": 0,
})
db.commit()
no_history_json = json.dumps({
    "no_confirmed_historical_data": True,
    "report_phrase_ru": "нет подтверждённых исторических данных",
})
expect_integrity_error(
    "premature_no_history_closure",
    lambda: db.execute(
        "UPDATE opportunity_shadow_outcome SET status='NO_CONFIRMED_HISTORICAL_DATA',"
        "next_attempt_ts=NULL,closed_ts=source_retention_deadline_ts-1,outcome_json=? "
        "WHERE event_id=? AND horizon='4h'",
        (no_history_json, signal["event_id"]),
    ),
)

expect_integrity_error(
    "no_history_phrase_missing",
    lambda: db.execute(
        "UPDATE opportunity_shadow_outcome SET status='NO_CONFIRMED_HISTORICAL_DATA',"
        "next_attempt_ts=NULL,closed_ts=source_retention_deadline_ts,"
        "outcome_json=? WHERE event_id=? AND horizon='4h'",
        (json.dumps({"no_confirmed_historical_data": True}), signal["event_id"]),
    ),
)
db.execute(
    "UPDATE opportunity_shadow_outcome SET status='NO_CONFIRMED_HISTORICAL_DATA',"
    "next_attempt_ts=NULL,closed_ts=source_retention_deadline_ts,outcome_json=? "
    "WHERE event_id=? AND horizon='4h'",
    (no_history_json, signal["event_id"]),
)
db.commit()

required_indexes = {
    "idx_opportunity_event_episode_unique",
    "idx_opportunity_event_independence",
    "idx_opportunity_event_control_integrity",
    "idx_opportunity_outcome_retry_due",
}
indexes = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='index'")}
assert required_indexes <= indexes
assert all(blocked.values()), blocked

db.execute(
    "UPDATE opportunity_shadow_event SET independent_sample=0,control_eligible=0,"
    "contamination_status='CONTAMINATED_BY_LATER_DISCOVERED_SIGNAL' WHERE event_id=?",
    (control["event_id"],),
)
db.commit()
assert db.execute(
    "SELECT independent_sample,control_eligible,contamination_status "
    "FROM opportunity_shadow_event WHERE event_id=?",
    (control["event_id"],),
).fetchone() == (0, 0, "CONTAMINATED_BY_LATER_DISCOVERED_SIGNAL")

print(json.dumps({
    "ok": True,
    "suite": "opportunity-integrity-d1",
    "migration": HARDENING.name,
    "additive_no_row_rewrite": True,
    "legacy_rows_fail_closed": True,
    "blocked": blocked,
    "directionless_raw_excursions_allowed": True,
    "directionless_directional_scores_forbidden": True,
    "indexes": sorted(required_indexes),
}, ensure_ascii=False, indent=2))
