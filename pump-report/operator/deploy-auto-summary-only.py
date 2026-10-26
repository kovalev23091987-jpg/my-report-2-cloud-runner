"""One admitted pure-log update. No Worker invocation, pause, SQL or source IO."""
import email
import email.policy
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CHECKPOINT = ROOT / 'checkpoints/pump-report-20261025'
BASE_SHA = '370d893f7c53ec8cf1e44a5c84bcb99572de24d9a91907734429160f97862e0c'
NEW_SHA = 'aee90f2b5cd0d240f949dd896dc7a5cad1485fb10a6a3447dac503f7f3e31a06'
SUMMARY_SHA = 'cac9e9e6784a4becc991c0f7a78e82b4e3f7b3c1242438523475a54da0c92762'

def sha(value):
    return hashlib.sha256(value).hexdigest()

def validate_log_only(base_bytes, new_bytes):
    assert sha(base_bytes) == BASE_SHA, 'EXACT_LIVE_BG_BASE_REQUIRED'
    assert sha(new_bytes) == NEW_SHA, 'EXACT_ONE_CASE_VERIFIED_ARTIFACT_REQUIRED'
    base, new = json.loads(base_bytes), json.loads(new_bytes)
    old, modules = base['modules'], new['modules']
    assert len(old) == 68 and len(modules) == 69
    assert set(modules) - set(old) == {'runtime/automatic-summary.mjs'}
    assert not set(old) - set(modules)
    anchor = "import {IMPLEMENTATION_PIN} from './implementation-pin.mjs';"
    needle = "await runtime.runner.execute({mode:'AUTO',run_id,publish:true});finalizationStarted=true;await finalizeNativeRun(runtime.native);"
    original = old['runtime/worker.mjs']
    assert original.count(anchor) == 1 and original.count(needle) == 1
    expected = original.replace(anchor, anchor + "\nimport {autoRunSummary} from './automatic-summary.mjs';", 1)
    expected = expected.replace(needle, "const result=await runtime.runner.execute({mode:'AUTO',run_id,publish:true});finalizationStarted=true;await finalizeNativeRun(runtime.native);try{console.log('PUMP_AUTO_SUMMARY',JSON.stringify(autoRunSummary(result,IMPLEMENTATION_PIN.sha256)));}catch{}", 1)
    assert modules['runtime/worker.mjs'] == expected, 'NON_LOG_WORKER_CHANGE'
    assert sha(modules['runtime/automatic-summary.mjs'].encode()) == SUMMARY_SHA
    permitted = {'runtime/worker.mjs', 'runtime/automatic-summary.mjs', 'runtime/implementation-pin.mjs'}
    assert {p for p in modules if modules[p] != old.get(p)} == permitted
    assert new['metadata'] == base['metadata']
    assert new['manifest']['implementation_pin']['sha256'] == 'd984187530314079e626b426bd2e356826369ba62d86224e840f5f752fa88daf'
    return base, new

def multipart_modules(headers, body):
    content_type = next(v for k, v in headers.items() if k.lower() == 'content-type')
    message = email.message_from_bytes(('Content-Type: ' + content_type + '\r\nMIME-Version: 1.0\r\n\r\n').encode() + body, policy=email.policy.default)
    assert message.is_multipart(), 'FULL_MODULE_READBACK_REQUIRED'
    result = {}
    for part in message.iter_parts():
        name = part.get_param('name', header='content-disposition') or part.get_filename()
        assert name not in result
        result[name] = part.get_payload(decode=True)
    return result

def main():
    ad = json.loads((CHECKPOINT / 'ROOT_AUTO_SUMMARY_LOG_ONLY_DEPLOY_ADMISSION.json').read_text())
    phase = json.loads((ROOT / 'checkpoints/CLOUD_PHASE_STATE_20261004.json').read_text())
    assert ad['status'] == 'ADMITTED_NOT_SPENT' and ad['max_attempts'] == 1
    assert int(time.time()*1000) < ad['expires_ts'] <= ad['own_lease']['expires_ts']
    assert phase['lease']['owner'] == ad['own_lease']['owner'] and not phase['lease'].get('released')
    assert sys.argv[1] == ad['authority_main']
    base, new = validate_log_only((ROOT / ad['base_artifact']).read_bytes(), (ROOT / ad['new_artifact']).read_bytes())
    config = Path('/Users/mac/Library/Preferences/.wrangler/config/default.toml').read_text()
    token = re.search(r'^oauth_token\s*=\s*"([^"]+)"', config, re.M).group(1)
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None
    opener = urllib.request.build_opener(NoRedirect)
    count = 0
    prefix = 'https://api.cloudflare.com/client/v4/accounts/70ee0af85191ea470e74c7383fdec772/workers/scripts/'
    def request(route, method='GET', data=None, content_type=None):
        nonlocal count
        count += 1
        assert count <= 11, 'CONTROL_PLANE_REQUEST_BOUND'
        headers = {'Authorization': 'Bearer ' + token}
        if content_type:
            headers['Content-Type'] = content_type
        try:
            with opener.open(urllib.request.Request(prefix + route, data=data, headers=headers, method=method), timeout=30) as response:
                return dict(response.headers), response.read()
        except urllib.error.HTTPError as error:
            raise RuntimeError('CF_HTTP_' + str(error.code)) from None
    def get_json(route):
        value = json.loads(request(route)[1])
        assert value.get('success') is True
        return value
    def flags(settings):
        bindings = {b['name']: b for b in settings['result']['bindings']}
        return {name: bindings[name].get('text') for name in ['PUMP_REPORT_ENABLED','PUMP_REPORT_DELIVERY_ENABLED']}
    before = get_json('my-report-2-hub/settings')
    assert len(before['result']['bindings']) == 21 and set(flags(before).values()) == {'1'}
    current = multipart_modules(*request('my-report-2-hub'))
    assert current == {p: s.encode() for p,s in base['modules'].items()}, 'CURRENT_WORKER_NOT_EXACT_BASE'
    names = ['my-report-2-hub','my-report-2-free-history','my-report-2-liq-forecast-history']
    schedules = {n:get_json(n+'/schedules') for n in names}
    assert [r['cron'] for r in schedules[names[0]]['result']['schedules']] == ['*/5 7-16 * * *']
    assert all(not schedules[n]['result']['schedules'] for n in names[1:])
    boundary = '----pump-auto-summary-' + NEW_SHA[:20]
    parts = []
    def add(name, content_type, body):
        parts.extend([('--'+boundary+'\r\nContent-Disposition: form-data; name="'+name+'"; filename="'+name+'"\r\nContent-Type: '+content_type+'\r\n\r\n').encode(),body,b'\r\n'])
    add('metadata','application/json',json.dumps({'main_module':new['metadata']['main_module']}).encode())
    for name, source in new['modules'].items():
        add(name,'application/javascript+module',source.encode())
    parts.append(('--'+boundary+'--\r\n').encode())
    attempt = ROOT / 'pump-report/.private/observations/auto-summary-log-only-deploy-attempt.json'
    fd = os.open(attempt,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as handle:
        json.dump({'state':'ATTEMPTED_NO_AUTO_RETRY','started_ts':int(time.time()*1000),'authority_main':ad['authority_main'],'artifact_sha256':NEW_SHA},handle)
        handle.flush();os.fsync(handle.fileno())
    receipt = json.loads(request('my-report-2-hub/content','PUT',b''.join(parts),'multipart/form-data; boundary='+boundary)[1])
    assert receipt.get('success') is True, 'DEPLOY_ACK_NOT_CONFIRMED'
    assert multipart_modules(*request('my-report-2-hub')) == {p:s.encode() for p,s in new['modules'].items()}
    after = get_json('my-report-2-hub/settings')
    assert before['result'] == after['result'], 'SETTINGS_CHANGED'
    assert schedules == {n:get_json(n+'/schedules') for n in names}, 'SCHEDULES_CHANGED'
    proof = {'schema':'ROOT_AUTO_SUMMARY_LOG_ONLY_DEPLOY_ACTUAL_V1','status':'INSTALLED_FULL_CODE_AND_SETTINGS_VERIFIED',
      'authority_main':ad['authority_main'],'readback_ts':int(time.time()*1000),'artifact_sha256':NEW_SHA,
      'implementation_sha256':new['manifest']['implementation_pin']['sha256'],'module_count':69,'FULL_exact_module_bytes':True,
      'all_non_log_business_modules_unchanged':True,'AUTO_enabled':True,'DELIVERY_enabled':True,'settings_bindings_count':21,
      'all3_crons_unchanged':True,'CF_HTTP':count,'worker_invocations':0,'native_SQL':0,'source_market_HTTP':0,
      'Telegram':0,'native_CONTROL_runs':0,'native_LOOKUP_runs':0,'business_pause':False,'same_original_SENT_proven':False,
      'platform_deployment_id':receipt['result'].get('deployment_id')}
    (CHECKPOINT / 'ROOT_AUTO_SUMMARY_LOG_ONLY_DEPLOY_ACTUAL.json').write_text(json.dumps(proof,indent=2)+'\n')
    print(json.dumps(proof))

if __name__ == '__main__':
    main()
