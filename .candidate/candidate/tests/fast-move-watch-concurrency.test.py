#!/usr/bin/env python3
"""Race-oriented SQLite check for the D1-compatible Stage 3.8.1 SQL guards.

This is not a claim that SQLite reproduces every distributed failure mode.  It
does prove that the single-statement capacity guard, optimistic state CAS and
queue lease claim remain bounded when two independent connections race.
"""

from concurrent.futures import ThreadPoolExecutor
import json
import re
import sqlite3
import tempfile
import threading
from pathlib import Path
from typing import Optional, Tuple


ROOT = Path(__file__).resolve().parent.parent
RUNTIME = (ROOT / "src" / "fast-move-watch-runtime.mjs").read_text(encoding="utf-8")
BASE_SQL = (ROOT / "migrations" / "20260913_fast_move_watch_shadow.sql").read_text(encoding="utf-8")
HARDENING_SQL = (ROOT / "migrations" / "20260913_fast_move_watch_hardening.sql").read_text(encoding="utf-8")


def sql_in_function(name: str) -> str:
    match = re.search(
        rf"(?:async\s+)?function\s+{re.escape(name)}\b[\s\S]*?(?=\n(?:async\s+)?function\s+|\nexport\s+async\s+function\s+|\Z)",
        RUNTIME,
    )
    assert match, name
    snippets = re.findall(r"prepare\(`([\s\S]*?)`\)", match.group(0))
    assert snippets, name
    return snippets[0]


STATE_SQL = sql_in_function("stateStatement")
QUEUE_SQL = sql_in_function("queueStatement")
MODE = "FAST_MOVE_WATCH_SHADOW_NO_EXECUTION"
ENGINE = "fast-move-watch-hardening-v3"
NOW = 1_800_000_000_000


def state_args(
    contract: str,
    *,
    event_id: str,
    updated: int = NOW,
    expected: Tuple[Optional[int], Optional[int], Optional[str]] = (None, None, None),
) -> tuple:
    values = (
        contract, 1, ENGINE, MODE, "PRE_SQUEEZE", None, NOW, NOW, updated,
        None, NOW + 900_000, NOW + 86_400_000, NOW - 1_000, event_id,
        "TEST", "ACTIVE", "ACTIVE", "CURRENT", 0, 0, 0, "{}",
        "UNKNOWN", "NONE", 1, "[]", None,
    )
    return values + (16, expected[0], expected[1], expected[2], None, 0, 0)


def connect(path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(path, timeout=10, isolation_level=None)
    connection.execute("PRAGMA busy_timeout=10000")
    connection.execute("PRAGMA journal_mode=WAL")
    return connection


def race(workers):
    barrier = threading.Barrier(len(workers))

    def wrapped(fn):
        barrier.wait(timeout=10)
        return fn()

    with ThreadPoolExecutor(max_workers=len(workers)) as pool:
        return [future.result(timeout=20) for future in [pool.submit(wrapped, fn) for fn in workers]]


with tempfile.TemporaryDirectory(prefix="report2-stage381-race-") as temp_dir:
    database = Path(temp_dir) / "race.sqlite3"
    setup = connect(database)
    setup.executescript(BASE_SQL)
    setup.executescript(HARDENING_SQL)

    for index in range(15):
        contract = f"SEED-{index:02d}-USDT"
        assert setup.execute(
            STATE_SQL,
            state_args(contract, event_id=f"seed:{index}"),
        ).rowcount == 1

    def admit(contract: str):
        def operation():
            connection = connect(database)
            try:
                return connection.execute(
                    STATE_SQL,
                    state_args(contract, event_id=f"open:{contract}"),
                ).rowcount
            finally:
                connection.close()
        return operation

    admission_changes = race([admit("RACE-A-USDT"), admit("RACE-B-USDT")])
    active_count = setup.execute(
        "SELECT COUNT(*) FROM fast_move_watch_state WHERE lifecycle_state NOT IN ('EXPIRED','CLOSED')"
    ).fetchone()[0]
    assert sorted(admission_changes) == [0, 1], admission_changes
    assert active_count == 16, active_count

    # Two writers using the same prior token: optimistic CAS admits exactly one.
    target = setup.execute(
        "SELECT updated_ts,last_event_id FROM fast_move_watch_state WHERE contract='SEED-00-USDT'"
    ).fetchone()

    def update(event_id: str):
        def operation():
            connection = connect(database)
            try:
                return connection.execute(
                    STATE_SQL,
                    state_args(
                        "SEED-00-USDT",
                        event_id=event_id,
                        updated=NOW + 1,
                        expected=(1, target[0], target[1]),
                    ),
                ).rowcount
            finally:
                connection.close()
        return operation

    cas_changes = race([update("cas:A"), update("cas:B")])
    assert sorted(cas_changes) == [0, 1], cas_changes

    current_event = setup.execute(
        "SELECT last_event_id FROM fast_move_watch_state WHERE contract='SEED-01-USDT'"
    ).fetchone()[0]
    queue_args = (
        "SEED-01-USDT", 1, NOW - 1, "ACTIVE", 0, 0, "PENDING",
        "SEED-01-USDT:1", NOW, NOW, current_event, 1, None, 0, NOW,
    )
    assert setup.execute(QUEUE_SQL, queue_args).rowcount == 1

    claim_sql = """
      UPDATE fast_move_recheck_queue
      SET status='LEASED',lease_owner=?1,lease_expires_ts=?2,updated_ts=?3
      WHERE contract='SEED-01-USDT' AND generation=1
        AND status='PENDING' AND due_ts<=?3
        AND (lease_expires_ts IS NULL OR lease_expires_ts<=?3)
    """

    def claim(owner: str):
        def operation():
            connection = connect(database)
            try:
                return connection.execute(
                    claim_sql,
                    (owner, NOW + 600_000, NOW),
                ).rowcount
            finally:
                connection.close()
        return operation

    claim_changes = race([claim("run-A"), claim("run-B")])
    lease = setup.execute(
        "SELECT status,lease_owner FROM fast_move_recheck_queue WHERE contract='SEED-01-USDT' AND generation=1"
    ).fetchone()
    setup.close()

    assert sorted(claim_changes) == [0, 1], claim_changes
    assert lease[0] == "LEASED" and lease[1] in {"run-A", "run-B"}, lease

print(json.dumps({
    "ok": True,
    "suite": "fast-move-watch-concurrency",
    "independent_connections": 2,
    "concurrent_capacity_admissions": admission_changes,
    "active_cap_after_race": active_count,
    "concurrent_state_cas": cas_changes,
    "concurrent_queue_claims": claim_changes,
    "single_lease_owner": lease[1],
}, ensure_ascii=False, indent=2))
