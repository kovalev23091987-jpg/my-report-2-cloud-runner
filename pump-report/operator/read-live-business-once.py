"""One admitted readonly artifact/config/schedule/health witness; no market or SQL."""
import email
import email.policy
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

root = Path(__file__).resolve().parents[2]
admission_path, attempt_path, proof_path = map(Path, sys.argv[1:4])
a = json.loads(admission_path.read_text())
now = int(time.time() * 1000)
assert a['status'] == 'ADMITTED_NOT_SPENT' and a['maximum_attempts'] == 1
assert a['schema'] == 'ROOT_READ_LIVE_BUSINESS_ONCE_ADMISSION_V1'
assert now < a['expires_ts'] <= a['own_lease']['expires_ts']
assert a['max_admin_HTTP'] == 6 and a['market_HTTP'] == a['native_SQL'] == a['Telegram'] == 0
assert hashlib.sha256(Path(__file__).read_bytes()).hexdigest() == a['operator_sha256']
program = json.loads((root / 'checkpoints/pump-report-20261025/ROOT_BUSINESS_SCHEDULE_ADMISSION.json').read_text())
artifact_bytes = Path(program['private_artifact_file']).read_bytes()
assert hashlib.sha256(artifact_bytes).hexdigest() == a['artifact_sha256'] == program['artifact_sha256']
artifact = json.loads(artifact_bytes)
assert artifact['manifest']['implementation_pin']['sha256'] == a['implementation_sha256']
credential = Path('/Users/mac/Library/Preferences/.wrangler/config/default.toml').read_text()
token = re.search(r'^oauth_token\s*=\s*"([^"]+)"', credential, re.M).group(1)
expiration = re.search(r'^expiration_time\s*=\s*"([^"]+)"', credential, re.M).group(1)
assert datetime.fromisoformat(expiration.replace('Z', '+00:00')).timestamp() > time.time() + 300
assert not proof_path.exists(), 'EXISTING_PROOF_NO_RETRY'
attempt_path.parent.mkdir(parents=True, exist_ok=True)
fd = os.open(attempt_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as handle:
    json.dump({'state': 'ATTEMPTED_NO_AUTO_RETRY', 'started_ts': now,
               'admission_sha256': hashlib.sha256(admission_path.read_bytes()).hexdigest()}, handle)
    handle.flush()
    os.fsync(handle.fileno())
calls = 0
base = 'https://api.cloudflare.com/client/v4/accounts/70ee0af85191ea470e74c7383fdec772/workers/scripts/'

def get(suffix):
    global calls
    assert int(time.time() * 1000) < a['expires_ts'] and calls < 5
    calls += 1
    try:
        with urllib.request.urlopen(urllib.request.Request(base + suffix, headers={'Authorization': 'Bearer ' + token}), timeout=45) as response:
            return dict(response.headers), response.read()
    except urllib.error.HTTPError as error:
        raise RuntimeError('CF_READ_HTTP_' + str(error.code)) from None

headers, data = get('my-report-2-hub')
content_type = next(v for k, v in headers.items() if k.lower() == 'content-type')
message = email.message_from_bytes(('Content-Type: ' + content_type + '\r\nMIME-Version: 1.0\r\n\r\n').encode() + data, policy=email.policy.default)
assert message.is_multipart()
modules = {}
for part in message.iter_parts():
    name = part.get_param('name', header='content-disposition') or part.get_filename()
    assert name not in modules
    modules[name] = part.get_payload(decode=True)
assert set(modules) == set(artifact['modules'])
assert all(modules[name] == value.encode() for name, value in artifact['modules'].items())
_, data = get('my-report-2-hub/settings')
settings = json.loads(data)
assert settings.get('success') is True
bindings = settings['result']['bindings']
assert len(bindings) == 21
flags = {b['name']: b.get('text') for b in bindings if b['name'] in ['PUMP_REPORT_ENABLED', 'PUMP_REPORT_DELIVERY_ENABLED']}
assert flags == {'PUMP_REPORT_ENABLED': '1', 'PUMP_REPORT_DELIVERY_ENABLED': '1'}
crons = {}
for name in ['my-report-2-hub', 'my-report-2-free-history', 'my-report-2-liq-forecast-history']:
    _, data = get(name + '/schedules')
    result = json.loads(data)
    assert result.get('success') is True
    crons[name] = [r['cron'] for r in result['result']['schedules']]
assert crons == {'my-report-2-hub': ['*/5 7-16 * * *'], 'my-report-2-free-history': [], 'my-report-2-liq-forecast-history': []}
assert int(time.time() * 1000) < a['expires_ts']
script = "const r=await fetch('https://my-report-2-hub.kovalev23091987.workers.dev/pump/health',{redirect:'manual',signal:AbortSignal.timeout(30000)});if(r.status!==200)throw Error('HEALTH_HTTP');process.stdout.write(JSON.stringify(await r.json()));"
calls += 1
response = subprocess.run([a['node_executable'], '--input-type=module', '-e', script], capture_output=True, text=True, timeout=35)
assert response.returncode == 0, 'HEALTH_READ_FAILED'
health = json.loads(response.stdout)
assert health['implementation_sha256'] == a['implementation_sha256']
assert health['automatic_enabled'] and health['delivery_enabled'] and health['provider_stage'] == 'PRODUCTION_QUALIFIED'
proof = {'schema': 'ROOT_PRODUCTION_EXACT_DEPLOYMENT_READBACK_V1', 'authority_main': a['authority_main'],
         'readback_ts': int(time.time() * 1000), 'artifact_sha256': a['artifact_sha256'],
         'implementation_sha256': a['implementation_sha256'], 'module_count': len(modules),
         'FULL_exact_module_bytes': True, 'health': health, 'bindings_count': 21, 'all3_schedules': crons,
         'read_only_admin_HTTP': calls, 'health_Worker_invocations': 1, 'market_HTTP': 0, 'native_SQL': 0,
         'Telegram': 0, 'no_configuration_change': True}
with proof_path.open('x') as handle:
    json.dump(proof, handle, indent=2)
    handle.write('\n')
print(json.dumps(proof))
