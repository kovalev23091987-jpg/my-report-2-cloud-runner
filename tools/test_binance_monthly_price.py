import copy
import datetime as dt
import hashlib
import io
import json
from pathlib import Path
import unittest
import zipfile
import importlib.util

spec = importlib.util.spec_from_file_location('monthly', Path(__file__).with_name('qualify-binance-monthly-price.py'))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class Qualification(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.start = int(dt.datetime(2026, 2, 1, tzinfo=dt.timezone.utc).timestamp()) * 1000
        cls.end = cls.start + 28 * 86400000
        cls.rows = [f'{cls.start+i*60000},1,2,0.5,1.5,0,{cls.start+i*60000+59999},0,0,0,0,0' for i in range(28*1440)]

    def inputs(self, rows=None, market='usd_m_futures', header=False):
        lines = self.rows if rows is None else rows
        scale = 1000 if market == 'spot' else 1
        if scale != 1:
            native = []
            for row in lines:
                r = row.split(',')
                r[0] = str(int(r[0])*1000)
                r[6] = str((int(r[6])+1)*1000-1)
                native.append(','.join(r))
            lines = native
        if header:
            lines = ['open_time,open,high,low,close,volume,close_time,quote_volume,count,taker_buy_volume,taker_buy_quote_volume,ignore'] + lines
        out = io.BytesIO()
        name = 'BTCUSDT-1m-2026-02'
        with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
            z.writestr(name+'.csv', '\n'.join(lines)+'\n')
        archive = out.getvalue()
        checksum = (mod.sha(archive)+'  '+name+'.zip\n').encode()
        root = 'spot' if market == 'spot' else 'futures/um'
        url = 'https://data.binance.vision/data/'+root+'/monthly/klines/BTCUSDT/1m/'+name+'.zip'
        receipts = [dict(url=url+suffix,http_status=200,sha256=mod.sha(data),bytes=len(data),started_ts=self.end+100,received_ts=self.end+200) for suffix,data in [('',archive),('.CHECKSUM',checksum)]]
        return archive, checksum, dict(market=market,symbol='BTCUSDT',month='2026-02',receipts=receipts), self.end+1000

    def test_exact_futures_and_spot_native_units(self):
        for market, header in [('spot',False),('usd_m_futures',True),('usd_m_futures',False)]:
            m, payload = mod.qualify(*self.inputs(market=market,header=header))
            self.assertEqual(m['minute_count'],40320)
            self.assertEqual(m['event_interval'],[self.start,self.end])
            self.assertEqual(m['native_timestamp_unit'],'microseconds' if market=='spot' else 'milliseconds')
            self.assertIsNone(m['source_ts'])
            self.assertFalse(m['decision_replay_eligible'])
            self.assertFalse(m['htx_execution_price_eligible'])
            self.assertEqual(m['qualified_price_payload_sha256'],mod.sha(payload))

    def test_missing_duplicate_and_reordered_minutes(self):
        for rows in [self.rows[:-1],self.rows[:1]+self.rows, [self.rows[1],self.rows[0]]+self.rows[2:]]:
            with self.assertRaises(ValueError): mod.qualify(*self.inputs(rows))

    def test_invalid_geometry_numeric_and_field_count(self):
        for first in [self.rows[0].replace(',1,2,0.5,1.5,',',1,0.9,0.5,1.5,'),self.rows[0].replace(',1,2,0.5,1.5,',',NaN,2,0.5,1.5,'),self.rows[0].replace(',1,2,0.5,1.5,',',0,2,0.5,1.5,'),self.rows[0]+',extra',','.join(self.rows[0].split(',')[:5]+['-1']+self.rows[0].split(',')[6:])]:
            with self.assertRaises(ValueError): mod.qualify(*self.inputs([first]+self.rows[1:]))

    def test_future_availability_and_wrong_source_identity(self):
        for change in ['future','other-symbol','foreign-url','wrong-http']:
            a,c,r,t=self.inputs()
            if change=='future': r['receipts'][0]['received_ts']=t+1
            if change=='other-symbol': r['symbol']='ETHUSDT'
            if change=='foreign-url': r['receipts'][0]['url']='https://example.com/archive.zip'
            if change=='wrong-http': r['receipts'][0]['http_status']=404
            with self.assertRaises(ValueError):mod.qualify(a,c,r,t)

    def test_checksum_and_bytes_tampering(self):
        a,c,r,t=self.inputs()
        with self.assertRaises(ValueError):mod.qualify(a+b'extra',c,r,t)
        with self.assertRaises(ValueError):mod.qualify(a,c.replace(b'BTC',b'ETH'),r,t)

    def test_wrong_native_close_unit_and_unknown_header(self):
        for first in [self.rows[0].replace(str(self.start+59999),str(self.start+60000)),'timestamp,open,high,low,close,volume,close_time,quote_volume,count,taker_buy_volume,taker_buy_quote_volume,ignore']:
            with self.assertRaises(ValueError):mod.qualify(*self.inputs([first]+self.rows[1:]))


if __name__ == '__main__':
    unittest.main()
