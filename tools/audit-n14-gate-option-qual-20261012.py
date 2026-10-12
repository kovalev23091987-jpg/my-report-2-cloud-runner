#!/usr/bin/env python3
"""Bounded Gate option quote qualification for five missing HTX bases."""
import gzip, hashlib, json, subprocess, time, urllib.request, urllib.error
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
EXPECTED_MAIN='08e883acc68852958f2224d4956bee0959c4d39c'
OWNER='CODEX:N14_OPTION_COVERAGE:1791808766064'
CATALOG=ROOT/'checkpoints/n14-option-catalog-batch-1791808981122/GATE_OPTIONS_UNDERLYINGS.json.gz'
BASES=['ADA','BNB','DOGE','LTC','SUI']
MAX_CALLS=10
MAX_BYTES=5_000_000
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*a,**k):raise ValueError('redirect forbidden')
def sha(b):return hashlib.sha256(b).hexdigest()
def main():
 phase=json.loads((ROOT/'checkpoints/CLOUD_PHASE_STATE_20261004.json').read_text());fence=json.loads((ROOT/'audit-fixes/source-optimization-20260930/execution-lock.json').read_text());now=int(time.time()*1000)
 assert phase['lease']['owner']==OWNER and now<phase['lease']['expires_ts'] and not fence['active']
 assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()==EXPECTED_MAIN
 catalog=json.load(gzip.open(CATALOG,'rt'));seen={r['name'] for r in catalog};assert all(f'{b}_USDT' in seen for b in BASES)
 directory=ROOT/'checkpoints'/f'n14-gate-option-samples-{now}';directory.mkdir()
 receipt={'schema':'N14_GATE_OPTION_BOUNDED_SAMPLE_V1','started_ts':now,'head':EXPECTED_MAIN,'catalog':'checkpoints/n14-option-catalog-batch-1791808981122/receipt.json','lease_owner':OWNER,'admission':{'missing_facts':[f'{b}:CONTRACTS_AND_QUOTES' for b in BASES],'max_http':MAX_CALLS,'max_http_per_asset':2,'d1_calls':0,'retries':0,'global_job_http_cap':164,'pace_ms':1000},'requests':[]}
 opener=urllib.request.build_opener(NoRedirect)
 for base in BASES:
  for role in ['contracts','tickers']:
   url=f'https://api.gateio.ws/api/v4/options/{role}?underlying={base}_USDT';rec={'base':base,'role':role,'url':url,'attempts':1}
   try:
    req=urllib.request.Request(url,headers={'Accept':'application/json','User-Agent':'My-Report-2-N14-Option-Audit/1.0'})
    with opener.open(req,timeout=12) as response:
     rec['http_status']=response.status;rec['received_ts']=int(time.time()*1000);rec['response_date']=response.headers.get('Date');raw=response.read(MAX_BYTES+1);rec['bytes']=len(raw);rec['body_sha256']=sha(raw)
     if len(raw)>MAX_BYTES:raise ValueError('response exceeds max bytes')
     if response.status==200:
      payload=json.loads(raw);rec['rows']=len(payload) if isinstance(payload,list) else None
      name=f'{base}-{role}.json.gz';(directory/name).write_bytes(gzip.compress(raw,mtime=0));rec['file']=name
   except urllib.error.HTTPError as error:rec['http_status']=error.code;rec['error']='HTTP_'+str(error.code)
   except Exception as error:rec['error']=str(error)[:160]
   receipt['requests'].append(rec);(directory/'receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
   if rec.get('http_status') in (403,429,451):receipt['stopped_on_provider_limit']=True;break
   time.sleep(1)
  if receipt.get('stopped_on_provider_limit'):break
 receipt['finished_ts']=int(time.time()*1000);(directory/'receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
 print(directory);print(json.dumps([{k:v for k,v in r.items() if k!='url'} for r in receipt['requests']],ensure_ascii=False))
if __name__=='__main__':main()
