import pathlib, sqlite3
root=pathlib.Path(__file__).resolve().parents[1]
sql=(root/'candidate/migrations/20260917_runner_d1_usage_run_shadow.sql').read_text()
con=sqlite3.connect(':memory:'); con.executescript(sql)
cols=[r[1] for r in con.execute('pragma table_info(report2_runner_budget_ledger_shadow)')]
need={'reservation_id','day_utc','reserve_rows_read','reserve_rows_written','measured_rows_read','measured_rows_written','measured_requests','unknown_ops','state','started_ts','completed_ts','source_run_id'}
assert need.issubset(cols), (need-set(cols))
# Empty-day semantics: COUNT 0 + SUMs NULL.
r=con.execute("SELECT COUNT(*) AS run_count,SUM(reserve_rows_read),SUM(reserve_rows_written),SUM(CASE WHEN state='FINALIZED' THEN measured_rows_read ELSE 0 END) FROM report2_runner_budget_ledger_shadow WHERE day_utc='2026-09-17'").fetchone()
assert r==(0,None,None,None),r
con.execute("insert into report2_runner_budget_ledger_shadow(reservation_id,day_utc,reserve_rows_read,reserve_rows_written,state,started_ts) values(?,?,?,?,?,?)",('RUN:1','2026-09-17',12152,243,'RESERVED',1))
r=con.execute("select reserve_rows_read,reserve_rows_written,state,measured_rows_read from report2_runner_budget_ledger_shadow").fetchone(); assert r==(12152,243,'RESERVED',None),r
# Invalid finalized row without measurements is rejected by CHECK.
try:
    con.execute("update report2_runner_budget_ledger_shadow set state='FINALIZED',completed_ts=2,source_run_id='X' where reservation_id='RUN:1'")
    raise AssertionError('CHECK_NOT_ENFORCED')
except sqlite3.IntegrityError: pass
print('PASS r9 reservation-first D1 budget schema')
