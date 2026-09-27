import json, time, hashlib, pathlib, urllib.request, urllib.error, concurrent.futures
ROOT=pathlib.Path('/mnt/files/liq_research')
JOBS=[
('hyperperps_docs','https://trade.hyperperps.app/api/public/heatmap',None),
('hyperperps_BTC','https://trade.hyperperps.app/api/public/heatmap/BTC',None),
('hyperperps_ETH','https://trade.hyperperps.app/api/public/heatmap/ETH',None),
('byk_FIL','https://bykaranteli.com/api/liqmap/public?symbol=FIL',None),
('byk_BTC','https://bykaranteli.com/api/liqmap/public?symbol=BTC',None),
('coinboss_FIL','https://api.coinboss.com/api/liq-map?symbol=FIL&range=1d',None),
('coinboss_BEAT','https://api.coinboss.com/api/liq-maxpain?symbol=BEAT',None),
('coinboss_XPL','https://api.coinboss.com/api/liq-maxpain?symbol=XPL',None),
('coinboss_AVNT','https://api.coinboss.com/api/liq-maxpain?symbol=AVNT',None),
('marginpad_FIL','https://marginpad.io/api/v1/clusters?symbol=FIL',None),
('xoomar_FIL','https://xoomar.com/api/markets/liquidations/recent?symbol=FIL&limit=10',None),
('hl_universe','https://api.hyperliquid.xyz/info',{'type':'metaAndAssetCtxs'}),
('gtrade_pairs','https://backend-arbitrum.gains.trade/trading-variables/pairs,groups,pairInfos',None),
('gtrade_trades','https://backend-arbitrum.gains.trade/open-trades',None),
('ox_levels_doc','https://docs.0xarchive.io/rest-api/liquidation-levels.md',None),
('ox_schema_doc','https://docs.0xarchive.io/schemas/operations/get-hyperliquid-liquidation-levels',None),
('ironflow_state_doc','https://docs.ironflow.sh/api-reference/analytics/user-state.md',None),
]
def get(job):
 name,url,body=job
 rec={'name':name,'url':url,'method':'POST' if body else 'GET','request_body':body,'started_ts':round(time.time()*1000),'authentication':'NONE','purpose':'READ_ONLY_RESEARCH'}
 try:
  h={'User-Agent':'Report2-Liquidation-Research/1.0','Accept':'application/json,text/markdown,text/html'}
  if body is not None:h['Content-Type']='application/json'
  req=urllib.request.Request(url,data=json.dumps(body).encode() if body else None,headers=h)
  try: r=urllib.request.urlopen(req,timeout=25)
  except urllib.error.HTTPError as e:r=e
  with r:
   b=r.read(8000001)
   if len(b)>8000000:raise ValueError('RESPONSE_SIZE_LIMIT')
   rec.update(http_status=r.status,received_ts=round(time.time()*1000),bytes=len(b),sha256=hashlib.sha256(b).hexdigest(),headers={k:v for k,v in r.headers.items() if k.lower() in ['date','age','cache-control','content-type','retry-after']})
  ROOT.joinpath(name+'.raw').write_bytes(b)
  try:
   p=json.loads(b);rec['json_type']=type(p).__name__
   if isinstance(p,dict):
    rec['keys']=list(p)
    for k in ['_meta','as_of','updatedAt','updated_at','success','model','symbol','error','message']: 
     if k in p:rec[k]=p[k]
    if 'clusters' in p:rec['cluster_count']=len(p['clusters'])
    if 'data' in p and isinstance(p['data'],list):rec['data_count']=len(p['data'])
   elif isinstance(p,list):rec['count']=len(p)
  except Exception:rec['json_type']=None
 except Exception as e:rec['error']=str(e)
 ROOT.joinpath(name+'.receipt.json').write_text(json.dumps(rec,ensure_ascii=False,indent=2))
 return rec
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as e:
 for r in e.map(get,JOBS): print(json.dumps(r,ensure_ascii=False))
