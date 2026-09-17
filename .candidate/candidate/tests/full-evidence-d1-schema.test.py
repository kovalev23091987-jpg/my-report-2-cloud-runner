#!/usr/bin/env python3
import json, sqlite3, sys
from pathlib import Path
migration = (
    Path(sys.argv[1])
    if len(sys.argv) > 1
    else Path(__file__).resolve().parent.parent / "migrations" / "20260912_full_evidence_shadow.sql"
)
db_path = sys.argv[2] if len(sys.argv) > 2 else ":memory:"
sql=migration.read_text(encoding="utf-8")
required_schema_tokens=(
 "FULL_EVIDENCE_SHADOW_NO_EXECUTION","weight_derivatives = 35","weight_market_strength_spot = 30",
 "weight_smart_money_onchain = 20","weight_supporting_risk = 15","full_dc_long IS NULL",
 "full_dc_short IS NULL","live_probability IS NULL","full_decision_eligible = 0","live_signal = 0",
 "validated = 0","telegram_started = 0","trading_execution = 0","strategy_weights_changed = 0",
 "automatic_weight_tuning_enabled = 0","missing_data_coerced_to_zero = 0",
 "cross_venue_dispersion_called_conflict = 0","shadow_only = 1","retention_days = 180",
)
def schema_valid(connection):
    row=connection.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='full_evidence_shadow_log'").fetchone()
    if not row or not isinstance(row[0],str): return False
    normalized=' '.join(row[0].split())
    return all(token in normalized for token in required_schema_tokens)
con=sqlite3.connect(db_path)
con.executescript(sql)
con.executescript(sql)
assert schema_valid(con),"fresh/idempotent migration schema fingerprint failed"
base={
  'full_evidence_id':'schema-test','shadow_id':'shadow-test','contract_code':'ETHFI-USDT',
  'observed_ts':1800000000000,'rules_version':'full-evidence-shadow-v1',
  'mode':'FULL_EVIDENCE_SHADOW_NO_EXECUTION','fixed_weights_json':'{"CROSS_EXCHANGE_DERIVATIVES":35,"MARKET_STRENGTH_SPOT":30,"SMART_MONEY_ONCHAIN":20,"SUPPORTING_RISK":15}',
  'htx_execution_gate_closed':1,'dq_status':'PARTIAL','persisted_ts':1800000001000,
}
cols=','.join(base); marks=','.join('?' for _ in base)
con.execute(f'INSERT OR REPLACE INTO full_evidence_shadow_log ({cols}) VALUES ({marks})',tuple(base.values()))
con.commit()
row=con.execute('SELECT full_dc_long,full_dc_short,live_probability,full_decision_eligible,live_signal,validated,telegram_started,trading_execution,strategy_weights_changed,automatic_weight_tuning_enabled,missing_data_coerced_to_zero,cross_venue_dispersion_called_conflict,shadow_only,retention_days FROM full_evidence_shadow_log WHERE full_evidence_id=?',('schema-test',)).fetchone()
expected=(None,None,None,0,0,0,0,0,0,0,0,0,1,180)
assert row==expected,(row,expected)
blocked={}
for name,col,val in [
 ('weight_derivatives','weight_derivatives',34),('weight_market_strength_spot','weight_market_strength_spot',31),('weight_smart_money_onchain','weight_smart_money_onchain',21),('weight_supporting_risk','weight_supporting_risk',14),
 ('dc_long','full_dc_long',1),('dc_short','full_dc_short',1),('probability','live_probability',0.6),
 ('eligible','full_decision_eligible',1),('live_signal','live_signal',1),('validated','validated',1),
 ('telegram','telegram_started',1),('execution','trading_execution',1),('weights','strategy_weights_changed',1),
 ('auto_tune','automatic_weight_tuning_enabled',1),('missing_to_zero','missing_data_coerced_to_zero',1),
 ('crossvenue_conflict','cross_venue_dispersion_called_conflict',1),('shadow_only','shadow_only',0),('retention','retention_days',30),
]:
    try:
        con.execute(f'UPDATE full_evidence_shadow_log SET {col}=? WHERE full_evidence_id=?',(val,'schema-test'))
        con.commit(); blocked[name]=False
    except sqlite3.IntegrityError:
        con.rollback(); blocked[name]=True
assert all(blocked.values()),blocked
idx=[r[1] for r in con.execute("PRAGMA index_list('full_evidence_shadow_log')")]
for required in ('idx_full_evidence_shadow_observed_ts','idx_full_evidence_shadow_contract_ts','idx_full_evidence_shadow_dq_ts'):
    assert required in idx,(required,idx)
weak=sqlite3.connect(':memory:')
weak.execute('CREATE TABLE full_evidence_shadow_log (full_evidence_id TEXT PRIMARY KEY, contract_code TEXT, observed_ts INTEGER, dq_status TEXT)')
weak.executescript(sql)
assert schema_valid(weak) is False,'pre-existing unconstrained table must be detected as incompatible'
weak.close()
print(json.dumps({'ok':True,'suite':'full-evidence-d1-schema','idempotent_apply':True,'schema_fingerprint':True,'weak_existing_schema_detected':True,'safety_defaults':row,'forbidden_mutations_blocked':blocked,'indexes':idx},indent=2))
con.close()
