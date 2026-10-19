"""ONE new joint case set on an ephemeral exact main+patch, never old suites."""
from pathlib import Path
import gzip,hashlib,json,os,re,shutil,subprocess,tempfile,time
ROOT=Path(__file__).resolve().parent;REPO=ROOT.parents[1]
NODE='/Users/mac/.nvm/versions/node/v24.21.0/bin/node'
s=json.loads((ROOT/'scope.json').read_text());inventory=json.loads((ROOT/'proposal-file-hashes.json').read_text());checks=[]
def sha(b):return hashlib.sha256(b).hexdigest()
def check(n,v):
 assert v,n
 checks.append(n)
def git(*args):return subprocess.check_output(['git',*args],cwd=REPO)
lease=s['lease']['lease'];now=int(time.time()*1000)
check('own bounded lease',s['lease']['exact_readback'] and not lease['released'] and lease['acquired_ts']<=now<lease['expires_ts'] and lease['expires_ts']-lease['acquired_ts']<=90*60000)
check('own branch/fixed base',git('branch','--show-current').decode().strip()=='work/report2-sources-composite-bitfinex-integration-20261019' and git('rev-parse','HEAD').decode().strip()==s['fixed_working_base'])
for p,h in s['guards'].items():check('fresh guard/proof '+p,sha(git('show',s['fresh_guards_main']+':'+p))==h)
for p,v in s['frozen_dependencies'].items():check('frozen dependency byteexact '+p,sha((REPO/v['copy']).read_bytes())==v['sha256'] and git('show',v['frozen_head']+':'+p)==(REPO/v['copy']).read_bytes())
check('NIL selected receipt byteexact',sha((ROOT/'nil-original-origins.json').read_bytes())==s['nil_fixture_sha256'])
for p,v in s['original_input_manifest']['files'].items():
 b=(REPO/p).read_bytes();check('joint original file '+p,sha(b)==v['file_sha256']);check('joint original body '+p,sha(gzip.decompress(b) if p.endswith('.gz') else b)==v['body_sha256'])
check('exact eight proposed files',len(inventory['files'])==8)
with tempfile.TemporaryDirectory(prefix='joint-runtime-',dir=ROOT) as directory:
 tree=Path(directory);target=tree/'current-generation/files/src';shutil.copytree(REPO/'current-generation/files/src',target)
 overlay=tree/'current-generation/apply-runtime-overlay.mjs';shutil.copy2(REPO/'current-generation/apply-runtime-overlay.mjs',overlay)
 for p,v in inventory['files'].items():
  if v['before_sha256'] is None:check('new proposal target absent '+p,not (tree/p).exists())
  else:check('actual main before '+p,sha((tree/p).read_bytes())==v['before_sha256'] and (tree/p).read_bytes()==git('show',s['fixed_working_base']+':'+p))
 args=['git','apply','--directory='+str(tree.relative_to(REPO)),str(ROOT/'shared-integration.proposed.patch')]
 subprocess.run([*args[:2],'--check',*args[2:]],cwd=REPO,check=True,capture_output=True);subprocess.run(args,cwd=REPO,check=True,capture_output=True)
 for p,v in inventory['files'].items():
  check('proposal applied exact '+p,sha((tree/p).read_bytes())==v['after_sha256']);subprocess.run([NODE,'--check',str(tree/p)],check=True,capture_output=True)
 unchanged=['kraken-flow-collector.mjs','kraken-memory-reuse.mjs','kraken-n10-price-path.mjs','kraken-n10-memory-context.mjs','kraken-n12-bounded-trade-sample.mjs','bitfinex-native-four-hour-flow.mjs','bitfinex-n12-bounded-trade-sample.mjs','manual-report-formatter.mjs','canonical-publication.mjs','evidence-source-store.mjs','public-venue-source-budget.mjs','worker.js']
 for name in unchanged:check('unchanged existing runtime '+name,(target/name).read_bytes()==(REPO/'current-generation/files/src'/name).read_bytes())
 old=(REPO/'current-generation/files/src/htx-technical-structure.mjs').read_text();new=(target/'htx-technical-structure.mjs').read_text()
 marker=' for(const [venue,components] of [...groups].slice(0,4))';next_marker=' for(const component of memory)'
 check('entire existing four SQL group loop byteexact',old[old.index(marker):old.index(next_marker)]==new[new.index(marker):new.index(next_marker)])
 check('existing Kraken memory loop byteexact',old[old.index(next_marker):old.index(' native_unclosed||=')].strip()==new[new.index(next_marker):new.index(' for(const component of bitfinexMemory)')].strip())
 oldContext=(REPO/'current-generation/files/src/block-result-context.mjs').read_text();newContext=(target/'block-result-context.mjs').read_text()
 check('outer source/observed assignments retained',oldContext.count('source_ts:row.source_ts,observed_ts:row.observed_ts')==newContext.count('source_ts:row.source_ts,observed_ts:row.observed_ts'))
 check('context/manual/TG metadata projections present',newContext.count('composite_first_known_ts:n12CompositeFirstKnown(')==3)
 check('existing represented Telegram component filter retained','origin=>represented.includes(origin.evidence_id)' in newContext)
 env=os.environ.copy();env.update(REPORT2_JOINT_RUNTIME=str(target),REPORT2_BASE_RUNTIME=str(REPO/'current-generation/files/src'),REPORT2_JOINT_REPO=str(REPO),REPORT2_JOINT_WITNESS=str(ROOT/'joint-witness.json'))
 subprocess.run([NODE,'--check',str(ROOT/'joint-integration.test.mjs')],check=True,capture_output=True)
 run=subprocess.run([NODE,'--test','--test-reporter=tap',str(ROOT/'joint-integration.test.mjs')],cwd=REPO,env=env,capture_output=True);tap=run.stdout+run.stderr;(ROOT/'joint-tests.tap').write_bytes(tap)
 check('new joint cases pass',run.returncode==0)
passed=int(re.search(rb'^# pass (\d+)$',tap,re.M)[1]);failed=int(re.search(rb'^# fail (\d+)$',tap,re.M)[1]);w=json.loads((ROOT/'joint-witness.json').read_text())
check('controlled IO/cache delta zero',w['IO']['extra_provider_requests']==0 and w['IO']['extra_N10_statement_calls']==0 and w['IO']['N05_cache_payload_byte_delta']==0)
check('new compact DTO within explicit new-type bound',w['IO']['new_N10_DTO_bytes']<=w['IO']['new_DTO_byte_cap']==16384)
check('no production edits',not git('diff','--name-only').strip());prefix=str(ROOT.relative_to(REPO))+'/'
check('only authorized prefix changed',all(p.startswith(prefix) for p in git('ls-files','--others','--exclude-standard').decode().splitlines()))
result={'schema':'ONE_NEW_COMPOSITE_BITFINEX_PROPOSED_INTEGRATION_VERIFICATION_V1','PASS_new_joint_cases':passed,'FAIL':failed,'PASS_provenance_apply_syntax_preservation':len(checks),'checks':checks,'fixed_runtime_base':s['fixed_working_base'],'fresh_guards_main':s['fresh_guards_main'],'patch_sha256':sha((ROOT/'shared-integration.proposed.patch').read_bytes()),'witness_sha256':sha((ROOT/'joint-witness.json').read_bytes()),'TAP_sha256':sha(tap),'IO_and_DTO':w['IO'],'NIL_metadata_byte_delta':w['NIL']['added_metadata_bytes'],'verification_ts':now,'old34_40_25_1_tests_or_probes_executed':0,'sourceHTTP':0,'nativeSQL':0,'MAIN':0,'Telegram':0,'shared_production_files_changed':False,'native_CPU_cost_ACK_currentcoverage_ENTRY_delivery':'NOT_QUALIFIED'}
(ROOT/'verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k!='checks'},ensure_ascii=False,indent=2))
