from pathlib import Path
import hashlib
import json

root = Path(__file__).resolve().parents[3]
h = Path(__file__).resolve().parent
load = lambda name: json.loads((h / name).read_text())
coverage = load('F562_FUTURE_LIQUIDATION_COVERAGE_550_V1.json')
scope_bytes = (h / 'U3_SELECTED_550_SYMBOLS_V1.txt').read_bytes()
assert hashlib.sha256(scope_bytes).hexdigest() == coverage['selected_scope_sha256']
symbols = scope_bytes.decode().splitlines()
rows = coverage['rows']
assert len(rows) == len(symbols) == coverage['denominator'] == 550
assert {r['native_symbol'] for r in rows} == set(symbols)
assert len({r['native_scope_id'] for r in rows}) == len({r['native_contract_id'] for r in rows}) == 550
assert all(r['status'] == 'NOT_CHECKED' and not r['checked_current_target'] for r in rows)
assert all(not r['checked_sources'] and not r['no_data_or_unsupported_claimed'] for r in rows)
assert all(r['actual_fresh_qualified_zones'] == 0 and r['source_event_ts'] is None
           and r['magnitude_value'] is None and r['price_basis_to_BingX_USDT'] == 'NOT_QUALIFIED' for r in rows)
assert all(r['native_base'] not in ['BTC', 'ETH', 'PAXG', 'XAUT'] for r in rows)
assert coverage['counts'] == {'USABLE': 0, 'PARTIAL': 0, 'UNUSABLE': 0, 'UNSUPPORTED_CONFIRMED': 0, 'NOT_CHECKED': 550}
assert sum(any(h['source'] == 'ORDERLY' for h in r['potential_label_hints']) for r in rows) == 36

matrix = load('F562_SOURCE_SELECTION_MATRIX_V1.json')
assert len(matrix['rows']) == 26 and matrix['manual_future_checks'] == 3
assert matrix['benchmark_BTC_ETH_removed'] and matrix['new_provider_HTTP_SQL_TG_deploy'] == 0
assert next(r for r in matrix['rows'] if r['primary'].startswith('MarginPad'))['priority'] == 'HOLD_NO_REPEAT'
assert next(r for r in matrix['rows'] if r['primary'].startswith('Blocklens'))['working_composition_decision'] == 'NOT_SELECTED_CURRENT_FRESHNESS_FAILURE'

proposal = load('F562_ORDERLY_BOUNDED_NATIVE_PROPOSAL_V1.json')
primary = json.loads((root / 'checkpoints/pump-report-20261025/ROOT_ORDERLY_CURRENT_PRIMARY_DELTA.json').read_text())
assert proposal['preferred_request']['json_body'] == primary['confirmed_request']
assert proposal['preferred_request']['max_requests'] == proposal['total_packet_HTTP_max'] == 1
assert proposal['preferred_request']['symbol_optional_confirmed'] and not primary['symbol_filter_required']
assert proposal['source_clock_bound_contract']['generation_event_ts'] is None
assert proposal['native_calls_executed'] == 0

index_bytes = (root / 'pump-report/sources/index.mjs').read_bytes()
assert hashlib.sha256(index_bytes).hexdigest() == '086d688894937ebb7d6dfb3c32d812062f39bf1e5ec74b3e0f1febabd57a9f92'
assert not (root / 'pump-report/sources/candle-coverage.mjs').exists()
unified = root / 'checkpoints/pump-report-20261025/PUMP_REPORT_UNIFIED_WORKING_SPEC_RU.md'
assert hashlib.sha256(unified.read_bytes()).hexdigest() == '384e038c734e02230845925fa564d46402ffc4be4555ca6345315ac5ea335048'
result = {'schema': 'SOURCE_F562_STATIC_COVERAGE_QUALIFICATION_V1', 'status': 'PASS_STATIC_COMPLETE_SCOPE_ONLY',
          'new_static_cases_passed': 1, 'failed': 0, 'rows': 550, 'actual_fresh_qualified': 0,
          'NOT_CHECKED': 550, 'UNSUPPORTED_CONFIRMED': 0, 'Orderly_label_hints_not_coverage': 36,
          'source_matrix_rows': 26, 'source_index_unchanged': True, 'native_IO': 0,
          'old_tests_or_probes_replayed': 0, 'does_not_establish_live_provider_support': True}
(h / 'F562_STATIC_COVERAGE_QUALIFICATION_V1.json').write_text(json.dumps(result, indent=2) + '\n')
print('F562: 1 static PASS; exact550 scope, 550 NOT_CHECKED, 0 unsupported, 0 native calls.')
