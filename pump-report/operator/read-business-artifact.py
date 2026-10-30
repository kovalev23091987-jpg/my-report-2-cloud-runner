"""Fresh read-only exact-code/flags witness; no SQL/provider/delivery calls."""
import email
import email.policy
import hashlib
import json
import re
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

root = Path(__file__).resolve().parents[2]
checkpoint = root / 'checkpoints/pump-report-20261025'
program = json.loads((checkpoint / 'ROOT_BUSINESS_SCHEDULE_ADMISSION.json').read_text())
artifact_bytes = Path(program['private_artifact_file']).read_bytes()
assert hashlib.sha256(artifact_bytes).hexdigest() == program['artifact_sha256']
artifact = json.loads(artifact_bytes)
config = Path('/Users/mac/Library/Preferences/.wrangler/config/default.toml').read_text()
token = re.search(r'^oauth_token\s*=\s*"([^"]+)"', config, re.M).group(1)
base = 'https://api.cloudflare.com/client/v4/accounts/70ee0af85191ea470e74c7383fdec772/workers/scripts/my-report-2-hub'

def get(suffix):
    try:
        with urllib.request.urlopen(urllib.request.Request(base + suffix, headers={'Authorization': 'Bearer ' + token}), timeout=45) as response:
            return dict(response.headers), response.read()
    except urllib.error.HTTPError as error:
        raise RuntimeError('CF_READ_HTTP_' + str(error.code)) from None

headers, data = get('')
content_type = next(v for k, v in headers.items() if k.lower() == 'content-type')
message = email.message_from_bytes(('Content-Type: ' + content_type + '\r\nMIME-Version: 1.0\r\n\r\n').encode() + data, policy=email.policy.default)
assert message.is_multipart()
modules = {}
for part in message.iter_parts():
    name = part.get_param('name', header='content-disposition') or part.get_filename()
    assert name not in modules
    modules[name] = part.get_payload(decode=True)
assert set(modules) == set(artifact['modules']) and all(modules[n] == text.encode() for n, text in artifact['modules'].items())
_, data = get('/settings')
settings = json.loads(data)
assert settings.get('success') is True
bindings = settings['result']['bindings']
assert len(bindings) == 21
flags = {b['name']: b.get('text') for b in bindings if b['name'] in ['PUMP_REPORT_ENABLED', 'PUMP_REPORT_DELIVERY_ENABLED']}
assert flags == {'PUMP_REPORT_ENABLED': '1', 'PUMP_REPORT_DELIVERY_ENABLED': '1'}
_, data = get('/schedules')
schedules = json.loads(data)
assert schedules.get('success') is True and [r['cron'] for r in schedules['result']['schedules']] == ['*/5 7-16 * * *']
script = "const r=await fetch('https://my-report-2-hub.kovalev23091987.workers.dev/pump/health',{redirect:'manual',signal:AbortSignal.timeout(30000)});if(r.status!==200)throw Error('HEALTH_HTTP');process.stdout.write(JSON.stringify(await r.json()));"
response = subprocess.run(['node', '--input-type=module', '-e', script], capture_output=True, text=True, timeout=35)
assert response.returncode == 0
health = json.loads(response.stdout)
assert health['implementation_sha256'] == artifact['manifest']['implementation_pin']['sha256'] and health['automatic_enabled'] and health['delivery_enabled']
proof = {'schema': 'ROOT_PRODUCTION_EXACT_DEPLOYMENT_READBACK_V1', 'readback_ts': int(time.time() * 1000),
         'artifact_sha256': hashlib.sha256(artifact_bytes).hexdigest(), 'implementation_sha256': health['implementation_sha256'],
         'module_count': len(modules), 'FULL_exact_module_bytes': True, 'health': health,
         'bindings_count': 21, 'new_business_cron': '*/5 7-16 * * *', 'provider_SQL_Telegram': 0,
         'read_only_admin_HTTP': 4, 'no_configuration_change': True}
(checkpoint / 'ROOT_LIVE65_MANUAL_READBACK.json').write_text(json.dumps(proof, indent=2) + '\n')
print(json.dumps(proof))
