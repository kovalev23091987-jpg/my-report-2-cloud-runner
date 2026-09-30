// Two bounded market-data probes, no account data or credentials in output.
for(const [source,url,headers,body] of [
['VYX','https://api.vyx.app/v1/symbols/SOL/candles?interval=1m&limit=2',{Authorization:'Bearer '+process.env.VYX_API_KEY},null],
['NANSEN','https://api.nansen.ai/api/v1/tgm/position-intelligence',{apikey:process.env.NANSEN_API_KEY},{token_address:'SOL'}]
]){
try{
 const r=await fetch(url,{method:body?'POST':'GET',headers:{...headers,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(20000)});
 const j=await r.json();
 const safe=JSON.stringify(j).replaceAll(process.env.NANSEN_API_KEY||'NEVER_MATCH_KEY','[REDACTED]').replaceAll(process.env.VYX_API_KEY||'NEVER_MATCH_KEY','[REDACTED]');
 console.log('SPECIALIST_SAMPLE '+JSON.stringify({source,http_status:r.status,quoted_cost:r.headers.get('X-Nansen-Credits-Cost'),used:r.headers.get('X-Nansen-Credits-Used'),payload:safe.slice(0,14000)}));
}catch{console.log('SPECIALIST_SAMPLE '+JSON.stringify({source,status:'TRANSPORT_ERROR'}));}
}
