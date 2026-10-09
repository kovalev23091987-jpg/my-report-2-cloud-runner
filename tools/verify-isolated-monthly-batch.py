"""Replay retained exact native bytes through isolated archive storage, no HTTP/D1."""
import argparse
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess

spec = importlib.util.spec_from_file_location('monthly', Path(__file__).with_name('qualify-binance-monthly-price.py'))
monthly = importlib.util.module_from_spec(spec)
spec.loader.exec_module(monthly)


def replay(source, output):
    source, output = Path(source), Path(output)
    original = json.loads((source / 'acquisition.json').read_text())
    old_directories = monthly.batch_directories(original)
    isolated = {**original, 'storage_layout': 'MARKET_SYMBOL_MONTH'}
    new_directories = monthly.batch_directories(isolated)
    output.mkdir(parents=True, exist_ok=True)
    for old, new in zip(old_directories, new_directories):
        folder = output / new
        folder.mkdir(parents=True, exist_ok=True)
        for name in ['original.zip', 'original.zip.CHECKSUM']:
            shutil.copyfile(source / old / name, folder / name)
    (output / 'acquisition.json').write_text(json.dumps(isolated, indent=2)+'\n')
    monthly.run(output)
    comparisons, minutes = [], 0
    for record, old, new in zip(original['archives'], old_directories, new_directories):
        before = json.loads((source / old / 'qualification.json').read_text())
        after = json.loads((output / new / 'qualification.json').read_text())
        # Qualification is performed now; all source bytes and original source
        # availability stay exact. Never make cold history live or past-available.
        for key in ['market','symbol','month','archive_sha256','checksum_sha256','csv_sha256','event_interval','minute_count','native_timestamp_unit','available_at','original_receipts']:
            assert before[key] == after[key], key
        old_prices = json.loads(gzip.decompress((source / old / 'qualified-price.json.gz').read_bytes()))
        new_prices = json.loads(gzip.decompress((output / new / 'qualified-price.json.gz').read_bytes()))
        assert old_prices == new_prices, 'ORIGINAL_PRICES_OR_TIMESTAMPS_CHANGED'
        minutes += len(new_prices)
        comparisons.append({'market': record['market'], 'symbol': record['symbol'], 'month': record['month'], 'directory': new.as_posix(), 'minute_count': len(new_prices), 'archive_sha256': after['archive_sha256'], 'source_availability_preserved': True})
    subprocess.run(['node', str(Path(__file__).with_name('verify-binance-monthly-price.mjs')), str(output)], check=True)
    consumer = json.loads((output / 'current-consumer-results.json').read_text())
    proof = {'schema':'ISOLATED_MONTHLY_RETAINED_BATCH_V1','archives':comparisons,'compared_original_minutes':minutes,'groups':consumer['groups'],'closed_price_paths':consumer['closed_price_paths'],'rejected_controls':consumer['rejected_controls'],'original_source_clocks_refreshed':False,'sourceHTTP':0,'D1':0,'MAIN':0,'Telegram':0,'htx_asset_identity_qualified':False,'actual_ENTRY':False,'all102_history_complete':False,'project_complete':False}
    (output / 'isolated-batch-proof.json').write_text(json.dumps(proof,indent=2)+'\n')
    print(json.dumps({k:v for k,v in proof.items() if k!='archives'}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    replay(args.source, args.output)
