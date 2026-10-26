"""One admitted reversible AUTO flag change, exact code and bindings preserved."""
import email, email.policy, hashlib, json, os, re, subprocess, sys, time
import urllib.request, urllib.error
from pathlib import Path
root=Path(__file__).resolve().parents[2]
a=json.loads(Path(sys.argv[1]).read_text());now=int(time.time()*1000)
assert a['schema']=='PUMP_CANDIDATE_BANK_FLAG_MAINTENANCE_V1' and a['status']=='ADMITTED_NOT_SPENT'
assert a['maximum_attempts']==1 and now<a['expires_ts']<=a['own_lease']['expires_ts']
assert a['expires_ts']-a['admitted_ts']<=900000 and a['old_report_paused'] and a['market_HTTP']==a['native_SQL']==a['Telegram']==0
assert (a['from_auto'],a['to_auto']) in [(True,False),(False,True)]
artifact_bytes=Path(a['private_artifact_file']).read_bytes();artifact=json.loads(artifact_bytes)
assert hashlib.sha256(artifact_bytes).hexdigest()==a['artifact_sha256']
assert artifact['manifest']['implementation_pin']['sha256']==a['implementation_sha256']
config=Path('/Users/mac/Library/Preferences/.wrangler/config/default.toml').read_text()
token=re.search(r'^oauth_token\s*=\s*"([^\"]+)"',config,re.M).group(1)
expiry=re.search(r'^expiration_time\s*=\s*"([^\"]+)"',config,re.M).group(1)
from datetime import datetime
assert datetime.fromisoformat(expiry.replace('Z','+00:00')).timestamp()*1000>now+300000
attempt=Path(a['private_attempt']);fd=os.open(attempt,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as f:json.dump({'state':'ATTEMPTED_NO_RETRY','started_ts':now,'authority_main':a['authority_main']},f)
base='https://api.cloudflare.com/client/v4/accounts/70ee0af85191ea470e74c7383fdec772/workers/scripts/my-report-2-hub'
calls=0
proof={'schema':'PUMP_CANDIDATE_BANK_FLAG_READBACK_V1','authority_main':a['authority_main'],'started_ts':now,'state':'ATTEMPTED_NO_RETRY','provider_HTTP':0,'native_SQL':0,'Telegram':0}
def request(suffix,method='GET',body=None,content_type=None):
 global calls
 assert int(time.time()*1000)<a['expires_ts'] and calls<a['admin_HTTP_max']
 calls+=1;headers={'Authorization':'Bearer '+token}
 if content_type:headers['Content-Type']=content_type
 try:
  with urllib.request.urlopen(urllib.request.Request(base+suffix,data=body,headers=headers,method=method),timeout=40) as r:return dict(r.headers),r.read()
 except urllib.error.HTTPError as e:raise RuntimeError('CF_FLAG_HTTP_'+str(e.code))from None
def get(suffix):
 _,body=request(suffix);value=json.loads(body);assert value.get('success') is True;return value['result']
def health():
 global calls
 calls+=1;assert calls<=a['admin_HTTP_max']
 script="const r=await fetch('https://my-report-2-hub.kovalev23091987.workers.dev/pump/health',{redirect:'manual',signal:AbortSignal.timeout(20000)});if(r.status!==200)throw Error('HEALTH_HTTP');process.stdout.write(JSON.stringify(await r.json()));"
 r=subprocess.run(['node','--input-type=module','-e',script],capture_output=True,text=True,timeout=25);assert r.returncode==0;return json.loads(r.stdout)
try:
 before=get('/settings');assert len(before['bindings'])==21
 byname={b['name']:b for b in before['bindings']};assert len(byname)==21
 assert byname['PUMP_REPORT_ENABLED']=={'name':'PUMP_REPORT_ENABLED','type':'plain_text','text':'1' if a['from_auto'] else '0'}
 assert byname['PUMP_REPORT_DELIVERY_ENABLED']=={'name':'PUMP_REPORT_DELIVERY_ENABLED','type':'plain_text','text':'1'}
 initial=health();proof['initial_health_observed']=initial;assert initial['implementation_sha256']==a['implementation_sha256'] and initial['automatic_enabled']==a['from_auto'] and initial['delivery_enabled']
 schedules=get('/schedules');assert [s['cron']for s in schedules['schedules']]==['*/5 7-16 * * *']
 settings={'bindings':[{'name':b['name'],'type':'inherit'}if b['name']!='PUMP_REPORT_ENABLED'else{'name':'PUMP_REPORT_ENABLED','type':'plain_text','text':'1'if a['to_auto']else'0'}for b in before['bindings']]}
 if before.get('annotations'):settings['annotations']={k:v for k,v in before['annotations'].items()if k in ['workers/message','workers/tag']}
 boundary='----pump-bank-flags-'+str(now)
 body=('--'+boundary+'\r\nContent-Disposition: form-data; name="settings"\r\nContent-Type: application/json\r\n\r\n'+json.dumps(settings)+'\r\n--'+boundary+'--\r\n').encode()
 _,reply=request('/settings','PATCH',body,'multipart/form-data; boundary='+boundary);assert json.loads(reply).get('success')is True
 proof['flag_change_acknowledged']=True
 after=get('/settings');aftermap={b['name']:b for b in after['bindings']};assert set(aftermap)==set(byname)
 assert {k:v for k,v in aftermap.items()if k!='PUMP_REPORT_ENABLED'}=={k:v for k,v in byname.items()if k!='PUMP_REPORT_ENABLED'}
 assert aftermap['PUMP_REPORT_ENABLED']=={'name':'PUMP_REPORT_ENABLED','type':'plain_text','text':'1'if a['to_auto']else'0'}
 headers,body=request('');ctype=next(v for k,v in headers.items()if k.lower()=='content-type')
 msg=email.message_from_bytes(('Content-Type: '+ctype+'\r\nMIME-Version: 1.0\r\n\r\n').encode()+body,policy=email.policy.default);assert msg.is_multipart()
 modules={}
 for part in msg.iter_parts():
  name=part.get_param('name',header='content-disposition')or part.get_filename();assert name not in modules;modules[name]=part.get_payload(decode=True)
 assert set(modules)==set(artifact['modules'])and all(modules[n]==s.encode()for n,s in artifact['modules'].items())
 proof.update(FULL_exact_module_bytes=True,module_count=len(modules),source_readback_ts=int(time.time()*1000),bindings_count=21,other20bindings_exact=True)
 final=health();proof['last_health_observed']=final;assert final['implementation_sha256']==a['implementation_sha256']and final['automatic_enabled']==a['to_auto']and final['delivery_enabled'],'HEALTH_PIN_OR_FLAGS_READBACK_MISMATCH'
 proof.update(state='CONFIRMED_FULL',readback_ts=int(time.time()*1000),artifact_sha256=a['artifact_sha256'],implementation_sha256=a['implementation_sha256'],FULL_exact_module_bytes=True,module_count=len(modules),bindings_count=21,other20bindings_exact=True,new_business_cron='*/5 7-16 * * *',health=final)
except Exception as error:
 proof['error']=str(error)[:180];raise
finally:
 proof.update(completed_ts=int(time.time()*1000),admin_HTTP_attempted=calls,no_auto_retry=True)
 Path(a['proof_file']).write_text(json.dumps(proof,indent=2)+'\n')
 print(json.dumps(proof))
