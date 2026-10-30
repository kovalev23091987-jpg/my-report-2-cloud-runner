"""F571 continuation: one exact native tuple, one saved metadata join, no capture."""
from pathlib import Path
import hashlib
import json
import os

ROOT = Path(__file__).parents[2]
OUT = Path('/private/tmp/pump-f571-root-exact-metadata-private.json')
PUBLIC = Path(__file__).parent / 'F571_EXACT1_METADATA_JOIN_RECEIPT_V1.json'

def sha(data):
    return hashlib.sha256(data).hexdigest()

def pinned(path, expected):
    data = Path(path).read_bytes()
    if sha(data) != expected:
        raise RuntimeError('EXACT_RETAINED_INPUT_HASH_MISMATCH')
    return json.loads(data)

def key(row):
    return json.dumps([str(row['contractId']), row['symbol'], row['asset'], row['currency']], ensure_ascii=False, separators=(',', ':'))

if OUT.exists() or PUBLIC.exists():
    raise RuntimeError('EXACT1_METADATA_JOIN_ALREADY_RECORDED_NO_REPEAT')
root_sha = 'ee9f96e2e3285938ec6e200487a7a4b8d63f06e6308594b0fc6030638c5d195f'
source = pinned(ROOT / '.private/native-20261026/pump-f571-root-exact-unresolved.json', root_sha)
rows = []
def walk(v):
    if isinstance(v, dict):
        if {'contractId', 'symbol', 'asset', 'currency', 'status'}.issubset(v):
            rows.append(v)
        else:
            for x in v.values():
                walk(x)
    elif isinstance(v, list):
        for x in v:
            walk(x)
walk(source.get('unresolved'))
if len(rows) != 1 or rows[0]['status'] != 1 or rows[0]['currency'] != 'USDT' or not rows[0]['symbol'].endswith('-USDT'):
    raise RuntimeError('EXACT_CURRENT_SINGLE_USDT_NATIVE_TUPLE_REQUIRED')
row = rows[0]
native_sha = '7b683509fea9d5b3aa1d2612ddb8ad259680a3bc33cc4df5cc97f23b4555e9f5'
native = pinned('/private/tmp/pump-report-native-catalog-corrected.json', native_sha)['body']['response']['data']['data']
old = [r for r in native if key(r) == key(row)]
meta_sha = '66c3afe4e3f2d967050fdfbb34fb09741b4612780f1ba264cf504410dc0a3cf9'
metadata = pinned('/private/tmp/pump-corrected-metadata-actual.json', meta_sha)['body']['response']['data']['data']['result']
hits = [r for r in metadata if r.get('coinName') == row['asset']]
meta = hits[0] if len(hits) == 1 else None
projected = {k: row.get(k) for k in ['contractId', 'symbol', 'asset', 'currency', 'status', 'displayName'] if k in row}
record = {'schema': 'F571_EXACT1_RETAINED_METADATA_PRIVATE_V1', 'ROOT_input_sha256': root_sha, 'actual2_capture_sha256': source.get('capture_sha256'), 'native_tuple': projected, 'family': 'USDT_M', 'native_four_tuple_sha256': sha(key(row).encode()), 'matching_saved_native_rows': [{k: r.get(k) for k in ['contractId', 'symbol', 'asset', 'currency', 'status', 'displayName']} for r in old], 'saved_native_exact_matches': len(old), 'native_saved_sha256': native_sha, 'metadata_saved_sha256': meta_sha, 'metadata_endpoint': 'https://api-app.acc-de.com/api/coin/v1/display-info/list', 'metadata_exact_asset_matches': len(hits), 'metadata_row': meta, 'metadata_row_sha256': sha(json.dumps(meta, ensure_ascii=False, separators=(',', ':')).encode()) if meta else None, 'no_generic_numeric_enum_inference': True, 'actual_capture_reread': 0, 'native_IO': 0}
data = (json.dumps(record, ensure_ascii=False, indent=2) + '\n').encode()
fd = os.open(OUT, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
with os.fdopen(fd, 'wb') as f:
    f.write(data)
receipt = {'schema': 'F571_EXACT1_METADATA_JOIN_RECEIPT_V1', 'ROOT_input_sha256': root_sha, 'native_four_tuple_sha256': record['native_four_tuple_sha256'], 'current_tuples': 1, 'saved_native_exact_matches': len(old), 'metadata_exact_asset_matches': len(hits), 'private_projection': {'path': str(OUT), 'sha256': sha(data), 'bytes': len(data), 'mode': oct(OUT.stat().st_mode & 0o777)}, 'actual_capture_rereads': 0, 'old550_price_CORE_reader_or_old53_reclassification': 0, 'new_provider_metadata_docs_RPC_SQL_TG_deploy': 0, 'economic_decision_pending_explicit_review': True}
PUBLIC.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'receipt': receipt, 'economic_review_identity_fields_only': {'asset': row['asset'], 'symbol': row['symbol'], 'native_display': old[0].get('displayName') if len(old) == 1 else None, 'previous_status': old[0].get('status') if len(old) == 1 else None, 'metadata_display': meta.get('coinDisplayName') if meta else None, 'metadata_coinType_not_decoded_enum': meta.get('coinType') if meta else None}}, ensure_ascii=False))
