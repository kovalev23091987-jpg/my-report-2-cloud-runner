"""Activate only an admitted new report; old schedules and bindings persist."""
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
admission = json.loads((checkpoint / 'ROOT_BUSINESS_SCHEDULE_ADMISSION.json').read_text())
assert admission['schema'] == 'PUMP_BUSINESS_SCHEDULE_ADMISSION_V1'
assert admission['status'] == 'ADMITTED_NOT_SPENT'
assert int(time.time() * 1000) < admission['expires_ts'] <= admission['own_lease']['expires_ts']
assert admission['old_report_paused'] and admission['old_actions_not_reenabled']
assert admission['provider_whole_budget_native_runtime_admitted']
for proof in admission['required_proof_files']:
    data = (root / proof['path']).read_bytes()
    assert hashlib.sha256(data).hexdigest() == proof['sha256'], 'EXACT_ACCEPTANCE_PROOF_CHANGED'
artifact_bytes = Path(admission['private_artifact_file']).read_bytes()
assert hashlib.sha256(artifact_bytes).hexdigest() == admission['artifact_sha256']
artifact = json.loads(artifact_bytes)
assert artifact['manifest']['implementation_pin']['sha256'] == admission['implementation_sha256']
config = Path('/Users/mac/Library/Preferences/.wrangler/config/default.toml').read_text()
token = re.search(r'^oauth_token\s*=\s*"([^"]+)"', config, re.M).group(1)
base = 'https://api.cloudflare.com/client/v4/accounts/70ee0af85191ea470e74c7383fdec772/workers/scripts/'

def request(route, method='GET', data=None, content_type=None):
    headers = {'Authorization': 'Bearer ' + token}
    if content_type:
        headers['Content-Type'] = content_type
    try:
        with urllib.request.urlopen(urllib.request.Request(base + route, data=data, headers=headers, method=method), timeout=60) as response:
            return dict(response.headers), response.read()
    except urllib.error.HTTPError as error:
        raise RuntimeError('CF_CONFIG_HTTP_' + str(error.code)) from None

def get_json(route):
    _, data = request(route)
    value = json.loads(data)
    assert value.get('success') is True, 'CF_CONFIG_ACK_UNKNOWN'
    return value

def health():
    script = "const r=await fetch('https://my-report-2-hub.kovalev23091987.workers.dev/pump/health',{redirect:'manual',signal:AbortSignal.timeout(30000)});if(r.status!==200)throw Error('HEALTH_HTTP');process.stdout.write(JSON.stringify(await r.json()));"
    result = subprocess.run(['node', '--input-type=module', '-e', script], capture_output=True, text=True, timeout=35)
    assert result.returncode == 0, 'HEALTH_READBACK_FAILED'
    return json.loads(result.stdout)

before = get_json('my-report-2-hub/settings')['result']
before_health = health()
assert before_health['implementation_sha256'] == admission['implementation_sha256']
assert not before_health['automatic_enabled'] and not before_health['delivery_enabled']
old_names = ['my-report-2-free-history', 'my-report-2-liq-forecast-history']
assert all(not get_json(name + '/schedules')['result'].get('schedules') for name in old_names)
assert not get_json('my-report-2-hub/schedules')['result'].get('schedules')
assert len(before['bindings']) == 19
assert not any(b['name'] in ['PUMP_REPORT_ENABLED', 'PUMP_REPORT_DELIVERY_ENABLED'] for b in before['bindings'])
settings = {'bindings': [{'name': b['name'], 'type': 'inherit'} for b in before['bindings']] +
            [{'name': 'PUMP_REPORT_ENABLED', 'type': 'plain_text', 'text': '1'},
             {'name': 'PUMP_REPORT_DELIVERY_ENABLED', 'type': 'plain_text', 'text': '1'}]}
if before.get('annotations'):
    settings['annotations'] = {k: v for k, v in before['annotations'].items()
                               if k in ['workers/message', 'workers/tag']}
boundary = '----pump-business-settings-' + admission['implementation_sha256'][:16]
payload = ('--' + boundary + '\r\nContent-Disposition: form-data; name="settings"\r\nContent-Type: application/json\r\n\r\n' + json.dumps(settings) + '\r\n--' + boundary + '--\r\n').encode()
attempt = root / 'pump-report/.private/business-launch-config-attempt.json'
fd = os.open(attempt, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as handle:
    json.dump({'state': 'ATTEMPTED_NO_AUTO_RETRY', 'authority_main': sys.argv[1],
               'implementation_sha256': admission['implementation_sha256'], 'started_ts': int(time.time() * 1000)}, handle)
    handle.flush()
    os.fsync(handle.fileno())
_, changed = request('my-report-2-hub/settings', 'PATCH', payload, 'multipart/form-data; boundary=' + boundary)
assert json.loads(changed).get('success') is True, 'SETTINGS_CHANGE_ACK_UNKNOWN'
after = get_json('my-report-2-hub/settings')['result']
added = {'PUMP_REPORT_ENABLED', 'PUMP_REPORT_DELIVERY_ENABLED'}
assert sorted([b for b in after['bindings'] if b['name'] not in added], key=lambda b: b['name']) == sorted(before['bindings'], key=lambda b: b['name']), 'OLD_BINDINGS_CHANGED'
assert {b['name']: b.get('text') for b in after['bindings'] if b['name'] in added} == {name: '1' for name in added}
_, changed = request('my-report-2-hub/schedules', 'PUT', json.dumps([{'cron': '*/5 7-16 * * *'}]).encode(), 'application/json')
assert json.loads(changed).get('success') is True, 'NEW_CRON_ACK_UNKNOWN'
assert [x['cron'] for x in get_json('my-report-2-hub/schedules')['result']['schedules']] == ['*/5 7-16 * * *']
assert all(not get_json(name + '/schedules')['result'].get('schedules') for name in old_names)
headers, downloaded = request('my-report-2-hub')
content_type = next(v for k, v in headers.items() if k.lower() == 'content-type')
message = email.message_from_bytes(('Content-Type: ' + content_type + '\r\nMIME-Version: 1.0\r\n\r\n').encode() + downloaded, policy=email.policy.default)
assert message.is_multipart(), 'EXACT_MODULE_READBACK_REQUIRED'
modules = {}
for part in message.iter_parts():
    name = part.get_param('name', header='content-disposition') or part.get_filename()
    assert name not in modules, 'DUPLICATE_MODULE'
    modules[name] = part.get_payload(decode=True)
assert set(modules) == set(artifact['modules']) and all(modules[n] == s.encode() for n, s in artifact['modules'].items()), 'EXACT_MODULE_BYTES_CHANGED'
status = health()
assert status['implementation_sha256'] == admission['implementation_sha256'] and status['automatic_enabled'] and status['delivery_enabled']
proof = {'schema': 'ROOT_NEW_REPORT_BUSINESS_CONFIGURATION_READBACK_V1', 'authority_main': sys.argv[1],
         'recorded_ts': int(time.time() * 1000), 'implementation_sha256': admission['implementation_sha256'],
         'health': status, 'old19bindings_preserved': True, 'new_bindings_count': len(after['bindings']),
         'FULL_exact_module_bytes': len(modules), 'only_new_report_cron': '*/5 7-16 * * *',
         'owner_window': '10:00–20:00 Europe/Moscow', 'old_other_worker_crons': [],
         'old_actions_not_reenabled': True, 'provider_HTTP_SQL_Telegram_by_config': 0,
         'genuine_same_card_SENT_proven_by_config': False}
(checkpoint / 'ROOT_NEW_REPORT_BUSINESS_CONFIGURATION_READBACK.json').write_text(json.dumps(proof, indent=2) + '\n')
print(json.dumps(proof))
