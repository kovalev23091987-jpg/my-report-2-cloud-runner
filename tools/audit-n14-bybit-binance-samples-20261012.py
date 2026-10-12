#!/usr/bin/env python3
import gzip,hashlib,json,subprocess,time,urllib.request,urllib.error
from pathlib import Path
R=Path(__file__).resolve().parents[1];O='CODEX:N14_OPTION_COVERAGE:1791808766064';H='08e883acc68852958f2224d4956bee0959c4d39c'
S=[('BYBIT_DOGE_OPTION_TICKERS','https://api.bybit.com/v5/market/tickers?category=option&baseCoin=DOGE')]
S += [(f'BINANCE_BNB_{strike}_{kind}',f'https://eapi.binance.com/eapi/v1/ticker?symbol=BNB-261014-{strike}-{kind}') for strike in ['750','745'] for kind in ['C','P']]
S += [('BINANCE_OPTION_MARK_ALL','https://eapi.binance.com/eapi/v1/mark')]
assert len(S)==6
phase=json.loads((R/'checkpoints/CLOUD_PHASE_STATE_20261004.json').read_text());fence=json.loads((R/'audit-fixes/source-optimization-20260930/execution-lock.json').read_text());now=int(time.time()*1000)
assert phase['lease']['owner']==O and now<phase['lease']['expires_ts'] and not fence['active'] and subprocess.check_output(['git','rev-parse','HEAD'],cwd=R,text=True).strip()==H
out=R/'checkpoints'/f'n14-bybit-binance-samples-{now}';out.mkdir();receipt={'schema':'N14_BYBIT_BINANCE_BOUNDED_SAMPLES_V1','head':H,'lease_owner':O,'started_ts':now,'admission':{'missing_facts':['DOGE_OPTION_LIQUIDITY_BYBIT','BNB_OPTION_LIQUIDITY_IV_BINANCE'],'max_http':6,'provider_attempt_caps':{'BYBIT':1,'BINANCE':5},'binance_weight_max':9,'d1_calls':0,'retries':0,'global_job_http_cap':164},'requests':[]}
for name,url in S:
 rec={'name':name,'url':url,'attempts':1}
 try:
  req=urllib.request.Request(url,headers={'Accept':'application/json','User-Agent':'My-Report-2-N14-Option-Audit/1.0'})
  with urllib.request.urlopen(req,timeout=12) as resp:
   raw=resp.read(10000001);rec.update(http_status=resp.status,received_ts=int(time.time()*1000),response_date=resp.headers.get('Date'),bytes=len(raw),body_sha256=hashlib.sha256(raw).hexdigest())
   if len(raw)>10000000:raise ValueError('response exceeds bound')
   payload=json.loads(raw);rec['rows']=len(payload) if isinstance(payload,list) else len(payload.get('result',{}).get('list',[])) if isinstance(payload.get('result'),dict) else None
   file=name+'.json.gz';(out/file).write_bytes(gzip.compress(raw,mtime=0));rec['file']=file
 except urllib.error.HTTPError as e:rec.update(http_status=e.code,error='HTTP_'+str(e.code))
 except Exception as e:rec['error']=str(e)[:160]
 receipt['requests'].append(rec);(out/'receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
 if rec.get('http_status') in [403,429,451]:break
 time.sleep(1)
receipt['finished_ts']=int(time.time()*1000);(out/'receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n');print(out);print(json.dumps([{k:v for k,v in r.items() if k!='url'} for r in receipt['requests']],ensure_ascii=False))
