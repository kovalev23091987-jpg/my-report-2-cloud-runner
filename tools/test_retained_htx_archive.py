import copy
import gzip
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import unittest
import zipfile

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('archive', ROOT / 'tools/qualify-retained-htx-archive.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
P = ROOT / 'checkpoints/htx-archive-primary-20261004'
ZIP = (P / 'near-trades-20261003.zip').read_bytes()
SUM = (P / 'near-trades-20261003.CHECKSUM').read_bytes()
BARS = gzip.decompress((P / 'near-archive-minute-counts-20261003.json.gz').read_bytes())
ASOF = 1791544000000


class ArchiveQualification(unittest.TestCase):
    def call(self, archive=ZIP, checksum=SUM, bars=BARS, contract='NEAR-USDT', offset=480, asof=ASOF):
        return module.qualify(archive, checksum, bars, contract, '2026-10-03', offset, asof)

    def test_actual_source_preserves_all_records_and_censors_boundary_and_ambiguous_order_minutes(self):
        receipt, candles = self.call()
        self.assertEqual(receipt['archive_sha256'], '9b0fc4e6078184bfdc932c311cde89d9545f119b134d85e0ab02d57aa3235e14')
        self.assertEqual(receipt['raw_records'], 4051)
        self.assertEqual(receipt['distinct_raw_tradeId_values'], 3722)
        self.assertEqual(receipt['shared_raw_id_groups'], 243)
        self.assertEqual(receipt['qualified_price_minutes'], 1435)
        self.assertEqual([r['minute_ts'] for r in receipt['failures']], [1790963100000, 1790973660000, 1790973720000, 1790981520000, 1791021780000])
        self.assertEqual(receipt['raw_records_removed'], 0)
        self.assertEqual(receipt['raw_timestamps_shifted'], 0)
        self.assertEqual(receipt['source_ts'], 1791139079109)
        self.assertEqual(receipt['measured_vol_twice_raw_size_minutes'], 1438)
        self.assertEqual(receipt['measured_turnover_twice_raw_price_size_minutes'], 1438)
        self.assertFalse(receipt['quantity_unit_qualified'])
        self.assertFalse(receipt['exchange_fill_identity_qualified'])
        self.assertFalse(receipt['decision_replay_eligible'])
        self.assertTrue(all(not c['live_quote_eligible'] and c['source_ts'] == 1791139079109 for c in candles))
        self.assertTrue(all('volume' not in c and 'notional' not in c for c in candles))

    def test_checksum_asset_clock_and_calendar_mismatches_are_rejected(self):
        cases = [{'checksum': b'0' * 64 + b'  NEAR-USDT-PERP-trades-2026-10-03.zip'}, {'contract': 'RAY-USDT'}, {'offset': 0}, {'asof': 1791139079108}]
        for changes in cases:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                self.call(**changes)

    def test_missing_duplicate_or_foreign_native_bars_cannot_close_history(self):
        source = json.loads(BARS)
        for change in [lambda b: b['data'].pop(), lambda b: b['data'].__setitem__(1, copy.deepcopy(b['data'][0])), lambda b: b.__setitem__('ch', 'market.FOREIGN-USDT.kline.1min')]:
            bars = copy.deepcopy(source)
            change(bars)
            with self.assertRaises(ValueError):
                self.call(bars=json.dumps(bars).encode())

    def test_file_and_timestamp_order_disagreement_is_censored_without_deleting_records(self):
        z = zipfile.ZipFile(io.BytesIO(ZIP))
        name = z.namelist()[0]
        rows = z.read(name).decode().splitlines()
        rows[1], rows[-1] = rows[-1], rows[1]
        out = io.BytesIO()
        with zipfile.ZipFile(out, 'w') as target:
            target.writestr(name, '\n'.join(rows))
        raw = out.getvalue()
        checksum = (hashlib.sha256(raw).hexdigest() + '  ' + name[:-4] + '.zip').encode()
        receipt, candles = self.call(archive=raw, checksum=checksum)
        self.assertEqual(receipt['raw_records'], 4051)
        self.assertEqual(receipt['raw_records_removed'], 0)
        self.assertLess(receipt['qualified_price_minutes'], 1435)


if __name__ == '__main__':
    unittest.main()
