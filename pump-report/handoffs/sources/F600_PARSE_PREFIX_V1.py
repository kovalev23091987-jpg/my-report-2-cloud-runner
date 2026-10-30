"""Offline prefix inspection only. Never appends JSON closers or changes raw bytes.

Offsets are zero-based bytes in the original file; end is exclusive.
Only closed, independently json.loads-validated direct array objects are projected.
Raw source objects remain private; public artifacts contain bounds/hash/static fields.
"""
import csv
import hashlib
import json
from pathlib import Path

BASE = Path('pump-report/handoffs/sources')
RAW = Path('pump-report/.private/observations/toobit-exchangeinfo-one-20261026-body.bin')
EXPECTED = '4cff48bfb114e262312e21e3c86da26b7da3378534f9e14de2068be5b803087c'
data = RAW.read_bytes()
assert len(data) == 2097129 and hashlib.sha256(data).hexdigest() == EXPECTED
arrays = []
catalogue_rows = []
object_keys = []
complete_root_scalars = []
fields = ['symbol', 'symbolName', 'status', 'baseAsset', 'quoteAsset',
          'underlying', 'marginToken', 'inverse', 'exchangeId', 'contractMultiplier',
          'coinId', 'coinName', 'name', 'fullName', 'contractType', 'isRwa',
          'categories', 'indexToken', 'rateLimitType', 'interval', 'intervalUnit',
          'limit', 'burst']


class Incomplete(Exception):
    def __init__(self, path, offset, reason):
        self.path, self.offset, self.reason = path, offset, reason


def ws(i):
    while i < len(data) and data[i] in b' \t\r\n':
        i += 1
    return i


def need(i, path, reason):
    if i >= len(data):
        raise Incomplete(path, i, reason)


def string(i, path):
    start = i
    i += 1
    while i < len(data):
        if data[i] == 34:
            return json.loads(data[start:i + 1]), i + 1
        if data[i] == 92:
            i += 1
        i += 1
    raise Incomplete(path, len(data), 'unterminated_string')


def value(i, path):
    i = ws(i)
    need(i, path, 'value_not_finished')
    if data[i] == 34:
        return string(i, path)
    if data[i] == 123:
        return obj(i, path)
    if data[i] == 91:
        return arr(i, path)
    end = i
    while end < len(data) and data[end] not in b' \t\r\n,]}':
        end += 1
    if end == len(data):
        raise Incomplete(path, end, 'scalar_end_delimiter_not_observed')
    return json.loads(data[i:end]), end


def obj(i, path):
    result = {}
    entry = {'path': path, 'keys_observed': [], 'closed': False}
    if len(path) <= 2:
        object_keys.append(entry)
    i = ws(i + 1)
    need(i, path, 'object_not_closed')
    if data[i] == 125:
        entry['closed'] = True
        return result, i + 1
    while True:
        need(i, path, 'object_key_missing')
        if data[i] != 34:
            raise ValueError(('invalid_object_key', path, i))
        key, i = string(i, path)
        if key in result:
            raise ValueError(('duplicate_object_key', path, key, i))
        i = ws(i)
        need(i, path, 'colon_missing')
        if data[i] != 58:
            raise ValueError(('invalid_colon', path, i))
        entry['keys_observed'].append(key)
        value_start = ws(i + 1)
        result[key], i = value(value_start, path + [key])
        if len(path) == 1 and not isinstance(result[key], (dict, list)):
            complete_root_scalars.append({'key': key, 'value': result[key],
                'byte_start': value_start, 'byte_end_exclusive': i,
                'literal_sha256': hashlib.sha256(data[value_start:i]).hexdigest()})
        i = ws(i)
        need(i, path, 'object_not_closed')
        if data[i] == 125:
            entry['closed'] = True
            return result, i + 1
        if data[i] != 44:
            raise ValueError(('invalid_object_separator', path, i))
        i = ws(i + 1)


def arr(i, path):
    start = i
    result = []
    info = {'path': path, 'byte_start': start, 'byte_end_exclusive': None,
            'closed': False, 'complete_elements': 0, 'complete_object_elements': 0}
    arrays.append(info)
    i = ws(i + 1)
    need(i, path, 'array_not_closed')
    if data[i] == 93:
        info.update(closed=True, byte_end_exclusive=i + 1)
        return result, i + 1
    index = 0
    while True:
        row_start = ws(i)
        row, i = value(row_start, path + [index])
        literal = data[row_start:i]
        assert json.loads(literal) == row
        result.append(row)
        info['complete_elements'] += 1
        if isinstance(row, dict):
            info['complete_object_elements'] += 1
            if len(path) <= 3:
                catalogue_rows.append({'array_path': path, 'index': index,
                    'byte_start': row_start, 'byte_end_exclusive': i,
                    'literal_bytes': i - row_start,
                    'literal_sha256': hashlib.sha256(literal).hexdigest(),
                    'object_closed_and_json_validated': True,
                    'static_projection': {k: row[k] for k in fields if k in row},
                    'original_field_names': sorted(row)})
        i = ws(i)
        need(i, path + [index], 'array_delimiter_not_observed')
        if data[i] == 93:
            end = i + 1
            assert json.loads(data[start:end]) == result
            info.update(closed=True, byte_end_exclusive=end)
            return result, end
        if data[i] != 44:
            raise ValueError(('invalid_array_separator', path, i))
        index += 1
        i = ws(i + 1)


termination = {}
try:
    parsed, end = value(0, ['$'])
    termination = {'status': 'COMPLETE', 'byte_end_exclusive': end,
                   'trailing_bytes': len(data) - ws(end)}
except Incomplete as e:
    termination = {'status': 'TRUNCATED', 'path': e.path,
                   'byte_offset': e.offset, 'reason': e.reason}
try:
    json.loads(data)
    full_document_valid = True
    full_parse_error = None
except (json.JSONDecodeError, UnicodeDecodeError) as e:
    full_document_valid = False
    full_parse_error = {'type': type(e).__name__, 'message': str(e)}
assert termination['status'] == 'TRUNCATED' and not full_document_valid
shallow = [a for a in arrays if len(a['path']) <= 3]
summary = {'schema': 'F600_EXACT_PREFIX_STRUCTURE_V1', 'input': {
    'path': str(RAW), 'bytes': len(data), 'sha256': EXPECTED,
    'observed_wire_bytes_from_ROOT': 2113506, 'HTTP_status': 200},
    'full_JSON_valid': full_document_valid, 'full_parse_error': full_parse_error,
    'JSONDecodeError_position_note': 'Decoder message positions are diagnostic character offsets; scanner bounds are original byte offsets.',
    'document_repaired': False, 'termination': termination,
    'observed_shallow_object_keys': object_keys,
    'complete_root_scalar_values': complete_root_scalars,
    'shallow_arrays': shallow, 'all_nested_arrays_seen': len(arrays),
    'closed_array_count': sum(a['closed'] for a in arrays),
    'complete_projected_objects': len(catalogue_rows),
    'offset_convention': '0-based bytes in original prefix; end exclusive',
    'raw_object_copies_published': False,
    'catalogue_array_roles': {'symbols': 'COMPLETE_TRANSMITTED_SPOT_ARRAY536',
        'contracts': 'OPEN_ARRAY696_COMPLETE_OBJECTS',
        'coins': 'NOT_OBSERVED_BEFORE_TRUNCATION_NOT_ABSENT'},
    'nonobserved_remainder': 'NOT_CHECKED, never ABSENT/UNSUPPORTED'}
contracts = [r for r in catalogue_rows if r['array_path'][-1] == 'contracts']
usdt = [r for r in contracts if r['static_projection'].get('quoteAsset') == 'USDT'
        and r['static_projection'].get('marginToken') == 'USDT'
        and r['static_projection'].get('inverse') is False]
summary['complete_contract_objects'] = len(contracts)
summary['USDT_M_format_candidates'] = len(usdt)
summary['crypto_classification_qualified'] = 0
summary['USDT_M_native_isRwa_raw_counts'] = {
    key: sum(r['static_projection'].get('isRwa', 'MISSING') == val for r in usdt)
    for key, val in [('true', True), ('false', False), ('missing', 'MISSING')]}
summary['isRwa_field_semantics'] = 'Raw metadata flag only; no positive crypto or cross-venue identity qualification.'
rows_artifact = {'schema': 'F600_COMPLETE_OBJECT_BOUNDS_PROJECTIONS_V1',
    'input_sha256': EXPECTED, 'offset_convention': summary['offset_convention'],
    'scope': 'Only closed original objects; static projections, not raw copies',
    'objects': catalogue_rows}
baseline = BASE / 'F589_COVERAGE_550_V1.csv'
assert hashlib.sha256(baseline.read_bytes()).hexdigest() == '49df3341e670d53e8f449a8267f42f567809348b1bbb4b6eda1a90399ff1a11f'
selected = list(csv.DictReader(baseline.open()))
assert len(selected) == 550
proposals = json.loads((BASE / 'F552_PROPOSED_NATIVE_BINDINGS_550_V1.json').read_text())['proposals']
bases = {p['tuple']['instrument_id']: p['tuple']['base'] for p in proposals}
by_base = {}
for r in usdt:
    base = r['static_projection'].get('underlying')
    if isinstance(base, str):
        by_base.setdefault(base, []).append(r)
join = []
for r in selected:
    iid = r['instrument_id']
    base = bases.get(iid)
    matches = by_base.get(base, [])
    join.append({'instrument_id': iid, 'native_BingX_base': base,
        'raw_candidate_count_in_complete_USDTM_prefix_objects': len(matches),
        'candidate_object_refs': [{'array_path': x['array_path'], 'index': x['index'],
            'symbol': x['static_projection'].get('symbol'), 'byte_start': x['byte_start'],
            'byte_end_exclusive': x['byte_end_exclusive'],
            'literal_sha256': x['literal_sha256'],
            'native_status': x['static_projection'].get('status'),
            'isRwa_raw': x['static_projection'].get('isRwa'),
            'categories_raw': x['static_projection'].get('categories')} for x in matches],
        'status': 'RAW_NAME_CANDIDATE_ONLY' if matches else 'NOT_CHECKED_REMAINDER',
        'canonical_identity': 'UNKNOWN', 'CORE_qualified': False, 'map_qualified': False})
summary['selected550_raw_candidates'] = sum(r['raw_candidate_count_in_complete_USDTM_prefix_objects'] > 0 for r in join)
summary['selected550_remainder_NOT_CHECKED'] = 550 - summary['selected550_raw_candidates']
summary['selected550_canonical_UNKNOWN'] = 550
summary['selected550_raw_candidates_with_isRwa_true'] = sum(
    any(x.get('isRwa_raw') is True for x in r['candidate_object_refs']) for r in join)
for name, objdata in [('F600_PREFIX_STRUCTURE_V1.json', summary),
                      ('F600_COMPLETE_OBJECT_BOUNDS_V1.json', rows_artifact),
                      ('F600_RAW_CANDIDATE_JOIN550_V1.json', {
                          'schema': 'F600_RAW_CANDIDATE_JOIN550_V1',
                          'input_sha256': EXPECTED, 'rows': join,
                          'canonical_qualified': 0, 'CORE_qualified': 0,
                          'maps_qualified': 0, 'UNSUPPORTED': 0})]:
    compact = name in ['F600_COMPLETE_OBJECT_BOUNDS_V1.json', 'F600_RAW_CANDIDATE_JOIN550_V1.json']
    (BASE / name).write_text(json.dumps(objdata, ensure_ascii=True,
        indent=None if compact else 2, separators=(',', ':') if compact else None) + '\n')
assert RAW.read_bytes() == data
print(json.dumps({'termination': termination, 'arrays': shallow,
                  'complete_contract_objects': len(contracts),
                  'USDT_M_format_candidates': len(usdt),
                  'raw_candidate_selected550': summary['selected550_raw_candidates'],
                  'remainder_NOT_CHECKED': summary['selected550_remainder_NOT_CHECKED'],
                  'raw_prefix_unchanged': True}, ensure_ascii=True))
