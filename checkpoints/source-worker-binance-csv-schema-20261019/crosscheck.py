"""One bounded NEW schema crosscheck: two saved rows per archive, no replay."""
import csv
import datetime
import io
import json
import pathlib
import zipfile

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent
inputs = json.loads((HERE / 'reused-inputs.json').read_text())
mapping = json.loads((HERE / 'documentary-mapping.json').read_text())
checks = []


def check(name, value):
    assert value, name
    checks.append({'name': name, 'pass': True})


rows = []
with zipfile.ZipFile(ROOT / inputs['outer_zip']['path']) as outer:
    for saved in inputs['original_archives']:
        market, month = saved['market'], saved['month']
        prefix = 'binance-monthly/' + market + '/' + month + '/'
        old = json.loads(outer.read(prefix + 'qualification.json'))
        suffix = 'spot' if market == 'spot' else 'futures/um'
        expected_url = ('https://data.binance.vision/data/' + suffix +
                        '/monthly/klines/BTCUSDT/1m/BTCUSDT-1m-' + month + '.zip')
        label = market + ':' + month + ':'
        check(label + 'exact saved URL/market/symbol/month',
              old['archive_url'] == expected_url and old['market'] == market and
              old['symbol'] == saved['symbol'] == 'BTCUSDT' and old['month'] == month)
        check(label + 'reused hashes linked to saved qualification, NOT rehashed full CSV',
              old['archive_sha256'] == saved['zip_sha256'] and old['csv_sha256'] == saved['csv_sha256'])
        check(label + 'original firstknown/publication boundary preserved',
              old['available_at'] == saved['available_at'] and old['qualified_at'] == saved['qualified_at'] and
              old['native_source_publication_ts'] is None and old['source_ts'] is None)
        # Nested ZIP must be seekable. Only two CSV data lines are returned;
        # no full CSV iteration, row-count/gap/OHLC qualification or geometry.
        packed = outer.read(saved['zip_member'])
        with zipfile.ZipFile(io.BytesIO(packed)) as inner:
            with inner.open(saved['csv_member']) as native:
                def line():
                    raw = native.readline(4097)
                    assert raw.endswith(b'\n') and len(raw) <= 4096, 'BOUNDED_NATIVE_CSV_LINE_REQUIRED'
                    return raw.decode('utf-8').rstrip('\r\n')
                header = next(csv.reader([line()])) if market == 'usd_m_futures' else None
                sample_lines = [line(), line()]
        samples = [next(csv.reader([s])) for s in sample_lines]
        check(label + 'native header and firsttwo12-field arity',
              header == saved['raw_header'] and all(len(r) == 12 for r in samples))
        check(label + 'exact first native timestamp and raw ordinal samples match ready531 inventory',
              samples[0][0] == saved['first_native_timestamp'] and
              all(samples[0][int(k)] == v for k, v in saved['sample_raw_extra_columns'].items()))
        unit = 1000 if market == 'spot' else 1
        native_step = 60000 * unit
        opens, closes = [int(r[0]) for r in samples], [int(r[6]) for r in samples]
        start = int(datetime.datetime.fromisoformat(month + '-01').replace(tzinfo=datetime.timezone.utc).timestamp()) * 1000
        check(label + 'exact native calendar/one-minute epoch quantum',
              opens[0] == start * unit and opens[1] - opens[0] == native_step and
              all(c - o + 1 == native_step for o, c in zip(opens, closes)))
        check(label + 'exact open and inclusive-close conversion retains native quantum',
              all(o % unit == 0 and (c + 1) % unit == 0 for o, c in zip(opens, closes)))
        check(label + 'old price-only/signed-flow qualification not promoted',
              old['trade_content_qualified'] is False and old['signed_flow_qualified'] is False and
              old['decision_replay_eligible'] is False)
        rows.append({
            'market': market, 'month': month, 'archive_url': old['archive_url'],
            'zip_member': saved['zip_member'], 'zip_sha256_reused': saved['zip_sha256'],
            'csv_member': saved['csv_member'], 'csv_sha256_reused': saved['csv_sha256'],
            'provenance_member': prefix + 'qualification.json', 'native_header': header,
            'two_native_lines': sample_lines, 'native_open_digits': len(samples[0][0]),
            'native_close_digits': len(samples[0][6]), 'native_minute_step': str(native_step),
            'open_ms_exact': [str(o // unit) for o in opens],
            'end_exclusive_ms_exact': [str((c + 1) // unit) for c in closes],
            'available_at_original': old['available_at'], 'qualified_at_original': old['qualified_at'],
            'source_ts': None, 'native_source_publication_ts': None,
            'saved_declared_base_quote_not_new_native_identity_proof': {'base': old['base'], 'quote': old['quote']},
            'rows_inspected': 2, 'full_CSV_hash_or_completeness_rerun': False,
        })

check('Six originals only, no full264960-row replay', len(rows) == 6 and sum(r['rows_inspected'] for r in rows) == 12)
check('No generic volume5 unit guessed for either market',
      mapping['common_archive_columns'][5]['unit'] is None and
      mapping['market_specific_mapping']['spot']['column_5_unit'] is None and
      mapping['market_specific_mapping']['usd_m_futures']['column_5_unit'] is None)
check('Partial USD-M concrete asset units remain explicitNULL',
      mapping['market_specific_mapping']['usd_m_futures']['independently_verified_normative_quote_asset'] is None)
check('Spot2025+ rule is not inherited by USD-M',
      mapping['market_specific_mapping']['spot']['native_timestamp_unit'] == 'MICROSECONDS' and
      mapping['market_specific_mapping']['usd_m_futures']['universal_usd_m_2026_epoch_rule_from_current_docs'] is None)

result = {'schema': 'SAVED_BINANCE_CSV_NEW_BOUNDED_STRUCTURAL_CROSSCHECK_V1',
          'checks_pass': len(checks), 'checks_fail': 0, 'checks': checks,
          'actual_data_rows_inspected': 12, 'headers_inspected': 3,
          'existing_inventory_repeated': False, 'full_CSV_hashes_reused_not_recalculated': True,
          'old_normalizers_tests_replay_or_anomaly_code_executed': 0,
          'new_provider_market_HTTP': 0, 'native_SQL': 0, 'production_changes': False,
          'source_documents_count_substantive': 3, 'schema_only_not_whole_data_or_signed_flow_qualification': True,
          'archives': rows}
(HERE / 'structural-crosscheck.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'new_bounded_checks_pass': len(checks), 'fail': 0,
                  'rows': 12, 'headers': 3, 'full_replay': False}))
