from pathlib import Path
import subprocess,json,hashlib,datetime,re
ROOT=Path(__file__).resolve().parent
REPO=ROOT.parent.parent
NODE='/Users/mac/.nvm/versions/node/v24.21.0/bin/node'
def run(args):
 p=subprocess.run(args,cwd=REPO,text=True,capture_output=True)
 if p.returncode:raise RuntimeError(p.stdout+'\n'+p.stderr)
 return p.stdout
checks=[]
def check(name,condition):
 assert condition,name
 checks.append(name)
scope=json.loads((ROOT/'scope.json').read_text());receipt=json.loads(Path('/private/tmp/report2-sources-lease-receipt.json').read_text())
check('own lease exact owner not released',receipt['lease']['owner']==scope['lease']['lease']['owner'] and not receipt['lease']['released'] and receipt['exact_readback'])
check('own lease not expired',datetime.datetime.now().timestamp()*1000<receipt['lease']['expires_ts'])
check('isolated source branch',run(['git','branch','--show-current']).strip()=='work/report2-sources-kraken-n12-scope-20261019')
check('frozen504 dependency unchanged',hashlib.sha256((REPO/'current-generation/files/src/kraken-n10-price-path.mjs').read_bytes()).hexdigest()==scope['dependency_module_sha256'])
a=json.loads((ROOT/'owner-scope-and-reachability.json').read_text())
for p,sha in a['contract_raw_sha256'].items():check('exact retained owner contract '+p,hashlib.sha256((REPO/p).read_bytes()).hexdigest()==sha)
fields=a['retained_contract_fields'];free=fields['checkpoints/N15_FREE_HOURLY_HISTORY_DEPLOYMENT_20261012.json'];transition=fields['checkpoints/OWNER_N15_TO_N16_AND_FINAL_INTEGRATION_20261012.json'];allactive=fields['checkpoints/OWNER_ALL_ACTIVE_BLOCKS_SOURCE_BUDGET_AND_FALLBACK_20261013.json']
check('hourly-specific owner scope explicit','hourly historical statistics' in free['owner_scope'])
check('N15 nested15 scope retained','Do not use external spot for those 15 by owner decision' in transition['n15_scope'])
check('HTX-only retired source archive preserved',free['worker']['script_readback_excludes']==['GATE','KUCOIN','BITGET'])
check('allactive blocklocal exclusion','only from a block' in allactive['block_local_exclusion_rule'])
check('no global N05 prohibition inferred',a['global_normal_N05_prohibition']=='NOT_UNAMBIGUOUS_FROM_RETAINED_OWNER_SCOPE' and not a['global_routes_disabled'])
check('PAXG violation not falsely claimed',a['PAXG_authorization_violation']=='NOT_ESTABLISHED' and a['PAXG_native_external_spot_call']=='NOT_PROVEN')
check('15 exclusions retained in archive decision',len(free['source_checks']['htx_spot_missing'])==15 and 'PAXG' in free['source_checks']['htx_spot_missing'])
base=scope['working_base'];changed=run(['git','diff','--name-only',base]).splitlines()+run(['git','ls-files','--others','--exclude-standard']).splitlines();prefix=str(ROOT.relative_to(REPO))+'/'
newmodule='current-generation/files/src/kraken-n12-bounded-trade-sample.mjs';testfile='current-generation/tests/kraken-n12-bounded-trade-sample.test.mjs'
check('only own newprefix/module/tests changed',all(p.startswith(prefix) or p in [newmodule,testfile] for p in changed))
for p in [newmodule,testfile]:run([NODE,'--check',p])
tap=run([NODE,'--test','--test-reporter=tap',testfile]);(ROOT/'new-consumer.tap').write_text(tap)
w=[]
for line in tap.splitlines():
 if 'KRAKEN_N12_WITNESS ' in line:w.append(json.loads(line.split('KRAKEN_N12_WITNESS ',1)[1]))
check('new factual5m witnesses ALGO2 XMR27',[(v['contract'],v['valid_recent_rows']) for v in w]==[('ALGO-USDT',2),('XMR-USDT',27)])
check('unchanged real source and firstknown clocks',[v['first_known_ts'] for v in w]==[1791718413870,1791718415754])
check('USD not substituted for USDT',all(v['unit']=='USDT' for v in w))
check('bounded neutral facts no new score',all(not v['whole_window_coverage_proven'] and v['score_contribution']==0 for v in w))
(ROOT/'new-input-witnesses.json').write_text(json.dumps({'schema':'HISTORICAL_NATIVE_KRAKEN_NEW_N12_INPUT_WITNESSES_V1','current_connection_or_admission':False,'consumer_delivery':'NOT_INTEGRATED','cache_wrapper':'CONTROLLED_OF_EXACT_NATIVE_ORIGINALS','wire_vs_parsed_hashes_distinct':True,'witnesses':w},ensure_ascii=False,indent=2)+'\n')
r={'schema':'ONE_CONNECTED_OWNER_SCOPE_AND_NEW_KRAKEN_N12_VERIFICATION_V1','scope_original_assertions_PASS':len(checks),'FAIL':0,'checks':checks,'new_N12_tests_PASS':int(re.search(r'# pass (\d+)',tap)[1]),'new_N12_tests_FAIL':int(re.search(r'# fail (\d+)',tap)[1]),'new_test_executions':1,'old_accepted_suites_rerun':0,'PR504_64_assertions_and_27_tests_rerun':False,'syntax':'PASS','module_sha256':hashlib.sha256((REPO/newmodule).read_bytes()).hexdigest(),'test_sha256':hashlib.sha256((REPO/testfile).read_bytes()).hexdigest(),'new_consumer_tap_sha256':hashlib.sha256(tap.encode()).hexdigest(),'owner_scope_analysis_sha256':hashlib.sha256((ROOT/'owner-scope-and-reachability.json').read_bytes()).hexdigest(),'provider_HTTP':0,'WS':0,'native_SQL':0,'MAIN':0,'Telegram':0,'runtime_changes_to_existing_routes':False,'shared_integration':'PROPOSAL_ONLY'}
(ROOT/'verification.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:v for k,v in r.items() if k!='checks'},ensure_ascii=False))
