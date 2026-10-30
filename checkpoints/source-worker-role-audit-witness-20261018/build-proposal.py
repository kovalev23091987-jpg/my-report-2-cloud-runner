#!/usr/bin/env python3
"""Build an uninstalled diagnostic-only patch from exact local Git blobs."""
import difflib
import hashlib
import json
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
BASE = 'a9d13e8dd5e7ed69953e3ed38af26596826affd9'
PATH = 'current-generation/files/src/observation-source-role-audit.mjs'
original = subprocess.check_output(['git', 'show', BASE + ':' + PATH], cwd=ROOT).decode()
assert hashlib.sha256(original.encode()).hexdigest() == 'e197a38c8866b3f8c3b59b688797cd9477240452c37353467f4cfbeeea529e29'
addition = """// Bounded original proof fields, never an admission or a new failure reason.
// Missing/invalid values stay null; do not infer them from another metric.
const proofBoolean=v=>typeof v==='boolean'?v:null;
const proofEnum=(v,values)=>typeof v==='string'&&values.includes(v)?v:null;
function retainedFactProof(r){
 return{
  decision_usable:proofBoolean(r.decision_usable),
  fact_contract_status:proofEnum(r.fact_contract_status,['CLOSED','NOT_CLOSED']),
  identity_status:proofEnum(r.identity_status,['CLOSED','NOT_CLOSED']),
  identity_object_status:proofEnum(r.identity?.status,['CLOSED','NOT_CLOSED']),
  source_compatible:proofBoolean(r.source_compatible),
  freshness_status:proofEnum(r.freshness_status,['CURRENT_AT_OBSERVATION','STALE','FUTURE_SOURCE_TIME','NOT_CLOSED','OBSERVED_NO_SLA']),
  normalization_status:proofEnum(r.normalization_status,['EXPLICIT_NORMALIZED_VALUE','LEGACY_VALUE_PASSTHROUGH']),
 };
}
"""
anchor = 'export function auditObservationSourceRoles(c){'
assert original.count(anchor) == 1
proposed = original.replace(anchor, addition + anchor)
old = 'exclusion_reason:r.role_exclusion_reason,independence_group:'
new = 'exclusion_reason:r.role_exclusion_reason,retained_fact_proof:retainedFactProof(r),independence_group:'
assert proposed.count(old) == 1
proposed = proposed.replace(old, new)
(HERE / 'observation-source-role-audit.proposed.mjs').write_text(proposed)
patch = ''.join(difflib.unified_diff(original.splitlines(True), proposed.splitlines(True), fromfile='a/' + PATH, tofile='b/' + PATH))
(HERE / 'coordinator-proposal.diff').write_text(patch)
bindings = {}
for name in ['observation-source-role-audit.mjs', 'source-role-consumer.mjs', 'source-role-registry.mjs']:
    p = 'current-generation/files/src/' + name
    b = subprocess.check_output(['git', 'show', BASE + ':' + p], cwd=ROOT)
    bindings[p] = hashlib.sha256(b).hexdigest()
runner_path = 'current-generation/files/runner-main.mjs'
runner = subprocess.check_output(['git', 'show', BASE + ':' + runner_path], cwd=ROOT)
assert 'source_role_publication_audit:auditObservationSourceRoles(canonical)' in runner.decode()
bindings[runner_path] = hashlib.sha256(runner).hexdigest()
scope = {
    'schema': 'OFFLINE_SOURCE_ROLE_PROOF_FIELDS_PROPOSAL_V1',
    'base_head': BASE,
    'allowed_prefix': 'checkpoints/source-worker-role-audit-witness-20261018/**',
    'proposed_shared_file_NOT_modified': PATH,
    'pinned_native_code_sha256': bindings,
    'proposal_sha256': hashlib.sha256(proposed.encode()).hexdigest(),
    'coordinator_patch_sha256': hashlib.sha256(patch.encode()).hexdigest(),
    'new_missing_witness': {
        'run': 39161429947, 'head': '07703e786565eb2e0bbb4727f70ef6680115c07b',
        'artifact': 12148887893,
        'zip_sha256': 'a3ea8666f2329b63accdd6c353dc53268703d3fc86ce09b8f2a4bc8c9d0ac47a',
        'frozen_review_PR': 495,
        'frozen_review_head': '173422ccbe9a4e4300e1bccaf8a6d4ddf015bad2',
        'analysis_sha256': '64bbe16a22b8241c30c288e836f39d8d8d3a67fd0d0d44e540c25cdeaddc472b',
        'contract': 'BTW-USDT',
        'four_public_Gate_metrics': ['FUNDING_RATE', 'OI_CHANGE_1H', 'PRICE_CHANGE_4H', 'TAKER_BALANCE_1H_RAW'],
        'original_exclusion': 'FACT_OR_IDENTITY_NOT_VERIFIED',
        'original_flags_and_specific_producer_cause': None,
        'exact_first_runtime_lifecycle_reason': None,
        'native_causal_replay': False,
    },
    'lease_commit': 'f1b33f519def2dab1be173654011acb64e9fa26b',
    'lease_owner': 'CODEX:SOURCES:01a14e11:1792355758725',
    'lease_expires_ts': 1792360558725,
    'runtime_installed': False, 'new_primary_source_qualified': False,
    'gate_strategy_weights_forms_limits_changed': False,
    'new_HTTP_SQL_WS_deploy_MAIN_Telegram': 0,
    'old_accepted_suites_rerun': 0,
}
(HERE / 'scope.json').write_text(json.dumps(scope, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'status': 'BUILT_NOT_INSTALLED', 'proposal_sha256': scope['proposal_sha256']}))
