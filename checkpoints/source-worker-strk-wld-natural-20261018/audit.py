#!/usr/bin/env python3
"""One NEW retained-run source/fact/consumer audit; no network or DB client.

Do not replay compact canonical projections as full native canonical rows.
Completion-budget accounting and PR499 peer review belong to other workers.
"""
import hashlib
import json
import re
import subprocess
import sys
import zipfile
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
NATIVE = '00e103f37774420f00d2043ba94dbd6dbbab2f5e'
RUN = '1792356159202-1792356174618'
BLOCKS = ['N05', 'N10', 'N12', 'N15']
checks = []


def check(name, condition):
    if not condition:
        raise AssertionError(name)
    checks.append(name)


def sha(b):
    return hashlib.sha256(b).hexdigest()


def git_body(commit, path):
    return subprocess.check_output(['git', 'show', commit + ':' + path], cwd=ROOT)


binding = json.loads((HERE / 'original-binding.json').read_text())
members = {}
for archive, expected in binding['archives'].items():
    b = (HERE / archive).read_bytes()
    check(archive + ' immutable ZIP SHA/bytes', sha(b) == expected['sha256'] and len(b) == expected['bytes'])
    with zipfile.ZipFile(HERE / archive) as z:
        check(archive + ' exact flat member set', set(z.namelist()) == set(expected['members']))
        for name, row in expected['members'].items():
            data = z.read(name)
            check(name + ' exact original hash/bytes', sha(data) == row['sha256'] and len(data) == row['bytes'])
            members[name] = json.loads(data)
for name, row in binding['metadata'].items():
    b = (HERE / name).read_bytes()
    check(name + ' exact metadata hash/bytes', sha(b) == row['sha256'] and len(b) == row['bytes'])
run = members['report2-run-result.json']
info = members['telegram-info-proof.json']
delivery = members['same-run-delivery-proof.json']
automatic = members['automatic-delivery-audit.json']
check('report/info/delivery exact native head and business-run binding', run['head'] == info['head'] == delivery['head'] == NATIVE and run['run_id'] == info['source_run_id'] == delivery['run_id'] == RUN)
check('original selected order preserved, no reranking', [c['contract'] for c in run['candidates']] == ['STRK-USDT', 'WLD-USDT'])
check('no secret-bearing or alternative manual reconstruction', run['secrets_included'] is False and run['alternative_manual_recalculation'] is False)

code_names = [
    'observation-source-role-audit.mjs', 'observation-source-role-gate.mjs',
    'source-role-consumer.mjs', 'inherited-fact-contract.mjs',
    'canonical-lifecycle-authority.mjs', 'canonical-publication.mjs',
    'v3-telegram-lifecycle-sidecar.mjs', 'block-result-context.mjs',
    'htx-technical-structure.mjs', 'backpack-four-hour-flow.mjs',
    'backpack-flow-collector.mjs', 'orderly-public-liquidation-positions.mjs',
    'pump-liquidation-zones.mjs',
]
code = {}
for name in code_names:
    path = 'current-generation/files/src/' + name
    b = git_body(NATIVE, path)
    code[name] = {'path': path, 'sha256': sha(b), 'text': b.decode()}
check('native role gate requires HTX and distinct origins without inventing new threshold', 'return htx&&origins.size>=2;' in code['observation-source-role-gate.mjs']['text'])
check('native source clock tolerance retained, not a new policy', 'source>received+60000' in code['source-role-consumer.mjs']['text'])
check('native audit predates new optional proof-field projection', 'retained_fact_proof' not in code['observation-source-role-audit.mjs']['text'])
prior_path = 'checkpoints/source-worker-btw-cjk-natural-20261018/analysis.json'
prior_bytes = git_body('173422ccbe9a4e4300e1bccaf8a6d4ddf015bad2', prior_path)
check('prior BTW accepted analysis reused by SHA only, no old audit run', sha(prior_bytes) == '64bbe16a22b8241c30c288e836f39d8d8d3a67fd0d0d44e540c25cdeaddc472b')
prior = next(c for c in json.loads(prior_bytes)['candidates'] if c['contract'] == 'BTW-USDT')
prior_role = prior['observation_eligibility']['retained_source_gate']

transitions = {t['contract']: t for t in info['lifecycle']['transitions']}
cases = delivery['cases']
check('one exact same-run network-ACK case is STRK222', len(cases) == 1 and cases[0]['contract'] == 'STRK-USDT' and cases[0]['telegram_message_id'] == '222' and cases[0]['exact_SENT'] is True and cases[0]['same_run_binding_verified'] is True and cases[0]['dispatch_finalized'] is True)
check('WLD explicitly capacity-deferred in separate same-run info original', transitions['WLD-USDT']['status'] == 'CAPACITY_DEFERRED' and transitions['WLD-USDT']['dispatch'] is None)
check('earlier lifecycle preparation is distinct from later bound network ACK', info['lifecycle']['mode'] == 'SHADOW_ONLY' and info['lifecycle']['network_send'] is False and info['v3_telegram_network_enabled'] is True and transitions['STRK-USDT']['dispatch']['state'] == 'PENDING')

results = []
for candidate in run['candidates']:
    contract = candidate['contract']
    canonical = candidate['canonical']
    role = candidate['source_role_publication_audit']
    rendered = candidate['block_rendered_results']
    use = candidate['block_decision_use']
    check(contract + ' exact original run/snapshot/clock bindings', all(x['run_id'] == RUN and x['snapshot_id'] == candidate['snapshot_id'] for x in [canonical, role, rendered, use]) and canonical['observed_ts'] == role['observed_ts'] == candidate['observed_ts'])
    check(contract + ' compact canonical is not silently restored/replayed', 'metadata' not in canonical)
    check(contract + ' original source gate closed with THREE origins', role['status'] == 'CLOSED' and role['observation_source_gate_closed'] is True and role['reasons'] == [] and role['distinct_verified_origins'] == ['GATE_OFFICIAL', 'HTX_OFFICIAL', 'OKX_OFFICIAL'] and role['verified_HTX_execution'] is True)
    check(contract + ' 16 usable metrics not 16 independent origins', role['classified_receipt_count'] == 21 and role['usable_role_receipt_count'] == 16 and role['omitted_receipt_details'] == 0 and role['exclusion_reason_counts'] == {'SOURCE_NOT_CLOSED': 1, 'FACT_OR_IDENTITY_NOT_VERIFIED': 1, 'UNKNOWN_OR_CONFLICTING_PROVIDER': 3})
    usable = [r for r in role['receipts'] if r['usable']]
    counts = Counter(r['source_key'] for r in usable)
    check(contract + ' Gate4 OKX11 HTX1 role receipts', counts == {'GATE_OFFICIAL': 4, 'OKX_OFFICIAL': 11, 'HTX_OFFICIAL': 1})
    role_rows = []
    for row in role['receipts']:
        row = dict(row)
        event, received = row.get('event_ts'), row.get('received_ts')
        row['retained_exact_unit'] = None
        row['retained_identity_envelope'] = None
        row['source_age_at_original_candidate_ms'] = candidate['observed_ts'] - event if event is not None else None
        row['event_minus_received_ms'] = event - received if event is not None and received is not None else None
        role_rows.append(row)
    oi = next(r for r in role_rows if r['source_key'] == 'OKX_OFFICIAL' and r['metric'] == 'OPEN_INTEREST_CURRENT')
    check(contract + ' positive source/receipt skew preserved within native tolerance', 0 < oi['event_minus_received_ms'] <= 60000)
    blocks = {}
    selected_origins = []
    for b in BLOCKS:
        coverage = candidate['block_coverage']['blocks'][b]
        block_use = use['blocks'][b]
        facts = [f for f in rendered['context_receipts'] if f.get('block_id') == b]
        blocks[b] = {'coverage': coverage, 'decision_use': block_use, 'manual_context_receipts': facts, 'detailed_Telegram_context_receipts': []}
        for fact in facts:
            for origin in fact.get('component_origins', []):
                o = dict(origin)
                ts = o.get('source_ts')
                o['source_age_at_original_candidate_ms'] = candidate['observed_ts'] - ts if ts is not None else None
                o['known_by_original_candidate'] = o.get('first_known_ts') is not None and o['first_known_ts'] <= candidate['observed_ts']
                o['not_expired_at_original_candidate'] = o.get('expires_at') is not None and candidate['observed_ts'] < o['expires_at']
                o['raw_body_replayed'] = False
                selected_origins.append(o)
    check(contract + ' N05 manual fact is not invented decision assessment', blocks['N05']['decision_use']['participation_status'] == 'USE_NOT_PROVEN' and blocks['N05']['decision_use']['decision_assessment_receipt_count'] == 0 and len(blocks['N05']['manual_context_receipts']) == 1)
    check(contract + ' N10 three neutral facts and N12 three neutral assessed facts', blocks['N10']['decision_use']['decision_assessment_receipt_count'] == 3 and blocks['N12']['decision_use']['decision_assessment_receipt_count'] == 3 and all(blocks[b]['decision_use']['score_contribution'] == 0 for b in ['N05', 'N10', 'N12']))
    n12_ids = {x['evidence_id'] for x in blocks['N12']['decision_use']['impact_diagnostic']['rows']}
    displayed_ids = {eid for f in blocks['N12']['manual_context_receipts'] for eid in f['evidence_ids']}
    check(contract + ' composite manual context retains all THREE N12 fact IDs', n12_ids <= displayed_ids)
    check(contract + ' N12 selected origins known/unexpired; no source-age freshness invented', all(o['known_by_original_candidate'] and o['not_expired_at_original_candidate'] for o in selected_origins))
    check(contract + ' same external5HTTP receipt in N05/N12 not added twice', blocks['N05']['coverage']['source_checks']['EXTERNAL_N05_FLOW']['network_calls'] == blocks['N12']['coverage']['source_checks']['EXTERNAL_N05_FLOW']['network_calls'] == 5)
    n15 = blocks['N15']['decision_use']
    check(contract + ' N15 actual applications retained separately from presentation0', abs(sum(x['actual_score_contribution'] for x in n15['impact_diagnostic']['rows']) - n15['score_contribution']) < 1e-10 and all(f['score_contribution'] == 0 for f in blocks['N15']['manual_context_receipts']))
    check(contract + ' detailed block delivery remains unproven', rendered['telegram_context_receipts'] == [] and rendered['telegram_delivery_proven'] is False and rendered['telegram_message_id'] is None)
    liq = canonical['liquidations']
    zones = liq['all_zones']
    models = liq['calculated_scenarios']
    check(contract + ' eight external USD models stay separate, no HTX fallback', len(models) == 8 and liq['htx_source_backed_model']['status'] == 'DISABLED_BY_OWNER_ON_REQUEST_ONLY')
    for kind, rows in [('provider', zones), ('model', models)]:
        check(contract + ' ' + kind + ' no target/USDT-FX upgrade', all(z['decision_target_eligible'] is False and z['exact_notional_usdt'] is None for z in rows))
        check(contract + ' ' + kind + ' distance uses its OWN original same-quote source reference', all(z['distance_reference_basis'] == 'ORIGINAL_SOURCE_REFERENCE_SAME_QUOTE' and abs((z['price'] / z['distance_reference_price'] - 1) * 100 - z['distance_pct']) < 1e-7 for z in rows))
    check(contract + ' provider USDC and model USD never merged as one quote', all(z['price_quote'] == z['notional_unit'] == 'USDC' and z['conditional_cross'] is True for z in zones) and all(z['price_quote'] == 'USD' and z['scenario_only'] is True for z in models))
    check(contract + ' source levels do not become decision targets', canonical['targets'] == [])
    manual_lines = {side: next(s for s in candidate['manual_text'].splitlines() if s.startswith('Ликвидационные уровни ' + label + ':')) for side, label in [('above', 'выше'), ('below', 'ниже')]}
    display_counts = {side: line.count('к цене источника)') for side, line in manual_lines.items()}
    check(contract + ' manual primary panel maximum three per side', all(n <= 3 for n in display_counts.values()))
    result = {
        **{k: candidate.get(k) for k in ['contract', 'direction', 'publication_id', 'run_id', 'snapshot_id', 'wave_id', 'observed_ts', 'valid_until_ts', 'lifecycle_event', 'canonical_state', 'actionability_status', 'actionability_reason']},
        'scores': canonical['scores'], 'data_quality': canonical['data_quality'],
        'original_source_role_audit': role, 'role_receipts_with_explicit_limits': role_rows,
        'role_semantics': 'THREE_KNOWN_ORIGINS_ACROSS_USABLE_ROLES_NOT_THREE_IDENTICAL_METRIC_CONFIRMATIONS_OR_STATISTICAL_INDEPENDENCE',
        'blocks': blocks, 'selected_component_origins': selected_origins,
        'source_collection_priority': candidate['source_collection_priority'],
        'LIQ': liq, 'LIQ_manual_primary_lines': manual_lines, 'LIQ_manual_primary_count_by_side': display_counts,
        'lifecycle_info_transition': transitions[contract],
        'detailed_Telegram_block_delivery': 'NOT_PROVEN',
        'full_raw_provider_and_identity_replay': False,
    }
    results.append(result)

strk, wld = results
check('STRK exact root SENT fingerprint/pub/snapshot/run/clock binding', all(cases[0][k] == strk[k] for k in ['publication_id', 'contract', 'direction', 'wave_id', 'lifecycle_event', 'run_id', 'snapshot_id', 'observed_ts']) and cases[0]['analytical_fingerprint'] == run['candidates'][0]['canonical']['analytical_fingerprint'])
task = cases[0]['task_at_delivery']
check('STRK task PENDING verified at delivery only, no ENTRY/current-state claim', task['state'] == 'PENDING' and task['run_id'] == RUN and task['snapshot_id'] == strk['snapshot_id'] and cases[0]['task_at_delivery_verified'] is True and cases[0]['task_state_after_delivery_known'] is False and cases[0]['actual_ENTRY'] is False)
check('STRK native canonical92 vs earlier lifecycle91 are distinct retained scores', strk['scores']['coin_interest_0_100'] == 92 and transitions['STRK-USDT']['score_0_100'] == 91)
check('WLD source-closed does not override capacity deferral or create SENT', wld['lifecycle_event'] is None and wld['actionability_status'] == 'UNASSESSED' and not any(c['contract'] == 'WLD-USDT' for c in cases))
check('STRK N05 single-venue BACKPACK USDC explicitly labelled', strk['blocks']['N05']['manual_context_receipts'][0]['source'] == 'BACKPACK' and 'USDC' in strk['blocks']['N05']['manual_context_receipts'][0]['value'])
check('N12 distinct providers are TWO venues, HTX spot/futures one origin', strk['blocks']['N12']['decision_use']['source_accounting']['used_provider_ids'] == ['BITGET_SPOT_TRADES', 'HTX_LARGE_TRADES', 'HTX_SPOT_TRADES'] and wld['blocks']['N12']['decision_use']['source_accounting']['used_provider_ids'] == ['GATE_SPOT_TRADES', 'HTX_LARGE_TRADES', 'HTX_SPOT_TRADES'])
check('STRK/WLD N15 exact nonzero applications .5344/.437 preserved', strk['blocks']['N15']['decision_use']['score_contribution'] == .5344 and wld['blocks']['N15']['decision_use']['score_contribution'] == .437)
check('STRK has TWO HL native sample levels; WLD ONE native plus17 provider estimates', Counter(z['kind'] for z in strk['LIQ']['all_zones']) == {'NATIVE_FUTURE_LEVEL': 2} and Counter(z['kind'] for z in wld['LIQ']['all_zones']) == {'NATIVE_FUTURE_LEVEL': 1, 'PROVIDER_ESTIMATE': 17})
check('shared LIQ acquisition four HTTP is retained, not added per panel', run['liquidation_source_acquisition_audit']['shared_budget'] == {'reserved_http': 4, 'actual_http': 4, 'max_http_per_run': 4})
check('DYDX zero-HTTP deferrals are internal scheduling limits, not provider failure', all(row['source_outcome']['actual_http'] == 0 and row['source_outcome']['failure_origin'] == 'INTERNAL_SCHEDULER' for row in run['liquidation_source_acquisition_audit']['routes'] if row['lane'] == 'DYDX_PINNED_NATIVE'))

technical = code['htx-technical-structure.mjs']['text']
backpack = code['backpack-four-hour-flow.mjs']['text']
collector = code['backpack-flow-collector.mjs']['text']
check('next useful route question has exact code witnesses, not invented bars', "component.quote!=='USDT'" in technical and 'BACKPACK' not in technical and 'candles.length!==240' in backpack and "quote_comparison_policy:'WITHIN_VENUE_DIMENSIONLESS_IMBALANCE_ONLY'" in backpack and 'pages,candles' in collector)
backpack_history_path = 'checkpoints/n05-backpack-missing4-38134543735/batch-summary.json'
backpack_history_bytes = git_body('230c608f4ffc606eb34562a6484d199a976ffe4a', backpack_history_path)
check('accepted old Backpack metadata reused by exact SHA, not a repeated qualification', sha(backpack_history_bytes) == '811b0c4fe9f403390af54d15275020bf41d05282e674dde0ed22aeac1770eb82')
backpack_history = json.loads(backpack_history_bytes)
history_limits = [{'contract': c['contract'], 'original_observed_ts': c['observed_ts'], 'status': c['status'], 'last15m_trade_count': next(w['trade_count'] for w in c['recent_windows'] if w['minutes'] == 15)} for c in backpack_history['results']]
check('old full4h flow does NOT prove an active last15m price window', len(history_limits) == 4 and all(c['status'] == 'CLOSED_COUNT_AND_VOLUME_RECONCILED_FOUR_HOURS' and c['last15m_trade_count'] == 0 for c in history_limits))

analysis = {
    'schema': 'NEW_STRK_WLD_SOURCE_FACT_CONSUMER_AND_EXACT_SENT_BOUNDARY_AUDIT_V1',
    'cloud_run': 39164519816, 'native_head': NATIVE, 'business_run_id': RUN,
    'two_original_archives': binding['archives'],
    'pinned_native_code': {k: {a: b for a, b in v.items() if a != 'text'} for k, v in code.items()},
    'candidates': results,
    'exact_root_delivery': delivery, 'automatic_delivery_audit': automatic,
    'separate_lifecycle_info': info,
    'prior_BTW_comparison_reuse': {'frozen_PR': 495, 'analysis_sha256': sha(prior_bytes), 'source_gate_closed': prior_role['observation_source_gate_closed'], 'origins': prior_role['distinct_verified_origins'], 'underlying_flag_or_first_runtime_reason': None, 'old_audit_repeated': False, 'new_STRK_WLD_success_does_not_backfill_old_BTW_flags': True},
    'concrete_next_usefulness_question': {
        'provider': 'BACKPACK', 'asset': 'STRK-USDT', 'market_quote': 'SPOT_USDC',
        'saved_fact': 'N05 complete count/volume-reconciled4h flow; native producer requires240closed1mOHLC and conditionally caches them.',
        'current_N10_consumer_exclusion': 'No BACKPACK venue adapter and explicit component.quote USDT requirement.',
        'classification': 'STRUCTURAL_COVERAGE_GAP_NOT_PROVEN_RUNTIME_DEFECT',
        'missing_original': 'The exact240raw OHLC rows and cache persistence ACK are absent from these compact artifacts.',
        'current_STRK_last15m_activity': None,
        'active_last15m_and_exact_known_by_clock_required': True,
        'historical_negative_boundary_reuse': {'path': backpack_history_path, 'frozen_PR': 452, 'sha256': sha(backpack_history_bytes), 'original_summary_only': history_limits, 'old_qualification_or_probe_repeated': False, 'historical_assets_not_added_to_current105_scope': True},
        'next_if_existing_original_available': 'Check a separately labelled USDC within-venue15m path from exact already-saved raw bars, without FX/cross-quote HTX-price agreement/score/entry/new provider calls.',
        'shared_fix_or_new_framework_written': False, 'raw_price_fact_reconstructed': False,
        'new_SQL_or_provider_access_requested_or_granted': False,
    },
    'scope_limits': [
        'Two new selected assets of one original run, not current useful105-asset coverage.',
        'Exact STRK222 is canonical OBSERVE delivery. Detailed N05/N10/N12/N15/LIQ Telegram context receipts remain empty/unproven.',
        'WLD source eligibility closed but separate lifecycle capacity-deferred; no provider failure inferred.',
        'Compact audit lacks exact unit/settlement/identity envelopes and new optional proof flags. Preserve NULL; no unit inference from numeric magnitude.',
        'Positive OKX source/received skew is retained within existing60s policy, not transport latency or a new clock defect.',
        'Source role origins differ from flow/basket providers. HTX spot/futures one origin; aggregate sector providers not primary publication confirmations.',
        'N12 old last-trade timestamps, first-known receipt and expiry stay separate; incomplete/asynchronous samples are not full4h/24h flow.',
        'Orderly published estimated liquidation prices and HL cross-margin sample levels are not a full census or decision targets. USD models and USDC positions are not converted or summed.',
        'Legacy notional_usdt field name does not override notional_unit USDC or exact_notional_usdt NULL.',
        'No new actionable shared repair established from these compact inputs; preserve missing raw BackPack price witness as the next concrete usefulness question.',
        'Actual493 completion-budget point and PR499 peer review intentionally not duplicated.',
    ],
    'worker_actions': {'new_GitHub_run_artifact_acquisition': 0, 'provider_HTTP': 0, 'native_SQL': 0, 'WS': 0, 'deploy_MAIN_Telegram': 0, 'shared_runtime_mutations': 0, 'old_accepted_tests_or_probes_rerun': 0, 'new_original_assertions': len(checks)},
    'assertions': list(checks),
}
body = (json.dumps(analysis, ensure_ascii=False, indent=2) + '\n').encode()
if '--check' in sys.argv:
    if (HERE / 'analysis.json').read_bytes() != body:
        raise AssertionError('analysis byte reproduction')
else:
    (HERE / 'analysis.json').write_bytes(body)
print(json.dumps({'status': 'PASS', 'new_original_assertions': len(checks), 'analysis_sha256': sha(body), 'analysis_bytes': len(body), 'check_only': '--check' in sys.argv}))
