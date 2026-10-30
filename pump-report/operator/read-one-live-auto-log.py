"""One bounded ephemeral existing-Worker log reader; never a market/SQL caller."""
import os,sys,json,time,hashlib,subprocess,signal,selectors
from pathlib import Path
a=json.loads(Path(sys.argv[1]).read_text());now=int(time.time()*1000)
own=json.loads(Path('checkpoints/CLOUD_PHASE_STATE_20261004.json').read_text())['lease']
assert a['status']=='ADMITTED_NOT_SPENT' and a['CLI_invocations']==1 and now<a['expires_ts']<=own['expires_ts'] and a['own_lease']['owner']==own['owner'] and not own.get('released')
assert now>=a.get('execute_not_before_ts',0) and now+a['duration_seconds']*1000+15000<=a['expires_ts']
assert a['duration_seconds']<=480 and a['raw_bytes_max']==2097152 and a['worker']=='my-report-2-hub'
assert hashlib.sha256(Path(a['wrangler_path']).read_bytes()).hexdigest()==a['wrangler_sha256']
fd=os.open(a['private_raw'],os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
raw=os.fdopen(fd,'wb');events=[];total=0;buffer='';decoder=json.JSONDecoder();stop='DEADLINE'
env=dict(os.environ,CI='1',WRANGLER_SEND_METRICS='false',CLOUDFLARE_ACCOUNT_ID='70ee0af85191ea470e74c7383fdec772')
p=subprocess.Popen([a['node_path'],a['wrangler_path'],'tail',a['worker'],'--format','json','--search','PUMP_'],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,env=env,start_new_session=True)
sel=selectors.DefaultSelector();sel.register(p.stdout,selectors.EVENT_READ);deadline=time.monotonic()+a['duration_seconds']
try:
 while time.monotonic()<deadline and len(events)<6:
  ready=sel.select(timeout=min(1,max(0,deadline-time.monotonic())))
  if not ready:
   if p.poll() is not None:stop='CLI_ENDED';break
   continue
  b=os.read(p.stdout.fileno(),8192)
  if not b:stop='CLI_ENDED';break
  total+=len(b)
  if total>a['raw_bytes_max']:stop='BYTE_BOUND';break
  raw.write(b);raw.flush();buffer+=b.decode('utf8',errors='replace')
  while buffer:
   start=buffer.find('{')
   if start<0:buffer=buffer[-1024:];break
   buffer=buffer[start:]
   try:v,end=decoder.raw_decode(buffer)
   except json.JSONDecodeError:break
   buffer=buffer[end:].lstrip()
   if not isinstance(v,dict):continue
   for log in v.get('logs',[]):
    msg=log.get('message',[])
    if len(msg)<2 or msg[0] not in ['PUMP_AUTO_SUMMARY','PUMP_RUN_STATUS']:continue
    try:s=json.loads(msg[1]) if isinstance(msg[1],str) else msg[1]
    except (json.JSONDecodeError,TypeError):continue
    if not isinstance(s,dict):continue
    if msg[0]=='PUMP_AUTO_SUMMARY':
     safe={k:s.get(k) for k in ['schema','mode','run_id','implementation_pin','status','discovery_result','counts','candidate_diagnostics','candidate_failures','phase_flags','reason_codes','delivery']}
    else:safe={k:s.get(k) for k in ['run_id','error','usage']}
    events.append({'kind':msg[0],'event_timestamp':v.get('eventTimestamp'),'log_timestamp':log.get('timestamp'),'worker_outcome':v.get('outcome'),'summary':safe})
  if len(buffer)>524288:stop='BUFFER_BOUND';break
 if len(events)>=6:stop='EVENT_BOUND'
finally:
 if p.poll() is None:
  os.killpg(p.pid,signal.SIGINT)
  try:p.wait(timeout=10)
  except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGTERM);p.wait(timeout=5)
 raw.close();sel.close()
proof={'schema':'ROOT_ONE_LIVE_WORKER_AUTO_LOG_ACTUAL_V1','authority_main':a['authority_main'],'started_ts':now,'completed_ts':int(time.time()*1000),'CLI_invocations':1,'worker':a['worker'],'state':'CAPTURED_PROJECTED_LOGS' if events else 'NO_PROJECTED_EVENT_IN_BOUNDED_SESSION','stop':stop,'CLI_exit_code':p.returncode,'raw_bytes':total,'raw_sha256':hashlib.sha256(Path(a['private_raw']).read_bytes()).hexdigest(),'events':events,'worker_settings_or_cron_changed':False,'physical_CF_admin_HTTP':'UNKNOWN_NONZERO_RETAINED','CLI_internal_reconnect_bound':5,'native_SQL_by_reader':0,'market_HTTP_by_reader':0,'Telegram_by_reader':0,'logs_are_not_immutable_original_or_genuine_delivery_readback':True}
Path(a['proof_file']).write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'state':proof['state'],'events':len(events),'stop':stop,'raw_bytes':total,'proof_file':a['proof_file'],'SQL_market_TG':0}))
