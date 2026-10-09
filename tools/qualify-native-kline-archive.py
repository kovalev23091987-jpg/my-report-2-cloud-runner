"""Cold price-only qualification of an exact native archive and API bar reply.

No archive volume units, trade IDs, directional flow, or live quotes are admitted.
"""
import argparse
import csv
import datetime as dt
from decimal import Decimal
import gzip
import hashlib
import io
import json
import math
from pathlib import Path
import zipfile


def sha(data):
    return hashlib.sha256(data).hexdigest()


def qualify(archive, checksum, bars, acquisition, contract, day, offset, asof):
    if not contract.endswith('-USDT') or not isinstance(offset, int) or not 0 <= offset < 1440:
        raise ValueError('EXACT_LINEAR_SWAP_AND_EXPLICIT_CALENDAR_REQUIRED')
    native = contract + '-PERP'
    name = f'{native}-klines-1m-{day}.csv'
    key = f'historical_data/futures/daily/klines/{native}/1m/{name[:-4]}.zip'
    if acquisition.get('status') != 'EXACT_NATIVE_ONE_MINUTE_ARCHIVE_RETAINED_NOT_YET_PRICE_QUALIFIED' or acquisition.get('contract') != contract or acquisition.get('archive_day') != day or acquisition.get('archive_key') != key or acquisition.get('checksum_key') != key + '.CHECKSUM':
        raise ValueError('EXACT_ORIGINAL_NATIVE_ACQUISITION_REQUIRED')
    receipts = acquisition.get('receipts', [])
    if len(receipts) != 2 or {r.get('url') for r in receipts} != {'https://futures.htx.com/data/' + key, 'https://futures.htx.com/data/' + key + '.CHECKSUM'}:
        raise ValueError('EXACT_TWO_ORIGINAL_SOURCE_RECEIPTS_REQUIRED')
    source_bytes = {'native-kline.zip': archive, 'native-kline.zip.CHECKSUM': checksum}
    for r in receipts:
        if r.get('file') not in source_bytes or r.get('url') != 'https://futures.htx.com/data/' + key + ('.CHECKSUM' if r['file'].endswith('.CHECKSUM') else '') or r.get('http_status') != 200 or r.get('sha256') != sha(source_bytes[r['file']]) or r.get('bytes') != len(source_bytes[r['file']]) or not isinstance(r.get('received_ts'), int) or not acquisition.get('observed_ts', -1) <= r['received_ts'] <= asof:
            raise ValueError('EXACT_ORIGINAL_SOURCE_BYTES_AND_AVAILABILITY_REQUIRED')
    available = max(r['received_ts'] for r in receipts)
    parts = checksum.decode().strip().split()
    if len(parts) != 2 or parts[0] != sha(archive) or parts[1].lstrip('*') != name[:-4] + '.zip' or acquisition.get('archive_sha256') != sha(archive):
        raise ValueError('EXACT_NATIVE_ZIP_CHECKSUM_REQUIRED')
    if len(archive) > 8 * 1024 * 1024 or len(bars) > 8 * 1024 * 1024:
        raise ValueError('BOUNDED_SOURCE_BYTES_REQUIRED')
    z = zipfile.ZipFile(io.BytesIO(archive))
    if z.namelist() != [name] or z.getinfo(name).file_size > 8 * 1024 * 1024:
        raise ValueError('EXACT_ONE_BOUNDED_NATIVE_CSV_REQUIRED')
    raw = z.read(name)
    reader = csv.DictReader(io.StringIO(raw.decode()))
    if reader.fieldnames != ['instId', 'open', 'high', 'low', 'close', 'vol', 'volCcy', 'volCcyQuote', 'ts']:
        raise ValueError('EXACT_NATIVE_KLINE_SCHEMA_REQUIRED')
    start = int(dt.datetime.strptime(day, '%Y-%m-%d').replace(tzinfo=dt.timezone.utc).timestamp()) - offset * 60
    expected = list(range(start, start + 86400, 60))
    rows = list(reader)
    if len(rows) != 1440 or any(r['instId'] != native or not r['ts'].isdigit() for r in rows) or sorted(int(r['ts']) for r in rows) != expected:
        raise ValueError('EXACT_FULL_DAY_UNIQUE_MINUTE_GRID_REQUIRED')
    response = json.loads(bars, parse_float=Decimal)
    if response.get('status') != 'ok' or response.get('ch') != f'market.{contract}.kline.1min' or not isinstance(response.get('ts'), int) or not (start + 86400) * 1000 <= response['ts'] <= asof:
        raise ValueError('EXACT_NATIVE_BAR_CHANNEL_AND_ORIGINAL_CLOCK_REQUIRED')
    data = response.get('data', [])
    if len(data) != 1440 or sorted(b['id'] for b in data) != expected:
        raise ValueError('EXACT_NATIVE_BAR_MINUTE_GRID_REQUIRED')
    by = {b['id']: b for b in data}
    candles = []
    for r in sorted(rows, key=lambda x: int(x['ts'])):
        if any(len(r[k]) > 80 for k in ['ts', 'open', 'high', 'low', 'close']):
            raise ValueError('BOUNDED_PRICE_LEXEMES_REQUIRED')
        prices = {k: Decimal(r[k]) for k in ['open', 'high', 'low', 'close']}
        if any(not p.is_finite() or p <= 0 or not math.isfinite(float(p)) or float(p) <= 0 for p in prices.values()) or prices['high'] < max(prices['open'], prices['close']) or prices['low'] > min(prices['open'], prices['close']) or prices['low'] > prices['high']:
            raise ValueError('EXACT_OHLC_GEOMETRY_REQUIRED')
        t = int(r['ts'])
        if any(prices[k] != Decimal(str(by[t][k])) for k in prices):
            raise ValueError('ARCHIVE_NATIVE_RESPONSE_PRICE_CONFLICT')
        candles.append({'contract': contract, 'open_ts': t * 1000, 'close_ts': t * 1000 + 59999, **{k: float(v) for k, v in prices.items()}, 'closed': True, 'source_ts': response['ts'], 'source': 'HTX_NATIVE_KLINE_ARCHIVE_AND_EXACT_NATIVE_BAR', 'history_role': 'HISTORICAL_PRICE_ONLY', 'live_quote_eligible': False})
    manifest = {'schema': 'HTX_NATIVE_KLINE_PRICE_QUALIFICATION_V1', 'status': 'CLOSED_PRICE_HISTORY', 'contract': contract, 'native_instrument': native, 'archive_sha256': sha(archive), 'csv_sha256': sha(raw), 'bars_sha256': sha(bars), 'source_ts': response['ts'], 'archive_acquired_at': available, 'available_at': available, 'qualified_at': asof, 'event_interval': [start * 1000, (start + 86400) * 1000], 'explicit_day_offset_minutes': offset, 'other_files_calendar_qualified': False, 'minute_count': 1440, 'qualified_price_minutes': 1440, 'raw_records_removed': 0, 'raw_timestamps_shifted': 0, 'rows_reordered_by_original_epoch_only': True, 'quantity_unit_qualified': False, 'exchange_fill_identity_qualified': False, 'signed_notional_or_cvd_calculated': False, 'live_quote_eligible': False, 'score_contribution': 0, 'entry_authorized': False, 'decision_replay_eligible': False, 'original_source_clock_refreshed': False, 'qualification_scope': 'DELAYED_NATIVE_MINUTE_PRICES_ONLY;NO_TRADE_OR_DIRECTION_EVIDENCE', 'complete_30_90day_102asset_history': False, 'project_complete': False}
    return manifest, candles


def main():
    p = argparse.ArgumentParser()
    for n in ['archive', 'checksum', 'bars', 'acquisition', 'contract', 'day', 'outdir']:
        p.add_argument('--' + n, required=True)
    p.add_argument('--day-offset-minutes', type=int, required=True)
    p.add_argument('--as-of-ts', type=int, required=True)
    a = p.parse_args()
    bars = Path(a.bars).read_bytes()
    if a.bars.endswith('.gz'):
        bars = gzip.GzipFile(fileobj=io.BytesIO(bars)).read(8 * 1024 * 1024 + 1)
    manifest, candles = qualify(Path(a.archive).read_bytes(), Path(a.checksum).read_bytes(), bars, json.loads(Path(a.acquisition).read_text()), a.contract, a.day, a.day_offset_minutes, a.as_of_ts)
    out = Path(a.outdir)
    out.mkdir(parents=True, exist_ok=True)
    payload = gzip.compress(json.dumps(candles, separators=(',', ':')).encode(), mtime=0)
    (out / 'qualified-historical-price-minutes.json.gz').write_bytes(payload)
    manifest['qualified_price_payload_sha256'] = sha(payload)
    (out / 'archive-price-qualification.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps({k: manifest[k] for k in ['status', 'contract', 'qualified_price_minutes', 'source_ts', 'archive_acquired_at', 'project_complete']}))


if __name__ == '__main__':
    main()
