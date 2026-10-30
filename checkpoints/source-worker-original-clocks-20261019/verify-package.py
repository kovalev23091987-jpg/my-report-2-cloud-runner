from pathlib import Path
import ast,hashlib,json,re,shutil,subprocess
ROOT=Path(__file__).resolve().parent
REPO=ROOT.parents[1]
BASE=ROOT/'.runtime/base/src'
OUT=ROOT/'.runtime/proposed/src'
NODE='/Users/mac/.nvm/versions/node/v24.21.0/bin/node'
checks=[]
def check(name,ok):
    if not ok:raise AssertionError(name)
    checks.append(name)
sha=lambda b:hashlib.sha256(b).hexdigest()
run=lambda args:subprocess.check_output(args,cwd=REPO,text=True)
changes=json.loads((ROOT/'proposal-file-hashes.json').read_text())
check('two proposed shared targets only',set(changes)=={'current-generation/files/src/htx-technical-structure.mjs','current-generation/files/src/block-result-context.mjs'})
tree=run(['git','ls-tree','-r','05ce093e9e4428ffec5e15d5bc677044346a2f53','--','current-generation/files/src'])
for line in tree.splitlines():
    header,name=line.split('\t');mode,kind,oid=header.split();rel=name.removeprefix('current-generation/files/src/')
    b=(BASE/rel).read_bytes()
    check('exact central overlay '+rel,hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()==oid)
inherited=json.loads((ROOT/'inherited-dependencies.json').read_text())
for rel,record in inherited.items():
    check('pinned inherited '+rel,sha((REPO/record['path']).read_bytes())==record['sha256']==sha((BASE/rel).read_bytes()))
for rel,record in changes.items():
    name=Path(rel).name
    check('before '+name,sha((BASE/name).read_bytes())==record['before_sha256'])
    check('after '+name,sha((OUT/name).read_bytes())==record['after_sha256'])
    subprocess.check_call([NODE,'--check',str(OUT/name)])
    checks.append('syntax '+name)
for p in BASE.rglob('*'):
    if p.is_file() and p.name not in [Path(x).name for x in changes]:
        check('untouched runtime dependency '+p.relative_to(BASE).as_posix(),p.read_bytes()==(OUT/p.relative_to(BASE)).read_bytes())
apply=ROOT/'.runtime/apply/current-generation/files/src';apply.mkdir(parents=True)
for rel in changes:shutil.copyfile(BASE/Path(rel).name,apply/Path(rel).name)
prefix=(ROOT/'.runtime/apply').relative_to(REPO).as_posix()
subprocess.check_call(['git','apply','--directory='+prefix,str(ROOT/'shared-original-clocks.proposed.patch')],cwd=REPO)
for rel,record in changes.items():check('patch exact apply '+rel,sha((apply/Path(rel).name).read_bytes())==record['after_sha256'])
for file in ['build-proposal.py','prepare-inherited-dependencies.py','audit.py','verify-package.py']:ast.parse((ROOT/file).read_text());checks.append('python syntax '+file)
subprocess.check_call([NODE,'--check',str(ROOT/'original-clocks.test.mjs')]);checks.append('new test syntax')
first=(ROOT/'full-affected-attempt.tap').read_text();repair=(ROOT/'failed-case-repair.tap').read_text()
check('one full affected attempt seven successes one failure','# pass 7\n' in first and '# fail 1\n' in first)
check('only failed case was targeted and passed','# tests 1\n' in repair and '# pass 1\n' in repair and '# fail 0\n' in repair)
for log in ['initial-entry-error.tap','second-entry-error.tap']:
    text=(ROOT/log).read_text();check('entry failure before semantic cases '+log,'ERR_MODULE_NOT_FOUND' in text and 'new counterexample:' not in text)
analysis=json.loads((ROOT/'saved-gap-analysis.json').read_text())
for r in analysis['runs']:
    check('original ZIP '+r['cloud_run'],sha((REPO/r['zip_path']).read_bytes())==r['zip_sha256'])
rows=[x for r in analysis['runs'] for c in r['candidates'] for x in c['N10_rendered_clock_projection']]
check('twelve saved N10 projections omit original first-known',len(rows)==12 and all(not r['first_known_ts_retained'] and not r['expiry_retained'] for r in rows))
w=json.loads((ROOT/'new-clock-witness.json').read_text())
check('original availability retained in controlled producer',w['after_first_known_ts']==w['controlled_available_ts']<w['before_first_known_ts'])
check('manual text unchanged',w['manual_text_byte_delta']==0)
check('Telegram text unchanged',w['telegram_text_byte_delta']==0)
check('no attempted source HTTP',w['attempted_sourceHTTP']==0)
check('native readback not inferred',w['native_readback'] is False)
check('mock SQL explicit',w['controlled_SQL_call_count']==2 and w['nativeSQL']==0)
patch=(ROOT/'shared-original-clocks.proposed.patch').read_text()
check('patch contains no provider acquisition or SQL mutations',not any(x in patch for x in ['+await fetch(', '+SELECT ', '+INSERT ', '+UPDATE ', '+DELETE ']))
tracked=run(['git','diff','--name-only']).splitlines()
check('shared working tree not modified',not tracked)
verification={'schema':'N10_NEW_CLOCK_PACKAGE_VERIFICATION_V1','provenance_syntax_preservation_assertions':len(checks),'PASS':len(checks),'FAIL':0,'new_semantic_cases':{'full_attempt_PASS':7,'full_attempt_FAIL':1,'only_failed_case_repair_PASS':1,'only_failed_case_repair_FAIL':0,'successful_cases_rerun':0,'entry_failures_before_cases':2,'runtime_patch_changed_after_semantic_attempt':False},'old_suites_or_probes_executed':0,'complete_decrypted_runtime_claimed':False,'native_IO_cost_capacity_unknown':True,'checks':checks}
(ROOT/'verification.json').write_text(json.dumps(verification,indent=2)+'\n')
print(json.dumps({k:v for k,v in verification.items() if k!='checks'}))
