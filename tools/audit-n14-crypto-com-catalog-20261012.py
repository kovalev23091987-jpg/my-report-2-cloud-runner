#!/usr/bin/env python3
import gzip,hashlib,json,subprocess,time,urllib.request,urllib.error
from pathlib import Path
R=Path(__file__).resolve().parents[1];P=R/'checkpoints/CLOUD_PHASE_STATE_20261004.json';F=R/'audit-fixes/source-optimization-20260930/execution-lock.json';O='CODEX:N14_OPTION_COVERAGE:1791808766064';H='08e883acc68852958f2224d4956bee0959c4d39c';U='https://api.crypto.com/exchange/v1/public/get-instruments'
d=json.loads(P.read_text());f=json.loads(F.read_text());now=int(time.time()*1000);assert d['lease']['owner']==O and now<d['lease']['expires_ts'] and not f['active'] and subprocess.check_output(['git','rev-parse','HEAD'],cwd=R,text=True).strip()==H
out=R/'checkpoints'/f'n14-crypto-com-catalog-{now}';out.mkdir();rec={'schema':'N14_CRYPTO_COM_CATALOG_ONE_SHOT_V1','head':H,'lease_owner':O,'admission':{'missing_fact':'current_public_OPTION_instrument_underlyings','max_http':1,'d1_calls':0,'retries':0,'global_job_http_cap':164},'url':U,'started_ts':now}
try:
 req=urllib.request.Request(U,headers={'Accept':'application/json','User-Agent':'My-Report-2-N14-Option-Audit/1.0'})
 with urllib.request.urlopen(req,timeout=15) as resp:
  raw=resp.read(12000001);rec.update(http_status=resp.status,received_ts=int(time.time()*1000),bytes=len(raw),body_sha256=hashlib.sha256(raw).hexdigest(),response_date=resp.headers.get('Date'))
  if len(raw)>12000000:raise ValueError('response exceeds bound')
  payload=json.loads(raw);rec['code']=payload.get('code');rec['rows']=len(payload.get('result',{}).get('data',[]));(out/'CRYPTO_COM_INSTRUMENTS.json.gz').write_bytes(gzip.compress(raw,mtime=0));rec['file']='CRYPTO_COM_INSTRUMENTS.json.gz'
except urllib.error.HTTPError as e:rec.update(http_status=e.code,error='HTTP_'+str(e.code))
except Exception as e:rec['error']=str(e)[:160]
rec['finished_ts']=int(time.time()*1000);(out/'receipt.json').write_text(json.dumps(rec,ensure_ascii=False,indent=2)+'\n');print(out);print(json.dumps(rec,ensure_ascii=False))
