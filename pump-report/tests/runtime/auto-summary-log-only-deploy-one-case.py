"""One new strict-artifact deployment guard case; no service or Worker call."""
import importlib.util
import json
from pathlib import Path
from unittest.mock import patch

root = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('fixed_log_only_deploy', root / 'pump-report/operator/deploy-auto-summary-only.py')
module = importlib.util.module_from_spec(spec)
with patch('urllib.request.build_opener', side_effect=AssertionError('NETWORK_FORBIDDEN_IN_OFFLINE_CASE')):
    spec.loader.exec_module(module)
    base = (root / 'pump-report/.private/native-20261026/pump-bg-final-funding-artifact.json').read_bytes()
    new = (root / 'pump-report/.private/native-20261026/pump-auto-summary-prepared-artifact.json').read_bytes()
    old_artifact, candidate = module.validate_log_only(base,new)
    assert len(candidate['modules']) == 69 and len(old_artifact['modules']) == 68
    refused = 0
    for old_bytes,new_bytes in [(new,base),(base,new+b' '),(base+b' ',new),
        (base,json.dumps({**candidate,'modules':{**candidate['modules'],'runtime/runner.mjs':'CHANGED_BUSINESS_PATH'}}).encode())]:
        try:
            module.validate_log_only(old_bytes,new_bytes)
        except AssertionError:
            refused += 1
        else:
            raise AssertionError('UNREVIEWED_ARTIFACT_WAS_ACCEPTED')
    assert refused == 4
print(json.dumps({'case':'ONE_EXACT_PURE_LOG_DEPLOY_GUARD','status':'PASS','cases':1,
  'exact_reviewed_pair_accepted':True,'unreviewed_stale_changed_pairs_refused':refused,
  'operator_main_invocations':0,'network_calls':0,'native_SQL':0,'source_HTTP':0,'Telegram':0,'deploy':0}))
