#!/usr/bin/env python3
"""Deterministic inspection of a NEW retained original; no network or DB client.

This does not reconstruct a full canonical row or call the publication engine.
Run from any directory; the source-code witnesses are pinned Git blobs.
"""
import hashlib
import json
import re
import subprocess
import sys
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
HEAD = '07703e786565eb2e0bbb4727f70ef6680115c07b'
SHA = 'a3ea8666f2329b63accdd6c353dc53268703d3fc86ce09b8f2a4bc8c9d0ac47a'
BLOCKS = ['N05', 'N10', 'N12', 'N15']
checks = []


def check(name, value):
    if not value:
        raise AssertionError(name)
    checks.append(name)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def pick(row, keys):
    return {k: row.get(k) for k in keys}


binding = json.loads((HERE / 'original-binding.json').read_text())
archive = (HERE / binding['archive']).read_bytes()
check('exact immutable ZIP digest and byte length', digest(archive) == SHA and len(archive) == 64437)
with zipfile.ZipFile(HERE / binding['archive']) as z:
    check('exact flat six-member set, no extra reconstructed bodies', set(z.namelist()) == set(binding['members']))
    originals = {}
    for name, expected in binding['members'].items():
        body = z.read(name)
        check('member bytes/hash ' + name, len(body) == expected['bytes'] and digest(body) == expected['sha256'])
        originals[name] = json.loads(body)
for name, sha in binding['metadata_sha256'].items():
    check('retained metadata digest ' + name, digest((HERE / name).read_bytes()) == sha)
run = originals['report2-run-result.json']
check('exact run/head and no secrets', run['head'] == HEAD and run['run_id'] == binding['run_id'] and run['secrets_included'] is False)
check('original selection order preserved, no reranking', [c['contract'] for c in run['candidates']] == ['龙虾-USDT', 'BTW-USDT'])
by_contract = {c['contract']: c for c in run['candidates']}

paths = [
    'observation-source-role-audit.mjs', 'observation-source-role-gate.mjs',
    'source-role-consumer.mjs', 'canonical-lifecycle-authority.mjs',
    'canonical-publication.mjs', 'v3-telegram-lifecycle-sidecar.mjs',
    'canonical-runtime-adapter.mjs', 'coinboss-liquidation-levels.mjs',
    'finalized-chain-events.mjs',
]
code = {}
for name in paths:
    path = 'current-generation/files/src/' + name
    body = subprocess.check_output(['git', 'show', HEAD + ':' + path], cwd=ROOT)
    code[name] = {'path': path, 'sha256': digest(body), 'text': body.decode()}
gate = code['observation-source-role-gate.mjs']['text']
authority = code['canonical-lifecycle-authority.mjs']['text']
publication = code['canonical-publication.mjs']['text']
check('native source gate requires verified HTX and at least two distinct origins', "return htx&&origins.size>=2;" in gate)
check('native authority source refusal occurs after identity/time/direction/state', authority.index('CURRENT_RUN_CANONICAL_IDENTITY_MISMATCH') < authority.index('CANONICAL_STATE_NOT_PUBLISHABLE') < authority.index('OBSERVE_SOURCE_ROLES_NOT_CLOSED'))
check('native publication retains independent OBSERVE source-role check', "if(!earlySourceRolesClosed(canonical))return {...base,reason:'OBSERVE_SOURCE_ROLES_NOT_CLOSED'};" in publication)
check('native consumer distinguishes fact/identity refusal from stale clocks', "return 'FACT_OR_IDENTITY_NOT_VERIFIED'" in code['source-role-consumer.mjs']['text'] and "return 'STALE_OR_UNVERIFIED_FRESHNESS'" in code['source-role-consumer.mjs']['text'])

results = []
for contract in binding['original_contract_order']:
    c = by_contract[contract]
    canonical = c['canonical']
    role = c['source_role_publication_audit']
    render = c['block_rendered_results']
    check(contract + ' exact run/snapshot/original clock binding', all(x['run_id'] == run['run_id'] and x['snapshot_id'] == c['snapshot_id'] for x in [canonical, role, render, c['block_decision_use']]) and role['observed_ts'] == c['observed_ts'] == canonical['observed_ts'])
    check(contract + ' original compact canonical lacks metadata; do not replay invented full row', 'metadata' not in canonical)
    check(contract + ' role audit records exact closed-origin deficit', role['observation_source_gate_closed'] is False and role['reasons'] == ['FEWER_THAN_TWO_VERIFIED_DISTINCT_ORIGINS'] and role['distinct_verified_origins'] == ['HTX_OFFICIAL'] and role['verified_HTX_execution'] is True)
    check(contract + ' original role audit not refresh or mutation', role['revalidated_at_original_observation'] is True and role['not_a_current_source_refresh'] is True and role['decisions_changed'] is False and role['sourceHTTP'] == role['D1'] == 0)
    check(contract + ' no invented Telegram block delivery', render['telegram_delivery_proven'] is False and render['telegram_message_id'] is None and render['telegram_context_receipts'] == [] and c['lifecycle_event'] is None)
    facts = [f for f in render['context_receipts'] if f.get('block_id') in BLOCKS]
    origins = []
    for f in facts:
        for o in f.get('component_origins', []):
            row = dict(o)
            ts = o.get('source_ts')
            row['source_age_ms_at_original_candidate'] = c['observed_ts'] - ts if ts is not None else None
            row['known_by_original_candidate'] = o.get('first_known_ts') is not None and o['first_known_ts'] <= c['observed_ts']
            row['not_expired_at_original_candidate'] = o.get('expires_at') is not None and c['observed_ts'] < o['expires_at']
            row['raw_body_in_this_archive'] = False
            origins.append(row)
    check(contract + ' selected N12 origin clocks known and unexpired at original candidate', all(o['known_by_original_candidate'] and o['not_expired_at_original_candidate'] for o in origins))
    blocks = {}
    for b in BLOCKS:
        cov = c['block_coverage']['blocks'][b]
        use = c['block_decision_use']['blocks'][b]
        blocks[b] = {
            'coverage': {k: v for k, v in cov.items() if k != 'source_checks'},
            'source_checks': cov['source_checks'],
            'decision_use': use,
            'manual_context_receipts': [f for f in facts if f['block_id'] == b],
            'telegram_context_receipts': [],
        }
    for b in ['N05', 'N10', 'N12']:
        check(contract + ' ' + b + ' neutral context does not become score', blocks[b]['decision_use']['score_contribution'] == 0)
    check(contract + ' N05 rendering is separate from proven decision use', blocks['N05']['decision_use']['participation_status'] == 'USE_NOT_PROVEN' and len(blocks['N05']['manual_context_receipts']) == 1)
    check(contract + ' N12 bounded HTX and Gate fact use preserved', blocks['N12']['decision_use']['decision_assessment_receipt_count'] == 2 and blocks['N12']['decision_use']['source_accounting']['used_provider_ids'] == ['GATE_SPOT_TRADES', 'HTX_SPOT_FUTURES_TRADES'])
    check(contract + ' N05/N12 original shared transport five, not ten', blocks['N05']['source_checks']['EXTERNAL_N05_FLOW']['network_calls'] == blocks['N12']['source_checks']['EXTERNAL_N05_FLOW']['network_calls'] == 5)
    flow_origins = [o for o in origins if o['block_id'] == 'N05']
    check(contract + ' exact retained four-hour flow window, not bounded-trade window', len(flow_origins) == 1 and flow_origins[0]['window_end_ts'] - flow_origins[0]['window_start_ts'] == 14400000 and flow_origins[0]['window_status'] == 'EXPLICIT_EVIDENCE_FIELDS')
    n15 = blocks['N15']['decision_use']
    check(contract + ' N15 actual score matches original applications, presentation zero not score erasure', abs(sum(x['actual_score_contribution'] for x in n15['impact_diagnostic']['rows']) - n15['score_contribution']) < 1e-10 and all(f['score_contribution'] == 0 for f in blocks['N15']['manual_context_receipts']))
    liq = canonical['liquidations']
    scenarios = liq['calculated_scenarios']
    check(contract + ' no factual future zones or local HTX fallback', liq['above'] == liq['below'] == [] and liq['provider_zone_count'] == 0 and liq['calculated_fallback_enabled'] is False and liq['htx_source_backed_model']['status'] == 'DISABLED_BY_OWNER_ON_REQUEST_ONLY')
    for s in scenarios:
        check(contract + ' retained model-only USD scenario ' + str(s['price']), s['price_quote'] == 'USD' and s['scenario_only'] is True and s['decision_target_eligible'] is False and s['exact_notional_usdt'] is None and s['position_count'] is None and abs((s['price'] / s['native_reference_price'] - 1) * 100 - s['distance_pct']) < 1e-8)
    # A chain event physical root is chain|transaction_hash|log_index, NOT asset identity.
    event_roots = c['block_decision_use']['blocks']['N04']['source_accounting']['used_physical_root_keys']
    check(contract + ' chain transaction roots typed separately from 40-hex token keys', all(re.fullmatch(r'bsc\|0x[0-9a-f]{64}\|\d+', root) for root in event_roots))
    priority = c['source_collection_priority']
    results.append({
        **pick(c, ['contract', 'publication_id', 'direction', 'run_id', 'snapshot_id', 'wave_id', 'observed_ts', 'valid_until_ts', 'canonical_state', 'lifecycle_event', 'actionability_status', 'actionability_reason']),
        'canonical_scores': canonical['scores'],
        'canonical_data_quality': canonical['data_quality'],
        'observation_eligibility': {
            'retained_source_gate': role,
            'necessary_source_condition_satisfied': False,
            'native_necessary_refusal_condition': 'OBSERVE_SOURCE_ROLES_NOT_CLOSED' if canonical['state'] == 'OBSERVE' else 'CANONICAL_STATE_NOT_PUBLISHABLE',
            'reason_is_conditional_on_reaching_native_check': True,
            'exact_first_runtime_lifecycle_reason': None,
            'exact_first_runtime_lifecycle_reason_status': 'UNKNOWN_MISSING_ORIGINAL_AUTHORITY_INPUTS_AND_RESULT',
            'missing_witnesses': ['full immutable canonical metadata.direction_resolution/source_role_view and classified original envelopes', 'authority return receipt', 'exact canonical row created_ts and handoff/early/prior-visible/removal context'],
            'compact_projection_replayed_as_full_canonical': False,
            'telegram_transport_failure_proven': False,
        },
        'blocks': blocks,
        'retained_selected_component_origins': origins,
        'ordering': priority,
        'ordering_interpretation': 'ORIGINAL_SAVED_OPERATIONAL_HISTORY_ORDER_NOT_CURRENT_COVERAGE_OR_PREDICTIVE_WEIGHT',
        'fallback_trace_limitations': {
            'shared_N05_N12_HTTP_must_not_be_added_twice': True,
            'ordered_collectors_is_not_exact_current_attempt_sequence': True,
            'full_current_provider_attempt_sequence': None,
            'unexported_receipt_routes_or_remaining_provider_headroom': None,
            'reason': 'Compact source-check export has route-null/truncated receipt detail; do not infer provider error or new admission from catalog/order/status200.',
        },
        'LIQ': liq,
        'identity_boundaries': {
            'exact_native_contract': contract,
            'CJK_transliterated_or_aliased': False,
            'sector_original_keys': c['block_decision_use']['blocks']['N15']['source_accounting']['used_physical_root_keys'],
            'chain_event_transaction_roots_NOT_token_addresses': event_roots,
            'cross_block_identity_conflict_proven': False,
            'raw_current_asset_identity_and_provider_bodies_retained': False,
            'new_current_identity_refresh': False,
        },
    })

btw = by_contract['BTW-USDT']
cjk = by_contract['龙虾-USDT']
check('BTW exact requested publication, SHORT OBSERVE82', btw['publication_id'] == 'PUB:c6e9f21e5f5b806e4718749bf82542c264b6e361' and btw['canonical_state'] == 'OBSERVE' and btw['direction'] == 'SHORT' and btw['canonical']['scores']['coin_interest_0_100'] == 82)
check('BTW informational fresh Gate label retained; not a qualified source-role claim', 'Гейт' in btw['manual_text'])
gate_rows = [x for x in btw['source_role_publication_audit']['receipts'] if x['source_key'] == 'GATE_OFFICIAL']
check('BTW four exact public Gate metrics refused as fact/identity, not elapsed freshness', len(gate_rows) == 4 and all(x['exclusion_reason'] == 'FACT_OR_IDENTITY_NOT_VERIFIED' and x['usable'] is False and x['normalized_value'] is None for x in gate_rows))
check('BTW N05 unavailable HTX4h does not erase complete single-venue Poloniex spot', btw['block_coverage']['blocks']['N05']['source_checks']['PRIMARY_HTX_FUTURES_FLOW']['status'] == 'HTX_EXACT_FUTURES_FLOW_4H_NOT_CLOSED' and any(o.get('venue') == 'POLONIEX' and o.get('market') == 'SPOT' for f in btw['block_rendered_results']['context_receipts'] for r in f.get('component_origins', []) if r['block_id'] == 'N05' for o in r.get('market_components', [])))
check('CJK separate REJECTED92, no entry or trigger invented', cjk['canonical_state'] == 'REJECTED' and cjk['canonical']['scores']['coin_interest_0_100'] == 92 and cjk['canonical']['entry'] is None and cjk['canonical']['trigger'] is None)
check('CJK closed HTX4h does not erase unverified24h gap', cjk['block_coverage']['blocks']['N05']['source_checks']['PRIMARY_HTX_FUTURES_FLOW']['status'] == 'CLOSED_EXACT_FUTURES_FLOW_4H' and 'futures_trajectory.flow_24h' in cjk['canonical']['data_quality']['gaps'])
check('CJK known CoinBoss other-asset refusal preserved without repeat', cjk['canonical']['liquidations']['future_source_status']['coinboss']['capability_receipt']['returned_symbol'] == 'BTC' and cjk['canonical']['liquidations']['future_source_status']['coinboss']['network_calls'] == 0)
check('BTW four Swolecharts scenarios at exact original clock', len(btw['canonical']['liquidations']['calculated_scenarios']) == 4 and all(s['source_ts'] == 1792353793370 for s in btw['canonical']['liquidations']['calculated_scenarios']))
delivery = originals['same-run-delivery-proof.json']
automatic = originals['automatic-delivery-audit.json']
check('same-run delivery has no exact SENT and no invented task result', delivery['status'] == 'NO_EXACT_SAME_RUN_SENT_CAPTURED' and delivery['cases'] == [] and automatic['exact_SENT'] == automatic['actual_ENTRY'] == 0 and automatic['task_state_after_delivery_known'] is False)
check('LIQ routes absent does not reconstruct acquisition or refresh', run['liquidation_source_acquisition_audit']['routes'] == [] and run['liquidation_source_acquisition_audit']['source_clocks_refreshed'] is False)

analysis = {
    'schema': 'NEW_BTW_CJK_SAVED_SOURCE_FACT_CONSUMER_AUDIT_V1',
    'cloud_run': binding['cloud_run'], 'source_head': HEAD, 'run_id': run['run_id'],
    'artifact_id': binding['artifact_id'], 'archive_sha256': SHA,
    'original_contract_order': binding['original_contract_order'],
    'pinned_native_code': {name: {k: v for k, v in row.items() if k != 'text'} for name, row in code.items()},
    'candidates': results,
    'delivery': {'same_run': delivery, 'automatic': automatic, 'same_run_block_delivery_proven': False, 'transport_failure_proven': False},
    'limitations': [
        'One new retained native run, two selected candidates; not current coverage of all105 or all7 acceptance directions.',
        'Raw provider responses/full evidence_v2/complete identity envelopes absent. Retained hashes and origins are witnesses, not raw replay.',
        'Gate public funding/OI/price/taker role receipts and Gate bounded spot-trade N12 facts are different fact paths; do not substitute one for another.',
        'Poloniex N05 four-hour spot and HTX bounded samples/spot/futures use different scopes; do not add windows or independent votes.',
        'N05 manual rendering does not establish decision assessment. N15 manual presentation score0 does not erase original nonzero score applications.',
        'N15 static coverage maximum0.6 versus resolved per-fact policy2 is the prior shared diagnostic proposal, not a newly changed weight or repeated old audit.',
        'Native source gate is demonstrably unclosed; exact FIRST runtime lifecycle refusal is UNKNOWN without authority/handoff/metadata receipts. No Telegram failure inferred.',
        'No retained LIQ acquisition route is not proof of no upstream acquisition. Model source clock is not raw transport receipt clock; USD not USDT.',
        'An intermediate local root-type comparison was corrected: N04 64hex transaction hashes are NOT N15 40hex token identities; no mismatch established.',
    ],
    'worker_actions': {'new_market_HTTP': 0, 'new_GitHub_run_or_artifact_acquisition': 0, 'new_native_SQL': 0, 'WS_connections': 0, 'deploy_MAIN_Telegram': 0, 'runtime_or_shared_mutations': 0, 'old_accepted_test_or_audit_reruns': 0, 'new_original_analysis_assertions': len(checks)},
    'assertions': list(checks),
}
encoded = (json.dumps(analysis, ensure_ascii=False, indent=2) + '\n').encode()
if '--check' in sys.argv:
    check('byte-for-byte deterministic analysis readback', (HERE / 'analysis.json').read_bytes() == encoded)
else:
    (HERE / 'analysis.json').write_bytes(encoded)
print(json.dumps({'status': 'PASS', 'new_original_assertions': len(analysis['assertions']), 'analysis_sha256': digest(encoded), 'analysis_bytes': len(encoded), 'check_only': '--check' in sys.argv}, ensure_ascii=False))
