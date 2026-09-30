const results=[];
for(const [source,name,url,header] of [
 ['NANSEN','NANSEN_API_KEY','https://api.nansen.ai/api/v1/account','apikey'],
 ['VYX','VYX_API_KEY','https://api.vyx.app/v1/symbols','Authorization']
]){
 const key=process.env[name];
 if(!key){results.push({source,status:'KEY_MISSING'});continue;}
 try{
 const r=await fetch(url,{headers:{[header]:header==='Authorization'?'Bearer '+key:key,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(20000)});
 let json;try{json=await r.json();}catch{}
 const status=r.ok&&json&&typeof json==='object'?'ACCESS_CONFIRMED':r.status===401?'AUTH_REJECTED':r.status===403?'FORBIDDEN':r.status===429?'QUOTA_OR_RATE_LIMIT':'NOT_CONFIRMED';
 results.push({source,status,http_status:r.status,json_response:!!json});
 }catch{results.push({source,status:'TRANSPORT_ERROR'});}
}
console.log('SPECIALIST_ACCESS_RESULT '+JSON.stringify({checked_at:new Date().toISOString(),results,requests_maximum:2,production_changed:false}));
if(results.some(r=>r.status!=='ACCESS_CONFIRMED'))process.exitCode=1;
