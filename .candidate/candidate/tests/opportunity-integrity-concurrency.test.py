#!/usr/bin/env python3
"""Deterministic SQLite race test for independent episode admission."""

import json
import sqlite3
import tempfile
import threading
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
START = 1_800_000_000_000
HOUR = 3_600_000


def event(event_id, offset_ms, exchange="HTX"):
    event_ts = START + offset_ms
    row = {
        "event_id": event_id,
        "contract_code": "LSK-USDT",
        "exchange": exchange,
        "timeframe": "1h",
        "event_ts": event_ts,
        "event_close_ts": event_ts + HOUR,
        "event_type": "ANOMALOUS_EFFORT_VS_RESULT",
        "open_price": 100,
        "high_price": 102,
        "low_price": 98,
        "close_price": 100,
        "event_volume": 1000,
        "funnel_stage": "ANOMALOUS_EVENT",
        "data_quality": "OK",
        "missing_fields_json": "[]",
        "event_json": "{}",
        "observed_ts": event_ts + HOUR,
        "persisted_ts": event_ts + HOUR,
        "integrity_version": "3.9.1-opportunity-integrity-hardening-shadow",
        "integrity_rules_version": "opportunity-integrity-v2",
        "episode_id": f"episode:{event_id}",
        "episode_start_ts": event_ts,
        "episode_end_ts": event_ts + HOUR,
        "independence_start_ts": event_ts - HOUR,
        "independence_end_ts": event_ts + 2 * HOUR,
        "independent_sample": 1,
        "related_signal_count": 1,
        "related_timeframes_json": '["1h"]',
        "direction_at_event": "NONE",
        "direction_source": "NO_TIMELY_PRECOMMITTED_DIRECTION",
        "directional_evaluation_eligible": 0,
        "control_eligible": 0,
        "contamination_status": "SIGNAL_EPISODE_NOT_CONTROL",
        "cvd_delta_quality": "UNVERIFIED",
    }
    row["event_json"] = json.dumps({
        "event_id": event_id,
        "contract": row["contract_code"],
        "exchange": exchange,
        "timeframe": row["timeframe"],
        "timestamp": event_ts,
        "event_close_ts": row["event_close_ts"],
        "event_type": row["event_type"],
        "candle": {
            "open": row["open_price"], "high": row["high_price"],
            "low": row["low_price"], "close": row["close_price"],
            "volume": row["event_volume"],
        },
        "episode_id": row["episode_id"],
        "episode_start_ts": row["episode_start_ts"],
        "episode_end_ts": row["episode_end_ts"],
        "independence_start_ts": row["independence_start_ts"],
        "independence_end_ts": row["independence_end_ts"],
        "independent_sample": True,
        "related_signal_count": 1,
        "related_timeframes": ["1h"],
        "control_group": False,
        "control_eligible": False,
        "control_maturity_ts": None,
        "contamination_status": row["contamination_status"],
        "direction_at_event": row["direction_at_event"],
        "direction_source": row["direction_source"],
        "direction_rules_version": None,
        "direction_locked_ts": None,
        "directional_evaluation_eligible": False,
        "market_flow": {"cvd_delta_quality": "UNVERIFIED"},
    })
    return row


def insert_event(connection, row):
    columns = ",".join(row)
    marks = ",".join("?" for _ in row)
    connection.execute(
        f"INSERT INTO opportunity_shadow_event ({columns}) VALUES ({marks})",
        tuple(row.values()),
    )


with tempfile.TemporaryDirectory(prefix="report2-opportunity-race-") as temp:
    database = Path(temp) / "race.sqlite"
    setup = sqlite3.connect(database)
    setup.execute("PRAGMA journal_mode=WAL")
    setup.execute("PRAGMA foreign_keys=ON")
    setup.executescript((ROOT / "migrations" / "20260913_opportunity_intelligence_shadow.sql").read_text())
    setup.executescript((ROOT / "migrations" / "20260913_opportunity_integrity_hardening_shadow.sql").read_text())
    setup.close()

    first_inserted = threading.Event()
    second_started = threading.Event()
    release_first = threading.Event()
    results = {}

    def first_writer():
        connection = sqlite3.connect(database, timeout=5)
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("BEGIN IMMEDIATE")
        insert_event(connection, event("race-one", 0))
        first_inserted.set()
        assert release_first.wait(5)
        connection.commit()
        connection.close()
        results["first"] = "COMMITTED"

    def second_writer():
        assert first_inserted.wait(5)
        connection = sqlite3.connect(database, timeout=5)
        connection.execute("PRAGMA foreign_keys=ON")
        second_started.set()
        try:
            connection.execute("BEGIN IMMEDIATE")
            insert_event(connection, event("race-two-related", 30 * 60_000, "BYBIT"))
            connection.commit()
            results["second"] = "WRONGLY_COMMITTED"
        except sqlite3.IntegrityError as error:
            connection.rollback()
            results["second"] = str(error)
        finally:
            connection.close()

    first = threading.Thread(target=first_writer, daemon=True)
    second = threading.Thread(target=second_writer, daemon=True)
    first.start()
    second.start()
    assert second_started.wait(5)
    release_first.set()
    first.join(5)
    second.join(5)
    assert not first.is_alive() and not second.is_alive()

    verify = sqlite3.connect(database)
    rows = verify.execute(
        "SELECT event_id FROM opportunity_shadow_event WHERE independent_sample=1 ORDER BY event_id"
    ).fetchall()
    verify.close()

assert results["first"] == "COMMITTED", results
assert "OPPORTUNITY_INDEPENDENCE_OVERLAP" in results["second"], results
assert rows == [("race-one",)], rows

print(json.dumps({
    "ok": True,
    "suite": "opportunity-integrity-concurrency",
    "first_writer": results["first"],
    "second_related_writer": "BLOCKED_BY_DATABASE_TRIGGER",
    "independent_episode_rows": len(rows),
}, ensure_ascii=False, indent=2))
