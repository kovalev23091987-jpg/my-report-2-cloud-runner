from pathlib import Path
import sqlite3
root=Path(__file__).resolve().parents[1]
sql=(root/'migrations/20260917_tz101_entry_area_calibration_shadow.sql').read_text()
con=sqlite3.connect(':memory:'); con.executescript(sql)
expected={'tz101_entry_area_calibration_signal','tz101_entry_area_calibration_outcome','tz101_entry_area_calibration_state'}
seen={r[0] for r in con.execute("select name from sqlite_master where type='table'")}
assert expected<=seen,(expected-seen)
# Guard rails: live promotion / auto promotion cannot be set to 1.
try:
 con.execute("insert into tz101_entry_area_calibration_state(state_key,status,validated_out_of_sample,live_promotion_allowed,automatic_rule_promotion,updated_ts) values('x','x',0,1,0,1)")
 raise AssertionError('live promotion constraint missing')
except sqlite3.IntegrityError: pass
try:
 con.execute("insert into tz101_entry_area_calibration_state(state_key,status,validated_out_of_sample,live_promotion_allowed,automatic_rule_promotion,updated_ts) values('x','x',1,0,0,1)")
 raise AssertionError('validated_out_of_sample must remain 0 in shadow readiness schema')
except sqlite3.IntegrityError: pass
print({'ok':True,'suite':'tz101-entry-area-calibration-d1','tables':sorted(expected)})
