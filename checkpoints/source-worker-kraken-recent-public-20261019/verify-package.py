from pathlib import Path
import json,subprocess,hashlib,re,time,sys
ROOT=Path(__file__).resolve().parent;REPO=ROOT.parent.parent;NODE='/Users/mac/.nvm/versions/node/v24.21.0/bin/node'
def run(args):
 p=subprocess.run(args,cwd=REPO,text=True,capture_output=True)
 if p.returncode:raise RuntimeError(p.stdout+'\n'+p.stderr)
 return p.stdout
scope=json.loads((ROOT/'scope.json').read_text());receipt=json.loads(Path('/private/tmp/report2-sources-lease-receipt.json').read_text());checks=[]
def check(n,v):assert v,n;checks.append(n)
check('own active bounded lease exactreadback',receipt['lease']['owner']==scope['lease']['lease']['owner'] and not receipt['lease']['released'] and time.time()*1000<receipt['lease']['expires_ts'] and receipt['exact_readback'])
check('own isolated source branch',run(['git','branch','--show-current']).strip()=='work/report2-sources-kraken-recent-public-20261019')
inputs=json.loads((ROOT/'saved-inputs.json').read_text())
for p,d in inputs['files'].items():check('new carrier original hash '+p,hashlib.sha256((REPO/p).read_bytes()).hexdigest()==d['file_sha256'])
for p in ['current-generation/files/src/kraken-n10-price-path.mjs','current-generation/files/src/kraken-n12-bounded-trade-sample.mjs','current-generation/tests/kraken-n10-price-path.test.mjs','current-generation/tests/kraken-n12-bounded-trade-sample.test.mjs']:
 check('frozen dependency bytes unchanged '+p,(REPO/p).read_bytes()==subprocess.check_output(['git','show',scope['working_base']+':'+p],cwd=REPO))
allowed=scope['new_provider_paths'];prefix=str(ROOT.relative_to(REPO))+'/'
changed=run(['git','diff','--name-only',scope['working_base']]).splitlines()+run(['git','ls-files','--others','--exclude-standard']).splitlines();check('only own prefix and new module/test',all(p in allowed or p.startswith(prefix) for p in changed))
run(['git','apply','--check',str((ROOT/'n10-owner15-scope.proposed.patch').relative_to(REPO))]);check('exact proposed scope patch applies no runtime mutation',True)
for p in allowed:run([NODE,'--check',p])
reuse='--finalize-existing-evidence' in sys.argv
if reuse:
 first=json.loads((ROOT/'first-new-check-receipt.json').read_text());text=(REPO/allowed[1]).read_text();marker='// Only the NEW guard proposal'
 check('unchanged N12 module from first30PASS',hashlib.sha256((REPO/allowed[0]).read_bytes()).hexdigest()==first['N12_module_sha256'])
 check('unchanged30 N12 cases retained',hashlib.sha256(text.split(marker)[0].encode()).hexdigest()==first['unaffected_N12_prefix_sha256'] and hashlib.sha256(text[text.index("test('historical bodies"):].encode()).hexdigest()==first['unaffected_last_case_sha256'])
 tap=(ROOT/'n10-proposal-targeted-repair.tap').read_text();check('only failed NEW N10 case rerun PASS',re.search(r'# pass 1\n',tap) is not None and '# fail 0' in tap and first['PASS']==30 and first['FAIL']==1)
 w=json.loads((ROOT/'new-carrier-witnesses.json').read_text())['witnesses'];casepass=31;casefail=0
else:
 attempt=subprocess.run([NODE,'--test','--test-reporter=tap',allowed[1]],cwd=REPO,text=True,capture_output=True);tap=attempt.stdout;(ROOT/'new-carrier.tap').write_text(tap)
 if attempt.returncode:raise RuntimeError(tap+'\n'+attempt.stderr)
 w=[]
 for line in tap.splitlines():
  if 'RECENT_PUBLIC_WITNESS ' in line:w.append(json.loads(line.split('RECENT_PUBLIC_WITNESS ',1)[1]))
 casepass=int(re.search(r'# pass (\d+)',tap)[1]);casefail=int(re.search(r'# fail (\d+)',tap)[1])
 (ROOT/'new-carrier-witnesses.json').write_text(json.dumps({'schema':'NEW_RECENT_PUBLIC_NEUTRAL_REPLAY_WITNESSES_V1','current_source_connection':False,'runtime_imports':False,'firstknown_is_conservative_saved_result_completion_not_execution_trace':True,'witnesses':w},ensure_ascii=False,indent=2)+'\n')
check('new bounded positives DOT8 ATOM4',[(v['contract'],v['rows']) for v in w]==[('DOT-USDT',8),('ATOM-USDT',4)])
check('conservative required proof clock retained',all(v['first_known_ts']==1791648709892 for v in w))
check('source clocks unchanged not replaced with receipt',[v['source_ts'] for v in w]==[1791648486861,1791648477674])

result={'schema':'ONE_JOINT_NEW_RECENT_CARRIER_AND_N10_GUARD_PROPOSAL_CHECK_V1','provenance_scope_assertions_PASS':len(checks),'FAIL':0,'checks':checks,'new_case_outcomes_PASS':casepass,'new_case_outcomes_FAIL':casefail,'full_new_suite_executions':1,'targeted_failed_case_repair_executions':1 if reuse else 0,'first_new_attempt':{'PASS':30,'FAIL':1,'failed_only':'N10 proposed failure wrapper undefined vsfalse'} if reuse else None,'retained_30_N12_pass_results':reuse,'first_attempt_raw_TAP':'Conversation tool output only' if reuse else 'new-carrier.tap','old_504_505_507_suites_or_probes_repeated':0,'syntax':'PASS','n10_patch':'APPLIES_PROPOSAL_ONLY','module_sha256':hashlib.sha256((REPO/allowed[0]).read_bytes()).hexdigest(),'test_sha256':hashlib.sha256((REPO/allowed[1]).read_bytes()).hexdigest(),'targeted_repair_or_final_tap_sha256':hashlib.sha256(tap.encode()).hexdigest(),'sourceHTTP':0,'WS':0,'native_SQL':0,'MAIN':0,'Telegram':0,'production_imports':False,'existing_working_routes_changed':False}
(ROOT/'verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k!='checks'},ensure_ascii=False))
