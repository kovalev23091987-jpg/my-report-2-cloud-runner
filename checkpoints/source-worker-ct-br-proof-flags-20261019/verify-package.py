"""One joint verification of the new connected package only; no old suites."""
from pathlib import Path
import subprocess,json,hashlib,sys,datetime,re
sys.dont_write_bytecode=True
import audit
ROOT=Path(__file__).resolve().parent
REPO=ROOT.parent.parent
NODE='/Users/mac/.nvm/versions/node/v24.21.0/bin/node'
def run(args):
 p=subprocess.run(args,cwd=REPO,text=True,capture_output=True)
 if p.returncode:raise RuntimeError(p.stdout+'\n'+p.stderr)
 return p.stdout
scope=json.loads((ROOT/'scope.json').read_text());lease=json.loads(Path('/private/tmp/report2-sources-lease-receipt.json').read_text())
assert not lease['lease']['released'] and lease['lease']['owner']==scope['lease']['lease']['owner']
assert datetime.datetime.now().timestamp()*1000 < lease['lease']['expires_ts']
assert scope['lease']['exact_readback']
assert run(['git','branch','--show-current']).strip()=='work/report2-sources-ct-br-proof-flags-20261019'
for path,expected in scope['native_code_raw_sha256'].items():
 b=subprocess.check_output(['git','show',scope['native_head']+':'+path],cwd=REPO);assert hashlib.sha256(b).hexdigest()==expected
model=run(['git','show',scope['native_head']+':current-generation/files/src/full-evidence-contract.mjs'])
consumer=run(['git','show',scope['native_head']+':current-generation/files/src/source-role-consumer.mjs'])
assert 'const sourceCompatible = raw.source_compatible !== false;' in model
assert consumer.index("return 'SOURCE_NOT_CLOSED'")<consumer.index("return 'FACT_OR_IDENTITY_NOT_VERIFIED'")
proof=json.loads((ROOT/'kraken-inputs-and-policy.json').read_text())
for path,value in proof['saved_originals'].items():assert hashlib.sha256((REPO/path).read_bytes()).hexdigest()==value['file_sha256']
allowed=[str(ROOT.relative_to(REPO))+'/',*scope['added_provider_paths']]
changed=run(['git','diff','--name-only',scope['working_base']]).splitlines()+run(['git','ls-files','--others','--exclude-standard']).splitlines()
assert all(any(p==a or a.endswith('/') and p.startswith(a) for a in allowed) for p in changed),changed
run([NODE,'--check','current-generation/files/src/kraken-n10-price-path.mjs']);run([NODE,'--check','current-generation/tests/kraken-n10-price-path.test.mjs'])
report=audit.verify(audit.project())
log=ROOT/'kraken-new-consumer.log'
tap=log.read_text() if '--finalize-existing-new-output' in sys.argv else run([NODE,'--test','--test-reporter=tap','current-generation/tests/kraken-n10-price-path.test.mjs'])
if '--finalize-existing-new-output' not in sys.argv:log.write_text(tap)
witnesses=[]
for line in tap.splitlines():
 if 'KRAKEN_PRICE_WITNESS ' in line:witnesses.append(json.loads(line.split('KRAKEN_PRICE_WITNESS ',1)[1]))
assert len(witnesses)==2
(ROOT/'kraken-price-witnesses.json').write_text(json.dumps({'schema':'HISTORICAL_NATIVE_KRAKEN_PRICE_WITNESSES_CONTROLLED_CACHE_WRAPPER_V1','HTX_comparison':'NOT_PROVEN_REAL_SAME_WINDOW_ORIGINAL_ABSENT','current_runtime_admission':False,'witnesses':witnesses},ensure_ascii=False,indent=2)+'\n')
report.update(schema='CONNECTED_NEW_SOURCE_FLAG_AND_KRAKEN_PRICE_VERIFICATION_V1',kraken_tests_PASS=int(re.search(r'(?:#|ℹ) pass (\d+)',tap)[1]),kraken_tests_FAIL=int(re.search(r'(?:#|ℹ) fail (\d+)',tap)[1]),syntax='PASS',scope='PASS',native_pinned_code_hashes='PASS',saved_Kraken_and_owner_spot_policy_hashes='PASS',shared_runtime_changes=False,shared_integration='PROPOSAL_ONLY',old_accepted_suites_rerun=0,new_consumer_test_executions=1,reporting_repair_only='--finalize-existing-new-output' in sys.argv,test_output_format='NODE_SPEC' if 'ℹ pass' in tap else 'TAP',module_sha256=hashlib.sha256((REPO/scope['added_provider_paths'][0]).read_bytes()).hexdigest(),test_sha256=hashlib.sha256((REPO/scope['added_provider_paths'][1]).read_bytes()).hexdigest(),new_consumer_log_sha256=hashlib.sha256(tap.encode()).hexdigest())
(ROOT/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='checks'},ensure_ascii=False))
