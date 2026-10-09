"""Bounded cold, venue-specific price qualification. Never a live ENTRY receipt."""
import calendar
import csv
import datetime as dt
from decimal import Decimal
import gzip
import hashlib
import io
import json
import math
from pathlib import Path
import re
import zipfile


def sha(data):
    return hashlib.sha256(data).hexdigest()


def qualify(archive, checksum, record, asof):
    market, symbol, month = (record.get(k) for k in ['market', 'symbol', 'month'])
    if market not in ['spot', 'usd_m_futures'] or not isinstance(symbol, str) or not re.fullmatch(r'[A-Z0-9]{2,24}USDT', symbol) or not isinstance(month, str) or not re.fullmatch(r'20\d{2}-\d{2}', month):
        raise ValueError('EXACT_MARKET_SYMBOL_CALENDAR_REQUIRED')
    start = dt.datetime.strptime(month, '%Y-%m').replace(tzinfo=dt.timezone.utc)
    start_ms = int(start.timestamp()) * 1000
    count = calendar.monthrange(start.year, start.month)[1] * 1440
    end_ms = start_ms + count * 60000
    name = f'{symbol}-1m-{month}'
    root = 'spot' if market == 'spot' else 'futures/um'
    url = f'https://data.binance.vision/data/{root}/monthly/klines/{symbol}/1m/{name}.zip'
    if len(archive) > 8 * 1024 * 1024 or len(checksum) > 4096:
        raise ValueError('BOUNDED_ORIGINAL_BYTES_REQUIRED')
    receipts = record.get('receipts', [])
    if len(receipts) != 2 or {r.get('url') for r in receipts} != {url, url + '.CHECKSUM'}:
        raise ValueError('EXACT_ORIGINAL_RECEIPTS_REQUIRED')
    for r in receipts:
        data = archive if r['url'] == url else checksum
        if r.get('http_status') != 200 or r.get('sha256') != sha(data) or r.get('bytes') != len(data) or not all(type(r.get(k)) is int for k in ['started_ts', 'received_ts']) or not end_ms <= r['started_ts'] <= r['received_ts'] <= asof:
            raise ValueError('ORIGINAL_BYTES_AND_AVAILABILITY_REQUIRED')
    fields = checksum.decode().strip().split()
    if len(fields) != 2 or fields[0] != sha(archive) or fields[1].lstrip('*') != name + '.zip':
        raise ValueError('EXACT_OFFICIAL_CHECKSUM_REQUIRED')
    z = zipfile.ZipFile(io.BytesIO(archive))
    if z.namelist() != [name + '.csv'] or z.getinfo(name + '.csv').file_size > 64 * 1024 * 1024:
        raise ValueError('EXACT_BOUNDED_SINGLE_CSV_REQUIRED')
    raw = z.read(name + '.csv')
    rows = csv.reader(io.StringIO(raw.decode('utf-8')))
    first = next(rows, None)
    header = ['open_time', 'open', 'high', 'low', 'close', 'volume', 'close_time', 'quote_volume', 'count', 'taker_buy_volume', 'taker_buy_quote_volume', 'ignore']
    has_header = first == header
    if has_header and market != 'usd_m_futures':
        raise ValueError('UNEXPECTED_SPOT_HEADER')
    if not has_header:
        import itertools
        rows = itertools.chain([first], rows)
    # This is explicit native unit qualification, never timestamp-size guessing.
    unit = 'microseconds' if market == 'spot' and start.year >= 2025 else 'milliseconds'
    scale = 1000 if unit == 'microseconds' else 1
    prices = []
    for index, row in enumerate(rows):
        if index >= count or not isinstance(row, list) or len(row) != 12 or any(not isinstance(x, str) or len(x) > 80 for x in row):
            raise ValueError('EXACT_BOUNDED_TWELVE_FIELD_ROWS_REQUIRED')
        t = start_ms + index * 60000
        if not all(re.fullmatch(r'\d+', row[k]) for k in [0, 6, 8]) or int(row[0]) != t * scale or int(row[6]) != (t + 60000) * scale - 1:
            raise ValueError('EXACT_COMPLETE_UNIQUE_MINUTE_GRID_REQUIRED')
        try:
            values = [Decimal(row[k]) for k in [1, 2, 3, 4, 5, 7, 9, 10, 11]]
        except Exception as error:
            raise ValueError('NATIVE_NUMERIC_FIELDS_REQUIRED') from error
        if any(not v.is_finite() or not math.isfinite(float(v)) for v in values) or any(v <= 0 or float(v) <= 0 for v in values[:4]) or any(v < 0 for v in values[4:8]):
            raise ValueError('FINITE_PRICE_AND_NONNEGATIVE_NATIVE_VOLUME_REQUIRED')
        o, h, l, c = values[:4]
        if h < max(o, c) or l > min(o, c) or h < l:
            raise ValueError('EXACT_OHLC_GEOMETRY_REQUIRED')
        prices.append([t, *[float(v) for v in values[:4]]])
    if len(prices) != count:
        raise ValueError('FULL_CALENDAR_MONTH_REQUIRED')
    available = max(r['received_ts'] for r in receipts)
    manifest = dict(schema='BINANCE_MONTHLY_COLD_PRICE_V1', status='CLOSED_PRICE_HISTORY', venue='BINANCE', market=market, symbol=symbol, base=symbol[:-4], quote='USDT', month=month, interval_ms=60000, event_interval=[start_ms, end_ms], minute_count=count, archive_url=url, archive_sha256=sha(archive), checksum_sha256=sha(checksum), csv_sha256=sha(raw), native_timestamp_unit=unit, native_header_present=has_header, native_source_publication_ts=None, source_ts=None, available_at=available, qualified_at=asof, original_receipts=receipts, history_role='HISTORICAL_PRICE_ONLY', live_quote_eligible=False, decision_replay_eligible=False, htx_execution_price_eligible=False, entry_authorized=False, score_contribution=0, trade_content_qualified=False, signed_flow_qualified=False, all102_history_complete=False, project_complete=False)
    payload = gzip.compress(json.dumps(prices, separators=(',', ':')).encode(), mtime=0)
    manifest['qualified_price_payload_sha256'] = sha(payload)
    return manifest, payload


def run(directory):
    root = Path(directory)
    acquisition = json.loads((root / 'acquisition.json').read_text())
    results = []
    for record in acquisition['archives']:
        folder = root / record['market'] / record['month']
        if record.get('status') != 'ORIGINAL_ARCHIVE_RETAINED':
            results.append({k: record.get(k) for k in ['market', 'symbol', 'month', 'status', 'reason']})
            continue
        try:
            asof = int(dt.datetime.now(dt.timezone.utc).timestamp() * 1000)
            manifest, payload = qualify((folder / 'original.zip').read_bytes(), (folder / 'original.zip.CHECKSUM').read_bytes(), record, asof)
            (folder / 'qualified-price.json.gz').write_bytes(payload)
            (folder / 'qualification.json').write_text(json.dumps(manifest, indent=2) + '\n')
            results.append(manifest)
        except Exception as error:
            results.append(dict(market=record['market'], symbol=record['symbol'], month=record['month'], status='QUALIFICATION_NOT_CLOSED', reason=str(error)))
    (root / 'qualification-summary.json').write_text(json.dumps(dict(schema='BINANCE_COLD_MONTHLY_BATCH_V1', results=results, sourceHTTP=0, D1=0, MAIN=0, Telegram=0, project_complete=False), indent=2) + '\n')
    print(json.dumps([dict(market=r['market'], month=r['month'], status=r['status'], minutes=r.get('minute_count'), reason=r.get('reason')) for r in results]))


if __name__ == '__main__':
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument('--directory', required=True)
    run(p.parse_args().directory)
