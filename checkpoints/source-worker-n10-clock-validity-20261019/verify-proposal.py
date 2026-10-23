from pathlib import Path
import ast,hashlib,json,shutil,subprocess
ROOT=Path(__file__).resolve().parent
REPO=ROOT.parents[1]
BASE=ROOT/'.runtime/with522'
AFTER=ROOT/'.runtime/after'
MAIN=ROOT/'.runtime/main'
CTX='current-generation/files/src/block-result-context.mjs'
HTX='current-generation/files/src/htx-technical-structure.mjs'
NODE='/Users/mac/.nvm/versions/node/v24.21.0/bin/node'
sha=lambda b:hashlib.sha256(b).hexdigest()
checks=[]
def check(label,ok):
 if not ok:raise AssertionError(label)
 checks.append(label)
dependency=ROOT/'dependencies/pr522-original-clocks.proposed.patch'
check('frozen522 patch byte exact',sha(dependency.read_bytes())=='ae10a266683a06fd156b021833b1ca33acc26910fc5e395b3e5adda06b52332e')
before=(BASE/CTX).read_text();after=(AFTER/CTX).read_text()
old="const original_clock=row.block_id==='N10'?"
new="const original_clock=row.block_id==='N10'&&[row.source_ts,row.first_known_ts,row.observed_ts,row.expires_at].every(Number.isSafeInteger)&&row.source_ts<=row.first_known_ts&&row.first_known_ts<=row.observed_ts&&row.observed_ts<=row.expires_at?"
check('only new metadata condition differs',before.count(old)==1 and after==before.replace(old,new))
check('frozen522 primary path unchanged',(BASE/HTX).read_bytes()==(AFTER/HTX).read_bytes())
evidence='current-generation/files/src/evidence-v2.mjs'
check('global validator unchanged',(MAIN/evidence).read_bytes()==(AFTER/evidence).read_bytes())
start="if(row.block_id==='N10'&&row.metric_family==='CLOSED_CANDLE_RANGE_CONTEXT')"
check('range describe unchanged',before[before.index(start):before.index("if(row.block_id==='N01'",before.index(start))]==after[after.index(start):after.index("if(row.block_id==='N01'",after.index(start))])
for mode,patch,base in [('followup','range-clock-validity.followup.patch',BASE),('cumulative','original-clocks-cumulative.proposed.patch',MAIN)]:
 d=ROOT/'.runtime'/('verify-'+mode);targets=[CTX] if mode=='followup' else [CTX,HTX]
 for t in targets:(d/t).parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(base/t,d/t)
 subprocess.check_call(['git','apply','--directory='+str(d.relative_to(REPO)),str(ROOT/patch)],cwd=REPO)
 for t in targets:check(mode+' apply '+t,(d/t).read_bytes()==(AFTER/t).read_bytes())
check('followup one hunk one file',(ROOT/'range-clock-validity.followup.patch').read_text().count('--- a/')==1 and (ROOT/'range-clock-validity.followup.patch').read_text().count('@@ ')==1)
subprocess.check_call([NODE,'--check',str(AFTER/CTX)]);checks.append('changed metadata syntax')
subprocess.check_call([NODE,'--check',str(ROOT/'range-clock-validity.test.mjs')]);checks.append('new single test syntax')
for name in ['build-proposal.py','verify-proposal.py']:ast.parse((ROOT/name).read_text());checks.append('python syntax '+name)
tap=(ROOT/'range-clock-validity.tap').read_text()
check('one new connected test passed once','# tests 1\n' in tap and '# pass 1\n' in tap and '# fail 0\n' in tap)
w=json.loads((ROOT/'range-clock-witness.json').read_text())
check('nine connected control vectors',len(w['cases'])==9)
check('all original ranges retained',all(c['legacy_range_retained'] for c in w['cases']))
check('all manual and Telegram texts unchanged',all(c['manual_byte_delta']==c['telegram_byte_delta']==0 for c in w['cases']))
check('native readback not inferred',all(c['native_readback'] is False for c in w['cases']))
check('sourceHTTP not attempted',w['attempted_sourceHTTP']==0)
proof=json.loads((ROOT/'saved-descriptor-and-counterexample.json').read_text())
check('saved ZIP exact binding',sha((REPO/proof['zip_path']).read_bytes())==proof['zip_sha256'])
check('actual corruption not claimed',proof['actual_native_corruption_claimed'] is False)
check('shared tracked tree untouched',subprocess.check_output(['git','diff','--name-only'],cwd=REPO,text=True).strip()=='')
result={'schema':'NEW_RANGE_METADATA_GUARD_VERIFICATION_V1','new_static_provenance_checks_PASS':len(checks),'FAIL':0,'new_semantic_test_cases':1,'test_runs':1,'old8_or_559_executed':0,'checks':checks}
(ROOT/'verification.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='checks'}))
