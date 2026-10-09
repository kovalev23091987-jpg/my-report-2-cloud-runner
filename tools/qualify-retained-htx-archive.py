"""Qualify delayed archive prices against exact same-period native minute bars.

This does not interpret raw size/side/tradeId as economically qualified fills.
It preserves every source record, including repeated IDs, and never shifts time.
"""
import argparse
import csv
import datetime as dt
from decimal import Decimal, localcontext
import gzip
import hashlib
import io
import json
import math
from pathlib import Path
import zipfile
from collections import defaultdict


def digest(data):
    return hashlib.sha256(data).hexdigest()


def qualify(archive, checksum, bars_bytes, contract, day, day_offset_minutes, as_of_ts):
    if not contract.endswith('-USDT') or not 0 <= day_offset_minutes < 1440:
        raise ValueError('EXACT_CONTRACT_AND_EXPLICIT_DAY_OFFSET_REQUIRED')
    native = contract + '-PERP'
    file_name = f'{native}-trades-{day}.csv'
    expected_zip = file_name[:-4] + '.zip'
    parts = checksum.decode().strip().split()
    if len(parts) != 2 or parts[0] != digest(archive) or parts[1].lstrip('*') != expected_zip:
        raise ValueError('EXACT_CHECKSUM_AND_ARCHIVE_NAME_REQUIRED')
    if len(archive) > 8 * 1024 * 1024 or len(bars_bytes) > 8 * 1024 * 1024:
        raise ValueError('BOUNDED_ARCHIVE_SIZE_EXCEEDED')
    z = zipfile.ZipFile(io.BytesIO(archive))
    if z.namelist() != [file_name] or z.getinfo(file_name).file_size > 64 * 1024 * 1024:
        raise ValueError('EXACT_SINGLE_BOUNDED_CSV_REQUIRED')
    raw = z.read(file_name)
    start = int(dt.datetime.strptime(day, '%Y-%m-%d').replace(tzinfo=dt.timezone.utc).timestamp() * 1000) - day_offset_minutes * 60000
    end = start + 86400000
    reader = csv.DictReader(io.StringIO(raw.decode('utf-8')))
    if reader.fieldnames != ['instId', 'tradeId', 'px', 'side', 'size', 'ts']:
        raise ValueError('EXACT_ARCHIVE_SCHEMA_REQUIRED')
    groups = defaultdict(list)
    ids = defaultdict(list)
    previous = None
    records = 0
    inversions = 0
    for row in reader:
        records += 1
        if records > 1_000_000 or row['instId'] != native or not row['tradeId'].isdigit() or row['side'] not in ('buy', 'sell'):
            raise ValueError('BOUNDED_EXACT_NATIVE_RECORD_REQUIRED')
        if any(len(row[k]) > 80 for k in ['ts', 'px', 'size', 'tradeId']):
            raise ValueError('BOUNDED_NUMERIC_LEXEMES_REQUIRED')
        ts, price, size = int(row['ts']), Decimal(row['px']), Decimal(row['size'])
        if not start <= ts < end or not price.is_finite() or price <= 0 or not math.isfinite(float(price)) or float(price) <= 0 or not size.is_finite() or size <= 0:
            raise ValueError('ARCHIVE_EVENT_TIME_PRICE_SIZE_INVALID')
        inversions += int(previous is not None and ts < previous)
        previous = ts
        groups[ts // 60000].append((ts, price, size, records))
        ids[row['tradeId']].append(records)
    bars = json.loads(bars_bytes, parse_float=Decimal)
    if bars.get('status') != 'ok' or bars.get('ch') != f'market.{contract}.kline.1min' or not isinstance(bars.get('ts'), int) or not end <= bars['ts'] <= as_of_ts:
        raise ValueError('EXACT_DELAYED_NATIVE_BAR_CHANNEL_AND_CLOCK_REQUIRED')
    data = bars.get('data')
    if not isinstance(data, list) or len(data) != 1440 or sorted(b['id'] for b in data) != list(range(start // 1000, end // 1000, 60)):
        raise ValueError('EXACT_FULL_DAY_MINUTE_BAR_INTERVAL_REQUIRED')
    candles, failures = [], []
    twice_count = twice_quote = 0
    # No binary float tolerances or inferred per-asset unit multipliers.
    with localcontext() as ctx:
        ctx.prec = 100
        for b in sorted(data, key=lambda x: x['id']):
            rs = groups[b['id'] // 60]
            prices = [r[1] for r in rs]
            size = sum((r[2] for r in rs), Decimal(0))
            quote = sum((r[1] * r[2] for r in rs), Decimal(0))
            ohlc = [Decimal(str(b[k])) for k in ['open', 'high', 'low', 'close']]
            if any(not x.is_finite() or x <= 0 or not math.isfinite(float(x)) or float(x) <= 0 for x in ohlc) or not isinstance(b['count'], int) or b['count'] < 0:
                raise ValueError('NATIVE_BAR_NUMERIC_FACTS_INVALID')
            count_match = len(rs) == b['count']
            price_match = bool(prices) and [prices[0], max(prices), min(prices), prices[-1]] == ohlc
            by_time = [r[1] for r in sorted(rs, key=lambda r: (r[0], r[3]))]
            time_match = bool(by_time) and [by_time[0], max(by_time), min(by_time), by_time[-1]] == ohlc
            vol_twice = Decimal(str(b['vol'])) == size * 2
            quote_twice = Decimal(str(b['trade_turnover'])) == quote * 2
            twice_count += int(vol_twice)
            twice_quote += int(quote_twice)
            if not (count_match and price_match and time_match):
                failures.append({'minute_ts': b['id'] * 1000, 'archive_records': len(rs), 'bar_count': b['count'], 'file_order_ohlc_match': price_match, 'timestamp_order_ohlc_match': time_match, 'raw_size_sum': str(size), 'native_bar_vol': str(b['vol']), 'raw_price_size_sum': str(quote), 'native_bar_turnover': str(b['trade_turnover']), 'source_line_numbers': [r[3] for r in rs]})
                continue
            candles.append({'contract': contract, 'open_ts': b['id'] * 1000, 'close_ts': b['id'] * 1000 + 59999, **dict(zip(['open', 'high', 'low', 'close'], map(float, ohlc))), 'closed': True, 'source_ts': bars['ts'], 'source': 'HTX_OFFICIAL_DELAYED_ARCHIVE_AND_EXACT_NATIVE_BAR', 'history_role': 'HISTORICAL_PRICE_ONLY', 'live_quote_eligible': False})
    manifest = {'schema': 'HTX_DELAYED_ARCHIVE_PRICE_QUALIFICATION_V1', 'status': 'CLOSED_PRICE_HISTORY' if len(candles) == 1440 else 'PARTIAL_PRICE_HISTORY', 'contract': contract, 'native_instrument': native, 'archive_sha256': digest(archive), 'csv_sha256': digest(raw), 'bars_sha256': digest(bars_bytes), 'source_ts': bars['ts'], 'event_interval': [start, end], 'explicit_day_offset_minutes': day_offset_minutes, 'other_files_calendar_qualified': False, 'raw_records': records, 'distinct_raw_tradeId_values': len(ids), 'shared_raw_id_groups': sum(len(v) > 1 for v in ids.values()), 'raw_records_removed': 0, 'raw_timestamps_shifted': 0, 'minute_count': 1440, 'qualified_price_minutes': len(candles), 'failures': failures, 'measured_vol_twice_raw_size_minutes': twice_count, 'measured_turnover_twice_raw_price_size_minutes': twice_quote, 'quantity_unit_qualified': False, 'exchange_fill_identity_qualified': False, 'signed_notional_or_cvd_calculated': False, 'live_quote_eligible': False, 'score_contribution': 0, 'entry_authorized': False, 'complete_30_90day_102asset_history': False, 'project_complete': False}
    manifest.update({'qualified_at': as_of_ts, 'original_source_clock_refreshed': False, 'original_acquisition_clock_known': False, 'decision_replay_eligible': False, 'qualification_scope': 'DELAYED_HISTORICAL_PRICE_INSPECTION_ONLY', 'source_timestamp_order_inversions': inversions, 'price_admission_requires_file_and_timestamp_order_agreement': True})
    return manifest, candles


def main():
    p = argparse.ArgumentParser()
    for name in ['archive', 'checksum', 'bars', 'contract', 'day', 'outdir']:
        p.add_argument('--' + name, required=True)
    p.add_argument('--day-offset-minutes', type=int, required=True)
    p.add_argument('--as-of-ts', type=int, required=True)
    a = p.parse_args()
    bars = Path(a.bars).read_bytes()
    if str(a.bars).endswith('.gz'):
        bars = gzip.GzipFile(fileobj=io.BytesIO(bars)).read(8 * 1024 * 1024 + 1)
    manifest, candles = qualify(Path(a.archive).read_bytes(), Path(a.checksum).read_bytes(), bars, a.contract, a.day, a.day_offset_minutes, a.as_of_ts)
    out = Path(a.outdir)
    out.mkdir(parents=True, exist_ok=True)
    payload = gzip.compress(json.dumps(candles, separators=(',', ':')).encode(), mtime=0)
    (out / 'qualified-historical-price-minutes.json.gz').write_bytes(payload)
    manifest['qualified_price_payload_sha256'] = digest(payload)
    (out / 'archive-price-qualification.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: manifest[k] for k in ['status', 'contract', 'raw_records', 'qualified_price_minutes', 'source_ts', 'project_complete']}))


if __name__ == '__main__':
    main()
