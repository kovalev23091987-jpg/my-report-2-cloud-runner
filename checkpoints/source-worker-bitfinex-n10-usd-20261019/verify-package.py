"""One new Bitfinex N10 consumer check, never an old qualification batch."""
import hashlib,json,os,re,subprocess,time
from pathlib import Path
ROOT=Path(__file__).resolve().parent;REPO=ROOT.parents[1]
NODE='/Users/mac/.nvm/versions/node/v24.21.0/bin/node'
MODULE='current-generation/files/src/bitfinex-n10-price-path.mjs';TEST='current-generation/tests/bitfinex-n10-price-path.test.mjs'
scope=json.loads((ROOT/'scope.json').read_text());checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def sha(b):return hashlib.sha256(b).hexdigest()
def git(*args):return subprocess.check_output(['git',*args],cwd=REPO)
lease=scope['lease']['lease'];now=int(time.time()*1000)
check('own bounded lease',scope['lease']['exact_readback'] and not lease['released'] and lease['acquired_ts']<=now<lease['expires_ts'] and lease['expires_ts']-lease['acquired_ts']<=90*60000)
check('own working branch/base',git('branch','--show-current').decode().strip()=='work/report2-sources-bitfinex-n10-usd-20261019' and git('rev-parse','HEAD').decode().strip()==scope['working_base'])
for path,h in scope['guards'].items():check('guard '+path,sha(git('show',scope['working_base']+':'+path))==h)
for path,h in scope['native_sources'].items():check('unchanged existing native source '+path,sha((REPO/path).read_bytes())==h)
import gzip
for path,h in scope['raw_originals'].items():
 b=(REPO/path).read_bytes();check('original file '+path,sha(b)==h['file_sha256']);check('original body '+path,sha(gzip.decompress(b) if path.endswith('.gz') else b)==h['body_sha256'])
for path in [MODULE,TEST]:subprocess.run([NODE,'--check',path],cwd=REPO,check=True,capture_output=True)
env=os.environ.copy();env['REPORT2_BITFINEX_N10_WITNESS_OUTPUT']=str(ROOT/'native-price-witness.json')
run=subprocess.run([NODE,'--test','--test-reporter=tap',TEST],cwd=REPO,env=env,capture_output=True);tap=run.stdout+run.stderr;(ROOT/'new-consumer.tap').write_bytes(tap)
check('new affected cases pass',run.returncode==0)
passed=int(re.search(rb'^# pass (\d+)$',tap,re.M)[1]);failed=int(re.search(rb'^# fail (\d+)$',tap,re.M)[1]);w=json.loads((ROOT/'native-price-witness.json').read_text())
check('retained new witness exact native USD and old rejection',w['result']['price_path']['quote']=='USD' and w['result']['price_path']['recent_trade_count']==322 and w['old_consumer_evidence_count']==0)
check('no fictional240native bars',w['result']['price_path']['native_candle_rows_in_four_hours']==232 and w['result']['price_path']['verified_flow_presence_minutes']==240)
check('pure model no I/O acquisition/SQL',not any(s in (REPO/MODULE).read_text() for s in ['fetch(','.prepare(','.batch(','Date.now']))
check('shared files unedited',not git('diff','--name-only').strip())
prefix=str(ROOT.relative_to(REPO))+'/'
check('new files exact source scope',all(p in [MODULE,TEST] or p.startswith(prefix) for p in git('ls-files','--others','--exclude-standard').decode().splitlines()))
result={'schema':'NEW_BITFINEX_USD_N10_ORIGINAL_CONSUMER_VERIFICATION_V1','new_affected_cases_PASS':passed,'FAIL':failed,'provenance_scope_syntax_PASS':len(checks),'checks':checks,'module_sha256':sha((REPO/MODULE).read_bytes()),'witness_sha256':sha((ROOT/'native-price-witness.json').read_bytes()),'TAP_sha256':sha(tap),'verification_ts':now,'old_qualification_suites_or_probes_rerun':0,'original_N05_normalizer_used_only_as_new_consumer_raw_binding_dependency':True,'production_imports':False,'shared_integration_status':'PROPOSAL_ONLY','sourceHTTP':0,'nativeSQL':0,'MAIN':0,'Telegram':0}
(ROOT/'verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k!='checks'},ensure_ascii=False,indent=2))
