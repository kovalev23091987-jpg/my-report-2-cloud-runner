from pathlib import Path
import sqlite3
root=Path(__file__).resolve().parents[1]
sql=(root/'migration'/'20260917_tz101_entry_area_calibration_shadow.sql').read_text()
assert 'DROP TABLE' not in sql.upper()
assert 'DROP COLUMN' not in sql.upper()
assert 'CREATE TABLE IF NOT EXISTS tz101_entry_area_calibration_signal' in sql
assert 'CREATE TABLE IF NOT EXISTS tz101_entry_area_calibration_outcome' in sql
assert 'CREATE TABLE IF NOT EXISTS tz101_entry_area_calibration_state' in sql
con=sqlite3.connect(':memory:')
con.executescript(sql)
# Idempotent additive migration.
con.executescript(sql)
seen={r[0] for r in con.execute("select name from sqlite_master where type='table'")}
assert {'tz101_entry_area_calibration_signal','tz101_entry_area_calibration_outcome','tz101_entry_area_calibration_state'} <= seen
# Safety fuses.
for stmt in [
 "insert into tz101_entry_area_calibration_state(state_key,status,validated_out_of_sample,live_promotion_allowed,automatic_rule_promotion,updated_ts) values('x','x',0,1,0,1)",
 "insert into tz101_entry_area_calibration_state(state_key,status,validated_out_of_sample,live_promotion_allowed,automatic_rule_promotion,updated_ts) values('y','y',1,0,0,1)",
]:
    try:
        con.execute(stmt); raise AssertionError('safety constraint missing')
    except sqlite3.IntegrityError: pass
print('R8_20_ENTRY_MIGRATION_STATIC=PASS')
