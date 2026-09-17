#!/usr/bin/env python3
import json, sqlite3, sys
from pathlib import Path
migration=(
    Path(sys.argv[1])
    if len(sys.argv)>1
    else Path(__file__).resolve().parent.parent / 'migrations' / '20260913_cross_venue_liquidation_shadow.sql'
)
sql=migration.read_text(encoding='utf-8')
con=sqlite3.connect(':memory:')
con.executescript(sql); con.executescript(sql)
row=con.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='liquidation_shadow_observation'").fetchone()
assert row and row[0]
required=[
 "LIQUIDATION_INTELLIGENCE_SHADOW_NO_EXECUTION","live_probability IS NULL","live_signal = 0",
 "validated_signal = 0","telegram_started = 0","trading_execution = 0","strategy_weights_changed = 0",
 "automatic_weight_tuning_enabled = 0","guaranteed_tp_generated = 0","synthetic_leverage_heatmap_generated = 0","shadow_only = 1"
]
normalized=' '.join(row[0].split())
for t in required: assert t in normalized,(t,normalized)
base={
'observation_id':'x','contract_code':'BTC-USDT','observed_ts':1800000000000,'rules_version':'cross-venue-liquidation-shadow-v1',
'contract_version':'liquidation-evidence-v1','mode':'LIQUIDATION_INTELLIGENCE_SHADOW_NO_EXECUTION','provider':'ByKaranteli LiqMap Public API',
'projected_map_status':'OBSERVATION_ONLY_IDENTITY_UNVERIFIED','realized_status':'PARTIAL_HTX_ONLY','dq_status':'OBSERVATION_ONLY_IDENTITY_UNVERIFIED','persisted_ts':1800000001000}
cols=','.join(base); marks=','.join('?' for _ in base)
con.execute(f"INSERT INTO liquidation_shadow_observation ({cols}) VALUES ({marks})",tuple(base.values()));con.commit()
blocked={}
for name,col,val in [
 ('probability','live_probability',0.7),('signal','live_signal',1),('validated','validated_signal',1),('telegram','telegram_started',1),
 ('execution','trading_execution',1),('weights','strategy_weights_changed',1),('autotune','automatic_weight_tuning_enabled',1),
 ('tp','guaranteed_tp_generated',1),('synthetic','synthetic_leverage_heatmap_generated',1),('shadow','shadow_only',0)]:
    try:
        con.execute(f"UPDATE liquidation_shadow_observation SET {col}=? WHERE observation_id='x'",(val,)); con.commit(); blocked[name]=False
    except sqlite3.IntegrityError:
        con.rollback(); blocked[name]=True
assert all(blocked.values()),blocked
con.execute("INSERT INTO liquidation_cluster_state(cluster_key,provider,contract_code,side,level_price,first_seen_ts,last_seen_ts,persistence_observations,lifecycle,source_model_version,last_observation_id) VALUES('k','p','BTC-USDT','LONG_LIQUIDATION_BELOW',95,1,1,1,'ACTIVE','v','x')")
con.execute("UPDATE liquidation_cluster_state SET last_seen_ts=2,persistence_observations=persistence_observations+1,lifecycle='APPROACHING' WHERE cluster_key='k'")
state=con.execute("SELECT first_seen_ts,last_seen_ts,persistence_observations,lifecycle FROM liquidation_cluster_state WHERE cluster_key='k'").fetchone()
assert state==(1,2,2,'APPROACHING'),state
idx={r[1] for r in con.execute("PRAGMA index_list('liquidation_shadow_observation')")}
assert {'idx_liq_shadow_observed_ts','idx_liq_shadow_contract_ts','idx_liq_shadow_status_ts'} <= idx
print(json.dumps({'ok':True,'suite':'liquidation-d1-schema','idempotent':True,'immutable_observation_safety':blocked,'cluster_state_update':state,'indexes':sorted(idx)},indent=2))
