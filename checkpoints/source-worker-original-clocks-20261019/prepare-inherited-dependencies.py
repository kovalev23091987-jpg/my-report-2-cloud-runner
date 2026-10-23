"""Complete only the imported runtime closure from pinned inherited source files.

No encrypted payload/key, installer, provider call, or old test execution.
The coordinator must use its full assembled runtime for central acceptance.
"""
from pathlib import Path
import hashlib,json,re,shutil
ROOT=Path(__file__).resolve().parent
REPO=ROOT.parents[1]
base=(ROOT/'.runtime/base/src').resolve()
manifest=json.loads((REPO/'post-v7-consolidated/proof/runtime-baseline-manifest.json').read_text())
added={}
seen=set()
def visit(p):
    p=p.resolve()
    if p in seen:return
    seen.add(p)
    if not p.exists():
        rel=p.relative_to(base).as_posix()
        candidates=[REPO/'post-v7-consolidated/final-reconciliation/files/src'/rel,
                    REPO/'post-v7-consolidated/post-v7/overlay/files/src'/rel,
                    REPO/'post-v7-consolidated/liquidation/liquidation-extension/integration/fixtures/base-runtime/src'/rel]
        source=next((x for x in candidates if x.is_file()),None)
        if source is None:raise ValueError(f'missing inherited dependency {rel}')
        b=source.read_bytes();sha=hashlib.sha256(b).hexdigest()
        if '/fixtures/base-runtime/' in str(source) and sha!=manifest.get('src/'+rel):
            raise ValueError(f'baseline manifest mismatch {rel}')
        p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b)
        added[rel]={'path':str(source.relative_to(REPO)),'sha256':sha,'trust':'PINNED_INHERITED_IMPORT_NOT_NEW_NATIVE_RUNTIME_ACK'}
    for name in re.findall(r'(?:from\s*|import\s*)[\'\"](\.[^\'\"]+)[\'\"]',p.read_text()):
        visit(p.parent/name)
for name in ['htx-technical-structure.mjs','block-result-context.mjs','canonical-runtime-adapter.mjs','canonical-publication.mjs']:
    visit(base/name)
(ROOT/'inherited-dependencies.json').write_text(json.dumps(added,indent=2)+'\n')
print(json.dumps({'pinned_inherited_imports':len(added),'closure_files':len(seen),'complete_decrypted_runtime_claimed':False}))
