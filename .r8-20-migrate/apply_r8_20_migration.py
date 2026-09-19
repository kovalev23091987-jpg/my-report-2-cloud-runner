#!/usr/bin/env python3
from __future__ import annotations
import hashlib,pathlib,sqlite3,sys
ROOT=pathlib.Path(__file__).resolve().parent
MIG=ROOT/'20260917_tz101_entry_area_calibration_shadow.sql'
MIG_SHA='d871082daa19e17894475e63e3e6c769cf3332b7fb0950c1b7edd6aa4d029bbd'
OBJECTS=['tz101_entry_area_calibration_signal','idx_tz101_entry_area_signal_contract_ts','idx_tz101_entry_area_signal_campaign','tz101_entry_area_calibration_outcome','idx_tz101_entry_area_outcome_ts','tz101_entry_area_calibration_state']
FORBIDDEN=('DROP TABLE','DROP COLUMN','DELETE FROM','REPLACE INTO','VACUUM','PRAGMA WRITABLE_SCHEMA','UPDATE ','INSERT INTO ')
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def split_sql(text):
    lines=[ln for ln in text.splitlines() if not ln.lstrip().startswith('--')]
    out=[]; buf=''
    for line in lines:
        if not line.strip() and not buf: continue
        buf += line+'\n'
        if sqlite3.complete_statement(buf): out.append(buf.strip()); buf=''
    if buf.strip(): raise RuntimeError('MIGRATION_INCOMPLETE')
    if len(out)!=6: raise RuntimeError(f'MIGRATION_STATEMENT_COUNT:{len(out)}')
    for i,s in enumerate(out):
        flat=' '.join(s.split()).upper()
        if not (flat.startswith('CREATE TABLE ') or flat.startswith('CREATE INDEX ')): raise RuntimeError(f'NON_ADDITIVE_DDL:{i}')
        for bad in FORBIDDEN:
            if bad in flat: raise RuntimeError(f'FORBIDDEN_TOKEN:{bad}:{i}')
    return out
def verify_file():
    if not MIG.is_file(): raise RuntimeError('MIGRATION_MISSING')
    if sha(MIG)!=MIG_SHA: raise RuntimeError('MIGRATION_SHA_MISMATCH')
    s=MIG.read_text(); parts=split_sql(s)
    for marker in ("CHECK(direction IN ('LONG','SHORT'))",'CHECK(calibration_only=1)','CHECK(live_promotion_allowed=0)','CHECK(automatic_rule_promotion=0)','CHECK(validated_out_of_sample=0)'):
        if marker not in s: raise RuntimeError('SAFETY_CONSTRAINT_MISSING:'+marker)
    return parts
def selftest(parts):
    con=sqlite3.connect(':memory:')
    for s in parts: con.execute(s)
    con.commit()
    got={r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE name IN (%s)" % ','.join('?' for _ in OBJECTS),OBJECTS)}
    assert got==set(OBJECTS),(got,set(OBJECTS))
    for s in parts: con.execute(s)
    con.commit()
    print('R8_20_MIGRATION_SELF_TEST=PASS statements=6 objects=6')
def main():
    parts=verify_file()
    if sys.argv[1:]!=['--self-test']: raise RuntimeError('PYTHON_HELPER_IS_LOCAL_SELFTEST_ONLY_USE_NODE_ADAPTER_FOR_REMOTE_D1')
    selftest(parts)
if __name__=='__main__':
    try: main()
    except Exception as e:
        print('R8_20_MIGRATION_SELF_TEST_FAIL='+type(e).__name__+':'+str(e),file=sys.stderr); sys.exit(1)
