"""New saved pair only. Pure JSON/Git/ZIP projection; no project imports/IO."""
import hashlib
import io
import json
import pathlib
import subprocess
import zipfile

OUT = pathlib.Path(__file__).resolve().parent
REPO = OUT.parents[1]
BASE = '1f5ba3fbf1daf09a48b4d5be7c4b564ba6e3654d'
NATIVE = '9d03c094375e78067a45fc754523f0ae6314397a'
ROOT = 'checkpoints/natural-39250479718/'
RUN = '1792412076494-1792412090239'
sha = lambda b: hashlib.sha256(b).hexdigest()

def git_bytes(path, ref=BASE):
    return subprocess.check_output(['git', '-c', 'http.version=HTTP/1.1', 'show', ref + ':' + path], cwd=REPO)

def write(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

def choose(value, keys):
    return {k: value[k] for k in keys if k in value}

def load_originals():
    groups = json.loads(git_bytes(ROOT + 'original-archives-receipt.json'))
    inputs, receipts = {}, []
    for item in groups:
        name = item['name']
        archive = git_bytes(ROOT + name + '.zip')
        members = {}
        with zipfile.ZipFile(io.BytesIO(archive)) as z:
            for member in z.namelist():
                body = z.read(member)
                members[member] = {'sha256': sha(body), 'bytes': len(body),
                                   'expected_sha256': item['members'][member]}
                inputs[member] = json.loads(body)
        receipts.append({'artifact_id': item['artifact_id'], 'name': name,
                         'path': ROOT + name + '.zip', 'bytes': len(archive),
                         'sha256': sha(archive), 'expected_digest': item['digest'],
                         'members': members})
    return inputs, receipts

def build():
    inputs, receipts = load_originals()
    report = inputs['report2-run-result.json']
    cases = []
    for c in report['candidates']:
        rendered = c['block_rendered_results']
        blocks = c['block_decision_use']['blocks']
        contexts = rendered['context_receipts']
        by_block = lambda b: [x for x in contexts if x['block_id'] == b]
        n05 = by_block('N05')[0]
        n12 = by_block('N12')
        primary = next(x for x in n12 if any(o['provider_id'] == 'HTX_SPOT_FUTURES_TRADES' for o in x.get('component_origins', [])))
        gate_spot = next(x for x in n12 if any(o['provider_id'] == 'GATE_SPOT_TRADES' for o in x.get('component_origins', [])))
        decision = {b: choose(blocks[b], ['assigned_consumer', 'valid_fact_count',
                    'participation_status', 'score_contribution',
                    'decision_assessment_receipt_count', 'unscored_diagnostic_receipt_count',
                    'rendered_useful_context_receipt_count']) for b in ['N05', 'N10', 'N12', 'N15']}
        for b in ['N05', 'N10', 'N12', 'N15']:
            decision[b]['impact_rows'] = blocks[b]['impact_diagnostic']['rows']
        roles = c['source_role_publication_audit']
        gate_roles = [x for x in roles['receipts'] if x['source_key'] == 'GATE_OFFICIAL']
        liq = c['canonical']['liquidations']
        zone_keys = ['kind', 'source', 'price', 'price_quote', 'notional', 'notional_unit',
                     'notional_usdt', 'exact_notional_usdt', 'exact_amount_available',
                     'amount_semantics', 'source_ts', 'coverage', 'conditional_cross',
                     'native_reference_price', 'decision_target_eligible', 'estimated',
                     'position_count', 'position_key', 'source_backed_calculated', 'scenario_only']
        external = c['block_coverage']['blocks']['N05']['source_checks']['EXTERNAL_N05_FLOW']
        cases.append({
            'contract': c['contract'], 'publication_id': c['publication_id'],
            'run_id': c['run_id'], 'snapshot_id': c['snapshot_id'], 'observed_ts': c['observed_ts'],
            'canonical_state': c['canonical']['state'], 'direction': c['direction'],
            'score_status': c['block_decision_use']['score_status'],
            'score_or_probability_not_recomputed': True,
            'five_useful_groups': {
                'N05_AVAILABLE_HTX_4H': n05,
                'N10_SAME_WINDOW_HTX_PATHS': by_block('N10'),
                'N12_BOUNDED_CONTEXT': {'HTX_with_N05_composite': primary, 'GATE_SPOT': gate_spot},
                'N15_SECTOR_CONTEXT': by_block('N15'),
                'LIQ_SOURCE_UNITS_AND_LIMITS': {
                    'status': liq['status'], 'reason': liq['reason'],
                    'source_level_count': len(liq['all_zones']),
                    'source_levels': [choose(x, zone_keys) for x in liq['all_zones']],
                    'external_model_scenario_count': len(liq['calculated_scenarios']),
                    'external_model_scenarios': [choose(x, zone_keys) for x in liq['calculated_scenarios']],
                    'source_receipts': liq['source_receipts'],
                    'future_source_status': liq['future_source_status'],
                    'actual_acquisition_routes': liq['acquisition_diagnostics']['routes'],
                    'manual_source_lines': [line for line in c['manual_text'].splitlines()
                                            if line.startswith('Ликвидационные уровни')],
                    'notional_alias_is_not_FX': True, 'measured_market_zero': False,
                    'new_target_entry_or_independence_claim': False}},
            'actual_block_consumers': decision,
            'Gate_boundary': {
                'role_use': gate_roles,
                'source_role_gate_status': roles['status'],
                'origins': roles['distinct_verified_origins'],
                'optional_binding_return': c['gate_source_diagnostic']['first_binding'],
                'normalized_identity_fields_as_retained': [x['identity'] for x in c['gate_source_diagnostic']['rows']],
                'units_and_intervals_as_retained': [choose(x, ['metric', 'unit', 'interval']) for x in c['gate_source_diagnostic']['rows']],
                'meaning': 'Optional binder eligible-row filter is empty. Code filters out asset_identity_verified===true; four stored normalized rows carry true. Not provider HTTP failure or source-role refusal.',
                'earlier_identity_authority_branch': None,
                'earlier_identity_authority_status': 'NOT_RECONSTRUCTED_FROM_NORMALIZED_FLAGS',
                'raw_alias_api_bodies_or_selected_source_cache_payload': None,
                'same_Gate_futures_metrics_are_N12_spot_trades': False,
                'new_shared_fix_established': False},
            'source_budget_and_fallback_boundary': {
                'external_N05_status': external['status'],
                'shared_N05_N12_actual_http': external['network_calls'],
                'compact_receipt_count': external['receipt_count'],
                'compact_route_receipts': external['receipts'],
                'priority_original': c['source_collection_priority'],
                'full_Gate_240m_closure_failure_term': None,
                'N05_partial_does_not_disable_current_N12_bounded_fact': True,
                'N05_N12_HTTP_not_additive': True},
            'render_boundary': choose(rendered, ['available_not_rendered_evidence_ids',
                    'telegram_payload_status', 'telegram_context_receipts',
                    'telegram_delivery_proven', 'telegram_message_id']),
            'manual_text': c['manual_text'],
        })
    audit = {'schema': 'SAVED_392504_CT_WLD_TARGETED_SOURCE_CONSUMER_AUDIT_V1',
             'native_head': NATIVE, 'saved_in_Git_at': BASE, 'cloud_run': 39250479718,
             'run_id': RUN, 'scope': 'Five selected useful groups, not all105 matrix or native acceptance',
             'cases': cases, 'conclusion': 'USEFUL_GATE_CONTEXT_RETAINED; NO_SAVED_SOURCE_FACT_LOSS_COUNTEREXAMPLE',
             'code_or_strategy_changed': False, 'normalizers_or_old_tests_executed': 0,
             'delivery234_and_Gate535_acceptance_repeated': False,
             'source_HTTP': 0, 'native_SQL': 0, 'MAIN': 0, 'Telegram': 0}
    code = {}
    anchors = {
        'gate-official-asset-binding.mjs': ['NO_USABLE_GATE_METRIC_REQUIRING_BINDING', 'r.asset_identity_verified!==true'],
        'worker.js': ['function promoteCorroboratedAssetIdentity', 'function buildCrossVenueAssetIdentityProof', 'async function collectGateDerivatives', 'parseGateContractStats', 'function externalEvidenceBase'],
        'inherited-fact-contract.mjs': ['EXPLICIT_ASSET_IDENTITY', 'LEGACY_VALUE_PASSTHROUGH'],
        'source-role-consumer.mjs': ['TRADES_CROSS_VENUE', 'FUNDING_CROSS_VENUE', 'independence_semantics'],
        'gate-flow-collector.mjs': ['normalizeGateN12BoundedTradeSample', 'n12_bounded_sample_status'],
        'gate-n12-bounded-trade-sample.mjs': ['whole_window_coverage_proven:false', 'ORIGINAL_GATE_TRADE_MILLISECONDS'],
    }
    for name, terms in anchors.items():
        path = 'current-generation/files/src/' + name
        b = git_bytes(path, NATIVE)
        text = b.decode().splitlines()
        code[path] = {'native_sha256': sha(b), 'working_base_sha256': sha(git_bytes(path)),
                      'anchors': [{'text': term, 'lines': [i for i, line in enumerate(text, 1) if term in line]} for term in terms]}
    return audit, {'schema': 'NEW_PAIR_EXACT_ORIGINALS_V1', 'base': BASE,
                   'native_head': NATIVE, 'archives': receipts,
                   'report_sha256': sha(git_bytes(ROOT + 'report2-run-result/report2-run-result.json')),
                   'delivery_or_budget_bodies_only_hash_bound_not_reaccepted': True}, code

if __name__ == '__main__':
    audit, originals, code = build()
    write('analysis.json', audit)
    write('originals.json', originals)
    write('code-paths.json', code)
    print(json.dumps({'analysis_sha256': sha((OUT / 'analysis.json').read_bytes()),
                      'cases': len(audit['cases']), 'selected_groups_per_case': 5,
                      'runtime_imports': 0, 'new_source_HTTP_or_SQL': 0}))
