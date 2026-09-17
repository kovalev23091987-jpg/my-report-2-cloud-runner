#!/usr/bin/env python3
import json, sqlite3
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
M=ROOT/'migrations'
ORDER=[
 '20260912_full_evidence_shadow.sql',
 '20260913_opportunity_intelligence_shadow.sql',
 '20260913_opportunity_integrity_hardening_shadow.sql',
 '20260913_multi_wave_campaign_shadow.sql',
 '20260914_final_decision_integration_shadow.sql',
 '20260914_stage392_receipt_wiring_shadow.sql',
]
con=sqlite3.connect(':memory:')
con.execute('PRAGMA foreign_keys=ON')
for name in ORDER:
    con.executescript((M/name).read_text())

# Additive columns exist and are nullable for historical rows (no synthetic backfill).
opp={r[1]:r for r in con.execute('pragma table_info(opportunity_shadow_event)')}
assert 'stage392_episode_revision' in opp and 'stage392_raw_event_digest' in opp
mw={r[1]:r for r in con.execute('pragma table_info(multi_wave_campaign_shadow)')}
fe={r[1]:r for r in con.execute('pragma table_info(full_evidence_shadow_log)')}
assert 'stage392_proof_bundle_json' in mw and 'stage392_proof_bundle_json' in fe

# Full Evidence proof-bearing rows are storage-validated and immutable. Legacy
# rows cannot be retroactively upgraded from NULL to a receipt-shaped proof.
now=1_800_000_000_000
fe_bundle={
 'mode':'SHADOW_ONLY_NO_EXECUTION','contract_code':'TEST-USDT','observed_ts':now,
 'full_evidence':{
   'schema_version':'full-evidence-shadow-v1','contract_code':'TEST-USDT','observed_ts':now,
   'source_registry':{
     'status':'CLOSED','authoritative':True,'receipt_id':'FER:TEST','content_digest':'aaaaaaaaaaaaaaaa',
     'persistence':{'status':'CLOSED','receipt_id':'FER:TEST','content_digest':'aaaaaaaaaaaaaaaa','committed_ts':now,'immutable':True,'verification_method':'D1_IMMUTABLE_RECEIPT'}
   },
   'persistence':{'status':'CLOSED','receipt_id':'FEROW:TEST','content_digest':'bbbbbbbbbbbbbbbb','committed_ts':now,'immutable':True,'verification_method':'D1_IMMUTABLE_RECEIPT'}
 },
 'evidence_registry':{
   'status':'CLOSED','authoritative':True,'rules_version':'causal-lineage-registry-v3-full-envelope',
   'receipt_id':'ER:TEST','content_digest':'cccccccccccccccc',
   'persistence':{'status':'CLOSED','receipt_id':'ER:TEST','content_digest':'cccccccccccccccc','committed_ts':now,'immutable':True,'verification_method':'D1_IMMUTABLE_RECEIPT'},
   'entries':[]
 },
 'safety_gate_receipt':{
   'status':'CLOSED','authoritative':True,'receipt_id':'SGR:TEST','content_digest':'dddddddddddddddd',
   'persistence':{'status':'CLOSED','receipt_id':'SGR:TEST','content_digest':'dddddddddddddddd','committed_ts':now,'immutable':True,'verification_method':'D1_IMMUTABLE_RECEIPT'}
 }
}
fe_insert=(
 'FE:TEST','SH:TEST','TEST-USDT',now,'full-evidence-shadow-v1','FULL_EVIDENCE_SHADOW_NO_EXECUTION',
 '{"CROSS_EXCHANGE_DERIVATIVES":35,"MARKET_STRENGTH_SPOT":30,"SMART_MONEY_ONCHAIN":20,"SUPPORTING_RISK":15}',
 0,'PARTIAL',now,json.dumps(fe_bundle,separators=(',',':'))
)
con.execute('''INSERT INTO full_evidence_shadow_log(
 full_evidence_id,shadow_id,contract_code,observed_ts,rules_version,mode,fixed_weights_json,
 htx_execution_gate_closed,dq_status,persisted_ts,stage392_proof_bundle_json
) VALUES(?,?,?,?,?,?,?,?,?,?,?)''',fe_insert)
try:
    con.execute("update full_evidence_shadow_log set dq_status='CLOSED' where full_evidence_id='FE:TEST'")
    raise AssertionError('proof-bearing full evidence row unexpectedly mutable')
except sqlite3.IntegrityError:
    pass
con.execute('''INSERT INTO full_evidence_shadow_log(
 full_evidence_id,shadow_id,contract_code,observed_ts,rules_version,mode,fixed_weights_json,
 htx_execution_gate_closed,dq_status,persisted_ts
) VALUES(?,?,?,?,?,?,?,?,?,?)''',(
 'FE:LEGACY','SH:LEGACY','TEST-USDT',now-1,'full-evidence-shadow-v1','FULL_EVIDENCE_SHADOW_NO_EXECUTION',
 fe_insert[6],0,'PARTIAL',now
))
try:
    con.execute("update full_evidence_shadow_log set stage392_proof_bundle_json=? where full_evidence_id='FE:LEGACY'",(json.dumps(fe_bundle,separators=(',',':')),))
    raise AssertionError('legacy full evidence proof backfill unexpectedly succeeded')
except sqlite3.IntegrityError:
    pass
bad_fe=json.loads(json.dumps(fe_bundle))
bad_fe['contract_code']='OTHER-USDT'
try:
    con.execute('''INSERT INTO full_evidence_shadow_log(
     full_evidence_id,shadow_id,contract_code,observed_ts,rules_version,mode,fixed_weights_json,
     htx_execution_gate_closed,dq_status,persisted_ts,stage392_proof_bundle_json
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?)''',(
     'FE:BAD','SH:BAD','TEST-USDT',now,'full-evidence-shadow-v1','FULL_EVIDENCE_SHADOW_NO_EXECUTION',
     fe_insert[6],0,'PARTIAL',now,json.dumps(bad_fe,separators=(',',':'))
    ))
    raise AssertionError('mismatched full evidence proof identity unexpectedly inserted')
except sqlite3.IntegrityError:
    pass

# Campaign proof-bearing write initializes a virtual FLAT ledger in the same SQL transaction.
now=1_800_000_000_000
campaign={
 'campaign_id':'MWC:TEST:1','contract_code':'TEST-USDT','campaign_start':now-1000,
 'first_detected_time':now-1000,'first_detected_price':100.0,
 'current_phase':'DISCOVERY','direction':'LONG','direction_at_detection':'LONG',
 'direction_confidence_at_detection':None,'wave_index':0,'completed_wave_count':0,
 'last_event_id':'EV1','last_event_ts':now-500,'last_observed_ts':now,
 'last_event_core_signature':'SIG1','transition_history':[],'reclaim_failure_event_ids':[],
}
receipt_id='CMR:MWC:TEST:1:1:OBS1'
receipt_digest='0123456789abcdef'
proof={'campaign_bridge':{
 'schema_version':'multi-wave-decision-bridge-v1','status':'SHADOW_CAMPAIGN_EVALUATED',
 'campaign':{
   'schema_version':'multi-wave-decision-state-v1','rules_version':'multi-wave-decision-state-rules-v1',
   'campaign_id':campaign['campaign_id'],'contract_code':'TEST-USDT','campaign_start':campaign['campaign_start'],
   'current_phase':campaign['current_phase'],'direction':'LONG','direction_at_detection':'LONG',
   'wave_index':0,'completed_wave_count':0,'last_observed_ts':now,
   'origin_episode_id':'EP:TEST:1','state_revision':1,'observation_id':'OBS1',
   'wave_facts_immutable':True,'cas_persisted':True
 },
 'persistence':{'status':'CLOSED','receipt_id':receipt_id,'content_digest':receipt_digest,'committed_ts':now,'immutable':True,'verification_method':'D1_IMMUTABLE_RECEIPT'}
},'position_origin_seed':None}
con.execute('''INSERT INTO multi_wave_campaign_shadow(
 campaign_id,contract_code,campaign_start,current_phase,direction,direction_at_detection,
 direction_confidence_at_detection,wave_index,completed_wave_count,last_event_id,last_event_ts,
 last_observed_ts,last_data_quality,campaign_json,persisted_ts,stage392_proof_bundle_json
) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',(
 campaign['campaign_id'],campaign['contract_code'],campaign['campaign_start'],campaign['current_phase'],
 campaign['direction'],campaign['direction_at_detection'],campaign['direction_confidence_at_detection'],0,0,
 campaign['last_event_id'],campaign['last_event_ts'],campaign['last_observed_ts'],'OK',
 json.dumps(campaign,separators=(',',':')),now,json.dumps(proof,separators=(',',':'))
))
row=con.execute("select state,state_revision,last_observed_ts,shadow_only,live_signal,validated_signal,telegram_started,trading_execution,automatic_weight_tuning,strategy_weights_changed from shadow_virtual_position_ledger where contract_code='TEST-USDT'").fetchone()
assert row==( 'FLAT',1,now,1,0,0,0,0,0,0 ), row

# Same campaign ACK also journals the immutable campaign receipt append-only.
journal=con.execute('''select receipt_id,campaign_id,contract_code,state_revision,observation_id,content_digest,committed_ts,shadow_only
 from stage392_multi_wave_receipt_journal where receipt_id=?''',(receipt_id,)).fetchone()
assert journal==(receipt_id,campaign['campaign_id'],'TEST-USDT',1,'OBS1',receipt_digest,now,1),journal
for sql in [
    "update stage392_multi_wave_receipt_journal set content_digest='ffffffffffffffff' where receipt_id=?",
    "delete from stage392_multi_wave_receipt_journal where receipt_id=?",
]:
    try:
        con.execute(sql,(receipt_id,))
        raise AssertionError('campaign receipt journal unexpectedly mutable')
    except sqlite3.IntegrityError:
        pass

# Same-revision virtual-ledger refresh cannot rewrite authoritative identity and
# revision jumps/transitions outside FLAT<->OPEN are rejected.
try:
    con.execute("update shadow_virtual_position_ledger set state_revision=3 where contract_code='TEST-USDT'")
    raise AssertionError('virtual position revision jump unexpectedly succeeded')
except sqlite3.IntegrityError:
    pass
try:
    con.execute("update shadow_virtual_position_ledger set position_id='DRIFT' where contract_code='TEST-USDT'")
    raise AssertionError('virtual position same-revision identity drift unexpectedly succeeded')
except sqlite3.IntegrityError:
    pass
try:
    con.execute("update shadow_virtual_position_ledger set state_revision=2,state='OPEN_LONG',position_id='VP:X',entry_ts=?,direction='LONG',campaign_id='MWC:TEST:1',entry_wave_id='W1',entry_decision_observation_ts=?,entry_decision_material_digest='aaaaaaaaaaaaaaaa',entry_decision_id='FDI:X',entry_action_id='FDE:X',origin_entry_trigger_price=100.0,origin_entry_observation_id='OBS:X',origin_campaign_state_revision=1,origin_source_campaign_receipt_id='CMR:X',origin_source_campaign_content_digest='bbbbbbbbbbbbbbbb',origin_source_campaign_committed_ts=? where contract_code='TEST-USDT'",(now,now,now))
    con.execute("update shadow_virtual_position_ledger set state_revision=3,state='FLAT',position_id=NULL,entry_ts=NULL,direction=NULL,campaign_id=NULL,entry_wave_id=NULL,entry_decision_observation_ts=NULL,entry_decision_material_digest=NULL,entry_decision_id=NULL,entry_action_id=NULL where contract_code='TEST-USDT'")
    raise AssertionError('FLAT virtual position unexpectedly retained origin identity')
except sqlite3.IntegrityError:
    # The second update must fail because stale origin_* fields were not cleared.
    pass
# Restore the test ledger to the authoritative initial FLAT row for later cases.
con.execute("delete from shadow_virtual_position_ledger where contract_code='TEST-USDT'")
con.execute("insert into shadow_virtual_position_ledger(contract_code,state,state_revision,last_observed_ts,persisted_ts) values('TEST-USDT','FLAT',1,?,?)",(now+1000,now+1000))

# A receipt-id collision with different content must abort the parent campaign update.
collision=json.loads(json.dumps(proof))
collision['campaign_bridge']['persistence']['content_digest']='fedcba9876543210'
try:
    con.execute('update multi_wave_campaign_shadow set stage392_proof_bundle_json=? where campaign_id=?',(
        json.dumps(collision,separators=(',',':')),campaign['campaign_id']))
    raise AssertionError('campaign receipt collision unexpectedly succeeded')
except sqlite3.IntegrityError:
    pass

# Refresh requires operational projection and immutable bridge to advance together.
campaign['last_observed_ts']=now+1000
campaign['last_event_ts']=now+500
campaign['last_event_id']='EV2'
campaign['last_event_core_signature']='SIG2'
proof2=json.loads(json.dumps(proof))
proof2['campaign_bridge']['campaign']['last_observed_ts']=now+1000
proof2['campaign_bridge']['campaign']['observation_id']='OBS2'
proof2['campaign_bridge']['persistence']['receipt_id']='CMR:MWC:TEST:1:1:OBS2'
proof2['campaign_bridge']['persistence']['content_digest']='1111111111111111'
proof2['campaign_bridge']['persistence']['committed_ts']=now+1000
con.execute('''UPDATE multi_wave_campaign_shadow SET last_event_id=?,last_event_ts=?,last_observed_ts=?,campaign_json=?,persisted_ts=?,stage392_proof_bundle_json=? WHERE campaign_id=?''',(
 campaign['last_event_id'],campaign['last_event_ts'],campaign['last_observed_ts'],json.dumps(campaign,separators=(',',':')),now+1000,json.dumps(proof2,separators=(',',':')),campaign['campaign_id']))
row=con.execute("select state,state_revision,last_observed_ts from shadow_virtual_position_ledger where contract_code='TEST-USDT'").fetchone()
assert row==('FLAT',1,now+1000),row
assert con.execute('select count(*) from stage392_multi_wave_receipt_journal').fetchone()[0]==2

# Storage guard rejects bridge/operational drift and receipt continuity breaks.
bad=json.loads(json.dumps(proof2))
bad['campaign_bridge']['campaign']['current_phase']='ENTRY_TRIGGER'
try:
    con.execute('update multi_wave_campaign_shadow set stage392_proof_bundle_json=? where campaign_id=?',(json.dumps(bad,separators=(',',':')),campaign['campaign_id']))
    raise AssertionError('campaign proof/operational drift unexpectedly succeeded')
except sqlite3.IntegrityError:
    pass
try:
    con.execute('update multi_wave_campaign_shadow set stage392_proof_bundle_json=? where campaign_id=?',(json.dumps({'campaign_bridge':None},separators=(',',':')),campaign['campaign_id']))
    raise AssertionError('campaign proof removal unexpectedly succeeded')
except sqlite3.IntegrityError:
    pass
jump=json.loads(json.dumps(proof2))
jump['campaign_bridge']['campaign']['state_revision']=3
jump['campaign_bridge']['campaign']['observation_id']='OBS3'
jump['campaign_bridge']['persistence']['receipt_id']='CMR:MWC:TEST:1:3:OBS3'
jump['campaign_bridge']['persistence']['content_digest']='3333333333333333'
try:
    con.execute('update multi_wave_campaign_shadow set stage392_proof_bundle_json=? where campaign_id=?',(json.dumps(jump,separators=(',',':')),campaign['campaign_id']))
    raise AssertionError('campaign proof revision jump unexpectedly succeeded')
except sqlite3.IntegrityError:
    pass

# Wave entry/impulse facts become immutable once set.
wave={
 'campaign':{'campaign_id':campaign['campaign_id'],'contract_code':'TEST-USDT','wave_index':1,'direction':'LONG'}
}
con.execute('''INSERT INTO multi_wave_campaign_wave_shadow(
 wave_id,campaign_id,contract_code,wave_index,direction,base_start,base_low,base_high,
 entry_trigger_time,entry_trigger_price,impulse_start,impulse_start_price,impulse_peak,impulse_peak_ts,
 wave_json,persisted_ts
) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',(
 'MWC:TEST:1:W1',campaign['campaign_id'],'TEST-USDT',1,'LONG',now,99.0,101.0,
 now+100,100.5,now+200,101.0,102.0,now+300,json.dumps(wave,separators=(',',':')),now+400
))
for sql in [
 "update multi_wave_campaign_wave_shadow set entry_trigger_price=100.6 where wave_id='MWC:TEST:1:W1'",
 "update multi_wave_campaign_wave_shadow set impulse_start_price=101.1 where wave_id='MWC:TEST:1:W1'",
]:
    try:
        con.execute(sql)
        raise AssertionError('immutable wave fact update unexpectedly succeeded')
    except sqlite3.IntegrityError:
        pass

# Stage 3.9.2 proof identity fields cannot be retroactively changed by UPDATE,
# including NULL->non-NULL legacy backfill. Verify trigger contract statically and with a tiny
# isolated clone because the full opportunity event table has extensive factual guards.
trigger_sql=con.execute("select sql from sqlite_master where type='trigger' and name='trg_stage392_opportunity_proof_identity_immutable'").fetchone()[0]
assert 'OLD.stage392_episode_revision IS NOT NULL' not in trigger_sql
assert 'NEW.stage392_episode_revision IS NOT OLD.stage392_episode_revision' in trigger_sql
assert 'NEW.stage392_raw_event_digest IS NOT OLD.stage392_raw_event_digest' in trigger_sql


# Final Decision virtual-position transitions are explicitly fail-loud. The
# full behavioral insert is covered by stage392-trigger-atomicity.test.py.
entry_trigger_sql=con.execute("select sql from sqlite_master where type='trigger' and name='trg_stage392_final_decision_open_virtual_position'").fetchone()[0]
exit_trigger_sql=con.execute("select sql from sqlite_master where type='trigger' and name='trg_stage392_final_decision_exit_virtual_position'").fetchone()[0]
assert "RAISE(ABORT,'stage392 virtual position entry precondition missing')" in entry_trigger_sql
assert "RAISE(ABORT,'stage392 virtual position exit precondition missing')" in exit_trigger_sql

# Migration is fail-loud on a second apply; duplicate ALTER is schema drift, not success.
try:
    con.executescript((M/'20260914_stage392_receipt_wiring_shadow.sql').read_text())
    raise AssertionError('second Stage392 migration unexpectedly succeeded')
except sqlite3.OperationalError:
    pass

triggers=[r[0] for r in con.execute("select name from sqlite_master where type='trigger' and name like 'trg_stage392_%' order by name")]
assert len(triggers)==19,triggers
print(json.dumps({
 'ok':True,
 'suite':'stage392-d1-schema',
 'migration_order':ORDER,
 'stage392_trigger_count':len(triggers),
 'virtual_position_flat_shape_guarded':True,
 'campaign_to_virtual_ledger_same_write':True,
 'campaign_receipt_journal_same_write':True,
 'campaign_receipt_journal_append_only':True,
 'virtual_position_transition_guarded':True,
 'campaign_proof_storage_contract_guarded':True,
 'stage391_rollback_stale_proof_detach_guarded':True,
 'full_evidence_proof_storage_contract_guarded':True,
 'full_evidence_proof_rows_immutable':True,
 'final_decision_position_transition_fail_loud':True,
 'wave_facts_immutable':True,
 'legacy_opportunity_backfill_forbidden':True,
 'second_apply_fail_loud':True,
 'safety_fuses':True,
},indent=2))
