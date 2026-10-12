#!/usr/bin/env python3
"""One bounded, read-only primary-source batch after N14 lease admission."""
import gzip, hashlib, json, subprocess, time, urllib.request, urllib.error
from pathlib import Path

R=Path(__file__).resolve().parents[1]
O='CODEX:N14_OPTION_COVERAGE:1791808766064'
H='08e883acc68852958f2224d4956bee0959c4d39c'
BASES=['BTC','ETH','SOL','XAUT','HYPE','XRP']
phase=json.loads((R/'checkpoints/CLOUD_PHASE_STATE_20261004.json').read_text())
fence=json.loads((R/'audit-fixes/source-optimization-20260930/execution-lock.json').read_text())
now=int(time.time()*1000)
assert phase['lease']['owner']==O and now<phase['lease']['expires_ts'] and not fence['active']
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=R,text=True).strip()==H
out=R/'checkpoints'/f'n14-bybit-option-other-bases-{now}'
out.mkdir()
receipt={'schema':'N14_BYBIT_OPTION_OTHER_BASES_BATCH_V1','head':H,'lease_owner':O,'started_ts':now,
 'admission':{'missing_fact':'INDEPENDENT_BYBIT_USEFUL_BASKETS_FOR_EXISTING_N14_ASSETS','max_http':6,
 'provider_attempt_cap':6,'d1_calls':0,'retries':0,'global_job_http_cap':164},'requests':[]}
for base in BASES:
 url=f'https://api.bybit.com/v5/market/tickers?category=option&baseCoin={base}'
 rec={'base':base,'url':url,'attempts':1}
 try:
  req=urllib.request.Request(url,headers={'Accept':'application/json','User-Agent':'My-Report-2-N14-Option-Audit/1.0'})
  with urllib.request.urlopen(req,timeout=15) as response:
   raw=response.read(5000001)
   rec.update(http_status=response.status,received_ts=int(time.time()*1000),response_date=response.headers.get('Date'),
    bytes=len(raw),body_sha256=hashlib.sha256(raw).hexdigest())
   if len(raw)>5000000: raise ValueError('response exceeds bound')
   payload=json.loads(raw)
   rec['rows']=len(payload.get('result',{}).get('list',[]))
   file=f'BYBIT_{base}_OPTION_TICKERS.json.gz'
   (out/file).write_bytes(gzip.compress(raw,mtime=0));rec['file']=file
 except urllib.error.HTTPError as error:rec.update(http_status=error.code,error=f'HTTP_{error.code}')
 except Exception as error:rec['error']=str(error)[:160]
 receipt['requests'].append(rec)
 (out/'receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
 if rec.get('http_status') in [403,429,451]:break
 time.sleep(1)
receipt['finished_ts']=int(time.time()*1000)
(out/'receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
print(out)
print(json.dumps([{k:v for k,v in r.items() if k!='url'} for r in receipt['requests']],ensure_ascii=False))
