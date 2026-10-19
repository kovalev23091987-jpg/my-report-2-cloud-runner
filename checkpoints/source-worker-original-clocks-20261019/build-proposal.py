"""Build a two-file shared proposal over the already tested central 519 runtime.

The caller supplies the exact central src snapshot in .runtime/base/src.
This never writes production sources or runs accepted test modules.
"""
from pathlib import Path
import difflib, hashlib, json, shutil

ROOT = Path(__file__).resolve().parent
BASE = ROOT / '.runtime/base/src'
OUT = ROOT / '.runtime/proposed/src'
shutil.copytree(BASE, OUT)
changes = {}

def replace(name, old, new, count=1):
    p = OUT / name
    s = p.read_text()
    if s.count(old) != count:
        raise ValueError(f'{name}: expected {count} exact anchors, got {s.count(old)}')
    p.write_text(s.replace(old, new))

replace('htx-technical-structure.mjs',
    'deriveHtxRecentPathEvidence({contract,window,source_ts,observed_ts}={})',
    'deriveHtxRecentPathEvidence({contract,window,source_ts,observed_ts,first_known_ts=observed_ts}={})')
replace('htx-technical-structure.mjs',
    '![w.window_start_ts,w.window_end_ts,source_ts,observed_ts].every(Number.isSafeInteger)',
    '![w.window_start_ts,w.window_end_ts,source_ts,observed_ts,first_known_ts].every(Number.isSafeInteger)')
replace('htx-technical-structure.mjs',
    'w.window_end_ts>source_ts||source_ts>observed_ts||observed_ts-source_ts>TTL',
    'w.window_end_ts>source_ts||source_ts>first_known_ts||first_known_ts>observed_ts||observed_ts-source_ts>TTL')
replace('htx-technical-structure.mjs',
    'source_ts,observed_ts,expires_at:Math.min(source_ts+TTL,w.window_end_ts+TTL)',
    'source_ts,observed_ts,first_known_ts,expires_at:Math.min(source_ts+TTL,w.window_end_ts+TTL)')
replace('htx-technical-structure.mjs',
    "source_ts:t.provider_source_ts,observed_ts:now}):[];",
    "source_ts:t.provider_source_ts,observed_ts:now,first_known_ts:trajectory.available_ts??now}):[];")
replace('block-result-context.mjs',
    'source_ts:row.source_ts,observed_ts:row.observed_ts})[0];',
    'source_ts:row.source_ts,observed_ts:row.observed_ts,first_known_ts:row.first_known_ts})[0];')
# Add audit metadata only after describe/validation. It is rederived from the
# exact canonical evidence, never trusted from the stored supporting fact.
replace('block-result-context.mjs',
    "const origins=row.block_id==='N12'?contextComponentOrigins([row,...relatedRows]):null;",
    "const original_clock=row.block_id==='N10'?{source_ts:row.source_ts,first_known_ts:row.first_known_ts,observed_ts:row.observed_ts,expires_at:row.expires_at,window_start_ts:number(row.window_start_ts)??number(row.window_start),window_end_ts:number(row.window_end_ts)??number(row.window_end),source_clock_policy:row.source_clock_policy??null}:null;\n  const origins=row.block_id==='N12'?contextComponentOrigins([row,...relatedRows]):null;")
replace('block-result-context.mjs',
    'seen.add(root);facts.push({...common,...fact,unit:',
    'seen.add(root);facts.push({...common,...fact,...(original_clock?{original_clock}:{}),unit:')
replace('block-result-context.mjs',
    "source_ts:row.source_ts,observed_ts:row.observed_ts,label:row.label,value:row.value,",
    "...(row.original_clock?{original_clock:row.original_clock}:{}),source_ts:row.source_ts,observed_ts:row.observed_ts,label:row.label,value:row.value,", count=2)

patch = []
for name in ['htx-technical-structure.mjs', 'block-result-context.mjs']:
    before, after = (BASE/name).read_bytes(), (OUT/name).read_bytes()
    rel = 'current-generation/files/src/' + name
    changes[rel] = {'before_sha256': hashlib.sha256(before).hexdigest(),
                    'after_sha256': hashlib.sha256(after).hexdigest()}
    patch += list(difflib.unified_diff(before.decode().splitlines(True), after.decode().splitlines(True),
                                     fromfile='a/'+rel, tofile='b/'+rel))
(ROOT/'shared-original-clocks.proposed.patch').write_text(''.join(patch))
(ROOT/'proposal-file-hashes.json').write_text(json.dumps(changes, indent=2)+'\n')
print(json.dumps({'two_file_proposal_built': True, 'base': '05ce093e9e4428ffec5e15d5bc677044346a2f53', 'files': changes}))
