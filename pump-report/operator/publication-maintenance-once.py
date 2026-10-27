"""One admitted flag/content operation, exact code/bindings/all cron readback.

Control-plane evidence is explicit; this never invents a public health response.
"""
import email, email.policy, hashlib, json, os, re, sys, time
import urllib.request, urllib.error
from datetime import datetime
from pathlib import Path
a=json.loads(Path(sys.argv[1]).read_text());now=int(time.time()*1000)
assert a['schema']=='PUMP_PUBLICATION_MAINTENANCE_ADMISSION_V1' and a['status']=='ADMITTED_NOT_SPENT'
assert a['maximum_attempts']==1 and now<a['expires_ts']<=a['own_lease']['expires_ts']
assert a['expires_ts']-a['issued_ts']<=900000 and a['market_HTTP']==a['native_SQL']==a['Telegram']==0
assert a['action'] in ['PAUSE_AUTO','INSTALL','RESUME_AUTO'] and a['admin_HTTP_max']==11
assert hashlib.sha256(Path(__file__).read_bytes()).hexdigest()==a['operator_sha256']
def artifact(path,expected):
 b=Path(path).read_bytes();assert hashlib.sha256(b).hexdigest()==expected;v=json.loads(b)
 assert v['manifest']['module_count']==72;return v
before_artifact=artifact(a['before_artifact_file'],a['before_artifact_sha256'])
after_artifact=artifact(a['after_artifact_file'],a['after_artifact_sha256'])
assert before_artifact['manifest']['implementation_pin']['sha256']==a['before_pin']
assert after_artifact['manifest']['implementation_pin']['sha256']==a['after_pin']
from_auto=a['action']=='PAUSE_AUTO';to_auto=a['action']=='RESUME_AUTO'
if a['action']!='INSTALL':assert a['before_artifact_sha256']==a['after_artifact_sha256']
else:
 b=Path(a['quiescence_file']).read_bytes();assert hashlib.sha256(b).hexdigest()==a['quiescence_sha256'];q=json.loads(b)
 assert q['state']=='FINALIZED' and q['observation']['status']=='QUIESCENT_CODE_UPDATE_ALLOWED' and not q['observation']['executor'].get('owner')
 assert now-q['observation']['observed_ts']<=300000 and q['implementation_sha256']==a['before_pin']
config=Path('/Users/mac/Library/Preferences/.wrangler/config/default.toml').read_text()
token=re.search(r'^oauth_token\s*=\s*"([^\"]+)"',config,re.M).group(1)
expiry=re.search(r'^expiration_time\s*=\s*"([^\"]+)"',config,re.M).group(1)
assert datetime.fromisoformat(expiry.replace('Z','+00:00')).timestamp()*1000>now+300000
fd=os.open(a['private_attempt'],os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w')as f:json.dump({'started_ts':now,'authority_main':a['authority_main'],'action':a['action'],'state':'ATTEMPTED_NO_RETRY'},f)
base='https://api.cloudflare.com/client/v4/accounts/70ee0af85191ea470e74c7383fdec772/workers/scripts/'
calls=0;proof={'schema':'ROOT_PRODUCTION_CONTROL_PLANE_READBACK_V1','authority_main':a['authority_main'],'action':a['action'],'state':'ATTEMPTED_NO_RETRY','started_ts':now,'market_HTTP':0,'native_SQL':0,'Telegram':0,'public_health_attempted':False}
def request(route,method='GET',body=None,ctype=None):
 global calls
 lease=json.loads(Path('checkpoints/CLOUD_PHASE_STATE_20261004.json').read_text())['lease']
 assert int(time.time()*1000)<a['expires_ts'] and lease['owner']==a['own_lease']['owner'] and not lease.get('released') and calls<11
 calls+=1;headers={'Authorization':'Bearer '+token}
 if ctype:headers['Content-Type']=ctype
 try:
  with urllib.request.urlopen(urllib.request.Request(base+route,data=body,headers=headers,method=method),timeout=40)as r:return dict(r.headers),r.read()
 except urllib.error.HTTPError as e:raise RuntimeError('CF_MAINTENANCE_HTTP_'+str(e.code))from None
def get(route):
 _,b=request(route);v=json.loads(b);assert v.get('success')is True;return v['result']
def readback(expected,auto):
 headers,b=request('my-report-2-hub');ctype=next(v for k,v in headers.items()if k.lower()=='content-type')
 msg=email.message_from_bytes(('Content-Type: '+ctype+'\r\nMIME-Version: 1.0\r\n\r\n').encode()+b,policy=email.policy.default);assert msg.is_multipart()
 modules={}
 for p in msg.iter_parts():
  name=p.get_param('name',header='content-disposition')or p.get_filename();assert name not in modules;modules[name]=p.get_payload(decode=True)
 assert set(modules)==set(expected['modules'])and all(modules[n]==s.encode()for n,s in expected['modules'].items())
 settings=get('my-report-2-hub/settings');bindings={b['name']:b for b in settings['bindings']};assert len(bindings)==len(settings['bindings'])==21
 assert bindings['PUMP_REPORT_ENABLED']=={'name':'PUMP_REPORT_ENABLED','type':'plain_text','text':'1'if auto else'0'}
 assert bindings['PUMP_REPORT_DELIVERY_ENABLED']=={'name':'PUMP_REPORT_DELIVERY_ENABLED','type':'plain_text','text':'1'}
 assert bindings['DATA_DB']['id']=='057a2847-2cc4-4e52-8534-1be1596d21d5'
 names=['my-report-2-hub','my-report-2-free-history','my-report-2-liq-forecast-history']
 crons={n:[s['cron']for s in get(n+'/schedules')['schedules']]for n in names}
 assert crons==dict(zip(names,[['*/5 7-16 * * *'],[],[]]))
 return settings,bindings,crons
try:
 before,bindings,crons=readback(before_artifact,from_auto)
 boundary='----pump-publication-'+str(now)
 if a['action']=='INSTALL':
  parts=[]
  def part(name,ctype,b):parts.extend([('--'+boundary+'\r\nContent-Disposition: form-data; name="'+name+'"; filename="'+name+'"\r\nContent-Type: '+ctype+'\r\n\r\n').encode(),b,b'\r\n'])
  part('metadata','application/json',json.dumps({'main_module':after_artifact['metadata']['main_module']}).encode())
  for name,s in after_artifact['modules'].items():part(name,'application/javascript+module',s.encode())
  parts.append(('--'+boundary+'--\r\n').encode());route='my-report-2-hub/content';method='PUT';body=b''.join(parts)
 else:
  settings={'bindings':[{'name':b['name'],'type':'inherit'}if b['name']!='PUMP_REPORT_ENABLED'else{'name':b['name'],'type':'plain_text','text':'1'if to_auto else'0'}for b in before['bindings']]}
  if before.get('annotations'):settings['annotations']={k:v for k,v in before['annotations'].items()if k in ['workers/message','workers/tag']}
  body=('--'+boundary+'\r\nContent-Disposition: form-data; name="settings"\r\nContent-Type: application/json\r\n\r\n'+json.dumps(settings)+'\r\n--'+boundary+'--\r\n').encode();route='my-report-2-hub/settings';method='PATCH'
 _,b=request(route,method,body,'multipart/form-data; boundary='+boundary);assert json.loads(b).get('success')is True;proof['mutation_acknowledged']=True
 after,after_bindings,after_crons=readback(after_artifact,to_auto)
 if a['action']=='INSTALL':assert before==after
 else:
  assert {k:v for k,v in bindings.items()if k!='PUMP_REPORT_ENABLED'}=={k:v for k,v in after_bindings.items()if k!='PUMP_REPORT_ENABLED'}
  assert {k:v for k,v in before.items()if k not in ['bindings','annotations']}=={k:v for k,v in after.items()if k not in ['bindings','annotations']}
 assert crons==after_crons
 proof.update(state='CONFIRMED_FULL',readback_ts=int(time.time()*1000),artifact_sha256=a['after_artifact_sha256'],implementation_sha256=a['after_pin'],module_count=72,FULL_exact_module_bytes=True,bindings_count=21,all3_schedules=after_crons,other20bindings_exact=True,control_plane={'automatic_enabled':to_auto,'delivery_enabled':True,'provider_stage':'PRODUCTION_QUALIFIED','DATA_DB_id':'057a2847-2cc4-4e52-8534-1be1596d21d5','basis':'Actual exact72 code and live Cloudflare settings; not a public health response'})
except Exception as e:proof['error']=str(e)[:180];raise
finally:
 proof.update(completed_ts=int(time.time()*1000),read_only_and_mutation_admin_HTTP_attempted=calls,no_auto_retry=True)
 Path(a['proof_file']).write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps(proof))
