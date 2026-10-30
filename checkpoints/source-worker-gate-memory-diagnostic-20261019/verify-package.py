"""One NEW connected affected check, plus exact proposal/provenance checks."""
import hashlib,json,os,pathlib,subprocess,sys
HERE=pathlib.Path(__file__).resolve().parent
ROOT=HERE.parents[1]
NODE='/Users/mac/.nvm/versions/node/v24.21.0/bin/node'
BASE='857ff3f65ad95e25ad7e5e9028ef54d1f715eadf'
checks=[]
def check(name,ok):
    checks.append({'name':name,'pass':bool(ok)})
    if not ok: raise AssertionError(name)
def source(p): return subprocess.check_output(['git','show',BASE+':'+p],cwd=ROOT)
manifest=json.loads((HERE/'source-manifest.json').read_text())
check('fixed working base',manifest['fixed_base']==BASE)
patch=HERE/'shared-memory-diagnostic.proposed.patch'
check('patch digest',hashlib.sha256(patch.read_bytes()).hexdigest()==manifest['patch_sha256'])
check('only three exact shared proposal targets',len(manifest['targets'])==3)
applied=subprocess.run(['git','apply','--check',str(patch)],cwd=ROOT,capture_output=True,text=True)
check('patch applies to untouched own fixedbase',applied.returncode==0)
for t in manifest['targets']:
    p=t['path'];original=source(p);proposed=(HERE/'.assembled'/p).read_bytes()
    check('before exact '+p,hashlib.sha256(original).hexdigest()==t['before_sha256'])
    check('shared root untouched '+p,(ROOT/p).read_bytes()==original)
    check('proposed exact '+p,hashlib.sha256(proposed).hexdigest()==t['after_sha256'])
    parsed=subprocess.run([NODE,'--input-type=module','--check'],input=proposed,capture_output=True)
    check('syntax '+p,parsed.returncode==0)
    # Only the diagnostic hook/projection changes: every SQL literal stays exact.
    import re
    sql=lambda b:re.findall(rb"(?:SELECT|INSERT|UPDATE|DELETE|CREATE)\b[^\n]*",b'\n'.join(line for line in b.splitlines() if not line.lstrip().startswith(b'//')))
    check('SQL lines unchanged '+p,sql(original)==sql(proposed))
for t in manifest['unchanged_dependencies']:
    check('dependency original '+t['path'],hashlib.sha256(source(t['path'])).hexdigest()==t['sha256'])
for p in ['current-generation/files/src/canonical-runtime-adapter.mjs','current-generation/files/src/canonical-publication.mjs','current-generation/files/src/original-idea-recheck.mjs','current-generation/files/src/bound-telegram-delivery-sidecar.mjs','current-generation/files/src/gate-official-asset-binding.mjs','current-generation/files/src/manual-report-formatter.mjs','current-generation/files/src/telegram-compact-formatter.mjs']:
    check('protected byteexact '+p,(ROOT/p).read_bytes()==source(p))
audit=source('current-generation/files/src/observation-source-role-audit.mjs')
proposed=(HERE/'.assembled/current-generation/files/src/observation-source-role-audit.mjs').read_bytes()
check('accepted499 whole module retained as prefix',proposed.startswith(audit))
runner=(HERE/'.assembled/current-generation/files/runner-main.mjs').read_text()
worker=(HERE/'.assembled/current-generation/files/src/worker.js').read_text()
check('no analytical metadata attachment','gate_binding_diagnostic:' not in worker and 'gate_binding_diagnostic:' not in runner)
test=HERE/'connected-memory.test.mjs'
check('one new connected testcase',test.read_text().count("test('")==1)
command=[NODE,'--test','--test-reporter=tap',str(test)]
result=subprocess.run(command,cwd=ROOT,capture_output=True,text=True)
(HERE/'connected-tests.tap').write_text(result.stdout+result.stderr)
receipt={'schema':'GATE_MEMORY_ONE_AFFECTED_CHECK_V1','command':command,'provenance_checks':checks,'new_connected_tests':{'pass':1 if result.returncode==0 else 0,'fail':0 if result.returncode==0 else 1},'old_suites_rerun':0,'native_SQL':0,'provider_HTTP':0,'production_imports':False,'exit_code':result.returncode,'tap_sha256':hashlib.sha256((result.stdout+result.stderr).encode()).hexdigest()}
(HERE/'verification.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'new_connected_pass':receipt['new_connected_tests']['pass'],'new_connected_fail':receipt['new_connected_tests']['fail'],'provenance_pass':len(checks),'tap_sha256':receipt['tap_sha256']}))
if result.returncode:
    print(result.stdout+result.stderr)
    sys.exit(result.returncode)
