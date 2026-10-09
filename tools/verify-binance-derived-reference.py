"""Independent original CSV comparison: price only, no trading acceptance."""
import csv
from decimal import Decimal
import gzip
import hashlib
import io
import json
from pathlib import Path
import sys
import zipfile

native, output = map(Path, sys.argv[1:3])
proof = json.loads((output / 'derived-candles-results.json').read_text())
rows_by_market = {}
for market in ['spot', 'usd_m_futures']:
    rows = []
    for month in ['2026-06', '2026-07', '2026-08']:
        folder = native / market / month
        manifest = json.loads((folder / 'qualification.json').read_text())
        archive = (folder / 'original.zip').read_bytes()
        assert hashlib.sha256(archive).hexdigest() == manifest['archive_sha256']
        checksum = (folder / 'original.zip.CHECKSUM').read_text().split()
        assert checksum == [manifest['archive_sha256'], f'BTCUSDT-1m-{month}.zip']
        scale = 1000 if manifest['native_timestamp_unit'] == 'microseconds' else 1
        with zipfile.ZipFile(io.BytesIO(archive)) as z:
            source = csv.reader(io.StringIO(z.read(f'BTCUSDT-1m-{month}.csv').decode()))
            for row in source:
                if row[0] == 'open_time':
                    continue
                ts = int(row[0]) // scale
                assert int(row[0]) == ts * scale
                assert int(row[6]) == (ts + 60000) * scale - 1
                rows.append([ts, *map(lambda x: float(Decimal(x)), row[1:5])])
    assert len(rows) == 132480
    assert all(row[0] == rows[0][0] + i * 60000 for i, row in enumerate(rows))
    rows_by_market[market] = rows

compared = 0
for result in proof['results']:
    payload = (output / result['file']).read_bytes()
    assert hashlib.sha256(payload).hexdigest() == result['payload_sha256']
    value = json.loads(gzip.decompress(payload))
    minute_rows = [r for r in rows_by_market[result['market']] if result['start_ts'] <= r[0] < result['end_ts']]
    width = result['interval_ms'] // 60000
    expected = []
    for i in range(0, len(minute_rows), width):
        group = minute_rows[i:i + width]
        assert len(group) == width
        expected.append([group[0][0], group[0][1], max(r[2] for r in group), min(r[3] for r in group), group[-1][4]])
    assert expected == value['candles'], result['file']
    assert len(expected) == result['candle_count']
    assert value['aggregation_basis'] == 'COMPLETE_NATIVE_1M_OHLC'
    assert value['source_ts'] is None and not value['official_native_3m_5m_archive_verified']
    assert not value['trade_content_qualified'] and not value['signed_flow_qualified'] and not value['entry_authorized']
    compared += len(expected)
reference = dict(schema='BINANCE_NATIVE_CSV_DERIVED_CANDLE_REFERENCE_V1', status='ALL_ORIGINAL_CSV_OHLC_CANDLES_AGREE', price_paths=12, compared_candles=compared, original_minute_rows=264960, sourceHTTP=0, D1=0, MAIN=0, Telegram=0, actual_ENTRY=False, all102_history_complete=False, project_complete=False)
(output / 'independent-reference.json').write_text(json.dumps(reference, indent=2) + '\n')
print(json.dumps(reference))
