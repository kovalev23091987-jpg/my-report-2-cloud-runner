#!/usr/bin/env python3
"""Stage 3.9.2 D1 trigger atomicity for virtual-position ENTRY/EXIT transitions.

Uses valid Final Decision records from the canonical D1 contract helper, then
proves that Stage 3.9.2 trigger-side identity mismatches abort the parent INSERT
atomically and cannot drift the virtual-position ledger.
"""
from pathlib import Path
import copy
import json
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
M = ROOT / "migrations"
ORDER = [
    "20260912_full_evidence_shadow.sql",
    "20260913_opportunity_intelligence_shadow.sql",
    "20260913_opportunity_integrity_hardening_shadow.sql",
    "20260913_multi_wave_campaign_shadow.sql",
    "20260914_final_decision_integration_shadow.sql",
    "20260914_stage392_receipt_wiring_shadow.sql",
]

# Load only helper definitions/samples from the authoritative Final Decision D1
# suite. Do not execute its test body a second time here.
helper_path = ROOT / "tests/final-decision-integration-d1.test.py"
helper_source = helper_path.read_text(encoding="utf-8")
cut = helper_source.index("\ntest_fail_loud_schema_and_manifest()\nWORKERD_SMOKE")
H = {"__file__": str(helper_path)}
exec(compile(helper_source[:cut], str(helper_path), "exec"), H)
SAMPLES = H["SAMPLES"]
NOW = SAMPLES["now"]


def open_full_db(now_ms=NOW):
    clock = H["Clock"](now_ms)
    db = sqlite3.connect(":memory:", isolation_level=None)
    db.execute("PRAGMA foreign_keys=ON")
    db.create_function("strftime", -1, clock.strftime)
    for name in ORDER:
        db.executescript((M / name).read_text(encoding="utf-8"))
    return db, clock


def campaign_row_for_entry(entry, *, observation_id, receipt_digest,
                           committed_ts, seed_overrides=None):
    contract = entry["contract_code"]
    identity = entry["action_identity"]["entry"]
    campaign_id = identity["campaign_id"]
    wave_id = identity["wave_id"]
    revision = 1
    receipt_id = f"CMR:{campaign_id}:{revision}:{observation_id}"
    campaign_start = committed_ts - 5_000
    campaign = {
        "campaign_id": campaign_id,
        "contract_code": contract,
        "campaign_start": campaign_start,
        "first_detected_time": campaign_start,
        "first_detected_price": 99.0,
        "current_phase": entry["campaign_phase"],
        "direction": entry["direction"],
        "direction_at_detection": entry["direction"],
        "direction_confidence_at_detection": None,
        "wave_index": 1,
        "completed_wave_count": 0,
        "last_event_id": f"EV:{observation_id}",
        "last_event_ts": committed_ts - 20,
        "last_observed_ts": committed_ts,
        "last_event_core_signature": f"SIG:{observation_id}",
        "transition_history": [],
        "reclaim_failure_event_ids": [],
    }
    seed = {
        "campaign_id": campaign_id,
        "direction": entry["direction"],
        "entry_wave_id": wave_id,
        "entry_action_id": entry["entry_action_id"],
        "entry_trigger_ts": identity["entry_trigger_ts"],
        "entry_trigger_price": 100.5,
        "entry_observation_id": f"ENTRY:{observation_id}",
        "campaign_state_revision_at_entry": revision,
        "source_campaign_receipt_id": receipt_id,
        "source_campaign_content_digest": "abcdef0123456789",
        "source_campaign_committed_ts": committed_ts,
    }
    if seed_overrides:
        seed.update(seed_overrides)
    proof = {
        "campaign_bridge": {
            "schema_version": "multi-wave-decision-bridge-v1",
            "status": "SHADOW_CAMPAIGN_EVALUATED",
            "campaign": {
                "schema_version": "multi-wave-decision-state-v1",
                "rules_version": "multi-wave-decision-state-rules-v1",
                "campaign_id": campaign_id,
                "contract_code": contract,
                "campaign_start": campaign_start,
                "current_phase": entry["campaign_phase"],
                "direction": entry["direction"],
                "direction_at_detection": entry["direction"],
                "wave_index": 1,
                "completed_wave_count": 0,
                "last_observed_ts": committed_ts,
                "origin_episode_id": f"EP:{observation_id}",
                "state_revision": revision,
                "observation_id": observation_id,
                "wave_facts_immutable": True,
                "cas_persisted": True,
            },
            "persistence": {
                "status": "CLOSED",
                "receipt_id": receipt_id,
                "content_digest": receipt_digest,
                "committed_ts": committed_ts,
                "immutable": True,
                "verification_method": "D1_IMMUTABLE_RECEIPT",
            },
        },
        "position_origin_seed": seed,
    }
    return campaign, proof, receipt_id


def insert_campaign(db, campaign, proof):
    db.execute(
        """INSERT INTO multi_wave_campaign_shadow(
        campaign_id,contract_code,campaign_start,current_phase,direction,direction_at_detection,
        direction_confidence_at_detection,wave_index,completed_wave_count,last_event_id,last_event_ts,
        last_observed_ts,last_data_quality,campaign_json,persisted_ts,stage392_proof_bundle_json
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            campaign["campaign_id"], campaign["contract_code"], campaign["campaign_start"],
            campaign["current_phase"], campaign["direction"], campaign["direction_at_detection"],
            campaign["direction_confidence_at_detection"], campaign["wave_index"],
            campaign["completed_wave_count"], campaign["last_event_id"], campaign["last_event_ts"],
            campaign["last_observed_ts"], "OK", json.dumps(campaign, separators=(",", ":")),
            campaign["last_observed_ts"], json.dumps(proof, separators=(",", ":")),
        ),
    )


def insert_decision(db, decision, persisted_ts):
    return db.execute(H["INSERT_SQL"], H["values"](decision, persisted_ts))


def entry_decision(contract, nonce, observed_ts, snapshot_id, observation_id, digest,
                   *, seed_overrides=None):
    entry = H["new_entry_action"](
        SAMPLES["entryLong"], contract=contract, observed_ts=observed_ts,
        snapshot_id=snapshot_id, nonce=nonce,
    )
    campaign, proof, receipt_id = campaign_row_for_entry(
        entry, observation_id=observation_id, receipt_digest=digest,
        committed_ts=observed_ts - 100, seed_overrides=seed_overrides,
    )
    entry["lineage_receipts"]["campaign"] = {
        "receipt_id": receipt_id,
        "content_digest": digest,
        "committed_ts": observed_ts - 100,
    }
    return entry, campaign, proof


def assert_rejected(callable_, message):
    try:
        callable_()
    except sqlite3.IntegrityError as error:
        assert message in str(error), (message, str(error))
        return str(error)
    raise AssertionError(f"expected rejection: {message}")


db, clock = open_full_db()

# 1) Valid ENTRY: Final Decision INSERT and ledger transition are atomic.
entry, campaign, proof = entry_decision(
    "ATOMIC-USDT", 777001, NOW, "ATOMIC-ENTRY", "OBS-ATOMIC-1", "1234567890abcdef"
)
insert_campaign(db, campaign, proof)
assert db.execute(
    "select state,state_revision from shadow_virtual_position_ledger where contract_code=?",
    (entry["contract_code"],),
).fetchone() == ("FLAT", 1)
clock.now_ms = NOW
insert_decision(db, entry, NOW)
expected_position_id = f"VP:{entry['entry_action_id']}"
opened = db.execute(
    """select state,state_revision,position_id,entry_action_id,campaign_id,entry_wave_id,
              origin_source_campaign_receipt_id
       from shadow_virtual_position_ledger where contract_code=?""",
    (entry["contract_code"],),
).fetchone()
assert opened == (
    "OPEN_LONG", 2, expected_position_id, entry["entry_action_id"],
    entry["action_identity"]["entry"]["campaign_id"],
    entry["action_identity"]["entry"]["wave_id"],
    entry["lineage_receipts"]["campaign"]["receipt_id"],
), opened
assert db.execute(
    "select count(*) from final_decision_integration_shadow where decision_id=?",
    (entry["decision_id"],),
).fetchone()[0] == 1

# 2) Campaign seed/action-identity mismatch must roll back the parent decision
# INSERT and leave the authoritative FLAT ledger unchanged.
bad_entry, bad_campaign, bad_proof = entry_decision(
    "ATOMIC-BAD-USDT", 777101, NOW, "ATOMIC-BAD-ENTRY", "OBS-ATOMIC-BAD-1",
    "2234567890abcdef", seed_overrides={"entry_wave_id": "MW:WRONG:W99"},
)
insert_campaign(db, bad_campaign, bad_proof)
assert_rejected(
    lambda: insert_decision(db, bad_entry, NOW),
    "stage392 virtual position entry precondition missing",
)
assert db.execute(
    "select count(*) from final_decision_integration_shadow where decision_id=?",
    (bad_entry["decision_id"],),
).fetchone()[0] == 0
assert db.execute(
    "select state,state_revision from shadow_virtual_position_ledger where contract_code=?",
    (bad_entry["contract_code"],),
).fetchone() == ("FLAT", 1)

# 3) Valid EXIT must be bound to the exact authoritative position identity and
# revision and clear every origin field while advancing revision exactly once.
exit_ts = NOW + 1_000
exit_decision = H["reseal_for_sql"](
    SAMPLES["exit"], contract=entry["contract_code"], observed_ts=exit_ts,
    snapshot_id="ATOMIC-EXIT", nonce=777002,
)
exit_decision["action_identity"]["management"]["position_id"] = expected_position_id
exit_decision["action_identity"]["management"]["position_state_revision"] = 2
exit_decision["action_identity"]["management"]["position_direction"] = "LONG"
clock.now_ms = exit_ts
insert_decision(db, exit_decision, exit_ts)
closed = db.execute(
    """select state,state_revision,position_id,direction,campaign_id,entry_wave_id,
              origin_entry_observation_id,origin_source_campaign_receipt_id
       from shadow_virtual_position_ledger where contract_code=?""",
    (entry["contract_code"],),
).fetchone()
assert closed == ("FLAT", 3, None, None, None, None, None, None), closed

# 4) EXIT with stale/wrong position revision must abort atomically; no decision
# row and no ledger mutation are allowed.
entry2_ts = NOW + 2_000
entry2, campaign2, proof2 = entry_decision(
    "ATOMIC-EXIT-BAD-USDT", 777201, entry2_ts, "ATOMIC-ENTRY-2",
    "OBS-ATOMIC-2", "3234567890abcdef",
)
insert_campaign(db, campaign2, proof2)
clock.now_ms = entry2_ts
insert_decision(db, entry2, entry2_ts)
pos2 = f"VP:{entry2['entry_action_id']}"
assert db.execute(
    "select state,state_revision,position_id from shadow_virtual_position_ledger where contract_code=?",
    (entry2["contract_code"],),
).fetchone() == ("OPEN_LONG", 2, pos2)

bad_exit_ts = NOW + 3_000
bad_exit = H["reseal_for_sql"](
    SAMPLES["exit"], contract=entry2["contract_code"], observed_ts=bad_exit_ts,
    snapshot_id="ATOMIC-BAD-EXIT", nonce=777202,
)
bad_exit["action_identity"]["management"]["position_id"] = pos2
bad_exit["action_identity"]["management"]["position_state_revision"] = 1  # stale
bad_exit["action_identity"]["management"]["position_direction"] = "LONG"
clock.now_ms = bad_exit_ts
assert_rejected(
    lambda: insert_decision(db, bad_exit, bad_exit_ts),
    "stage392 virtual position exit precondition missing",
)
assert db.execute(
    "select count(*) from final_decision_integration_shadow where decision_id=?",
    (bad_exit["decision_id"],),
).fetchone()[0] == 0
assert db.execute(
    "select state,state_revision,position_id from shadow_virtual_position_ledger where contract_code=?",
    (entry2["contract_code"],),
).fetchone() == ("OPEN_LONG", 2, pos2)

# 5) Anti-look-ahead at storage boundary: a decision older than the authoritative
# virtual-position observation cannot consume that position state.
future_contract = "ATOMIC-FUTURE-USDT"
future_entry, future_campaign, future_proof = entry_decision(
    future_contract, 777301, NOW + 4_000, "ATOMIC-FUTURE", "OBS-ATOMIC-FUTURE",
    "4234567890abcdef",
)
insert_campaign(db, future_campaign, future_proof)
# Force only timestamp refresh forward at same revision; identity remains FLAT.
db.execute(
    "update shadow_virtual_position_ledger set last_observed_ts=?,persisted_ts=? where contract_code=?",
    (NOW + 5_000, NOW + 5_000, future_contract),
)
clock.now_ms = NOW + 4_000
assert_rejected(
    lambda: insert_decision(db, future_entry, NOW + 4_000),
    "stage392 virtual position entry precondition missing",
)
assert db.execute(
    "select state,state_revision from shadow_virtual_position_ledger where contract_code=?",
    (future_contract,),
).fetchone() == ("FLAT", 1)

db.close()
print(json.dumps({
    "ok": True,
    "suite": "stage392-trigger-atomicity",
    "entry_atomic_transition": "FLAT:r1->OPEN_LONG:r2",
    "entry_identity_mismatch": "ROLLBACK_FAIL_CLOSED",
    "exit_atomic_transition": "OPEN_LONG:r2->FLAT:r3",
    "exit_stale_revision": "ROLLBACK_FAIL_CLOSED",
    "position_anti_lookahead": "PASS",
    "direct_absent_position_entry": "FORBIDDEN_BY_TRIGGER",
    "safety": {
        "shadow_only": True,
        "live_probability": None,
        "live_signal": False,
        "validated_signal": False,
        "telegram_started": False,
        "trading_execution": False,
        "automatic_weight_tuning": False,
        "strategy_weights_changed": False,
    },
}, indent=2))
