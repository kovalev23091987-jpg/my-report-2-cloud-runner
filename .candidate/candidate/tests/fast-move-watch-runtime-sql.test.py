#!/usr/bin/env python3
import json, re, sqlite3
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent
runtime=(ROOT/'src'/'fast-move-watch-runtime.mjs').read_text(encoding='utf-8')
base=(ROOT/'migrations'/'20260913_fast_move_watch_shadow.sql').read_text(encoding='utf-8')
hard=(ROOT/'migrations'/'20260913_fast_move_watch_hardening.sql').read_text(encoding='utf-8')

def sql_in_function(name, occurrence=0):
    m=re.search(rf'(?:async\s+)?function\s+{re.escape(name)}\b[\s\S]*?(?=\n(?:async\s+)?function\s+|\nexport\s+async\s+function\s+|\Z)', runtime)
    assert m, name
    snippets=re.findall(r'prepare\(`([\s\S]*?)`\)', m.group(0))
    assert len(snippets)>occurrence, (name,len(snippets))
    return snippets[occurrence]

state_sql=sql_in_function('stateStatement')
queue_sql=sql_in_function('queueStatement')
event_sql=sql_in_function('eventStatement')
gen_open_sql=sql_in_function('generationOpenStatement')
gen_close_sql=sql_in_function('generationCloseStatement')
defer_sql=sql_in_function('persistDeferredCounters').replace('${clauses.join(" OR ")}', '(contract=?1 AND generation=?2) OR (contract=?3 AND generation=?4)')
cleanup_sql=sql_in_function('cleanupOldEvents')

db=sqlite3.connect(':memory:')
db.executescript(base); db.executescript(hard)
MODE='FAST_MOVE_WATCH_SHADOW_NO_EXECUTION'
ENGINE='fast-move-watch-hardening-v3'
T=1_800_000_000_000

def state_args(
    contract, generation=1, state='PRE_SQUEEZE', created=T, updated=T,
    due=T+900_000, deferral=0, missed=0, cap=16, event_id=None,
    expected=None, lease_owner=None, require_lease=0, lease_now=0,
):
    values = (
        contract,generation,ENGINE,MODE,state,None,created,created,updated,None,due,T+86_400_000,
        T-1000,event_id or f'evt:{contract}:{generation}','TEST','ACTIVE','ACTIVE','CURRENT',0,deferral,missed,
        '{}','UNKNOWN','NONE',1,'[]',None,
    )
    expected_generation, expected_updated, expected_event = expected or (None, None, None)
    return values + (
        cap, expected_generation, expected_updated, expected_event,
        lease_owner, require_lease, lease_now,
    )

def queue_args(
    contract, generation, due, state_token, *, status='PENDING', created=T,
    updated=T, preserve=1, lease_owner=None, require_lease=0, lease_now=T,
    deferral=0,
):
    return (
        contract,generation,due,'ACTIVE',0,deferral,status,
        f'{contract}:{generation}',created,updated,state_token,preserve,
        lease_owner,require_lease,lease_now,
    )

def upsert(*args):
    cur=db.execute(state_sql,args); db.commit(); return cur.rowcount

assert upsert(*state_args('A-USDT')) == 1
assert db.execute("SELECT generation,created_ts FROM fast_move_watch_state WHERE contract='A-USDT'").fetchone()==(1,T)
# Same active generation updates even when capacity becomes full.
for i in range(1,16): assert upsert(*state_args(f'C{i}-USDT')) == 1
assert db.execute("SELECT COUNT(*) FROM fast_move_watch_state WHERE lifecycle_state NOT IN ('EXPIRED','CLOSED')").fetchone()[0]==16
assert upsert(*state_args('OVER-USDT')) == 0
assert upsert(*state_args('A-USDT',updated=T+1,due=T+800_000,expected=(1,T,'evt:A-USDT:1'))) == 1
# Terminal transition same generation must be allowed at the cap.
assert upsert(*state_args('A-USDT',state='EXPIRED',updated=T+2,due=None,expected=(1,T+1,'evt:A-USDT:1'))) == 1
assert db.execute("SELECT lifecycle_state FROM fast_move_watch_state WHERE contract='A-USDT'").fetchone()[0]=='EXPIRED'
# Re-entry generation 2 is admitted after one active slot opens, and created_ts refreshes.
T2=T+3_700_000
args=list(state_args(
    'A-USDT',generation=2,created=T2,updated=T2,due=T2+900_000,
    expected=(1,T+2,'evt:A-USDT:1'),event_id='evt:A-USDT:2',
)); args[11]=T2+86_400_000; args[12]=T2-1000
assert upsert(*args)==1
assert db.execute("SELECT generation,created_ts FROM fast_move_watch_state WHERE contract='A-USDT'").fetchone()==(2,T2)

# Dependent writes are accepted only for the admitted exact generation.
q=queue_args('A-USDT',2,T2+900_000,'evt:A-USDT:2',created=T2,updated=T2,lease_now=T2)
assert db.execute(queue_sql,q).rowcount==1
assert db.execute(queue_sql,queue_args('A-USDT',99,T2+900_000,'evt:A-USDT:99',created=T2,updated=T2,lease_now=T2)).rowcount==0

ev=("open:A:2","A-USDT",2,ENGINE,T2,T2-1000,"EXPIRED","PRE_SQUEEZE","NEW_DISCOVERY_CONFIRMED","[]","CLOSED","UNKNOWN","UNKNOWN",'evt:A-USDT:2')
assert db.execute(event_sql,ev).rowcount==1
assert db.execute(event_sql,("bad","A-USDT",99,ENGINE,T2,T2,"NONE","PRE_SQUEEZE","BAD","[]","CLOSED","UNKNOWN","UNKNOWN",'evt:A-USDT:99')).rowcount==0
assert db.execute(gen_open_sql,("A-USDT",2,ENGINE,T2,"open:A:2","NEW_DISCOVERY_CONFIRMED",'evt:A-USDT:2')).rowcount==1

# Fairness update accepts a bounded exact contract+generation predicate.
defer_sql=defer_sql.replace('?${nowParameter}', '?5')
db.execute("UPDATE fast_move_recheck_queue SET due_ts=?,status='PENDING',lease_owner=NULL,lease_expires_ts=NULL WHERE contract='A-USDT' AND generation=2",(T2-1,))
assert db.execute(defer_sql,("A-USDT",2,"C1-USDT",1,T2)).rowcount==1
row=db.execute("SELECT deferral_count,missed_due_count FROM fast_move_watch_state WHERE contract='A-USDT'").fetchone()
assert row==(1,1),row

# Terminal generation close SQL is valid and idempotent via COALESCE.
db.execute("UPDATE fast_move_watch_state SET lifecycle_state='EXPIRED',updated_ts=?,last_event_id=? WHERE contract='A-USDT'",(T2+1000,'terminal:A:2'))
assert db.execute(gen_close_sql,("A-USDT",2,T2+1000,"EXPIRED","TEST_CLOSE",'terminal:A:2')).rowcount==1
assert db.execute(gen_close_sql,("A-USDT",2,T2+2000,"CLOSED","OTHER",'terminal:A:2')).rowcount==1
closed=db.execute("SELECT closed_ts,final_state,closure_reason FROM fast_move_watch_generation WHERE contract='A-USDT' AND generation=2").fetchone()
assert closed==(T2+1000,'EXPIRED','TEST_CLOSE'),closed

# An unexpired lease survives a concurrent discovery queue upsert and cannot be
# claimed by a second scheduler.
lease_contract='LEASED-USDT'
lease_event='lease:before'
assert upsert(*state_args(lease_contract,event_id=lease_event))==1
assert db.execute(queue_sql,queue_args(lease_contract,1,T-1,lease_event)).rowcount==1
db.execute("""
  UPDATE fast_move_recheck_queue
  SET status='LEASED',lease_owner='run-A',lease_expires_ts=?,updated_ts=?
  WHERE contract=? AND generation=1
""",(T+600_000,T,lease_contract))
new_lease_event='lease:discovery'
assert upsert(*state_args(
    lease_contract,updated=T+1,event_id=new_lease_event,
    expected=(1,T,lease_event),
))==1
assert db.execute(queue_sql,queue_args(
    lease_contract,1,T+900_000,new_lease_event,updated=T+1,
    preserve=1,lease_now=T+1,
)).rowcount==1
lease_row=db.execute("""
  SELECT status,lease_owner,lease_expires_ts
  FROM fast_move_recheck_queue WHERE contract=? AND generation=1
""",(lease_contract,)).fetchone()
assert lease_row==('LEASED','run-A',T+600_000),lease_row
second_claim=db.execute("""
  UPDATE fast_move_recheck_queue
  SET status='LEASED',lease_owner='run-B',lease_expires_ts=?,updated_ts=?
  WHERE contract=? AND generation=1 AND status='PENDING' AND due_ts<=?
    AND (lease_expires_ts IS NULL OR lease_expires_ts<=?)
""",(T+600_001,T+1,lease_contract,T+1,T+1)).rowcount
assert second_claim==0,second_claim

# A stale state snapshot and a foreign finalizer both fail closed.  The exact
# current lease owner can commit and release only its own lease.
assert upsert(*state_args(
    lease_contract,updated=T+2,event_id='lease:stale-write',
    expected=(1,T,lease_event),
))==0
assert upsert(*state_args(
    lease_contract,updated=T+2,event_id='lease:foreign-finalizer',
    expected=(1,T+1,new_lease_event),lease_owner='run-B',require_lease=1,lease_now=T+2,
))==0
final_event='lease:finalized'
assert upsert(*state_args(
    lease_contract,updated=T+2,event_id=final_event,
    expected=(1,T+1,new_lease_event),lease_owner='run-A',require_lease=1,lease_now=T+2,
))==1
assert db.execute(queue_sql,queue_args(
    lease_contract,1,T+900_000,final_event,updated=T+2,preserve=0,
    lease_owner='run-A',require_lease=1,lease_now=T+2,
)).rowcount==1
released=db.execute("""
  SELECT status,lease_owner,lease_expires_ts
  FROM fast_move_recheck_queue WHERE contract=? AND generation=1
""",(lease_contract,)).fetchone()
assert released==('PENDING',None,None),released

# Cleanup is bounded to 100 rows.
for i in range(150):
    db.execute("INSERT INTO fast_move_watch_event(event_id,contract,generation,engine_version,observed_ts,from_state,to_state,reason_code,evidence_ids_json,evidence_status,projected_liquidation_status,realized_liquidation_status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
               (f'old:{i}','C1-USDT',1,ENGINE,T-200*86_400_000-i,'X','Y','OLD','[]','CLOSED','UNKNOWN','UNKNOWN'))
db.commit()
assert db.execute(cleanup_sql,(T-180*86_400_000,100)).rowcount==100
remaining=db.execute("SELECT COUNT(*) FROM fast_move_watch_event WHERE event_id LIKE 'old:%'").fetchone()[0]
assert remaining==50,remaining

print(json.dumps({
  'ok':True,'suite':'fast-move-watch-runtime-sql',
  'state_upsert_sql_valid':True,'hard_cap_16':True,'same_generation_update_at_cap':True,
  'terminal_transition_at_cap':True,'reentry_refreshes_created_ts':True,
  'dependent_generation_guards':True,'fairness_sql_valid':True,'generation_close_idempotent':True,
  'active_lease_preserved':True,'double_claim_rejected':True,
  'optimistic_state_cas':True,'lease_owner_finalize_guard':True,
  'cleanup_batch_bound':100,
},ensure_ascii=False,indent=2))
