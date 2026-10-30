"""One admitted ordinary whoami refresh, same existing OAuth; no login/key/scope."""
import hashlib,json,os,re,subprocess,sys,time
from pathlib import Path
from datetime import datetime
a=json.loads(Path(sys.argv[1]).read_text());now=int(time.time()*1000)
assert a['status']=='ADMITTED_NOT_SPENT'and a['maximum_CLI_invocations']==1 and now<a['expires_ts']<=a['own_lease']['expires_ts']
lease=json.loads(Path('checkpoints/CLOUD_PHASE_STATE_20261004.json').read_text())['lease'];assert lease['owner']==a['own_lease']['owner']and not lease.get('released')
assert hashlib.sha256(Path(a['wrangler_path']).read_bytes()).hexdigest()==a['wrangler_sha256']
fd=os.open(a['private_attempt'],os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w')as f:json.dump({'state':'ATTEMPTED_NO_RETRY','started_ts':now,'CLI':1,'authority_main':a['authority_main']},f)
env=dict(os.environ,CI='1',WRANGLER_SEND_METRICS='false')
r=subprocess.run([a['node_path'],a['wrangler_path'],'whoami'],capture_output=True,timeout=60,env=env)
fd=os.open(a['private_log'],os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'wb')as f:f.write(r.stdout+b'\n'+r.stderr)
config=Path('/Users/mac/Library/Preferences/.wrangler/config/default.toml').read_text();expiry=re.search(r'^expiration_time\s*=\s*"([^\"]+)"',config,re.M).group(1)
proof={'schema':'ROOT_EXISTING_WRANGLER_REFRESH_ACTUAL_V1','state':'CONFIRMED_EXISTING_OAUTH'if r.returncode==0 and datetime.fromisoformat(expiry.replace('Z','+00:00')).timestamp()>time.time()+300 else'FAILED_NO_AUTO_RETRY','authority_main':a['authority_main'],'completed_ts':int(time.time()*1000),'CLI_invocations':1,'exit_code':r.returncode,'existing_OAuth_expiry':expiry,'physical_OAuth_admin_HTTP':'UNKNOWN_NONZERO_RETAINED','new_login_key_scope':False,'market_HTTP':0,'native_SQL':0,'Telegram':0}
Path(a['proof_file']).write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps(proof));assert proof['state']=='CONFIRMED_EXISTING_OAUTH'
