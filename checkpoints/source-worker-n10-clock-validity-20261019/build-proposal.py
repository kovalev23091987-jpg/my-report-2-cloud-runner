from pathlib import Path
import difflib,hashlib,json,shutil,subprocess
ROOT=Path(__file__).resolve().parent
REPO=ROOT.parents[1]
MAIN=ROOT/'.runtime/main'
BEFORE=ROOT/'.runtime/with522'
AFTER=ROOT/'.runtime/after'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
dependency=ROOT/'dependencies/pr522-original-clocks.proposed.patch'
assert sha(dependency)=='ae10a266683a06fd156b021833b1ca33acc26910fc5e395b3e5adda06b52332e'
shutil.copytree(MAIN,BEFORE)
subprocess.check_call(['git','apply','--directory='+str(BEFORE.relative_to(REPO)),str(dependency)],cwd=REPO)
assert sha(BEFORE/'current-generation/files/src/block-result-context.mjs')=='afeb69e1f374fe033232b3e4af4fe9a3681b880f7d4089e61c22513e111b1f86'
assert sha(BEFORE/'current-generation/files/src/htx-technical-structure.mjs')=='6613c9db75709f76ae3487fdc9d8bc9fab6af053bb8a56f5bef45ab2d49d6337'
shutil.copytree(BEFORE,AFTER)
target='current-generation/files/src/block-result-context.mjs'
p=AFTER/target
s=p.read_text();anchor="const original_clock=row.block_id==='N10'?"
assert s.count(anchor)==1
s=s.replace(anchor,"const original_clock=row.block_id==='N10'&&[row.source_ts,row.first_known_ts,row.observed_ts,row.expires_at].every(Number.isSafeInteger)&&row.source_ts<=row.first_known_ts&&row.first_known_ts<=row.observed_ts&&row.observed_ts<=row.expires_at?")
p.write_text(s)
def diff(before,after,files):
    result=[]
    for file in files:
        result+=list(difflib.unified_diff((before/file).read_text().splitlines(True),(after/file).read_text().splitlines(True),fromfile='a/'+file,tofile='b/'+file))
    return ''.join(result)
(ROOT/'range-clock-validity.followup.patch').write_text(diff(BEFORE,AFTER,[target]))
files=[target,'current-generation/files/src/htx-technical-structure.mjs']
(ROOT/'original-clocks-cumulative.proposed.patch').write_text(diff(MAIN,AFTER,files))
hashes={f:{'accepted521_sha256':sha(MAIN/f),'frozen522_sha256':sha(BEFORE/f),'after_followup_sha256':sha(AFTER/f)} for f in files}
(ROOT/'proposal-file-hashes.json').write_text(json.dumps(hashes,indent=2)+'\n')
print(json.dumps({'frozen522_preserved':True,'new_runtime_delta':'one metadata-attachment condition','targets':hashes}))
