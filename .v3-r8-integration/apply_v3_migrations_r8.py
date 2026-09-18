#!/usr/bin/env python3
from __future__ import annotations
import hashlib, json, os, pathlib, sqlite3, sys, urllib.error, urllib.request

BASE_MAIN='26bf598affe96e224a65df522c80d85779ed3c13'
R8_WORKER_SHA='72f0cab80ac9c38c4b3a84116b40c16fb54d5944ce20e1da2b6c399a386bc36c'
MIGRATIONS=[
 ('20260917_v3_data_plane_shadow.sql','ab518bc6fde8e3a61bb589ece9530acef4f5f0f49504b491acbb1ce8ab40e249',10),
 ('20260917_v3_early_discovery_shadow.sql','9dadc72e3b5905285b64fc93239d543fe21529dd4477339535970d2f7249889e',6),
 ('20260917_v3_live_handoff_shadow.sql','8e602f2bc846a7d321f94620d9152f52b0c078b05a34a08b76d21d62bc241dc2',4),
 ('20260917_v3_live_handoff_wiring_shadow.sql','1ef8b2487223b75cc189b9a60078e9c90d948e6994c9139270ae791d24dfc256',29),
 ('20260917_v3_telegram_lifecycle_shadow.sql','7a4e2659387cb39b829a6646f1f2793ac89cd50ba299df529d0a2fabfa62dbb0',7),
 ('20260917_v3_cron_pipeline_telemetry_shadow.sql','a74e24a34f86795930b20cf84995f6741b1abc37f8420296318c4ad551eb4bb0',8),
]
GROUPS={
 '20260917_v3_data_plane_shadow.sql': {'objects':['v3_source_health_1m','idx_v3_source_health_venue_ts','v3_realized_liquidation_aggregate','idx_v3_realized_liq_contract_ts','v3_realized_liquidation_density_5m','idx_v3_realized_density_contract_ts','v3_projected_cluster_lifecycle_shadow','idx_v3_projected_cluster_contract_seen','v3_market_microstructure_1m','idx_v3_market_micro_contract_ts']},
 '20260917_v3_early_discovery_shadow.sql': {'objects':['v3_early_feature_snapshot','idx_v3_early_feature_ts','v3_early_candidate_wave','idx_v3_early_candidate_contract_seen','v3_early_outcome_journal','idx_v3_early_outcome_due']},
 '20260917_v3_live_handoff_shadow.sql': {'objects':['v3_discovery_deep_handoff_shadow','idx_v3_handoff_pending','idx_v3_handoff_contract','idx_v3_handoff_wave']},
 '20260917_v3_live_handoff_wiring_shadow.sql': {
  'objects':['idx_deep_check_scheduler_v3_handoff','idx_deep_check_run_log_v3_handoff','trg_v3_handoff_scheduler_insert_claim','trg_v3_handoff_scheduler_update_claim','trg_v3_handoff_scheduler_finalize'],
  'columns':{
    'deep_check_scheduler_state':['v3_handoff_id','v3_handoff_logical_key','v3_scan_ts','v3_base_ticker','v3_discovery_rank','v3_detectors_json','v3_evidence_ids_json','v3_first_seen_state_json','v3_current_state_json','v3_direction','v3_wave_id','v3_dedup_reentry_key'],
    'deep_check_run_log':['v3_handoff_id','v3_handoff_logical_key','v3_scan_ts','v3_base_ticker','v3_discovery_rank','v3_detectors_json','v3_evidence_ids_json','v3_first_seen_state_json','v3_current_state_json','v3_direction','v3_wave_id','v3_dedup_reentry_key'],
  }},
 '20260917_v3_telegram_lifecycle_shadow.sql': {'objects':['v3_user_lifecycle_shadow','v3_telegram_dispatch_shadow','idx_v3_dispatch_state_ts','idx_v3_dispatch_wave','v3_pipeline_health_shadow','v3_pipeline_health_event_shadow','idx_v3_pipeline_health_event_state']},
 '20260917_v3_cron_pipeline_telemetry_shadow.sql': {'columns':{'cron_runs':['v3_discovery_shortlist_count','v3_live_shortlist_count','v3_live_deep_check_count','v3_live_zero_reason','v3_pipeline_health_status','v3_pipeline_health_reason','v3_live_lane','v3_maintenance_deferred']}},
}
BASE_TABLES=['cron_runs','deep_check_scheduler_state','deep_check_run_log']
ROOT=pathlib.Path(__file__).resolve().parent
MIG_ROOT=ROOT/'migrations'
FORBIDDEN=('DROP TABLE','DROP COLUMN','DELETE FROM','REPLACE INTO','VACUUM','PRAGMA WRITABLE_SCHEMA')

def sha256(p:pathlib.Path): return hashlib.sha256(p.read_bytes()).hexdigest()
def q(s): return "'"+str(s).replace("'","''")+"'"

def split_sql(text:str,name:str,want:int):
    lines=[ln for ln in text.splitlines() if not ln.lstrip().startswith('--')]
    buf=''; out=[]
    for line in lines:
        if not line.strip() and not buf: continue
        buf += line+'\n'
        if sqlite3.complete_statement(buf): out.append(buf.strip()); buf=''
    if buf.strip(): raise RuntimeError(f'MIGRATION_INCOMPLETE:{name}')
    if len(out)!=want: raise RuntimeError(f'MIGRATION_STATEMENT_COUNT:{name}:want={want}:got={len(out)}')
    for i,s in enumerate(out):
        flat=' '.join(s.split()).upper()
        if not (flat.startswith('CREATE TABLE ') or flat.startswith('CREATE INDEX ') or flat.startswith('CREATE TRIGGER ') or (flat.startswith('ALTER TABLE ') and ' ADD COLUMN ' in flat)):
            raise RuntimeError(f'MIGRATION_NON_ADDITIVE_DDL:{name}:{i}')
        for bad in FORBIDDEN:
            if bad in flat: raise RuntimeError(f'MIGRATION_FORBIDDEN_TOKEN:{name}:{bad}')
    return out

def verify_files():
    for name,want_sha,count in MIGRATIONS:
        p=MIG_ROOT/name
        if not p.is_file(): raise RuntimeError(f'MIGRATION_MISSING:{name}')
        got=sha256(p)
        if got!=want_sha: raise RuntimeError(f'MIGRATION_SHA_MISMATCH:{name}:{got}')
        split_sql(p.read_text(),name,count)

def verify_proof():
    proof=json.loads((ROOT/'R8_NODE24_PASS_PROOF.json').read_text())
    if proof.get('status')!='READY_FOR_CONTROLLED_R8_NOT_DEPLOYED': raise RuntimeError('CI_PROOF_STATUS_NOT_READY')
    if proof.get('base_main')!=BASE_MAIN: raise RuntimeError('CI_PROOF_BASE_MAIN_MISMATCH')
    if proof.get('candidate_worker_sha256')!=R8_WORKER_SHA: raise RuntimeError('CI_PROOF_WORKER_SHA_MISMATCH')
    if proof.get('telegram_lifecycle_persistence_only') is not True or proof.get('telegram_lifecycle_dispatch_enabled') is not True or proof.get('telegram_v3_network_enabled') is not False: raise RuntimeError('R8_TELEGRAM_SHADOW_PROOF_MISSING')
    if proof.get('production_changed') is not False or proof.get('remote_d1_changed') is not False: raise RuntimeError('CI_PROOF_NOT_ISOLATED')
    ready=(ROOT/'NODE24_READINESS_RESULT.txt').read_text()
    for m in ('NODE24=PASS','V3_NODE24_TESTS=PASS','BUILDER_TOTALITY_NODE24=PASS','EXACT_RUNNER_PATCH_DRY_RUN=PASS','FINAL_RESULT=READY_FOR_CONTROLLED_INTEGRATION_NOT_DEPLOYED'):
        if m not in ready: raise RuntimeError('NODE24_PROOF_MISSING:'+m)

class LocalDB:
    def __init__(self,con): self.con=con
    def all(self,sql,params=None):
        cur=self.con.execute(sql,params or []); return [dict(zip([x[0] for x in cur.description or []],r)) for r in cur.fetchall()]
    def batch(self,statements):
        try:
            self.con.execute('BEGIN')
            for s in statements: self.con.execute(s)
            self.con.commit()
        except Exception:
            self.con.rollback(); raise

class RemoteDB:
    def __init__(self):
        self.url=os.environ.get('REPORT2_D1_BRIDGE_URL','').strip(); self.token=os.environ.get('REPORT2_D1_BRIDGE_TOKEN','').strip()
        if not self.url: raise RuntimeError('REPORT2_D1_BRIDGE_URL_REQUIRED')
        if not self.token: raise RuntimeError('REPORT2_D1_BRIDGE_TOKEN_REQUIRED')
        self.requests=0; self.rows_read=0; self.rows_written=0; self.unknown_ops=0
    def _request(self,payload):
        req=urllib.request.Request(self.url,data=json.dumps(payload,separators=(',',':')).encode(),headers={'content-type':'application/json','accept':'application/json','authorization':'Bearer '+self.token,'user-agent':'My-Report-2-V3-R8-Migration/1.0'},method='POST')
        try:
            with urllib.request.urlopen(req,timeout=45) as r: raw=r.read().decode(); status=r.status
        except urllib.error.HTTPError as e:
            raw=e.read().decode(errors='replace'); raise RuntimeError(f'D1_BRIDGE_HTTP_{e.code}:{raw[-1000:]}')
        data=json.loads(raw or '{}')
        if status<200 or status>=300 or data.get('ok') is not True: raise RuntimeError('D1_BRIDGE_FAILURE:'+str(data.get('error') or status))
        usage=data.get('usage') or {}; self.requests+=1
        if usage.get('measured') is True:
            self.rows_read+=int(usage.get('rows_read') or 0); self.rows_written+=int(usage.get('rows_written') or 0)
        elif payload.get('op')=='batch' and isinstance(usage.get('statements'),list):
            for u in usage['statements']:
                if u.get('measured') is True:
                    self.rows_read+=int(u.get('rows_read') or 0); self.rows_written+=int(u.get('rows_written') or 0)
                else: self.unknown_ops+=1
        else: self.unknown_ops+=1
        return data.get('result')
    def all(self,sql,params=None):
        res=self._request({'op':'all','sql':sql,'params':params or []}) or {}
        return res.get('results') or []
    def batch(self,statements):
        return self._request({'op':'batch','statements':[{'sql':s,'params':[]} for s in statements]})
    def usage(self): return {'requests':self.requests,'rows_read':self.rows_read,'rows_written':self.rows_written,'unknown_ops':self.unknown_ops}

def objects(db,names):
    if not names:return set()
    return {str(r.get('name')) for r in db.all(f"SELECT name FROM sqlite_master WHERE name IN ({','.join(q(x) for x in names)})") if r.get('name') is not None}
def columns(db,table): return {str(r.get('name')) for r in db.all(f'PRAGMA table_info("{table}")') if r.get('name') is not None}
def group_status(db,name):
    g=GROUPS[name]; need=have=0
    vals=g.get('objects',[]); need+=len(vals); got=objects(db,vals); have+=sum(x in got for x in vals)
    for table,cols in g.get('columns',{}).items():
        need+=len(cols); got=columns(db,table); have+=sum(x in got for x in cols)
    return ('PENDING',0,need) if have==0 else (('APPLIED',have,need) if have==need else ('PARTIAL_BLOCKED',have,need))
def statuses(db): return {name:group_status(db,name) for name,_,_ in MIGRATIONS}

def make_base(con):
    con.executescript('''
CREATE TABLE cron_runs(run_id TEXT PRIMARY KEY, scheduled_time INTEGER, started_ts INTEGER, completed_ts INTEGER, status TEXT, universe_total INTEGER, scanned INTEGER, persistence_status TEXT, error_text TEXT);
CREATE TABLE deep_check_scheduler_state(contract_code TEXT PRIMARY KEY,last_status TEXT,last_run_id TEXT,last_started_ts INTEGER,last_completed_ts INTEGER,last_error TEXT,updated_ts INTEGER);
CREATE TABLE deep_check_run_log(run_id TEXT PRIMARY KEY,contract_code TEXT);
''')

def self_test():
    verify_proof(); verify_files()
    con=sqlite3.connect(':memory:'); con.row_factory=sqlite3.Row; make_base(con); db=LocalDB(con)
    pre=statuses(db); assert all(v[0]=='PENDING' for v in pre.values()),pre
    total=0
    for name,_,count in MIGRATIONS:
        parts=split_sql((MIG_ROOT/name).read_text(),name,count); total+=len(parts); db.batch(parts); assert group_status(db,name)[0]=='APPLIED',(name,group_status(db,name))
    post=statuses(db); assert all(v[0]=='APPLIED' for v in post.values()),post
    assert total==64,total
    con2=sqlite3.connect(':memory:'); con2.row_factory=sqlite3.Row; make_base(con2); con2.execute('ALTER TABLE cron_runs ADD COLUMN v3_discovery_shortlist_count INTEGER'); con2.commit()
    assert group_status(LocalDB(con2),'20260917_v3_cron_pipeline_telemetry_shadow.sql')[0]=='PARTIAL_BLOCKED'
    print('V3_MIGRATION_SELF_TEST=PASS statements=64')

def main():
    verify_proof(); verify_files()
    if '--self-test' in sys.argv: self_test(); return
    apply='--apply' in sys.argv
    db=RemoteDB(); missing=[x for x in BASE_TABLES if x not in objects(db,BASE_TABLES)]
    if missing: raise RuntimeError('BASE_SCHEMA_MISSING:'+','.join(missing))
    before=statuses(db)
    if any(v[0]=='PARTIAL_BLOCKED' for v in before.values()): raise RuntimeError('PARTIAL_SCHEMA_BLOCKED:'+json.dumps(before,separators=(',',':')))
    print('V3_D1_BEFORE='+json.dumps(before,separators=(',',':')))
    if not apply:
        print(json.dumps({'ok':True,'status':'CHECK_ONLY','before':before,'remote_d1_changed':False,'production_main_changed':False,'usage':db.usage()},separators=(',',':')))
        print('V3_D1_MIGRATION_CHECK=PASS'); return
    changed=[]
    for name,_,count in MIGRATIONS:
        state=group_status(db,name)[0]
        if state=='APPLIED': continue
        if state!='PENDING': raise RuntimeError(f'MIGRATION_NOT_CLEAN:{name}:{state}')
        parts=split_sql((MIG_ROOT/name).read_text(),name,count)
        db.batch(parts)
        after=group_status(db,name)
        if after[0]!='APPLIED': raise RuntimeError('MIGRATION_READBACK_FAIL:'+name+':'+json.dumps(after))
        changed.append(name); print('MIGRATION_APPLIED='+name)
    after=statuses(db)
    if any(v[0]!='APPLIED' for v in after.values()): raise RuntimeError('FINAL_SCHEMA_NOT_CLOSED:'+json.dumps(after,separators=(',',':')))
    print('V3_D1_AFTER='+json.dumps(after,separators=(',',':')))
    print(json.dumps({'ok':True,'status':'MIGRATIONS_APPLIED_READBACK_PASS' if changed else 'ALREADY_APPLIED_READBACK_PASS','changed':changed,'remote_d1_changed':bool(changed),'production_main_changed':False,'usage':db.usage()},separators=(',',':')))
    print('V3_D1_MIGRATION_RESULT=PASS')

if __name__=='__main__':
    try: main()
    except Exception as e:
        print('V3_D1_MIGRATION_FAIL='+type(e).__name__+':'+str(e),file=sys.stderr)
        print('PRODUCTION_MAIN_CHANGED=NO',file=sys.stderr)
        sys.exit(1)
