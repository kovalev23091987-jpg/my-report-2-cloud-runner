"""Single new helper verification plus proposed-patch applicability/syntax only."""
import hashlib,json,os,re,subprocess,tempfile,time
from pathlib import Path
ROOT=Path(__file__).resolve().parent
REPO=ROOT.parents[1]
COORDINATOR=REPO.parent/'report2-schedule-fix'
NODE='/Users/mac/.nvm/versions/node/v24.21.0/bin/node'
MODULE='current-generation/files/src/n12-composite-first-known.mjs'
TEST='current-generation/tests/n12-composite-first-known.test.mjs'
scope=json.loads((ROOT/'scope.json').read_text());checks=[]
def check(label,value):
 assert value,label
 checks.append(label)
def run(args,cwd=REPO):return subprocess.check_output(args,cwd=cwd,stderr=subprocess.STDOUT)
def digest(b):return hashlib.sha256(b).hexdigest()
lease=scope['lease']['lease'];now=int(time.time()*1000)
check('own bounded lease at verification',scope['lease']['exact_readback'] and not lease['released'] and lease['acquired_ts']<=now<lease['expires_ts'] and lease['expires_ts']-lease['acquired_ts']<=90*60000)
check('own new branch/base',run(['git','branch','--show-current']).decode().strip()=='work/report2-sources-n12-composite-clock-20261019' and run(['git','rev-parse','HEAD']).decode().strip()==scope['working_base'])
for path,sha in scope['guard_sha256'].items():check('fresh guard/proof '+path,digest(run(['git','show',scope['working_base']+':'+path]))==sha)
source=run(['git','-C',str(COORDINATOR),'show',scope['proposed_shared_base']+':'+scope['proposed_shared_path']])
check('shared proposed base exact',digest(source)==scope['proposed_shared_before_sha256'])
check('no old composite availability field at callsite',b'composite_first_known_ts' not in source)
module=(REPO/MODULE).read_bytes()
check('pure helper no clock refresh/I/O',not any(s in module for s in [b'Date.now',b'fetch(',b'prepare(',b'import ']))
for path in [MODULE,TEST]:run([NODE,'--check',path])
# All files/proposal are ready before the ONE new helper batch.
test_run=subprocess.run([NODE,'--test','--test-reporter=tap',TEST],cwd=REPO,capture_output=True)
tap=test_run.stdout+test_run.stderr;(ROOT/'new-helper.tap').write_bytes(tap)
check('new helper cases pass',test_run.returncode==0)
passed=int(re.search(rb'^# pass (\d+)$',tap,re.M)[1]);failed=int(re.search(rb'^# fail (\d+)$',tap,re.M)[1])
with tempfile.TemporaryDirectory(prefix='proposal-work-',dir=ROOT) as directory:
 relative=Path(directory).relative_to(REPO);target=Path(directory)/scope['proposed_shared_path'];target.parent.mkdir(parents=True);target.write_bytes(source)
 args=['git','apply','--directory='+str(relative),str(ROOT/'shared-integration.proposed.patch')]
 run([*args[:2],'--check',*args[2:]]);run(args)
 proposed=target.read_bytes();check('proposed patched source exact',digest(proposed)==scope['proposed_shared_after_sha256'])
 run([NODE,'--check',str(target)])
 check('base source/observed assignments unchanged',source.count(b'source_ts:row.source_ts,observed_ts:row.observed_ts')==proposed.count(b'source_ts:row.source_ts,observed_ts:row.observed_ts'))
 check('field computed at context and both receipt projections',proposed.count(b'composite_first_known_ts:n12CompositeFirstKnown(')==3)
 check('Telegram existing represented-origin filter preserved',b'origin=>represented.includes(origin.evidence_id)' in proposed)
check('shared production source unedited',run(['git','diff','--name-only']).strip()==b'')
allowed={MODULE,TEST};prefix=str(ROOT.relative_to(REPO))+'/'
check('only authorized new files',all(p in allowed or p.startswith(prefix) for p in run(['git','ls-files','--others','--exclude-standard']).decode().splitlines()))
result={'schema':'N12_COMPOSITE_ORIGINAL_FIRST_KNOWN_NEW_VERIFICATION_V1','new_helper_cases_PASS':passed,'FAIL':failed,'provenance_scope_syntax_assertions_PASS':len(checks),'checks':checks,'helper_sha256':digest(module),'fixture_sha256':digest((ROOT/'nil-original-origins.json').read_bytes()),'proposed_patch_sha256':digest((ROOT/'shared-integration.proposed.patch').read_bytes()),'full_TAP_sha256':digest(tap),'verification_ts':now,'proposed_shared_checked':'APPLICABILITY_AND_SYNTAX_ONLY_NOT_RUNTIME_INTEGRATION','production_imports':False,'old_suites_probes_or_audit69_executed':0,'sourceHTTP':0,'nativeSQL':0,'MAIN':0,'Telegram':0}
(ROOT/'verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='checks'},ensure_ascii=False,indent=2))
