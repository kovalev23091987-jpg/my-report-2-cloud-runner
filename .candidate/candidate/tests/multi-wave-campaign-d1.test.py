#!/usr/bin/env python3
import json
import pathlib
import sqlite3
import tempfile
import threading

root = pathlib.Path(__file__).resolve().parents[1]
sql = (root / 'migrations/20260913_multi_wave_campaign_shadow.sql').read_text()


def campaign(cid, contract, start, *, phase='DISCOVERY', direction='DIRECTIONLESS_EVENT',
             detected='DIRECTIONLESS_EVENT', confidence=None, last=None, wave=0,
             completed=0, end=None, first=None, history=None, failures=None):
    observed = start if last is None else last
    return {
        'campaign_id': cid,
        'contract_code': contract,
        'campaign_start': start,
        'campaign_end': end,
        'first_detected_time': start if first is None else first,
        'first_detected_price': 1,
        'current_phase': phase,
        'direction': direction,
        'direction_at_detection': detected,
        'direction_confidence_at_detection': confidence,
        'wave_index': wave,
        'completed_wave_count': completed,
        'last_observed_ts': observed,
        'transition_history': [] if history is None else history,
        'reclaim_failure_event_ids': [] if failures is None else failures,
    }


def insert_campaign(con, row):
    con.execute(
        """INSERT INTO multi_wave_campaign_shadow(
          campaign_id,contract_code,campaign_start,campaign_end,current_phase,direction,
          direction_at_detection,direction_confidence_at_detection,wave_index,completed_wave_count,
          last_observed_ts,last_data_quality,campaign_json,persisted_ts
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            row['campaign_id'], row['contract_code'], row['campaign_start'], row['campaign_end'],
            row['current_phase'], row['direction'], row['direction_at_detection'],
            row['direction_confidence_at_detection'], row['wave_index'],
            row['completed_wave_count'], row['last_observed_ts'], 'OK',
            json.dumps(row, separators=(',', ':')), row['last_observed_ts'],
        ),
    )


con = sqlite3.connect(':memory:')
con.execute('PRAGMA foreign_keys=ON')
con.executescript(sql)
con.executescript(sql)
tables = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
assert {'multi_wave_campaign_shadow', 'multi_wave_campaign_wave_shadow'} <= tables
triggers = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='trigger'")}
assert {
    'trg_multi_wave_campaign_json_insert_guard', 'trg_multi_wave_campaign_update_guard',
    'trg_multi_wave_wave_json_insert_guard', 'trg_multi_wave_wave_update_guard',
} <= triggers

cols = {r[1] for r in con.execute('PRAGMA table_info(multi_wave_campaign_shadow)')}
for col in ['campaign_id', 'current_phase', 'direction', 'direction_at_detection',
            'wave_index', 'campaign_json', 'live_probability', 'live_signal',
            'telegram_started', 'trading_execution']:
    assert col in cols
wave_cols = {r[1] for r in con.execute('PRAGMA table_info(multi_wave_campaign_wave_shadow)')}
assert {'independent_sample', 'sample_unit'} <= wave_cols

c = campaign('c', 'X-USDT', 1)
insert_campaign(con, c)
r = con.execute("""SELECT shadow_only,live_probability,live_signal,validated_signal,
 decision_layer_changed,strategy_weights_changed,telegram_started,trading_execution,
 automatic_weight_tuning FROM multi_wave_campaign_shadow""").fetchone()
assert r == (1, None, 0, 0, 0, 0, 0, 0, 0), r
try:
    con.execute("UPDATE multi_wave_campaign_shadow SET live_signal=1 WHERE campaign_id='c'")
    raise AssertionError('live signal constraint missing')
except sqlite3.IntegrityError:
    pass

bad = {**c, 'first_detected_time': 2}
try:
    con.execute("UPDATE multi_wave_campaign_shadow SET campaign_json=? WHERE campaign_id='c'", (json.dumps(bad),))
    raise AssertionError('rewritten first_detected_time was accepted')
except sqlite3.IntegrityError:
    pass
bad = {**c, 'current_phase': 'PRE_IMPULSE_WATCH'}
try:
    con.execute("UPDATE multi_wave_campaign_shadow SET campaign_json=? WHERE campaign_id='c'", (json.dumps(bad),))
    raise AssertionError('JSON/scalar phase mismatch was accepted')
except sqlite3.IntegrityError:
    pass
try:
    con.execute("UPDATE multi_wave_campaign_shadow SET direction_at_detection='LONG' WHERE campaign_id='c'")
    raise AssertionError('direction_at_detection rewrite was accepted')
except sqlite3.IntegrityError:
    pass
oversized = {**c, 'transition_history': [{}] * 65}
try:
    con.execute("UPDATE multi_wave_campaign_shadow SET campaign_json=? WHERE campaign_id='c'", (json.dumps(oversized),))
    raise AssertionError('oversized transition history was accepted')
except sqlite3.IntegrityError:
    pass

indexes = {r[1] for r in con.execute('PRAGMA index_list(multi_wave_campaign_shadow)')}
assert 'uq_multi_wave_active_contract' in indexes
try:
    insert_campaign(con, campaign('duplicate', 'X-USDT', 2, phase='PRE_IMPULSE_WATCH', direction='LONG', detected='LONG'))
    raise AssertionError('duplicate active campaign was accepted')
except sqlite3.IntegrityError:
    pass
closed = {**c, 'current_phase': 'CLOSED', 'campaign_end': 2, 'last_observed_ts': 2}
con.execute(
    "UPDATE multi_wave_campaign_shadow SET current_phase='CLOSED',campaign_end=2,last_observed_ts=2,campaign_json=?,persisted_ts=2 WHERE campaign_id='c'",
    (json.dumps(closed, separators=(',', ':')),),
)
c2 = campaign('c2', 'X-USDT', 2, phase='ENTRY_TRIGGER', direction='LONG', detected='LONG',
              confidence=0.7, wave=1)
insert_campaign(con, c2)

wave_json = json.dumps({'campaign': c2, 'lead_time': {}, 'evidence': {}}, separators=(',', ':'))
con.execute(
    """INSERT INTO multi_wave_campaign_wave_shadow(
      wave_id,campaign_id,contract_code,wave_index,direction,wave_json,persisted_ts
    ) VALUES('c2:W1','c2','X-USDT',1,'LONG',?,2)""",
    (wave_json,),
)
assert con.execute("SELECT independent_sample,sample_unit FROM multi_wave_campaign_wave_shadow").fetchone() == (0, 'CAMPAIGN_NESTED_WAVE')
try:
    con.execute("UPDATE multi_wave_campaign_wave_shadow SET independent_sample=1 WHERE wave_id='c2:W1'")
    raise AssertionError('nested wave was promoted to an independent sample')
except sqlite3.IntegrityError:
    pass
try:
    con.execute("DELETE FROM multi_wave_campaign_shadow WHERE campaign_id='c2'")
    raise AssertionError('campaign delete cascaded through wave history')
except sqlite3.IntegrityError:
    pass
con.close()

with tempfile.TemporaryDirectory(prefix='report2-multi-wave-race-') as temp:
    database = pathlib.Path(temp) / 'race.sqlite'
    setup = sqlite3.connect(database)
    setup.execute('PRAGMA journal_mode=WAL')
    setup.execute('PRAGMA foreign_keys=ON')
    setup.executescript(sql)
    setup.close()
    first_inserted = threading.Event()
    release_first = threading.Event()
    outcomes = {}

    def first_writer():
        db = sqlite3.connect(database, timeout=5)
        db.execute('BEGIN IMMEDIATE')
        insert_campaign(db, campaign('race-a', 'RACE-USDT', 10))
        first_inserted.set()
        assert release_first.wait(5)
        db.commit()
        db.close()
        outcomes['a'] = 'COMMITTED'

    def second_writer():
        assert first_inserted.wait(5)
        db = sqlite3.connect(database, timeout=5)
        try:
            db.execute('BEGIN IMMEDIATE')
            insert_campaign(db, campaign('race-b', 'RACE-USDT', 11))
            db.commit()
            outcomes['b'] = 'WRONGLY_COMMITTED'
        except sqlite3.IntegrityError as error:
            db.rollback()
            outcomes['b'] = str(error)
        finally:
            db.close()

    a = threading.Thread(target=first_writer, daemon=True)
    b = threading.Thread(target=second_writer, daemon=True)
    a.start()
    b.start()
    assert first_inserted.wait(5)
    release_first.set()
    a.join(5)
    b.join(5)
    verify = sqlite3.connect(database)
    count = verify.execute("SELECT COUNT(*) FROM multi_wave_campaign_shadow WHERE contract_code='RACE-USDT' AND current_phase!='CLOSED'").fetchone()[0]
    verify.close()
    assert outcomes['a'] == 'COMMITTED', outcomes
    assert outcomes['b'] != 'WRONGLY_COMMITTED', outcomes
    assert count == 1

print('PASS multi-wave-campaign-d1 immutable-json nested-sample concurrent-active-guard')
