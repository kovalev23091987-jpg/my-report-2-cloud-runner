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
for name in ORDER: con.executescript((M/name).read_text())
now=1_800_000_000_000

def campaign_obj(cid,phase='ENTRY_TRIGGER',obs=now,proof=False,contract='TEST-USDT'):
    return {
      'campaign_id':cid,'contract_code':contract,'campaign_start':now-10000,
      'first_detected_time':now-10000,'first_detected_price':100.0,
      'current_phase':phase,'direction':'LONG','direction_at_detection':'LONG',
      'direction_confidence_at_detection':0.7,'wave_index':1,'completed_wave_count':0,
      'base_start':now-9000,'base_low':98.0,'base_high':102.0,
      'entry_trigger_time':now-8000,'entry_trigger_price':100.0,
      'impulse_start':None,'impulse_start_price':None,'impulse_peak_price':None,'impulse_peak_ts':None,
      'last_event_id':'EV1','last_event_ts':now-1000,'last_observed_ts':obs,
      'last_event_core_signature':'SIG1','transition_history':[],'reclaim_failure_event_ids':[],
    }

def proof_bundle(c,rev=1,oid='OBS1'):
    rid=f"CMR:{c['campaign_id']}:{rev}:{oid}"
    return {'campaign_bridge':{
      'schema_version':'multi-wave-decision-bridge-v1','status':'SHADOW_CAMPAIGN_EVALUATED',
      'campaign':{
        'schema_version':'multi-wave-decision-state-v1','rules_version':'multi-wave-decision-state-rules-v1',
        'campaign_id':c['campaign_id'],'contract_code':c['contract_code'],'campaign_start':c['campaign_start'],
        'current_phase':c['current_phase'],'direction':c['direction'],'direction_at_detection':c['direction_at_detection'],
        'wave_index':c['wave_index'],'completed_wave_count':c['completed_wave_count'],'last_observed_ts':c['last_observed_ts'],
        'origin_episode_id':'EP:TEST','state_revision':rev,'observation_id':oid,'wave_facts_immutable':True,'cas_persisted':True,
      },
      'persistence':{'status':'CLOSED','receipt_id':rid,'content_digest':'0123456789abcdef','committed_ts':c['last_observed_ts'],'immutable':True,'verification_method':'D1_IMMUTABLE_RECEIPT'}
    },'position_origin_seed':None}

def insert_campaign(c, proof=None):
    con.execute('''INSERT INTO multi_wave_campaign_shadow(
      campaign_id,contract_code,campaign_start,current_phase,direction,direction_at_detection,
      direction_confidence_at_detection,wave_index,completed_wave_count,base_start,base_low,base_high,
      entry_trigger_time,entry_trigger_price,last_event_id,last_event_ts,last_observed_ts,last_data_quality,
      campaign_json,persisted_ts,stage392_proof_bundle_json
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',(
      c['campaign_id'],c['contract_code'],c['campaign_start'],c['current_phase'],c['direction'],c['direction_at_detection'],
      c['direction_confidence_at_detection'],c['wave_index'],c['completed_wave_count'],c['base_start'],c['base_low'],c['base_high'],
      c['entry_trigger_time'],c['entry_trigger_price'],c['last_event_id'],c['last_event_ts'],c['last_observed_ts'],'OK',
      json.dumps(c,separators=(',',':')),c['last_observed_ts'],None if proof is None else json.dumps(proof,separators=(',',':'))
    ))

def wave_json(c):
    return json.dumps({'campaign':{'campaign_id':c['campaign_id'],'contract_code':c['contract_code'],'wave_index':1,'direction':'LONG'}},separators=(',',':'))

def insert_wave(c):
    wid=c['campaign_id']+':W1'
    con.execute('''INSERT INTO multi_wave_campaign_wave_shadow(
      wave_id,campaign_id,contract_code,wave_index,direction,base_start,base_low,base_high,
      entry_trigger_time,entry_trigger_price,wave_json,persisted_ts
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)''',(
      wid,c['campaign_id'],c['contract_code'],1,'LONG',c['base_start'],c['base_low'],c['base_high'],
      c['entry_trigger_time'],c['entry_trigger_price'],wave_json(c),now
    ))
    return wid

# 1) Stage391 legacy/unproven campaign remains writable after Stage392 schema migration.
legacy=campaign_obj('MW:LEGACY:1')
insert_campaign(legacy,None)
wid=insert_wave(legacy)
# Simulate legacy runtime moving the same W1 into a reload base: old runtime rewrites base_*.
con.execute('''UPDATE multi_wave_campaign_wave_shadow SET base_start=?,base_low=?,base_high=?,persisted_ts=? WHERE wave_id=?''',
            (now,99.0,103.0,now+1000,wid))
assert con.execute('select base_start,base_low,base_high from multi_wave_campaign_wave_shadow where wave_id=?',(wid,)).fetchone()==(now,99.0,103.0)
# Legacy campaign phase update also remains possible while proof is NULL.
legacy2=dict(legacy); legacy2['current_phase']='IMPULSE'; legacy2['last_event_id']='EV2'; legacy2['last_event_ts']=now; legacy2['last_observed_ts']=now+1000; legacy2['last_event_core_signature']='SIG2'
con.execute('''UPDATE multi_wave_campaign_shadow SET current_phase=?,last_event_id=?,last_event_ts=?,last_observed_ts=?,campaign_json=?,persisted_ts=? WHERE campaign_id=?''',
            (legacy2['current_phase'],legacy2['last_event_id'],legacy2['last_event_ts'],legacy2['last_observed_ts'],json.dumps(legacy2,separators=(',',':')),now+1000,legacy2['campaign_id']))

# 2) Proof-bearing Stage392 campaign keeps wave origin immutable.
proven=campaign_obj('MW:PROVEN:1',obs=now+2000,contract='PROVEN-USDT')
insert_campaign(proven,proof_bundle(proven))
pwid=insert_wave(proven)
try:
    con.execute('update multi_wave_campaign_wave_shadow set base_low=97.0 where wave_id=?',(pwid,))
    raise AssertionError('proof-bearing wave origin unexpectedly mutable')
except sqlite3.IntegrityError as e:
    assert 'stage392 immutable wave entry facts' in str(e)

# 3) A real rollback to the Stage 3.9.1 Worker after Stage 3.9.2 has already
# created a proof-bearing campaign must remain operational. The old Worker does
# not know stage392_proof_bundle_json, so an ordinary campaign projection update
# leaves the old receipt byte-identical. Storage must atomically DETACH that now-
# stale proof (fail closed) while preserving the immutable journal receipt.
rollback=campaign_obj('MW:ROLLBACK:1',obs=now+3000,contract='ROLLBACK-USDT')
rollback_proof=proof_bundle(rollback)
insert_campaign(rollback,rollback_proof)
rwid=insert_wave(rollback)
receipt_id=rollback_proof['campaign_bridge']['persistence']['receipt_id']
assert con.execute('select count(*) from stage392_multi_wave_receipt_journal where receipt_id=?',(receipt_id,)).fetchone()[0]==1
# Direct removal while the receipt still exactly matches the projection is forbidden.
try:
    con.execute('update multi_wave_campaign_shadow set stage392_proof_bundle_json=NULL where campaign_id=?',(rollback['campaign_id'],))
    raise AssertionError('valid proof removal unexpectedly allowed')
except sqlite3.IntegrityError as e:
    assert 'proof removal forbidden' in str(e)
# Simulate the exact kind of Stage391 projection advance: operational fields and
# campaign_json change, the unknown Stage392 proof column is untouched.
rollback2=dict(rollback)
rollback2['current_phase']='RELOAD_BASE'
rollback2['last_observed_ts']=now+4000
rollback2['last_event_ts']=now+4000
rollback2['last_event_id']='EV-ROLLBACK-2'
rollback2['base_start']=now+4000
rollback2['base_low']=99.0
rollback2['base_high']=103.0
con.execute('''UPDATE multi_wave_campaign_shadow SET current_phase=?,base_start=?,base_low=?,base_high=?,last_event_id=?,last_event_ts=?,last_observed_ts=?,campaign_json=?,persisted_ts=? WHERE campaign_id=?''',(
    rollback2['current_phase'],rollback2['base_start'],rollback2['base_low'],rollback2['base_high'],rollback2['last_event_id'],rollback2['last_event_ts'],rollback2['last_observed_ts'],json.dumps(rollback2,separators=(',',':')),now+4000,rollback2['campaign_id']))
assert con.execute('select stage392_proof_bundle_json from multi_wave_campaign_shadow where campaign_id=?',(rollback['campaign_id'],)).fetchone()[0] is None
# The immutable factual receipt survives the rollback degradation.
assert con.execute('select receipt_id from stage392_multi_wave_receipt_journal where receipt_id=?',(receipt_id,)).fetchone()[0]==receipt_id
# The next Stage391 wave UPSERT/update is now allowed because current projection
# is explicitly LEGACY_UNPROVEN rather than carrying a stale proof.
con.execute('update multi_wave_campaign_wave_shadow set base_start=?,base_low=?,base_high=?,persisted_ts=? where wave_id=?',
            (now+4000,99.0,103.0,now+4000,rwid))
assert con.execute('select base_start,base_low,base_high from multi_wave_campaign_wave_shadow where wave_id=?',(rwid,)).fetchone()==(now+4000,99.0,103.0)

# 4) Candidate runtime itself must preserve already-persisted wave origin fields on UPSERT.
runtime=(ROOT/'src/multi-wave-campaign-runtime.mjs').read_text()
for field in ('base_start','base_low','base_high','entry_trigger_time','entry_trigger_price','impulse_start','impulse_start_price'):
    expected=f'{field}=COALESCE(multi_wave_campaign_wave_shadow.{field},excluded.{field})'
    assert expected in runtime, expected

print(json.dumps({
 'ok':True,
 'suite':'stage392-wave-lifecycle-backcompat',
 'stage391_legacy_schema_backcompat':True,
 'proof_bearing_wave_origin_immutable':True,
 'candidate_reload_does_not_rewrite_wave_origin':True,
 'stage391_rollback_after_proof_detaches_stale_projection':True,
 'immutable_receipt_journal_survives_rollback':True,
},indent=2))
