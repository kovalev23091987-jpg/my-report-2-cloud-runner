"""Read-only administrative checks. No SQL, providers, delivery or changes."""
import hashlib
import json
import os
import re
import time
import urllib.error
import urllib.request
from pathlib import Path

config = Path('/Users/mac/Library/Preferences/.wrangler/config/default.toml').read_text()
token = re.search(r'^oauth_token\s*=\s*"([^"]+)"', config, re.M).group(1)
base = 'https://api.cloudflare.com/client/v4/accounts/70ee0af85191ea470e74c7383fdec772/'
paths = ['workers/scripts/my-report-2-hub/settings',
         'workers/scripts/my-report-2-hub/schedules',
         'workers/scripts/my-report-2-free-history/schedules',
         'workers/scripts/my-report-2-liq-forecast-history/schedules',
         'd1/database/057a2847-2cc4-4e52-8534-1be1596d21d5']
result = {'schema': 'ROOT_PRODUCTION_READONLY_PREFLIGHT_V1',
          'recorded_ts': int(time.time() * 1000), 'requests': []}
for route in paths:
    request = urllib.request.Request(base + route, headers={'Authorization': 'Bearer ' + token}, method='GET')
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            value = json.loads(response.read())
    except urllib.error.HTTPError as error:
        raise RuntimeError('CF_READ_HTTP_' + str(error.code)) from None
    if value.get('success') is not True:
        raise RuntimeError('CF_READ_NOT_SUCCESS')
    result['requests'].append({'path': route, 'response': value})
output = Path('/private/tmp/pump-production-readonly-preflight.json')
fd = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as handle:
    json.dump(result, handle)
    handle.flush()
    os.fsync(handle.fileno())
bindings = result['requests'][0]['response']['result']['bindings']
flags = {b['name']: b.get('text') for b in bindings
         if b['name'] in ['PUMP_REPORT_ENABLED', 'PUMP_REPORT_DELIVERY_ENABLED']}
print(json.dumps({'saved': str(output), 'sha256': hashlib.sha256(output.read_bytes()).hexdigest(),
                  'requests': len(paths), 'bindings': len(bindings), 'flags': flags,
                  'crons': [v['response']['result'] for v in result['requests'][1:4]],
                  'database_metadata': {k: v for k, v in result['requests'][4]['response']['result'].items()
                                        if k in ['uuid', 'name', 'file_size', 'num_tables', 'read_replication']}}))
