"""Prepare a text proposal and disposable local sources; never edit shared files."""
import difflib, hashlib, json, pathlib, subprocess

ROOT = pathlib.Path(__file__).resolve().parents[2]
HERE = pathlib.Path(__file__).resolve().parent
BASE = '857ff3f65ad95e25ad7e5e9028ef54d1f715eadf'
PATHS = [
    'current-generation/files/src/observation-source-role-audit.mjs',
    'current-generation/files/src/worker.js',
    'current-generation/files/runner-main.mjs',
]
def read(p):
    return subprocess.check_output(['git', 'show', BASE + ':' + p], cwd=ROOT).decode()
def replace_once(text, before, after):
    if text.count(before) != 1:
        raise ValueError('Exact unique source anchor required: ' + before[:100])
    return text.replace(before, after)
before = {p: read(p) for p in PATHS}
after = dict(before)
after[PATHS[0]] += (HERE / 'audit-functions.proposed.txt').read_text()
after[PATHS[1]] = replace_once(after[PATHS[1]],
    "  if(typeof env?.REPORT2_LIQUIDATION_FORECAST_RECORD==='function'){",
    "  // Bounded technical callback after the canonical result is complete; never mutate its metadata/fingerprint.\n  if(typeof env?.REPORT2_GATE_BINDING_DIAGNOSTIC_BIND==='function')try{env.REPORT2_GATE_BINDING_DIAGNOSTIC_BIND({contract,run_id:canonicalRunId,snapshot_id:stage392SnapshotId,observed_ts:now,analytical_fingerprint:canonicalAnalyticalBundle?.canonical?.analytical_fingerprint});}catch{/* Diagnostics cannot change the analysis. */}\n  if(typeof env?.REPORT2_LIQUIDATION_FORECAST_RECORD==='function'){")
after[PATHS[2]] = replace_once(after[PATHS[2]],
    "import {auditObservationSourceRoles} from './src/observation-source-role-audit.mjs';",
    "import {auditObservationSourceRoles,captureGateBindingDiagnostic,projectGateSourceDiagnostic} from './src/observation-source-role-audit.mjs';")
after[PATHS[2]] = replace_once(after[PATHS[2]],
    'candidateContracts=[]}={}){', 'candidateContracts=[],gate_diagnostic_for=null}={}){')
after[PATHS[2]] = replace_once(after[PATHS[2]],
    '          source_role_publication_audit:auditObservationSourceRoles(canonical),',
    '          source_role_publication_audit:auditObservationSourceRoles(canonical),\n          gate_source_diagnostic:projectGateSourceDiagnostic(canonical,{binding_receipt:gate_diagnostic_for}),')
after[PATHS[2]] = replace_once(after[PATHS[2]],
    "  env.REPORT2_PUBLIC_ASSET_BINDING=params=>bindGateOfficialAssetIdentity({db:env.DATA_DB,fetch_impl:globalThis.fetch,request_admit:unifiedHttpBudget.reserve,db_admit:e=>evaluateWithinRunReservation({reservation:d1RunReservation,currentUsage:env.DATA_DB.usageSnapshot(),extraRowsRead:4500+e.rows_read,extraRowsWritten:150+e.rows_written}),...params});",
    (HERE / 'runner-memory.proposed.txt').read_text().rstrip())
after[PATHS[2]] = replace_once(after[PATHS[2]],
    "candidateContracts:env.REPORT2_CURRENT_CYCLE_SELECTION_AUDIT?.deep_check_selected||[]});",
    "candidateContracts:env.REPORT2_CURRENT_CYCLE_SELECTION_AUDIT?.deep_check_selected||[],gate_diagnostic_for:gateDiagnosticFor});")
patch = ''.join(''.join(difflib.unified_diff(before[p].splitlines(True), after[p].splitlines(True), fromfile='a/'+p, tofile='b/'+p)) for p in PATHS)
(HERE / 'shared-memory-diagnostic.proposed.patch').write_text(patch)
manifest = {'schema':'GATE_MEMORY_DIAGNOSTIC_PROPOSAL_INPUTS_V1','fixed_base':BASE,'production_imports':False,'targets':[]}
scratch = HERE / '.assembled'
for p in PATHS:
    target = scratch / p
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(after[p])
    manifest['targets'].append({'path':p,'before_sha256':hashlib.sha256(before[p].encode()).hexdigest(),'after_sha256':hashlib.sha256(after[p].encode()).hexdigest()})
for name in ['source-role-consumer.mjs','source-role-registry.mjs','inherited-fact-contract.mjs']:
    p='current-generation/files/src/'+name
    (scratch / p).write_text(read(p))
    manifest.setdefault('unchanged_dependencies',[]).append({'path':p,'sha256':hashlib.sha256(read(p).encode()).hexdigest()})
baseline = scratch / 'current-generation/files/src/audit-baseline.mjs'
baseline.write_text(before[PATHS[0]])
manifest['patch_sha256']=hashlib.sha256(patch.encode()).hexdigest()
(HERE / 'source-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'status':'PROPOSAL_PREPARED_ONLY','targets':len(PATHS),'patch_sha256':manifest['patch_sha256']}))
