"""One bounded read-only comparison after pre-mutation transport failures."""
import hashlib,json,os,re,subprocess,sys,time
from pathlib import Path
a=json.loads(Path(sys.argv[1]).read_text());now=int(time.time()*1000)
lease=json.loads(Path('checkpoints/CLOUD_PHASE_STATE_20261004.json').read_text())['lease']
assert a['status']=='ADMITTED_READONLY_TRANSPORT_DIAGNOSTIC' and a['maximum_admin_GET']==2
assert now<a['expires_ts']<=a['own_lease']['expires_ts'] and lease['owner']==a['own_lease']['owner'] and not lease.get('released')
assert hashlib.sha256(Path(__file__).read_bytes()).hexdigest()==a['operator_sha256']
attempt=Path(a['private_prefix']+'.attempt');fd=os.open(attempt,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
with os.fdopen(fd,'w') as f:json.dump({'started_ts':now,'authority_main':a['authority_main'],'no_auto_retry':True},f)
config=Path('/Users/mac/Library/Preferences/.wrangler/config/default.toml').read_text()
token=re.search(r'^oauth_token\s*=\s*"([^\"]+)"',config,re.M).group(1)
url='https://api.cloudflare.com/client/v4/accounts/70ee0af85191ea470e74c7383fdec772/workers/scripts/my-report-2-hub'
node="""const fs=require('node:fs'),crypto=require('node:crypto'),a=JSON.parse(fs.readFileSync(0,'utf8'));
(async()=>{try{const r=await fetch(a.url,{headers:{Authorization:'Bearer '+a.token},redirect:'manual',signal:AbortSignal.timeout(20000)});let n=0,chunks=[];for await(const b of r.body){n+=b.length;if(n>10485760)throw Error('BODY_BOUND');chunks.push(b);}const b=Buffer.concat(chunks);fs.writeFileSync(a.body,b,{flag:'wx',mode:0o600});process.stdout.write(JSON.stringify({status:r.status,bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex'),content_type:r.headers.get('content-type')}));}catch(e){process.stdout.write(JSON.stringify({error:String(e.message).slice(0,180),cause_code:e.cause?.code??null,cause_message:String(e.cause?.message??'').slice(0,180)}));process.exitCode=1;}})();"""
calls=1
r=subprocess.run([a['node_path'],'-e',node],input=json.dumps({'url':url,'token':token,'body':a['private_prefix']+'.node-body'}).encode(),capture_output=True,timeout=25)
try:node_result=json.loads(r.stdout)
except Exception:node_result={'exit_code':r.returncode,'stderr_sha256':hashlib.sha256(r.stderr).hexdigest()}
result={'schema':'ROOT_ADMIN_TRANSPORT_DIAGNOSTIC_V1','authority_main':a['authority_main'],'node':node_result,'mutation_attempted':False,'market_HTTP':0,'native_SQL':0,'Telegram':0}
if node_result.get('status')!=200:
 assert int(time.time()*1000)<a['expires_ts'];calls+=1
 # Token is passed through stdin, never argv or the command log. TLS verification
 # stays enabled; redirects and retries are not configured.
 curl_config='url = "'+url+'"\nheader = "Authorization: Bearer '+token+'"\n'
 c=subprocess.run(['/usr/bin/curl','--silent','--show-error','--max-time','20','--connect-timeout','10','--proto','=https','--output',a['private_prefix']+'.curl-body','--dump-header',a['private_prefix']+'.curl-headers','--write-out','%{http_code}','--config','-'],input=curl_config.encode(),capture_output=True,timeout=25)
 result['curl']={'exit_code':c.returncode,'status':c.stdout.decode(errors='replace')[:20],'error':c.stderr.decode(errors='replace')[:250]}
 b=Path(a['private_prefix']+'.curl-body')
 if b.exists():result['curl'].update(bytes=b.stat().st_size,sha256=hashlib.sha256(b.read_bytes()).hexdigest())
result.update(admin_GET_attempted=calls,physical_admin_HTTP='UNKNOWN_NONZERO_RETAINED',completed_ts=int(time.time()*1000))
Path(a['proof_file']).write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
