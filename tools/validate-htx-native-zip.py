"""Validate checksum-matched HTX ZIP structure only; not a native API OHLC comparison."""
import csv
import datetime as dt
import hashlib
import io
import json
import sys
import zipfile
from decimal import Decimal, InvalidOperation
from pathlib import Path

HEADER = ['instId', 'open', 'high', 'low', 'close', 'vol', 'volCcy', 'volCcyQuote', 'ts']

def inspect(zipped, contract, day):
    native = contract + '-PERP'
    expected_name = f'{native}-klines-1m-{day}.csv'
    if not contract.endswith('-USDT') or len(zipped) > 8 * 1024 * 1024:
        raise ValueError('BOUNDED_EXACT_HTX_CONTRACT_REQUIRED')
    with zipfile.ZipFile(io.BytesIO(zipped)) as z:
        if z.namelist() != [expected_name] or z.getinfo(expected_name).file_size > 8 * 1024 * 1024:
            raise ValueError('EXACT_SINGLE_NATIVE_CSV_REQUIRED')
        raw = z.read(expected_name)
    reader = csv.DictReader(io.StringIO(raw.decode('utf-8-sig')))
    if reader.fieldnames != HEADER:
        raise ValueError('EXACT_NATIVE_KLINE_HEADER_REQUIRED')
    rows = list(reader)
    if len(rows) != 1440:
        raise ValueError('EXACT_1440_ROWS_REQUIRED')
    timestamps = []
    for row in rows:
        if row['instId'] != native or not row['ts'].isdigit():
            raise ValueError('EXACT_NATIVE_ID_AND_TIMESTAMP_REQUIRED')
        values = {}
        for k in ('open','high','low','close'):
            if len(row[k]) > 80:
                raise ValueError('BOUNDED_OHLC_LEXEME_REQUIRED')
            try:
                v = Decimal(row[k])
            except InvalidOperation:
                raise ValueError('NUMERIC_OHLC_REQUIRED')
            if not v.is_finite() or v <= 0:
                raise ValueError('POSITIVE_FINITE_OHLC_REQUIRED')
            values[k] = v
        if values['high'] < max(values['open'],values['close']) or values['low'] > min(values['open'],values['close']) or values['low'] > values['high']:
            raise ValueError('VALID_OHLC_GEOMETRY_REQUIRED')
        timestamps.append(int(row['ts']))
    ordered = sorted(timestamps)
    if any(t != ordered[0] + i*60 for i,t in enumerate(ordered)):
        raise ValueError('EXACT_UNIQUE_CONTIGUOUS_MINUTE_GRID_REQUIRED')
    nominal = int(dt.datetime.strptime(day,'%Y-%m-%d').replace(tzinfo=dt.timezone.utc).timestamp())
    delta = nominal - ordered[0]
    if delta % 60 or not 0 <= delta < 1440*60:
        raise ValueError('EXPLICIT_ARCHIVE_CALENDAR_OFFSET_REQUIRED')
    return {'status':'CHECKSUM_AND_1440_MINUTE_GRID_VERIFIED_PRICE_API_NOT_CROSSCHECKED',
            'contract':contract,'archive_day':day,'minute_count':1440,
            'first_open_ts':ordered[0]*1000,'last_open_ts':ordered[-1]*1000,
            'archive_day_offset_minutes':delta//60,'csv_sha256':hashlib.sha256(raw).hexdigest(),
            'native_API_OHLC_crosschecked':False,'volume_units_qualified':False,
            'live_quote_eligible':False,'decision_replay_eligible':False,'entry_authorized':False}

def selftest():
    day='2026-10-03'
    out=io.StringIO()
    writer=csv.writer(out)
    writer.writerow(HEADER)
    start=int(dt.datetime(2026,10,2,16,tzinfo=dt.timezone.utc).timestamp())
    for i in range(1440):
        writer.writerow(['TEST-USDT-PERP','1','1.1','0.9','1','0','0','0',start+i*60])
    data=io.BytesIO()
    with zipfile.ZipFile(data,'w',zipfile.ZIP_DEFLATED) as z:
        z.writestr('TEST-USDT-PERP-klines-1m-2026-10-03.csv',out.getvalue())
    ok=inspect(data.getvalue(),'TEST-USDT',day)
    assert ok['minute_count']==1440 and ok['archive_day_offset_minutes']==480
    try:
        inspect(data.getvalue(),'WRONG-USDT',day)
        raise AssertionError('wrong contract accepted')
    except ValueError:
        pass
    print(json.dumps({'status':'PASS','tests':2}))

if __name__=='__main__':
    if len(sys.argv)==2 and sys.argv[1]=='--self-test':
        selftest()
    elif len(sys.argv)==4:
        print(json.dumps(inspect(Path(sys.argv[1]).read_bytes(),sys.argv[2],sys.argv[3])))
    else:
        raise SystemExit('usage: validate-htx-native-zip.py ZIP CONTRACT DAY | --self-test')
