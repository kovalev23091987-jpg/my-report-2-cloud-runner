#!/usr/bin/env python3
import gzip,hashlib,json,subprocess,time,urllib.request,urllib.error
from pathlib import Path
R=Path(__file__).resolve().parents[1];O='CODEX:N14_OPTION_COVERAGE:1791808766064';H='08e883acc68852958f2224d4956bee0959c4d39c'
p=json.loads((R/'checkpoints/CLOUD_PHASE_STATE_20261004.json').read_text());f=json.loads((R/'audit-fixes/source-optimization-20260930/execution-lock.json').read_text());now=int(time.time()*1000)
assert p['lease']['owner']==O and now<p['lease']['expires_ts'] and not f['active'] and subprocess.check_output(['git','rev-parse','HEAD'],cwd=R,text=True).strip()==H
out=R/'checkpoints'/f'n14-binance-bnb-index-{now}';out.mkdir();url='https://eapi.binance.com/eapi/v1/index?underlying=BNBUSDT';rec={'schema':'N14_BINANCE_BNB_INDEX_SINGLE_V1','head':H,'lease_owner':O,'started_ts':now,'admission':{'missing_fact':'EXACT_BNB_OPTION_UNDERLYING_INDEX','max_http':1,'official_endpoint_weight':1,'d1_calls':0,'retries':0,'global_job_http_cap':164},'url':url,'attempts':1}
try:
 req=urllib.request.Request(url,headers={'Accept':'application/json','User-Agent':'My-Report-2-N14-Option-Audit/1.0'})
 with urllib.request.urlopen(req,timeout=12) as response:
  raw=response.read(100001);rec.update(http_status=response.status,received_ts=int(time.time()*1000),response_date=response.headers.get('Date'),bytes=len(raw),body_sha256=hashlib.sha256(raw).hexdigest())
  if len(raw)>100000:raise ValueError('response exceeds bound')
  rec['payload']=json.loads(raw);(out/'BNB_INDEX.json.gz').write_bytes(gzip.compress(raw,mtime=0))
except urllib.error.HTTPError as error:rec.update(http_status=error.code,error=f'HTTP_{error.code}')
except Exception as error:rec['error']=str(error)[:160]
rec['finished_ts']=int(time.time()*1000);(out/'receipt.json').write_text(json.dumps(rec,ensure_ascii=False,indent=2)+'\n');print(out);print(json.dumps({k:v for k,v in rec.items() if k!='url'},ensure_ascii=False))
