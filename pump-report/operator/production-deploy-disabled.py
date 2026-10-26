"""Install one admitted exact artifact; preserve settings and all old pauses."""
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
from pathlib import Path

root = Path(__file__).resolve().parents[2]
checkpoint = root / 'checkpoints/pump-report-20261025'
options = sys.argv[2:]
def option(name, default):
    return options[options.index(name) + 1] if name in options else default
admission_file = Path(option('--admission', str(checkpoint / 'ROOT_PRODUCTION_LAUNCH_ADMISSION.json')))
artifact_file = Path(option('--artifact', '/private/tmp/pump-production-launch-prepared-artifact.json'))
attempt_file = Path(option('--attempt', str(root / 'pump-report/.private/production-cf-deploy-attempt.json')))
proof_file = Path(option('--proof', str(checkpoint / 'ROOT_PRODUCTION_EXACT_DEPLOYMENT_READBACK.json')))
admission = json.loads(admission_file.read_text())
artifact_bytes = artifact_file.read_bytes()
artifact = json.loads(artifact_bytes)
now = int(time.time() * 1000)
expected_flags = admission['deployment'].get('expected_flags', {'automatic_enabled': False, 'delivery_enabled': False})
expected_binding_count = admission['deployment'].get('bindings_count', 19)
preserved_hub_cron = admission['deployment'].get('preserved_hub_cron')
if expected_flags['automatic_enabled']:
    assert not 7 <= time.gmtime().tm_hour < 17, 'LIVE_CODE_UPDATE_OUTSIDE_AUTOMATIC_WINDOW_REQUIRED'
assert admission['schema'] == 'PUMP_PRODUCTION_LAUNCH_ADMISSION_V1'
assert admission['status'] == 'ADMITTED_NOT_SPENT' and admission['deployment']['max_attempts'] == 1
assert now < admission['expires_ts'] <= admission['own_lease']['expires_ts']
assert hashlib.sha256(artifact_bytes).hexdigest() == admission['artifact_sha256']
assert artifact['manifest']['implementation_pin']['sha256'] == admission['implementation_sha256']
assert "PROVIDER_STAGE = 'PRODUCTION_QUALIFIED'" in artifact['modules']['runtime/provider-policy.mjs']
config = Path('/Users/mac/Library/Preferences/.wrangler/config/default.toml').read_text()
token = re.search(r'^oauth_token\s*=\s*"([^"]+)"', config, re.M).group(1)
base = 'https://api.cloudflare.com/client/v4/accounts/70ee0af85191ea470e74c7383fdec772/workers/scripts/'

def request(route, method='GET', data=None, content_type=None):
    headers = {'Authorization': 'Bearer ' + token}
    if content_type:
        headers['Content-Type'] = content_type
    req = urllib.request.Request(base + route, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=90) as response:
            return dict(response.headers), response.read()
    except urllib.error.HTTPError as error:
        raise RuntimeError('CF_HTTP_' + str(error.code)) from None

def get_json(route):
    _, body = request(route)
    value = json.loads(body)
    assert value.get('success') is True, 'CF_ACK_NOT_SUCCESS'
    return value

def health():
    script = "const r=await fetch('https://my-report-2-hub.kovalev23091987.workers.dev/pump/health',{redirect:'manual',signal:AbortSignal.timeout(30000)});if(r.status!==200)throw Error('HEALTH_HTTP');process.stdout.write(JSON.stringify(await r.json()));"
    result = subprocess.run(['node', '--input-type=module', '-e', script], capture_output=True, text=True, timeout=35)
    assert result.returncode == 0, 'NODE_HEALTH_READ_FAILED'
    return json.loads(result.stdout)

before = get_json('my-report-2-hub/settings')
before_health = health()
assert before_health['implementation_sha256'] == admission['deployment']['previous_pin']
assert before_health['automatic_enabled'] == expected_flags['automatic_enabled'] and before_health['delivery_enabled'] == expected_flags['delivery_enabled']
names = ['my-report-2-hub', 'my-report-2-free-history', 'my-report-2-liq-forecast-history']
crons = {name: get_json(name + '/schedules') for name in names}
assert all(not crons[name]['result'].get('schedules') for name in names if name != 'my-report-2-hub')
assert [r['cron'] for r in crons['my-report-2-hub']['result'].get('schedules', [])] == ([preserved_hub_cron] if preserved_hub_cron else [])
assert len(before['result']['bindings']) == expected_binding_count
boundary = '----pump-production-' + admission['artifact_sha256'][:24]
parts = []

def append_part(name, content_type, body):
    parts.extend([('--' + boundary + '\r\nContent-Disposition: form-data; name="' + name + '"; filename="' + name + '"\r\nContent-Type: ' + content_type + '\r\n\r\n').encode(), body, b'\r\n'])

append_part('metadata', 'application/json', json.dumps({'main_module': artifact['metadata']['main_module']}).encode())
for name, source in artifact['modules'].items():
    append_part(name, 'application/javascript+module', source.encode())
parts.append(('--' + boundary + '--\r\n').encode())
attempt = attempt_file
fd = os.open(attempt, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as handle:
    json.dump({'state': 'ATTEMPTED_NO_AUTO_RETRY', 'artifact_sha256': admission['artifact_sha256'],
               'authority_main': sys.argv[1], 'started_ts': int(time.time() * 1000)}, handle)
    handle.flush()
    os.fsync(handle.fileno())
_, receipt_bytes = request('my-report-2-hub/content', 'PUT', b''.join(parts), 'multipart/form-data; boundary=' + boundary)
receipt = json.loads(receipt_bytes)
assert receipt.get('success') is True, 'DEPLOYMENT_NOT_CONFIRMED'
headers, downloaded = request('my-report-2-hub')
content_type = next(v for k, v in headers.items() if k.lower() == 'content-type')
message = email.message_from_bytes(('Content-Type: ' + content_type + '\r\nMIME-Version: 1.0\r\n\r\n').encode() + downloaded, policy=email.policy.default)
assert message.is_multipart(), 'MULTIPART_READBACK_REQUIRED'
modules = {}
for part in message.iter_parts():
    name = part.get_param('name', header='content-disposition') or part.get_filename()
    assert name not in modules, 'DUPLICATE_MODULE'
    modules[name] = part.get_payload(decode=True)
assert set(modules) == set(artifact['modules']), 'MODULE_SET_CHANGED'
assert all(modules[name] == source.encode() for name, source in artifact['modules'].items()), 'MODULE_BYTES_CHANGED'
after = get_json('my-report-2-hub/settings')
assert before['result'] == after['result'], 'SETTINGS_CHANGED'
assert crons == {name: get_json(name + '/schedules') for name in names}, 'OLD_CRONS_CHANGED'
after_health = health()
assert after_health['implementation_sha256'] == admission['implementation_sha256']
assert after_health['provider_stage'] == 'PRODUCTION_QUALIFIED'
assert after_health['automatic_enabled'] == expected_flags['automatic_enabled'] and after_health['delivery_enabled'] == expected_flags['delivery_enabled']
proof = {'schema': 'ROOT_PRODUCTION_EXACT_DEPLOYMENT_READBACK_V1', 'authority_main': sys.argv[1],
         'readback_ts': int(time.time() * 1000), 'artifact_sha256': admission['artifact_sha256'],
         'implementation_sha256': admission['implementation_sha256'], 'module_count': len(modules),
         'FULL_exact_module_bytes': True, 'config_unchanged': True, 'health': after_health,
         'bindings_count': len(after['result']['bindings']), 'all3_schedules': {name: [r['cron'] for r in crons[name]['result'].get('schedules', [])] for name in names},
         'deployment': receipt['result'], 'provider_HTTP': 0, 'native_SQL': 0, 'Telegram': 0}
proof_file.write_text(json.dumps(proof, indent=2) + '\n')
print(json.dumps(proof))
