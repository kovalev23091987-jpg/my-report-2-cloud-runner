#!/usr/bin/env python3
"""Four one-shot public option catalog reads for N14 discovery; no D1 or retries."""
import gzip
import hashlib
import json
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

EXPECTED_MAIN = '08e883acc68852958f2224d4956bee0959c4d39c'
OWNER = 'CODEX:N14_OPTION_COVERAGE:1791808766064'
ROOT = Path(__file__).resolve().parents[1]
SOURCES = [
    ('GATE_OPTIONS_UNDERLYINGS', 'https://api.gateio.ws/api/v4/options/underlyings'),
    ('BYBIT_OPTION_BASE_COINS', 'https://api.bybit.com/v5/market/option-base-coins?underlyingType=0'),
    ('BINANCE_OPTION_EXCHANGE_INFO', 'https://eapi.binance.com/eapi/v1/exchangeInfo'),
    ('OKX_OPTION_UNDERLYINGS', 'https://www.okx.com/api/v5/public/underlying?instType=OPTION'),
]
MAX_CALLS = 4
MAX_BYTES = 12_000_000
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ValueError('redirect forbidden')

def sha(data): return hashlib.sha256(data).hexdigest()

def main():
    phase = json.loads((ROOT/'checkpoints/CLOUD_PHASE_STATE_20261004.json').read_text())
    fence = json.loads((ROOT/'audit-fixes/source-optimization-20260930/execution-lock.json').read_text())
    lease = phase.get('lease')
    now = int(time.time()*1000)
    assert lease and lease['owner'] == OWNER and now < lease['expires_ts']
    assert not fence['active']
    assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip() == EXPECTED_MAIN
    assert len(SOURCES) == MAX_CALLS
    directory = ROOT/'checkpoints'/f'n14-option-catalog-batch-{now}'
    directory.mkdir()
    receipt = {'schema':'N14_OPTION_CATALOG_BOUNDED_DISCOVERY_V1','started_ts':now,'head':EXPECTED_MAIN,'lease_owner':OWNER,
               'admission':{'missing_facts':[x[0] for x in SOURCES],'source_http_max':MAX_CALLS,'source_http_per_provider_max':1,'d1_calls':0,'retries':0,'global_job_http_cap':164,'reason':'catalog-only prequalification before requesting any option quotes'},'sources':[]}
    opener = urllib.request.build_opener(NoRedirect)
    for name,url in SOURCES:
        record = {'name':name,'url':url,'attempts':1}
        try:
            req = urllib.request.Request(url,headers={'Accept':'application/json','User-Agent':'My-Report-2-N14-Catalog-Audit/1.0'})
            with opener.open(req,timeout=12) as response:
                record['http_status'] = response.status
                record['received_ts'] = int(time.time()*1000)
                body = response.read(MAX_BYTES+1)
                record['bytes'] = len(body)
                record['body_sha256'] = sha(body)
                if len(body) > MAX_BYTES: raise ValueError('response exceeds max bytes')
                if response.status == 200:
                    obj=json.loads(body)
                    filename = name+'.json.gz'
                    (directory/filename).write_bytes(gzip.compress(body,mtime=0))
                    record['file'] = filename
                    record['top_level'] = list(obj)[:20] if isinstance(obj,dict) else type(obj).__name__
        except urllib.error.HTTPError as error:
            record['http_status']=error.code;record['error']='HTTP_'+str(error.code)
        except Exception as error:
            record['error']=str(error)[:160]
        receipt['sources'].append(record)
        (directory/'receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
    receipt['finished_ts']=int(time.time()*1000)
    (directory/'receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
    print(directory)
    print(json.dumps([{k:v for k,v in r.items() if k not in ['top_level']} for r in receipt['sources']],ensure_ascii=False))
if __name__=='__main__':main()
