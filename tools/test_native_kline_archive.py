import copy
import gzip
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import unittest
import zipfile

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('kline', ROOT / 'tools/qualify-native-kline-archive.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
P = Path(os.environ.get('REPORT2_NATIVE_KLINE_SOURCE', 'retained-native-kline-download'))
ZIP = (P / 'native-kline-archive/native-kline.zip').read_bytes()
CHECKSUM = (P / 'native-kline-archive/native-kline.zip.CHECKSUM').read_bytes()
ACQUISITION = json.loads((P / 'native-kline-archive-download.json').read_text())
BARS = gzip.decompress((ROOT / 'checkpoints/htx-archive-primary-20261004/near-archive-minute-counts-20261003.json.gz').read_bytes())
ASOF = 1791548400000


class NativeKline(unittest.TestCase):
    def call(self, archive=ZIP, checksum=CHECKSUM, bars=BARS, acquisition=ACQUISITION, contract='NEAR-USDT', offset=480, asof=ASOF):
        return module.qualify(archive, checksum, bars, acquisition, contract, '2026-10-03', offset, asof)

    def altered(self, mutate):
        z = zipfile.ZipFile(io.BytesIO(ZIP))
        name = z.namelist()[0]
        rows = z.read(name).decode().splitlines()
        mutate(rows)
        output = io.BytesIO()
        with zipfile.ZipFile(output, 'w') as target:
            target.writestr(name, '\n'.join(rows))
        archive = output.getvalue()
        checksum = (hashlib.sha256(archive).hexdigest() + '  ' + name[:-4] + '.zip').encode()
        a = copy.deepcopy(ACQUISITION)
        a['archive_sha256'] = hashlib.sha256(archive).hexdigest()
        for r in a['receipts']:
            b = archive if r['file'] == 'native-kline.zip' else checksum
            r.update(sha256=hashlib.sha256(b).hexdigest(), bytes=len(b))
        return archive, checksum, a

    def test_actual_native_day_qualifies_all_original_minutes_and_keeps_original_clock_without_volume_or_live_evidence(self):
        receipt, candles = self.call()
        self.assertEqual(receipt['archive_sha256'], '1830d7631d21d86332c3df1b66bb1e7ca7d8ef21fb322e8668db045ec9d0c37d')
        self.assertEqual(receipt['qualified_price_minutes'], 1440)
        self.assertEqual(receipt['source_ts'], 1791139079109)
        self.assertEqual(receipt['available_at'], 1791547571645)
        self.assertFalse(receipt['decision_replay_eligible'])
        self.assertFalse(receipt['quantity_unit_qualified'])
        self.assertFalse(receipt['exchange_fill_identity_qualified'])
        self.assertEqual([c['open_ts'] for c in candles], list(range(1790956800000, 1791043200000, 60000)))
        self.assertTrue(all('volume' not in c and 'notional' not in c for c in candles))

    def test_archive_asset_checksum_time_and_acquisition_mismatches_are_rejected(self):
        for patch in [{'contract': 'RAY-USDT'}, {'offset': 0}, {'checksum': b'0' * 64}, {'asof': 1791547571644}, {'acquisition': {**ACQUISITION, 'archive_day': '2026-10-04'}}]:
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                self.call(**patch)

    def test_duplicate_missing_or_foreign_archive_rows_cannot_close_the_day(self):
        for mutate in [lambda rows: rows.pop(), lambda rows: rows.__setitem__(2, rows[1]), lambda rows: rows.__setitem__(1, rows[1].replace('NEAR-USDT-PERP', 'RAY-USDT-PERP'))]:
            archive, checksum, a = self.altered(mutate)
            with self.assertRaises(ValueError):
                self.call(archive=archive, checksum=checksum, acquisition=a)

    def test_exact_api_price_conflict_missing_bar_and_foreign_channel_cannot_be_overridden_by_archive(self):
        for mutate in [lambda b: b['data'][0].__setitem__('close', '99'), lambda b: b['data'].pop(), lambda b: b.__setitem__('ch', 'market.RAY-USDT.kline.1min')]:
            b = json.loads(BARS)
            mutate(b)
            with self.assertRaises(ValueError):
                self.call(bars=json.dumps(b).encode())

    def test_native_transport_clock_cannot_be_backdated_or_renamed_as_market_time(self):
        for patch in [{'received_ts': ASOF + 1}, {'http_status': 403}, {'url': 'https://foreign.test/data'}, {'file': 'native-kline.zip.CHECKSUM'}]:
            a = copy.deepcopy(ACQUISITION)
            a['receipts'][0].update(patch)
            with self.assertRaises(ValueError):
                self.call(acquisition=a)


if __name__ == '__main__':
    unittest.main()
