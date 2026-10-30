"""One new saved-original audit; no runtime suites, network or source acquisition."""
import hashlib,json,subprocess,time,zipfile
from pathlib import Path
import audit

ROOT=Path(__file__).resolve().parent
REPO=ROOT.parents[1]
scope=json.loads((ROOT/'scope.json').read_text())
checks=[]
def check(name,value):
 assert value,name
 checks.append(name)
def sha(data):return hashlib.sha256(data).hexdigest()
def git(*args):return subprocess.check_output(['git',*args],cwd=REPO)

lease=scope['lease']['lease']
check('own bounded offline scope',scope['lease']['exact_readback'] is True and lease['thread_id']=='01a14e11-ff1e-7ca1-9f7c-61666ef85c94' and lease['owner'].endswith(str(lease['acquired_ts'])) and lease['expires_ts']-lease['acquired_ts']<=90*60000 and not lease['released'])
check('verification within own lease',lease['acquired_ts']<=int(time.time()*1000)<lease['expires_ts'])
check('own branch and immutable working base',git('branch','--show-current').decode().strip()=='work/report2-sources-nil229-bitget-natural-20261019' and git('rev-parse','HEAD').decode().strip()==scope['working_base'])
for path,digest in scope['guard_raw_sha256'].items():
 check('fresh guard/proof '+path,sha(git('show',scope['fresh_guard_main']+':'+path))==digest)
for name,digest in scope['native_source_sha256'].items():
 check('pinned native source '+name,sha(git('show',scope['native_head']+':current-generation/files/src/'+name))==digest)
source=git('show',scope['native_head']+':current-generation/files/src/block-result-context.mjs').decode().splitlines()
proposal=json.loads((ROOT/'composite-clock-proposal.json').read_text())
check('native composite keeps base clocks',"source_ts:row.source_ts,observed_ts:row.observed_ts" in source[proposal['native_source_anchors']['base_row_clock_in_composite']-1])
check('native represented-origin filter anchor',"origin=>represented.includes(origin.evidence_id)" in source[proposal['native_source_anchors']['telegram_represented_components_filter']-1])
check('native component-origin function anchor','function contextComponentOrigins(rows)' in source[proposal['native_source_anchors']['contextComponentOrigins']-1])
check('shared proposal no runtime bug claim',proposal['status']=='PROPOSAL_ONLY_SHARED_FILES_UNCHANGED' and proposal['saved_witness']['runtime_first_known_gate_violation_proven'] is False)
with zipfile.ZipFile(ROOT/'originals/report2-run-result.zip') as z:
 report=json.loads(z.read('report2-run-result.json'))
 report_json_members=[n for n in z.namelist() if n.endswith('.json')]
with zipfile.ZipFile(ROOT/'originals/report2-telegram-info-proof.zip') as z:
 info_json_members=[n for n in z.namelist() if n.endswith('.json')]
check('seven original JSON members',len(report_json_members)==6 and len(info_json_members)==1)
metadata=json.loads((ROOT/'originals/artifacts.json').read_text())
for name,artifact_id in [('report2-run-result',12170235917),('report2-telegram-info-proof',12170305641)]:
 artifact=next(a for a in metadata['artifacts'] if a['name']==name)
 raw=(ROOT/'originals'/(name+'.zip')).read_bytes()
 check('exact retained artifact binding '+name,artifact['id']==artifact_id and artifact['digest']=='sha256:'+sha(raw) and artifact['size_in_bytes']==len(raw) and artifact['workflow_run']['id']==scope['cloud_run'] and artifact['workflow_run']['head_sha']==scope['native_head'])
def keys(x):
 if isinstance(x,dict):
  for k,v in x.items():yield k;yield from keys(v)
 elif isinstance(x,list):
  for v in x:yield from keys(v)
check('no raw240 cache ACK reconstructed from compact fields',not ({'raw_price_bars','source_cache_binding','n05_component','cache_reads'}&set(keys(report))))
analysis=audit.project()
check('reproducible complete projection',audit.encode(analysis)==(ROOT/'analysis.json').read_bytes())
result=audit.verify(analysis)
br=analysis['candidates'][1]
check('BR NULL not old score forwarded',all(br['blocks'][b]['consumer']['score_contribution'] is None for b in ['N05','N10','N12','N15']))
check('complete source audit changes only authorized prefix',not git('diff','--name-only').strip() and all(p.startswith('checkpoints/source-worker-nil229-bitget-natural-20261019/') for p in git('ls-files','--others','--exclude-standard').decode().splitlines()))
result.update({'package_PASS':len(checks),'package_checks':checks,'combined_PASS':result['PASS']+len(checks),'verification_kind':'ONE_NEW_SAVED_ORIGINAL_SEMANTIC_AND_PROVENANCE_CHECK','old_runtime_suites_executed':0,'proposal_sha256':sha((ROOT/'composite-clock-proposal.json').read_bytes()),'verified_ts':int(time.time()*1000)})
(ROOT/'verification.json').write_bytes(audit.encode(result))
print(json.dumps({k:v for k,v in result.items() if k not in ['checks','package_checks']},ensure_ascii=False,indent=2))
